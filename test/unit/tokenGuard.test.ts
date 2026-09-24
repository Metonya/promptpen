import { describe, expect, it } from 'vitest';
import { missingTokens, protectedTokens } from '../../src/enhance/tokenGuard';

describe('protectedTokens', () => {
  it('finds references, mentions, commands, links and code', () => {
    const text =
      '/fix @workspace #file:src/auth.ts içindeki `login()` hatasını düzelt, bkz. https://example.com/a?b=1.\n```ts\nconst a = 1;\n```';
    expect(protectedTokens(text)).toEqual([
      '```ts\nconst a = 1;\n```',
      '`login()`',
      'https://example.com/a?b=1',
      '/fix',
      '@workspace',
      '#file:src/auth.ts',
    ]);
  });

  it('ignores headings, e-mail addresses, C# and fractions', () => {
    expect(protectedTokens('## Başlık\nmail a@b.com, C# ve 1/2 ve/veya')).toEqual([]);
  });

  it('drops trailing sentence punctuation from references', () => {
    expect(protectedTokens('bak #file:a.ts.')).toEqual(['#file:a.ts']);
  });
});

describe('missingTokens', () => {
  it('passes when every token survives', () => {
    expect(missingTokens('@workspace #file:a.ts nedn bozuk', '@workspace #file:a.ts neden bozuk?')).toEqual([]);
  });

  it('reports altered tokens', () => {
    expect(missingTokens('#file:atuh.ts düzelt', '#file:auth.ts dosyasını düzelt')).toEqual(['#file:atuh.ts']);
  });

  it('counts repeated tokens', () => {
    expect(missingTokens('`x` ve `x`', 'yalnızca `x`')).toEqual(['`x`']);
  });
});
