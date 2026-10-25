import { describe, expect, it } from 'vitest';
import { THEME_KEY, currentTheme, systemTheme } from '../src/theme';

describe('C1 scaffold — theme', () => {
  it('uses the family theme storage key', () => {
    expect(THEME_KEY).toBe('empire-apparently-theme');
  });

  it('currentTheme() returns a valid theme without a DOM', () => {
    expect(['light', 'dark']).toContain(currentTheme());
  });

  it('systemTheme() returns a valid theme without a DOM', () => {
    expect(['light', 'dark']).toContain(systemTheme());
  });
});
