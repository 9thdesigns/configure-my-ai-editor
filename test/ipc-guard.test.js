const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { isTrustedFrame, guardIpc } = require('../src/lib/ipc-guard')

const INDEX = path.join(__dirname, '..', 'renderer', 'index.html')
const INDEX_URL = pathToFileURL(INDEX).toString()

function fakeIpc () {
  const handlers = {}
  return {
    handlers,
    handle (ch, fn) { handlers[ch] = fn },
    on (ch, fn) { handlers[ch] = fn },
  }
}

test('only the top frame showing the bundled renderer is trusted', () => {
  assert.ok(isTrustedFrame({ url: INDEX_URL, parent: null }, INDEX))
  assert.ok(isTrustedFrame({ url: `${INDEX_URL}#/settings`, parent: null }, INDEX))
  assert.ok(!isTrustedFrame({ url: INDEX_URL, parent: {} }, INDEX), 'sub-frame')
  assert.ok(!isTrustedFrame({ url: 'https://configuremyai.com/code', parent: null }, INDEX))
  assert.ok(!isTrustedFrame({ url: pathToFileURL('/tmp/evil.html').toString(), parent: null }, INDEX))
  assert.ok(!isTrustedFrame(null, INDEX))
})

test('guarded handlers run for the main renderer and refuse everyone else', async () => {
  const main = { id: 1 }
  const panel = { id: 2 }
  const ipc = guardIpc(fakeIpc(), { getMainContents: () => main, rendererIndexPath: INDEX }, () => {})
  let reads = 0
  ipc.handle('fs:read', () => { reads++; return 'ok' })
  ipc.on('app:info', (event) => { event.returnValue = { v: 1 } })

  const good = { sender: main, senderFrame: { url: INDEX_URL, parent: null } }
  assert.equal(await ipc.handlers['fs:read'](good, 'a.txt'), 'ok')

  const fromPanel = { sender: panel, senderFrame: { url: INDEX_URL, parent: null } }
  assert.throws(() => ipc.handlers['fs:read'](fromPanel, '/etc/passwd'), /Untrusted sender/)
  const navigatedAway = { sender: main, senderFrame: { url: 'https://evil.test/', parent: null } }
  assert.throws(() => ipc.handlers['fs:read'](navigatedAway, 'x'), /Untrusted sender/)
  assert.equal(reads, 1)

  const sync = { sender: panel, senderFrame: { url: 'https://configuremyai.com/', parent: null } }
  ipc.handlers['app:info'](sync)
  assert.equal(sync.returnValue, null, 'sendSync from an untrusted sender still gets an answer, an empty one')
})

test('nothing is trusted before the main window exists', () => {
  const ipc = guardIpc(fakeIpc(), { getMainContents: () => null, rendererIndexPath: INDEX }, () => {})
  ipc.handle('fs:list', () => [])
  assert.throws(() => ipc.handlers['fs:list']({ sender: {}, senderFrame: { url: INDEX_URL } }), /Untrusted/)
})
