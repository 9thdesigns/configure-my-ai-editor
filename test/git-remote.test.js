const test = require('node:test')
const assert = require('node:assert/strict')
const { parseRemote, parseStatus } = require('../src/lib/git-remote')

test('every spelling of a GitHub remote names the same repository', () => {
  for (const remote of [
    'https://github.com/9thdesigns/configure-my-ai-editor.git',
    'git@github.com:9thdesigns/configure-my-ai-editor.git',
    'ssh://git@github.com/9thdesigns/configure-my-ai-editor',
    'github.com/9thdesigns/configure-my-ai-editor',
  ]) {
    const r = parseRemote(remote)
    assert.equal(r.fullName, '9thdesigns/configure-my-ai-editor', remote)
    assert.equal(r.github, true, remote)
    assert.equal(r.htmlUrl, 'https://github.com/9thdesigns/configure-my-ai-editor', remote)
  }
})

test('a remote elsewhere still parses, without a GitHub url', () => {
  const r = parseRemote('git@gitlab.com:team/thing.git')
  assert.equal(r.host, 'gitlab.com')
  assert.equal(r.fullName, 'team/thing')
  assert.equal(r.github, false)
  assert.equal(r.htmlUrl, null)
  assert.equal(parseRemote(''), null)
  assert.equal(parseRemote('nonsense'), null)
})

test('porcelain v2 status becomes the status-bar summary', () => {
  const out = [
    '# branch.oid abc',
    '# branch.head main',
    '# branch.upstream origin/main',
    '# branch.ab +2 -1',
    '1 .M N... 100644 100644 100644 abc abc src/main.js',
    '1 A. N... 000000 100644 100644 000 abc src/new.js',
    '? notes.txt',
  ].join('\n')
  const s = parseStatus(out)
  assert.deepEqual(s, { branch: 'main', upstream: 'origin/main', ahead: 2, behind: 1, changed: 2, untracked: 1, detached: false })
  assert.equal(parseStatus('# branch.head (detached)').detached, true)
})
