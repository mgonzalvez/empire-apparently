/**
 * Screen state machine (C17): title → setup → game, title → options → title.
 *
 * The store keeps the GAME; this component keeps the front-door screen, a
 * piece of view state that is never saved (PLAN §5). Victory/defeat render
 * inside the game (VictoryDefeatScreen); the Handbook screen arrives with
 * C30. No screen is advertised until it works (core spec §19).
 */

import { useEffect, useState } from 'react';
import { currentTheme, setTheme, type Theme } from './theme';
import { useStore } from './state/gameStore';
import { GameScreen } from './components/GameScreen';
import { TitleScreen } from './components/TitleScreen';
import { NewGameSetup } from './components/NewGameSetup';
import { OptionsScreen } from './components/OptionsScreen';

type FrontDoor = 'title' | 'setup' | 'options';

export default function App() {
  const { game } = useStore();
  const [frontDoor, setFrontDoor] = useState<FrontDoor>('title');
  const [theme, setThemeState] = useState<Theme>(() => currentTheme());

  // Returning to the front door (MENU / reload) always lands on the title.
  useEffect(() => {
    if (!game) setFrontDoor('title');
  }, [game]);

  const toggleTheme = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    setThemeState(next);
  };

  return (
    <div className="app">
      {game ? (
        <GameScreen key={game.seed} />
      ) : frontDoor === 'setup' ? (
        <NewGameSetup onBack={() => setFrontDoor('title')} />
      ) : frontDoor === 'options' ? (
        <OptionsScreen onBack={() => setFrontDoor('title')} />
      ) : (
        <TitleScreen
          onNewGame={() => setFrontDoor('setup')}
          onOptions={() => setFrontDoor('options')}
        />
      )}
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
