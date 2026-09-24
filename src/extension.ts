import * as vscode from 'vscode';
import { ChatInputBridge } from './chatInput/ChatInputBridge';
import { ContextCollector } from './context/ContextCollector';
import type { Mode } from './enhance/types';
import { runEval } from './eval/runEval';
import { ModelService } from './llm/ModelService';
import { PromptPen } from './PromptPen';
import { DiffView } from './ui/DiffView';
import { StatusBar } from './ui/StatusBar';

async function selectMode(): Promise<void> {
  const config = vscode.workspace.getConfiguration('promptpen');
  const current = config.get<Mode>('mode', 'fix');
  const items: (vscode.QuickPickItem & { mode: Mode })[] = [
    {
      mode: 'fix',
      label: `${current === 'fix' ? '$(check) ' : ''}${vscode.l10n.t('Fix')}`,
      detail: vscode.l10n.t('Fixes spelling, grammar and unclear wording; asks about contradictions. Adds nothing new.'),
    },
    {
      mode: 'expand',
      label: `${current === 'expand' ? '$(check) ' : ''}${vscode.l10n.t('Expand')}`,
      detail: vscode.l10n.t('Also makes the prompt actionable with workspace context: files, expected outcome, acceptance criteria.'),
    },
  ];
  const choice = await vscode.window.showQuickPick(items, { title: vscode.l10n.t('PromptPen: Improvement mode') });
  if (choice) await config.update('mode', choice.mode, vscode.ConfigurationTarget.Global);
}

async function showMenu(promptpen: PromptPen, models: ModelService): Promise<void> {
  const state = promptpen.versionState();
  const model = await models.current();
  const items: (vscode.QuickPickItem & { command?: string })[] = [
    { label: `$(sparkle) ${vscode.l10n.t('Improve Prompt')}`, command: 'promptpen.enhance' },
    { label: `$(wand) ${vscode.l10n.t('Improve Prompt (Expand)')}`, command: 'promptpen.enhanceExpand' },
  ];
  if (state?.total) {
    items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
    if (state.canGoBack) items.push({ label: `$(arrow-left) ${vscode.l10n.t('Previous Version')}`, command: 'promptpen.previousVersion' });
    if (state.canGoForward) items.push({ label: `$(arrow-right) ${vscode.l10n.t('Next Version')}`, command: 'promptpen.nextVersion' });
    items.push({ label: `$(diff) ${vscode.l10n.t('Compare with Original')}`, command: 'promptpen.showDiff' });
  }
  items.push(
    { label: '', kind: vscode.QuickPickItemKind.Separator },
    {
      label: `$(hubot) ${vscode.l10n.t('Select Model…')}`,
      description: model?.name ?? vscode.l10n.t('not selected'),
      command: 'promptpen.selectModel',
    },
    { label: `$(symbol-enum) ${vscode.l10n.t('Select Mode…')}`, command: 'promptpen.selectMode' },
    { label: `$(gear) ${vscode.l10n.t('Settings')}`, command: 'promptpen.openSettings' },
  );
  const choice = await vscode.window.showQuickPick(items, { title: 'PromptPen' });
  if (choice?.command) await vscode.commands.executeCommand(choice.command);
}

export function activate(context: vscode.ExtensionContext): void {
  const bridge = new ChatInputBridge();
  const models = new ModelService();
  const diff = new DiffView();
  const promptpen = new PromptPen(bridge, models, new ContextCollector(context.storageUri), diff);
  const register = (id: string, run: () => unknown) => vscode.commands.registerCommand(id, run);

  context.subscriptions.push(
    bridge,
    models,
    diff,
    promptpen,
    new StatusBar(models),
    register('promptpen.enhance', () => promptpen.enhance()),
    register('promptpen.enhanceExpand', () => promptpen.enhance('expand')),
    register('promptpen.previousVersion', () => promptpen.previous()),
    register('promptpen.nextVersion', () => promptpen.next()),
    register('promptpen.showDiff', () => promptpen.showDiff()),
    register('promptpen.selectModel', () => models.pick()),
    register('promptpen.selectMode', selectMode),
    register('promptpen.showMenu', () => showMenu(promptpen, models)),
    register('promptpen.openSettings', () =>
      vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${context.extension.id}`),
    ),
  );

  if (context.extensionMode === vscode.ExtensionMode.Development) {
    void vscode.commands.executeCommand('setContext', 'promptpen.devMode', true);
    context.subscriptions.push(register('promptpen.runEval', () => runEval(context.extensionUri, models)));
  }
}

export function deactivate(): void {}
