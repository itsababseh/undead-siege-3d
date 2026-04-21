// Build step: bundle src/main.js + all modules into a single inline <script>
// inside dist/index.html so the game is one file.
//
// Three.js stays external (loaded via the existing CDN importmap) so we don't
// bloat the HTML with ~600KB of engine code. Everything in src/ gets inlined.
//
// Run with: npm run build
//
// Output: dist/index.html  (plus dist/og-image.png, dist/styles/)

import { build } from 'esbuild';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = resolve(ROOT, 'dist');

async function main() {
  console.log('[build] preparing dist/');
  await mkdir(DIST, { recursive: true });

  console.log('[build] bundling src/main.js with esbuild');
  const result = await build({
    entryPoints: [resolve(ROOT, 'src/main.js')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2020'],
    external: ['three', 'three/addons/*'],
    write: false,
    sourcemap: false,
    minify: true,
    legalComments: 'none',
    logLevel: 'info',
  });

  const bundle = result.outputFiles[0].text;
  console.log(`[build] bundle size: ${(bundle.length / 1024).toFixed(1)} KB (minified)`);

  console.log('[build] inlining bundle into index.html');
  let html = await readFile(resolve(ROOT, 'index.html'), 'utf8');

  const scriptTag = '<script type="module" src="src/main.js"></script>';
  if (!html.includes(scriptTag)) {
    throw new Error(`Could not find script tag in index.html: ${scriptTag}`);
  }
  const safeBundle = bundle.replace(/<\/script>/gi, '<\\/script>');
  html = html.replace(scriptTag, () => `<script type="module">\n${safeBundle}\n</script>`);

  await writeFile(resolve(DIST, 'index.html'), html, 'utf8');
  console.log(`[build] wrote dist/index.html (${(html.length / 1024).toFixed(1)} KB total)`);

  // Copy static assets referenced by index.html or OG meta tags
  const assets = [
    'styles',
    'og-image.png',
    'UndeadSiege.png',
    'autogpt-logo-light.png',
    'autogpt-logo-dark.png',
  ];
  for (const asset of assets) {
    const src = resolve(ROOT, asset);
    if (existsSync(src)) {
      await cp(src, resolve(DIST, asset), { recursive: true });
      console.log(`[build] copied ${asset}`);
    } else {
      console.log(`[build] skipped (not found): ${asset}`);
    }
  }

  console.log('[build] done. Open dist/index.html in a browser.');
}

main().catch((err) => {
  console.error('[build] FAILED:', err);
  process.exit(1);
});
