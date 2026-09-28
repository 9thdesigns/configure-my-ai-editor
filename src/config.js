// The few constants the whole main process agrees on.

const { app } = require('electron')
const { userAgentSuffix } = require('./lib/cma-api')

const DEFAULT_SERVER = 'https://configuremyai.com'

// The Code panel's cookie jar. A named, persisted partition rather than the
// default session: the editor's own renderer (a local file) and the site
// never share storage, and signing in survives a restart the way it does
// in the desktop app.
const PANEL_PARTITION = 'persist:configure-my-ai'

// Height of the strip at the top of the window the renderer draws and the
// OS paints its caption buttons into. Same value as the desktop app so the
// two windows line up next to each other.
const TITLEBAR_HEIGHT = 40

const RELEASES_URL = 'https://github.com/9thdesigns/configure-my-ai-editor/releases'

// A developer running the Rails app locally points the panel at it with
// CMA_EDITOR_SERVER=http://localhost:3000 (or the same value saved in
// preferences). The default is the real site.
function serverOrigin (preferences) {
  const fromEnv = (process.env.CMA_EDITOR_SERVER || '').trim().replace(/\/+$/, '')
  const fromPrefs = (preferences && preferences.serverUrl) || ''
  return fromEnv || fromPrefs || DEFAULT_SERVER
}

// Identify the panel to the server as the desktop app AND the editor. See
// src/lib/cma-api.js for the contract, and MobileHelper in the Rails app.
function tagUserAgent () {
  app.userAgentFallback = `${app.userAgentFallback} ${userAgentSuffix(app.getVersion())}`
}

module.exports = { DEFAULT_SERVER, PANEL_PARTITION, TITLEBAR_HEIGHT, RELEASES_URL, serverOrigin, tagUserAgent }
