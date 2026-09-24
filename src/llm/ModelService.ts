import * as vscode from 'vscode';
import type { CancellationLike, ChatMessage, TextModel } from '../enhance/types';

const SETTING = 'model';

const modelKey = (m: vscode.LanguageModelChat) => `${m.vendor}/${m.id}`;

/** Language models come from vscode.lm: Copilot's models plus any the user added to VS Code chat. */
export class ModelService implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;
  private readonly disposables: vscode.Disposable[] = [this._onDidChange];

  constructor() {
    this.disposables.push(
      vscode.lm.onDidChangeChatModels(() => this._onDidChange.fire()),
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration(`promptpen.${SETTING}`)) this._onDidChange.fire();
      }),
    );
  }

  private configured(): string {
    return vscode.workspace.getConfiguration('promptpen').get<string>(SETTING, '');
  }

  /** The configured model if it is currently available. */
  async current(): Promise<vscode.LanguageModelChat | undefined> {
    const key = this.configured();
    if (!key) return undefined;
    const models = await vscode.lm.selectChatModels();
    return models.find(m => modelKey(m) === key);
  }

  /** The configured model, or asks the user to pick one when none is configured or it disappeared. */
  async resolve(): Promise<vscode.LanguageModelChat | undefined> {
    return (await this.current()) ?? this.pick();
  }

  async pick(): Promise<vscode.LanguageModelChat | undefined> {
    const models = await vscode.lm.selectChatModels();
    if (models.length === 0) {
      const manage = vscode.l10n.t('Manage Models');
      const choice = await vscode.window.showWarningMessage(
        vscode.l10n.t('No language model is available. Sign in to GitHub Copilot or add a model to VS Code chat.'),
        manage,
      );
      if (choice === manage) await vscode.commands.executeCommand('workbench.action.chat.manage');
      return undefined;
    }
    const selected = this.configured();
    type Item = vscode.QuickPickItem & { model: vscode.LanguageModelChat };
    const items: Item[] = [...models]
      .sort((a, b) => a.vendor.localeCompare(b.vendor) || a.name.localeCompare(b.name))
      .map(model => ({
        model,
        label: `${modelKey(model) === selected ? '$(check) ' : ''}${model.name}`,
        description: `${model.vendor} · ${model.family}`,
        detail: vscode.l10n.t('{0}K input tokens', Math.round(model.maxInputTokens / 1000)),
      }));
    const choice = await vscode.window.showQuickPick(items, {
      title: vscode.l10n.t('PromptPen: Model for improving prompts'),
      placeHolder: vscode.l10n.t('Small, fast models are usually enough and cost less'),
      matchOnDescription: true,
    });
    if (!choice) return undefined;
    await vscode.workspace.getConfiguration('promptpen').update(SETTING, modelKey(choice.model), vscode.ConfigurationTarget.Global);
    return choice.model;
  }

  dispose(): void {
    vscode.Disposable.from(...this.disposables).dispose();
  }
}

/** Adapts a vscode.lm model to the enhancer's {@link TextModel}. */
export class LmTextModel implements TextModel {
  constructor(private readonly model: vscode.LanguageModelChat) {}

  async complete(messages: ChatMessage[], token?: CancellationLike): Promise<string> {
    const lmMessages = messages.map(m =>
      m.role === 'user' ? vscode.LanguageModelChatMessage.User(m.content) : vscode.LanguageModelChatMessage.Assistant(m.content),
    );
    const response = await this.model.sendRequest(
      lmMessages,
      { justification: vscode.l10n.t('PromptPen rewrites the prompt you typed in chat.') },
      token as vscode.CancellationToken | undefined,
    );
    let text = '';
    for await (const chunk of response.text) text += chunk;
    return text;
  }
}
