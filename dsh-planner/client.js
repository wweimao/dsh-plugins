window.__ModuleLoader__.load({
  id: '@local/dsh-planner',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    // Kept in sync with exported locale JSON by the source validation check.
    const dictionaries = {"en":{"meta":{"title":"Local planner","description":"Shared memos, lightweight tasks, a month calendar, and a persistent today summary inside DSH. No automatic AI execution."},"title":"Local planner","subtitle":"A small workspace for notes, tasks, and your day.","sharedNote":"Shared in this DSH host, across chats and AI tools. Projects are labels, not private spaces. Notes are not automatically sent to AI.","manualNote":"Dates organize your work; they do not schedule or run AI automatically.","overview":"Overview","calendar":"Calendar","tasks":"Tasks","memos":"Memos","today":"Today","overdue":"Overdue","upcoming":"Coming up","pinned":"Pinned","openPlanner":"Open planner","quickMemo":"Quick memo","newMemo":"New memo","newTask":"New task","newOnDate":"Add task for this day","refresh":"Refresh","loading":"Loading…","saving":"Saving…","save":"Save","saved":"Saved","close":"Close editor","cancel":"Cancel","edit":"Edit item","live":"Live sync","connecting":"Connecting…","offline":"Live sync unavailable · refresh manually","summaryCounts":"Today {today} · overdue {overdue}","summaryEmpty":"No tasks due today. Make room for what matters.","summaryNext":"Next: {title}","timeZone":"Calendar timezone: {zone}","search":"Search","searchPlaceholder":"Search titles, notes, or tags","projectFilter":"Filter by project","allProjects":"All projects","allStatuses":"All statuses","archiveFilter":"Show archived only","archiveHint":"Archived items stay here until you restore them.","emptyList":"Nothing here yet","emptyHint":"Create an item or adjust your filters.","emptySection":"Nothing to show","emptyDay":"No tasks for this day","emptyDayHint":"Choose a date or add a task to start planning.","previous":"Previous","next":"Next","previousMonth":"Previous month","nextMonth":"Next month","pageCount":"{start}–{end} of {total}","loadMore":"Load more","calendarPartial":"Showing {loaded} of {total} tasks this month. Load more to see the rest.","dayCount":"{count} tasks","dayMore":"+{count} more","selectedDay":"Selected day","calendarHelp":"Choose a day to see its tasks. Each date is an all-day date.","weekMon":"Mon","weekTue":"Tue","weekWed":"Wed","weekThu":"Thu","weekFri":"Fri","weekSat":"Sat","weekSun":"Sun","kind":"Type","memo":"Memo","task":"Task","itemTitle":"Title","titlePlaceholder":"What would you like to remember or do?","content":"Notes","contentPlaceholder":"Details, context, or a small next step…","status":"Status","statusTodo":"To do","statusDoing":"In progress","statusBlocked":"Blocked","statusReview":"Review","statusDone":"Done","priority":"Priority","priorityLow":"Low","priorityNormal":"Normal","priorityHigh":"High","dueDate":"Due date","noDate":"No date","project":"Project","projectPlaceholder":"Optional project label","tags":"Tags","tagsPlaceholder":"Separate with commas","tagsHelp":"Up to 12 tags, 40 characters each.","pin":"Pin this item","convertTask":"Convert to task","convertHint":"Choose a date if needed, then save the conversion.","archive":"Archive","restore":"Restore","archived":"Archived","archiveDraftHint":"Save or discard your edits before archiving or restoring.","revision":"Revision {revision}","updated":"Updated {date}","draft":"Unsaved changes","draftKept":"Your draft stays here while the list refreshes.","discardQuestion":"You have unsaved changes. Discard them and continue?","discardContinue":"Discard and continue","keepEditing":"Keep editing","reload":"Reload latest","reloadQuestion":"Reloading replaces your unsaved draft with the latest saved item. Continue?","conflict":"This item changed elsewhere. Your draft is preserved. Copy any text you need, then reload the latest version before editing again.","externalChange":"This item has a newer saved revision. Your draft has not been changed.","saveInterrupted":"The previous request was interrupted. Its result is unknown; refresh and check saved items before retrying.","errorRequest":"Could not complete the request. Please try again.","errorNetwork":"Cannot reach the planner. Check the connection, then refresh.","errorInvalid":"Some fields are invalid. Check the title, date, and field limits.","errorNotFound":"This item no longer exists. Your draft is preserved.","errorStorage":"The result is uncertain. Reload this plugin or restart DSH, then check the saved item before retrying. Do not repeatedly submit the same write.","errorDisposed":"The planner is not active. Refresh the page or check the plugin.","errorTitle":"Enter a title (up to 160 characters).","errorTags":"Use at most 12 tags, with no more than 40 characters per tag.","errorDate":"Choose a valid all-day date.","retry":"Retry","readOnlyArchive":"Archived items can be restored. Restore this item before editing it.","editorHint":"Select an item to edit it, or create a new memo or task.","totalTasks":"Active tasks","totalMemos":"Memos","reviewCount":"Needs review"},"zh":{"meta":{"title":"本地计划本","description":"在 DSH 内共享备忘录、轻量工单与月历，并在聊天中常驻今日摘要。不自动执行 AI。"},"title":"本地计划本","subtitle":"把随手记、待办和每一天放在一起。","sharedNote":"当前 DSH 主机内的聊天与 AI 工具共享这些数据。项目只是标签，不是隐私隔离；备忘录不会自动发送给 AI。","manualNote":"日期仅用于规划，不会创建定时任务或自动执行 AI。","overview":"概览","calendar":"月历","tasks":"工单","memos":"备忘录","today":"今天","overdue":"已逾期","upcoming":"接下来","pinned":"已置顶","openPlanner":"打开计划本","quickMemo":"随手记","newMemo":"新建备忘录","newTask":"新建工单","newOnDate":"添加当天工单","refresh":"刷新","loading":"加载中…","saving":"保存中…","save":"保存","saved":"已保存","close":"关闭编辑器","cancel":"取消","edit":"编辑事项","live":"实时同步","connecting":"正在连接…","offline":"实时同步不可用 · 请手动刷新","summaryCounts":"今日 {today} · 逾期 {overdue}","summaryEmpty":"今天暂无到期工单，给重要的事留一点空间。","summaryNext":"接下来：{title}","timeZone":"月历时区：{zone}","search":"搜索","searchPlaceholder":"搜索标题、正文或标签","projectFilter":"按项目筛选","allProjects":"全部项目","allStatuses":"全部状态","archiveFilter":"仅显示已归档","archiveHint":"归档事项保留在此，随时可以恢复。","emptyList":"这里还没有事项","emptyHint":"新建一项，或调整筛选条件。","emptySection":"暂无事项","emptyDay":"当天暂无工单","emptyDayHint":"选择日期，或新建工单开始安排。","previous":"上一页","next":"下一页","previousMonth":"上个月","nextMonth":"下个月","pageCount":"第 {start}–{end} 项，共 {total} 项","loadMore":"加载更多","calendarPartial":"本月已显示 {loaded} / {total} 个工单，加载更多以查看其余事项。","dayCount":"{count} 个工单","dayMore":"另 {count} 项","selectedDay":"选中日期","calendarHelp":"选择日期查看当天工单；所有日期均为全天日期。","weekMon":"周一","weekTue":"周二","weekWed":"周三","weekThu":"周四","weekFri":"周五","weekSat":"周六","weekSun":"周日","kind":"类型","memo":"备忘录","task":"工单","itemTitle":"标题","titlePlaceholder":"想记住什么，或准备做什么？","content":"正文","contentPlaceholder":"写下细节、背景，或下一步的小行动…","status":"状态","statusTodo":"待办","statusDoing":"进行中","statusBlocked":"受阻","statusReview":"待确认","statusDone":"已完成","priority":"优先级","priorityLow":"低","priorityNormal":"普通","priorityHigh":"高","dueDate":"到期日期","noDate":"未设日期","project":"项目","projectPlaceholder":"可选的项目标签","tags":"标签","tagsPlaceholder":"用逗号分隔","tagsHelp":"最多 12 个标签，每个不超过 40 个字符。","pin":"置顶此事项","convertTask":"转为工单","convertHint":"可设置日期，保存后完成转换。","archive":"归档","restore":"恢复","archived":"已归档","archiveDraftHint":"归档或恢复前，请先保存或放弃当前修改。","revision":"版本 {revision}","updated":"更新于 {date}","draft":"尚未保存","draftKept":"列表刷新时，你的草稿会保留。","discardQuestion":"还有未保存的修改，要放弃这些修改并继续吗？","discardContinue":"放弃修改并继续","keepEditing":"继续编辑","reload":"重新加载最新版本","reloadQuestion":"重新加载会用已保存的最新内容替换当前草稿，是否继续？","conflict":"此事项已被其他页面或 AI 修改，当前草稿已保留。请先复制需要保留的文字，再加载最新版本继续编辑。","externalChange":"此事项已有更新版本，当前草稿未被覆盖。","saveInterrupted":"上一次请求被中断，保存结果尚不确定；请刷新并检查已保存事项后再重试。","errorRequest":"操作未能完成，请重试。","errorNetwork":"无法连接计划本，请检查连接后刷新。","errorInvalid":"部分字段无效，请检查标题、日期和内容长度限制。","errorNotFound":"该事项已不存在，当前草稿仍然保留。","errorStorage":"操作结果尚不确定。请重新加载插件或重启 DSH，再核对事项是否已保存；不要连续重复提交。","errorDisposed":"计划本当前未启用，请刷新页面或检查插件。","errorTitle":"请填写标题，最多 160 个字符。","errorTags":"最多填写 12 个标签，每个不超过 40 个字符。","errorDate":"请选择有效的全天日期。","retry":"重试","readOnlyArchive":"归档事项可以恢复，请先恢复再编辑。","editorHint":"选择事项编辑，或新建一个备忘录、工单。","totalTasks":"未归档工单","totalMemos":"备忘录","reviewCount":"待确认"}};
    const API = { request: 'api/local-planner', events: 'api/local-planner/events' };
    const statuses = { todo: 'statusTodo', doing: 'statusDoing', blocked: 'statusBlocked', review: 'statusReview', done: 'statusDone' };
    const priorities = { low: 'priorityLow', normal: 'priorityNormal', high: 'priorityHigh' };
    const css = `
.dshp-root,.dshp-dock{font:inherit;color:var(--dsw-alias-label-primary);box-sizing:border-box}
.dshp-root *,.dshp-dock *{box-sizing:border-box}
.dshp-root{height:100%;min-height:0;overflow:auto;background:var(--dsw-alias-bg-base);padding:24px;container-type:inline-size}
.dshp-shell{max-width:1320px;margin:0 auto}
.dshp-header,.dshp-row,.dshp-toolbar,.dshp-actions,.dshp-tabs,.dshp-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.dshp-header{justify-content:space-between;margin-bottom:18px;gap:16px}
.dshp-title{font-size:24px;font-weight:650;line-height:1.3;margin:0 0 5px}
.dshp-subtitle,.dshp-muted,.dshp-help{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.6}
.dshp-subtitle{font-size:13px;margin:0}.dshp-help{margin:8px 0}.dshp-muted{margin:0}
.dshp-tabs{gap:4px;padding:4px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;width:fit-content;margin-bottom:18px}
.dshp-button,.dshp-tab{font:inherit;font-size:12px;line-height:1.5;cursor:pointer;border-radius:8px;padding:7px 12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.dshp-button:hover,.dshp-tab:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}
.dshp-button:disabled{cursor:not-allowed;opacity:.5}.dshp-primary{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.dshp-tab{border:0;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);padding:7px 16px}
.dshp-tab[aria-selected=true]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary);font-weight:600}
.dshp-button:focus-visible,.dshp-tab:focus-visible,.dshp-day:focus-visible,.dshp-item:focus-visible,.dshp-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dshp-card{border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1);padding:18px;min-width:0}
.dshp-card h2,.dshp-section-title{font-size:14px;font-weight:600;margin:0 0 12px;line-height:1.5}
.dshp-workspace{display:grid;grid-template-columns:minmax(0,1fr);gap:18px;align-items:start}.dshp-workspace.dshp-has-editor{grid-template-columns:minmax(0,1fr) minmax(290px,360px)}
.dshp-stack{display:grid;gap:16px;min-width:0}.dshp-overview-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.dshp-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:18px}.dshp-stat{padding:14px 16px}.dshp-stat strong{display:block;font-size:26px;line-height:1.4}.dshp-stat span{font-size:12px;color:var(--dsw-alias-label-secondary)}
.dshp-toolbar{justify-content:space-between;margin-bottom:14px}.dshp-toolbar h2{margin:0;font-size:17px}.dshp-filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;align-items:end}
.dshp-field{display:grid;gap:5px;min-width:0;font-size:12px;color:var(--dsw-alias-label-secondary)}.dshp-field.dshp-grow{flex:1;min-width:160px}
.dshp-input{font:inherit;font-size:13px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px 10px;min-width:0;width:100%;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
.dshp-input:disabled{opacity:.65}.dshp-textarea{resize:vertical;min-height:170px;line-height:1.65;white-space:pre-wrap}.dshp-two-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.dshp-check{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--dsw-alias-label-secondary);padding:8px 0}.dshp-check input{accent-color:var(--dsw-alias-brand-primary)}
.dshp-items{display:grid;gap:8px}.dshp-item{display:block;text-align:start;cursor:pointer;width:100%;padding:12px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;min-width:0}
.dshp-item:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}.dshp-item[aria-pressed=true]{border-color:var(--dsw-alias-brand-primary)}
.dshp-item-title{font-size:13px;font-weight:550;line-height:1.5;overflow-wrap:anywhere}.dshp-excerpt{font-size:12px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary);margin:6px 0 0}
.dshp-meta{gap:6px;margin-top:8px;font-size:11px;color:var(--dsw-alias-label-secondary)}.dshp-badge{display:inline-flex;align-items:center;gap:4px;border-radius:5px;padding:2px 6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.4;max-width:100%;overflow-wrap:anywhere}
.dshp-status-doing,.dshp-brand{color:var(--dsw-alias-brand-primary)}.dshp-status-blocked,.dshp-danger{color:var(--dsw-alias-state-error-primary)}.dshp-status-review,.dshp-warn{color:var(--dsw-alias-state-warn-primary)}.dshp-status-done,.dshp-success{color:var(--dsw-alias-state-success-primary)}
.dshp-empty{padding:26px 14px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.7}.dshp-empty strong{display:block;color:var(--dsw-alias-label-primary);font-weight:500;margin-bottom:4px}
.dshp-notice{font-size:12px;line-height:1.65;padding:10px 12px;background:var(--dsw-alias-bg-layer-2);border-radius:8px;overflow-wrap:anywhere;margin:8px 0}.dshp-error{border:1px solid var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.dshp-pagination{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:16px}.dshp-calendar-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,.45fr);gap:16px;align-items:start}
.dshp-calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}.dshp-weekday{text-align:center;padding:6px 0 10px;color:var(--dsw-alias-label-secondary);font-size:11px}
.dshp-day{font:inherit;cursor:pointer;text-align:start;min-height:90px;min-width:0;padding:7px;border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);display:flex;flex-direction:column;gap:5px}
.dshp-day:hover{background:var(--dsw-alias-bg-layer-2)}.dshp-day[aria-pressed=true]{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}.dshp-day-outside{opacity:.45}.dshp-day-number{font-size:12px;line-height:1.5}.dshp-day-today .dshp-day-number{font-weight:700;color:var(--dsw-alias-brand-primary)}
.dshp-day-entry{display:block;max-width:100%;font-size:10px;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-radius:3px;background:var(--dsw-alias-bg-layer-2);padding:1px 3px}.dshp-day-more{font-size:10px;color:var(--dsw-alias-label-secondary)}
.dshp-editor{position:sticky;top:0}.dshp-form-fields{padding:0;border:0;margin:14px 0;display:grid;gap:12px;min-width:0}.dshp-form-fields legend{padding:0}.dshp-footer{margin:18px 0 0;font-size:11px;color:var(--dsw-alias-label-secondary);line-height:1.6}
.dshp-dock{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:10px;margin:4px 0;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.dshp-dock-main{min-width:0;flex:1}.dshp-dock-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px}.dshp-dock-next{display:block;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:3px}.dshp-dock .dshp-button{padding:5px 9px;font-size:11px}
@container (max-width:1000px){.dshp-calendar-layout{grid-template-columns:1fr}.dshp-has-editor .dshp-overview-grid{grid-template-columns:1fr}}
@container (max-width:740px){.dshp-workspace.dshp-has-editor{grid-template-columns:1fr}.dshp-editor{position:static;grid-row:1}.dshp-overview-grid{grid-template-columns:1fr}.dshp-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.dshp-day{min-height:74px;padding:4px}.dshp-tab{padding:7px 11px}}
@media (max-width:600px){.dshp-root{padding:14px}.dshp-card{padding:12px}.dshp-title{font-size:21px}.dshp-day-entry{font-size:9px}.dshp-two-fields{grid-template-columns:1fr}}
`;

    function Icon(props) {
      return h('svg', { viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, ...props },
        h('rect', { x: 3, y: 4, width: 18, height: 17, rx: 3 }), h('path', { d: 'M7 2v4m10-4v4M3 9h18M7 13h3m-3 4h3m4-4h3m-3 4h3' }));
    }
    function pad(n) { return String(n).padStart(2, '0'); }
    function dateKey(d) { return `${String(d.getFullYear()).padStart(4, '0')}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
    function civilDate(key) {
      const parts = key.split('-').map(Number);
      const d = new Date(2000, parts[1] - 1, parts[2] || 1, 12);
      d.setFullYear(parts[0]);
      return d;
    }
    function validDay(key) { return /^\d{4}-\d{2}-\d{2}$/.test(key) && Number(key.slice(0, 4)) > 0 && dateKey(civilDate(key)) === key; }
    function shiftMonth(month, by) {
      const d = civilDate(`${month}-01`);
      d.setMonth(d.getMonth() + by);
      return dateKey(d).slice(0, 7);
    }
    function monthDays(month) {
      const d = civilDate(`${month}-01`);
      d.setDate(d.getDate() - (d.getDay() + 6) % 7);
      return Array.from({ length: 42 }, () => { const key = dateKey(d); d.setDate(d.getDate() + 1); return key; });
    }
    function draftOf(item) {
      return { kind: item.kind, title: item.title, content: item.content || '', status: item.status, priority: item.priority, dueDate: item.dueDate || '', project: item.project || '', tagsText: (item.tags || []).join(', '), pinned: Boolean(item.pinned) };
    }
    function freshEditor(kind, dueDate) {
      const draft = draftOf({ kind, title: '', status: 'todo', priority: 'normal', dueDate: kind === 'task' ? dueDate : '' });
      return { id: null, record: null, draft, baseline: JSON.stringify(draft), error: null, loading: false, saving: false };
    }
    function itemEditor(item) { const draft = draftOf(item); return { id: item.id, record: item, draft, baseline: JSON.stringify(draft), error: null, loading: false, saving: false }; }
    function dirty(editor) { return Boolean(editor && editor.draft && JSON.stringify(editor.draft) !== editor.baseline); }
    function inputItem(draft) {
      const tags = [...new Set(draft.tagsText.split(/[,，\n]/).map(v => v.trim()).filter(Boolean))];
      if (!draft.title.trim() || draft.title.trim().length > 160) throw { code: 'title' };
      if (tags.length > 12 || tags.some(tag => tag.length > 40)) throw { code: 'tags' };
      if (draft.kind === 'task' && draft.dueDate && !validDay(draft.dueDate)) throw { code: 'date' };
      return { kind: draft.kind, title: draft.title.trim(), content: draft.content, status: draft.status, priority: draft.priority, dueDate: draft.kind === 'task' ? draft.dueDate || null : null, project: draft.project.trim(), tags, pinned: draft.pinned };
    }

    // All wire behavior lives here; views only use request(), watch(), and invalidate().
    function createTransport() {
      async function request(body, signal) {
        let response;
        try { response = await fetch(API.request, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal }); }
        catch (error) { if (error.name === 'AbortError') throw error; throw { code: 'network' }; }
        let result;
        try { result = await response.json(); } catch (_) { throw { code: 'network' }; }
        if (!result || !result.ok || !response.ok) throw result && result.error ? result.error : { code: 'network' };
        return result.value;
      }
      function watch(onChange, onStatus) {
        let stream = null;
        const changed = () => onChange();
        const visible = () => { if (document.visibilityState === 'visible') onChange(); };
        const opened = () => { onStatus('live'); onChange(); };
        const failed = () => onStatus('offline');
        onStatus('connecting');
        try {
          stream = new EventSource(API.events);
          stream.addEventListener('change', changed);
          stream.addEventListener('open', opened);
          stream.addEventListener('error', failed);
        } catch (_) { onStatus('offline'); }
        document.addEventListener('visibilitychange', visible);
        return () => {
          document.removeEventListener('visibilitychange', visible);
          if (stream) { stream.removeEventListener('change', changed); stream.removeEventListener('open', opened); stream.removeEventListener('error', failed); stream.close(); }
        };
      }
      return { request, watch };
    }

    return {
      inject: ['slots', 'locale', 'layout'],
      apply(ctx) {
        const ns = 'local_planner';
        Object.entries(dictionaries).forEach(([lang, dictionary]) => {
          const { meta, ...labels } = dictionary;
          ctx.locale.register(ns, lang, { ...labels, 'meta.title': meta.title, 'meta.description': meta.description });
        });
        const translate = ctx.locale.bind(ns);
        const transport = createTransport();
        const listeners = new Set();
        let version = 0, liveStatus = 'connecting', stopWatch = null, disposed = false;
        const runtime = { editor: null, view: null, navigation: null, navigationVersion: 0 };
        const snapshot = () => ({ version, liveStatus, navigationVersion: runtime.navigationVersion });
        const notify = () => { for (const listener of listeners) listener(snapshot()); };
        const invalidate = () => { if (!disposed) { version++; notify(); } };
        const subscribe = (listener) => {
          listeners.add(listener);
          if (!stopWatch && !disposed) stopWatch = transport.watch(invalidate, status => { liveStatus = status; notify(); });
          listener(snapshot());
          return () => { listeners.delete(listener); if (!listeners.size && stopWatch) { stopWatch(); stopWatch = null; } };
        };
        ctx.effect(() => () => { disposed = true; if (stopWatch) stopWatch(); stopWatch = null; listeners.clear(); runtime.editor = null; });
        function openPlanner(action) {
          if (action) { runtime.navigation = action; runtime.navigationVersion++; notify(); }
          ctx.layout.selectPanel('local-planner');
        }
        function useLocale() {
          const [, changed] = React.useState(0);
          React.useEffect(() => ctx.locale.subscribe(() => changed(v => v + 1)), []);
          const localeId = ctx.locale.getSnapshot().active;
          const lang = String(localeId || 'en').startsWith('zh') ? 'zh-CN' : 'en';
          const t = (key, values) => {
            let text = String(translate(key));
            if (values) text = text.replace(/\{(\w+)\}/g, (whole, name) => Object.hasOwn(values, name) ? String(values[name]) : whole);
            return text;
          };
          return { t, lang };
        }
        function useLive() { const [state, setState] = React.useState(snapshot); React.useEffect(() => subscribe(setState), []); return state; }
        function useResource(body, revision) {
          const key = body ? JSON.stringify(body) : '';
          const [state, setState] = React.useState({ key: '', value: null, error: null, pending: false });
          const epoch = React.useRef(0);
          React.useEffect(() => {
            const ticket = ++epoch.current;
            if (!key) { setState({ key, value: null, error: null, pending: false }); return; }
            const controller = new AbortController();
            setState(old => ({ key, value: old.key === key ? old.value : null, error: null, pending: true }));
            transport.request(JSON.parse(key), controller.signal).then(value => {
              if (ticket === epoch.current && !controller.signal.aborted) setState({ key, value, error: null, pending: false });
            }).catch(error => {
              if (ticket === epoch.current && !controller.signal.aborted) setState(old => ({ ...old, key, error, pending: false }));
            });
            return () => { epoch.current++; controller.abort(); };
          }, [key, revision]);
          return state.key === key ? state : { key, value: null, error: null, pending: Boolean(key) };
        }
        function useDebounced(value) {
          const [debounced, setDebounced] = React.useState(value);
          React.useEffect(() => { const timer = setTimeout(() => setDebounced(value), 250); return () => clearTimeout(timer); }, [value]);
          return debounced;
        }
        function errorText(error, t) {
          return t(({ conflict: 'conflict', invalid_input: 'errorInvalid', not_found: 'errorNotFound', storage_error: 'errorStorage', disposed: 'errorDisposed', network: 'errorNetwork', title: 'errorTitle', tags: 'errorTags', date: 'errorDate', interrupted: 'saveInterrupted' })[error && error.code] || 'errorRequest');
        }
        function Button({ children, primary, ...props }) { return h('button', { type: 'button', className: `dshp-button${primary ? ' dshp-primary' : ''}`, ...props }, children); }
        function ErrorBox({ error, t, retry }) {
          return error ? h('div', { className: 'dshp-notice dshp-error', role: 'alert' }, h('div', null, errorText(error, t)), retry && h(Button, { onClick: retry }, t('retry'))) : null;
        }
        function Empty({ title, detail }) { return h('div', { className: 'dshp-empty' }, h('strong', null, title), detail); }
        function ItemRow({ item, t, today, selected, onOpen }) {
          return h('button', { type: 'button', className: 'dshp-item', 'aria-pressed': selected === item.id, onClick: () => onOpen({ type: 'item', id: item.id }) },
            h('div', { className: 'dshp-item-title' }, item.title),
            item.excerpt && h('p', { className: 'dshp-excerpt' }, item.excerpt),
            h('div', { className: 'dshp-meta' },
              item.kind === 'task' && h('span', { className: `dshp-badge dshp-status-${item.status}` }, t(statuses[item.status])),
              item.dueDate && h('span', { className: item.dueDate < today && item.status !== 'done' ? 'dshp-danger' : '' }, item.dueDate),
              item.priority === 'high' && h('span', { className: 'dshp-badge dshp-warn' }, t('priorityHigh')),
              item.pinned && h('span', { className: 'dshp-badge dshp-brand' }, t('pinned')),
              item.archived && h('span', { className: 'dshp-badge' }, t('archived')),
              item.project && h('span', null, item.project),
              ...(item.tags || []).map(tag => h('span', { key: tag, className: 'dshp-badge' }, tag))));
        }
        function ItemList({ items, ...props }) { return h('div', { className: 'dshp-items' }, items.map(item => h(ItemRow, { key: item.id, item, ...props }))); }
        function Dock() {
          const { t } = useLocale();
          const live = useLive();
          const result = useResource({ action: 'summary' }, live.version);
          const summary = result.value;
          const next = summary && (summary.todayItems[0] || summary.overdueItems[0] || summary.upcomingItems[0]);
          return h('section', { className: 'dshp-dock', 'aria-label': t('title') }, h('style', null, css),
            h('div', { className: 'dshp-dock-main' },
              h('div', { className: 'dshp-dock-top' }, h(Icon, { width: 16, height: 16 }), h('strong', null, t('today')),
                summary ? h('span', null, t('summaryCounts', summary.counts)) : result.pending ? h('span', null, t('loading')) : null),
              result.error ? h('div', { className: 'dshp-dock-next dshp-danger', role: 'alert' }, errorText(result.error, t)) : summary && h('span', { className: 'dshp-dock-next', title: next && next.title }, next ? t('summaryNext', { title: next.title }) : t('summaryEmpty')),
              live.liveStatus !== 'live' && h('span', { className: 'dshp-dock-next' }, t(live.liveStatus))),
            h('div', { className: 'dshp-actions' }, h(Button, { onClick: invalidate, disabled: result.pending, 'aria-label': t('refresh') }, t('refresh')),
              h(Button, { onClick: () => openPlanner({ type: 'new', kind: 'memo' }) }, t('quickMemo')),
              h(Button, { primary: true, onClick: () => openPlanner() }, t('openPlanner'))));
        }
        function Panel() {
          const { t, lang } = useLocale();
          const live = useLive();
          const prior = runtime.view || {};
          const [tab, setTab] = React.useState(prior.tab || 'overview');
          const [month, setMonth] = React.useState(prior.month || '');
          const [selectedDay, setSelectedDay] = React.useState(prior.selectedDay || '');
          const [filters, setFilters] = React.useState({ query: '', project: '', status: '', archived: false });
          const [offset, setOffset] = React.useState(0);
          const [editor, updateEditor] = React.useState(runtime.editor);
          const editorRef = React.useRef(editor);
          const editorEpoch = React.useRef(0);
          const editorController = React.useRef(null);
          const [pendingAction, setPendingAction] = React.useState(null);
          const [calendarExtra, setCalendarExtra] = React.useState({ key: '', items: [], error: null, pending: false });
          const extraEpoch = React.useRef(0), extraController = React.useRef(null);
          const query = useDebounced(filters.query), project = useDebounced(filters.project);
          const summaryResult = useResource({ action: 'summary' }, live.version);
          const summary = summaryResult.value;
          const today = summary && summary.today;
          const isList = tab === 'tasks' || tab === 'memos';
          const listResult = useResource(isList ? { action: 'list', kind: tab === 'tasks' ? 'task' : 'memo', query, ...(project.trim() ? { project: project.trim() } : {}), ...(tab === 'tasks' && filters.status ? { status: filters.status } : {}), archived: filters.archived, offset, limit: 50 } : null, live.version);
          const calendarResult = useResource(tab === 'calendar' && month ? { action: 'list', kind: 'task', month, limit: 200, offset: 0 } : null, live.version);
          const calendarKey = `${month}:${live.version}`;
          const calendarItems = calendarResult.value ? [...calendarResult.value.items, ...(calendarExtra.key === calendarKey ? calendarExtra.items : [])] : [];
          const calendarTotal = calendarResult.value ? calendarResult.value.total : 0;
          const setEditor = next => { editorRef.current = next; runtime.editor = next; updateEditor(next); };
          React.useEffect(() => { runtime.view = { tab, month, selectedDay }; }, [tab, month, selectedDay]);
          React.useEffect(() => { if (today) { if (!month) setMonth(today.slice(0, 7)); if (!selectedDay) setSelectedDay(today); } }, [today, month, selectedDay]);
          React.useEffect(() => {
            extraEpoch.current++;
            if (extraController.current) extraController.current.abort();
            setCalendarExtra({ key: calendarKey, items: [], error: null, pending: false });
          }, [calendarKey, tab]);
          React.useEffect(() => {
            const beforeUnload = event => { if (dirty(editorRef.current) || editorRef.current && editorRef.current.saving) { event.preventDefault(); event.returnValue = ''; } };
            window.addEventListener('beforeunload', beforeUnload);
            return () => {
              window.removeEventListener('beforeunload', beforeUnload);
              editorEpoch.current++;
              if (editorController.current) editorController.current.abort();
              extraEpoch.current++;
              if (extraController.current) extraController.current.abort();
              const current = editorRef.current;
              if (current && (current.saving || current.loading)) runtime.editor = { ...current, loading: false, saving: false, error: current.saving ? { code: 'interrupted' } : current.error || { code: 'network' } };
            };
          }, []);
          function abortEditor() { editorEpoch.current++; if (editorController.current) editorController.current.abort(); }
          function loadItem(id, reload) {
            abortEditor();
            const ticket = editorEpoch.current;
            const controller = new AbortController(); editorController.current = controller;
            const base = reload && editorRef.current ? editorRef.current : { id, record: null, draft: null, baseline: '' };
            setEditor({ ...base, loading: true, saving: false, error: null, saved: false });
            transport.request({ action: 'get', id }, controller.signal).then(item => {
              if (ticket === editorEpoch.current && !controller.signal.aborted) setEditor(itemEditor(item));
            }).catch(error => { if (ticket === editorEpoch.current && !controller.signal.aborted) setEditor({ ...base, error, loading: false, saving: false }); });
          }
          function perform(action) {
            setPendingAction(null);
            if (action.type === 'item' || action.type === 'reload') loadItem(action.id, action.type === 'reload');
            else { abortEditor(); setEditor(action.type === 'close' ? null : freshEditor(action.kind, action.dueDate || '')); }
          }
          function requestOpen(action) {
            const current = editorRef.current;
            if (current && current.saving) return;
            if (action.type === 'item' && current && current.id === action.id) return;
            if (dirty(current)) setPendingAction(action); else perform(action);
          }
          React.useEffect(() => { const action = runtime.navigation; if (action) { runtime.navigation = null; requestOpen(action); } }, [live.navigationVersion]);
          function changeDraft(key, value) {
            const current = editorRef.current;
            if (!current || current.saving || current.loading) return;
            setEditor({ ...current, draft: { ...current.draft, [key]: value }, saved: false, error: current.error && current.error.code === 'conflict' ? current.error : null });
          }
          function persist(archive) {
            const current = editorRef.current;
            if (!current || !current.draft || current.loading || current.saving || pendingAction || current.error && current.error.code === 'conflict') return;
            let request;
            try {
              if (typeof archive === 'boolean') {
                if (!current.record || dirty(current)) return;
                request = { action: 'update', id: current.id, expectedRevision: current.record.revision, patch: { archived: archive } };
              } else {
                const item = inputItem(current.draft);
                if (current.record) {
                  const patch = {};
                  Object.entries(item).forEach(([key, value]) => { if (JSON.stringify(value) !== JSON.stringify(current.record[key])) patch[key] = value; });
                  if (!Object.keys(patch).length) { setEditor({ ...itemEditor(current.record), saved: true }); return; }
                  request = { action: 'update', id: current.id, expectedRevision: current.record.revision, patch };
                } else request = { action: 'create', item };
              }
            } catch (error) { setEditor({ ...current, error }); return; }
            abortEditor();
            const ticket = editorEpoch.current;
            const controller = new AbortController(); editorController.current = controller;
            setEditor({ ...current, saving: true, error: null, saved: false });
            transport.request(request, controller.signal).then(item => {
              invalidate();
              if (ticket === editorEpoch.current && !controller.signal.aborted) setEditor({ ...itemEditor(item), saved: true });
            }).catch(error => { if (ticket === editorEpoch.current && !controller.signal.aborted) setEditor({ ...current, saving: false, error: error.code === 'network' ? { code: 'interrupted' } : error, saved: false }); });
          }
          async function loadMoreCalendar() {
            if (calendarExtra.pending || calendarResult.pending || calendarItems.length >= calendarTotal) return;
            const ticket = ++extraEpoch.current;
            const controller = new AbortController(); extraController.current = controller;
            const existing = calendarExtra.key === calendarKey ? calendarExtra.items : [];
            setCalendarExtra({ key: calendarKey, items: existing, pending: true, error: null });
            try {
              const value = await transport.request({ action: 'list', kind: 'task', month, limit: 200, offset: calendarItems.length }, controller.signal);
              if (ticket === extraEpoch.current && !controller.signal.aborted) {
                const seen = new Set(calendarResult.value.items.map(item => item.id));
                const items = [...existing, ...value.items].filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true; });
                setCalendarExtra({ key: calendarKey, items, pending: false, error: null });
              }
            } catch (error) { if (ticket === extraEpoch.current && !controller.signal.aborted) setCalendarExtra({ key: calendarKey, items: existing, pending: false, error }); }
          }
          const listProps = { t, today: today || '', selected: editor && editor.id, onOpen: requestOpen };
          const currentItems = [...(listResult.value ? listResult.value.items : []), ...calendarItems, ...(summary ? [...summary.todayItems, ...summary.overdueItems, ...summary.upcomingItems, ...summary.pinnedItems] : [])];
          const newer = editor && editor.record && currentItems.some(item => item.id === editor.id && item.revision > editor.record.revision);
          const formatDay = day => new Intl.DateTimeFormat(lang, { month: 'long', day: 'numeric', weekday: 'long' }).format(civilDate(day));
          function section(title, items) { return h('section', { className: 'dshp-card', key: title }, h('h2', null, t(title)), items.length ? h(ItemList, { items, ...listProps }) : h(Empty, { title: t('emptySection') })); }
          function overview() {
            return h('div', { className: 'dshp-stack' },
              h(ErrorBox, { error: summaryResult.error, t, retry: invalidate }),
              summaryResult.pending && !summary && h('p', { className: 'dshp-muted', role: 'status' }, t('loading')),
              summary && h(React.Fragment, null,
                h('div', { className: 'dshp-stats' }, [['today', summary.counts.today], ['overdue', summary.counts.overdue], ['reviewCount', summary.counts.review], ['totalMemos', summary.counts.memos]].map(([label, count]) => h('div', { className: 'dshp-card dshp-stat', key: label }, h('strong', { className: label === 'overdue' && count ? 'dshp-danger' : '' }, count), h('span', null, t(label))))),
                h('div', { className: 'dshp-overview-grid' }, section('today', summary.todayItems), section('overdue', summary.overdueItems), section('upcoming', summary.upcomingItems), section('pinned', summary.pinnedItems))));
          }
          function calendar() {
            const cells = month ? monthDays(month) : [];
            const itemsByDay = new Map();
            calendarItems.forEach(item => { const group = itemsByDay.get(item.dueDate) || []; group.push(item); itemsByDay.set(item.dueDate, group); });
            return h('div', { className: 'dshp-calendar-layout' },
              h('section', { className: 'dshp-card' },
                h('div', { className: 'dshp-toolbar' }, h('h2', null, month ? new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'long' }).format(civilDate(`${month}-01`)) : t('calendar')),
                  h('div', { className: 'dshp-actions' },
                    h(Button, { disabled: !month, 'aria-label': t('previousMonth'), onClick: () => { const next = shiftMonth(month, -1); setMonth(next); setSelectedDay(`${next}-01`); } }, '‹'),
                    h(Button, { disabled: !today, onClick: () => { setMonth(today.slice(0, 7)); setSelectedDay(today); } }, t('today')),
                    h(Button, { disabled: !month, 'aria-label': t('nextMonth'), onClick: () => { const next = shiftMonth(month, 1); setMonth(next); setSelectedDay(`${next}-01`); } }, '›'))),
                h(ErrorBox, { error: calendarResult.error || summaryResult.error, t, retry: invalidate }),
                calendarResult.pending && h('p', { className: 'dshp-help', role: 'status' }, t('loading')),
                h('div', { className: 'dshp-calendar-grid', 'aria-label': t('calendar') },
                  ['weekMon', 'weekTue', 'weekWed', 'weekThu', 'weekFri', 'weekSat', 'weekSun'].map(day => h('div', { className: 'dshp-weekday', key: day }, t(day))),
                  cells.map(day => {
                    const items = itemsByDay.get(day) || [], outside = !day.startsWith(month);
                    return h('button', { key: day, type: 'button', className: `dshp-day${outside ? ' dshp-day-outside' : ''}${day === today ? ' dshp-day-today' : ''}`, 'aria-pressed': day === selectedDay, 'aria-current': day === today ? 'date' : undefined, 'aria-label': `${formatDay(day)}, ${t('dayCount', { count: items.length })}`, onClick: () => { setSelectedDay(day); if (outside) setMonth(day.slice(0, 7)); } },
                      h('span', { className: 'dshp-day-number' }, Number(day.slice(-2))),
                      ...items.slice(0, 2).map(item => h('span', { key: item.id, className: `dshp-day-entry dshp-status-${item.status}`, title: item.title }, item.title)),
                      items.length > 2 && h('span', { className: 'dshp-day-more' }, t('dayMore', { count: items.length - 2 })));
                  })),
                h('p', { className: 'dshp-help' }, t('calendarHelp')),
                calendarItems.length < calendarTotal && h('div', { className: 'dshp-notice' }, h('p', null, t('calendarPartial', { loaded: calendarItems.length, total: calendarTotal })),
                  h(Button, { onClick: loadMoreCalendar, disabled: calendarExtra.pending || calendarResult.pending }, t(calendarExtra.pending ? 'loading' : 'loadMore'))),
                h(ErrorBox, { error: calendarExtra.key === calendarKey && calendarExtra.error, t, retry: loadMoreCalendar })),
              h('section', { className: 'dshp-card' }, h('p', { className: 'dshp-help' }, t('selectedDay')), h('h2', null, selectedDay ? formatDay(selectedDay) : t('today')),
                h(Button, { primary: true, disabled: !selectedDay, onClick: () => requestOpen({ type: 'new', kind: 'task', dueDate: selectedDay }) }, t('newOnDate')),
                h('div', { className: 'dshp-help' }),
                calendarResult.pending && !calendarResult.value ? h('p', { className: 'dshp-help', role: 'status' }, t('loading')) : (itemsByDay.get(selectedDay) || []).length ? h(ItemList, { items: itemsByDay.get(selectedDay), ...listProps }) : calendarItems.length < calendarTotal ? h('p', { className: 'dshp-notice' }, t('calendarPartial', { loaded: calendarItems.length, total: calendarTotal })) : !calendarResult.error && calendarResult.value ? h(Empty, { title: t('emptyDay'), detail: t('emptyDayHint') }) : null));
          }
          function filterChange(key, value) { setFilters(old => ({ ...old, [key]: value })); setOffset(0); }
          function listing() {
            const data = listResult.value;
            return h('section', { className: 'dshp-card' },
              h('div', { className: 'dshp-toolbar' }, h('h2', null, t(tab)), h(Button, { primary: true, onClick: () => requestOpen({ type: 'new', kind: tab === 'tasks' ? 'task' : 'memo' }) }, t(tab === 'tasks' ? 'newTask' : 'newMemo'))),
              h('div', { className: 'dshp-filters' },
                h('label', { className: 'dshp-field dshp-grow' }, t('search'), h('input', { className: 'dshp-input', type: 'search', maxLength: 200, value: filters.query, placeholder: t('searchPlaceholder'), onChange: event => filterChange('query', event.target.value) })),
                h('label', { className: 'dshp-field' }, t('projectFilter'), h('input', { className: 'dshp-input', maxLength: 120, value: filters.project, placeholder: t('allProjects'), onChange: event => filterChange('project', event.target.value) })),
                tab === 'tasks' && h('label', { className: 'dshp-field' }, t('status'), h('select', { className: 'dshp-input', value: filters.status, onChange: event => filterChange('status', event.target.value) }, h('option', { value: '' }, t('allStatuses')), Object.entries(statuses).map(([value, label]) => h('option', { key: value, value }, t(label))))),
                h('label', { className: 'dshp-check' }, h('input', { type: 'checkbox', checked: filters.archived, onChange: event => filterChange('archived', event.target.checked) }), t('archiveFilter'))),
              filters.archived && h('p', { className: 'dshp-help' }, t('archiveHint')),
              h(ErrorBox, { error: listResult.error, t, retry: invalidate }),
              listResult.pending && h('p', { className: 'dshp-help', role: 'status' }, t('loading')),
              data && (data.items.length ? h(ItemList, { items: data.items, ...listProps }) : h(Empty, { title: t('emptyList'), detail: t('emptyHint') })),
              data && h('div', { className: 'dshp-pagination' }, h('span', { className: 'dshp-muted' }, t('pageCount', { start: data.items.length ? offset + 1 : 0, end: offset + data.items.length, total: data.total })),
                h('div', { className: 'dshp-actions' }, h(Button, { disabled: offset === 0 || listResult.pending, onClick: () => setOffset(Math.max(0, offset - 50)) }, t('previous')), h(Button, { disabled: offset + 50 >= data.total || listResult.pending, onClick: () => setOffset(offset + 50) }, t('next')))));
          }
          function editorView() {
            if (!editor) return null;
            const draft = editor.draft, archived = editor.record && editor.record.archived, isDirty = dirty(editor);
            const field = (label, input) => h('label', { className: 'dshp-field' }, t(label), input);
            const textInput = (name, props) => h('input', { className: 'dshp-input', value: draft[name], onChange: event => changeDraft(name, event.target.value), ...props });
            return h('aside', { className: 'dshp-card dshp-editor', 'aria-label': t(editor.record ? 'edit' : draft && draft.kind === 'task' ? 'newTask' : 'newMemo') },
              h('div', { className: 'dshp-toolbar' }, h('h2', null, t(editor.record ? 'edit' : draft && draft.kind === 'task' ? 'newTask' : 'newMemo')), h(Button, { disabled: editor.saving, onClick: () => requestOpen({ type: 'close' }) }, t('close'))),
              pendingAction && h('div', { className: 'dshp-notice', role: 'alert' }, h('p', null, t(pendingAction.type === 'reload' ? 'reloadQuestion' : 'discardQuestion')), h('div', { className: 'dshp-actions' }, h(Button, { onClick: () => perform(pendingAction) }, t('discardContinue')), h(Button, { primary: true, onClick: () => setPendingAction(null) }, t('keepEditing')))),
              h(ErrorBox, { error: editor.error, t, retry: !draft && editor.id ? () => loadItem(editor.id, false) : null }),
              editor.loading && h('p', { className: 'dshp-help', role: 'status' }, t('loading')),
              newer && !editor.error && h('div', { className: 'dshp-notice', role: 'status' }, t('externalChange')),
              editor.saved && h('p', { className: 'dshp-help dshp-success', role: 'status' }, t('saved')),
              draft && h('form', { onSubmit: event => { event.preventDefault(); persist(); } },
                archived && h('p', { className: 'dshp-notice' }, t('readOnlyArchive')),
                h('fieldset', { className: 'dshp-form-fields', disabled: editor.loading || editor.saving || archived || Boolean(pendingAction) },
                  h('div', { className: 'dshp-row' }, h('span', { className: 'dshp-badge' }, t(draft.kind)), isDirty && h('span', { className: 'dshp-badge dshp-warn' }, t('draft'))),
                  field('itemTitle', textInput('title', { maxLength: 160, required: true, placeholder: t('titlePlaceholder') })),
                  field('content', h('textarea', { className: 'dshp-input dshp-textarea', maxLength: 20000, value: draft.content, placeholder: t('contentPlaceholder'), onChange: event => changeDraft('content', event.target.value) })),
                  draft.kind === 'task' && h('div', { className: 'dshp-two-fields' },
                    field('status', h('select', { className: 'dshp-input', value: draft.status, onChange: event => changeDraft('status', event.target.value) }, Object.entries(statuses).map(([value, label]) => h('option', { key: value, value }, t(label))))),
                    field('dueDate', textInput('dueDate', { type: 'date', min: '0001-01-01', max: '9999-12-31' }))),
                  h('div', { className: 'dshp-two-fields' },
                    field('priority', h('select', { className: 'dshp-input', value: draft.priority, onChange: event => changeDraft('priority', event.target.value) }, Object.entries(priorities).map(([value, label]) => h('option', { key: value, value }, t(label))))),
                    field('project', textInput('project', { maxLength: 120, placeholder: t('projectPlaceholder') }))),
                  field('tags', textInput('tagsText', { maxLength: 510, placeholder: t('tagsPlaceholder') })),
                  h('p', { className: 'dshp-muted' }, t('tagsHelp')),
                  h('label', { className: 'dshp-check' }, h('input', { type: 'checkbox', checked: draft.pinned, onChange: event => changeDraft('pinned', event.target.checked) }), t('pin')),
                  draft.kind === 'memo' && h(Button, { onClick: () => { const current = editorRef.current; setEditor({ ...current, draft: { ...current.draft, kind: 'task', status: 'todo', dueDate: '' }, saved: false }); } }, t('convertTask'))),
                draft.kind === 'task' && editor.record && editor.record.kind === 'memo' && h('p', { className: 'dshp-help' }, t('convertHint')),
                isDirty && h('p', { className: 'dshp-help' }, t('draftKept')),
                h('div', { className: 'dshp-actions' }, !archived && h(Button, { type: 'submit', primary: true, disabled: editor.saving || editor.loading || Boolean(pendingAction) || editor.error && editor.error.code === 'conflict' || Boolean(editor.record) && !isDirty }, t(editor.saving ? 'saving' : 'save')),
                  editor.record && h(Button, { disabled: editor.saving || editor.loading || isDirty || Boolean(pendingAction) || editor.error && editor.error.code === 'conflict', title: isDirty ? t('archiveDraftHint') : undefined, onClick: () => persist(!archived) }, t(archived ? 'restore' : 'archive')),
                  editor.id && h(Button, { disabled: editor.saving || editor.loading, onClick: () => requestOpen({ type: 'reload', id: editor.id }) }, t('reload'))),
                editor.record && h('p', { className: 'dshp-help' }, t('revision', { revision: editor.record.revision }), ' · ', t('updated', { date: new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short', ...(summary && summary.timeZone ? { timeZone: summary.timeZone } : {}) }).format(new Date(editor.record.updatedAt)) }))));
          }
          return h('main', { className: 'dshp-root', 'aria-label': t('title') }, h('style', null, css), h('div', { className: 'dshp-shell' },
            h('header', { className: 'dshp-header' }, h('div', null, h('h1', { className: 'dshp-title' }, t('title')), h('p', { className: 'dshp-subtitle' }, t('subtitle'))),
              h('div', { className: 'dshp-actions' }, h('span', { className: `dshp-muted${live.liveStatus === 'live' ? ' dshp-success' : ''}`, role: 'status' }, t(live.liveStatus)), h(Button, { onClick: invalidate }, t('refresh')), h(Button, { primary: true, onClick: () => requestOpen({ type: 'new', kind: 'memo' }) }, t('newMemo')), h(Button, { onClick: () => requestOpen({ type: 'new', kind: 'task' }) }, t('newTask')))),
            h('nav', { className: 'dshp-tabs', role: 'tablist', 'aria-label': t('title') }, ['overview', 'calendar', 'tasks', 'memos'].map(value => h('button', { type: 'button', role: 'tab', className: 'dshp-tab', key: value, 'aria-selected': tab === value, onClick: () => { setTab(value); setOffset(0); } }, t(value)))),
            isList && h(ErrorBox, { error: summaryResult.error, t, retry: invalidate }),
            h('div', { className: `dshp-workspace${editor ? ' dshp-has-editor' : ''}` }, h('div', { className: 'dshp-stack', role: 'tabpanel', 'aria-label': t(tab) }, tab === 'overview' ? overview() : tab === 'calendar' ? calendar() : listing()), editorView()),
            h('footer', { className: 'dshp-footer' }, h('div', null, t('sharedNote')), h('div', null, t('manualNote')), summary && h('div', null, t('timeZone', { zone: summary.timeZone })))));
        }
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'local-planner' }, Panel));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'local-planner', label: () => translate('title'), order: 20 }, () => h(Icon)));
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({ name: 'conversation.composer.dock', id: 'local-planner-summary', order: 5 }, Dock));
      },
    };
  },
});
