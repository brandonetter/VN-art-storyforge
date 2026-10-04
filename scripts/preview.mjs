// Development-only static preview. The deployed app has no server.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.png': 'image/png', '.css': 'text/css' };

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + (path.endsWith('/') ? path + 'index.html' : path));
    if (!file.startsWith(resolve(root) + sep) || !types[extname(file)]) {
      res.writeHead(404);
      res.end();
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(4177, '127.0.0.1', () => console.log('Static preview: http://localhost:4177'));
