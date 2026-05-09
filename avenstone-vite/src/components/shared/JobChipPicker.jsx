import { useState, useEffect, useRef } from 'react';
import { sb } from '../../lib/supabase';

const JOB_STATUSES = ['lead', 'proposal', 'contract', 'in_progress', 'final_touches'];

/**
 * JobChipPicker — loads top 8 active jobs, shows as chips + typeahead "Other".
 *
 * Props:
 *   onSelect         ({ jobId, jobLabel, isOther, isPersonal, isOverhead }) => void
 *   includePersonal  bool (default false) — shows "Personal" chip
 *   includeOverhead  bool (default false) — shows "Overhead" chip
 *   excludeIds       string[] — job IDs to omit
 */
export default function JobChipPicker({
  onSelect,
  includePersonal = false,
  includeOverhead = false,
  excludeIds = [],
}) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTypeahead, setShowTypeahead] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await sb
        .from('jobs')
        .select('id, address, status')
        .in('status', JOB_STATUSES)
        .order('updated_at', { ascending: false })
        .limit(8);
      if (!cancelled) {
        const filtered = (data || []).filter(j => !excludeIds.includes(j.id));
        setJobs(filtered);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const chipStyle = {
    display: 'inline-block',
    border: '1px solid #E8E4DC',
    borderRadius: 20,
    padding: '8px 14px',
    fontFamily: 'DM Sans, sans-serif',
    fontSize: 14,
    color: '#0A1F44',
    background: '#fff',
    cursor: 'pointer',
    transition: 'background 0.13s, border-color 0.13s',
    whiteSpace: 'nowrap',
    textAlign: 'left',
  };

  const handleJob = (job) => {
    onSelect({ jobId: job.id, jobLabel: job.address, isOther: false, isPersonal: false, isOverhead: false });
  };

  const doSearch = async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    const { data } = await sb
      .from('jobs')
      .select('id, address, status')
      .in('status', JOB_STATUSES)
      .ilike('address', `%${q}%`)
      .limit(8);
    setResults((data || []).filter(j => !excludeIds.includes(j.id)));
    setSearching(false);
  };

  const handleQueryChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  if (showTypeahead) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          type="text"
          autoFocus
          value={query}
          onChange={handleQueryChange}
          placeholder="Search by address..."
          style={{
            border: '1px solid #E8E4DC',
            borderRadius: 8,
            padding: '10px 12px',
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 14,
            color: '#0A1F44',
            outline: 'none',
            width: '100%',
            boxSizing: 'border-box',
          }}
          onFocus={e => (e.target.style.borderColor = '#C9A84C')}
          onBlur={e => (e.target.style.borderColor = '#E8E4DC')}
        />
        {searching && (
          <div style={{ fontSize: 12, color: '#9CA3AF', fontFamily: 'DM Sans, sans-serif' }}>Searching…</div>
        )}
        {results.map(job => (
          <button
            key={job.id}
            style={{ ...chipStyle, width: '100%', borderRadius: 8 }}
            onClick={() => handleJob(job)}
            onMouseEnter={e => { e.currentTarget.style.background = '#F7F5F0'; e.currentTarget.style.borderColor = '#C9A84C'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#E8E4DC'; }}
          >
            {job.address}
            <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 6 }}>{job.status}</span>
          </button>
        ))}
        {!searching && query && results.length === 0 && (
          <div style={{ fontSize: 13, color: '#9CA3AF', fontFamily: 'DM Sans, sans-serif' }}>No jobs found for "{query}"</div>
        )}
        <button
          onClick={() => { setShowTypeahead(false); setQuery(''); setResults([]); }}
          className="btn btn-ghost"
          style={{ fontSize: 13, padding: '8px 16px', marginTop: 4 }}
        >
          Back
        </button>
      </div>
    );
  }

  if (loading) {
    return <div style={{ fontSize: 13, color: '#9CA3AF', fontFamily: 'DM Sans, sans-serif' }}>Loading jobs…</div>;
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {jobs.map(job => (
        <button
          key={job.id}
          style={chipStyle}
          onClick={() => handleJob(job)}
          onMouseEnter={e => { e.currentTarget.style.background = '#F7F5F0'; e.currentTarget.style.borderColor = '#C9A84C'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#E8E4DC'; }}
        >
          {job.address}
        </button>
      ))}
      {includePersonal && (
        <button
          style={{ ...chipStyle, borderColor: '#C9A84C' }}
          onClick={() => onSelect({ jobId: null, jobLabel: 'Personal', isOther: false, isPersonal: true, isOverhead: false })}
          onMouseEnter={e => { e.currentTarget.style.background = '#F7F5F0'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
        >
          Personal
        </button>
      )}
      {includeOverhead && (
        <button
          style={{ ...chipStyle, borderColor: '#C9A84C' }}
          onClick={() => onSelect({ jobId: null, jobLabel: 'Overhead', isOther: false, isPersonal: false, isOverhead: true })}
          onMouseEnter={e => { e.currentTarget.style.background = '#F7F5F0'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
        >
          Overhead
        </button>
      )}
      <button
        style={{ ...chipStyle, color: '#6B7280', borderStyle: 'dashed' }}
        onClick={() => setShowTypeahead(true)}
        onMouseEnter={e => { e.currentTarget.style.background = '#F7F5F0'; e.currentTarget.style.borderColor = '#C9A84C'; }}
        onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#E8E4DC'; }}
      >
        Other (search)
      </button>
    </div>
  );
}
