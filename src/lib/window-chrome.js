// Which window chrome this OS and window manager want — the desktop app's
// rules (src/main.js there), kept pure so they can be tested without
// Electron. The window object options are assembled in src/main.js.

// Tiling Wayland/X11 window managers — Hyprland (what Omarchy runs), Sway,
// i3, niri, river. They draw no title bars of their own and move windows
// from the keyboard, so a caption strip with minimise/maximise buttons is
// dead weight there.
const TILING_DESKTOPS = /\b(hyprland|sway|i3|niri|river|bspwm|qtile|awesome|dwm|xmonad)\b/i

function isTilingWindowManager (platform, env) {
  if (platform !== 'linux') return false
  if (env.HYPRLAND_INSTANCE_SIGNATURE || env.SWAYSOCK || env.I3SOCK || env.NIRI_SOCKET) return true
  return TILING_DESKTOPS.test(`${env.XDG_CURRENT_DESKTOP || ''} ${env.XDG_SESSION_DESKTOP || ''} ${env.DESKTOP_SESSION || ''}`)
}

// Where the OS paints its window buttons over the page:
//   'left'  — macOS traffic lights
//   'right' — Windows / Linux Window Controls Overlay
//   'none'  — a tiling WM: no buttons at all
function captionSide (platform, env) {
  if (platform === 'darwin') return 'left'
  if (isTilingWindowManager(platform, env)) return 'none'
  return 'right'
}

module.exports = { isTilingWindowManager, captionSide }
