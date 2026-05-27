import { useState } from 'react';
import CategoryPicker from './CategoryPicker';

export default function FilesBulkTagBar({ selectedCount, onApply, onCancel }) {
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState(null);

  const handleChange = ({ category: c, subcategory: s }) => {
    setCategory(c || '');
    setSubcategory(s || null);
  };

  const handleApply = () => {
    if (!category) return;
    onApply(category, subcategory);
  };

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200,
      background: '#0A1F44', borderTop: '2px solid #C9A84C',
      padding: '12px 16px', display: 'flex', alignItems: 'flex-end',
      gap: 12, flexWrap: 'wrap', boxShadow: '0 -4px 20px rgba(10,31,68,0.35)',
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#C9A84C', flexShrink: 0, alignSelf: 'center' }}>
        {selectedCount} selected
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <CategoryPicker
          category={category}
          subcategory={subcategory}
          onChange={handleChange}
          row
        />
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignSelf: 'flex-end' }}>
        <button
          onClick={handleApply}
          disabled={!category}
          className="btn btn-gold"
          style={{ padding: '8px 18px', fontSize: 13, opacity: category ? 1 : 0.45 }}
        >
          Apply
        </button>
        <button
          onClick={onCancel}
          className="btn btn-ghost"
          style={{ padding: '8px 14px', fontSize: 13, color: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.25)' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
