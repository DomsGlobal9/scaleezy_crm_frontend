/** Rupees with Indian grouping: ₹9,99,999. Whole rupees on a list; the paise are on the bill. */
export function formatRupees(value, { decimals = 0 } = {}) {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return '—';
  // Below zero is real (an exchange can come to less than what came back): −₹186, never ₹-186.
  return `${n < 0 ? '−' : ''}₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
