// The file system, as far as the renderer may reach: the folder that is
// open, and files the person picked in a dialog. Every path the renderer
// names is resolved and checked against that allowance before anything is
// read or written — the renderer is trusted to draw, not to roam.

const { ipcMain, dialog, shell, BrowserWindow } = require('electron')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { isInside, isIgnoredDir, looksBinaryByName, looksBinary, relativeTo } = require('./lib/paths')

const MAX_TEXT_BYTES = 20 * 1024 * 1024
const MAX_INDEX_ENTRIES = 60000
const WATCH_DEBOUNCE_MS = 150

class Files {
  constructor ({ getWorkspace, getWindow }) {
    this.getWorkspace = getWorkspace
    this.getWindow = getWindow
    // Files opened through a dialog, outside the folder.
    this.allowed = new Set()
    this.watcher = null
    this.pending = new Set()
    this.timer = null
    this.index = null
    this.indexRoot = null
  }

  root () {
    const ws = this.getWorkspace()
    return ws ? ws.path : null
  }

  extraExcludes () {
    const ws = this.getWorkspace()
    return new Set(ws && ws.settings ? ws.settings.excludeDirs : [])
  }

  // ── Allowance ─────────────────────────────────────────────────────────────

  async resolve (target, { mustExist = true } = {}) {
    if (typeof target !== 'string' || !target) throw new Error('No path')
    const abs = path.resolve(target)
    // The real location decides — a symlink out of the folder is judged by
    // where it points. A file about to be created has no real path yet, so
    // its parent is what is resolved.
    let real
    try {
      real = await fsp.realpath(abs)
    } catch (e) {
      if (mustExist || e.code !== 'ENOENT') throw e
      real = path.join(await fsp.realpath(path.dirname(abs)), path.basename(abs))
    }
    const root = this.root()
    const rootReal = root ? await fsp.realpath(root).catch(() => root) : null
    if (rootReal && isInside(rootReal, real)) return real
    if (this.allowed.has(real) || this.allowed.has(abs)) return real
    throw new Error(`Outside the open folder: ${abs}`)
  }

  allow (file) {
    this.allowed.add(path.resolve(file))
  }

  // ── Reading and writing ───────────────────────────────────────────────────

  async list (dir) {
    const target = dir ? await this.resolve(dir) : this.root()
    if (!target) return []
    const dirents = await fsp.readdir(target, { withFileTypes: true })
    const entries = []
    for (const d of dirents) {
      let type = d.isDirectory() ? 'dir' : d.isFile() ? 'file' : d.isSymbolicLink() ? 'link' : 'other'
      if (type === 'link') {
        try {
          const st = await fsp.stat(path.join(target, d.name))
          type = st.isDirectory() ? 'dir' : 'file'
        } catch { type = 'file' }
      }
      if (type === 'other') continue
      entries.push({ name: d.name, path: path.join(target, d.name), type })
    }
    entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) : a.type === 'dir' ? -1 : 1))
    return entries
  }

  async read (file) {
    const target = await this.resolve(file)
    const st = await fsp.stat(target)
    if (!st.isFile()) throw new Error('Not a file')
    if (st.size > MAX_TEXT_BYTES) return { path: target, binary: true, tooLarge: true, size: st.size, mtimeMs: st.mtimeMs, content: '' }
    const buffer = await fsp.readFile(target)
    if (looksBinaryByName(target) || looksBinary(buffer)) {
      return { path: target, binary: true, size: st.size, mtimeMs: st.mtimeMs, content: '' }
    }
    return { path: target, binary: false, size: st.size, mtimeMs: st.mtimeMs, content: buffer.toString('utf8') }
  }

  async write (file, content) {
    const target = await this.resolve(file, { mustExist: false })
    await fsp.writeFile(target, String(content), 'utf8')
    const st = await fsp.stat(target)
    return { path: target, mtimeMs: st.mtimeMs, size: st.size }
  }

  async stat (file) {
    const target = await this.resolve(file)
    const st = await fsp.stat(target)
    return { path: target, mtimeMs: st.mtimeMs, size: st.size, isDirectory: st.isDirectory() }
  }

  async create ({ dir, name, type }) {
    const parent = await this.resolve(dir)
    const clean = String(name || '').trim()
    if (!clean || clean.includes('/') || clean.includes('\\') || clean === '.' || clean === '..') throw new Error('Bad name')
    const target = path.join(parent, clean)
    if (type === 'dir') await fsp.mkdir(target)
    else await fsp.writeFile(target, '', { flag: 'wx' })
    return { path: target }
  }

  async rename (from, to) {
    const src = await this.resolve(from)
    const dst = await this.resolve(to, { mustExist: false })
    await fsp.rename(src, dst)
    return { path: dst }
  }

  // Deleting goes to the OS trash; nothing here is beyond undo.
  async trash (file) {
    const target = await this.resolve(file)
    await shell.trashItem(target)
    return { ok: true }
  }

  async reveal (file) {
    const target = await this.resolve(file)
    shell.showItemInFolder(target)
  }

  // ── The index (quick open) ────────────────────────────────────────────────

  // Every file under the folder, as relative paths, skipping the directories
  // nobody opens by name. Cached until the watcher says something changed.
  async indexFiles () {
    const root = this.root()
    if (!root) return []
    if (this.index && this.indexRoot === root) return this.index
    const excludes = this.extraExcludes()
    const out = []
    const walk = async (dir) => {
      if (out.length >= MAX_INDEX_ENTRIES) return
      let dirents
      try { dirents = await fsp.readdir(dir, { withFileTypes: true }) } catch { return }
      for (const d of dirents) {
        if (out.length >= MAX_INDEX_ENTRIES) return
        if (d.isDirectory()) {
          if (isIgnoredDir(d.name) || excludes.has(d.name)) continue
          await walk(path.join(dir, d.name))
        } else if (d.isFile()) {
          out.push(relativeTo(root, path.join(dir, d.name)))
        }
      }
    }
    await walk(root)
    out.sort((a, b) => a.localeCompare(b))
    this.index = out
    this.indexRoot = root
    return out
  }

  // ── Watching ──────────────────────────────────────────────────────────────

  watch () {
    this.unwatch()
    const root = this.root()
    if (!root) return
    try {
      this.watcher = fs.watch(root, { recursive: true, persistent: false }, (_event, filename) => {
        if (!filename) return
        const rel = String(filename).split(path.sep).join('/')
        const top = rel.split('/')[0]
        if (isIgnoredDir(top) || this.extraExcludes().has(top)) return
        this.pending.add(path.join(root, rel))
        clearTimeout(this.timer)
        this.timer = setTimeout(() => this.flushChanges(), WATCH_DEBOUNCE_MS)
      })
      this.watcher.on('error', () => this.unwatch())
    } catch {
      // Recursive watching is unavailable on this platform/Node — the tree
      // still refreshes on demand.
      this.watcher = null
    }
  }

  unwatch () {
    if (this.watcher) {
      try { this.watcher.close() } catch { /* already gone */ }
      this.watcher = null
    }
    clearTimeout(this.timer)
    this.pending.clear()
  }

  flushChanges () {
    const paths = [...this.pending]
    this.pending.clear()
    if (paths.length === 0) return
    // The index is rebuilt lazily, on the next quick-open.
    this.index = null
    const win = this.getWindow()
    if (win && !win.isDestroyed()) win.webContents.send('fs:changed', { paths })
  }

  // ── Dialogs ───────────────────────────────────────────────────────────────

  async pickFolder () {
    const win = this.getWindow()
    const res = await dialog.showOpenDialog(win || undefined, { properties: ['openDirectory', 'createDirectory'] })
    if (res.canceled || !res.filePaths[0]) return null
    return res.filePaths[0]
  }

  async pickFiles () {
    const win = this.getWindow()
    const res = await dialog.showOpenDialog(win || undefined, { properties: ['openFile', 'multiSelections'] })
    if (res.canceled) return []
    res.filePaths.forEach((f) => this.allow(f))
    return res.filePaths
  }

  async pickSaveAs (defaultPath) {
    const win = this.getWindow()
    const res = await dialog.showSaveDialog(win || undefined, { defaultPath: defaultPath || this.root() || undefined })
    if (res.canceled || !res.filePath) return null
    this.allow(res.filePath)
    return res.filePath
  }

  // ── IPC ───────────────────────────────────────────────────────────────────

  register () {
    ipcMain.handle('fs:list', (_e, dir) => this.list(dir))
    ipcMain.handle('fs:read', (_e, file) => this.read(file))
    ipcMain.handle('fs:write', (_e, file, content) => this.write(file, content))
    ipcMain.handle('fs:stat', (_e, file) => this.stat(file))
    ipcMain.handle('fs:create', (_e, spec) => this.create(spec || {}))
    ipcMain.handle('fs:rename', (_e, from, to) => this.rename(from, to))
    ipcMain.handle('fs:trash', (_e, file) => this.trash(file))
    ipcMain.handle('fs:reveal', (_e, file) => this.reveal(file))
    ipcMain.handle('fs:index', () => this.indexFiles())
    ipcMain.handle('dialog:folder', () => this.pickFolder())
    ipcMain.handle('dialog:files', () => this.pickFiles())
    ipcMain.handle('dialog:saveAs', (_e, def) => this.pickSaveAs(def))
  }
}

// A window is needed for dialogs; BrowserWindow is imported so a caller
// without one still gets a parentless dialog rather than a throw.
void BrowserWindow

module.exports = { Files }
