import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

/** The Sales dashboard (the owner's OK, 11 Nov): who is in the shop, finding and adding a customer, serving them. */
export function useSalesDashboard(store) {
  return useQuery({
    queryKey: ['sales', 'dashboard', store || ''],
    queryFn: async () => (await api.get('/sales/dashboard', { params: store ? { store } : {} })).data,
    refetchInterval: 20_000,
    placeholderData: keepPreviousData
  });
}
export function useFindCustomer(q) {
  return useQuery({
    queryKey: ['sales', 'find', q],
    queryFn: async () => (await api.get('/sales/find', { params: { q } })).data,
    enabled: (q ?? '').trim().length >= 2,
    retry: false,
    meta: { quiet: true }
  });
}
export function useAddCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.post('/sales/customers', body)).data,
    // A new customer is on All customers (and its counts) straight away, not after a refresh.
    onSuccess: (r) => { if (r?.customerId) qc.invalidateQueries({ queryKey: ['customers'] }); }
  });
}
export function useStartVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.post('/sales/visits', body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales', 'dashboard'] })
  });
}
export function useVisit(id) {
  return useQuery({ queryKey: ['sales', 'visit', id], queryFn: async () => (await api.get(`/sales/visits/${id}`)).data, enabled: !!id });
}
const askParams = (ask) => Object.fromEntries(Object.entries(ask ?? {}).filter(([, v]) => (Array.isArray(v) ? v.length : !!v)).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v]));
export function usePieces(id, ask, locationId, enabled = true) {
  return useQuery({
    queryKey: ['sales', 'pieces', id, askParams(ask), locationId || ''],
    queryFn: async () => (await api.get(`/sales/visits/${id}/pieces`, { params: { ...askParams(ask), ...(locationId ? { locationId } : {}) } })).data,
    enabled: !!id && enabled,
    placeholderData: keepPreviousData,
    retry: false,
    meta: { quiet: true }
  });
}
function useVisitWrite(fn) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => { if (data?.id) qc.setQueryData(['sales', 'visit', data.id], data); qc.invalidateQueries({ queryKey: ['sales', 'dashboard'] }); }
  });
}
export const useSetPicks = (id) => useVisitWrite(async (variantIds) => (await api.put(`/sales/visits/${id}/picks`, { variantIds })).data);
export const useSetItem = (id) => useVisitWrite(async ({ itemId, ...body }) => (await api.patch(`/sales/visits/${id}/items/${itemId}`, body)).data);
export const useFinishVisit = (id) => useVisitWrite(async () => (await api.post(`/sales/visits/${id}/finish`)).data);
