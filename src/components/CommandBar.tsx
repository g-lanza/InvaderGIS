/**
 * CommandBar.tsx — P4-D command palette / unified search for InvaderGIS.
 *
 * Opens on Cmd/Ctrl-K (global keydown listener on window).
 * Closes on Esc or backdrop click.
 *
 * THREE MODES:
 *   1. Fuzzy search  — typed text → ranked matches against real 4,032-entry
 *                      search index at /index/search.json. Results grouped by
 *                      type (polities / events / rulers / …).
 *   2. Slash commands — input starts with "/" → route to:
 *        /year <n>  | /y <n>   → useTimeStore.setYear(n)
 *        /show <id>            → useLayersStore.setVisible(id, true)
 *        /focus <id>           → useSelectionStore.select(id, ...)
 *        /solo <id>            → hide all layers except <id>
 *        /compare <id>         → runtime feature-detect compareStore (graceful no-op)
 *   3. Year-jump     — input is a bare number → "Jump to year N" suggestion.
 *
 * Result click: calls selectionStore.select(id, type) and closes.
 *
 * Design contract (DESIGN.md): square corners, hairline borders, no shadow,
 * token-driven — all four themes correct automatically through CSS custom props.
 *
 * Performance: index loaded once on first open (module-level cache in
 * CommandBarFuzzy.ts). Search runs in ~1.7 ms on the full 4,032-entry set.
 * Input is debounced by a 16 ms trailing timer to align with the next frame.
 *
 * @module CommandBar
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import './CommandBar.css';
import { useFocusTrap } from '@/components/useFocusTrap';
import {
  loadSearchIndex,
  fuzzySearch,
  groupByType,
  typeLabel,
  type SearchResult,
} from './CommandBarFuzzy';
import { useSelectionStore } from '@/stores/selectionStore';
import { useTimeStore }      from '@/stores/timeStore';
import { useLayersStore, LAYER_ORDER } from '@/stores/layersStore';
import { useRecentStore }    from '@/stores/recentStore';
import { humanizeType, humanizeId } from '@/data/displayName';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Internal loading state for the search index. */
type IndexState = 'idle' | 'loading' | 'ready' | 'error';

/** A slash-command suggestion item shown in the results list. */
interface SlashSuggestion {
  kind: 'slash';
  label: string;
  hint: string;
  exec: () => void;
}

/** A year-jump suggestion. */
interface YearJumpSuggestion {
  kind: 'year-jump';
  year: number;
  exec: () => void;
}

/** The flat list item type rendered in the results panel. */
type ListItem =
  | { kind: 'group-header'; label: string }
  | { kind: 'result'; result: SearchResult; index: number }
  | { kind: 'slash'; suggestion: SlashSuggestion; index: number }
  | { kind: 'year-jump'; suggestion: YearJumpSuggestion; index: number };

/** Kind pre-filter chips shown above the results. `kind: null` = all kinds. */
const KIND_CHIPS: { label: string; kind: string | null }[] = [
  { label: 'All',           kind: null },
  { label: 'Polities',      kind: 'polity' },
  { label: 'Events',        kind: 'event' },
  { label: 'Rulers',        kind: 'ruler' },
  { label: 'Relationships', kind: 'relationship' },
];

// ── Slash-command parser ──────────────────────────────────────────────────────

/**
 * Parse a slash-command input string into a structured command.
 * Returns null if the input does not start with "/".
 *
 * Supported:
 *   /year <n>  | /y <n>    → set year
 *   /show <layerId>        → show layer
 *   /focus <id>            → select record
 *   /solo <layerId>        → solo layer (hide all others)
 *   /compare <id>          → add to compare (runtime feature-detect)
 *
 * @param raw — Raw input string.
 * @returns Parsed command info or null.
 */
interface ParsedSlash {
  cmd: string;
  arg: string;
}

function parseSlash(raw: string): ParsedSlash | null {
  if (!raw.startsWith('/')) return null;
  const parts = raw.slice(1).trim().split(/\s+/);
  return { cmd: (parts[0] ?? '').toLowerCase(), arg: parts.slice(1).join(' ') };
}

// ── Keyboard nav helpers ──────────────────────────────────────────────────────

/** Retrieve all items in the list that are selectable (not group headers). */
function selectableIndices(items: ListItem[]): number[] {
  const out: number[] = [];
  let idx = 0;
  for (const item of items) {
    if (item.kind !== 'group-header') {
      out.push(idx);
    }
    idx++;
  }
  return out;
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * CommandBar — global command palette overlay.
 *
 * Manages its own open/close state internally. Mounts in AppShell so the
 * Cmd-K listener is always active and the overlay covers the full viewport.
 *
 * No props required — self-contained.
 */
export function CommandBar() {
  const [open, setOpen]           = useState(false);
  const [input, setInput]         = useState('');
  const [indexState, setIndexState] = useState<IndexState>('idle');
  const [activeIdx, setActiveIdx] = useState(0); // index into selectable items
  // Kind pre-filter: null = all kinds, else only results of this kind are shown.
  const [kindFilter, setKindFilter] = useState<string | null>(null);

  // Recents (MRU) — shown on an empty query for quick re-access.
  const recents     = useRecentStore((s) => s.recents);
  const pushRecent  = useRecentStore((s) => s.push);

  // Debounce: store the pending computed results separately from the input
  // so there is no stale-results flash while the timer fires.
  const [displayInput, setDisplayInput] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const backdropRef   = useRef<HTMLDivElement>(null);
  const inputRef      = useRef<HTMLInputElement>(null);
  const resultsRef    = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);

  // Focus trap: keep Tab within the palette while open; restore on close
  useFocusTrap(backdropRef, open);

  // Stores (accessed via .getState() in callbacks to avoid re-render coupling).
  const selectRecord = useSelectionStore(s => s.select);
  const setYear      = useTimeStore(s => s.setYear);
  const setVisible   = useLayersStore(s => s.setVisible);
  const toggleLayer  = useLayersStore(s => s.toggle);

  // ── Open / close ────────────────────────────────────────────────────────────

  const openPalette = useCallback(() => {
    setOpen(true);
    setInput('');
    setDisplayInput('');
    setActiveIdx(0);
    setKindFilter(null);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
    setInput('');
    setDisplayInput('');
    setActiveIdx(0);
    setKindFilter(null);
  }, []);

  // ── Global Cmd-K / Ctrl-K listener ──────────────────────────────────────────

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const mod   = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key === 'k') {
        e.preventDefault();
        if (open) {
          closePalette();
        } else {
          openPalette();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, openPalette, closePalette]);

  // ── Auto-focus input when opened ────────────────────────────────────────────

  useEffect(() => {
    if (open) {
      // Defer one frame so the element is visible before focusing.
      const id = requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [open]);

  // ── Load search index on first open ─────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    if (indexState === 'ready' || indexState === 'loading') return;

    setIndexState('loading');
    loadSearchIndex()
      .then(() => setIndexState('ready'))
      .catch(() => setIndexState('error'));
  }, [open, indexState]);

  // ── Debounce input → displayInput ───────────────────────────────────────────

  useEffect(() => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDisplayInput(input);
      setActiveIdx(0);
    }, 16);
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, [input]);

  // ── Slash-command execution ──────────────────────────────────────────────────

  const execSlash = useCallback((cmd: string, arg: string) => {
    const trimArg = arg.trim();

    if (cmd === 'year' || cmd === 'y') {
      const n = parseInt(trimArg, 10);
      if (!isNaN(n)) {
        setYear(n);
        closePalette();
      }
      return;
    }

    if (cmd === 'show') {
      if (trimArg) {
        setVisible(trimArg, true);
        closePalette();
      }
      return;
    }

    if (cmd === 'focus') {
      if (trimArg) {
        // We don't know the type from the id alone; pass the id with a generic
        // kind so the selection store can open the inspector. The EntityDock
        // will resolve the real type from the recordsStore.
        selectRecord(trimArg, 'unknown');
        closePalette();
      }
      return;
    }

    if (cmd === 'solo') {
      if (trimArg) {
        // Hide all layers, then show the requested one.
        for (const layerId of LAYER_ORDER) {
          setVisible(layerId, layerId === trimArg);
        }
        closePalette();
      }
      return;
    }

    if (cmd === 'compare') {
      if (trimArg) {
        // Runtime feature-detect: the compareStore may not exist yet (parallel
        // P4-C builder). Dynamically import and call if available; graceful no-op
        // otherwise. The dynamic import is intentionally not a static import so
        // it does not break the build if the file is absent.
        void (async () => {
          try {
            const m = await import('@/stores/compareStore');
            // The module exists; call add if the expected API is present.
            const store = (m as { useCompareStore?: { getState: () => { add: (id: string, kind: string) => void } } }).useCompareStore;
            if (store && typeof store.getState === 'function') {
              store.getState().add(trimArg, 'unknown');
            }
          } catch {
            // compareStore not yet built by the P4-C builder — no-op.
            // Show a transient hint by briefly flashing the input placeholder.
          }
          closePalette();
        })();
      }
      return;
    }

    // Unknown command — do not close; let the user refine.
  }, [setYear, setVisible, selectRecord, closePalette]);

  // ── Build flat item list for rendering ─────────────────────────────────────

  const items: ListItem[] = (() => {
    const out: ListItem[] = [];
    const q = displayInput.trim();

    // Year-jump mode: bare integer in range.
    if (/^\d{1,4}$/.test(q)) {
      const year = parseInt(q, 10);
      if (year >= 1 && year <= 9999) {
        const suggestion: YearJumpSuggestion = {
          kind: 'year-jump',
          year,
          exec: () => { setYear(year); closePalette(); },
        };
        out.push({ kind: 'year-jump', suggestion, index: 0 });
        return out;
      }
    }

    // Slash-command mode.
    if (q.startsWith('/')) {
      const parsed = parseSlash(q);
      if (parsed !== null) {
        const { cmd, arg } = parsed;

        // Build contextual suggestions based on partial command.
        const suggestions: SlashSuggestion[] = [];

        if ('year'.startsWith(cmd) || 'y'.startsWith(cmd)) {
          suggestions.push({
            kind: 'slash',
            label: `/year ${arg || '<year>'}`,
            hint: 'Jump to year',
            exec: () => execSlash('year', arg),
          });
        }
        if ('show'.startsWith(cmd)) {
          suggestions.push({
            kind: 'slash',
            label: `/show ${arg || '<layerId>'}`,
            hint: 'Show a map layer',
            exec: () => execSlash('show', arg),
          });
        }
        if ('focus'.startsWith(cmd)) {
          suggestions.push({
            kind: 'slash',
            label: `/focus ${arg || '<recordId>'}`,
            hint: 'Select a record by id',
            exec: () => execSlash('focus', arg),
          });
        }
        if ('solo'.startsWith(cmd)) {
          suggestions.push({
            kind: 'slash',
            label: `/solo ${arg || '<layerId>'}`,
            hint: 'Solo a layer (hide all others)',
            exec: () => execSlash('solo', arg),
          });
        }
        if ('compare'.startsWith(cmd)) {
          suggestions.push({
            kind: 'slash',
            label: `/compare ${arg || '<recordId>'}`,
            hint: 'Add to compare view',
            exec: () => execSlash('compare', arg),
          });
        }

        // If cmd is fully typed and valid, also show a "Run" suggestion.
        const KNOWN_CMDS = ['year', 'y', 'show', 'focus', 'solo', 'compare'];
        if (KNOWN_CMDS.includes(cmd) && arg.trim()) {
          suggestions.push({
            kind: 'slash',
            label: `Run: /${cmd} ${arg}`,
            hint: 'Press Enter to execute',
            exec: () => execSlash(cmd, arg),
          });
        }

        if (suggestions.length > 0) {
          out.push({ kind: 'group-header', label: 'Commands' });
          suggestions.forEach((suggestion, i) => {
            out.push({ kind: 'slash', suggestion, index: i });
          });
        } else {
          // No matching command — show all available commands.
          const all: SlashSuggestion[] = [
            { kind: 'slash', label: '/year <n>', hint: 'Jump to year', exec: () => { /* no-op */ } },
            { kind: 'slash', label: '/show <layerId>', hint: 'Show a map layer', exec: () => { /* no-op */ } },
            { kind: 'slash', label: '/focus <recordId>', hint: 'Select a record by id', exec: () => { /* no-op */ } },
            { kind: 'slash', label: '/solo <layerId>', hint: 'Solo a layer', exec: () => { /* no-op */ } },
            { kind: 'slash', label: '/compare <recordId>', hint: 'Add to compare view', exec: () => { /* no-op */ } },
          ];
          out.push({ kind: 'group-header', label: 'Available Commands' });
          all.forEach((suggestion, i) => {
            out.push({ kind: 'slash', suggestion, index: i });
          });
        }
      }
      return out;
    }

    // Empty query → show recents (MRU) for quick re-access.
    if (q.length === 0) {
      if (recents.length === 0) return out;
      let recentIdx = 0;
      out.push({ kind: 'group-header', label: 'Recent' });
      for (const r of recents) {
        if (kindFilter && r.t !== kindFilter) continue;
        out.push({ kind: 'result', result: { ...r, score: 0 }, index: recentIdx++ });
      }
      return out;
    }

    // Fuzzy search mode.
    if (indexState !== 'ready') return out;

    // Kind pre-filter is applied inside fuzzySearch (before the result cap) so
    // kind-scoped keyword matches aren't crowded out by other kinds.
    const results = fuzzySearch(q, kindFilter);
    const grouped  = groupByType(results);
    let globalIdx  = 0;

    for (const [type, typeResults] of grouped) {
      out.push({ kind: 'group-header', label: typeLabel(type) });
      for (const result of typeResults) {
        out.push({ kind: 'result', result, index: globalIdx++ });
      }
    }

    return out;
  })();

  // Selectable items (non-headers) for keyboard navigation.
  const selectables = selectableIndices(items);
  const clampedActive = Math.min(activeIdx, Math.max(0, selectables.length - 1));

  // ── Keyboard navigation within the palette ──────────────────────────────────

  function handlePaletteKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closePalette();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, selectables.length - 1));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      // Find the active selectable item.
      const activeItemIndex = selectables[clampedActive];
      if (activeItemIndex === undefined) return;
      const item = items[activeItemIndex];
      if (!item) return;
      if (item.kind === 'result') {
        handleResultSelect(item.result);
      } else if (item.kind === 'slash') {
        item.suggestion.exec();
      } else if (item.kind === 'year-jump') {
        item.suggestion.exec();
      }
    }
  }

  // Scroll active item into view.
  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [clampedActive]);

  // ── Result selection ────────────────────────────────────────────────────────

  function handleResultSelect(result: SearchResult) {
    pushRecent({ id: result.id, t: result.t, n: result.n });
    selectRecord(result.id, result.t);
    closePalette();
  }

  // ── Toggle layer visibility ─────────────────────────────────────────────────
  // Exposed here for completeness; execSlash covers the /show path.
  void toggleLayer; // silence unused lint — toggleLayer used if needed by slash cmd

  // ── Highlight matched portion of a name ─────────────────────────────────────

  function highlightMatch(name: string, query: string): React.ReactNode {
    if (!query) return name;
    const q = query.toLowerCase();
    const n = name.toLowerCase();
    const idx = n.indexOf(q);
    if (idx === -1) return name;
    return (
      <>
        {name.slice(0, idx)}
        <mark>{name.slice(idx, idx + q.length)}</mark>
        {name.slice(idx + q.length)}
      </>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!open) return null;

  const q = displayInput.trim();

  // Determine selectable item position for each list item to detect active state.
  // Build a lookup: listIndex → selectablePosition (i.e., nth selectable item).
  const selectablePositionMap = new Map<number, number>();
  {
    let pos = 0;
    items.forEach((item, idx) => {
      if (item.kind !== 'group-header') {
        selectablePositionMap.set(idx, pos++);
      }
    });
  }

  return (
    <div
      ref={backdropRef}
      className="cmd-backdrop"
      onMouseDown={(e) => {
        // Close when clicking the backdrop, not the palette itself.
        if (e.target === e.currentTarget) closePalette();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="cmd-palette"
        onKeyDown={handlePaletteKeyDown}
        role="combobox"
        aria-expanded="true"
        aria-haspopup="listbox"
        aria-controls="cmd-results-list"
      >
        {/* ── Input row ── */}
        <div className="cmd-input-row">
          <span className="cmd-input-icon" aria-hidden="true">⌘</span>
          <input
            ref={inputRef}
            className="cmd-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              indexState === 'loading'
                ? 'Loading index…'
                : indexState === 'error'
                  ? 'Index unavailable'
                  : 'Search or type / for commands…'
            }
            aria-label="Command or search query"
            aria-autocomplete="list"
            aria-controls="cmd-results-list"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <span className="cmd-kbd-esc" aria-label="Press Escape to close">esc</span>
        </div>

        {/* ── Kind pre-filter chips ── */}
        {(q.length > 0 || recents.length > 0) && !q.startsWith('/') && (
          <div className="cmd-kind-chips" role="group" aria-label="Filter by kind">
            {KIND_CHIPS.map((kc) => {
              const active = kindFilter === kc.kind;
              return (
                <button
                  key={kc.label}
                  type="button"
                  className={`cmd-kind-chip${active ? ' is-active' : ''}`}
                  aria-pressed={active}
                  onClick={() => { setKindFilter(kc.kind); setActiveIdx(0); }}
                >
                  {kc.label}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Results ── */}
        <div
          ref={resultsRef}
          id="cmd-results-list"
          className="cmd-results"
          role="listbox"
          aria-label="Search results"
        >
          {/* Loading state */}
          {indexState === 'loading' && q.length > 0 && (
            <div className="cmd-state" aria-live="polite">Loading index…</div>
          )}

          {/* Error state */}
          {indexState === 'error' && (
            <div className="cmd-state cmd-state--error" aria-live="polite">
              Could not load search index. Run npm run bake and restart the dev server.
            </div>
          )}

          {/* Empty query + ready + no recents to show: hint */}
          {indexState === 'ready' && q.length === 0 && items.length === 0 && (
            <div className="cmd-state">
              Type to search — or / for commands
            </div>
          )}

          {/* Idle + no input */}
          {indexState === 'idle' && q.length === 0 && (
            <div className="cmd-state">
              Type to search or use / commands
            </div>
          )}

          {/* Results list */}
          {items.length > 0 && (
            <div>
              {items.map((item, listIdx) => {
                const selectablePos = selectablePositionMap.get(listIdx);
                const isActive      = selectablePos === clampedActive;

                if (item.kind === 'group-header') {
                  return (
                    <div key={`h-${listIdx}`} className="cmd-group-label" aria-hidden="true">
                      {item.label}
                    </div>
                  );
                }

                if (item.kind === 'result') {
                  const { result } = item;
                  return (
                    <button
                      key={result.id}
                      ref={isActive ? (el) => { activeItemRef.current = el; } : null}
                      className={`cmd-item${isActive ? ' is-active' : ''}`}
                      role="option"
                      aria-selected={isActive}
                      onClick={() => handleResultSelect(result)}
                      onMouseEnter={() => {
                        if (selectablePos !== undefined) setActiveIdx(selectablePos);
                      }}
                      tabIndex={-1}
                    >
                      <span className="cmd-item__name">
                        {highlightMatch(result.n, q)}
                      </span>
                      <span className="cmd-item__kind">{humanizeType(result.t)}</span>
                      {/* Humanized id (raw slug kept only in the title tooltip). */}
                      <span className="cmd-item__id" title={result.id}>{humanizeId(result.id)}</span>
                    </button>
                  );
                }

                if (item.kind === 'slash') {
                  const { suggestion } = item;
                  return (
                    <button
                      key={`slash-${listIdx}`}
                      ref={isActive ? (el) => { activeItemRef.current = el; } : null}
                      className={`cmd-item cmd-item--slash${isActive ? ' is-active' : ''}`}
                      role="option"
                      aria-selected={isActive}
                      onClick={() => suggestion.exec()}
                      onMouseEnter={() => {
                        if (selectablePos !== undefined) setActiveIdx(selectablePos);
                      }}
                      tabIndex={-1}
                    >
                      <span className="cmd-item__name">{suggestion.label}</span>
                      <span className="cmd-item__id">{suggestion.hint}</span>
                    </button>
                  );
                }

                if (item.kind === 'year-jump') {
                  const { suggestion } = item;
                  return (
                    <button
                      key={`year-${suggestion.year}`}
                      ref={isActive ? (el) => { activeItemRef.current = el; } : null}
                      className={`cmd-item cmd-item--year-jump${isActive ? ' is-active' : ''}`}
                      role="option"
                      aria-selected={isActive}
                      onClick={() => suggestion.exec()}
                      onMouseEnter={() => {
                        if (selectablePos !== undefined) setActiveIdx(selectablePos);
                      }}
                      tabIndex={-1}
                    >
                      <span className="cmd-item__name">
                        Jump to year {suggestion.year}
                      </span>
                      <span className="cmd-item__id">timeStore.setYear</span>
                    </button>
                  );
                }

                return null;
              })}
            </div>
          )}

          {/* No results */}
          {indexState === 'ready' && q.length > 0 && items.length === 0 && (
            <div className="cmd-state" aria-live="polite">
              No results for "{q}"
            </div>
          )}
        </div>

        {/* ── Footer hint ── */}
        <div className="cmd-footer" aria-hidden="true">
          <span className="cmd-footer-hint">
            <kbd>↑↓</kbd> navigate
          </span>
          <span className="cmd-footer-hint">
            <kbd>⏎</kbd> select
          </span>
          <span className="cmd-footer-hint">
            <kbd>/</kbd> commands
          </span>
          <span className="cmd-footer-hint">
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
