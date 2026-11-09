import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, inject } from '../index.js';
import { PASSWORD, FINGERPRINT, MemoryCredentials, serverConfig, storedRecord, loopback, trustedSave } from './helpers.js';

function fakeContext(t, credentials = new MemoryCredentials()) {
  const tools = new Map();
  const routes = new Map();
  const effects = [];
  const approvals = [];
  const state = { admission: { peer: { principal: { kind: 'owner' } } }, outcome: 'allowed-once' };
  const ctx = {
    credentials,
    effect(factory) { const cleanup = factory(); effects.push(cleanup); return cleanup; },
    tools: { register(definition) { assert.ok(!tools.has(definition.name)); tools.set(definition.name, definition); return () => tools.delete(definition.name); } },
    connection: {
      admit() { return state.admission; },
      fetch: { register(route) { routes.set(route.path, route); return async () => { routes.delete(route.path); }; } },
    },
    approval: { async request(request) { approvals.push(request); if (state.outcome instanceof Error) throw state.outcome; return state.outcome; } },
  };
  apply(ctx);
  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    for (const cleanup of effects.toReversed()) await cleanup?.();
  };
  t.after(dispose);
  const exec = { signal: new AbortController().signal, agent: { id: 'test-agent' }, callId: 'test-call' };
  const call = (name, args, runContext = exec) => tools.get(name).execute(args, runContext);
  const route = routes.get('/api/named-ssh');
  const post = (body, contentType = 'application/json') => route.fetch(new Request('http://localhost/api/named-ssh', { method: 'POST', headers: { 'Content-Type': contentType }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
  return { ctx, tools, routes, effects, state, approvals, dispose, exec, call, route, post };
}

function noSecrets(value, ...extra) {
  const encoded = typeof value === 'string' ? value : JSON.stringify(value);
  for (const secret of [PASSWORD, ...extra]) assert.ok(!encoded.includes(secret), 'public result must not contain a credential or raw diagnostic');
}

test('host registers exactly three credential-free tool contracts and cleans up every registration', async t => {
  const active = serverConfig();
  const disabled = serverConfig(22, { alias: 'disabled', enabled: false });
  const record = storedRecord(active);
  record.payload.servers.push({ server: disabled, credential: { password: PASSWORD }, revision: 1 });
  const f = fakeContext(t, new MemoryCredentials(record));
  assert.deepEqual([...inject].sort(), ['approval', 'connection', 'credentials', 'tools']);
  assert.deepEqual([...f.tools.keys()].sort(), ['ssh_exec', 'ssh_list_servers', 'ssh_test_connection']);
  assert.equal(f.effects.length, 5);
  assert.deepEqual(f.tools.get('ssh_exec').parameters.required, ['alias', 'command']);
  assert.deepEqual(Object.keys(f.tools.get('ssh_exec').parameters.properties).sort(), ['alias', 'command', 'cwd', 'timeout_ms']);
  assert.match(f.tools.get('ssh_exec').description, /approval/);
  assert.match(f.tools.get('ssh_exec').description, /local file sandbox/);
  for (const definition of f.tools.values()) {
    assert.equal(definition.parameters.additionalProperties, false);
    for (const forbidden of ['host', 'password', 'credential', 'privateKey', 'passphrase']) assert.ok(!(forbidden in definition.parameters.properties));
  }
  const result = await f.call('ssh_list_servers', {});
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.servers.map(x => x.alias), [active.alias]);
  assert.deepEqual(Object.keys(result.value.servers[0]).sort(), [...Object.keys(active), 'hasCredential', 'revision'].sort());
  noSecrets(result);
  noSecrets(f.tools.get('ssh_list_servers').output.render({}, result));
  const invalid = await f.call('ssh_list_servers', { password: PASSWORD });
  assert.equal(invalid.error.code, 'INVALID_INPUT');
  noSecrets(invalid);
  await f.dispose();
  assert.equal(f.tools.size, 0);
  assert.equal(f.routes.size, 0);
});

test('user route rejects non-owner admission and malformed/oversized bodies without echoing them', async t => {
  const f = fakeContext(t);
  assert.deepEqual(f.route.methods, ['POST']);
  for (const [admission, status] of [[{ rejection: 401 }, 401], [{ rejection: 403 }, 403], [{ peer: { principal: { kind: 'api-client' } } }, 403]]) {
    f.state.admission = admission;
    const response = await f.post({ action: 'list', password: PASSWORD });
    assert.equal(response.status, status);
    noSecrets(await response.text());
  }
  f.state.admission = { peer: { principal: { kind: 'owner' } } };
  assert.equal((await f.route.fetch(new Request('http://localhost/api/named-ssh'))).status, 405);
  for (const [body, contentType] of [
    [`{invalid:${PASSWORD}`, 'application/json'],
    [{ action: 'list' }, 'text/plain'],
    [{ action: PASSWORD }, 'application/json'],
    [{ action: 'list', password: PASSWORD }, 'application/json'],
    [{ action: 'save', credential: { password: PASSWORD }, garbage: 'x'.repeat(96 * 1024) }, 'application/json'],
    [[], 'application/json'],
  ]) {
    const response = await f.post(body, contentType);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const result = await response.json();
    assert.equal(result.error.code, 'INVALID_INPUT');
    noSecrets(result);
  }
  f.ctx.credentials.readRecord = async () => { throw new Error(`raw-sensitive-body:${PASSWORD}`); };
  const failure = await f.post({ action: 'list' });
  const result = await failure.json();
  assert.equal(result.error.code, 'STORE_FAILED');
  noSecrets(result, 'raw-sensitive-body');
  noSecrets(await f.call('ssh_list_servers', {}), 'raw-sensitive-body');
});

test('user route probes without auth and saves/tests/removes only through verified private credentials', { timeout: 10_000 }, async t => {
  const ssh = await loopback(t);
  const f = fakeContext(t, ssh.credentials);
  const probed = await (await f.post({ action: 'probe', host: '127.0.0.1', port: ssh.port })).json();
  assert.deepEqual(probed, { ok: true, value: { fingerprint: FINGERPRINT } });
  assert.deepEqual(ssh.stats.authentication, []);
  const saved = await (await f.post({ action: 'save', ...trustedSave(ssh.config) })).json();
  assert.equal(saved.ok, true);
  noSecrets(saved);
  const listed = await (await f.post({ action: 'list' })).json();
  assert.equal(listed.value.servers.length, 1);
  noSecrets(listed);
  const tested = await (await f.post({ action: 'test', alias: ssh.config.alias })).json();
  assert.deepEqual(tested, { ok: true, value: { alias: ssh.config.alias, connected: true } });
  const toolTest = await f.call('ssh_test_connection', { alias: ssh.config.alias });
  assert.equal(toolTest.ok, true);
  assert.equal(ssh.stats.commands.length, 0);
  assert.deepEqual(await (await f.post({ action: 'remove', alias: ssh.config.alias })).json(), { ok: true, value: { removed: true } });
  assert.deepEqual(await (await f.post({ action: 'list' })).json(), { ok: true, value: { servers: [] } });
});

test('exec tool fails closed on approval, never networks for unknown/disabled aliases, and redacts successful output', { timeout: 10_000 }, async t => {
  const ssh = await loopback(t, { onExec(stream) { stream.exit(3); stream.end(`result:${PASSWORD}`); } });
  ssh.credentials.record = storedRecord(ssh.config);
  const f = fakeContext(t, ssh.credentials);
  const request = { alias: ssh.config.alias, command: 'printf result' };
  assert.equal((await f.call('ssh_exec', { ...request, alias: 'unknown' })).error.code, 'NOT_FOUND');
  ssh.credentials.record.payload.servers[0].server.enabled = false;
  assert.equal((await f.call('ssh_exec', request)).error.code, 'DISABLED');
  ssh.credentials.record.payload.servers[0].server.enabled = true;
  assert.equal((await f.call('ssh_exec', request, { ...f.exec, agent: undefined })).error.code, 'APPROVAL_REQUIRED');
  assert.equal(f.approvals.length, 0);
  for (const outcome of ['rejected', 'cancelled', 'unavailable', undefined, 'unexpected-grant']) {
    f.state.outcome = outcome;
    const result = await f.call('ssh_exec', request);
    assert.equal(result.error.code, 'APPROVAL_REQUIRED');
    noSecrets(result);
  }
  assert.equal(ssh.stats.connections, 0);
  f.state.outcome = new Error(`raw-approval-error:${PASSWORD}`);
  const error = await f.call('ssh_exec', request);
  assert.equal(error.error.code, 'INTERNAL');
  noSecrets(error, 'raw-approval-error');
  f.state.outcome = 'allowed-once';
  const success = await f.call('ssh_exec', request);
  assert.equal(success.ok, true);
  assert.equal(success.value.stdout, 'result:[REDACTED]');
  assert.equal(success.value.exitCode, 3);
  assert.equal(ssh.stats.commands.length, 1);
  assert.equal(ssh.stats.connections, 1);
  const approval = f.approvals.at(-1);
  assert.equal(approval.agent, f.exec.agent);
  assert.equal(approval.callId, f.exec.callId);
  assert.equal(approval.toolName, 'ssh_exec');
  noSecrets(success);
  noSecrets(approval);
});
