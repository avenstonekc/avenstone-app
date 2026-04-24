RECON — do not build or change anything. Report only.

Audit the notification system end-to-end, focused on CLIENT-FACING
notifications around financial events. I need to know what actually
happens today, not what should happen.

Report on:

1. NOTIFICATION TRIGGERS — where in the code do notifications get
   created? Search for sbNotify, notify-email, notify-sms, send-push,
   and direct INSERTs into the notifications table. List every
   trigger point with file:line and what event causes it.

2. CHANNELS — for each trigger, which channel fires:
   - in-app (notifications table → NotifPanel bell)
   - email (which template? sent via what function?)
   - SMS (to what number?)
   - push (to what device?)

3. CLIENT-FACING EVENTS specifically — what currently notifies a
   client? Check these in particular:
   - Payment request sent (create-payment-link)
   - Payment received / marked paid (stripe-webhook, manual update)
   - New transaction logged on their job (direction='in')
   - Contract sent for signature
   - Change order needs approval
   - ai-pm-nightly payment_overdue rule

4. CLIENT PORTAL — does ClientPortal.jsx render a notification bell
   or list? Or do clients only see financial changes by logging in
   and looking?

5. PREFERENCES — is there any opt-in/opt-out or per-channel
   preference (e.g. "email me but don't text me")? Where is that
   stored?

6. GAPS — anything that should notify a client but currently
   doesn't? Anything that over-notifies (sends 3 messages for one
   event)?

Output a single markdown briefing. File paths, function names,
table columns. Be specific. No recommendations — just what is.