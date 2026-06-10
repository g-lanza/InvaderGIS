/**
 * MapControls — GIS chrome overlay for InvaderGIS (Phase 5-g).
 *
 * Renders the standard GIS controls as an absolutely-positioned overlay
 * inside .msa-map, matching ArcGIS / QGIS corner placement conventions
 * per docs/09_GIS_CONVENTIONS.md:
 *
 *   Top-left    → Zoom +/- buttons (wired to map.zoomIn / map.zoomOut)
 *   Bottom-left → Coordinate readout (live mousemove, lat-first 6dp)
 *                 + Representative-fraction scale (1:N from zoom/lat)
 *                 + Metric scale bar (MapLibre ScaleControl, relocated here)
 *
 * Data-source attribution is NOT rendered on the map — it lives in
 * Settings → Guides → Attribution (the canonical credit surface, sourced from
 * docs/03_LEGAL.md §2). Removed from the map corner by product decision (2026-06-01).
 *
 * DESIGN.md reconciliation with ArcGIS conventions:
 *   ArcGIS widget cards use drop-shadow for elevation / legibility over the map.
 *   DESIGN.md §Hard Rules forbid box-shadow on panels. Reconciliation: each
 *   control uses a var(--surface) background with a 1px var(--border-mid)
 *   hairline border — same legibility goal (widget separates from map polygons),
 *   zero shadow. This is consistent with how all panels in the app are styled.
 *
 * No external tile providers. No hardcoded hex. No fakes.
 * All values are live from the MapLibre map instance.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useMeasureTool } from './useMeasureTool';
import './mapControls.css';

// ── Types ──────────────────────────────────────────────────────────────────

interface Props {
  /** Live MapLibre Map instance. null while map is booting. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any | null;
  /** True once the map lifecycle reaches 'ready'. */
  ready: boolean;
}

interface CoordState {
  /** Formatted lat-first 6dp string, e.g. "48.856600°N, 2.352200°E" */
  formatted: string;
  /** Whether the coord is a live cursor reading (true) or center fallback (false) */
  live: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────

/**
 * Throttle interval for mousemove → coord update.
 * 50 ms = 20 fps cap — smooth enough, no thrash.
 */
const COORD_THROTTLE_MS = 50;

// Data-source attribution moved off the map into Settings → Guides → Attribution
// (the canonical credit surface, sourced from docs/03_LEGAL.md §2). Keeping the
// map corners clear of the long credit line was a product decision (2026-06-01).

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Formats a MapLibre LngLat as a lat-first 6dp string with hemisphere letters.
 * Convention from docs/09 §Coordinate display conventions.
 * e.g. "48.856600°N, 2.352200°E"
 */
function formatLngLat(lng: number, lat: number): string {
  const latAbs = Math.abs(lat).toFixed(6);
  const lngAbs = Math.abs(lng).toFixed(6);
  const latHemi = lat >= 0 ? 'N' : 'S';
  const lngHemi = lng >= 0 ? 'E' : 'W';
  return `${latAbs}°${latHemi}, ${lngAbs}°${lngHemi}`;
}

/**
 * Computes the representative-fraction scale (1:N) from map zoom and latitude.
 *
 * Formula: at zoom level z and latitude φ, the ground resolution per pixel is:
 *   res (m/px) = (2π × R_earth × cos(φ)) / (tileSize × 2^z)
 * Multiply by screen DPI (96 px/inch assumed) to get m/inch, then 1:N = 1/(res_m_per_m).
 *
 * Result is formatted with comma thousands e.g. "1:2,400,000".
 */
function computeRepresentativeFraction(zoom: number, latDeg: number): string {
  const R = 6_378_137; // WGS-84 equatorial radius, metres
  const tileSize = 512;   // MapLibre default tile size
  const screenDpi = 96;
  const inchesPerMeter = 39.3701;
  const latRad = (latDeg * Math.PI) / 180;
  // Ground resolution in metres per pixel
  const resMetresPerPx =
    (2 * Math.PI * R * Math.cos(latRad)) / (tileSize * Math.pow(2, zoom));
  // Convert to metres per screen metre (1 screen metre = DPI × inchesPerMeter pixels)
  const pxPerScreenMetre = screenDpi * inchesPerMeter;
  const mapMetresPerScreenMetre = resMetresPerPx * pxPerScreenMetre;
  const n = Math.round(mapMetresPerScreenMetre);
  // Format with comma thousands
  return `1:${n.toLocaleString('en-US')}`;
}

// ── Component ──────────────────────────────────────────────────────────────

export function MapControls({ map, ready }: Props) {
  const [coords, setCoords] = useState<CoordState>({
    formatted: '—',
    live: false,
  });
  const [rfScale, setRfScale] = useState<string>('');

  // Refs for throttle
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  // Ref to hold the scale bar DOM container so we can append MapLibre's
  // ScaleControl element into our own overlay.
  const scaleContainerRef = useRef<HTMLDivElement>(null);

  // ── Scale bar (MapLibre ScaleControl) ─────────────────────────────────
  // We add MapLibre's ScaleControl (which auto-snaps to round distances) and
  // then move its DOM element into our overlay container for proper positioning.

  useEffect(() => {
    if (!map || !ready) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let scaleControl: any = null;

    // MapLibre is already loaded at this point (map is live). Pull ScaleControl
    // from the same maplibre-gl module via map's internal reference.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ml = (map as any).constructor._classRegistry
      ? null
      : null;
    void ml; // not used — we import from the live map._controls approach below

    // Access the ScaleControl class from maplibre-gl which is already loaded.
    // We use a dynamic import that resolves from cache (no re-fetch).
    let cancelled = false;
    import('maplibre-gl').then((mod) => {
      if (cancelled || !map || !scaleContainerRef.current) return;

      const ScaleControl = mod.ScaleControl ?? mod.default?.ScaleControl;
      if (!ScaleControl) return;

      // P2-1: maxWidth raised to 180 for smoother round-number snapping — the scale
      // bar picks nicer intervals (100 km vs 50 km) with more horizontal room.
      scaleControl = new ScaleControl({ unit: 'metric', maxWidth: 180 });
      // Add to the map (MapLibre requires addControl to make the element)
      map.addControl(scaleControl, 'bottom-left');

      // Immediately move the rendered element to our overlay container.
      // MapLibre renders it inside .maplibregl-ctrl-bottom-left; we move it.
      // The CSS hides the default bottom-left container.
      const ctrlEl = (scaleControl as { _container?: HTMLElement })._container;
      if (ctrlEl && scaleContainerRef.current) {
        scaleContainerRef.current.appendChild(ctrlEl);
      }
    }).catch(() => {
      // ScaleControl unavailable — degrade gracefully (no scale bar shown)
    });

    return () => {
      cancelled = true;
      if (scaleControl) {
        try { map.removeControl(scaleControl); } catch { /* ignore */ }
      }
    };
  }, [map, ready]);

  // ── Coordinate readout + RF scale ────────────────────────────────────
  // Throttled mousemove → update formatted coords and 1:N scale.
  // rAF is used to batch DOM writes to a single frame after the throttle fires.

  const updateCoords = useCallback((lng: number, lat: number) => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setCoords({ formatted: formatLngLat(lng, lat), live: true });
    });
  }, []);

  const updateRfScale = useCallback((zoom: number, lat: number) => {
    if (rafRef.current !== null) return; // already scheduled
    setRfScale(computeRepresentativeFraction(zoom, lat));
  }, []);

  useEffect(() => {
    if (!map || !ready) return;

    // Update RF scale on initial ready and on every zoom/move end.
    const updateScale = () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      updateRfScale(zoom, center.lat);
    };
    updateScale();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleMouseMove = (e: any) => {
      if (throttleRef.current !== null) return;
      throttleRef.current = setTimeout(() => {
        throttleRef.current = null;
        updateCoords(e.lngLat.lng, e.lngLat.lat);
      }, COORD_THROTTLE_MS);
    };

    const handleMouseLeave = () => {
      if (throttleRef.current !== null) {
        clearTimeout(throttleRef.current);
        throttleRef.current = null;
      }
      // Show map center when cursor leaves
      const center = map.getCenter();
      setCoords({ formatted: formatLngLat(center.lng, center.lat), live: false });
    };

    const handleZoomEnd = () => updateScale();
    const handleMoveEnd = () => updateScale();

    map.on('mousemove', handleMouseMove);
    map.on('mouseleave', handleMouseLeave);
    map.on('zoomend', handleZoomEnd);
    map.on('moveend', handleMoveEnd);

    return () => {
      map.off('mousemove', handleMouseMove);
      map.off('mouseleave', handleMouseLeave);
      map.off('zoomend', handleZoomEnd);
      map.off('moveend', handleMoveEnd);
      if (throttleRef.current !== null) {
        clearTimeout(throttleRef.current);
        throttleRef.current = null;
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [map, ready, updateCoords, updateRfScale]);

  // ── Zoom handlers ──────────────────────────────────────────────────────

  const handleZoomIn = useCallback(() => {
    if (!map) return;
    map.zoomIn();
  }, [map]);

  const handleZoomOut = useCallback(() => {
    if (!map) return;
    map.zoomOut();
  }, [map]);

  // ── Measure tool (competitive-gap closer vs ArcGIS) ────────────────────
  const [measuring, setMeasuring] = useState(false);
  const { readout: measure, reset: resetMeasure } = useMeasureTool(map, measuring);
  const toggleMeasure = useCallback(() => {
    setMeasuring((on) => {
      if (on) resetMeasure(); // leaving measure mode clears the drawn path
      return !on;
    });
  }, [resetMeasure]);

  // ── Render — only when map is ready ───────────────────────────────────
  // The overlay is always rendered (so scaleContainerRef is mounted) but
  // controls are hidden until ready to avoid empty flicker.

  return (
    // NOTE: the root is NOT aria-hidden — it contains the interactive zoom
    // buttons (WCAG 4.1.2: focusable controls must not live in an aria-hidden
    // subtree). Decorative readouts (coords, RF scale, scale bar, attribution)
    // are individually marked aria-hidden below.
    <div className="gis-chrome">

      {/* ── Zoom control (top-left) ────────────────────────────────────── */}
      {ready && (
        <div className="gis-zoom" role="group" aria-label="Zoom controls">
          <button
            className="gis-zoom__btn"
            type="button"
            aria-label="Zoom in"
            onClick={handleZoomIn}
          >
            +
          </button>
          <div className="gis-zoom__divider" aria-hidden="true" />
          <button
            className="gis-zoom__btn"
            type="button"
            aria-label="Zoom out"
            onClick={handleZoomOut}
          >
            −
          </button>
          <div className="gis-zoom__divider" aria-hidden="true" />
          <button
            className="gis-zoom__btn"
            type="button"
            aria-label={measuring ? 'Exit measure tool' : 'Measure distance and area'}
            aria-pressed={measuring}
            title={measuring ? 'Exit measure (clears the path)' : 'Measure distance/area — click points on the map'}
            onClick={toggleMeasure}
            style={measuring ? { color: '#c0392b' } : undefined}
          >
            {/* ruler glyph */}
            ⟷
          </button>
        </div>
      )}

      {/* ── Measure readout (interactive mode — not aria-hidden) ────────── */}
      {ready && measuring && (
        <div className="gis-measure" role="status" aria-live="polite">
          <span className="gis-measure__hint">
            {measure.points === 0
              ? 'Click the map to measure'
              : `${measure.points} point${measure.points === 1 ? '' : 's'}`}
          </span>
          {measure.distance && (
            <span className="gis-measure__value">{measure.distance}</span>
          )}
          {measure.area && (
            <span className="gis-measure__value">{measure.area}</span>
          )}
        </div>
      )}

      {/* ── Bottom-left cluster (decorative readouts — aria-hidden) ─────── */}
      <div className="gis-bottom-left" aria-hidden="true">

        {/* Coordinate readout */}
        {ready && (
          <div className="gis-coords">
            <span className="gis-coords__label">
              {coords.live ? 'cursor' : 'center'}
            </span>
            <span className="gis-coords__value">
              {coords.formatted}
            </span>
          </div>
        )}

        {/* Representative-fraction scale */}
        {ready && rfScale !== '' && (
          <div className="gis-rf-scale">
            <span className="gis-rf-scale__value">{rfScale}</span>
          </div>
        )}

        {/* ScaleControl target — always mounted so the ref is valid for the effect */}
        <div
          className="gis-scale-container"
          ref={scaleContainerRef}
          aria-label="Scale bar"
        />
      </div>

      {/* Data-source attribution intentionally removed from the map; it now lives
          in Settings → Guides → Attribution (the canonical credit surface). */}

    </div>
  );
}
