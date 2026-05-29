#!/usr/bin/env node
// Generates Supabase TypeScript types and writes to avenstone-vite/src/types/database.types.ts.
// Run via: npm run gen:types (from avenstone-vite/)
// Reads PAT from C:/Users/Kalin/supabase-token.txt — never embedded in code or env files.

const { execSync } = require('child_process');
const { readFileSync, mkdirSync } = require('fs');
const { join } = require('path');

const repoRoot  = join(__dirname, '..');
const outPath   = join(repoRoot, 'avenstone-vite', 'src', 'types', 'database.types.ts');
const tokenPath = 'C:/Users/Kalin/supabase-token.txt';
const projectId = 'cbfftukmhqvvjlrlnltk';

let pat;
try {
  pat = readFileSync(tokenPath, 'utf8').trim();
} catch {
  console.error(`ERROR: Could not read PAT from ${tokenPath}`);
  process.exit(2);
}

mkdirSync(join(repoRoot, 'avenstone-vite', 'src', 'types'), { recursive: true });

console.log(`Generating types for project ${projectId}...`);
try {
  execSync(
    `npx supabase gen types typescript --project-id ${projectId} > "${outPath}"`,
    {
      env: Object.assign({}, process.env, { SUPABASE_ACCESS_TOKEN: pat }),
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: true,
    }
  );
  console.log('✓ Types written to src/types/database.types.ts');
} catch (e) {
  console.error('ERROR: Type generation failed:', e.message);
  process.exit(1);
}
