const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { isInside, relativeTo, isIgnoredDir, looksBinaryByName, looksBinary } = require('../src/lib/paths')

test('inside means the same folder or below it, by segment', () => {
  const root = path.resolve('/home/me/app')
  assert.equal(isInside(root, path.resolve('/home/me/app')), true)
  assert.equal(isInside(root, path.resolve('/home/me/app/src/x.js')), true)
  assert.equal(isInside(root, path.resolve('/home/me/app2/x.js')), false, 'a sibling that shares a prefix is outside')
  assert.equal(isInside(root, path.resolve('/home/me/app/../secrets')), false)
  assert.equal(isInside(root, path.resolve('/etc/passwd')), false)
  assert.equal(isInside('', '/x'), false)
})

test('relative paths are shown with forward slashes', () => {
  const root = path.resolve('/home/me/app')
  assert.equal(relativeTo(root, path.join(root, 'src', 'x.js')), 'src/x.js')
})

test('heavy directories are skipped by the index, not by the tree', () => {
  assert.equal(isIgnoredDir('node_modules'), true)
  assert.equal(isIgnoredDir('.git'), true)
  assert.equal(isIgnoredDir('src'), false)
})

test('binary files are recognised by name and by content', () => {
  assert.equal(looksBinaryByName('logo.png'), true)
  assert.equal(looksBinaryByName('README.md'), false)
  assert.equal(looksBinary(Buffer.from('hello\n')), false)
  assert.equal(looksBinary(Buffer.from([0x68, 0x00, 0x69])), true)
})
