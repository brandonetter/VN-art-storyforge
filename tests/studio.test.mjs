// CLI tests cover generation flow, downloads, and credential privacy using simulated API responses.
// No browser is launched and no paid API call is made.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPipeline, restore } from '../src/generation/pipeline.mjs';
import { requestImage } from '../src/api/images.mjs';
import { compatibleModels, listModels, defaultModels } from '../src/api/models.mjs';
import { sheetPrompt, defaultPrompts } from '../src/generation/prompts.mjs';
import { revisionPrompt, defaultRevisionPrompts } from '../src/revisions/prompts.mjs';
import { definitions } from '../src/generation/sheets.mjs';
import { validateAuth, createKeySession } from '../src/api/credentials.mjs';
import { jobRecord } from '../src/storage/job-record.mjs';
import { fitDimensions, panelBounds } from '../src/image-processing/canvas.mjs';
import { emotionFiles, zipFiles } from '../src/downloads/zip.mjs';

function harness(failSheet) {
  const saved = new Map(), events = [], requests = [], assets = [], activities = [];
  const image = name => new Blob([name], { type: 'image/png' });
  const images = { dimensions: async () => ({ width: 1448, height: 1086 }), normalize: async (blob) => blob,
    anchor: async (template, neutral) => { events.push('anchor'); assert.ok(neutral instanceof Blob); return image('anchor'); },
    crop: async (sheet, index) => { events.push(`crop-${index}`); return image(`crop-${index}`); } };
  const pipeline = createPipeline({ save: async (job) => saved.set(job.id, structuredClone(job)), images, asset: async (name) => { assets.push(name); return image(name); },
    notify: job => activities.push(...(job.activity ? [{ ...job.activity }] : Object.values(job.activities || {}).map(activity => ({ ...activity })))),
    generate: async (prompt, refs, options, auth, fetcher, onProgress) => {
      onProgress('requesting');
      const sheet = prompt.match(/reference for Sheet ([A-D])/i)?.[1]?.toLowerCase() || 'canonical';
      events.push(`generate-${sheet}`);
      requests.push({ sheet, refs, options, provider: auth.provider });
      if (failSheet === sheet) {
        failSheet = null;
        throw Error('Simulated provider error');
      }
      onProgress('receiving');
      onProgress('processing');
      return image(sheet);
    } });
  return { pipeline, saved, events, requests, assets, activities, image };
}

const auth = { provider: 'openai', key: 'test-secret' };

test('Fem and Masc use their own template folders and survive saved-job restore', async () => {
  for (const templateSet of ['fem', 'masc']) {
    const h = harness();
    const job = await h.pipeline.create(h.image('art'), auth, undefined, templateSet);
    await h.pipeline.confirm(job, auth);
    assert.equal(job.stage, 'Complete');
    assert.equal(jobRecord(job).templateSet, templateSet);
    assert.equal(restore(structuredClone(jobRecord(job))).templateSet, templateSet);
    assert.deepEqual(h.assets.filter(path => path.startsWith('full/')), [1, 2, 3, 4].map(number => `full/${templateSet}/${number}.png`));
    for (let number = 1; number <= 4; number++) {
      assert.ok((await readFile(new URL(`../assets/full/${templateSet}/${number}.png`, import.meta.url))).length);
    }
    delete job.templateSet;
    assert.equal(restore(job).templateSet, 'fem');
  }
  const h = harness();
  await assert.rejects(() => h.pipeline.create(h.image('art'), auth, undefined, 'invalid'), /Choose Fem or Masc/);
  assert.equal(h.requests.length, 0);
});

test('canonical confirmation gates Sheet A before parallel sheets and persists no credentials', async () => {
  const h = harness(), job = await h.pipeline.create(h.image('art'), auth);
  assert.equal(job.stage, 'Awaiting canonical confirmation');
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].options.background, 'opaque');
  assert.equal(h.requests[0].options.quality, 'medium');
  await assert.rejects(() => h.pipeline.confirm(job, { provider: 'openrouter', key: 'other' }), /Select OpenAI/);
  assert.equal(job.canonicalConfirmed, false);
  await h.pipeline.confirm(job, auth, { quality: 'high', resolution: '2048x1536' });
  assert.equal(job.stage, 'Complete');
  assert.equal(job.sheets.flatMap(sheet => sheet.raw).length, 32);
  assert.deepEqual(h.requests.map(request => request.refs.length), [2, 3, 4, 4, 4]);
  for (const request of h.requests.slice(2))
    assert.equal(request.refs[3], job.sheets[0].raw[0]);
  for (const [index, sheet] of job.sheets.entries()) {
    if (index === 0) continue;
    assert.equal(sheet.anchoredTemplate, h.requests[index + 1].refs[0]);
    assert.ok(jobRecord(job).sheets[index].anchoredTemplate instanceof Blob);
  }
  assert.ok(h.events.indexOf('crop-7') < h.events.indexOf('generate-b'));
  assert.equal(JSON.stringify(h.saved.get(job.id)).includes('test-secret'), false);
  const files = await emotionFiles(job);
  assert.equal(files.length, 29);
  assert.equal(files.filter(file => file.name === 'neutral.png').length, 1);
  assert.ok(files.some(file => file.name === 'spare-slot.png'));
  const bytes = new Uint8Array(await zipFiles(files).arrayBuffer()), view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
  assert.equal(view.getUint16(bytes.length - 12, true), 29);
});

test('B–D start together only after Sheet A has produced its Neutral cutout', async () => {
  const image = name => new Blob([name], { type: 'image/png' });
  const started = [], release = new Map();
  const pipeline = createPipeline({
    save: async () => {}, asset: async name => image(name),
    images: { dimensions: async () => ({ width: 1024, height: 768 }), normalize: async blob => blob,
      anchor: async () => image('anchor'), crop: async (blob, index) => image(`crop-${index}`) },
    generate: async (prompt, refs) => {
      const sheet = prompt.match(/reference for Sheet ([A-D])/i)?.[1]?.toLowerCase() || 'canonical';
      if (sheet !== 'canonical') started.push({ sheet, anchor: refs[3] });
      if (sheet !== 'canonical' && sheet !== 'a') await new Promise(resolve => release.set(sheet, resolve));
      return image(sheet);
    }
  });
  const job = await pipeline.create(image('art'), { ...auth, model: 'gpt-image-1' });
  const confirming = pipeline.confirm(job, { ...auth, model: 'gpt-image-1-mini' });
  for (let attempt = 0; attempt < 100 && release.size < 3; attempt++) await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(started.map(item => item.sheet), ['a', 'b', 'c', 'd']);
  assert.ok(job.sheets[0].raw[0] instanceof Blob);
  assert.ok(started.slice(1).every(item => item.anchor === job.sheets[0].raw[0]));
  assert.equal(job.stage, 'Sheets B–D: generating in parallel');
  release.get('c')(); release.get('d')(); release.get('b')();
  await confirming;
  assert.equal(job.stage, 'Complete');
  assert.equal(job.model, 'gpt-image-1-mini');
  assert.equal(jobRecord(job).model, 'gpt-image-1-mini');
  assert.equal(restore(structuredClone(jobRecord(job))).model, 'gpt-image-1-mini');
});

test('resume after reload reuses completed sheets and accepts a fresh key', async () => {
  const h = harness('b'), job = await h.pipeline.create(h.image('art'), auth);
  await h.pipeline.confirm(job, auth);
  assert.equal(job.stage, 'Failed');
  assert.equal(job.activity, undefined);
  const restored = restore(structuredClone(h.saved.get(job.id))), next = harness();
  await next.pipeline.resume(restored, { provider: 'openai', key: 'replacement' });
  assert.equal(restored.stage, 'Complete');
  assert.deepEqual(next.requests.map(request => request.sheet), ['b']);
  assert.equal(restored.sheets[2].stage, 'Complete');
  assert.equal(restored.sheets[3].stage, 'Complete');
  assert.equal(next.requests[0].refs[0], restored.sheets[1].anchoredTemplate);
  assert.equal(next.events.filter(event => event === 'anchor').length, 0);
  const interrupted = structuredClone(restored);
  interrupted.stage = 'Sheet B: generating';
  interrupted.sheets[1].stage = 'Generating';
  assert.equal(restore(interrupted).stage, 'Interrupted');
});

test('canonical and all sheets expose request progress and clear transient loading state', async () => {
  const h = harness(), job = await h.pipeline.create(h.image('art'), auth);
  assert.ok(h.activities.some(activity => activity?.kind === 'canonical' && activity.phase === 'requesting'));
  assert.equal(job.activity, undefined);
  await h.pipeline.confirm(job, auth);
  for (const sheet of job.sheets) {
    const updates = h.activities.filter(activity => activity?.sheetKey === sheet.key);
    assert.ok(updates.some(activity => activity.phase === 'requesting'));
    assert.ok(updates.some(activity => activity.phase === 'receiving'));
    assert.ok(updates.some(activity => activity.detail?.startsWith('8 of 8 cutouts ready')));
  }
  assert.equal(job.activity, undefined);
  assert.equal(job.activities, undefined);
  job.activity = { phase: 'requesting' };
  assert.equal(jobRecord(job).activity, undefined);
  assert.equal(restore(job).activity, undefined);
});

test('missing keys, upload limits, and invalid settings fail before paid requests', async () => {
  assert.throws(() => validateAuth({ provider: 'openai', key: '' }), /Enter your API key/);
  const h = harness();
  await assert.rejects(() => h.pipeline.create(new Blob(['art'], { type: 'text/plain' }), auth), /Upload/);
  await assert.rejects(() => h.pipeline.create(h.image('art'), auth, { quality: 'invalid' }), /valid quality/);
  assert.equal(h.requests.length, 0);
});

test('direct browser provider requests preserve references and redact errors', async () => {
  for (const provider of ['openai', 'openrouter']) {
    const refs = [new Blob(['reference'], { type: 'image/png' })];
    const output = await requestImage('prompt', refs, { size: '1024x768', aspect_ratio: '4:3', quality: 'max' }, { provider, key: 'secret' }, async (url, init) => {
      assert.equal(init.headers.Authorization, 'Bearer secret');
      assert.equal(init.credentials, 'omit');
      if (provider === 'openai') {
        assert.equal(url, 'https://api.openai.com/v1/images/edits');
        assert.ok(init.body instanceof FormData);
        assert.equal(init.body.get('aspect_ratio'), null);
        assert.equal(init.body.getAll('image[]').length, 1);
      }
      else {
        assert.equal(url, 'https://openrouter.ai/api/v1/images');
        assert.equal(JSON.parse(init.body).input_references[0].image_url.url, 'data:image/png;base64,cmVmZXJlbmNl');
      }
      return Response.json({ data: [{ b64_json: btoa('png') }] });
    });
    assert.equal(await output.text(), 'png');
    await requestImage('prompt', refs, {}, { provider, key: 'secret', model: 'custom-image-model' }, async (url, init) => {
      assert.equal(provider === 'openai' ? init.body.get('model') : JSON.parse(init.body).model, 'custom-image-model');
      return Response.json({ data: [{ b64_json: btoa('png') }] });
    });
    await assert.rejects(() => requestImage('prompt', refs, {}, { provider, key: 'secret' }, async () => Response.json({ error: { message: 'secret rejected' } }, { status: 401 })), /\[redacted\] rejected/);
  }
});

test('models endpoints filter image-edit-capable models and never put keys in URLs', async () => {
  const models = { data: [
    { id: 'gpt-image-1', name: 'GPT image' }, { id: 'gpt-4o' }, { id: 'dall-e-3' },
    { id: 'vendor/image', architecture: { input_modalities: ['text', 'image'], output_modalities: ['image'] } },
    { id: 'vendor/text-to-image', architecture: { input_modalities: ['text'], output_modalities: ['image'] } }
  ] };
  assert.deepEqual(compatibleModels('openai', models).map(item => item.id), ['gpt-image-1']);
  assert.deepEqual(compatibleModels('openrouter', models).map(item => item.id), ['vendor/image']);
  for (const provider of ['openai', 'openrouter']) {
    const result = await listModels({ provider, key: 'private-key' }, async (url, init) => {
      assert.ok(url.endsWith('/models'));
      assert.ok(!url.includes('private-key'));
      assert.equal(init.headers.Authorization, 'Bearer private-key');
      assert.equal(init.credentials, 'omit');
      return Response.json(models);
    });
    assert.equal(result.length, 1);
  }
  assert.equal(defaultModels.openai, 'gpt-image-2.5-sunburst');
});

test('pipeline uses edited prompt templates for canonical and sheet requests', async () => {
  const image = name => new Blob([name], { type: 'image/png' });
  const prompts = [];
  const pipeline = createPipeline({
    save: async () => {}, asset: async name => image(name),
    getPrompts: () => ({ ...defaultPrompts, canonical: 'My canonical', sheet: 'Custom sheet {sheet}: {anchor}', sheetAnchor: 'Neutral for {sheet}' }),
    images: { dimensions: async () => ({ width: 1024, height: 768 }), normalize: async blob => blob,
      anchor: async () => image('anchor'), crop: async () => image('cutout') },
    generate: async prompt => { prompts.push(prompt); return image('generated'); }
  });
  const job = await pipeline.create(image('art'), auth);
  await pipeline.confirm(job, auth);
  assert.deepEqual(prompts, ['My canonical', 'Custom sheet A:', 'Custom sheet B: Neutral for B', 'Custom sheet C: Neutral for C', 'Custom sheet D: Neutral for D']);
});

test('custom prompt text fills only known tokens without reinterpreting user instructions', () => {
  const sheet = sheetPrompt(definitions[1], { ...defaultPrompts, sheet: '{sheet} {anchor} {panelsTop} {direction}', sheetAnchor: 'anchor for {sheet}', directionB: 'custom direction' });
  assert.match(sheet, /^B anchor for B Neutral/);
  assert.match(sheet, /custom direction$/);
  const prompt = revisionPrompt({ target: { kind: 'canonical' }, rectangle: { canvasWidth: 100, canvasHeight: 200 }, instruction: 'Keep {context} literal' },
    { ...defaultRevisionPrompts, revision: '{context} Requested change: {instruction}', revisionCanonical: 'my context' });
  assert.equal(prompt, 'my context Requested change: Keep {context} literal');
});

test('crop geometry and aspect-preserving resizing match the four-by-two grid', () => {
  assert.deepEqual(fitDimensions(400, 200, 200, 200), { width: 200, height: 100 });
  assert.deepEqual(fitDimensions(400, 200, 800, 800), { width: 400, height: 200 });
  assert.deepEqual(panelBounds(1448, 1086, 7), { x: 1088, y: 545, width: 358, height: 539 });
});

test('static entry and runtime modules contain no environment or local API dependency', async () => {
  for (const file of ['index.html', 'src/main.mjs', 'src/generation/pipeline.mjs', 'src/api/images.mjs', 'src/api/credentials.mjs', 'src/image-processing/canvas.mjs', 'src/storage/jobs.mjs', 'src/generation/prompts.mjs', 'src/downloads/zip.mjs', 'scripts/preview.mjs']) {
    const source = await readFile(new URL('../' + file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /process\.env|dotenv|loadEnv|\/api\/jobs|\/api\/setup|from ['"]sharp/);
  }
});

test('key sessions are page-local and Clear forgets both provider keys', () => {
  const session = createKeySession();
  session.set('openai', 'openai-secret');
  session.set('openrouter', 'router-secret');
  assert.equal(session.auth('openai').key, 'openai-secret');
  assert.equal(session.auth('openrouter').key, 'router-secret');
  assert.equal(createKeySession().get('openai'), '');
  assert.equal(JSON.stringify(session), '{}');
  session.clear();
  assert.equal(session.get('openai'), '');
  assert.equal(session.get('openrouter'), '');
  assert.throws(() => session.auth('openai'), /Enter your API key/);
});

test('the storage schema excludes credentials at every level and omits provider errors', async () => {
  const h = harness();
  const job = await h.pipeline.create(h.image('art'), auth);
  job.apiKey = 'top-level-secret';
  job.auth = { key: 'auth-secret' };
  job.error = 'A provider echoed error-secret';
  job.settings.apiKey = 'settings-secret';
  job.files.apiKey = 'files-secret';
  job.sheets[0].apiKey = 'sheet-secret';
  const record = structuredClone(jobRecord(job));
  assert.equal(record.error, null);
  assert.equal(JSON.stringify(record).includes('secret'), false);
  assert.ok(record.files.character instanceof Blob);
  assert.equal(record.provider, auth.provider);
  assert.deepEqual(Object.keys(record.settings), ['quality', 'resolution']);
  job.files.character = { key: 'nested-secret' };
  assert.throws(() => jobRecord(job), /Saved images must be image blobs/);
});
