// Connect the page's UI, generation pipeline, and saved jobs.
// Credentials are requested from Setup only when starting an operation, never attached to jobs.
import { definitions, templatePath } from './generation/sheets.mjs';
import { createPipeline, restore } from './generation/pipeline.mjs';
import { openStorage } from './storage/jobs.mjs';
import { emotionFiles, zipFiles } from './downloads/zip.mjs';
import { initializeSetup } from './ui/setup.mjs';
import { createResultsView } from './ui/results.mjs';
import { renderHistory } from './ui/history.mjs';
import { escapeHtml } from './ui/html.mjs';
import { createRevisionDialog } from './ui/revision-dialog.mjs';
import { createRevisionQueue } from './revisions/queue.mjs';
import { createRevisionService } from './revisions/service.mjs';
import { activityMarkup, revisionActivity, revisionInstructionMarkup, updateElapsed } from './ui/activity.mjs';

const characterInput = document.querySelector('#character');
const generateButton = document.querySelector('#generate');
const historyContainer = document.querySelector('#history');
const message = document.querySelector('#app-message');
const qualityInput = document.querySelector('#quality');
const resolutionInput = document.querySelector('#resolution');
const templateInput = document.querySelector('#template-set');
const setup = initializeSetup(document.querySelector('#setup'));
const jobs = new Map();
let currentId = null;
let busy = false;
let previewUrl;
let pipeline;
let revisions;
let operationStartedAt;
const operationProgress = document.createElement('div');
operationProgress.hidden = true;
document.querySelector('#result').before(operationProgress);
const revisionNotice = document.createElement('div');
revisionNotice.className = 'revision-notice';
revisionNotice.hidden = true;
revisionNotice.innerHTML = '<div data-role="revision-progress"></div> <button class="secondary" type="button">View revision</button>';
document.querySelector('#result').before(revisionNotice);
const dialog = createRevisionDialog({
  onSubmit(job, target, instruction) {
    queue.enqueue(job, target, instruction);
    void queue.pump();
  },
  onCancelQueue: () => queue.cancel(),
  onRetry: () => queue.pump(),
  onAccept: job => revisionAction(() => revisions.accept(job)),
  onDiscard: job => revisionAction(() => revisions.discard(job)),
  onSave: job => revisionAction(() => revisions.savePreview(job))
});
const queue = createRevisionQueue({
  isBusy: () => busy,
  getAuth: provider => setup.auth(provider),
  notify(request) {
    dialog.update(request);
    refresh();
  },
  async execute(request, auth) {
    await revisionAction(() => revisions.generate(request.job, request.target, auth, request.instruction));
  }
});
revisionNotice.querySelector('button').addEventListener('click', () => {
  const request = queue.request;
  if (request) dialog.open(request.job, request.target, request);
});
const results = createResultsView(document.querySelector('#result'), {
  onConfirm: job => perform(() => pipeline.confirm(job, setup.auth(job.provider), selectedSettings())),
  onResume: job => perform(() => pipeline.resume(job, setup.auth(job.provider))),
  onDownload: downloadJob,
  onRevise: (job, target) => dialog.open(job, target),
  onReview: job => dialog.open(job, job.pendingRevision.target)
});

function selectedSettings() {
  return { quality: qualityInput.value, resolution: resolutionInput.value };
}

function refresh() {
  const occupied = Boolean(queue.request);
  generateButton.disabled = busy || occupied || !pipeline || !characterInput.files[0];
  templateInput.disabled = busy || occupied;
  renderHistory(historyContainer, jobs, busy || occupied, selectJob);
  revisionNotice.hidden = !occupied;
  const queuedActivity = revisionActivity(queue.request);
  revisionNotice.querySelector('[data-role="revision-progress"]').innerHTML = (queuedActivity
    ? activityMarkup(queuedActivity, queue.request.job.provider, true)
    : '<p class="note">A revision needs attention. Open it to retry or cancel.</p>')
    + revisionInstructionMarkup(queue.request?.instruction);
  const job = jobs.get(currentId);
  // Revisions have their own persistent notice and dialog; pipeline activity lives here.
  const activity = job?.activity?.kind !== 'revision' ? job?.activity : null;
  operationProgress.hidden = !busy || queue.request?.status === 'generating';
  operationProgress.innerHTML = operationProgress.hidden ? '' : activityMarkup(activity || {
    title: 'Preparing operation', phase: 'preparing', startedAt: operationStartedAt
  }, job?.provider);
  if (currentId) {
    results.render(jobs.get(currentId), busy, occupied);
  }
}

function selectJob(id) {
  if (busy || queue.request) {
    return;
  }
  currentId = id;
  const job = jobs.get(id);
  qualityInput.value = job.settings.quality;
  resolutionInput.value = job.settings.resolution;
  templateInput.value = job.templateSet;
  renderTemplates();
  refresh();
}

async function perform(operation) {
  if (busy || queue.request) {
    return;
  }
  busy = true;
  operationStartedAt = Date.now();
  message.textContent = '';
  refresh();
  try {
    await operation();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    busy = false;
    refresh();
    await queue.pump();
  }
}

async function revisionAction(operation) {
  if (busy) throw Error('Wait for the current operation to finish.');
  busy = true;
  operationStartedAt = Date.now();
  message.textContent = '';
  refresh();
  try {
    return await operation();
  } catch (error) {
    message.textContent = error.message;
    throw error;
  } finally {
    busy = false;
    refresh();
  }
}

async function downloadJob(job) {
  try {
    const blob = zipFiles(await emotionFiles(job));
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `emotions-${job.id}.zip`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    message.textContent = error.message;
  }
}

characterInput.addEventListener('change', () => {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
  }
  const file = characterInput.files[0];
  const preview = document.querySelector('#preview');
  preview.hidden = !file;
  if (file) {
    previewUrl = URL.createObjectURL(file);
    preview.src = previewUrl;
  }
  else {
    preview.removeAttribute('src');
  }
  document.querySelector('#upload-title').textContent = file?.name || 'Choose a character image';
  refresh();
});

generateButton.addEventListener('click', () => {
  if (busy || queue.request || !pipeline) {
    return;
  }
  const file = characterInput.files[0];
  if (!file) {
    return;
  }
  perform(() => pipeline.create(file, setup.auth(), selectedSettings(), templateInput.value));
});

window.addEventListener('beforeunload', event => {
  if (busy || queue.request) {
    event.preventDefault();
    event.returnValue = '';
  }
});

function renderTemplates() {
  document.querySelector('#templates').innerHTML = definitions.map(sheet => `
    <div class="template">
      <img src="./assets/${templatePath(templateInput.value, sheet.number)}" alt="${escapeHtml(templateInput.value)} Sheet ${sheet.key.toUpperCase()} template">
      <b>${sheet.key.toUpperCase()} &middot; ${escapeHtml(sheet.title)}</b>
    </div>
  `).join('');
}

templateInput.addEventListener('change', renderTemplates);
renderTemplates();
// Update only elapsed text; avoid rebuilding previews or interrupting form input.
setInterval(() => updateElapsed(document), 1000);

try {
  const storage = await openStorage();
  for (const saved of await storage.list()) {
    const job = restore(saved);
    jobs.set(job.id, job);
    await storage.save(job);
  }
  pipeline = createPipeline({
    save: job => storage.save(job),
    notify: job => {
      jobs.set(job.id, job);
      currentId = job.id;
      refresh();
    }
  });
  revisions = createRevisionService({
    save: job => storage.save(job),
    notify: job => {
      jobs.set(job.id, job);
      dialog.update(queue.request);
      refresh();
    }
  });
  refresh();
} catch (error) {
  message.textContent = error.message;
  generateButton.disabled = true;
}
