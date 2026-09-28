// Parse-checks every JavaScript file the app ships or runs — the desktop
// app's `npm run check`, generalised so a new file cannot be forgotten. The
// renderer's sources are ES modules and are checked by bundling them
// (scripts/build.js); this covers the CommonJS side.

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const dirs = ['src', 'src/lib', 'build', 'scripts', 'test']
let count = 0

for (const dir of dirs) {
  const full = path.join(root, dir)
  if (!fs.existsSync(full)) continue
  for (const name of fs.readdirSync(full)) {
    if (!name.endsWith('.js')) continue
    const file = path.join(full, name)
    if (!fs.statSync(file).isFile()) continue
    execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' })
    count++
  }
}

const bundle = path.join(root, 'renderer', 'dist', 'app.js')
if (!fs.existsSync(bundle)) {
  console.error('renderer/dist/app.js is missing — run `npm run build` first')
  process.exit(1)
}

console.log(`parsed ${count} files; renderer bundle present`)
