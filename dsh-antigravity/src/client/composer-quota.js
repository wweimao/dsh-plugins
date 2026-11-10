/** Composer-only client extension. No credentials, inference, settings writes or model changes. */
export function createAntiGravityComposerQuota(React, ReactDOM, env = globalThis) {
  const messages = {
    zh: { agQuotaTitle: 'Anti Gravity 额度', agQuotaWeek: '周', agQuotaFiveHours: '五小时', agQuotaWeekly: '每周', agQuotaRemaining: '剩余', agQuotaLoading: '正在读取额度', agQuotaUnavailable: '暂无对应周期额度', agQuotaSignIn: '尚未登录 Anti Gravity', agQuotaFailed: '刷新失败；显示上次数据', agQuotaStale: '数据较旧，请刷新确认', agQuotaRefresh: '刷新额度', agQuotaReset: '重置时间', agQuotaResetUnknown: '重置时间未知', agQuotaResetDue: '已到重置时间，等待刷新确认', agQuotaUpdated: '最后更新', agQuotaShared: '同组模型共享额度', agQuotaClose: '关闭' },
    en: { agQuotaTitle: 'Anti Gravity quota', agQuotaWeek: 'Week', agQuotaFiveHours: 'Five hours', agQuotaWeekly: 'Weekly', agQuotaRemaining: 'Remaining', agQuotaLoading: 'Loading quota', agQuotaUnavailable: 'No quota for this window', agQuotaSignIn: 'Not signed in to Anti Gravity', agQuotaFailed: 'Refresh failed; showing previous data', agQuotaStale: 'Older data; refresh to confirm', agQuotaRefresh: 'Refresh quota', agQuotaReset: 'Resets', agQuotaResetUnknown: 'Reset time unavailable', agQuotaResetDue: 'Reset due; awaiting refreshed data', agQuotaUpdated: 'Last updated', agQuotaShared: 'Shared by models in this group', agQuotaClose: 'Close' },
  };
  function familyOf(current) {
    if (current?.provider !== 'google-antigravity' || typeof current.model !== 'string') return undefined;
    // Argon has its own allowance; never borrow the ordinary Gemini pool.
    if (/^gemini-4-argon(?:-|$)/.test(current.model)) return 'argon';
    if (current.model.startsWith('gemini-')) return 'gemini';
    if (/^(claude-|gpt-)/.test(current.model)) return 'claude-gpt';
    return undefined;
  }
  function groupFamily(group) {
    const label = typeof group?.label === 'string' ? group.label.trim().replace(/\s+/g, ' ') : '';
    if (/\bargon\b/i.test(label)) {
      // Recognize the dedicated group, but reject combined/ambiguous labels.
      return /^(?:Gemini 4 )?Argon(?: Models?)?$/i.test(label) ? 'argon' : undefined;
    }
    const gemini = /\bgemini\b/i.test(label), claude = /\b(?:claude|gpt)\b/i.test(label);
    return gemini === claude ? undefined : gemini ? 'gemini' : 'claude-gpt';
  }
  function selectQuota(snapshot, current) {
    const family = familyOf(current);
    if (!family) return undefined;
    const groups = Array.isArray(snapshot?.quota?.groups) ? snapshot.quota.groups.filter(group => groupFamily(group) === family) : [];
    // Never infer the group from its array position, or substitute per-model quotaInfo.
    const group = groups.length === 1 ? groups[0] : undefined;
    const buckets = Array.isArray(group?.buckets) ? group.buckets : [];
    return { family, label: group?.label, windows: ['5h', 'weekly'].map(window => {
      const matches = buckets.filter(bucket => bucket?.window === window);
      const bucket = matches.length === 1 ? matches[0] : undefined;
      const value = snapshot?.configured === true ? bucket?.remainingFraction : undefined;
      const percent = typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? Math.round(value * 1000) / 10 : null;
      const reset = bucket?.resetTime;
      return { window, percent, resetTime: typeof reset === 'string' && Number.isFinite(Date.parse(reset)) ? reset : null };
    }) };
  }
  function createController(describe, options = {}) {
    const now = options.now || (() => Date.now());
    const timers = options.timers || env;
    const listeners = new Set();
    let state = { status: 'idle', now: now(), refreshing: false, failed: false }, refs = 0, generation = 0, disposed = false;
    let pending, cancelPending, timer, lastAttempt = -Infinity;
    const publish = patch => { state = { ...state, ...patch }; for (const listener of [...listeners]) listener(); };
    const visible = () => !env.document || env.document.visibilityState !== 'hidden';
    function refresh(force = false) {
      if (disposed || refs === 0) return Promise.resolve();
      if (pending) return pending;
      if (!force && now() - lastAttempt < 60000) return Promise.resolve();
      const epoch = generation;
      lastAttempt = now();
      publish({ status: state.snapshot ? state.status : 'loading', refreshing: true, now: now() });
      let timeout, cancel;
      const bounded = new Promise((resolve, reject) => {
        cancel = () => reject(new Error('Quota request cancelled'));
        timeout = timers.setTimeout(() => reject(new Error('Quota request timed out')), 30000);
        Promise.resolve().then(() => {
          if (disposed || refs === 0 || epoch !== generation) throw new Error('Quota request cancelled');
          return describe();
        }).then(resolve, reject);
      });
      cancelPending = cancel;
      const request = bounded.then(snapshot => {
        if (disposed || refs === 0 || epoch !== generation) return;
        if (!snapshot || typeof snapshot.configured !== 'boolean') throw new Error('Invalid quota snapshot');
        publish({ snapshot, status: snapshot.configured ? 'ready' : 'unconfigured', failed: !!snapshot.quota?.error, refreshing: false, now: now() });
      }).catch(() => {
        if (!disposed && refs > 0 && epoch === generation) publish({ status: 'error', failed: true, refreshing: false, now: now() });
      }).finally(() => { timers.clearTimeout(timeout); if (pending === request) { pending = undefined; cancelPending = undefined; } });
      pending = request;
      return request;
    }
    const wake = () => { if (visible()) { publish({ now: now() }); void refresh(); } };
    function stop() {
      if (timer !== undefined) timers.clearInterval(timer);
      timer = undefined;
      env.removeEventListener?.('focus', wake);
      env.document?.removeEventListener('visibilitychange', wake);
      generation++; cancelPending?.(); cancelPending = undefined; pending = undefined;
    }
    return {
      getSnapshot: () => state,
      subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
      refresh,
      retain() {
        if (disposed) return () => {};
        refs++;
        if (refs === 1) {
          env.addEventListener?.('focus', wake);
          env.document?.addEventListener('visibilitychange', wake);
          timer = timers.setInterval(wake, 15000);
          if (visible()) void refresh();
        }
        let released = false;
        return () => { if (released) return; released = true; if (--refs === 0) { stop(); lastAttempt = -Infinity; publish({ snapshot: undefined, status: 'idle', now: now(), refreshing: false, failed: false }); } };
      },
      invalidate(reload = true) {
        if (disposed) return;
        generation++; cancelPending?.(); cancelPending = undefined; pending = undefined; lastAttempt = -Infinity;
        publish({ snapshot: undefined, status: 'idle', refreshing: false, failed: false, now: now() });
        if (reload && refs > 0 && visible()) void refresh();
      },
      dispose() { disposed = true; stop(); listeners.clear(); },
    };
  }
  function quotaState(state, t) {
    if (state.status === 'unconfigured') return t('agQuotaSignIn');
    if (state.failed) return t('agQuotaFailed');
    if (state.status === 'loading' || state.status === 'idle') return t('agQuotaLoading');
    if (state.snapshot?.quota?.fetchedAt !== undefined && state.now - state.snapshot.quota.fetchedAt > 120000) return t('agQuotaStale');
    return undefined;
  }
  function ComposerQuota({ directory, controller, t }) {
    const h = React.createElement;
    const directoryState = React.useSyncExternalStore(directory.subscribe, directory.getSnapshot);
    const current = directoryState.current;
    const active = directoryState.routable !== false && !!familyOf(current);
    const state = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    React.useEffect(() => active ? controller.retain() : undefined, [active, controller]);
    const [open, setOpen] = React.useState(false), [position, setPosition] = React.useState();
    const trigger = React.useRef(null), panel = React.useRef(null), id = React.useId();
    React.useEffect(() => { setOpen(false); }, [current?.provider, current?.model]);
    React.useLayoutEffect(() => {
      if (!open || !active) return;
      const locate = () => {
        const box = trigger.current?.getBoundingClientRect();
        if (!box) return;
        const width = Math.min(320, Math.max(160, env.innerWidth - 24));
        setPosition({ position: 'fixed', width, left: Math.max(12, Math.min(env.innerWidth - width - 12, box.right - width)), bottom: Math.max(12, env.innerHeight - box.top + 8) });
      };
      const outside = event => { if (!trigger.current?.contains(event.target) && !panel.current?.contains(event.target)) setOpen(false); };
      const key = event => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
      locate();
      env.addEventListener('resize', locate); env.addEventListener('scroll', locate, true);
      env.document.addEventListener('pointerdown', outside); env.document.addEventListener('keydown', key);
      return () => { env.removeEventListener('resize', locate); env.removeEventListener('scroll', locate, true); env.document.removeEventListener('pointerdown', outside); env.document.removeEventListener('keydown', key); };
    }, [open, active]);
    if (!active) return null;
    const quota = selectQuota(state.snapshot, current), note = quotaState(state, t);
    const value = row => row.percent === null ? '--' : `${row.percent}%`;
    const label = row => row.window === '5h' ? t('agQuotaFiveHours') : t('agQuotaWeekly');
    const reset = row => !row.resetTime ? t('agQuotaResetUnknown') : Date.parse(row.resetTime) <= state.now ? t('agQuotaResetDue') : `${t('agQuotaReset')}: ${new Date(row.resetTime).toLocaleString()}`;
    const warning = state.failed || !!note && state.status === 'ready';
    const aria = `${t('agQuotaTitle')}: ${quota.windows.map(row => `${label(row)} ${t('agQuotaRemaining')} ${value(row)}`).join('; ')}${note ? `; ${note}` : ''}`;
    const summary = h('button', {
      ref: trigger, type: 'button', className: 'agComposerQuota', 'data-ag-quota': quota.family, 'data-ag-model': current.model,
      'data-warning': warning ? 'true' : undefined, 'data-ag-quota-version': '1',
      'aria-label': aria, title: aria, 'aria-haspopup': 'dialog', 'aria-expanded': open, 'aria-controls': open ? id : undefined,
      onClick: () => setOpen(value => !value),
    }, ...quota.windows.map(row => h('span', { className: 'agQuotaCompactWindow', key: row.window, 'data-ag-window': row.window },
      h('span', null, row.window === '5h' ? '5h' : t('agQuotaWeek')), h('span', null, value(row)))), warning ? h('span', { 'aria-hidden': true }, '*') : null);
    const detail = open ? ReactDOM.createPortal(h('section', { ref: panel, id, role: 'dialog', 'aria-label': t('agQuotaTitle'), className: 'agQuotaPopover', style: position || { visibility: 'hidden' } },
      h('div', { className: 'agQuotaHeading' }, h('strong', null, quota.label || t('agQuotaTitle')), h('button', { type: 'button', onClick: () => setOpen(false), 'aria-label': t('agQuotaClose') }, '×')),
      h('p', { className: 'agQuotaNote' }, t('agQuotaShared')),
      ...quota.windows.map(row => h('div', { className: 'agQuotaDetail', key: row.window },
        h('div', null, h('span', null, label(row)), h('strong', null, `${t('agQuotaRemaining')} ${value(row)}`)),
        row.percent !== null ? h('progress', { max: 100, value: row.percent, 'aria-label': label(row) }) : h('span', { className: 'agQuotaNote' }, t('agQuotaUnavailable')),
        h('div', { className: 'agQuotaNote' }, reset(row)))),
      note ? h('p', { className: 'agQuotaNote', role: 'status' }, note) : null,
      Number.isFinite(state.snapshot?.quota?.fetchedAt) ? h('p', { className: 'agQuotaNote' }, `${t('agQuotaUpdated')}: ${new Date(state.snapshot.quota.fetchedAt).toLocaleString()}`) : null,
      h('button', { type: 'button', className: 'agQuotaRefresh', disabled: state.refreshing, onClick: () => void controller.refresh(true) }, state.refreshing ? t('agQuotaLoading') : t('agQuotaRefresh')),
    ), env.document.body) : null;
    return h(React.Fragment, null, summary, detail);
  }
  const styles = `.agComposerQuota{display:inline-flex;align-items:center;gap:9px;border:0;border-radius:5px;padding:3px 5px;background:transparent;color:var(--dsw-alias-label-secondary,#888);font:inherit;font-size:12px;white-space:nowrap;cursor:pointer;font-variant-numeric:tabular-nums}.agComposerQuota:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,#222)}.agComposerQuota:focus-visible{outline:2px solid var(--accent,#75a7ff);outline-offset:2px}.agComposerQuota[data-warning]{color:var(--warning,#dca75e)}.agQuotaCompactWindow{display:inline-flex;gap:4px}.agQuotaPopover{z-index:10000;box-sizing:border-box;padding:14px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#222);box-shadow:0 10px 35px #0006;font-size:13px;max-height:70vh;overflow:auto}.agQuotaHeading,.agQuotaDetail>div:first-child{display:flex;justify-content:space-between;gap:12px;align-items:center}.agQuotaHeading button{border:0;background:transparent;color:inherit;font-size:20px;cursor:pointer}.agQuotaDetail{margin:12px 0}.agQuotaDetail progress{width:100%;height:6px;accent-color:var(--accent,#75a7ff);margin:7px 0}.agQuotaNote{color:var(--dsw-alias-label-secondary,#888);font-size:11px;line-height:1.5;margin:4px 0}.agQuotaRefresh{padding:5px 9px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:6px;background:transparent;color:inherit;cursor:pointer}.agQuotaRefresh:disabled{opacity:.55;cursor:default}@media(max-width:480px){.agComposerQuota{gap:5px;padding:2px;font-size:11px}}`;
  function register(ctx, api, namespace) {
    const controller = createController(api.describe);
    const restore = [];
    const wrap = (name, make) => {
      const original = api[name];
      if (typeof original !== 'function') return;
      const wrapped = make(original);
      api[name] = wrapped;
      restore.push(() => { if (api[name] === wrapped) api[name] = original; });
    };
    ctx.effect(() => {
      const style = env.document.createElement('style'); style.dataset.agQuotaStyle = '1'; style.textContent = styles; env.document.head.appendChild(style);
      const reset = ctx.on('connection/reset', () => controller.invalidate());
      return () => { reset?.(); controller.dispose(); for (const undo of restore) undo(); style.remove(); };
    }, 'antigravity: composer quota lifecycle');
    for (const name of ['start', 'logout', 'setModelEnabled']) {
      wrap(name, original => async (...args) => { controller.invalidate(false); try { return await original(...args); } finally { controller.invalidate(); } });
    }
    wrap('poll', original => async (...args) => { const result = await original(...args); if (result?.kind !== 'pending') controller.invalidate(); return result; });
    ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
      name: 'conversation.input.right', id: 'antigravity-composer-quota', order: 16, locale: namespace,
      inject: sessionId => ({ directory: ctx.modelDirectories.directoryFor(sessionId).store, controller, t: ctx.locale.bind(namespace) }),
    }, ComposerQuota));
    return controller;
  }
  return { familyOf, groupFamily, selectQuota, createController, ComposerQuota, register, messages, styles };
}
