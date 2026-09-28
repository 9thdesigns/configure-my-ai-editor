// The application menu. Standard roles everywhere they exist; everything
// else is a command the renderer carries out (`menu:command`), so the menu
// and the keyboard shortcuts it advertises are one list, here.

const { Menu, shell, app } = require('electron')
const { RELEASES_URL } = require('./config')

function installMenu ({ appUrl, getWindow, getRecent, onOpenRecent, onCheckForUpdates, send }) {
  const isMac = process.platform === 'darwin'
  const cmd = (name, args) => () => send('menu:command', name, args)

  const recentItems = () => {
    const recent = (getRecent && getRecent()) || []
    if (recent.length === 0) return [{ label: 'No Recent Folders', enabled: false }]
    return recent.map((entry) => ({
      label: entry.name ? `${entry.name}  —  ${entry.path}` : entry.path,
      click: () => onOpenRecent(entry.path),
    }))
  }

  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New File', accelerator: 'CmdOrCtrl+N', click: cmd('file.newFile') },
        { label: 'New Terminal', accelerator: 'CmdOrCtrl+Shift+`', click: cmd('terminal.new') },
        { type: 'separator' },
        { label: 'Open Folder…', accelerator: 'CmdOrCtrl+O', click: cmd('file.openFolder') },
        { label: 'Open File…', accelerator: 'CmdOrCtrl+Shift+O', click: cmd('file.openFile') },
        { label: 'Open Recent', submenu: recentItems() },
        { label: 'Close Folder', click: cmd('file.closeFolder') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: cmd('file.save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: cmd('file.saveAs') },
        { label: 'Save All', accelerator: 'CmdOrCtrl+Alt+S', click: cmd('file.saveAll') },
        { type: 'separator' },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: cmd('file.closeTab') },
        { label: 'Workspace Settings', accelerator: 'CmdOrCtrl+,', click: cmd('view.settings') },
        ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit' }]),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Quick Open…', accelerator: 'CmdOrCtrl+P', click: cmd('view.quickOpen') },
        { label: 'Go to Line…', accelerator: 'Ctrl+G', click: cmd('go.toLine') },
        { type: 'separator' },
        { label: 'Explorer', accelerator: 'CmdOrCtrl+Shift+E', click: cmd('view.showExplorer') },
        { label: 'Code Sessions', accelerator: 'CmdOrCtrl+Shift+C', click: cmd('view.showSessions') },
        { label: 'GitHub', accelerator: 'CmdOrCtrl+Shift+G', click: cmd('view.showGithub') },
        { type: 'separator' },
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', click: cmd('view.toggleSidebar') },
        { label: 'Toggle Terminal', accelerator: 'Ctrl+`', click: cmd('view.toggleTerminal') },
        { label: 'Toggle Code Panel', accelerator: 'CmdOrCtrl+Shift+P', click: cmd('view.togglePanel') },
        { type: 'separator' },
        { label: 'Split Right', accelerator: 'CmdOrCtrl+\\', click: cmd('view.splitRight') },
        { label: 'Split Down', accelerator: 'CmdOrCtrl+Shift+\\', click: cmd('view.splitDown') },
        { label: 'Focus Next Group', accelerator: 'CmdOrCtrl+K', click: cmd('view.focusNextGroup') },
        { type: 'separator' },
        { label: 'Next Tab', accelerator: 'Ctrl+Tab', click: cmd('go.nextTab') },
        { label: 'Previous Tab', accelerator: 'Ctrl+Shift+Tab', click: cmd('go.prevTab') },
        { type: 'separator' },
        { label: 'Toggle Word Wrap', accelerator: 'Alt+Z', click: cmd('view.toggleWordWrap') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ type: 'separator' }, { role: 'toggleDevTools' }]),
      ],
    },
    {
      label: 'Session',
      submenu: [
        { label: 'New Code Session', accelerator: 'CmdOrCtrl+Shift+N', click: cmd('session.new') },
        { label: 'Add Selection to Session', accelerator: 'CmdOrCtrl+Shift+L', click: cmd('session.addSelection') },
        { label: 'Add File to Session', accelerator: 'CmdOrCtrl+Shift+Alt+L', click: cmd('session.addFile') },
        { type: 'separator' },
        { label: 'Back', accelerator: 'CmdOrCtrl+[', click: cmd('panel.back') },
        { label: 'Forward', accelerator: 'CmdOrCtrl+]', click: cmd('panel.forward') },
        { label: 'Reload Panel', accelerator: 'CmdOrCtrl+R', click: cmd('panel.reload') },
        { label: 'All Sessions', click: cmd('panel.allSessions') },
        { type: 'separator' },
        { label: 'Open in Browser', click: cmd('panel.openInBrowser') },
        { label: 'Sign Out', click: cmd('panel.signOut') },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Check for Updates…', click: () => { if (typeof onCheckForUpdates === 'function') onCheckForUpdates() } },
        { type: 'separator' },
        { label: 'Keyboard Shortcuts', click: cmd('help.shortcuts') },
        { label: 'How Code Sessions Work', click: () => shell.openExternal(`${appUrl}/about`) },
        { label: 'The Companion (cma-agent)', click: () => shell.openExternal(`${appUrl}/agent`) },
        { type: 'separator' },
        { label: 'Release Notes', click: () => shell.openExternal(RELEASES_URL) },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  void getWindow
}

module.exports = { installMenu }
