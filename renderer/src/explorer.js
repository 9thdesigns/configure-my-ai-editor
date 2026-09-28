// The file tree. Directories load when opened and are re-read when the
// watcher says something under them changed; nothing is read ahead.

import { h, icon, clear, basename } from './ui.js'

export class Explorer {
  constructor ({ host, onOpen, onContextMenu, onDrop }) {
    this.host = host
    this.onOpen = onOpen
    this.onContextMenu = onContextMenu
    this.onDrop = onDrop
    this.root = null
    this.name = ''
    this.expanded = new Set()
    this.cache = new Map()
    this.selected = null
    this.sep = window.cma.info.platform === 'win32' ? '\\' : '/'
    this.showHidden = true
    this.excludes = new Set()
    this.listEl = h('div', { class: 'tree', role: 'tree' })
    host.append(this.listEl)
    this.listEl.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('[data-path]')
      e.preventDefault()
      if (this.onContextMenu) this.onContextMenu(row ? { path: row.dataset.path, type: row.dataset.type } : { path: this.root, type: 'dir' }, e)
    })
  }

  setRoot (root, name, { showHidden = true, excludeDirs = [] } = {}) {
    this.root = root
    this.name = name || basename(root)
    this.expanded = new Set(root ? [root] : [])
    this.cache.clear()
    this.selected = null
    this.showHidden = showHidden
    this.excludes = new Set(excludeDirs)
    return this.render()
  }

  setOptions ({ showHidden, excludeDirs }) {
    if (typeof showHidden === 'boolean') this.showHidden = showHidden
    if (Array.isArray(excludeDirs)) this.excludes = new Set(excludeDirs)
    return this.render()
  }

  async entries (dir) {
    if (!this.cache.has(dir)) {
      try {
        this.cache.set(dir, await window.cma.invoke('fs:list', dir))
      } catch {
        this.cache.set(dir, [])
      }
    }
    return this.cache.get(dir)
  }

  // Something changed on disk: forget the directories involved and redraw
  // whatever is expanded.
  async changed (paths) {
    for (const p of paths) {
      this.cache.delete(p)
      this.cache.delete(this.parent(p))
    }
    return this.render()
  }

  parent (p) {
    const i = p.lastIndexOf(this.sep)
    return i > 0 ? p.slice(0, i) : p
  }

  async toggle (dir) {
    if (this.expanded.has(dir)) this.expanded.delete(dir)
    else this.expanded.add(dir)
    return this.render()
  }

  // Expand every directory down to a file and mark it.
  async reveal (filePath) {
    if (!this.root || !filePath.startsWith(this.root)) return
    let dir = this.parent(filePath)
    const dirs = []
    while (dir && dir.length >= this.root.length) {
      dirs.unshift(dir)
      if (dir === this.root) break
      dir = this.parent(dir)
    }
    dirs.forEach((d) => this.expanded.add(d))
    this.selected = filePath
    await this.render()
    this.listEl.querySelector(`[data-path="${CSS.escape(filePath)}"]`)?.scrollIntoView({ block: 'nearest' })
  }

  setSelected (filePath) {
    this.selected = filePath
    for (const row of this.listEl.querySelectorAll('.tree__row')) row.classList.toggle('is-selected', row.dataset.path === filePath)
  }

  async render () {
    if (!this.root) { clear(this.listEl); return }
    const frag = document.createDocumentFragment()
    frag.append(h('div', {
      class: `tree__row tree__row--root ${this.expanded.has(this.root) ? 'is-open' : ''}`,
      dataset: { path: this.root, type: 'dir' },
      onclick: () => this.toggle(this.root),
    }, icon('chevron', 'tree__chevron'), h('span', { class: 'tree__name' }, this.name)))
    if (this.expanded.has(this.root)) await this.renderDir(this.root, 1, frag)
    clear(this.listEl).append(frag)
  }

  async renderDir (dir, depth, frag) {
    const entries = await this.entries(dir)
    for (const entry of entries) {
      if (!this.showHidden && entry.name.startsWith('.')) continue
      if (entry.type === 'dir' && this.excludes.has(entry.name)) continue
      const isDir = entry.type === 'dir'
      const open = isDir && this.expanded.has(entry.path)
      const row = h('div', {
        class: `tree__row ${isDir ? 'tree__row--dir' : 'tree__row--file'} ${open ? 'is-open' : ''} ${this.selected === entry.path ? 'is-selected' : ''} ${entry.name.startsWith('.') ? 'is-hidden' : ''}`,
        style: { paddingLeft: `${8 + depth * 14}px` },
        dataset: { path: entry.path, type: entry.type },
        title: entry.path,
        draggable: 'true',
        onclick: () => { if (isDir) this.toggle(entry.path); else { this.setSelected(entry.path); this.onOpen(entry.path) } },
        ondragstart: (e) => { e.dataTransfer.setData('text/x-cma-path', entry.path); e.dataTransfer.effectAllowed = 'copyMove' },
      },
      isDir ? icon('chevron', 'tree__chevron') : h('span', { class: 'tree__spacer' }),
      icon(isDir ? 'folder' : 'file', 'tree__icon'),
      h('span', { class: 'tree__name' }, entry.name),
      )
      frag.append(row)
      if (open) await this.renderDir(entry.path, depth + 1, frag)
    }
  }
}
