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

  if (fs.existsSync(path.join(__dirname, 'test', 'm0Tests.ts'))) {
    await esbuild.build({
      entryPoints: ['./test/m0Tests.ts'],
      bundle: true,
      outfile: './dist/m0Tests.js',
      external: ['vscode'],
      format: 'cjs',
      platform: 'node',
      sourcemap: true,
      minify: false
    });
  }

  if (fs.existsSync(path.join(__dirname, 'test', 'm1Tests.ts'))) {
    await esbuild.build({
      entryPoints: ['./test/m1Tests.ts'],
      bundle: true,
      outfile: './dist/m1Tests.js',
      external: ['vscode'],
      format: 'cjs',
      platform: 'node',
      sourcemap: true,
      minify: false
    });
  }

  if (fs.existsSync(path.join(__dirname, 'test', 'm2Tests.ts'))) {
    await esbuild.build({
      entryPoints: ['./test/m2Tests.ts'],
      bundle: true,
      outfile: './dist/m2Tests.js',
      external: ['vscode'],
      format: 'cjs',
      platform: 'node',
      sourcemap: true,
      minify: false
    });
  }

  if (fs.existsSync(path.join(__dirname, 'test', 'm3Tests.ts'))) {
    await esbuild.build({
      entryPoints: ['./test/m3Tests.ts'],
      bundle: true,
      outfile: './dist/m3Tests.js',
      external: ['vscode'],
      format: 'cjs',
      platform: 'node',
      sourcemap: true,
      minify: false
    });
  }

  if (fs.existsSync(path.join(__dirname, 'test', 'm4Tests.ts'))) {
    await esbuild.build({
      entryPoints: ['./test/m4Tests.ts'],
      bundle: true,
      outfile: './dist/m4Tests.js',
      external: ['vscode'],
      format: 'cjs',
      platform: 'node',
      sourcemap: true,
      minify: false
    });
  }

  if (fs.existsSync(path.join(__dirname, 'test', 'm5Tests.ts'))) {
    await esbuild.build({
      entryPoints: ['./test/m5Tests.ts'],
      bundle: true,
      outfile: './dist/m5Tests.js',
      external: ['vscode'],
      format: 'cjs',
      platform: 'node',
      sourcemap: true,
      minify: false
    });
  }

  if (fs.existsSync(path.join(__dirname, 'test', 'failureMatrixTests.ts'))) {
    await esbuild.build({
      entryPoints: ['./test/failureMatrixTests.ts'],
      bundle: true,
      outfile: './dist/failureMatrixTests.js',
      external: ['vscode'],
      format: 'cjs',
      platform: 'node',
      sourcemap: true,
      minify: false
    });
  }

  if (fs.existsSync(path.join(__dirname, 'test', 'subtaskRouterTests.ts'))) {
    await esbuild.build({
      entryPoints: ['./test/subtaskRouterTests.ts'],
      bundle: true,
      outfile: './dist/subtaskRouterTests.js',
      external: ['vscode'],
      format: 'cjs',
      platform: 'node',
      sourcemap: true,
      minify: false
    });
  }

  if (fs.existsSync(path.join(__dirname, 'test', 'benchmarks', 'runBenchmarks.ts'))) {
    await esbuild.build({
      entryPoints: ['./test/benchmarks/runBenchmarks.ts'],
      bundle: true,
      outfile: './dist/benchmarks.js',
      external: ['vscode'],
      format: 'cjs',
      platform: 'node',
      sourcemap: true,
      minify: false
    });
  }

  if (fs.existsSync(path.join(__dirname, 'test', 'pilots', 'selfHostPilot.ts'))) {
    await esbuild.build({
      entryPoints: ['./test/pilots/selfHostPilot.ts'],
      bundle: true,
      outfile: './dist/selfHostPilot.js',
      external: ['vscode'],
      format: 'cjs',
      platform: 'node',
      sourcemap: true,
      minify: false
    });
  }

  if (fs.existsSync(path.join(__dirname, 'test', 'pilots', 'wasteLessPilot.ts'))) {
    await esbuild.build({
      entryPoints: ['./test/pilots/wasteLessPilot.ts'],
      bundle: true,
      outfile: './dist/wasteLessPilot.js',
      external: ['vscode'],
      format: 'cjs',
      platform: 'node',
      sourcemap: true,
      minify: false
    });
  }

  if (fs.existsSync(path.join(__dirname, 'src', 'orchestrator', 'cli', 'orchestratorCli.ts'))) {
    await esbuild.build({
      entryPoints: ['./src/orchestrator/cli/orchestratorCli.ts'],
      bundle: true,
      outfile: './dist/cli.js',
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
