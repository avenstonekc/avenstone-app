// P4 UI Playwright test: pre-seeded complete confirmed scope → Generate → price_plan renders
const {chromium}=require('@playwright/test');
const {createClient}=require('@supabase/supabase-js');
const APP='https://avenstone-app.vercel.app';
const SB='https://cbfftukmhqvvjlrlnltk.supabase.co';
const SVC='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYxNDY4OCwiZXhwIjoyMDkxMTkwNjg4fQ.oa4fqY82eLMUmq8egx1IOtBbOi-2Q5ofP1e0NU0ZmNs';
const ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQ2ODgsImV4cCI6MjA5MTE5MDY4OH0.VNMlA3K4UNk5O9I25yWEV5gT5X-dKqT2Z4szAqRQFXA';
const FNURL='https://cbfftukmhqvvjlrlnltk.supabase.co/functions/v1/ai-estimator';
const JOB='5ebd7c3c-c4a7-450c-b529-479903668010';
const TENANT='00000000-0000-0000-0000-000000000001';
const PM={email:'test-pm@avenstonekc.com',pw:'TestPM2026!'};
const admin=createClient(SB,SVC,{auth:{autoRefreshToken:false,persistSession:false}});

// Complete bathroom answer set — all 34 fields confirmed (first-option picks)
const ALL_ANSWERS=[
  // Initial 8 (scan + photo + rep)
  {field_key:'tub_shower_config',value:'walkin',option_key:'walkin',source:'rep_card',status:'confirmed'},
  {field_key:'existing_tub_shower',value:'tub',option_key:'tub',source:'photo',status:'confirmed'},
  {field_key:'existing_floor_finish',value:'tile',option_key:'tile',source:'photo',status:'confirmed'},
  {field_key:'existing_wall_finish',value:'tile',option_key:'tile',source:'photo',status:'confirmed'},
  {field_key:'existing_vanity',value:'single',option_key:'single',source:'photo',status:'confirmed'},
  {field_key:'layout_change',value:'keep_layout',option_key:'keep_layout',source:'rep_card',status:'confirmed'},
  {field_key:'floor_sf',value:'49',source:'measured',status:'confirmed'},
  {field_key:'wall_height_in',value:'96',source:'measured',status:'confirmed'},
  // Remaining 26 open fields
  {field_key:'existing_countertop',value:'none',option_key:'none',source:'rep_card',status:'confirmed'},
  {field_key:'shower_width_in',value:'36',source:'rep_card',status:'confirmed'},
  {field_key:'shower_length_in',value:'36',source:'rep_card',status:'confirmed'},
  {field_key:'shower_wall_height_in',value:'84',source:'rep_card',status:'confirmed'},
  {field_key:'shower_entry',value:'curb',option_key:'curb',source:'rep_card',status:'confirmed'},
  {field_key:'wet_wall_window',value:'none',option_key:'none',source:'rep_card',status:'confirmed'},
  {field_key:'tile_height',value:'ceiling',option_key:'ceiling',source:'rep_card',status:'confirmed'},
  {field_key:'niche',value:'none',option_key:'none',source:'rep_card',status:'confirmed'},
  {field_key:'wall_tile_layout',value:'subway_offset',option_key:'subway_offset',source:'rep_card',status:'confirmed'},
  {field_key:'shower_glass',value:'frameless',option_key:'frameless',source:'rep_card',status:'confirmed'},
  {field_key:'shower_drain',value:'center',option_key:'center',source:'rep_card',status:'confirmed'},
  {field_key:'floor_tile',value:'porcelain_stonelook',option_key:'porcelain_stonelook',source:'rep_card',status:'confirmed'},
  {field_key:'heated_floor',value:'false',source:'rep_card',status:'confirmed'},
  {field_key:'vanity_config',value:'single',option_key:'single',source:'rep_card',status:'confirmed'},
  {field_key:'vanity_style',value:'floating',option_key:'floating',source:'rep_card',status:'confirmed'},
  {field_key:'vanity_size_in',value:'36',option_key:'36',source:'rep_card',status:'confirmed'},
  {field_key:'countertop',value:'quartz',option_key:'quartz',source:'rep_card',status:'confirmed'},
  {field_key:'fixture_finish',value:'brushed_nickel',option_key:'brushed_nickel',source:'rep_card',status:'confirmed'},
  {field_key:'ventilation',value:'exists_vented_out',option_key:'exists_vented_out',source:'rep_card',status:'confirmed'},
  {field_key:'toilet',value:'standard',option_key:'standard',source:'rep_card',status:'confirmed'},
  {field_key:'age_of_home',value:'post_2000',option_key:'post_2000',source:'rep_card',status:'confirmed'},
  {field_key:'shower_floor_tiled',value:'true',source:'rep_card',status:'confirmed'},
  {field_key:'drywall_wet_area',value:'cement_board',option_key:'cement_board',source:'rep_card',status:'confirmed'},
  {field_key:'access_panel',value:'false',source:'rep_card',status:'confirmed'},
  {field_key:'shower_valve',value:'standard',option_key:'standard',source:'rep_card',status:'confirmed'},
  {field_key:'shower_bench',value:'false',source:'rep_card',status:'confirmed'},
];

async function rfill(page,sel,val){
  await page.evaluate(([s,v])=>{
    const el=document.querySelector(s);
    if(!el)return;
    const set=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set;
    set.call(el,v);
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  },[sel,val]);
}

async function seedAnswers(){
  await admin.from('job_scope_answers').delete().eq('job_id',JOB);
  await admin.from('estimate_line_items').delete().eq('job_id',JOB);
  await admin.from('job_estimates').update({messages:[],scope_origin:'manual'}).eq('job_id',JOB);
  const roomRes=await admin.from('job_rooms').select('id').eq('job_id',JOB).limit(1);
  const roomId=roomRes.data?.[0]?.id;
  const rows=ALL_ANSWERS.map(a=>({...a,job_id:JOB,room_id:roomId,tenant_id:TENANT}));
  const {error}=await admin.from('job_scope_answers').upsert(rows,{onConflict:'tenant_id,job_id,room_id,field_key'});
  if(error) console.log('  seed error:',error.message);
  else console.log('  seeded',rows.length,'confirmed answers');
}

async function clearDB(){
  await admin.from('job_scope_answers').delete().eq('job_id',JOB);
  await admin.from('estimate_line_items').delete().eq('job_id',JOB);
  console.log('DB restored');
}

// Verify scope_plan says complete with our answers
async function checkScopePlan(){
  const arr=ALL_ANSWERS.map(a=>({field_key:a.field_key,value:a.value}));
  const r=await fetch(FNURL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+ANON},
    body:JSON.stringify({mode:'scope_plan',tenant_id:TENANT,project_type:'bathroom',answers:arr})
  });
  const d=await r.json();
  console.log('scope_plan check: complete='+d.scope_complete+' open='+JSON.stringify(d.open_field_keys||[]).slice(0,120));
  return d.scope_complete;
}

(async()=>{
  console.log('--- Pre-flight: scope_plan completeness ---');
  const complete=await checkScopePlan();
  if(!complete){ console.log('ABORT: scope_plan not complete with seeded answers — check open_field_keys above'); process.exit(1); }

  await seedAnswers();
  const browser=await chromium.launch({headless:true});
  const ctx=await browser.newContext({viewport:{width:1280,height:1000}});
  const page=await ctx.newPage();
  const totals=[];
  try {
    await page.goto(APP);
    await page.waitForSelector("input[type='email']",{timeout:20000});
    await rfill(page,"input[type='email']",PM.email);
    await rfill(page,"input[type='password']",PM.pw);
    await page.locator('button').filter({hasText:/^Sign In$/}).click();
    await page.locator('button').filter({hasText:/^Sign In$/}).waitFor({state:'hidden',timeout:25000});
    console.log('logged in as PM\n');

    for(const run of [1,2]){
      console.log('── RUN '+run+' ──────────────────────────');
      if(run===2) await seedAnswers();

      await page.locator('.sb-item').filter({hasText:'Projects'}).first().click({timeout:20000});
      await page.waitForTimeout(1500);
      await page.locator('text=/999 Cost Plus Sandbox/').first().click({timeout:15000});
      await page.locator('.tabbar').first().waitFor({timeout:10000});
      const estTab=page.locator('button.tab').filter({hasText:'Estimate'}).first();
      await estTab.scrollIntoViewIfNeeded().catch(()=>{});
      await estTab.click();
      await page.waitForTimeout(2500);

      // Clear if prior estimate showing
      const hasFresh=await page.locator("button:has-text('Start fresh')").first().isVisible({timeout:2000}).catch(()=>false);
      if(hasFresh){
        const hasForm=await page.locator('textarea.finp.fta').first().isVisible({timeout:800}).catch(()=>false);
        if(!hasForm){
          await page.locator("button:has-text('Start fresh')").first().click();
          await page.waitForTimeout(700);
          await page.locator("button:has-text('Start fresh')").last().click().catch(()=>{});
          await page.waitForTimeout(2500);
        }
      }
      await page.locator('textarea.finp.fta').first().waitFor({timeout:12000});
      await page.waitForTimeout(1000);
      await rfill(page,"input[placeholder*='Kitchen, Master']",'Bathroom');
      await page.waitForTimeout(600);
      await page.screenshot({path:'tools/p4_run'+run+'_form.png'});
      console.log('  SF='+await page.evaluate(()=>{const e=document.querySelector("input[type='number']");return e?e.value:'n/a';}),'(expect ~49)');

      const genBtn=page.locator("button:has-text('Generate Estimate')").first();
      await genBtn.waitFor({state:'visible',timeout:8000});
      console.log('  Generate disabled='+await genBtn.isDisabled().catch(()=>true)+' (expect false)');
      await genBtn.click();
      console.log('  Generate clicked — all fields pre-answered, expecting immediate onComplete + price_plan...');

      // With scope_complete=true, configurator fires onComplete immediately; pricing should land quickly
      await page.waitForFunction(()=>{
        const t=document.body.innerText;
        return (t.includes('Formula')||t.includes('subtotal')||t.includes('Pending rate')||t.includes('Sorry, something'))&&t.match(/\$/);
      },{timeout:60000}).catch(()=>{ console.log('  [60s timeout]'); });
      await page.waitForTimeout(3000);
      await page.screenshot({path:'tools/p4_run'+run+'_estimate.png',fullPage:true});

      const body=await page.evaluate(()=>document.body.innerText);
      const keyLines=body.split('\n').filter(l=>l.trim()&&(l.includes('$')||l.includes('Formula')||l.includes('subtotal')||l.includes('TOTAL')||l.includes('Pending')||l.includes('ℹ')||l.includes('Captured')||l.includes('Sorry')||l.includes('Building')));
      console.log('  Key lines:'); keyLines.slice(0,15).forEach(l=>console.log('   ',l.trim()));

      const matchT=body.match(/Your cost[^$\n]*\$([\d,]+)/i)||body.match(/subtotal[^$\n]*\$([\d,]+)/i)||body.match(/TOTAL[^$\n]*\$([\d,]+)/i);
      const total=matchT?matchT[1].replace(/,/g,''):null;
      console.log('  Total: '+(total?'$'+total:'not extracted'));
      console.log('  Error: '+body.includes('Sorry, something went wrong')+' (expect false)');
      console.log('  Formula visible: '+(body.includes('Formula')||body.includes('takeoff_formula')||body.includes('◈'))+' (expect true)');
      console.log('  Untranslated notice: '+body.includes('Captured but not yet priced')+' (expect true for photo fields)');
      totals.push(total);
    }

    console.log('\n── DETERMINISM ────────────────────────');
    console.log('  Run 1: '+(totals[0]?'$'+totals[0]:'(missing)'));
    console.log('  Run 2: '+(totals[1]?'$'+totals[1]:'(missing)'));
    if(totals[0]&&totals[1]) console.log('  MATCH: '+(totals[0]===totals[1]?'PASS':'FAIL'));
    else console.log('  (totals not captured — check screenshots)');

  }catch(e){
    console.error('ERROR:',e.message);
    await page.screenshot({path:'tools/p4_fail.png',fullPage:true}).catch(()=>{});
  }finally{
    await browser.close();
    await clearDB();
  }
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
