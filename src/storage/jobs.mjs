// Store image blobs and allowlisted job metadata in IndexedDB, never API keys.
// See job-record.mjs for the complete saved schema; this is the app's only storage writer.
import { jobRecord } from './job-record.mjs';

export async function openStorage() {
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open('emotion-asset-studio', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('jobs', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(Error('Browser storage is unavailable. Enable site storage to save jobs.'));
    request.onblocked = () => reject(Error('Close other studio tabs to enable browser storage.'));
  });
  function transaction(mode, operation) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('jobs', mode);
      const request = operation(transaction.objectStore('jobs'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = transaction.onabort = () => {
        reject(Error('Could not save browser data. Check available storage and site permissions.'));
      };
    });
  }
  return {
    save: job => transaction('readwrite', store => store.put(jobRecord(job))),
    list: () => transaction('readonly', store => store.getAll())
  };
}
