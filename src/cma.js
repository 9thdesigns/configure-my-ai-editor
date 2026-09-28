// The account side, spoken from the main process with the Code panel's own
// cookie jar: who is signed in, which Configure My AI workspace they are
// looking at, the Code sessions in it, and "New".
//
// There is no token to keep. The panel signs in like the desktop app does
// (a normal page, cookies in a persisted partition), and these requests go
// out through the same session, so they are signed in whenever the panel
// is. A write carries the page's CSRF token, read the way the site's own
// JavaScript reads it — see csrfToken() — because the API's null_session
// strategy empties an unverified cookie-authenticated POST.

const { ipcMain, session } = require('electron')
const { PANEL_PARTITION } = require('./config')
const { csrfTokenFromHtml, joinUrl } = require('./lib/cma-api')

class Cma {
  constructor ({ getOrigin, getPanel }) {
    this.getOrigin = getOrigin
    this.getPanel = getPanel
    this.csrf = null
  }

  ses () { return session.fromPartition(PANEL_PARTITION) }

  async fetch (path, init = {}) {
    const url = joinUrl(this.getOrigin(), path)
    const res = await this.ses().fetch(url, {
      ...init,
      credentials: 'include',
      headers: { Accept: 'application/json', ...(init.headers || {}) },
    })
    let body = null
    const text = await res.text()
    try { body = text ? JSON.parse(text) : null } catch { body = null }
    return { ok: res.ok, status: res.status, body, text }
  }

  // The panel's document first — it is right there and already signed in —
  // then a fetched page. Tokens are per session, so one is reused until a
  // write is refused with it.
  async csrfToken () {
    if (this.csrf) return this.csrf
    const panel = this.getPanel()
    if (panel) {
      const fromPanel = await panel.readCsrfToken().catch(() => null)
      if (fromPanel) return (this.csrf = fromPanel)
    }
    const res = await this.ses().fetch(joinUrl(this.getOrigin(), '/code'), {
      credentials: 'include',
      headers: { Accept: 'text/html' },
    })
    const html = await res.text()
    this.csrf = csrfTokenFromHtml(html)
    return this.csrf
  }

  async post (path, payload) {
    const attempt = async () => {
      const token = await this.csrfToken()
      return this.fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'X-CSRF-Token': token } : {}) },
        body: JSON.stringify(payload || {}),
      })
    }
    let res = await attempt()
    if (res.status === 401 || res.status === 422) {
      // A stale token (the session was renewed, or the panel signed in
      // again): take a fresh one and try once more.
      this.csrf = null
      res = await attempt()
    }
    return res
  }

  // ── What the renderer asks ────────────────────────────────────────────────

  // GET /api/session — the bootstrap the mobile app uses: user, workspace,
  // all workspaces. 401 means nobody is signed in.
  async whoami () {
    try {
      const res = await this.fetch('/api/session')
      if (res.status === 401) return { signedIn: false }
      if (!res.ok || !res.body) return { signedIn: false, error: `HTTP ${res.status}` }
      return { signedIn: true, ...res.body, origin: this.getOrigin() }
    } catch (e) {
      return { signedIn: false, error: e.message, offline: true }
    }
  }

  // GET /api/code/sessions — the sidebar's list. A 404 is a server that
  // predates the endpoint; the renderer then relies on the rail inside the
  // panel and says so.
  async sessions () {
    try {
      const res = await this.fetch('/api/code/sessions')
      if (res.status === 401) return { signedIn: false, sessions: [] }
      if (res.status === 404) return { signedIn: true, unsupported: true, sessions: [] }
      if (!res.ok || !res.body) return { signedIn: true, error: `HTTP ${res.status}`, sessions: [] }
      return { signedIn: true, ...res.body }
    } catch (e) {
      return { signedIn: false, error: e.message, offline: true, sessions: [] }
    }
  }

  async createSession ({ title } = {}) {
    const res = await this.post('/api/code/sessions', { session: { title: title || '' } })
    if (res.status === 404) return { unsupported: true }
    if (!res.ok) return { error: (res.body && res.body.error) || `HTTP ${res.status}` }
    return { session: res.body.session }
  }

  async activateWorkspace (id) {
    const res = await this.post(`/api/workspaces/${encodeURIComponent(id)}/activate`, {})
    if (!res.ok) return { error: (res.body && res.body.error) || `HTTP ${res.status}` }
    return { workspace: res.body.workspace }
  }

  register () {
    ipcMain.handle('cma:whoami', () => this.whoami())
    ipcMain.handle('cma:sessions', () => this.sessions())
    ipcMain.handle('cma:createSession', (_e, opts) => this.createSession(opts || {}))
    ipcMain.handle('cma:activateWorkspace', (_e, id) => this.activateWorkspace(id))
  }
}

module.exports = { Cma }
