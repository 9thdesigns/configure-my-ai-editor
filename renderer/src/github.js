// GitHub, from two sides: what git says about the open folder (branch,
// changes, the remote), and whether the Code feature has a GitHub account
// to work with in this Configure My AI workspace. Plus the companion
// (cma-agent), which is how a session runs against this very folder.

import { h, icon, clear } from './ui.js'

export class GithubPane {
  constructor ({ host, onConnect, onOpenRepo, onManageRepos, onShareFolder, onCompanionDocs, onRefresh, onOpenTerminal }) {
    this.host = host
    this.handlers = { onConnect, onOpenRepo, onManageRepos, onShareFolder, onCompanionDocs, onRefresh, onOpenTerminal }
    this.state = { git: null, github: null, signedIn: false, workspace: null }
    this.render()
  }

  update (patch) {
    Object.assign(this.state, patch)
    this.render()
  }

  render () {
    const { git, github, signedIn, workspace } = this.state
    const H = this.handlers
    clear(this.host)

    this.host.append(h('div', { class: 'pane__header' },
      h('span', { class: 'pane__title' }, 'GitHub'),
      h('span', { class: 'pane__actions' }, h('button', { class: 'iconbtn', title: 'Refresh', onclick: H.onRefresh }, icon('reload'))),
    ))

    // ── This folder ──
    const folder = h('section', { class: 'card' }, h('h3', { class: 'card__title' }, 'This folder'))
    if (!workspace) {
      folder.append(h('p', { class: 'muted' }, 'Open a folder to see its repository.'))
    } else if (!git || !git.repo) {
      folder.append(h('p', { class: 'muted' }, git && git.gitAvailable === false ? 'git is not installed on this machine.' : 'Not a git repository.'))
      folder.append(h('button', { class: 'btn', onclick: () => H.onOpenTerminal('git init\n') }, 'Run git init'))
    } else {
      const remote = git.remote
      folder.append(h('div', { class: 'kv' },
        h('span', { class: 'kv__k' }, 'Branch'),
        h('span', { class: 'kv__v' }, icon('branch'), git.branch || (git.detached ? 'detached HEAD' : '—')),
      ))
      folder.append(h('div', { class: 'kv' },
        h('span', { class: 'kv__k' }, 'Changes'),
        h('span', { class: 'kv__v' }, `${git.changed} changed, ${git.untracked} untracked`),
      ))
      if (git.upstream) {
        folder.append(h('div', { class: 'kv' },
          h('span', { class: 'kv__k' }, 'Upstream'),
          h('span', { class: 'kv__v' }, `${git.upstream}  ↑${git.ahead} ↓${git.behind}`),
        ))
      }
      folder.append(h('div', { class: 'kv' },
        h('span', { class: 'kv__k' }, 'Remote'),
        h('span', { class: 'kv__v' }, remote ? remote.fullName : 'none'),
      ))
      if (remote && remote.htmlUrl) {
        folder.append(h('div', { class: 'card__actions' },
          h('button', { class: 'btn', onclick: () => H.onOpenRepo(remote.htmlUrl) }, icon('external'), 'Open on GitHub'),
          h('button', { class: 'btn', onclick: () => H.onOpenTerminal('git status\n') }, icon('terminal'), 'git status'),
        ))
      }
    }
    this.host.append(folder)

    // ── The account's GitHub connection ──
    const account = h('section', { class: 'card' }, h('h3', { class: 'card__title' }, 'Code’s GitHub connection'))
    if (!signedIn) {
      account.append(h('p', { class: 'muted' }, 'Sign in to the Code panel to see which GitHub account your sessions use.'))
    } else if (!github) {
      account.append(h('p', { class: 'muted' }, 'Unknown on this server.'))
    } else if (github.connected) {
      account.append(h('p', {}, icon('check', 'ok'), ` Connected as @${github.login}`, github.borrowed ? h('span', { class: 'muted' }, ' (shared from another workspace)') : null))
      account.append(h('div', { class: 'card__actions' },
        h('button', { class: 'btn', onclick: H.onManageRepos }, 'Repositories…'),
        h('button', { class: 'btn', onclick: H.onConnect }, 'Reconnect'),
      ))
    } else {
      account.append(h('p', { class: 'muted' }, 'Connect GitHub so a session can read repositories and open pull requests. The connection finishes in your browser.'))
      account.append(h('div', { class: 'card__actions' }, h('button', { class: 'btn btn--primary', onclick: H.onConnect }, icon('github'), 'Connect GitHub')))
    }
    this.host.append(account)

    // ── The companion ──
    const companion = h('section', { class: 'card' }, h('h3', { class: 'card__title' }, 'Run sessions on this machine'))
    companion.append(h('p', { class: 'muted' },
      'With the cma-agent companion paired, a session can work directly in this folder — its real branches and uncommitted changes — using a coding CLI you already pay for.'))
    companion.append(h('div', { class: 'card__actions' },
      h('button', { class: 'btn', disabled: !workspace, onclick: H.onShareFolder, title: 'cma-agent repos:add <this folder>' }, icon('terminal'), 'Share this folder'),
      h('button', { class: 'btn', onclick: () => H.onOpenTerminal('cma-agent status\n') }, 'cma-agent status'),
      h('button', { class: 'btn btn--ghost', onclick: H.onCompanionDocs }, icon('external'), 'Set up the companion'),
    ))
    this.host.append(companion)
  }
}
