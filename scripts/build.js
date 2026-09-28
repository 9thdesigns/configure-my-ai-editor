// Bundles the renderer with esbuild: renderer/src/app.js (and everything it
// imports — CodeMirror, xterm, the shared src/lib modules, the stylesheet)
// into renderer/dist/. One dependency, one command, no framework.
//
//   node scripts/build.js          build once
//   node scripts/build.js --watch  rebuild on change

const path = require('node:path')
const esbuild = require('esbuild')

const root = path.join(__dirname, '..')
const watch = process.argv.includes('--watch')

const options = {
  entryPoints: [path.join(root, 'renderer', 'src', 'app.js')],
  outdir: path.join(root, 'renderer', 'dist'),
  bundle: true,
  format: 'esm',
  // @codemirror/language-data loads each language on demand with a dynamic
  // import; splitting keeps those as separate chunks so the first paint
  // does not pay for a hundred grammars.
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  sourcemap: true,
  minify: false,
  // Electron 44's Chromium.
  target: ['chrome134'],
  platform: 'browser',
  loader: { '.woff': 'file', '.woff2': 'file', '.ttf': 'file' },
  logLevel: 'info',
  legalComments: 'none',
}

async function main () {
  if (watch) {
    const ctx = await esbuild.context(options)
    await ctx.watch()
    console.log('watching renderer/src…')
    return
  }
  await esbuild.build(options)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
