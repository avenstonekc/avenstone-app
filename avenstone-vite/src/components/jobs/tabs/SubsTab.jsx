import { useState, useEffect } from 'react';
import { sbLoadSubsTabData, sbLoadSubDirectory } from '../../../lib/supabase';

export default function SubsTab({ job, profile, setTab }) {
  const [data, setData] = useState({ jobSubs: [], quoteRequests: [] });
  const [allSubs, setAllSubs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([sbLoadSubsTabData(job.id), sbLoadSubDirectory()]).then(([d, subs]) => {
      if (!active) return;
      setData(d);
      setAllSubs(subs);
      setLoading(false);
    });
    return () => { active = false; };
  }, [job.id]);

  if (loading) return <p style={{ color: '#9ca3af', padding: 24 }}>Loading…</p>;

  return (
    <div style={{ padding: '0 0 80px' }}>
      <p style={{ color: '#9ca3af', fontSize: 14 }}>Subs tab — coming soon</p>
    </div>
  );
}
