const test = require('node:test')
const assert = require('node:assert/strict')
const L = require('../src/lib/layout')

function tab (id) { return { id, kind: 'file', path: `/w/${id}`, title: id } }

test('opening, activating and closing tabs in one group', () => {
  L.resetIds()
  let root = L.emptyLayout()
  const g = root.id
  root = L.openTab(root, g, tab('a'))
  root = L.openTab(root, g, tab('b'))
  root = L.openTab(root, g, tab('c'))
  assert.deepEqual(L.findGroup(root, g).tabs.map((t) => t.id), ['a', 'b', 'c'])
  assert.equal(L.findGroup(root, g).active, 'c')

  root = L.openTab(root, g, tab('a'))
  assert.equal(L.findGroup(root, g).tabs.length, 3, 'reopening an open tab activates it')
  assert.equal(L.findGroup(root, g).active, 'a')

  root = L.activateTab(root, g, 'c')
  root = L.closeTab(root, g, 'c')
  assert.equal(L.findGroup(root, g).active, 'b', 'closing the active tab picks its left neighbour')

  root = L.activateTab(root, g, 'a')
  root = L.closeTab(root, g, 'a')
  assert.equal(L.findGroup(root, g).active, 'b', 'closing the first tab picks the one after it')
})

test('closing the last tab of the only group leaves an empty group', () => {
  L.resetIds()
  let root = L.openTab(L.emptyLayout(), 'g1', tab('a'))
  root = L.closeTab(root, 'g1', 'a')
  assert.equal(root.type, 'group')
  assert.equal(root.tabs.length, 0)
})

test('splitting nests, splitting again in the same direction adds a sibling, closing collapses', () => {
  L.resetIds()
  let root = L.openTab(L.emptyLayout(), 'g1', tab('a'))
  let r = L.splitGroup(root, 'g1', 'row', tab('a'))
  root = r.layout
  assert.equal(root.type, 'split')
  assert.equal(root.direction, 'row')
  assert.equal(root.children.length, 2)
  assert.deepEqual(root.sizes, [0.5, 0.5])
  const g2 = r.groupId
  assert.equal(L.findGroup(root, g2).tabs[0].id, 'a', 'split carries the current file over')

  r = L.splitGroup(root, g2, 'row')
  root = r.layout
  assert.equal(root.children.length, 3, 'same direction: a sibling, not a nested split')
  assert.equal(root.sizes.reduce((x, y) => x + y, 0).toFixed(6), '1.000000')

  r = L.splitGroup(root, 'g1', 'column')
  root = r.layout
  assert.equal(root.children[0].type, 'split', 'other direction: nested in place')
  assert.equal(root.children[0].direction, 'column')

  const g4 = r.groupId
  root = L.removeGroup(root, g4)
  assert.equal(root.children[0].type, 'group', 'a split left with one child collapses to it')
  assert.equal(root.children[0].id, 'g1')
})

test('a tab moves between groups and the emptied source goes away', () => {
  L.resetIds()
  let root = L.openTab(L.emptyLayout(), 'g1', tab('a'))
  const r = L.splitGroup(root, 'g1', 'row')
  root = r.layout
  root = L.moveTab(root, 'a', 'g1', r.groupId)
  assert.equal(root.type, 'group', 'source emptied → split collapsed to the target')
  assert.equal(root.id, r.groupId)
  assert.equal(root.active, 'a')
})

test('the tree round-trips through serialize/deserialize with fresh ids', () => {
  L.resetIds()
  let root = L.openTab(L.emptyLayout(), 'g1', tab('a'))
  root = L.openTab(root, 'g1', tab('b'))
  root = L.splitGroup(root, 'g1', 'column', tab('b')).layout
  const saved = JSON.parse(JSON.stringify(L.serialize(root)))
  const restored = L.deserialize(saved, (t) => ({ ...t, id: `new:${t.path}` }))
  assert.equal(restored.type, 'split')
  assert.equal(restored.direction, 'column')
  assert.deepEqual(L.groups(restored).map((g) => g.tabs.map((t) => t.id)), [['new:/w/a', 'new:/w/b'], ['new:/w/b']])
  assert.equal(L.groups(restored)[0].active, 'new:/w/b')
  assert.notEqual(restored.id, root.id)
  assert.equal(L.deserialize({ type: 'split', children: [] }).type, 'group', 'nothing restorable → one empty group')
})

test('updateTab patches every copy of a tab id, wherever it is', () => {
  L.resetIds()
  let root = L.openTab(L.emptyLayout(), 'g1', tab('a'))
  root = L.updateTab(root, 'a', { title: 'renamed', dirty: true })
  assert.equal(L.findTab(root, 'a').tab.title, 'renamed')
  assert.equal(L.updateTab(root, 'zzz', { title: 'x' }), root, 'an unknown tab returns the same tree')
})
