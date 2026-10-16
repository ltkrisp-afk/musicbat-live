import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectRender, workspaceId } from './phase4-render-inspect.mjs';
const owner = { id: workspaceId, name: "Kris's workspace", email: 'private@example.invalid' };
function fixture(overrides = {}) {
  const calls = [];
  return { calls, fetcher: async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    assert.equal(url.origin, 'https://api.render.com');
    const path = url.pathname.replace('/v1/', '');
    if (overrides[path]) return Response.json(overrides[path]);
    if (path.startsWith('owners/')) return Response.json(owner);
    if (path === 'services') return Response.json([{ cursor: 'end', service: { id: 'srv-example', name: 'existing-sandbox', ownerId: workspaceId, suspended: 'suspended', repo: 'https://user:PRIVATE@github.com/owner/repo?token=PRIVATE', serviceDetails: { plan: 'starter', envSpecificDetails: { startCommand: 'SECRET=PRIVATE pnpm radio:start' } } } }]);
    if (path === 'disks') return Response.json([]);
    if (path.endsWith('/env-vars')) return Response.json([{ envVar: { key: 'STRIPE_SECRET_KEY', value: 'PRIVATE' } }]);
    throw new Error('Unexpected request');
  } };
}
test('authorized GET inventory strips credentials, commands and environment values', async () => {
  const f = fixture();
  const result = await inspectRender({ key: 'PRIVATE', serviceId: 'srv-example', fetcher: f.fetcher });
  assert.equal(result.complete, true); assert.equal(result.services[0].startsRadio, true);
  assert.deepEqual(result.selectedService.environment, [{ name: 'STRIPE_SECRET_KEY', present: true }]);
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(result).includes('private@example.invalid'), false);
  assert.equal(f.calls[1].url.searchParams.get('ownerId'), workspaceId);
  assert.equal(result.priceQuote, null);
});
test('missing credentials and wrong workspace stop without inspecting service secrets', async () => {
  let calls = 0;
  await assert.rejects(inspectRender({ key: '', fetcher: () => { calls++; } }), /No injected Render API authentication/);
  assert.equal(calls, 0);
  const f = fixture({ ['owners/' + workspaceId]: { ...owner, id: 'wrong' } });
  await assert.rejects(inspectRender({ key: 'PRIVATE', fetcher: f.fetcher }), /workspace identity mismatch/);
  assert.equal(f.calls.length, 1);
});
test('null inventories and foreign service IDs are blockers, never empty readiness', async () => {
  const f = fixture({ services: { unexpected: null } });
  await assert.rejects(inspectRender({ key: 'PRIVATE', fetcher: f.fetcher }), /unexpected response shape/);
  const valid = fixture();
  await assert.rejects(inspectRender({ key: 'PRIVATE', serviceId: 'srv-other', fetcher: valid.fetcher }), /not in the authorized inventory/);
  assert.equal(valid.calls.some(call => call.url.pathname.endsWith('/env-vars')), false);
});
test('all full service pages are consumed and repeated cursors fail closed', async () => {
  const page = Array.from({ length: 100 }, (_, i) => ({ cursor: 'same', service: { id: 'srv-' + i, ownerId: workspaceId } }));
  const bad = fixture({ services: page });
  await assert.rejects(inspectRender({ key: 'PRIVATE', fetcher: bad.fetcher }), /pagination did not advance/);
  const base = fixture(); let pages = 0;
  const result = await inspectRender({ key: 'PRIVATE', fetcher: (url, options) => {
    if (url.pathname === '/v1/services') { pages++; return Promise.resolve(Response.json(pages === 1 ? page : [])); }
    return base.fetcher(url, options);
  } });
  assert.equal(result.services.length, 100); assert.equal(pages, 2);
});


test('HTTP and malformed JSON failures never reveal response secrets', async () => {
  for (const response of [new Response('PRIVATE', { status: 403 }), new Response('PRIVATE', { headers: { 'content-type': 'application/json' } })]) {
    await assert.rejects(inspectRender({ key: 'PRIVATE', fetcher: async () => response }), error => !error.message.includes('PRIVATE'));
  }
});
