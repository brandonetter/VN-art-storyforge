# Code guide

Start with `src/main.mjs`. It connects the views, saved jobs, and generation pipeline without doing pixel processing or constructing API requests itself. Each source file starts with a short description of its responsibility.

## Folders

| Folder | Responsibility |
| --- | --- |
| `src/api/` | In-memory credentials and direct OpenAI/OpenRouter image requests. |
| `src/ui/` | Setup controls, result previews, history, and escaped HTML. |
| `src/generation/` | Emotion definitions, prompts, canonical confirmation, sequential sheets, and resume. |
| `src/revisions/` | Target validation, localized edit prompts, candidate generation, transactional acceptance, and a memory-only queue. |
| `src/image-processing/` | Canvas normalization, resizing, cropping, and Neutral anchoring. |
| `src/storage/` | The explicit saved-job schema and IndexedDB access. |
| `src/downloads/` | Emotion filenames and local ZIP creation. |
| `styles/` | Readable CSS, including mobile layouts and focus states. |
| `assets/` | Bundled canonical, grid, and numbered sheet references. |
| `scripts/` | Optional static preview and dependency-free release packaging. |
| `tests/` | Node CLI tests with simulated providers and pixel processing. |

## Generation flow

1. Setup returns a provider/key pair from the page's memory when an operation starts.
2. The pipeline validates the upload and saves a job with the provider name, images, settings, and progress.
3. Canonical generation returns to the UI for confirmation. Sheets cannot start before confirmation.
4. Each sheet is generated and cropped before the next begins. B, C, and D reuse Sheet A's Neutral crop.
5. Every checkpoint passes through the saved-field allowlist before reaching IndexedDB.
6. Reloading converts unfinished work to an interrupted state. Resume requires re-entering the matching provider key and reuses saved images.

## Audit the API-key boundary

Revision requests live only in `src/revisions/queue.mjs` until the pipeline is idle. The queue asks Setup for fresh credentials at execution, and `service.mjs` receives credentials and instructions as arguments. Neither enters the saved record. A hidden working canvas scales the effective image proportionally to fill the supported size. Geometry tracks the original output dimensions separately from the scaled edit bounds. Canvas maps those bounds to the returned resolution and resizes the result back to the original dimensions; it rejects aspect-ratio changes beyond 2%.

Pending candidates save only their target, image, and dimensions. Accept and discard save successfully before changing the live job. Accepted cutouts live in `sheet.revised`, while `sheet.raw`, original sheet images, and prepared anchors stay unchanged. `currentCutout()` selects the image used by previews and exports. Canonical revisions stop at the confirmation gate.

- `src/api/credentials.mjs`: the key session is a closure over an in-memory Map. It has no storage imports or storage calls.
- `src/ui/setup.mjs`: keys live in the input and that session. Clear keys forgets both providers. Leaving the page clears the session.
- `src/api/images.mjs`: the only outgoing key use is the Authorization header to a fixed provider URL. Requests omit cookies, disable caching, and reject redirects. Error text is redacted before display.
- `src/generation/pipeline.mjs`: credentials are passed as operation arguments and never attached to jobs.
- `src/storage/job-record.mjs`: storage is built field by field. Unknown fields and provider error messages are excluded at every checkpoint.
- `src/storage/jobs.mjs`: the only persistent writer calls `jobRecord()` before storing anything.
- `tests/studio.test.mjs`: checks missing keys, provider request headers, fresh sessions, Clear keys, and exclusion of unexpected credential fields from saved records.

Avoid spreading a complete job object into storage, adding persistent key preferences, or logging request headers. Error messages from providers are deliberately not part of saved history because they may echo sensitive data.

## Static release

`npm run build` replaces only the generated `dist/` folder with `index.html`, `src/`, `styles/`, `assets/`, and `docs/`. Saved `outputs/`, development scripts, tests, `.env` files, and dependencies are excluded. Upload the contents of `dist/` to a static host. Repository subpaths work because module and asset URLs are relative.

`npm test` runs CLI tests only. Canvas display and actual provider CORS behavior are left for manual browser testing. The optional preview script starts only when you explicitly run `npm start` or `npm run dev`.

This folder is the root of the dedicated `brandonetter/VN-art-storyforge` repository. `.github/workflows/pages.yml` tests, builds, and deploys `dist/` on pushes to `main`, using GitHub Pages with no provider-key secrets.
