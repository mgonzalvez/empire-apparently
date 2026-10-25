/**
 * Theme helpers — mirrors the pre-paint inline script in index.html.
 * The storage key is family convention (`empire-apparently-theme`).
 */

export const THEME_KEY = 'empire-apparently-theme';

export type Theme = 'light' | 'dark';

export function systemTheme(): Theme {
  return typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

export function currentTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* storage unavailable (private mode, SSR, tests) */
  }
  return systemTheme();
}

export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage unavailable — theme still applies for this page */
  }
}
