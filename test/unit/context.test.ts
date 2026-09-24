import { describe, expect, it } from 'vitest';
import { fitSections } from '../../src/context/budget';
import { formatTurns, parseChatSession } from '../../src/context/chatSessionParser';

describe('fitSections', () => {
  it('keeps everything that fits, in order', () => {
    const out = fitSections(
      [
        { title: 'A', body: 'aaa', priority: 2 },
        { title: 'B', body: 'bbb', priority: 1 },
      ],
      1000,
    );
    expect(out).toBe('## A\naaa\n\n## B\nbbb');
  });

  it('truncates and drops the lowest priority sections first', () => {
    const out = fitSections(
      [
        { title: 'Low', body: 'x'.repeat(500), priority: 9 },
        { title: 'High', body: 'y'.repeat(100), priority: 0 },
      ],
      200,
    );
    expect(out).toContain('## High\n' + 'y'.repeat(100));
    expect(out).toContain('[…truncated]');
    expect(out.length).toBeLessThanOrEqual(200);
  });

  it('skips empty sections', () => {
    expect(fitSections([{ title: 'E', body: '  ', priority: 0 }], 100)).toBe('');
  });
});

describe('parseChatSession', () => {
  const lines = [
    { kind: 0, v: { version: 3, requests: [{ message: { text: 'ilk soru' }, response: [{ value: 'ilk ' }, { value: 'cevap' }] }] } },
    { kind: 1, k: ['inputState', 'inputText'], v: 'yazılıyor' },
    { kind: 2, k: ['requests'], v: [{ message: { text: 'ikinci soru' }, response: [] }] },
    { kind: 2, k: ['requests', 1, 'response'], v: [{ kind: 'thinking', value: 'gizli' }, { value: 'ikinci cevap' }] },
    { kind: 2, k: ['requests', 1, 'response'], i: 1, v: [{ value: 'düzeltilmiş cevap' }] },
  ];
  const content = lines.map(l => JSON.stringify(l)).join('\n') + '\n{"broken';

  it('replays the mutation log', () => {
    expect(parseChatSession(content)).toEqual([
      { user: 'ilk soru', assistant: 'ilk cevap' },
      { user: 'ikinci soru', assistant: 'düzeltilmiş cevap' },
    ]);
  });

  it('returns nothing for unknown content', () => {
    expect(parseChatSession('{"kind":1,"k":["x"],"v":1}')).toEqual([]);
    expect(parseChatSession('')).toEqual([]);
  });

  it('formats the latest turns and clips long answers', () => {
    const text = formatTurns([{ user: 'a', assistant: 'b'.repeat(10) }, { user: 'c', assistant: '' }], 2, 4);
    expect(text).toBe('User: a\nAssistant: …bbbb\n\nUser: c');
  });
});
