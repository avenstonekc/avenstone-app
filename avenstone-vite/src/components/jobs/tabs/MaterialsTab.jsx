import { useState, useEffect, useRef } from 'react';
import { sbLoadMaterialOrdersForJob, sbUpdateMaterialOrder, sbLoadActiveTradeStrings, sbPhoto, sbLoadPhotosForEntity } from '../../../lib/supabase';
import { f$, fD } from '../../../lib/utils';
import AddQuoteModal from '../../modals/AddQuoteModal';

const STATUS_META = {
  planned:   { label: 'Planned',   color: '#9ca3af', bg: '#1f2937' },
  quoted:    { label: 'Quoted',    color: '#60a5fa', bg: '#1e3a5f' },
  ordered:   { label: 'Ordered',   color: '#c084fc', bg: '#3b0764' },
  delivered: { label: 'Delivered', color: '#34d399', bg: '#064e3b' },
  installed: { label: 'Installed', color: '#22c55e', bg: '#052e16' },
  cancelled: { label: 'Cancelled', color: '#ef4444', bg: '#450a0a' },
};

const NEXT = { planned: 'quoted', quoted: 'ordered', ordered: 'delivered', delivered: 'installed' };

export default function MaterialsTab({ job }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tradeOptions, setTradeOptions] = useState([]);
  const [addQuoteOpen, setAddQuoteOpen] = useState(false);
  const [addQuoteTrade, setAddQuoteTrade] = useState(null);
  const [working, setWorking] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // { id, action, label }
  const [pendingDelivery, setPendingDelivery] = useState(null); // { orderId, photoCount }
  const [deliveryUploading, setDeliveryUploading] = useState(false);
  const [entityPhotos, setEntityPhotos] = useState({}); // { [orderId]: [{ id, url }] }
  const deliveryPhotoRef = useRef();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ordRes, tradeStrings] = await Promise.all([
        sbLoadMaterialOrdersForJob(job.id),
        sbLoadActiveTradeStrings(),
      ]);
      if (ordRes.ok) {
        setOrders(ordRes.data);
        const photoableOrders = ordRes.data.filter(o => ['delivered', 'installed'].includes(o.status));
        if (photoableOrders.length > 0) {
          const photoResults = await Promise.all(
            photoableOrders.map(o => sbLoadPhotosForEntity('material_order', o.id).then(photos => [o.id, photos]))
          );
          setEntityPhotos(Object.fromEntries(photoResults));
        }
      } else {
        setError(ordRes.error || 'Failed to load orders');
      }
      setTradeOptions(tradeStrings || []);
    } catch {
      setError('Failed to load materials');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [job.id]);

  const handleTransition = async (id, status) => {
    if (status === 'delivered' && (!pendingDelivery || pendingDelivery.orderId !== id)) {
      setPendingDelivery({ orderId: id, photoCount: 0 });
      return;
    }
    setWorking(id);
    const res = await sbUpdateMaterialOrder(id, { status });
    setWorking(null);
    setConfirmAction(null);
    setPendingDelivery(null);
    if (res.ok) load();
    else setError(res.error || 'Update failed');
  };

  const handleDeliveryPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !pendingDelivery) return;
    setDeliveryUploading(true);
    const result = await sbPhoto(job.id, file, 'material_order', pendingDelivery.orderId);
    setDeliveryUploading(false);
    if (result) {
      setPendingDelivery(p => ({ ...p, photoCount: (p?.photoCount ?? 0) + 1 }));
      const oid = pendingDelivery.orderId;
      setEntityPhotos(p => ({ ...p, [oid]: [...(p[oid] || []), result] }));
    }
    e.target.value = '';
  };

  const openAdd = (trade) => { setAddQuoteTrade(trade); setAddQuoteOpen(true); };

  const tradeMap = {};
  for (const o of orders) {
    if (!tradeMap[o.trade]) tradeMap[o.trade] = [];
    tradeMap[o.trade].push(o);
  }
  const trades = Object.keys(tradeMap).sort();

  const renderActions = (order) => {
    const next = NEXT[order.status];
    const canCancel = !['installed', 'cancelled'].includes(order.status);

    if (confirmAction?.id === order.id) {
      return (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>{confirmAction.label}?</span>
          <button
            onClick={() => handleTransition(order.id, confirmAction.action)}
            disabled={working === order.id}
            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, border: '1px solid #ef4444', background: '#450a0a', color: '#ef4444', cursor: 'pointer' }}
          >
            {working === order.id ? '…' : 'Confirm'}
          </button>
          <button
            onClick={() => setConfirmAction(null)}
            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, border: '1px solid #374151', background: 'transparent', color: '#9ca3af', cursor: 'pointer' }}
          >
            No
          </button>
        </div>
      );
    }

    // Delivery photo gate panel
    if (next === 'delivered' && pendingDelivery?.orderId === order.id) {
      return (
        <div style={{ marginTop: 10, background: '#0d1f35', border: '1px solid #1e3a5f', borderRadius: 6, padding: '10px 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#60a5fa', marginBottom: 6 }}>
            Delivery photo required
            {pendingDelivery.photoCount > 0 && <span style={{ color: '#34d399', marginLeft: 8 }}>✓ {pendingDelivery.photoCount} added</span>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={() => deliveryPhotoRef.current?.click()}
              disabled={deliveryUploading}
              style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 5, border: '1px solid #3b82f6', background: '#1e3a5f', color: '#60a5fa', cursor: 'pointer' }}
            >
              {deliveryUploading ? '…' : '📷 Take Photo'}
            </button>
            <input ref={deliveryPhotoRef} type="file" accept="image/*" capture="environment" onChange={handleDeliveryPhoto} style={{ display: 'none' }} />
            <button
              onClick={() => handleTransition(order.id, 'delivered')}
              disabled={pendingDelivery.photoCount === 0 || working === order.id}
              style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 5, border: `1px solid ${pendingDelivery.photoCount > 0 ? '#22c55e' : '#374151'}`, background: pendingDelivery.photoCount > 0 ? '#052e16' : 'transparent', color: pendingDelivery.photoCount > 0 ? '#34d399' : '#6b7280', cursor: pendingDelivery.photoCount > 0 ? 'pointer' : 'not-allowed' }}
            >
              {working === order.id ? '…' : 'Confirm Delivered'}
            </button>
            <button
              onClick={() => setPendingDelivery(null)}
              style={{ fontSize: 11, padding: '4px 10px', borderRadius: 5, border: '1px solid #374151', background: 'transparent', color: '#9ca3af', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {next && (
          <button
            onClick={() => handleTransition(order.id, next)}
            disabled={working === order.id}
            style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 5, border: '1px solid #3b82f6', background: '#1e3a5f', color: '#60a5fa', cursor: 'pointer' }}
          >
            {working === order.id ? '…' : `Mark ${STATUS_META[next]?.label}`}
          </button>
        )}
        {canCancel && (
          <button
            onClick={() => setConfirmAction({ id: order.id, action: 'cancelled', label: 'Cancel this order' })}
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 5, border: '1px solid #374151', background: 'transparent', color: '#6b7280', cursor: 'pointer' }}
          >
            Cancel
          </button>
        )}
      </div>
    );
  };

  const renderPhotoStrip = (orderId) => {
    const photos = entityPhotos[orderId];
    if (!photos?.length) return null;
    return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, paddingTop: 8, borderTop: '1px solid #1f2937' }}>
        {photos.map(p => (
          <a key={p.id} href={p.url} target="_blank" rel="noreferrer" style={{ display: 'block', flexShrink: 0 }}>
            <img src={p.url} alt={p.name || 'photo'} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 4, border: '1px solid #374151' }} />
          </a>
        ))}
      </div>
    );
  };

  const renderOrder = (order) => {
    const meta = STATUS_META[order.status] || STATUS_META.planned;
    const mats = Array.isArray(order.materials) ? order.materials : [];

    return (
      <div key={order.id} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              {order.supplier_name
                ? <span style={{ fontSize: 14, fontWeight: 600, color: '#f9fafb' }}>{order.supplier_name}</span>
                : <span style={{ fontSize: 13, color: '#6b7280', fontStyle: 'italic' }}>No supplier yet</span>
              }
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: meta.bg, color: meta.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {meta.label}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {order.quote_total != null && (
                <span style={{ color: '#60a5fa', fontWeight: 600 }}>{f$(order.quote_total)}</span>
              )}
              {order.quoted_delivery_date && (
                <span>Delivery: <span style={{ color: '#d1d5db' }}>{fD(order.quoted_delivery_date)}</span></span>
              )}
              {order.actual_delivery_date && (
                <span>Delivered: <span style={{ color: '#34d399' }}>{fD(order.actual_delivery_date)}</span></span>
              )}
            </div>
          </div>
        </div>

        {mats.length > 0 && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #1f2937' }}>
            {mats.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11, color: '#9ca3af', padding: '2px 0' }}>
                <span style={{ flex: 1, color: '#d1d5db' }}>{m.description}</span>
                {m.quantity != null && (
                  <span style={{ flexShrink: 0 }}>{m.quantity}{m.unit ? ' ' + m.unit : ''}</span>
                )}
                {m.unit_price != null && (
                  <span style={{ flexShrink: 0, color: '#60a5fa', fontWeight: 600, minWidth: 54, textAlign: 'right' }}>{f$(m.unit_price)}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {order.notes && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#6b7280', fontStyle: 'italic' }}>{order.notes}</div>
        )}

        {['delivered', 'installed'].includes(order.status) && renderPhotoStrip(order.id)}

        {!['installed', 'cancelled'].includes(order.status) && renderActions(order)}
      </div>
    );
  };

  return (
    <div style={{ padding: '0 0 80px' }}>
      {error && (
        <div style={{ background: '#450a0a', color: '#ef4444', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#6b7280', fontSize: 13 }}>Loading…</div>
      )}

      {!loading && orders.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 16px', color: '#6b7280', fontSize: 13 }}>
          <div style={{ marginBottom: 12 }}>No material orders yet.</div>
          <button
            onClick={() => openAdd(null)}
            style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, border: '1px solid #374151', background: '#1f2937', color: '#f9fafb', cursor: 'pointer' }}
          >
            + Add first order
          </button>
        </div>
      )}

      {!loading && trades.map(trade => (
        <section key={trade} style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ color: '#f9fafb', fontSize: 13, fontWeight: 700, margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>{trade}</h3>
            <button
              onClick={() => openAdd(trade)}
              style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #374151', background: '#1f2937', color: '#9ca3af', cursor: 'pointer' }}
            >
              + Add quote
            </button>
          </div>
          {tradeMap[trade].map(renderOrder)}
        </section>
      ))}

      {!loading && orders.length > 0 && (
        <button
          onClick={() => openAdd(null)}
          style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, border: '1px solid #374151', background: '#1f2937', color: '#9ca3af', cursor: 'pointer', marginTop: 4 }}
        >
          + Add order for new trade
        </button>
      )}

      <AddQuoteModal
        isOpen={addQuoteOpen}
        onClose={() => { setAddQuoteOpen(false); setAddQuoteTrade(null); }}
        onSuccess={() => { setAddQuoteOpen(false); setAddQuoteTrade(null); load(); }}
        jobId={job.id}
        initialTrade={addQuoteTrade}
        tradeOptions={tradeOptions}
      />
    </div>
  );
}
