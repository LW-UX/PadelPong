import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root = new URL('../', import.meta.url);
const forbidden = String.fromCharCode(97, 114, 99, 97, 100, 101);
const ignoredDirectories = new Set(['.git', 'node_modules']);
const binaryExtensions = new Set(['.ico', '.mp3', '.ttf']);
const findings = [];

async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const target = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    const displayPath = relative(root.pathname, target.pathname);
    if (entry.name.toLowerCase().includes(forbidden)) findings.push(displayPath);
    if (entry.isDirectory()) await inspect(target);
    else if (!binaryExtensions.has(extname(entry.name).toLowerCase())) {
      const source = await readFile(target, 'utf8');
      if (source.toLowerCase().includes(forbidden)) findings.push(displayPath);
    }
  }
}

await inspect(root);
if (findings.length) {
  console.error(`Veraltete technische Bezeichnung gefunden:\n${[...new Set(findings)].join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('OK: Alle technischen Bezeichnungen verwenden Pong.');
}
