import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const read = path => readFileSync(path, 'utf8');
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
const files = [...walk('src/components'), ...walk('src/pages'), ...walk('src/styles')]
  .filter(path => /\.(astro|css)$/.test(path));
const tokens = read('src/styles/tokens.css');
const ui = files.filter(path => !path.endsWith('/tokens.css'));
const declarations = new Set([...files.map(read).join('\n').matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]));

test('portfolio UI uses declared semantic tokens', () => {
  for (const file of files) {
    for (const [, name] of read(file).matchAll(/var\((--(?:color|text|font-weight|space|radius|shadow|layer|header|surface|duration)[\w-]*)/g)) {
      assert.ok(declarations.has(name), `${file}: unknown token ${name}`);
    }
  }
});

test('UI typography uses the scale and only shipped weights', () => {
  for (const file of ui) {
    const source = read(file);
    assert.doesNotMatch(source, /font-size:\s*\d/, `${file}: use a text token`);
    assert.doesNotMatch(source, /font-weight:\s*\d/, `${file}: use a weight token`);
    assert.doesNotMatch(source, /\bfont-(?:bold|semibold|light|thin|black|extrabold|extralight)\b/, `${file}: font is not shipped`);
  }
  assert.match(tokens, /--font-weight-normal:\s*400/);
  assert.match(tokens, /--font-weight-medium:\s*500/);
  assert.match(read('src/styles/global.css'), /font-synthesis:\s*none/);
});

test('each palette defines the core surface, text and border roles', () => {
  const roles = ['text-primary', 'text-secondary', 'text-tertiary', 'text-inverse',
    'bg-page', 'bg-design', 'bg-canvas', 'bg-element', 'bg-active', 'bg-hover',
    'border-primary', 'border-secondary'];
  for (const theme of ['sand', 'dusk', 'midnight']) {
    const block = tokens.match(new RegExp(`\\[data-theme="${theme}"\\] \\{([^}]+)\\}`))?.[1];
    assert.ok(block, `Missing theme ${theme}`);
    for (const role of roles) assert.ok(block.includes(`--color-${role}:`), `${theme} missing ${role}`);
  }
});

test('shared header geometry and overlay order prevent overlap regressions', () => {
  for (const file of ['src/components/canvas/Chrome.astro']) {
    assert.ok(read(file).includes('var(--header-height)'), `${file}: header offset must share its token`);
  }
  const layer = name => Number(tokens.match(new RegExp(`--layer-${name}:\\s*(\\d+)`))?.[1]);
  assert.ok(layer('controls') < layer('welcome'));
  assert.ok(layer('welcome') < layer('header'));
  assert.ok(layer('header') < layer('modal'));
  assert.ok(layer('modal') < layer('media-modal'));
});
