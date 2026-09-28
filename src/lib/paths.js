// Path rules the file IPC enforces. The renderer names paths; the main
// process decides whether they are inside the folder the person opened.
// Symlinks are resolved by the caller (fs.realpath) before asking, so a link
// out of the workspace is judged by where it points.

const path = require('node:path')

// Directories the tree still shows but the index, the watcher and quick-open
// skip: nothing in them is something a person opens by name, and walking a
// node_modules can be a million files.
const IGNORED_DIRS = new Set([
  '.git', 'node_modules', '.hg', '.svn', 'dist', 'build', 'out', 'target',
  '.next', '.nuxt', '.cache', '.parcel-cache', '__pycache__', '.venv', 'venv',
  'vendor/bundle', 'tmp', 'log', 'coverage', '.turbo', '.idea', '.vscode',
])

function isIgnoredDir (name) {
  return IGNORED_DIRS.has(name)
}

// `target` is inside `root` (or is root itself), after normalisation.
// Compared as path segments, so "/home/me/app2" is not inside "/home/me/app".
function isInside (root, target) {
  if (!root || !target) return false
  const rel = path.relative(path.resolve(root), path.resolve(target))
  if (rel === '') return true
  return !rel.startsWith('..') && !path.isAbsolute(rel)
}

function relativeTo (root, target) {
  return path.relative(root, target).split(path.sep).join('/')
}

// Files the editor should not try to render as text: judged by extension
// first; the reader also sniffs for NUL bytes.
const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'icns', 'bmp', 'tiff', 'pdf', 'zip', 'gz', 'tgz', 'bz2', 'xz',
  '7z', 'rar', 'dmg', 'exe', 'dll', 'so', 'dylib', 'a', 'o', 'class', 'jar', 'war', 'wasm', 'mp3', 'mp4',
  'mov', 'avi', 'mkv', 'wav', 'flac', 'ogg', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'sqlite', 'db', 'rdb',
])

function looksBinaryByName (filePath) {
  const base = String(filePath).split(/[\\/]/).pop()
  const dot = base.lastIndexOf('.')
  if (dot < 0) return false
  return BINARY_EXTENSIONS.has(base.slice(dot + 1).toLowerCase())
}

function looksBinary (buffer) {
  const len = Math.min(buffer.length, 8000)
  for (let i = 0; i < len; i++) if (buffer[i] === 0) return true
  return false
}

module.exports = { IGNORED_DIRS, isIgnoredDir, isInside, relativeTo, looksBinaryByName, looksBinary }
