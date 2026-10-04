# VN Art Storyforge

A lightweight, browser-only studio for turning character art into consistent visual novel expression portraits. Upload a character, approve a canonical reference, generate four emotion sheets, and download the individual transparent PNG cutouts.

[Open the studio](https://brandonetter.github.io/VN-art-storyforge/) · [API keys and saved data](docs/privacy.html) · [Code guide](docs/code-guide.md)

## Intended constraints

- **Static and lightweight.** Plain HTML, CSS, and native JavaScript modules. No framework, runtime dependencies, CDN scripts, analytics, application server, or database service.
- **Open a URL and use it.** The hosted studio runs directly in a modern desktop or mobile browser. Users do not install packages or run a server. GitHub Pages serves the same static files as any other HTTP/HTTPS host.
- **Bring your own provider key.** Choose OpenAI or OpenRouter in Setup. Generation requests go directly from the browser to that provider, with the key in the Authorization header. The app has no proxy, shared key, environment fallback, or login service.
- **Never save API keys.** Keys stay in the current tab's JavaScript memory and input field. The app does not write them to IndexedDB, localStorage, sessionStorage, cookies, history, URLs, logs, downloads, or the repository. Refreshing requires entering a key again.
- **Process images locally where possible.** Resizing, template compositing, cropping, previewing, and ZIP creation use the browser. Only generation and revision requests send the required images and prompts to the selected provider.
- **Keep saved work separate from credentials.** IndexedDB stores image blobs and an explicit allowlist of job metadata. Typed revision instructions, queued requests, loading timers, and provider error messages are not saved.

These are design constraints for future changes, not just deployment conveniences. Adding a backend, persistent credentials, external scripts, or a required installation would change the project's intended model.

## Use the studio

1. Open the [hosted studio](https://brandonetter.github.io/VN-art-storyforge/), expand **Settings / setup**, select a provider, and enter your own API key.
2. Upload PNG, JPEG, WebP, or AVIF character art, up to 15 MB. Choose **Fem** or **Masc** templates.
3. Generate the canonical reference. Review identity, clothing, and framing before confirming it.
4. Choose sheet quality and maximum resolution, then confirm to generate Sheets A–D sequentially. Keep the tab open while they generate and crop.
5. Download an original sheet, an individual cutout, or the complete ZIP.

Canonical generation uses medium quality and an opaque background. Emotion sheets request transparent backgrounds. The four sheets contain 32 panels; the ZIP contains 29 unique filenames because Neutral appears once, from Sheet A. The spare pose is `spare-slot.png`.

Sheet A's original Neutral cutout anchors the later sheets. The prepared template preview is the actual image sent to the provider and can be downloaded. Prepared templates are saved and reused on retries.

Visible loading indicators show preparation, request started, provider response, local processing, and saving, with elapsed time and cutout counts. A queued revision states that its request has not started. The browser confirms a connection when response headers arrive; it cannot report the provider's internal generation percentage while waiting.

## Revise a portrait

Choose **Revise** on the canonical reference before confirmation, or on any ready cutout. Describe the change and generate a candidate. The submitted text appears in gold beneath **REVISION** while queued, generating, and reviewing. Compare **Current** and **Revised**, then choose **Use revision** or **Discard**.

The browser scales the current image proportionally to fill a supported working canvas. It maps the returned edit back to the original PNG dimensions. Proportional resolution changes are supported; aspect-ratio changes beyond 2% are rejected to avoid distorted or clipped portraits. Placement still depends on the model, so review the result before accepting it.

Accepted cutout revisions replace that portrait in previews and downloads. Original sheets and the original Neutral anchors remain available. Revising again uses the accepted portrait.

Only one revision request can wait at a time. Revisions queue while the sheet pipeline is active and use the credentials available when execution starts. Closing the dialog does not cancel a running request. Reloading forgets queued requests and instructions, and never automatically repeats a paid revision. Generated candidates and accepted images remain in saved browser history.

## Keys, saved work, and provider access

**Clear keys** clears both providers' keys from the page. A request already running retains its in-memory credentials until it finishes; clearing keys does not cancel it.

Images and job progress belong to the current browser and site origin. After reloading, re-enter the matching provider key to resume interrupted work. Jobs do not sync across devices or between localhost and GitHub Pages. To remove saved jobs, clear the site's browser data after downloading anything you want to keep.

The selected provider receives the images, prompts, options, and credentials needed for generation. Its own data policies and account charges apply. The app does not control browser extensions, developer tools, or provider behavior; see the [privacy explanation](docs/privacy.html).

Live generation requires an account with access to the configured image model and supported size/quality settings. Provider endpoints and models are configured in `src/api/images.mjs`. Requests require the provider to allow the site's origin through CORS. If access fails, the studio reports it without routing requests through a server. Tests simulate providers and do not spend API credits.

## Run locally

Development scripts require Node.js 22 or later. There are no packages to install:

```sh
git clone https://github.com/brandonetter/VN-art-storyforge.git
cd VN-art-storyforge
npm start
```

Open **http://localhost:4177**. The preview server serves static files only and reads no API keys or environment configuration. Stop it with Ctrl+C. `npm run dev` runs the same server with Node's file watcher.

Opening `index.html` with `file://` is unsupported: native modules, asset fetches, and browser storage require an HTTP/HTTPS origin. Opening the hosted URL directly in a browser is fully supported.

## Validate and build

```sh
npm test
npm run build
```

Tests cover the generation flow, request milestones, revision geometry, queue behavior, downloads, storage boundaries, and credential privacy. They run locally without launching a browser or contacting a paid provider. Live rendering, provider account access, and CORS require a browser check.

The build copies public browser files into `dist/` and adds `.nojekyll`. It replaces only that generated folder. It excludes saved outputs, credentials, Git metadata, development scripts, tests, and dependencies. There is no transpilation or bundling requirement for the application.

## Deploy on GitHub Pages

The repository includes [`.github/workflows/pages.yml`](.github/workflows/pages.yml). Pushes to `main` automatically test, package, and deploy the studio. You can also run **Deploy VN Art Storyforge** manually from the repository's Actions tab.

In **Settings → Pages**, select **GitHub Actions** as the publishing source. Deployment uses GitHub's built-in workflow token and requires no OpenAI/OpenRouter secrets. The [GitHub Pages workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) explains the publishing configuration.

The project URL is **https://brandonetter.github.io/VN-art-storyforge/**. Relative module, stylesheet, and asset paths support this repository subpath.

For another static host, upload the **contents of `dist/`**, preserving the folder structure, and serve them over HTTPS. No application runtime or provider keys belong in the deployment.

## Project layout

```text
index.html              Static page shell
src/
  main.mjs              App controller
  activity.mjs          Transient operation progress
  api/                  In-memory credentials and direct provider requests
  generation/           Prompts, sheet definitions, and sequential pipeline
  revisions/            Targets, edit prompts, candidate review, and queue
  image-processing/     Browser Canvas resizing, cropping, and anchoring
  storage/              IndexedDB and the saved-field allowlist
  downloads/            PNG filenames and local ZIP creation
  ui/                   Setup, results, history, revisions, and loading states
styles/                 Dark paper and warm gold studio styles
assets/                 Canonical, grid, Fem, and Masc image references
docs/                   Privacy explanation and code guide
scripts/                Static preview and release packaging
tests/                  Dependency-free CLI checks
.github/workflows/      GitHub Pages deployment
```

Templates live in `assets/full/fem/1.png` through `4.png` and `assets/full/masc/1.png` through `4.png`. Each job keeps its chosen set. Older saved jobs without a set default to Fem. Local `outputs/` from earlier versions are ignored and are not imported into browser history or published.
