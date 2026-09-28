// The terminal panel: tabs of xterm.js terminals, each backed by a pty in
// the main process (src/terminal.js). Bytes in, bytes out.

import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { h, icon, clear } from './ui.js'

const THEMES = {
  light: {
    background: '#ffffff', foreground: '#231d1b', cursor: '#2563eb', selectionBackground: 'rgba(37,99,235,0.2)',
    black: '#231d1b', red: '#c0392b', green: '#1e8449', yellow: '#b9770e', blue: '#2563eb', magenta: '#8e44ad', cyan: '#148f77', white: '#d5cfcb',
    brightBlack: '#6b625e', brightRed: '#e74c3c', brightGreen: '#27ae60', brightYellow: '#d68910', brightBlue: '#60a5fa', brightMagenta: '#a569bd', brightCyan: '#1abc9c', brightWhite: '#f4f1ef',
  },
  dark: {
    background: '#1a1412', foreground: '#f4f1ef', cursor: '#60a5fa', selectionBackground: 'rgba(96,165,250,0.25)',
    black: '#231d1b', red: '#ef6b5e', green: '#5ccc82', yellow: '#e2b84a', blue: '#60a5fa', magenta: '#c28bf0', cyan: '#4fd1c5', white: '#d5cfcb',
    brightBlack: '#8a7f79', brightRed: '#ff8a7a', brightGreen: '#7ee0a0', brightYellow: '#f5cf6b', brightBlue: '#8ec0ff', brightMagenta: '#d7a9ff', brightCyan: '#7fe3d9', brightWhite: '#ffffff',
  },
}

export class TerminalPanel {
  constructor ({ host, theme, fontSize, onCountChange }) {
    this.host = host
    this.theme = theme
    this.fontSize = fontSize
    this.onCountChange = onCountChange
    this.terms = new Map()
    this.active = null
    this.order = []

    this.tabsEl = h('div', { class: 'terminal__tabs' })
    this.bodyEl = h('div', { class: 'terminal__body' })
    host.append(this.tabsEl, this.bodyEl)

    this.offData = window.cma.on('term:data', (id, data) => { const t = this.terms.get(id); if (t) t.term.write(data) })
    this.offExit = window.cma.on('term:exit', (id) => this.remove(id, { exited: true }))

    this.resizeObserver = new ResizeObserver(() => this.fit())
    this.resizeObserver.observe(this.bodyEl)
    this.renderTabs()
  }

  get count () { return this.terms.size }

  async create ({ cwd = null, initialInput = null } = {}) {
    const term = new Terminal({
      cursorBlink: true,
      fontSize: this.fontSize,
      fontFamily: 'ui-monospace, "SF Mono", Menlo, Monaco, "Cascadia Mono", Consolas, "Liberation Mono", monospace',
      theme: THEMES[this.theme] || THEMES.dark,
      allowProposedApi: true,
      scrollback: 5000,
      macOptionIsMeta: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon((event, uri) => { event.preventDefault(); window.cma.invoke('shell:openExternal', uri) }))

    const el = h('div', { class: 'terminal__instance' })
    this.bodyEl.append(el)
    term.open(el)
    fit.fit()

    const created = await window.cma.invoke('term:create', { cols: term.cols, rows: term.rows, cwd })
    const id = created.id
    const entry = { id, term, fit, el, title: created.shell.split(/[\\/]/).pop() || 'shell', cwd: created.cwd }
    this.terms.set(id, entry)
    this.order.push(id)

    term.onData((data) => window.cma.send('term:input', id, data))
    term.onResize(({ cols, rows }) => window.cma.send('term:resize', id, cols, rows))
    term.onTitleChange((title) => { entry.title = title || entry.title; this.renderTabs() })

    this.activate(id)
    if (initialInput) window.cma.send('term:input', id, initialInput)
    if (this.onCountChange) this.onCountChange(this.terms.size)
    return id
  }

  activate (id) {
    if (!this.terms.has(id)) return
    this.active = id
    for (const [tid, t] of this.terms) t.el.classList.toggle('is-active', tid === id)
    this.renderTabs()
    this.fit()
    this.focus()
  }

  focus () {
    const t = this.terms.get(this.active)
    if (t) t.term.focus()
  }

  remove (id, { exited = false } = {}) {
    const t = this.terms.get(id)
    if (!t) return
    if (!exited) window.cma.send('term:kill', id)
    t.term.dispose()
    t.el.remove()
    this.terms.delete(id)
    this.order = this.order.filter((x) => x !== id)
    if (this.active === id) {
      this.active = null
      const next = this.order[this.order.length - 1]
      if (next) this.activate(next)
    }
    this.renderTabs()
    if (this.onCountChange) this.onCountChange(this.terms.size)
  }

  closeActive () { if (this.active) this.remove(this.active) }

  // Type into the active terminal (or a new one) — used by the GitHub pane
  // to run a companion command for the person to see and confirm.
  async run (command) {
    if (!this.active) await this.create({ initialInput: command })
    else window.cma.send('term:input', this.active, command)
    this.focus()
  }

  fit () {
    const t = this.terms.get(this.active)
    if (!t || !t.el.isConnected || t.el.clientHeight === 0) return
    try { t.fit.fit() } catch { /* hidden */ }
  }

  setTheme (theme) {
    this.theme = theme
    for (const t of this.terms.values()) t.term.options.theme = THEMES[theme] || THEMES.dark
  }

  setFontSize (size) {
    this.fontSize = size
    for (const t of this.terms.values()) t.term.options.fontSize = size
    this.fit()
  }

  renderTabs () {
    clear(this.tabsEl)
    for (const id of this.order) {
      const t = this.terms.get(id)
      if (!t) continue
      this.tabsEl.append(h('button', {
        class: `terminal__tab ${id === this.active ? 'is-active' : ''}`,
        onclick: () => this.activate(id),
        title: t.cwd,
      },
      icon('terminal'), h('span', {}, t.title),
      h('span', { class: 'terminal__tabclose', title: 'Kill terminal', onclick: (e) => { e.stopPropagation(); this.remove(id) } }, icon('close')),
      ))
    }
    this.tabsEl.append(h('button', { class: 'terminal__add', title: 'New terminal (⌘⇧`)', onclick: () => this.create() }, icon('plus')))
  }

  disposeAll () {
    for (const id of [...this.terms.keys()]) this.remove(id)
  }
}
