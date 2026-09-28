const test = require('node:test')
const assert = require('node:assert/strict')
const { isTilingWindowManager, captionSide } = require('../src/lib/window-chrome')

test('caption side per OS and window manager', () => {
  assert.equal(captionSide('darwin', {}), 'left')
  assert.equal(captionSide('win32', {}), 'right')
  assert.equal(captionSide('linux', { XDG_CURRENT_DESKTOP: 'GNOME' }), 'right')
  assert.equal(captionSide('linux', { HYPRLAND_INSTANCE_SIGNATURE: 'x' }), 'none')
  assert.equal(captionSide('linux', { XDG_SESSION_DESKTOP: 'sway' }), 'none')
  assert.equal(isTilingWindowManager('darwin', { SWAYSOCK: '/x' }), false)
})
