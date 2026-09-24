/**
 * Tokens that chat relies on (code, references, mentions, commands, links) must survive a rewrite
 * character for character; otherwise the improved prompt silently loses attachments or changes code.
 */
const FENCED = /```[\s\S]*?```/g;
const INLINE_CODE = /`[^`\n]+`/g;
const URL = /\bhttps?:\/\/[^\s<>()[\]"'`]+[^\s<>()[\]"'`.,;:!?]/g;
const PREFIXED = /(?<=^|[\s(])([#@/][A-Za-z][\w.\-]*(?::[^\s,;!?)]+)?)/g;

export function protectedTokens(text: string): string[] {
  const tokens: string[] = [];
  let rest = text.replace(FENCED, m => (tokens.push(m), ' '));
  rest = rest.replace(INLINE_CODE, m => (tokens.push(m), ' '));
  rest = rest.replace(URL, m => (tokens.push(m), ' '));
  for (const m of rest.matchAll(PREFIXED)) tokens.push(m[1].replace(/[.:]+$/, ''));
  return tokens;
}

const count = (haystack: string, needle: string) => {
  let n = 0;
  for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + needle.length)) n++;
  return n;
};

/** Returns the protected tokens of `original` that do not appear (as often) in `rewritten`. */
export function missingTokens(original: string, rewritten: string): string[] {
  const needed = new Map<string, number>();
  for (const t of protectedTokens(original)) needed.set(t, (needed.get(t) ?? 0) + 1);
  const missing: string[] = [];
  for (const [token, n] of needed) {
    if (count(rewritten, token) < n) missing.push(token);
  }
  return missing;
}
