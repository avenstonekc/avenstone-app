/**
 * COMPANY_FILES_ARC Phase 5 — Job-level expiration banner.
 *
 * Shows a red warning banner when any active, client-visible company file
 * has expired (expiration_date <= today). Banner is undismissable until
 * the file is renewed or archived — the friction is intentional.
 *
 * Only visible to isStaff (owner/PM/rep) — subs and clients don't see admin alerts.
 * Mounted in JobDet.jsx at the top of the tab content area.
 *
 * Blueprint Locked Decision 11:
 * "Banner derives from a tenant-level query on company_files — no per-job column to maintain.
 *  Dismisses when expiration_date is updated (new file uploaded)."
 */

import { useState, useEffect } from 'react';
import { sb, AV_TENANT } from '../../lib/supabase';
import { fD } from '../../lib/utils';

export default function CompanyFileExpirationBanner({ profile, onNavigate }) {
  const [expired, setExpired] = useState([]);

  const isStaff = ['owner', 'project_manager', 'sales_rep'].includes(profile?.role);

  useEffect(() => {
    if (!isStaff) return;
    const today = new Date().toISOString().slice(0, 10);
    sb.from('company_files')
      .select('id, type, expiration_date')
      .eq('tenant_id', AV_TENANT)
      .eq('lifecycle_status', 'active')
      .contains('visible_to_roles', ['client'])
      .lte('expiration_date', today)
      .then(({ data }) => setExpired(data || []));
  }, [isStaff]);

  if (!isStaff || expired.length === 0) return null;

  return (
    <div style={{
      background: '#FEE2E2',
      border: '1px solid #FECACA',
      borderLeft: '4px solid #EF4444',
      borderRadius: 8,
      padding: '10px 14px',
      marginBottom: 12,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
    }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#991B1B', marginBottom: 2 }}>
          {expired.length === 1
            ? `${expired[0].type} expired`
            : `${expired.length} company documents expired`
          }
        </div>
        <div style={{ fontSize: 11, color: '#B91C1C', lineHeight: 1.4 }}>
          {expired.map(f => (
            <span key={f.id} style={{ marginRight: 12 }}>
              {f.type} — expired {fD(f.expiration_date)}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#991B1B', marginTop: 4, fontWeight: 600 }}>
          Renew via{' '}
          {onNavigate ? (
            <button
              onClick={() => onNavigate('company-files')}
              style={{ background: 'none', border: 'none', color: '#991B1B', cursor: 'pointer', fontWeight: 700, padding: 0, textDecoration: 'underline', fontSize: 11 }}
            >
              Settings → Company Files
            </button>
          ) : (
            'Settings → Company Files'
          )}
          {' '}before sending the next CO or proposal.
        </div>
      </div>
    </div>
  );
}
