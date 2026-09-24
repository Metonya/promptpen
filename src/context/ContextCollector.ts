import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { Mode } from '../enhance/types';
import { type Section, fitSections } from './budget';
import { formatTurns, parseChatSession } from './chatSessionParser';

const INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md', '.github/copilot-instructions.md'];
const EXCLUDE = '**/{node_modules,.git,dist,out,build,bin,obj,.next,.venv,venv,__pycache__,coverage}/**';

interface GitRepository {
  rootUri: vscode.Uri;
  state: { HEAD?: { name?: string }; workingTreeChanges: { uri: vscode.Uri }[]; indexChanges: { uri: vscode.Uri }[] };
}

const rel = (uri: vscode.Uri) => vscode.workspace.asRelativePath(uri, false);

/** Gathers workspace context that helps the model resolve names and references in a prompt. */
export class ContextCollector {
  constructor(private readonly storageUri: vscode.Uri | undefined) {}

  async collect(mode: Mode): Promise<string> {
    const config = vscode.workspace.getConfiguration('promptpen');
    const sections: Section[] = [];
    if (config.get<boolean>('context.workspace', true)) {
      sections.push(...this.editorSections(mode), ...this.gitSections(), ...(await this.instructionSections()));
      if (mode === 'expand') sections.push(await this.fileListSection());
    }
    if (config.get<boolean>('context.chatHistory', false)) sections.push(await this.chatHistorySection());
    return fitSections(sections, config.get<number>('context.maxChars', 12000));
  }

  private editorSections(mode: Mode): Section[] {
    const sections: Section[] = [];
    const folders = vscode.workspace.workspaceFolders?.map(f => f.name).join(', ');
    if (folders) sections.push({ title: 'Workspace', body: folders, priority: 0 });

    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.uri.scheme === 'file') {
      const doc = editor.document;
      const sel = editor.selection;
      let body = `${rel(doc.uri)} (${doc.languageId})`;
      if (!sel.isEmpty) {
        body += `, selected lines ${sel.start.line + 1}-${sel.end.line + 1}:\n${doc.getText(sel)}`;
      } else if (mode === 'expand') {
        const start = Math.max(0, sel.active.line - 20);
        const end = Math.min(doc.lineCount - 1, sel.active.line + 20);
        body += `, lines ${start + 1}-${end + 1} around the cursor:\n${doc.getText(new vscode.Range(start, 0, end, Number.MAX_SAFE_INTEGER))}`;
      }
      sections.push({ title: 'Active file', body, priority: 1 });

      const problems = vscode.languages
        .getDiagnostics(doc.uri)
        .filter(d => d.severity <= vscode.DiagnosticSeverity.Warning)
        .slice(0, 10)
        .map(d => `line ${d.range.start.line + 1}: ${d.message}`);
      sections.push({ title: 'Problems in active file', body: problems.join('\n'), priority: 3 });
    }

    const tabs = vscode.window.tabGroups.all
      .flatMap(g => g.tabs)
      .map(t => (t.input instanceof vscode.TabInputText ? t.input.uri : undefined))
      .filter((u): u is vscode.Uri => u?.scheme === 'file')
      .map(rel);
    sections.push({ title: 'Open files', body: [...new Set(tabs)].slice(0, 30).join('\n'), priority: 2 });
    return sections;
  }

  private gitSections(): Section[] {
    const git = vscode.extensions.getExtension<{ getAPI(v: 1): { repositories: GitRepository[] } }>('vscode.git');
    if (!git?.isActive) return [];
    const repo = git.exports.getAPI(1).repositories[0];
    if (!repo) return [];
    const changed = [...repo.state.indexChanges, ...repo.state.workingTreeChanges].map(c => rel(c.uri));
    const body = [`Branch: ${repo.state.HEAD?.name ?? '(detached)'}`, ...[...new Set(changed)].slice(0, 30).map(f => `changed: ${f}`)];
    return [{ title: 'Git', body: body.join('\n'), priority: 4 }];
  }

  private async instructionSections(): Promise<Section[]> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) return [];
    const sections: Section[] = [];
    for (const file of INSTRUCTION_FILES) {
      try {
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, file));
        sections.push({ title: `Project instructions (${file})`, body: new TextDecoder().decode(bytes).slice(0, 4000), priority: 5 });
      } catch {
        // Not present.
      }
    }
    return sections;
  }

  private async fileListSection(): Promise<Section> {
    const files = await vscode.workspace.findFiles('**/*', EXCLUDE, 300);
    return { title: 'Workspace files', body: files.map(rel).sort().join('\n'), priority: 7 };
  }

  /**
   * VS Code keeps chat sessions in `workspaceStorage/<workspace>/chatSessions`; this extension's
   * storage folder lives in the same `<workspace>` folder. The newest file is the current session.
   */
  private async chatHistorySection(): Promise<Section> {
    const empty = { title: 'Recent chat', body: '', priority: 6 };
    if (!this.storageUri) return empty;
    const dir = path.join(path.dirname(this.storageUri.fsPath), 'chatSessions');
    try {
      const files = await Promise.all(
        (await fs.readdir(dir))
          .filter(f => f.endsWith('.jsonl'))
          .map(async f => ({ file: path.join(dir, f), mtime: (await fs.stat(path.join(dir, f))).mtimeMs })),
      );
      const newest = files.sort((a, b) => b.mtime - a.mtime)[0];
      if (!newest) return empty;
      return { ...empty, body: formatTurns(parseChatSession(await fs.readFile(newest.file, 'utf8'))) };
    } catch {
      return empty;
    }
  }
}
