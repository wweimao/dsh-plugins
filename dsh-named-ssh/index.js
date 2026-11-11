import { NamedSsh, SshError, safeError, object, aliasOf, normalizeExec, VERSION } from './core.js';

export const inject = ['tools', 'credentials', 'connection', 'approval'];
const objectSchema = properties => ({ type: 'object', properties, additionalProperties: false });
const aliasSchema = { type: 'string', description: 'Saved server alias returned by ssh_list_servers.' };
const output = {
  schema: { type: 'object', properties: { ok: { type: 'boolean' }, value: { type: 'object', additionalProperties: true }, error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } }, required: ['code', 'message'], additionalProperties: false } }, required: ['ok'], additionalProperties: false },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
};
async function safe(operation) {
  try { return { ok: true, value: await operation() }; }
  catch (error) { return { ok: false, error: safeError(error) }; }
}
async function readJson(request) {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) throw new SshError('INVALID_INPUT');
  const reader = request.body?.getReader();
  if (!reader) throw new SshError('INVALID_INPUT');
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 96 * 1024) { await reader.cancel(); throw new SshError('INVALID_INPUT'); }
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { throw new SshError('INVALID_INPUT'); }
  finally { reader.releaseLock(); }
}
function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  } });
}

export function apply(ctx) {
  const ssh = new NamedSsh(ctx.credentials);
  const lifetime = new AbortController();
  ctx.effect(() => () => { lifetime.abort(); ssh.dispose(); });
  const signalFor = signal => signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal;
  const register = definition => ctx.effect(() => ctx.tools.register({ output, timeoutMs: 150_000, ...definition }));
  register({
    name: 'ssh_list_servers',
    description: 'List user-enabled SSH server aliases and connection metadata, without credentials. Users manage servers in Settings → SSH servers.',
    parameters: objectSchema({}),
    isConcurrencySafe: () => true,
    execute: args => safe(async () => { object(args, []); return { ...await ssh.list({ enabledOnly: true }), pluginVersion: VERSION }; }),
  });
  register({
    name: 'ssh_test_connection',
    description: 'Check SSH login to a saved server using its stored credentials and pinned host key; runs no remote command.',
    parameters: { ...objectSchema({ alias: aliasSchema }), required: ['alias'] },
    isConcurrencySafe: () => true,
    execute: (args, exec) => safe(() => { object(args, ['alias']); return ssh.test(aliasOf(args.alias), signalFor(exec.signal)); }),
  });
  register({
    name: 'ssh_exec',
    description: 'Run a noninteractive command on a saved SSH server; return bounded stdout/stderr and exit status. Uses stored login, requires execution approval, and is not restricted by the local file sandbox. Each call starts a fresh shell. Do not place credentials in the command; destructive actions need explicit user intent.',
    parameters: { ...objectSchema({
      alias: aliasSchema,
      command: { type: 'string', description: 'Remote shell command. No interactive password or sudo prompts; maximum 32768 characters.' },
      cwd: { type: 'string', description: 'Absolute remote working directory; defaults to the server setting.' },
      timeout_ms: { type: 'integer', description: 'Execution deadline in milliseconds, 1000–120000; default 30000. Cancellation may leave remote child processes running.' },
    }), required: ['alias', 'command'] },
    isConcurrencySafe: () => false,
    execute: (args, exec) => safe(async () => {
      const request = normalizeExec(args);
      // Resolve before approval for a useful no-network unknown/disabled error; resolve again before dispatch.
      await ssh.get(request.alias);
      if (!exec.agent) throw new SshError('APPROVAL_REQUIRED');
      const granted = await ctx.approval.request({
        agent: exec.agent, toolName: 'ssh_exec', callId: exec.callId, signal: exec.signal,
        reason: `Run a remote SSH command on ${request.alias}. This is outside the local file sandbox.`,
        displayReason: {
          en: `Execute on SSH server “${request.alias}”? Remote commands run with that account's permissions, outside the local file sandbox.`,
          zh: `允许在 SSH 服务器「${request.alias}」执行这条命令吗？远程命令使用该账户权限，不受本地文件沙箱限制。`,
        },
      });
      if (granted !== 'allowed-once') throw new SshError('APPROVAL_REQUIRED');
      return ssh.exec(args, signalFor(exec.signal));
    }),
  });

  // Private user configuration surface, not an agent tool or a session command.
  // Connection performs Host/Origin/auth checks; enforce owner again and never echo request data.
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/named-ssh', methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      const admitted = ctx.connection.admit(request);
      if ('rejection' in admitted || admitted.peer.principal.kind !== 'owner') {
        return json({ ok: false, error: { code: 'FORBIDDEN', message: 'Owner access is required.' } }, 'rejection' in admitted ? admitted.rejection : 403);
      }
      if (request.method !== 'POST') return json({ ok: false, error: safeError(new SshError('INVALID_INPUT')) }, 405);
      const result = await safe(async () => {
        const input = await readJson(request);
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new SshError('INVALID_INPUT');
        const { action, ...args } = input;
        const signal = signalFor(request.signal);
        switch (action) {
          case 'list': object(args, []); return ssh.list();
          case 'probe': return ssh.probe(args, signal);
          case 'save': return ssh.save(args, signal);
          case 'test': object(args, ['alias']); return ssh.test(aliasOf(args.alias), signal, { enabledOnly: false });
          case 'remove': object(args, ['alias']); return ssh.remove(aliasOf(args.alias));
          default: throw new SshError('INVALID_INPUT');
        }
      });
      return json(result, result.ok ? 200 : 400);
    },
  }));
}
