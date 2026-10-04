// Models must accept image references and produce images through the image-edit endpoints used here.
import { validateAuth, providerName } from './credentials.mjs';

export const defaultModels = {
  openai: 'gpt-image-2.5-sunburst',
  openrouter: 'openai/gpt-image-2.5-sunburst'
};

export function compatibleModels(provider, data) {
  if (!Array.isArray(data?.data)) throw Error('The provider returned an invalid model list.');
  return data.data.filter(model => {
    if (typeof model.id !== 'string') return false;
    if (provider === 'openai') return /^(?:gpt-image-[\w.-]+|chatgpt-image-latest)$/i.test(model.id);
    const input = model.architecture?.input_modalities || [];
    const output = model.architecture?.output_modalities || [];
    return input.includes('image') && output.includes('image');
  }).map(model => ({ id: model.id, name: model.name || model.id }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listModels(auth, fetcher = fetch) {
  const { provider, key } = validateAuth(auth);
  const service = providerName(provider);
  const url = provider === 'openai' ? 'https://api.openai.com/v1/models' : 'https://openrouter.ai/api/v1/models';
  let response;
  try {
    response = await fetcher(url, { headers: { Authorization: `Bearer ${key}` }, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000) });
  } catch {
    throw Error(`Could not load ${service} models. Check your connection and browser CORS access.`);
  }
  if (!response.ok) throw Error(`${service} could not load models (HTTP ${response.status}). Check your key and access.`);
  return compatibleModels(provider, await response.json());
}
