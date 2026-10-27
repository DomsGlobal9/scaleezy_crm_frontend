/** Rupees with Indian grouping: ₹9,99,999. Whole rupees on a list; the paise are on the bill. */
export function formatRupees(value, { decimals = 0 } = {}) {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return '—';
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
