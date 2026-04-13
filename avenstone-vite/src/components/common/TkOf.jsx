import { Ic } from '../../lib/utils';

export default function TkOf({ onBack }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', background: '#F7F5F0' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #E8E4DC', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#9CA3AF', width: 24, height: 24, display: 'flex', alignItems: 'center' }} onClick={onBack}>{Ic.back}</button>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: '#0A1F44' }}>Material Takeoff</div>
      </div>
      <div style={{ padding: 24 }}>
        <div className="card" style={{ borderLeft: '4px solid #C9A84C' }}>
          <div style={{ padding: 24 }}>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: '#0A1F44', marginBottom: 16 }}>How to generate a material list</div>
            {[
              ['1', 'Complete the Project Intake and submit'],
              ['2', 'Scan your floor plan with LiDAR — label all rooms first'],
              ['3', 'Open claude.ai in a new chat'],
              ['4', 'Upload the intake .json file and your floor plan PDF'],
              ['5', 'Claude reads both files and generates the full trade-by-trade material list'],
            ].map(([n, t]) => (
              <div key={n} style={{ display: 'flex', gap: 14, marginBottom: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 24, height: 24, background: '#0A1F44', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#C9A84C', flexShrink: 0 }}>{n}</div>
                <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.6, paddingTop: 2 }}>{t}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
