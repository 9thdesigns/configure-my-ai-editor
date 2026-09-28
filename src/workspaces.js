// Workspaces: which folder is open, what the person likes about editing it,
// and where they left off. See src/lib/workspace-settings.js for what the
// data means; this file is where it lives on disk.
//
//   <userData>/preferences.json          global preferences
//   <userData>/recent.json               the Open Recent list
//   <userData>/workspaces/<hash>.json    one file per folder ever opened

const { app } = require('electron')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { readJson, writeJson, debouncedWriter } = require('./store')
const {
  normalizeSettings, normalizePreferences, rememberRecent, forgetRecent,
} = require('./lib/workspace-settings')

class Workspaces {
  constructor () {
    this.writer = debouncedWriter()
    this.current = null
    this.preferences = normalizePreferences(readJson(this.preferencesFile(), {}))
  }

  dir () { return app.getPath('userData') }
  preferencesFile () { return path.join(this.dir(), 'preferences.json') }
  recentFile () { return path.join(this.dir(), 'recent.json') }
  workspaceFile (folder) {
    const key = crypto.createHash('sha1').update(path.resolve(folder)).digest('hex').slice(0, 16)
    return path.join(this.dir(), 'workspaces', `${key}.json`)
  }

  // ── Preferences ───────────────────────────────────────────────────────────

  getPreferences () { return this.preferences }

  setPreferences (patch) {
    this.preferences = normalizePreferences({ ...this.preferences, ...(patch || {}) })
    writeJson(this.preferencesFile(), this.preferences)
    return this.preferences
  }

  // ── Recent ────────────────────────────────────────────────────────────────

  recent () {
    const list = readJson(this.recentFile(), [])
    // Folders that have gone are dropped from the menu rather than offered
    // and failing when picked.
    return (Array.isArray(list) ? list : []).filter((e) => e && e.path && fs.existsSync(e.path))
  }

  forget (folder) {
    writeJson(this.recentFile(), forgetRecent(this.recent(), folder))
  }

  // ── The open workspace ────────────────────────────────────────────────────

  // Opening a folder reads what was saved for it (or starts fresh), and
  // moves it to the top of the recent list. Returns the state the renderer
  // boots from.
  open (folder) {
    const resolved = path.resolve(folder)
    const stat = fs.statSync(resolved)
    if (!stat.isDirectory()) throw new Error(`${resolved} is not a folder`)

    const saved = readJson(this.workspaceFile(resolved), {}) || {}
    const name = path.basename(resolved) || resolved
    this.current = {
      path: resolved,
      name,
      settings: normalizeSettings(saved.settings),
      layout: saved.layout || null,
      panel: saved.panel || null,
      openedAt: new Date().toISOString(),
    }
    this.persist()
    writeJson(this.recentFile(), rememberRecent(this.recent(), { path: resolved, name, openedAt: this.current.openedAt }))
    return this.state()
  }

  close () {
    this.flush()
    this.current = null
  }

  state () {
    if (!this.current) return null
    return { ...this.current, recent: this.recent(), preferences: this.preferences }
  }

  saveSettings (settings) {
    if (!this.current) return null
    this.current.settings = normalizeSettings({ ...this.current.settings, ...(settings || {}) })
    this.persist()
    return this.current.settings
  }

  // The layout (groups, tabs, sizes) and the panel's last state, saved on a
  // debounce because they change on every keystroke's worth of UI.
  saveLayout ({ layout, panel } = {}) {
    if (!this.current) return
    if (layout !== undefined) this.current.layout = layout
    if (panel !== undefined) this.current.panel = panel
    this.persist(true)
  }

  persist (debounced = false) {
    if (!this.current) return
    const record = {
      path: this.current.path,
      name: this.current.name,
      settings: this.current.settings,
      layout: this.current.layout,
      panel: this.current.panel,
      openedAt: this.current.openedAt,
    }
    if (debounced) this.writer.save(this.workspaceFile(this.current.path), record)
    else writeJson(this.workspaceFile(this.current.path), record)
  }

  flush () { this.writer.flush() }
}

module.exports = { Workspaces }
