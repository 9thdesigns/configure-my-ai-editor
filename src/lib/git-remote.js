// What a git remote URL says about where the code lives on GitHub.
//
// Any of the spellings git accepts:
//   https://github.com/owner/repo.git
//   git@github.com:owner/repo.git
//   ssh://git@github.com/owner/repo
//   github.com/owner/repo (a GitHub CLI shorthand people paste)
// A remote that is not GitHub still parses (host, path) so the status bar
// can name it; only GitHub gets the html url the "Open on GitHub" button
// needs.

function parseRemote (value) {
  const raw = String(value || '').trim()
  if (!raw) return null

  let host = null
  let path = null

  const scp = raw.match(/^(?:[\w.-]+@)?([\w.-]+):(?!\/\/)(.+)$/)
  if (scp) {
    host = scp[1]
    path = scp[2]
  } else {
    try {
      const url = new URL(raw.includes('://') ? raw : `https://${raw}`)
      host = url.hostname
      path = url.pathname
    } catch {
      return null
    }
  }

  path = path.replace(/^\/+/, '').replace(/\.git$/, '').replace(/\/+$/, '')
  const parts = path.split('/').filter(Boolean)
  if (parts.length < 2) return null

  const owner = parts[parts.length - 2]
  const repo = parts[parts.length - 1]
  const github = host.toLowerCase() === 'github.com'

  return {
    host,
    owner,
    repo,
    fullName: `${owner}/${repo}`,
    github,
    htmlUrl: github ? `https://github.com/${owner}/${repo}` : null,
  }
}

// `git status --porcelain=v2 --branch` → what the status bar shows.
function parseStatus (output) {
  const result = { branch: null, upstream: null, ahead: 0, behind: 0, changed: 0, untracked: 0, detached: false }
  for (const line of String(output || '').split('\n')) {
    if (line.startsWith('# branch.head ')) {
      const head = line.slice('# branch.head '.length).trim()
      result.branch = head === '(detached)' ? null : head
      result.detached = head === '(detached)'
    } else if (line.startsWith('# branch.upstream ')) {
      result.upstream = line.slice('# branch.upstream '.length).trim()
    } else if (line.startsWith('# branch.ab ')) {
      const m = line.match(/\+(\d+) -(\d+)/)
      if (m) { result.ahead = Number(m[1]); result.behind = Number(m[2]) }
    } else if (line.startsWith('1 ') || line.startsWith('2 ') || line.startsWith('u ')) {
      result.changed++
    } else if (line.startsWith('? ')) {
      result.untracked++
    }
  }
  return result
}

module.exports = { parseRemote, parseStatus }
