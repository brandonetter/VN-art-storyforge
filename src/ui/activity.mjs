// Shared, accessible loading feedback without invented percentages or connection claims.
import { escapeHtml } from './html.mjs';
import { providerName } from '../api/credentials.mjs';

export function activityMarkup(activity, provider, compact = false) {
  if (!activity) return '';
  const service = provider ? providerName(provider) : 'the provider';
  const descriptions = {
    preparing: 'Preparing images and references.',
    requesting: `Request started. Waiting for ${service} to respond.`,
    receiving: `Connected to ${service}. Receiving the image response.`,
    processing: 'Response received. Processing the image in this browser.',
    saving: 'Saving the result in this browser.',
    queued: 'Waiting for the current generation to finish. Request has not started.'
  };
  const waiting = activity.phase === 'queued';
  return `<div class="activity${compact ? ' activity-compact' : ''}">
    <span class="${waiting ? 'activity-waiting' : 'activity-spinner'}" aria-hidden="true">${waiting ? '&#9202;' : ''}</span>
    <div class="activity-copy" role="status" aria-live="polite" aria-atomic="true"><strong>${escapeHtml(activity.title)}</strong>
      <span>${escapeHtml(activity.detail || descriptions[activity.phase] || descriptions.preparing)}</span>
    </div>
    <span class="activity-elapsed" data-started-at="${activity.startedAt}" aria-live="off">${elapsed(activity.startedAt)}</span>
  </div>`;
}

function elapsed(startedAt, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} elapsed`;
}

export function updateElapsed(container, now = Date.now()) {
  container.querySelectorAll('[data-started-at]').forEach(element => {
    element.textContent = elapsed(Number(element.dataset.startedAt), now);
  });
}

export function revisionActivity(request) {
  if (!request || !['queued', 'generating'].includes(request.status)) return null;
  if (request.status === 'generating' && request.job.activity?.kind === 'revision') return request.job.activity;
  return { title: request.status === 'queued' ? 'Revision queued' : 'Generating revision',
    phase: request.status === 'queued' ? 'queued' : 'preparing', startedAt: request.startedAt };
}

export function revisionInstructionMarkup(instruction) {
  if (!instruction) return '';
  return `<div class="revision-request"><div class="eyebrow">REVISION</div>
    <p>${escapeHtml(instruction)}</p></div>`;
}
