// One JSON file, read whole and written whole. Every piece of state the
// editor keeps between launches (preferences, the recent list, each
// workspace's settings and layout) is small enough for that, and a file a
// person can open and read beats a database they cannot.

const fs = require('node:fs')
const path = require('node:path')

function readJson (file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

// Written to a sibling and renamed over the target, so a crash mid-write
// leaves the old file rather than half of the new one.
function writeJson (file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2))
  fs.renameSync(tmp, file)
}

// Coalesce a burst of saves (layout changes on every tab switch) into one
// write, and flush what is pending on demand (at quit).
function debouncedWriter (delayMs = 400) {
  const pending = new Map()
  let timer = null

  const flush = () => {
    clearTimeout(timer)
    timer = null
    for (const [file, value] of pending) {
      try { writeJson(file, value) } catch { /* a lost save costs one restore */ }
    }
    pending.clear()
  }

  const save = (file, value) => {
    pending.set(file, value)
    clearTimeout(timer)
    timer = setTimeout(flush, delayMs)
  }

  return { save, flush }
}

module.exports = { readJson, writeJson, debouncedWriter }
