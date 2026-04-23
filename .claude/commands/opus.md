You are helping diagnose a problem in the Avenstone app — an AI-powered construction field operations platform built with Vite + React 18, Supabase, Capacitor iOS, and native Swift RoomPlan (LiDAR) plugins.

## Context

- Repo: avenstonekc/avenstone-app
- Live: https://avenstone-app.vercel.app
- Supabase project: cbfftukmhqvvjlrlnltk
- iOS native plugin: `avenstone-vite/ios/App/CapApp-SPM/Sources/CapApp-SPM/RoomPlanPlugin.swift`
- React LiDAR UI: `avenstone-vite/src/components/ai/AiIntakeWizard.jsx`
- Capacitor bridge: `avenstone-vite/src/lib/lidar.js`

## Architecture constraints to respect

- jobs.id is TEXT (not UUID) — critical for FK relationships
- Supabase job-documents bucket is PRIVATE — always createSignedUrl, never getPublicUrl
- LiDAR world coordinates (worldX/worldZ) must be preserved so rooms merge spatially — never normalize per-room, always use global origin from StructureBuilder
- iOS build: Codemagic → TestFlight, bundle id com.avenstonekc.avenstone, no CocoaPods (SPM only)
- Capacitor uses CapacitorHttp plugin — native URLSession for fetch, do not disable
- RoomPlan API (Xcode 26.2): use `RoomBuilder(options:)` not `outputOptions:`, no `CapturedRoom.ceilings`

## The problem I need your help with

$ARGUMENTS

## What I need from you

1. Diagnose the root cause — don't guess, reason from the architecture and Apple APIs involved
2. Identify if this has any gotchas specific to Capacitor + native Swift bridging
3. Write me a precise fix — file paths, exact code, nothing vague
4. Flag anything that could regress spatial alignment (worldX/worldZ) or break the Codemagic build
5. Write a prompt I can give back to Claude Sonnet to implement the fix, with enough context that it doesn't go in circles

Be direct. If the approach is wrong, say so before writing code.
