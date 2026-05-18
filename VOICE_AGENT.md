# Avenstone Voice Agent — Plan

Living decision log + scope for the hands-free field AI agent. Read this
at the start of any session that touches MasterAgent, ai-master-agent,
ai-field-agent, or adds voice I/O.

## Status as of 2026-05-17
- Phase 1 audit shipped (see CLAUDE_ARCHIVE.md § voice-agent-audit-2026-05-08).
- Phase 2 tool layer hardening shipped — both agents run the v1 verb roster through canonical helpers (commits 5f091fb, 2d586c7, dedc8c0).
- Phase 3 **code shipped** (commits f045752, 28bb0e4) — **device verification pending** (Codemagic build → TestFlight). Hold-to-talk mic button in MasterAgent using @capgo/capacitor-speech-recognition@8.1.2. Transcript injected into chat input via setInput; user reviews and presses Send. No auto-send.
- Phase 4 **code shipped** (commits 3b15050, 2a93d2e) — **device verification pending** (Codemagic build → TestFlight). Agent speaks replies via @capacitor-community/text-to-speech@8.0.0. Speaks response text, then confirmation card description (for money read-back). Speaker toggle button persists setting to localStorage. STT and TTS never overlap. On-device audio quality check required — see Known Limitations.
- Phase 5+ (hands-free/continuous listen) not started.

## The goal

PMs and reps are driving, on ladders, walking jobsites. They tap one
icon, talk to Claude, and Claude makes actual changes in the app —
logs payments, creates change orders, adds notes, marks phases, logs
receipts. Reads results back out loud. Confirms money actions before
writing.

This is the "AI embedded at every step of field ops" line from
CLAUDE.md made literal.

## Core architectural decisions (locked)

1. **Text-to-tool works before voice goes on top.** Typing "log a 2500
   payment from client on 123 Main" must reliably produce a
   job_transactions row before we wrap STT/TTS around it. Voice on a
   broken tool layer is miserable to debug because you can't tell if
   STT misheard or the tool call failed.

2. **Tool layer = existing sb* helpers, not new endpoints.** Every
   agent action wraps a helper already in supabase.js. No duplicate
   business logic.

3. **Money actions require explicit spoken confirmation.** Agent reads
   back the dollar amount and waits for "yes do it" (or equivalent)
   before calling the tool. Applies to: payments in/out, change
   orders, sub payouts, vendor payments, commissions. Read numbers
   back literally — "fifteen hundred" vs "fifty hundred" gets
   misheard constantly.

4. **Sonnet only, hard caps.** claude-sonnet-4-6,
   max_tokens 2048, 20-message conversation window, 3 tool-loop
   iterations max. Never Opus. These are the same caps every other
   agent in this app runs under (see CLAUDE.md API Cost Rules).

5. **Native iOS for voice I/O, not cloud.**
   - STT: iOS Speech framework (on-device, free, mic permission
     already wired for consultation mode)
   - TTS: AVSpeechSynthesizer (free, native, good enough for v1)
   - ElevenLabs and other cloud TTS deferred — revisit only if
     native voice is a dealbreaker in real use.

6. **Context inference from screen state.** If the user is on JobDet
   for a specific job, that job is the default context. If they're
   on the home screen, the agent asks which job. Don't make them say
   the job name on every turn.

7. **Visual confirmation card before writes.** Proposed action renders
   on-screen (dollar amount, job, category) while the agent reads it
   back. User can tap Confirm or say yes. Either works.

8. **Fail loud on network drops.** Truck in a basement. If the tool
   call fails, the agent says so — never silently swallow a write.

## V1 scope — verbs we support

Pick these 5 first. Everything else is v2.

1. **Log a payment** — direction in or out, to/from job, amount,
   category. Writes to job_transactions. Confirmation required.
2. **Log a receipt/expense with photo** — amount, vendor, category,
   photo upload. Writes job_transactions + uploads to job-receipts.
3. **Add a note to a job** — free text, writes job_notes. No
   confirmation needed (not destructive).
4. **Mark a phase started / complete** — writes job_phases via
   sbSubUpdatePhase or equivalent. No dollar amount so no confirmation.
5. **Submit a change order** — title, description, amount. Writes
   change_orders. Confirmation required (has a dollar amount).

Out of scope for v1: deleting anything, editing existing
transactions, sending emails/SMS, signing contracts, anything
client-facing.

## Prerequisite audit (do this before building voice)

Before any voice work starts, run a Claude Code session to:

1. Read MasterAgent.jsx and ai-master-agent edge function end to end
2. List every tool currently registered in ai-master-agent
3. Manually test from the existing chat UI: type each of the 5 v1
   verbs as a sentence, confirm it writes the correct row to the
   correct table
4. Report gaps: which verbs have no tool, which tools fire but write
   wrong data, which helpers in supabase.js need wrapping

Only after that report is clean do we layer voice on.

## Guard rails (non-negotiable)

- Confirmation required on any write that has a dollar amount
- Numbers always read back before confirming — "twenty five hundred
  dollars, correct?"
- Job context must be resolved before any write — no "which job did
  you mean" happening after the row is written
- Sonnet only, 3 tool-loop iterations max, 20-message window
- Agent states the tool it's about to call in plain English before
  calling it ("I'm going to log a payment of...")
- Network/tool errors surface to the user in speech, not just a
  silent toast
- Lien waiver missing flag still applies — if agent logs a
  sub_payout or vendor_payment, the red flag from Phase 3 shows up
  same as if it was entered manually

## Roadmap

Phase 1: Prerequisite audit — confirm text-to-tool works for all 5 v1
verbs. No voice yet.

Phase 2: Tool layer hardening — any verb that fails the audit gets
its tool written/fixed. Still text only.

Phase 3: Native iOS STT — mic icon in MasterAgent, hold-to-talk,
transcription goes into the existing chat input. User still reads
replies on screen.

Phase 4: Native iOS TTS — agent speaks replies. Still shows
confirmation cards visually.

Phase 5: Hands-free mode — continuous listen with wake word or
toggle. Only ship this after Phase 4 has real usage and we know the
failure modes.

Phase 6 (future, not scoped): Proactive agent — agent speaks up on
its own ("hey, you haven't logged anything on the Smith job in 3
days, want to add a daily log?"). Deferred until the reactive flow
is bulletproof.

## Plumbed but not wired

- MasterAgent.jsx — component exists, unclear if tool execution
  actually commits writes. Audit confirms.
- ai-master-agent, ai-field-agent edge functions — both exist,
  scope overlap unclear. Audit to decide which one becomes the
  voice agent backend (probably master-agent since it's meant to
  orchestrate).

## Open questions

- Wake word vs button tap for hands-free mode — deferred to Phase 5
- Do we want transcripts saved to job_ai_companions for replay/QA?
  Probably yes, same pattern as AiCompanionChat. Decide in Phase 3.
- Multi-turn disambiguation UX — if user says "the Smith job" and
  there are two Smiths, how does agent ask? Deferred, surface
  during Phase 1 audit.
- Offline queue — if network is out, should agent queue the write
  locally and sync when back? Probably no for v1 (fail loud is
  simpler and safer). Revisit after real field usage.

## Cost ceiling

Per CLAUDE.md rules, a typical voice session should be:
- 5-15 user turns
- Sonnet with tools
- 2048 max_tokens
- 3 tool-loop iterations max per turn

Back-of-envelope: ~$0.05-0.15 per session. A PM doing 10 sessions a
day = ~$1.50/day/user. Acceptable. If we see sessions blowing past
20 turns in logs, something's looping and we investigate.

## Rollback plan

Voice is additive — MasterAgent text mode keeps working throughout.
If voice breaks:
1. Hide the mic button (feature flag in profile or tenant settings)
2. Text mode unaffected
3. Debug, reship

No DB migrations, no deprecated tables. Low-risk layer on top of
existing agent.