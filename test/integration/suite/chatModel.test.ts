import * as assert from 'node:assert';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import * as vscode from 'vscode';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const USER_DATA_DIR = process.env.PROMPTPEN_USER_DATA_DIR;

/** Simulates picking a model in the chat view by writing the key VS Code stores it under. */
function setChatModel(identifier: string): void {
  const db = new DatabaseSync(path.join(USER_DATA_DIR!, 'User', 'globalStorage', 'state.vscdb'));
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    // Same schema VS Code uses; a fresh test profile may not have written the database yet.
    db.exec('CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)');
    db.prepare('INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)').run('chat.currentLanguageModel.panel', identifier);
  } finally {
    db.close();
  }
}

async function typeIntoChat(text: string): Promise<vscode.TextDocument> {
  const input = vscode.workspace.textDocuments.find(d => d.uri.scheme === 'chatSessionInput');
  if (input) {
    const clear = new vscode.WorkspaceEdit();
    clear.delete(input.uri, new vscode.Range(input.positionAt(0), input.positionAt(input.getText().length)));
    await vscode.workspace.applyEdit(clear);
  }
  await vscode.commands.executeCommand('workbench.action.chat.open', { query: text, isPartialQuery: true });
  await sleep(300);
  return vscode.workspace.textDocuments.find(d => d.uri.scheme === 'chatSessionInput')!;
}

(USER_DATA_DIR ? describe : describe.skip)('Model selection', function () {
  this.timeout(60000);
  const config = () => vscode.workspace.getConfiguration('promptpen');

  before(async () => {
    for (const end = Date.now() + 15000; !(await vscode.lm.selectChatModels({ vendor: 'promptpen-fake' })).length; ) {
      if (Date.now() > end) throw new Error('Timed out waiting for the fake model');
      await sleep(100);
    }
  });

  after(async () => {
    await config().update('model', 'promptpen-fake/fake-fixer', vscode.ConfigurationTarget.Global);
  });

  it('uses the chat model while no model was picked in PromptPen', async () => {
    await config().update('model', undefined, vscode.ConfigurationTarget.Global);
    setChatModel('promptpen-fake/fake-fixer');
    const doc = await typeIntoChat('merhba');
    // A model picker would block here; the chat model must be used without asking.
    await vscode.commands.executeCommand('promptpen.enhance');
    assert.strictEqual(doc.getText(), 'merhaba');
    assert.strictEqual(config().get('model'), '');
  });

  it('asks once when the chat is on Auto and keeps that choice', async () => {
    await config().update('model', undefined, vscode.ConfigurationTarget.Global);
    setChatModel('copilot/auto');
    const doc = await typeIntoChat('dunya');
    const run = vscode.commands.executeCommand('promptpen.enhance');
    await sleep(800); // let the model picker open
    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
    await run;
    assert.strictEqual(doc.getText(), 'dünya');
    assert.strictEqual(config().get('model'), 'promptpen-fake/fake-fixer');

    // The choice sticks even when the chat model changes.
    setChatModel('copilot/some-other-model');
    const next = await typeIntoChat('merhba');
    await vscode.commands.executeCommand('promptpen.enhance');
    assert.strictEqual(next.getText(), 'merhaba');
  });
});
