# Visual Option Library — sample style system (taste test)

Six sample diagram cards for owner review **before** the full ~118-illustration
batch. If the style lands, it's applied to the whole CLAUDE set; if not, we adjust
here first. Temporary folder — delete or promote after review.

## The one style system (applied to all six)

- **Square `viewBox="0 0 800 800"`**, white background. UI renders these as tap
  cards; square crops clean everywhere.
- **Navy `#0A1F44` line work** on white — the drawing itself.
- **Gold `#C9A84C` accent** for the *selected / defining* element only — the one
  thing that makes this option this option (the niche, the flush threshold, the
  45° run). One accent per card; everything else stays navy.
- **2.5px stroke, round caps and joins.** No hairlines, no heavy fills.
- **Minimal labels** in a clean sans (`DM Sans`, matching the app), lowercase-ish
  title at the bottom, small callouts only where they clarify.
- **Dimension callouts where the fork IS a dimension** — e.g. tile height uses a
  gold dimension line floor→ceiling; a layout fork (herringbone) does not.
- **No gradients, no shadows-as-decoration, no photorealism.** These are diagram
  cards a client taps in an interview — clarity over decoration. A client compares
  the FORK, not the rendering.

## The six samples

| File | Fork it shows | Gold accent |
|------|---------------|-------------|
| `bath_tile_height_ceiling.svg` | wall tile run to the ceiling | floor→ceiling dimension line |
| `bath_tile_layout_herringbone.svg` | herringbone wall-tile pattern | two interlocking tiles |
| `bath_entry_curbless.svg` | zero-threshold shower entry (section) | the flush threshold + linear drain |
| `bath_niche_recessed.svg` | recessed shower niche | the niche opening |
| `fence_style_shadowbox.svg` | boards alternating both sides of the rail | one front/back board pair |
| `deck_layout_diagonal.svg` | deck boards run at 45° | the 45° angle + frame |

## Naming

Files match the LOCKED `docs/arcs/VISUAL_ASSET_MANIFEST.md` stems with a `.svg`
extension (the manifest ships each CLAUDE asset as an SVG master + a PNG export of
the same stem; the app uses the PNG). **Note:** the manifest names the diagonal
deck board layout `deck_layout_diagonal` — used here verbatim (the dispatch called
it `deck_pattern_diagonal`; the manifest is the source of filenames).
