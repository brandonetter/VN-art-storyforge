// Prompt overrides are local browser preferences, separate from jobs and credentials.
import { defaultPrompts } from '../generation/prompts.mjs';
import { defaultRevisionPrompts } from '../revisions/prompts.mjs';
import { definitions } from '../generation/sheets.mjs';

export const promptDefaults = {
  ...defaultPrompts,
  ...Object.fromEntries(definitions.map(sheet => [`direction${sheet.key.toUpperCase()}`, sheet.direction])),
  ...defaultRevisionPrompts
};
const storageKey = 'storyforge-prompt-templates-v1';

export function createPromptSettings(container, store) {
  let saved = {};
  try {
    store ||= globalThis.localStorage;
    const value = JSON.parse(store.getItem(storageKey) || '{}');
    if (value && typeof value === 'object' && !Array.isArray(value)) saved = value;
  } catch { /* Storage may be disabled, or an older preference may be corrupt. */ }
  const fields = [...container.querySelectorAll('textarea[data-prompt]')];
  for (const field of fields) {
    const name = field.dataset.prompt;
    field.value = typeof saved[name] === 'string' ? saved[name] : promptDefaults[name];
  }
  function snapshot() {
    return Object.fromEntries(fields.map(field => [field.dataset.prompt, field.value]));
  }
  function persist() {
    const overrides = Object.fromEntries(Object.entries(snapshot()).filter(([name, value]) => value !== promptDefaults[name]));
    try {
      if (Object.keys(overrides).length) store.setItem(storageKey, JSON.stringify(overrides));
      else store.removeItem(storageKey);
      container.querySelector('#prompt-status').textContent = 'Prompt changes saved in this browser.';
    } catch {
      container.querySelector('#prompt-status').textContent = 'Browser storage unavailable; prompt changes last only until refresh.';
    }
  }
  for (const field of fields) field.addEventListener('input', persist);
  container.querySelector('#reset-prompts').addEventListener('click', () => {
    for (const field of fields) field.value = promptDefaults[field.dataset.prompt];
    persist();
  });
  return { snapshot };
}
