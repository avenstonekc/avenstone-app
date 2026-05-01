import https from 'https';

const PAT = 'sbp_c6c2a840d8f2c2489bc1c64c70d07d143fe1ae37';
const PROJECT = 'cbfftukmhqvvjlrlnltk';

function query(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAT}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const rows = [
  // bathroom
  [null, 'bathroom', 'not_in_scope',    'Not in this bid',      [],            0],
  [null, 'bathroom', 'full_remodel',    'Full Remodel',         ['__all__'],   1],
  [null, 'bathroom', 'tile_only',       'Tile + Fixtures Only',
    ['Demo','Tile - Floor','Tile - Wall / shower','Plumbing - Finish / fixtures','Cleanup'], 2],
  [null, 'bathroom', 'vanity_swap',     'Vanity Swap',
    ['Plumbing - Finish / fixtures','Cabinets / vanities - Install','Cleanup'], 3],
  [null, 'bathroom', 'paint_and_floor', 'Paint + Floor Only',
    ['Demo','Paint - Interior','Flooring - LVP','Trim / carpentry - Base / case','Cleanup'], 4],
  [null, 'bathroom', 'custom',          'Custom',               ['__all__'],   5],
  // kitchen
  [null, 'kitchen',  'not_in_scope',    'Not in this bid',      [],            0],
  [null, 'kitchen',  'full_scope',      'Full Scope',           ['__all__'],   1],
  [null, 'kitchen',  'custom',          'Custom',               ['__all__'],   2],
  // basement
  [null, 'basement', 'not_in_scope',    'Not in this bid',      [],            0],
  [null, 'basement', 'full_scope',      'Full Scope',           ['__all__'],   1],
  [null, 'basement', 'custom',          'Custom',               ['__all__'],   2],
  // refresh (whole house)
  [null, 'refresh',  'not_in_scope',    'Not in this bid',      [],            0],
  [null, 'refresh',  'full_scope',      'Full Scope',           ['__all__'],   1],
  [null, 'refresh',  'custom',          'Custom',               ['__all__'],   2],
  // exterior
  [null, 'exterior', 'not_in_scope',    'Not in this bid',      [],            0],
  [null, 'exterior', 'full_scope',      'Full Scope',           ['__all__'],   1],
  [null, 'exterior', 'custom',          'Custom',               ['__all__'],   2],
];

function pgArr(arr) {
  if (!arr.length) return "'{}'";
  return `'{${arr.map(s => `"${s.replace(/"/g, '\\"')}"`).join(',')}}'`;
}

for (const [tenantId, roomType, scopeTag, label, trades, sortOrder] of rows) {
  const tid = tenantId ? `'${tenantId}'` : 'NULL';
  const sql = `INSERT INTO template_scope_subsets (tenant_id, room_type, scope_tag, label, trades, sort_order)
    VALUES (${tid}, '${roomType}', '${scopeTag}', '${label.replace(/'/g, "''")}', ${pgArr(trades)}::text[], ${sortOrder})
    ON CONFLICT (tenant_id, room_type, scope_tag) DO NOTHING;`;
  const result = await query(sql);
  if (result?.message) {
    console.error(`✗ ${scopeTag} (${roomType}): ${result.message}`);
  } else {
    console.log(`✓ ${roomType} / ${scopeTag}`);
  }
}

const count = await query('SELECT COUNT(*) FROM template_scope_subsets;');
console.log(`\nTotal rows: ${count[0]?.count}`);
