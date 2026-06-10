/**
 * useMeasureTool — client-side measure tool (competitive-gap closer vs ArcGIS).
 *
 * When active, each map click drops a vertex; the running great-circle path length
 * is reported live (and the enclosed area once ≥3 vertices form a ring). Renders a
 * dashed line + vertex dots as a dedicated MapLibre source/layers, fully offline.
 *
 * Pure geodesy lives in geodesy.ts (unit-tested); this hook is the thin MapLibre
 * glue: add/remove source+layers, wire click/dblclick, and surface a readout.
 * It owns ONLY its own source/layers and listeners — no frozen store, no other
 * layer touched — and tears everything down on deactivate/unmount.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { pathLengthMeters, polygonAreaSqMeters, formatDistance, formatArea } from './geodesy';

const SRC = 'measure-source';
const LINE_LAYER = 'measure-line';
const DOT_LAYER = 'measure-dots';

/** A live measurement readout for the UI. */
export interface MeasureReadout {
  /** Number of vertices placed. */
  points: number;
  /** Formatted running path length, e.g. "1,240 km". Empty when < 2 points. */
  distance: string;
  /** Formatted enclosed area, e.g. "12.4 km²". Empty when < 3 points. */
  area: string;
}

const EMPTY: MeasureReadout = { points: 0, distance: '', area: '' };

/* eslint-disable @typescript-eslint/no-explicit-any */
function toFeatureCollection(pts: Array<[number, number]>): any {
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'LineString', coordinates: pts }, properties: {} },
      ...pts.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: {} })),
    ],
  };
}

/**
 * Drive a measure tool over a MapLibre map.
 * @param map - live map instance (null while booting)
 * @param active - whether measure mode is on
 * @returns the live readout + a reset() to clear placed points
 */
export function useMeasureTool(
  map: any,
  active: boolean,
): { readout: MeasureReadout; reset: () => void } {
  const [readout, setReadout] = useState<MeasureReadout>(EMPTY);
  const ptsRef = useRef<Array<[number, number]>>([]);

  const render = useCallback(() => {
    const pts = ptsRef.current;
    const src = map?.getSource?.(SRC);
    if (src) src.setData(toFeatureCollection(pts));
    setReadout({
      points: pts.length,
      distance: pts.length >= 2 ? formatDistance(pathLengthMeters(pts)) : '',
      area: pts.length >= 3 ? formatArea(polygonAreaSqMeters(pts)) : '',
    });
  }, [map]);

  const reset = useCallback(() => {
    ptsRef.current = [];
    render();
  }, [render]);

  useEffect(() => {
    if (!map || !active) return;

    // Idempotent add: source + dashed line + vertex dots.
    if (!map.getSource(SRC)) {
      map.addSource(SRC, { type: 'geojson', data: toFeatureCollection([]) });
      map.addLayer({
        id: LINE_LAYER,
        type: 'line',
        source: SRC,
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': '#c0392b', 'line-width': 2, 'line-dasharray': [2, 1] },
      });
      map.addLayer({
        id: DOT_LAYER,
        type: 'circle',
        source: SRC,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 4,
          'circle-color': '#c0392b',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
      });
    }

    const onClick = (e: { lngLat: { lng: number; lat: number } }) => {
      ptsRef.current = [...ptsRef.current, [e.lngLat.lng, e.lngLat.lat]];
      render();
    };
    // Double-click finishes (and prevents the default zoom): just clears the
    // pending listener churn — the points stay so the reading persists.
    const onDblClick = (e: { preventDefault?: () => void }) => {
      e.preventDefault?.();
    };

    map.on('click', onClick);
    map.on('dblclick', onDblClick);
    map.getCanvas().style.cursor = 'crosshair';
    render();

    return () => {
      map.off('click', onClick);
      map.off('dblclick', onDblClick);
      try {
        if (map.getLayer(DOT_LAYER)) map.removeLayer(DOT_LAYER);
        if (map.getLayer(LINE_LAYER)) map.removeLayer(LINE_LAYER);
        if (map.getSource(SRC)) map.removeSource(SRC);
        map.getCanvas().style.cursor = '';
      } catch {
        /* map torn down mid-cleanup — nothing to free */
      }
    };
  }, [map, active, render]);

  return { readout, reset };
}
