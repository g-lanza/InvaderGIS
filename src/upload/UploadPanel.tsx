/**
 * UploadPanel.tsx — list + manage the user's imported datasets (Wave2-A).
 *
 * Lists every UserDataset from uploadStore (newest first). Per dataset:
 *   · toggle map visibility (checkbox)
 *   · EXPORT — download the dataset as a `.json` file for re-import
 *   · remove — delete it from IndexedDB + the map
 *
 * When the user has uploaded nothing, an HONEST empty state renders — never any
 * fake sample data (REALNESS law). A non-durable-storage notice appears when the
 * IndexedDB fallback is active so the user knows data won't persist across reloads.
 *
 * Square corners, hairline borders, tokens only, no shadows, four themes.
 *
 * Phase: Wave2-A (additive — reads/writes only the additive uploadStore).
 */

import { useCallback } from 'react';
import { EmptyState } from '@/components/states/EmptyState';
import { useUploadStore } from './uploadStore';
import { toExport } from './datasetBuilder';
import type { UserDataset } from './types';

/** Trigger a browser download of `dataset` as a pretty-printed `.json` file. */
function downloadDataset(dataset: UserDataset): void {
  const envelope = toExport(dataset);
  const blob = new Blob([JSON.stringify(envelope, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // Filesystem-safe filename from the dataset name.
  const safe = dataset.name.replace(/[^\w.-]+/g, '_').slice(0, 64) || 'dataset';
  a.download = `${safe}.invadergis.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the click has consumed the URL.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Format an epoch-ms timestamp as a short local date string. */
function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

/**
 * The dataset-management list rendered inside UploadOverlay's right column.
 */
export function UploadPanel() {
  const datasets = useUploadStore((s) => s.datasets);
  const visibleIds = useUploadStore((s) => s.visibleIds);
  const persisted = useUploadStore((s) => s.persisted);
  const toggleVisibility = useUploadStore((s) => s.toggleVisibility);
  const removeDataset = useUploadStore((s) => s.removeDataset);

  const onRemove = useCallback(
    (id: string, name: string) => {
      // Destructive + irreversible (deletes the dataset from IndexedDB). Confirm first.
      const ok = window.confirm(
        `Remove "${name}"? This deletes the uploaded dataset from your browser. ` +
          `This cannot be undone (export it first if you want to keep it).`,
      );
      if (ok) void removeDataset(id);
    },
    [removeDataset],
  );

  if (datasets.length === 0) {
    return (
      <section className="ud-list ud-list--empty" aria-label="My datasets">
        <EmptyState
          title="No datasets yet"
          body="Upload a GeoJSON or CSV file to visualize your own data on the map. Your data stays in this browser and is never sent anywhere."
        />
      </section>
    );
  }

  return (
    <section className="ud-list" aria-label="My datasets">
      {!persisted && (
        <p className="ud-notice" role="note">
          Storage is unavailable — datasets will not persist after you reload.
          Use Export to keep a copy.
        </p>
      )}
      <ul className="ud-datasets">
        {datasets.map((ds) => {
          const visible = visibleIds.includes(ds.id);
          return (
            <li key={ds.id} className="ud-dataset">
              <label className="ud-dataset__toggle">
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={() => toggleVisibility(ds.id)}
                  aria-label={`Show ${ds.name} on the map`}
                />
                <span className="ud-dataset__name" title={ds.name}>
                  {ds.name}
                </span>
              </label>
              <div className="ud-dataset__meta">
                <span className="ud-tag">{ds.format.toUpperCase()}</span>
                <span className="ud-dataset__count">
                  {ds.records.length.toLocaleString()} pts
                </span>
                <span className="ud-dataset__date">{formatDate(ds.importedAt)}</span>
              </div>
              <div className="ud-dataset__actions">
                <button
                  className="btn btn--ghost"
                  onClick={() => downloadDataset(ds)}
                  title={`Export ${ds.name} as a .json file`}
                >
                  Export
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={() => onRemove(ds.id, ds.name)}
                  title={`Remove ${ds.name}`}
                  aria-label={`Remove ${ds.name}`}
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
