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
  // Don't rmdir dist/ — a running `launch.bat` may have an http.server holding
  // it open, which would fail with EBUSY on Windows. Just overwrite the files
  // we write; stale files are harmless.
  console.log('[build] preparing dist/');
  await mkdir(DIST, { recursive: true });

  console.log('[build] bundling src/main.js with esbuild');
  const result = await build({
    entryPoints: [resolve(ROOT, 'src/main.js')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2020'],
    // Keep three.js external — it's loaded from CDN via the importmap in index.html
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

  // Replace <script type="module" src="src/main.js"></script> with inline bundle
  const scriptTag = '<script type="module" src="src/main.js"></script>';
  if (!html.includes(scriptTag)) {
    throw new Error(`Could not find script tag in index.html: ${scriptTag}`);
  }
  // </script> inside the bundle would break the outer </script> — escape it
  const safeBundle = bundle.replace(/<\/script>/gi, '<\\/script>');
  // IMPORTANT: pass the replacement as a FUNCTION, not a string.
  // String.prototype.replace treats `$&`, `$'`, `` $` ``, `$1`-`$99` in the
  // replacement string as references to the match. The minified bundle
  // routinely contains sequences like `$&` (esbuild-mangled identifiers
  // followed by `&`) which would expand to the matched `<script src=...>`
  // tag — injecting a literal script tag into the middle of the JS code
  // and producing a `SyntaxError: Unexpected token '<'`. Using a function
  // bypasses all of that.
  html = html.replace(scriptTag, () => `<script type="module">\n${safeBundle}\n</script>`);

  await writeFile(resolve(DIST, 'index.html'), html, 'utf8');
  console.log(`[build] wrote dist/index.html (${(html.length / 1024).toFixed(1)} KB total)`);

  // Copy static assets referenced by index.html
  for (const asset of ['styles', 'og-image.png']) {
    const src = resolve(ROOT, asset);
    if (existsSync(src)) {
      await cp(src, resolve(DIST, asset), { recursive: true });
      console.log(`[build] copied ${asset}`);
    }
  }

  console.log('[build] done. Open dist/index.html in a browser.');
}

main().catch((err) => {
  console.error('[build] FAILED:', err);
  process.exit(1);
});
