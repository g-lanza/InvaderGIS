/**
 * StatusBar — bottom strip showing real live state from all stores.
 *
 * Reads and displays:
 *   - `timeStore.year` + `timeStore.era`   (temporal cursor)
 *   - `settingsStore.theme`                 (active theme)
 *   - `settingsStore.mapType`               (active map type)
 *   - `settingsStore.projection`            (active projection)
 *   - count of visible layers from `layersStore`
 *   - `selectionStore.selectedId` / `selectedType`  (active selection)
 *   - real record counts from `recordsStore` (Spine 2b: sourced from data/)
 *
 * Layout: each StatusItem shows a muted uppercase label above/beside a mono
 * value with a controlled gap. Items are separated by hairline dividers.
 * The bar is a single flex row that truncates gracefully; it never clips text
 * mid-word because each item is `white-space: nowrap` and overflow is hidden
 * at the item level, not at the strip level.
 */
import { useTimeStore } from '@/stores/timeStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useLayersStore } from '@/stores/layersStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useRecordsStore } from '@/stores/recordsStore';

/** Single labelled datum in the status strip. */
interface StatusItemProps {
  /** Short uppercase label, e.g. "YEAR". */
  label: string;
  /** Formatted value string. */
  value: string;
  /** Allow this item to shrink and truncate on narrow viewports. Default false. */
  shrinkable?: boolean;
}

function StatusItem({ label, value, shrinkable = false }: StatusItemProps) {
  return (
    <div className={`msa-statusbar__item${shrinkable ? ' msa-statusbar__item--shrink' : ''}`}>
      <span className="msa-statusbar__label">{label}</span>
      <span className="msa-statusbar__value mono">{value}</span>
    </div>
  );
}

function StatusDivider() {
  return <div className="msa-statusbar__divider" aria-hidden="true" />;
}

/**
 * Bottom status bar: live readout of temporal cursor, theme, map settings,
 * layer count, and selection. Mono font throughout; tabular-nums on year.
 * Proves all four frozen stores are consumed correctly.
 */
export function StatusBar() {
  const year = useTimeStore((s) => s.year);
  const era  = useTimeStore((s) => s.era);

  const theme      = useSettingsStore((s) => s.theme);
  const mapType    = useSettingsStore((s) => s.mapType);
  const projection = useSettingsStore((s) => s.projection);

  const layers = useLayersStore((s) => s.layers);
  const visibleCount = Object.values(layers).filter((l) => l.visible).length;

  const selectedId   = useSelectionStore((s) => s.selectedId);
  const selectedType = useSelectionStore((s) => s.selectedType);

  // Real record counts from the data loader (Spine 2b). Null before bootstrap.
  const counts = useRecordsStore((s) => s.counts);

  const eraLabels: Record<string, string> = {
    early: 'Early Medieval',
    high:  'High Medieval',
    late:  'Late Medieval',
  };
  const eraLabel = eraLabels[era] ?? era;

  const selectionLabel = selectedId
    ? `${selectedType ?? '?'} · ${selectedId}`
    : 'none';

  // Format real record counts. "—" while bootstrap is still running.
  const dataLabel = counts !== null
    ? `${counts.polities.toLocaleString()} pol · ${counts.events.toLocaleString()} evt · ${counts.total.toLocaleString()} total`
    : '— loading —';

  return (
    <div
      className="msa-statusbar"
      role="status"
      aria-label="Application status"
      aria-live="polite"
    >
      {/* Fixed items — never shrink; these fit at 1280px */}
      <StatusItem label="Year"   value={`${year} CE`} />
      <StatusDivider />
      <StatusItem label="Era"    value={eraLabel} />
      <StatusDivider />
      <StatusItem label="Theme"  value={theme} />
      <StatusDivider />
      <StatusItem label="Map"    value={mapType} />
      <StatusDivider />
      <StatusItem label="Proj"   value={projection} />
      <StatusDivider />
      <StatusItem label="Layers" value={`${visibleCount}/${Object.keys(layers).length}`} />
      <StatusDivider />
      {/* Selection and Records may truncate on narrow widths */}
      <StatusItem label="Sel"     value={selectionLabel} shrinkable />
      <StatusDivider />
      {/* Real record counts sourced from data/ — never hardcoded (Spine 2b) */}
      <StatusItem label="Records" value={dataLabel} shrinkable />

      <div className="msa-statusbar__spacer" />

      {/* Product credit — far right, muted */}
      <div className="msa-statusbar__item msa-statusbar__item--credit" aria-hidden="true">
        <span className="msa-statusbar__value mono">InvaderGIS</span>
      </div>
    </div>
  );
}
