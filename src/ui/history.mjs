// Display saved jobs without credentials and notify the controller when a job is selected.
import { escapeHtml } from './html.mjs';
import { providerName } from '../api/credentials.mjs';
import { templateSetName } from '../generation/sheets.mjs';

export function renderHistory(container, jobs, busy, onSelect) {
  const ordered = [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  container.innerHTML = ordered.length ? ordered.map(job => `
 <button data-id="${escapeHtml(job.id)}" ${busy ? 'disabled' : ''}>
  ${escapeHtml(new Date(job.createdAt).toLocaleString())}
  &middot; ${providerName(job.provider)} &middot; ${templateSetName(job.templateSet)} &middot; ${escapeHtml(job.stage)}
 </button>
 `).join('') : '<p class="note">No references generated yet.</p>';
  container.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => {
      if (!busy) {
        onSelect(button.dataset.id);
      }
    });
  });
}
