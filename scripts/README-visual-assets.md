# Visual asset validator

Validates a folder of visual-option photos against the LOCKED
`docs/arcs/VISUAL_ASSET_MANIFEST.md` before anything is uploaded.

## Usage

```bash
node scripts/validate-visual-assets.mjs "C:\Users\Kalin\Avenstone-Assets"
```

Pipe it to a file for a punch list to hand off:

```bash
node scripts/validate-visual-assets.mjs "C:\Users\Kalin\Avenstone-Assets" > asset-punch-list.txt
```

The path arg is any folder — the script is not hard-coded to one location.

## What it checks

It reads the manifest, collects the **KALIN** filenames (the photos Kalin sources),
and groups every finding:

- **MISSING** — a KALIN filename with no file in the folder.
- **MISNAMED** — a file that fuzzy-matches an expected KALIN name (wrong case,
  spaces, extension, or a close typo). It prints the exact name to rename to.
- **BAD SPECS** — a correctly-named file that's off-spec: not square (±2%),
  short side < 800px, > 5MB, or a `.webp`/`.heic` format. (Manifest spec: PNG,
  square 800×800.)
- **EXTRA** — a file that matches nothing in the manifest.
- **CLAUDE-NAMED FILES PRESENT** — Claude generates the illustration assets;
  if one appears in Kalin's photo folder it's flagged (not Kalin's to upload).
- **READY** — count and % of the KALIN total that are present, named, and spec-clean.

CLAUDE illustrations are ignored for the punch list (Claude makes those in a batch).

## The gate

**Nothing uploads to the bucket until this validator exits 0.**

Exit `0` only when **MISSING, MISNAMED, and BAD SPECS are all zero**. EXTRA files
and CLAUDE-named files are reported but do not block. Exit `1` = blocked,
exit `2` = bad usage (missing/invalid folder arg).

## Dependency

Image dimensions are read with [`image-size`](https://www.npmjs.com/package/image-size)
(tiny, pure-JS, header-only) — in `devDependencies`. If it's missing:
`npm install`.
