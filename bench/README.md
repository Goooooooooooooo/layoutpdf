# Benchmarks

Repeatable scenarios for the render pipeline. Run them before and after a
performance change, and record both numbers in the PR — a single run is a
sample, not a baseline.

```sh
npm run bench
```

The harness warms up each case, then reports median, p95, minimum, and total
milliseconds. Median is the headline number; p95 shows GC/JIT tails. Fonts are
loaded once before the first case and excluded from every measurement.

## Scenarios

| Case | What it measures |
|---|---|
| `500-row table layout + pagination` | `resolveRenderTree` + `layoutRenderTree` (table measurement, row height, pagination, continuation pages) from a fresh session. |
| `500-row table PDF (no subset)` | PDF drawing only: the session preview is pre-warmed in setup. |
| `500-row table PDF (CJK subset)` | HarfBuzz subsetting, temporary byte replacement, and PDF drawing for a CJK-heavy table. |
| `50-page PDF (no subset)` | Multi-page PDF assembly and drawing. |
| `50-page PDF (CJK subset)` | The same document with per-font subsetting. |
| `300-element designer frame (resolve + layout)` | One canvas frame of a 300-element page at `paginate: false`, matching what the designer re-runs while dragging. |

## Reading the numbers

- Compare the same machine, same font files, and same Node version.
- The PDF cases reuse one session, so they exclude template parsing and input
  resolution; the layout case deliberately creates a fresh session.
- If a change speeds up the PDF cases but not the layout case, it is in drawing
  or subsetting, not layout.
- Keep changes to the scenario definitions in their own commit so historical
  numbers stay comparable.
