// Draws the editor area from the layout tree (src/lib/layout.js): nested
// splits with draggable sashes, and in each group a tab strip over the body
// the editor view is mounted in. Bodies are kept per group across renders,
// so a redraw never unmounts an editor that is staying put.

import { h, icon, clear, basename } from './ui.js'

export class GroupsView {
  constructor ({ host, handlers }) {
    this.host = host
    this.H = handlers
    this.bodies = new Map()
    this.tabsEls = new Map()
    this.dragging = null
  }

  render (layout, activeGroupId, docs) {
    const live = new Set()
    const tree = this.build(layout, activeGroupId, docs, live)
    for (const id of [...this.bodies.keys()]) {
      if (!live.has(id)) { this.bodies.delete(id); this.tabsEls.delete(id); this.H.onGroupGone?.(id) }
    }
    clear(this.host).append(tree)
    for (const id of live) this.H.mount?.(id, this.bodies.get(id))
  }

  build (node, activeGroupId, docs, live) {
    if (node.type === 'split') {
      const el = h('div', { class: `split split--${node.direction}`, dataset: { id: node.id } })
      node.children.forEach((child, i) => {
        const childEl = this.build(child, activeGroupId, docs, live)
        childEl.style.flex = `${node.sizes[i]} 1 0`
        el.append(childEl)
        if (i < node.children.length - 1) el.append(this.sash(node, i, el))
      })
      return el
    }
    live.add(node.id)
    const body = this.bodies.get(node.id) || h('div', { class: 'group__body' })
    this.bodies.set(node.id, body)
    const tabs = h('div', {
      class: 'tabs',
      ondragover: (e) => { if (this.dragging) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } },
      ondrop: (e) => this.dropTab(e, node, null),
    })
    this.tabsEls.set(node.id, tabs)
    for (const tab of node.tabs) {
      const doc = docs.get(tab.id)
      const dirty = Boolean(doc && doc.dirty)
      tabs.append(h('div', {
        class: `tab ${tab.id === node.active ? 'is-active' : ''} ${dirty ? 'is-dirty' : ''} ${doc && doc.diskChanged ? 'is-stale' : ''}`,
        title: tab.path,
        draggable: 'true',
        dataset: { tab: tab.id },
        onmousedown: (e) => { if (e.button === 1) { e.preventDefault(); this.H.onCloseTab(node.id, tab.id) } },
        onclick: () => this.H.onActivateTab(node.id, tab.id),
        oncontextmenu: (e) => { e.preventDefault(); this.H.onTabContextMenu(node.id, tab.id, e) },
        ondragstart: (e) => { this.dragging = { tabId: tab.id, from: node.id }; e.dataTransfer.setData('text/x-cma-tab', tab.id); e.dataTransfer.effectAllowed = 'move' },
        ondragend: () => { this.dragging = null },
        ondrop: (e) => { e.stopPropagation(); this.dropTab(e, node, tab.id) },
      },
      h('span', { class: 'tab__title' }, tab.title || basename(tab.path)),
      h('span', { class: 'tab__close', title: 'Close (⌘W)', onclick: (e) => { e.stopPropagation(); this.H.onCloseTab(node.id, tab.id) } }, icon('close'), h('span', { class: 'tab__dot' })),
      ))
    }
    tabs.append(h('div', { class: 'tabs__spacer' }))
    tabs.append(h('div', { class: 'tabs__actions' },
      h('button', { class: 'iconbtn', title: 'Split right (⌘\\)', onclick: () => this.H.onSplit(node.id, 'row') }, icon('split')),
    ))
    const el = h('div', {
      class: `group ${node.id === activeGroupId ? 'is-active' : ''}`,
      dataset: { id: node.id },
      onmousedown: () => this.H.onFocusGroup(node.id),
      ondragover: (e) => { if (this.dragging || e.dataTransfer.types.includes('text/x-cma-path')) { e.preventDefault() } },
      ondrop: (e) => {
        const p = e.dataTransfer.getData('text/x-cma-path')
        if (p) { e.preventDefault(); this.H.onOpenPath(p, node.id) } else this.dropTab(e, node, null)
      },
    }, tabs, body)
    if (node.tabs.length === 0) {
      body.classList.add('is-empty')
      clear(body).append(this.emptyState())
    } else {
      body.classList.remove('is-empty')
    }
    return el
  }

  dropTab (e, node, beforeTabId) {
    if (!this.dragging) return
    e.preventDefault()
    const { tabId, from } = this.dragging
    this.dragging = null
    const index = beforeTabId ? node.tabs.findIndex((t) => t.id === beforeTabId) : null
    this.H.onMoveTab(tabId, from, node.id, index)
  }

  sash (split, index, container) {
    const vertical = split.direction === 'row'
    const el = h('div', { class: `sash ${vertical ? 'sash--v' : 'sash--h'}` })
    el.addEventListener('pointerdown', (down) => {
      down.preventDefault()
      el.setPointerCapture(down.pointerId)
      const rect = container.getBoundingClientRect()
      const total = vertical ? rect.width : rect.height
      const sizes = split.sizes.slice()
      const startPos = vertical ? down.clientX : down.clientY
      const a = sizes[index]
      const b = sizes[index + 1]
      const move = (ev) => {
        const delta = ((vertical ? ev.clientX : ev.clientY) - startPos) / total
        const min = 0.1
        const na = Math.max(min, Math.min(a + b - min, a + delta))
        const next = sizes.slice()
        next[index] = na
        next[index + 1] = a + b - na
        const children = [...container.children].filter((c) => !c.classList.contains('sash'))
        next.forEach((s, i) => { if (children[i]) children[i].style.flex = `${s} 1 0` })
        el.dataset.sizes = JSON.stringify(next)
      }
      const up = () => {
        el.removeEventListener('pointermove', move)
        el.removeEventListener('pointerup', up)
        if (el.dataset.sizes) this.H.onResize(split.id, JSON.parse(el.dataset.sizes))
      }
      el.addEventListener('pointermove', move)
      el.addEventListener('pointerup', up)
    })
    return el
  }

  emptyState () {
    const mod = window.cma.info.platform === 'darwin' ? '⌘' : 'Ctrl'
    return h('div', { class: 'empty' },
      h('div', { class: 'empty__logo' }, icon('chat')),
      h('div', { class: 'empty__title' }, 'Configure My AI Editor'),
      h('div', { class: 'empty__hints' },
        h('div', {}, h('kbd', {}, `${mod} P`), ' Quick open'),
        h('div', {}, h('kbd', {}, `${mod} ⇧ L`), ' Add selection to the session'),
        h('div', {}, h('kbd', {}, `${mod} ⇧ N`), ' New code session'),
        h('div', {}, h('kbd', {}, 'Ctrl `'), ' Terminal'),
        h('div', {}, h('kbd', {}, `${mod} \\`), ' Split right'),
      ),
    )
  }

  tabsElement (groupId) { return this.tabsEls.get(groupId) }
}
