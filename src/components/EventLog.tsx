/**
 * Event log (C3): factual, newest first. Advisor lines (C19) render in
 * italics via `log-advisor`; warnings are always visible — never styled
 * down by humor settings (SPEC §11).
 */

import type { LogEntry } from '../engine/types';

export function EventLog({ log }: { log: LogEntry[] }) {
  const items = log.slice(-120).reverse();
  return (
    <section className="panel event-log" aria-label="Event log">
      <h2>Event Log</h2>
      {items.length === 0 ? (
        <p className="muted">Nothing has happened yet. Suspicious.</p>
      ) : (
        <ul>
          {items.map((e, i) => (
            <li key={i} className={`log-${e.kind}`}>
              <span className="log-tick">Y{e.tick}</span>
              {e.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
