// Generate Sheet A first for the Neutral anchor, then B–D concurrently.
// Credentials belong to the running operation only; saved jobs contain images and progress.
import { definitions, validateTemplateSet, templatePath } from './sheets.mjs';
import { defaultPrompts, sheetPrompt } from './prompts.mjs';
import { defaultModels } from '../api/models.mjs';
import { validateAuth, providerName } from '../api/credentials.mjs';
import { requestImage } from '../api/images.mjs';
import * as pixels from '../image-processing/canvas.mjs';
import { startActivity } from '../activity.mjs';

const qualities = ['auto', 'low', 'medium', 'high', 'xhigh', 'max'];
const resolutions = ['1024x768', '2048x1536', '3072x2304', '4096x3072'];

export function settings({ quality = 'max', resolution = '3072x2304' } = {}) {
  if (!qualities.includes(quality) || !resolutions.includes(resolution)) {
    throw Error('Choose a valid quality and resolution.');
  }
  return { quality, resolution };
}

export function restore(job) {
  delete job.activity;
  delete job.activities;
  job.model ||= defaultModels[job.provider];
  job.templateSet = validateTemplateSet(job.templateSet);
  job.pendingRevision ||= null;
  for (const sheet of job.sheets) sheet.revised ||= [];
  const stopped = ['Complete', 'Awaiting canonical confirmation', 'Failed', 'Interrupted'];
  if (!stopped.includes(job.stage)) {
    job.stage = job.files.canonical && !job.canonicalConfirmed
      ? 'Awaiting canonical confirmation' : 'Interrupted';
    for (const sheet of job.sheets) {
      if (sheet.stage !== 'Complete') {
        sheet.stage = sheet.sheet ? 'Cutting interrupted' : 'Queued';
      }
    }
  }
  return job;
}

async function loadReference(name) {
  const response = await fetch(new URL(`../../assets/${name}`, import.meta.url));
  if (!response.ok) {
    throw Error(`Unable to load reference ${name}.`);
  }
  return response.blob();
}

export function createPipeline({ save, notify = () => { }, images = pixels, generate = requestImage, asset = loadReference, getPrompts = () => defaultPrompts }) {
  const active = new Set();
  let pendingSave = Promise.resolve();
  async function checkpoint(job) {
    // Serial writes prevent an older IndexedDB snapshot from overwriting a newer sheet.
    const saving = pendingSave.catch(() => {}).then(() => save(job));
    pendingSave = saving;
    await saving;
    notify(job);
  }
  async function generateCanonical(job, auth, prompts) {
    const activity = startActivity(job, notify, 'Generating canonical reference', 'canonical');
    try {
      job.stage = 'Generating canonical reference';
      await checkpoint(job);
      const guide = await asset('canonreference.png');
      const size = await images.dimensions(guide);
      const snap = value => Math.max(16, Math.round(value / 16) * 16);
      const generated = await generate(prompts.canonical, [guide, job.files.character], {
        size: `${snap(size.width)}x${snap(size.height)}`,
        quality: 'medium',
        background: 'opaque'
      }, auth, undefined, phase => activity.update(phase));
      activity.update('processing');
      job.files.canonical = await images.normalize(generated, Infinity, Infinity, true);
      job.stage = 'Awaiting canonical confirmation';
      activity.update('saving');
      await checkpoint(job);
    } finally {
      activity.finish();
    }
  }
  async function generateSheet(job, sheet, auth, activity, prompts) {
    const definition = definitions.find(item => item.key === sheet.key);
    sheet.stage = sheet.key === 'a' ? 'Generating' : 'Preparing Neutral anchor';
    if (sheet.key === 'a') job.stage = 'Sheet A: generating';
    await checkpoint(job);
    const references = [
      await asset(templatePath(job.templateSet, definition.number)),
      job.files.canonical,
      await asset('grid.png')
    ];
    if (sheet.key !== 'a') {
      const neutral = job.sheets[0].raw[0];
      sheet.anchoredTemplate ||= await images.anchor(references[0], neutral);
      references[0] = sheet.anchoredTemplate;
      references.push(neutral);
      await checkpoint(job);
    }
    sheet.stage = 'Generating';
    if (sheet.key === 'a') job.stage = 'Sheet A: generating';
    await checkpoint(job);
    const generated = await generate(sheetPrompt(definition, prompts), references, {
      size: job.settings.resolution,
      aspect_ratio: '4:3',
      quality: job.settings.quality,
      background: 'transparent'
    }, auth, undefined, phase => activity.update(phase));
    activity.update('processing');
    const [width, height] = job.settings.resolution.split('x').map(Number);
    sheet.sheet = await images.normalize(generated, width, height);
    await checkpoint(job);
  }
  async function cutSheet(job, sheet, activity) {
    sheet.stage = 'Cutting eight panels';
    if (sheet.key === 'a') job.stage = 'Sheet A: cutting';
    activity.update('processing', 'Creating the eight cutouts in this browser.');
    await checkpoint(job);
    for (let index = 0; index < 8; index++) {
      if (sheet.raw[index]) {
        continue;
      }
      sheet.raw[index] = await images.crop(sheet.sheet, index);
      activity.update('processing', `${sheet.raw.filter(Boolean).length} of 8 cutouts ready. Processing in this browser.`);
      await checkpoint(job);
    }
    sheet.stage = 'Complete';
    activity.update('saving');
    await checkpoint(job);
  }
  async function generateSheets(job, auth, prompts) {
    if (!job.canonicalConfirmed) throw Error('Confirm your canonical reference first.');
    async function process(sheet) {
      if (sheet.stage === 'Complete') return;
      const activity = startActivity(job, notify, `Processing Sheet ${sheet.key.toUpperCase()}`, 'sheet', sheet.key);
      try {
        if (!sheet.sheet) await generateSheet(job, sheet, auth, activity, prompts);
        await cutSheet(job, sheet, activity);
      } catch (error) {
        sheet.stage = 'Failed';
        await checkpoint(job);
        throw error;
      } finally {
        activity.finish();
      }
    }
    // B–D must never run until A has produced its first cutout.
    await process(job.sheets[0]);
    job.stage = 'Sheets B–D: generating in parallel';
    await checkpoint(job);
    const outcomes = await Promise.allSettled(job.sheets.slice(1).map(process));
    const failure = outcomes.find(outcome => outcome.status === 'rejected');
    if (failure) throw failure.reason;
    job.stage = 'Complete';
    await checkpoint(job);
  }
  async function run(job, auth, operation) {
    if (active.has(job.id)) {
      throw Error('This job is already running.');
    }
    const model = auth?.model || job.model || defaultModels[job.provider];
    auth = { ...validateAuth(auth), model };
    if (auth.provider !== job.provider) {
      throw Error(`Select ${providerName(job.provider)} in Setup to continue this job.`);
    }
    active.add(job.id);
    try {
      job.error = null;
      await operation(job, auth, getPrompts());
    } catch (error) {
      job.stage = 'Failed';
      job.error = String(error.message).replaceAll(auth.key, '[redacted]');
      try {
        await checkpoint(job);
      } catch {
        notify(job);
        throw Error('Browser storage failed. Download any available images before refreshing.');
      }
    } finally {
      active.delete(job.id);
    }
    return job;
  }
  return {
    async create(file, auth, selectedSettings, selectedTemplateSet) {
      auth = { ...validateAuth(auth), model: auth.model || defaultModels[auth.provider] };
      const generationSettings = settings(selectedSettings);
      const templateSet = validateTemplateSet(selectedTemplateSet);
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(file.type)) {
        throw Error('Upload PNG, JPEG, WebP, or AVIF art.');
      }
      if (file.size > 15000000) {
        throw Error('Image is too large (15 MB maximum).');
      }
      const character = await images.normalize(file, 2048, 2048);
      const job = {
        id: crypto.randomUUID(),
        provider: auth.provider,
        model: auth.model || defaultModels[auth.provider],
        templateSet,
        settings: generationSettings,
        createdAt: new Date().toISOString(),
        stage: 'Queued',
        error: null,
        canonicalConfirmed: false,
        files: { character, canonical: null },
        sheets: definitions.map(({ key, title, labels }) => ({
          key, title, labels, stage: 'Queued', anchoredTemplate: null, sheet: null, raw: [], revised: []
        }))
      };
      await checkpoint(job);
      return run(job, auth, generateCanonical);
    },
    confirm(job, auth, selectedSettings) {
      if (job.pendingRevision) throw Error('Accept or discard the pending revision before confirming.');
      if (job.stage !== 'Awaiting canonical confirmation' || !job.files.canonical) {
        throw Error('This job is not awaiting confirmation.');
      }
      const selected = settings(selectedSettings);
      return run(job, auth, async (job, auth, prompts) => {
        job.settings = selected;
        job.model = auth.model;
        job.canonicalConfirmed = true;
        await checkpoint(job);
        await generateSheets(job, auth, prompts);
      });
    },
    resume(job, auth) {
      if (job.pendingRevision) throw Error('Accept or discard the pending revision before resuming.');
      if (!['Failed', 'Interrupted'].includes(job.stage)) {
        throw Error('This job is not ready to resume.');
      }
      return run(job, auth, async (job, auth, prompts) => {
        job.model = auth.model;
        if (!job.files.canonical) {
          await generateCanonical(job, auth, prompts);
        }
        else if (!job.canonicalConfirmed) {
          job.stage = 'Awaiting canonical confirmation';
          await checkpoint(job);
        }
        else {
          await generateSheets(job, auth, prompts);
        }
      });
    }
  };
}
