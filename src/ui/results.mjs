// Render canonical references, sheets, and downloads. This view never receives an API key.
import { escapeHtml as escape, createImageUrls } from './html.mjs';
import { providerName } from '../api/credentials.mjs';
import { slug } from '../downloads/zip.mjs';
import { templateSetName } from '../generation/sheets.mjs';
import { currentCutout } from '../revisions/targets.mjs';

export function createResultsView(container, { onConfirm, onResume, onDownload, onRevise, onReview }) {
  const urls = createImageUrls();
  let displayedJobId;
  function image(blob, label, filename) {
    const url = urls.get(blob);
    const canonicalClass = filename === 'canonical.png' ? ' canonical' : '';
    return `
  <a href="${url}" download="${escape(filename)}">
  <img class="sheet${canonicalClass}" src="${url}" alt="${escape(label)}">
  </a>
 `;
  }
  function tiles(sheet) {
    return '<div class="tiles">' + sheet.raw.map((blob, index) => {
      if (!blob) {
        return '';
      }
      const label = sheet.labels[index];
      const url = urls.get(currentCutout(sheet, index));
      return `
  <div class="tile">
   <img src="${url}" alt="${escape(label)} cutout">
   <div>
   <span>${escape(label)}</span>
   ${sheet.revised?.[index] ? '<small class="revision-label">Revised</small>' : ''}
   <button class="secondary revise-cutout" data-sheet="${sheet.key}" data-index="${index}" type="button">Revise</button>
   <a href="${url}" download="${slug(label)}.png">PNG &darr;</a>
   </div>
  </div>
  `;
    }).join('') + '</div>';
  }
  function anchorPreview(sheet, neutral) {
    if (!sheet.anchoredTemplate || !neutral) return '';
    const letter = sheet.key.toUpperCase();
    return `
      <div class="anchor-preview">
        <div class="eyebrow">Neutral anchor prepared</div>
        <p class="hint">Sheet A's Neutral crop replaces the top-left cell before generating Sheet ${escape(letter)}.</p>
        <div class="anchor-preview-images">
          <figure class="anchor-source">
            <img src="${urls.get(neutral)}" alt="Neutral crop from Sheet A">
            <figcaption>Neutral from Sheet A</figcaption>
          </figure>
          <span class="anchor-arrow" aria-hidden="true">&rarr;</span>
          <figure class="anchor-template">
            <a href="${urls.get(sheet.anchoredTemplate)}" download="sheet-${sheet.key}-anchored-template.png">
              <img src="${urls.get(sheet.anchoredTemplate)}" alt="Sheet ${escape(letter)} template with Sheet A's Neutral crop in the top-left cell">
            </a>
            <figcaption>Prepared Sheet ${escape(letter)} template &middot; PNG &darr;</figcaption>
          </figure>
        </div>
      </div>
    `;
  }

  function sheetOutput(sheet, neutral, activity) {
    const letter = sheet.key.toUpperCase();
    const active = activity?.sheetKey === sheet.key;
    return `
  <div class="section-head">
  <div><h3>Sheet ${escape(letter)}</h3><p class="note">${escape(sheet.title)}</p></div>
  <small class="sheet-stage">${active ? '<span class="activity-spinner" aria-hidden="true"></span>' : ''}${escape(sheet.stage)}</small>
  </div>
  ${anchorPreview(sheet, neutral)}
  ${sheet.sheet ? '<p class="hint">Original generated sheet</p>' + image(sheet.sheet, `Sheet ${letter}`, `sheet-${sheet.key}.png`) : `<p class="note">${active ? 'This sheet is processing. Progress appears above.' : 'Waiting for its turn.'}</p>`}
  ${sheet.raw.some(Boolean) ? `
  <div class="section-head"><h3>Cutouts</h3><small>Original generated resolution</small></div>
  ${tiles(sheet)}
  ` : ''}
 `;
  }
  return {
    render(job, busy, revisionOccupied = false) {
      if (displayedJobId !== job.id) {
        urls.clear();
        displayedJobId = job.id;
      }
      container.innerHTML = `
  <div class="status">
   <div><div class="eyebrow">Production output</div><h2>Character expressions</h2></div>
   <div class="badge">${escape(job.stage)}</div>
  </div>
  <p class="note">${providerName(job.provider)} &middot; ${templateSetName(job.templateSet)} &middot; ${escape(job.settings.quality)} &middot; up to ${escape(job.settings.resolution)}</p>
  ${job.error ? `<p class="error" role="alert">${escape(job.error)}</p>` : ''}
  ${job.pendingRevision ? '<button class="secondary" id="review-revision">Review saved revision</button>' : ''}
  ${job.stage === 'Complete' ? `
   <button class="primary" id="download-all">Download all emotions as ZIP</button>
   <p class="hint">Neutral included once from Sheet A.</p>
  ` : ''}
  ${job.files.canonical ? `
   <div class="section-head"><h3>Canonical reference</h3><small>Medium quality &middot; Opaque</small>
   ${job.stage === 'Awaiting canonical confirmation' && !job.canonicalConfirmed ? '<button class="secondary" id="revise-canonical">Revise</button>' : ''}</div>
   ${image(job.files.canonical, 'Canonical character reference', 'canonical.png')}
  ` : ''}
  ${job.stage === 'Awaiting canonical confirmation' ? `
   <p>Review the identity, clothing, and framing before confirming.</p>
   <button class="primary" id="confirm">Confirm reference and generate all 4 sheets</button>
  ` : ''}
  ${['Failed', 'Interrupted'].includes(job.stage) ? '<button class="primary" id="retry">Resume pipeline</button>' : ''}
  ${job.sheets.map(sheet => sheetOutput(sheet, job.sheets[0].raw[0], job.activity)).join('')}
  `;
      for (const [selector, callback] of [['#confirm', onConfirm], ['#retry', onResume]]) {
        const button = container.querySelector(selector);
        if (button) {
          button.disabled = busy || Boolean(job.pendingRevision) || revisionOccupied;
          button.addEventListener('click', () => callback(job));
        }
      }
      const canonical = container.querySelector('#revise-canonical');
      if (canonical) {
        canonical.disabled = busy || revisionOccupied || Boolean(job.pendingRevision);
        canonical.addEventListener('click', () => onRevise(job, { kind: 'canonical' }));
      }
      container.querySelectorAll('.revise-cutout').forEach(button => {
        button.disabled = revisionOccupied || Boolean(job.pendingRevision);
        button.addEventListener('click', () => onRevise(job, { kind: 'cutout', sheetKey: button.dataset.sheet, index: Number(button.dataset.index) }));
      });
      const review = container.querySelector('#review-revision');
      if (review) {
        review.disabled = busy;
        review.addEventListener('click', () => onReview(job));
      }
      const download = container.querySelector('#download-all');
      if (download) {
        download.addEventListener('click', async () => {
          download.disabled = true;
          try {
            await onDownload(job);
          } finally {
            download.disabled = false;
          }
        });
      }
    }
  };
}
