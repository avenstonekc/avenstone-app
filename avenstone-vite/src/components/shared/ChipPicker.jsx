import { useState } from 'react';

/**
 * ChipPicker — reusable chip-select with optional free-text fallback.
 *
 * Props:
 *   chips        [{ id, label }]
 *   onSelect     ({ id, label, isOther, otherText }) => void
 *   allowOther   bool (default true)
 *   otherLabel   string (default 'Something else (type)')
 *   prompt       string — helper text above chips
 */
export default function ChipPicker({
  chips = [],
  onSelect,
  allowOther = true,
  otherLabel = 'Something else (type)',
  prompt,
}) {
  const [showOther, setShowOther] = useState(false);
  const [otherText, setOtherText] = useState('');

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
  };

  const handleChip = (chip) => {
    onSelect({ id: chip.id, label: chip.label, isOther: false, otherText: '' });
  };

  const handleOtherSubmit = () => {
    const trimmed = otherText.trim();
    if (!trimmed) return;
    onSelect({ id: 'other', label: trimmed, isOther: true, otherText: trimmed });
    setOtherText('');
    setShowOther(false);
  };

  if (showOther) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {prompt && (
          <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#6B7280', marginBottom: 4 }}>
            {prompt}
          </div>
        )}
        <input
          type="text"
          autoFocus
          value={otherText}
          onChange={e => setOtherText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleOtherSubmit(); if (e.key === 'Escape') { setShowOther(false); setOtherText(''); } }}
          placeholder="Type here..."
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleOtherSubmit}
            disabled={!otherText.trim()}
            className="btn btn-navy"
            style={{ fontSize: 13, padding: '8px 16px' }}
          >
            Submit
          </button>
          <button
            onClick={() => { setShowOther(false); setOtherText(''); }}
            className="btn btn-ghost"
            style={{ fontSize: 13, padding: '8px 16px' }}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {prompt && (
        <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#6B7280', marginBottom: 4 }}>
          {prompt}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {chips.map(chip => (
          <button
            key={chip.id}
            style={chipStyle}
            onClick={() => handleChip(chip)}
            onMouseEnter={e => { e.currentTarget.style.background = '#F7F5F0'; e.currentTarget.style.borderColor = '#C9A84C'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#E8E4DC'; }}
          >
            {chip.label}
          </button>
        ))}
        {allowOther && (
          <button
            style={{ ...chipStyle, color: '#6B7280', borderStyle: 'dashed' }}
            onClick={() => setShowOther(true)}
            onMouseEnter={e => { e.currentTarget.style.background = '#F7F5F0'; e.currentTarget.style.borderColor = '#C9A84C'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#E8E4DC'; }}
          >
            {otherLabel}
          </button>
        )}
      </div>
    </div>
  );
}
