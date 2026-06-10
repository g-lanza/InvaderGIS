/**
 * TimeRail — the chronoscope: full-width temporal control strip.
 *
 * Replaces TimeRailPlaceholder. Fills the `.msa-timerail` grid region.
 *
 * ## Layout (left→right)
 *   1. Year readout    — big IBM Plex Mono year + era label (84 px wide)
 *   2. Track area      — era ribbon | histogram | century ticks | scrubber
 *   3. Play/pause      — auto-advance toggle
 *
 * ## State wiring
 *   - Reads:  `timeStore.year`, `timeStore.era`, `timeStore.eraBands`,
 *             `timeStore.boundsMin`, `timeStore.boundsMax`,
 *             `timeStore.playing`, `timeStore.scrubThrottleMs`
 *   - Writes: `timeStore.setYear(year)` (throttled to scrubThrottleMs during drag)
 *             `timeStore.setPlaying(bool)` (play/pause)
 *
 * ## Density histogram
 *   Uses `recordsActiveInYear(year)` from `src/data/loaders.ts` to compute
 *   real record-count-per-year across boundsMin..boundsMax. Bars are drawn as
 *   SVG <rect> elements with no per-frame layout reflow. The histogram is built
 *   once when the loader resolves and memoized.
 *
 * ## Performance
 *   - Scrub throttle: `setYear` is called at most every `scrubThrottleMs` (16 ms)
 *     via a ref-tracked timestamp comparison — no `setTimeout`/`setInterval` on
 *     the hot path, just a `performance.now()` gate on the `onInput` handler.
 *   - Histogram computation: O(boundsMax - boundsMin) once, memoized in a ref.
 *   - SVG bars: no DOM mutation on scrub — the needle moves via inline style
 *     (transform: translateX), which is compositor-only.
 *   - Play interval: `setInterval` at 200 ms, advances year by 1. Cleared on
 *     unmount and whenever playing flips to false.
 *
 * ## Accessibility
 *   - Role: `region` wrapping the full rail.
 *   - Scrubber: `<input type="range">` with `role="slider"`, `aria-valuemin`,
 *     `aria-valuemax`, `aria-valuenow`, `aria-label`.
 *   - Arrow keys: ±1 year (browser default on range input).
 *   - Page Up/Down: ±10 years (handled by KeyboardEvent on the input).
 *   - Home/End: jump to boundsMin / boundsMax.
 *
 * ## Design contract
 *   DESIGN.md: square corners, hairline borders, no shadows, no italics.
 *   All color via CSS tokens. Four themes must render correctly (no hex literals).
 *   IBM Plex Mono year readout via `.mono` primitive and `.tr-readout__year`.
 *
 * @module TimeRail
 */

import './TimeRail.css';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTimeStore } from '@/stores/timeStore';
import { recordsActiveInYear } from '@/data/loaders';
import type { EraBand } from '@/types/dataset';
import { PlaybackControls } from './TimeRailPlayback';

/** Discrete time-lapse speeds (years/second) handleCycleSpeed cycles through.
 *  Kept here (the owner of the cycle handler + store write); the playback button's
 *  display labels live in TimeRailPlayback. */
const PLAY_SPEEDS = [5, 20, 50] as const;

// Play speed is now owned by timeStore (`playSpeed`, default 20 yrs/s) so it is
// user-adjustable via the speed control and read live by the RAF loop below.

// ── Histogram bucket size ──────────────────────────────────────────────────

/**
 * Group years into N-year buckets for the density histogram.
 *
 * 1 year per bucket = 1001 bars (fine, but very thin at narrow widths).
 * 5 years per bucket = 201 bars — readable at any width ≥ 400 px.
 *
 * We use 5-year buckets so each bar is wide enough to be legible at 72 px height.
 */
const BUCKET_YEARS = 5;


// ── Histogram computation ──────────────────────────────────────────────────

/**
 * One bucket in the density histogram.
 *
 * `startYear` is the inclusive start of the bucket's year range.
 * `count` is the number of distinct record ids active in any year within
 * the bucket (union of active sets across all years in the bucket — avoids
 * double-counting records that span multiple years within the bucket).
 */
interface HistogramBucket {
  /** First year of this bucket (inclusive). */
  startYear: number;
  /** Mid-year of the bucket, used for positioning. */
  midYear: number;
  /** Count of unique record ids active in this bucket. */
  count: number;
}

/**
 * Build the density histogram from the in-memory year index.
 *
 * Uses `recordsActiveInYear` (O(1) per year, backed by the loaded year index).
 * Returns buckets sorted by startYear ascending.
 *
 * This is called once after the dataset loads (not on every scrub tick).
 *
 * @param boundsMin - Inclusive start year (e.g. 500).
 * @param boundsMax - Inclusive end year (e.g. 1500).
 * @returns Array of HistogramBucket, one per BUCKET_YEARS interval.
 */
function buildHistogram(boundsMin: number, boundsMax: number): HistogramBucket[] {
  const buckets: HistogramBucket[] = [];

  for (let yr = boundsMin; yr <= boundsMax; yr += BUCKET_YEARS) {
    const end = Math.min(yr + BUCKET_YEARS - 1, boundsMax);
    // Union the active sets across all years in this bucket to avoid counting
    // long-lived polities multiple times within the bucket.
    const union = new Set<string>();
    for (let y = yr; y <= end; y++) {
      const ids = recordsActiveInYear(y);
      for (const id of ids) union.add(id);
    }
    buckets.push({
      startYear: yr,
      midYear: yr + (BUCKET_YEARS - 1) / 2,
      count: union.size,
    });
  }

  return buckets;
}

// ── Era band CSS class helper ──────────────────────────────────────────────

/**
 * Map an era band id to a CSS modifier class for background tinting.
 *
 * Medieval bands 'early'/'high'/'late' get dedicated classes.
 * Any other id falls back to 'generic'.
 *
 * @param id - The EraBand.id string.
 * @returns CSS class suffix string (without dot).
 */
function eraBandClass(id: string): string {
  if (id === 'early') return 'tr-era-band--early';
  if (id === 'high') return 'tr-era-band--high';
  if (id === 'late') return 'tr-era-band--late';
  return 'tr-era-band--generic';
}

// ── Sub-components ─────────────────────────────────────────────────────────

/** Props for the EraRibbon sub-component. */
interface EraRibbonProps {
  /** Era bands from the store (empty → derive medieval defaults). */
  eraBands: EraBand[];
  /** Current year — used to mark the active era. */
  year: number;
  /** Full time range. */
  boundsMin: number;
  boundsMax: number;
}

/**
 * EraRibbon — horizontal colored strip labelling each era band.
 *
 * Width of each band is proportional to its year-span relative to the full window.
 * Active band (containing the current year) gets `.is-active` for the accent tint.
 */
function EraRibbon({ eraBands, year, boundsMin, boundsMax }: EraRibbonProps) {
  const span = boundsMax - boundsMin;

  // Derive medieval default bands if the store is empty.
  const bands: EraBand[] = useMemo(() => {
    if (eraBands.length > 0) return eraBands;
    return [
      { id: 'early', label: 'Early',  start: 500,  end: 999  },
      { id: 'high',  label: 'High',   start: 1000, end: 1299 },
      { id: 'late',  label: 'Late',   start: 1300, end: 1500 },
    ];
  }, [eraBands]);

  return (
    <div className="tr-era-strip" aria-hidden="true">
      {bands.map((band) => {
        const widthPct = ((band.end - band.start + 1) / span) * 100;
        const isActive = year >= band.start && year <= band.end;
        return (
          <div
            key={band.id}
            className={`tr-era-band ${eraBandClass(band.id)}${isActive ? ' is-active' : ''}`}
            style={{ width: `${widthPct}%` }}
          >
            <span className="tr-era-band__label">{band.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────

/** Props for the CenturyStrip sub-component. */
interface CenturyStripProps {
  boundsMin: number;
  boundsMax: number;
}

/**
 * CenturyStrip — tick marks + labels at every century boundary within the range.
 *
 * Each mark is absolutely positioned as a percentage along the strip so it
 * aligns exactly with the corresponding position on the scrubber track.
 */
function CenturyStrip({ boundsMin, boundsMax }: CenturyStripProps) {
  const span = boundsMax - boundsMin;

  // Build the list of centuries that fall strictly within [boundsMin, boundsMax].
  const centuries = useMemo(() => {
    const firstCentury = Math.ceil(boundsMin / 100) * 100;
    const marks: number[] = [];
    for (let c = firstCentury; c <= boundsMax; c += 100) {
      marks.push(c);
    }
    return marks;
  }, [boundsMin, boundsMax]);

  return (
    <div className="tr-century-strip" aria-hidden="true">
      {centuries.map((c) => {
        const leftPct = ((c - boundsMin) / span) * 100;
        return (
          <div
            key={c}
            className="tr-century-mark"
            style={{ left: `${leftPct}%` }}
          >
            <div className="tr-century-mark__tick" />
            <span className="tr-century-mark__label">{c}</span>
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────

/** Props for the DensityHistogram sub-component. */
interface DensityHistogramProps {
  /** Pre-computed histogram buckets. */
  buckets: HistogramBucket[];
  /** Current year — used to highlight bars near the cursor. */
  year: number;
  boundsMin: number;
  boundsMax: number;
}

/**
 * DensityHistogram — SVG area sparkline showing record density across time.
 *
 * Replaced the bar-chart with a smooth filled area curve so the rail stays
 * calm and readable. Key changes from the bar version:
 *   - sqrt scale compresses extreme peaks so quiet centuries stay visible.
 *   - A single filled <path> + a stroke line replace 201 <rect> elements.
 *   - A vertical needle line marks the current year position.
 *   - Past area is tinted slightly differently via a CSS class on the SVG.
 */
function DensityHistogram({ buckets, year, boundsMin, boundsMax }: DensityHistogramProps) {
  const span = boundsMax - boundsMin;

  const points = useMemo(() => {
    if (buckets.length === 0) return { fill: '', stroke: '', needleX: 0 };

    const SVG_W = span;
    const SVG_H = 100;
    // sqrt scale — compresses peaks so low-activity centuries remain legible.
    const rawMax = Math.max(1, ...buckets.map((b) => b.count));
    const sqrtMax = Math.sqrt(rawMax);

    // Build polyline points from bucket mid-years.
    const pts = buckets.map((b) => {
      const x = ((b.midYear - boundsMin) / span) * SVG_W;
      const h = (Math.sqrt(b.count) / sqrtMax) * (SVG_H * 0.82); // 82% height ceiling
      return { x, y: SVG_H - h };
    });

    // Closed fill path: go along the top curve, then close along the baseline.
    const fillParts = [
      `M ${pts[0].x},${SVG_H}`,
      ...pts.map((p) => `L ${p.x},${p.y}`),
      `L ${pts[pts.length - 1].x},${SVG_H}`,
      'Z',
    ];

    // Open stroke path: just the top curve.
    const strokeParts = [
      `M ${pts[0].x},${pts[0].y}`,
      ...pts.slice(1).map((p) => `L ${p.x},${p.y}`),
    ];

    const needleX = ((year - boundsMin) / span) * SVG_W;

    return { fill: fillParts.join(' '), stroke: strokeParts.join(' '), needleX };
  }, [buckets, boundsMin, span, year]);

  if (buckets.length === 0) {
    return <svg className="tr-histogram-svg" aria-hidden="true" viewBox="0 0 100 1" preserveAspectRatio="none" />;
  }

  return (
    <svg
      className="tr-histogram-svg"
      viewBox={`0 0 ${span} 100`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* Filled area */}
      <path className="tr-sparkline-fill" d={points.fill} />
      {/* Top edge line */}
      <path className="tr-sparkline-stroke" d={points.stroke} />
      {/* Current-year needle */}
      <line
        className="tr-sparkline-needle"
        x1={points.needleX}
        y1={0}
        x2={points.needleX}
        y2={100}
      />
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────────────

// ── Loading indicator ──────────────────────────────────────────────────────

/**
 * TimeRailLoading — shown while the dataset has not yet been loaded.
 *
 * Uses token-driven color so it renders correctly in all four themes.
 * No fake data is shown.
 */
function TimeRailLoading() {
  return (
    <nav
      className="msa-timerail"
      role="region"
      aria-label="Timeline — loading"
      aria-busy="true"
    >
      <div className="tr-loading">
        <span className="tr-loading__label mono">Loading records…</span>
      </div>
    </nav>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

/**
 * TimeRail — the complete chronoscope filling `.msa-timerail`.
 *
 * This is the top-level component; it owns all internal state (histogram,
 * drag throttling, play interval) and exposes only the region element.
 *
 * Mount in AppShell in place of TimeRailPlaceholder:
 *   `import { TimeRail } from '@/components/TimeRail';`
 *   `<TimeRail />`
 *
 * @returns The `.msa-timerail` nav element with the full chronoscope.
 */
export function TimeRail() {
  // ── Store reads ──────────────────────────────────────────────────────────
  const year            = useTimeStore((s) => s.year);
  const era             = useTimeStore((s) => s.era);
  const eraBands        = useTimeStore((s) => s.eraBands);
  const boundsMin       = useTimeStore((s) => s.boundsMin);
  const boundsMax       = useTimeStore((s) => s.boundsMax);
  const playing         = useTimeStore((s) => s.playing);
  const playSpeed       = useTimeStore((s) => s.playSpeed);
  const loop            = useTimeStore((s) => s.loop);
  const setYear         = useTimeStore((s) => s.setYear);
  const setPlaying      = useTimeStore((s) => s.setPlaying);
  const setPlaySpeed    = useTimeStore((s) => s.setPlaySpeed);
  const setLoop         = useTimeStore((s) => s.setLoop);
  const scrubThrottleMs = useTimeStore((s) => s.scrubThrottleMs);

  // ── Histogram (built once after data loads) ──────────────────────────────

  /**
   * `histogramReady` tracks whether we've successfully built the histogram.
   * The histogram depends on the year index being populated by `loadDataset()`.
   * We probe by checking a representative year (boundsMin+100). If it returns
   * a non-empty set the index is ready; otherwise we retry via setInterval.
   */
  const [histogramReady, setHistogramReady] = useState<boolean>(false);
  const histogramRef = useRef<HistogramBucket[]>([]);
  const lastScrubTimeRef = useRef<number>(0);
  // RAF-based play loop refs (avoids stale closures in the animation frame)
  const rafRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const fracYearRef = useRef<number>(0);
  const yearPlayRef = useRef<number>(year);
  const boundsMaxPlayRef = useRef<number>(boundsMax);
  const boundsMinPlayRef = useRef<number>(boundsMin);
  const playSpeedRef = useRef<number>(playSpeed);
  const loopRef = useRef<boolean>(loop);

  // Keep play refs in sync with store values (read inside the RAF loop without
  // restarting it, so changing speed or loop mid-playback takes effect live).
  useEffect(() => { yearPlayRef.current = year; }, [year]);
  useEffect(() => { boundsMaxPlayRef.current = boundsMax; }, [boundsMax]);
  useEffect(() => { boundsMinPlayRef.current = boundsMin; }, [boundsMin]);
  useEffect(() => { playSpeedRef.current = playSpeed; }, [playSpeed]);
  useEffect(() => { loopRef.current = loop; }, [loop]);

  // Build histogram once bounds are known and the year index is populated.
  // Inlined (not useCallback) so the effect dep array is stable across strict-mode
  // double-invocations — a useCallback dep caused spurious re-runs that raced with
  // the interval and produced the initial white-screen error in development.
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;

    function attempt(): boolean {
      const probe = recordsActiveInYear(boundsMin + 100);
      if (probe.size === 0) return false;
      histogramRef.current = buildHistogram(boundsMin, boundsMax);
      return true;
    }

    if (attempt()) {
      setHistogramReady(true);
    } else {
      id = setInterval(() => {
        if (attempt()) {
          setHistogramReady(true);
          if (id !== null) clearInterval(id);
        }
      }, 500);
    }

    return () => { if (id !== null) clearInterval(id); };
   
  }, [boundsMin, boundsMax]);

  // ── RAF-based play loop ───────────────────────────────────────────────────────
  // Advances at timeStore.playSpeed (default 20 yrs/s, read live via playSpeedRef)
  // using requestAnimationFrame + a fractional-year accumulator so the scrubber
  // moves smoothly. At boundsMax it loops to boundsMin if loop is on, else stops.
  // The map's existing 50 ms filter throttle in MapCanvas absorbs the setYear calls.

  useEffect(() => {
    if (!playing) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastFrameTimeRef.current = null;
      fracYearRef.current = 0;
      return;
    }

    const loop = (timestamp: number) => {
      if (lastFrameTimeRef.current === null) {
        lastFrameTimeRef.current = timestamp;
        fracYearRef.current = 0;
      }

      const elapsed = timestamp - lastFrameTimeRef.current;
      lastFrameTimeRef.current = timestamp;

      // Speed is read from a ref so changing it mid-playback takes effect live
      // without restarting the loop.
      fracYearRef.current += (elapsed / 1000) * playSpeedRef.current;

      if (fracYearRef.current >= 1) {
        const wholeYears = Math.floor(fracYearRef.current);
        fracYearRef.current -= wholeYears;

        const cur = yearPlayRef.current;
        const max = boundsMaxPlayRef.current;
        const min = boundsMinPlayRef.current;
        const next = Math.min(max, cur + wholeYears);
        useTimeStore.getState().setYear(next);

        if (next >= max) {
          if (loopRef.current) {
            // Loop mode: wrap back to the start and keep playing.
            useTimeStore.getState().setYear(min);
            yearPlayRef.current = min;
            fracYearRef.current = 0;
          } else {
            useTimeStore.getState().setPlaying(false);
            rafRef.current = null;
            lastFrameTimeRef.current = null;
            fracYearRef.current = 0;
            return;
          }
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    fracYearRef.current = 0;
    lastFrameTimeRef.current = null;
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastFrameTimeRef.current = null;
      fracYearRef.current = 0;
    };
  }, [playing]);

  // ── Scrubber handlers ────────────────────────────────────────────────────

  /**
   * Handle range input changes (drag + keyboard).
   *
   * Throttle `setYear` to at most once per `scrubThrottleMs` during rapid drag.
   * We compare `performance.now()` to `lastScrubTimeRef` — no setTimeout/setInterval,
   * just a gate. This keeps the hot path at O(1) with zero allocations.
   */
  const handleScrubInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = parseInt(e.currentTarget.value, 10);
      if (Number.isNaN(raw)) return;
      const now = performance.now();
      if (now - lastScrubTimeRef.current < scrubThrottleMs) return;
      lastScrubTimeRef.current = now;
      setYear(raw);
    },
    [scrubThrottleMs, setYear],
  );

  /**
   * On pointer-up / change-commit: always apply the final value, even if the
   * throttle gate would skip it. This prevents the thumb "snapping back" at
   * the end of a drag when the last raw value was blocked by the throttle.
   */
  const handleScrubChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = parseInt(e.currentTarget.value, 10);
      if (!Number.isNaN(raw)) {
        lastScrubTimeRef.current = performance.now();
        setYear(raw);
      }
    },
    [setYear],
  );

  /**
   * Extended keyboard handler: Page Up/Down = ±10 yr, Home/End = bounds.
   * Arrow keys are already handled natively by <input type="range">.
   */
  const handleScrubKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const { key } = e;
      if (key === 'PageUp') {
        e.preventDefault();
        setYear(year - 10);
      } else if (key === 'PageDown') {
        e.preventDefault();
        setYear(year + 10);
      } else if (key === 'Home') {
        e.preventDefault();
        setYear(boundsMin);
      } else if (key === 'End') {
        e.preventDefault();
        setYear(boundsMax);
      }
    },
    [year, boundsMin, boundsMax, setYear],
  );

  // ── Play/pause toggle ────────────────────────────────────────────────────

  const handlePlayToggle = useCallback(() => {
    // Pressing play while already at the end rewinds to the start first, so the
    // button always does something visible (otherwise play-at-boundsMax is a no-op).
    if (!playing && year >= boundsMax) {
      setYear(boundsMin);
    }
    setPlaying(!playing);
  }, [playing, year, boundsMin, boundsMax, setYear, setPlaying]);

  /** Cycle playback speed through PLAY_SPEEDS (Slow → Med → Fast → Slow). */
  const handleCycleSpeed = useCallback(() => {
    const idx = PLAY_SPEEDS.indexOf(playSpeed as (typeof PLAY_SPEEDS)[number]);
    const next = PLAY_SPEEDS[(idx + 1) % PLAY_SPEEDS.length];
    setPlaySpeed(next);
  }, [playSpeed, setPlaySpeed]);

  /** Toggle loop-at-end mode. */
  const handleToggleLoop = useCallback(() => {
    setLoop(!loop);
  }, [loop, setLoop]);

  // ── Derived values ───────────────────────────────────────────────────────

  const span = boundsMax - boundsMin;

  /** Needle position as a percentage from left (0–100). */
  const needlePct = ((year - boundsMin) / span) * 100;

  /**
   * Era label for the readout: prefer the band's label if found, else
   * format the store's era string into a display form.
   */
  const eraLabel = useMemo(() => {
    const defaultLabels: Record<string, string> = {
      early: 'Early Medieval',
      high: 'High Medieval',
      late: 'Late Medieval',
    };
    if (era in defaultLabels) return defaultLabels[era];
    // Try to find the matching EraBand label.
    const band = eraBands.find((b) => b.id === era);
    if (band) return band.label;
    return era;
  }, [era, eraBands]);

  // ── Loading gate ─────────────────────────────────────────────────────────

  if (!histogramReady) {
    return <TimeRailLoading />;
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <nav
      className="msa-timerail"
      role="region"
      aria-label="Timeline — year scrubber and event density"
    >
      <div className="tr-shell">

        {/* ── 1. Year readout ──────────────────────────────────────────── */}
        <div className="tr-readout" aria-hidden="true">
          <span className="tr-readout__year mono">{year} CE</span>
          <span className="tr-readout__era">{eraLabel}</span>
        </div>

        {/* ── aria-live year announcement (screen readers only) ────────── */}
        {/*
          Visually hidden, announced by screen readers whenever the year
          changes via keyboard or playback. The scrubber already exposes
          aria-valuenow / aria-valuetext; this live region ensures the
          announcement fires even when the focus is elsewhere (e.g. during
          auto-play). Role="status" is equivalent to aria-live="polite".
        */}
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="tr-live-year"
        >
          {year} CE — {eraLabel}
        </div>

        {/* ── 2. Track area ────────────────────────────────────────────── */}
        <div className="tr-track-area">

          {/* Era ribbon */}
          <EraRibbon
            eraBands={eraBands}
            year={year}
            boundsMin={boundsMin}
            boundsMax={boundsMax}
          />

          {/* Density histogram + scrubber (overlaid) */}
          <div className="tr-histogram-wrap">
            <DensityHistogram
              buckets={histogramRef.current}
              year={year}
              boundsMin={boundsMin}
              boundsMax={boundsMax}
            />

            {/* Visual needle/thumb indicator — compositor-only transform */}
            <div
              className="tr-thumb-indicator"
              style={{ left: `${needlePct}%` }}
              aria-hidden="true"
            />

            {/* Transparent <input type="range"> overlaid on SVG for interaction */}
            <input
              type="range"
              className="tr-scrubber"
              role="slider"
              min={boundsMin}
              max={boundsMax}
              step={1}
              value={year}
              aria-label="Year scrubber"
              aria-valuemin={boundsMin}
              aria-valuemax={boundsMax}
              aria-valuenow={year}
              aria-valuetext={`${year} CE — ${eraLabel}`}
              onInput={handleScrubInput}
              onChange={handleScrubChange}
              onKeyDown={handleScrubKeyDown}
            />
          </div>

          {/* Century tick strip */}
          <CenturyStrip boundsMin={boundsMin} boundsMax={boundsMax} />

        </div>

        {/* ── 3. Playback: play/pause + speed + loop ───────────────────── */}
        <PlaybackControls
          playing={playing}
          onToggle={handlePlayToggle}
          speed={playSpeed}
          onCycleSpeed={handleCycleSpeed}
          loop={loop}
          onToggleLoop={handleToggleLoop}
        />

      </div>
    </nav>
  );
}
