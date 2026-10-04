// Verify real request milestones using deferred responses, without contacting a provider.
import test from 'node:test';
import assert from 'node:assert/strict';
import { requestImage } from '../src/api/images.mjs';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('connection is confirmed only after headers, and processing only after the image body', async () => {
  for (const provider of ['openai', 'openrouter']) {
    const started = deferred(), headers = deferred(), body = deferred(), reading = deferred();
    const phases = [];
    const pending = requestImage('test', [new Blob(['ref'], { type: 'image/png' })], {},
      { provider, key: 'test-key' }, () => {
        started.resolve();
        return headers.promise;
      }, phase => phases.push(phase));
    await started.promise;
    assert.deepEqual(phases, ['requesting']);
    headers.resolve({ ok: true, json() { reading.resolve(); return body.promise; } });
    await reading.promise;
    assert.deepEqual(phases, ['requesting', 'receiving']);
    body.resolve({ data: [{ b64_json: btoa('image') }] });
    assert.equal(await (await pending).text(), 'image');
    assert.deepEqual(phases, ['requesting', 'receiving', 'processing']);
  }
});

test('failed connections and provider errors never report a received image', async () => {
  for (const fetcher of [async () => { throw Error('offline'); },
    async () => Response.json({ error: { message: 'refused' } }, { status: 401 })]) {
    const phases = [];
    await assert.rejects(() => requestImage('test', [], {}, { provider: 'openai', key: 'test-key' },
      fetcher, phase => phases.push(phase)));
    assert.deepEqual(phases, ['requesting']);
  }
});
