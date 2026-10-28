import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

/**
 * The Counter: who is in the store now (asked again every 15 seconds, as Inventory's card did), the
 * shop's stores, a phone look-up, and the card.
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
export function useTake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => (await api.post(`/counter/arrivals/${id}/take`)).data,
    onSettled: () => qc.invalidateQueries({ queryKey: ['arrivals'] })
  });
}
