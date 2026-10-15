import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blockers,ACCOUNT,OWNER,HASH,createPurchaseSnapshot,handler} from './sandbox-purchase.mjs';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const configured={MUSICBAT_STRIPE_MODE:'test',STRIPE_SECRET_KEY:'rk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',MUSICBAT_PROCESSING_BPS:'290',MUSICBAT_PROCESSING_FIXED_CENTS:'30'};
test('runner loads the actual purchase, webhook and download handlers and retains their unavailable-storage guard',async()=>{
 const purchase=await handler('app/api/musicbat/purchase/route.ts',{});
 const webhook=await handler('app/api/musicbat/stripe/webhook/route.ts',{});
 const download=await handler('app/api/musicbat/purchase/[purchaseId]/download/route.ts',{});
 assert.equal((await purchase.POST(new Request('http://127.0.0.1:5181/api/musicbat/purchase',{method:'POST',body:'{}'}))).status,503);
 assert.equal((await webhook.POST(new Request('http://127.0.0.1:5181/api/musicbat/stripe/webhook',{method:'POST',body:'{}'}))).status,503);
 assert.equal((await download.GET(new Request('http://127.0.0.1:5181/api/musicbat/purchase/test/download'))).status,503);
});
test('sandbox purchase runner refuses live mode and live credentials',()=>{
 assert.ok(blockers({...configured,MUSICBAT_STRIPE_MODE:'live'}).length);
 assert.ok(blockers({...configured,STRIPE_SECRET_KEY:'sk_live_fixture'}).length);
 assert.ok(blockers({...configured,STRIPE_SECRET_KEY:'rk_live_fixture'}).length);
});
test('sandbox identity mapping changes only a new snapshot and preserves source ownership, payout row and purchases',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'musicbat-sandbox-snapshot-'));
 const source=join(dir,'source.sqlite'),db=new DatabaseSync(source);
 try{
  db.exec('CREATE TABLE artist_accounts(artist_id TEXT PRIMARY KEY,stripe_account_id TEXT UNIQUE,charges_enabled INTEGER); CREATE TABLE tracks(id INTEGER PRIMARY KEY,artist_id TEXT,sale_enabled INTEGER,sale_rights_attested INTEGER,sale_price_cents INTEGER); CREATE TABLE purchases(id TEXT PRIMARY KEY,status TEXT); CREATE TABLE artist_track_audit(id TEXT,track_id INTEGER,account_id TEXT,action TEXT,detail TEXT,created_at INTEGER)');
  db.prepare('INSERT INTO artist_accounts VALUES (?,?,1)').run('local_seedy',ACCOUNT);
  db.prepare('INSERT INTO tracks VALUES (5,?,0,0,NULL)').run(OWNER);
  db.exec("INSERT INTO purchases VALUES ('historical','paid')");
  const copy=await createPurchaseSnapshot(source,join(dir,'copy.sqlite'));
  try{
   assert.equal(copy.prepare('SELECT artist_id FROM tracks').get().artist_id,OWNER);
   assert.equal(copy.prepare('SELECT stripe_account_id FROM artist_accounts WHERE artist_id=?').get(OWNER).stripe_account_id,ACCOUNT);
   assert.equal(copy.prepare('SELECT sale_price_cents FROM tracks').get().sale_price_cents,200);
   assert.equal(copy.prepare('SELECT status FROM purchases').get().status,'paid');
   assert.equal(copy.prepare('SELECT count(*) n FROM artist_track_audit').get().n,1);
  }finally{copy.close()}
  assert.equal(db.prepare('SELECT artist_id FROM artist_accounts').get().artist_id,'local_seedy');
  assert.equal(db.prepare('SELECT sale_enabled FROM tracks').get().sale_enabled,0);
  assert.equal(db.prepare('SELECT count(*) n FROM artist_track_audit').get().n,0);
 }finally{db.close();await rm(dir,{recursive:true,force:true})}
});
test('runner requires signed webhook delivery and explicit processing configuration',()=>{
 assert.ok(blockers({...configured,STRIPE_WEBHOOK_SECRET:undefined}).some(s=>s.includes('WEBHOOK')));
 assert.ok(blockers({...configured,MUSICBAT_PROCESSING_BPS:undefined}).some(s=>s.includes('BPS')));
 assert.ok(blockers({...configured,MUSICBAT_PROCESSING_BPS:'10000'}).length);
});
test('runner supports the existing restricted sandbox client and recovered identity without initiating work on import',()=>{
 assert.deepEqual(blockers(configured),[]);
 assert.equal(ACCOUNT,'acct_1UQrXtLKJHXYfqXB');
 assert.equal(OWNER,'yY7U7NYKoZEsc3qxYJzEh8nNB3jXrRUopGya1R7e3cu74CgXcTSFil');
 assert.equal(HASH,'0960f654c0c9a96f5718f54b82b31a117315642f994e2dab0b97cb3fbbec45c8');
});
