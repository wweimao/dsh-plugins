'use strict';

// Offline tests: no shell/executable execution, network, user state or filesystem writes.
// Integration is opt-in and reads only the explicitly supplied, pinned public program.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { syncBuiltinESMExports } = require('node:module');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const sourcePath = path.resolve(__dirname, '../src/windows-app-oauth.js');
const libPath = path.resolve(__dirname, '../lib/windows-app-oauth.js');
const source = import(pathToFileURL(sourcePath).href);
const PIN = 'd82033662f9a803a8d51805e1bef3520d77fe7948b4a5fd142b5f55a0053637b';
const ROOT = 'C:\\Approved\\antigravity';
const WIN = path.win32;
const key = value => WIN.normalize(value).toLowerCase();
const importError = pattern => error => error?.code === 'ERR_ANTIGRAVITY_APP_IMPORT' && pattern.test(error.message);

// The same production filesystem code runs against local, in-memory resources. No test writes files.
async function fixture(run, options = {}) {
  const api = await source;
  const root = options.root || ROOT, binary = WIN.join(root, 'resources', 'bin', 'language_server.exe');
  const bytes = options.bytes || Buffer.alloc(4096);
  const directories = []; let cursor = root;
  while (true) { directories.unshift(cursor); const parent = WIN.dirname(cursor); if (parent === cursor) break; cursor = parent; }
  directories.push(WIN.join(root, 'resources'), WIN.join(root, 'resources', 'bin'));
  const ids = new Map(directories.map((value, index) => [key(value), BigInt(index + 1)]));
  const state = { opens: 0, reads: 0, version: 0n, directoryVersion: 0n, calls: [] };
  function stat(file, handle = false) {
    const isBinary = key(file) === key(binary), exists = isBinary || ids.has(key(file));
    if (!exists) throw new Error('missing fixture resource');
    const symlink = key(file) === key(options.symlink || '');
    return {
      dev: 1n, ino: isBinary ? 100n : ids.get(key(file)), mode: isBinary ? 33206n : 16822n,
      nlink: 1n, size: isBinary ? BigInt(options.size ?? bytes.length) : 0n,
      mtimeNs: 1n + (isBinary ? state.version : state.directoryVersion), ctimeNs: 1n + (isBinary ? state.version : state.directoryVersion),
      isFile: () => isBinary && !options.nonFile, isDirectory: () => !isBinary,
      isSymbolicLink: () => !handle && symlink,
    };
  }
  const replacements = {
    async lstat(file) { state.calls.push(['lstat', file]); return stat(file); },
    async realpath(file) {
      state.calls.push(['realpath', file]);
      if (key(file) === key(options.escape || '')) return 'C:\\Outside\\resource';
      return options.casing ? file.toUpperCase() : file;
    },
    async open(file, flags) {
      state.calls.push(['open', file]);
      assert.ok(key(file) === key(binary), 'only the fixed public binary can be opened');
      assert.ok(flags === (fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0)), 'read-only flags');
      const openNumber = ++state.opens;
      if (options.beforeReadChange) state.version++;
      let statCount = 0;
      return {
        async stat() {
          statCount++;
          if (options.afterReadChange && statCount === 2) state.version++;
          return stat(file, true);
        },
        async read(buffer, offset, length, position) {
          state.reads++;
          if (options.truncated) return { bytesRead: 0 };
          const count = Math.max(0, Math.min(length, bytes.length - position));
          bytes.copy(buffer, offset, position, position + count);
          if (options.secondReadMutation && openNumber === 2 && count && position + count === bytes.length) buffer[offset + count - 1] ^= 1;
          if (options.directoryChange && openNumber === 2 && !count) state.directoryVersion++;
          return { bytesRead: options.growth && position === bytes.length ? 1 : count };
        },
        async close() { state.calls.push(['close', file]); },
      };
    },
  };
  const originals = Object.fromEntries(Object.keys(replacements).map(name => [name, fsp[name]]));
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  const previousLocal = process.env.LOCALAPPDATA;
  try {
    Object.defineProperty(process, 'platform', { ...platform, value: options.platform || 'win32' });
    if (options.localAppData === null) delete process.env.LOCALAPPDATA;
    else if (options.localAppData !== undefined) process.env.LOCALAPPDATA = options.localAppData;
    Object.assign(fsp, replacements); syncBuiltinESMExports();
    await run({ ...api, state, root, binary });
  } finally {
    Object.assign(fsp, originals); syncBuiltinESMExports();
    Object.defineProperty(process, 'platform', platform);
    if (previousLocal === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = previousLocal;
  }
}

test('source and shipped library are identical, with only the two public parser/importer exports', async () => {
  assert.ok(fs.readFileSync(sourcePath).equals(fs.readFileSync(libPath)));
  assert.deepEqual(Object.keys(await source).sort(), ['extractWindowsAppOAuthConfig', 'importWindowsAppOAuthConfig']);
  const code = fs.readFileSync(sourcePath, 'utf8');
  assert.ok(!/node:child_process|execFile|spawn\(|codesign|powershell|console\./i.test(code));
});

test('pure parser rejects malformed types, sizes and hashes before structural parsing', async () => {
  const { extractWindowsAppOAuthConfig } = await source;
  for (const value of [undefined, null, '', [], {}, new ArrayBuffer(4096), Buffer.alloc(0), Buffer.alloc(4095)]) {
    assert.throws(() => extractWindowsAppOAuthConfig(value), importError(/byte array|bounds/));
  }
  for (const value of [Buffer.alloc(4096), new Uint8Array(4096), Buffer.from('MZ'.padEnd(8192, '\0'))]) {
    assert.throws(() => extractWindowsAppOAuthConfig(value), importError(/SHA256/));
  }
  // Offset views cannot accidentally cause the parser to hash the whole backing allocation.
  const backing = Buffer.alloc(9000);
  assert.throws(() => extractWindowsAppOAuthConfig(backing.subarray(100, 5000)), importError(/SHA256/));
});

test('approval is mandatory and exact, and is rejected without any filesystem calls', async () => {
  await fixture(async ({ importWindowsAppOAuthConfig, state, root }) => {
    for (const options of [undefined, {}, null, [], { sha256: '' }, { sha256: PIN.toUpperCase() }, { sha256: ` ${PIN}` }, { sha256: '0'.repeat(64) }, { windowsApplicationSha256: PIN }, Object.create({ sha256: PIN })]) {
      await assert.rejects(importWindowsAppOAuthConfig(root, options), importError(/explicit SHA256 approval/));
    }
    assert.equal(state.calls.length, 0);
  });
});

test('non-Windows platforms cannot enable importing even with the pin', async () => {
  for (const platform of ['linux', 'darwin', 'freebsd']) {
    await fixture(async ({ importWindowsAppOAuthConfig, state, root }) => {
      await assert.rejects(importWindowsAppOAuthConfig(root, { sha256: PIN }), importError(/only on Windows/));
      assert.equal(state.calls.length, 0);
    }, { platform });
  }
});

test('relative, device, UNC, traversal, stream and Win32 alias roots are rejected', async () => {
  await fixture(async ({ importWindowsAppOAuthConfig, state }) => {
    for (const root of ['', 'antigravity', 'C:antigravity', '\\antigravity', '\\\\server\\app', '\\\\?\\C:\\app', 'C:\\app\\..\\antigravity', 'C:\\app\\.\\antigravity', 'C:\\app:stream', 'C:\\app.', 'C:\\app ', 'C:\\NUL', 'C:\\app\0']) {
      await assert.rejects(importWindowsAppOAuthConfig(root, { sha256: PIN }), importError(/path|root/));
    }
    assert.equal(state.calls.length, 0);
  });
});

test('default root requires LOCALAPPDATA and opens only its fixed public program', async () => {
  await fixture(async ({ importWindowsAppOAuthConfig, state }) => {
    await assert.rejects(importWindowsAppOAuthConfig(undefined, { sha256: PIN }), importError(/LOCALAPPDATA/));
    assert.equal(state.calls.length, 0);
  }, { localAppData: null });
  await fixture(async ({ importWindowsAppOAuthConfig, state, binary }) => {
    await assert.rejects(importWindowsAppOAuthConfig(undefined, { sha256: PIN }), importError(/SHA256/));
    assert.equal(state.opens, 1);
    assert.ok(state.calls.filter(([name]) => name === 'open').every(([, file]) => key(file) === key(binary)));
  }, { root: 'C:\\FixtureLocal\\Programs\\antigravity', localAppData: 'C:\\FixtureLocal' });
});

test('symlinks/junctions and realpath escapes in any parent, resource directory or file are rejected', async () => {
  const binary = WIN.join(ROOT, 'resources', 'bin', 'language_server.exe');
  for (const entry of ['C:\\Approved', ROOT, WIN.join(ROOT, 'resources'), WIN.join(ROOT, 'resources', 'bin'), binary]) {
    for (const option of ['symlink', 'escape']) {
      await fixture(async ({ importWindowsAppOAuthConfig, state, root }) => {
        await assert.rejects(importWindowsAppOAuthConfig(root, { sha256: PIN }), importError(/boundary|directory|file or size/));
        assert.equal(state.opens, 0);
      }, { [option]: entry });
    }
  }
});

test('bounded regular-file checks happen before open and allocation', async () => {
  for (const options of [{ nonFile: true }, { size: 0 }, { size: 4095 }, { size: 256 * 1024 * 1024 + 1 }]) {
    await fixture(async ({ importWindowsAppOAuthConfig, state, root }) => {
      await assert.rejects(importWindowsAppOAuthConfig(root, { sha256: PIN }), importError(/file or size/));
      assert.equal(state.opens, 0);
    }, options);
  }
});

test('identity changes, truncation and growth fail closed and always close the handle', async () => {
  for (const options of [{ beforeReadChange: true }, { afterReadChange: true }, { truncated: true }, { growth: true }]) {
    await fixture(async ({ importWindowsAppOAuthConfig, state, root }) => {
      await assert.rejects(importWindowsAppOAuthConfig(root, { sha256: PIN }), importError(/changed|truncated/));
      assert.equal(state.calls.filter(([name]) => name === 'close').length, 1);
      if (options.beforeReadChange) assert.equal(state.reads, 0);
    }, options);
  }
});

test('case-insensitive realpath spelling is valid, but unapproved binary contents are not', async () => {
  await fixture(async ({ importWindowsAppOAuthConfig, state, root }) => {
    await assert.rejects(importWindowsAppOAuthConfig(root, { sha256: PIN }), importError(/SHA256/));
    assert.equal(state.opens, 1);
    assert.equal(state.calls.filter(([name]) => name === 'close').length, 1);
  }, { casing: true });
});

const integrationBinary = process.env.DSH_TEST_WINDOWS_APP_BINARY;
test('opt-in: pinned real PE, same-source copies, and second-read hash/directory consistency', { skip: !integrationBinary }, async () => {
  // Do not put pair values in assertions: a failing assertion must never print them.
  assert.ok(path.isAbsolute(integrationBinary) && path.basename(integrationBinary).toLowerCase() === 'language_server.exe');
  const image = fs.readFileSync(integrationBinary);
  assert.ok(createHash('sha256').update(image).digest('hex') === PIN, 'integration program must have the supported pin');
  const api = await source, pair = api.extractWindowsAppOAuthConfig(image);
  assert.ok(Object.keys(pair).sort().join(',') === 'clientId,clientSecret');
  assert.ok(pair.clientId.length === 73 && pair.clientSecret.length === 35);
  const malformed = Buffer.from(image); malformed[0] ^= 1;
  assert.throws(() => api.extractWindowsAppOAuthConfig(malformed), importError(/SHA256/));
  if (process.platform === 'win32') {
    const realRoot = path.dirname(path.dirname(path.dirname(integrationBinary)));
    const imported = await api.importWindowsAppOAuthConfig(realRoot, { sha256: PIN });
    assert.ok(imported.clientId === pair.clientId && imported.clientSecret === pair.clientSecret);
  }
  for (const root of ['C:\\Approved\\copy-one', 'D:\\ReviewedCopy\\copy-two']) {
    await fixture(async ({ importWindowsAppOAuthConfig, state }) => {
      const imported = await importWindowsAppOAuthConfig(root, { sha256: PIN });
      assert.ok(imported.clientId === pair.clientId && imported.clientSecret === pair.clientSecret);
      assert.equal(state.opens, 2);
      assert.equal(state.calls.filter(([name]) => name === 'close').length, 2);
    }, { bytes: image, root });
  }
  for (const options of [{ secondReadMutation: true }, { directoryChange: true }]) {
    await fixture(async ({ importWindowsAppOAuthConfig, state, root }) => {
      await assert.rejects(importWindowsAppOAuthConfig(root, { sha256: PIN }), importError(/changed during import/));
      assert.equal(state.opens, 2);
      assert.equal(state.calls.filter(([name]) => name === 'close').length, 2);
    }, { bytes: image, ...options });
  }
});
