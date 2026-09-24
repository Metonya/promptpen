import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { findModel, isAutoIdentifier, readChatModelIdentifier } from '../../src/llm/chatModel';

const models = [
  { vendor: 'copilot', id: 'claude-haiku-4.5' },
  { vendor: 'copilot', id: 'auto' },
  { vendor: 'openrouter', id: 'qwen/qwen3.6-plus:free' },
];

describe('findModel', () => {
  it('matches vendor/id', () => {
    expect(findModel(models, 'copilot/claude-haiku-4.5')).toBe(models[0]);
  });

  it('matches identifiers with a provider segment', () => {
    expect(findModel(models, 'openrouter/OpenRouter/qwen/qwen3.6-plus:free')).toBe(models[2]);
  });

  it('returns undefined for unknown models', () => {
    expect(findModel(models, 'ollama/llama3')).toBeUndefined();
  });
});

describe('isAutoIdentifier', () => {
  it('detects Auto', () => {
    expect(isAutoIdentifier('copilot/auto')).toBe(true);
    expect(isAutoIdentifier('copilot/claude-haiku-4.5')).toBe(false);
  });
});

describe('readChatModelIdentifier', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })));

  function stateDb(rows: [string, string | Uint8Array][]): string {
    const dir = mkdtempSync(join(tmpdir(), 'promptpen-state-'));
    dirs.push(dir);
    const db = new DatabaseSync(join(dir, 'state.vscdb'));
    db.exec('CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)');
    const insert = db.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)');
    for (const [key, value] of rows) insert.run(key, value);
    db.close();
    return dir;
  }

  it('reads the chat view model stored as text or blob', () => {
    expect(readChatModelIdentifier(stateDb([['chat.currentLanguageModel.panel', 'copilot/claude-haiku-4.5']]))).toBe(
      'copilot/claude-haiku-4.5',
    );
    const blob = new TextEncoder().encode('copilot/auto');
    expect(readChatModelIdentifier(stateDb([['chat.currentLanguageModel.panel', blob]]))).toBe('copilot/auto');
  });

  it('returns undefined when the key or the database is missing', () => {
    expect(readChatModelIdentifier(stateDb([['other', 'x']]))).toBeUndefined();
    expect(readChatModelIdentifier(join(tmpdir(), 'promptpen-does-not-exist'))).toBeUndefined();
  });
});
