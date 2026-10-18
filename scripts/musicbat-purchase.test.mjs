import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import ts from "typescript";

const asset = "550e8400-e29b-41d4-a716-446655440000.wav";
const bytes = new TextEncoder().encode("RIFF-original-audio-bytes");

function d1(sqlite) {
  const api = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      const bound = (...values) => ({
        async first() { return statement.get(...values) ?? null; },
        async all() { return { results: statement.all(...values) }; },
        async run() { return statement.run(...values); },
        __run() { return statement.run(...values); },
      });
      return { ...bound(), bind: bound };
    },
    async batch(statements) { return statements.map((statement) => statement.__run()); },
  };
  return api;
}

async function load(path, state) {
  globalThis.musicbatCommerceState = state;
  const buyer = await readFile(new URL("../app/api/musicbat/purchase/buyer.ts", import.meta.url), "utf8");
  const stripe = await readFile(new URL("../app/api/musicbat/stripe/stripe.ts", import.meta.url), "utf8");
  let source = await readFile(new URL(path, import.meta.url), "utf8");
  source = source
    .replace('import { env } from "cloudflare:workers";', "const env = globalThis.musicbatCommerceState.env;")
    .replace(/import \{ buyerIdentity \} from "[^"]*buyer";/, buyer)
    .replace(/import \{[^;]+\} from "[^"]*stripe";/s, stripe);
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText + "\n//" + Math.random()).toString("base64")}`);
}

async function fixture(mode = "test", keyType = "sk") {
  const sqlite = new DatabaseSync(":memory:");
  for (const filename of (await readdir(new URL("../drizzle", import.meta.url))).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(await readFile(new URL(`../drizzle/${filename}`, import.meta.url), "utf8"));
  }
  sqlite.prepare(`INSERT INTO tracks (artist_id, artist_name, title, audio_url, sale_enabled, sale_rights_attested, sale_price_cents)
    VALUES (?, ?, ?, ?, 1, 1, 1000)`).run("artist-1", "The Band", "Original Song", `/api/musicbat/audio/${asset}`);
  sqlite.prepare(`INSERT INTO artist_accounts (artist_id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted)
    VALUES ('artist-1', 'acct_test_artist', 1, 1, 1)`).run();
  const requests = [];
  const state = {
    requests,
    env: {
      DB: d1(sqlite),
      BUCKET: {
        async head(key) { return key === `tracks/${asset}` ? { size: bytes.length } : null; },
        async get(key) { return key === `tracks/${asset}` ? { body: bytes, size: bytes.length, httpMetadata: { contentType: "audio/wav" } } : null; },
      },
      MUSICBAT_STRIPE_MODE: mode,
      STRIPE_SECRET_KEY: `${keyType}_${mode}_musicbat_fixture`,
      STRIPE_WEBHOOK_SECRET: "whsec_musicbat_test",
      MUSICBAT_BASE_URL: "https://musicbat.audio",
      MUSICBAT_PROCESSING_BPS: "290",
      MUSICBAT_PROCESSING_FIXED_CENTS: "30",
    },
  };
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    if (String(url).includes("/v1/accounts/")) {
      const account = sqlite.prepare("SELECT charges_enabled, payouts_enabled, details_submitted FROM artist_accounts WHERE artist_id = 'artist-1'").get();
      return Response.json({ id: "acct_test_artist", charges_enabled: Boolean(account.charges_enabled), payouts_enabled: Boolean(account.payouts_enabled), details_submitted: Boolean(account.details_submitted) });
    }
    if (String(url).includes("/v1/checkout/sessions/") && init.method === "GET") {
      return Response.json({ id: "cs_test_musicbat", url: "https://checkout.stripe.com/c/pay/test", status: "open", livemode: mode === "live" });
    }
    if (String(url).endsWith("/v1/checkout/sessions") && init.method === "POST") {
      return Response.json({ id: "cs_test_musicbat", url: "https://checkout.stripe.com/c/pay/test", status: "open", livemode: mode === "live" });
    }
    throw new Error(`Unexpected Stripe request: ${url}`);
  };
  return {
    sqlite,
    state,
    purchase: await load("../app/api/musicbat/purchase/route.ts", state),
    download: await load("../app/api/musicbat/purchase/[purchaseId]/download/route.ts", state),
  };
}

function post(trackId = 1, cookie = null, additions = {}) {
  return new Request("https://musicbat.audio/api/musicbat/purchase", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://musicbat.audio", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ trackId, confirmedTotalCents: 1061, ...additions }),
  });
}

function get(id, cookie, download = false) {
  return new Request(`https://musicbat.audio/api/musicbat/purchase${download ? `/${id}/download` : `?id=${id}`}`, { headers: { cookie } });
}

async function sign(raw, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${raw}`));
  const signature = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `t=${timestamp},v1=${signature}`;
}

test("restricted sandbox Checkout preserves exact 85/15 ledger split and itemized buyer fee", async () => {
  const { sqlite, state, purchase } = await fixture("test", "rk");
  const response = await purchase.POST(post(1, null, { amountCents: 1, paid: true, destination: "acct_wrong" }));
  assert.equal(response.status, 201);
  const cookie = response.headers.get("set-cookie").split(";")[0];
  const data = await response.json();
  assert.equal(data.checkoutAvailable, true);
  assert.match(data.checkoutUrl, /^https:\/\/checkout\.stripe\.com\//);
  const row = sqlite.prepare("SELECT * FROM purchases").get();
  assert.equal(row.amount_cents, 1000);
  assert.equal(row.artist_share_cents, 850);
  assert.equal(row.platform_fee_cents, 150);
  assert.equal(row.processor_account_id, "acct_test_artist");
  assert.equal(row.status, "pending");
  const create = state.requests.find((entry) => entry.url.endsWith("/v1/checkout/sessions") && entry.init.method === "POST");
  const form = create.init.body;
  assert.equal(create.init.headers.authorization, "Bearer rk_test_musicbat_fixture");
  assert.equal(form.get("payment_intent_data[application_fee_amount]"), "211");
  assert.equal(form.get("payment_intent_data[transfer_data][destination]"), "acct_test_artist");
  assert.equal(form.get("payment_method_types[0]"), "card");
  assert.equal(form.get("managed_payments[enabled]"), "false");
  assert.equal(form.get("mode"), "payment");
  assert.equal(form.get("line_items[1][price_data][unit_amount]"), "61");
  assert.equal(form.get("line_items[0][price_data][unit_amount]"), "1000");
  const repeat = await (await purchase.POST(post(1, cookie))).json();
  assert.equal(repeat.purchase.id, data.purchase.id);
  assert.equal(sqlite.prepare("SELECT count(*) AS total FROM purchases").get().total, 1);
  sqlite.close();
});

test("declined, cancelled, pending and unsigned payment states never unlock the file", async () => {
  const { sqlite, purchase, download } = await fixture();
  const checkout = await purchase.POST(post());
  const cookie = checkout.headers.get("set-cookie").split(";")[0];
  const { purchase: draft } = await checkout.json();
  for (const status of ["pending", "failed", "cancelled", "refunded"]) {
    sqlite.prepare("UPDATE purchases SET status = ? WHERE id = ?").run(status, draft.id);
    assert.equal((await download.GET(get(draft.id, cookie, true))).status, 402);
  }
  sqlite.close();
});

test("restricted sandbox signed webhook alone confirms payment and unlocks captured download", async () => {
  const { sqlite, state, purchase, download } = await fixture("test", "rk");
  const checkout = await purchase.POST(post());
  const cookie = checkout.headers.get("set-cookie").split(";")[0];
  const { purchase: draft } = await checkout.json();
  const session = {
    id: "cs_test_musicbat", livemode: false, status: "complete", payment_status: "paid", amount_total: 1061, currency: "usd",
    metadata: { musicbat_purchase_id: draft.id, musicbat_processing_cents: "61" },
    payment_intent: { id: "pi_test_musicbat", application_fee_amount: 211, transfer_data: { destination: "acct_test_artist" } },
  };
  globalThis.fetch = async () => Response.json(session);
  const webhook = await load("../app/api/musicbat/stripe/webhook/route.ts", state);
  const event = JSON.stringify({ id: "evt_test_paid", type: "checkout.session.completed", livemode: false, data: { object: { id: session.id, livemode: false } } });
  const originalConsoleError = console.error;
  console.error = () => {};
  let bad;
  try {
    bad = await webhook.POST(new Request("https://musicbat.audio/api/musicbat/stripe/webhook", { method: "POST", headers: { "stripe-signature": "t=1,v1=bad" }, body: event }));
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(bad.status, 400);
  assert.equal(sqlite.prepare("SELECT status FROM purchases WHERE id = ?").get(draft.id).status, "pending");
  const verified = await webhook.POST(new Request("https://musicbat.audio/api/musicbat/stripe/webhook", { method: "POST", headers: { "stripe-signature": await sign(event, state.env.STRIPE_WEBHOOK_SECRET) }, body: event }));
  assert.equal(verified.status, 200);
  assert.equal(sqlite.prepare("SELECT status FROM purchases WHERE id = ?").get(draft.id).status, "paid");
  assert.equal(sqlite.prepare("SELECT payment_intent_id FROM purchases WHERE id = ?").get(draft.id).payment_intent_id, "pi_test_musicbat");
  const file = await download.GET(get(draft.id, cookie, true));
  assert.equal(file.status, 200);
  assert.match(file.headers.get("content-disposition"), /attachment; filename="The Band - Original Song.wav"/);
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes);
  sqlite.close();
});

test("3DS-style unpaid completion remains locked until later authenticated success", async () => {
  const { sqlite, state, purchase, download } = await fixture();
  const checkout = await purchase.POST(post());
  const cookie = checkout.headers.get("set-cookie").split(";")[0];
  const { purchase: draft } = await checkout.json();
  let session = { id: "cs_test_musicbat", livemode: false, status: "open", payment_status: "unpaid", amount_total: 1061, currency: "usd", metadata: { musicbat_purchase_id: draft.id, musicbat_processing_cents: "61" }, payment_intent: { id: "pi_3ds", application_fee_amount: 211, transfer_data: { destination: "acct_test_artist" } } };
  globalThis.fetch = async () => Response.json(session);
  const webhook = await load("../app/api/musicbat/stripe/webhook/route.ts", state);
  const pendingEvent = JSON.stringify({ id: "evt_3ds_pending", type: "checkout.session.completed", livemode: false, data: { object: { id: session.id, livemode: false } } });
  await webhook.POST(new Request("https://musicbat.audio/api/musicbat/stripe/webhook", { method: "POST", headers: { "stripe-signature": await sign(pendingEvent, state.env.STRIPE_WEBHOOK_SECRET) }, body: pendingEvent }));
  assert.equal((await download.GET(get(draft.id, cookie, true))).status, 402);
  session = { ...session, status: "complete", payment_status: "paid" };
  const paidEvent = JSON.stringify({ id: "evt_3ds_paid", type: "checkout.session.async_payment_succeeded", livemode: false, data: { object: { id: session.id, livemode: false } } });
  await webhook.POST(new Request("https://musicbat.audio/api/musicbat/stripe/webhook", { method: "POST", headers: { "stripe-signature": await sign(paidEvent, state.env.STRIPE_WEBHOOK_SECRET) }, body: paidEvent }));
  assert.equal((await download.GET(get(draft.id, cookie, true))).status, 200);
  sqlite.close();
});

test("checkout is blocked until sale consent and artist payout eligibility exist", async () => {
  const { sqlite, purchase } = await fixture();
  sqlite.prepare("UPDATE tracks SET sale_enabled = 0").run();
  assert.equal((await purchase.POST(post())).status, 409);
  sqlite.prepare("UPDATE tracks SET sale_enabled = 1").run();
  sqlite.prepare("UPDATE artist_accounts SET payouts_enabled = 0").run();
  assert.equal((await purchase.POST(post())).status, 409);
  sqlite.close();
});

test("buyer sees full price before any Checkout Session or purchase record exists", async () => {
  const { sqlite, state, purchase } = await fixture();
  const quote = await purchase.POST(post(1, null, { confirmedTotalCents: undefined }));
  assert.equal(quote.status, 409);
  const data = await quote.json();
  assert.equal(data.confirmationRequired, true);
  assert.deepEqual([data.quote.baseCents, data.quote.processingCents, data.quote.totalCents, data.quote.artistShareCents], [1000, 61, 1061, 850]);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM purchases").get().n, 0);
  assert.equal(state.requests.filter((entry) => entry.url.endsWith("/v1/checkout/sessions")).length, 0);
  sqlite.close();
});

test("processing charge stays with platform and checkout amount preserves artist base share", async () => {
  const {sqlite,state,purchase}=await fixture();
  assert.equal((await purchase.POST(post())).status,201);
  const row=sqlite.prepare("SELECT * FROM purchases").get();
  const form=state.requests.find(x=>x.init.method==='POST' && x.url.endsWith('/v1/checkout/sessions')).init.body;
  const total=Number(form.get('line_items[0][price_data][unit_amount]'))+Number(form.get('line_items[1][price_data][unit_amount]'));
  assert.equal(row.processing_cents,61);
  assert.equal(total-Number(form.get('payment_intent_data[application_fee_amount]')),850);
  assert.equal(total,1061);
  sqlite.close();
});

test("superseded pending 90/10 Checkout cannot be reopened or create a second charge", async () => {
  const { sqlite, state, purchase } = await fixture();
  const checkout = await purchase.POST(post());
  const cookie = checkout.headers.get('set-cookie').split(';')[0];
  const { purchase: draft } = await checkout.json();
  sqlite.prepare('UPDATE purchases SET artist_share_cents=900, platform_fee_cents=100 WHERE id=?').run(draft.id);
  const before = sqlite.prepare('SELECT * FROM purchases WHERE id=?').get(draft.id);
  const requests = state.requests.length;
  const retry = await purchase.POST(post(1, cookie));
  assert.equal(retry.status, 409);
  assert.equal((await retry.json()).checkoutUrl, undefined);
  assert.equal(state.requests.filter(r => r.init.method === 'POST' && r.url.endsWith('/v1/checkout/sessions')).length, 1);
  assert.ok(state.requests.length >= requests);
  assert.deepEqual(sqlite.prepare('SELECT * FROM purchases WHERE id=?').get(draft.id), before);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM purchases').get().n, 1);
  sqlite.close();
});

test("active commerce disclosures reject obsolete allocation", async () => {
  for (const path of ['../app/musicbat-loop.tsx', '../README.md']) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /90\s*%|90\s*\/\s*10/);
    assert.match(source, /85%/);
    assert.match(source, /15%/);
  }
});

test("legacy purchase snapshot still accepts historical fee and total", async () => {
  const {sqlite,state,purchase}=await fixture();
  const {purchase:draft}=await (await purchase.POST(post())).json();
  sqlite.prepare('UPDATE purchases SET processing_cents=0, artist_share_cents=900, platform_fee_cents=100 WHERE id=?').run(draft.id);
  const session={id:'cs_test_musicbat',livemode:false,payment_status:'paid',amount_total:1000,currency:'usd',metadata:{musicbat_purchase_id:draft.id},payment_intent:{id:'pi_legacy',application_fee_amount:100,transfer_data:{destination:'acct_test_artist'}}};
  globalThis.fetch=async()=>Response.json(session);
  const webhook=await load('../app/api/musicbat/stripe/webhook/route.ts',state);
  const event=JSON.stringify({id:'evt_legacy',type:'checkout.session.completed',livemode:false,data:{object:{id:session.id,livemode:false}}});
  assert.equal((await webhook.POST(new Request('https://musicbat.audio/api/musicbat/stripe/webhook',{method:'POST',headers:{'stripe-signature':await sign(event,state.env.STRIPE_WEBHOOK_SECRET)},body:event}))).status,200);
  assert.equal(sqlite.prepare('SELECT artist_share_cents FROM purchases WHERE id=?').get(draft.id).artist_share_cents,900);
  sqlite.close();
});

test("quoted prices reach Checkout with 85/15 base allocation and buyer-funded processing", async () => {
  for (const base of [1, 10, 99, 100, 199, 200, 500, 999, 1000, 1999, 10000]) {
    const { sqlite, state, purchase } = await fixture();
    sqlite.prepare('UPDATE tracks SET sale_price_cents=?').run(base);
    const quoteResponse = await purchase.POST(post(1, null, { confirmedTotalCents: undefined }));
    assert.equal(quoteResponse.status, 409);
    const { quote } = await quoteResponse.json();
    const artist = Math.round(base * 85 / 100);
    const processing = Math.ceil((base * 0.029 + 30) / 0.971);
    assert.deepEqual([quote.baseCents, quote.artistShareCents, quote.processingCents, quote.totalCents],
      [base, artist, processing, base + processing]);
    assert.equal((await purchase.POST(post(1, null, { confirmedTotalCents: quote.totalCents - 1 }))).status, 409);
    const checkout = await purchase.POST(post(1, null, { confirmedTotalCents: quote.totalCents }));
    assert.equal(checkout.status, 201);
    const { purchase: draft } = await checkout.json();
    const row = sqlite.prepare('SELECT * FROM purchases WHERE id=?').get(draft.id);
    const form = state.requests.filter(x => x.init.method === 'POST' && x.url.endsWith('/v1/checkout/sessions')).at(-1).init.body;
    const fee = Number(form.get('payment_intent_data[application_fee_amount]'));
    assert.deepEqual([row.amount_cents, row.artist_share_cents, row.platform_fee_cents, row.processing_cents],
      [base, artist, base - artist, processing]);
    assert.equal(Number(form.get('line_items[0][price_data][unit_amount]')), base);
    assert.equal(Number(form.get('line_items[1][price_data][unit_amount]')), processing);
    assert.equal(fee, base - artist + processing);
    assert.equal(quote.totalCents - fee, artist);
    assert.equal(form.get('payment_intent_data[transfer_data][destination]'), 'acct_test_artist');
    sqlite.close();
  }
});

test("verified full refunds revoke access permanently; partial refunds and replay preserve ledger", async () => {
  const { sqlite, state, purchase, download } = await fixture();
  const checkout = await purchase.POST(post());
  const cookie = checkout.headers.get('set-cookie').split(';')[0];
  const { purchase: draft } = await checkout.json();
  sqlite.prepare("UPDATE purchases SET status='paid', payment_intent_id='pi_refund' WHERE id=?").run(draft.id);
  const original = sqlite.prepare('SELECT amount_cents, artist_share_cents, platform_fee_cents, processing_cents FROM purchases WHERE id=?').get(draft.id);
  let charge = { id:'ch_refund', livemode:false, payment_intent:'pi_refund', currency:'usd', amount:1061, amount_refunded:100, refunded:false };
  globalThis.fetch = async (url) => Response.json(String(url).includes("/charges/") ? charge : { id:"cs_test_musicbat", livemode:false });
  const webhook = await load('../app/api/musicbat/stripe/webhook/route.ts',state);
  const send = async (id, type='charge.refunded') => {
    const raw=JSON.stringify({id,type,livemode:false,data:{object:{id:type==='charge.refunded'?'ch_refund':'cs_test_musicbat',livemode:false}}});
    return webhook.POST(new Request('https://musicbat.audio/api/musicbat/stripe/webhook',{method:'POST',headers:{'stripe-signature':await sign(raw,state.env.STRIPE_WEBHOOK_SECRET)},body:raw}));
  };
  assert.equal((await send('evt_partial')).status,200);
  assert.equal((await download.GET(get(draft.id,cookie,true))).status,200);
  charge={...charge,amount_refunded:1061,refunded:true};
  assert.equal((await send('evt_full')).status,200);
  assert.equal((await send('evt_full')).status,200);
  assert.equal((await download.GET(get(draft.id,cookie,true))).status,402);
  assert.equal((await send('evt_expired','checkout.session.expired')).status,200);
  assert.equal(sqlite.prepare('SELECT status FROM purchases WHERE id=?').get(draft.id).status,'refunded');
  globalThis.fetch=async()=>Response.json({id:'cs_test_musicbat',livemode:false,payment_status:'paid',amount_total:1061,currency:'usd',metadata:{musicbat_purchase_id:draft.id,musicbat_processing_cents:'61'},payment_intent:{id:'pi_refund',application_fee_amount:211,transfer_data:{destination:'acct_test_artist'}}});
  assert.equal((await send('evt_late_paid','checkout.session.completed')).status,200);
  assert.equal(sqlite.prepare('SELECT status FROM purchases WHERE id=?').get(draft.id).status,'refunded');
  assert.deepEqual(sqlite.prepare('SELECT amount_cents, artist_share_cents, platform_fee_cents, processing_cents FROM purchases WHERE id=?').get(draft.id),original);
  sqlite.close();
});

test("mismatched authenticated refunds cannot revoke purchases", async () => {
  const {sqlite,state,purchase}=await fixture();
  const {purchase:draft}=await (await purchase.POST(post())).json();
  sqlite.prepare("UPDATE purchases SET status='paid', payment_intent_id='pi_refund' WHERE id=?").run(draft.id);
  globalThis.fetch=async()=>Response.json({id:'ch_refund',livemode:false,payment_intent:'pi_refund',currency:'usd',amount:1000,amount_refunded:1000,refunded:true});
  const webhook=await load('../app/api/musicbat/stripe/webhook/route.ts',state);
  const raw=JSON.stringify({id:'evt_wrong_refund',type:'charge.refunded',livemode:false,data:{object:{id:'ch_refund',livemode:false}}});
  assert.equal((await webhook.POST(new Request('https://musicbat.audio/api/musicbat/stripe/webhook',{method:'POST',headers:{'stripe-signature':await sign(raw,state.env.STRIPE_WEBHOOK_SECRET)},body:raw}))).status,400);
  assert.equal(sqlite.prepare('SELECT status FROM purchases WHERE id=?').get(draft.id).status,'paid');
  sqlite.close();
});

test("payment confirmation rejects wrong amount, fee and destination; concurrent webhook retries settle once", async () => {
  const {sqlite,state,purchase}=await fixture();
  const {purchase:draft}=await (await purchase.POST(post())).json();
  const correct={id:'cs_test_musicbat',livemode:false,payment_status:'paid',amount_total:1061,currency:'usd',metadata:{musicbat_purchase_id:draft.id,musicbat_processing_cents:'61'},payment_intent:{id:'pi_retry',application_fee_amount:211,transfer_data:{destination:'acct_test_artist'}}};
  let session=correct;
  globalThis.fetch=async()=>Response.json(session);
  const webhook=await load('../app/api/musicbat/stripe/webhook/route.ts',state);
  const raw=JSON.stringify({id:'evt_retry',type:'checkout.session.completed',livemode:false,data:{object:{id:correct.id,livemode:false}}});
  const send=async()=>webhook.POST(new Request('https://musicbat.audio/api/musicbat/stripe/webhook',{method:'POST',headers:{'stripe-signature':await sign(raw,state.env.STRIPE_WEBHOOK_SECRET)},body:raw}));
  const errors=console.error;console.error=()=>{};
  try {
    for(const invalid of [{...correct,amount_total:1060},{...correct,payment_intent:{...correct.payment_intent,application_fee_amount:210}},{...correct,payment_intent:{...correct.payment_intent,transfer_data:{destination:'acct_wrong'}}}]) {
      session=invalid;assert.equal((await send()).status,400);
      assert.equal(sqlite.prepare('SELECT status FROM purchases WHERE id=?').get(draft.id).status,'pending');
    }
  } finally {console.error=errors;}
  session=correct;
  assert.deepEqual((await Promise.all([send(),send()])).map(r=>r.status),[200,200]);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM stripe_events WHERE event_id='evt_retry'").get().n,1);
  assert.equal(sqlite.prepare('SELECT status FROM purchases WHERE id=?').get(draft.id).status,'paid');
  sqlite.close();
});


test("mock live checkout and signed settlement preserve 85/15 and replay protection", async () => {
 const {sqlite,state,purchase}=await fixture('live');
 const response=await purchase.POST(post());assert.equal(response.status,201);
 const {purchase:draft}=await response.json();
 const session={id:'cs_test_musicbat',livemode:true,payment_status:'paid',amount_total:1061,currency:'usd',metadata:{musicbat_purchase_id:draft.id,musicbat_processing_cents:'61'},payment_intent:{id:'pi_live_fixture',application_fee_amount:211,transfer_data:{destination:'acct_test_artist'}}};
 globalThis.fetch=async()=>Response.json(session);
 const webhook=await load('../app/api/musicbat/stripe/webhook/route.ts',state);
 async function send(mode,objectMode=mode,id='evt_live_fixture'){
  const raw=JSON.stringify({id,type:'checkout.session.completed',livemode:mode,data:{object:{id:session.id,livemode:objectMode}}});
  return webhook.POST(new Request('https://musicbat.audio/api/musicbat/stripe/webhook',{method:'POST',headers:{'stripe-signature':await sign(raw,state.env.STRIPE_WEBHOOK_SECRET)},body:raw}));
 }
 const saved=console.error;console.error=()=>{};
 try {
  for(const mode of [false,undefined,'true',1])assert.equal((await send(mode)).status,400);
  assert.equal((await send(true,false)).status,400);
  session.livemode=false;assert.equal((await send(true)).status,400);session.livemode=true;
 }finally{console.error=saved}
 assert.equal(sqlite.prepare('SELECT status FROM purchases').get().status,'pending');
 assert.equal(sqlite.prepare('SELECT count(*) n FROM stripe_events').get().n,0);
 assert.equal((await send(true)).status,200);assert.equal((await send(true)).status,200);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM stripe_events').get().n,1);
 assert.deepEqual({...sqlite.prepare('SELECT artist_share_cents,platform_fee_cents,processing_cents,status FROM purchases').get()},{artist_share_cents:850,platform_fee_cents:150,processing_cents:61,status:'paid'});
 // A refund is verified in the selected mode; no refund request is initiated.
 let chargeMode=false;
 globalThis.fetch=async()=>Response.json({id:'ch_live_fixture',livemode:chargeMode,payment_intent:'pi_live_fixture',amount:1061,amount_refunded:1061,refunded:true,currency:'usd'});
 const raw=JSON.stringify({id:'evt_live_refund',type:'charge.refunded',livemode:true,data:{object:{id:'ch_live_fixture',livemode:true}}});
 const refund=async()=>webhook.POST(new Request('https://musicbat.audio/api/musicbat/stripe/webhook',{method:'POST',headers:{'stripe-signature':await sign(raw,state.env.STRIPE_WEBHOOK_SECRET)},body:raw}));
 assert.equal((await refund()).status,400);chargeMode=true;assert.equal((await refund()).status,200);
 assert.equal(sqlite.prepare('SELECT status FROM purchases').get().status,'refunded');sqlite.close();
});

test("test checkout rejects missing, live and nonboolean returned Session modes including reuse", async()=>{
 for(const mode of [undefined,true,0,'false']){
  const {sqlite,purchase}=await fixture();const mock=globalThis.fetch;
  globalThis.fetch=async(url,init)=>{const result=await mock(url,init);if(String(url).includes('/checkout/sessions')){const obj=await result.json();obj.livemode=mode;return Response.json(obj)}return result};
  const saved=console.error;console.error=()=>{};try{assert.equal((await purchase.POST(post())).status,503)}finally{console.error=saved}
  assert.equal(sqlite.prepare('SELECT status FROM purchases').get().status,'awaiting_checkout');sqlite.close();
 }
 const {sqlite,state,purchase}=await fixture();const first=await purchase.POST(post());const cookie=first.headers.get('set-cookie').split(';')[0];
 state.env.MUSICBAT_STRIPE_MODE='live';state.env.STRIPE_SECRET_KEY='sk_live_fixture';
 const saved=console.error;console.error=()=>{};try{assert.equal((await purchase.POST(post(1,cookie))).status,503)}finally{console.error=saved}
 assert.equal(sqlite.prepare('SELECT count(*) n FROM purchases').get().n,1);sqlite.close();
});


test("oversized unauthenticated purchase webhook stops reading and makes no processor or ledger changes", async () => {
  const {sqlite,state}=await fixture();
  const webhook=await load('../app/api/musicbat/stripe/webhook/route.ts',state);
  let cancelled=false, reads=0;
  const request=new Request('https://musicbat.audio/api/musicbat/stripe/webhook',{method:'POST',duplex:'half',body:new ReadableStream({
    pull(controller){reads++;if(reads<=6)controller.enqueue(new Uint8Array(256*1024));else controller.close();},
    cancel(){cancelled=true;},
  })});
  const saved=console.error;console.error=()=>{};
  try {assert.equal((await webhook.POST(request)).status,413);assert.equal(cancelled,true);assert.ok(reads<=6);assert.equal(state.requests.length,0);assert.equal(sqlite.prepare('SELECT count(*) n FROM stripe_events').get().n,0);}
  finally {console.error=saved;sqlite.close();}
});

test('sandbox Connect Checkout opts out of account-default Managed Payments; live request remains unchanged',async()=>{
 for(const mode of ['test','live']){
  const {sqlite,state,purchase}=await fixture(mode);
  const processor=globalThis.fetch;
  globalThis.fetch=async(url,init={})=>{
   if(String(url).endsWith('/v1/checkout/sessions')&&init.method==='POST'&&mode==='test'&&init.body.get('managed_payments[enabled]')!=='false')return Response.json({error:{message:'Managed Payments does not support Connect'}},{status:400});
   return processor(url,init);
  };
  try{
   assert.equal((await purchase.POST(post())).status,201);
   const form=state.requests.find(r=>r.init.method==='POST'&&r.url.endsWith('/v1/checkout/sessions')).init.body;
   assert.equal(form.get('managed_payments[enabled]'),mode==='test'?'false':null);
   assert.equal(form.get('payment_intent_data[transfer_data][destination]'),'acct_test_artist');
   assert.equal(form.get('payment_intent_data[application_fee_amount]'),'211');
   assert.equal(sqlite.prepare('SELECT artist_share_cents FROM purchases').get().artist_share_cents,850);
  }finally{sqlite.close()}
 }
});
