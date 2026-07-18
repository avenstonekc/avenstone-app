import https from 'https';

const PAT    = process.env.SUPABASE_PAT; // set via: export SUPABASE_PAT=<your-pat>
const REF    = 'cbfftukmhqvvjlrlnltk';
const TENANT = '00000000-0000-0000-0000-000000000001';
const JOB    = '7e0e357b-a0c4-47dd-89c7-f8a7c4e8c342';
const USER   = '8171742a-b586-4f13-be61-744e191a1896';

function apiCall(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const opts = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${REF}/database/query`,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${PAT}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(opts, res => {
      let data = ''; res.on('data', c => data += c); res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

// [display_order, phase, trade, category, description, qty, unit, unit_cost, source_label]
const ITEMS = [
  // BASEMENT
  [1,'Basement','Demo','labor','Demo wraparound bar w/ structural columns through top; cut around columns, patch ceiling grid, cap sink plumbing',1,'LS',1600.00,'regional_avg'],
  [2,'Basement','Demo','labor','Remove appliances',1,'LS',350.00,'regional_avg'],
  [3,'Basement','Flooring','labor','Flooring demo -- carpet + VCT 2,478 SF (CONDITION: asbestos test on VCT/mastic before demo; if positive abatement is CO not base)',2478,'SF',1.43,'labor_rate'],
  [4,'Basement','Flooring','labor','Carpet supply + install 2,478 SF mid-grade',2478,'SF',5.27,'regional_avg'],
  [5,'Basement Bath','Tile','labor','Basement Bath (6x5): floor tile 30 SF, new 30in vanity supply+install, reset toilet',1,'LS',2000.00,'regional_avg'],
  [6,'Basement','Demo','labor','Demo middle full bath entirely to storage: fixture removal, cap supply/drain, close one door opening (frame/drywall/finish)',1,'LS',3500.00,'regional_avg'],
  [7,'Basement','Paint','labor','Wallpaper border strip 2in x 381 LF perimeter',1,'LS',450.00,'regional_avg'],
  [8,'Basement','Electrical','labor','Replace 20 fluorescent troffers with dimmable LED flat panels 3000K + dimmers',20,'EA',175.00,'labor_rate'],
  // KITCHEN
  [9,'Kitchen','Flooring','labor','Demo hardwood 402 SF',402,'SF',1.43,'labor_rate'],
  [10,'Kitchen','Tile','labor','Install tile 402 SF',402,'SF',13.00,'regional_avg'],
  [11,'Kitchen','Paint','labor','Wallpaper removal + paint ~620 wall SF incl. soffit box',1,'LS',2300.00,'regional_avg'],
  [12,'Kitchen','Plumbing','labor','New vented range hood supply + install',1,'EA',1150.00,'regional_avg'],
  [13,'Kitchen','Plumbing','labor','Gas line branch to range location',1,'LS',1150.00,'regional_avg'],
  // LAUNDRY
  [14,'Laundry','Paint','labor','Paint walls only',1,'LS',550.00,'regional_avg'],
  // MASTER BATH
  [15,'Master Bath','Demo','labor','Demo: tub, parquet floor, wallpaper, mirror wall panels + skim behind',1,'LS',2000.00,'regional_avg'],
  [16,'Master Bath','Countertops','labor','2x quartz vanity tops 5 LF ea, 1 undermount sink each, installed',1,'LS',3000.00,'regional_avg'],
  [17,'Master Bath','Tile','labor','Shower rebuild 4x2.5: new base, new valve + plumbing, 12x24 wall tile to ceiling (glass door NOT scoped)',1,'LS',7500.00,'regional_avg'],
  [18,'Master Bath','Plumbing','labor','6-ft soaker tub supply + install + surround',1,'LS',5500.00,'regional_avg'],
  [19,'Master Bath','Tile','labor','Floor tile ~160 SF (site measure required -- scanner lost room to mirror walls)',160,'SF',18.44,'regional_avg'],
  [20,'Master Bath','Drywall','labor','Skim coat + paint -- master bath',1,'LS',2750.00,'regional_avg'],
  // MASTER BEDROOM
  [21,'Master','Flooring','labor','8in border removal 88.6 LF; carpet ~400 SF incl. closets; paint walls + ceiling (9-ft ceilings)',1,'LS',3800.00,'regional_avg'],
  // DINING
  [22,'Dining','Paint','labor','Paint walls only, no wallpaper',1,'LS',650.00,'regional_avg'],
  // BEDROOM 4
  [23,'Bedroom 4','Flooring','labor','Paint + carpet 161 SF (main floor)',1,'LS',1600.00,'regional_avg'],
  // LIVING
  [24,'Living','Flooring','labor','Carpet only 671 SF',671,'SF',5.27,'regional_avg'],
  // OFFICE
  [25,'Office','Flooring','labor','Carpet 180 SF',180,'SF',5.27,'regional_avg'],
  [26,'Office','Carpentry','materials','French door -- door allowance (allowance)',1,'EA',1200.00,'user_entered'],
  [27,'Office','Carpentry','labor','Frame + install 7-ft french door (convert 12-ft T+G-walled opening)',1,'LS',1000.00,'regional_avg'],
  [28,'Office','Carpentry','labor','T+G infill both sides ~80 SF',80,'SF',20.00,'regional_avg'],
  [29,'Office','Flooring','labor','Sand + stain match existing (office door transition area)',1,'LS',800.00,'regional_avg'],
  // UPPER FLOOR
  [30,'Loft','Flooring','labor','Loft carpet 303 SF',303,'SF',5.27,'regional_avg'],
  [31,'Bedroom 1','Flooring','labor','Bedroom 1 (301 SF): paint + carpet',1,'LS',2550.00,'regional_avg'],
  [32,'Bedroom 2','Flooring','labor','Bedroom 2 (186 SF): paint + carpet',1,'LS',1700.00,'regional_avg'],
  [33,'Bedroom 3','Flooring','labor','Bedroom 3 (157 SF): border removal + paint + carpet',1,'LS',1700.00,'regional_avg'],
  [34,'J+J Bath','Tile','labor','J+J Bath: carpet demo, tile ~115 SF (bath + toilet compartments + shower corridor), paint',1,'LS',3050.00,'regional_avg'],
  // ENTRY
  [35,'Entry','Paint','labor','Wallpaper removal at height incl. scaffold, mirror panel removal + skim, prime + paint (~800 wall SF, 18-ft walls)',1,'LS',6250.00,'regional_avg'],
  // STAIRS
  [36,'Stairs','Flooring','labor','Carpet 2 flights',1,'LS',2300.00,'regional_avg'],
  // HOUSE-WIDE ELECTRICAL
  [37,'House-wide','Electrical','labor','Replace ~200 outlets/switches/covers with Decora rockers, tamper-resistant per code (device swap -- rate_book outlet_switch N/A)',1,'LS',5750.00,'regional_avg'],
  // EXTERIOR
  [38,'Exterior','Paint','labor','Paint all non-brick: gutters, fascia, soffits, window surrounds, shutters, porch posts/beams, brackets, foundation band, ~600 SF stucco elastomeric',1,'LS',10000.00,'regional_avg'],
  [39,'Exterior','Garage door','labor','3 garage doors mid-range steel installed',3,'EA',2667.00,'regional_avg'],
  [40,'Exterior','Landscaping','labor','Drainage: dry creek bed 75 LF + buried drain continuation 20 LF',1,'LS',6450.00,'regional_avg'],
  [41,'Exterior','Flooring','labor','Garage floor: grind + polyaspartic coat, pitch unchanged',1,'LS',4750.00,'regional_avg'],
];

const hardCost = ITEMS.reduce((s, r) => s + r[5] * r[7], 0);
const grandTotal = Math.round(hardCost * 1.30) + 1200;
console.log(`Hard cost: $${Math.round(hardCost).toLocaleString()}`);
console.log(`Grand total (30% markup + $1,200 PM fee): $${grandTotal.toLocaleString()}`);
console.log(`Sanity band $104k-159k pre-margin: hard cost $${Math.round(hardCost).toLocaleString()} -- ${hardCost >= 104000 && hardCost <= 159000 ? 'IN BAND' : 'OUT OF BAND'}`);

const esc = s => String(s).replace(/'/g, "''");
const valRows = ITEMS.map(([ord, phase, trade, cat, desc, qty, unit, cost, src]) => {
  const total = Math.round(qty * cost * 100) / 100;
  return `(${ord},'${esc(phase)}','${esc(trade)}','${esc(cat)}','${esc(desc)}',${qty},'${unit}',${cost},0,1.0,'${src}',${total},${total})`;
}).join(',\n  ');

const sql = `WITH new_est AS (
  INSERT INTO job_estimates (tenant_id, job_id, created_by, source, scope_origin, total)
  VALUES ('${TENANT}','${JOB}','${USER}','manual','manual',${Math.round(hardCost)})
  RETURNING id
)
INSERT INTO estimate_line_items
  (tenant_id, job_id, estimate_id, display_order, phase, trade, category, description, quantity, unit, unit_cost, markup_pct, multiplier, source_label, created_by)
SELECT
  '${TENANT}','${JOB}',e.id,v.ord,v.phase,v.trade,v.cat,v.descr,v.qty,v.unit,v.cost,v.mup,v.mult,v.src,'${USER}'
FROM new_est e,
(VALUES
  ${valRows}
) AS v(ord,phase,trade,cat,descr,qty,unit,cost,mup,mult,src,total,cprice)
RETURNING id, phase, description, total_cost`;

const r = await apiCall(sql);
console.log('\nINSERT status:', r.status);
if (r.status === 201) {
  const rows = JSON.parse(r.body);
  console.log(`Inserted ${rows.length} line items`);
  const dbTotal = rows.reduce((s, r) => s + Number(r.total_cost || 0), 0);
  console.log(`DB total_cost sum: $${Math.round(dbTotal).toLocaleString()}`);
} else {
  console.log('Error body:', r.body.slice(0, 600));
}
