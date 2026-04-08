# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

Single-file React app (`index.html`). No build step, no npm, no bundler. Everything runs in-browser:
- React 18.2 + ReactDOM via UMD CDN
- Babel Standalone transpiles JSX at runtime (inside `<script type="text/babel">`)
- Supabase JS v2 via CDN — initialized as `window.SB`

**To run**: open `index.html` in a browser. No server needed for basic use; file:// works.

## Supabase

URL: `https://cbfftukmhqvvjlrlnltk.supabase.co`  
Tables: `jobs`, `photos`, `job_notes`, `change_orders`  
Storage bucket: `job-photos`

All DB helpers are top-level functions prefixed `sb*`: `sbLoad`, `sbSave`, `sbUpd`, `sbDel`, `sbNote`, `sbPhoto`, `sbCO`, `sbUpdCO`.

## Component tree

```
App (pg state: "dashboard" | "jobs" | "intake" | "bid" | "takeoff")
├── Dash          — dashboard with stats and quick-start cards
├── JobsScr       — job list with filter bar; drills into JobDet
│   └── JobDet    — 4-tab detail view: Info / Notes / Photos / Change Orders
├── FormScr       — reusable multi-step form (used for Intake and Bid flows)
│   └── Fld       — renders a single form field based on type (text/sel/ta/mc/jp)
└── TkOf          — static instructions for material takeoff workflow
```

## Job statuses (in order)

`lead → bid_sent → signed → demo → framing → rough_mep → drywall → finish → punch → complete`  
Also: `on_hold`

## State management

- `App` owns `jobs` array (React state + `localStorage` cache under key `av_j`)
- `window.AV_JOBS` is kept in sync for cross-component access (bid form job picker)
- Supabase is the source of truth; localStorage is an optimistic cache loaded on mount

## Design tokens

- Navy: `#0A1F44`, Gold: `#C9A84C`, Cream bg: `#F7F5F0`, Border: `#E8E4DC`
- Fonts: `DM Serif Display` (headings), `DM Sans` (body) — loaded from Google Fonts
- CSS is embedded in `<style>` block starting around line 22; utility classes: `.btn`, `.btn-navy`, `.btn-gold`, `.btn-ghost`, `.finp`, `.fg`, `.flbl`, `.modal`, `.overlay`, `.badge`, `.tag`, `.card`, `.tbl`

## Extending the file

All new React components go inside the `<script type="text/babel">` block (line 158+), before the `ReactDOM.createRoot(...)` call at the bottom. New `sb*` helper functions go in the same block near the other helpers (lines 173–180). New CSS goes in the `<style>` block.
