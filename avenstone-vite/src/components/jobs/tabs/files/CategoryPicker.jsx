import { useState, useEffect } from 'react';
import { sb, AV_TENANT } from '../../../../lib/supabase';

const CATEGORIES = ['Photos', 'Documents', 'Receipts', 'Floor Plans', 'Change Orders', 'Communications'];

const ssty = {
  appearance: 'none',
  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  paddingRight: 28,
};

export default function CategoryPicker({ category, subcategory, onChange, row = false }) {
  const [subcats, setSubcats] = useState([]);

  useEffect(() => {
    if (!category) { setSubcats([]); return; }
    sb.from('tenant_file_subcategories')
      .select('subcategory, display_order')
      .eq('tenant_id', AV_TENANT)
      .eq('category', category)
      .eq('is_active', true)
      .order('display_order')
      .then(({ data }) => setSubcats(data || []));
  }, [category]);

  const handleCatChange = e => {
    onChange({ category: e.target.value, subcategory: null });
  };

  const handleSubChange = e => {
    onChange({ category, subcategory: e.target.value || null });
  };

  return (
    <div style={{ display: 'flex', gap: 8, flexDirection: row ? 'row' : 'column', flexWrap: 'wrap' }}>
      <div className="fg" style={{ flex: 1, minWidth: 140, marginBottom: 0 }}>
        <label className="flbl">Category</label>
        <select className="finp" value={category || ''} onChange={handleCatChange} style={ssty}>
          <option value="">— pick one —</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {subcats.length > 0 && (
        <div className="fg" style={{ flex: 1, minWidth: 140, marginBottom: 0 }}>
          <label className="flbl">Subfolder</label>
          <select className="finp" value={subcategory || ''} onChange={handleSubChange} style={ssty}>
            <option value="">— none —</option>
            {subcats.map(s => <option key={s.subcategory} value={s.subcategory}>{s.subcategory}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
