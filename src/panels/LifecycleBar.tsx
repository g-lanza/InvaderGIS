/**
 * LifecycleBar — horizontal segmented bar showing a polity's lifespan phases.
 *
 * Six design-defined phases divide the total lifespan proportionally:
 *   Formation (8%) → Consolidation (14%) → Peak (38%) →
 *   Crisis (18%) → Fragmentation (14%) → Dissolution (8%)
 *
 * An accent-colored cursor marks the current year within the bar.
 * When the current year is outside [formed, dissolved] no cursor is shown.
 *
 * Design laws: square corners, hairline borders, no shadows, token colors only.
 * All four themes render correctly through CSS custom properties.
 */
import './LifecycleBar.css';
import { useTimeStore } from '@/stores/timeStore';

const PHASES = [
  { id: 'form',        label: 'Formation',     pct: 8  },
  { id: 'consolidate', label: 'Consolidation', pct: 14 },
  { id: 'peak',        label: 'Peak',          pct: 38 },
  { id: 'crisis',      label: 'Crisis',        pct: 18 },
  { id: 'fragment',    label: 'Fragmentation', pct: 14 },
  { id: 'dissolve',    label: 'Dissolution',   pct: 8  },
] as const;

interface LifecycleBarProps {
  formed: number;
  dissolved: number;
}

/** Segmented lifecycle bar with a live year cursor. */
export function LifecycleBar({ formed, dissolved }: LifecycleBarProps) {
  const year  = useTimeStore((s) => s.year);
  const total = dissolved - formed;
  const isActive = year >= formed && year <= dissolved;
  const cursorPct = isActive
    ? Math.max(0, Math.min(100, ((year - formed) / total) * 100))
    : null;

  return (
    <div className="lifecycle-bar">
      <div className="lifecycle-bar__track">
        {PHASES.map((p) => (
          <div
            key={p.id}
            className={`lifecycle-bar__phase lifecycle-bar__phase--${p.id}`}
            style={{ width: `${p.pct}%` }}
            title={p.label}
            aria-label={p.label}
          />
        ))}
        {cursorPct !== null && (
          <div
            className="lifecycle-bar__cursor"
            style={{ left: `${cursorPct}%` }}
            aria-hidden="true"
          />
        )}
      </div>
      <div className="lifecycle-bar__labels" aria-hidden="true">
        <span className="mono lifecycle-bar__year">{formed}</span>
        <span className="mono lifecycle-bar__year">{dissolved}</span>
      </div>
    </div>
  );
}
