interface Entry {
  versions: string[];
  index: number;
}

export interface VersionState {
  canGoBack: boolean;
  canGoForward: boolean;
  /** 0 is the original prompt. */
  position: number;
  total: number;
}

const NONE: VersionState = { canGoBack: false, canGoForward: false, position: 0, total: 0 };

/**
 * Per chat-input version history: [original, v1, v2, ...].
 * Text the user edits by hand is kept as its own version so that navigating never loses typing.
 */
export class VersionStore {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly maxVersions = 20) {}

  /** Records `next` as the newest version; `current` is what the input holds right now. */
  push(key: string, current: string, next: string): void {
    const entry = this.entries.get(key) ?? { versions: [current], index: 0 };
    this.keepEdits(entry, current);
    entry.versions = [...entry.versions.slice(0, entry.index + 1), next];
    entry.index = entry.versions.length - 1;
    if (entry.versions.length > this.maxVersions) {
      // Keep the original; drop the oldest intermediate versions.
      const drop = entry.versions.length - this.maxVersions;
      entry.versions.splice(1, drop);
      entry.index -= drop;
    }
    this.entries.set(key, entry);
  }

  back(key: string, current: string): string | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.keepEdits(entry, current);
    if (entry.index === 0) return undefined;
    entry.index--;
    return entry.versions[entry.index];
  }

  forward(key: string, current: string): string | undefined {
    const entry = this.entries.get(key);
    if (!entry || entry.versions[entry.index] !== current) return undefined;
    if (entry.index >= entry.versions.length - 1) return undefined;
    entry.index++;
    return entry.versions[entry.index];
  }

  state(key: string, current: string): VersionState {
    const entry = this.entries.get(key);
    if (!entry) return NONE;
    const edited = entry.versions[entry.index] !== current;
    return {
      canGoBack: edited || entry.index > 0,
      canGoForward: !edited && entry.index < entry.versions.length - 1,
      position: entry.index,
      total: entry.versions.length,
    };
  }

  original(key: string): string | undefined {
    return this.entries.get(key)?.versions[0];
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  clear(key: string): void {
    this.entries.delete(key);
  }

  private keepEdits(entry: Entry, current: string): void {
    if (entry.versions[entry.index] === current) return;
    entry.versions = [...entry.versions.slice(0, entry.index + 1), current];
    entry.index = entry.versions.length - 1;
  }
}
