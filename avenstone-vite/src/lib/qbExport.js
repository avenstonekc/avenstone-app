const TX_LABELS = {
  client_payment: 'Client Payment', client_deposit: 'Deposit', client_refund: 'Refund',
  sub_payout: 'Sub Payout', vendor_payment: 'Vendor Payment', material_purchase: 'Materials',
  equipment_rental: 'Equipment Rental', permit: 'Permit', fuel: 'Fuel', commission: 'Commission',
  other_expense: 'Other Expense', other_income: 'Other Income',
};

const esc = v => {
  const s = String(v ?? '');
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? `"${s.replace(/"/g, '""')}"`
    : s;
};

const toQbDate = iso => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${m}/${d}/${y}`;
};

export function generateQbCsv(transactions, categoryMap, defaultAddress) {
  const rows = transactions.filter(t => t.status !== 'void' && t.status !== 'draft');
  const mapByType = {};
  (categoryMap || []).forEach(m => { mapByType[m.tx_type] = m; });

  const headers = ['Date', 'Description', 'Amount', 'Account', 'Class', 'Customer', 'Vendor', 'Memo', 'Job'];
  const lines = [headers.map(esc).join(',')];

  for (const tx of rows) {
    const map = mapByType[tx.type] || {};
    const isIn = tx.direction === 'in';
    const amount = isIn ? Number(tx.amount || 0) : -Number(tx.amount || 0);
    const memo = [tx.description, tx.notes].filter(Boolean).join(' | ');
    lines.push([
      esc(toQbDate(tx.date_incurred)),
      esc(TX_LABELS[tx.type] || tx.type),
      esc(amount.toFixed(2)),
      esc(map.qb_account || ''),
      esc(map.qb_class || ''),
      esc(isIn  ? (tx.job?.client_name || '') : ''),
      esc(!isIn ? (tx.payer_or_payee_name || `${TX_LABELS[tx.type] || tx.type} - unnamed`) : ''),
      esc(memo),
      esc(tx.job?.address || defaultAddress || ''),
    ].join(','));
  }

  return lines.join('\r\n');
}

export function downloadCsv(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}
