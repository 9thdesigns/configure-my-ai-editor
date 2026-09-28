// In-app auto-update — the desktop app's src/updater.js, with the editor's
// name in the dialogs. electron-updater checks the GitHub release channel
// (latest-mac.yml, latest.yml and latest-linux.yml, published by the
// release workflow), downloads a newer build in the background, and offers
// to restart into it. Only packaged builds can self-update, so everything
// no-ops in development and fails quietly if the updater can't load.

const { app, dialog } = require('electron')

const PRODUCT = 'Configure My AI Editor'

let updater = null // null = not yet loaded, false = unavailable
let wired = false
let checking = false
let interactive = false
let promptedVersion = null

function box (getWindow, options) {
  const win = getWindow && getWindow()
  return (win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options))
    .catch(() => ({}))
}

function load () {
  if (updater !== null) return updater
  try {
    updater = require('electron-updater').autoUpdater
    updater.autoDownload = true
    updater.autoInstallOnAppQuit = true
    updater.logger = null
  } catch {
    updater = false
  }
  return updater
}

function wire (getWindow) {
  if (wired || !updater) return
  wired = true

  updater.on('error', () => {
    if (interactive) {
      interactive = false
      box(getWindow, {
        type: 'warning', buttons: ['OK'], title: 'Update Check Failed',
        message: 'Couldn’t check for updates.', detail: 'Please try again in a little while.',
      })
    }
    checking = false
  })

  updater.on('update-not-available', () => {
    checking = false
    if (interactive) {
      interactive = false
      box(getWindow, {
        type: 'info', buttons: ['OK'], title: 'You’re Up to Date',
        message: `${PRODUCT} is up to date.`, detail: `You’re on version ${app.getVersion()}, the latest release.`,
      })
    }
  })

  updater.on('update-available', () => {
    checking = false
    if (interactive) {
      interactive = false
      box(getWindow, {
        type: 'info', buttons: ['OK'], title: 'Update Available',
        message: 'A new version is downloading.', detail: 'You’ll be prompted to restart as soon as it’s ready.',
      })
    }
  })

  updater.on('update-downloaded', (info) => {
    checking = false
    interactive = false
    const version = info && info.version
    if (version && version === promptedVersion) return
    promptedVersion = version
    box(getWindow, {
      type: 'info', buttons: ['Restart Now', 'Later'], defaultId: 0, cancelId: 1, title: 'Update Ready',
      message: `A new version of ${PRODUCT} is ready.`,
      detail: `Version ${version || ''} has been downloaded. Restart to install it — it only takes a moment.`.replace('  ', ' '),
    }).then((res) => {
      if (res && res.response === 0) setImmediate(() => updater.quitAndInstall())
    })
  })
}

function runCheck () {
  if (checking) return
  checking = true
  Promise.resolve(updater.checkForUpdates()).catch(() => { checking = false })
}

function initAutoUpdates ({ getWindow } = {}) {
  if (!app.isPackaged || !load()) return
  wire(getWindow)
  runCheck()
  setInterval(runCheck, 4 * 60 * 60 * 1000)
}

function checkForUpdates ({ getWindow } = {}) {
  if (!app.isPackaged || !load()) {
    box(getWindow, {
      type: 'info', buttons: ['OK'], title: 'Updates',
      message: 'Automatic updates aren’t available in this build.',
      detail: 'Install a released version from the GitHub releases page to get in-app updates.',
    })
    return
  }
  wire(getWindow)
  interactive = true
  runCheck()
}

module.exports = { initAutoUpdates, checkForUpdates }
