import { describe, expect, it } from 'vitest';
import { EnhanceError, Enhancer } from '../../src/enhance/Enhancer';
import type { ChatMessage, TextModel } from '../../src/enhance/types';

class ScriptedModel implements TextModel {
  readonly calls: ChatMessage[][] = [];
  constructor(private readonly replies: string[]) {}
  async complete(messages: ChatMessage[]): Promise<string> {
    this.calls.push(messages);
    const reply = this.replies.shift();
    if (reply === undefined) throw new Error('no more replies');
    return reply;
  }
}

const json = (improved: string, extra: object = {}) => JSON.stringify({ improved, changes: [], questions: [], ...extra });
const request = { draft: '#file:a.ts deki hatyı düzelt', mode: 'fix' as const, language: 'same' as const, context: '' };

describe('Enhancer', () => {
  it('returns the improved prompt', async () => {
    const model = new ScriptedModel([json('#file:a.ts dosyasındaki hatayı düzelt')]);
    const { result } = await new Enhancer(model).enhance(request);
    expect(result.improved).toBe('#file:a.ts dosyasındaki hatayı düzelt');
    expect(model.calls[0][1].content).toContain('#file:a.ts deki hatyı düzelt');
  });

  it('retries once when the reply is not JSON', async () => {
    const model = new ScriptedModel(['Tabii!', json('#file:a.ts dosyasındaki hatayı düzelt')]);
    const { result } = await new Enhancer(model).enhance(request);
    expect(result.improved).toContain('hatayı');
    expect(model.calls).toHaveLength(2);
  });

  it('fails after two unusable replies', async () => {
    const model = new ScriptedModel(['a', 'b']);
    await expect(new Enhancer(model).enhance(request)).rejects.toMatchObject({ code: 'format' });
  });

  it('asks again when protected tokens are changed', async () => {
    const model = new ScriptedModel([json('#file:A.ts hatayı düzelt'), json('#file:a.ts hatayı düzelt')]);
    const { result } = await new Enhancer(model).enhance(request);
    expect(result.improved).toBe('#file:a.ts hatayı düzelt');
    expect(model.calls[1].at(-1)?.content).toContain('#file:a.ts');
  });

  it('rejects when tokens are still missing after the retry', async () => {
    const model = new ScriptedModel([json('hatayı düzelt'), json('hatayı düzelt')]);
    const error = await new Enhancer(model).enhance(request).catch(e => e);
    expect(error).toBeInstanceOf(EnhanceError);
    expect(error).toMatchObject({ code: 'tokens', detail: ['#file:a.ts'] });
  });

  it('folds answers into a follow-up pass', async () => {
    const model = new ScriptedModel([
      json('#file:a.ts hatayı düzelt', { questions: [{ question: 'Test yazılsın mı?', options: ['Evet', 'Hayır'], kind: 'missing' }] }),
      json('#file:a.ts hatayı düzelt ve test yaz'),
    ]);
    const enhancer = new Enhancer(model);
    const first = await enhancer.enhance(request);
    expect(first.result.questions).toHaveLength(1);
    const second = await enhancer.answer(first, request.draft, [{ question: 'Test yazılsın mı?', answer: 'Evet' }]);
    expect(second.result.improved).toBe('#file:a.ts hatayı düzelt ve test yaz');
    expect(model.calls[1].at(-1)?.content).toContain('A: Evet');
  });

  it('stops when cancelled', async () => {
    const model = new ScriptedModel([json('x')]);
    await expect(new Enhancer(model).enhance(request, { isCancellationRequested: true })).rejects.toMatchObject({ code: 'cancelled' });
    expect(model.calls).toHaveLength(0);
  });
});
