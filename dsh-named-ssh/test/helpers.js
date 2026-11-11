import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import ssh2 from 'ssh2';
import { NamedSsh, RECORD_KEY } from '../core.js';

// Test-only material generated in memory; never read keys, credentials, or SSH config.
export const PASSWORD = 'test-only/secret-45-界';
const hostKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' });
// Independent expected digest: do not use the implementation under test to verify itself.
export const FINGERPRINT = `SHA256:${createHash('sha256').update(ssh2.utils.parseKey(hostKey).getPublicSSH()).digest('base64').replace(/=+$/, '')}`;

export class MemoryCredentials {
  constructor(record) { this.record = structuredClone(record); this.tail = Promise.resolve(); this.writes = 0; }
  async readRecord(key) { assert.equal(key, RECORD_KEY); return structuredClone(this.record); }
  modifyRecord(key, mutate) {
    assert.equal(key, RECORD_KEY);
    const operation = this.tail.then(async () => {
      const next = await mutate(structuredClone(this.record));
      if (next !== undefined) { this.record = structuredClone(next); this.writes++; }
      return structuredClone(this.record);
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
}

export function serverConfig(port = 22, overrides = {}) {
  return { alias: 'local-test', label: 'Local test server', host: '127.0.0.1', port, username: 'test-user', cwd: '/srv/test', auth: 'password', fingerprint: FINGERPRINT, enabled: true, ...overrides };
}
export function storedRecord(server, credential = { password: PASSWORD }, revision = 1) {
  return { kind: 'grant', payload: { version: 1, servers: [{ server, credential, revision }] } };
}
export function trustedSave(server, credential = { password: PASSWORD }, expectedRevision = 0) {
  return { server, ...(credential === undefined ? {} : { credential }), trustConfirmed: true, expectedRevision };
}
export function errorCode(code) {
  return error => { assert.equal(error.code, code); assert.ok(!error.message.includes(PASSWORD)); return true; };
}

export async function loopback(t, options = {}) {
  const clients = new Set();
  const stats = { connections: 0, authentication: [], commands: [], shells: 0, ptys: 0, environments: [] };
  const server = new ssh2.Server({ hostKeys: [hostKey] }, client => {
    const connection = ++stats.connections;
    clients.add(client);
    client.on('error', () => {}); // Expected disconnects during probes and failed pin verification.
    client.on('close', () => clients.delete(client));
    client.on('authentication', context => {
      stats.authentication.push({ connection, method: context.method, username: context.username });
      if (options.onAuthentication) { options.onAuthentication(context); return; }
      if (context.method === 'password' && context.username === 'test-user' && (options.acceptPassword?.(context.password) ?? context.password === PASSWORD)) context.accept();
      else context.reject(['password']);
    });
    client.on('ready', () => client.on('session', accept => {
      const session = accept();
      session.on('pty', (acceptPty, reject) => { stats.ptys++; reject?.(); });
      session.on('shell', (acceptShell, reject) => { stats.shells++; reject?.(); });
      session.on('env', (acceptEnv, reject, info) => { stats.environments.push(info); reject?.(); });
      session.on('exec', (acceptExec, reject, info) => {
        stats.commands.push({ connection, command: info.command });
        if (options.rejectExec) { reject(); return; }
        const stream = acceptExec();
        stream.on('error', () => {});
        if (options.onExec) options.onExec(stream, info.command, connection);
        else { stream.exit(0); stream.end('ok\n'); }
      });
    }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  const credentials = new MemoryCredentials();
  const service = new NamedSsh(credentials, { connectTimeoutMs: 2000 });
  t.after(async () => {
    service.dispose();
    for (const client of clients) client._sock.destroy();
    await new Promise(resolve => server.close(resolve));
  });
  return { server, clients, stats, port, credentials, service, config: serverConfig(port) };
}

export function seed(fixture, overrides = {}, credential = { password: PASSWORD }) {
  const config = { ...fixture.config, ...overrides };
  fixture.credentials.record = storedRecord(config, credential);
  return config;
}
