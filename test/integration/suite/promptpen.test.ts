import * as assert from 'node:assert';
import * as vscode from 'vscode';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function waitFor<T>(probe: () => T | undefined | false, what: string, timeout = 10000): Promise<T> {
  const end = Date.now() + timeout;
  for (;;) {
    const value = probe();
    if (value) return value;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await sleep(100);
  }
}

const chatInput = () => vscode.workspace.textDocuments.find(d => d.uri.scheme === 'chatSessionInput');

async function typeIntoChat(text: string): Promise<vscode.TextDocument> {
  await vscode.commands.executeCommand('workbench.action.chat.open', { query: text, isPartialQuery: true });
  return waitFor(() => {
    const doc = chatInput();
    return doc?.getText() === text && doc;
  }, 'chat input text');
}

describe('PromptPen in the chat input', function () {
  this.timeout(60000);

  before(async () => {
    await waitFor(() => vscode.extensions.getExtension('metonya.promptpen')?.isActive, 'PromptPen activation');
    for (const end = Date.now() + 10000; !(await vscode.lm.selectChatModels({ vendor: 'promptpen-fake' })).length; ) {
      if (Date.now() > end) throw new Error('Timed out waiting for the fake model');
      await sleep(100);
    }
    await vscode.workspace.getConfiguration('promptpen').update('model', 'promptpen-fake/fake-fixer', vscode.ConfigurationTarget.Global);
  });

  it('improves the prompt in place and navigates between versions', async () => {
    const doc = await typeIntoChat('merhba dunya, #file:a.ts deki hatyı düzelt');
    await vscode.commands.executeCommand('promptpen.enhance');
    const improved = 'merhaba dünya, #file:a.ts deki hatayı düzelt';
    await waitFor(() => doc.getText() === improved, 'improved text');

    await vscode.commands.executeCommand('promptpen.previousVersion');
    assert.strictEqual(doc.getText(), 'merhba dunya, #file:a.ts deki hatyı düzelt');
    await vscode.commands.executeCommand('promptpen.nextVersion');
    assert.strictEqual(doc.getText(), improved);
  });

  it('keeps manual edits when going back', async () => {
    const doc = await typeIntoChat('merhba');
    await vscode.commands.executeCommand('promptpen.enhance');
    await waitFor(() => doc.getText() === 'merhaba', 'improved text');
    const edit = new vscode.WorkspaceEdit();
    edit.insert(doc.uri, doc.positionAt(doc.getText().length), ' ve elle ekledim');
    await vscode.workspace.applyEdit(edit);

    await vscode.commands.executeCommand('promptpen.previousVersion');
    assert.strictEqual(doc.getText(), 'merhaba');
    await vscode.commands.executeCommand('promptpen.nextVersion');
    assert.strictEqual(doc.getText(), 'merhaba ve elle ekledim');
  });

  it('asks clarifying questions and folds the answer in', async () => {
    const doc = await typeIntoChat('merhba, burada bir çelişki var');
    const run = vscode.commands.executeCommand('promptpen.enhance');
    await waitFor(() => doc.getText() === 'merhaba, burada bir çelişki var', 'first pass');
    await sleep(500); // let the question picker open
    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
    await run;
    assert.strictEqual(doc.getText(), 'merhaba, burada bir çelişki var (Birinci)');

    await vscode.commands.executeCommand('promptpen.previousVersion');
    assert.strictEqual(doc.getText(), 'merhaba, burada bir çelişki var');
  });

  it('leaves the prompt untouched when the model breaks protected tokens', async () => {
    const doc = await typeIntoChat('BOZ merhba #file:a.ts');
    await vscode.commands.executeCommand('promptpen.enhance');
    assert.strictEqual(doc.getText(), 'BOZ merhba #file:a.ts');
  });

  it('leaves the prompt untouched when the model does not answer in JSON', async () => {
    const doc = await typeIntoChat('JUNK merhba');
    await vscode.commands.executeCommand('promptpen.enhance');
    assert.strictEqual(doc.getText(), 'JUNK merhba');
  });

  it('undoes an improvement with Ctrl+Z', async () => {
    const doc = await typeIntoChat('dunya');
    await vscode.commands.executeCommand('promptpen.enhance');
    await waitFor(() => doc.getText() === 'dünya', 'improved text');
    await vscode.commands.executeCommand('workbench.action.chat.focusInput');
    await vscode.commands.executeCommand('undo');
    await waitFor(() => doc.getText() === 'dunya', 'undo');
  });
});
