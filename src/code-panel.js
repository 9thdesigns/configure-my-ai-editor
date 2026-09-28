// The Code panel: the site's Code feature, rendered by the server, in a
// WebContentsView beside the editor. This is the desktop app's window with
// the editor wrapped around it — same cookie jar semantics, same navigation
// policy, same offline page — plus the one thing the editor adds: dropping a
// selected piece of code into the session's composer.

const { WebContentsView, BrowserWindow, shell, session, app } = require('electron')
const path = require('node:path')
const { PANEL_PARTITION } = require('./config')
const { decide, isAppUrl } = require('./lib/url-policy')
const { formatReference, insertIntoDraft } = require('./lib/reference')
const { sessionSlugFromPath } = require('./lib/cma-api')

// The composer's field inside the session page (app/views/code/sessions/
// _composer.html.erb in the Rails app). One selector, in one place.
const COMPOSER_SELECTOR = 'textarea[data-code-form-target="input"]'

class CodePanel {
  constructor ({ getOrigin, getWindow, onState }) {
    this.getOrigin = getOrigin
    this.getWindow = getWindow
    this.onState = onState
    this.view = null
    this.bounds = { x: 0, y: 0, width: 0, height: 0 }
    this.visible = false
    this.lastAppUrl = null
  }

  origin () { return this.getOrigin() }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ensure () {
    if (this.view) return this.view
    const win = this.getWindow()
    if (!win) return null

    this.view = new WebContentsView({
      webPreferences: {
        partition: PANEL_PARTITION,
        preload: path.join(__dirname, 'preload-code.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: true,
      },
    })
    win.contentView.addChildView(this.view)
    this.view.setBounds(this.bounds)
    this.view.setVisible(this.visible)

    const contents = this.view.webContents
    this.applyNavigationPolicy(contents)

    // -3 is ERR_ABORTED — ordinary in-page cancellations, not being offline.
    contents.on('did-fail-load', (_event, code, _desc, url, isMainFrame) => {
      if (isMainFrame && code !== -3) this.showOffline(url)
    })
    for (const event of ['did-navigate', 'did-navigate-in-page', 'page-title-updated', 'did-finish-load']) {
      contents.on(event, () => this.emitState())
    }
    contents.on('destroyed', () => { this.view = null })
    return this.view
  }

  destroy () {
    if (!this.view) return
    const win = this.getWindow()
    try { if (win && !win.isDestroyed()) win.contentView.removeChildView(this.view) } catch { /* window going away */ }
    try { this.view.webContents.close() } catch { /* already closed */ }
    this.view = null
  }

  // Which sites may load where — the desktop app's policy, applied to the
  // panel and to every popup it opens (OAuth providers).
  applyNavigationPolicy (contents) {
    contents.setWindowOpenHandler(({ url }) => {
      const verdict = decide(url, this.origin())
      if (verdict === 'app') return { action: 'allow' }
      if (verdict === 'auth') {
        return { action: 'allow', overrideBrowserWindowOptions: { width: 600, height: 720, autoHideMenuBar: true } }
      }
      if (verdict === 'external') shell.openExternal(url)
      return { action: 'deny' }
    })
    contents.on('will-navigate', (event, url) => {
      const verdict = decide(url, this.origin())
      if (verdict === 'app' || verdict === 'auth') return
      event.preventDefault()
      if (verdict === 'external') shell.openExternal(url)
    })
    contents.on('did-create-window', (child) => {
      this.applyNavigationPolicy(child.webContents)
    })
  }

  // The panel is a website; it holds website permissions, and only for the
  // app's own origin.
  static restrictPermissions (getOrigin) {
    const allowed = new Set(['notifications', 'fullscreen', 'clipboard-sanitized-write'])
    session.fromPartition(PANEL_PARTITION).setPermissionRequestHandler((contents, permission, callback) => {
      callback(isAppUrl(contents.getURL(), getOrigin()) && allowed.has(permission))
    })
  }

  // ── Geometry ──────────────────────────────────────────────────────────────

  setBounds (bounds) {
    const b = {
      x: Math.max(0, Math.round(Number(bounds.x) || 0)),
      y: Math.max(0, Math.round(Number(bounds.y) || 0)),
      width: Math.max(0, Math.round(Number(bounds.width) || 0)),
      height: Math.max(0, Math.round(Number(bounds.height) || 0)),
    }
    this.bounds = b
    if (this.view) this.view.setBounds(b)
  }

  show () {
    this.visible = true
    const view = this.ensure()
    if (!view) return
    view.setVisible(true)
    if (!view.webContents.getURL()) this.navigate('/code')
  }

  hide () {
    this.visible = false
    if (this.view) this.view.setVisible(false)
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  navigate (pathOrUrl) {
    const view = this.ensure()
    if (!view) return
    const url = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${this.origin()}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`
    if (decide(url, this.origin()) !== 'app') return
    view.webContents.loadURL(url)
  }

  openSession (slug) {
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(String(slug || ''))) return
    this.navigate(`/code/sessions/${slug}`)
  }

  back () { const wc = this.contents(); if (wc && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack() }
  forward () { const wc = this.contents(); if (wc && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward() }
  reload () { const wc = this.contents(); if (wc) wc.reload() }

  contents () { return this.view ? this.view.webContents : null }

  showOffline (failedUrl) {
    const wc = this.contents()
    if (!wc) return
    if (failedUrl && isAppUrl(failedUrl, this.origin())) this.lastAppUrl = failedUrl
    wc.loadFile(path.join(__dirname, 'offline.html'), { query: { retry: this.lastAppUrl || `${this.origin()}/code` } })
  }

  state () {
    const wc = this.contents()
    if (!wc) return { loaded: false, visible: this.visible, url: null, path: null, slug: null, title: '', canGoBack: false, canGoForward: false }
    const url = wc.getURL()
    let pathname = null
    try { pathname = isAppUrl(url, this.origin()) ? new URL(url).pathname : null } catch { pathname = null }
    return {
      loaded: true,
      visible: this.visible,
      url,
      path: pathname,
      slug: sessionSlugFromPath(pathname),
      title: wc.getTitle(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      // The site's sign-in / sign-up / welcome screens: the renderer shows
      // "sign in to see your sessions" rather than an empty list.
      signedOutPage: /^\/(users\/sign_in|users\/sign_up|users\/password|welcome|login)/.test(pathname || ''),
    }
  }

  emitState () {
    if (typeof this.onState === 'function') this.onState(this.state())
  }

  // ── The page's own values ─────────────────────────────────────────────────

  async readCsrfToken () {
    const wc = this.contents()
    if (!wc || !isAppUrl(wc.getURL(), this.origin())) return null
    return wc.executeJavaScript('document.querySelector(\'meta[name="csrf-token"]\')?.content || null', true)
  }

  // ── Add to session ────────────────────────────────────────────────────────

  // Puts a reference into the composer of the session on screen. When the
  // panel is not on a session page and a slug is known, the session is
  // opened first and the insert retried once the page is up; with nowhere
  // to put it, the reference goes to the clipboard so nothing is lost.
  async addReference ({ path: filePath, startLine, endLine, code, slug }) {
    const reference = formatReference({ path: filePath, startLine, endLine, code })
    this.show()

    let inserted = await this.insertIntoComposer(reference)
    if (!inserted && slug) {
      this.openSession(slug)
      inserted = await this.whenLoaded(8000).then(() => this.insertIntoComposer(reference)).catch(() => false)
    }
    if (inserted) {
      this.contents()?.focus()
      return { inserted: true, reference }
    }
    const { clipboard } = require('electron')
    clipboard.writeText(reference)
    return { inserted: false, copied: true, reference }
  }

  whenLoaded (timeoutMs) {
    const wc = this.contents()
    if (!wc) return Promise.reject(new Error('no panel'))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { wc.removeListener('did-finish-load', done); reject(new Error('timeout')) }, timeoutMs)
      const done = () => { clearTimeout(timer); resolve() }
      wc.once('did-finish-load', done)
    })
  }

  async insertIntoComposer (reference) {
    const wc = this.contents()
    if (!wc || !isAppUrl(wc.getURL(), this.origin())) return false
    // Read what is in the field, decide the new text here (src/lib/
    // reference.js), write it back and tell the page's own controller
    // (an `input` event runs its autoresize and draft-save).
    const current = await wc.executeJavaScript(`(() => {
      const el = document.querySelector(${JSON.stringify(COMPOSER_SELECTOR)})
      if (!el) return null
      return { value: el.value, caret: el.selectionStart }
    })()`, true).catch(() => null)
    if (!current) return false
    const next = insertIntoDraft(current.value, reference, current.caret)
    const ok = await wc.executeJavaScript(`(() => {
      const el = document.querySelector(${JSON.stringify(COMPOSER_SELECTOR)})
      if (!el) return false
      el.value = ${JSON.stringify(next.value)}
      el.setSelectionRange(${next.caret}, ${next.caret})
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.focus()
      el.scrollIntoView({ block: 'nearest' })
      return true
    })()`, true).catch(() => false)
    return Boolean(ok)
  }
}

// Unused imports kept explicit: BrowserWindow for symmetry with main.js's
// window bookkeeping, app for the version the offline page could show.
void BrowserWindow
void app

module.exports = { CodePanel, COMPOSER_SELECTOR }
