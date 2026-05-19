# -*- coding: utf-8 -*-
"""Phase 5 verification — gate resolution two-card flow on advance_phase."""
import json, urllib.request, sys, time

ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQ2ODgsImV4cCI6MjA5MTE5MDY4OH0.isj52drLT3pj7BF94Wa9w_y_f8U1M3W5AcgWsRaTwBQ'
SUPABASE = 'https://cbfftukmhqvvjlrlnltk.supabase.co'
EDGE = SUPABASE + '/functions/v1/ai-master-agent'
JOB = 'test-flow-001'
USER_ID = '53dc982e-93a5-4220-9c52-422f0151e4ad'
BASE = {'user_id': USER_ID,
        'tenant_id': '00000000-0000-0000-0000-000000000001',
        'role': 'project_manager', 'full_name': 'Test PM'}


def get_pm_token():
    body = json.dumps({'email': 'test-pm@avenstonekc.com', 'password': 'TestPM2026!'}).encode('utf-8')
    req = urllib.request.Request(
        f'{SUPABASE}/auth/v1/token?grant_type=password',
        data=body, method='POST',
        headers={'apikey': ANON, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode('utf-8'))['access_token']


def post(payload):
    body = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(EDGE, data=body, method='POST',
        headers={'Authorization': f'Bearer {ANON}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode('utf-8'))


def rest_get(url, token):
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}', 'apikey': ANON})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode('utf-8'))


def rest_patch(url, token, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode('utf-8'), method='PATCH',
        headers={'Authorization': f'Bearer {token}', 'apikey': ANON,
                 'Content-Type': 'application/json', 'Prefer': 'return=representation'})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode('utf-8'))


def p(s):
    print(str(s).encode('utf-8', errors='replace').decode('utf-8', errors='replace'))


def reset_job(token):
    """Reset test-flow-001 back to in_progress with no override."""
    return rest_patch(
        f'{SUPABASE}/rest/v1/jobs?id=eq.{JOB}',
        token,
        {'status': 'in_progress',
         'phase_override_used': False,
         'phase_override_reason': None,
         'phase_override_at': None,
         'phase_override_by_id': None})


def fmt_card(card, answers):
    """Mirror of formatCardAnswers in agentCards.js."""
    lines = [f'Card answered (id: {card["id"]}):', f'Prompt: {card["prompt"]}']
    for qq in card['questions']:
        ans = answers.get(qq['id'])
        if qq['type'] == 'select':
            opt = next((o for o in qq['options'] if o['value'] == ans), None)
            label = opt['label'] if opt else str(ans)
            value = opt['value'] if opt else str(ans)
            display = label if label == value else f'{label} (value: {value})'
            lines.append(f'{qq["label"]}: {display}')
        elif qq['type'] == 'text':
            lines.append(f'{qq["label"]}: {str(ans) if ans is not None else ""}')
    return '\n'.join(lines)


def show_card(pc, indent='  '):
    p(f'{indent}prompt: {pc["prompt"]}')
    if pc.get('meta'):
        p(f'{indent}meta: {pc["meta"]}')
    for q in pc.get('questions', []):
        opts_str = f' ({len(q["options"])} opts)' if q['type'] == 'select' else ''
        opt_flag = ' [optional]' if q.get('optional') else ''
        p(f'{indent}  Q [{q["type"]}] {q["id"]}: "{q["label"]}"{opts_str}{opt_flag}')


def advance_phase_call(jobsearch_text):
    """Send the user message, agent calls get_jobs then advance_phase. Returns
    the final response (which may include Card A via POST_EXECUTE_ELICIT)."""
    r = post({**BASE, 'message': jobsearch_text, 'conversation_history': []})
    # advance_phase is NOT in CONFIRM_TOOLS — the agent loop runs it directly.
    # POST_EXECUTE_ELICIT fires on gate failure and returns Card A.
    return r


token = get_pm_token()

# Pre-test: reset job state
p('=== SETUP ===')
reset_job(token)
row = rest_get(f'{SUPABASE}/rest/v1/jobs?id=eq.{JOB}&select=status,phase_override_used,phase_override_reason', token)[0]
p(f'  job reset: {row}')

# ─────────────────────────────────────────────────────────────────────────────
# Test 1: override path — gates fail → Card A → Override → Card B → advance
# ─────────────────────────────────────────────────────────────────────────────
p('\n=== TEST 1: gate-fail → Card A → Override → Card B → advance ===')
r1 = advance_phase_call('advance the 123 Test Flow Dr job phase')
cardA = r1.get('pending_card')
if not cardA:
    p(f'FAIL: expected Card A after gate-fail. response={r1.get("response","")[:200]}')
    sys.exit(1)
if cardA.get('meta', {}).get('kind') != 'gate_resolution':
    p(f'FAIL: expected meta.kind=gate_resolution. meta={cardA.get("meta")}')
    sys.exit(1)
p('Card A:')
show_card(cardA)
# Confirm override is LAST option
opt_values = [o['value'] for o in cardA['questions'][0]['options']]
if opt_values != ['redirect_schedule', 'leave_open', 'override']:
    p(f'FAIL: option order wrong. got {opt_values}')
    sys.exit(1)
p('PASS: option order = redirect, leave_open, override (override LAST)')

# Pick Override
hist1 = [
    {'role': 'user', 'content': '<test bootstrap>'},
    {'role': 'assistant', 'content': r1['response']},
    {'role': 'user', 'content': fmt_card(cardA, {'gate_action': 'override'})},
]
r2 = post({**BASE,
    'card_response': {'card_id': cardA['id'], 'answers': {'gate_action': 'override'}, 'meta': cardA['meta']},
    'conversation_history': hist1})
cardB = r2.get('pending_card')
if not cardB:
    p(f'FAIL: expected Card B. response={r2.get("response","")[:200]}')
    sys.exit(1)
if cardB.get('meta', {}).get('kind') != 'gate_override':
    p(f'FAIL: Card B meta wrong. meta={cardB.get("meta")}')
    sys.exit(1)
p('\nCard B:')
show_card(cardB)
# Verify Card B has reason (required) + detail (optional)
qB = {q['id']: q for q in cardB['questions']}
if 'reason' not in qB or 'detail' not in qB:
    p(f'FAIL: Card B missing reason/detail. ids={list(qB.keys())}')
    sys.exit(1)
if qB['detail'].get('optional') != True:
    p(f'FAIL: detail must be optional. got {qB["detail"]}')
    sys.exit(1)
p('PASS: Card B has reason (required) + detail (optional)')

# Pick reason + add detail
hist2 = hist1 + [
    {'role': 'assistant', 'content': r2['response']},
    {'role': 'user', 'content': fmt_card(cardB, {'reason': 'schedule_changed', 'detail': 'Client moved final touches up two weeks'})},
]
r3 = post({**BASE,
    'card_response': {'card_id': cardB['id'], 'answers': {'reason': 'schedule_changed', 'detail': 'Client moved final touches up two weeks'}, 'meta': cardB['meta']},
    'conversation_history': hist2})
p(f'\nAfter Card B submit — response: {r3.get("response","")[:200]}')
if not r3.get('actions') or r3['actions'][0].get('result', {}).get('success') != True:
    p(f'FAIL: advance did not succeed. result={r3.get("actions",[{}])[0].get("result",{})}')
    sys.exit(1)
p(f'actions: {[a["tool"] for a in r3["actions"]]}')

# Verify DB row
row = rest_get(f'{SUPABASE}/rest/v1/jobs?id=eq.{JOB}&select=status,phase_override_used,phase_override_reason,phase_override_by_id,phase_override_at', token)[0]
p(f'\nDB row after override: {row}')
if row['status'] != 'final_touches':
    p(f'FAIL: status should be final_touches, got {row["status"]}')
    sys.exit(1)
if row['phase_override_used'] != True:
    p(f'FAIL: phase_override_used should be True')
    sys.exit(1)
expected_reason = 'Schedule changed — Client moved final touches up two weeks'
if row['phase_override_reason'] != expected_reason:
    p(f'FAIL: phase_override_reason mismatch.\n  expected: {expected_reason}\n  got: {row["phase_override_reason"]}')
    sys.exit(1)
if row['phase_override_by_id'] != USER_ID:
    p(f'FAIL: phase_override_by_id mismatch. expected {USER_ID}, got {row["phase_override_by_id"]}')
    sys.exit(1)
p(f'PASS: status=final_touches, override stamped, reason="{row["phase_override_reason"]}", by_id={row["phase_override_by_id"]}')

# ─────────────────────────────────────────────────────────────────────────────
# Test 2: leave_open path — no advance
# ─────────────────────────────────────────────────────────────────────────────
p('\n=== TEST 2: gate-fail → Card A → Leave open → no advance ===')
reset_job(token)
r4 = advance_phase_call('advance the 123 Test Flow Dr job phase')
cardA2 = r4.get('pending_card')
if not cardA2 or cardA2.get('meta', {}).get('kind') != 'gate_resolution':
    p(f'FAIL: expected gate_resolution card')
    sys.exit(1)
hist3 = [
    {'role': 'user', 'content': '<test bootstrap>'},
    {'role': 'assistant', 'content': r4['response']},
    {'role': 'user', 'content': fmt_card(cardA2, {'gate_action': 'leave_open'})},
]
r5 = post({**BASE,
    'card_response': {'card_id': cardA2['id'], 'answers': {'gate_action': 'leave_open'}, 'meta': cardA2['meta']},
    'conversation_history': hist3})
p(f'response: {r5.get("response","")[:200]}')
if r5.get('pending_card') or r5.get('pending_action'):
    p('FAIL: should be a text turn only — no further card or action')
    sys.exit(1)
row = rest_get(f'{SUPABASE}/rest/v1/jobs?id=eq.{JOB}&select=status,phase_override_used,phase_override_reason', token)[0]
p(f'DB row: {row}')
if row['status'] != 'in_progress' or row['phase_override_used'] != False:
    p('FAIL: status should still be in_progress with no override')
    sys.exit(1)
p('PASS: leave_open path → no advance, no override stamp')

# ─────────────────────────────────────────────────────────────────────────────
# Test 3: redirect_schedule path
# ─────────────────────────────────────────────────────────────────────────────
p('\n=== TEST 3: gate-fail → Card A → Redirect to Schedule → no advance ===')
r6 = advance_phase_call('advance the 123 Test Flow Dr job phase')
cardA3 = r6.get('pending_card')
hist4 = [
    {'role': 'user', 'content': '<test bootstrap>'},
    {'role': 'assistant', 'content': r6['response']},
    {'role': 'user', 'content': fmt_card(cardA3, {'gate_action': 'redirect_schedule'})},
]
r7 = post({**BASE,
    'card_response': {'card_id': cardA3['id'], 'answers': {'gate_action': 'redirect_schedule'}, 'meta': cardA3['meta']},
    'conversation_history': hist4})
p(f'response: {r7.get("response","")[:200]}')
if r7.get('pending_card') or r7.get('pending_action'):
    p('FAIL: redirect should be a text turn only')
    sys.exit(1)
if 'Schedule' not in r7.get('response', ''):
    p('FAIL: redirect response should mention Schedule')
    sys.exit(1)
row = rest_get(f'{SUPABASE}/rest/v1/jobs?id=eq.{JOB}&select=status,phase_override_used', token)[0]
if row['status'] != 'in_progress' or row['phase_override_used'] != False:
    p('FAIL: status should still be in_progress with no override')
    sys.exit(1)
p('PASS: redirect path → text-turn pointing to Schedule, no advance')

# ─────────────────────────────────────────────────────────────────────────────
# Test 4: gates PASS → no card, advance straight through
# ─────────────────────────────────────────────────────────────────────────────
p('\n=== TEST 4: gates pass → no card, straight advance ===')
# Mark both sub_starts as complete so the gate passes
for item_id in ['c38a0454-c719-43ba-9a6a-1235d4059f71', '6383b751-18b2-4e25-9cac-3a52f69ac135']:
    rest_patch(f'{SUPABASE}/rest/v1/schedule_items?id=eq.{item_id}', token, {'status': 'complete'})
reset_job(token)
r8 = advance_phase_call('advance the 123 Test Flow Dr job phase')
if r8.get('pending_card'):
    p(f'FAIL: should not have a card when gates pass. card={r8.get("pending_card")}')
    sys.exit(1)
p(f'response: {r8.get("response","")[:200]}')
adv = next((a for a in r8.get('actions', []) if a.get('tool') == 'advance_phase'), None)
if not adv or adv.get('result', {}).get('success') != True:
    p(f'FAIL: advance_phase action missing or did not succeed. actions={[a.get("tool") for a in r8.get("actions",[])]}')
    sys.exit(1)
row = rest_get(f'{SUPABASE}/rest/v1/jobs?id=eq.{JOB}&select=status,phase_override_used', token)[0]
p(f'DB row: {row}')
if row['status'] != 'final_touches':
    p('FAIL: status should be final_touches')
    sys.exit(1)
if row['phase_override_used'] != False:
    p('FAIL: phase_override_used should be False (gates passed)')
    sys.exit(1)
p('PASS: gates pass → direct advance, no override stamp')

# Cleanup: revert schedule_items and job back
for item_id in ['c38a0454-c719-43ba-9a6a-1235d4059f71', '6383b751-18b2-4e25-9cac-3a52f69ac135']:
    rest_patch(f'{SUPABASE}/rest/v1/schedule_items?id=eq.{item_id}', token, {'status': 'scheduled'})
reset_job(token)
p('\n[cleanup] schedule_items reverted to scheduled, job reset to in_progress')

# ─────────────────────────────────────────────────────────────────────────────
# Test 5: Phase 3 + Phase 4 regression — quick checks
# ─────────────────────────────────────────────────────────────────────────────
p('\n=== TEST 5: regressions ===')
# Phase 4 — missing field card
r9 = post({**BASE, 'message': 'log a receipt', 'conversation_history': []})
pc9 = r9.get('pending_card')
if not pc9 or 'amount' not in {q['id'] for q in pc9['questions']}:
    p(f'FAIL: Phase 4 missing-field card regression — response={r9.get("response","")[:200]}')
    sys.exit(1)
p('PASS: Phase 4 missing-field card still fires')

# Phase 3 — disambiguation card
r10 = post({**BASE, 'message': 'Log a $25 fuel receipt from Casey\'s on the Test Flow job', 'conversation_history': []})
pc10 = r10.get('pending_card')
if not pc10:
    p(f'FAIL: Phase 3 disambig regression — response={r10.get("response","")[:200]}')
    sys.exit(1)
if not any(o['value'] == '__none__' for o in pc10['questions'][0]['options']):
    p(f'FAIL: Phase 3 disambig — missing __none__ option')
    sys.exit(1)
p('PASS: Phase 3 disambiguation card still fires (with __none__)')

p('\n=== ALL TESTS PASSED ===')
