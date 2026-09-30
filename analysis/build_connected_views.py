"""Build display-only overview geometry and exact positive-area Census links.

Rates are copied unchanged. Intersections use the existing web snapshot, not
new neighborhood estimates. Boundary-only contact is excluded. No household
counts are apportioned into HOLC polygons.
"""
import gzip
import json
from pathlib import Path

from shapely import STRtree, make_valid
from shapely.geometry import mapping, shape

ROOT = Path(__file__).resolve().parents[1] / "dist" / "data"


def pack(name, value):
    raw = json.dumps(value, separators=(",", ":"), allow_nan=False).encode()
    (ROOT / name).write_bytes(gzip.compress(raw, mtime=0))


def feature(geometry, properties):
    return {"type": "Feature", "geometry": mapping(geometry), "properties": properties}


def main():
    catalog = json.loads((ROOT / "catalog.json").read_text())
    blocks, historical, links, review = [], [], {}, []
    for state in catalog["states"]:
        source = json.loads(gzip.decompress((ROOT / (state["slug"] + ".json.gz")).read_bytes()))
        originals = source["blocks"]["features"]
        geometries = [make_valid(shape(f["geometry"])) for f in originals]
        tree = STRtree(geometries)
        state_links = {}
        for original, geometry in zip(originals, geometries):
            p = original["properties"]
            blocks.append(feature(geometry.simplify(.003, preserve_topology=True), {
                "GEOID": p["GEOID"], "internet_pct": p["internet_pct"], "state": state["id"]
            }))
        for index, original in enumerate(source["historical"]["features"]):
            geometry = make_valid(shape(original["geometry"]))
            ids = sorted(originals[int(i)]["properties"]["GEOID"]
                         for i in tree.query(geometry, predicate="intersects")
                         if geometry.intersection(geometries[int(i)]).area > 0)
            state_links[str(index)] = ids
            historical.append(feature(geometry.simplify(.0003, preserve_topology=True), {
                **original["properties"], "state": state["id"], "index": index
            }))
        links[state["id"]] = state_links
        review.append({"state": state["name"], "blocks": len(originals),
                       "historical_areas": len(state_links),
                       "areas_without_overlap": sum(not ids for ids in state_links.values())})
        print(state["name"], len(originals), len(state_links), flush=True)
    pack("connected-overview.json.gz", {"blocks": {"type": "FeatureCollection", "features": blocks},
                                        "historical": {"type": "FeatureCollection", "features": historical}})
    pack("historical-census-links.json.gz", links)
    (ROOT / "connected-review.json").write_text(json.dumps({
        "states": review, "blocks": len(blocks), "historical_areas": len(historical),
        "overview_geometry": "Display-only simplification: .003 degrees Census; .0003 degrees HOLC. Detailed state geometry is unchanged.",
        "link_method": "Positive-area intersection of the existing state web geometries; boundary-only contact excluded.",
        "statistical_scope": "Each linked rate and count covers its full Census block group; no HOLC-only rate is inferred."
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
