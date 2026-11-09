import { randomUUID } from 'node:crypto';

export const KINDS = ['memo', 'task'];
export const STATUSES = ['todo', 'doing', 'blocked', 'review', 'done'];
export const PRIORITIES = ['low', 'normal', 'high'];
const EDITABLE = ['kind', 'title', 'content', 'status', 'priority', 'dueDate', 'project', 'tags', 'pinned', 'archived'];
const RECORD = ['id', ...EDITABLE, 'revision', 'createdAt', 'updatedAt', 'sourceSessionId', 'history'];
const DEFAULTS = { kind: 'memo', content: '', status: 'todo', priority: 'normal', dueDate: null, project: '', tags: [], pinned: false, archived: false };
const clone = value => structuredClone(value);

export class PlannerError extends Error {
  constructor(code, message) { super(message); this.name = 'PlannerError'; this.code = code; }
}
const invalid = message => { throw new PlannerError('invalid_input', message); };
function object(value, allowed, required = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid('Expected a plain object.');
  if (Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key))) invalid('Unexpected or missing fields.');
}
function text(value, label, max, empty = true, multiline = false) {
  if (typeof value !== 'string' || value.length > max || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value)) invalid(`${label} is invalid (maximum ${max} characters).`);
  const result = multiline ? value.replace(/\r\n?/g, '\n') : value.trim();
  if (!empty && !result) invalid(`${label} must not be empty.`);
  return result;
}
function enumValue(value, values, label) { if (!values.includes(value)) invalid(`Invalid ${label}.`); return value; }
function bool(value, label) { if (typeof value !== 'boolean') invalid(`${label} must be boolean.`); return value; }
function integer(value, min, max, label) { if (!Number.isSafeInteger(value) || value < min || value > max) invalid(`Invalid ${label}.`); return value; }
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}
export function dateInZone(now, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key).value).join('-');
}
function fields(input, isCreate = false) {
  object(input, isCreate ? EDITABLE.filter(key => key !== 'archived') : EDITABLE, isCreate ? ['title'] : []);
  if (!Object.keys(input).length) invalid('An update needs at least one field.');
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    switch (key) {
      case 'kind': out.kind = enumValue(value, KINDS, key); break;
      case 'title': out.title = text(value, key, 160, false); break;
      case 'content': out.content = text(value, key, 20000, true, true); break;
      case 'status': out.status = enumValue(value, STATUSES, key); break;
      case 'priority': out.priority = enumValue(value, PRIORITIES, key); break;
      case 'dueDate': if (value !== null && !validDate(value)) invalid('dueDate must be a real YYYY-MM-DD date, or null.'); out.dueDate = value; break;
      case 'project': out.project = text(value, key, 120); break;
      case 'tags':
        if (!Array.isArray(value) || value.length > 12) invalid('Use at most 12 tags.');
        out.tags = [...new Set(value.map(tag => text(tag, 'tag', 40, false)))]; break;
      case 'pinned': case 'archived': out[key] = bool(value, key); break;
    }
  }
  return out;
}
function invariants(item) {
  if (item.kind === 'memo' && (item.dueDate !== null || item.status !== 'todo')) invalid('Memos have no due date or workflow status; convert the memo to a task first.');
}
function iso(value) { return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
function id(value) { return text(value, 'id', 100, false); }
function session(value) { return value === null ? null : text(value, 'sessionId', 200, false); }
/** Used both before writes and by the native domain decoder on reopen. */
export function validateRecord(value) {
  object(value, RECORD, RECORD);
  id(value.id);
  const editable = Object.fromEntries(EDITABLE.map(key => [key, value[key]]));
  const normalized = fields(editable);
  if (JSON.stringify(editable) !== JSON.stringify(normalized)) invalid('Stored item contains non-canonical fields.');
  invariants(value);
  integer(value.revision, 1, Number.MAX_SAFE_INTEGER, 'revision');
  if (!iso(value.createdAt) || !iso(value.updatedAt)) invalid('Invalid record timestamps.');
  session(value.sourceSessionId);
  if (!Array.isArray(value.history) || !value.history.length || value.history.length > 30) invalid('Invalid history.');
  let previous = 0;
  for (const entry of value.history) {
    object(entry, ['revision', 'at', 'actor', 'sessionId', 'action', 'fields'], ['revision', 'at', 'actor', 'sessionId', 'action', 'fields']);
    integer(entry.revision, 1, value.revision, 'history revision');
    if (entry.revision <= previous || !iso(entry.at)) invalid('Invalid history ordering.');
    previous = entry.revision;
    enumValue(entry.actor, ['user', 'agent'], 'actor'); session(entry.sessionId);
    if (entry.actor === 'user' && entry.sessionId !== null) invalid('User actor cannot claim a model session.');
    enumValue(entry.action, ['create', 'update', 'archive', 'restore'], 'history action');
    if (!Array.isArray(entry.fields) || entry.fields.some(key => !EDITABLE.includes(key))) invalid('Invalid changed fields.');
  }
  if (previous !== value.revision) invalid('History revision mismatch.');
  return value;
}
export function isRecord(value) { try { validateRecord(value); return true; } catch { return false; } }
function summaryItem(item) { const { content, history, ...rest } = item; return { ...clone(rest), excerpt: content.slice(0, 180) }; }
function compare(a, b) {
  return Number(b.pinned) - Number(a.pinned) || (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99') || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
}
export function publicError(error) {
  if (error instanceof PlannerError) return { code: error.code, message: error.message };
  return { code: 'storage_error', message: 'The operation could not be confirmed. A storage failure may require reloading the planner plugin or restarting DSH. Then read the item to check whether the write committed before retrying; do not blindly repeat a write.' };
}

/** One operation layer for both UI and model tools. Table writes acknowledge durability. */
export function createPlanner(table, { timeZone = 'Asia/Shanghai', clock = () => new Date(), makeId = () => `p_${randomUUID()}` } = {}) {
  // Validate zone at activation, not while processing a user's first mutation.
  dateInZone(clock(), timeZone);
  let closing = false;
  let tail = Promise.resolve();
  const listeners = new Set();
  function active(signal) {
    if (closing) throw new PlannerError('disposed', 'Planner is unloading. Retry after it reconnects.');
    signal?.throwIfAborted();
  }
  function readAll() { return [...table.entries()].map(([key, item]) => { if (key !== item.id) throw new Error('Storage identity mismatch'); return item; }); }
  function actorOf(actor) {
    object(actor, ['kind', 'sessionId'], ['kind']);
    const kind = enumValue(actor.kind, ['user', 'agent'], 'actor');
    if (kind === 'user' && actor.sessionId != null) invalid('UI cannot impersonate an agent.');
    return { actor: kind, sessionId: kind === 'agent' ? session(actor.sessionId ?? null) : null };
  }
  function historyEntry(revision, at, actor, action, changed) { return { revision, at, ...actor, action, fields: changed }; }
  function notify() { for (const fn of [...listeners]) { try { fn(); } catch { /* Observers cannot reject a committed mutation. */ } } }
  async function dispatch(request, actor = { kind: 'user' }, signal) {
    active(signal);
    if (!request || typeof request !== 'object') invalid('Expected a request.');
    const today = dateInZone(clock(), timeZone);
    if (request.action === 'get') {
      object(request, ['action', 'id'], ['action', 'id']);
      const item = table.get(id(request.id));
      if (!item) throw new PlannerError('not_found', 'Item not found.');
      return clone(item);
    }
    if (request.action === 'list') {
      object(request, ['action', 'kind', 'status', 'project', 'query', 'archived', 'month', 'limit', 'offset'], ['action']);
      const kind = request.kind === undefined ? undefined : enumValue(request.kind, KINDS, 'kind');
      const status = request.status === undefined ? undefined : enumValue(request.status, STATUSES, 'status');
      const project = request.project === undefined ? undefined : text(request.project, 'project', 120);
      const query = request.query === undefined ? '' : text(request.query, 'query', 200).toLocaleLowerCase();
      const archived = request.archived === undefined ? false : bool(request.archived, 'archived');
      const limit = request.limit === undefined ? 50 : integer(request.limit, 1, 200, 'limit');
      const offset = request.offset === undefined ? 0 : integer(request.offset, 0, Number.MAX_SAFE_INTEGER, 'offset');
      if (request.month !== undefined && !validDate(`${request.month}-01`)) invalid('month must be YYYY-MM.');
      const items = readAll().filter(item => item.archived === archived && (!kind || item.kind === kind) && (!status || item.status === status) && (project === undefined || item.project === project) && (request.month === undefined || item.dueDate?.startsWith(`${request.month}-`)) && (!query || [item.title, item.content, item.project, ...item.tags].join('\n').toLocaleLowerCase().includes(query))).sort(compare);
      return { items: items.slice(offset, offset + limit).map(summaryItem), total: items.length, limit, offset, today, timeZone };
    }
    if (request.action === 'summary') {
      object(request, ['action'], ['action']);
      const items = readAll().filter(item => !item.archived).sort(compare);
      const tasks = items.filter(item => item.kind === 'task');
      const pending = tasks.filter(item => item.status !== 'done');
      const dueToday = pending.filter(item => item.dueDate === today);
      const overdue = pending.filter(item => item.dueDate && item.dueDate < today);
      const upcoming = pending.filter(item => item.dueDate && item.dueDate > today);
      return { today, timeZone, counts: { tasks: tasks.length, memos: items.length - tasks.length, today: dueToday.length, overdue: overdue.length, doing: tasks.filter(item => item.status === 'doing').length, review: tasks.filter(item => item.status === 'review').length, done: tasks.filter(item => item.status === 'done').length }, todayItems: dueToday.slice(0, 6).map(summaryItem), overdueItems: overdue.slice(0, 6).map(summaryItem), upcomingItems: upcoming.slice(0, 6).map(summaryItem), pinnedItems: items.filter(item => item.pinned).slice(0, 6).map(summaryItem) };
    }
    let input;
    if (request.action === 'create') {
      object(request, ['action', 'item'], ['action', 'item']);
      input = fields(request.item, true);
      invariants({ ...DEFAULTS, ...input });
    } else if (request.action === 'update') {
      object(request, ['action', 'id', 'expectedRevision', 'patch'], ['action', 'id', 'expectedRevision', 'patch']);
      id(request.id); integer(request.expectedRevision, 1, Number.MAX_SAFE_INTEGER, 'expectedRevision');
      input = fields(request.patch);
    } else invalid('Unknown action.');
    const actorInfo = actorOf(actor);
    const operation = tail.then(async () => {
      active(signal); // Includes cancellation after another write's FIFO slot.
      const at = clock().toISOString();
      let committed;
      if (request.action === 'create') {
        const itemId = id(makeId());
        if (table.get(itemId)) throw new Error('Generated identity collision');
        committed = { id: itemId, ...clone(DEFAULTS), ...input, revision: 1, createdAt: at, updatedAt: at, sourceSessionId: actorInfo.sessionId, history: [historyEntry(1, at, actorInfo, 'create', Object.keys(input))] };
        validateRecord(committed);
        await table.put(itemId, committed);
      } else {
        if (!table.get(request.id)) throw new PlannerError('not_found', 'Item not found.');
        committed = await table.update(request.id, current => {
          if (current.revision !== request.expectedRevision) throw new PlannerError('conflict', 'This item changed elsewhere. Reload its latest revision before saving; your changes were not applied.');
          if (current.revision >= Number.MAX_SAFE_INTEGER) invalid('Revision limit reached.');
          const merged = { ...current, ...input };
          if (input.kind === 'memo' && current.kind !== 'memo') {
            if ((Object.hasOwn(input, 'dueDate') && input.dueDate !== null) || (Object.hasOwn(input, 'status') && input.status !== 'todo')) invalid('Converting to a memo cannot specify a deadline or task status.');
            merged.dueDate = null; merged.status = 'todo';
          }
          invariants(merged);
          const changed = EDITABLE.filter(key => JSON.stringify(current[key]) !== JSON.stringify(merged[key]));
          const revision = current.revision + 1;
          const action = changed.includes('archived') ? (merged.archived ? 'archive' : 'restore') : 'update';
          return validateRecord({ ...merged, revision, updatedAt: at, history: [...current.history, historyEntry(revision, at, actorInfo, action, changed)].slice(-30) });
        });
      }
      notify();
      return clone(committed);
    });
    tail = operation.catch(() => {});
    return operation;
  }
  return {
    dispatch,
    subscribe(listener) { if (closing) throw new PlannerError('disposed', 'Planner is unloading.'); listeners.add(listener); return () => listeners.delete(listener); },
    async close() { closing = true; listeners.clear(); await tail; },
  };
}
