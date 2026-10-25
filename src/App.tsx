import { useState } from 'react';
import { currentTheme, setTheme, type Theme } from './theme';
import { dispatch, useStore } from './state/gameStore';
import { GameScreen } from './components/GameScreen';

/**
 * Screen state (C3): store-driven. null game = title screen; otherwise the
 * game screen. No screen is advertised until it works (core spec §19).
 */
export default function App() {
  const { game } = useStore();
  const [theme, setThemeState] = useState<Theme>(() => currentTheme());

  const toggleTheme = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    setThemeState(next);
  };

  return (
    <div className="app">
      {game ? <GameScreen key={game.seed} /> : <TitleScreen />}
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

function TitleScreen() {
  // Default seed is random per page load — but once chosen, the mandate is
  // fully reproducible (same seed → same galaxy, C2).
  const [seedText, setSeedText] = useState(() =>
    String(100000 + Math.floor(Math.random() * 900000)),
  );

  const begin = () => {
    const parsed = Number.parseInt(seedText, 10);
    const seed =
      Number.isFinite(parsed) && parsed >= 0 && parsed < 2 ** 31 ? parsed : 42;
    dispatch({ type: 'NEW_GAME', seed });
  };

  return (
    <>
      <header className="app-header">
        <h1>EMPIRE, APPARENTLY</h1>
        <p className="tagline">
          You appear to be in charge. This has surprised everyone.
        </p>
      </header>
      <main className="placeholder">
        <div className="placeholder-card">
          <p>
            A working prototype has arrived: a generated galaxy, a selectable
            map, and the one strategy every admiral needs — waiting.
          </p>
          <label className="seed-field">
            <span>Mandate seed (same seed → same galaxy)</span>
            <input
              type="text"
              inputMode="numeric"
              value={seedText}
              onChange={(e) => setSeedText(e.target.value)}
            />
          </label>
          <button type="button" className="primary" onClick={begin}>
            Begin Mandate
          </button>
          <p className="muted">Next: travel, fuel, and range.</p>
        </div>
      </main>
    </>
  );
}
