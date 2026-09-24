import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { type Page, chromium } from 'playwright-core';

/**
 * Drives the real workbench UI over the Chrome DevTools Protocol (the test instance is launched with
 * --remote-debugging-port, see runTest.ts), so menu placement and clicks are tested as a user sees them.
 */
const CDP_PORT = process.env.PROMPTPEN_CDP_PORT;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

(CDP_PORT ? describe : describe.skip)('PromptPen buttons in the chat view', function () {
  this.timeout(60000);
  let page: Page;
  let close: () => Promise<void>;

  before(async () => {
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
    close = () => browser.close().catch(() => undefined);
    page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('workbench'))!;
  });
  after(() => close?.());

  const visibleTitleActions = () =>
    page
      .locator('.part.auxiliarybar .composite.title .actions-container li a[aria-label]')
      .evaluateAll(els => els.map(e => e.getAttribute('aria-label') ?? ''));
  const titleButton = (label: string) =>
    page.locator(`.part.auxiliarybar .composite.title a.action-label[aria-label^="${label}"]`).first();

  async function resetInput(text: string): Promise<vscode.TextDocument> {
    // Start like after sending a message: an empty input has no version history.
    const input = vscode.workspace.textDocuments.find(d => d.uri.scheme === 'chatSessionInput');
    if (input) {
      const clear = new vscode.WorkspaceEdit();
      clear.delete(input.uri, new vscode.Range(input.positionAt(0), input.positionAt(input.getText().length)));
      await vscode.workspace.applyEdit(clear);
    }
    await vscode.commands.executeCommand('workbench.action.chat.open', { query: text, isPartialQuery: true });
    await vscode.commands.executeCommand('notifications.clearAll');
    await sleep(500);
    return vscode.workspace.textDocuments.find(d => d.uri.scheme === 'chatSessionInput')!;
  }

  it('never pushes New Chat out of a narrow chat title bar', async () => {
    await resetInput('merhba');
    // How many actions fit depends on the window size; VS Code must drop ours before New Chat.
    const actions = await visibleTitleActions();
    const ours = actions.some(a => a.startsWith('Improve Prompt'));
    const newChat = actions.some(a => a.startsWith('New Chat'));
    assert.ok(!ours || newChat, `Improve Prompt shown while New Chat is hidden: ${actions.join(' | ')}`);
  });

  it('improves the prompt from the title bar and shows back/forward only when useful', async () => {
    const doc = await resetInput('merhba');
    await vscode.commands.executeCommand('workbench.action.chat.focusInput');
    // Wide enough for all title actions to fit.
    for (let i = 0; i < 6; i++) await vscode.commands.executeCommand('workbench.action.increaseViewSize');
    await sleep(500);
    let actions = await visibleTitleActions();
    assert.ok(actions.some(a => a.startsWith('Improve Prompt')), `Improve Prompt hidden: ${actions.join(' | ')}`);
    assert.ok(!actions.some(a => a.startsWith('Previous Prompt Version')));

    await titleButton('Improve Prompt').click();
    for (let i = 0; i < 50 && doc.getText() !== 'merhaba'; i++) await sleep(100);
    assert.strictEqual(doc.getText(), 'merhaba');
    await sleep(300);
    actions = await visibleTitleActions();
    assert.ok(actions.some(a => a.startsWith('Previous Prompt Version')), `no back button: ${actions.join(' | ')}`);
    assert.ok(!actions.some(a => a.startsWith('Next Prompt Version')));
    if (process.env.PROMPTPEN_SCREENSHOT) {
      await vscode.commands.executeCommand('notifications.clearAll');
      await sleep(1500);
      await page.screenshot({ path: process.env.PROMPTPEN_SCREENSHOT });
    }

    await titleButton('Previous Prompt Version').click();
    await sleep(300);
    assert.strictEqual(doc.getText(), 'merhba');
    await titleButton('Next Prompt Version').click();
    await sleep(300);
    assert.strictEqual(doc.getText(), 'merhaba');
  });
});
