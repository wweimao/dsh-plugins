'use strict';
// All application pairs, authorization codes and tokens in this file are synthetic fixtures.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const root = resolve(__dirname, '..');
const moduleAt = name => import(pathToFileURL(resolve(root, 'lib', name)).href);
const pair = { clientId: '123456-fixture.apps.googleusercontent.com', clientSecret: 'GOCSPX-fixture_only' };
const pin = 'd82033662f9a803a8d51805e1bef3520d77fe7948b4a5fd142b5f55a0053637b';
const windowsRef = 'GOOGLE_ANTIGRAVITY_WINDOWS_APP_OAUTH_CLIENT_CONFIG';
function storage(value) {
  const calls = { resolved: [], written: [] };
  return { calls,
    async resolve(ref) { calls.resolved.push(ref); return value === undefined ? undefined : { value: JSON.stringify(value) }; },
    async set(ref, content) { calls.written.push([ref, JSON.parse(content)]); },
  };
}

test('source and runtime use identical reviewed OAuth implementations', () => {
  for (const name of ['oauth-flow.js', 'client-config-runtime.js', 'app-oauth.js', 'windows-app-oauth.js']) {
    assert.deepEqual(readFileSync(resolve(root, 'src', name)), readFileSync(resolve(root, 'lib', name)), name);
  }
  const entry = readFileSync(resolve(root, 'lib/index.js'), 'utf8');
  assert.match(entry, /from "\.\/oauth-flow\.js"/);
  assert.match(entry, /windowsApplicationSha256/);
  assert.match(entry, /GOOGLE_ANTIGRAVITY_WINDOWS_APP_OAUTH_CREDENTIAL/);
  assert.doesNotMatch(entry, /darwin\/arm64/);
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  for (const name of ['oauth-flow.js', 'client-config-runtime.js', 'windows-app-oauth.js']) {
    assert.ok(manifest.files.includes(`lib/${name}`));
    assert.ok(manifest.files.includes(`src/${name}`));
  }
});

test('public bundle never approves an unsigned Windows application on behalf of installers', () => {
  const patch = readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8');
  assert.doesNotMatch(patch, /^\s*windowsApplicationSha256\s*:/m);
  assert.doesNotMatch(patch, /d82033662f9a803a8d51805e1bef3520d77fe7948b4a5fd142b5f55a0053637b/);
});

test('configuration diagnostics never echo rejected JSON or secret values', async () => {
  const { parseOAuthClientConfig } = await moduleAt('client-config-runtime.js');
  assert.deepEqual(parseOAuthClientConfig(JSON.stringify(pair)), pair);
  for (const raw of ['{"SENSITIVE_FIXTURE":', JSON.stringify({ clientId: 'SENSITIVE_FIXTURE', clientSecret: pair.clientSecret }),
    JSON.stringify({ clientId: pair.clientId, clientSecret: 'SENSITIVE_FIXTURE' }), 'null', '[]']) {
    assert.throws(() => parseOAuthClientConfig(raw), error => !error.message.includes('SENSITIVE_FIXTURE'));
  }
});

test('Windows import requires explicit approval before reading credentials', async () => {
  const { resolveOAuthClientConfig } = await moduleAt('client-config-runtime.js');
  const store = storage();
  await assert.rejects(resolveOAuthClientConfig(store, undefined, undefined, async () => pair, { platform: 'win32' }), /explicitly approved/);
  assert.equal(store.calls.resolved.length, 0);
  assert.equal(store.calls.written.length, 0);
});

test('Windows application identity has an isolated, truthfully labelled pinned cache', async () => {
  const { resolveOAuthClientConfig } = await moduleAt('client-config-runtime.js');
  const store = storage({ ...pair, source: 'official-app' });
  let imported = 0;
  const result = await resolveOAuthClientConfig(store, 'GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_CONFIG', 'C:\\fixture', async (path, options) => {
    imported++;
    assert.equal(path, 'C:\\fixture');
    assert.deepEqual(options, { sha256: pin });
    return pair;
  }, { platform: 'win32', sha256: pin });
  assert.deepEqual(result, pair);
  assert.equal(imported, 1);
  assert.deepEqual(store.calls.resolved, [windowsRef]);
  assert.deepEqual(store.calls.written, [[windowsRef, { ...pair, source: 'windows-app-pinned', binarySha256: pin }]]);
});

test('approved Windows cache does not reread application files or rewrite credentials', async () => {
  const { resolveOAuthClientConfig } = await moduleAt('client-config-runtime.js');
  const store = storage({ ...pair, source: 'windows-app-pinned', binarySha256: pin });
  assert.deepEqual(await resolveOAuthClientConfig(store, windowsRef, undefined, () => { throw Error('must not import'); },
    { platform: 'win32', sha256: pin }), pair);
  assert.equal(store.calls.written.length, 0);
});

test('different Windows approval never reuses a differently pinned cached identity', async () => {
  const { resolveOAuthClientConfig } = await moduleAt('client-config-runtime.js');
  const store = storage({ ...pair, source: 'windows-app-pinned', binarySha256: 'f'.repeat(64) });
  let count = 0;
  await resolveOAuthClientConfig(store, windowsRef, undefined, async () => { count++; return pair; }, { platform: 'win32', sha256: pin });
  assert.equal(count, 1);
  assert.equal(store.calls.written[0][1].binarySha256, pin);
});

test('macOS keeps its signature-import cache; no Windows pin is needed', async () => {
  const { resolveOAuthClientConfig } = await moduleAt('client-config-runtime.js');
  const store = storage();
  assert.deepEqual(await resolveOAuthClientConfig(store, 'GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_CONFIG', '/Applications/Antigravity.app',
    async (path, options) => { assert.equal(path, '/Applications/Antigravity.app'); assert.deepEqual(options, {}); return pair; },
    { platform: 'darwin' }), pair);
  assert.equal(store.calls.written[0][0], 'GOOGLE_ANTIGRAVITY_APP_OAUTH_CLIENT_CONFIG');
  assert.equal(store.calls.written[0][1].source, 'official-app');
  assert.equal(store.calls.written[0][1].binarySha256, undefined);
});

test('unsupported platform and invalid refs fail without importing', async () => {
  const { resolveOAuthClientConfig } = await moduleAt('client-config-runtime.js');
  await assert.rejects(resolveOAuthClientConfig(storage(), 'BAD REF', undefined, undefined, { platform: 'win32', sha256: pin }), /POSIX/);
  await assert.rejects(resolveOAuthClientConfig(storage(), 'CUSTOM_REF', undefined, undefined, { platform: 'linux' }), /supports macOS/);
});

const credential = { type: 'oauth', access: 'fixture-access', refresh: 'fixture-refresh', expires: 1, projectId: 'fixture-project' };
function requestStub(calls) {
  return async (url, options) => {
    calls.push({ url, options });
    if (url === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({
      access_token: 'fixture-new-access', refresh_token: 'fixture-new-refresh', expires_in: 3600,
    }), { status: 200 });
    if (url.endsWith(':loadCodeAssist')) return new Response(JSON.stringify({ cloudaicompanionProject: { id: 'fixture-project' } }), { status: 200 });
    throw new Error('Unexpected external endpoint in offline test');
  };
}
async function startAttempt(options = {}) {
  const { createAntiGravityOAuth } = await moduleAt('oauth-flow.js');
  const calls = [];
  const controller = new AbortController();
  const announced = Promise.withResolvers();
  const oauth = createAntiGravityOAuth(async () => pair, { fetch: requestStub(calls), timeoutMs: 5000, ...options });
  const pending = oauth.login({ signal: controller.signal, notify: event => announced.resolve(event), prompt: () => Promise.reject(Error('unexpected prompt')) });
  void pending.catch(error => announced.reject(error));
  const event = await announced.promise;
  return { calls, controller, oauth, pending, auth: new URL(event.url) };
}
async function callback(auth, params = {}, host = '127.0.0.1') {
  const url = new URL(`http://${host}:51121/oauth-callback`);
  url.search = new URLSearchParams({ state: auth.searchParams.get('state'), code: 'fixture-code', ...params }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  await response.text();
  return response;
}

test('Windows-compatible browser flow binds before publishing URL, uses PKCE and persists no tokens itself', async () => {
  const attempt = await startAttempt();
  const { auth } = attempt;
  assert.equal(auth.origin, 'https://accounts.google.com');
  assert.equal(auth.searchParams.get('redirect_uri'), 'http://localhost:51121/oauth-callback');
  assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
  assert.match(auth.searchParams.get('scope'), /\/auth\/aicode/);
  assert.equal((await callback(auth)).status, 200);
  const result = await attempt.pending;
  assert.equal(result.type, 'oauth');
  assert.equal(result.access, 'fixture-new-access');
  assert.equal(result.refresh, 'fixture-new-refresh');
  assert.equal(result.projectId, 'fixture-project');
  assert.ok(result.expires > Date.now());
});

test('PKCE exchange and real runtime platform headers match the browser handoff', async () => {
  const attempt = await startAttempt();
  try {
    await callback(attempt.auth);
    const result = await attempt.pending;
    assert.equal(result.type, 'oauth');
    assert.equal(result.projectId, 'fixture-project');
    assert.ok(result.expires > Date.now());
    const body = attempt.calls[0].options.body;
    assert.equal(body.get('client_id'), pair.clientId);
    assert.equal(body.get('client_secret'), pair.clientSecret);
    assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'), attempt.auth.searchParams.get('code_challenge'));
    assert.match(attempt.calls[1].options.headers['user-agent'], new RegExp(`os_type=${process.platform}; arch=${process.arch}\\)$`));
  } finally { attempt.controller.abort(); await attempt.pending.catch(() => {}); }
});

test('invalid state is rejected without terminating the valid login attempt', async () => {
  const attempt = await startAttempt();
  try {
    assert.equal((await callback(attempt.auth, { state: 'wrong-fixture-state' })).status, 400);
    assert.equal(attempt.calls.length, 0);
    assert.equal((await callback(attempt.auth)).status, 200);
    await attempt.pending;
  } finally { attempt.controller.abort(); await attempt.pending.catch(() => {}); }
});

test('IPv6 localhost callback works where IPv6 loopback is available', async t => {
  const attempt = await startAttempt();
  try {
    try { await callback(attempt.auth, {}, '[::1]'); }
    catch (error) {
      if (['ECONNREFUSED', 'EAFNOSUPPORT', 'ENETUNREACH'].includes(error?.cause?.code)) { t.skip('IPv6 unavailable'); return; }
      throw error;
    }
    await attempt.pending;
  } finally { attempt.controller.abort(); await attempt.pending.catch(() => {}); }
});

test('Google denial produces a redacted error and no exchange', async () => {
  const attempt = await startAttempt();
  await callback(attempt.auth, { error: 'SENSITIVE_FIXTURE', error_description: 'SENSITIVE_FIXTURE' });
  await assert.rejects(attempt.pending, error => /denied or failed/.test(error.message) && !error.message.includes('SENSITIVE_FIXTURE'));
  assert.equal(attempt.calls.length, 0);
});

test('cancelling a login releases the callback port for a new attempt', async () => {
  const first = await startAttempt();
  first.controller.abort(new Error('fixture cancelled'));
  await assert.rejects(first.pending, /fixture cancelled/);
  const next = await startAttempt();
  next.controller.abort(new Error('second fixture cancelled'));
  await assert.rejects(next.pending, /second fixture cancelled/);
});

test('occupied callback port fails before handing the user an unusable URL', async () => {
  const blocker = createServer();
  await new Promise((yes, no) => { blocker.once('error', no); blocker.listen(51121, '127.0.0.1', yes); });
  try {
    const { createAntiGravityOAuth } = await moduleAt('oauth-flow.js');
    let notified = false;
    await assert.rejects(createAntiGravityOAuth(async () => pair).login({ notify() { notified = true; } }), /already in use/);
    assert.equal(notified, false);
  } finally { await new Promise(resolve => blocker.close(resolve)); }
});

test('login timeout is bounded and releases the callback listener', async () => {
  const first = await startAttempt({ timeoutMs: 100 });
  await assert.rejects(first.pending, /timed out/);
  const next = await startAttempt();
  next.controller.abort(new Error('fixture cleanup'));
  await assert.rejects(next.pending, /fixture cleanup/);
});

test('refresh forwards cancellation, preserves project, validates response, and uses the application pair', async () => {
  const { createAntiGravityOAuth } = await moduleAt('oauth-flow.js');
  const calls = [];
  const oauth = createAntiGravityOAuth(async () => pair, { fetch: requestStub(calls) });
  const controller = new AbortController();
  const updated = await oauth.refresh(credential, controller.signal);
  assert.equal(updated.projectId, credential.projectId);
  assert.equal(updated.refresh, 'fixture-new-refresh');
  assert.equal(calls[0].options.signal, controller.signal);
  assert.equal(calls[0].options.body.get('client_secret'), pair.clientSecret);
  assert.equal(calls[0].options.body.get('refresh_token'), credential.refresh);
  controller.abort();
  await assert.rejects(oauth.refresh(credential, controller.signal), { name: 'AbortError' });
  assert.equal(calls.length, 1);
  await assert.rejects(oauth.refresh({ ...credential, projectId: '' }), /no Cloud Code Assist project/);
});

test('malformed token JSON/fields are redacted and cannot become saved credentials', async () => {
  const { createAntiGravityOAuth } = await moduleAt('oauth-flow.js');
  const malformed = createAntiGravityOAuth(async () => pair, { fetch: async () => new Response('{SENSITIVE_FIXTURE') });
  await assert.rejects(malformed.refresh(credential), error => /not valid JSON/.test(error.message) && !error.message.includes('SENSITIVE_FIXTURE'));
  for (const value of [{ access_token: '', expires_in: 3600 }, { access_token: 'fixture', expires_in: -1 }, null]) {
    const oauth = createAntiGravityOAuth(async () => pair, { fetch: async () => new Response(JSON.stringify(value)) });
    await assert.rejects(oauth.refresh(credential), /missing required fields/);
  }
});

test('IPv6 port collision also fails before URL handoff and releases IPv4', async t => {
  const blocker = createServer();
  try {
    await new Promise((yes, no) => { blocker.once('error', no); blocker.listen({ port: 51121, host: '::1', ipv6Only: true }, yes); });
  } catch (error) {
    if (['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code)) { t.skip('IPv6 unavailable'); return; }
    throw error;
  }
  try {
    const { createAntiGravityOAuth } = await moduleAt('oauth-flow.js');
    let notified = false;
    await assert.rejects(createAntiGravityOAuth(async () => pair).login({ notify() { notified = true; } }), /already in use/);
    assert.equal(notified, false);
  } finally { await new Promise(resolve => blocker.close(resolve)); }
  const next = await startAttempt();
  next.controller.abort(new Error('fixture cleanup'));
  await assert.rejects(next.pending, /fixture cleanup/);
});

test('notification failure closes both callback listeners', async () => {
  const { createAntiGravityOAuth } = await moduleAt('oauth-flow.js');
  await assert.rejects(createAntiGravityOAuth(async () => pair).login({ notify() { throw new Error('fixture notification failed'); } }), /fixture notification failed/);
  const next = await startAttempt();
  next.controller.abort(new Error('fixture cleanup'));
  await assert.rejects(next.pending, /fixture cleanup/);
});

test('duplicated callback parameters are rejected without performing an exchange', async () => {
  const attempt = await startAttempt();
  try {
    const url = new URL('http://127.0.0.1:51121/oauth-callback');
    url.searchParams.set('state', attempt.auth.searchParams.get('state'));
    url.searchParams.append('code', 'fixture-code'); url.searchParams.append('code', 'fixture-duplicate');
    const rejected = await fetch(url); await rejected.text();
    assert.equal(rejected.status, 400);
    assert.equal(attempt.calls.length, 0);
    await callback(attempt.auth);
    await attempt.pending;
  } finally { attempt.controller.abort(); await attempt.pending.catch(() => {}); }
});

test('cancellation reaches an in-flight token exchange rather than just abandoning its promise', async () => {
  const exchangeStarted = Promise.withResolvers();
  const attempt = await startAttempt({ fetch: async (url, options) => {
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    exchangeStarted.resolve(options.signal);
    return new Promise((yes, no) => options.signal.addEventListener('abort', () => no(options.signal.reason), { once: true }));
  } });
  await callback(attempt.auth);
  const signal = await exchangeStarted.promise;
  attempt.controller.abort(new Error('fixture network cancelled'));
  await assert.rejects(attempt.pending, /fixture network cancelled/);
  assert.equal(signal.aborted, true);
});

test('pre-aborted login does not import any application configuration', async () => {
  const { createAntiGravityOAuth } = await moduleAt('oauth-flow.js');
  const controller = new AbortController(); controller.abort();
  let imported = false;
  await assert.rejects(createAntiGravityOAuth(async () => { imported = true; return pair; }).login({ signal: controller.signal, notify() {} }), { name: 'AbortError' });
  assert.equal(imported, false);
});
