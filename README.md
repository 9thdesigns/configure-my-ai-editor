# Configure My AI Editor

A lightweight desktop text editor with a Configure My AI **Code session** at
its side — so you can drive a session while building and editing the files it
touches, on **macOS, Windows and Linux**.

It is the [desktop app](https://github.com/9thdesigns/configure-my-ai-desktop)
turned into a side panel, with an editor, a terminal and a file tree built
around it. The session itself — its transcript, composer, repositories, pull
requests, settings — is the same page the web shows, rendered by the server
inside the panel. Nothing about a session is re-implemented here, so every
Code feature that ships on [configuremyai.com](https://configuremyai.com)
arrives in the editor the moment it ships.

## What you get

- **Workspaces with their own settings.** A workspace is a folder. Tab size,
  font, word wrap, auto save, the shell, the panel's width and the session it
  was last driving are remembered per folder; theme and server are yours.
- **Signed in once.** The Code panel signs into your Configure My AI account
  the way the desktop app does. The editor's own sidebars read the same
  signed-in session, so there is no second login and no token to paste.
- **Code sessions sidebar.** The sessions in your Configure My AI workspace —
  the same list as the web rail and the desktop app, live status included.
  Click one to open it in the panel; **New** starts one. Switch Configure My AI
  workspaces from the same pane.
- **GitHub.** The folder's branch, changes and remote in the status bar and
  the GitHub pane; whether Code has a GitHub account connected in this
  workspace, and a **Connect GitHub** button that finishes in your browser
  (the same handoff the desktop app uses); one-click sharing of the folder
  with the [cma-agent companion](https://configuremyai.com/agent) so a session
  runs against this very checkout.
- **Highlight → reference in the composer.** Select code, press
  <kbd>⌘⇧L</kbd> (<kbd>Ctrl⇧L</kbd>), and the selection lands in the session's
  composer as a reference — the path and line range, then the code fenced with
  its language:

  ```
  `app/models/user.rb:12-20`
  ```ruby
  def full_name
    [first_name, last_name].compact.join(' ')
  end
  ```
  ```

  Type the question under it. The model reads the same `path:line` convention
  it sees in a diff or a stack trace, so it knows exactly what is being asked
  about; a person reading the transcript sees it too. Whole files go in with
  <kbd>⌘⇧⌥L</kbd> or from a tab's or file's context menu.
- **Split views and tabs.** Split right, split down, drag tabs between groups,
  open a file to the side. Two views of one file edit the same document.
- **A terminal.** Tabs of terminals in your login shell, opened in the folder,
  so `git`, `claude` and `cma-agent` are where you left them.
- **The editor.** CodeMirror 6 with syntax highlighting for a hundred-odd
  languages loaded on demand, search and replace, go to line, multiple
  cursors, bracket matching, folding; quick open (<kbd>⌘P</kbd>) across the
  folder; files that change on disk — by the session, by git — reload in
  place, or are flagged if you have unsaved edits.
- **Always current.** The app updates itself with an in-app "Restart Now"
  prompt, exactly like the desktop app.

Nothing new to trust: the panel is configuremyai.com in a window with its own
cookie jar, the same sign-in and the same security as the desktop app. Your
files are read and written on this machine only; the one thing that leaves it
is what you put in the composer.

## Install

Installers for every platform are published on the
[releases page](https://github.com/9thdesigns/configure-my-ai-editor/releases):

| Platform | Download |
| --- | --- |
| macOS, Apple Silicon | `ConfigureMyAIEditor-arm64.dmg` |
| macOS, Intel | `ConfigureMyAIEditor-x64.dmg` |
| Windows x64 | `ConfigureMyAIEditor-win-x64.exe` |
| Windows ARM64 | `ConfigureMyAIEditor-win-arm64.exe` |
| Omarchy / Arch Linux | `ConfigureMyAIEditor-linux-x64.pacman` |
| Other Linux | `ConfigureMyAIEditor-linux-x64.AppImage` |

The `latest/download/<name>` URLs are stable across versions. First-launch
notes (Gatekeeper, SmartScreen, pacman signatures, FUSE for AppImages) are the
same as the desktop app's — see its README.

**Sign-in.** The panel signs in with email and password, like the desktop app.
An account created with Google or GitHub sign-in sets a password once under
account settings on the web.

## Keyboard

| Keys | What |
| --- | --- |
| <kbd>⌘P</kbd> | Quick open a file |
| <kbd>⌘S</kbd> / <kbd>⌘⇧S</kbd> / <kbd>⌘⌥S</kbd> | Save / Save As / Save All |
| <kbd>⌘W</kbd> | Close tab |
| <kbd>⌘\</kbd> / <kbd>⌘⇧\</kbd> | Split right / down |
| <kbd>⌘K</kbd>, <kbd>Ctrl Tab</kbd> | Next group, next tab |
| <kbd>⌘B</kbd> · <kbd>Ctrl `</kbd> · <kbd>⌘⇧P</kbd> | Toggle sidebar · terminal · Code panel |
| <kbd>⌘⇧L</kbd> / <kbd>⌘⇧⌥L</kbd> | Add selection / whole file to the session |
| <kbd>⌘⇧N</kbd> | New code session |
| <kbd>⌘[</kbd> / <kbd>⌘]</kbd> / <kbd>⌘R</kbd> | Panel back / forward / reload |
| <kbd>⌘F</kbd>, <kbd>Ctrl G</kbd>, <kbd>Alt Z</kbd> | Find, go to line, word wrap |

<kbd>Ctrl</kbd> stands in for <kbd>⌘</kbd> on Windows and Linux. Help →
Keyboard Shortcuts lists them in the app.

---

## For developers

The same Electron setup as the desktop app — the same chrome rules per OS,
the same electron-builder layout, the same release workflow and artifact
naming — with a renderer of its own. Product logic stays on the server.

```sh
npm install         # also rebuilds node-pty for the bundled Electron
npm start           # bundle the renderer, then run against https://configuremyai.com
npm run watch       # rebuild the renderer on change (run `electron .` alongside)
npm test            # unit tests for the pure modules (layout tree, references, policy…)
npm run check       # parse-checks every main-process file; needs a bundle
npm run smoke       # boot headlessly, screenshot the window, quit (xvfb-run on Linux)
npm run dist        # local DMGs in dist/ (dist:win, dist:linux likewise)
```

Requires Node 22+. `CMA_EDITOR_SERVER=http://localhost:3000 npm start` points
the panel at a local Rails server (or set it under Settings → Preferences).

### Project layout

```
src/main.js            entry: window chrome, IPC, workspaces, startup
src/code-panel.js      the Code panel (WebContentsView), navigation policy,
                       offline page, "add to session" into the composer
src/cma.js             the account, via the panel's cookies: who is signed in,
                       the sessions list, "New" (CSRF-carrying POST)
src/files.js           the file system as far as the renderer may reach
src/terminal.js        pseudo-terminals (node-pty) behind IPC
src/git.js             git status for the status bar (read-only)
src/workspaces.js      per-folder settings, layout and the recent list on disk
src/menu.js            the application menu → renderer commands
src/updater.js         in-app auto-update (electron-updater)
src/window-state.js    remembered window bounds
src/preload.js         the renderer's allow-listed IPC bridge (window.cma)
src/preload-code.js    the panel's preload: nothing exposed to the site
src/lib/*.js           pure modules, shared with the renderer and unit-tested
renderer/src/*.js      the UI: editor groups, explorer, sessions, GitHub,
                       terminal, quick open, settings (esbuild → renderer/dist)
scripts/build.js       the esbuild bundle
electron-builder.yml   packaging, artifact names, publish target
.github/workflows      CI (build, test, check) and Release (tag → installers)
```

### How the pieces talk

- **The panel is the desktop app.** `src/code-panel.js` applies the desktop
  app's navigation policy (`src/lib/url-policy.js`): the site stays in the
  panel, OAuth providers open in a popup, everything else goes to the browser.
  The user agent carries the desktop marker *and* the editor's own
  (`ConfigureMyAI-Desktop/x ConfigureMyAI-Editor/x`), so the server gives the
  panel the desktop treatment and can still tell a panel from a window — it
  drops the title-bar strip the desktop app's page reserves.
- **The account comes from the panel's cookies.** `src/cma.js` calls the
  site's JSON endpoints (`/api/session`, `/api/code/sessions`) through the
  panel's session, so they are signed in whenever the panel is. A write
  carries the page's CSRF token, read the way the site's own JavaScript reads
  it. There is no token stored anywhere.
- **A reference is text in the composer.** `src/lib/reference.js` formats it;
  `src/code-panel.js` reads the composer's field inside the panel, inserts the
  reference at the caret and fires the page's own `input` event, so the site's
  draft-saving and auto-resize run as if it had been typed.
- **Terminals are bytes.** The renderer's xterm.js instances talk to pseudo
  terminals in the main process; nothing interprets the stream.

### Security posture

Both renderers run with `contextIsolation`, `sandbox` and no Node
integration. The editor's own renderer reaches the main process only through
the allow-listed channels in `src/preload.js`; every path it names is
resolved and checked against the open folder (or a file picked in a dialog)
before it is read or written. The panel's preload exposes nothing to the
site, and the panel's permissions are limited to the app's own origin.

### Release

Tagging is shipping, as for the desktop app:

```sh
git tag v0.1.0
git push origin v0.1.0
```

`.github/workflows/release.yml` pre-creates the GitHub Release, then builds
macOS DMGs, Windows NSIS installers and the Linux `.pacman` + AppImage in
parallel and publishes them into that one release. Signing and notarization
secrets are optional and identical to the desktop app's (`CSC_LINK`,
`CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`;
`WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`). Renaming an `artifactName` in
`electron-builder.yml` breaks the download links above.

### The server side

Two small things in the Rails app make the editor more than a window:

- `MobileHelper#editor_app?` — the `ConfigureMyAI-Editor` marker — and
  `desktop_titlebar_chrome?`, which keeps the desktop app's title-bar strip
  out of the panel.
- `GET /api/code/sessions` and `POST /api/code/sessions` — the sessions
  sidebar's list and its **New** button, authenticated by the panel's cookie
  session (or a mobile token).

Against a server without them the editor still works: the panel hides the
strip itself (`src/preload-code.js`), and the sidebar says to use the rail
inside the panel.

## License

© 9th Designs. All rights reserved.
