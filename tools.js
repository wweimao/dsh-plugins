import { argv, recallArgv } from './lib.js';
import { currentDirectory, sessionId, VERSION } from './core.js';
import { describeFailure } from './runner.js';

const TEXT_OUTPUT = { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] };
// Descriptions and schemas intentionally retain the upstream model contract.
export function registerTools(ctx, defineTool, runtime) {
  const { runner, stats, cache } = runtime;
  async function execute(call, exec, remember = false) {
    const cwd = currentDirectory(ctx, exec?.agent);
    const result = await runner.run(call, { cwd, signal: exec?.signal });
    stats.record(result);
    if (!result.ok) return describeFailure(result) + (remember ? ' The decision was not confirmed saved; do not blindly retry a write.' : ' This does not establish that there are no matching sessions.');
    if (remember) cache.clear();
    return result.stdout || (remember ? 'deja returned no confirmation that the decision was recorded.' : 'deja returned no result text; the search outcome is unknown.');
  }
  const register = definition => ctx.tools.register(defineTool({ output: TEXT_OUTPUT, ...definition }));
  register({
    name: 'deja_recall',
    description: "Search this machine's own past AI coding sessions — every agent used on it, including months before deja was installed. Use before debugging an error or re-implementing anything that may already exist, and before the first edit in a task and before calling a change done or ready to merge. Match on the most specific token available: an exact error string, function name, file path or flag.",
    parameters: {
      query: { type: 'string', required: true, description: '1-3 exact terms: a file path, an error string, a flag or identifier.' },
      limit: { type: 'number', description: 'How many sessions to return. Default 5.' },
      offset: { type: 'number', description: 'Sessions to skip, from the offset the previous page named. Default 0.' },
    },
    execute: (args, exec) => execute(recallArgv(args), exec),
  });
  register({
    name: 'deja_session',
    description: 'A full digest of the single best-matching past session — what was tried, what was decided, what it cost. Use after deja_recall when the reasoning behind an earlier decision matters, not just that it happened.',
    parameters: { query: { type: 'string', required: true, description: 'A query, or a session id prefix returned by deja_recall.' } },
    execute: (args, exec) => execute(['--framed', ...argv('ctx', [], args.query)], exec),
  });
  register({
    name: 'deja_blame',
    description: 'The past sessions that discussed a file, so you know why it is shaped the way it is before editing, refactoring or deleting it. Session history, not git authorship.',
    parameters: { path: { type: 'string', required: true, description: 'Path to the file, absolute or relative to the workspace.' } },
    execute: (args, exec) => execute(['--framed', ...argv('blame', ['--json'], args.path)], exec),
  });
  register({
    name: 'deja_fix',
    description: "What this machine ran after that same error before, in the sessions where the error did not come back. Paste the failing output verbatim rather than a paraphrase — the match is on the error's own words.",
    parameters: { error: { type: 'string', required: true, description: 'The failing output, copied as it was printed.' } },
    execute: (args, exec) => execute(['--framed', ...argv('fix', [], args.error)], exec),
  });
  register({
    name: 'deja_how',
    description: 'The real invocation this machine uses for a build, test, deploy or script, with the flags it actually ran, ordered by how many sessions ran it. A guessed command is plausible and fails on this setup.',
    parameters: { what: { type: 'string', required: true, description: 'The thing to run: a tool, a task, a script name.' } },
    execute: (args, exec) => execute(['--framed', ...argv('how', [], args.what)], exec),
  });
  register({
    name: 'deja_remember',
    description: 'Store one durable decision once it is settled, as a single self-contained fact that will make sense months later. Not transcripts, not a summary of the conversation, and not anything already obvious from the code.',
    parameters: { text: { type: 'string', required: true, description: 'The decision, in one or two sentences, with the reason it was taken.' } },
    execute: (args, exec) => execute(argv('remember', [], args.text), exec, true),
  });
}

export function registerCommands(ctx, runtime) {
  const { runner, stats, board, config } = runtime;
  ctx.commands.register({
    name: 'deja', description: "Search this machine's past AI coding sessions", input: { hint: 'what to look for' },
    async handler(invocation) {
      const query = String(invocation.rawInput || '').trim();
      if (!query) return { kind: 'error', text: 'Say what to look for: /deja <error, file, or decision>' };
      const options = { cwd: currentDirectory(ctx, invocation.agent), signal: invocation.signal };
      const result = await runner.run(argv('search', [], query), options);
      stats.record(result);
      if (!result.ok) return { kind: 'error', text: describeFailure(result) };
      const notes = board.take(sessionId(invocation.agent));
      if (!board.hasReader()) {
        const reply = await runner.run(['hook-context', '--notes'], { ...options, timeoutMs: config.hookTimeoutMs });
        if (reply.ok && reply.stdout) notes.push(reply.stdout);
      }
      return { kind: 'success', text: [result.stdout || 'deja returned no result text; the search outcome is unknown.', ...notes].join('\n\n') };
    },
  });
  ctx.commands.register({
    name: 'deja-status', description: 'Show local memory adapter health without searching history',
    handler: () => ({ kind: 'success', text: JSON.stringify({ plugin: '@local/dsh-deja-reliability', version: VERSION, ...stats.snapshot(), cacheEntries: runtime.cache.size, autoRecall: config.autoRecall, hookTimeoutMs: config.hookTimeoutMs, maxContextChars: config.maxContextChars }, null, 2) }),
  });
}

export function healthStats() {
  let calls = 0, failures = 0, cacheHits = 0, lastFailure = null;
  return {
    record(result) { calls++; if (!result.ok) { failures++; lastFailure = { kind: result.kind, code: result.code, at: Date.now() }; } },
    hit() { cacheHits++; },
    snapshot: () => ({ calls, failures, cacheHits, lastFailure }),
  };
}
