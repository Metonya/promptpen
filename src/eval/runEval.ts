import * as vscode from 'vscode';
import { EnhanceError, Enhancer } from '../enhance/Enhancer';
import type { Mode, TextModel } from '../enhance/types';
import { LmTextModel, type ModelService } from '../llm/ModelService';

interface Case {
  id: string;
  kind: 'typo' | 'contradiction' | 'ambiguity' | 'clean' | 'tokens';
  draft: string;
}

interface Row {
  id: string;
  kind: Case['kind'];
  ok: boolean;
  error?: string;
  lengthRatio?: number;
  asked?: boolean;
  intentPreserved?: boolean;
  judgeReason?: string;
  improved?: string;
}

const JUDGE = `You compare an ORIGINAL developer prompt with a REWRITTEN one.
Answer with JSON only: {"preserved": boolean, "reason": string}
"preserved" is true only if the rewrite asks for the same thing, adds no new requirement, technology or constraint, and drops nothing the original asked for. Fixing spelling, grammar or wording, or turning a contradiction into neutral wording, is fine.`;

async function judge(model: TextModel, original: string, rewritten: string): Promise<{ preserved: boolean; reason: string } | undefined> {
  const raw = await model.complete([
    { role: 'user', content: JUDGE },
    { role: 'user', content: `ORIGINAL:\n${original}\n\nREWRITTEN:\n${rewritten}` },
  ]);
  const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  try {
    const data = JSON.parse(json) as { preserved?: unknown; reason?: unknown };
    return typeof data.preserved === 'boolean' ? { preserved: data.preserved, reason: String(data.reason ?? '') } : undefined;
  } catch {
    return undefined;
  }
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}% (${n}/${d})` : 'n/a');

/** Developer command: runs eval/cases.json through the selected model and opens a Markdown report. */
export async function runEval(extensionUri: vscode.Uri, models: ModelService): Promise<void> {
  const model = await models.resolve();
  if (!model) return;
  const mode = (await vscode.window.showQuickPick(['fix', 'expand'], { title: 'Eval mode' })) as Mode | undefined;
  if (!mode) return;
  const cases = JSON.parse(
    new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(extensionUri, 'eval', 'cases.json'))),
  ) as Case[];
  const text = new LmTextModel(model);
  const enhancer = new Enhancer(text);
  const rows: Row[] = [];

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `PromptPen eval (${model.name}, ${mode})`, cancellable: true },
    async (progress, token) => {
      for (const c of cases) {
        if (token.isCancellationRequested) break;
        progress.report({ message: c.id, increment: 100 / cases.length });
        try {
          const { result } = await enhancer.enhance({ draft: c.draft, mode, language: 'same', context: '' }, token);
          const verdict = await judge(text, c.draft, result.improved);
          rows.push({
            id: c.id,
            kind: c.kind,
            ok: true,
            lengthRatio: result.improved.length / c.draft.length,
            asked: result.questions.length > 0,
            intentPreserved: verdict?.preserved,
            judgeReason: verdict?.reason,
            improved: result.improved,
          });
        } catch (error) {
          rows.push({ id: c.id, kind: c.kind, ok: false, error: error instanceof EnhanceError ? error.code : String(error) });
        }
      }
    },
  );

  const ok = rows.filter(r => r.ok);
  const judged = ok.filter(r => r.intentPreserved !== undefined);
  const needQuestions = ok.filter(r => r.kind === 'contradiction' || r.kind === 'ambiguity');
  const clean = ok.filter(r => r.kind === 'clean' || r.kind === 'typo' || r.kind === 'tokens');
  const ratios = ok.map(r => r.lengthRatio!).sort((a, b) => a - b);
  const report = [
    `# PromptPen eval — ${model.name} (${mode})`,
    '',
    `- Usable answers: ${pct(ok.length, rows.length)}`,
    `- Protected tokens kept (token guard failures count as misses): ${pct(rows.filter(r => r.error !== 'tokens').length, rows.length)}`,
    `- Intent preserved (LLM judge): ${pct(judged.filter(r => r.intentPreserved).length, judged.length)}`,
    `- Asked when contradictory/ambiguous: ${pct(needQuestions.filter(r => r.asked).length, needQuestions.length)}`,
    `- Asked although clear: ${pct(clean.filter(r => r.asked).length, clean.length)}`,
    `- Length ratio median: ${ratios.length ? ratios[Math.floor(ratios.length / 2)].toFixed(2) : 'n/a'}`,
    '',
    '| case | kind | ok | intent | asked | ratio | note |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(r =>
      `| ${r.id} | ${r.kind} | ${r.ok ? '✓' : '✗ ' + r.error} | ${r.intentPreserved === undefined ? '' : r.intentPreserved ? '✓' : '✗'} | ${r.asked ? '?' : ''} | ${r.lengthRatio?.toFixed(2) ?? ''} | ${(r.intentPreserved === false ? r.judgeReason : '')?.replace(/\|/g, '/') ?? ''} |`,
    ),
    '',
    '## Rewrites',
    ...rows.filter(r => r.ok).map(r => `**${r.id}**\n\n> ${cases.find(c => c.id === r.id)!.draft.replace(/\n/g, '\n> ')}\n\n${r.improved}\n`),
  ].join('\n');
  const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: report });
  await vscode.window.showTextDocument(doc);
}

