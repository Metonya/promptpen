import * as vscode from 'vscode';
import type { CancellationLike, ChatMessage, TextModel } from '../enhance/types';
import { findModel, isAutoIdentifier, readChatModelIdentifier } from './chatModel';

const SETTING = 'model';
const CHAT_MODEL_POLL_MS = 5000;

const modelKey = (m: vscode.LanguageModelChat) => `${m.vendor}/${m.id}`;

export interface CurrentModel {
  model: vscode.LanguageModelChat;
  /** `selected`: picked in PromptPen and kept; `chat`: follows the model selected in the chat view. */
  source: 'selected' | 'chat';
}

/**
 * Language models come from vscode.lm: Copilot's models plus any the user added to VS Code chat.
 * Until the user picks a model for PromptPen, it uses the model selected in the chat view.
 */
export class ModelService implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;
  private readonly disposables: vscode.Disposable[] = [this._onDidChange];
  private lastChatModel: string | undefined;

  /** @param globalStorageDir VS Code's `User/globalStorage` folder, which holds its state database. */
  constructor(private readonly globalStorageDir: string) {
    this.lastChatModel = this.chatModelIdentifier();
    const poll = setInterval(() => {
      if (!vscode.window.state.focused) return;
      const chatModel = this.chatModelIdentifier();
      if (chatModel !== this.lastChatModel) {
        this.lastChatModel = chatModel;
        this._onDidChange.fire();
      }
    }, CHAT_MODEL_POLL_MS);
    this.disposables.push(
      { dispose: () => clearInterval(poll) },
      vscode.lm.onDidChangeChatModels(() => this._onDidChange.fire()),
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration(`promptpen.${SETTING}`)) this._onDidChange.fire();
      }),
    );
  }

  private configured(): string {
    return vscode.workspace.getConfiguration('promptpen').get<string>(SETTING, '');
  }

  private chatModelIdentifier(): string | undefined {
    return readChatModelIdentifier(this.globalStorageDir);
  }

  /** The model PromptPen uses right now without asking, if any. */
  async current(): Promise<CurrentModel | undefined> {
    const models = await vscode.lm.selectChatModels();
    const key = this.configured();
    const selected = key ? models.find(m => modelKey(m) === key) : undefined;
    if (selected) return { model: selected, source: 'selected' };
    const chatModel = this.chatModelIdentifier();
    const followed = chatModel && !isAutoIdentifier(chatModel) ? findModel(models, chatModel) : undefined;
    return followed && { model: followed, source: 'chat' };
  }

  /** The model to use; asks once when neither a PromptPen choice nor a usable chat model exists. */
  async resolve(): Promise<vscode.LanguageModelChat | undefined> {
    const current = await this.current();
    if (current) return current.model;
    const chatModel = this.chatModelIdentifier();
    return this.pick(
      chatModel && isAutoIdentifier(chatModel)
        ? vscode.l10n.t('Chat is set to Auto, which can route to large models. Pick a model for PromptPen once:')
        : undefined,
    );
  }

  async pick(reason?: string): Promise<vscode.LanguageModelChat | undefined> {
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
    const chatModelId = this.chatModelIdentifier();
    const chatModel = chatModelId && !isAutoIdentifier(chatModelId) ? findModel(models, chatModelId) : undefined;
    type Item = vscode.QuickPickItem & { model?: vscode.LanguageModelChat; follow?: boolean };
    const items: Item[] = [];
    if (chatModel) {
      items.push(
        {
          follow: true,
          model: chatModel,
          label: `${selected ? '' : '$(check) '}$(sync) ${vscode.l10n.t('Use the chat model')}`,
          description: chatModel.name,
          detail: vscode.l10n.t('Follows the model selected in the chat view'),
        },
        { label: '', kind: vscode.QuickPickItemKind.Separator },
      );
    }
    items.push(
      ...[...models]
        .sort((a, b) => a.vendor.localeCompare(b.vendor) || a.name.localeCompare(b.name))
        .map(model => ({
          model,
          label: `${modelKey(model) === selected ? '$(check) ' : ''}${model.name}`,
          description: `${model.vendor} · ${model.family}`,
          detail: vscode.l10n.t('{0}K input tokens', Math.round(model.maxInputTokens / 1000)),
        })),
    );
    const choice = await vscode.window.showQuickPick(items, {
      title: vscode.l10n.t('PromptPen: Model for improving prompts'),
      placeHolder: reason ?? vscode.l10n.t('Small, fast models are usually enough and cost less'),
      matchOnDescription: true,
    });
    if (!choice?.model) return undefined;
    // Following the chat model is the default, stored as an empty setting.
    const value = choice.follow ? undefined : modelKey(choice.model);
    await vscode.workspace.getConfiguration('promptpen').update(SETTING, value, vscode.ConfigurationTarget.Global);
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
