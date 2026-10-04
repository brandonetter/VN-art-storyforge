// Create a local ZIP of emotion PNGs, including Neutral only once from Sheet A.
// PNGs are already compressed, so entries use ZIP's standard uncompressed storage format.
import { currentCutout } from '../revisions/targets.mjs';

export const slug = label => label.toLowerCase().replaceAll(' ', '-');

export async function emotionFiles(job) {
  if (job.stage !== 'Complete') {
    throw Error('Finish the pipeline before downloading all emotions.');
  }
  const seen = new Set();
  const files = [];
  for (const sheet of job.sheets) {
    for (let index = 0; index < sheet.labels.length; index++) {
      const name = `${slug(sheet.labels[index])}.png`;
      if (seen.has(name)) {
        continue;
      }
      if (!sheet.raw[index]) {
        throw Error('Missing cutouts. Resume the pipeline first.');
      }
      files.push({ name, data: new Uint8Array(await currentCutout(sheet, index).arrayBuffer()) });
      seen.add(name);
    }
  }
  return files;
}

function checksum(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function fileHeader(filename, data, crc) {
  const bytes = new Uint8Array(30);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, 0x04034b50, true);
  header.setUint16(4, 20, true);
  header.setUint16(12, 33, true);
  header.setUint32(14, crc, true);
  header.setUint32(18, data.length, true);
  header.setUint32(22, data.length, true);
  header.setUint16(26, filename.length, true);
  return bytes;
}

function directoryEntry(filename, data, crc, offset) {
  const bytes = new Uint8Array(46);
  const entry = new DataView(bytes.buffer);
  entry.setUint32(0, 0x02014b50, true);
  entry.setUint16(4, 20, true);
  entry.setUint16(6, 20, true);
  entry.setUint16(14, 33, true);
  entry.setUint32(16, crc, true);
  entry.setUint32(20, data.length, true);
  entry.setUint32(24, data.length, true);
  entry.setUint16(28, filename.length, true);
  entry.setUint32(42, offset, true);
  return bytes;
}

export function zipFiles(files) {
  const entries = [];
  const directory = [];
  let offset = 0;
  for (const { name, data } of files) {
    const filename = new TextEncoder().encode(name);
    const crc = checksum(data);
    const header = fileHeader(filename, data, crc);
    entries.push(header, filename, data);
    directory.push(directoryEntry(filename, data, crc, offset), filename);
    offset += header.length + filename.length + data.length;
  }
  const end = new Uint8Array(22);
  const footer = new DataView(end.buffer);
  const directoryLength = directory.reduce((sum, item) => sum + item.length, 0);
  footer.setUint32(0, 0x06054b50, true);
  footer.setUint16(8, files.length, true);
  footer.setUint16(10, files.length, true);
  footer.setUint32(12, directoryLength, true);
  footer.setUint32(16, offset, true);
  return new Blob([...entries, ...directory, end], { type: 'application/zip' });
}
