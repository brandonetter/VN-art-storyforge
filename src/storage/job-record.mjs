// Only these job fields may enter IndexedDB. Credentials and provider error text are excluded.
// Keeping this boundary separate makes the app's saved data easy to audit.
import { validateTarget } from '../revisions/targets.mjs';

function imageBlob(value) {
  if (value == null || value instanceof Blob) {
    return value;
  }
  throw Error('Saved images must be image blobs, not metadata or credentials.');
}

export function jobRecord(job) {
  const pending = job.pendingRevision;
  return {
    id: job.id,
    provider: job.provider,
    templateSet: job.templateSet || 'fem',
    createdAt: job.createdAt,
    stage: job.stage,
    canonicalConfirmed: Boolean(job.canonicalConfirmed),
    error: null,
    pendingRevision: pending ? {
      target: validateTarget(job, pending.target),
      image: imageBlob(pending.image),
      width: pending.width,
      height: pending.height
    } : null,
    settings: {
      quality: job.settings.quality,
      resolution: job.settings.resolution
    },
    files: {
      character: imageBlob(job.files.character),
      canonical: imageBlob(job.files.canonical)
    },
    sheets: job.sheets.map(sheet => ({
      key: sheet.key,
      title: sheet.title,
      labels: [...sheet.labels],
      stage: sheet.stage,
      anchoredTemplate: imageBlob(sheet.anchoredTemplate ?? null),
      sheet: imageBlob(sheet.sheet),
      raw: sheet.raw.map(imageBlob),
      revised: (sheet.revised || []).map(imageBlob)
    }))
  };
}
