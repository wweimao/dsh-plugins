import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ssh2 from 'ssh2';
import { NamedSsh, OUTPUT_LIMIT, normalizeServer, normalizeExec, redact, safeError, wrapCommand } from '../core.js';
import { PASSWORD, FINGERPRINT, MemoryCredentials, serverConfig, loopback, seed, trustedSave, errorCode } from './helpers.js';

const options = { timeout: 10_000 };
const fingerprint = `SHA256:${createHash('sha256').update('not-the-server-key').digest('base64').replace(/=+$/, '')}`;

test('normalizers allow only named pinned endpoints and bounded exec requests', () => {
  assert.equal(normalizeServer(serverConfig()).fingerprint, FINGERPRINT);
  for (const patch of [
    { alias: '../escape' }, { host: 'user@host' }, { host: 'ssh://host' }, { host: 'host:22' },
    { port: 0 }, { port: '22' }, { username: 'user\nother' }, { cwd: 'relative' },
    { fingerprint: '' }, { enabled: 'true' }, { password: PASSWORD },
  ]) assert.throws(() => normalizeServer(serverConfig(22, patch)), errorCode('INVALID_INPUT'));
  const valid = { alias: 'local-test', command: 'printf hi' };
  assert.equal(normalizeExec(valid).timeoutMs, 30_000);
  for (const patch of [{ timeout_ms: 999 }, { timeout_ms: 120001 }, { command: 'a\0b' }, { cwd: '/x\ny' }, { host: 'other' }, { password: PASSWORD }]) {
    assert.throws(() => normalizeExec({ ...valid, ...patch }), errorCode('INVALID_INPUT'));
  }
});

test('redaction covers complete secrets, overlaps and captured suffix prefixes; errors are allowlisted', () => {
  assert.equal(redact(`a:${PASSWORD}:b:${PASSWORD}`, [PASSWORD]), 'a:[REDACTED]:b:[REDACTED]');
  assert.equal(redact('abcdef abc', ['abc', 'abcdef']), '[REDACTED] [REDACTED]');
  assert.equal(redact(`safe:${PASSWORD.slice(0, -1)}`, [PASSWORD], true), 'safe:[REDACTED]');
  const raw = new Error(`sensitive transport body ${PASSWORD}`);
  assert.deepEqual(safeError(raw), { code: 'INTERNAL', message: 'SSH operation failed without exposing internal diagnostics.' });
});

test('probe discovers the host fingerprint and stops before any authentication', options, async t => {
  const f = await loopback(t);
  assert.deepEqual(await f.service.probe({ host: '127.0.0.1', port: f.port }), { fingerprint: FINGERPRINT });
  assert.equal(f.stats.connections, 1);
  assert.deepEqual(f.stats.authentication, []);
  assert.equal(f.credentials.writes, 0);
  assert.equal(f.service.active, 0);
});

test('save requires explicit trust and rejects a wrong pin before password authentication', options, async t => {
  const f = await loopback(t);
  await assert.rejects(f.service.save({ ...trustedSave(f.config), trustConfirmed: false }), errorCode('INVALID_INPUT'));
  assert.equal(f.stats.connections, 0);
  await assert.rejects(f.service.save(trustedSave({ ...f.config, fingerprint })), errorCode('HOST_KEY_MISMATCH'));
  assert.deepEqual(f.stats.authentication, []);
  assert.equal(f.credentials.record, undefined);
  assert.equal(f.credentials.writes, 0);
});

test('failed authentication never saves a credential and returns only a safe error', options, async t => {
  const f = await loopback(t);
  const wrongPassword = 'test-only-wrong-password';
  await assert.rejects(f.service.save(trustedSave(f.config, { password: wrongPassword })), error => {
    errorCode('AUTH_FAILED')(error);
    assert.ok(!JSON.stringify(safeError(error)).includes(wrongPassword));
    return true;
  });
  assert.equal(f.stats.connections, 1);
  assert.equal(f.credentials.record, undefined);
  assert.deepEqual(f.stats.authentication.map(x => x.method), ['password']);
});

test('encrypted private-key auth verifies real signatures and wrong passphrases fail safely', options, async t => {
  const passphrase = 'test-only-key-passphrase-界';
  const wrongPassphrase = 'test-only-wrong-key-passphrase';
  const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
    type: 'pkcs1', format: 'pem', cipher: 'aes-256-cbc', passphrase,
  }).toString();
  const parsed = ssh2.utils.parseKey(privateKey, passphrase);
  assert.ok(!(parsed instanceof Error), 'encrypted test key must parse with its passphrase');
  assert.ok(ssh2.utils.parseKey(privateKey, wrongPassphrase) instanceof Error, 'fixture must actually be encrypted');
  let verifiedSignatures = 0;
  const f = await loopback(t, {
    onAuthentication(context) {
      if (context.method !== 'publickey' || context.username !== 'test-user' || !context.key.data.equals(parsed.getPublicSSH())) {
        context.reject(['publickey']);
        return;
      }
      // The first key query may be unsigned, but every actual login must prove
      // possession by signing ssh2's session-bound authentication blob.
      if (context.signature) {
        if (parsed.verify(context.blob, context.signature, context.hashAlgo) !== true) {
          context.reject(['publickey']);
          return;
        }
        verifiedSignatures++;
      }
      context.accept();
    },
    onExec(stream) {
      stream.write(`key:${privateKey}passphrase:${passphrase}`);
      stream.exit(0);
      stream.end();
    },
  });
  const config = { ...f.config, auth: 'key' };
  const badCredential = { privateKey, passphrase: wrongPassphrase };
  const safeAuthFailure = error => {
    errorCode('AUTH_FAILED')(error);
    const encoded = JSON.stringify(safeError(error));
    for (const secret of [privateKey, passphrase, wrongPassphrase]) assert.ok(!encoded.includes(secret));
    return true;
  };
  await assert.rejects(f.service.save(trustedSave(config, badCredential)), safeAuthFailure);
  assert.equal(f.credentials.record, undefined);
  assert.equal(f.credentials.writes, 0);
  assert.deepEqual(f.stats.authentication, []);
  assert.equal(f.service.active, 0);

  const saved = await f.service.save(trustedSave(config, { privateKey, passphrase }));
  assert.equal(saved.revision, 1);
  assert.equal((await f.service.test(config.alias)).connected, true);
  const result = await f.service.exec({ alias: config.alias, command: 'test-key-redaction' });
  assert.equal(result.stdout, 'key:[REDACTED]passphrase:[REDACTED]');
  assert.equal(verifiedSignatures, 3);
  assert.ok(f.stats.authentication.every(attempt => attempt.method === 'publickey'));
  await assert.rejects(f.service.save(trustedSave(config, badCredential, 1)), safeAuthFailure);
  assert.equal(f.credentials.writes, 1, 'failed rotation must retain the verified key');
  assert.equal((await f.service.get(config.alias)).revision, 1);
  const publicResults = JSON.stringify({ saved, listed: await f.service.list(), result });
  for (const secret of [privateKey, passphrase, wrongPassphrase]) assert.ok(!publicResults.includes(secret));
  assert.equal(f.service.active, 0);
});

test('verified save, login, list, disabled access, and remove never expose credential fields', options, async t => {
  const f = await loopback(t);
  const saved = await f.service.save(trustedSave(f.config));
  const allowed = [...Object.keys(f.config), 'hasCredential', 'revision'].sort();
  assert.deepEqual(Object.keys(saved).sort(), allowed);
  assert.equal(saved.revision, 1);
  assert.deepEqual(await f.service.test(f.config.alias), { alias: f.config.alias, connected: true });
  const listed = await f.service.list();
  assert.deepEqual(Object.keys(listed.servers[0]).sort(), allowed);
  assert.ok(!JSON.stringify({ saved, listed }).includes(PASSWORD));
  f.credentials.record.payload.servers[0].server.enabled = false;
  assert.deepEqual(await f.service.list({ enabledOnly: true }), { servers: [] });
  await assert.rejects(f.service.test(f.config.alias), errorCode('DISABLED'));
  await f.service.remove(f.config.alias);
  assert.deepEqual(await f.service.list(), { servers: [] });
  await assert.rejects(f.service.get(f.config.alias), errorCode('NOT_FOUND'));
});

test('credential reuse is refused for identity changes; rotation uses current revisions', options, async t => {
  const accepted = new Set([PASSWORD, 'test-only-rotated']);
  const f = await loopback(t, { acceptPassword: value => accepted.has(value) });
  await f.service.save(trustedSave(f.config));
  const initialConnections = f.stats.connections;
  for (const patch of [{ host: 'localhost' }, { port: f.port === 65535 ? 65534 : f.port + 1 }, { username: 'other' }, { auth: 'key' }, { fingerprint }]) {
    await assert.rejects(f.service.save({ server: { ...f.config, ...patch }, trustConfirmed: true, expectedRevision: 1 }), errorCode('INVALID_INPUT'));
  }
  assert.equal(f.stats.connections, initialConnections);
  const updated = await f.service.save({ server: { ...f.config, label: 'Renamed' }, trustConfirmed: true, expectedRevision: 1 });
  assert.equal(updated.revision, 2);
  await assert.rejects(f.service.save(trustedSave(f.config, { password: 'test-only-rotated' }, 1)), errorCode('CONFLICT'));
  const rotated = await f.service.save(trustedSave(f.config, { password: 'test-only-rotated' }, 2));
  assert.equal(rotated.revision, 3);
  accepted.delete(PASSWORD);
  assert.equal((await f.service.test(f.config.alias)).connected, true);
});

test('concurrent writes preserve aliases and reject stale revisions atomically', options, async t => {
  const f = await loopback(t);
  const first = { ...f.config, alias: 'first' };
  const second = { ...f.config, alias: 'second' };
  await Promise.all([f.service.save(trustedSave(first)), f.service.save(trustedSave(second))]);
  assert.deepEqual((await f.service.list()).servers.map(x => x.alias).sort(), ['first', 'second']);
  const results = await Promise.allSettled([
    f.service.save(trustedSave({ ...first, label: 'One' }, { password: PASSWORD }, 1)),
    f.service.save(trustedSave({ ...first, label: 'Two' }, { password: PASSWORD }, 1)),
  ]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(results.find(x => x.status === 'rejected').reason.code, 'CONFLICT');
  assert.equal((await f.service.get('first')).revision, 2);
  assert.equal((await f.service.get('second')).revision, 1);
});

test('exec combines chunks before redaction, preserves exit status, quotes cwd, and opens fresh connections', options, async t => {
  const f = await loopback(t, { onExec(stream) {
    stream.write(`start:${PASSWORD.slice(0, 7)}`);
    setImmediate(() => {
      if (stream.destroyed) return;
      stream.write(`${PASSWORD.slice(7)}:done\n`);
      stream.stderr.write(`stderr:${PASSWORD}`);
      stream.exit(7);
      stream.end();
    });
  } });
  seed(f);
  const cwd = "/srv/it's $(not-run); safe";
  const input = { alias: f.config.alias, command: 'printf done', cwd };
  const first = await f.service.exec(input);
  assert.deepEqual(first, { alias: f.config.alias, stdout: 'start:[REDACTED]:done\n', stderr: 'stderr:[REDACTED]', exitCode: 7, signal: null, truncated: false });
  await f.service.exec(input);
  assert.equal(f.stats.connections, 2);
  assert.notEqual(f.stats.commands[0].connection, f.stats.commands[1].connection);
  assert.equal(f.stats.commands[0].command, "cd '/srv/it'\\''s $(not-run); safe' || exit\nprintf done");
  assert.equal(f.stats.shells, 0);
  assert.equal(f.stats.ptys, 0);
  assert.deepEqual(f.stats.environments, []);
  assert.ok(f.stats.commands.every(x => !x.command.includes(PASSWORD)));
  assert.equal(f.service.active, 0);
});

test('failed cwd change prevents every semicolon-separated and multiline command from running', options, () => {
  const missingCwd = join(tmpdir(), `named-ssh-nonexistent-${randomUUID()}`);
  // Verify absence without creating or deleting anything. Execute the exported
  // production wrapper, not a test-side approximation of the shell syntax.
  assert.throws(() => lstatSync(missingCwd), { code: 'ENOENT' });
  for (const command of [
    'printf SHOULD_NOT_RUN; printf SHOULD_NOT_RUN',
    'printf SHOULD_NOT_RUN\nprintf SHOULD_NOT_RUN',
  ]) {
    const result = spawnSync('/bin/sh', ['-c', wrapCommand(missingCwd, command)], {
      cwd: '/', env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' },
      encoding: 'utf8', timeout: 1000, maxBuffer: 4096, stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.ok(Number.isInteger(result.status) && result.status !== 0, 'failed cd must produce a nonzero shell status');
    assert.equal(result.stdout, '', 'no command after a failed cwd change may run');
    assert.match(result.stderr, /cd:/, 'failure must be the real cwd change, not a shell parse error');
    assert.ok(result.stderr.includes(missingCwd));
  }
});

test('exec truncates stdout/stderr and never returns a partial-secret suffix from its capture cap', options, async t => {
  // A large test-only credential positions its partial prefix inside the visible limit,
  // even though capture ends at 256 KiB. This exercises redaction at both caps.
  const secret = 'p'.repeat(4093);
  const f = await loopback(t, { acceptPassword: value => value === secret, onExec(stream) {
    stream.write(secret.repeat(64));
    stream.write('p'.repeat(2000));
    stream.stderr.write('e'.repeat(OUTPUT_LIMIT + 2048));
    stream.exit(0);
    stream.end();
  } });
  seed(f, {}, { password: secret });
  const result = await f.service.exec({ alias: f.config.alias, command: 'large' });
  assert.equal(result.truncated, true);
  assert.ok(Buffer.byteLength(result.stdout) <= OUTPUT_LIMIT);
  assert.ok(Buffer.byteLength(result.stderr) <= OUTPUT_LIMIT);
  assert.equal(result.stdout, '[REDACTED]'.repeat(65));
  assert.equal(result.stderr.length, OUTPUT_LIMIT);
  assert.ok(!result.stdout.includes('p'));

  // Cut in the middle of the final multibyte character of a credential. Decoding
  // must not append U+FFFD before prefix redaction, or the preceding secret leaks.
  const unicodeSecret = 'p'.repeat(4093) + '界';
  const unicode = await loopback(t, { acceptPassword: value => value === unicodeSecret, onExec(stream) {
    stream.write('x' + unicodeSecret.repeat(64));
    stream.exit(0);
    stream.end();
  } });
  seed(unicode, {}, { password: unicodeSecret });
  const unicodeResult = await unicode.service.exec({ alias: unicode.config.alias, command: 'unicode-secret-cut' });
  assert.equal(unicodeResult.truncated, true);
  assert.equal(unicodeResult.stdout, 'x' + '[REDACTED]'.repeat(64));
});

test('output limit is a UTF-8 byte limit, including a multibyte boundary', options, async t => {
  const f = await loopback(t, { onExec(stream) {
    stream.write('x'.repeat(OUTPUT_LIMIT - 1) + '界');
    stream.exit(0);
    stream.end();
  } });
  seed(f);
  const result = await f.service.exec({ alias: f.config.alias, command: 'unicode' });
  assert.equal(result.truncated, true);
  assert.ok(Buffer.byteLength(result.stdout) <= OUTPUT_LIMIT, `stdout returned ${Buffer.byteLength(result.stdout)} bytes with a ${OUTPUT_LIMIT}-byte limit`);
  assert.ok(!result.stdout.endsWith('\uFFFD'), 'do not invent a replacement character while truncating UTF-8');
});

test('timeout and external cancellation close one operation without retrying or leaking output', options, async t => {
  let resolveExec;
  let started = new Promise(resolve => { resolveExec = resolve; });
  const f = await loopback(t, { onExec(stream) { stream.write(PASSWORD); resolveExec(); } });
  seed(f);
  await assert.rejects(f.service.exec({ alias: f.config.alias, command: 'hang', timeout_ms: 1000 }), errorCode('TIMEOUT'));
  assert.equal(f.stats.commands.length, 1);
  assert.equal(f.service.active, 0);
  started = new Promise(resolve => { resolveExec = resolve; });
  const controller = new AbortController();
  const pending = f.service.exec({ alias: f.config.alias, command: 'hang' }, controller.signal);
  const rejected = assert.rejects(pending, errorCode('ABORTED'));
  await started;
  controller.abort();
  await rejected;
  assert.equal(f.stats.commands.length, 2);
  assert.equal(f.stats.connections, 2);
  assert.equal(f.service.clients.size, 0);
});

test('only four operations run concurrently; dispose drains them and rejects new work', options, async t => {
  let resolveFour;
  const fourStarted = new Promise(resolve => { resolveFour = resolve; });
  const f = await loopback(t, { onExec() { if (f.stats.commands.length === 4) resolveFour(); } });
  seed(f);
  const active = Array.from({ length: 4 }, () => f.service.exec({ alias: f.config.alias, command: 'hang' }));
  const settlements = Promise.allSettled(active);
  await fourStarted;
  await assert.rejects(f.service.exec({ alias: f.config.alias, command: 'fifth' }), errorCode('BUSY'));
  assert.equal(f.stats.connections, 4);
  f.service.dispose();
  const results = await settlements;
  assert.ok(results.every(x => x.status === 'rejected' && ['ABORTED', 'CONNECT_FAILED'].includes(x.reason.code)));
  assert.equal(f.service.active, 0);
  assert.equal(f.service.clients.size, 0);
  await assert.rejects(f.service.exec({ alias: f.config.alias, command: 'after-dispose' }), errorCode('ABORTED'));
  assert.equal(f.stats.connections, 4);
});

test('storage failures and corrupt records expose only generic store errors', async () => {
  const raw = new Error(`raw backend diagnostics ${PASSWORD}`);
  const broken = new NamedSsh({ readRecord: async () => { throw raw; }, modifyRecord: async () => { throw raw; } });
  await assert.rejects(broken.list(), errorCode('STORE_FAILED'));
  await assert.rejects(broken.remove('local-test'), errorCode('STORE_FAILED'));
  const corrupt = new NamedSsh(new MemoryCredentials({ kind: 'grant', payload: { version: 1, servers: [{ server: { password: PASSWORD } }] } }));
  await assert.rejects(corrupt.list(), errorCode('STORE_FAILED'));
});
