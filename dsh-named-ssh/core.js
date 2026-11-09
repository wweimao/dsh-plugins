import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import ssh2 from 'ssh2';

const { Client } = ssh2;
export const VERSION = '0.1.2';
export const RECORD_KEY = 'named-ssh/servers';
export const OUTPUT_LIMIT = 64 * 1024;
const MAX_CAPTURE = 256 * 1024;
const ERROR_MESSAGES = Object.freeze({
  INVALID_INPUT: 'Invalid SSH request. Check the supplied fields.',
  NOT_FOUND: 'Unknown server alias. Configure it in Settings → SSH servers.',
  DISABLED: 'This server is not enabled for agent access.',
  HOST_KEY_MISMATCH: 'SSH host key does not match the saved fingerprint. Ask the user to verify it in Settings.',
  AUTH_FAILED: 'SSH authentication failed. Update credentials in Settings; do not send passwords in chat.',
  CONNECT_FAILED: 'SSH connection failed. Check the address, port, network, and SSH service.',
  TIMEOUT: 'SSH operation timed out. A remote command may still be running; do not blindly retry mutations.',
  ABORTED: 'SSH operation cancelled. A remote command may still be running.',
  STORE_FAILED: 'Cannot read or save SSH credentials in the Harness credential store.',
  CONFLICT: 'Server configuration changed. Reload the list before saving.',
  INTERNAL: 'SSH operation failed without exposing internal diagnostics.',
  BUSY: 'Too many SSH operations are running. Try again after one finishes.',
  APPROVAL_REQUIRED: 'Remote execution was not approved. No command was sent.',
});
export class SshError extends Error {
  constructor(code) { super(ERROR_MESSAGES[code] ?? ERROR_MESSAGES.INTERNAL); this.name = 'SshError'; this.code = code in ERROR_MESSAGES ? code : 'INTERNAL'; }
}
export function safeError(error) {
  const e = error instanceof SshError ? error : new SshError('INTERNAL');
  return { code: e.code, message: e.message };
}
const fail = () => { throw new SshError('INVALID_INPUT'); };
export function object(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k))) fail();
  return value;
}
function text(value, max, optional = false) {
  if (optional && (value === undefined || value === '')) return '';
  if (typeof value !== 'string' || !value.length || value.length > max || value.includes('\0')) fail();
  return value;
}
export function aliasOf(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/.test(value)) fail();
  return value;
}
export function endpointOf(input) {
  const host = text(input.host, 253).trim();
  // Do not accept URLs, inline auth, SSH config directives, or host:port strings.
  if (!isIP(host) && !/^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(host)) fail();
  const port = input.port ?? 22;
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail();
  return { host, port };
}
export function normalizeServer(input) {
  object(input, ['alias', 'label', 'host', 'port', 'username', 'cwd', 'auth', 'fingerprint', 'enabled']);
  const alias = aliasOf(input.alias);
  const label = text(input.label, 100, true) || alias;
  const username = text(input.username, 128);
  if (/[\r\n]/.test(username)) fail();
  const cwd = input.cwd === undefined || input.cwd === '' ? '/' : text(input.cwd, 4096);
  if (!cwd.startsWith('/') || /[\r\n]/.test(cwd)) fail();
  if (!['password', 'key'].includes(input.auth) || typeof input.enabled !== 'boolean') fail();
  if (typeof input.fingerprint !== 'string' || !/^SHA256:[A-Za-z0-9+/]{43}$/.test(input.fingerprint)) fail();
  return { alias, label, ...endpointOf(input), username, cwd, auth: input.auth, fingerprint: input.fingerprint, enabled: input.enabled };
}
function normalizeCredential(value, auth) {
  object(value, ['password', 'privateKey', 'passphrase']);
  if (auth === 'password') {
    if (value.privateKey || value.passphrase) fail();
    return { password: text(value.password, 4096) };
  }
  if (value.password) fail();
  const privateKey = text(value.privateKey, 64 * 1024);
  if (!privateKey.includes('PRIVATE KEY-----')) fail();
  const passphrase = text(value.passphrase, 4096, true);
  return { privateKey, ...(passphrase ? { passphrase } : {}) };
}
export function fingerprintOf(key) { return `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`; }
export function quote(value) { return `'${value.replaceAll("'", "'\\''")}'`; }
export function wrapCommand(cwd, command) { return `cd ${quote(cwd)} || exit\n${command}`; }
export function normalizeExec(input) {
  object(input, ['alias', 'command', 'cwd', 'timeout_ms']);
  const alias = aliasOf(input.alias);
  const command = text(input.command, 32 * 1024);
  let cwd;
  if (input.cwd !== undefined) { cwd = text(input.cwd, 4096); if (!cwd.startsWith('/') || /[\r\n]/.test(cwd)) fail(); }
  const timeoutMs = input.timeout_ms ?? 30_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120_000) fail();
  return { alias, command, cwd, timeoutMs };
}
export function redact(textValue, secrets, cut = false) {
  let result = textValue;
  for (const secret of [...new Set(secrets.filter(Boolean))].sort((a, b) => b.length - a.length)) {
    result = result.split(secret).join('[REDACTED]');
    // If our output cap cut through a credential, remove its captured prefix too.
    if (cut) {
      for (let n = Math.min(secret.length - 1, result.length); n > 0; n--) {
        if (result.endsWith(secret.slice(0, n))) { result = result.slice(0, -n) + '[REDACTED]'; break; }
      }
    }
  }
  return result;
}
function publicView(entry) { return { ...entry.server, hasCredential: true, revision: entry.revision }; }
function storedEntries(record) {
  if (record === undefined) return [];
  try {
    if (record.kind !== 'grant' || record.payload?.version !== 1 || !Array.isArray(record.payload.servers) || record.payload.servers.length > 100) throw 0;
    const seen = new Set();
    return record.payload.servers.map(entry => {
      const server = normalizeServer(entry.server);
      if (!Number.isSafeInteger(entry.revision) || entry.revision < 1 || seen.has(server.alias)) throw 0;
      seen.add(server.alias);
      return { server, credential: normalizeCredential(entry.credential, server.auth), revision: entry.revision };
    });
  } catch { throw new SshError('STORE_FAILED'); }
}
function sameIdentity(a, b) {
  return ['host', 'port', 'username', 'auth', 'fingerprint'].every(k => a[k] === b[k]);
}

/** The same operations serve UI and tools; only user UI has save/probe authority. */
export class NamedSsh {
  constructor(credentials, { clientFactory = () => new Client(), connectTimeoutMs = 15_000 } = {}) {
    this.credentials = credentials;
    this.clientFactory = clientFactory;
    this.connectTimeoutMs = connectTimeoutMs;
    this.clients = new Set();
    this.disposed = false;
    this.active = 0;
  }
  async entries() {
    try { return storedEntries(await this.credentials.readRecord(RECORD_KEY)); }
    catch { throw new SshError('STORE_FAILED'); }
  }
  async list({ enabledOnly = false } = {}) {
    return { servers: (await this.entries()).filter(e => !enabledOnly || e.server.enabled).map(publicView) };
  }
  async get(alias, enabledOnly = true) {
    const entry = (await this.entries()).find(e => e.server.alias === aliasOf(alias));
    if (!entry) throw new SshError('NOT_FOUND');
    if (enabledOnly && !entry.server.enabled) throw new SshError('DISABLED');
    return entry;
  }
  async save(input, signal) {
    object(input, ['server', 'credential', 'trustConfirmed', 'expectedRevision']);
    const server = normalizeServer(input.server);
    if (input.trustConfirmed !== true || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) fail();
    const old = (await this.entries()).find(e => e.server.alias === server.alias);
    if ((old?.revision ?? 0) !== input.expectedRevision) throw new SshError('CONFLICT');
    const credential = input.credential !== undefined
      ? normalizeCredential(input.credential, server.auth)
      : old && sameIdentity(old.server, server) ? old.credential : fail();
    const entry = { server, credential, revision: (old?.revision ?? 0) + 1 };
    // Test the exact approved endpoint, key and credential before making it usable.
    await this.connect(entry, signal, async () => ({ connected: true }));
    if (signal?.aborted) throw new SshError('ABORTED');
    try {
      await this.credentials.modifyRecord(RECORD_KEY, async current => {
        const entries = storedEntries(current);
        const index = entries.findIndex(e => e.server.alias === server.alias);
        if ((entries[index]?.revision ?? 0) !== input.expectedRevision) throw new SshError('CONFLICT');
        if (index < 0) { if (entries.length >= 100) fail(); entries.push(entry); }
        else entries[index] = entry;
        return { kind: 'grant', payload: { version: 1, servers: entries } };
      });
    } catch (error) { if (error instanceof SshError) throw error; throw new SshError('STORE_FAILED'); }
    return publicView(entry);
  }
  async remove(alias) {
    aliasOf(alias);
    try {
      await this.credentials.modifyRecord(RECORD_KEY, async current => ({ kind: 'grant', payload: {
        version: 1, servers: storedEntries(current).filter(e => e.server.alias !== alias),
      } }));
    } catch { throw new SshError('STORE_FAILED'); }
    return { removed: true };
  }
  async test(alias, signal, { enabledOnly = true } = {}) {
    const entry = await this.get(alias, enabledOnly);
    return this.connect(entry, signal, async () => ({ alias, connected: true }));
  }
  async exec(input, signal) {
    const request = normalizeExec(input);
    const entry = await this.get(request.alias);
    return this.connect(entry, signal, (client, linkedSignal) => new Promise((resolve, reject) => {
      const streams = { stdout: { chunks: [], bytes: 0, cut: false }, stderr: { chunks: [], bytes: 0, cut: false } };
      let channel;
      let settled = false;
      const finish = (error, code, remoteSignal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        linkedSignal.removeEventListener('abort', abort);
        if (error) { try { channel?.close(); } catch {} reject(error); return; }
        const secrets = Object.values(entry.credential);
        let truncated = false;
        const output = {};
        for (const [key, stream] of Object.entries(streams)) {
          const captured = new TextDecoder('utf-8').decode(Buffer.concat(stream.chunks), { stream: stream.cut });
          const clean = redact(captured, secrets, stream.cut);
          const bytes = Buffer.from(clean);
          truncated ||= stream.cut || bytes.length > OUTPUT_LIMIT;
          // Do not synthesize a replacement character when the cap splits UTF-8.
          output[key] = new TextDecoder('utf-8').decode(bytes.subarray(0, OUTPUT_LIMIT), { stream: bytes.length > OUTPUT_LIMIT });
        }
        resolve({ alias: request.alias, ...output, exitCode: Number.isInteger(code) ? code : null, signal: typeof remoteSignal === 'string' ? remoteSignal : null, truncated });
      };
      const abort = () => finish(new SshError('ABORTED'));
      const timer = setTimeout(() => finish(new SshError('TIMEOUT')), request.timeoutMs);
      linkedSignal.addEventListener('abort', abort, { once: true });
      if (linkedSignal.aborted) return abort();
      const collect = key => chunk => {
        const stream = streams[key];
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const keep = Math.min(MAX_CAPTURE - stream.bytes, bytes.length);
        if (keep > 0) { stream.chunks.push(bytes.subarray(0, keep)); stream.bytes += keep; }
        if (keep < bytes.length) stream.cut = true;
      };
      // SSH credentials never enter the remote command, environment, stdin or argv.
      const command = wrapCommand(request.cwd ?? entry.server.cwd, request.command);
      client.exec(command, { pty: false }, (error, stream) => {
        if (error) return finish(new SshError('CONNECT_FAILED'));
        channel = stream;
        if (settled) { stream.close(); return; }
        stream.on('data', collect('stdout'));
        stream.stderr.on('data', collect('stderr'));
        stream.on('error', () => finish(new SshError('CONNECT_FAILED')));
        stream.on('close', (code, remoteSignal) => finish(null, code, remoteSignal));
        stream.end();
      });
    }));
  }
  async probe(input, signal) {
    object(input, ['host', 'port']);
    const endpoint = endpointOf(input);
    this.acquire();
    const client = this.clientFactory();
    this.clients.add(client);
    try {
      return await new Promise((resolve, reject) => {
        let done = false;
        const finish = (error, fingerprint) => {
          if (done) return;
          done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
          if (error) reject(error); else resolve({ fingerprint });
        };
        const abort = () => finish(new SshError('ABORTED'));
        const timer = setTimeout(() => finish(new SshError('TIMEOUT')), this.connectTimeoutMs);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) return abort();
        client.on('error', () => finish(new SshError('CONNECT_FAILED')));
        client.on('close', () => finish(new SshError('CONNECT_FAILED')));
        try {
          client.connect({ ...endpoint, username: 'host-key-probe', readyTimeout: this.connectTimeoutMs,
            hostVerifier(key) { finish(null, fingerprintOf(key)); return false; },
            // Never authenticate during fingerprint discovery, not even via an ambient agent.
            authHandler: () => false,
          });
        } catch { finish(new SshError('CONNECT_FAILED')); }
      });
    } finally { this.release(client); }
  }
  acquire() {
    if (this.disposed) throw new SshError('ABORTED');
    if (this.active >= 4) throw new SshError('BUSY');
    this.active++;
  }
  release(client) {
    this.clients.delete(client);
    try { client.destroy(); } catch {}
    this.active--;
  }
  async connect(entry, signal, operation) {
    this.acquire();
    const client = this.clientFactory();
    this.clients.add(client);
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    let failure;
    try {
      await new Promise((resolve, reject) => {
        let ready = false;
        let mismatch = false;
        let settled = false;
        const finish = error => {
          if (settled) return;
          settled = true; clearTimeout(timer); controller.signal.removeEventListener('abort', cancel);
          if (error) reject(error); else resolve();
        };
        const cancel = () => finish(new SshError('ABORTED'));
        const timer = setTimeout(() => finish(new SshError('TIMEOUT')), this.connectTimeoutMs);
        controller.signal.addEventListener('abort', cancel, { once: true });
        if (controller.signal.aborted) return cancel();
        client.on('error', error => {
          failure = new SshError(mismatch ? 'HOST_KEY_MISMATCH' : error?.level === 'client-authentication' ? 'AUTH_FAILED' : 'CONNECT_FAILED');
          if (ready) controller.abort(); else finish(failure);
        });
        client.on('close', () => {
          failure ??= new SshError('CONNECT_FAILED');
          if (ready) controller.abort(); else finish(failure);
        });
        client.once('ready', () => { ready = true; finish(); });
        const { host, port, username, fingerprint, auth } = entry.server;
        const credential = entry.credential;
        try {
          client.connect({ host, port, username, readyTimeout: this.connectTimeoutMs,
            keepaliveInterval: 10_000, keepaliveCountMax: 2,
            hostVerifier(key) { mismatch = fingerprintOf(key) !== fingerprint; return !mismatch; },
            // Explicit methods only: never fall back to local SSH config, agents or keyboard prompts.
            authHandler: auth === 'password' ? ['password'] : ['publickey'],
            ...(auth === 'password' ? { password: credential.password } : { privateKey: credential.privateKey, ...(credential.passphrase ? { passphrase: credential.passphrase } : {}) }),
          });
        } catch { finish(new SshError('AUTH_FAILED')); }
      });
      if (controller.signal.aborted) throw failure ?? new SshError('ABORTED');
      return await operation(client, controller.signal);
    } catch (error) {
      if (failure && error?.code === 'ABORTED' && !signal?.aborted) throw failure;
      throw error instanceof SshError ? error : new SshError('CONNECT_FAILED');
    } finally {
      signal?.removeEventListener('abort', abort);
      this.release(client);
    }
  }
  dispose() { this.disposed = true; for (const client of this.clients) { try { client.destroy(); } catch {} } }
}
