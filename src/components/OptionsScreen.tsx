/**
 * Options (C17 theme; C18 sound) — everything offered here works today
 * (core §19). Sound is off by default (core §20) and persists across games.
 * Hint frequency arrives with C24 and is not advertised before it works.
 */

import { useState } from 'react';
import { currentTheme, setTheme, type Theme } from '../theme';
import { isSoundOn, playSfx, setSoundOn } from '../audio/sfx';

interface Props {
  onBack: () => void;
}

export function OptionsScreen({ onBack }: Props) {
  const [theme, setThemeState] = useState<Theme>(() => currentTheme());
  const [sound, setSoundState] = useState<boolean>(() => isSoundOn());

  const toggleTheme = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    setThemeState(next);
  };

  const toggleSound = () => {
    const next = !sound;
    setSoundOn(next);
    setSoundState(next);
    if (next) playSfx('ui'); // confirmation blip — the first sound you hear
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

          <section className="setup-section">
            <h2 className="setup-title">Sound</h2>
            <div className="dialog-actions">
              <button
                type="button"
                aria-pressed={sound}
                title={sound ? 'Sound effects are on' : 'Sound effects are off'}
                onClick={toggleSound}
              >
                {sound ? 'Sound effects: on' : 'Sound effects: off'}
              </button>
            </div>
            <p className="muted">
              Conventional label: enable or disable sound effects. Off by
              default; applies to this device.
            </p>
          </section>

          <p className="muted">
            More settings will appear as the office expands (hint frequency) —
            nothing is advertised before it works.
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
