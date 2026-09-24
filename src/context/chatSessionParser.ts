/**
 * Parser for VS Code's local chat session logs (workspaceStorage/<id>/chatSessions/*.jsonl).
 * The format is internal to VS Code, so everything here is defensive: unknown shapes are skipped.
 *   kind 0: full snapshot in `v`
 *   kind 1: set the value at path `k` to `v`
 *   kind 2: append the items of `v` to the array at path `k`, after truncating it to `i` when given
 */
export interface ChatTurn {
  user: string;
  assistant: string;
}

type Json = Record<string | number, unknown>;

function container(root: Json, path: (string | number)[]): Json | undefined {
  let node: unknown = root;
  for (const key of path) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Json)[key];
  }
  return node && typeof node === 'object' ? (node as Json) : undefined;
}

function applyLine(state: Json | undefined, op: Json): Json | undefined {
  if (op.kind === 0) return op.v && typeof op.v === 'object' ? (op.v as Json) : state;
  if (!state || !Array.isArray(op.k) || op.k.length === 0) return state;
  const path = op.k as (string | number)[];
  if (op.kind === 1) {
    const parent = container(state, path.slice(0, -1));
    if (parent) parent[path[path.length - 1]] = op.v;
  } else if (op.kind === 2 && Array.isArray(op.v)) {
    const target = container(state, path);
    if (Array.isArray(target)) {
      if (typeof op.i === 'number') target.length = Math.min(target.length, op.i);
      target.push(...op.v);
    } else {
      const parent = container(state, path.slice(0, -1));
      if (parent) parent[path[path.length - 1]] = [...op.v];
    }
  }
  return state;
}

function responseText(parts: unknown): string {
  if (!Array.isArray(parts)) return '';
  return parts
    .filter((p): p is Json => !!p && typeof p === 'object' && !('kind' in p) && typeof (p as Json).value === 'string')
    .map(p => p.value as string)
    .join('')
    .trim();
}

export function parseChatSession(content: string): ChatTurn[] {
  let state: Json | undefined;
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      state = applyLine(state, JSON.parse(line) as Json);
    } catch {
      // Ignore malformed or partially written lines.
    }
  }
  const requests = state?.requests;
  if (!Array.isArray(requests)) return [];
  return requests
    .map(r => {
      const req = (r ?? {}) as Json;
      const message = (req.message ?? {}) as Json;
      return { user: typeof message.text === 'string' ? message.text.trim() : '', assistant: responseText(req.response) };
    })
    .filter(t => t.user);
}

/** Renders the last `maxTurns` turns, newest last, with long answers clipped to their ending. */
export function formatTurns(turns: ChatTurn[], maxTurns = 3, maxAnswerChars = 600): string {
  return turns
    .slice(-maxTurns)
    .map(t => {
      const answer = t.assistant.length > maxAnswerChars ? '…' + t.assistant.slice(-maxAnswerChars) : t.assistant;
      return answer ? `User: ${t.user}\nAssistant: ${answer}` : `User: ${t.user}`;
    })
    .join('\n\n');
}
