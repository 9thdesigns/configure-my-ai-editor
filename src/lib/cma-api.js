// The account side of the editor, as data: which URLs to ask, how to read
// the page's CSRF token, and how a session row is shown. The fetching is in
// src/cma.js (it needs Electron's session); this half is testable on its own.

// The Rails app's page carries `<meta name="csrf-token" content="…">`. The
// editor reads it off the panel's document when it can, and off a fetched
// page when the panel is showing something else — this parser is the second
// case.
function csrfTokenFromHtml (html) {
  const m = String(html || '').match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/i) ||
            String(html || '').match(/<meta\s+content="([^"]+)"\s+name="csrf-token"/i)
  return m ? m[1] : null
}

function joinUrl (origin, path) {
  const base = String(origin || '').replace(/\/+$/, '')
  const rel = String(path || '')
  if (/^https?:\/\//i.test(rel)) return rel
  return `${base}${rel.startsWith('/') ? '' : '/'}${rel}`
}

// The desktop app identifies itself with one token appended to Chromium's
// user agent; the editor appends that one AND its own, so the server gives
// the panel the desktop treatment (no marketing chrome, email/password
// sign-in, the GitHub connect handoff) and can still tell a panel from a
// window (no desktop title-bar strip). MobileHelper in the Rails app is the
// other half of this contract.
function userAgentSuffix (version) {
  return `ConfigureMyAI-Desktop/${version} ConfigureMyAI-Editor/${version}`
}

const STATUS_LABELS = {
  idle: 'Idle',
  thinking: 'Thinking',
  streaming: 'Working',
  applying: 'Applying',
  awaiting_input: 'Needs you',
  paused: 'Paused',
  error: 'Error',
  archived: 'Archived',
}

function statusLabel (status) {
  return STATUS_LABELS[status] || (status ? String(status) : '')
}

function isLive (status) {
  return status === 'thinking' || status === 'streaming' || status === 'applying'
}

// "just now", "4m", "2h", "3d", then the date — the rail's vocabulary.
function relativeTime (iso, now = Date.now()) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.round(h / 24)
  if (d < 14) return `${d}d`
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// The slug of the session a panel URL shows, or null off a session page.
function sessionSlugFromPath (pathname) {
  const m = String(pathname || '').match(/^\/code\/sessions\/([a-z0-9][a-z0-9-]*)(?:\/|$)/i)
  return m ? m[1] : null
}

module.exports = { csrfTokenFromHtml, joinUrl, userAgentSuffix, statusLabel, isLive, relativeTime, sessionSlugFromPath }
