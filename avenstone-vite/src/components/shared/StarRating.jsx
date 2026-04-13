import { useState } from 'react';

export default function StarRating({ value = 0, onChange, readonly = false, size = 18 }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: 'flex', gap: 1 }}>
      {[1, 2, 3, 4, 5].map(s => (
        <span key={s}
          style={{ fontSize: size, cursor: readonly ? 'default' : 'pointer', color: (hover || value) >= s ? '#C9A84C' : '#D1D5DB', lineHeight: 1, userSelect: 'none' }}
          onClick={() => !readonly && onChange && onChange(s)}
          onMouseEnter={() => !readonly && setHover(s)}
          onMouseLeave={() => !readonly && setHover(0)}
        >★</span>
      ))}
    </div>
  );
}
