/** Browser OAuth shared by the source and the shipped runtime. Never reads IDE account state. */
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';

const REDIRECT_URI = 'http://localhost:51121/oauth-callback';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
  'https://www.googleapis.com/auth/aicode',
];
const appVersion = () => process.platform === 'win32' ? '2.30.0' : '2.29.0';

export function antiGravityHeaders(access) {
  return {
    authorization: `Bearer ${access}`,
    'content-type': 'application/json',
    'user-agent': `antigravity/hub/${appVersion()} (aidev_client; os_type=${process.platform}; arch=${process.arch})`,
  };
}

/** Both localhost address families are loopback-only; never listen on 0.0.0.0 or ::. */
async function callbackListener(state, signal) {
  signal.throwIfAborted();
  const servers = [];
  let settled = false;
  let resolveCode, rejectCode;
  const code = new Promise((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
  // Binding can fail before the caller starts waiting for the code.
  void code.catch(() => {});
  const close = () => {
    signal.removeEventListener('abort', onAbort);
    for (const server of servers) {
      server.close();
      server.closeAllConnections();
    }
  };
  const finish = (error, value) => {
    if (settled) return;
    settled = true;
    close();
    if (error) rejectCode(error); else resolveCode(value);
  };
  const onAbort = () => finish(signal.reason ?? new Error('Anti Gravity OAuth was cancelled'));
  signal.addEventListener('abort', onAbort, { once: true });
  const requestHandler = (request, response) => {
    const reply = (status, message) => response.writeHead(status, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    }).end(message);
    let url;
    try { url = new URL(request.url ?? '/', REDIRECT_URI); }
    catch { reply(400, 'Invalid callback.'); return; }
    if (request.method !== 'GET' || url.pathname !== '/oauth-callback') {
      reply(404, 'Not found.'); return;
    }
    if (settled || url.searchParams.getAll('state').length !== 1 || url.searchParams.get('state') !== state) {
      reply(400, 'Anti Gravity OAuth callback is invalid.'); return;
    }
    if (url.searchParams.has('error')) {
      // Do not reflect provider/query error text, codes, or credentials in diagnostics.
      response.once('finish', () => finish(new Error('Google Anti Gravity authorization was denied or failed')));
      reply(400, 'Google authorization was denied or failed.');
      return;
    }
    const values = url.searchParams.getAll('code');
    if (values.length !== 1 || values[0].length === 0 || values[0].length > 8192) {
      reply(400, 'Anti Gravity OAuth callback is invalid.'); return;
    }
    response.once('finish', () => finish(undefined, values[0]));
    reply(200, 'Anti Gravity authorization received. Return to DSH to check login status.');
  };
  const bind = host => new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const server = createServer(requestHandler);
    servers.push(server);
    const removeAbort = () => signal.removeEventListener('abort', onBindAbort);
    const onBindAbort = () => { removeAbort(); reject(signal.reason); };
    const onError = error => {
      removeAbort();
      server.removeListener('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      removeAbort();
      server.removeListener('error', onError);
      server.on('error', () => finish(new Error('Anti Gravity OAuth callback listener failed')));
      if (signal.aborted) { server.close(); reject(signal.reason); } else resolve();
    };
    signal.addEventListener('abort', onBindAbort, { once: true });
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen({ port: 51121, host, ipv6Only: host === '::1' });
  });
  try {
    await bind('127.0.0.1');
    signal.throwIfAborted();
    try { await bind('::1'); }
    catch (error) {
      if (!['EAFNOSUPPORT', 'EADDRNOTAVAIL', 'EPROTONOSUPPORT'].includes(error?.code)) throw error;
    }
    signal.throwIfAborted();
    return { code, close };
  } catch (error) {
    finish(signal.aborted ? signal.reason : new Error(error?.code === 'EADDRINUSE'
      ? 'Anti Gravity OAuth callback port 51121 is already in use. Close the other login attempt and retry.'
      : 'Anti Gravity OAuth could not open its loopback callback listener'));
    throw signal.aborted ? signal.reason : await code.catch(cause => cause);
  }
}

function tokenDocument(value, requireRefresh) {
  if (!value || typeof value.access_token !== 'string' || value.access_token.length === 0
    || typeof value.expires_in !== 'number' || !Number.isFinite(value.expires_in) || value.expires_in <= 0
    || (requireRefresh && (typeof value.refresh_token !== 'string' || value.refresh_token.length === 0))
    || (value.refresh_token !== undefined && (typeof value.refresh_token !== 'string' || value.refresh_token.length === 0))) {
    throw new Error('Anti Gravity token response is missing required fields');
  }
  return value;
}

async function exchange(params, signal, request) {
  signal?.throwIfAborted();
  const response = await request(TOKEN_URL, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params, ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok) throw new Error(`Anti Gravity token exchange failed with HTTP ${response.status}`);
  try { return await response.json(); }
  catch { throw new Error('Anti Gravity token response is not valid JSON'); }
}

async function discoverProject(access, signal, request) {
  for (const endpoint of ['https://daily-cloudcode-pa.googleapis.com', 'https://cloudcode-pa.googleapis.com']) {
    try {
      const response = await request(`${endpoint}/v1internal:loadCodeAssist`, {
        method: 'POST', headers: antiGravityHeaders(access),
        body: JSON.stringify({ metadata: { ideName: 'antigravity', ideType: 'ANTIGRAVITY', ideVersion: appVersion() } }),
        ...(signal === undefined ? {} : { signal }),
      });
      if (!response.ok) continue;
      const body = await response.json();
      const project = typeof body.cloudaicompanionProject === 'string'
        ? body.cloudaicompanionProject : body.cloudaicompanionProject?.id;
      if (typeof project === 'string' && project.length > 0) return project;
    } catch (error) { if (signal?.aborted) throw error; }
  }
  throw new Error('Anti Gravity OAuth succeeded, but Cloud Code Assist returned no companion project');
}

/** options is a local test seam, not a remotely writable identity or endpoint override. */
export function createAntiGravityOAuth(resolveClientConfig, options = {}) {
  const request = options.fetch ?? ((...args) => globalThis.fetch(...args));
  const timeoutMs = options.timeoutMs ?? 300_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
    throw new Error('Anti Gravity OAuth timeout must be a positive bounded integer');
  }
  return {
    name: 'Google Anti Gravity',
    loginLabel: '使用 Google 账号登录 Anti Gravity',
    async login(interaction) {
      interaction.signal?.throwIfAborted();
      const deadline = new AbortController();
      const signal = interaction.signal ? AbortSignal.any([interaction.signal, deadline.signal]) : deadline.signal;
      const timer = setTimeout(() => deadline.abort(new Error('Anti Gravity OAuth timed out. Please retry login.')), timeoutMs);
      timer.unref?.();
      let listener;
      try {
        const clientConfig = await resolveClientConfig();
        signal.throwIfAborted();
        const verifier = randomBytes(32).toString('base64url');
        const state = randomBytes(24).toString('base64url');
        listener = await callbackListener(state, signal);
        const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        auth.search = new URLSearchParams({
          client_id: clientConfig.clientId, response_type: 'code', redirect_uri: REDIRECT_URI,
          scope: SCOPES.join(' '), code_challenge: createHash('sha256').update(verifier).digest('base64url'),
          code_challenge_method: 'S256', state, access_type: 'offline', prompt: 'consent',
        }).toString();
        signal.throwIfAborted();
        interaction.notify({ type: 'auth_url', url: auth.toString(), instructions: '在浏览器完成 Google Anti Gravity 授权。' });
        const code = await listener.code;
        const tokens = tokenDocument(await exchange(new URLSearchParams({
          client_id: clientConfig.clientId, client_secret: clientConfig.clientSecret,
          code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI, code_verifier: verifier,
        }), signal, request), true);
        const projectId = await discoverProject(tokens.access_token, signal, request);
        signal.throwIfAborted();
        return {
          type: 'oauth', access: tokens.access_token, refresh: tokens.refresh_token,
          expires: Date.now() + tokens.expires_in * 1000 - 300_000, projectId,
        };
      } finally { clearTimeout(timer); listener?.close(); }
    },
    async refresh(credential, signal) {
      signal?.throwIfAborted();
      if (typeof credential.projectId !== 'string' || credential.projectId.length === 0) {
        throw new Error('Anti Gravity credential has no Cloud Code Assist project id');
      }
      const clientConfig = await resolveClientConfig();
      signal?.throwIfAborted();
      const tokens = tokenDocument(await exchange(new URLSearchParams({
        client_id: clientConfig.clientId, client_secret: clientConfig.clientSecret,
        refresh_token: credential.refresh, grant_type: 'refresh_token',
      }), signal, request), false);
      signal?.throwIfAborted();
      return { ...credential, access: tokens.access_token, refresh: tokens.refresh_token ?? credential.refresh,
        expires: Date.now() + tokens.expires_in * 1000 - 300_000 };
    },
    toAuth(credential) {
      if (typeof credential.projectId !== 'string' || credential.projectId.length === 0) {
        throw new Error('Anti Gravity credential has no Cloud Code Assist project id');
      }
      return Promise.resolve({ apiKey: JSON.stringify({ token: credential.access, projectId: credential.projectId }) });
    },
  };
}
