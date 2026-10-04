// Escape displayed text before inserting HTML; create temporary URLs only for local image blobs.
export function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, character => entities[character]);
}

export function createImageUrls() {
  const urls = new Map();
  return {
    get(blob) {
      if (!blob) {
        return '';
      }
      if (!urls.has(blob)) {
        urls.set(blob, URL.createObjectURL(blob));
      }
      return urls.get(blob);
    },
    clear() {
      for (const url of urls.values())
        URL.revokeObjectURL(url);
      urls.clear();
    }
  };
}
