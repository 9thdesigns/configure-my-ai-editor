// The editor area as a tree.
//
// A leaf is a GROUP: a strip of tabs with one active. A branch is a SPLIT:
// two or more children laid out in a row (side by side) or a column (one
// above the other), each with a share of the space. Splitting a group puts
// a new group beside it; closing a group's last tab removes it and collapses
// a split left with one child. Every function returns a new tree and leaves
// the one it was given alone, which is what lets the renderer treat the
// tree as state and re-render from it.
//
// Pure, and shared: the renderer bundles it (esbuild), the tests require it.

let nextId = 1
function newId (prefix) {
  return `${prefix}${nextId++}`
}

// Tests reset this so ids are predictable.
function resetIds () { nextId = 1 }

function group (tabs = [], active = null) {
  return { type: 'group', id: newId('g'), tabs: [...tabs], active: active ?? (tabs[0] ? tabs[0].id : null) }
}

function split (direction, children, sizes) {
  const shares = sizes && sizes.length === children.length ? [...sizes] : children.map(() => 1 / children.length)
  return { type: 'split', id: newId('s'), direction, children: [...children], sizes: shares }
}

function emptyLayout () {
  return group()
}

// ── Lookup ──────────────────────────────────────────────────────────────────

function findGroup (node, groupId) {
  if (!node) return null
  if (node.type === 'group') return node.id === groupId ? node : null
  for (const child of node.children) {
    const found = findGroup(child, groupId)
    if (found) return found
  }
  return null
}

function groups (node, out = []) {
  if (!node) return out
  if (node.type === 'group') out.push(node)
  else node.children.forEach((c) => groups(c, out))
  return out
}

function firstGroup (node) {
  return groups(node)[0] || null
}

function findTab (node, tabId) {
  for (const g of groups(node)) {
    const tab = g.tabs.find((t) => t.id === tabId)
    if (tab) return { group: g, tab }
  }
  return null
}

// Every group that has a tab for this document (the same file may be open in
// two groups after a split).
function groupsShowing (node, predicate) {
  return groups(node).filter((g) => g.tabs.some(predicate))
}

// ── Editing ─────────────────────────────────────────────────────────────────

function mapGroup (node, groupId, fn) {
  if (node.type === 'group') return node.id === groupId ? fn(node) : node
  const children = node.children.map((c) => mapGroup(c, groupId, fn))
  return children.every((c, i) => c === node.children[i]) ? node : { ...node, children }
}

function openTab (root, groupId, tab, { activate = true } = {}) {
  return mapGroup(root, groupId, (g) => {
    const existing = g.tabs.find((t) => t.id === tab.id)
    if (existing) return activate ? { ...g, active: tab.id } : g
    return { ...g, tabs: [...g.tabs, tab], active: activate ? tab.id : g.active }
  })
}

function activateTab (root, groupId, tabId) {
  return mapGroup(root, groupId, (g) => (g.tabs.some((t) => t.id === tabId) ? { ...g, active: tabId } : g))
}

function updateTab (root, tabId, patch) {
  let changed = false
  const walk = (node) => {
    if (node.type === 'group') {
      const i = node.tabs.findIndex((t) => t.id === tabId)
      if (i < 0) return node
      changed = true
      const tabs = node.tabs.slice()
      tabs[i] = { ...tabs[i], ...patch }
      return { ...node, tabs }
    }
    const children = node.children.map(walk)
    return children.every((c, i) => c === node.children[i]) ? node : { ...node, children }
  }
  const out = walk(root)
  return changed ? out : root
}

// Closing a tab picks the neighbour to the left (or the right, for the first
// tab) as the new active one, the way every tabbed editor does.
function closeTab (root, groupId, tabId) {
  let emptied = null
  const out = mapGroup(root, groupId, (g) => {
    const i = g.tabs.findIndex((t) => t.id === tabId)
    if (i < 0) return g
    const tabs = g.tabs.filter((t) => t.id !== tabId)
    let active = g.active
    if (g.active === tabId) active = tabs[i - 1]?.id ?? tabs[i]?.id ?? null
    const next = { ...g, tabs, active }
    if (tabs.length === 0) emptied = next.id
    return next
  })
  return emptied ? removeGroup(out, emptied) : out
}

// Removing the last group leaves one empty group rather than nothing: the
// editor area always has somewhere to open the next file.
function removeGroup (root, groupId) {
  if (root.type === 'group') return root.id === groupId ? group() : root
  const children = root.children
    .map((c) => (c.type === 'group' ? (c.id === groupId ? null : c) : removeGroup(c, groupId)))
    .filter(Boolean)
  if (children.length === root.children.length) {
    return children.every((c, i) => c === root.children[i]) ? root : { ...root, children }
  }
  if (children.length === 1) return children[0]
  if (children.length === 0) return group()
  const total = children.length
  return { ...root, children, sizes: children.map(() => 1 / total) }
}

// Put a fresh group beside `groupId`, in the given direction. Splitting in
// the direction of the parent split adds a sibling there; anything else
// nests a new split in the group's place. `carry` is the tab (if any) the new
// group opens with — "Split right" duplicates the current file.
function splitGroup (root, groupId, direction, carry = null) {
  const fresh = group(carry ? [carry] : [])
  const walk = (node) => {
    if (node.type === 'group') {
      if (node.id !== groupId) return node
      return split(direction, [node, fresh])
    }
    const i = node.children.findIndex((c) => c.type === 'group' && c.id === groupId)
    if (i >= 0 && node.direction === direction) {
      const children = node.children.slice()
      children.splice(i + 1, 0, fresh)
      const share = node.sizes[i] / 2
      const sizes = node.sizes.slice()
      sizes.splice(i, 1, share, share)
      return { ...node, children, sizes }
    }
    const children = node.children.map(walk)
    return children.every((c, k) => c === node.children[k]) ? node : { ...node, children }
  }
  return { layout: walk(root), groupId: fresh.id }
}

function moveTab (root, tabId, fromGroupId, toGroupId, index = null) {
  if (fromGroupId === toGroupId) {
    return mapGroup(root, fromGroupId, (g) => {
      const i = g.tabs.findIndex((t) => t.id === tabId)
      if (i < 0) return g
      const tabs = g.tabs.slice()
      const [tab] = tabs.splice(i, 1)
      const at = index === null ? tabs.length : Math.max(0, Math.min(index, tabs.length))
      tabs.splice(at, 0, tab)
      return { ...g, tabs, active: tabId }
    })
  }
  const found = findTab(root, tabId)
  if (!found || found.group.id !== fromGroupId) return root
  const target = findGroup(root, toGroupId)
  if (!target) return root
  let out = closeTab(root, fromGroupId, tabId)
  // closeTab may have removed the source group; the target survives either way.
  out = mapGroup(out, toGroupId, (g) => {
    const tabs = g.tabs.filter((t) => t.id !== tabId)
    const at = index === null ? tabs.length : Math.max(0, Math.min(index, tabs.length))
    tabs.splice(at, 0, found.tab)
    return { ...g, tabs, active: tabId }
  })
  return out
}

function resizeSplit (root, splitId, sizes) {
  const walk = (node) => {
    if (node.type === 'group') return node
    if (node.id === splitId) {
      const total = sizes.reduce((a, b) => a + b, 0) || 1
      return { ...node, sizes: sizes.map((s) => s / total) }
    }
    const children = node.children.map(walk)
    return children.every((c, i) => c === node.children[i]) ? node : { ...node, children }
  }
  return walk(root)
}

// ── Persistence ─────────────────────────────────────────────────────────────

// What is saved: the tree with each tab reduced to what reopens it. Ids are
// regenerated on restore, so a saved layout can never collide with a live
// one, and a tab whose file no longer exists is dropped by the restorer.
function serialize (root) {
  if (root.type === 'group') {
    return {
      type: 'group',
      tabs: root.tabs.map((t) => ({ kind: t.kind, path: t.path, title: t.title })),
      active: root.tabs.findIndex((t) => t.id === root.active),
    }
  }
  return { type: 'split', direction: root.direction, sizes: root.sizes, children: root.children.map(serialize) }
}

function deserialize (saved, makeTab) {
  if (!saved || typeof saved !== 'object') return group()
  if (saved.type === 'group') {
    const tabs = (saved.tabs || []).map(makeTab).filter(Boolean)
    const active = tabs[saved.active] ? tabs[saved.active].id : (tabs[0] ? tabs[0].id : null)
    return { ...group(tabs), active }
  }
  const children = (saved.children || []).map((c) => deserialize(c, makeTab)).filter(Boolean)
  const sizes = Array.isArray(saved.sizes) && saved.sizes.length === children.length ? saved.sizes : null
  if (children.length === 0) return group()
  if (children.length === 1) return children[0]
  return split(saved.direction === 'column' ? 'column' : 'row', children, sizes)
}

module.exports = {
  resetIds, group, split, emptyLayout,
  findGroup, groups, firstGroup, findTab, groupsShowing,
  openTab, activateTab, updateTab, closeTab, removeGroup, splitGroup, moveTab, resizeSplit,
  serialize, deserialize,
}
