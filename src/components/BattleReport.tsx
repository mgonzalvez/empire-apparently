/**
 * Battle report modal (C7; core §1 "fast automatic combat").
 * 100% FACTUAL (PLAN §10): every number the player needs to understand the
 * outcome — result, before/after strengths, losses, casualties,
 * captured-or-held. Advisor narration (C19) is a separate element beside
 * this modal, never inside it.
 */

import { useEffect } from 'react';
import type { BattleReport, BattleOutcome, FleetShips, ShipClass } from '../engine/types';
import { STANCE_LABEL, STANCE_NOTE } from '../engine/combat';
import { playSfx } from '../audio/sfx';

const OUTCOME_TEXT: Record<BattleOutcome, string> = {
  captured: 'World captured.',
  held: 'The defense held.',
  'invasion-failed': 'Orbit secured — the ground held.',
  withdrawn: 'Orbit secured — the fleet withdrew.',
  'no-lift': 'Orbit secured — no transports remain to land.',
};

const SHIP_WORDS: [ShipClass, string, string][] = [
  ['interceptor', 'interceptor', 'interceptors'],
  ['cruiser', 'cruiser', 'cruisers'],
  ['transport', 'transport', 'transports'],
];

/** "2 interceptors · 1 cruiser · 0 transports" — no abbreviations (C18). */
function shipLine(n: FleetShips): string {
  const parts = SHIP_WORDS.map(([cls, singular, plural]) =>
    `${n[cls]} ${n[cls] === 1 ? singular : plural}`,
  );
  return parts.join(' · ');
}

export interface BattleReportModalProps {
  report: BattleReport;
  onContinue: () => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="row">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}

export function BattleReportModal({ report: r, onContinue }: BattleReportModalProps) {
  const lostTotal =
    r.shipsLost.interceptor + r.shipsLost.cruiser + r.shipsLost.transport;

  // The result blip is a separate layer from the 100%-factual report (P5).
  useEffect(() => {
    playSfx(r.outcome === 'captured' ? 'combat-win' : r.outcome === 'held' ? 'combat-loss' : 'ui');
  }, [r.outcome]);

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog battle-report"
        role="dialog"
        aria-modal="true"
        aria-label={`Battle report: ${r.targetName}`}
      >
        <h2>Battle at {r.targetName}</h2>
        <p className={`outcome outcome-${r.outcome}`}>{OUTCOME_TEXT[r.outcome]}</p>

        <Row label="Stance" value={`${STANCE_LABEL[r.stance]} — ${STANCE_NOTE[r.stance]}`} />
        <Row
          label="Strengths"
          value={`${r.attackerStrength} (attack) vs ${r.defenderStrength} (defense)`}
        />
        <Row
          label="Ships lost"
          value={lostTotal > 0 ? `${lostTotal} — ${shipLine(r.shipsLost)}` : 'none'}
        />
        <Row label="Ships remaining" value={shipLine(r.shipsAfter)} />
        <Row label="Hull after" value={`${r.hullAfter}%`} />
        <Row label="Troops lost" value={String(r.troopsLost)} />
        <Row label="Troops remaining" value={String(r.troopsAfter)} />
        <Row label="Defense after" value={String(r.defenseAfter)} />
        {r.garrison !== null && <Row label="Garrison set" value={String(r.garrison)} />}
        <Row label="Result" value={r.captured ? 'Captured' : 'Held by the defenders'} />

        <div className="dialog-actions">
          <button type="button" className="primary" onClick={onContinue}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
