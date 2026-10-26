/**
 * Title screen (C17, SPEC §10) — the themed front door.
 *
 * Humorous labels carry the identity; conventional labels live in tooltips
 * (SPEC §10: "use conventional labels as tooltips or accessibility text so
 * humorous wording remains understandable"). The Tutorial and Handbook
 * buttons arrive with C23/C30 — they are NOT advertised before they work
 * (no fake controls, core §19).
 */

import { useMemo } from 'react';
import { dispatch } from '../state/gameStore';
import { loadGame } from '../state/persistence';

interface Props {
  onNewGame: () => void;
  onOptions: () => void;
}

export function TitleScreen({ onNewGame, onOptions }: Props) {
  // Re-read on every mount (the title remounts whenever the game ends or the
  // player returns to it) — LOAD restores exactly (C17 persistence test).
  const saved = useMemo(() => loadGame(), []);

  return (
    <>
      <header className="app-header">
        <h1>EMPIRE, APPARENTLY</h1>
        <p className="tagline">
          You appear to be in charge. This has surprised everyone.
        </p>
      </header>
      <main className="placeholder">
        <div className="title-card">
          <div className="title-actions">
            <button
              type="button"
              className="primary"
              title="New game"
              onClick={onNewGame}
            >
              New Administrative Disaster
            </button>
            {saved !== null && (
              <button
                type="button"
                title="Continue a saved campaign"
                onClick={() => dispatch({ type: 'LOAD', state: saved })}
              >
                Resume Previous Mistake
              </button>
            )}
            <button type="button" title="Options" onClick={onOptions}>
              Options
            </button>
          </div>
          {saved !== null && (
            <p className="muted">
              A campaign is in progress — Year {saved.tick}, mandate seed{' '}
              {saved.seed}.
            </p>
          )}
        </div>
      </main>
    </>
  );
}
