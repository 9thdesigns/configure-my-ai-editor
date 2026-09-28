// Where a URL may go: inside the Code panel, in an OAuth popup, or out to
// the system browser. Lifted from the desktop app's src/main.js so the
// panel keeps exactly the desktop shell's rules — the two are meant to be
// interchangeable windows onto the same site.
//
// Pure: no Electron here, so `npm test` can pin the policy.

// Hosts that must complete INSIDE the app: every OAuth provider the Rails
// app offers. Their round trip ends back on the app host, so sending them
// to the system browser would strand the session in the wrong cookie jar.
const AUTH_HOSTS = new Set([
  'accounts.google.com',
  'accounts.youtube.com',
  'github.com',
  'appleid.apple.com',
  'login.microsoftonline.com',
  'login.live.com',
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
  'linkedin.com',
  'www.linkedin.com',
  'twitter.com',
  'x.com',
  'api.twitter.com',
  'api.x.com',
  'slack.com',
])

// A few AUTH_HOSTS are also ordinary destinations — GitHub most of all: the
// app surfaces repo, PR and release links, and those need the user's
// BROWSER session, not this app's cookie jar. For these only the real
// sign-in / OAuth endpoints stay inside.
const AUTH_PATH_ONLY_HOSTS = new Set(['github.com'])

function parseUrl (value) {
  try {
    return new URL(String(value))
  } catch {
    return null
  }
}

function isGithubAuthPath (pathname) {
  return /^\/(login|session)(\/|$)/.test(pathname)
}

// The app host is a parameter rather than a constant: a developer runs the
// editor against a local Rails server (CMA_EDITOR_SERVER=http://localhost:3000),
// and that host is plain http.
function isAppUrl (value, appOrigin) {
  const url = parseUrl(value)
  const app = parseUrl(appOrigin)
  if (!url || !app) return false
  if (url.protocol !== app.protocol) return false
  if (url.hostname === app.hostname) return url.port === app.port
  return app.protocol === 'https:' && url.hostname.endsWith(`.${app.hostname}`)
}

function isAuthUrl (value) {
  const url = parseUrl(value)
  if (!url || url.protocol !== 'https:') return false
  if (!AUTH_HOSTS.has(url.hostname)) return false
  if (AUTH_PATH_ONLY_HOSTS.has(url.hostname)) return isGithubAuthPath(url.pathname)
  return true
}

// Only web URLs are ever handed to the OS: opening an arbitrary scheme
// externally is how a page launches things it shouldn't.
function isWebUrl (value) {
  const url = parseUrl(value)
  return Boolean(url && (url.protocol === 'https:' || url.protocol === 'http:'))
}

// One verdict for a navigation or a window.open, for both the panel and the
// OAuth popups it spawns.
//   'app'      stay in the panel
//   'auth'     allow, in a popup with a normal frame
//   'external' hand to the system browser (web URLs only) and deny here
//   'deny'     neither web nor ours — dropped
function decide (value, appOrigin) {
  if (isAppUrl(value, appOrigin)) return 'app'
  if (isAuthUrl(value)) return 'auth'
  if (isWebUrl(value)) return 'external'
  return 'deny'
}

module.exports = { AUTH_HOSTS, parseUrl, isAppUrl, isAuthUrl, isWebUrl, decide }
