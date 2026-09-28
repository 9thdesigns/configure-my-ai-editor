// The editor renderer's bridge to the main process — the one file that runs
// with access to ipcRenderer. It exposes a small, named surface
// (window.cma) behind contextIsolation and nothing else: channels are
// allow-listed here, so a compromised renderer could ask for exactly what
// the editor asks for and no more.

const { contextBridge, ipcRenderer } = require('electron')

const INVOKE = new Set([
  'workspace:recent', 'workspace:open', 'workspace:close', 'workspace:current', 'workspace:saveSettings', 'workspace:saveLayout', 'workspace:forget',
  'prefs:get', 'prefs:set',
  'fs:list', 'fs:read', 'fs:write', 'fs:stat', 'fs:create', 'fs:rename', 'fs:trash', 'fs:reveal', 'fs:index',
  'dialog:folder', 'dialog:files', 'dialog:saveAs',
  'term:create',
  'git:status',
  'cma:whoami', 'cma:sessions', 'cma:createSession', 'cma:activateWorkspace',
  'panel:setBounds', 'panel:show', 'panel:hide', 'panel:navigate', 'panel:openSession', 'panel:back', 'panel:forward', 'panel:reload', 'panel:state', 'panel:addReference', 'panel:focus', 'panel:signOut',
  'shell:openExternal', 'menu:popup', 'window:setTitle', 'app:quit', 'clipboard:writeText',
])

const SEND = new Set(['term:input', 'term:resize', 'term:kill'])

const ON = new Set([
  'fs:changed', 'term:data', 'term:exit', 'panel:state', 'menu:command', 'workspace:opened', 'theme:changed', 'window:focus',
])

const info = ipcRenderer.sendSync('app:info')

contextBridge.exposeInMainWorld('cma', {
  info,
  invoke (channel, ...args) {
    if (!INVOKE.has(channel)) return Promise.reject(new Error(`Unknown channel: ${channel}`))
    return ipcRenderer.invoke(channel, ...args)
  },
  send (channel, ...args) {
    if (!SEND.has(channel)) throw new Error(`Unknown channel: ${channel}`)
    ipcRenderer.send(channel, ...args)
  },
  on (channel, listener) {
    if (!ON.has(channel)) throw new Error(`Unknown channel: ${channel}`)
    const wrapped = (_event, ...args) => listener(...args)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  },
})
