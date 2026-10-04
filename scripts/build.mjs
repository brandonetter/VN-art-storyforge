// Package only public browser files into dist/ for static hosting; no secrets or local outputs.
// This dependency-free script replaces only the generated dist/ folder on each build.
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const destination = new URL('dist/', root);
const projectPath = resolve(fileURLToPath(root));
const destinationPath = resolve(fileURLToPath(destination));

if (destinationPath !== projectPath + sep + 'dist') {
  throw Error('Release folder must be inside this project.');
}

await rm(destinationPath, { recursive: true, force: true });

await mkdir(destinationPath, { recursive: true });

for (const name of ['index.html', 'src', 'styles', 'assets', 'docs']) {
  await cp(new URL(name, root), new URL(name, destination), { recursive: true });
}

await writeFile(new URL('.nojekyll', destination), '');

console.log('Static release files are ready in dist/. No API keys or saved jobs are included.');
