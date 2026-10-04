// A persistent dialog for drafting and comparing revisions, kept outside progress-rendered results.
// Draft instructions stay in this UI's memory and are never saved with a job.
import { createImageUrls } from './html.mjs';
import { targetName, targetImage } from '../revisions/targets.mjs';
import { activityMarkup, revisionActivity, revisionInstructionMarkup } from './activity.mjs';

export function createRevisionDialog({ onSubmit, onCancelQueue, onRetry, onAccept, onDiscard, onSave }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'revision-dialog';
  dialog.setAttribute('aria-labelledby', 'revision-title');
  dialog.innerHTML = `
    <div class="section-head">
      <h2 id="revision-title">Revise image</h2>
      <button class="secondary" type="button" data-action="close">Close</button>
    </div>
    <p class="note" data-role="target"></p>
    <div data-role="requested-revision" hidden></div>
    <div class="revision-comparison">
      <figure><img class="revision-image" data-role="current" alt="Current image"><figcaption>Current</figcaption></figure>
      <figure data-role="candidate-panel" hidden><img class="revision-image" data-role="candidate" alt="Revised image"><figcaption>Revised</figcaption></figure>
    </div>
    <form data-role="draft">
      <label for="revision-instruction">Describe what needs to change</label>
      <textarea id="revision-instruction" required maxlength="4000" rows="4" placeholder="For example: soften the eyebrows and keep everything else the same."></textarea>
      <p class="hint">Only this image will be remade. Output dimensions are preserved; the provider is instructed to keep its placement. Instructions are sent to your provider, but are not saved by the app.</p>
      <div class="revision-actions">
        <button class="primary" type="submit">Generate revision</button>
        <button class="secondary" type="button" data-action="close">Cancel</button>
      </div>
    </form>
    <div data-role="progress" hidden></div>
    <p class="note" data-role="status" role="status" aria-live="polite"></p>
    <p class="error" data-role="error" role="alert"></p>
    <div class="revision-actions" data-role="queued" hidden>
      <button class="secondary" type="button" data-action="retry">Retry revision</button>
      <button class="secondary" type="button" data-action="cancel">Cancel queued revision</button>
    </div>
    <div class="revision-actions" data-role="review" hidden>
      <button class="primary" type="button" data-action="accept">Use revision</button>
      <button class="secondary" type="button" data-action="discard">Discard</button>
      <button class="secondary" type="button" data-action="save">Save preview again</button>
    </div>
  `;
  document.body.append(dialog);
  const element = role => dialog.querySelector(`[data-role="${role}"]`);
  const urls = createImageUrls();
  // Keep submitted instructions for review in this tab; never add them to saved jobs.
  const requestedInstructions = new Map();
  let job, target, activeRequest;
  let actionBusy = false;

  function update(request = activeRequest) {
    activeRequest = request?.job.id === job?.id ? request : null;
    if (!job || !target) return;
    const pending = job.pendingRevision;
    if (activeRequest) requestedInstructions.set(job.id, activeRequest.instruction);
    if (!pending && !activeRequest) requestedInstructions.delete(job.id);
    const instruction = requestedInstructions.get(job.id);
    element('requested-revision').hidden = !instruction;
    element('requested-revision').innerHTML = revisionInstructionMarkup(instruction);
    element('target').textContent = targetName(job, target);
    element('current').src = urls.get(targetImage(job, target));
    element('candidate-panel').hidden = !pending;
    if (pending) element('candidate').src = urls.get(pending.image);
    if (pending) dialog.querySelector('textarea').value = '';
    element('draft').hidden = Boolean(pending || activeRequest);
    element('review').hidden = !pending;
    element('queued').hidden = !activeRequest || activeRequest.status === 'generating';
    const statuses = {
      queued: 'Waiting for sheet generation to finish. You may close this dialog; the request will start when the pipeline stops.',
      generating: 'Generating only this revision. The current image remains unchanged.',
      'needs-key': 'Your revision is waiting for a matching provider and API key.',
      failed: 'The revision failed. Your current image is unchanged.'
    };
    const activity = pending ? null : revisionActivity(activeRequest);
    element('progress').hidden = !activity;
    element('progress').innerHTML = activityMarkup(activity, job.provider);
    element('status').textContent = pending ? `Review the ${pending.width} × ${pending.height} candidate. It is not used until you accept it.` : activity ? '' : statuses[activeRequest?.status] || '';
    element('error').textContent = activeRequest?.error || '';
  }

  dialog.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      onSubmit(job, target, dialog.querySelector('textarea').value);
    } catch (error) {
      element('error').textContent = error.message;
    }
  });
  const actions = { retry: onRetry, cancel: onCancelQueue, accept: onAccept, discard: onDiscard, save: onSave };
  dialog.querySelectorAll('[data-action]').forEach(button => {
    button.addEventListener('click', async () => {
      const action = button.dataset.action;
      if (action === 'close') { dialog.close(); return; }
      if (actionBusy) return;
      actionBusy = true;
      dialog.querySelectorAll('[data-action]:not([data-action="close"])').forEach(control => { control.disabled = true; });
      try {
        await actions[action](job);
        if (['accept', 'discard', 'cancel'].includes(action)) dialog.close();
        update();
      } catch (error) {
        element('error').textContent = error.message;
      } finally {
        actionBusy = false;
        dialog.querySelectorAll('[data-action]:not([data-action="close"])').forEach(control => { control.disabled = false; });
      }
    });
  });

  return {
    open(selectedJob, selectedTarget, request = null) {
      if (job !== selectedJob || JSON.stringify(target) !== JSON.stringify(selectedTarget)) {
        dialog.querySelector('textarea').value = '';
        urls.clear();
      }
      job = selectedJob;
      target = selectedTarget;
      update(request);
      if (!dialog.open) dialog.showModal();
      if (!job.pendingRevision && !activeRequest) dialog.querySelector('textarea').focus();
    },
    update(request) { update(request); },
    error(message) { element('error').textContent = message; }
  };
}
