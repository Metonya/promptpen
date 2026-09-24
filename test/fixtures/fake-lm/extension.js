// A deterministic language model for PromptPen's integration tests.
const vscode = require('vscode');

const textOf = message =>
  message.content.map(part => (part instanceof vscode.LanguageModelTextPart ? part.value : '')).join('');

const lastDraft = text => {
  const blocks = [...text.matchAll(/<<<DRAFT\n([\s\S]*?)\nDRAFT>>>/g)];
  return blocks.length ? blocks[blocks.length - 1][1] : '';
};

const fix = draft => draft.replace(/merhba/g, 'merhaba').replace(/dunya/g, 'dünya').replace(/hatyı/g, 'hatayı');

function reply(messages) {
  const texts = messages.map(textOf);
  const last = texts[texts.length - 1];
  const draft = lastDraft(texts[1] ?? '');
  if (draft.includes('JUNK')) return 'Tabii, işte daha iyi bir prompt!';
  if (last.startsWith('The developer answered')) {
    const answers = [...last.matchAll(/^A: (.*)$/gm)].map(m => m[1]);
    return JSON.stringify({ improved: `${lastDraft(last)} (${answers.join(', ')})`, changes: ['cevaplar eklendi'], questions: [] });
  }
  let improved = fix(draft);
  if (draft.includes('BOZ')) improved = improved.replace('#file:a.ts', '#file:A.ts');
  const questions = draft.includes('çelişki')
    ? [{ question: 'Hangisi geçerli?', options: ['Birinci', 'İkinci'], kind: 'contradiction' }]
    : [];
  return JSON.stringify({ improved, changes: ['yazım düzeltildi'], questions });
}

exports.activate = context => {
  context.subscriptions.push(
    vscode.lm.registerLanguageModelChatProvider('promptpen-fake', {
      provideLanguageModelChatInformation: () => [
        {
          id: 'fake-fixer',
          name: 'Fake Fixer',
          family: 'fake',
          version: '1',
          maxInputTokens: 100000,
          maxOutputTokens: 4000,
          capabilities: {},
        },
      ],
      provideLanguageModelChatResponse: async (_model, messages, _options, progress) => {
        progress.report(new vscode.LanguageModelTextPart(reply(messages)));
      },
      provideTokenCount: async (_model, text) => (typeof text === 'string' ? text.length : 1),
    }),
  );
};
