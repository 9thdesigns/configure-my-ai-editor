const test = require('node:test')
const assert = require('node:assert/strict')
const { decide, isAppUrl, isAuthUrl } = require('../src/lib/url-policy')

const APP = 'https://configuremyai.com'

test('the app host and its subdomains stay in the panel', () => {
  assert.equal(decide('https://configuremyai.com/code', APP), 'app')
  assert.equal(decide('https://www.configuremyai.com/', APP), 'app')
  assert.equal(isAppUrl('http://configuremyai.com/', APP), false, 'a downgrade to http is not ours')
  assert.equal(isAppUrl('https://configuremyai.com.evil.example/', APP), false)
})

test('a developer server on localhost is the app when configured as such', () => {
  assert.equal(decide('http://localhost:3000/code', 'http://localhost:3000'), 'app')
  assert.equal(decide('http://localhost:4000/code', 'http://localhost:3000'), 'external', 'another port is another site')
})

test('OAuth providers open in a popup; the rest of the web leaves the app', () => {
  assert.equal(decide('https://accounts.google.com/o/oauth2/auth', APP), 'auth')
  assert.equal(decide('https://github.com/login/oauth/authorize?client_id=x', APP), 'auth')
  assert.equal(decide('https://github.com/session', APP), 'auth')
  assert.equal(decide('https://github.com/9thdesigns/configure-my-ai/pull/1', APP), 'external', 'GitHub content needs the browser session')
  assert.equal(decide('https://example.com/', APP), 'external')
})

test('non-web schemes are dropped, never handed to the OS', () => {
  assert.equal(decide('file:///etc/passwd', APP), 'deny')
  assert.equal(decide('javascript:alert(1)', APP), 'deny')
  assert.equal(decide('not a url', APP), 'deny')
  assert.equal(isAuthUrl('http://accounts.google.com/'), false, 'auth hosts count only over https')
})
