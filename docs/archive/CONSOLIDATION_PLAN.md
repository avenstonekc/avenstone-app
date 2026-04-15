# Avenstone Consolidation Plan
# Single HTML → Vite + React Components

## Goal
Move from `index.html` (4000+ lines) to a proper Vite + React project.
App looks and works identically. Tests stay green throughout.

---

## Phase 1 — Vite Setup (no UI changes, ~1 hour)

1. `npm create vite@latest avenstone-vite -- --template react`
2. Copy over fonts, favicon, CSS tokens from `<style>` block
3. Move CDN imports to npm packages:
   - `@supabase/supabase-js`
   - `jspdf`
   - `react`, `react-dom`
4. Set up `src/lib/supabase.js` — all `sb*` helpers
5. Set up `src/lib/pdf.js` — all PDF builders (buildGenericPDF, buildProposalPDF)
6. Set up `src/lib/ai.js` — estimator fetch, openProposal
7. Set up `src/styles/tokens.css` — design tokens (navy, gold, cream, fonts)
8. Run Playwright suite — must be green before moving on

---

## Phase 2 — Extract Components (one at a time, ~1 day)

Order matters — extract leaves first, then parents.

### Batch 1 — Standalone (no dependencies on other components)
- `src/components/auth/LoginScr.jsx`
- `src/components/dashboard/DashScr.jsx`
- `src/components/common/SignaturePad.jsx`

### Batch 2 — Modals (depend on lib only)
- `src/components/modals/ContractModal.jsx`
- `src/components/modals/ClientSignContractModal.jsx`
- `src/components/modals/CompletionSignoffModal.jsx`
- `src/components/modals/PaymentModal.jsx`
- `src/components/modals/ITBModal.jsx`
- `src/components/modals/SubPickerModal.jsx`
- `src/components/modals/EstimatorModal.jsx`
- `src/components/modals/ProposalModal.jsx`

### Batch 3 — Job Detail Tabs (depend on modals + lib)
- `src/components/jobs/tabs/InfoTab.jsx`
- `src/components/jobs/tabs/ScheduleTab.jsx`
- `src/components/jobs/tabs/NotesTab.jsx`
- `src/components/jobs/tabs/PhotosTab.jsx`
- `src/components/jobs/tabs/DocumentsTab.jsx`
- `src/components/jobs/tabs/ChangeOrdersTab.jsx`
- `src/components/jobs/tabs/MessagesTab.jsx`
- `src/components/jobs/tabs/EstimateTab.jsx`
- `src/components/jobs/tabs/DailyLogsTab.jsx`
- `src/components/jobs/tabs/PaymentsTab.jsx`

### Batch 4 — Screens (depend on tabs + modals)
- `src/components/jobs/JobDet.jsx`
- `src/components/jobs/JobsScr.jsx`
- `src/components/client/ClientJobScr.jsx`
- `src/components/client/ClientScr.jsx`
- `src/components/sub/SubScr.jsx`
- `src/components/forms/FormScr.jsx`

### Batch 5 — Root
- `src/App.jsx`
- `src/main.jsx`

Run Playwright after each batch. Fix before moving to next batch.

---

## Phase 3 — White Label Prep (~2 hours)

1. Add `tenants` table to Supabase:
   ```sql
   CREATE TABLE tenants (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     name text,
     logo_url text,
     primary_color text DEFAULT '#0A1F44',
     accent_color text DEFAULT '#C9A84C',
     domain text,
     created_at timestamptz DEFAULT now()
   );
   ```
2. Load tenant config on login → apply as CSS variables
3. Swap logo from tenant config
4. Separate Vercel deployments per tenant via env var `VITE_TENANT_ID`

---

## Phase 4 — Capacitor (App Store, ~2 hours)

1. `npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android`
2. `npx cap init`
3. `npx cap add ios && npx cap add android`
4. Update `vite.config.js` base path
5. `npm run build && npx cap sync`
6. Open in Xcode → TestFlight
7. Open in Android Studio → Google Play Internal Testing

---

## File Structure (final)

```
avenstone-app/
  src/
    components/
      auth/
        LoginScr.jsx
      dashboard/
        DashScr.jsx
      jobs/
        JobsScr.jsx
        JobDet.jsx
        tabs/
          InfoTab.jsx
          ScheduleTab.jsx
          NotesTab.jsx
          PhotosTab.jsx
          DocumentsTab.jsx
          ChangeOrdersTab.jsx
          MessagesTab.jsx
          EstimateTab.jsx
          DailyLogsTab.jsx
          PaymentsTab.jsx
      client/
        ClientScr.jsx
        ClientJobScr.jsx
      sub/
        SubScr.jsx
      forms/
        FormScr.jsx
      modals/
        ContractModal.jsx
        ClientSignContractModal.jsx
        CompletionSignoffModal.jsx
        PaymentModal.jsx
        ITBModal.jsx
        SubPickerModal.jsx
        EstimatorModal.jsx
        ProposalModal.jsx
      common/
        SignaturePad.jsx
    lib/
      supabase.js      ← all sb* helpers
      pdf.js           ← jsPDF builders
      ai.js            ← AI estimator + proposal
    styles/
      tokens.css       ← design tokens
      global.css       ← utility classes (.btn, .modal, .card etc)
    App.jsx
    main.jsx
  supabase/
    functions/
      ai-project-manager/
      ai-estimator/
      send-contract-email/
      create-payment-link/
      notify-sms/
      ... (all existing)
  tests/
    avenstone.spec.js
    e2e-bathroom-remodel.spec.js
    portals-e2e.spec.js          ← from mobile test session
  index.html                     ← kept as backup until Vite is live
  playwright.config.js
  CLAUDE.md
```

---

## Notes
- Never delete `index.html` until Vite version is deployed and tested
- Keep Playwright suite green at every step
- White label and Capacitor come AFTER Vite is stable
- AI Project Manager edge function is already written — wire into UI after consolidation
