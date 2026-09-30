# Redlining Access Atlas

Independent interactive website for historical HOLC areas and households reporting
internet access. This repository and its Render service are separate from the
banned-books project.

## Coverage and meaning

All 50 states appear in the overview. Detailed data cover 19 South and West states:
124,362 Census block groups and 3,514 historical archive polygons. The remaining
states are labeled **Not yet included**, never zero access or no redlining history.

The internet measure uses ACS 2020–2024 table B28002: the percentage of households
reporting internet access, with or without a paid subscription. It does not measure
connection speed, reliability, affordability or device suitability. Each estimate
describes a whole Census block group, not only its redlined portion. No causal
claim is made. Education, crime, hospitals and libraries remain outside this phase.

## Separate Render deployment

Use the Render account **tmlee6@buffalo.edu** and create a **new Static Site** from
`tmlee10/redlining-access-atlas`. Do not attach this project to the banned-books
service. The atlas is served at its own domain root, not a `/redlining/` subfolder.

- Branch: `main`
- Build command: `bash scripts/check-static.sh`
- Publish directory: `dist`
- Service name: `redlining-access-atlas`

`render.yaml` contains the equivalent Blueprint configuration. No API key, database,
ArcGIS subscription or application server is required. Render supplies independent
static hosting; bandwidth and other account limits still apply.

## Local preview

```sh
bash scripts/check-static.sh
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000`. Use a current browser with DecompressionStream support.
The overview loads first. State data and local streets load on demand, with at most
three state datasets cached. Title, statistics and selected outline follow the same
Census area. The original geographic estimates are retained when zooming.

## Source and review

See `dist/methodology.html`, each `dist/data/*-sources.json`, and the review JSONs.
The standalone migration preserves the earlier data snapshot. Prior browser-review
records refer to their original deployment; they are historical evidence rather than
proof of the new deployment. New deployment verification is recorded separately.

`analysis/build_redlining.py` regenerates web derivatives from the original state
packages with geopandas, pandas, pyproj, shapely and pyogrio installed:

```sh
python3 analysis/build_redlining.py --sources /path/to/state/packages --states /path/to/cb_2024_us_state_20m.zip
```

Original multi-gigabyte GIS packages are not duplicated in this web repository.
Their hashes remain in `dist/data/review.json`. Native ArcGIS/QGIS runtime validation
is not claimed. D3 7.9.0 is copyright Mike Bostock and ISC licensed; see
`dist/vendor/LICENSE`.
