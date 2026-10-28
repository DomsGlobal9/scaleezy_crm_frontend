import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

/** The top of the customer page: profile, numbers, what they tend to buy. */
export function useCustomer(id) {
  return useQuery({
    queryKey: ['customer', id],
    queryFn: async () => (await api.get(`/customers/${id}`)).data,
    enabled: !!id
  });
}

export const TIMELINE_PAGE = 30;

/**
 * The timeline, newest first, one page at a time. "Show earlier" asks for the events before the
 * oldest one on screen; the service says when there are no more.
 */
export function useTimeline(id, kind = 'all') {
  return useInfiniteQuery({
    queryKey: ['customer', id, 'timeline', kind],
    queryFn: async ({ pageParam }) =>
      (await api.get(`/customers/${id}/timeline`, { params: { kind, limit: TIMELINE_PAGE, ...(pageParam ? { before: pageParam } : {}) } })).data,
    initialPageParam: null,
    getNextPageParam: (last) => last?.nextBefore ?? undefined,
    enabled: !!id
  });
}

/** Every consent record for this customer, newest first, and where it stands now (plan M6). */
export function useConsent(id, enabled = true) {
  return useQuery({
    queryKey: ['customer', id, 'consent'],
    queryFn: async () => (await api.get(`/customers/${id}/consent`)).data,
    enabled: !!id && enabled
  });
}
