// Configure My AI Editor — the Electron main process.
//
// The desktop app (github.com/9thdesigns/configure-my-ai-desktop) is a
// window onto configuremyai.com. This is that same window, made into a
// side panel, with a lightweight editor, a terminal and a file tree built
// around it — so a person can drive a Code session while building and
// editing the files it touches. Everything about the session itself stays
// the server's: its transcript, its composer, its repositories and pull
// requests are the same pages the web shows, rendered in the panel.
//
// What lives here, and only here: windowing (the desktop app's chrome rules,
// see src/lib/window-chrome.js), the panel (src/code-panel.js), the file
// system as far as the renderer may reach (src/files.js), terminals
// (src/terminal.js), git status (src/git.js), the account (src/cma.js),
// workspaces and their settings (src/workspaces.js), the menu, auto-update.

const { app, BrowserWindow, ipcMain, Menu, nativeTheme, shell, clipboard, session } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const { TITLEBAR_HEIGHT, PANEL_PARTITION, serverOrigin, tagUserAgent } = require('./config')
const { captionSide, isTilingWindowManager } = require('./lib/window-chrome')
const { isWebUrl } = require('./lib/url-policy')
const { guardIpc } = require('./lib/ipc-guard')
const windowState = require('./window-state')
const updater = require('./updater')
const { installMenu } = require('./menu')
const { Workspaces } = require('./workspaces')
const { Files } = require('./files')
const { Terminals } = require('./terminal')
const { CodePanel } = require('./code-panel')
const { Cma } = require('./cma')
const gitStatus = require('./git')

// The name decides where userData lives, so it is set before any module
// reads a path — the desktop app sets it later, but nothing there touches
// userData until the app is ready. CMA_EDITOR_USER_DATA moves the whole
// state directory, for the smoke test and for running two copies side by
// side without sharing settings.
app.setName('Configure My AI Editor')
if (process.env.CMA_EDITOR_USER_DATA) app.setPath('userData', process.env.CMA_EDITOR_USER_DATA)

const THEME = {
  light: { background: '#f7f5f4', symbol: '#231d1b' },
  dark: { background: '#100c0b', symbol: '#f4f1ef' },
}

let mainWindow = null
const getWindow = () => mainWindow
const send = (channel, ...args) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args)
}

const workspaces = new Workspaces()
const getWorkspace = () => workspaces.current
const getOrigin = () => serverOrigin(workspaces.getPreferences())

const files = new Files({ getWorkspace, getWindow })
const terminals = new Terminals({ getWorkspace, getWindow })
const panel = new CodePanel({ getOrigin, getWindow, onState: (state) => send('panel:state', state) })
const cma = new Cma({ getOrigin, getPanel: () => panel })

// ── Theme ─────────────────────────────────────────────────────────────────────

function effectiveTheme () {
  const pref = workspaces.getPreferences().theme
  if (pref === 'light' || pref === 'dark') return pref
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

function applyTheme () {
  const theme = effectiveTheme()
  nativeTheme.themeSource = workspaces.getPreferences().theme
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBackgroundColor(THEME[theme].background)
    if (typeof mainWindow.setTitleBarOverlay === 'function' && process.platform !== 'darwin' && !isTilingWindowManager(process.platform, process.env)) {
      try { mainWindow.setTitleBarOverlay({ color: THEME[theme].background, symbolColor: THEME[theme].symbol, height: TITLEBAR_HEIGHT }) } catch { /* not supported here */ }
    }
  }
  send('theme:changed', { theme })
}

// ── The window ────────────────────────────────────────────────────────────────

// Chromeless window chrome, per OS — the desktop app's arrangement:
//   macOS   — 'hiddenInset': no strip, traffic lights kept.
//   Windows — 'hidden' + a Window Controls Overlay painted over the page.
//   Linux   — floating desktops get the overlay; tiling WMs (Hyprland on
//             Omarchy, Sway, i3…) get a frameless window, since the
//             compositor owns placement and shows no buttons.
function titleBarOptions () {
  const theme = THEME[effectiveTheme()]
  if (process.platform === 'darwin') {
    return { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 14 } }
  }
  if (isTilingWindowManager(process.platform, process.env)) {
    return { frame: false }
  }
  return {
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: theme.background, symbolColor: theme.symbol, height: TITLEBAR_HEIGHT },
  }
}

function createMainWindow () {
  const state = windowState.load()

  mainWindow = new BrowserWindow({
    ...state.bounds,
    minWidth: 900,
    minHeight: 560,
    show: false,
    backgroundColor: THEME[effectiveTheme()].background,
    autoHideMenuBar: process.platform === 'linux',
    ...titleBarOptions(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })

  if (state.isMaximized) mainWindow.maximize()
  windowState.track(mainWindow)

  // The editor's own renderer is a local file; anything it tries to open
  // as a window is a link in a file it is showing, and belongs in the
  // browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    event.preventDefault()
    if (isWebUrl(url)) shell.openExternal(url)
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('focus', () => send('window:focus'))
  installSmokeTest(mainWindow)
  mainWindow.on('closed', () => {
    terminals.killAll()
    panel.destroy()
    files.unwatch()
    workspaces.flush()
    mainWindow = null
  })

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
  return mainWindow
}

// A headless check that the editor comes up: with CMA_EDITOR_SMOKE set to a
// file path, the window is captured to that PNG a moment after its first
// paint and the app quits. `xvfb-run npm run smoke` on a machine with no
// display — CI, a container — proves the renderer boots and draws.
function installSmokeTest (win) {
  const out = process.env.CMA_EDITOR_SMOKE
  if (!out) return
  const delay = Number(process.env.CMA_EDITOR_SMOKE_DELAY_MS) || 2500
  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const image = await win.webContents.capturePage()
        fs.writeFileSync(out, image.toPNG())
        console.log(`[smoke] wrote ${out} (${image.getSize().width}x${image.getSize().height})`)
        // The panel is a separate surface, so it is captured on its own —
        // and its placement logged, since the window capture cannot show it.
        const contents = panel.contents()
        if (contents) {
          console.log(`[smoke] panel bounds ${JSON.stringify(panel.view.getBounds())} url=${contents.getURL()}`)
          const panelImage = await contents.capturePage()
          const panelOut = out.replace(/\.png$/, '') + '-panel.png'
          fs.writeFileSync(panelOut, panelImage.toPNG())
          console.log(`[smoke] wrote ${panelOut} (${panelImage.getSize().width}x${panelImage.getSize().height})`)
        }
      } catch (e) {
        console.error(`[smoke] capture failed: ${e.message}`)
        process.exitCode = 1
      }
      app.quit()
    }, delay)
  })
}

// ── Workspaces ────────────────────────────────────────────────────────────────

function openWorkspace (folder) {
  const state = workspaces.open(folder)
  files.unwatch()
  files.watch()
  refreshMenu()
  if (mainWindow) mainWindow.setTitle(`${state.name} — Configure My AI Editor`)
  send('workspace:opened', state)
  return state
}

function closeWorkspace () {
  files.unwatch()
  terminals.killAll()
  workspaces.close()
  if (mainWindow) mainWindow.setTitle('Configure My AI Editor')
  refreshMenu()
  send('workspace:opened', null)
}

// A folder named on the command line (`configure-my-ai-editor .`) or handed
// over by the OS (Finder's "Open With", a second launch).
function folderFromArgv (argv) {
  // Packaged: [exe, ...args]. In development: [electron, app path, ...args]
  // — with Chromium switches anywhere among them, so the app path is
  // recognised by value rather than by position.
  const appPath = app.getAppPath()
  const candidates = argv.slice(1).filter((a) => a && !a.startsWith('-') && path.resolve(a) !== appPath)
  for (const c of candidates) {
    try {
      const abs = path.resolve(c)
      const st = fs.statSync(abs)
      if (st.isDirectory()) return abs
      if (st.isFile()) return path.dirname(abs)
    } catch { /* not a path */ }
  }
  return null
}

// ── Menu ──────────────────────────────────────────────────────────────────────

function refreshMenu () {
  installMenu({
    appUrl: getOrigin(),
    getWindow,
    getRecent: () => workspaces.recent(),
    onOpenRecent: (folder) => { try { openWorkspace(folder) } catch { workspaces.forget(folder); refreshMenu() } },
    onCheckForUpdates: () => updater.checkForUpdates({ getWindow }),
    send,
  })
}

// ── IPC ───────────────────────────────────────────────────────────────────────

function registerIpc () {
  // Before any handler: privileged channels answer the editor's renderer only.
  guardIpc(ipcMain, {
    getMainContents: () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null),
    rendererIndexPath: path.join(__dirname, '..', 'renderer', 'index.html'),
  })
  ipcMain.on('app:info', (event) => {
    event.returnValue = {
      platform: process.platform,
      version: app.getVersion(),
      captions: captionSide(process.platform, process.env),
      titleBarHeight: TITLEBAR_HEIGHT,
      serverUrl: getOrigin(),
      isPackaged: app.isPackaged,
      theme: effectiveTheme(),
    }
  })

  ipcMain.handle('workspace:recent', () => workspaces.recent())
  ipcMain.handle('workspace:current', () => workspaces.state())
  ipcMain.handle('workspace:open', async (_e, folder) => {
    const target = folder || await files.pickFolder()
    if (!target) return null
    return openWorkspace(target)
  })
  ipcMain.handle('workspace:close', () => { closeWorkspace(); return null })
  ipcMain.handle('workspace:forget', (_e, folder) => { workspaces.forget(folder); refreshMenu(); return workspaces.recent() })
  ipcMain.handle('workspace:saveSettings', (_e, settings) => workspaces.saveSettings(settings))
  ipcMain.handle('workspace:saveLayout', (_e, payload) => { workspaces.saveLayout(payload || {}); return true })

  ipcMain.handle('prefs:get', () => workspaces.getPreferences())
  ipcMain.handle('prefs:set', (_e, patch) => {
    const before = workspaces.getPreferences()
    const prefs = workspaces.setPreferences(patch)
    if (before.theme !== prefs.theme) applyTheme()
    if (before.serverUrl !== prefs.serverUrl) { refreshMenu(); panel.navigate('/code') }
    return prefs
  })

  ipcMain.handle('panel:setBounds', (_e, bounds) => { panel.setBounds(bounds || {}); return true })
  ipcMain.handle('panel:show', () => { panel.show(); return panel.state() })
  ipcMain.handle('panel:hide', () => { panel.hide(); return panel.state() })
  ipcMain.handle('panel:navigate', (_e, target) => { panel.navigate(String(target || '/code')); return true })
  ipcMain.handle('panel:openSession', (_e, slug) => { panel.openSession(slug); return true })
  ipcMain.handle('panel:back', () => { panel.back(); return true })
  ipcMain.handle('panel:forward', () => { panel.forward(); return true })
  ipcMain.handle('panel:reload', () => { panel.reload(); return true })
  ipcMain.handle('panel:state', () => panel.state())
  ipcMain.handle('panel:focus', () => { panel.contents()?.focus(); return true })
  ipcMain.handle('panel:addReference', (_e, ref) => panel.addReference(ref || {}))
  // Sign out of the account in this editor: the panel's cookies and storage
  // go, the site's own session is left to expire, and the panel lands on
  // sign-in. The desktop app does the same by signing out inside the page.
  ipcMain.handle('panel:signOut', async () => {
    await session.fromPartition(PANEL_PARTITION).clearStorageData()
    cma.csrf = null
    panel.navigate('/code')
    return true
  })

  ipcMain.handle('shell:openExternal', (_e, url) => { if (isWebUrl(url)) shell.openExternal(url); return true })
  ipcMain.handle('window:setTitle', (_e, title) => { if (mainWindow) mainWindow.setTitle(String(title || 'Configure My AI Editor')); return true })
  ipcMain.handle('app:quit', () => { app.quit(); return true })

  // A native context menu built from what the renderer asks for; answers
  // with the id of the item clicked, or null.
  ipcMain.handle('menu:popup', (event, items) => new Promise((resolve) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    let settled = false
    const done = (id) => { if (!settled) { settled = true; resolve(id) } }
    const template = (Array.isArray(items) ? items : []).map((item) => {
      if (!item || item.type === 'separator') return { type: 'separator' }
      return { label: String(item.label || ''), enabled: item.enabled !== false, click: () => done(item.id) }
    })
    if (template.length === 0) return done(null)
    const menu = Menu.buildFromTemplate(template)
    menu.popup({ window: win || undefined, callback: () => setTimeout(() => done(null), 50) })
  }))

  ipcMain.handle('clipboard:writeText', (_e, text) => { clipboard.writeText(String(text || '')); return true })

  files.register()
  terminals.register()
  cma.register()
  gitStatus.register({ getWorkspace })
}

// ── Startup ───────────────────────────────────────────────────────────────────

tagUserAgent()

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto')
}

// One editor window per machine, the way the desktop app has one; a second
// launch with a folder opens that folder in the running window.
const locked = app.requestSingleInstanceLock()
if (!locked) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    const folder = folderFromArgv(argv)
    if (folder) { try { openWorkspace(folder) } catch { /* not a folder after all */ } }
  })

  let pendingFolder = folderFromArgv(process.argv)
  app.on('open-file', (event, file) => {
    event.preventDefault()
    const folder = folderFromArgv(['', file])
    if (!folder) return
    if (app.isReady() && mainWindow) { try { openWorkspace(folder) } catch { /* ignore */ } } else pendingFolder = folder
  })

  app.whenReady().then(() => {
    CodePanel.restrictPermissions(getOrigin)
    registerIpc()
    refreshMenu()
    createMainWindow()
    nativeTheme.themeSource = workspaces.getPreferences().theme
    nativeTheme.on('updated', applyTheme)

    // The renderer asks for the workspace on boot; opening it now means the
    // answer is ready and the watcher is running before the first paint.
    const folder = pendingFolder || (workspaces.recent()[0] && workspaces.recent()[0].path)
    if (folder) { try { openWorkspace(folder) } catch { /* the renderer shows the welcome screen */ } }

    updater.initAutoUpdates({ getWindow })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })
}

app.on('before-quit', () => {
  workspaces.flush()
  terminals.killAll()
})

// macOS convention: closing the window leaves the app in the Dock.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
