import * as vscode from 'vscode';

/** URI scheme VS Code uses for the text model behind each chat input box. */
export const CHAT_INPUT_SCHEME = 'chatSessionInput';

const isChatInput = (doc: vscode.TextDocument) => doc.uri.scheme === CHAT_INPUT_SCHEME;

/**
 * Reads and writes the text of VS Code's native chat input boxes. Their text models are synced to
 * extensions as regular documents, so edits go through WorkspaceEdit and remain undoable (Ctrl+Z).
 */
export class ChatInputBridge implements vscode.Disposable {
  private lastActive: string | undefined;
  private readonly _onDidChange = new vscode.EventEmitter<vscode.TextDocument>();
  /** Fires whenever the text of any chat input changes. */
  readonly onDidChange = this._onDidChange.event;
  private readonly disposables: vscode.Disposable[] = [this._onDidChange];

  constructor() {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(e => {
        if (!isChatInput(e.document) || e.contentChanges.length === 0) return;
        this.lastActive = e.document.uri.toString();
        this._onDidChange.fire(e.document);
      }),
    );
  }

  /**
   * The chat input the user is working in. The extension API does not expose focus for chat inputs,
   * so this is the one typed into most recently, falling back to the only one that holds text.
   */
  activeInput(): vscode.TextDocument | undefined {
    const inputs = vscode.workspace.textDocuments.filter(isChatInput);
    const last = inputs.find(d => d.uri.toString() === this.lastActive);
    if (last?.getText().trim()) return last;
    const withText = inputs.filter(d => d.getText().trim());
    return withText.length === 1 ? withText[0] : (last ?? withText[0]);
  }

  async replace(doc: vscode.TextDocument, text: string): Promise<boolean> {
    if (doc.getText() === text) return true;
    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), text);
    if (await vscode.workspace.applyEdit(edit)) return true;
    // Fallback for inputs that reject workspace edits: set (not send) the text of the chat view input.
    await vscode.commands.executeCommand('workbench.action.chat.open', { query: text, isPartialQuery: true });
    return doc.getText() === text;
  }

  dispose(): void {
    vscode.Disposable.from(...this.disposables).dispose();
  }
}
