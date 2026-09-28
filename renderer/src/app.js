// The editor, wired together. State lives here; the modules draw.

import './styles.css'
import '@xterm/xterm/css/xterm.css'
import { h, icon, clear, toast, prompt, confirm, choose, sheet, debounce, basename, dirname } from './ui.js'
import * as L from '../../src/lib/layout.js'
import { statusLabel, isLive } from '../../src/lib/cma-api.js'
import * as ed from './editor.js'
import { TerminalPanel } from './terminal.js'
import { Explorer } from './explorer.js'
import { SessionsPane } from './sessions.js'
import { GithubPane } from './github.js'
import { QuickOpen } from './quickopen.js'
import { SettingsPane } from './settings.js'
import { GroupsView } from './groups.js'

const cma = window.cma
const info = cma.info
const SEP = info.platform === 'win32' ? '\\' : '/'
const MOD = info.platform === 'darwin' ? '⌘' : 'Ctrl'

const state = {
  prefs: null,
  workspace: null,
  settings: null,
  theme: info.theme,
  layout: L.emptyLayout(),
  activeGroupId: null,
  docs: new Map(),
  views: new Map(),
  loadingDocs: new Map(),
  sidebar: { pane: 'explorer', visible: true },
  terminal: { visible: false },
  panel: { visible: true, state: null },
  account: null,
  sessions: { loading: true, signedIn: false, sessions: [], github: null },
  git: null,
}
state.activeGroupId = state.layout.id

// ── DOM ───────────────────────────────────────────────────────────────────────

const root = document.getElementById('app')
document.documentElement.dataset.theme = state.theme
document.documentElement.dataset.captions = info.captions
document.documentElement.dataset.platform = info.platform

const el = {}

function buildShell () {
  el.wsButton = h('button', { class: 'titlebar__ws', title: 'Switch folder', onclick: workspaceMenu }, icon('folder'), h('span', {}, 'Open a folder'))
  el.search = h('button', { class: 'titlebar__search', onclick: () => commands['view.quickOpen']() }, icon('search'), h('span', {}, 'Search files…'), h('kbd', {}, `${MOD} P`))
  el.toggleSidebar = h('button', { class: 'iconbtn', title: `Toggle sidebar (${MOD} B)`, onclick: () => commands['view.toggleSidebar']() }, icon('sidebar'))
  el.toggleTerminal = h('button', { class: 'iconbtn', title: 'Toggle terminal (Ctrl `)', onclick: () => commands['view.toggleTerminal']() }, icon('terminal'))
  el.togglePanel = h('button', { class: 'iconbtn', title: `Toggle Code panel (${MOD} ⇧ P)`, onclick: () => commands['view.togglePanel']() }, icon('panel'))

  el.titlebar = h('div', { class: 'titlebar' },
    h('div', { class: 'titlebar__left' }, el.wsButton),
    h('div', { class: 'titlebar__center' }, el.search),
    h('div', { class: 'titlebar__right' }, el.toggleSidebar, el.toggleTerminal, el.togglePanel),
  )

  el.activity = h('div', { class: 'activitybar' })
  for (const [pane, name, title] of [['explorer', 'files', 'Explorer'], ['sessions', 'sessions', 'Code sessions'], ['github', 'github', 'GitHub']]) {
    el.activity.append(h('button', { class: 'activitybar__btn', dataset: { pane }, title, onclick: () => showPane(pane) }, icon(name)))
  }
  el.activity.append(h('div', { class: 'activitybar__spacer' }))
  el.activity.append(h('button', { class: 'activitybar__btn', dataset: { pane: 'settings' }, title: 'Settings', onclick: () => showPane('settings') }, icon('settings')))

  el.panes = {}
  el.sidebar = h('div', { class: 'sidebar' })
  for (const pane of ['explorer', 'sessions', 'github', 'settings']) {
    el.panes[pane] = h('div', { class: 'pane', dataset: { pane } })
    el.sidebar.append(el.panes[pane])
  }

  el.editorArea = h('div', { class: 'editorArea' })
  el.terminalHost = h('div', { class: 'terminal' })
  el.terminalSash = sash('sash sash--h sash--terminal', 'y', (delta, start) => {
    const height = Math.max(80, Math.min(window.innerHeight - 200, start - delta))
    document.documentElement.style.setProperty('--terminal', `${height}px`)
    return height
  }, () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--terminal')), (height) => savePrefs({ terminalHeight: height }))
  el.main = h('div', { class: 'main' }, el.editorArea, el.terminalSash, el.terminalHost)

  el.panelTitle = h('span', { class: 'codePanel__title' }, 'Code')
  el.panelBack = h('button', { class: 'iconbtn', title: `Back (${MOD} [)`, onclick: () => cma.invoke('panel:back') }, icon('back'))
  el.panelForward = h('button', { class: 'iconbtn', title: `Forward (${MOD} ])`, onclick: () => cma.invoke('panel:forward') }, icon('forward'))
  el.panelView = h('div', { class: 'codePanel__view' })
  el.codePanel = h('div', { class: 'codePanel' },
    h('div', { class: 'codePanel__bar' },
      el.panelBack, el.panelForward,
      h('button', { class: 'iconbtn', title: `Reload (${MOD} R)`, onclick: () => cma.invoke('panel:reload') }, icon('reload')),
      el.panelTitle,
      h('button', { class: 'iconbtn', title: 'All sessions', onclick: () => cma.invoke('panel:navigate', '/code/sessions/all') }, icon('sessions')),
      h('button', { class: 'iconbtn', title: 'Open in browser', onclick: () => commands['panel.openInBrowser']() }, icon('external')),
      h('button', { class: 'iconbtn', title: 'Hide panel', onclick: () => commands['view.togglePanel']() }, icon('close')),
    ),
    el.panelView,
  )

  el.sidebarSash = sash('sash sash--sidebar', 'x', (delta, start) => {
    const width = Math.max(160, Math.min(800, start + delta))
    document.documentElement.style.setProperty('--sidebar', `${width}px`)
    return width
  }, () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar')), (width) => savePrefs({ sidebarWidth: width }))
  el.panelSash = sash('sash sash--panel', 'x', (delta, start) => {
    const width = Math.max(320, Math.min(window.innerWidth - 500, start - delta))
    document.documentElement.style.setProperty('--panel', `${width}px`)
    return width
  }, () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel')), (width) => saveSettings({ codePanel: { ...state.settings.codePanel, width } }))

  el.body = h('div', { class: 'body' }, el.activity, el.sidebar, el.sidebarSash, el.main, el.panelSash, el.codePanel)

  el.statusBranch = h('button', { class: 'statusbar__item', onclick: () => showPane('github') }, icon('branch'), h('span', {}, '—'))
  el.statusCursor = h('span', { class: 'statusbar__item' }, '')
  el.statusIndent = h('button', { class: 'statusbar__item', title: 'Change tab size', onclick: cycleTabSize }, '')
  el.statusLang = h('span', { class: 'statusbar__item' }, '')
  el.statusAccount = h('button', { class: 'statusbar__item', onclick: () => showPane('sessions') }, icon('user'), h('span', {}, 'Not signed in'))
  el.statusSession = h('button', { class: 'statusbar__item', onclick: () => showPanel(true) }, icon('chat'), h('span', {}, 'No session'))
  el.statusbar = h('div', { class: 'statusbar' }, el.statusBranch, h('span', { class: 'statusbar__spacer' }), el.statusCursor, el.statusIndent, el.statusLang, el.statusSession, el.statusAccount)

  clear(root).append(el.titlebar, el.body, el.statusbar)
}

function sash (className, axis, onMove, getStart, onEnd) {
  const s = h('div', { class: className })
  s.addEventListener('pointerdown', (down) => {
    down.preventDefault()
    s.setPointerCapture(down.pointerId)
    s.classList.add('is-dragging')
    const start = getStart()
    const origin = axis === 'x' ? down.clientX : down.clientY
    let last = start
    const move = (ev) => { last = onMove((axis === 'x' ? ev.clientX : ev.clientY) - origin, start); syncPanelBounds() }
    const up = () => { s.removeEventListener('pointermove', move); s.removeEventListener('pointerup', up); s.classList.remove('is-dragging'); onEnd(last); syncPanelBounds(); terminal.fit() }
    s.addEventListener('pointermove', move)
    s.addEventListener('pointerup', up)
  })
  return s
}

// ── Modules ───────────────────────────────────────────────────────────────────

let explorer, sessionsPane, githubPane, settingsPane, terminal, quickOpen, groupsView

function buildModules () {
  explorer = new Explorer({
    host: el.panes.explorer,
    onOpen: (p) => openFile(p),
    onContextMenu: explorerMenu,
  })
  el.panes.explorer.prepend(h('div', { class: 'pane__header' },
    h('span', { class: 'pane__title' }, 'Explorer'),
    h('span', { class: 'pane__actions' },
      h('button', { class: 'iconbtn', title: 'New file', onclick: () => newFileIn(state.workspace?.path) }, icon('plus')),
      h('button', { class: 'iconbtn', title: 'Refresh', onclick: () => { explorer.cache.clear(); explorer.render() } }, icon('reload')),
    ),
  ))

  sessionsPane = new SessionsPane({
    host: el.panes.sessions,
    onOpen: (session) => openSession(session.slug),
    onNew: () => commands['session.new'](),
    onSignIn: () => { showPanel(true); cma.invoke('panel:navigate', '/code') },
    onSwitchWorkspace: async (id) => {
      const res = await cma.invoke('cma:activateWorkspace', id)
      if (res.error) toast(`Couldn’t switch workspace: ${res.error}`, { kind: 'error' })
      else { cma.invoke('panel:navigate', '/code'); refreshAccount() }
    },
    onShowPanel: () => { showPanel(true); cma.invoke('panel:navigate', '/code') },
    onRefresh: () => refreshAccount(),
    onOpenInBrowser: (session) => cma.invoke('shell:openExternal', `${info.serverUrl}${session.web_path}`),
  })

  githubPane = new GithubPane({
    host: el.panes.github,
    onConnect: () => { showPanel(true); cma.invoke('panel:navigate', '/code/github/authorize') },
    onOpenRepo: (url) => cma.invoke('shell:openExternal', url),
    onManageRepos: () => { showPanel(true); cma.invoke('panel:navigate', '/code/repositories') },
    onShareFolder: () => runInTerminal(`cma-agent repos:add ${shellQuote(state.workspace.path)}\n`),
    onCompanionDocs: () => cma.invoke('shell:openExternal', `${info.serverUrl}/agent`),
    onRefresh: () => { refreshGit(); refreshAccount() },
    onOpenTerminal: (command) => runInTerminal(command),
  })

  settingsPane = new SettingsPane({
    host: el.panes.settings,
    onSettings: (patch) => saveSettings(patch),
    onPrefs: (patch) => savePrefs(patch),
    onOpenFolder: (p) => cma.invoke('workspace:open', typeof p === 'string' ? p : null),
    onCloseFolder: () => commands['file.closeFolder'](),
    onForgetRecent: async (p) => { const recent = await cma.invoke('workspace:forget', p); settingsPane.update({ recent }) },
  })

  terminal = new TerminalPanel({
    host: el.terminalHost,
    theme: state.theme,
    fontSize: 13,
    onCountChange: (n) => { if (n === 0 && state.terminal.visible) showTerminal(false) },
  })

  quickOpen = new QuickOpen({
    anchor: el.main,
    getIndex: () => cma.invoke('fs:index'),
    onPick: (rel) => openFile(`${state.workspace.path}${SEP}${rel.split('/').join(SEP)}`),
  })

  groupsView = new GroupsView({
    host: el.editorArea,
    handlers: {
      mount: mountEditor,
      onGroupGone: (groupId) => { const entry = state.views.get(groupId); if (entry) { stash(entry); entry.view.destroy(); state.views.delete(groupId) } },
      onActivateTab: (groupId, tabId) => { state.layout = L.activateTab(state.layout, groupId, tabId); state.activeGroupId = groupId; renderGroups(); focusActiveEditor() },
      onCloseTab: (groupId, tabId) => closeTab(groupId, tabId),
      onMoveTab: (tabId, from, to, index) => { state.layout = L.moveTab(state.layout, tabId, from, to, index); state.activeGroupId = to; renderGroups() },
      onResize: (splitId, sizes) => { state.layout = L.resizeSplit(state.layout, splitId, sizes); persistLayout() },
      onFocusGroup: (groupId) => { if (state.activeGroupId !== groupId) { state.activeGroupId = groupId; renderGroups() } },
      onSplit: (groupId, direction) => splitGroup(groupId, direction),
      onOpenPath: (p, groupId) => openFile(p, groupId),
      onTabContextMenu: (groupId, tabId) => tabMenu(groupId, tabId),
    },
  })

  ed.setCommands({
    save: (view) => saveDoc(docForView(view)),
    addSelection: (view) => addSelectionToSession(view),
    addFile: (view) => addFileToSession(docForView(view)?.path),
    toggleWrap: () => commands['view.toggleWordWrap'](),
    quickOpen: () => commands['view.quickOpen'](),
    closeTab: (view) => { const g = groupForView(view); if (g) closeTab(g.id, g.active) },
    splitRight: (view) => { const g = groupForView(view); if (g) splitGroup(g.id, 'row') },
    escape: () => quickOpen.close(),
  })

  el.editorArea.addEventListener('contextmenu', (e) => {
    const cm = e.target.closest('.cm-editor')
    if (!cm) return
    e.preventDefault()
    editorMenu(cm)
  })
}

// ── Layout & rendering ────────────────────────────────────────────────────────

function showPane (pane) {
  state.sidebar.pane = pane
  if (!state.sidebar.visible) { state.sidebar.visible = true; syncChrome() }
  for (const [name, node] of Object.entries(el.panes)) node.classList.toggle('is-active', name === pane)
  for (const b of el.activity.querySelectorAll('.activitybar__btn')) b.classList.toggle('is-active', b.dataset.pane === pane)
  if (pane === 'settings') settingsPane.update({ settings: state.settings, prefs: state.prefs, workspace: state.workspace, recent: state.workspace?.recent || [] })
}

function syncChrome () {
  // Dialogs are centred over the part of the window the panel does not
  // cover: the panel is a native view above everything the page draws.
  document.documentElement.style.setProperty('--overlay-right', state.panel.visible ? `${state.settings?.codePanel?.width || 460}px` : '0px')
  el.body.classList.toggle('no-sidebar', !state.sidebar.visible)
  el.body.classList.toggle('no-panel', !state.panel.visible)
  el.main.classList.toggle('has-terminal', state.terminal.visible)
  el.toggleSidebar.classList.toggle('is-on', state.sidebar.visible)
  el.toggleTerminal.classList.toggle('is-on', state.terminal.visible)
  el.togglePanel.classList.toggle('is-on', state.panel.visible)
  syncPanelBounds()
  terminal.fit()
}

function showPanel (visible) {
  state.panel.visible = visible
  syncChrome()
  if (visible) cma.invoke('panel:show').then(onPanelState)
  else cma.invoke('panel:hide')
  if (state.settings) saveSettings({ codePanel: { ...state.settings.codePanel, visible } })
}

function showTerminal (visible) {
  state.terminal.visible = visible
  syncChrome()
  if (visible) {
    if (terminal.count === 0) terminal.create()
    else terminal.focus()
  }
}

let boundsRaf = 0
function syncPanelBounds () {
  cancelAnimationFrame(boundsRaf)
  boundsRaf = requestAnimationFrame(() => {
    if (!state.panel.visible) return
    const r = el.panelView.getBoundingClientRect()
    cma.invoke('panel:setBounds', { x: r.left, y: r.top, width: r.width, height: r.height })
  })
}

function renderGroups () {
  if (!state.workspace) { renderWelcome(); return }
  groupsView.render(state.layout, state.activeGroupId, state.docs)
  persistLayout()
  updateStatus()
  updateTitle()
}

function renderWelcome () {
  const recent = state.workspace?.recent || state.recent || []
  clear(el.editorArea).append(h('div', { class: 'welcome' },
    h('div', { class: 'empty__logo' }, icon('chat')),
    h('h1', {}, 'Configure My AI Editor'),
    h('p', {}, 'Open a folder to edit its files, run a terminal in it, and drive a Code session beside it.'),
    h('button', { class: 'btn btn--primary', onclick: () => cma.invoke('workspace:open', null) }, icon('folder'), `Open Folder… (${MOD} O)`),
    recent.length ? h('div', { class: 'welcome__recent' }, h('p', { class: 'muted small' }, 'Recent'), recent.map((r) => h('button', { onclick: () => cma.invoke('workspace:open', r.path) }, r.name, h('span', {}, r.path)))) : null,
  ))
}

const persistLayout = debounce(() => {
  if (!state.workspace) return
  cma.invoke('workspace:saveLayout', { layout: L.serialize(state.layout) })
}, 400)

// ── Documents ─────────────────────────────────────────────────────────────────

function tabFor (p) { return { id: p, kind: 'file', path: p, title: basename(p) } }

function relative (p) {
  const root = state.workspace?.path
  if (root && p.startsWith(root + SEP)) return p.slice(root.length + 1).split(SEP).join('/')
  return p
}

// One read per path, however many groups ask for it while it is in flight:
// a second caller gets the same promise rather than an early answer.
function loadDoc (p) {
  if (state.docs.has(p)) return Promise.resolve(state.docs.get(p))
  if (state.loadingDocs.has(p)) return state.loadingDocs.get(p)
  const loading = cma.invoke('fs:read', p).then((res) => {
    const doc = { path: p, binary: res.binary, tooLarge: res.tooLarge, content: res.content, mtimeMs: res.mtimeMs, state: null, textObj: null, savedTextObj: null, dirty: false, diskChanged: false }
    state.docs.set(p, doc)
    return doc
  }).finally(() => state.loadingDocs.delete(p))
  state.loadingDocs.set(p, loading)
  return loading
}

async function openFile (p, groupId = state.activeGroupId) {
  if (!L.findGroup(state.layout, groupId)) groupId = L.firstGroup(state.layout).id
  try {
    await loadDoc(p)
  } catch (e) {
    toast(`Couldn’t open ${basename(p)}: ${e.message.replace(/^Error invoking remote method '[^']+': Error: /, '')}`, { kind: 'error' })
    return
  }
  state.layout = L.openTab(state.layout, groupId, tabFor(p))
  state.activeGroupId = groupId
  renderGroups()
  explorer.setSelected(p)
  focusActiveEditor()
}

function stateFor (doc) {
  if (doc.state && doc.textObj && doc.state.doc.eq(doc.textObj)) return doc.state
  const st = ed.createState({ content: doc.textObj || doc.content, settings: state.settings, theme: state.theme })
  if (!doc.textObj) { doc.textObj = st.doc; doc.savedTextObj = st.doc }
  else if (doc.textObj !== st.doc) doc.textObj = st.doc
  return st
}

function stash (entry) {
  const doc = state.docs.get(entry.tabId)
  if (doc) doc.state = entry.view.state
}

function mountEditor (groupId, body) {
  const group = L.findGroup(state.layout, groupId)
  const entry = state.views.get(groupId)
  const tabId = group?.active
  if (!tabId) {
    if (entry) { stash(entry); entry.view.destroy(); state.views.delete(groupId) }
    return
  }
  const doc = state.docs.get(tabId)
  if (!doc) {
    if (entry) { stash(entry); entry.view.dom.remove() }
    clear(body).append(h('div', { class: 'binary' }, 'Loading…'))
    // Only the call that starts the read redraws when it lands; a redraw
    // while it is in flight must not queue another.
    if (!state.loadingDocs.has(tabId)) {
      loadDoc(tabId).then(() => renderGroups()).catch(() => {
        toast(`${basename(tabId)} could not be opened; its tab was closed.`, { kind: 'warn' })
        state.layout = L.closeTab(state.layout, groupId, tabId)
        renderGroups()
      })
    }
    return
  }
  if (doc.binary) {
    if (entry) { stash(entry); entry.view.dom.remove() }
    clear(body).append(h('div', { class: 'binary' }, doc.tooLarge ? 'This file is too large to open here.' : 'This file is binary and cannot be edited as text.'))
    return
  }
  for (const child of [...body.children]) if (!child.classList.contains('cm-editor')) child.remove()
  let live = entry
  if (!live) {
    live = { view: ed.createView({ parent: body, state: stateFor(doc), onUpdate }), tabId }
    state.views.set(groupId, live)
  } else if (live.tabId !== tabId) {
    stash(live)
    live.view.setState(stateFor(doc))
    live.tabId = tabId
  } else if (doc.textObj && !live.view.state.doc.eq(doc.textObj)) {
    live.view.setState(stateFor(doc))
  }
  if (live.view.dom.parentNode !== body) body.append(live.view.dom)
  if (live.langFor !== doc.path) {
    live.langFor = doc.path
    ed.applyLanguage(live.view, doc.path).then((name) => { doc.language = name || 'Plain Text'; updateStatus() })
  }
}

function onUpdate (view, trs) {
  const groupId = [...state.views.entries()].find(([, v]) => v.view === view)?.[0]
  if (!groupId) return
  const entry = state.views.get(groupId)
  const doc = state.docs.get(entry.tabId)
  if (!doc) return
  let changed = false
  for (const tr of trs) {
    if (!tr.docChanged) continue
    changed = true
    if (tr.annotation(ed.mirrored)) continue
    for (const [gid, other] of state.views) {
      if (gid === groupId || other.tabId !== entry.tabId) continue
      other.view.dispatch({ changes: tr.changes, annotations: ed.mirrored.of(true) })
    }
  }
  if (changed) {
    doc.textObj = view.state.doc
    doc.dirty = !view.state.doc.eq(doc.savedTextObj)
    refreshDirty()
    if (state.settings.autoSave === 'afterDelay') scheduleAutoSave(doc)
  }
  if (changed || trs.some((tr) => tr.selection)) updateStatus()
}

const autoSaveTimers = new Map()
function scheduleAutoSave (doc) {
  clearTimeout(autoSaveTimers.get(doc.path))
  autoSaveTimers.set(doc.path, setTimeout(() => { if (doc.dirty) saveDoc(doc) }, state.settings.autoSaveDelayMs))
}

function refreshDirty () {
  for (const tabEl of el.editorArea.querySelectorAll('.tab[data-tab]')) {
    const doc = state.docs.get(tabEl.dataset.tab)
    tabEl.classList.toggle('is-dirty', Boolean(doc && doc.dirty))
    tabEl.classList.toggle('is-stale', Boolean(doc && doc.diskChanged))
  }
  updateTitle()
}

function docForView (view) {
  const entry = [...state.views.values()].find((v) => v.view === view)
  return entry ? state.docs.get(entry.tabId) : null
}

function groupForView (view) {
  const groupId = [...state.views.entries()].find(([, v]) => v.view === view)?.[0]
  return groupId ? L.findGroup(state.layout, groupId) : null
}

function activeView () {
  return state.views.get(state.activeGroupId)?.view || null
}

function activeDoc () {
  const group = L.findGroup(state.layout, state.activeGroupId)
  return group && group.active ? state.docs.get(group.active) : null
}

function focusActiveEditor () {
  requestAnimationFrame(() => activeView()?.focus())
}

async function saveDoc (doc, { as = false } = {}) {
  if (!doc || doc.binary) return false
  let target = doc.path
  if (as) {
    target = await cma.invoke('dialog:saveAs', doc.path)
    if (!target) return false
  }
  let text = doc.textObj ? doc.textObj.toString() : doc.content
  if (state.settings.trimTrailingWhitespace) text = text.replace(/[ \t]+$/gm, '')
  try {
    const res = await cma.invoke('fs:write', target, text)
    if (target === doc.path) {
      if (state.settings.trimTrailingWhitespace && doc.textObj && text !== doc.textObj.toString()) replaceAll(doc, text)
      doc.savedTextObj = doc.textObj
      doc.content = text
      doc.mtimeMs = res.mtimeMs
      doc.dirty = false
      doc.diskChanged = false
      refreshDirty()
    } else {
      // Saved elsewhere: the new file opens beside the old one.
      await openFile(target)
    }
    refreshGit()
    return true
  } catch (e) {
    toast(`Couldn’t save ${basename(target)}: ${e.message}`, { kind: 'error' })
    return false
  }
}

async function saveAll () {
  for (const doc of state.docs.values()) if (doc.dirty) await saveDoc(doc)
}

async function closeTab (groupId, tabId) {
  const doc = state.docs.get(tabId)
  const elsewhere = L.groupsShowing(state.layout, (t) => t.id === tabId).some((g) => g.id !== groupId)
  if (doc && doc.dirty && !elsewhere) {
    const answer = await choose({
      title: `Save changes to ${basename(tabId)}?`,
      message: 'Your changes will be lost if you don’t save them.',
      buttons: [{ id: 'save', label: 'Save', kind: 'primary' }, { id: 'discard', label: 'Don’t Save', kind: 'danger' }, { id: 'cancel', label: 'Cancel' }],
    })
    if (answer === 'cancel' || answer === null) return
    if (answer === 'save' && !(await saveDoc(doc))) return
  }
  state.layout = L.closeTab(state.layout, groupId, tabId)
  if (!L.findGroup(state.layout, state.activeGroupId)) state.activeGroupId = L.firstGroup(state.layout).id
  if (!elsewhere) state.docs.delete(tabId)
  renderGroups()
  focusActiveEditor()
}

function splitGroup (groupId, direction) {
  const group = L.findGroup(state.layout, groupId)
  if (!group) return
  const carry = group.active ? group.tabs.find((t) => t.id === group.active) : null
  const { layout, groupId: fresh } = L.splitGroup(state.layout, groupId, direction, carry ? { ...carry } : null)
  state.layout = layout
  state.activeGroupId = fresh
  renderGroups()
  focusActiveEditor()
}

// Files changed on disk — by the agent, by git, by another editor.
async function onFilesChanged ({ paths }) {
  explorer.changed(paths)
  refreshGitSoon()
  for (const p of paths) {
    const doc = state.docs.get(p)
    if (!doc || doc.binary) continue
    let res
    try { res = await cma.invoke('fs:read', p) } catch { continue }
    if (res.binary) continue
    const current = doc.textObj ? doc.textObj.toString() : doc.content
    if (res.content === current) { doc.mtimeMs = res.mtimeMs; continue }
    if (doc.dirty) {
      doc.diskChanged = true
      refreshDirty()
      toast(`${basename(p)} changed on disk while you have unsaved edits.`, {
        kind: 'warn', timeout: 8000,
        action: { label: 'Reload', onClick: () => reloadDoc(doc, res.content, res.mtimeMs) },
      })
    } else {
      reloadDoc(doc, res.content, res.mtimeMs)
    }
  }
}

// Put new text into every view showing a document (each split of the same
// file), or into the document alone when none is on screen. Returns whether
// a view took it.
function replaceAll (doc, content) {
  let applied = false
  for (const v of state.views.values()) {
    if (v.tabId !== doc.path) continue
    v.view.dispatch({ changes: { from: 0, to: v.view.state.doc.length, insert: content }, annotations: ed.mirrored.of(true) })
    doc.textObj = v.view.state.doc
    applied = true
  }
  if (!applied) { doc.textObj = null; doc.state = null }
  doc.content = content
  return applied
}

function reloadDoc (doc, content, mtimeMs) {
  const applied = replaceAll(doc, content)
  doc.savedTextObj = doc.textObj
  doc.mtimeMs = mtimeMs
  doc.dirty = false
  doc.diskChanged = false
  refreshDirty()
  if (!applied) renderGroups()
}

// ── Sessions & account ────────────────────────────────────────────────────────

async function refreshAccount () {
  const [account, sessions] = await Promise.all([cma.invoke('cma:whoami'), cma.invoke('cma:sessions')])
  state.account = account
  state.sessions = sessions
  sessionsPane.update({ ...sessions, loading: false, account, activeSlug: currentSlug() })
  githubPane.update({ github: sessions.github || null, signedIn: Boolean(sessions.signedIn) })
  updateStatus()
}

function currentSlug () {
  return state.panel.state?.slug || state.settings?.codePanel?.session || null
}

function currentSession () {
  const slug = currentSlug()
  return slug ? (state.sessions.sessions || []).find((s) => s.slug === slug) || null : null
}

function openSession (slug) {
  showPanel(true)
  cma.invoke('panel:openSession', slug)
  rememberSession(slug)
}

function rememberSession (slug) {
  if (!state.settings || state.settings.codePanel.session === slug) return
  saveSettings({ codePanel: { ...state.settings.codePanel, session: slug } })
}

const refreshAccountSoon = debounce(refreshAccount, 800)

function onPanelState (panelState) {
  state.panel.state = panelState
  el.panelTitle.textContent = panelState.title || 'Code'
  el.panelBack.disabled = !panelState.canGoBack
  el.panelForward.disabled = !panelState.canGoForward
  if (panelState.slug) rememberSession(panelState.slug)
  sessionsPane.update({ activeSlug: currentSlug() })
  refreshAccountSoon()
  updateStatus()
}

async function addSelectionToSession (view = activeView()) {
  if (!view) { toast('Select some code in a file first.'); return }
  const doc = docForView(view)
  if (!doc) return
  const { startLine, endLine, code } = ed.selectionReference(view)
  await sendReference({ path: relative(doc.path), startLine, endLine, code })
}

async function addFileToSession (p) {
  const doc = p ? state.docs.get(p) : activeDoc()
  if (!doc || doc.binary) { toast('Open a text file first.'); return }
  let code = doc.textObj ? doc.textObj.toString() : doc.content
  const LIMIT = 24000
  if (code.length > LIMIT) { code = `${code.slice(0, LIMIT)}\n… (truncated; ${code.length - LIMIT} more characters)`; toast('Large file: the first 24 KB were added.', { kind: 'warn' }) }
  await sendReference({ path: relative(doc.path), startLine: null, endLine: null, code })
}

async function sendReference (ref) {
  showPanel(true)
  const res = await cma.invoke('panel:addReference', { ...ref, slug: currentSlug() })
  if (res.inserted) toast('Added to the session’s composer.', { kind: 'ok', timeout: 2500 })
  else toast('Copied the reference to the clipboard — open a session in the Code panel and paste it.', { kind: 'warn', timeout: 6000 })
}

// ── Git ───────────────────────────────────────────────────────────────────────

async function refreshGit () {
  if (!state.workspace) { state.git = null; updateStatus(); githubPane.update({ git: null, workspace: null }); return }
  state.git = await cma.invoke('git:status')
  githubPane.update({ git: state.git, workspace: state.workspace })
  updateStatus()
}
const refreshGitSoon = debounce(refreshGit, 1500)

// ── Status bar & title ────────────────────────────────────────────────────────

function updateStatus () {
  const git = state.git
  const branchLabel = el.statusBranch.querySelector('span')
  if (git && git.repo) {
    const parts = [git.branch || 'detached']
    if (git.ahead || git.behind) parts.push(`↑${git.ahead} ↓${git.behind}`)
    if (git.changed || git.untracked) parts.push(`${git.changed + git.untracked} changed`)
    branchLabel.textContent = parts.join('  ')
  } else {
    branchLabel.textContent = state.workspace ? 'no git' : '—'
  }

  const view = activeView()
  const doc = activeDoc()
  if (view && doc && !doc.binary) {
    const c = ed.cursorInfo(view)
    el.statusCursor.textContent = `Ln ${c.line}, Col ${c.col}${c.selected ? ` (${c.selected} selected)` : ''}`
    el.statusIndent.textContent = `${state.settings.insertSpaces ? 'Spaces' : 'Tab'}: ${state.settings.tabSize}`
    el.statusLang.textContent = doc.language || ed.languageName(doc.path)
  } else {
    el.statusCursor.textContent = ''
    el.statusIndent.textContent = ''
    el.statusLang.textContent = ''
  }

  const account = state.account
  const accLabel = el.statusAccount.querySelector('span')
  accLabel.textContent = account && account.signedIn ? `${account.user.name || account.user.email}${account.workspace ? ` · ${account.workspace.name}` : ''}` : 'Not signed in'

  const session = currentSession()
  const sesLabel = el.statusSession.querySelector('span')
  el.statusSession.classList.toggle('is-live', Boolean(session && isLive(session.status)))
  el.statusSession.classList.toggle('is-waiting', Boolean(session && session.status === 'awaiting_input'))
  sesLabel.textContent = session ? `${session.title} · ${statusLabel(session.status)}` : (state.panel.state?.slug ? state.panel.state.title : 'No session')
}

function updateTitle () {
  const doc = activeDoc()
  const parts = []
  if (doc) parts.push(`${doc.dirty ? '● ' : ''}${basename(doc.path)}`)
  if (state.workspace) parts.push(state.workspace.name)
  parts.push('Configure My AI Editor')
  cma.invoke('window:setTitle', parts.join(' — '))
}

// ── Settings & preferences ────────────────────────────────────────────────────

async function saveSettings (patch) {
  if (!state.workspace) return
  state.settings = await cma.invoke('workspace:saveSettings', patch)
  applySettings()
}

async function savePrefs (patch) {
  state.prefs = await cma.invoke('prefs:set', patch)
  if (patch.theme !== undefined) applyTheme(state.prefs.theme === 'system' ? info.theme : state.prefs.theme)
}

function applySettings () {
  for (const v of state.views.values()) ed.reconfigure(v.view, { settings: state.settings, theme: state.theme })
  terminal.setFontSize(state.settings.terminalFontSize)
  explorer.setOptions({ showHidden: state.settings.showHidden, excludeDirs: state.settings.excludeDirs })
  document.documentElement.style.setProperty('--panel', `${state.settings.codePanel.width}px`)
  if (state.sidebar.pane === 'settings') settingsPane.update({ settings: state.settings })
  updateStatus()
  syncPanelBounds()
}

function applyTheme (theme) {
  state.theme = theme
  document.documentElement.dataset.theme = theme
  for (const v of state.views.values()) ed.reconfigure(v.view, { settings: state.settings, theme })
  terminal.setTheme(theme)
}

function cycleTabSize () {
  if (!state.settings) return
  const next = state.settings.tabSize >= 8 ? 2 : state.settings.tabSize === 2 ? 4 : 8
  saveSettings({ tabSize: next })
}

// ── Workspace ─────────────────────────────────────────────────────────────────

async function loadWorkspace (ws) {
  // Everything from the previous folder goes.
  for (const v of state.views.values()) v.view.destroy()
  state.views.clear()
  state.docs.clear()
  terminal.disposeAll()
  state.workspace = ws
  state.recent = ws ? ws.recent : await cma.invoke('workspace:recent')

  if (!ws) {
    state.settings = null
    state.layout = L.emptyLayout()
    state.activeGroupId = state.layout.id
    el.wsButton.querySelector('span').textContent = 'Open a folder'
    explorer.setRoot(null)
    renderWelcome()
    refreshGit()
    updateTitle()
    settingsPane.update({ settings: null, prefs: state.prefs, workspace: null, recent: state.recent })
    return
  }

  state.settings = ws.settings
  el.wsButton.querySelector('span').textContent = ws.name
  document.documentElement.style.setProperty('--panel', `${ws.settings.codePanel.width}px`)
  state.layout = L.deserialize(ws.layout, (t) => (t && t.kind === 'file' && t.path ? { id: t.path, kind: 'file', path: t.path, title: t.title || basename(t.path) } : null))
  state.activeGroupId = L.firstGroup(state.layout).id
  explorer.setRoot(ws.path, ws.name, { showHidden: ws.settings.showHidden, excludeDirs: ws.settings.excludeDirs })
  terminal.setFontSize(ws.settings.terminalFontSize)
  settingsPane.update({ settings: ws.settings, prefs: state.prefs, workspace: ws, recent: ws.recent })
  renderGroups()

  state.panel.visible = ws.settings.codePanel.visible
  syncChrome()
  if (state.panel.visible) {
    const panelState = await cma.invoke('panel:show')
    if (ws.settings.codePanel.session && !panelState.slug) cma.invoke('panel:openSession', ws.settings.codePanel.session)
    else if (!panelState.loaded) cma.invoke('panel:navigate', '/code')
    onPanelState(await cma.invoke('panel:state'))
  }
  refreshGit()
  refreshAccount()
  updateTitle()
}

async function workspaceMenu () {
  const recent = state.recent || (state.workspace && state.workspace.recent) || []
  const items = [
    { id: 'open', label: 'Open Folder…' },
    ...(recent.length ? [{ type: 'separator' }] : []),
    ...recent.slice(0, 8).map((r) => ({ id: `recent:${r.path}`, label: r.name ? `${r.name}  —  ${r.path}` : r.path })),
    ...(state.workspace ? [{ type: 'separator' }, { id: 'close', label: 'Close Folder' }] : []),
  ]
  const picked = await cma.invoke('menu:popup', items)
  if (picked === 'open') cma.invoke('workspace:open', null)
  else if (picked === 'close') commands['file.closeFolder']()
  else if (picked && picked.startsWith('recent:')) cma.invoke('workspace:open', picked.slice(7))
}

// ── Context menus ─────────────────────────────────────────────────────────────

async function explorerMenu (entry) {
  const isDir = entry.type === 'dir'
  const dir = isDir ? entry.path : dirname(entry.path, SEP)
  const isRoot = entry.path === state.workspace?.path
  const items = [
    { id: 'newFile', label: 'New File…' },
    { id: 'newFolder', label: 'New Folder…' },
    { type: 'separator' },
    ...(isRoot ? [] : [{ id: 'rename', label: 'Rename…' }, { id: 'trash', label: 'Move to Trash' }, { type: 'separator' }]),
    { id: 'reveal', label: info.platform === 'darwin' ? 'Reveal in Finder' : 'Show in File Manager' },
    { id: 'copyPath', label: 'Copy Path' },
    { id: 'copyRel', label: 'Copy Relative Path' },
    ...(!isDir ? [{ type: 'separator' }, { id: 'addFile', label: 'Add File to Session' }, { id: 'openSide', label: 'Open to the Side' }] : []),
    ...(isDir ? [{ type: 'separator' }, { id: 'terminal', label: 'Open in Terminal' }] : []),
  ]
  const picked = await cma.invoke('menu:popup', items)
  switch (picked) {
    case 'newFile': return newFileIn(dir)
    case 'newFolder': {
      const name = await prompt({ title: 'New folder', label: `In ${relative(dir) || basename(dir)}`, placeholder: 'folder name' })
      if (!name) return
      try { await cma.invoke('fs:create', { dir, name, type: 'dir' }); explorer.expanded.add(dir); explorer.cache.delete(dir); explorer.render() } catch (e) { toast(e.message, { kind: 'error' }) }
      return
    }
    case 'rename': {
      const name = await prompt({ title: 'Rename', value: basename(entry.path), selectBaseName: !isDir })
      if (!name || name === basename(entry.path)) return
      const to = `${dirname(entry.path, SEP)}${SEP}${name}`
      try {
        await cma.invoke('fs:rename', entry.path, to)
        renameOpenDoc(entry.path, to, isDir)
        explorer.cache.delete(dirname(entry.path, SEP)); explorer.render()
      } catch (e) { toast(e.message, { kind: 'error' }) }
      return
    }
    case 'trash': {
      if (!(await confirm({ title: `Move ${basename(entry.path)} to the trash?`, okLabel: 'Move to Trash', danger: true }))) return
      try {
        await cma.invoke('fs:trash', entry.path)
        for (const g of L.groupsShowing(state.layout, (t) => t.path === entry.path || (isDir && t.path.startsWith(entry.path + SEP)))) {
          for (const t of g.tabs.filter((t) => t.path === entry.path || (isDir && t.path.startsWith(entry.path + SEP)))) { state.layout = L.closeTab(state.layout, g.id, t.id); state.docs.delete(t.id) }
        }
        if (!L.findGroup(state.layout, state.activeGroupId)) state.activeGroupId = L.firstGroup(state.layout).id
        renderGroups()
        explorer.cache.delete(dirname(entry.path, SEP)); explorer.render()
      } catch (e) { toast(e.message, { kind: 'error' }) }
      return
    }
    case 'reveal': return cma.invoke('fs:reveal', entry.path)
    case 'copyPath': return navigator.clipboard.writeText(entry.path)
    case 'copyRel': return navigator.clipboard.writeText(relative(entry.path))
    case 'addFile': await loadDoc(entry.path); return addFileToSession(entry.path)
    case 'openSide': { const { layout, groupId } = L.splitGroup(state.layout, state.activeGroupId, 'row'); state.layout = layout; state.activeGroupId = groupId; renderGroups(); return openFile(entry.path, groupId) }
    case 'terminal': showTerminal(true); return terminal.create({ cwd: entry.path })
    default:
  }
}

// A rename on disk is a rename of the open tab: same document, new name.
function renameOpenDoc (from, to, isDir) {
  const affected = [...state.docs.keys()].filter((p) => p === from || (isDir && p.startsWith(from + SEP)))
  for (const old of affected) {
    const next = isDir ? to + old.slice(from.length) : to
    const doc = state.docs.get(old)
    state.docs.delete(old)
    doc.path = next
    state.docs.set(next, doc)
    const showing = L.groupsShowing(state.layout, (t) => t.id === old)
    state.layout = L.updateTab(state.layout, old, { id: next, path: next, title: basename(next) })
    for (const g of showing) {
      if (g.active === old) state.layout = L.activateTab(state.layout, g.id, next)
    }
    for (const v of state.views.values()) if (v.tabId === old) v.tabId = next
  }
  renderGroups()
}

async function newFileIn (dir) {
  if (!dir) return
  const name = await prompt({ title: 'New file', label: `In ${relative(dir) || basename(dir)}`, placeholder: 'name.ext' })
  if (!name) return
  try {
    const { path } = await cma.invoke('fs:create', { dir, name, type: 'file' })
    explorer.expanded.add(dir); explorer.cache.delete(dir); await explorer.render()
    await openFile(path)
  } catch (e) { toast(e.message, { kind: 'error' }) }
}

async function tabMenu (groupId, tabId) {
  const picked = await cma.invoke('menu:popup', [
    { id: 'close', label: 'Close' },
    { id: 'closeOthers', label: 'Close Others' },
    { id: 'closeAll', label: 'Close All in Group' },
    { type: 'separator' },
    { id: 'splitRight', label: 'Split Right' },
    { id: 'splitDown', label: 'Split Down' },
    { type: 'separator' },
    { id: 'addFile', label: 'Add File to Session' },
    { id: 'revealExplorer', label: 'Reveal in Explorer' },
    { id: 'copyPath', label: 'Copy Path' },
  ])
  const group = L.findGroup(state.layout, groupId)
  if (!group) return
  switch (picked) {
    case 'close': return closeTab(groupId, tabId)
    case 'closeOthers': for (const t of group.tabs.filter((t) => t.id !== tabId)) await closeTab(groupId, t.id); return
    case 'closeAll': for (const t of [...group.tabs]) await closeTab(groupId, t.id); return
    case 'splitRight': return splitGroup(groupId, 'row')
    case 'splitDown': return splitGroup(groupId, 'column')
    case 'addFile': return addFileToSession(tabId)
    case 'revealExplorer': showPane('explorer'); return explorer.reveal(tabId)
    case 'copyPath': return navigator.clipboard.writeText(tabId)
    default:
  }
}

async function editorMenu (cmEl) {
  const entry = [...state.views.values()].find((v) => v.view.dom === cmEl)
  if (!entry) return
  const view = entry.view
  const sel = view.state.selection.main
  const picked = await cma.invoke('menu:popup', [
    { id: 'addSel', label: sel.empty ? 'Add Line to Session' : 'Add Selection to Session' },
    { id: 'addFile', label: 'Add File to Session' },
    { type: 'separator' },
    { id: 'cut', label: 'Cut', enabled: !sel.empty },
    { id: 'copy', label: 'Copy', enabled: !sel.empty },
    { id: 'paste', label: 'Paste' },
    { type: 'separator' },
    { id: 'find', label: 'Find…' },
    { id: 'goto', label: 'Go to Line…' },
  ])
  switch (picked) {
    case 'addSel': return addSelectionToSession(view)
    case 'addFile': return addFileToSession(docForView(view)?.path)
    case 'cut': await navigator.clipboard.writeText(view.state.sliceDoc(sel.from, sel.to)); view.dispatch(view.state.replaceSelection('')); return view.focus()
    case 'copy': await navigator.clipboard.writeText(view.state.sliceDoc(sel.from, sel.to)); return view.focus()
    case 'paste': { const text = await navigator.clipboard.readText(); view.dispatch(view.state.replaceSelection(text)); return view.focus() }
    case 'find': return ed.openSearchPanel(view)
    case 'goto': return ed.gotoLine(view)
    default:
  }
}

// ── Terminal helpers ──────────────────────────────────────────────────────────

function shellQuote (p) {
  if (info.platform === 'win32') return `"${p.replace(/"/g, '""')}"`
  return `'${p.replace(/'/g, "'\\''")}'`
}

async function runInTerminal (command) {
  showTerminal(true)
  await terminal.run(command)
}

// ── Commands (menu + keyboard) ────────────────────────────────────────────────

const commands = {
  'file.newFile': () => newFileIn(state.workspace?.path),
  'file.openFolder': () => cma.invoke('workspace:open', null),
  'file.openFile': async () => { for (const p of await cma.invoke('dialog:files')) await openFile(p) },
  'file.closeFolder': async () => {
    const dirty = [...state.docs.values()].filter((d) => d.dirty)
    if (dirty.length && !(await confirm({ title: `Close the folder with ${dirty.length} unsaved file${dirty.length > 1 ? 's' : ''}?`, message: 'Unsaved changes will be lost.', okLabel: 'Close Anyway', danger: true }))) return
    cma.invoke('workspace:close')
  },
  'file.save': () => saveDoc(activeDoc()),
  'file.saveAs': () => saveDoc(activeDoc(), { as: true }),
  'file.saveAll': () => saveAll(),
  'file.closeTab': () => { const g = L.findGroup(state.layout, state.activeGroupId); if (g && g.active) closeTab(g.id, g.active) },
  'view.quickOpen': () => { if (state.workspace) quickOpen.open() },
  'view.showExplorer': () => showPane('explorer'),
  'view.showSessions': () => showPane('sessions'),
  'view.showGithub': () => showPane('github'),
  'view.settings': () => showPane('settings'),
  'view.toggleSidebar': () => { state.sidebar.visible = !state.sidebar.visible; syncChrome() },
  'view.toggleTerminal': () => showTerminal(!state.terminal.visible),
  'view.togglePanel': () => showPanel(!state.panel.visible),
  'view.splitRight': () => splitGroup(state.activeGroupId, 'row'),
  'view.splitDown': () => splitGroup(state.activeGroupId, 'column'),
  'view.focusNextGroup': () => {
    const groups = L.groups(state.layout)
    const i = groups.findIndex((g) => g.id === state.activeGroupId)
    state.activeGroupId = groups[(i + 1) % groups.length].id
    renderGroups(); focusActiveEditor()
  },
  'view.toggleWordWrap': () => saveSettings({ wordWrap: !state.settings.wordWrap }),
  'go.nextTab': () => cycleTab(1),
  'go.prevTab': () => cycleTab(-1),
  'go.toLine': () => { const v = activeView(); if (v) ed.gotoLine(v) },
  'session.new': async () => {
    if (!state.sessions.signedIn) { showPanel(true); cma.invoke('panel:navigate', '/code'); return }
    const title = await prompt({ title: 'New code session', label: 'Title (optional)', placeholder: 'What are you building?', okLabel: 'Start' })
    if (title === null) return
    const res = await cma.invoke('cma:createSession', { title })
    if (res.unsupported) { showPanel(true); cma.invoke('panel:navigate', '/code'); toast('Start the session from the rail in the Code panel.', { kind: 'warn' }); return }
    if (res.error) { toast(`Couldn’t start a session: ${res.error}`, { kind: 'error' }); return }
    openSession(res.session.slug)
    refreshAccount()
  },
  'session.addSelection': () => addSelectionToSession(),
  'session.addFile': () => addFileToSession(),
  'panel.back': () => cma.invoke('panel:back'),
  'panel.forward': () => cma.invoke('panel:forward'),
  'panel.reload': () => cma.invoke('panel:reload'),
  'panel.allSessions': () => { showPanel(true); cma.invoke('panel:navigate', '/code/sessions/all') },
  'panel.openInBrowser': () => cma.invoke('shell:openExternal', state.panel.state?.url || `${info.serverUrl}/code`),
  'panel.signOut': async () => {
    if (!(await confirm({ title: 'Sign out of Configure My AI in this editor?', okLabel: 'Sign Out' }))) return
    await cma.invoke('panel:signOut')
    refreshAccount()
  },
  'terminal.new': () => { showTerminal(true); terminal.create() },
  'help.shortcuts': () => sheet({
    title: 'Keyboard shortcuts',
    rows: [
      [`${MOD} P`, 'Quick open a file'], [`${MOD} S`, 'Save'], [`${MOD} W`, 'Close tab'], [`${MOD} \\`, 'Split right'], [`${MOD} ⇧ \\`, 'Split down'],
      [`${MOD} K`, 'Focus next group'], ['Ctrl Tab', 'Next tab'], [`${MOD} B`, 'Toggle sidebar'], ['Ctrl `', 'Toggle terminal'], [`${MOD} ⇧ P`, 'Toggle Code panel'],
      [`${MOD} ⇧ L`, 'Add selection to the session'], [`${MOD} ⇧ ⌥ L`, 'Add the whole file'], [`${MOD} ⇧ N`, 'New code session'], [`${MOD} F`, 'Find in file'], ['Ctrl G', 'Go to line'], ['Alt Z', 'Word wrap'],
    ],
  }),
}

function cycleTab (dir) {
  const g = L.findGroup(state.layout, state.activeGroupId)
  if (!g || g.tabs.length < 2) return
  const i = g.tabs.findIndex((t) => t.id === g.active)
  const next = g.tabs[(i + dir + g.tabs.length) % g.tabs.length]
  state.layout = L.activateTab(state.layout, g.id, next.id)
  renderGroups(); focusActiveEditor()
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot () {
  buildShell()
  buildModules()
  state.prefs = await cma.invoke('prefs:get')
  document.documentElement.style.setProperty('--sidebar', `${state.prefs.sidebarWidth}px`)
  document.documentElement.style.setProperty('--terminal', `${state.prefs.terminalHeight}px`)
  applyTheme(state.prefs.theme === 'system' ? info.theme : state.prefs.theme)
  showPane('explorer')

  cma.on('menu:command', (name, args) => { const fn = commands[name]; if (fn) fn(args) })
  cma.on('workspace:opened', (ws) => loadWorkspace(ws))
  cma.on('fs:changed', onFilesChanged)
  cma.on('panel:state', onPanelState)
  cma.on('theme:changed', ({ theme }) => { if (state.prefs.theme === 'system') applyTheme(theme) })
  cma.on('window:focus', () => { refreshGitSoon(); refreshAccountSoon() })

  new ResizeObserver(() => { syncPanelBounds(); terminal.fit() }).observe(el.panelView)
  window.addEventListener('resize', () => { syncPanelBounds(); terminal.fit() })
  window.addEventListener('blur', () => { if (state.settings?.autoSave === 'onFocusChange') saveAll() })
  el.editorArea.addEventListener('focusout', (e) => {
    if (state.settings?.autoSave === 'onFocusChange' && e.target.closest?.('.cm-editor')) saveAll()
  })
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && quickOpen.isOpen) quickOpen.close()
  })
  setInterval(() => { if (document.hasFocus()) refreshAccount() }, 20000)
  setInterval(() => { if (document.hasFocus()) refreshGit() }, 30000)

  const ws = await cma.invoke('workspace:current')
  await loadWorkspace(ws)
  syncChrome()
}

boot().catch((e) => {
  console.error(e)
  toast(`The editor failed to start: ${e.message}`, { kind: 'error', timeout: 0 })
})
