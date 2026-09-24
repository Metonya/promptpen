import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const json = (file: string) => JSON.parse(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')) as Record<string, string>;
const placeholders = (s: string) => (s.match(/\{\d+\}|\$\([^)]+\)/g) ?? []).sort();

describe('translations', () => {
  it.each([
    ['l10n/bundle.l10n.json', 'l10n/bundle.l10n.tr.json'],
    ['package.nls.json', 'package.nls.tr.json'],
  ])('%s and %s have the same keys and placeholders', (base, tr) => {
    const en = json(base);
    const trBundle = json(tr);
    expect(Object.keys(trBundle).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en)) expect(placeholders(trBundle[key]), key).toEqual(placeholders(en[key]));
  });

  it('every %key% in package.json is defined', () => {
    const manifest = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
    const nls = json('package.nls.json');
    for (const [, key] of manifest.matchAll(/"%([\w.]+)%"/g)) expect(nls, key).toHaveProperty([key]);
  });
});
