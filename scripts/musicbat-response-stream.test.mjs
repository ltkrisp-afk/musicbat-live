import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { writeHttpResponse } from '../radio/server.ts';

class SlowClient extends EventEmitter {
  destroyed = false;
  bytes = 0;
  writeHead() {}
  write(chunk) {
    this.bytes += chunk.length;
    queueMicrotask(() => this.emit('drain'));
    return false;
  }
  end() { this.ended = true; }
}

test('streaming to a slow client releases drain/close listeners after every chunk', async () => {
  const client = new SlowClient();
  const body = new ReadableStream({
    start(controller) {
      for (let i = 0; i < 32; i++) controller.enqueue(new Uint8Array(1024));
      controller.close();
    },
  });
  await writeHttpResponse(new Response(body), client);
  assert.equal(client.bytes, 32768);
  assert.equal(client.ended, true);
  assert.equal(client.listenerCount('close'), 0);
  assert.equal(client.listenerCount('drain'), 0);
});

test('client disconnect cancels the source and leaves no pending drain listeners', async () => {
  const client = new SlowClient();
  client.write = () => {
    queueMicrotask(() => { client.destroyed = true; client.emit('close'); });
    return false;
  };
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(1024)); },
    cancel() { cancelled = true; },
  });
  await writeHttpResponse(new Response(body), client);
  assert.equal(cancelled, true);
  assert.equal(client.listenerCount('drain'), 0);
  assert.equal(client.listenerCount('close'), 0);
});
