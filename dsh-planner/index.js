import Schema from '@deepseek-ai/schemastery';
import { z } from 'zod';
import { isRecord } from './core.js';
import { mountPlanner } from './runtime.js';

export const name = 'local-planner';
export const inject = ['storageDomain', 'connection', 'tools'];
export const Config = Schema.object({
  timeZone: Schema.string().default('Asia/Shanghai').description('IANA time zone for today and overdue calculations. All-day deadlines stay unchanged.'),
}).default({});
const recordSchema = z.unknown().refine(isRecord, 'Invalid planner record');

export async function apply(ctx, config) {
  await ctx.effect(async () => mountPlanner(ctx, recordSchema, config));
}
