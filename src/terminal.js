// Terminals: one pseudo-terminal per tab in the bottom panel, spawned in the
// open folder with the person's own shell. The renderer draws them with
// xterm.js; bytes travel over IPC in both directions and nothing here reads
// or interprets them.

const { ipcMain } = require('electron')
const os = require('node:os')

let pty = null // lazy: the native module is loaded on first use
function loadPty () {
  if (pty) return pty
  pty = require('node-pty')
  return pty
}

function defaultShell () {
  if (process.platform === 'win32') return process.env.COMSPEC && /powershell/i.test(process.env.COMSPEC) ? process.env.COMSPEC : 'powershell.exe'
  return process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
}

// A login shell on macOS and Linux, so PATH is what the terminal app gets
// — the `claude` and `cma-agent` a person installed for the companion are
// on it. Windows shells have no such flag.
function defaultArgs (shell) {
  if (process.platform === 'win32') return []
  return /\/(zsh|bash|fish)$/.test(shell) ? ['-l'] : []
}

class Terminals {
  constructor ({ getWorkspace, getWindow }) {
    this.getWorkspace = getWorkspace
    this.getWindow = getWindow
    this.procs = new Map()
    this.nextId = 1
  }

  create ({ cols = 80, rows = 24, cwd = null } = {}) {
    const ws = this.getWorkspace()
    const settings = ws ? ws.settings : null
    const shell = (settings && settings.shell) || defaultShell()
    const args = settings && settings.shellArgs && settings.shellArgs.length ? settings.shellArgs : defaultArgs(shell)
    const dir = cwd || (ws ? ws.path : os.homedir())

    const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'ConfigureMyAI-Editor' }
    // Electron's own runtime hints must not leak into the shell.
    delete env.ELECTRON_RUN_AS_NODE

    const proc = loadPty().spawn(shell, args, { name: 'xterm-256color', cols, rows, cwd: dir, env, useConpty: process.platform === 'win32' })
    const id = this.nextId++
    this.procs.set(id, proc)

    const send = (channel, ...payload) => {
      const win = this.getWindow()
      if (win && !win.isDestroyed()) win.webContents.send(channel, id, ...payload)
    }
    proc.onData((data) => send('term:data', data))
    proc.onExit(({ exitCode }) => {
      this.procs.delete(id)
      send('term:exit', exitCode)
    })
    return { id, shell, cwd: dir }
  }

  input (id, data) {
    const proc = this.procs.get(id)
    if (proc) proc.write(String(data))
  }

  resize (id, cols, rows) {
    const proc = this.procs.get(id)
    if (!proc) return
    const c = Math.max(2, Math.floor(Number(cols) || 80))
    const r = Math.max(1, Math.floor(Number(rows) || 24))
    try { proc.resize(c, r) } catch { /* a resize on a dying pty */ }
  }

  kill (id) {
    const proc = this.procs.get(id)
    if (!proc) return
    this.procs.delete(id)
    try { proc.kill() } catch { /* already gone */ }
  }

  killAll () {
    for (const id of [...this.procs.keys()]) this.kill(id)
  }

  register () {
    ipcMain.handle('term:create', (_e, opts) => this.create(opts || {}))
    ipcMain.on('term:input', (_e, id, data) => this.input(id, data))
    ipcMain.on('term:resize', (_e, id, cols, rows) => this.resize(id, cols, rows))
    ipcMain.on('term:kill', (_e, id) => this.kill(id))
  }
}

module.exports = { Terminals, defaultShell, defaultArgs }
