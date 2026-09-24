import { describe, expect, it } from 'vitest';
import { parseEnhanceResult } from '../../src/enhance/parse';

describe('parseEnhanceResult', () => {
  it('parses plain JSON', () => {
    expect(parseEnhanceResult('{"improved":"Merhaba","changes":["yazım"],"questions":[]}')).toEqual({
      improved: 'Merhaba',
      changes: ['yazım'],
      questions: [],
    });
  });

  it('accepts code fences and surrounding prose', () => {
    const raw = 'İşte:\n```json\n{"improved":"A","questions":[{"question":"B mi C mi?","options":["B","C"],"kind":"contradiction"}]}\n```';
    expect(parseEnhanceResult(raw)).toEqual({
      improved: 'A',
      changes: [],
      questions: [{ question: 'B mi C mi?', options: ['B', 'C'], kind: 'contradiction' }],
    });
  });

  it('normalises unknown kinds and caps lists', () => {
    const questions = Array.from({ length: 5 }, (_, i) => ({ question: `q${i}`, options: ['1', '2', '3', '4', '5'], kind: 'x' }));
    const result = parseEnhanceResult(JSON.stringify({ improved: 'A', questions }));
    expect(result?.questions).toHaveLength(3);
    expect(result?.questions[0]).toEqual({ question: 'q0', options: ['1', '2', '3', '4'], kind: 'ambiguity' });
  });

  it('rejects missing or empty improved text', () => {
    expect(parseEnhanceResult('{"changes":[]}')).toBeUndefined();
    expect(parseEnhanceResult('{"improved":"  "}')).toBeUndefined();
    expect(parseEnhanceResult('not json')).toBeUndefined();
  });
});
