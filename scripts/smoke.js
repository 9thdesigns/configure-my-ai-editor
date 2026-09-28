// Boots the packaged-or-not app headlessly against a scratch folder and
// captures its window: `npm run smoke` (under xvfb-run where there is no
// display). Exit status is Electron's; the PNG lands in the OS temp dir
// unless CMA_EDITOR_SMOKE names another path.

const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const electron = require('electron') // resolves to the binary path
const root = path.join(__dirname, '..')
const out = process.env.CMA_EDITOR_SMOKE || path.join(os.tmpdir(), 'configure-my-ai-editor-smoke.png')

// A small workspace with a few files, so the explorer and an editor draw.
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cma-editor-smoke-'))
fs.mkdirSync(path.join(workspace, 'src'))
fs.writeFileSync(path.join(workspace, 'README.md'), '# Smoke\n\nA folder the editor opened on its own.\n')
fs.writeFileSync(path.join(workspace, 'src', 'main.js'), 'export function hello (name) {\n  return `Hello, ${name}`\n}\n')

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'cma-editor-smoke-data-'))

// A saved layout for that folder — two groups side by side, a file in each —
// so the run also restores a layout, loads documents, mounts editors and
// pulls in a language grammar. The file name is src/workspaces.js's rule.
const crypto = require('node:crypto')
const key = crypto.createHash('sha1').update(path.resolve(workspace)).digest('hex').slice(0, 16)
fs.mkdirSync(path.join(userData, 'workspaces'), { recursive: true })
fs.writeFileSync(path.join(userData, 'workspaces', `${key}.json`), JSON.stringify({
  path: workspace,
  name: path.basename(workspace),
  settings: { codePanel: { visible: true, width: 420, session: null } },
  layout: {
    type: 'split',
    direction: 'row',
    sizes: [0.5, 0.5],
    children: [
      { type: 'group', tabs: [{ kind: 'file', path: path.join(workspace, 'README.md'), title: 'README.md' }], active: 0 },
      { type: 'group', tabs: [{ kind: 'file', path: path.join(workspace, 'src', 'main.js'), title: 'main.js' }], active: 0 },
    ],
  },
}))
const result = spawnSync(electron, ['--no-sandbox', root, workspace], {
  stdio: 'inherit',
  env: { ...process.env, CMA_EDITOR_SMOKE: out, CMA_EDITOR_USER_DATA: userData, ELECTRON_ENABLE_LOGGING: '1' },
  timeout: 90000,
})
if (result.error) { console.error(result.error); process.exit(1) }
console.log(`smoke: exit ${result.status}, screenshot ${fs.existsSync(out) ? out : 'MISSING'}`)
process.exit(result.status === 0 && fs.existsSync(out) ? 0 : 1)
