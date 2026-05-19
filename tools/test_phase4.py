# -*- coding: utf-8 -*-
"""Phase 4 verification — missing-field card flows."""
import json, urllib.request, sys

ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQ2ODgsImV4cCI6MjA5MTE5MDY4OH0.isj52drLT3pj7BF94Wa9w_y_f8U1M3W5AcgWsRaTwBQ'
SUPABASE = 'https://cbfftukmhqvvjlrlnltk.supabase.co'
EDGE = SUPABASE + '/functions/v1/ai-master-agent'

def post(payload):
    body = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(EDGE, data=body, method='POST',
        headers={'Authorization': f'Bearer {ANON}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode('utf-8'))

def get_url(url, bearer):
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {bearer}', 'apikey': ANON})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode('utf-8'))

def get_pm_auth_token():
    body = json.dumps({'email': 'test-pm@avenstonekc.com', 'password': 'TestPM2026!'}).encode('utf-8')
    req = urllib.request.Request(
        f'{SUPABASE}/auth/v1/token?grant_type=password',
        data=body, method='POST',
        headers={'apikey': ANON, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode('utf-8'))['access_token']

BASE = {'user_id': '53dc982e-93a5-4220-9c52-422f0151e4ad',
        'tenant_id': '00000000-0000-0000-0000-000000000001',
        'role': 'project_manager', 'full_name': 'Test PM'}

def p(s):
    print(str(s).encode('utf-8', errors='replace').decode('utf-8', errors='replace'))

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
            lines.append(f'{qq["label"]}: {str(ans)}')
    return '\n'.join(lines)


def show_card(pc):
    p(f'  prompt: {pc["prompt"]}')
    for q in pc.get('questions', []):
        opts_str = ''
        if q['type'] == 'select':
            opts_str = f' ({len(q["options"])} opts)'
        p(f'    Q [{q["type"]}] {q["id"]}: "{q["label"]}"{opts_str}')


# ─────────────────────────────────────────────────────────────────────────────
# Test 1: "log a receipt" with nothing → 3-question card
# ─────────────────────────────────────────────────────────────────────────────
p('=== TEST 1: "log a receipt" → 3-question missing-field card ===')
msg1 = 'log a receipt'
r1 = post({**BASE, 'message': msg1, 'conversation_history': []})
pc1 = r1.get('pending_card')
if not pc1:
    p(f'FAIL: no pending_card. response: {r1.get("response","")[:200]}')
    sys.exit(1)
p(f'response: {r1.get("response","")[:80]}')
show_card(pc1)
expected_ids = {'amount', 'job_id', 'type'}
got_ids = {q['id'] for q in pc1['questions']}
p(f'expected gaps: {expected_ids}')
p(f'got gaps:      {got_ids}')
if got_ids != expected_ids:
    p('FAIL: question ids do not match expected gaps')
    sys.exit(1)
p('PASS: card has exactly amount + job_id + type questions')

# Fill all 3 — pick test-flow-001 (single one)
job_q = next(q for q in pc1['questions'] if q['id'] == 'job_id')
pick_job_id = next((o['value'] for o in job_q['options'] if 'test-flow-001' in o['value'] or '123 Test Flow' in o['label']), job_q['options'][0]['value'])
answers1 = {'amount': '85', 'job_id': pick_job_id, 'type': 'fuel'}
p(f'\nFilling: {answers1}')
a1_text = fmt_card(pc1, answers1)
p(f'\nAnswers text being sent:\n{a1_text}')
hist1 = [
    {'role': 'user', 'content': msg1},
    {'role': 'assistant', 'content': r1['response']},
    {'role': 'user', 'content': a1_text},
]
r2 = post({**BASE, 'card_response': {'card_id': pc1['id'], 'answers': answers1}, 'conversation_history': hist1})
p(f'\nAfter card filled — response: {r2.get("response","")[:120]}')
pa2 = r2.get('pending_action')
pc2 = r2.get('pending_card')
if pc2:
    p('UNEXPECTED: another card fired after filling all 3 fields:')
    show_card(pc2)
    sys.exit(1)
if not pa2:
    p(f'FAIL: no pending_action. response: {r2.get("response","")[:300]}')
    sys.exit(1)
p(f'PASS: confirm card fired. tool={pa2["tool"]}, input={pa2["input"]}')

# Confirm
hist2 = hist1 + [{'role': 'assistant', 'content': r2['response']}]
r3 = post({**BASE, 'confirmed': True, 'pending_action': pa2, 'conversation_history': hist2})
p(f'\nAfter confirm — response: {r3.get("response","")[:120]}')
if not r3.get('actions') or not r3['actions'][0].get('result', {}).get('success'):
    p(f'FAIL: confirm did not write row. result: {r3.get("actions",[{}])[0].get("result",{})}')
    sys.exit(1)
tx_id = r3['actions'][0]['result']['transaction_id']
p(f'PASS: row written, transaction_id={tx_id}')

# Verify in DB
pm_token = get_pm_auth_token()
row_url = f'{SUPABASE}/rest/v1/job_transactions?id=eq.{tx_id}&select=id,job_id,type,amount,direction,status'
row = get_url(row_url, pm_token)
p(f'\nDB row: {row}')
if not row or row[0]['type'] != 'fuel' or float(row[0]['amount']) != 85.0:
    p('FAIL: row data does not match')
    sys.exit(1)
p('PASS: row matches answers (type=fuel, amount=85)')


# ─────────────────────────────────────────────────────────────────────────────
# Test 2: add_todo with no title → missing-field card with 1 question
# ─────────────────────────────────────────────────────────────────────────────
p('\n=== TEST 2: "add a todo" with no title → missing-field card ===')
msg2 = 'add a todo'
r4 = post({**BASE, 'message': msg2, 'conversation_history': []})
pc4 = r4.get('pending_card')
if not pc4:
    p(f'FAIL: no pending_card. response: {r4.get("response","")[:300]}')
    sys.exit(1)
p(f'response: {r4.get("response","")[:80]}')
show_card(pc4)
got4 = {q['id'] for q in pc4['questions']}
if got4 != {'title'}:
    p(f'FAIL: expected only title gap, got {got4}')
    sys.exit(1)
p('PASS: add_todo missing-field card asks only for title')


# ─────────────────────────────────────────────────────────────────────────────
# Test 3: log_receipt with all fields present → no card, straight to confirm
# ─────────────────────────────────────────────────────────────────────────────
p('\n=== TEST 3: log_receipt with all fields → no card, straight to confirm ===')
msg3 = 'Log a $45 fuel receipt from QuikTrip on the 123 Test Flow job'
r5 = post({**BASE, 'message': msg3, 'conversation_history': []})
pc5 = r5.get('pending_card')
pa5 = r5.get('pending_action')
p(f'response: {r5.get("response","")[:120]}')
if pc5:
    p('FAIL: missing-field card fired when all fields present:')
    show_card(pc5)
    sys.exit(1)
if not pa5:
    p(f'FAIL: no pending_action. response: {r5.get("response","")[:300]}')
    sys.exit(1)
p(f'PASS: straight to confirm. tool={pa5["tool"]}, input={pa5["input"]}')


# ─────────────────────────────────────────────────────────────────────────────
# Test 4: log_receipt with category-only-missing → card with only 1 question
# ─────────────────────────────────────────────────────────────────────────────
p('\n=== TEST 4: log_receipt missing only category → card asks only category ===')
msg4 = 'Log a $30 receipt from XYZ Supply on the 123 Test Flow job'
r6 = post({**BASE, 'message': msg4, 'conversation_history': []})
pc6 = r6.get('pending_card')
pa6 = r6.get('pending_action')
if not pc6:
    if pa6:
        p(f'NOTE: model went straight to confirm (model inferred type or other). tool={pa6["tool"]} input={pa6["input"]}')
        if pa6['input'].get('type'):
            p('  model inferred type — acceptable, not a Phase 4 bug')
        else:
            p('  no type in input but no card either — FAIL')
            sys.exit(1)
    else:
        p(f'FAIL: no card, no pending_action. response: {r6.get("response","")[:300]}')
        sys.exit(1)
else:
    show_card(pc6)
    got6 = {q['id'] for q in pc6['questions']}
    if got6 != {'type'}:
        p(f'FAIL: expected only type gap, got {got6}')
        sys.exit(1)
    p('PASS: log_receipt card asks ONLY for type (regression — partial gap)')


# ─────────────────────────────────────────────────────────────────────────────
# Test 5: Phase 3 regression — ambiguous job → disambiguation card
# ─────────────────────────────────────────────────────────────────────────────
p('\n=== TEST 5: Phase 3 regression — ambiguous "Test Flow" → disambiguation card ===')
msg5 = 'Log a $25 fuel receipt from Casey\'s on the Test Flow job'
r7 = post({**BASE, 'message': msg5, 'conversation_history': []})
pc7 = r7.get('pending_card')
if not pc7:
    p(f'FAIL: no pending_card. response: {r7.get("response","")[:300]}')
    sys.exit(1)
p(f'response: {r7.get("response","")[:120]}')
show_card(pc7)
# Phase 3 disambiguation card has 1 question (job_id) with __none__ option
got7 = {q['id'] for q in pc7['questions']}
opts7 = pc7['questions'][0]['options']
has_none = any(o['value'] == '__none__' for o in opts7)
if got7 != {'job_id'} or not has_none:
    p(f'FAIL: not a disambiguation card. ids={got7}, has __none__={has_none}')
    sys.exit(1)
p('PASS: Phase 3 disambiguation card still fires (post-execution path untouched)')


p('\n=== ALL TESTS PASSED ===')
