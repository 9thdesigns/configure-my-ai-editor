// CodeMirror 6, set up the way this editor wants it: one extension set,
// with the parts a person can change (theme, tab size, wrapping, gutters,
// font) in compartments so an open file re-configures in place.

import { EditorState, Compartment, Annotation } from '@codemirror/state'
import {
  EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection,
  dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine,
} from '@codemirror/view'
import { history, defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldKeymap,
  indentUnit, LanguageDescription,
} from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete'
import { highlightSelectionMatches, searchKeymap, search, gotoLine, openSearchPanel } from '@codemirror/search'
import { languages } from '@codemirror/language-data'
import { oneDark } from '@codemirror/theme-one-dark'

// Marks a transaction that mirrors an edit made in another view of the same
// file, so the receiving view's listener does not mirror it back.
export const mirrored = Annotation.define()

const langComp = new Compartment()
const themeComp = new Compartment()
const tabComp = new Compartment()
const wrapComp = new Compartment()
const gutterComp = new Compartment()
const fontComp = new Compartment()

// App-level commands the editor keymap reaches for. Set once by app.js.
const commands = {}
export function setCommands (map) { Object.assign(commands, map) }

const MONO = 'ui-monospace, "SF Mono", Menlo, Monaco, "Cascadia Mono", "Roboto Mono", Consolas, "Liberation Mono", monospace'

function lightTheme () {
  return [
    EditorView.theme({
      '&': { backgroundColor: 'var(--bg-2)', color: 'var(--ink)' },
      '.cm-gutters': { backgroundColor: 'var(--bg-2)', color: 'var(--ink-3)', borderRight: '1px solid var(--line)' },
      '.cm-activeLineGutter': { backgroundColor: 'var(--bg-3)' },
      '.cm-activeLine': { backgroundColor: 'rgba(37, 99, 235, 0.05)' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'rgba(37, 99, 235, 0.18)' },
      '.cm-cursor': { borderLeftColor: 'var(--accent)' },
      '.cm-panels': { backgroundColor: 'var(--bg-3)', color: 'var(--ink)' },
      '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--line)' },
      '.cm-searchMatch': { backgroundColor: 'rgba(217, 119, 6, 0.25)' },
      '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(217, 119, 6, 0.5)' },
    }, { dark: false }),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  ]
}

function darkTheme () {
  return [
    oneDark,
    EditorView.theme({
      '&': { backgroundColor: 'var(--bg-2)' },
      '.cm-gutters': { backgroundColor: 'var(--bg-2)', borderRight: '1px solid var(--line)' },
    }, { dark: true }),
  ]
}

function themeFor (theme) { return theme === 'dark' ? darkTheme() : lightTheme() }

function fontFor (settings) {
  return EditorView.theme({
    '&': { fontSize: `${settings.fontSize}px` },
    '.cm-scroller': { fontFamily: settings.fontFamily || MONO, lineHeight: '1.55' },
  })
}

function tabFor (settings) {
  return [
    EditorState.tabSize.of(settings.tabSize),
    indentUnit.of(settings.insertSpaces ? ' '.repeat(settings.tabSize) : '\t'),
  ]
}

function guttersFor (settings) {
  return settings.lineNumbers ? [lineNumbers(), highlightActiveLineGutter(), foldGutter()] : []
}

// Shortcuts the application menu owns (save, close, split, quick open, add
// to session, go to line…) are NOT bound here as well: on Windows and Linux
// a menu accelerator's key press can also reach the page, and a toggle
// bound twice is a toggle that does nothing. The menu dispatches them as
// commands; the editor keymap only adds what the menu has no item for.
const appKeymap = keymap.of([
  { key: 'Mod-Shift-f', run: (view) => openSearchPanel(view) },
  { key: 'Escape', run: (view) => { commands.escape?.(view); return false } },
])

export function makeExtensions ({ settings, theme }) {
  return [
    gutterComp.of(guttersFor(settings)),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    appKeymap,
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),
    tabComp.of(tabFor(settings)),
    wrapComp.of(settings.wordWrap ? EditorView.lineWrapping : []),
    themeComp.of(themeFor(theme)),
    fontComp.of(fontFor(settings)),
    langComp.of([]),
  ]
}

export function createState ({ content, settings, theme }) {
  return EditorState.create({ doc: content, extensions: makeExtensions({ settings, theme }) })
}

export function createView ({ parent, state, onUpdate }) {
  return new EditorView({
    parent,
    state,
    dispatchTransactions (trs, view) {
      view.update(trs)
      if (onUpdate) onUpdate(view, trs)
    },
  })
}

// Re-configure an open view for changed settings or theme.
export function reconfigure (view, { settings, theme }) {
  view.dispatch({
    effects: [
      gutterComp.reconfigure(guttersFor(settings)),
      tabComp.reconfigure(tabFor(settings)),
      wrapComp.reconfigure(settings.wordWrap ? EditorView.lineWrapping : []),
      themeComp.reconfigure(themeFor(theme)),
      fontComp.reconfigure(fontFor(settings)),
    ],
  })
}

// The language for a file, loaded on demand and applied to the view once it
// arrives. A file the catalogue does not know stays plain text.
const loading = new Map()
export function languageDescriptionFor (filePath) {
  const name = String(filePath || '').split(/[\\/]/).pop()
  return LanguageDescription.matchFilename(languages, name) || null
}

export async function applyLanguage (view, filePath) {
  const desc = languageDescriptionFor(filePath)
  if (!desc) {
    view.dispatch({ effects: langComp.reconfigure([]) })
    return null
  }
  let support = desc.support
  if (!support) {
    if (!loading.has(desc.name)) loading.set(desc.name, desc.load().catch(() => null))
    support = await loading.get(desc.name)
  }
  if (!support || view.state.doc === undefined) return null
  view.dispatch({ effects: langComp.reconfigure(support) })
  return desc.name
}

export function languageName (filePath) {
  const desc = languageDescriptionFor(filePath)
  return desc ? desc.name : 'Plain Text'
}

// The selection as a reference: whole-line numbers, exact text. An empty
// selection means the line the cursor is on.
export function selectionReference (view) {
  const { state } = view
  const sel = state.selection.main
  const startLine = state.doc.lineAt(sel.from)
  let endLine = state.doc.lineAt(sel.to)
  // A selection that ends at the very start of a line does not include it.
  if (sel.to > sel.from && sel.to === endLine.from) endLine = state.doc.lineAt(sel.to - 1)
  const code = sel.empty ? startLine.text : state.sliceDoc(sel.from, sel.to)
  return { startLine: startLine.number, endLine: endLine.number, code }
}

export function cursorInfo (view) {
  const sel = view.state.selection.main
  const line = view.state.doc.lineAt(sel.head)
  return { line: line.number, col: sel.head - line.from + 1, selected: sel.to - sel.from }
}

export { EditorView, EditorState, openSearchPanel, gotoLine }
