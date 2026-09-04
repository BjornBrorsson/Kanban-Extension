const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyAssets() {
  const webviewSrc = path.join(__dirname, 'src', 'webview');
  const webviewDest = path.join(__dirname, 'dist', 'webview');
  if (fs.existsSync(webviewSrc)) {
    copyDir(webviewSrc, webviewDest);
  }

  const mediaSrc = path.join(__dirname, 'media');
  const mediaDest = path.join(__dirname, 'dist', 'media');
  if (fs.existsSync(mediaSrc)) {
    copyDir(mediaSrc, mediaDest);
  }
}

async function run() {
  const context = await esbuild.context({
    entryPoints: ['./src/extension.ts'],
    bundle: true,
    outfile: './dist/extension.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    sourcemap: true,
    minify: false,
    plugins: [
      {
        name: 'copy-assets-plugin',
        setup(build) {
          build.onEnd(() => {
            copyAssets();
            console.log('[esbuild] Build complete and assets copied.');
          });
        }
      }
    ]
  });

  if (fs.existsSync(path.join(__dirname, 'test', 'runParserTests.ts'))) {
    await esbuild.build({
      entryPoints: ['./test/runParserTests.ts'],
      bundle: true,
      outfile: './dist/test.js',
      external: ['vscode'],
      format: 'cjs',
      platform: 'node',
      sourcemap: true,
      minify: false
    });
  }

  if (isWatch) {
    await context.watch();
    console.log('[esbuild] Watching for changes...');
  } else {
    await context.rebuild();
    await context.dispose();
  }
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
