#!/usr/bin/env bash
# bake-tiles.sh — bake GeoJSON layers into one PMTiles file with per-zoom
# simplification. No tile server; served over HTTP range requests. Needs tippecanoe.
set -euo pipefail
mkdir -p public/tiles
tippecanoe -o public/tiles/atlas.pmtiles \
  --force --drop-densest-as-needed --simplification=4 \
  -L settlements:data/_geojson/settlements.geojson \
  -L military:data/_geojson/military_sites.geojson \
  -L capitals:data/_geojson/capitals.geojson
echo "baked public/tiles/atlas.pmtiles"
