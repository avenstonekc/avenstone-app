#!/usr/bin/env python3
"""SCOPE_PREFILL P3 live verify — reproduces the runtime chain on the sandbox job:
clear answers -> call deployed ai-scope-prefill -> persist per confidence policy ->
drive scope_plan to prove skip (high), pending (med), suppression cascade, and the
question-count delta. Snapshots + restores the sandbox scope and clears its test rows.
"""
import json, sys, urllib.request, urllib.error

REF="cbfftukmhqvvjlrlnltk"; BASE=f"https://{REF}.supabase.co"
MGMT=f"https://api.supabase.com/v1/projects/{REF}/database/query"
PAT=open("C:/Users/Kalin/supabase-token.txt").read().strip()
ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQ2ODgsImV4cCI6MjA5MTE5MDY4OH0.isj52drLT3pj7BF94Wa9w_y_f8U1M3W5AcgWsRaTwBQ"
JOB="5ebd7c3c-c4a7-450c-b529-479903668010"; TEN="00000000-0000-0000-0000-000000000001"
EMAIL,PW="test-pm@avenstonekc.com","TestPM2026!"
FIXTURE=("Basic bathroom remodel. we're going to demo the walk in tub and add a new shower in that "
 "space. going to use a shower pan from lowes. glass door. tile from floor to ceiling. keeping tile "
 "floor. new vanity and new toilet. they do want to paint the room and trim as well.")
HIGH={"existing_tub_shower","tub_shower_config","tile_height","existing_floor_finish","floor_tile","layout_change","toilet"}
MED={"vanity_config","shower_entry"}
NEVER={"existing_wall_finish","existing_vanity","existing_countertop","floor_sf","shower_width_in","shower_length_in","shower_wall_height_in","wall_height_in"}

def post(url,h,b):
    r=urllib.request.Request(url,data=json.dumps(b).encode(),headers={"Content-Type":"application/json","User-Agent":"curl/8.4.0",**h},method="POST")
    try:
        with urllib.request.urlopen(r,timeout=60) as x: return x.status,json.loads(x.read().decode() or "{}")
    except urllib.error.HTTPError as e: return e.code,json.loads(e.read().decode() or "{}")
def mgmt(sql): return post(MGMT,{"Authorization":f"Bearer {PAT}"},{"query":sql})
def signin():
    _,d=post(f"{BASE}/auth/v1/token?grant_type=password",{"apikey":ANON},{"email":EMAIL,"password":PW}); return d["access_token"]
def prefill(tok): return post(f"{BASE}/functions/v1/ai-scope-prefill",{"Authorization":f"Bearer {tok}","apikey":ANON},{"job_id":JOB,"project_type":"bathroom"})
def scope_plan(answers):
    _,d=post(f"{BASE}/functions/v1/ai-estimator",{"Authorization":f"Bearer {ANON}","apikey":ANON},
             {"mode":"scope_plan","tenant_id":TEN,"project_type":"bathroom","answers":answers}); return d

def main():
    _,snap=mgmt(f"select scope from jobs where id='{JOB}'")
    original=(snap[0]["scope"] if isinstance(snap,list) and snap else "") or ""
    fails=[]
    try:
        mgmt(f"update jobs set scope='{FIXTURE.replace(chr(39),chr(39)*2)}' where id='{JOB}'")
        mgmt(f"delete from job_scope_answers where job_id='{JOB}'")  # zero-answers state
        # need a room for the FK-less upsert path? job_scope_answers.room_id is nullable — insert with null room
        tok=signin()

        # baseline question count BEFORE prefill (empty seed)
        before=scope_plan([]); open_before=before.get("open_field_keys",[])
        # 1) run the deployed parser
        st,pf=prefill(tok); answers=pf.get("answers",[]) if isinstance(pf,dict) else []
        got={a["field_key"]:(a["option_key"],a["confidence"],a.get("evidence_phrase")) for a in answers}
        print(f"prefill http {st}: {len(answers)} answers")
        for fk in HIGH:
            if got.get(fk,(None,None,None))[1]!="high": fails.append(f"{fk} expected high, got {got.get(fk)}")
        for fk in MED:
            if got.get(fk,(None,None,None))[1]!="med": fails.append(f"{fk} expected med, got {got.get(fk)}")

        # 2) persist per policy (mirror runScopePrefill): high->confirmed, med->proposed
        vals=[]
        for a in answers:
            if a["confidence"] not in ("high","med"): continue
            stt="confirmed" if a["confidence"]=="high" else "proposed"
            ev=(a.get("evidence_phrase") or "").replace("'","''"); ok=a["option_key"].replace("'","''")
            vals.append(f"('{TEN}','{JOB}','{a['field_key']}','{ok}','{ok}','scope_prefill','{stt}','{ev}')")
        if vals:
            mgmt("insert into job_scope_answers (tenant_id,job_id,field_key,option_key,value,source,status,evidence_phrase) values "+",".join(vals))
        _,rows=mgmt(f"select status,count(*) c from job_scope_answers where job_id='{JOB}' and source='scope_prefill' group by status order by status")
        print("persisted:",rows)

        # 3) configurator hydrate: seed = confirmed prefills only (med proposed stays OUT/open)
        seed=[{"field_key":a["field_key"],"value":a["option_key"]} for a in answers if a["confidence"]=="high"]
        after=scope_plan(seed); open_after=after.get("open_field_keys",[]); supp=set(after.get("suppressed",[]))
        # high must be skipped (not open)
        for fk in HIGH:
            if fk in open_after: fails.append(f"HIGH {fk} still open (should skip)")
        # med must still be open (shown pre-selected)
        for fk in MED:
            if fk not in open_after: fails.append(f"MED {fk} not open (should be pre-selected/asked)")
        # never-set + measurements must still be open (asked normally)
        for fk in NEVER:
            if fk not in open_after and fk not in supp: fails.append(f"{fk} neither open nor suppressed (should be asked)")
        # suppression cascade: walkin KEEPS shower fields open (not suppressed)
        for fk in ("shower_glass","shower_drain"):
            if fk in supp: fails.append(f"walkin wrongly suppressed {fk}")

        # 4) tap-to-change recompute: flip tub_shower_config -> tub_only suppresses shower fields
        seed2=[{"field_key":a["field_key"],"value":("tub_only" if a["field_key"]=="tub_shower_config" else a["option_key"])} for a in answers if a["confidence"]=="high"]
        flip=scope_plan(seed2); supp2=set(flip.get("suppressed",[]))
        for fk in ("shower_entry","shower_drain","shower_glass"):
            if fk not in supp2: fails.append(f"tub_only should suppress {fk} (recompute)")

        print(f"\nQUESTION-COUNT DELTA: before prefill = {len(open_before)} open (start at Q1); "
              f"after prefill = {len(open_after)} open ({len(HIGH)} high skipped, {len(MED)} med pre-selected) "
              f"=> rep starts at ~Q{len(HIGH)+len(MED)+1} of {len(open_before)}-equivalent")
        print(f"open_after sample: {sorted(open_after)[:12]}")
        print("\n"+"="*50)
        print("RESULT: PASS" if not fails else "RESULT: FAIL"); [print("  X "+f) for f in fails]
        return 1 if fails else 0
    finally:
        mgmt(f"delete from job_scope_answers where job_id='{JOB}' and source='scope_prefill'")
        mgmt(f"update jobs set scope='{original.replace(chr(39),chr(39)*2)}' where id='{JOB}'")
        print(f"restored scope ({len(original)} chars) + cleared test prefill rows")

if __name__=="__main__": sys.exit(main())
