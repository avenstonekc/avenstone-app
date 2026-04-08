# AVENSTONE PLATFORM — FULL BUILD SPEC
## Claude Code Instructions — Read This Entire Document Before Writing Any Code

---

## WHAT WE ARE BUILDING

A multi-tenant construction project management and marketplace platform.
Avenstone Group LLC is tenant #1 and the internal test client.
The platform will eventually be sold to other KC-area contractors as a SaaS product.
A future marketplace layer connects homeowners directly to contractors.

---

## TECH STACK

- Single HTML file (index.html) — React 18 via CDN, Babel in-browser, no build step
- Supabase for auth, database, storage, edge functions
- Supabase URL: https://cbfftukmhqvvjlrlnltk.supabase.co
- Anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQ2ODgsImV4cCI6MjA5MTE5MDY4OH0.isj52drLT3pj7BF94Wa9w_y_f8U1M3W5AcgWsRaTwBQ
- Storage bucket: job-photos (public)
- Deployment: GitHub repo avenstonekc/avenstone-app → Vercel auto-deploy
- Email notifications: Resend (we will set up the account)
- SMS notifications: Twilio (we will set up the account)
- Payments: Stripe (future phase)
- Automation: Make.com webhooks (already set up)

---

## BRAND

- Company: Avenstone Group LLC
- Colors: Navy #0A1F44, Gold #C9A84C, Background #F7F5F0
- Fonts: DM Serif Display (headings), DM Sans (body)
- Logo: embedded base64 PNG (already in index.html)
- Design: Clean premium — white cards, subtle borders, SVG icons only, no emojis in UI
- Responsive: sidebar nav on desktop (768px+), bottom nav on mobile

---

## MULTI-TENANT ARCHITECTURE

Every piece of data belongs to a tenant (company).
Tenants never see each other's data — enforced at the Supabase RLS level.

### New tables needed:

**tenants**
- id (uuid, primary key)
- name (text) — company name
- slug (text, unique) — url-safe identifier
- logo_url (text)
- primary_color (text, default #0A1F44)
- plan (text, default 'starter') — starter / pro / growth
- created_at (timestamptz)

**profiles** (extends Supabase auth.users)
- id (uuid, references auth.users)
- tenant_id (uuid, references tenants)
- full_name (text)
- email (text)
- phone (text)
- role (text) — owner / sales_rep / project_manager / sub / client
- avatar_url (text)
- is_active (boolean, default true)
- notification_email (boolean, default true)
- notification_sms (boolean, default false)
- created_at (timestamptz)

All existing tables (jobs, photos, job_notes, change_orders, etc.) get a tenant_id column.
RLS policies filter all queries by the authenticated user's tenant_id.

---

## USER ROLES — DETAILED

### OWNER (Kalin, Blake)
- Full access to everything in their tenant
- Create/edit/delete any job
- Manage all users — invite, assign roles, deactivate
- See all financials — contract values, CO totals, payment status
- Approve or reject any change order
- Access reporting dashboard
- Manage tenant settings (logo, colors, company info)
- See all bids submitted by subs

### SALES REP
- Create new jobs and assign to themselves
- Fill out and submit intake forms
- Build and submit bid documents
- See only jobs assigned to them
- Add notes and upload photos to their jobs
- Submit bid to client from within the job
- Get email notification when a CO is submitted on their job
- Get email notification when client views the bid
- Cannot see financial totals for jobs not assigned to them

### PROJECT MANAGER
- See all active jobs across the tenant
- Manage phase schedules — set start and end dates per phase
- Mark phases complete
- Assign subs to specific phases on a job
- Approve or reject sub-submitted change orders (escalates to owner for final approval)
- Add notes visible to all team members
- Upload photos
- View all documents and plans per job
- Get notified on every note posted to any active job
- Get notified when a phase is overdue
- Cannot create new jobs or submit bids

### SUB / CONTRACTOR
- Login with email/password — invited by owner or PM
- See only jobs they are explicitly assigned to
- On their job view:
  - View all phases and their status
  - View documents and plans uploaded for their trade
  - Upload site photos (tagged to their trade/phase)
  - Add notes (visible to owner and PM)
  - Submit a change order request (goes to PM for review, then owner for approval)
  - View their approved COs
  - View their assigned phases and due dates
- Get email notification when assigned to a new job
- Get email notification when a phase they are on is updated
- Get email notification when their CO is approved or rejected
- Get email notification when a new note is posted on their job
- CANNOT see contract values, client info, other subs on the job, or financials

### CLIENT
- Magic link login — no password, just email link
- Invited from within a job by the owner or rep
- Stripped-down view of their job only:
  - Job address and assigned rep name/phone
  - Phase progress — visual timeline showing completed vs upcoming phases
  - Photo gallery — only photos tagged as "client visible"
  - Approved change orders — description and amount (owner can toggle financials off per job)
  - Notes tagged as "client visible" only
  - Documents tagged as "client visible" (contract, warranty, permits)
  - A message thread to communicate directly with their rep
- Get email notification when:
  - A phase is marked complete
  - New client-visible photos are uploaded
  - A change order is approved
  - A new client-visible note is posted
  - Their rep sends them a direct message

---

## EXISTING TABLES — CHANGES NEEDED

Add to all existing tables:
- tenant_id (uuid, references tenants)

Add to jobs table:
- lead_source (text) — referral / website / agent / direct / marketplace
- lead_status (text) — new / contacted / walked / bid_sent / won / lost (for pipeline view)
- assigned_pm (text) — project manager user id
- client_user_id (uuid) — links to profiles table for client portal access
- visibility_financials (boolean, default true) — toggle client seeing dollar amounts
- phase_pct_complete (integer, default 0) — calculated from phases

---

## NEW TABLES NEEDED

**job_phases**
- id (uuid)
- tenant_id (uuid)
- job_id (uuid, references jobs)
- phase_name (text) — Demo / Framing / Rough MEP / Insulation / Drywall / Paint / Flooring / Trim / Fixtures / Punch List
- phase_order (integer)
- status (text) — not_started / in_progress / complete / blocked
- assigned_sub_id (uuid, references profiles)
- start_date (date)
- end_date (date)
- actual_completion (date)
- notes (text)
- created_at (timestamptz)

**job_documents**
- id (uuid)
- tenant_id (uuid)
- job_id (uuid)
- name (text)
- file_url (text)
- file_type (text) — plan / permit / contract / spec / inspection / other
- version (integer, default 1)
- uploaded_by (uuid, references profiles)
- client_visible (boolean, default false)
- created_at (timestamptz)

**invitations_to_bid**
- id (uuid)
- tenant_id (uuid)
- job_id (uuid)
- title (text)
- description (text)
- trade (text)
- budget_range (text)
- due_date (date)
- status (text) — draft / sent / closed / awarded
- created_by (uuid)
- created_at (timestamptz)

**bid_responses**
- id (uuid)
- tenant_id (uuid)
- invitation_id (uuid, references invitations_to_bid)
- sub_id (uuid, references profiles)
- amount (numeric)
- notes (text)
- status (text) — submitted / reviewed / awarded / rejected
- submitted_at (timestamptz)

**daily_logs**
- id (uuid)
- tenant_id (uuid)
- job_id (uuid)
- log_date (date)
- author_id (uuid, references profiles)
- weather (text)
- crew_count (integer)
- work_completed (text)
- issues (text)
- photos (jsonb) — array of photo urls
- created_at (timestamptz)

**sub_reviews**
- id (uuid)
- tenant_id (uuid)
- job_id (uuid)
- sub_id (uuid, references profiles)
- reviewer_id (uuid, references profiles)
- quality_score (integer 1-5)
- timeliness_score (integer 1-5)
- communication_score (integer 1-5)
- cleanliness_score (integer 1-5)
- overall_score (numeric) — calculated average
- notes (text)
- created_at (timestamptz)

**messages** (client-rep direct thread)
- id (uuid)
- tenant_id (uuid)
- job_id (uuid)
- sender_id (uuid, references profiles)
- recipient_id (uuid, references profiles)
- content (text)
- read (boolean, default false)
- created_at (timestamptz)

**notifications**
- id (uuid)
- tenant_id (uuid)
- user_id (uuid, references profiles)
- job_id (uuid)
- type (text) — note_posted / phase_complete / co_submitted / co_approved / co_rejected / bid_received / message / assigned_to_job
- title (text)
- body (text)
- read (boolean, default false)
- email_sent (boolean, default false)
- sms_sent (boolean, default false)
- created_at (timestamptz)

---

## NOTIFICATION RULES

When a note is posted:
- Owner: always notified
- PM assigned to job: always notified
- Sales rep assigned to job: always notified
- Sub assigned to job: notified if note is not marked internal
- Client: notified only if note is marked client_visible

When a phase is marked complete:
- Owner: notified
- PM: notified
- Client: notified with friendly message "Phase X is complete on your project"

When a CO is submitted by a sub:
- PM: notified immediately for review
- Owner: notified

When a CO is approved:
- Sub who submitted: notified
- Client: notified if it affects their contract (with or without dollar amount based on visibility toggle)
- Rep assigned: notified

When a document is uploaded:
- PM: notified
- Subs assigned to that trade: notified if it's a plan relevant to them

When a daily log is submitted:
- Owner: notified
- PM: notified

When a new bid response comes in:
- Owner: notified
- PM: notified

Email provider: Resend
SMS provider: Twilio
All notifications also appear as in-app bell icon alerts

---

## SCREENS TO BUILD / UPDATE

### LOGIN SCREEN
- Clean centered card with logo
- Email input
- Password input (for owner/rep/PM/sub)
- Magic link option (for clients)
- "Sign in with magic link" sends email, shows confirmation
- No signup button — users are invited only

### DASHBOARD (updated)
- Good morning [first name] greeting based on auth session
- Stats cards: Active Jobs / Pipeline Value / Bids Outstanding / Signed This Month
- Role-aware — rep sees only their stats, PM sees all, owner sees everything
- Recent activity feed — last 10 notifications across all jobs
- Quick actions based on role

### PROJECTS SCREEN (updated)
- Table view on desktop, cards on mobile (already built)
- Add column: Phase / PM Assigned / Sub Count / Last Activity
- Filter by: Status / Rep / PM / Phase / Date Range
- Add Lead Pipeline toggle — switch between Active Jobs and Lead Pipeline view
- Lead Pipeline shows kanban-style: New / Contacted / Walked / Bid Sent / Won / Lost

### JOB DETAIL — 6 TABS (expanded from current 4)
1. INFO — client info, rep, PM, subs assigned, contract value, target completion (already built, needs tenant_id + role filtering)
2. SCHEDULE — phase timeline with dates, sub assignments per phase, Google Calendar link-out, % complete
3. NOTES — activity log (already built, needs client_visible toggle and internal flag)
4. PHOTOS — photo grid (already built, needs client_visible toggle and trade tag)
5. DOCUMENTS — plan uploads, permits, contracts, specs with version control
6. CHANGE ORDERS — existing COs + sub-submitted CO requests (already built, needs sub submission flow)

Sub view of job detail: sees Schedule, Notes (non-internal), Photos, Documents (their trade), Change Orders (their own only)
Client view of job detail: sees visual phase progress, client-visible Photos, client-visible Notes, Messages tab

### INVITATION TO BID SCREEN
- Create bid package: title, trade, scope description, budget range, due date
- Attach documents from job's document library
- Select subs to invite (from your sub directory)
- Send invitations — each sub gets email with unique link
- View responses as they come in — sub name, amount, notes
- Award button — marks job as awarded, notifies winning sub, notifies others politely

### DAILY LOG SCREEN
- Accessible from job detail
- Date picker (defaults to today)
- Weather dropdown
- Crew count
- Work completed (text area)
- Issues / blockers (text area)
- Quick photo upload
- Submit — notifies owner and PM

### SUB DIRECTORY
- List of all subs in your tenant
- Name, trade, phone, email, license number
- Average review score from completed jobs
- Jobs worked on with you
- Current availability status
- Invite to new job button
- Leave review button (after job complete)

### NOTIFICATIONS CENTER
- Bell icon in top bar / mobile header
- Unread count badge
- Full notification history
- Click notification → goes directly to relevant job and tab
- Mark all read

### USER MANAGEMENT (owner only)
- List of all users in tenant
- Invite new user — enter name, email, role — they get invite email
- Edit role, deactivate user
- See last active date

### CLIENT PORTAL (separate simplified view)
- Triggered when client magic link is used
- Shows ONLY their job
- Phase progress bar with phase names and status
- Photo gallery (client-visible only)
- Change orders (approved only, toggle for amounts)
- Messages thread with their rep
- Download documents (client-visible only)
- No sidebar, no nav — clean single page

---

## BUILD ORDER

Do these in order. Do not skip ahead. Confirm each step works before moving to next.

1. DATABASE — write all SQL for new tables and updated columns. Show me the full SQL before running anything.
2. AUTH — login screen, Supabase Auth, profiles table, role detection, session management
3. MULTI-TENANT — add tenant_id to all queries, RLS policies per role
4. SCHEDULE TAB — phase management, dates, sub assignment, Google Calendar link-out
5. DOCUMENTS TAB — file upload to Supabase Storage, PDF viewer, version control
6. NOTIFICATIONS SYSTEM — in-app bell, notification table, triggers on key events
7. EMAIL NOTIFICATIONS — Resend integration via Supabase Edge Function
8. CLIENT PORTAL — magic link flow, stripped-down job view
9. INVITATION TO BID — bid package creation, sub invites, response tracking
10. DAILY LOGS — log entry screen, photo attach, PM/owner notification
11. SUB DIRECTORY — sub profiles, reviews, ratings
12. LEAD PIPELINE — kanban view, lead stages, source tracking
13. USER MANAGEMENT — invite users, assign roles, deactivate
14. REPORTING DASHBOARD — revenue, jobs, rep performance, sub performance
15. SMS NOTIFICATIONS — Twilio integration
16. STRIPE BILLING — subscription tiers, payment collection (future phase)
17. MARKETPLACE — homeowner job posting, contractor bidding, reviews (future phase)

---

## RULES FOR CLAUDE CODE

- Never break existing functionality
- Always show SQL before running it
- Always show code changes before applying them
- Keep everything in index.html unless a feature genuinely requires a separate file (edge functions go in /supabase/functions/)
- Mobile and desktop responsive at all times
- Test Supabase reads and writes after every change
- When in doubt ask before changing anything structural
- Comments in code should explain WHY not WHAT
- No emojis in UI — SVG icons only
- DM Serif Display for headings, DM Sans for body text
- Colors: navy #0A1F44, gold #C9A84C, background #F7F5F0, white cards, border #E8E4DC
