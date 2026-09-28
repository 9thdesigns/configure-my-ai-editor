// What git says about the open folder, for the status bar and the GitHub
// section. Read-only — the editor never commits or pushes for you; the
// terminal and the Code session are where that happens. git is invoked with
// an argument array, never a shell string.

const { ipcMain } = require('electron')
const { execFile } = require('node:child_process')
const { parseRemote, parseStatus } = require('./lib/git-remote')

function git (args, cwd, { timeout = 8000 } = {}) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, timeout, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
      resolve(error ? null : String(stdout))
    })
  })
}

async function status (cwd) {
  if (!cwd) return { repo: false }
  const top = await git(['rev-parse', '--show-toplevel'], cwd)
  if (top === null) return { repo: false, gitAvailable: await git(['--version'], cwd) !== null }
  const root = top.trim()
  const [porcelain, remote] = await Promise.all([
    git(['status', '--porcelain=v2', '--branch'], root),
    git(['remote', 'get-url', 'origin'], root),
  ])
  return {
    repo: true,
    root,
    ...parseStatus(porcelain || ''),
    remote: remote ? parseRemote(remote.trim()) : null,
  }
}

function register ({ getWorkspace }) {
  ipcMain.handle('git:status', () => {
    const ws = getWorkspace()
    return status(ws ? ws.path : null)
  })
}

module.exports = { status, register }
