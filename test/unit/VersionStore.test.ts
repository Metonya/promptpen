import { describe, expect, it } from 'vitest';
import { VersionStore } from '../../src/history/VersionStore';

describe('VersionStore', () => {
  it('navigates between original and improved versions', () => {
    const s = new VersionStore();
    s.push('k', 'orijinal', 'v1');
    s.push('k', 'v1', 'v2');
    expect(s.state('k', 'v2')).toEqual({ canGoBack: true, canGoForward: false, position: 2, total: 3 });
    expect(s.back('k', 'v2')).toBe('v1');
    expect(s.back('k', 'v1')).toBe('orijinal');
    expect(s.back('k', 'orijinal')).toBeUndefined();
    expect(s.forward('k', 'orijinal')).toBe('v1');
    expect(s.forward('k', 'v1')).toBe('v2');
    expect(s.forward('k', 'v2')).toBeUndefined();
  });

  it('keeps manual edits as a version before going back', () => {
    const s = new VersionStore();
    s.push('k', 'orijinal', 'v1');
    expect(s.state('k', 'v1 elle')).toMatchObject({ canGoBack: true, canGoForward: false });
    expect(s.back('k', 'v1 elle')).toBe('v1');
    expect(s.forward('k', 'v1')).toBe('v1 elle');
  });

  it('branches when improving an edited text', () => {
    const s = new VersionStore();
    s.push('k', 'orijinal', 'v1');
    s.back('k', 'v1');
    s.push('k', 'orijinal', 'v1b');
    expect(s.back('k', 'v1b')).toBe('orijinal');
    expect(s.forward('k', 'orijinal')).toBe('v1b');
    expect(s.state('k', 'v1b').total).toBe(2);
  });

  it('caps history but keeps the original', () => {
    const s = new VersionStore(3);
    s.push('k', 'o', 'a');
    s.push('k', 'a', 'b');
    s.push('k', 'b', 'c');
    expect(s.state('k', 'c')).toMatchObject({ total: 3, position: 2 });
    expect(s.original('k')).toBe('o');
    expect(s.back('k', 'c')).toBe('b');
    expect(s.back('k', 'b')).toBe('o');
  });

  it('keeps inputs apart', () => {
    const s = new VersionStore();
    s.push('a', 'x', 'y');
    expect(s.state('b', 'y').canGoBack).toBe(false);
  });
});
