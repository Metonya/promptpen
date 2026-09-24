import * as vscode from 'vscode';
import type { ModelService } from '../llm/ModelService';

/** Status bar entry showing the model PromptPen uses; clicking opens the PromptPen menu. */
export class StatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem('promptpen.status', vscode.StatusBarAlignment.Right, 100);
  private readonly disposables: vscode.Disposable[] = [this.item];

  constructor(private readonly models: ModelService) {
    this.item.name = 'PromptPen';
    this.item.command = 'promptpen.showMenu';
    this.disposables.push(
      models.onDidChange(() => void this.refresh()),
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('promptpen')) void this.refresh();
      }),
    );
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    const config = vscode.workspace.getConfiguration('promptpen');
    if (!config.get<boolean>('statusBar', true)) {
      this.item.hide();
      return;
    }
    const current = await this.models.current();
    const model = current?.model;
    const mode = config.get<string>('mode', 'expand') === 'fix' ? vscode.l10n.t('Fix') : vscode.l10n.t('Expand');
    this.item.text = `$(sparkle) ${model?.name ?? 'PromptPen'}`;
    this.item.tooltip = new vscode.MarkdownString(
      [
        '**PromptPen**',
        current?.source === 'chat'
          ? vscode.l10n.t('Model: {0} (follows the chat model)', current.model.name)
          : vscode.l10n.t('Model: {0}', model?.name ?? vscode.l10n.t('not selected')),
        vscode.l10n.t('Mode: {0}', mode),
        '',
        vscode.l10n.t('Click for the PromptPen menu.'),
      ].join('  \n'),
    );
    this.item.show();
  }

  dispose(): void {
    vscode.Disposable.from(...this.disposables).dispose();
  }
}
