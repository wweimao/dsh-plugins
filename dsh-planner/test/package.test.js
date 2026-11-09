import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Config, inject } from '../index.js';
import { plannerTools } from '../tools.js';

const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
test('manifest exports shipped resources and has no installation scripts', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.name, '@local/dsh-planner'); assert.equal(pkg.exports['./client'], './client.js');
  for (const file of ['index.js', 'runtime.js', 'core.js', 'tools.js', 'client.js', 'cordis.patch.yml', 'icon.svg', 'README.md']) { assert.ok(pkg.files.includes(file)); assert.ok((await read(file)).length > 0); }
  assert.ok(pkg.files.includes('locale/*.json'));
  assert.equal(pkg.scripts.preinstall, undefined); assert.equal(pkg.scripts.install, undefined); assert.equal(pkg.scripts.postinstall, undefined);
  assert.deepEqual(Config({}), { timeZone: 'Asia/Shanghai' });
  assert.deepEqual(inject, ['storageDomain', 'connection', 'tools']);
});

test('bilingual display resources match embedded runtime dictionaries', async () => {
  const source = await read('client.js');
  const match = source.match(/const dictionaries = (.+);\n/);
  assert.ok(match, 'Expected a JSON literal, not executable locale loading.');
  const dictionaries = JSON.parse(match[1]);
  const en = JSON.parse(await read('locale/en.json')), zh = JSON.parse(await read('locale/zh.json'));
  assert.deepEqual(dictionaries, { en, zh }); assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
  for (const dictionary of [en, zh]) { assert.ok(dictionary.meta.title); assert.ok(dictionary.meta.description); for (const [key, value] of Object.entries(dictionary)) if (key !== 'meta') assert.equal(typeof value, 'string'); }
  assert.match(source, /getSnapshot\(\)\.active/);
});

test('Client uses additive slots, safe text and only declared theme tokens', async () => {
  const source = await read('client.js');
  for (const slot of ['sidebar.panellist', 'main', 'conversation.composer.dock']) assert.ok(source.includes(`ctx.slots.inject('${slot}'`));
  assert.equal(/dangerouslySetInnerHTML|\.innerHTML\s*=|document\.body\.append|<iframe/.test(source), false);
  assert.deepEqual([...source.matchAll(/require\('([^']+)'\)/g)].map(match => match[1]), ['react']);
  const css = source.match(/const css = `([\s\S]*?)`;/)[1];
  assert.equal(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i.test(css), false);
  const allowed = new Set(['bg-base', 'bg-layer-1', 'bg-layer-2', 'bg-overlay', 'border-l1', 'border-l2', 'brand-primary', 'label-primary', 'label-secondary', 'state-error-primary', 'state-idle-primary', 'state-success-primary', 'state-warn-primary'].map(name => `--dsw-alias-${name}`));
  for (const match of css.matchAll(/var\((--[\w-]+)/g)) assert.ok(allowed.has(match[1]), match[1]);
  assert.ok(source.includes('stream.close()')); assert.ok(source.includes('removeEventListener')); assert.ok(source.includes('controller.abort()'));
});

test('original SVG display resource is self-contained and bounded', async () => {
  const icon = await read('icon.svg');
  assert.match(icon, /^<svg /); assert.match(icon, /<\/svg>\s*$/); assert.ok(Buffer.byteLength(icon) < 262144);
  assert.equal(/<script|onload=|<foreignObject|href=|<image/.test(icon), false);
});

test('model surface is four bounded tools with no unconditional prompt injection', async () => {
  const definitions = plannerTools({ dispatch() { throw new Error('metadata only'); } });
  assert.equal(definitions.length, 4);
  const characters = JSON.stringify(definitions.map(({ name, description, parameters }) => ({ name, description, parameters }))).length;
  assert.ok(characters < 8000, `Schema character budget: ${characters}`);
  const entry = await read('index.js'); assert.equal(entry.includes('systemPrompt'), false);
});
