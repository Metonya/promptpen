import * as vscode from 'vscode';

const SCHEME = 'promptpen';

/** Shows two prompt texts side by side in VS Code's diff editor. */
export class DiffView implements vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly contents = new Map<string, string>();
  private readonly registration = vscode.workspace.registerTextDocumentContentProvider(SCHEME, this);
  private counter = 0;

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.path) ?? '';
  }

  async show(before: string, after: string): Promise<void> {
    const id = ++this.counter;
    const left = vscode.Uri.from({ scheme: SCHEME, path: `/${id}/${vscode.l10n.t('original')}.md` });
    const right = vscode.Uri.from({ scheme: SCHEME, path: `/${id}/${vscode.l10n.t('improved')}.md` });
    this.contents.set(left.path, before);
    this.contents.set(right.path, after);
    await vscode.commands.executeCommand('vscode.diff', left, right, vscode.l10n.t('Prompt: original ↔ current'), {
      preview: true,
    });
  }

  dispose(): void {
    this.registration.dispose();
    this.contents.clear();
  }
}
