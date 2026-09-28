// A piece of code, as the composer receives it.
//
// The editor's "Add to session" takes what is selected in a file and puts it
// into the Code session's composer as a reference: the path and the line
// range on one line, then the code in a fenced block tagged with the file's
// language. The model reads the same convention it sees in a diff or a stack
// trace (`path:12-20`), so "what does this do?" typed under it needs no
// further explanation — and a person reading the transcript sees exactly
// what was asked about.
//
// Pure. The DOM side (finding the textarea inside the panel) is in
// src/code-panel.js; this module only decides the text.

const LANGUAGES = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx',
  rb: 'ruby', erb: 'erb', rake: 'ruby', gemspec: 'ruby',
  py: 'python', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', swift: 'swift',
  c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', hpp: 'cpp', cs: 'csharp', m: 'objectivec',
  php: 'php', sh: 'bash', bash: 'bash', zsh: 'zsh', fish: 'fish', ps1: 'powershell',
  html: 'html', htm: 'html', css: 'css', scss: 'scss', sass: 'sass', less: 'less',
  json: 'json', jsonc: 'json', yml: 'yaml', yaml: 'yaml', toml: 'toml', xml: 'xml',
  md: 'markdown', markdown: 'markdown', sql: 'sql', graphql: 'graphql', gql: 'graphql',
  vue: 'vue', svelte: 'svelte', dockerfile: 'dockerfile', lua: 'lua', ex: 'elixir', exs: 'elixir',
  scala: 'scala', clj: 'clojure', hs: 'haskell', dart: 'dart', r: 'r', tf: 'hcl', proto: 'protobuf',
}

const SPECIAL_FILES = {
  dockerfile: 'dockerfile', makefile: 'makefile', gemfile: 'ruby', rakefile: 'ruby',
  procfile: 'yaml', 'procfile.dev': 'yaml', '.gitignore': 'gitignore', '.env': 'dotenv',
}

function languageFor (filePath) {
  const base = String(filePath || '').split(/[\\/]/).pop().toLowerCase()
  if (SPECIAL_FILES[base]) return SPECIAL_FILES[base]
  const dot = base.lastIndexOf('.')
  if (dot < 0) return ''
  return LANGUAGES[base.slice(dot + 1)] || ''
}

// `path:12-20`, `path:12` for a single line, `path` for a whole file.
function locationLabel (relativePath, startLine, endLine) {
  const path = String(relativePath || '').replace(/\\/g, '/')
  if (!startLine) return path
  if (!endLine || endLine === startLine) return `${path}:${startLine}`
  return `${path}:${startLine}-${endLine}`
}

// A fence has to be longer than any run of backticks inside the code, or the
// block ends early and the rest of the snippet is read as prose.
function fenceFor (code) {
  const longest = (String(code).match(/`+/g) || []).reduce((n, run) => Math.max(n, run.length), 0)
  return '`'.repeat(Math.max(3, longest + 1))
}

// Trailing whitespace-only lines add nothing; leading indentation is kept,
// because for Python and YAML it is the code.
function trimSnippet (code) {
  return String(code).replace(/\s+$/, '')
}

function formatReference ({ path, startLine, endLine, code }) {
  const label = locationLabel(path, startLine, endLine)
  const language = languageFor(path)
  const fence = fenceFor(code)
  const body = trimSnippet(code)
  return `\`${label}\`\n${fence}${language}\n${body}\n${fence}\n`
}

// Where the reference goes relative to what is already in the field: on its
// own lines, with one blank line separating it from text on either side,
// and the caret left after it so the person can carry on typing the
// question.
function insertIntoDraft (draft, reference, caret) {
  const text = String(draft || '')
  const at = Number.isInteger(caret) ? Math.max(0, Math.min(caret, text.length)) : text.length
  const before = text.slice(0, at)
  const after = text.slice(at)

  let prefix = ''
  if (before.length > 0 && !before.endsWith('\n\n')) prefix = before.endsWith('\n') ? '\n' : '\n\n'

  let suffix = ''
  if (after.length > 0 && !after.startsWith('\n')) suffix = '\n'

  const inserted = prefix + reference + suffix
  const value = before + inserted + after
  // The caret sits right after the reference — before the blank line that
  // separates it from any text after — so the question is typed under it.
  return { value, caret: before.length + prefix.length + reference.length }
}

module.exports = { languageFor, locationLabel, fenceFor, formatReference, insertIntoDraft }
