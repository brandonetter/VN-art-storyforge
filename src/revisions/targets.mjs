// Identify revision targets and resolve accepted cutouts without changing original generation anchors.
export function currentCutout(sheet, index) {
  return sheet.revised?.[index] || sheet.raw[index];
}

export function validateTarget(job, target) {
  if (target?.kind === 'canonical') {
    if (job.canonicalConfirmed || job.stage !== 'Awaiting canonical confirmation' || !job.files.canonical) {
      throw Error('Canonical revisions are available only before confirming the reference.');
    }
    return { kind: 'canonical' };
  }
  if (target?.kind === 'cutout') {
    const sheet = job.sheets.find(sheet => sheet.key === target.sheetKey);
    if (!sheet || !Number.isInteger(target.index) || target.index < 0 || target.index >= 8 || !sheet.raw[target.index]) {
      throw Error('This cutout is not ready to revise.');
    }
    return { kind: 'cutout', sheetKey: target.sheetKey, index: target.index };
  }
  throw Error('Choose a canonical image or a ready cutout.');
}

export function targetImage(job, target) {
  if (target.kind === 'canonical') return job.files.canonical;
  return currentCutout(job.sheets.find(sheet => sheet.key === target.sheetKey), target.index);
}

export function targetName(job, target) {
  if (target.kind === 'canonical') return 'Canonical reference';
  const sheet = job.sheets.find(sheet => sheet.key === target.sheetKey);
  return `${sheet.labels[target.index]} · Sheet ${sheet.key.toUpperCase()}`;
}

export function revisionInstruction(value) {
  const instruction = String(value || '').trim();
  if (!instruction || instruction.length > 4000) throw Error('Describe the change in 1–4000 characters.');
  return instruction;
}
