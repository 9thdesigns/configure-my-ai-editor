// The Code sessions sidebar: the same sessions the web rail lists, from the
// account the Code panel is signed into, with the one on screen marked.

import { h, icon, clear } from './ui.js'
import { statusLabel, isLive, relativeTime } from '../../src/lib/cma-api.js'

export class SessionsPane {
  constructor ({ host, onOpen, onNew, onSignIn, onSwitchWorkspace, onShowPanel, onRefresh, onOpenInBrowser }) {
    this.host = host
    this.handlers = { onOpen, onNew, onSignIn, onSwitchWorkspace, onShowPanel, onRefresh, onOpenInBrowser }
    this.state = { loading: true, signedIn: false, sessions: [], account: null, activeSlug: null }
    this.render()
  }

  update (patch) {
    Object.assign(this.state, patch)
    this.render()
  }

  render () {
    const s = this.state
    const { onOpen, onNew, onSignIn, onSwitchWorkspace, onShowPanel, onRefresh, onOpenInBrowser } = this.handlers
    clear(this.host)

    const header = h('div', { class: 'pane__header' },
      h('span', { class: 'pane__title' }, 'Code Sessions'),
      h('span', { class: 'pane__actions' },
        h('button', { class: 'iconbtn', title: 'Refresh', onclick: onRefresh }, icon('reload')),
        h('button', { class: 'iconbtn', title: 'New session (⌘⇧N)', onclick: onNew, disabled: !s.signedIn }, icon('plus')),
      ),
    )
    this.host.append(header)

    if (s.offline) {
      this.host.append(h('div', { class: 'pane__empty' },
        h('p', {}, 'Can’t reach the server.'),
        h('p', { class: 'muted' }, s.error || ''),
        h('button', { class: 'btn', onclick: onRefresh }, 'Try again'),
      ))
      return
    }

    if (!s.signedIn) {
      this.host.append(h('div', { class: 'pane__empty' },
        h('p', {}, 'Sign in to see your code sessions.'),
        h('p', { class: 'muted' }, 'The Code panel signs into your Configure My AI account — the same sessions you have on the web and in the desktop app.'),
        h('button', { class: 'btn btn--primary', onclick: onSignIn }, 'Sign in'),
      ))
      return
    }

    // Account + Configure My AI workspace switcher.
    if (s.account && s.account.user) {
      const ws = s.account.workspace
      const select = h('select', {
        class: 'select',
        title: 'Configure My AI workspace',
        onchange: (e) => onSwitchWorkspace(e.target.value),
      }, (s.account.workspaces || []).map((w) => h('option', { value: w.id, selected: ws && w.id === ws.id }, w.name)))
      this.host.append(h('div', { class: 'account' },
        h('div', { class: 'account__who' }, icon('user'), h('span', { class: 'account__name' }, s.account.user.name || s.account.user.email)),
        select,
      ))
    }

    if (s.unsupported) {
      this.host.append(h('div', { class: 'pane__empty' },
        h('p', {}, 'This server doesn’t list sessions to the editor yet.'),
        h('p', { class: 'muted' }, 'Use the sessions rail inside the Code panel — everything there works as on the web.'),
        h('button', { class: 'btn', onclick: onShowPanel }, 'Show the Code panel'),
      ))
      return
    }

    if (s.error) {
      this.host.append(h('div', { class: 'pane__empty' }, h('p', {}, 'Couldn’t load sessions.'), h('p', { class: 'muted' }, s.error)))
      return
    }

    const list = h('div', { class: 'sessions' })
    if (s.sessions.length === 0 && !s.loading) {
      list.append(h('div', { class: 'pane__empty' },
        h('p', {}, 'No sessions yet.'),
        h('button', { class: 'btn btn--primary', onclick: onNew }, 'Start a session'),
      ))
    }
    for (const session of s.sessions) {
      const live = isLive(session.status)
      list.append(h('div', {
        class: `session ${session.slug === s.activeSlug ? 'is-active' : ''} ${live ? 'is-live' : ''} ${session.status === 'awaiting_input' ? 'is-waiting' : ''}`,
        onclick: () => onOpen(session),
        title: session.title,
      },
      h('span', { class: `session__dot session__dot--${session.status}` }),
      h('div', { class: 'session__main' },
        h('div', { class: 'session__title' }, session.title),
        h('div', { class: 'session__meta' },
          session.repository ? h('span', { class: 'session__repo' }, session.repository.full_name) : null,
          h('span', { class: 'session__status' }, statusLabel(session.status)),
          h('span', { class: 'session__time' }, relativeTime(session.last_activity_at)),
        ),
      ),
      h('button', {
        class: 'iconbtn session__open', title: 'Open in browser',
        onclick: (e) => { e.stopPropagation(); onOpenInBrowser(session) },
      }, icon('external')),
      ))
    }
    this.host.append(list)

    if (s.account && s.account.workspace) {
      this.host.append(h('div', { class: 'pane__foot muted' }, `${s.sessions.length} in ${s.account.workspace.name}`))
    }
  }
}
