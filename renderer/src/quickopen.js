// Quick open: type part of a path, pick a file. The index is every file
// under the folder (src/files.js), scored here.

import { h, icon, clear } from './ui.js'

function score (query, candidate) {
  const q = query.toLowerCase()
  const c = candidate.toLowerCase()
  if (!q) return 1
  let qi = 0
  let total = 0
  let streak = 0
  for (let i = 0; i < c.length && qi < q.length; i++) {
    if (c[i] === q[qi]) {
      qi++
      streak++
      // Consecutive matches, and matches at the start of a segment or
      // after a separator, are worth more.
      total += 1 + streak + (i === 0 || '/-_.'.includes(c[i - 1]) ? 4 : 0)
    } else {
      streak = 0
    }
  }
  if (qi < q.length) return 0
  const base = c.slice(c.lastIndexOf('/') + 1)
  if (base.includes(q)) total += 20
  if (base.startsWith(q)) total += 10
  return total / (1 + c.length / 80)
}

export class QuickOpen {
  constructor ({ getIndex, onPick, anchor }) {
    this.getIndex = getIndex
    this.onPick = onPick
    this.anchor = anchor
    this.el = null
    this.results = []
    this.cursor = 0
  }

  get isOpen () { return Boolean(this.el) }

  async open () {
    if (this.el) { this.input.focus(); return }
    this.input = h('input', { class: 'palette__input', placeholder: 'Type a file name…', spellcheck: 'false' })
    this.list = h('div', { class: 'palette__list' })
    this.el = h('div', { class: 'palette', onmousedown: (e) => { if (e.target === this.el) this.close() } },
      h('div', { class: 'palette__box' }, h('div', { class: 'palette__row' }, icon('search'), this.input), this.list),
    )
    ;(this.anchor || document.body).append(this.el)
    this.input.addEventListener('input', () => this.filter())
    this.input.addEventListener('keydown', (e) => this.keydown(e))
    this.input.focus()
    this.index = await this.getIndex().catch(() => [])
    this.filter()
  }

  close () {
    if (!this.el) return
    this.el.remove()
    this.el = null
  }

  filter () {
    const q = this.input.value.trim()
    const index = this.index || []
    const scored = []
    for (const p of index) {
      const s = score(q, p)
      if (s > 0) scored.push([s, p])
    }
    scored.sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1]))
    this.results = scored.slice(0, 60).map(([, p]) => p)
    this.cursor = 0
    this.renderList()
  }

  renderList () {
    clear(this.list)
    if (this.results.length === 0) {
      this.list.append(h('div', { class: 'palette__empty' }, this.index ? 'No matching files' : 'Indexing…'))
      return
    }
    this.results.forEach((p, i) => {
      const slash = p.lastIndexOf('/')
      this.list.append(h('div', {
        class: `palette__item ${i === this.cursor ? 'is-active' : ''}`,
        onmousedown: (e) => { e.preventDefault(); this.pick(i) },
        onmousemove: () => { if (this.cursor !== i) { this.cursor = i; this.renderList() } },
      },
      icon('file'),
      h('span', { class: 'palette__name' }, p.slice(slash + 1)),
      slash > 0 ? h('span', { class: 'palette__dir' }, p.slice(0, slash)) : null,
      ))
    })
    this.list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' })
  }

  keydown (e) {
    if (e.key === 'Escape') { e.preventDefault(); this.close() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); this.cursor = Math.min(this.results.length - 1, this.cursor + 1); this.renderList() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.cursor = Math.max(0, this.cursor - 1); this.renderList() }
    else if (e.key === 'Enter') { e.preventDefault(); this.pick(this.cursor) }
  }

  pick (i) {
    const p = this.results[i]
    this.close()
    if (p) this.onPick(p)
  }
}
