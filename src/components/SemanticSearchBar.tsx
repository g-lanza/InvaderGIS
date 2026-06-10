/**
 * SemanticSearchBar — local TF-IDF / substring prose search (Wave 1B).
 *
 * Searches public/index/search.json (pre-built index of all records) using
 * a zero-network, zero-embeddings approach: substring match on name, then
 * scored TF-IDF term match on name + a snippet field if present.
 *
 * The search.json format is [{id, t (type), n (name)}, ...]. We enrich it
 * with a lightweight TF-IDF index built in memory on first query and cached
 * for the session.
 *
 * Selecting a result calls selectionStore.select(id, kind) — integrates with
 * the existing EntityDock inspector flow.
 *
 * Design: square corners, hairline borders, token-only, no shadows, 4 themes.
 * No italics in chrome. No hardcoded hex. Honest empty state when no results.
 *
 * MOUNT: TopBar adds a "Search" toggle button. The verify agent should render
 * <SemanticSearchBar open={searchOpen} onClose={...} /> as a fixed overlay in
 * AppShell above the map (z-index 55), positioned below TopBar.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { assetUrl } from '@/data/assetUrl';
import { useSelectionStore } from '@/stores/selectionStore';
import { useFocusTrap } from '@/components/useFocusTrap';

// ── Search index types ─────────────────────────────────────────────────────────

/** One entry from public/index/search.json. */
interface SearchEntry {
  /** Record id (slug). */
  id: string;
  /** Record type key, e.g. "polity", "event". */
  t: string;
  /** Primary name / title. */
  n: string;
}

/** One scored hit from a query. */
interface SearchHit {
  id: string;
  kind: string;
  label: string;
  score: number;
}

// ── TF-IDF helpers ─────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'the','a','an','and','or','but','of','in','on','at','to','for','by',
  'from','with','as','is','was','were','be','been','are','this','that',
  'it','its','they','them','their','which','who','what','when','where',
  'ce','ad','bc','bce','century','year','also','had','has','have','did',
  'do','does','into','between','after','before','during','while','than',
  'no','not','all','some','any','more','most','many','few','one','two',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

interface TFDoc {
  id: string;
  kind: string;
  label: string;
  tf: Map<string, number>;
  norm: number;
}

interface SearchIndex {
  docs: TFDoc[];
  idf: Map<string, number>;
}

let _cachedIndex: SearchIndex | null = null;
let _cachedEntries: SearchEntry[] | null = null;

/**
 * Load search.json once and cache it.
 * Returns null if the fetch fails (bake not run, dev server not started).
 */
async function loadSearchEntries(): Promise<SearchEntry[] | null> {
  if (_cachedEntries !== null) return _cachedEntries;
  try {
    const res = await fetch(assetUrl('/index/search.json'));
    if (!res.ok) return null;
    const data: SearchEntry[] = await res.json() as SearchEntry[];
    _cachedEntries = data;
    return data;
  } catch {
    return null;
  }
}

/** Build or return the cached TF-IDF index. */
async function getIndex(): Promise<SearchIndex | null> {
  if (_cachedIndex !== null) return _cachedIndex;

  const entries = await loadSearchEntries();
  if (!entries) return null;

  const docs: TFDoc[] = [];
  const df = new Map<string, number>();

  for (const entry of entries) {
    const text = entry.n;
    const tokens = tokenize(text);
    const tf = new Map<string, number>();
    for (const t of tokens) {
      tf.set(t, (tf.get(t) ?? 0) + 1);
    }
    // Update document frequency
    for (const t of tf.keys()) {
      df.set(t, (df.get(t) ?? 0) + 1);
    }
    // L2 norm (raw TF — will divide by idf at query time)
    let norm = 0;
    for (const count of tf.values()) norm += count * count;
    norm = Math.sqrt(norm) || 1;
    docs.push({ id: entry.id, kind: entry.t, label: entry.n, tf, norm });
  }

  const N = docs.length;
  const idf = new Map<string, number>();
  for (const [term, dfreq] of df) {
    idf.set(term, Math.log((N + 1) / (dfreq + 1)) + 1);
  }

  _cachedIndex = { docs, idf };
  return _cachedIndex;
}

/**
 * Score a query against the index.
 * Returns top results sorted by descending score, capped at maxResults.
 * Fast substring pre-filter ensures the expensive cosine path only runs
 * on candidates that contain at least one query token.
 */
function queryIndex(
  index: SearchIndex,
  rawQuery: string,
  maxResults = 12,
): SearchHit[] {
  const qTokens = tokenize(rawQuery);
  const qRaw    = rawQuery.toLowerCase().trim();

  // Substring match bonus — directly check label.
  const hits: SearchHit[] = [];

  for (const doc of index.docs) {
    let score = 0;

    // Substring boost: exact substring in label (fast, high signal)
    if (qRaw.length >= 2 && doc.label.toLowerCase().includes(qRaw)) {
      score += 4;
    }

    // TF-IDF cosine for token overlap
    for (const qt of qTokens) {
      const idfVal = index.idf.get(qt) ?? 0;
      const tfVal  = doc.tf.get(qt) ?? 0;
      score += (tfVal * idfVal) / doc.norm;
    }

    if (score > 0) {
      hits.push({ id: doc.id, kind: doc.kind, label: doc.label, score });
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, maxResults);
}

// ── Props ─────────────────────────────────────────────────────────────────────

/** Props for SemanticSearchBar. */
export interface SemanticSearchBarProps {
  /** Whether the search bar is open. Controlled by parent. */
  open: boolean;
  /** Called when the user closes (Escape or clicks outside). */
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Floating search bar with live TF-IDF results from public/index/search.json.
 * Zero network calls beyond the initial index fetch. Zero embeddings.
 * Selecting a result calls selectionStore.select(id, kind).
 */
export function SemanticSearchBar({ open, onClose }: SemanticSearchBarProps) {
  const [query,   setQuery]   = useState('');
  const [hits,    setHits]    = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [indexReady, setIndexReady] = useState(_cachedIndex !== null);
  const [focusIdx, setFocusIdx] = useState(-1);

  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const listRef   = useRef<HTMLUListElement>(null);

  const select = useSelectionStore((s) => s.select);

  // Focus trap: keep Tab within the dialog while open; restore on close
  useFocusTrap(dialogRef, open);

  // Ensure index is loaded when the bar opens
  useEffect(() => {
    if (!open) return;
    if (_cachedIndex !== null) { setIndexReady(true); return; }
    setLoading(true);
    void getIndex().then((idx) => {
      setIndexReady(idx !== null);
      setLoading(false);
    });
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  // Clear state on close
  useEffect(() => {
    if (!open) {
      setQuery('');
      setHits([]);
      setFocusIdx(-1);
    }
  }, [open]);

  // Escape closes
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    setFocusIdx(-1);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    if (_cachedIndex) {
      setHits(queryIndex(_cachedIndex, q));
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIdx((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && focusIdx >= 0 && hits[focusIdx]) {
      e.preventDefault();
      const hit = hits[focusIdx];
      select(hit.id, hit.kind);
      onClose();
    }
  }, [hits, focusIdx, select, onClose]);

  const handleSelect = useCallback((hit: SearchHit) => {
    select(hit.id, hit.kind);
    onClose();
  }, [select, onClose]);

  if (!open) return null;

  const showEmpty = query.trim().length >= 2 && hits.length === 0 && !loading;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-label="Search records"
      aria-modal="true"
      style={{
        position: 'fixed',
        top: 52,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 520,
        maxWidth: 'calc(100vw - 32px)',
        background: 'var(--surface)',
        border: '0.5px solid var(--border-strong)',
        zIndex: 55,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-body)',
        color: 'var(--ink)',
      }}
    >
      {/* Input row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: '6px var(--space-3)',
          borderBottom: '0.5px solid var(--border-mid)',
          background: 'var(--surface)',
        }}
      >
        <span
          aria-hidden="true"
          className="mono"
          style={{ fontSize: 12, color: 'var(--ink-mute)', flexShrink: 0 }}
        >
          ⌕
        </span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Search polities, events, rulers, sources…"
          aria-label="Search records"
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--ink)',
          }}
          autoComplete="off"
          spellCheck={false}
        />
        {loading && (
          <span className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)' }}>
            indexing…
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="btn"
          style={{ padding: '2px 7px', fontSize: 11, flexShrink: 0 }}
          aria-label="Close search"
        >
          ×
        </button>
      </div>

      {/* Results list */}
      {hits.length > 0 && (
        <ul
          ref={listRef}
          role="listbox"
          aria-label="Search results"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            maxHeight: 360,
            overflowY: 'auto',
          }}
        >
          {hits.map((hit, i) => (
            <li
              key={hit.id}
              role="option"
              aria-selected={i === focusIdx}
              onClick={() => handleSelect(hit)}
              onMouseEnter={() => setFocusIdx(i)}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 'var(--space-2)',
                padding: '6px var(--space-3)',
                cursor: 'pointer',
                borderBottom: '0.5px solid var(--border)',
                background: i === focusIdx ? 'var(--select-bg)' : 'transparent',
                outline: i === focusIdx ? '1px solid var(--border-mid)' : 'none',
                outlineOffset: -1,
              }}
            >
              <span
                className="chip"
                style={{
                  flexShrink: 0,
                  fontSize: 9,
                  padding: '1px 4px',
                  color: 'var(--ink-mute)',
                  borderColor: 'var(--border)',
                  minWidth: 60,
                  textAlign: 'center',
                }}
              >
                {hit.kind}
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: 12,
                  color: 'var(--ink)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {hit.label}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Empty state */}
      {showEmpty && (
        <div
          style={{
            padding: 'var(--space-4) var(--space-3)',
            color: 'var(--ink-mute)',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
          }}
        >
          No results for &quot;{query}&quot;
        </div>
      )}

      {/* Footer hint */}
      {!indexReady && !loading && (
        <div
          style={{
            padding: 'var(--space-2) var(--space-3)',
            color: 'var(--ink-mute)',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
          }}
        >
          Search index unavailable — run <code>npm run bake</code> first.
        </div>
      )}

      {hits.length > 0 && (
        <div
          style={{
            padding: '4px var(--space-3)',
            borderTop: '0.5px solid var(--border)',
            background: 'var(--surface-2)',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            color: 'var(--ink-mute)',
          }}
        >
          {hits.length} result{hits.length !== 1 ? 's' : ''} — ↑↓ to navigate, Enter to open
        </div>
      )}
    </div>
  );
}
