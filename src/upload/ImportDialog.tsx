/**
 * ImportDialog.tsx — drag-drop / file-pick importer for user data (Wave2-A).
 *
 * Flow:
 *   1. Drop or pick a `.geojson` / `.json` / `.csv` file.
 *   2. The file is read as text and parsed at the boundary (importParse). A
 *      previously EXPORTED `.json` is detected and round-tripped via fromExport.
 *   3. On success, a preview shows: detected format, feature/row count, skipped
 *      count, and column pickers for name + (optional) time.
 *   4. "Add to map" builds a UserDataset and hands it to uploadStore.addDataset.
 *
 * All errors are surfaced inline (never thrown). Square corners, hairline
 * borders, tokens only, no shadows — works in all four themes.
 *
 * Phase: Wave2-A (additive — reads/writes only the additive uploadStore).
 */

import { useCallback, useRef, useState } from 'react';
import { parseUpload, type ParseSuccess } from './importParse';
import { buildDataset, fromExport } from './datasetBuilder';
import { useUploadStore } from './uploadStore';

/** Accepted file extensions for the picker `accept` attribute. */
const ACCEPT = '.geojson,.json,.csv';

/** Local preview state once a file has parsed successfully. */
interface PreviewState {
  /** The successful parse result. */
  parse: ParseSuccess;
  /** Original filename (drives the default dataset name). */
  fileName: string;
  /** Currently selected name field (property key) or null for synthetic names. */
  nameField: string | null;
  /** Currently selected time field (property key) or null. */
  timeField: string | null;
}

/** Props for ImportDialog. */
export interface ImportDialogProps {
  /** Called after a dataset has been added, so the panel can refocus the list. */
  onAdded?: () => void;
}

/**
 * The import sub-panel rendered inside UploadOverlay's left column.
 *
 * @param onAdded - Optional callback fired after a dataset is added to the map.
 */
export function ImportDialog({ onAdded }: ImportDialogProps) {
  const addDataset = useUploadStore((s) => s.addDataset);

  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Read a File and route it through the parser (or export re-import). */
  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setPreview(null);
    setBusy(true);
    try {
      const text = await file.text();

      // First: is this one of OUR exported files? If so, re-import directly.
      if (/\.json$/i.test(file.name)) {
        try {
          const maybe = JSON.parse(text);
          if (maybe && typeof maybe === 'object' && 'kind' in maybe) {
            const restored = fromExport(maybe);
            if (restored.ok) {
              await addDataset(restored.dataset);
              onAdded?.();
              setBusy(false);
              return;
            }
            // If it claims to be an export but is malformed, report that.
            if (
              (maybe as { kind?: unknown }).kind === 'invadergis.userDataset'
            ) {
              setError(restored.error);
              setBusy(false);
              return;
            }
          }
        } catch {
          // Not JSON or not an export envelope — fall through to GeoJSON parse.
        }
      }

      const result = parseUpload(text, file.name);
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }
      setPreview({
        parse: result,
        fileName: file.name,
        nameField: result.suggestedNameField,
        timeField: result.suggestedTimeField,
      });
    } catch (err) {
      setError(
        `Could not read file: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setBusy(false);
    }
  }, [addDataset, onAdded]);

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handleFile(file);
      // Reset so picking the same file again re-triggers change.
      e.target.value = '';
    },
    [handleFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const onAddToMap = useCallback(async () => {
    if (!preview) return;
    const ds = buildDataset(
      preview.parse,
      preview.fileName,
      preview.nameField,
      preview.timeField,
    );
    await addDataset(ds);
    setPreview(null);
    onAdded?.();
  }, [preview, addDataset, onAdded]);

  return (
    <section className="ud-import" aria-label="Import data">
      {/* Drop zone */}
      <div
        className={`ud-drop${dragOver ? ' is-over' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        aria-label="Drop a GeoJSON or CSV file, or click to choose one"
      >
        <span className="ud-drop__title">
          {busy ? 'Reading file…' : 'Drop a file or click to browse'}
        </span>
        <span className="ud-drop__hint">.geojson · .json · .csv</span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={onInputChange}
          className="ud-visually-hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>

      {/* Error */}
      {error && (
        <p className="ud-error" role="alert">
          {error}
        </p>
      )}

      {/* Preview + field pickers */}
      {preview && (
        <div className="ud-preview">
          <dl className="ud-preview__stats">
            <div className="ud-preview__stat">
              <dt>Format</dt>
              <dd>{preview.parse.format.toUpperCase()}</dd>
            </div>
            <div className="ud-preview__stat">
              <dt>Features</dt>
              <dd>{preview.parse.records.length.toLocaleString()}</dd>
            </div>
            {preview.parse.skipped > 0 && (
              <div className="ud-preview__stat">
                <dt>Skipped</dt>
                <dd>{preview.parse.skipped.toLocaleString()}</dd>
              </div>
            )}
            <div className="ud-preview__stat">
              <dt>Columns</dt>
              <dd>{preview.parse.propertyKeys.length}</dd>
            </div>
          </dl>

          <label className="ud-field">
            <span className="ud-field__label">Name column</span>
            <select
              className="ud-select"
              value={preview.nameField ?? ''}
              onChange={(e) =>
                setPreview((p) =>
                  p ? { ...p, nameField: e.target.value || null } : p,
                )
              }
            >
              <option value="">(use Feature N)</option>
              {preview.parse.propertyKeys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>

          <label className="ud-field">
            <span className="ud-field__label">Time column (optional)</span>
            <select
              className="ud-select"
              value={preview.timeField ?? ''}
              onChange={(e) =>
                setPreview((p) =>
                  p ? { ...p, timeField: e.target.value || null } : p,
                )
              }
            >
              <option value="">(none)</option>
              {preview.parse.propertyKeys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>

          <div className="ud-preview__actions">
            <button className="btn" onClick={() => setPreview(null)}>
              Cancel
            </button>
            <button className="btn is-active" onClick={() => void onAddToMap()}>
              Add to map
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
