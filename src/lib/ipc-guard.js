// Every privileged channel (fs:*, term:*, workspace:*, …) answers ONLY the
// editor's own renderer: the main window's top frame, showing the bundled
// renderer/index.html. The Code panel is a remote website in a
// WebContentsView; its preload exposes nothing, but IPC reaches ipcMain from
// any webContents, so the check belongs here too, not only in the preload's
// allow-list. Pure helpers + a wrapper installed before any handler.

const { pathToFileURL } = require('node:url')

function normalizeFileUrl (value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'file:') return null
    url.hash = ''
    url.search = ''
    return url.toString()
  } catch {
    return null
  }
}

// frame: { url, parent } (an Electron WebFrameMain, or a plain test double).
function isTrustedFrame (frame, rendererIndexPath) {
  if (!frame || frame.parent) return false // sub-frames never get the bridge
  const got = normalizeFileUrl(frame.url)
  return got !== null && got === pathToFileURL(rendererIndexPath).toString()
}

function isTrustedSender (event, { getMainContents, rendererIndexPath }) {
  const main = getMainContents()
  if (!main || event.sender !== main) return false
  return isTrustedFrame(event.senderFrame, rendererIndexPath)
}

// Wraps ipcMain.handle / ipcMain.on so every registration below is guarded.
// A rejected invoke throws; a rejected send / sendSync is ignored (sendSync
// gets returnValue = null so the caller does not hang).
function guardIpc (ipcMain, opts, log = console.warn) {
  const handle = ipcMain.handle.bind(ipcMain)
  const on = ipcMain.on.bind(ipcMain)
  const refuse = (channel) => log(`[ipc] refused ${channel} from an untrusted sender`)
  ipcMain.handle = (channel, fn) => handle(channel, (event, ...args) => {
    if (!isTrustedSender(event, opts)) { refuse(channel); throw new Error('Untrusted sender') }
    return fn(event, ...args)
  })
  ipcMain.on = (channel, fn) => on(channel, (event, ...args) => {
    if (!isTrustedSender(event, opts)) { refuse(channel); event.returnValue = null; return }
    return fn(event, ...args)
  })
  return ipcMain
}

module.exports = { isTrustedFrame, isTrustedSender, guardIpc }
