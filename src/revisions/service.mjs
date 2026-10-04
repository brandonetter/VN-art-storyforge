// Generate review candidates and save accepted edits without mutating original sheets or pipeline status.
// Keys and typed instructions are operation arguments only and never enter saved revision records.
import { validateAuth, providerName } from '../api/credentials.mjs';
import { requestImage } from '../api/images.mjs';
import { definitions, templatePath } from '../generation/sheets.mjs';
import * as pixels from '../image-processing/canvas.mjs';
import { validateTarget, targetImage, revisionInstruction } from './targets.mjs';
import { revisionPrompt } from './prompts.mjs';
import { startActivity } from '../activity.mjs';

async function loadReference(name) {
  const response = await fetch(new URL(`../../assets/${name}`, import.meta.url));
  if (!response.ok) throw Error(`Unable to load revision reference ${name}.`);
  return response.blob();
}

export function createRevisionService({ save, notify = () => {}, generate = requestImage, images = pixels, asset = loadReference }) {
  const active = new Set();

  async function persist(job, update) {
    await save({ ...job, ...update });
    Object.assign(job, update);
    notify(job);
  }

  return {
    async generate(job, target, auth, instruction) {
      if (!['Complete', 'Awaiting canonical confirmation', 'Failed', 'Interrupted'].includes(job.stage)) {
        throw Error('Wait for the generation pipeline to stop before revising.');
      }
      if (active.has(job.id) || job.pendingRevision) throw Error('Review or finish this job’s existing revision first.');
      target = validateTarget(job, target);
      instruction = revisionInstruction(instruction);
      auth = validateAuth(auth);
      if (auth.provider !== job.provider) throw Error(`Select ${providerName(job.provider)} in Setup to revise this job.`);
      active.add(job.id);
      const activity = startActivity(job, notify, 'Generating revision', 'revision');
      try {
        const source = targetImage(job, target);
        const opaque = target.kind === 'canonical';
        const working = await images.createWorkingImage(source, opaque);
        let references, emotion, neutralReference = false;
        if (opaque) {
          references = [working.image, job.files.character, await asset('canonreference.png')];
        } else {
          const sheet = job.sheets.find(sheet => sheet.key === target.sheetKey);
          const definition = definitions.find(sheet => sheet.key === target.sheetKey);
          emotion = sheet.labels[target.index];
          references = [working.image, job.files.canonical];
          const neutral = job.sheets[0].raw[0];
          if (neutral && neutral !== source) {
            references.push(neutral);
            neutralReference = true;
          }
          const template = await asset(templatePath(job.templateSet, definition.number));
          references.push(await images.crop(template, target.index));
        }
        const prompt = revisionPrompt({ target, rectangle: working.rectangle, instruction, emotion, neutralReference });
        const output = await generate(prompt, references, {
          size: `${working.rectangle.canvasWidth}x${working.rectangle.canvasHeight}`,
          quality: opaque ? 'medium' : job.settings.quality,
          background: opaque ? 'opaque' : 'transparent'
        }, auth, undefined, phase => activity.update(phase));
        activity.update('processing');
        const candidate = await images.extractRevision(output, working.rectangle, opaque);
        const pendingRevision = { target, image: candidate, width: working.rectangle.width, height: working.rectangle.height };
        activity.update('saving');
        try {
          await persist(job, { pendingRevision });
        } catch {
          job.pendingRevision = pendingRevision;
          notify(job);
          throw Error('The revision preview is available, but browser storage failed. Keep this tab open and retry saving or accepting it.');
        }
        return pendingRevision;
      } catch (error) {
        throw Error(String(error.message).replaceAll(auth.key, '[redacted]'));
      } finally {
        active.delete(job.id);
        activity.finish();
      }
    },

    async accept(job) {
      if (active.has(job.id)) throw Error('Wait for the revision to finish.');
      const pending = job.pendingRevision;
      if (!pending) throw Error('No revision is awaiting review.');
      const target = validateTarget(job, pending.target);
      const update = { pendingRevision: null };
      if (target.kind === 'canonical') {
        update.files = { ...job.files, canonical: pending.image };
      } else {
        update.sheets = job.sheets.map(sheet => {
          if (sheet.key !== target.sheetKey) return sheet;
          const revised = [...(sheet.revised || [])];
          revised[target.index] = pending.image;
          return { ...sheet, revised };
        });
      }
      await persist(job, update);
    },

    async discard(job) {
      if (active.has(job.id)) throw Error('Wait for the revision to finish.');
      await persist(job, { pendingRevision: null });
    },

    async savePreview(job) {
      if (!job.pendingRevision) throw Error('No revision is awaiting review.');
      await save(job);
    }
  };
}
