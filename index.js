import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import Schema from '@deepseek-ai/schemastery';
import { defineTool } from './tool-schema.js';
import { z } from 'zod';
import { createRunner } from './runner.js';
import { contributions, noteBoard } from './lib.js';
import { defaults, foldProjection, initialProjection, sessionCache } from './core.js';
import { registerTools, registerCommands, healthStats } from './tools.js';
import { registerRecall } from './recall.js';

export const inject = ['tools', 'commands', 'systemPrompt', 'workingDirectory', 'agents', 'sessionProjections'];
const number = (value, min, max, description) => Schema.number().min(min).max(max).step(1).default(value).description(description);
export const Config = Schema.object({
  autoRecall: Schema.boolean().default(true).description('Enable automatic historical context; manual tools remain available.'),
  projectRecall: Schema.boolean().default(true).description('Recall a project digest at session startup.'),
  promptRecall: Schema.boolean().default(true).description('Recall history relevant to admitted human prompts.'),
  fileRecall: Schema.boolean().default(true).description('Recall file history after reads and edits.'),
  errorRecall: Schema.boolean().default(true).description('Recall previous fixes after failed shell commands.'),
  captureCompaction: Schema.boolean().default(true).description('Capture recovery context before compaction.'),
  timeoutMs: number(20000, 100, 120000, 'Manual query timeout in milliseconds, including executable discovery.'),
  hookTimeoutMs: number(2500, 100, 20000, 'Automatic hook timeout in milliseconds.'),
  cacheTtlMs: number(300000, 1000, 3600000, 'Prompt recall cache lifetime in milliseconds.'),
  maxSessions: number(128, 1, 1024, 'Maximum sessions with retained recall cache entries.'),
  maxContextChars: number(12000, 512, 64000, 'Maximum characters in combined automatic project/prompt context.'),
  maxToolNoteChars: number(3000, 512, 16000, 'Maximum characters in one automatic file/error note.'),
  maxToolNotesPerTurn: number(8, 0, 32, 'Maximum automatic file/error notes per turn.'),
});

function executableCandidates() {
  const require = createRequire(import.meta.url);
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const arch = process.arch === 'x64' ? 'amd64' : process.arch;
  const exe = platform === 'windows' ? 'deja.exe' : 'deja';
  const candidates = [process.env.DEJA_BIN, exe].filter(Boolean);
  // Platform packages are optional dependencies of the CLI, not necessarily
  // hoisted into this package by pnpm. Resolve from the CLI's own package too.
  const resolvers = [require];
  try { resolvers.push(createRequire(require.resolve('@vshulcz/deja-vu/package.json'))); } catch {}
  for (const resolver of resolvers) {
    try { candidates.push(resolver.resolve(`@vshulcz/deja-vu-${platform}-${arch}/bin/${exe}`)); } catch {}
  }
  return [...new Set(candidates)];
}

export async function apply(ctx, settings = {}) {
  const config = { ...defaults, ...settings };
  const runner = createRunner({ candidates: executableCandidates(), timeoutMs: config.timeoutMs });
  const cache = sessionCache(config);
  const stats = healthStats();
  const board = noteBoard();
  let shutdownRecall;
  ctx.effect(() => async () => {
    try { await shutdownRecall?.(); }
    finally { runner.dispose(); cache.clear(); }
  });
  const cliDir = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'plugins', 'deja');
  const adds = contributions({ command: existsSync(join(cliDir, 'command.js')), auto: existsSync(join(cliDir, 'auto.js')) }, config);
  const runtime = { runner, config, cache, stats, board };
  if (adds.tools) registerTools(ctx, defineTool, runtime);
  if (adds.command) registerCommands(ctx, runtime);
  if (adds.recall) {
    const projection = await ctx.sessionProjections.register({
      key: 'local.deja-reliability.prompt', stateVersion: 1,
      stateSchema: z.object({ prompt: z.string(), promptId: z.string(), compaction: z.number().int().nonnegative() }),
      init: initialProjection, apply: foldProjection,
    });
    shutdownRecall = registerRecall(ctx, { ...runtime, projection });
  }
}
