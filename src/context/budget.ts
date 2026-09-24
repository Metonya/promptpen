export interface Section {
  title: string;
  body: string;
  /** Lower numbers are kept first when the budget runs out. */
  priority: number;
}

const TRUNCATED = '\n[…truncated]';

/** Renders sections in their given order while keeping the total size under `maxChars`. */
export function fitSections(sections: Section[], maxChars: number): string {
  const present = sections.filter(s => s.body.trim());
  const budget = new Map<Section, number>();
  let remaining = maxChars;
  for (const s of [...present].sort((a, b) => a.priority - b.priority)) {
    // "## " + title + newline, plus the blank line that separates sections.
    const header = s.title.length + 6;
    if (remaining <= header + TRUNCATED.length + 20) break;
    const size = Math.min(s.body.length, remaining - header);
    budget.set(s, size);
    remaining -= header + size;
  }
  return present
    .filter(s => budget.has(s))
    .map(s => {
      const size = budget.get(s)!;
      const body = size < s.body.length ? s.body.slice(0, size - TRUNCATED.length) + TRUNCATED : s.body;
      return `## ${s.title}\n${body}`;
    })
    .join('\n\n');
}
