// A workspace is a folder plus the settings that belong to that folder.
//
// "Workspace" here is the editor's word — a directory on this machine and
// how you like to edit it — and has nothing to do with a Configure My AI
// workspace (the account-side grouping of configurations and bots). The two
// meet in exactly one place: the Code panel shows whichever Configure My AI
// workspace the account is looking at, and a folder can remember which
// Code session it was last driving.
//
// Everything is plain data with defaults, so a settings file from an older
// build, a hand-edited one, or an empty one all come out as a complete
// object. Pure: reading and writing the files is src/workspaces.js.

const DEFAULT_SETTINGS = Object.freeze({
  // The editor
  tabSize: 2,
  insertSpaces: true,
  fontSize: 13,
  fontFamily: '',          // '' → the platform's monospace stack
  wordWrap: false,
  lineNumbers: true,
  autoSave: 'off',         // 'off' | 'afterDelay' | 'onFocusChange'
  autoSaveDelayMs: 1000,
  trimTrailingWhitespace: false,
  formatOnSave: false,
  // The terminal
  shell: '',               // '' → the login shell ($SHELL / PowerShell)
  shellArgs: [],
  terminalFontSize: 13,
  // The Code panel
  codePanel: {
    visible: true,
    width: 460,
    session: null,         // slug of the session this folder was last driving
  },
  // The explorer
  excludeDirs: [],         // extra directory names to hide, on top of the defaults
  showHidden: true,
})

// Global preferences — per person, not per folder.
const DEFAULT_PREFERENCES = Object.freeze({
  theme: 'system',         // 'system' | 'light' | 'dark'
  sidebarWidth: 260,
  terminalHeight: 240,
  // The account-side server the panel signs into. Only ever changed by a
  // developer running the site locally.
  serverUrl: '',
})

const AUTO_SAVE_MODES = new Set(['off', 'afterDelay', 'onFocusChange'])
const THEMES = new Set(['system', 'light', 'dark'])

function isPlainObject (value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function clampInt (value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

// Defaults under the saved values, one key at a time, with each value
// checked for the shape the editor can use. Unknown keys are dropped rather
// than carried: a typo in a hand-edited file should not live forever.
function normalizeSettings (input) {
  const saved = isPlainObject(input) ? input : {}
  const panel = isPlainObject(saved.codePanel) ? saved.codePanel : {}
  return {
    tabSize: clampInt(saved.tabSize, 1, 8, DEFAULT_SETTINGS.tabSize),
    insertSpaces: typeof saved.insertSpaces === 'boolean' ? saved.insertSpaces : DEFAULT_SETTINGS.insertSpaces,
    fontSize: clampInt(saved.fontSize, 8, 40, DEFAULT_SETTINGS.fontSize),
    fontFamily: typeof saved.fontFamily === 'string' ? saved.fontFamily : DEFAULT_SETTINGS.fontFamily,
    wordWrap: typeof saved.wordWrap === 'boolean' ? saved.wordWrap : DEFAULT_SETTINGS.wordWrap,
    lineNumbers: typeof saved.lineNumbers === 'boolean' ? saved.lineNumbers : DEFAULT_SETTINGS.lineNumbers,
    autoSave: AUTO_SAVE_MODES.has(saved.autoSave) ? saved.autoSave : DEFAULT_SETTINGS.autoSave,
    autoSaveDelayMs: clampInt(saved.autoSaveDelayMs, 100, 60000, DEFAULT_SETTINGS.autoSaveDelayMs),
    trimTrailingWhitespace: typeof saved.trimTrailingWhitespace === 'boolean' ? saved.trimTrailingWhitespace : DEFAULT_SETTINGS.trimTrailingWhitespace,
    formatOnSave: typeof saved.formatOnSave === 'boolean' ? saved.formatOnSave : DEFAULT_SETTINGS.formatOnSave,
    shell: typeof saved.shell === 'string' ? saved.shell : DEFAULT_SETTINGS.shell,
    shellArgs: Array.isArray(saved.shellArgs) ? saved.shellArgs.filter((a) => typeof a === 'string') : [],
    terminalFontSize: clampInt(saved.terminalFontSize, 8, 40, DEFAULT_SETTINGS.terminalFontSize),
    codePanel: {
      visible: typeof panel.visible === 'boolean' ? panel.visible : DEFAULT_SETTINGS.codePanel.visible,
      width: clampInt(panel.width, 320, 1600, DEFAULT_SETTINGS.codePanel.width),
      session: typeof panel.session === 'string' && panel.session ? panel.session : null,
    },
    excludeDirs: Array.isArray(saved.excludeDirs) ? saved.excludeDirs.filter((d) => typeof d === 'string' && d) : [],
    showHidden: typeof saved.showHidden === 'boolean' ? saved.showHidden : DEFAULT_SETTINGS.showHidden,
  }
}

function normalizePreferences (input) {
  const saved = isPlainObject(input) ? input : {}
  return {
    theme: THEMES.has(saved.theme) ? saved.theme : DEFAULT_PREFERENCES.theme,
    sidebarWidth: clampInt(saved.sidebarWidth, 160, 800, DEFAULT_PREFERENCES.sidebarWidth),
    terminalHeight: clampInt(saved.terminalHeight, 80, 1200, DEFAULT_PREFERENCES.terminalHeight),
    serverUrl: typeof saved.serverUrl === 'string' ? saved.serverUrl.trim().replace(/\/+$/, '') : '',
  }
}

// The recent list: most recent first, one entry per folder, bounded.
const RECENT_LIMIT = 12

function rememberRecent (list, entry) {
  const recent = (Array.isArray(list) ? list : []).filter((e) => isPlainObject(e) && e.path && e.path !== entry.path)
  recent.unshift({ path: entry.path, name: entry.name, openedAt: entry.openedAt })
  return recent.slice(0, RECENT_LIMIT)
}

function forgetRecent (list, folderPath) {
  return (Array.isArray(list) ? list : []).filter((e) => isPlainObject(e) && e.path && e.path !== folderPath)
}

module.exports = {
  DEFAULT_SETTINGS,
  DEFAULT_PREFERENCES,
  RECENT_LIMIT,
  normalizeSettings,
  normalizePreferences,
  rememberRecent,
  forgetRecent,
}
