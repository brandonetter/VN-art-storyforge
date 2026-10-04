// Focused CLI checks for revision geometry, references, privacy, and transactional acceptance.
// Providers and Canvas are simulated; these tests launch no browser and make no paid requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { revisionGeometry, createWorkingImage, extractRevision } from '../src/image-processing/canvas.mjs';
import { createRevisionService } from '../src/revisions/service.mjs';
import { createRevisionQueue } from '../src/revisions/queue.mjs';
import { currentCutout, validateTarget } from '../src/revisions/targets.mjs';
import { definitions } from '../src/generation/sheets.mjs';
import { restore, createPipeline } from '../src/generation/pipeline.mjs';
import { jobRecord } from '../src/storage/job-record.mjs';
import { emotionFiles, zipFiles } from '../src/downloads/zip.mjs';

const image = name => new Blob([name], { type: 'image/png' });
const auth = { provider: 'openai', key: 'revision-secret' };
function job(canonical = false) {
  return {
    id: 'test-job', provider: 'openai', templateSet: 'masc', createdAt: '2026-10-04',
    stage: canonical ? 'Awaiting canonical confirmation' : 'Complete',
    canonicalConfirmed: !canonical, settings: { quality: 'high', resolution: '2048x1536' },
    files: { character: image('uploaded'), canonical: image('canonical') },
    sheets: definitions.map(definition => ({ ...definition, stage: 'Complete',
      raw: definition.labels.map(label => image(label)), revised: [],
      sheet: image('original sheet'), anchoredTemplate: image('original anchor') }))
  };
}
function harness(overrides = {}) {
  const requests = [], saved = [], assets = [], sources = [], activities = [];
  const candidate = image('candidate');
  const service = createRevisionService({
    save: async value => saved.push(structuredClone(jobRecord(value))),
    notify: value => activities.push(value.activity ? { ...value.activity } : null),
    asset: async name => { assets.push(name); return image(name); },
    images: {
      createWorkingImage: async source => {
        sources.push(source);
        return { image: image('working'), rectangle: revisionGeometry(358, 539) };
      },
      crop: async (blob, index) => image(`template-${index}`),
      extractRevision: async () => candidate
    },
    generate: async (prompt, refs, options, credentials, fetcher, onProgress) => {
      onProgress('requesting');
      requests.push({ prompt, refs, options, credentials });
      onProgress('receiving');
      return image('provider output');
    },
    ...overrides
  });
  return { service, requests, saved, assets, sources, activities, candidate };
}

test('working canvases fill the supported size and extraction maps proportional resolution changes', async t => {
  for (const [width, height] of [[358, 539], [1, 1], [3800, 100], [100, 3800], [1024, 1536]]) {
    const r = revisionGeometry(width, height);
    assert.ok(r.canvasWidth >= width && r.canvasHeight >= height);
    assert.equal(r.canvasWidth % 16, 0);
    assert.equal(r.canvasHeight % 16, 0);
    assert.ok(r.canvasWidth * r.canvasHeight >= 655360);
    assert.ok(r.canvasWidth / r.canvasHeight <= 3 && r.canvasHeight / r.canvasWidth <= 3);
    assert.ok(r.editWidth <= r.canvasWidth && r.editHeight <= r.canvasHeight);
    assert.ok(r.editWidth === r.canvasWidth || r.editHeight === r.canvasHeight);
    // Each fitted axis rounds by at most half a pixel.
    assert.ok(Math.abs(r.editWidth - width * r.editHeight / height) <= 0.5 + width / height * 0.5);
  }
  assert.throws(() => revisionGeometry(4000, 4000), /cannot fit/);
  const originalBitmap = globalThis.createImageBitmap, originalDocument = globalThis.document;
  t.after(() => { globalThis.createImageBitmap = originalBitmap; globalThis.document = originalDocument; });
  let bitmapSize = { width: 358, height: 539 };
  const draws = [];
  globalThis.createImageBitmap = async () => ({ ...bitmapSize, close() {} });
  globalThis.document = { createElement: () => ({
    getContext: () => ({ drawImage: (...args) => draws.push(args.slice(1)), fillRect() {} }),
    toBlob(callback) { callback(image(`${this.width}x${this.height}`)); }
  }) };
  const working = await createWorkingImage(image('input'), false);
  const r = working.rectangle;
  assert.deepEqual(draws[0], [r.x, r.y, r.editWidth, r.editHeight]);
  assert.ok(r.editWidth > 358 && r.editHeight > 539);
  assert.ok(r.x <= 8 && r.y <= 8, 'portrait should have only rounding padding');
  bitmapSize = { width: working.rectangle.canvasWidth, height: working.rectangle.canvasHeight };
  const extracted = await extractRevision(image('output'), working.rectangle, false);
  assert.equal(await extracted.text(), '358x539');
  assert.deepEqual(draws[1], [r.x, r.y, r.editWidth, r.editHeight, 0, 0, 358, 539]);
  for (const scale of [0.5, 2]) {
    bitmapSize = { width: r.canvasWidth * scale, height: r.canvasHeight * scale };
    assert.equal(await (await extractRevision(image('resized output'), r, false)).text(), '358x539');
    assert.deepEqual(draws.at(-1), [r.x * scale, r.y * scale, r.editWidth * scale, r.editHeight * scale, 0, 0, 358, 539]);
  }
  // A provider's standard portrait size and small pixel rounding also preserve framing.
  bitmapSize = { width: 1024, height: 1536 };
  assert.equal(await (await extractRevision(image('standard portrait'), r, false)).text(), '358x539');
  bitmapSize.width += 1;
  await extractRevision(image('rounded output'), r, false);
  bitmapSize = { width: 1024, height: 1024 };
  const drawCount = draws.length;
  await assert.rejects(() => extractRevision(image('wrong aspect'), r, false), /changed the revision canvas aspect ratio/);
  assert.equal(draws.length, drawCount);
});

test('canonical revisions keep identity references and require review before confirmation', async () => {
  const current = job(true), h = harness(), original = current.files.canonical;
  await h.service.generate(current, { kind: 'canonical' }, auth, 'Adjust the collar');
  const request = h.requests[0];
  assert.equal(request.refs.length, 3);
  assert.equal(request.refs[1], current.files.character);
  assert.deepEqual(h.assets, ['canonreference.png']);
  assert.equal(request.options.quality, 'medium');
  assert.equal(request.options.background, 'opaque');
  assert.equal(current.files.canonical, original);
  assert.throws(() => createPipeline({ save() {} }).confirm(current, auth), /pending revision/);
  await h.service.discard(current);
  assert.equal(current.files.canonical, original);
  await h.service.generate(current, { kind: 'canonical' }, auth, 'Adjust collar');
  await h.service.accept(current);
  assert.equal(current.files.canonical, h.candidate);
  assert.equal(current.stage, 'Awaiting canonical confirmation');
  current.canonicalConfirmed = true;
  assert.throws(() => validateTarget(current, { kind: 'canonical' }), /before confirming/);
});

test('cutout revisions preserve original Neutral and sheets while downloads use the accepted candidate', async () => {
  const current = job(), h = harness(), target = { kind: 'cutout', sheetKey: 'a', index: 0 };
  const neutral = current.sheets[0].raw[0], originalSheet = current.sheets[0].sheet;
  const anchor = current.sheets[1].anchoredTemplate;
  await h.service.generate(current, target, auth, 'Relax the eyebrows');
  assert.ok(h.activities.some(activity => activity?.phase === 'requesting'));
  assert.ok(h.activities.some(activity => activity?.phase === 'receiving'));
  assert.equal(h.activities.at(-1), null);
  assert.equal(current.activity, undefined);
  assert.equal(h.sources[0], neutral);
  assert.equal(h.requests[0].refs.length, 3);
  assert.equal(h.requests[0].refs[1], current.files.canonical);
  assert.equal(h.requests[0].options.quality, 'high');
  assert.equal(h.requests[0].options.background, 'transparent');
  assert.deepEqual(h.assets, ['full/masc/1.png']);
  assert.match(h.requests[0].prompt, /Keep all edits inside it/);
  const r = revisionGeometry(358, 539);
  assert.equal(h.requests[0].options.size, `${r.canvasWidth}x${r.canvasHeight}`);
  assert.match(h.requests[0].prompt, new RegExp(`width=${r.editWidth}, height=${r.editHeight}`));
  await h.service.accept(current);
  assert.equal(currentCutout(current.sheets[0], 0), h.candidate);
  assert.equal(current.sheets[0].raw[0], neutral);
  assert.equal(current.sheets[0].sheet, originalSheet);
  assert.equal(current.sheets[1].anchoredTemplate, anchor);
  const files = await emotionFiles(current);
  assert.equal(new TextDecoder().decode(files.find(file => file.name === 'neutral.png').data), 'candidate');
  assert.ok((await zipFiles(files).text()).includes('candidate'));
  await h.service.generate(current, target, auth, 'Adjust again');
  assert.equal(h.sources[1], h.candidate);
  assert.equal(h.requests[1].refs.length, 4);
  assert.equal(h.requests[1].refs[2], neutral);
  const restored = restore(structuredClone(jobRecord(current)));
  assert.equal(await restored.pendingRevision.image.text(), 'candidate');
  assert.equal(await currentCutout(restored.sheets[0], 0).text(), 'candidate');
});

test('saved candidates exclude keys, instructions, and unknown target fields', async () => {
  const current = job(), h = harness();
  await h.service.generate(current, { kind: 'cutout', sheetKey: 'b', index: 2 }, auth, 'private instructions');
  current.pendingRevision.instruction = 'private instructions';
  current.pendingRevision.auth = auth;
  current.pendingRevision.target.key = auth.key;
  const record = jobRecord(current);
  assert.doesNotMatch(JSON.stringify(record), /revision-secret|private instructions/);
  assert.deepEqual(Object.keys(record.pendingRevision), ['target', 'image', 'width', 'height']);
  assert.equal(record.pendingRevision.target.sheetKey, 'b');
  assert.equal(h.requests[0].refs[2], current.sheets[0].raw[0]);
  assert.equal(h.sources[0], current.sheets[1].raw[2]);
  assert.deepEqual(h.assets, ['full/masc/2.png']);
});

test('provider and storage failures preserve originals, pending candidates, and pipeline status', async () => {
  const current = job(), target = { kind: 'cutout', sheetKey: 'a', index: 1 };
  const original = currentCutout(current.sheets[0], 1);
  const failing = harness({ generate: async () => { throw Error('revision-secret refused'); } });
  await assert.rejects(() => failing.service.generate(current, target, auth, 'Change mouth'), /\[redacted\] refused/);
  assert.equal(current.activity, undefined);
  assert.equal(current.stage, 'Complete');
  assert.equal(current.pendingRevision, undefined);
  const h = harness();
  await h.service.generate(current, target, auth, 'Change mouth');
  const pending = current.pendingRevision;
  const blocked = harness({ save: async () => { throw Error('Storage full'); } });
  await assert.rejects(() => blocked.service.accept(current), /Storage full/);
  assert.equal(current.pendingRevision, pending);
  assert.equal(currentCutout(current.sheets[0], 1), original);
  await h.service.discard(current);
  await assert.rejects(() => blocked.service.generate(current, target, auth, 'Change mouth'), /preview is available/);
  assert.equal(current.activity, undefined);
  assert.ok(current.pendingRevision.image instanceof Blob);
  assert.equal(currentCutout(current.sheets[0], 1), original);
  assert.equal(current.stage, 'Complete');
});

test('queue waits for idle, obtains fresh credentials, retries missing keys, and cancels without requests', async () => {
  const current = job(), target = { kind: 'cutout', sheetKey: 'a', index: 1 };
  let busy = true, key = '', authReads = 0;
  const requests = [];
  const queue = createRevisionQueue({
    isBusy: () => busy,
    getAuth: () => { authReads++; if (!key) throw Error('Enter your API key.'); return { ...auth, key }; },
    execute: async (request, credentials) => requests.push({ instruction: request.instruction, key: credentials.key })
  });
  queue.enqueue(current, target, 'Change mouth');
  await queue.pump();
  assert.equal(authReads, 0);
  assert.throws(() => queue.enqueue(current, target, 'Another edit'), /existing revision/);
  busy = false;
  await queue.pump();
  assert.equal(queue.request.status, 'needs-key');
  key = 'fresh-key';
  await queue.pump();
  await queue.pump();
  assert.deepEqual(requests, [{ instruction: 'Change mouth', key: 'fresh-key' }]);
  assert.equal(queue.request, null);
  queue.enqueue(current, target, 'Cancelled instructions');
  queue.cancel();
  await queue.pump();
  assert.equal(requests.length, 1);
});
