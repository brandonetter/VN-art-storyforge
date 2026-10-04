// Setup controls keep keys in an in-memory session, separate from jobs and browser storage.
// Clear removes both provider keys from the page; an already running request keeps its copy.
import { createKeySession, providerName } from '../api/credentials.mjs';

export function initializeSetup(drawer) {
  const provider = drawer.querySelector('#provider');
  const keyInput = drawer.querySelector('#api-key');
  const status = drawer.querySelector('#setup-status');
  const keyLabel = drawer.querySelector('#key-label');
  const showButton = drawer.querySelector('#show-key');
  const session = createKeySession();
  let selectedProvider = provider.value;
  function concealKey() {
    keyInput.type = 'password';
    showButton.textContent = 'Show';
    showButton.setAttribute('aria-pressed', 'false');
  }
  function updateStatus() {
    const name = providerName(provider.value);
    keyLabel.textContent = `${name} API key`;
    status.textContent = `${name} · ${keyInput.value.trim() ? 'Key entered (not saved)' : 'API key needed'}`;
  }
  function clearKeys() {
    session.clear();
    keyInput.value = '';
    concealKey();
    updateStatus();
  }
  provider.addEventListener('change', () => {
    session.set(selectedProvider, keyInput.value);
    selectedProvider = provider.value;
    keyInput.value = session.get(selectedProvider);
    concealKey();
    updateStatus();
  });
  keyInput.addEventListener('input', () => {
    session.set(provider.value, keyInput.value);
    updateStatus();
  });
  showButton.addEventListener('click', () => {
    const show = keyInput.type === 'password';
    keyInput.type = show ? 'text' : 'password';
    showButton.textContent = show ? 'Hide' : 'Show';
    showButton.setAttribute('aria-pressed', String(show));
  });
  drawer.querySelector('#clear-key').addEventListener('click', () => {
    clearKeys();
    keyInput.focus();
  });
  window.addEventListener('pagehide', clearKeys);
  updateStatus();
  return {
    auth(jobProvider = provider.value) {
      try {
        if (provider.value !== jobProvider) {
          throw Error(`Select ${providerName(jobProvider)} in Setup to continue this job.`);
        }
        session.set(provider.value, keyInput.value);
        return session.auth(jobProvider);
      } catch (error) {
        drawer.open = true;
        keyInput.focus();
        throw error;
      }
    }
  };
}
