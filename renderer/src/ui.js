// Small DOM helpers: an element builder, the icon set, toasts and a prompt
// dialog (window.prompt does not exist in an Electron renderer).

export function h (tag, attrs = {}, ...children) {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue
    if (key === 'class') el.className = value
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value)
    else if (key === 'dataset') Object.assign(el.dataset, value)
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value)
    else if (key === 'html') el.innerHTML = value
    else if (value === true) el.setAttribute(key, '')
    else el.setAttribute(key, String(value))
  }
  append(el, children)
  return el
}

export function append (el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue
    el.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
  return el
}

export function clear (el) {
  while (el.firstChild) el.removeChild(el.firstChild)
  return el
}

export function debounce (fn, ms) {
  let timer = null
  const wrapped = (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
  wrapped.cancel = () => clearTimeout(timer)
  return wrapped
}

const ICONS = {
  files: '<path d="M3.5 2.5h5l4 4v7a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z"/><path d="M8.5 2.5v4h4"/>',
  sessions: '<path d="M2.5 3.5h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H7l-3 2.5v-2.5H2.5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z"/><path d="M5 6.5h6M5 8.5h4"/>',
  github: '<path d="M8 1.5a6.5 6.5 0 0 0-2.06 12.67c.33.06.45-.14.45-.31v-1.1c-1.81.39-2.19-.87-2.19-.87-.3-.75-.72-.95-.72-.95-.59-.4.04-.39.04-.39.65.05 1 .67 1 .67.58.99 1.52.7 1.89.54.06-.42.23-.7.41-.87-1.44-.16-2.96-.72-2.96-3.21 0-.71.25-1.29.67-1.74-.07-.17-.29-.83.06-1.72 0 0 .55-.17 1.79.66a6.2 6.2 0 0 1 3.26 0c1.24-.83 1.79-.66 1.79-.66.35.89.13 1.55.06 1.72.42.45.67 1.03.67 1.74 0 2.5-1.52 3.05-2.97 3.21.23.2.44.6.44 1.2v1.78c0 .17.12.38.45.31A6.5 6.5 0 0 0 8 1.5z" fill="currentColor" stroke="none"/>',
  settings: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1"/>',
  chevron: '<path d="M6 3.5 10.5 8 6 12.5"/>',
  folder: '<path d="M1.5 4.5a1 1 0 0 1 1-1h3l1.5 1.5h6.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"/>',
  file: '<path d="M4 1.5h5l3.5 3.5v9a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5v-12a.5.5 0 0 1 .5-.5z"/><path d="M9 1.5v3.5h3.5"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  back: '<path d="M10 3.5 5.5 8l4.5 4.5"/>',
  forward: '<path d="M6 3.5 10.5 8 6 12.5"/>',
  reload: '<path d="M13 8a5 5 0 1 1-1.5-3.6"/><path d="M13 2.5v3h-3"/>',
  external: '<path d="M7 3H3.5a1 1 0 0 0-1 1v8.5a1 1 0 0 0 1 1H12a1 1 0 0 0 1-1V9"/><path d="M9.5 2.5H13.5V6.5M13.5 2.5 7.5 8.5"/>',
  terminal: '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M4.5 6l2.5 2-2.5 2M8.5 10h3"/>',
  split: '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M8 2.5v11"/>',
  panel: '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M10 2.5v11"/>',
  sidebar: '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M6 2.5v11"/>',
  chat: '<path d="M2.5 3.5h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H7l-3 2.5v-2.5H2.5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z"/>',
  branch: '<circle cx="4.5" cy="3.5" r="1.5"/><circle cx="4.5" cy="12.5" r="1.5"/><circle cx="11.5" cy="5.5" r="1.5"/><path d="M4.5 5v6M11.5 7c0 2.5-3 3-5 3.5"/>',
  check: '<path d="M3 8.5l3 3 7-7"/>',
  warn: '<path d="M8 2.5 14 13H2z"/><path d="M8 6.5v3M8 11.2v.3"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/>',
  dot: '<circle cx="8" cy="8" r="3" fill="currentColor" stroke="none"/>',
  user: '<circle cx="8" cy="5.5" r="3"/><path d="M2.5 14a5.5 5.5 0 0 1 11 0"/>',
  pencil: '<path d="M11.5 2.5l2 2-8 8-3 1 1-3z"/>',
  trash: '<path d="M2.5 4.5h11M6 4.5v-2h4v2M4 4.5l.7 9h6.6l.7-9"/>',
}

export function icon (name, cls = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.5')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.classList.add('icon')
  if (cls) svg.classList.add(...cls.split(' '))
  svg.innerHTML = ICONS[name] || ''
  return svg
}

// ── Toasts ──────────────────────────────────────────────────────────────────

let toastHost = null

export function toast (message, { kind = 'info', action = null, timeout = 4500 } = {}) {
  if (!toastHost) {
    toastHost = h('div', { class: 'toasts' })
    document.body.append(toastHost)
  }
  const el = h('div', { class: `toast toast--${kind}` }, h('span', { class: 'toast__text' }, message))
  const remove = () => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 180) }
  if (action) {
    el.append(h('button', { class: 'toast__action', onclick: () => { remove(); action.onClick() } }, action.label))
  }
  el.append(h('button', { class: 'toast__close', 'aria-label': 'Dismiss', onclick: remove }, icon('close')))
  toastHost.append(el)
  if (timeout) setTimeout(remove, timeout)
  return remove
}

// ── Prompt / confirm ────────────────────────────────────────────────────────

export function prompt ({ title, label = '', value = '', placeholder = '', okLabel = 'OK', selectBaseName = false }) {
  return new Promise((resolve) => {
    const input = h('input', { class: 'dialog__input', type: 'text', value, placeholder, spellcheck: 'false' })
    const done = (result) => { overlay.remove(); resolve(result) }
    const overlay = h('div', { class: 'overlay', onmousedown: (e) => { if (e.target === overlay) done(null) } },
      h('form', {
        class: 'dialog',
        onsubmit: (e) => { e.preventDefault(); done(input.value) },
      },
      h('div', { class: 'dialog__title' }, title),
      label ? h('label', { class: 'dialog__label' }, label) : null,
      input,
      h('div', { class: 'dialog__actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => done(null) }, 'Cancel'),
        h('button', { type: 'submit', class: 'btn btn--primary' }, okLabel),
      ),
      ),
    )
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); done(null) } })
    document.body.append(overlay)
    input.focus()
    if (selectBaseName) {
      const dot = value.lastIndexOf('.')
      input.setSelectionRange(0, dot > 0 ? dot : value.length)
    } else {
      input.select()
    }
  })
}

export function confirm ({ title, message, okLabel = 'OK', danger = false }) {
  return new Promise((resolve) => {
    const done = (result) => { overlay.remove(); resolve(result) }
    const overlay = h('div', { class: 'overlay', onmousedown: (e) => { if (e.target === overlay) done(false) } },
      h('div', { class: 'dialog', tabindex: '-1' },
        h('div', { class: 'dialog__title' }, title),
        message ? h('p', { class: 'dialog__message' }, message) : null,
        h('div', { class: 'dialog__actions' },
          h('button', { type: 'button', class: 'btn', onclick: () => done(false) }, 'Cancel'),
          h('button', { type: 'button', class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`, onclick: () => done(true) }, okLabel),
        ),
      ),
    )
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); done(false) } })
    document.body.append(overlay)
    overlay.querySelector('.btn--primary, .btn--danger')?.focus()
  })
}

export function basename (p) {
  return String(p || '').split(/[\\/]/).pop()
}

export function dirname (p, sep) {
  const s = String(p || '')
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'))
  if (i <= 0) return sep || '/'
  return s.slice(0, i)
}

export function extension (p) {
  const base = basename(p)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

// A question with named answers — "Save / Don't save / Cancel".
export function choose ({ title, message, buttons }) {
  return new Promise((resolve) => {
    const done = (id) => { overlay.remove(); resolve(id) }
    const overlay = h('div', { class: 'overlay', onmousedown: (e) => { if (e.target === overlay) done(null) } },
      h('div', { class: 'dialog', tabindex: '-1' },
        h('div', { class: 'dialog__title' }, title),
        message ? h('p', { class: 'dialog__message' }, message) : null,
        h('div', { class: 'dialog__actions' },
          buttons.map((b) => h('button', { type: 'button', class: `btn ${b.kind === 'primary' ? 'btn--primary' : b.kind === 'danger' ? 'btn--danger' : ''}`, onclick: () => done(b.id) }, b.label)),
        ),
      ),
    )
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); done(null) } })
    document.body.append(overlay)
    overlay.querySelector('.btn--primary')?.focus()
  })
}

// A read-only sheet of text — the keyboard shortcuts list.
export function sheet ({ title, rows }) {
  const done = () => overlay.remove()
  const overlay = h('div', { class: 'overlay', onmousedown: (e) => { if (e.target === overlay) done() } },
    h('div', { class: 'dialog dialog--wide', tabindex: '-1' },
      h('div', { class: 'dialog__title' }, title),
      h('div', { class: 'shortcuts' }, rows.map(([keys, what]) => h('div', { class: 'shortcuts__row' }, h('kbd', {}, keys), h('span', {}, what)))),
      h('div', { class: 'dialog__actions' }, h('button', { type: 'button', class: 'btn btn--primary', onclick: done }, 'Close')),
    ),
  )
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); done() } })
  document.body.append(overlay)
  overlay.querySelector('.btn--primary')?.focus()
}
