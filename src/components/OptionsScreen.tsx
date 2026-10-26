/**
 * Options (C17) — everything offered here works today (core §19).
 * As of C17 that is the theme only: sound arrives with C18, hint frequency
 * with C24. Neither is advertised before it works.
 */

import { useState } from 'react';
import { currentTheme, setTheme, type Theme } from '../theme';

interface Props {
  onBack: () => void;
}

export function OptionsScreen({ onBack }: Props) {
  const [theme, setThemeState] = useState<Theme>(() => currentTheme());

  const toggleTheme = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    setThemeState(next);
  };

  return (
    <>
      <header className="app-header">
        <h1>Options</h1>
        <p className="tagline">The office is still being furnished.</p>
      </header>
      <main className="placeholder">
        <div className="setup-card">
          <section className="setup-section">
            <h2 className="setup-title">Appearance</h2>
            <div className="dialog-actions">
              <button
                type="button"
                aria-label="Switch to dark theme"
                onClick={toggleTheme}
              >
                {theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
              </button>
            </div>
          </section>
          <p className="muted">
            More settings will appear as the office expands (sound, hint
            frequency) — nothing is advertised before it works.
          </p>
          <div className="setup-footer">
            <button
              type="button"
              className="secondary"
              title="Back to title"
              onClick={onBack}
            >
              Back
            </button>
          </div>
        </div>
      </main>
    </>
  );
}
