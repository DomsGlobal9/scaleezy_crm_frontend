import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

/**
 * Customer reviews and private feedback from the online shop. CRM reads its own copies; a change goes
 * through to the shop, and the copy comes back with it.
 */
export function useReviewStats(enabled = true) {
  return useQuery({ queryKey: ['reviews', 'stats'], queryFn: async () => (await api.get('/reviews/stats')).data, enabled, refetchInterval: 60_000 });
}
/** The one simple list: what is waiting for someone. */
export function useReviewList() {
  return useQuery({ queryKey: ['reviews', 'list'], queryFn: async () => (await api.get('/reviews')).data, refetchInterval: 60_000 });
}
export function useCustomerReviews(customerId, enabled = true) {
  return useQuery({ queryKey: ['reviews', 'customer', customerId], queryFn: async () => (await api.get(`/reviews/customer/${customerId}`)).data, enabled: enabled && !!customerId });
}
export function useHideReasons(enabled = true) {
  return useQuery({ queryKey: ['reviews', 'reasons'], queryFn: async () => (await api.get('/reviews/hide-reasons')).data, enabled, staleTime: 10 * 60_000 });
}
export function useRatedLow(enabled = true) {
  return useQuery({ queryKey: ['reviews', 'rated-low'], queryFn: async () => (await api.get('/reviews/rated-low')).data, enabled });
}

const SEND = {
  reply: (id, text) => api.post(`/reviews/${id}/reply`, { text }),
  removeReply: (id) => api.delete(`/reviews/${id}/reply`),
  hide: (id, reason) => api.post(`/reviews/${id}/hide`, { reason }),
  unhide: (id) => api.post(`/reviews/${id}/unhide`, {}),
  handled: (id, handled) => api.post(`/reviews/feedback/${id}/handled`, { handled })
};

/** Every change refreshes, even a refused one: "that review has gone" should take it off the screen. */
export function useReviewAct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ act, id, value }) => (await SEND[act](id, value)).data,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['reviews'] });
      qc.invalidateQueries({ queryKey: ['customer'] });
      qc.invalidateQueries({ queryKey: ['week'] });
    }
  });
}
