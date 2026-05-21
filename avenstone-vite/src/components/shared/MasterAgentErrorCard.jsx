import { useState } from 'react';

export default function MasterAgentErrorCard({ toolName, errorMessage, onRetry, onReport }) {
  const [showDetails, setShowDetails] = useState(false);
  const displayName = toolName
    ? toolName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : 'action';

  return (
    <div style={{
      background: '#FEF3C7',
      border: '1px solid #FCD34D',
      borderLeft: '3px solid #F59E0B',
      borderRadius: 8,
      padding: '12px 14px',
      maxWidth: '82%',
      fontFamily: 'DM Sans, sans-serif',
    }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: '#92400E', marginBottom: 2 }}>
        Something went wrong
      </div>
      <div style={{ fontSize: 13, color: '#78350F', lineHeight: 1.5, marginBottom: 10 }}>
        I couldn't complete that action.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={onRetry}
          style={{
            background: '#0A1F44',
            color: '#C9A84C',
            border: 'none',
            borderRadius: 4,
            padding: '7px 14px',
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'DM Sans, sans-serif',
            cursor: 'pointer',
            letterSpacing: 0.3,
          }}
        >
          Try again
        </button>
        <button
          onClick={onReport}
          style={{
            background: 'transparent',
            color: '#92400E',
            border: '1px solid #FCD34D',
            borderRadius: 4,
            padding: '7px 14px',
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'DM Sans, sans-serif',
            cursor: 'pointer',
          }}
        >
          Report bug
        </button>
      </div>
      <div style={{ marginTop: 8 }}>
        <button
          onClick={() => setShowDetails(v => !v)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 11,
            color: '#92400E',
            padding: 0,
            fontFamily: 'DM Sans, sans-serif',
          }}
        >
          {showDetails ? 'Hide details ▲' : 'Show details ▼'}
        </button>
        {showDetails && (
          <div style={{
            marginTop: 6,
            fontSize: 11,
            fontFamily: 'monospace',
            color: '#6B7280',
            background: 'rgba(0,0,0,0.06)',
            borderRadius: 4,
            padding: '6px 8px',
            lineHeight: 1.6,
          }}>
            <div><strong>Tool:</strong> {displayName}</div>
            <div style={{ marginTop: 2 }}><strong>Error:</strong> {errorMessage}</div>
          </div>
        )}
      </div>
    </div>
  );
}
