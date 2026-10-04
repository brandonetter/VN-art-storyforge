// Send image requests directly to a fixed provider URL with an in-memory Authorization header.
// API keys are never included in request URLs, image payloads, storage, or logs.
import { validateAuth, providerName } from './credentials.mjs';

const endpoints = {
  openai: 'https://api.openai.com/v1/images/edits',
  openrouter: 'https://openrouter.ai/api/v1/images'
};

export async function dataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
}

function openaiBody(prompt, images, options) {
  const body = new FormData();
  const fields = { model: 'gpt-image-2.5-sunburst', prompt, output_format: 'png', ...options };
  for (const [name, value] of Object.entries(fields)) {
    if (name !== 'aspect_ratio') {
      body.append(name, value);
    }
  }
  images.forEach((image, index) => {
    body.append('image[]', image, `reference-${index + 1}.png`);
  });
  return body;
}

async function openrouterBody(prompt, images, options) {
  const references = await Promise.all(images.map(async (image) => ({
    type: 'image_url',
    image_url: { url: await dataUrl(image) }
  })));
  return JSON.stringify({
    model: 'openai/gpt-image-2.5-sunburst',
    prompt,
    output_format: 'png',
    ...options,
    input_references: references
  });
}

async function providerError(response, service, key) {
  let detail = await response.text();
  try {
    const json = JSON.parse(detail);
    detail = json.error?.message || json.error_message || detail;
  } catch {
    // Some provider errors are plain text instead of JSON.
  }
  const safeDetail = String(detail).replaceAll(key, '[redacted]').slice(0, 500);
  return Error(`${service} ${response.status}: ${safeDetail}`);
}

export async function requestImage(prompt, images, options, credentials, fetcher = fetch, onProgress = () => {}) {
  const { provider, key } = validateAuth(credentials);
  const service = providerName(provider);
  const headers = { Authorization: `Bearer ${key}` };
  const direct = provider === 'openai';
  const body = direct
    ? openaiBody(prompt, images, options)
    : await openrouterBody(prompt, images, options);
  if (!direct) {
    headers['Content-Type'] = 'application/json';
  }
  let response;
  try {
    const pending = fetcher(endpoints[provider], {
      method: 'POST',
      headers,
      body,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(240000)
    });
    // Fetch has started; a connection is confirmed only when response headers arrive.
    onProgress('requesting');
    response = await pending;
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw Error(`${service} request timed out. Check provider usage before resuming; the request may have completed.`);
    }
    throw Error(`Could not reach ${service}. Check your connection and whether the provider allows requests from this browser (CORS). No proxy is used.`);
  }
  if (!response.ok) {
    throw await providerError(response, service, key);
  }
  onProgress('receiving');
  const json = await response.json();
  const encoded = json.data?.[0]?.b64_json;
  if (!encoded) {
    throw Error(`${service} returned no image data.`);
  }
  const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
  onProgress('processing');
  return new Blob([bytes], { type: json.data[0].media_type || 'image/png' });
}
