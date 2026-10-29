import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

/**
 * A customer's WhatsApp offers answer, birthday and anniversary, and deleting them. Each change is
 * made in Inventory (where campaigns, wishes and the till read them) in the name of whoever is signed
 * in; the service reads the customer back at once, so a change refreshes the whole page.
 */

export function useProfileState(customerId, enabled = true) {
  return useQuery({
    queryKey: ['customer', customerId, 'profile-state'],
    queryFn: async () => (await api.get(`/customers/${customerId}/profile`)).data,
    enabled: !!customerId && enabled
  });
}

function useRefreshCustomer() {
  const qc = useQueryClient();
  return (customerId) => {
    qc.invalidateQueries({ queryKey: ['customer', customerId] });
    qc.invalidateQueries({ queryKey: ['customers'] });
    qc.invalidateQueries({ queryKey: ['today'] });
  };
}

export function useSetOffers(customerId) {
  const refresh = useRefreshCustomer();
  return useMutation({
    mutationFn: async (agreed) => (await api.put(`/customers/${customerId}/offers`, { agreed })).data,
    onSuccess: () => refresh(customerId)
  });
}

/** { birthday?, anniversary? }: "MM-DD", or null to clear. */
export function useSetDates(customerId) {
  const refresh = useRefreshCustomer();
  return useMutation({
    mutationFn: async (dates) => (await api.put(`/customers/${customerId}/dates`, dates)).data,
    onSuccess: () => refresh(customerId)
  });
}

/** What deleting them would do. Asked fresh each time the box opens: credit or bills may have changed. */
export function useDeletePreview(customerId, enabled) {
  return useQuery({
    queryKey: ['customer', customerId, 'delete-preview'],
    queryFn: async () => (await api.get(`/customers/${customerId}/delete-preview`)).data,
    enabled: !!customerId && enabled,
    staleTime: 0,
    gcTime: 0
  });
}

export function useDeleteCustomer(customerId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (confirm) => (await api.delete(`/customers/${customerId}`, { data: { confirm } })).data,
    onSuccess: () => {
      qc.removeQueries({ queryKey: ['customer', customerId] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['todayCount'] });
    }
  });
}

/** The owner's Shop settings: what this shop has moved from Inventory to CRM. */
export function useMoved(enabled = true) {
  return useQuery({ queryKey: ['shop', 'moved'], queryFn: async () => (await api.get('/shop/moved')).data, enabled });
}

export function useSetProfileMoved() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (on) => (await api.put('/shop/moved/profile', { on })).data,
    onSuccess: (data) => qc.setQueryData(['shop', 'moved'], data)
  });
}
