const test = require('node:test')
const assert = require('node:assert/strict')
const { languageFor, locationLabel, fenceFor, formatReference, insertIntoDraft } = require('../src/lib/reference')

test('the language comes from the extension or a well-known file name', () => {
  assert.equal(languageFor('app/models/user.rb'), 'ruby')
  assert.equal(languageFor('src/main.js'), 'javascript')
  assert.equal(languageFor('C:\\code\\app\\index.tsx'), 'tsx')
  assert.equal(languageFor('Dockerfile'), 'dockerfile')
  assert.equal(languageFor('Gemfile'), 'ruby')
  assert.equal(languageFor('LICENSE'), '')
  assert.equal(languageFor('weird.unknownext'), '')
})

test('the location label reads like a stack trace', () => {
  assert.equal(locationLabel('app/models/user.rb', 12, 20), 'app/models/user.rb:12-20')
  assert.equal(locationLabel('app/models/user.rb', 12, 12), 'app/models/user.rb:12')
  assert.equal(locationLabel('app/models/user.rb', 12, null), 'app/models/user.rb:12')
  assert.equal(locationLabel('app/models/user.rb'), 'app/models/user.rb')
  assert.equal(locationLabel('lib\\win\\path.rb', 1, 2), 'lib/win/path.rb:1-2', 'Windows separators are shown as slashes')
})

test('a fence outgrows any backticks in the code', () => {
  assert.equal(fenceFor('plain'), '```')
  assert.equal(fenceFor('a ``` b'), '````')
  assert.equal(fenceFor('x ````` y'), '``````')
})

test('a reference is the label, then the code fenced with its language', () => {
  const out = formatReference({ path: 'app/models/user.rb', startLine: 3, endLine: 5, code: 'def name\n  first\nend\n\n' })
  assert.equal(out, '`app/models/user.rb:3-5`\n```ruby\ndef name\n  first\nend\n```\n')
})

test('a reference lands on its own lines and leaves the caret after it', () => {
  const ref = '`a.rb:1`\n```ruby\nx\n```\n'

  let r = insertIntoDraft('', ref)
  assert.equal(r.value, ref)
  assert.equal(r.caret, ref.length)

  r = insertIntoDraft('Why does this fail?', ref)
  assert.equal(r.value, `Why does this fail?\n\n${ref}`)

  r = insertIntoDraft('Look:\n', ref, 6)
  assert.equal(r.value, `Look:\n\n${ref}`)

  r = insertIntoDraft('before|after', ref, 6)
  assert.equal(r.value, `before\n\n${ref}\n|after`)
  assert.equal(r.value.slice(r.caret), '\n|after')
})
