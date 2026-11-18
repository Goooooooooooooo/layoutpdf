# Initial baseline

Measured before any Phase 6 optimization, so later changes have something to
compare against.

- Date: 2026-11-19
- Machine: Apple Silicon (`arm64`), macOS 27.2
- Node: v24.18.0
- Fonts: bundled `NotoSansCJKjp-Regular.otf` / `NotoSansCJKjp-Bold.otf`
- Command: `npm run bench`

| Case | median | p95 | min |
|---|---:|---:|---:|
| 500-row table layout + pagination | 855.19 ms | 867.64 ms | 846.27 ms |
| 500-row table PDF (no subset) | 2769.43 ms | 3043.43 ms | 2743.19 ms |
| 500-row table PDF (CJK subset) | 139.31 ms | 156.72 ms | 139.31 ms |
| 50-page PDF (no subset) | 1175.25 ms | 1182.17 ms | 1174.94 ms |
| 50-page PDF (CJK subset) | 57.72 ms | 65.19 ms | 57.72 ms |
| 300-element designer frame (resolve + layout) | 3.79 ms | 5.76 ms | 3.46 ms |

## Observations

- Table layout and pagination dominate the 500-row case (~855 ms). The same
  document draws faster with subsetting because embedding the full 16 MB CJK
  face is the expensive part of the no-subset path.
- The 300-element designer frame is already inside a 60 fps budget on this
  machine, so canvas work is not the first target; table measurement is.
- These numbers are a snapshot, not a CI threshold. Re-measure on the machine
  used for the comparison and keep scenario definitions stable.
