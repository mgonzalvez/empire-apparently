/**
 * New-game setup (C17, SPEC §10). Everything offered here works today:
 * advisor selection (M.O.R.T. only until C19 — the other two are listed,
 * clearly not operational, and not selectable), mandate seed, supernova
 * frequency, theme. "Begin Mandate" is click 2 of 2 to a playable campaign.
 *
 * Conventional labels live in tooltips so the humor stays understandable
 * (SPEC §10). No setup screen exists for a feature that doesn't (core §19):
 * the tutorial toggle arrives with C23, the handbook with C30.
 */

import { useState } from 'react';
import { dispatch } from '../state/gameStore';
import { currentTheme, setTheme, type Theme } from '../theme';
import { GALAXY, type SupernovaFrequency } from '../data/balance';
import { ADVISORS } from '../data/advisors';
import type { AdvisorId } from '../engine/types';

const FREQUENCIES: {
  id: SupernovaFrequency;
  label: string;
  tooltip: string;
}[] = [
  {
    id: 'zero',
    label: 'None',
    tooltip:
      'Supernova frequency: none — no stars will go supernova this campaign',
  },
  {
    id: 'low',
    label: 'Low',
    tooltip:
      'Supernova frequency: low — 2 to 3 unstable stars (the default)',
  },
  {
    id: 'normal',
    label: 'Normal',
    tooltip:
      'Supernova frequency: normal — 3 to 5 unstable stars',
  },
];

interface Props {
  onBack: () => void;
}

export function NewGameSetup({ onBack }: Props) {
  const [advisor, setAdvisor] = useState<AdvisorId>('mort');
  const [frequency, setFrequency] = useState<SupernovaFrequency>(
    GALAXY.supernova.defaultFrequency,
  );
  const [seedText, setSeedText] = useState(() =>
    String(100000 + Math.floor(Math.random() * 900000)),
  );
  const [theme, setThemeState] = useState<Theme>(() => currentTheme());

  const toggleTheme = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    setThemeState(next);
  };

  const begin = () => {
    const parsed = Number.parseInt(seedText, 10);
    const seed =
      Number.isFinite(parsed) && parsed >= 0 && parsed < 2 ** 31 ? parsed : 42;
    dispatch({ type: 'NEW_GAME', seed, advisor, supernovaFrequency: frequency });
  };

  return (
    <>
      <header className="app-header">
        <h1>New Administrative Disaster</h1>
        <p className="tagline">Filing the paperwork before the galaxy notices.</p>
      </header>
      <main className="placeholder">
        <div className="setup-card">
          <section className="setup-section">
            <h2 className="setup-title">Advisor of record</h2>
            <p className="muted">
              Conventional label: choose your advisor. Whichever advisor
              speaks never changes how the galaxy behaves.
            </p>
            <div className="advisor-pick" role="group" aria-label="Choose advisor">
              {ADVISORS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={advisor === a.id ? 'active' : ''}
                  data-advisor-id={a.id}
                  disabled={!a.operational}
                  title={
                    a.operational
                      ? `Select advisor: ${a.name} — ${a.description} ${a.poolNote}`
                      : `${a.name} is not yet operational (conventional label: advisor unavailable)`
                  }
                  onClick={() => setAdvisor(a.id)}
                >
                  {a.name}
                  {!a.operational && <span className="setup-unsure"> — not yet on duty</span>}
                </button>
              ))}
            </div>
            <p className="muted">
              All three advisors are on duty from today: M.O.R.T. is fully
              briefed; B.I.N.G.O. and the Handbook run on minimal duty and
              expand later. Whichever speaks never changes how the galaxy
              behaves.
            </p>
          </section>

          <section className="setup-section">
            <h2 className="setup-title">Mandate seed</h2>
            <p className="muted">
              Conventional label: campaign seed. The same seed always produces
              the same galaxy.
            </p>
            <label className="seed-field">
              <input
                type="text"
                inputMode="numeric"
                value={seedText}
                onChange={(e) => setSeedText(e.target.value)}
              />
            </label>
          </section>

          <section className="setup-section">
            <h2 className="setup-title">Supernova frequency</h2>
            <p className="muted">
              Conventional label: how many stars are scheduled to go
              supernova. None of them is your homeworld.
            </p>
            <div
              className="freq-pick"
              role="radiogroup"
              aria-label="Supernova frequency"
            >
              {FREQUENCIES.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={frequency === f.id}
                  className={frequency === f.id ? 'active' : ''}
                  title={f.tooltip}
                  onClick={() => setFrequency(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </section>

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

          <div className="setup-footer">
            <button
              type="button"
              className="secondary"
              title="Back to title"
              onClick={onBack}
            >
              Back
            </button>
            <button
              type="button"
              className="primary"
              title="Start a new campaign"
              onClick={begin}
            >
              Begin Mandate
            </button>
          </div>
        </div>
      </main>
    </>
  );
}
