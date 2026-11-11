window.__ModuleLoader__.load({
  id: '@local/dsh-named-ssh',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'namedSsh';
    const FINGERPRINT = /^SHA256:[A-Za-z0-9+/]{43}$/;
    const ALIAS = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/;
    const ERROR_CODES = new Set(['INVALID_INPUT', 'NOT_FOUND', 'DISABLED', 'HOST_KEY_MISMATCH', 'AUTH_FAILED', 'CONNECT_FAILED', 'TIMEOUT', 'ABORTED', 'STORE_FAILED', 'CONFLICT', 'INTERNAL', 'BUSY', 'APPROVAL_REQUIRED', 'FORBIDDEN']);
    const en = {
      title: 'SSH servers',
      intro: 'Save a connection here, then give the agent its alias. SSH tools work alongside your existing local tools.',
      securityTitle: 'Credentials stay out of chat',
      securityNote: 'Enter passwords and private keys only here. They are saved in the local Harness credential store, not in tool arguments or connection results. This is not strong isolation from local tools or code running as your local account. Use dedicated, low-privilege SSH accounts.',
      add: 'Add server', refresh: 'Refresh', loading: 'Loading servers…', retry: 'Retry',
      empty: 'No SSH servers yet', emptyHint: 'Add a server and independently verify its host key before saving credentials.',
      editTitle: 'Edit server', addTitle: 'Add SSH server', edit: 'Edit', test: 'Test connection', remove: 'Delete',
      confirmRemove: 'Delete saved server “{alias}” and its credentials?', deleteNow: 'Delete server', cancel: 'Cancel',
      enabled: 'Agent access enabled', disabled: 'Agent access disabled', stored: 'Credential saved',
      alias: 'Alias', aliasHint: '1–48 letters, numbers, hyphens or underscores; begin with a letter or number. Agents use this name. It cannot be changed after saving.',
      label: 'Display name', labelPlaceholder: 'Optional friendly name', host: 'Host', hostHint: 'Hostname or IP address only; no URL, username or port.',
      port: 'Port', username: 'Username', cwd: 'Working directory', cwdHint: 'Absolute remote path. Defaults to /. Connection tests do not check this directory.',
      auth: 'Authentication', passwordAuth: 'Password', keyAuth: 'Private key', password: 'Password', privateKey: 'Private key (PEM / OpenSSH)', passphrase: 'Key passphrase (optional)',
      privateHint: 'The key is visible while you enter it. Do not paste it into chat or share screenshots of this form.',
      retainHint: 'Stored credentials are never shown. Leave credential fields blank to keep the saved credential.',
      replaceHint: 'This is a new connection, or its host, port, username, authentication or fingerprint changed. Enter credentials again.',
      passphraseHint: 'To change a passphrase, paste the private key again too.',
      fingerprint: 'Host key fingerprint', fingerprintHint: 'SHA256: followed by 43 base64 characters, without trailing =.',
      probe: 'Fetch fingerprint', probing: 'Fetching fingerprint…',
      trustWarning: 'Fetching a fingerprint does not verify the server. Compare it with a trusted, independent source (for example, your server administrator) before trusting it. No password or key is sent by this probe.',
      trust: 'I independently compared this fingerprint and trust this host key.',
      consent: 'Allow agents to execute arbitrary commands as this SSH account.',
      consentHint: 'Unchecked servers remain saved but are not available for agent execution. Remote permissions are those of this account; local tools remain available.',
      save: 'Test and save', saving: 'Testing and saving…', testing: 'Testing connection…', deleting: 'Deleting server…',
      saveHint: 'Connects using the pinned host key and supplied (or retained) credentials before saving. No shell command is run.',
      saved: 'Connection tested and server saved.', tested: 'Connection succeeded for “{alias}”.', removed: 'Server deleted.',
      probed: 'Fingerprint received. Compare it independently before checking the trust box.',
      invalidEndpoint: 'Enter a host and a port from 1 to 65535 before fetching its fingerprint.',
      invalidForm: 'Check the alias, host, port, username, absolute working directory and SHA256 fingerprint.',
      needTrust: 'Independently verify the fingerprint and check the trust box before saving.',
      needCredential: 'Enter a password or private key for this connection.',
      INVALID_INPUT: 'The request is invalid. Check the fields and their length limits.',
      NOT_FOUND: 'This alias was not found. Cancel editing and refresh the server list.',
      DISABLED: 'This server is disabled for agent access.',
      HOST_KEY_MISMATCH: 'The host key does not match. Do not bypass this warning; independently verify the server before changing its fingerprint.',
      AUTH_FAILED: 'SSH authentication failed. Check the credentials here; do not send them in chat.',
      CONNECT_FAILED: 'Could not connect. Check the host, port, network and SSH service, then retry.',
      TIMEOUT: 'The request timed out. If you were saving, refresh the list to check whether it completed before retrying.',
      ABORTED: 'The request was cancelled. Refresh the list before retrying a save.',
      STORE_FAILED: 'Could not read or save credentials in the local Harness store.',
      CONFLICT: 'This server changed elsewhere. Cancel editing, refresh the list and reopen it before saving.',
      INTERNAL: 'The request failed or the server response was invalid. No internal diagnostics are shown.',
      BUSY: 'Too many SSH requests are running. Wait for one to finish and try again.',
      APPROVAL_REQUIRED: 'Remote execution was not approved. No command was sent.',
      FORBIDDEN: 'Only the authenticated Harness owner can manage SSH servers. Reconnect as the owner and retry.',
    };
    const zh = {
      title: 'SSH 服务器',
      intro: '在此保存连接，再把别名告诉智能体。SSH 工具与现有本地工具并存。',
      securityTitle: '不要在聊天中发送凭据',
      securityNote: '仅在此输入密码和私钥。它们保存在本机 Harness 凭据存储中，不进入工具参数或连接结果。这不构成与本地工具或同一本地账户运行代码的强隔离。请使用专用、低权限的 SSH 账户。',
      add: '添加服务器', refresh: '刷新', loading: '正在加载服务器…', retry: '重试',
      empty: '尚未添加 SSH 服务器', emptyHint: '添加服务器后，先通过独立渠道核对主机密钥，再保存凭据。',
      editTitle: '编辑服务器', addTitle: '添加 SSH 服务器', edit: '编辑', test: '测试连接', remove: '删除',
      confirmRemove: '删除服务器“{alias}”及其保存的凭据？', deleteNow: '确认删除', cancel: '取消',
      enabled: '已允许智能体访问', disabled: '未允许智能体访问', stored: '凭据已保存',
      alias: '别名', aliasHint: '1–48 位英文字母、数字、连字符或下划线，以字母或数字开头。智能体使用此名称；保存后不可修改。',
      label: '显示名称', labelPlaceholder: '可选，便于识别的名称', host: '主机', hostHint: '仅填写主机名或 IP 地址，不含网址、用户名或端口。',
      port: '端口', username: '用户名', cwd: '工作目录', cwdHint: '远程绝对路径，默认为 /。连接测试不会检查此目录。',
      auth: '认证方式', passwordAuth: '密码', keyAuth: '私钥', password: '密码', privateKey: '私钥（PEM / OpenSSH）', passphrase: '私钥口令（可选）',
      privateHint: '输入时私钥以明文显示。请勿将私钥粘贴到聊天中，也不要分享此表单的截图。',
      retainHint: '不会回显已保存的凭据。凭据输入框全部留空即可保留原凭据。',
      replaceHint: '这是新连接，或主机、端口、用户名、认证方式、指纹发生了变化。请重新输入凭据。',
      passphraseHint: '修改私钥口令时，也需要重新粘贴私钥。',
      fingerprint: '主机密钥指纹', fingerprintHint: '格式为 SHA256: 加 43 位 base64 字符，末尾不含 =。',
      probe: '获取指纹', probing: '正在获取指纹…',
      trustWarning: '获取指纹不等于验证服务器。信任前，请通过独立可信渠道（如服务器管理员）核对。获取指纹时不会发送密码或私钥。',
      trust: '我已通过独立渠道核对该指纹，并信任此主机密钥。',
      consent: '允许智能体以此 SSH 账户执行任意命令。',
      consentHint: '不勾选时仍可保存，但智能体不能用它执行命令。远程权限取决于该账户；本地工具仍然可用。',
      save: '测试并保存', saving: '正在测试并保存…', testing: '正在测试连接…', deleting: '正在删除服务器…',
      saveHint: '保存前会使用已固定的主机密钥和输入（或保留）的凭据测试连接，不运行 shell 命令。',
      saved: '连接测试成功，服务器已保存。', tested: '“{alias}”连接成功。', removed: '服务器已删除。',
      probed: '已获取指纹。请独立核对后再勾选信任。',
      invalidEndpoint: '获取指纹前，请填写主机和 1–65535 之间的端口。',
      invalidForm: '请检查别名、主机、端口、用户名、绝对工作目录和 SHA256 指纹。',
      needTrust: '保存前，请独立核对指纹并勾选信任。',
      needCredential: '请输入此连接的密码或私钥。',
      INVALID_INPUT: '请求无效，请检查输入内容和长度限制。',
      NOT_FOUND: '未找到此别名。请取消编辑并刷新服务器列表。',
      DISABLED: '此服务器未允许智能体访问。',
      HOST_KEY_MISMATCH: '主机密钥不匹配。请勿忽略此警告；修改指纹前务必通过独立渠道核实服务器。',
      AUTH_FAILED: 'SSH 认证失败。请在此检查凭据，不要在聊天中发送。',
      CONNECT_FAILED: '连接失败，请检查主机、端口、网络和 SSH 服务后重试。',
      TIMEOUT: '请求超时。如果正在保存，请先刷新列表确认是否已完成，再决定是否重试。',
      ABORTED: '请求已取消。重试保存前请先刷新列表。',
      STORE_FAILED: '无法读取或保存本机 Harness 凭据。',
      CONFLICT: '服务器配置已被其他操作修改。请取消编辑、刷新列表并重新打开后再保存。',
      INTERNAL: '请求失败或服务器响应无效，不显示内部诊断信息。',
      BUSY: '正在执行的 SSH 请求过多，请稍后重试。',
      APPROVAL_REQUIRED: '远程执行未获批准，未发送命令。',
      FORBIDDEN: '仅通过认证的 Harness 所有者可以管理 SSH 服务器，请以所有者身份重新连接后重试。',
    };
    const css = `
.named-ssh{box-sizing:border-box;width:100%;max-width:960px;margin:0 auto;padding:28px clamp(24px,4vw,48px) 48px;color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.5;overflow-wrap:anywhere}
.named-ssh *{box-sizing:border-box}.named-ssh h2{margin:0;font-size:22px;line-height:1.4;font-weight:600}.named-ssh h3{margin:0;font-size:16px;font-weight:600}.named-ssh p{margin:0}.named-ssh .ns-sub{color:var(--dsw-alias-label-secondary);font-size:13px}.named-ssh .ns-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:24px}.named-ssh .ns-intro{margin-top:6px}.named-ssh .ns-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.named-ssh .ns-card{padding:20px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);margin-bottom:16px}.named-ssh .ns-note{border-left:3px solid var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-bg-layer-2);padding:12px 16px;border-radius:8px;margin-bottom:20px}.named-ssh .ns-note strong{display:block;margin-bottom:4px;font-weight:600}.named-ssh .ns-list{display:flex;flex-direction:column;gap:12px;list-style:none;padding:0;margin:0}.named-ssh .ns-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.named-ssh .ns-server{flex:1;min-width:0}.named-ssh .ns-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0}.named-ssh .ns-tag{font-size:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:2px 7px}.named-ssh .ns-tag-on{color:var(--dsw-alias-state-success-primary)}.named-ssh code{font-size:12px;white-space:pre-wrap;word-break:break-all}.named-ssh .ns-button{font:inherit;font-size:13px;min-height:34px;padding:6px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);cursor:pointer;white-space:normal}.named-ssh .ns-button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}.named-ssh .ns-primary{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);font-weight:600}.named-ssh .ns-danger{color:var(--dsw-alias-state-error-primary)}.named-ssh :disabled{cursor:not-allowed;opacity:.55}.named-ssh :focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px}.named-ssh .ns-empty{text-align:center;padding:36px 20px}.named-ssh .ns-empty p{margin-top:8px}.named-ssh .ns-status{padding:10px 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);margin-bottom:16px;background:var(--dsw-alias-bg-layer-1)}.named-ssh .ns-error{color:var(--dsw-alias-state-error-primary)}.named-ssh .ns-success{color:var(--dsw-alias-state-success-primary)}.named-ssh .ns-confirm{padding-top:12px;margin-top:12px;border-top:1px solid var(--dsw-alias-border-l1)}.named-ssh .ns-confirm p{margin-bottom:8px}.named-ssh fieldset{border:0;margin:0;padding:0;min-width:0}.named-ssh .ns-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.named-ssh .ns-field{display:flex;flex-direction:column;gap:6px;min-width:0}.named-ssh .ns-wide{grid-column:1 / -1}.named-ssh .ns-label{font-size:13px;font-weight:500}.named-ssh .ns-input{width:100%;min-width:0;min-height:36px;padding:8px 10px;font:inherit;font-size:13px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}.named-ssh textarea.ns-input{resize:vertical;font-family:ui-monospace,monospace;min-height:132px}.named-ssh .ns-input[readonly]{background:var(--dsw-alias-bg-layer-2)}.named-ssh .ns-check{display:flex;gap:10px;align-items:flex-start;font-size:13px;cursor:pointer}.named-ssh .ns-check input{flex:none;width:16px;height:16px;margin:3px 0 0;accent-color:var(--dsw-alias-brand-primary)}.named-ssh .ns-divider{border:0;border-top:1px solid var(--dsw-alias-border-l1);margin:20px 0}.named-ssh .ns-spaced{margin-top:12px}.named-ssh .ns-foot{display:flex;flex-direction:column;gap:12px;margin-top:20px}.named-ssh .ns-fingerprint{font-family:ui-monospace,monospace;font-size:12px}
@media(max-width:767px){.named-ssh{padding:24px 20px 36px}.named-ssh .ns-head,.named-ssh .ns-row{flex-direction:column}.named-ssh .ns-grid{grid-template-columns:1fr}.named-ssh .ns-wide{grid-column:auto}.named-ssh .ns-card{padding:16px}.named-ssh .ns-head>.ns-actions{width:100%}}
`;
    function problem(code) { return Object.assign(new Error('SSH request failed'), { code }); }
    function safeCode(error) { return ERROR_CODES.has(error?.code) ? error.code : 'INTERNAL'; }
    function text(value, max) { return typeof value === 'string' && value.length <= max && !value.includes('\0'); }
    function serverView(value) {
      if (!value || typeof value.alias !== 'string' || !ALIAS.test(value.alias) || !text(value.label, 100) || !text(value.host, 253) || !text(value.username, 128) || !text(value.cwd, 4096) || !Number.isInteger(value.port) || value.port < 1 || value.port > 65535 || !['password', 'key'].includes(value.auth) || typeof value.fingerprint !== 'string' || !FINGERPRINT.test(value.fingerprint) || typeof value.enabled !== 'boolean' || value.hasCredential !== true || !Number.isSafeInteger(value.revision) || value.revision < 1) throw problem('INTERNAL');
      // Explicitly project public fields; never keep unknown response fields in React state.
      return { alias: value.alias, label: value.label, host: value.host, port: value.port, username: value.username, cwd: value.cwd, auth: value.auth, fingerprint: value.fingerprint, enabled: value.enabled, hasCredential: true, revision: value.revision };
    }
    function resultFor(action, value) {
      if (action === 'save') return serverView(value);
      if (action === 'list') {
        if (!Array.isArray(value?.servers) || value.servers.length > 100) throw problem('INTERNAL');
        const servers = value.servers.map(serverView);
        if (new Set(servers.map(server => server.alias)).size !== servers.length) throw problem('INTERNAL');
        return { servers };
      }
      if (action === 'probe' && typeof value?.fingerprint === 'string' && FINGERPRINT.test(value.fingerprint)) return { fingerprint: value.fingerprint };
      if (action === 'test' && value?.connected === true && typeof value.alias === 'string' && ALIAS.test(value.alias)) return { alias: value.alias, connected: true };
      if (action === 'remove' && value?.removed === true) return { removed: true };
      throw problem('INTERNAL');
    }
    async function request(action, fields, signal) {
      const body = JSON.stringify({ action, ...fields });
      if (new TextEncoder().encode(body).byteLength > 96 * 1024) throw problem('INVALID_INPUT');
      const response = await fetch('/api/named-ssh', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body, signal,
      });
      // Stream with a hard cap, including error responses; never render raw server messages.
      const limit = 1024 * 1024;
      if (Number(response.headers.get('content-length')) > limit || !response.body) {
        await response.body?.cancel();
        throw problem('INTERNAL');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let size = 0;
      let raw = '';
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > limit) { await reader.cancel(); throw problem('INTERNAL'); }
          raw += decoder.decode(part.value, { stream: true });
        }
        raw += decoder.decode();
      } finally { reader.releaseLock(); }
      let answer;
      try { answer = JSON.parse(raw); } catch { throw problem('INTERNAL'); }
      if (answer?.ok === false) throw problem(ERROR_CODES.has(answer.error?.code) ? answer.error.code : 'INTERNAL');
      if (!response.ok || answer?.ok !== true) throw problem('INTERNAL');
      return resultFor(action, answer.value);
    }
    function Button({ children, tone, ...props }) {
      return h('button', { type: 'button', ...props, className: `ns-button${tone ? ` ns-${tone}` : ''}` }, children);
    }
    function Editor({ initial, busy, run, report, onCancel, onSaved, t }) {
      const [fields, setFields] = React.useState(() => initial ? {
        alias: initial.alias, label: initial.label, host: initial.host, port: String(initial.port), username: initial.username,
        cwd: initial.cwd, auth: initial.auth, fingerprint: initial.fingerprint, enabled: initial.enabled,
      } : { alias: '', label: '', host: '', port: '22', username: '', cwd: '/', auth: 'password', fingerprint: '', enabled: false });
      const [trusted, setTrusted] = React.useState(false);
      const [probeNotice, setProbeNotice] = React.useState(false);
      const formRef = React.useRef(null);
      const passwordRef = React.useRef(null);
      const keyRef = React.useRef(null);
      const passphraseRef = React.useRef(null);
      const generation = React.useRef(0);
      const alive = React.useRef(true);
      const uid = React.useId();
      const clearSecrets = () => {
        for (const ref of [passwordRef, keyRef, passphraseRef]) if (ref.current) ref.current.value = '';
      };
      React.useLayoutEffect(() => {
        alive.current = true;
        const form = formRef.current;
        return () => {
          alive.current = false;
          generation.current++;
          // Own-form DOM values, not React state: no secret is stored in a render snapshot.
          form?.querySelectorAll('[data-ns-secret]').forEach(input => { input.value = ''; });
        };
      }, []);
      const port = Number(fields.port);
      const validEndpoint = fields.host.trim().length > 0 && fields.host.length <= 253 && Number.isInteger(port) && port >= 1 && port <= 65535;
      const canRetain = !!initial && initial.hasCredential && initial.host === fields.host.trim() && initial.port === port && initial.username === fields.username && initial.auth === fields.auth && initial.fingerprint === fields.fingerprint.trim();
      const update = (name, value) => {
        setFields(previous => {
          const next = { ...previous, [name]: value };
          if (name === 'host' || name === 'port') next.fingerprint = '';
          if (['host', 'port', 'username', 'auth'].includes(name)) next.enabled = false;
          return next;
        });
        if (['host', 'port', 'fingerprint'].includes(name)) {
          generation.current++;
          setTrusted(false);
          setProbeNotice(false);
        }
        if (name === 'auth') clearSecrets();
      };
      const field = (name, options = {}) => {
        const { hint, wide, label, ...input } = options;
        const id = `${uid}-${name}`;
        return h('div', { className: `ns-field${wide ? ' ns-wide' : ''}` },
          h('label', { className: 'ns-label', htmlFor: id }, t(label || name)),
          h('input', { className: 'ns-input', id, value: fields[name], onChange: event => update(name, event.target.value), autoComplete: 'off', spellCheck: false, 'aria-describedby': hint ? `${id}-hint` : undefined, ...input }),
          hint && h('p', { id: `${id}-hint`, className: 'ns-sub' }, t(hint)));
      };
      const probe = async () => {
        if (!validEndpoint) { report('invalidEndpoint'); return; }
        const token = ++generation.current;
        setTrusted(false);
        setProbeNotice(false);
        // Deliberately send only endpoint fields. Credentials are not even read here.
        const value = await run('probe', { host: fields.host.trim(), port });
        if (!value || !alive.current || token !== generation.current) return;
        setFields(previous => ({ ...previous, fingerprint: value.fingerprint }));
        setTrusted(false);
        setProbeNotice(true);
      };
      const save = async event => {
        event.preventDefault();
        if (busy) return;
        if (!ALIAS.test(fields.alias) || !validEndpoint || !fields.username || /[\r\n\0]/.test(fields.username) || !fields.cwd.startsWith('/') || /[\r\n\0]/.test(fields.cwd) || !FINGERPRINT.test(fields.fingerprint.trim())) { report('invalidForm'); return; }
        if (!trusted) { report('needTrust'); return; }
        let credential;
        if (fields.auth === 'password') {
          const password = passwordRef.current?.value || '';
          if (password) credential = { password };
        } else {
          const privateKey = keyRef.current?.value || '';
          const passphrase = passphraseRef.current?.value || '';
          if (!privateKey && passphrase) { report('passphraseHint'); return; }
          if (privateKey) credential = { privateKey, ...(passphrase ? { passphrase } : {}) };
        }
        if (!credential && !canRetain) { report('needCredential'); return; }
        const server = { ...fields, host: fields.host.trim(), port, fingerprint: fields.fingerprint.trim() };
        const value = await run('save', { server, ...(credential ? { credential } : {}), trustConfirmed: true, expectedRevision: initial?.revision ?? 0 });
        credential = undefined;
        if (value && alive.current) { clearSecrets(); onSaved(value); }
      };
      return h('form', { className: 'ns-card', ref: formRef, onSubmit: save, autoComplete: 'off', 'aria-busy': !!busy },
        h('h3', { style: { marginBottom: 20 } }, t(initial ? 'editTitle' : 'addTitle')),
        h('fieldset', { disabled: !!busy },
          h('div', { className: 'ns-grid' },
            field('alias', { maxLength: 48, required: true, readOnly: !!initial, pattern: '[a-zA-Z0-9][a-zA-Z0-9_\\-]{0,47}', hint: 'aliasHint', autoFocus: true }),
            field('label', { maxLength: 100, placeholder: t('labelPlaceholder') }),
            field('host', { maxLength: 253, required: true, hint: 'hostHint' }),
            field('port', { type: 'number', min: 1, max: 65535, step: 1, required: true }),
            field('username', { maxLength: 128, required: true }),
            field('cwd', { maxLength: 4096, required: true, hint: 'cwdHint' })),
          h('hr', { className: 'ns-divider' }),
          h('div', { className: 'ns-grid' },
            h('div', { className: 'ns-field ns-wide' },
              h('label', { className: 'ns-label', htmlFor: `${uid}-auth` }, t('auth')),
              h('select', { id: `${uid}-auth`, className: 'ns-input', value: fields.auth, onChange: event => update('auth', event.target.value) },
                h('option', { value: 'password' }, t('passwordAuth')), h('option', { value: 'key' }, t('keyAuth'))),
              h('p', { className: 'ns-sub' }, t(canRetain ? 'retainHint' : 'replaceHint'))),
            fields.auth === 'password'
              ? h('div', { className: 'ns-field ns-wide' },
                h('label', { className: 'ns-label', htmlFor: `${uid}-password` }, t('password')),
                h('input', { id: `${uid}-password`, className: 'ns-input', ref: passwordRef, type: 'password', maxLength: 4096, required: !canRetain, autoComplete: 'new-password', 'data-ns-secret': true }))
              : h(React.Fragment, null,
                h('div', { className: 'ns-field ns-wide' },
                  h('label', { className: 'ns-label', htmlFor: `${uid}-key` }, t('privateKey')),
                  h('textarea', { id: `${uid}-key`, className: 'ns-input', ref: keyRef, maxLength: 65536, required: !canRetain, autoComplete: 'off', autoCapitalize: 'none', spellCheck: false, rows: 6, 'data-ns-secret': true, 'aria-describedby': `${uid}-key-hint` }),
                  h('p', { id: `${uid}-key-hint`, className: 'ns-sub' }, t('privateHint'))),
                h('div', { className: 'ns-field ns-wide' },
                  h('label', { className: 'ns-label', htmlFor: `${uid}-passphrase` }, t('passphrase')),
                  h('input', { id: `${uid}-passphrase`, className: 'ns-input', ref: passphraseRef, type: 'password', maxLength: 4096, autoComplete: 'new-password', 'data-ns-secret': true }),
                  h('p', { className: 'ns-sub' }, t('passphraseHint'))))),
          h('hr', { className: 'ns-divider' }),
          h('div', { className: 'ns-field' },
            h('label', { className: 'ns-label', htmlFor: `${uid}-fingerprint` }, t('fingerprint')),
            h('input', { id: `${uid}-fingerprint`, className: 'ns-input ns-fingerprint', value: fields.fingerprint, maxLength: 50, required: true, autoComplete: 'off', autoCapitalize: 'none', spellCheck: false, placeholder: 'SHA256:…', onChange: event => update('fingerprint', event.target.value), 'aria-describedby': `${uid}-fingerprint-hint` }),
            h('p', { id: `${uid}-fingerprint-hint`, className: 'ns-sub' }, t('fingerprintHint')),
            h('div', { className: 'ns-actions' }, h(Button, { onClick: probe, disabled: !!busy || !validEndpoint }, t(busy === 'probe' ? 'probing' : 'probe')))),
          h('div', { className: 'ns-note ns-spaced' }, h('p', { className: 'ns-sub' }, t('trustWarning'))),
          probeNotice && h('p', { className: 'ns-sub', role: 'status' }, t('probed')),
          h('label', { className: 'ns-check ns-spaced' },
            h('input', { type: 'checkbox', checked: trusted, disabled: !!busy || !FINGERPRINT.test(fields.fingerprint.trim()), onChange: event => setTrusted(event.target.checked) }), h('span', null, t('trust'))),
          h('hr', { className: 'ns-divider' }),
          h('label', { className: 'ns-check' },
            h('input', { type: 'checkbox', checked: fields.enabled, onChange: event => update('enabled', event.target.checked) }), h('span', null, t('consent'))),
          h('p', { className: 'ns-sub ns-spaced' }, t('consentHint')),
          h('div', { className: 'ns-foot' },
            h('p', { className: 'ns-sub' }, t('saveHint')),
            h('div', { className: 'ns-actions' },
              h(Button, { type: 'submit', tone: 'primary', disabled: !!busy || !trusted }, t(busy === 'save' ? 'saving' : 'save')),
              h(Button, { disabled: !!busy, onClick: () => { clearSecrets(); onCancel(); } }, t('cancel'))))));
    }
    function Page({ locale, t, subscribe, snapshot }) {
      React.useSyncExternalStore(subscribe, snapshot, snapshot);
      const [servers, setServers] = React.useState([]);
      const [loaded, setLoaded] = React.useState(false);
      const [busy, setBusy] = React.useState('list');
      const [error, setError] = React.useState(null);
      const [notice, setNotice] = React.useState(null);
      const [editing, setEditing] = React.useState(null);
      const [deleting, setDeleting] = React.useState(null);
      const active = React.useRef(null);
      const alive = React.useRef(false);
      const run = React.useCallback(async (action, fields = {}) => {
        if (!alive.current || active.current) return null;
        const operation = { controller: new AbortController(), timeout: false, timer: null };
        active.current = operation;
        setBusy(action); setError(null); setNotice(null);
        operation.timer = setTimeout(() => { operation.timeout = true; operation.controller.abort(); }, 45000);
        try {
          const value = await request(action, fields, operation.controller.signal);
          return alive.current && active.current === operation ? value : null;
        } catch (failure) {
          const code = operation.timeout ? 'TIMEOUT' : operation.controller.signal.aborted ? 'ABORTED' : failure instanceof TypeError ? 'CONNECT_FAILED' : safeCode(failure);
          if (alive.current && active.current === operation) setError(code);
          return null;
        } finally {
          clearTimeout(operation.timer);
          if (active.current === operation) {
            active.current = null;
            if (alive.current) setBusy(null);
          }
        }
      }, []);
      const reload = React.useCallback(async () => {
        const value = await run('list');
        if (value) { setServers(value.servers); setLoaded(true); setDeleting(null); }
      }, [run]);
      React.useEffect(() => {
        alive.current = true;
        void reload();
        return () => {
          alive.current = false;
          const operation = active.current;
          active.current = null;
          if (operation) { clearTimeout(operation.timer); operation.controller.abort(); }
        };
      }, [reload]);
      const begin = server => { setEditing({ server }); setError(null); setNotice(null); setDeleting(null); };
      const report = key => { setError(key); setNotice(null); };
      const saved = server => {
        setServers(previous => [...previous.filter(entry => entry.alias !== server.alias), server].sort((a, b) => a.alias.localeCompare(b.alias)));
        setEditing(null); setNotice({ key: 'saved' });
      };
      const test = async server => {
        const result = await run('test', { alias: server.alias });
        if (result) setNotice({ key: 'tested', params: { alias: server.alias } });
      };
      const remove = async server => {
        const result = await run('remove', { alias: server.alias });
        if (result) { setServers(previous => previous.filter(entry => entry.alias !== server.alias)); setDeleting(null); setNotice({ key: 'removed' }); }
      };
      return h('section', { className: 'named-ssh', lang: locale.getLocale().active, 'aria-busy': !!busy },
        h('style', null, css),
        h('div', { className: 'ns-head' },
          h('div', null, h('h2', null, t('title')), h('p', { className: 'ns-sub ns-intro' }, t('intro'))),
          !editing && h('div', { className: 'ns-actions' },
            h(Button, { disabled: !!busy, onClick: reload }, t(loaded ? 'refresh' : error ? 'retry' : 'refresh')),
            h(Button, { disabled: !!busy || !loaded, tone: 'primary', onClick: () => begin(null) }, t('add')))),
        h('div', { className: 'ns-note' }, h('strong', null, t('securityTitle')), h('p', { className: 'ns-sub' }, t('securityNote'))),
        error && h('div', { className: 'ns-status ns-error', role: 'alert' }, t(error)),
        notice && h('div', { className: 'ns-status ns-success', role: 'status' }, t(notice.key, notice.params)),
        busy && h('div', { className: 'ns-status', role: 'status', 'aria-live': 'polite' }, t({ list: 'loading', probe: 'probing', save: 'saving', test: 'testing', remove: 'deleting' }[busy])),
        editing ? h(Editor, { key: editing.server?.alias || '__new__', initial: editing.server, busy, run, report, onCancel: () => { setEditing(null); setError(null); }, onSaved: saved, t })
          : loaded && (servers.length === 0
            ? h('div', { className: 'ns-card ns-empty' }, h('h3', null, t('empty')), h('p', { className: 'ns-sub' }, t('emptyHint')))
            : h('ul', { className: 'ns-list' }, servers.map(server => h('li', { className: 'ns-card', key: server.alias },
              h('div', { className: 'ns-row' },
                h('div', { className: 'ns-server' },
                  h('h3', null, server.label),
                  h('div', { className: 'ns-meta' }, h('code', null, server.alias), h('span', { className: `ns-tag${server.enabled ? ' ns-tag-on' : ''}` }, t(server.enabled ? 'enabled' : 'disabled')), h('span', { className: 'ns-tag' }, t('stored'))),
                  h('p', { className: 'ns-sub' }, `${server.username}@${server.host.includes(':') ? `[${server.host}]` : server.host}:${server.port} · ${server.cwd}`),
                  h('p', { className: 'ns-sub ns-spaced' }, h('code', null, server.fingerprint))),
                h('div', { className: 'ns-actions' },
                  h(Button, { disabled: !!busy, onClick: () => test(server) }, t('test')),
                  h(Button, { disabled: !!busy, onClick: () => begin(server) }, t('edit')),
                  h(Button, { disabled: !!busy, tone: 'danger', onClick: () => setDeleting(server.alias) }, t('remove')))),
              deleting === server.alias && h('div', { className: 'ns-confirm' },
                h('p', null, t('confirmRemove', { alias: server.alias })),
                h('div', { className: 'ns-actions' },
                  h(Button, { disabled: !!busy, tone: 'danger', onClick: () => remove(server) }, t('deleteNow')),
                  h(Button, { disabled: !!busy, onClick: () => setDeleting(null) }, t('cancel')))))))));
    }
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, 'en', en));
        ctx.effect(() => ctx.locale.register(NS, 'zh', zh));
        const t = ctx.locale.bind(NS);
        const subscribe = listener => ctx.locale.subscribe(listener);
        const snapshot = () => ctx.locale.getSnapshot();
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section', id: 'named-ssh', order: 25, label: () => t('title'),
        }, () => h(Page, { locale: ctx.locale, t, subscribe, snapshot })));
      },
    };
  },
});
