// Setup controls keep keys in an in-memory session, separate from jobs and browser storage.
import { createKeySession, providerName } from '../api/credentials.mjs';
import { defaultModels, listModels } from '../api/models.mjs';

export function initializeSetup(drawer) {
  const provider = drawer.querySelector('#provider');
  const keyInput = drawer.querySelector('#api-key');
  const status = drawer.querySelector('#setup-status');
  const modelInput = drawer.querySelector('#model');
  const modelStatus = drawer.querySelector('#model-status');
  const loadButton = drawer.querySelector('#load-models');
  const keyLabel = drawer.querySelector('#key-label');
  const showButton = drawer.querySelector('#show-key');
  const session = createKeySession();
  const choices = new Map();
  const selectedModels = { ...defaultModels };
  let selectedProvider = provider.value;
  let loadId = 0;
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
  function renderModels() {
    const current = selectedModels[provider.value];
    const models = choices.get(provider.value) || [];
    const all = models.some(item => item.id === current) ? models : [{ id: current, name: `${current} (${choices.has(provider.value) ? 'not in loaded list' : 'current default'})` }, ...models];
    modelInput.replaceChildren(...all.map(item => new Option(item.name, item.id)));
    modelInput.value = current;
    modelStatus.textContent = choices.has(provider.value)
      ? `${models.length} image-capable models found. Availability and image-edit support depend on your provider account.`
      : 'Enter a key and load image-capable models for this provider. The default model is selected until then.';
  }
  function clearKeys() {
    ++loadId;
    loadButton.disabled = false;
    session.clear();
    keyInput.value = '';
    choices.clear();
    concealKey();
    updateStatus();
    renderModels();
  }
  provider.addEventListener('change', () => {
    ++loadId;
    loadButton.disabled = false;
    session.set(selectedProvider, keyInput.value);
    selectedProvider = provider.value;
    keyInput.value = session.get(selectedProvider);
    concealKey();
    updateStatus();
    renderModels();
  });
  keyInput.addEventListener('input', () => {
    ++loadId;
    loadButton.disabled = false;
    session.set(provider.value, keyInput.value);
    choices.delete(provider.value);
    updateStatus();
    renderModels();
  });
  modelInput.addEventListener('change', () => { selectedModels[provider.value] = modelInput.value; });
  loadButton.addEventListener('click', async () => {
    const id = ++loadId;
    loadButton.disabled = true;
    modelStatus.textContent = 'Loading models from the provider…';
    try {
      const auth = session.auth(provider.value);
      const models = await listModels(auth);
      if (id !== loadId) return;
      choices.set(auth.provider, models);
      renderModels();
      if (!models.length) modelStatus.textContent = 'No compatible image-edit models found. Check provider access or use the current model.';
    } catch (error) {
      if (id === loadId) modelStatus.textContent = error.message;
    } finally {
      if (id === loadId) loadButton.disabled = false;
    }
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
  const tabs = [...drawer.querySelectorAll('[role="tab"]')];
  function activate(tab) {
    for (const item of tabs) {
      const active = item === tab;
      item.setAttribute('aria-selected', String(active));
      drawer.querySelector(`#${item.getAttribute('aria-controls')}`).hidden = !active;
    }
  }
  for (const tab of tabs) tab.addEventListener('click', () => activate(tab));
  window.addEventListener('pagehide', clearKeys);
  updateStatus();
  renderModels();
  return {
    setModel(jobProvider, model) {
      if (!model) return;
      selectedModels[jobProvider] = model;
      if (provider.value === jobProvider) renderModels();
    },
    auth(jobProvider = provider.value) {
      try {
        if (provider.value !== jobProvider) throw Error(`Select ${providerName(jobProvider)} in Setup to continue this job.`);
        session.set(provider.value, keyInput.value);
        return { ...session.auth(jobProvider), model: selectedModels[jobProvider] };
      } catch (error) {
        drawer.open = true;
        activate(tabs[0]);
        keyInput.focus();
        throw error;
      }
    }
  };
}
