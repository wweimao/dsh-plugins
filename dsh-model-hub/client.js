window.__ModuleLoader__.load({
  id: '@local/dsh-model-hub',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'model-hub';
    const NATIVE_NS = 'subagent-model-selection-settings';
    const ROLES = ['main', 'executor', 'reviewer'];
    const LABELS = { main: '主代理', executor: '执行子代理', reviewer: '复核子代理' };
    const cleanText = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
    const keyOf = route => JSON.stringify([route.provider, route.model]);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const copy = value => JSON.parse(JSON.stringify(value));
    function exactKeys(value, allowed, required) {
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key))) throw new Error('invalid object shape');
    }
    function routeOf(value) {
      exactKeys(value, ['provider', 'model', 'reasoningEffort'], ['provider', 'model']);
      if (!value || !cleanText(value.provider, 160) || !cleanText(value.model, 256) || value.reasoningEffort !== undefined && !cleanText(value.reasoningEffort, 64)) throw new Error('invalid route');
      return { provider: value.provider, model: value.model, ...(value.reasoningEffort === undefined ? {} : { reasoningEffort: value.reasoningEffort }) };
    }
    function presetOf(value) {
      exactKeys(value, ['id', 'name', ...ROLES], ['id', 'name', 'main', 'executor']);
      if (!value || typeof value.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(value.id) || !cleanText(value.name, 80) || !value.name.trim()) throw new Error('invalid preset');
      return { id: value.id, name: value.name, main: routeOf(value.main), executor: routeOf(value.executor), ...(value.reviewer === undefined ? {} : { reviewer: routeOf(value.reviewer) }) };
    }
    function poolIdentity(value) {
      exactKeys(value, ['provider', 'model'], ['provider', 'model']);
      return routeOf(value);
    }
    function poolOf(value) {
      exactKeys(value, ['mode', 'models'], ['mode', 'models']);
      if (!['all', 'selected'].includes(value.mode) || !Array.isArray(value.models) || value.models.length > 4096 || value.mode === 'all' && value.models.length) throw new Error('invalid pool');
      const models = new Map();
      for (const model of value.models) { const route = poolIdentity(model); if (models.has(keyOf(route))) throw new Error('duplicate pool identity'); models.set(keyOf(route), route); }
      return { mode: value.mode, models: [...models.values()] };
    }
    function configOf(value) {
      exactKeys(value, ['pool', 'activePresetId', 'presets'], ['activePresetId', 'presets']);
      if (!value || !Array.isArray(value.presets) || value.presets.length > 16 || typeof value.activePresetId !== 'string') throw new Error('invalid configuration');
      const presets = value.presets.map(presetOf);
      if (new Set(presets.map(p => p.id)).size !== presets.length || value.activePresetId !== '' && !presets.some(p => p.id === value.activePresetId)) throw new Error('invalid configuration');
      return { pool: poolOf(Object.hasOwn(value, 'pool') ? value.pool : { mode: 'all', models: [] }), activePresetId: value.activePresetId, presets };
    }
    function catalogOf(value) {
      if (!value || !Array.isArray(value.groups) || !Array.isArray(value.failures)) throw new Error('invalid catalog');
      const ids = new Set();
      const groups = value.groups.map(group => {
        if (!cleanText(group.id, 160) || !Array.isArray(group.models) || ids.has(group.id)) throw new Error('invalid provider');
        ids.add(group.id);
        const modelIds = new Set();
        return { id: group.id, name: cleanText(group.name, 256) ? group.name : group.id, models: group.models.map(model => {
          if (!cleanText(model.id, 256) || modelIds.has(model.id)) throw new Error('invalid model');
          modelIds.add(model.id);
          const efforts = model.reasoning === undefined ? [] : model.reasoning.efforts;
          if (!Array.isArray(efforts)) throw new Error('invalid efforts');
          const effortIds = new Set();
          return { id: model.id, name: cleanText(model.name, 256) ? model.name : model.id, efforts: efforts.map(effort => {
            if (!cleanText(effort.id, 64) || effortIds.has(effort.id)) throw new Error('invalid effort');
            effortIds.add(effort.id);
            return { id: effort.id, name: cleanText(effort.name, 160) ? effort.name : effort.id };
          }) };
        }) };
      });
      // Do not display raw provider errors, which may contain transport details.
      return { status: 'ready', groups, failures: value.failures.map(f => ({ id: typeof f.id === 'string' ? f.id : '', name: cleanText(f.name, 256) ? f.name : cleanText(f.id, 160) ? f.id : '未知渠道' })) };
    }
    const findModel = (catalog, route) => catalog.groups.find(g => g.id === route?.provider)?.models.find(m => m.id === route?.model);
    function routeIssue(catalog, route) {
      if (!route?.provider || !route.model) return '请选择渠道与模型';
      if (catalog.status !== 'ready') return catalog.status === 'error' ? '目录读取失败，无法确认可用性' : '目录尚未确认';
      const model = findModel(catalog, route);
      if (!model) return catalog.failures.some(f => f.id === route.provider) ? '该渠道目录读取失败' : '目录中不可用（渠道关闭、未挂载或模型已下架）';
      if (route.reasoningEffort !== undefined && !model.efforts.some(e => e.id === route.reasoningEffort)) return '保存的思考档位已不可用';
      return '';
    }
    function presetIssues(catalog, preset) {
      return ROLES.filter(role => preset[role] !== undefined).map(role => ({ role, issue: routeIssue(catalog, preset[role]) })).filter(x => x.issue);
    }
    function nativeValue(snapshot) {
      if (snapshot.status !== 'ready' || !snapshot.writable || snapshot.revision == null || typeof snapshot.value?.enabled !== 'boolean' || !Array.isArray(snapshot.value.allowedModels)) throw new Error('native unavailable');
      return { enabled: snapshot.value.enabled, allowedModels: snapshot.value.allowedModels.map(r => { const route = routeOf(r); return { provider: route.provider, model: route.model }; }) };
    }
    function mergeRoutes(existing, added) {
      const result = new Map();
      for (const route of [...existing, ...added]) {
        const r = routeOf(route);
        result.set(keyOf(r), { provider: r.provider, model: r.model });
      }
      return [...result.values()];
    }
    const unionRoutes = (existing, preset) => mergeRoutes(existing, ROLES.map(role => preset[role]).filter(Boolean));
    const catalogRoutes = catalog => catalog.groups.flatMap(group => group.models.map(model => ({ provider: group.id, model: model.id })));
    const sameRoutes = (a, b) => same(a.map(keyOf).sort(), b.map(keyOf).sort());
    function poolCandidates(catalog, pool) {
      if (catalog.status !== 'ready') throw new Error('catalog unavailable');
      if (pool.mode === 'all' && catalog.failures.length) throw new Error('incomplete pool catalog');
      const advertised = catalogRoutes(catalog), visible = new Set(advertised.map(keyOf));
      const routes = pool.mode === 'all' ? advertised : pool.models;
      if (!routes.length || routes.some(route => !visible.has(keyOf(route)))) throw new Error('pool unavailable');
      return routes.map(poolIdentity);
    }
    function poolRows(catalog, pool, filter = {}) {
      const selected = new Set(pool.models.map(keyOf));
      const rows = new Map();
      for (const group of catalog.groups) for (const model of group.models) {
        const route = { provider: group.id, model: model.id };
        rows.set(keyOf(route), { ...route, providerName: group.name, name: model.name, efforts: model.efforts, selected: pool.mode === 'all' || selected.has(keyOf(route)), issue: catalog.status === 'ready' ? '' : routeIssue(catalog, route) });
      }
      for (const route of pool.models) if (!rows.has(keyOf(route))) rows.set(keyOf(route), { ...route, providerName: route.provider, name: route.model, efforts: [], selected: true, issue: routeIssue(catalog, route) });
      const query = (filter.query ?? '').trim().toLowerCase();
      return [...rows.values()].filter(row => (!filter.provider || row.provider === filter.provider) && (!query || `${row.provider} ${row.providerName} ${row.model} ${row.name}`.toLowerCase().includes(query)));
    }

    /** UI-only state machine. All writes use the existing shared configuration forms. */
    class ModelHubController {
      constructor(ctx) {
        this.ctx = ctx;
        this.form = ctx.configForms.get(NS);
        this.native = ctx.configForms.get(NATIVE_NS);
        this.listeners = new Set();
        this.catalog = { status: 'idle', groups: [], failures: [] };
        this.editor = null;
        this.poolEditor = null;
        this.filter = { provider: '', query: '', page: 0 };
        this.authorization = null;
        this.deletion = null;
        this.busy = '';
        this.notice = '';
        this.error = '';
        this.disposed = false;
        this.epoch = 0;
        this.catalogGeneration = 0;
        this.connectionReady = true;
        this.subscribe = listener => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
        this.getSnapshot = () => this.snapshot;
        this.offs = [this.form.subscribe(() => {
          if (this.editor && this.busy !== 'save' && this.form.getSnapshot().revision !== this.editor.revision) this.editor = { ...this.editor, conflicted: true };
          if (this.poolEditor && this.busy !== 'save-pool' && this.form.getSnapshot().revision !== this.poolEditor.revision) this.poolEditor = { ...this.poolEditor, conflicted: true };
          if (this.authorization && this.form.getSnapshot().revision !== this.authorization.ownRevision) this.invalidateAuthorization('组合已在其他位置更新，请重新确认授权。');
          this.publish();
        }), this.native.subscribe(() => {
          if (this.authorization && this.busy !== 'authorize-write' && this.native.getSnapshot().revision !== this.authorization.nativeRevision) this.invalidateAuthorization('原生授权已在其他位置更新，请重新确认，原有授权未被覆盖。');
          this.publish();
        })];
        for (const event of ['llm/adapters-updated', 'settings/document-updated']) this.offs.push(ctx.remote.$on(event, () => { void this.refreshCatalog(); }));
        this.offs.push(ctx.on('connection/reset', () => { void this.resetConnection(); }));
        this.publish();
      }
      current() { return configOf(this.form.getSnapshot().value?.state); }
      writable() {
        const s = this.form.getSnapshot();
        return !this.disposed && this.connectionReady && s.status === 'ready' && s.writable && s.revision != null;
      }
      publish() {
        if (this.disposed) return;
        let config, configInvalid = false;
        try { config = this.current(); } catch { config = { pool: { mode: 'all', models: [] }, activePresetId: '', presets: [] }; configInvalid = true; }
        this.snapshot = { config, configInvalid, available: this.form.getSnapshot().status === 'ready', writable: this.writable() && !configInvalid, nativeAvailable: this.native.getSnapshot().status === 'ready' && this.native.getSnapshot().writable && this.native.getSnapshot().revision != null, catalog: this.catalog, editor: this.editor, poolEditor: this.poolEditor, filter: this.filter, authorization: this.authorization, deletion: this.deletion, busy: this.busy, error: this.error, notice: this.notice, connectionReady: this.connectionReady };
        for (const listener of this.listeners) listener();
      }
      invalidateAuthorization(message) {
        if (this.authorization && this.busy !== 'authorize-write') { this.authorization = null; if (message) this.error = message; }
      }
      async refreshCatalog(invalidate = true) {
        if (this.disposed) return false;
        if (invalidate) this.invalidateAuthorization('目录已变化，请重新检查并确认授权。');
        const generation = ++this.catalogGeneration;
        const epoch = this.epoch;
        this.catalog = { ...this.catalog, status: 'loading' };
        this.publish();
        try {
          const result = await this.ctx.remote.session.modelCatalog();
          if (this.disposed || epoch !== this.epoch || generation !== this.catalogGeneration) return false;
          if (!result?.ok) throw new Error('catalog unavailable');
          this.catalog = catalogOf(result.value);
          this.publish();
          return true;
        } catch {
          if (!this.disposed && epoch === this.epoch && generation === this.catalogGeneration) {
            this.catalog = { status: 'error', groups: [], failures: [] };
            this.publish();
          }
          return false;
        }
      }
      async resetConnection() {
        if (this.disposed) return;
        const epoch = ++this.epoch;
        this.catalogGeneration++;
        this.catalog = { status: 'idle', groups: [], failures: [] };
        this.authorization = null;
        this.deletion = null;
        if (this.editor) this.editor = { ...this.editor, conflicted: true };
        if (this.poolEditor) this.poolEditor = { ...this.poolEditor, conflicted: true };
        this.busy = '';
        this.connectionReady = false;
        this.error = '连接已重置。草稿保留但不可直接保存；请重新载入设置，放弃旧草稿后再编辑。';
        this.publish();
        try {
          await this.ctx.configForms.describe().load();
          if (this.disposed || this.epoch !== epoch) return;
          this.connectionReady = !this.ctx.configForms.describe().getSnapshot().error;
        } catch { /* Keep writes disabled until a successful explicit reload. */ }
        if (!this.disposed && this.epoch === epoch) { this.publish(); await this.refreshCatalog(); }
      }
      async reloadSettings() {
        if (this.disposed || this.busy) return;
        const epoch = this.epoch;
        this.busy = 'reload'; this.publish();
        try {
          await this.ctx.configForms.describe().load();
          if (this.disposed || epoch !== this.epoch) return;
          if (this.ctx.configForms.describe().getSnapshot().error) throw new Error('reload failed');
          this.connectionReady = true;
          this.notice = '已重新读取设置；现有草稿未被覆盖。';
        } catch { if (epoch === this.epoch) this.error = '设置读取失败，请稍后重试。草稿仍保留。'; }
        finally { if (!this.disposed && epoch === this.epoch) { this.busy = ''; this.publish(); } }
      }
      editPool() {
        if (!this.writable() || this.busy || this.editor) return false;
        if (!this.poolEditor) {
          const config = this.current();
          this.poolEditor = { value: copy(config.pool), base: copy(config), revision: this.form.getSnapshot().revision, conflicted: false };
          this.authorization = null; this.deletion = null; this.error = ''; this.notice = '';
        }
        this.publish(); return true;
      }
      setPoolMode(mode) {
        if (!['all', 'selected'].includes(mode) || !this.editPool()) return;
        this.poolEditor = { ...this.poolEditor, value: { mode, models: mode === 'all' ? [] : this.poolEditor.value.models } };
        this.authorization = null; this.publish();
      }
      togglePoolModel(route, enabled) {
        let model;
        try { model = poolIdentity(route); } catch { return; }
        const pool = this.poolEditor?.value ?? this.current().pool;
        if (pool.mode !== 'selected' || enabled && (this.catalog.status !== 'ready' || !findModel(this.catalog, model)) || !this.editPool()) return;
        const models = new Map(this.poolEditor.value.models.map(r => [keyOf(r), r]));
        if (enabled) models.set(keyOf(model), model); else models.delete(keyOf(model));
        if (models.size > 4096) { this.error = '手选子集最多 4096 个模型。'; this.publish(); return; }
        this.poolEditor = { ...this.poolEditor, value: { mode: 'selected', models: [...models.values()] } };
        this.authorization = null; this.publish();
      }
      selectFilteredPool() {
        if (this.catalog.status !== 'ready' || !this.editPool()) return;
        const models = poolRows(this.catalog, { mode: 'all', models: [] }, this.filter).filter(row => !row.issue).map(row => ({ provider: row.provider, model: row.model }));
        if (models.length > 4096) { this.error = '当前筛选结果超过 4096 个模型，请缩小范围。'; this.publish(); return; }
        this.poolEditor = { ...this.poolEditor, value: { mode: 'selected', models } };
        this.authorization = null; this.publish();
      }
      setPoolFilter(field, value) {
        if (!['provider', 'query'].includes(field) || typeof value !== 'string') return;
        this.filter = { ...this.filter, [field]: value, page: 0 }; this.publish();
      }
      setPoolPage(page) { if (Number.isSafeInteger(page) && page >= 0) { this.filter = { ...this.filter, page }; this.publish(); } }
      discardPool() { if (!this.busy) { this.poolEditor = null; this.error = ''; this.notice = ''; this.publish(); } }
      async savePool() {
        const draft = this.poolEditor; if (!draft || this.editor) return false;
        return this.writeConfig({ ...draft.base, pool: poolOf(draft.value) }, draft.revision, 'save-pool', draft, 'poolEditor');
      }
      edit(id) {
        if (!this.writable() || this.busy || this.editor || this.poolEditor) return;
        const config = this.current();
        let value;
        if (id !== undefined) { value = config.presets.find(p => p.id === id); if (!value) return; }
        else {
          if (config.presets.length >= 16) { this.error = '最多保存 16 个组合。'; this.publish(); return; }
          let suffix = 1;
          while (config.presets.some(p => p.id === `preset-${suffix}`)) suffix++;
          value = { id: `preset-${suffix}`, name: '', main: { provider: '', model: '' }, executor: { provider: '', model: '' } };
        }
        this.editor = { originalId: id ?? null, value: copy(value), base: copy(config), revision: this.form.getSnapshot().revision, conflicted: false };
        this.authorization = null; this.deletion = null; this.error = ''; this.notice = ''; this.publish();
      }
      editField(field, value) {
        if (!this.editor || this.busy || !this.writable() || !['id', 'name'].includes(field) || field === 'id' && this.editor.originalId !== null) return;
        this.editor = { ...this.editor, value: { ...this.editor.value, [field]: value } }; this.publish();
      }
      setReviewer(enabled) {
        if (!this.editor || this.busy || !this.writable()) return;
        const value = { ...this.editor.value };
        if (enabled) value.reviewer = { provider: '', model: '' }; else delete value.reviewer;
        this.editor = { ...this.editor, value }; this.publish();
      }
      selectRole(role, field, value) {
        if (!this.editor || !ROLES.includes(role) || !this.editor.value[role] || this.busy || !this.writable() || this.catalog.status !== 'ready') return;
        const previous = this.editor.value[role];
        let route;
        if (field === 'provider') {
          if (value !== '' && !this.catalog.groups.some(g => g.id === value)) return;
          route = { provider: value, model: '' };
        } else if (field === 'model') {
          if (value !== '' && !findModel(this.catalog, { provider: previous.provider, model: value })) return;
          route = { provider: previous.provider, model: value };
        } else if (field === 'reasoningEffort') {
          if (value !== '' && !findModel(this.catalog, previous)?.efforts.some(e => e.id === value)) return;
          route = { provider: previous.provider, model: previous.model, ...(value === '' ? {} : { reasoningEffort: value }) };
        } else return;
        this.editor = { ...this.editor, value: { ...this.editor.value, [role]: route } }; this.publish();
      }
      discard() { if (this.busy) return; this.editor = null; this.error = ''; this.notice = ''; this.publish(); }
      async writeConfig(desired, revision, action, editor, draftField = 'editor') {
        if (!this.writable() || this.busy) return false;
        desired = configOf(desired); // Canonical key order also makes acceptance checks order-independent.
        if (this.form.getSnapshot().revision !== revision || editor?.conflicted) {
          if (editor) this[draftField] = { ...editor, conflicted: true };
          this.error = '设置已在其他位置更新，未覆盖新值；草稿已保留。请放弃草稿后重新编辑。'; this.publish(); return false;
        }
        const epoch = this.epoch;
        this.busy = action; this.error = ''; this.notice = ''; this.publish();
        try {
          const accepted = await this.form.mutate([{ op: 'set', path: ['state'], value: desired }], revision);
          if (this.disposed || epoch !== this.epoch) return false;
          if (accepted !== true || !same(this.current(), desired)) throw new Error('not accepted');
          if (editor) this[draftField] = null;
          this.deletion = null;
          this.notice = '候选池与模板设置已保存；没有授权、推理或切换主模型。删除候选不会撤销既有原生授权。'; return true;
        } catch {
          if (!this.disposed && epoch === this.epoch) {
            if (editor) this[draftField] = { ...editor, conflicted: this.form.getSnapshot().revision !== revision };
            this.error = '保存未被接受或状态无法确认。草稿保留；请重新读取设置核对，不会自动重试或回滚其他修改。';
          }
          return false;
        } finally { if (!this.disposed && epoch === this.epoch) { this.busy = ''; this.publish(); } }
      }
      async save() {
        const editor = this.editor;
        if (!editor) return false;
        let desired;
        try {
          const preset = presetOf(editor.value);
          desired = { ...editor.base, presets: editor.originalId === null ? [...editor.base.presets, preset] : editor.base.presets.map(p => p.id === editor.originalId ? preset : p) };
          desired = configOf(desired);
        } catch { this.error = '请检查组合 ID、名称和角色选择：主代理与执行必填，思考档位可省略，最多 16 个组合。'; this.publish(); return false; }
        return this.writeConfig(desired, editor.revision, 'save', editor);
      }
      async activate(id) {
        if (!this.writable() || this.busy || this.editor || this.poolEditor) return false;
        const config = this.current();
        if (id !== '' && !config.presets.some(p => p.id === id)) return false;
        this.authorization = null;
        return this.writeConfig({ ...config, activePresetId: id }, this.form.getSnapshot().revision, 'activate');
      }
      requestDelete(id) {
        if (!this.writable() || this.busy || this.editor || this.poolEditor) return;
        const config = this.current();
        const preset = config.presets.find(p => p.id === id); if (!preset) return;
        this.authorization = null;
        this.deletion = { preset, config, revision: this.form.getSnapshot().revision }; this.publish();
      }
      cancelDelete() { if (!this.busy) { this.deletion = null; this.publish(); } }
      async confirmDelete() {
        const pending = this.deletion; if (!pending || this.editor || this.poolEditor) return false;
        return this.writeConfig({ ...pending.config, presets: pending.config.presets.filter(p => p.id !== pending.preset.id), activePresetId: pending.config.activePresetId === pending.preset.id ? '' : pending.config.activePresetId }, pending.revision, 'delete');
      }
      async preparePoolAuthorization() { return this.prepareAuthorization(null); }
      async prepareAuthorization(id) {
        if (!this.writable() || this.busy || this.editor || this.poolEditor) return false;
        const config = this.current(), isPool = id === null;
        const preset = isPool ? undefined : config.presets.find(p => p.id === id);
        if (!isPool && !preset) return false;
        const pool = copy(config.pool), ownRevision = this.form.getSnapshot().revision, epoch = this.epoch;
        this.authorization = null; this.deletion = null; this.error = ''; this.notice = ''; this.busy = 'authorize-check'; this.publish();
        try {
          if (!await this.refreshCatalog(false)) throw new Error('catalog unavailable');
          await this.ctx.configForms.describe().load();
          if (this.disposed || epoch !== this.epoch) return false;
          if (this.ctx.configForms.describe().getSnapshot().error || !this.writable() || ownRevision !== this.form.getSnapshot().revision || !isPool && presetIssues(this.catalog, preset).length) throw new Error('dependency changed');
          const candidates = isPool ? poolCandidates(this.catalog, pool) : unionRoutes([], preset);
          const native = this.native.getSnapshot(), value = nativeValue(native);
          this.authorization = { kind: isPool ? 'pool' : 'template', ...(isPool ? { pool } : { preset: copy(preset) }), candidates: copy(candidates), ownRevision, nativeRevision: native.revision, previous: value, routes: mergeRoutes(value.allowedModels, candidates), consent: false };
          return true;
        } catch {
          if (!this.disposed && epoch === this.epoch) this.error = isPool
            ? '无法准备池授权：目录必须可用，候选须非空且全部有效。全池目录不完整时不能授权；可改为明确可见的手选子集并保存。原生授权设置也须可写。未修改任何授权。'
            : '无法准备授权：请确认目录、所有角色/档位和原生授权设置均可用，再重新操作。未修改任何授权。';
          return false;
        } finally { if (!this.disposed && epoch === this.epoch) { this.busy = ''; this.publish(); } }
      }
      consent(value) { if (this.authorization && !this.busy) { this.authorization = { ...this.authorization, consent: value === true }; this.publish(); } }
      cancelAuthorization() { if (!this.busy) { this.authorization = null; this.publish(); } }
      async confirmAuthorization() {
        const intent = this.authorization;
        if (!intent?.consent || !this.writable() || this.busy || this.editor || this.poolEditor) return false;
        const epoch = this.epoch;
        this.busy = 'authorize-check'; this.error = ''; this.notice = ''; this.publish();
        try {
          // Recheck immediately before the single CAS write, not just when the dialog opened.
          if (!await this.refreshCatalog(false)) throw new Error('catalog unavailable');
          if (this.disposed || epoch !== this.epoch) return false;
          // Notifications may lag: refresh settings too before checking the captured
          // own/native fences. This is still not a cross-namespace transaction.
          await this.ctx.configForms.describe().load();
          if (this.disposed || epoch !== this.epoch) return false;
          if (this.ctx.configForms.describe().getSnapshot().error) throw new Error('settings refresh failed');
          const native = this.native.getSnapshot();
          if (this.authorization !== intent || !this.writable() || this.form.getSnapshot().revision !== intent.ownRevision || native.revision !== intent.nativeRevision || !same(nativeValue(native), intent.previous)) throw new Error('authorization changed');
          if (intent.kind === 'pool') {
            if (!same(this.current().pool, intent.pool) || !sameRoutes(poolCandidates(this.catalog, intent.pool), intent.candidates)) throw new Error('candidate set changed');
          } else if (presetIssues(this.catalog, intent.preset).length) throw new Error('template route changed');
          this.busy = 'authorize-write'; this.publish();
          const accepted = await this.native.mutate([{ op: 'set', path: ['enabled'], value: true }, { op: 'set', path: ['allowedModels'], value: intent.routes }], intent.nativeRevision);
          if (this.disposed || epoch !== this.epoch) return false;
          if (accepted !== true) throw new Error('authorization refused');
          const landed = nativeValue(this.native.getSnapshot());
          if (!landed.enabled || !same(landed.allowedModels, intent.routes)) throw new Error('authorization unconfirmed');
          this.notice = '原生模型授权已合并。仅之后创建的新顶级会话生效；旧会话权限不变。主模型不变，主 Agent 可按任务动态选择池中已授权子模型；如需更换主模型请手动选择。';
          return true;
        } catch {
          if (!this.disposed && epoch === this.epoch) this.error = '授权未完成或状态无法确认（候选集合新增/消失、目录不完整、配置或权限可能变化）。旧确认已撤销，未自动重试，未回滚其他修改；请重新读取原生设置并再次确认完整清单。';
          return false;
        } finally { if (!this.disposed && epoch === this.epoch) { this.authorization = null; this.busy = ''; this.publish(); } }
      }
      dispose() { this.disposed = true; this.epoch++; this.catalogGeneration++; for (const off of this.offs) off(); this.listeners.clear(); }
    }

    const css = `.model-hub{max-width:1050px;margin:auto;padding:28px clamp(20px,4vw,48px) 48px;color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.5;font-family:inherit;overflow-wrap:anywhere}.model-hub *{box-sizing:border-box}.model-hub h2{font-size:22px;margin:0 0 8px}.model-hub h3{font-size:16px;margin:0 0 12px}.model-hub p{margin:6px 0}.mh-card{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);padding:18px;border-radius:12px;margin:16px 0}.mh-muted{font-size:13px;color:var(--dsw-alias-label-secondary)}.mh-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.model-hub button,.model-hub input,.model-hub select{font:inherit;color:inherit;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-base);padding:7px 10px;min-height:36px}.model-hub button{cursor:pointer}.model-hub button:disabled,.model-hub select:disabled{opacity:.5;cursor:not-allowed}.model-hub :focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.model-hub fieldset{min-width:0;border:0;padding:0;margin:0}.model-hub label{display:block;margin:10px 0}.model-hub label>input:not([type=checkbox]):not([type=radio]),.model-hub label>select{display:block;width:100%;margin-top:5px}.model-hub input[type=checkbox],.model-hub input[type=radio]{min-height:0;margin-right:8px}.mh-pool-table{overflow:auto;max-height:560px;margin-top:14px}.mh-route-list{max-height:320px;overflow:auto;padding-left:24px}.mh-role-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.mh-note{border-left:3px solid var(--dsw-alias-brand-primary);padding:10px 14px;background:var(--dsw-alias-bg-layer-2);border-radius:6px}.mh-error{color:var(--dsw-alias-state-error-primary)}.mh-warning{color:var(--dsw-alias-state-warn-label)}.mh-primary{font-weight:600}.model-hub code{font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}.mh-table{width:100%;border-collapse:collapse;font-size:13px}.mh-table th,.mh-table td{text-align:left;vertical-align:top;padding:8px;border-bottom:1px solid var(--dsw-alias-border-l1)}.model-hub summary{cursor:pointer}.mh-confirm{border:2px solid var(--dsw-alias-brand-primary)}@media(max-width:760px){.mh-role-grid{grid-template-columns:1fr}}`;
    const button = (label, onClick, disabled, props = {}) => h('button', { type: 'button', onClick, disabled, ...props }, label);
    const routeText = route => `${route.provider} / ${route.model}${route.reasoningEffort === undefined ? '' : ` · ${route.reasoningEffort}`}`;
    function RoleEditor({ role, route, state, controller }) {
      const provider = state.catalog.groups.find(g => g.id === route.provider), model = findModel(state.catalog, route);
      const issue = routeIssue(state.catalog, route);
      const disabled = !state.writable || !!state.busy || state.catalog.status !== 'ready';
      return h('section', { className: 'mh-card' }, h('h3', null, LABELS[role]),
        h('label', null, '渠道', h('select', { value: route.provider, disabled, onChange: e => controller.selectRole(role, 'provider', e.target.value) }, h('option', { value: '' }, '请选择渠道'), route.provider && !provider && h('option', { value: route.provider }, `${route.provider}（不可用）`), ...state.catalog.groups.map(g => h('option', { key: g.id, value: g.id }, `${g.name} · ${g.id}`)))),
        h('label', null, '模型', h('select', { value: route.model, disabled: disabled || !provider, onChange: e => controller.selectRole(role, 'model', e.target.value) }, h('option', { value: '' }, '请选择模型'), route.model && !model && h('option', { value: route.model }, `${route.model}（不可用）`), ...(provider?.models ?? []).map(m => h('option', { key: m.id, value: m.id }, `${m.name} · ${m.id}`)))),
        h('label', null, '思考档位', h('select', { value: route.reasoningEffort ?? '', disabled: disabled || !model, onChange: e => controller.selectRole(role, 'reasoningEffort', e.target.value) }, h('option', { value: '' }, '渠道默认（不指定）'), route.reasoningEffort !== undefined && !model?.efforts.some(e => e.id === route.reasoningEffort) && h('option', { value: route.reasoningEffort }, `${route.reasoningEffort}（已失效）`), ...(model?.efforts ?? []).map(e => h('option', { key: e.id, value: e.id }, `${e.name} · ${e.id}`)))),
        issue && h('p', { className: 'mh-warning' }, issue));
    }
    function PoolPanel({ state, controller }) {
      const pool = state.poolEditor?.value ?? state.config.pool;
      const rows = poolRows(state.catalog, pool, state.filter), allRows = poolRows(state.catalog, pool);
      const total = catalogRoutes(state.catalog).length, count = pool.mode === 'all' ? total : pool.models.length;
      const page = Math.min(state.filter.page, Math.max(0, Math.ceil(rows.length / 100) - 1));
      const providers = new Map(state.catalog.groups.map(g => [g.id, g.name]));
      for (const route of pool.models) if (!providers.has(route.provider)) providers.set(route.provider, `${route.provider}（目录中不可用）`);
      if (state.filter.provider && !providers.has(state.filter.provider)) providers.set(state.filter.provider, state.filter.provider);
      const locked = !state.writable || !!state.busy || !!state.editor;
      return h('section', { className: 'mh-card', 'aria-label': '动态候选模型池' },
        h('h3', null, '主 Agent + 全模型候选池'),
        h('p', null, '无需创建角色模板。主 Agent 按任务从候选池与当前会话原生授权的交集中，自由选择一个或多个子模型，不固定执行/复核角色，也不会自动运行所有模型。'),
        h('div', { className: 'mh-actions' },
          h('label', null, h('input', { type: 'radio', name: 'model-hub-pool-mode', value: 'all', checked: pool.mode === 'all', disabled: locked, onChange: () => controller.setPoolMode('all') }), '所有当前及以后发现的目录模型'),
          h('label', null, h('input', { type: 'radio', name: 'model-hub-pool-mode', value: 'selected', checked: pool.mode === 'selected', disabled: locked, onChange: () => controller.setPoolMode('selected') }), '手选子集（最多 4096 个）')),
        h('p', { className: 'mh-muted' }, 'all 模式的新发现模型仅自动进入候选池，不自动授权。手选子集保留失效条目供你检查；切换到全部模型会清空手选列表。池不固定思考档位，运行时只能使用该模型目录里的真实档位。'),
        state.poolEditor && h('p', { className: state.poolEditor.conflicted ? 'mh-error' : 'mh-warning', role: 'status' }, state.poolEditor.conflicted ? '池草稿基于旧版本，不能覆盖最新设置；请放弃后重新编辑。' : '池设置尚未保存；授权只使用已保存的池。'),
        state.catalog.status !== 'ready' && h('p', { className: 'mh-warning' }, state.catalog.status === 'error' ? '目录读取失败。已保存池与模板仍保留，不能授权。' : '正在检查目录；当前显示的条目尚未重新确认。'),
        state.catalog.failures.length > 0 && h('p', { className: 'mh-warning' }, `部分渠道加载失败：${state.catalog.failures.map(f => f.name).join('、')}。不能授权不完整的全池；可明确选择当前可见子集后保存。`),
        h('div', { className: 'mh-role-grid' },
          h('label', null, '按渠道筛选', h('select', { value: state.filter.provider, onChange: e => controller.setPoolFilter('provider', e.target.value) }, h('option', { value: '' }, '所有渠道'), ...[...providers].map(([id, name]) => h('option', { key: id, value: id }, `${name} · ${id}`)))),
          h('label', null, '关键词（渠道 / 模型名称或 ID）', h('input', { type: 'search', value: state.filter.query, onChange: e => controller.setPoolFilter('query', e.target.value) }))),
        h('p', { className: 'mh-muted' }, `目录 ${total} 个 · 池候选 ${count} 个 · 目录已确认 ${allRows.filter(r => r.selected && !r.issue).length} 个 · 筛选 ${rows.length} 条。未进行真实调用验证。`),
        h('p', { className: 'mh-muted' }, '筛选只影响显示；授权确认始终展示完整候选与完整原生清单，不会仅凭当前页面偷偷增加或减少授权。'),
        h('div', { className: 'mh-actions' }, button('编辑池设置', () => controller.editPool(), locked || !!state.poolEditor), button('仅选当前筛选结果', () => controller.selectFilteredPool(), locked || state.catalog.status !== 'ready'), button('保存池设置（不授权）', () => { void controller.savePool(); }, locked || !state.poolEditor || state.poolEditor.conflicted), button('放弃池草稿', () => controller.discardPool(), !!state.busy || !state.poolEditor), button('授权池给新会话', () => { void controller.preparePoolAuthorization(); }, locked || !!state.poolEditor || !state.nativeAvailable, { className: 'mh-primary' })),
        h('div', { className: 'mh-pool-table' }, h('table', { className: 'mh-table' }, h('thead', null, h('tr', null, h('th', null, '入池'), h('th', null, '模型与精确身份'), h('th', null, '目录档位 / 状态'))),
          h('tbody', null, ...rows.slice(page * 100, page * 100 + 100).map(row => h('tr', { key: keyOf(row) },
            h('td', null, h('input', { type: 'checkbox', checked: row.selected, disabled: locked || pool.mode === 'all' || !row.selected && !!row.issue, 'aria-label': `选择 ${row.provider} / ${row.model}`, onChange: e => controller.togglePoolModel({ provider: row.provider, model: row.model }, e.target.checked) })),
            h('td', null, h('strong', null, row.name), h('p', null, row.providerName), h('code', null, `${row.provider} / ${row.model}`), row.issue && h('p', { className: 'mh-warning' }, row.issue)),
            h('td', null, row.efforts.map(e => e.id).join(' / ') || '渠道默认', h('p', { className: row.issue ? 'mh-warning' : 'mh-muted' }, row.issue || '仅目录存在，非调用验证'))))))),
        !rows.length && h('p', null, '当前筛选无条目。候选池为空时不能授权。'),
        rows.length > 100 && h('div', { className: 'mh-actions' }, button('上一页', () => controller.setPoolPage(page - 1), page === 0), h('span', null, `${page + 1} / ${Math.ceil(rows.length / 100)} 页（每页 100 条）`), button('下一页', () => controller.setPoolPage(page + 1), (page + 1) * 100 >= rows.length)),
        h('p', { className: 'mh-muted' }, '保存池或删除候选不会撤销已有原生授权。需要撤权时请到原生子代理设置另行操作；已有会话权限仍保持创建时快照。'));
    }
    function Page({ controller }) {
      const state = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
      const locked = !state.writable || !!state.busy || !!state.editor || !!state.poolEditor;
      const editor = state.editor;
      return h('div', { className: 'model-hub', 'aria-busy': !!state.busy }, h('style', null, css),
        h('h2', null, '统一模型池'),
        h('p', { className: 'mh-muted' }, '把当前所有已配置渠道的真实模型汇入同一候选池，让主 Agent 按任务自由调度。不同渠道的同名模型不会混同，当前主模型不会被切换。'),
        h('div', { className: 'mh-note' }, h('strong', null, '候选池 ≠ 原生授权 ≠ 开始运行'), h('p', null, '保存池或模板不推理、不切换主模型、不改变权限。主 Agent 可查询 model_hub_pool，再与当前 list_subagent_models 的授权取交集；子代理仍通过原生 subagent 执行，遵守既有深度、并发与工具权限。如需更换主模型，请手动选择。'), h('p', null, '目录出现不代表凭据、额度或实际调用已验证。新发现的模型不会自动获得授权；授权变更仅影响之后创建的新顶级会话，旧会话及其子会话不变。')),
        (!state.available || state.configInvalid) && h('p', { className: 'mh-warning', role: 'status' }, '模型池设置尚未就绪、插件已关闭或配置无效，当前不能修改。'),
        state.available && !state.writable && h('p', { className: 'mh-warning' }, '设置为只读或连接尚未重新确认，写入已禁用。'),
        state.error && h('p', { className: 'mh-error', role: 'alert' }, state.error),
        state.notice && h('p', { role: 'status' }, state.notice),
        h('div', { className: 'mh-actions' }, button('刷新模型目录', () => { void controller.refreshCatalog(); }, !!state.busy), button('重新读取设置（保留草稿）', () => { void controller.reloadSettings(); }, !!state.busy)),
        h(PoolPanel, { state, controller }),
        h('details', { className: 'mh-card', open: editor || state.deletion || state.authorization?.kind === 'template' ? true : undefined },
        h('summary', null, `可选角色模板（兼容旧组合，${state.config.presets.length}/16）`),
        h('p', { className: 'mh-muted' }, '模板只是可选快捷参考，不限制主 Agent 从全池动态选择，也不规定角色数量。保存组合 ≠ 授权 ≠ 开始运行。'),
        button('新增组合模板', () => controller.edit(), locked || state.config.presets.length >= 16),
        editor && h('form', { className: 'mh-card', onSubmit: e => { e.preventDefault(); void controller.save(); } },
          h('h3', null, editor.originalId === null ? '新增组合' : '编辑组合'),
          editor.conflicted && h('p', { className: 'mh-error', role: 'alert' }, '此草稿基于旧版本，已保留但不能覆盖最新设置。请放弃草稿后重新编辑。'),
          h('fieldset', { disabled: !!state.busy || !state.writable },
            h('label', null, '组合 ID', h('input', { value: editor.value.id, readOnly: editor.originalId !== null, maxLength: 64, required: true, pattern: '[a-z][a-z0-9-]{0,63}', onChange: e => controller.editField('id', e.target.value) })),
            h('label', null, '组合名称', h('input', { value: editor.value.name, maxLength: 80, required: true, onChange: e => controller.editField('name', e.target.value) })),
            h('label', null, h('input', { type: 'checkbox', checked: !!editor.value.reviewer, onChange: e => controller.setReviewer(e.target.checked) }), '包含复核子代理'),
            h('div', { className: 'mh-role-grid' }, ...ROLES.filter(role => editor.value[role]).map(role => h(RoleEditor, { key: role, role, route: editor.value[role], state, controller }))),
            h('p', { className: 'mh-muted' }, '切换渠道或模型会清除旧思考档位。可保存暂不可用的组合记录，但授权前必须重新验证所有角色和档位。'),
            h('div', { className: 'mh-actions' }, h('button', { type: 'submit', disabled: editor.conflicted || !!state.busy }, state.busy === 'save' ? '正在保存…' : '保存组合（不授权）'))),
          button('放弃草稿', () => controller.discard(), !!state.busy)),
        h('section', null, h('h3', null, `已保存组合（${state.config.presets.length}/16）`),
          state.config.presets.length === 0 && h('p', { className: 'mh-muted' }, '尚未保存角色模板；不影响上方模型池，使用模型池不需要任何模板。'),
          ...state.config.presets.map(preset => h('article', { className: 'mh-card', key: preset.id }, h('h3', null, preset.name, state.config.activePresetId === preset.id ? ' · 活动组合' : ''), h('code', null, preset.id),
            ...ROLES.filter(role => preset[role]).map(role => h('p', { key: role }, `${LABELS[role]}：`, h('code', null, routeText(preset[role])), routeIssue(state.catalog, preset[role]) && h('span', { className: 'mh-warning' }, ` — ${routeIssue(state.catalog, preset[role])}`))),
            h('p', { className: 'mh-muted' }, '已配置；未进行真实调用验证。'),
            h('div', { className: 'mh-actions' }, button('编辑', () => controller.edit(preset.id), locked), button(state.config.activePresetId === preset.id ? '取消活动组合' : '设为活动组合', () => { void controller.activate(state.config.activePresetId === preset.id ? '' : preset.id); }, locked), button('授权给新会话', () => { void controller.prepareAuthorization(preset.id); }, locked || !state.nativeAvailable), button('删除', () => controller.requestDelete(preset.id), locked)))))),
        !state.nativeAvailable && h('p', { className: 'mh-warning' }, '原生子代理模型授权设置未就绪或只读，授权按钮不可用。组合保存与此独立。'),
        state.deletion && h('section', { className: 'mh-card mh-confirm', role: 'region', 'aria-label': '确认删除组合' }, h('h3', null, `删除“${state.deletion.preset.name}”？`), h('p', null, '只删除组合记录；原生模型授权不会被撤销。'), h('div', { className: 'mh-actions' }, button('确认删除组合', () => { void controller.confirmDelete(); }, !!state.busy), button('取消删除', () => controller.cancelDelete(), !!state.busy))),
        state.authorization && h('section', { className: 'mh-card mh-confirm', role: 'region', 'aria-label': '确认新会话模型授权' },
          h('h3', null, state.authorization.kind === 'pool' ? '确认授权当前候选池给新会话' : `确认授权“${state.authorization.preset.name}”给新会话`),
          state.authorization.kind === 'pool' && h(React.Fragment, null,
            h('p', null, `本次已保存池的精确候选：${state.authorization.candidates.length} 个（${state.authorization.pool.mode === 'all' ? '全池' : '手选子集'}）。最终确认会重新检查完整集合，新增或消失都会撤销此次确认。`),
            h('ul', { className: 'mh-route-list', 'aria-label': '本次候选完整清单' }, ...state.authorization.candidates.map(route => h('li', { key: keyOf(route) }, h('code', null, `${route.provider} / ${route.model}`))))),
          h('p', null, '将开启原生“允许 Agent 为子智能体选择模型”，保留并合并既有精确路由。启用后全部授权路由如下（包含此前保存但可能未启用的路由）：'),
          h('ul', { className: 'mh-route-list', 'aria-label': '合并后完整原生授权清单' }, ...state.authorization.routes.map(route => h('li', { key: keyOf(route) }, h('code', null, `${route.provider} / ${route.model}`)))),
          h('p', { className: 'mh-muted' }, '授权按 provider/model 生效，不按模板角色或思考档位限制。不会授权以后新发现的其他模型；不会变更旧会话。当前主模型不变，只有想更换时才需手动选择；主 Agent 可按任务动态调用本次批准的子模型。'),
          h('label', null, h('input', { type: 'checkbox', checked: state.authorization.consent, disabled: !!state.busy, onChange: e => controller.consent(e.target.checked) }), '我确认上述完整路由清单，并了解仅新会话生效。'),
          h('div', { className: 'mh-actions' }, button('确认合并原生授权', () => { void controller.confirmAuthorization(); }, !!state.busy || !state.authorization.consent, { className: 'mh-primary' }), button('取消授权', () => controller.cancelAuthorization(), !!state.busy))));
    }
    function apply(ctx) {
      const controller = new ModelHubController(ctx);
      ctx.effect(() => () => controller.dispose(), 'model-hub: controller');
      ctx.effect(() => ctx.configForms.whileServed([NS], () => ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: NS, order: 24, label: () => '统一模型池' }, () => h(Page, { controller })))), 'model-hub: settings page');
      void controller.refreshCatalog();
    }
    return { inject: ['slots', 'remote', 'remote.session', 'configForms'], apply, ModelHubController, Page, PoolPanel, RoleEditor, routeOf, presetOf, poolOf, poolCandidates, poolRows, configOf, catalogOf, routeIssue, unionRoutes, keyOf };
  },
});
