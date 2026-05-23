"use strict";

const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'credential-expirations.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const now = new Date();
const WARNING_DAYS = 14;

const warnings = [];

for (const cred of config.credentials) {
  const expiresAt = new Date(cred.expires_at);
  const daysUntil = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

  if (daysUntil <= 0) {
    warnings.push(`EXPIRED  ${cred.name} — expired on ${cred.expires_at}\n         Renewal: ${cred.renewal_instructions}`);
  } else if (daysUntil < WARNING_DAYS) {
    warnings.push(`WARNING  ${cred.name} — expires in ${daysUntil} day(s) on ${cred.expires_at}\n         Renewal: ${cred.renewal_instructions}`);
  }
}

if (warnings.length > 0) {
  console.error('Credential renewal required:\n');
  console.error(warnings.join('\n\n'));
  process.exit(1);
}

console.log(`All credentials healthy — no renewals needed within ${WARNING_DAYS} days.`);
process.exit(0);
