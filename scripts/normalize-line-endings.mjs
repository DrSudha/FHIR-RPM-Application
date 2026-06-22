import { readdir, readFile, stat, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'out',
  'build',
  'coverage',
  '.vercel',
]);

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.md',
  '.yml',
  '.yaml',
  '.html',
  '.svg',
  '.gitattributes',
  '.editorconfig',
  '.env.example',
]);

async function walk(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, files);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    const base = path.basename(entry.name);
    if (TEXT_EXTENSIONS.has(ext) || TEXT_EXTENSIONS.has(base)) {
      files.push(fullPath);
    }
  }
  return files;
}

function toLf(content) {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

const files = await walk(ROOT);
let changed = 0;

for (const file of files) {
  const info = await stat(file);
  if (!info.isFile()) continue;

  const original = await readFile(file, 'utf8');
  let normalized = toLf(original);
  if (!normalized.endsWith('\n')) {
    normalized += '\n';
  }

  if (normalized !== original) {
    await writeFile(file, normalized, 'utf8');
    changed += 1;
    console.log(`normalized: ${path.relative(ROOT, file)}`);
  }
}

console.log(`Done. ${changed} file(s) updated to LF.`);
