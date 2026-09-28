// Remembers where the window was, hand-rolled rather than a dependency: the
// whole job is one JSON file in userData and a debounced save.

const { app, screen } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_BOUNDS = { width: 1440, height: 900 }
const SAVE_DELAY_MS = 500

function stateFile () {
  return path.join(app.getPath('userData'), 'window-state.json')
}

// Saved bounds are only honoured when they still land on a connected display —
// a window restored to an unplugged monitor is a window the user cannot find.
function onSomeDisplay (bounds) {
  return screen.getAllDisplays().some(({ workArea }) => {
    return (
      bounds.x >= workArea.x - bounds.width + 100 &&
      bounds.y >= workArea.y &&
      bounds.x <= workArea.x + workArea.width - 100 &&
      bounds.y <= workArea.y + workArea.height - 100
    )
  })
}

function load () {
  try {
    const saved = JSON.parse(fs.readFileSync(stateFile(), 'utf8'))
    const bounds = saved.bounds
    if (
      Number.isFinite(bounds?.x) && Number.isFinite(bounds?.y) &&
      Number.isFinite(bounds?.width) && Number.isFinite(bounds?.height) &&
      onSomeDisplay(bounds)
    ) {
      return { bounds, isMaximized: Boolean(saved.isMaximized) }
    }
  } catch {
    // First run, or an unreadable file — either way the defaults are fine.
  }
  return { bounds: { ...DEFAULT_BOUNDS }, isMaximized: false }
}

function track (win) {
  let timer = null

  const save = () => {
    if (win.isDestroyed()) return
    const state = {
      bounds: win.isMaximized() ? load().bounds : win.getNormalBounds(),
      isMaximized: win.isMaximized(),
    }
    try {
      fs.writeFileSync(stateFile(), JSON.stringify(state))
    } catch {
      // A failed save costs one restore, nothing more.
    }
  }

  const scheduleSave = () => {
    clearTimeout(timer)
    timer = setTimeout(save, SAVE_DELAY_MS)
  }

  win.on('resize', scheduleSave)
  win.on('move', scheduleSave)
  win.on('close', () => {
    clearTimeout(timer)
    save()
  })
}

module.exports = { load, track }
