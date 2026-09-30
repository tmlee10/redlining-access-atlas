#!/usr/bin/env bash
set -euo pipefail
for file in dist/index.html dist/app.js dist/styles.css dist/methodology.html dist/vendor/d3.min.js dist/data/states.json dist/data/catalog.json dist/data/review.json dist/data/connected-overview.json.gz dist/data/historical-census-links.json.gz; do
  test -s "$file" || { printf 'Missing redlining asset: %s\n' "$file" >&2; exit 1; }
done
for state in alabama arkansas florida georgia kentucky louisiana north-carolina oklahoma south-carolina tennessee texas virginia west-virginia arizona california colorado oregon utah washington; do
  for suffix in .json.gz .csv.gz -roads.json.gz -sources.json; do
    test -s "dist/data/$state$suffix" || { printf 'Missing state asset: %s%s\n' "$state" "$suffix" >&2; exit 1; }
  done
done
printf 'All 19 connected-state map assets are present.\n'
