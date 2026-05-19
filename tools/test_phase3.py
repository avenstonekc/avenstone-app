# -*- coding: utf-8 -*-
import json, urllib.request, sys

ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQ2ODgsImV4cCI6MjA5MTE5MDY4OH0.isj52drLT3pj7BF94Wa9w_y_f8U1M3W5AcgWsRaTwBQ'
SUPABASE = 'https://cbfftukmhqvvjlrlnltk.supabase.co'
EDGE = SUPABASE + '/functions/v1/ai-master-agent'

def post_json(url, payload):
    body = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=body, method='POST',
        headers={'Authorization': f'Bearer {ANON}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode('utf-8'))

def get_url(url):
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {ANON}', 'apikey': ANON})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode('utf-8'))

def p(s):
    print(str(s).encode('utf-8', errors='replace').decode('utf-8', errors='replace'))

BASE = {'user_id': '53dc982e-93a5-4220-9c52-422f0151e4ad',
        'tenant_id': '00000000-0000-0000-0000-000000000001',
        'role': 'project_manager', 'full_name': 'Test PM'}
TARGET_JOB = 'ebe370cf-76cc-4912-aaf1-d2d2d0eee413'

def fmt_card(card, answers):
    lines = [f'Card answered (id: {card["id"]}):', f'Prompt: {card["prompt"]}']
    for qq in card['questions']:
        ans = answers.get(qq['id'])
        if qq['type'] == 'select':
            opt = next((o for o in qq['options'] if o['value'] == ans), None)
            label = opt['label'] if opt else str(ans)
            value = opt['value'] if opt else str(ans)
            display = label if label == value else f'{label} (value: {value})'
            lines.append(f'{qq["label"]}: {display}')
    return '\n'.join(lines)

msg = 'Log a $120 fuel receipt from QuikTrip on the Test Flow job'

# Step 1: disambiguation card
p('=== S1: disambiguation ===')
r1 = post_json(EDGE, {**BASE, 'message': msg, 'conversation_history': []})
pc1 = r1.get('pending_card')
if not pc1:
    p(f'ERROR no card: {r1}')
    sys.exit(1)
p(f'card prompt: {pc1["prompt"]}')
opts = pc1['questions'][0]['options']
p(f'options count: {len(opts)}')
for o in opts:
    p(f'  {o["value"][:25]} | {o["label"][:60]}')

# Pick ebe370cf
a1_text = fmt_card(pc1, {'job_id': TARGET_JOB})
hist1 = [
    {'role': 'user', 'content': msg},
    {'role': 'assistant', 'content': r1['response']},
    {'role': 'user', 'content': a1_text},
]

# Step 2: card_response with job selection
p('\n=== S2: job selected ===')
r2 = post_json(EDGE, {**BASE, 'card_response': {'card_id': pc1['id'], 'answers': {'job_id': TARGET_JOB}}, 'conversation_history': hist1})
pc2 = r2.get('pending_card')
pa2 = r2.get('pending_action')
p(f'response: {r2.get("response","")[:100]}')

# Receipt type card may or may not fire (depends on whether model inferred 'fuel')
if pc2 and pc2['questions'][0]['id'] == 'type':
    p(f'receipt card fired: {pc2["prompt"]}')
    a2_text = fmt_card(pc2, {'type': 'fuel'})
    hist2 = hist1 + [
        {'role': 'assistant', 'content': r2['response']},
        {'role': 'user', 'content': a2_text},
    ]
    p('\n=== S3: select fuel ===')
    r3 = post_json(EDGE, {**BASE, 'card_response': {'card_id': pc2['id'], 'answers': {'type': 'fuel'}}, 'conversation_history': hist2})
    pa3 = r3.get('pending_action')
    p(f'response: {r3.get("response","")[:100]}')
    if pa3:
        p(f'pending_action tool: {pa3["tool"]}')
        p(f'input: {pa3["input"]}')
        p('\n=== S4: confirm ===')
        r4 = post_json(EDGE, {**BASE, 'confirmed': True, 'pending_action': pa3, 'conversation_history': hist2})
        p(f'confirm response: {r4.get("response","")[:100]}')
        if r4.get('actions'):
            p(f'result: {r4["actions"][0].get("result",{})}')
    else:
        p(f'no pending_action: {r3.get("response","")[:200]}')
elif pa2:
    p(f'pending_action (no type card): tool={pa2["tool"]} input={pa2["input"]}')
    p('\n=== S3: confirm directly ===')
    r3 = post_json(EDGE, {**BASE, 'confirmed': True, 'pending_action': pa2, 'conversation_history': hist1})
    p(f'confirm response: {r3.get("response","")[:100]}')
    if r3.get('actions'):
        p(f'result: {r3["actions"][0].get("result",{})}')
else:
    p(f'UNEXPECTED: no card or pending_action. response={r2.get("response","")[:200]}')

# Verify DB row
p('\n=== DB: job_transactions on ebe370cf ===')
rows = get_url(f'{SUPABASE}/rest/v1/job_transactions?job_id=eq.{TARGET_JOB}&order=created_at.desc&limit=3&select=id,job_id,type,amount,status,direction,date_incurred')
for row in rows:
    p(f'  {row}')
if not rows:
    p('  (no rows)')
