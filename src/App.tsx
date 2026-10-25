import { useState } from 'react';
import { currentTheme, setTheme, type Theme } from './theme';

/**
 * Screen state machine (PLAN §5). C1 renders only the scaffold;
 * screens land in later chunks. No screen is advertised until it works
 * (core spec §19).
 */
export type Screen =
  | 'title'
  | 'setup'
  | 'game'
  | 'handbook'
  | 'options'
  | 'victory'
  | 'defeat';

export default function App() {
  const [screen] = useState<Screen>('title');
  const [theme, setThemeState] = useState<Theme>(() => currentTheme());

  const toggleTheme = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    setThemeState(next);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>EMPIRE, APPARENTLY</h1>
        <p className="tagline">
          You appear to be in charge. This has surprised everyone.
        </p>
      </header>
      <main className="placeholder">
        <div className="placeholder-card">
          <p>
            Scaffold is up (screen: <code>{screen}</code>). Galaxy generation
            arrives next.
          </p>
        </div>
      </main>
      <footer className="app-footer">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
        >
          {theme === 'light' ? 'Dark theme' : 'Light theme'}
        </button>
      </footer>
    </div>
  );
}
