import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

/**
 * Work a module does for the shop's customers (19 Nov, the Boutique module): whether the shop uses it at all, one
 * customer's work, and the shop's open work. A shop that does not use Boutique answers `using: false`, and every
 * boutique screen stays hidden.
 */
export function useShopServices(enabled = true) {
  return useQuery({ queryKey: ['shop-services'], queryFn: async () => (await api.get('/services')).data, staleTime: 5 * 60_000, enabled });
}
/** True only once the shop's services have arrived and it uses them; never while loading (no flash of boutique things). */
export function useUsesServices(enabled = true) {
  const q = useShopServices(enabled);
  return !!q.data?.using;
}
export function useCustomerWork(customerId, enabled = true) {
  return useQuery({ queryKey: ['customer', customerId, 'work'], queryFn: async () => (await api.get(`/customers/${customerId}/work`)).data, enabled: !!customerId && enabled });
}
export function useOpenWork(enabled = true) {
  return useQuery({ queryKey: ['open-work'], queryFn: async () => (await api.get('/services/work')).data, enabled, refetchInterval: 60_000 });
}

export const rupees = (paise) => (paise === null || paise === undefined ? null : `₹${Math.round(paise / 100).toLocaleString('en-IN')}`);
const DAY = 86_400_000;
/** Whole days from now to a date (negative = in the past). */
export const daysFrom = (iso, now = Date.now()) => (iso ? Math.round((Date.parse(iso) - now) / DAY) : null);
