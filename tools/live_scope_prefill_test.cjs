// LIVE UI test — scope prefill through the real configurator. Snapshot + restore.
const { chromium } = require('@playwright/test');
const { createClient } = require('@supabase/supabase-js');

const APP='http://localhost:3737';
const SB='https://cbfftukmhqvvjlrlnltk.supabase.co';
const SVC='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYxNDY4OCwiZXhwIjoyMDkxMTkwNjg4fQ.oa4fqY82eLMUmq8egx1IOtBbOi-2Q5ofP1e0NU0ZmNs';
const JOB='5ebd7c3c-c4a7-450c-b529-479903668010';
const ADDR='999 Cost Plus Sandbox';
const REP={email:'test-rep@avenstonekc.com',pw:'TestRep2026!'};
const admin=createClient(SB,SVC,{auth:{autoRefreshToken:false,persistSession:false}});

const FIX={
  A:"Tear out the walk-in tub and put a shower in that space. Tile floor to ceiling. Keeping the tile floor. New vanity, new toilet. Paint the room and trim.",
  B:"Full gut of the hall bathroom. New tub, subway tile surround to ceiling, new LVP floor, double vanity, new toilet.",
  C:"Small powder room refresh — new toilet, new vanity, paint only. Floor and walls stay.",
};

async function rfill(page, sel, val){ // React-aware set
  await page.evaluate(([s,v])=>{
    const el=document.querySelector(s); if(!el) return;
    const set=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set;
    set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
  },[sel,val]);
}

async function resetJob(){
  await admin.from('job_scope_answers').delete().eq('job_id',JOB);
  await admin.from('job_estimates').update({messages:[],scope_origin:'manual'}).eq('job_id',JOB);
}

(async()=>{
  // snapshot
  const {data:snap}=await admin.from('jobs').select('scope').eq('id',JOB).single();
  const originalScope=snap?.scope??'';
  const results={};
  const browser=await chromium.launch();
  const ctx=await browser.newContext({viewport:{width:1280,height:1000}});
  const page=await ctx.newPage();

  // login
  await page.goto(APP);
  await page.waitForSelector("input[type='email']",{timeout:15000});
  await rfill(page,"input[type='email']",REP.email);
  await rfill(page,"input[type='password']",REP.pw);
  await page.locator("button").filter({hasText:/^Sign In$/}).click();
  await page.locator("button").filter({hasText:/^Sign In$/}).waitFor({state:'hidden',timeout:20000});
  console.log('logged in as rep');

  try{
  for(const key of (process.argv[2]?[process.argv[2]]:['A','B','C'])){
   try{
    await resetJob();
    const cap={prefillReq:null,prefillRes:null,console:[]};
    page.on('console',m=>{ const t=m.text(); if(t.includes('scopePrefill')||t.includes('prefill')) cap.console.push(t); });
    page.on('request',r=>{ if(r.url().includes('ai-scope-prefill')){ cap.prefillReq=r.postData(); } });
    page.on('response',async r=>{ if(r.url().includes('ai-scope-prefill')){ try{cap.prefillRes=await r.text();}catch{} } });

    // SPA nav (no reload — reload drops the in-memory session). resetJob() cleared answers +
    // estimate messages so the remounted EstimateTab lands on the empty Build form.
    await page.locator('.sb-item').filter({hasText:'Projects'}).first().waitFor({timeout:25000});
    await page.locator('.sb-item').filter({hasText:'Projects'}).first().click();
    await page.waitForTimeout(1500);
    await page.locator('text=/999 Cost Plus Sandbox/').first().click({timeout:15000});
    await page.locator('.tabbar').first().waitFor({timeout:10000});
    await page.locator('button.tab').filter({hasText:'Estimate'}).first().click();
    await page.waitForTimeout(1500);
    // If a stale draft shows the configurator (no Build form), Start fresh to get the form back.
    const startFresh=page.locator("button:has-text('Start fresh')").first();
    if(await startFresh.isVisible().catch(()=>false) && !(await page.locator("textarea.finp.fta").first().isVisible().catch(()=>false))){
      await startFresh.click(); await page.waitForTimeout(700);
      await page.locator("button:has-text('Start fresh')").last().click().catch(()=>{}); await page.waitForTimeout(1500);
    }
    await page.locator("textarea.finp.fta").first().waitFor({timeout:10000});

    // Fill the Build form THROUGH THE UI
    await rfill(page,"textarea.finp.fta",FIX[key]);                       // Scope of Work box
    // rooms input (placeholder mentions Kitchen, Master Bath)
    const roomsSel="input[placeholder*='Kitchen, Master']";
    await rfill(page,roomsSel,'Bathroom');
    // SF input — number input under Project Square Footage
    await rfill(page,"input[type='number']",'60');
    await page.waitForTimeout(500);
    await page.screenshot({path:`tools/prefill_${key}_form.png`});

    // Generate
    const gen=page.locator("button:has-text('Generate Estimate')").first();
    await gen.click({timeout:8000});
    // wait for the configurator to render (persist scope -> prefill -> scope_plan), then settle
    await page.waitForFunction(()=>/\d+ of \d+ answered/.test(document.body.innerText),{timeout:20000}).catch(()=>{});
    await page.waitForTimeout(2500);

    // Read the configurator state — scope chips to the strip immediately above "X of N answered".
    const state=await page.evaluate(()=>{
      const all=[...document.querySelectorAll('div')];
      const ansDiv=all.find(d=>/^\d+ of \d+ answered/.test((d.innerText||'').trim().slice(0,30)));
      const answered=ansDiv?(ansDiv.innerText.trim().match(/\d+ of \d+/)||[null])[0]:null;
      let chips=[];
      if(ansDiv && ansDiv.previousElementSibling){
        chips=[...ansDiv.previousElementSibling.querySelectorAll('button')].map(b=>{
          const t=(b.innerText||'').trim(); const scope=t.includes('✦'); const clean=t.replace(/^✦\s*/,'');
          const c=clean.indexOf(':');
          return { field:(c>=0?clean.slice(0,c):clean).trim(), value:(c>=0?clean.slice(c+1):'').trim(), scope, title:b.getAttribute('title')||'' };
        });
      }
      const active=(()=>{const el=all.find(d=>d.style&&d.style.fontSize==='17px'&&d.innerText.trim().length>3);return el?el.innerText.trim():null;})();
      const evidence=((document.body.innerText.match(/from your scope:[^\n]*/i)||[])[0])||null;
      return {answered,chips,active,evidence};
    });
    results[key]={cap,state};
    await page.screenshot({path:`tools/prefill_${key}_after.png`,fullPage:true});
    console.log(`\n===== FIXTURE ${key} =====`);
    console.log('prefill request :',cap.prefillReq);
    console.log('prefill response:',cap.prefillRes);
    console.log('answered:',state.answered,'| active Q:',state.active);
    console.log('evidence line:',state.evidence);
    console.log(`chips (${state.chips.length}):`);
    state.chips.forEach(c=>console.log(`   [${c.scope?'FROM-SCOPE':(c.value?'answered':'blank')}] ${c.field}${c.value?': '+c.value:''}`));
    page.removeAllListeners('console'); page.removeAllListeners('request'); page.removeAllListeners('response');
   }catch(e){ console.log(`\n===== FIXTURE ${key} — RUN ERROR: ${e.message} =====`); }
  }
  } finally {
    await browser.close();
    await resetJob();
    await admin.from('jobs').update({scope:originalScope}).eq('id',JOB);
    console.log('\nrestored scope + cleared test answers');
  }
})().catch(e=>{ console.error('FATAL',e); process.exit(1); });
