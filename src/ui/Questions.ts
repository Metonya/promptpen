import * as vscode from 'vscode';
import type { Answer, Question } from '../enhance/types';

const kindLabel = (kind: Question['kind']) =>
  ({
    contradiction: vscode.l10n.t('Contradiction'),
    ambiguity: vscode.l10n.t('Ambiguity'),
    missing: vscode.l10n.t('Missing detail'),
  })[kind];

type Item = vscode.QuickPickItem & { action: 'answer' | 'custom' | 'skip' };

/**
 * Asks the model's clarifying questions one by one. Returns undefined when the user cancels
 * (Escape); skipped questions are left out of the answers.
 */
export async function askQuestions(questions: Question[]): Promise<Answer[] | undefined> {
  const answers: Answer[] = [];
  for (const [i, q] of questions.entries()) {
    const items: Item[] = [
      ...q.options.map(o => ({ label: o, action: 'answer' as const })),
      { label: '', kind: vscode.QuickPickItemKind.Separator, action: 'skip' },
      { label: `$(edit) ${vscode.l10n.t('Write my own answer…')}`, action: 'custom' },
      { label: `$(debug-step-over) ${vscode.l10n.t('Skip')}`, action: 'skip' },
    ];
    const choice = await vscode.window.showQuickPick(items, {
      title: vscode.l10n.t('PromptPen: question {0} of {1}', i + 1, questions.length),
      placeHolder: `${kindLabel(q.kind)}: ${q.question}`,
      ignoreFocusOut: true,
    });
    if (!choice) return undefined;
    if (choice.action === 'skip') continue;
    if (choice.action === 'custom') {
      const text = await vscode.window.showInputBox({ title: q.question, ignoreFocusOut: true });
      if (text === undefined) return undefined;
      if (text.trim()) answers.push({ question: q.question, answer: text.trim() });
      continue;
    }
    answers.push({ question: q.question, answer: choice.label });
  }
  return answers;
}
