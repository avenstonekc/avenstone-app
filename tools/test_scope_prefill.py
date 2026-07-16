#!/usr/bin/env python3
"""SCOPE_PREFILL P2 acceptance harness — hits the DEPLOYED ai-scope-prefill fn 3x with the
fixture scope and asserts the high-confidence set + the never-emit set. Read-only to prod data:
it snapshots the sandbox job's scope, sets the fixture, runs, and restores the original scope.

Run: python tools/test_scope_prefill.py   (needs the Supabase PAT file for scope set/restore)
"""
import json, sys, time, urllib.request, urllib.error

REF        = "cbfftukmhqvvjlrlnltk"
BASE       = f"https://{REF}.supabase.co"
MGMT       = f"https://api.supabase.com/v1/projects/{REF}/database/query"
PAT        = open("C:/Users/Kalin/supabase-token.txt").read().strip()
ANON_KEY   = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQ2ODgsImV4cCI6MjA5MTE5MDY4OH0.isj52drLT3pj7BF94Wa9w_y_f8U1M3W5AcgWsRaTwBQ"
JOB_ID     = "5ebd7c3c-c4a7-450c-b529-479903668010"   # 999 Cost Plus Sandbox — DO NOT BILL
EMAIL, PASSWORD = "test-pm@avenstonekc.com", "TestPM2026!"
FIXTURE = ("Basic bathroom remodel. we're going to demo the walk in tub and add a new shower in "
           "that space. going to use a shower pan from lowes. glass door. tile from floor to ceiling. "
           "keeping tile floor. new vanity and new toilet. they do want to paint the room and trim as well.")

REQUIRED_HIGH = {  # field_key -> option_key ; each must appear with confidence 'high'
    "existing_tub_shower": "tub", "tub_shower_config": "walkin", "tile_height": "ceiling",
    "existing_floor_finish": "tile", "floor_tile": "keep_existing",
}
NEVER = {  # must be ABSENT at any confidence
    "existing_wall_finish", "existing_vanity", "existing_countertop",
    "floor_sf", "shower_width_in", "shower_length_in", "shower_wall_height_in", "wall_height_in",
}

def post(url, headers, body):
    # api.supabase.com sits behind Cloudflare, which blocks the default urllib UA (err 1010).
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "User-Agent": "curl/8.4.0", **headers}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")

def mgmt(sql):
    return post(MGMT, {"Authorization": f"Bearer {PAT}"}, {"query": sql})

def set_scope(text):
    esc = text.replace("'", "''")
    mgmt(f"update jobs set scope='{esc}' where id='{JOB_ID}'")

def sign_in():
    st, data = post(f"{BASE}/auth/v1/token?grant_type=password", {"apikey": ANON_KEY}, {"email": EMAIL, "password": PASSWORD})
    tok = data.get("access_token")
    if not tok:
        print(f"  sign-in failed ({st}): {data}"); sys.exit(2)
    return tok

def call_fn(tok):
    return post(f"{BASE}/functions/v1/ai-scope-prefill",
                {"Authorization": f"Bearer {tok}", "apikey": ANON_KEY},
                {"job_id": JOB_ID, "project_type": "bathroom"})

def main():
    # snapshot original scope so we always restore it
    _, snap = mgmt(f"select scope from jobs where id='{JOB_ID}'")
    original = (snap[0]["scope"] if isinstance(snap, list) and snap else "") or ""
    set_scope(FIXTURE)
    try:
        tok = sign_in()
        # wait for the fn to be deployed (auto-deploy after push) — retry on 404
        for _ in range(40):
            st, _d = call_fn(tok)
            if st != 404: break
            print("  fn not deployed yet (404) — waiting 15s…"); time.sleep(15)

        runs, high_sets = [], []
        for i in range(3):
            st, data = call_fn(tok)
            answers = data.get("answers", []) if isinstance(data, dict) else []
            runs.append((st, answers))
            print(f"\n=== RUN {i+1} (http {st}) ===")
            for a in answers:
                print(f"  {a.get('field_key')} = {a.get('option_key')}  [{a.get('confidence')}]  <- \"{a.get('evidence_phrase')}\"")
            high = {a["field_key"]: a["option_key"] for a in answers if a.get("confidence") == "high"}
            high_sets.append(high)

        # ── assertions ──
        fails = []
        for i, (st, answers) in enumerate(runs, 1):
            if st != 200: fails.append(f"run{i}: http {st}")
            got = {a["field_key"]: (a["option_key"], a.get("confidence")) for a in answers}
            for fk, ok in REQUIRED_HIGH.items():
                if got.get(fk) != (ok, "high"):
                    fails.append(f"run{i}: required {fk}={ok}(high) but got {got.get(fk)}")
            for fk in NEVER:
                if fk in got:
                    fails.append(f"run{i}: {fk} must be ABSENT but got {got[fk]}")
        # stability: high-conf field→option identical across the 3 runs
        if not (high_sets[0] == high_sets[1] == high_sets[2]):
            fails.append(f"high-conf set unstable across runs: {high_sets}")

        print("\n" + ("=" * 50))
        if fails:
            print("RESULT: FAIL"); [print("  X " + f) for f in fails]
        else:
            print("RESULT: PASS - high-conf set stable across 3 runs; never-set absent all runs")
        return 1 if fails else 0
    finally:
        set_scope(original)
        print(f"\nrestored sandbox scope to original ({len(original)} chars)")

if __name__ == "__main__":
    sys.exit(main())
