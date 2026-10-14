# Pleasant Hill atlas integration

Status: implemented and checked locally; not published.

The pilot path connects historical Pleasant Hill D13 → Macon-Bibb city → Bibb County → Georgia → included South project states. Each level has a selected boundary or coverage extent, a label, and an explicit statistics scope. Block-group selection is a detail inside the current view. Reset and the up button preserve that hierarchy.

| Level | Statistics scope | Reported internet access |
|---|---|---:|
| Neighborhood reference | Six whole Census block groups overlapping D13; no D13-only rate | Individual estimates |
| City | Published Census record 1600000US1349008 | 89.6% |
| County | Published Census record 0500000US13021 | 89.6% |
| State | Published Census record 0400000US13 | 93.4% |
| Region | 13 included South project states; sum of state counts | 92.8% |

The regional numerator is 42,252,804 estimated households reporting internet out of 45,523,862 estimated households. It is not the complete Census South region. Aggregate regional uncertainty is unavailable. The identical city and county results are separate published records and are never added together.

Pilot filters use full precision. Below 60% returns two IDs; below 80% returns four. Optional CV screening leaves zero and two respectively. Query CSV and exclusions CSV use the same records as the map, including exclusion reasons. The example 130210101003 retains 132 of 232 households (56.9%) and a 90% margin of ±28.7 percentage points. Pilot panels and exports explicitly label 90% uncertainty; original state exports retain their labeled 95% intervals.

Validation passed: static asset check for all 19 states, JavaScript syntax, five-level navigation plus US, selection/reset behavior, exact source geography IDs, query/CSV identity, missing values, CV filtering, retained full geometry, and a deliberately unequal-household aggregation fixture. Native Canvas map snapshots were visually inspected. These are simulated DOM/native Canvas checks, not a live browser test. Browser file-save completion and mobile/touch behavior remain unverified.

Machine-readable checks: `dist/data/protocol-interaction-review.json`. Frozen source counts and provenance: `analysis/protocol-v1/`. Rebuild and test commands are documented in README.md.

Publication target: existing `tmlee10/redlining-access-atlas` main branch and its existing standalone Render service. The connected GitHub account reports pull access but no push access; publication needs repository write access or an approved signed-in browser fallback. No changes have been made to the live service.
