import * as vscode from 'vscode';
import type { ChatInputBridge } from './chatInput/ChatInputBridge';
import type { ContextCollector } from './context/ContextCollector';
import { EnhanceError, Enhancer } from './enhance/Enhancer';
import type { EnhanceResult, Mode, OutputLanguage } from './enhance/types';
import { VersionStore } from './history/VersionStore';
import { LmTextModel, type ModelService } from './llm/ModelService';
import type { DiffView } from './ui/DiffView';
import { askQuestions } from './ui/Questions';

const config = () => vscode.workspace.getConfiguration('promptpen');

export class PromptPen implements vscode.Disposable {
  private readonly versions = new VersionStore();
  private running = false;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly bridge: ChatInputBridge,
    private readonly models: ModelService,
    private readonly collector: ContextCollector,
    private readonly diff: DiffView,
  ) {
    this.disposables.push(
      bridge.onDidChange(doc => {
        if (!doc.getText()) this.versions.clear(doc.uri.toString());
        this.updateContextKeys();
      }),
    );
    this.updateContextKeys();
  }

  async enhance(modeOverride?: Mode): Promise<void> {
    if (this.running) {
      vscode.window.setStatusBarMessage(vscode.l10n.t('$(loading~spin) PromptPen is already improving a prompt…'), 3000);
      return;
    }
    const doc = this.bridge.activeInput();
    if (!doc?.getText().trim()) {
      vscode.window.showInformationMessage(vscode.l10n.t('Type a prompt in the chat input first, then improve it.'));
      return;
    }
    const model = await this.models.resolve();
    // Read the draft only now: the user may have kept typing while picking a model.
    const draft = doc.getText();
    if (!model || doc.isClosed || !draft.trim()) return;

    const mode = modeOverride ?? config().get<Mode>('mode', 'expand');
    const language = config().get<OutputLanguage>('outputLanguage', 'same');
    const enhancer = new Enhancer(new LmTextModel(model));
    this.setRunning(true);
    try {
      const startVersion = doc.version;
      const first = await this.withProgress(vscode.l10n.t('Improving prompt with {0}…', model.name), async token =>
        enhancer.enhance({ draft, mode, language, context: await this.collector.collect(mode) }, token),
      );
      if (!first || !(await this.apply(doc, draft, startVersion, first.result))) return;

      const { questions } = first.result;
      if (!questions.length || !config().get<boolean>('askQuestions', true)) return;
      const answers = await askQuestions(questions);
      if (!answers?.length) return;
      const afterFirst = doc.getText();
      const answeredVersion = doc.version;
      const second = await this.withProgress(vscode.l10n.t('Adding your answers to the prompt…'), token =>
        enhancer.answer(first, draft, answers, token),
      );
      if (second) await this.apply(doc, afterFirst, answeredVersion, second.result);
    } catch (error) {
      this.report(error);
    } finally {
      this.setRunning(false);
    }
  }

  async previous(): Promise<void> {
    const doc = this.bridge.activeInput();
    if (!doc) return;
    const text = this.versions.back(doc.uri.toString(), doc.getText());
    if (text !== undefined) await this.bridge.replace(doc, text);
    this.updateContextKeys();
  }

  async next(): Promise<void> {
    const doc = this.bridge.activeInput();
    if (!doc) return;
    const text = this.versions.forward(doc.uri.toString(), doc.getText());
    if (text !== undefined) await this.bridge.replace(doc, text);
    this.updateContextKeys();
  }

  async showDiff(): Promise<void> {
    const doc = this.bridge.activeInput();
    const original = doc && this.versions.original(doc.uri.toString());
    if (!doc || original === undefined) {
      vscode.window.showInformationMessage(vscode.l10n.t('There is no improved prompt to compare yet.'));
      return;
    }
    await this.diff.show(original, doc.getText());
  }

  versionState() {
    const doc = this.bridge.activeInput();
    return doc ? this.versions.state(doc.uri.toString(), doc.getText()) : undefined;
  }

  /** Writes an improved prompt into the input unless the user changed it in the meantime. */
  private async apply(doc: vscode.TextDocument, expected: string, version: number, result: EnhanceResult): Promise<boolean> {
    if (doc.isClosed) {
      const copy = vscode.l10n.t('Copy Improved Prompt');
      void vscode.window.showWarningMessage(vscode.l10n.t('The chat input was closed.'), copy).then(choice => {
        if (choice === copy) return vscode.env.clipboard.writeText(result.improved);
      });
      return false;
    }
    const current = doc.getText();
    if (doc.version !== version && current !== expected) {
      const replace = vscode.l10n.t('Replace');
      const choice = await vscode.window.showInformationMessage(
        vscode.l10n.t('The prompt changed while PromptPen was working. Replace it with the improved version?'),
        replace,
        vscode.l10n.t('Keep Mine'),
      );
      if (choice !== replace) return false;
    }
    if (result.improved === current) {
      vscode.window.setStatusBarMessage(vscode.l10n.t('$(check) PromptPen: the prompt already looks good'), 5000);
      return true;
    }
    const key = doc.uri.toString();
    this.versions.push(key, current, result.improved);
    await this.bridge.replace(doc, result.improved);
    this.updateContextKeys();
    if (config().get<boolean>('showSummary', true)) {
      const { position } = this.versions.state(key, result.improved);
      const summary = result.changes.length ? result.changes.join(' · ') : vscode.l10n.t('prompt improved');
      vscode.window.setStatusBarMessage(`$(sparkle) v${position}: ${summary}`, 8000);
    }
    return true;
  }

  private withProgress<T>(title: string, task: (token: vscode.CancellationToken) => Promise<T>): Promise<T | undefined> {
    return Promise.resolve(
      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `PromptPen: ${title}`, cancellable: true },
        async (_progress, token) => {
          try {
            return await task(token);
          } catch (error) {
            if (token.isCancellationRequested) return undefined;
            throw error;
          }
        },
      ),
    );
  }

  private report(error: unknown): void {
    if (error instanceof EnhanceError && error.code === 'cancelled') return;
    if (error instanceof vscode.CancellationError) return;
    const pickModel = vscode.l10n.t('Choose Another Model');
    let message: string;
    if (error instanceof EnhanceError && error.code === 'tokens') {
      message = vscode.l10n.t(
        'Your prompt was left unchanged because the model altered references or code that must stay exactly as written: {0}',
        (error.detail ?? []).join(', '),
      );
    } else if (error instanceof EnhanceError) {
      message = vscode.l10n.t("The model's answer could not be used. Try again or choose another model.");
    } else if (error instanceof vscode.LanguageModelError) {
      message =
        error.code === vscode.LanguageModelError.NoPermissions.name
          ? vscode.l10n.t('PromptPen is not allowed to use this model. Allow access when VS Code asks, or choose another model.')
          : error.code === vscode.LanguageModelError.Blocked.name
            ? vscode.l10n.t('The model rejected the request (quota or rate limit). Try again later or choose another model.')
            : vscode.l10n.t('The language model failed: {0}', error.message);
    } else {
      message = vscode.l10n.t('PromptPen failed: {0}', error instanceof Error ? error.message : String(error));
    }
    // Not awaited: the command should finish while the notification stays open.
    void vscode.window.showErrorMessage(message, pickModel).then(choice => {
      if (choice === pickModel) return this.models.pick();
    });
  }

  private setRunning(running: boolean): void {
    this.running = running;
    void vscode.commands.executeCommand('setContext', 'promptpen.running', running);
  }

  private updateContextKeys(): void {
    const state = this.versionState();
    void vscode.commands.executeCommand('setContext', 'promptpen.canGoBack', !!state?.canGoBack);
    void vscode.commands.executeCommand('setContext', 'promptpen.canGoForward', !!state?.canGoForward);
    void vscode.commands.executeCommand('setContext', 'promptpen.hasVersions', !!state && state.total > 0);
  }

  dispose(): void {
    vscode.Disposable.from(...this.disposables).dispose();
  }
}
