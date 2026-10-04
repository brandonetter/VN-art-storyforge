// API keys live only in this page's memory. This module never reads or writes storage.
// Jobs receive a provider name; only a running API request receives its key.
export function providerName(provider) {
  return provider === 'openai' ? 'OpenAI' : 'OpenRouter';
}

export function validateAuth({ provider, key }) {
  if (!['openrouter', 'openai'].includes(provider)) {
    throw Error('Choose OpenRouter or OpenAI in Setup.');
  }
  key = String(key || '').trim();
  if (!key) {
    throw Error('Enter your API key in Setup before generating.');
  }
  if (key.length > 512 || /\s/.test(key)) {
    throw Error('Enter a valid API key without spaces.');
  }
  return { provider, key };
}

export function createKeySession() {
  const keys = new Map();
  return {
    set(provider, key) {
      if (key) {
        keys.set(provider, key);
      }
      else {
        keys.delete(provider);
      }
    },
    get(provider) {
      return keys.get(provider) || '';
    },
    clear() {
      keys.clear();
    },
    auth(provider) {
      return validateAuth({ provider, key: keys.get(provider) });
    }
  };
}
