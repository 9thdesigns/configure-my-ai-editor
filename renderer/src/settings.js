// Settings, in the sidebar: the open folder's (editor, terminal, panel,
// explorer) and the person's (theme, server). Every field writes through as
// it changes; there is no Save.

import { h, clear } from './ui.js'

function field (label, control, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), control, hint ? h('span', { class: 'field__hint' }, hint) : null)
}

function number (value, { min, max, step = 1 }, onChange) {
  return h('input', { class: 'input input--num', type: 'number', value, min, max, step, onchange: (e) => onChange(Number(e.target.value)) })
}

function toggle (checked, onChange) {
  return h('input', { class: 'switch', type: 'checkbox', checked: checked || null, onchange: (e) => onChange(e.target.checked) })
}

function select (value, options, onChange) {
  return h('select', { class: 'select', onchange: (e) => onChange(e.target.value) },
    options.map(([v, label]) => h('option', { value: v, selected: v === value }, label)))
}

function text (value, placeholder, onChange) {
  return h('input', { class: 'input', type: 'text', value: value || '', placeholder, spellcheck: 'false', onchange: (e) => onChange(e.target.value) })
}

export class SettingsPane {
  constructor ({ host, onSettings, onPrefs, onOpenFolder, onCloseFolder, onForgetRecent }) {
    this.host = host
    this.handlers = { onSettings, onPrefs, onOpenFolder, onCloseFolder, onForgetRecent }
    this.state = { settings: null, prefs: null, workspace: null, recent: [], info: window.cma.info }
    this.render()
  }

  update (patch) {
    Object.assign(this.state, patch)
    this.render()
  }

  render () {
    const { settings: s, prefs: p, workspace, recent, info } = this.state
    const { onSettings, onPrefs, onOpenFolder, onCloseFolder, onForgetRecent } = this.handlers
    clear(this.host)
    this.host.append(h('div', { class: 'pane__header' }, h('span', { class: 'pane__title' }, 'Settings')))

    const scroller = h('div', { class: 'pane__scroll' })
    this.host.append(scroller)

    // ── Workspace ──
    const ws = h('section', { class: 'card' }, h('h3', { class: 'card__title' }, 'Workspace'))
    if (workspace) {
      ws.append(h('p', { class: 'muted small', title: workspace.path }, workspace.path))
      ws.append(h('div', { class: 'card__actions' },
        h('button', { class: 'btn', onclick: onOpenFolder }, 'Open another folder…'),
        h('button', { class: 'btn btn--ghost', onclick: onCloseFolder }, 'Close folder'),
      ))
    } else {
      ws.append(h('p', { class: 'muted' }, 'No folder is open.'))
      ws.append(h('div', { class: 'card__actions' }, h('button', { class: 'btn btn--primary', onclick: onOpenFolder }, 'Open folder…')))
    }
    if (recent && recent.length) {
      const list = h('div', { class: 'recent' })
      for (const r of recent) {
        list.append(h('div', { class: 'recent__row' },
          h('button', { class: 'recent__open', title: r.path, onclick: () => onOpenFolder(r.path) }, r.name || r.path),
          h('button', { class: 'iconbtn', title: 'Remove from recent', onclick: () => onForgetRecent(r.path) }, '×'),
        ))
      }
      ws.append(h('h4', { class: 'card__sub' }, 'Recent'), list)
    }
    scroller.append(ws)

    if (s) {
      const editor = h('section', { class: 'card' }, h('h3', { class: 'card__title' }, 'Editor'), h('p', { class: 'muted small' }, 'Saved for this folder.'))
      editor.append(
        field('Tab size', number(s.tabSize, { min: 1, max: 8 }, (v) => onSettings({ tabSize: v }))),
        field('Indent with spaces', toggle(s.insertSpaces, (v) => onSettings({ insertSpaces: v }))),
        field('Font size', number(s.fontSize, { min: 8, max: 40 }, (v) => onSettings({ fontSize: v }))),
        field('Font family', text(s.fontFamily, 'System monospace', (v) => onSettings({ fontFamily: v }))),
        field('Word wrap', toggle(s.wordWrap, (v) => onSettings({ wordWrap: v }))),
        field('Line numbers', toggle(s.lineNumbers, (v) => onSettings({ lineNumbers: v }))),
        field('Auto save', select(s.autoSave, [['off', 'Off'], ['afterDelay', 'After a delay'], ['onFocusChange', 'When focus leaves']], (v) => onSettings({ autoSave: v }))),
        field('Auto save delay (ms)', number(s.autoSaveDelayMs, { min: 100, max: 60000, step: 100 }, (v) => onSettings({ autoSaveDelayMs: v }))),
        field('Trim trailing whitespace on save', toggle(s.trimTrailingWhitespace, (v) => onSettings({ trimTrailingWhitespace: v }))),
      )
      scroller.append(editor)

      const term = h('section', { class: 'card' }, h('h3', { class: 'card__title' }, 'Terminal'))
      term.append(
        field('Shell', text(s.shell, info.platform === 'win32' ? 'powershell.exe' : '$SHELL (login shell)', (v) => onSettings({ shell: v })), 'Blank uses your login shell.'),
        field('Shell arguments', text(s.shellArgs.join(' '), info.platform === 'win32' ? '' : '-l', (v) => onSettings({ shellArgs: v.split(/\s+/).filter(Boolean) }))),
        field('Terminal font size', number(s.terminalFontSize, { min: 8, max: 40 }, (v) => onSettings({ terminalFontSize: v }))),
      )
      scroller.append(term)

      const explorer = h('section', { class: 'card' }, h('h3', { class: 'card__title' }, 'Explorer'))
      explorer.append(
        field('Show hidden files', toggle(s.showHidden, (v) => onSettings({ showHidden: v }))),
        field('Hide directories', text(s.excludeDirs.join(', '), 'e.g. dist, coverage', (v) => onSettings({ excludeDirs: v.split(/[,\s]+/).filter(Boolean) })), 'Also skipped by quick open. node_modules and .git are always skipped there.'),
      )
      scroller.append(explorer)
    }

    if (p) {
      const prefs = h('section', { class: 'card' }, h('h3', { class: 'card__title' }, 'Preferences'), h('p', { class: 'muted small' }, 'Yours, in every folder.'))
      prefs.append(
        field('Theme', select(p.theme, [['system', 'Follow the system'], ['light', 'Light'], ['dark', 'Dark']], (v) => onPrefs({ theme: v }))),
        field('Server', text(p.serverUrl, 'https://configuremyai.com', (v) => onPrefs({ serverUrl: v })), 'Only for running the site locally. The Code panel reloads when this changes.'),
      )
      prefs.append(h('p', { class: 'muted small' }, `Configure My AI Editor ${info.version}`))
      scroller.append(prefs)
    }
  }
}
