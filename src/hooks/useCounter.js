import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

/**
 * In the store (read only: taking customers is at Inventory's counter), the shop's stores, a phone
 * look-up, and a customer's reading ("what they wear", on their page).
 */
export function useArrivals(store) {
  return useQuery({
    queryKey: ['arrivals', store || ''],
    queryFn: async () => (await api.get('/counter/arrivals', { params: store ? { store } : {} })).data,
    refetchInterval: 15_000,
    placeholderData: keepPreviousData
  });
}
export function useStores() {
  return useQuery({ queryKey: ['counterStores'], queryFn: async () => (await api.get('/counter/stores')).data, staleTime: 10 * 60_000 });
}
export function useLookup(phone) {
  return useQuery({
    queryKey: ['lookup', phone],
    queryFn: async () => (await api.get('/counter/lookup', { params: { phone } })).data,
    enabled: !!phone,
    retry: false,
    meta: { quiet: true } // the screen says what was wrong with the number, in place
  });
}
export function useCounterCard(id, locationId) {
  return useQuery({
    queryKey: ['counterCard', id, locationId || ''],
    queryFn: async () => (await api.get(`/counter/card/${id}`, { params: locationId ? { locationId } : {} })).data,
    enabled: !!id
  });
}
