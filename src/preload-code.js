// The Code panel's preload — runs in the site's page, behind
// contextIsolation, with nothing exposed to it. Like the desktop app's
// preload it is nearly empty on purpose: the panel IS the web app.
//
// Its one job: the desktop app's page reserves a 40px title-bar strip at its
// top (body.is-desktop-app + .desktop-titlebar, keyed on the desktop user
// agent marker this panel also sends). The server drops that chrome for the
// editor's own marker (MobileHelper#desktop_titlebar_chrome?), and until
// every server does, this hides the same strip from here — the panel sits
// inside a window that already has a title bar, and a dead band across its
// top is the one thing the desktop treatment must not bring along.
//
// It also stamps data-desktop-captions="none": the panel is never under the
// OS's window buttons, so the site's top bar may use its whole width.

const STYLE_ID = 'cfa-editor-panel-style'

const css = `
  body.is-desktop-app { padding-top: 0 !important; }
  body.is-desktop-app .desktop-titlebar,
  body.is-desktop-app .desktop-history { display: none !important; }
`

function ensure () {
  const root = document.documentElement
  if (root && root.dataset.desktopCaptions !== 'none') root.dataset.desktopCaptions = 'none'
  const head = document.head || root
  if (!head || document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = css
  head.appendChild(style)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ensure, { once: true })
} else {
  ensure()
}
for (const event of ['pageshow', 'turbo:load', 'turbo:render']) {
  window.addEventListener(event, ensure)
}
