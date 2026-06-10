/**
 * TimeRailPlayback.tsx — playback controls for the chronoscope (extracted from
 * TimeRail.tsx to keep that file under the 800-line cap).
 *
 * PlaybackControls: play/pause + speed-cycle + loop toggle. Pure presentational
 * component driven entirely by props; the RAF play loop + handlers live in
 * TimeRail. PLAY_SPEEDS is exported because TimeRail's handleCycleSpeed cycles it.
 *
 * Uses .btn grammar from atlas-tokens.css (square corners, hairline border, four
 * themes, no hardcoded hex). SVG icons use currentColor.
 */

/** Human labels for each speed, in the same order. */
const PLAY_SPEED_LABELS: Record<number, string> = { 5: 'Slow', 20: 'Med', 50: 'Fast' };

/** Props for the PlaybackControls sub-component. */
interface PlaybackControlsProps {
  /** Current playing state. */
  playing: boolean;
  /** Play/pause toggle handler. */
  onToggle: () => void;
  /** Current playback speed (years/second). */
  speed: number;
  /** Cycle to the next speed. */
  onCycleSpeed: () => void;
  /** Whether playback loops at the end. */
  loop: boolean;
  /** Toggle loop. */
  onToggleLoop: () => void;
}

/**
 * PlaybackControls — play/pause + speed-cycle + loop toggle for the time-lapse.
 *
 * Uses .btn grammar from atlas-tokens.css (square corners, hairline border) so it
 * renders correctly in all four themes with no hardcoded color. SVG icons use
 * currentColor. The speed button shows a short label (Slow/Med/Fast) and cycles
 * on click; the loop button is an aria-pressed toggle.
 */
export function PlaybackControls({
  playing, onToggle, speed, onCycleSpeed, loop, onToggleLoop,
}: PlaybackControlsProps) {
  return (
    <div className="tr-play">
      <button
        type="button"
        className={`tr-play__btn btn${playing ? ' is-playing' : ''}`}
        onClick={onToggle}
        aria-label={playing ? 'Pause timeline' : 'Play timeline'}
        title={playing ? 'Pause' : 'Play'}
      >
        {playing ? (
          /* Pause icon: two vertical bars */
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" width="12" height="12">
            <rect x="3" y="2" width="3" height="12" />
            <rect x="10" y="2" width="3" height="12" />
          </svg>
        ) : (
          /* Play icon: triangle */
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" width="12" height="12">
            <polygon points="4,2 14,8 4,14" />
          </svg>
        )}
      </button>

      <button
        type="button"
        className="tr-play__speed btn"
        onClick={onCycleSpeed}
        aria-label={`Playback speed: ${PLAY_SPEED_LABELS[speed] ?? `${speed} years per second`}. Click to change.`}
        title={`Speed: ${speed} yrs/s — click to cycle`}
      >
        {PLAY_SPEED_LABELS[speed] ?? `${speed}`}
      </button>

      <button
        type="button"
        className={`tr-play__loop btn${loop ? ' is-active' : ''}`}
        onClick={onToggleLoop}
        aria-pressed={loop}
        aria-label={loop ? 'Loop on' : 'Loop off'}
        title={loop ? 'Loop: on' : 'Loop: off'}
      >
        {/* Loop icon: a circular arrow */}
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" width="12" height="12">
          <path d="M2.5 8a5.5 5.5 0 0 1 9.4-3.9M13.5 8a5.5 5.5 0 0 1-9.4 3.9" />
          <polyline points="11.5,1.5 12,4.3 9.2,4.6" />
          <polyline points="4.5,14.5 4,11.7 6.8,11.4" />
        </svg>
      </button>
    </div>
  );
}
