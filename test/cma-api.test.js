const test = require('node:test')
const assert = require('node:assert/strict')
const { csrfTokenFromHtml, joinUrl, userAgentSuffix, statusLabel, isLive, relativeTime, sessionSlugFromPath } = require('../src/lib/cma-api')

test('the CSRF token is read off a page either way round', () => {
  assert.equal(csrfTokenFromHtml('<head><meta name="csrf-token" content="abc+/=" /></head>'), 'abc+/=')
  assert.equal(csrfTokenFromHtml('<meta content="xyz" name="csrf-token">'), 'xyz')
  assert.equal(csrfTokenFromHtml('<meta name="csrf-param" content="authenticity_token">'), null)
})

test('urls join without doubling or dropping the slash', () => {
  assert.equal(joinUrl('https://configuremyai.com/', '/code'), 'https://configuremyai.com/code')
  assert.equal(joinUrl('https://configuremyai.com', 'code'), 'https://configuremyai.com/code')
  assert.equal(joinUrl('https://x', 'https://y/z'), 'https://y/z')
})

test('the user agent carries the desktop marker and the editor marker', () => {
  assert.equal(userAgentSuffix('0.1.0'), 'ConfigureMyAI-Desktop/0.1.0 ConfigureMyAI-Editor/0.1.0')
})

test('statuses read as words and the live ones are known', () => {
  assert.equal(statusLabel('awaiting_input'), 'Needs you')
  assert.equal(statusLabel('made_up'), 'made_up')
  assert.equal(isLive('streaming'), true)
  assert.equal(isLive('idle'), false)
})

test('relative times use the rail vocabulary', () => {
  const now = Date.parse('2026-09-28T12:00:00Z')
  assert.equal(relativeTime('2026-09-28T11:59:50Z', now), 'just now')
  assert.equal(relativeTime('2026-09-28T11:56:00Z', now), '4m')
  assert.equal(relativeTime('2026-09-28T09:00:00Z', now), '3h')
  assert.equal(relativeTime('2026-09-25T12:00:00Z', now), '3d')
  assert.equal(relativeTime('garbage', now), '')
})

test('the session slug is read off a panel url', () => {
  assert.equal(sessionSlugFromPath('/code/sessions/ab12-cd'), 'ab12-cd')
  assert.equal(sessionSlugFromPath('/code/sessions/ab12/messages'), 'ab12')
  assert.equal(sessionSlugFromPath('/code/sessions/all'), 'all', 'the router decides what "all" means, not this')
  assert.equal(sessionSlugFromPath('/code'), null)
})
