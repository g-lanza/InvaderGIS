/**
 * timeStore — FROZEN INTERFACE (docs/00 §1, docs/01 §2.2).
 *
 * Owns the temporal cursor: the active `year`, derived `era`, scrub throttle
 * state, and playback. Consumed by chronoscope (writer of `year` via setYear),
 * the map (reads `year` to time-scope layers), and panels.
 *
 * Phase G2 changes (schema-generalization handoff):
 *   - `YEAR_MIN` / `YEAR_MAX` remain exported as medieval defaults (500/1500)
 *     for back-compat. The store now additionally holds `boundsMin`/`boundsMax`
 *     which start at the medieval values and can be updated via `setTimeBounds`
 *     when a non-medieval dataset loads.
 *   - `eraForYear` is now dataset-aware: it uses the store's `eraBands` when
 *     present, otherwise falls back to the original medieval thresholds.
 *   - `era` field is widened to `string` so it can hold any dataset's band id.
 *     The exported `Era` union (`'early'|'high'|'late'`) is preserved for
 *     back-compat — medieval consumers that type-assert against it still compile.
 *   - `setTimeBounds(min, max)` and `setEraBands(bands)` are new actions for
 *     the dataset-bootstrap sequence. Neither imports datasetStore (avoids any
 *     circular dependency — the bootstrap caller coordinates both stores).
 *
 * Import-cycle note: timeStore does NOT import datasetStore. The two stores are
 * fully independent modules. A future app-bootstrap function (outside both stores)
 * reads from datasetStore and calls timeStore.setTimeBounds/setEraBands. This is
 * the cleanest pattern: no store depends on another store at module-load time.
 *
 * Temporal scope defaults to 500–1500 CE (docs/00 §7); setYear clamps to the
 * current active bounds.
 */
import { create } from 'zustand';
import type { EraBand } from '@/types/dataset';

// ── Back-compat medieval constants ───────────────────────────────────────────

/** Coarse era buckets over the 500–1500 window, for ribbon labels.
 *  Preserved as a union type for medieval consumers; the store's `era` field
 *  is widened to `string` to support arbitrary dataset era band ids. */
export type Era = 'early' | 'high' | 'late';

/** Medieval domain bounds — exported for back-compat (YEAR_MIN/YEAR_MAX users). */
export const YEAR_MIN = 500;
/** Medieval domain bounds — exported for back-compat (YEAR_MIN/YEAR_MAX users). */
export const YEAR_MAX = 1500;

// ── Pure era derivation ──────────────────────────────────────────────────────

/**
 * Derive the era id for a given year from a list of EraBands.
 *
 * Bands are tested in order; the first band whose [start, end] contains the year
 * wins. If no band matches (year outside all bands or bands is empty), falls back
 * to the medieval thresholds: <1000 → 'early', <1300 → 'high', else 'late'.
 *
 * This function is pure (no store access) and safe to call in render.
 */
export function eraForYear(year: number, bands?: EraBand[]): string {
  if (bands && bands.length > 0) {
    for (const band of bands) {
      if (year >= band.start && year <= band.end) return band.id;
    }
    // Year is outside all bands — return the id of the nearest band.
    const sorted = [...bands].sort((a, b) => a.start - b.start);
    if (year < sorted[0].start) return sorted[0].id;
    return sorted[sorted.length - 1].id;
  }
  // Medieval fallback: matches original thresholds exactly.
  if (year < 1000) return 'early';
  if (year < 1300) return 'high';
  return 'late';
}

// ── Store shape ──────────────────────────────────────────────────────────────

export interface TimeState {
  /** Active year, clamped to [boundsMin, boundsMax]. Default: 800. */
  year: number;
  /**
   * Derived era bucket for the active year. For the medieval dataset this is
   * always one of 'early' | 'high' | 'late'. For other datasets it is the
   * matching EraBand.id. Widened to string for dataset-agnostic consumers.
   */
  era: string;
  /** Whether the timeline is auto-playing. */
  playing: boolean;
  /**
   * Playback speed in years/second for time-lapse (the RAF loop in TimeRail reads
   * this). Default 10 — the "REG" (regular) speed (≈100 s to cross the 1000-yr
   * window). The speed control cycles Slow (5) ↔ REG (10). REG advances one year
   * per 100 ms, matching the map's 100 ms time-filter window so every year renders
   * without skipping. Additive (Phase: time-lapse enhancement) — kept optional-by-
   * default so any consumer that ignores it sees no behaviour change.
   */
  playSpeed: number;
  /**
   * Whether playback loops back to boundsMin when it reaches boundsMax instead of
   * stopping. Default false (preserves the original stop-at-end behaviour).
   */
  loop: boolean;
  /** Scrub throttle interval in ms (chronoscope reads this to throttle repaint). */
  scrubThrottleMs: number;
  /**
   * Active lower bound for the time slider. Defaults to YEAR_MIN (500).
   * Updated by `setTimeBounds` when a dataset with a different window loads.
   */
  boundsMin: number;
  /**
   * Active upper bound for the time slider. Defaults to YEAR_MAX (1500).
   * Updated by `setTimeBounds` when a dataset with a different window loads.
   */
  boundsMax: number;
  /**
   * Active era bands, or empty array when using medieval fallback thresholds.
   * Updated by `setEraBands` when a dataset with era bands loads.
   */
  eraBands: EraBand[];
  /** Set the active year, clamped to [boundsMin, boundsMax]; recomputes era. */
  setYear: (year: number) => void;
  /** Toggle or set playback. */
  setPlaying: (playing: boolean) => void;
  /** Set the time-lapse playback speed in years/second (clamped to a sane range). */
  setPlaySpeed: (yearsPerSecond: number) => void;
  /** Toggle or set whether playback loops at the end. */
  setLoop: (loop: boolean) => void;
  /**
   * Update the active time bounds (called by dataset-bootstrap when a new
   * dataset loads). Clamps the current year to the new range and recomputes era.
   */
  setTimeBounds: (min: number, max: number) => void;
  /**
   * Update the active era bands (called by dataset-bootstrap when a new
   * dataset loads). Recomputes the current era from the new bands.
   */
  setEraBands: (bands: EraBand[]) => void;
}

// ── Store instance ───────────────────────────────────────────────────────────

export const useTimeStore = create<TimeState>((set, get) => ({
  year:            800,
  era:             eraForYear(800),      // 'early' — identical to pre-G2
  playing:         false,
  playSpeed:       10,                   // yrs/s — REG: one year per 100 ms, matches the map filter window
  loop:            false,                // stop at end (prior behaviour)
  scrubThrottleMs: 16,
  boundsMin:       YEAR_MIN,             // 500
  boundsMax:       YEAR_MAX,             // 1500
  eraBands:        [],                   // empty → medieval fallback thresholds

  setYear: (year) => {
    const { boundsMin, boundsMax, eraBands } = get();
    const clamped = Math.max(boundsMin, Math.min(boundsMax, Math.round(year)));
    set({ year: clamped, era: eraForYear(clamped, eraBands.length > 0 ? eraBands : undefined) });
  },

  setPlaying: (playing) => set({ playing }),

  // Clamp speed to a sane band: 1 yr/s (study a single decade slowly) up to
  // 100 yrs/s (skim the whole window in ~10 s). Non-finite input is ignored.
  setPlaySpeed: (yearsPerSecond) => {
    if (!Number.isFinite(yearsPerSecond)) return;
    set({ playSpeed: Math.max(1, Math.min(100, yearsPerSecond)) });
  },

  setLoop: (loop) => set({ loop }),

  setTimeBounds: (min, max) => {
    const { year, eraBands } = get();
    const clamped = Math.max(min, Math.min(max, year));
    set({
      boundsMin: min,
      boundsMax: max,
      year:      clamped,
      era:       eraForYear(clamped, eraBands.length > 0 ? eraBands : undefined),
    });
  },

  setEraBands: (bands) => {
    const { year } = get();
    set({
      eraBands: bands,
      era:      eraForYear(year, bands.length > 0 ? bands : undefined),
    });
  },
}));
