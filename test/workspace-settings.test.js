const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeSettings, normalizePreferences, rememberRecent, forgetRecent, DEFAULT_SETTINGS, RECENT_LIMIT } = require('../src/lib/workspace-settings')

test('an empty or broken settings file comes out complete', () => {
  assert.deepEqual(normalizeSettings(undefined), normalizeSettings({}))
  assert.equal(normalizeSettings(null).tabSize, DEFAULT_SETTINGS.tabSize)
  assert.equal(normalizeSettings('junk').codePanel.width, DEFAULT_SETTINGS.codePanel.width)
})

test('values are kept when usable and clamped or defaulted when not', () => {
  const s = normalizeSettings({ tabSize: 4, fontSize: 900, autoSave: 'always', codePanel: { width: 10, session: 'abc' }, unknown: 1 })
  assert.equal(s.tabSize, 4)
  assert.equal(s.fontSize, 40)
  assert.equal(s.autoSave, 'off')
  assert.equal(s.codePanel.width, 320)
  assert.equal(s.codePanel.session, 'abc')
  assert.equal('unknown' in s, false)
})

test('preferences normalise the server url and the theme', () => {
  const p = normalizePreferences({ theme: 'dark', serverUrl: 'http://localhost:3000/// ' })
  assert.equal(p.theme, 'dark')
  assert.equal(p.serverUrl, 'http://localhost:3000')
  assert.equal(normalizePreferences({ theme: 'sepia' }).theme, 'system')
})

test('the recent list is most-recent-first, deduplicated and bounded', () => {
  let list = []
  for (let i = 0; i < RECENT_LIMIT + 3; i++) list = rememberRecent(list, { path: `/p/${i}`, name: `${i}`, openedAt: i })
  assert.equal(list.length, RECENT_LIMIT)
  assert.equal(list[0].path, `/p/${RECENT_LIMIT + 2}`)
  list = rememberRecent(list, { path: '/p/5', name: '5', openedAt: 99 })
  assert.equal(list[0].path, '/p/5')
  assert.equal(list.filter((e) => e.path === '/p/5').length, 1)
  assert.equal(forgetRecent(list, '/p/5').some((e) => e.path === '/p/5'), false)
})
