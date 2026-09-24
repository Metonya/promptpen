import * as path from 'node:path';

/**
 * The model selected in VS Code's chat view is not exposed to extensions. VS Code stores it in its
 * global state database (`User/globalStorage/state.vscdb`, key `chat.currentLanguageModel.panel`) as
 * `vendor/id`, for example `copilot/claude-haiku-4.5` or `copilot/auto`. The database is SQLite and
 * is read with Node's built-in `node:sqlite`; anything unexpected yields `undefined`.
 */
const KEY = 'chat.currentLanguageModel.panel';

export function readChatModelIdentifier(globalStorageDir: string): string | undefined {
  try {
    // Loaded lazily: older runtimes (e.g. VS Code forks on Node 20) have no node:sqlite.
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    const db = new DatabaseSync(path.join(globalStorageDir, 'state.vscdb'), { readOnly: true });
    try {
      const value = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(KEY)?.value;
      const text = value instanceof Uint8Array ? new TextDecoder().decode(value) : value;
      return typeof text === 'string' && text.trim() ? text.trim() : undefined;
    } finally {
      db.close();
    }
  } catch {
    return undefined;
  }
}

export interface ModelRef {
  vendor: string;
  id: string;
}

/** Auto lets the chat route each request to a different, often large, model. */
export const isAutoIdentifier = (identifier: string) => /\/auto$/i.test(identifier);

/** Finds the model for an identifier; some vendors put a provider segment between vendor and id. */
export function findModel<T extends ModelRef>(models: readonly T[], identifier: string): T | undefined {
  return (
    models.find(m => `${m.vendor}/${m.id}` === identifier) ??
    models.find(m => identifier.startsWith(`${m.vendor}/`) && identifier.endsWith(`/${m.id}`))
  );
}
