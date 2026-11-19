import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

/**
 * Customer groups: CRM's own (backend services/groups); Inventory's till reads a copy CRM keeps up to date.
 * Every change refreshes the list, the group, and the customers screens that show groups.
 */
export function useGroups(enabled = true) {
  return useQuery({ queryKey: ['groups'], queryFn: async () => (await api.get('/groups')).data, enabled });
}
/** One customer's groups (for the Groups card on their page): each with "auto" and the offers aimed at it. */
export function useCustomerGroups(customerId) {
  return useQuery({ queryKey: ['group', 'customer', customerId], queryFn: async () => (await api.get(`/groups/customer/${customerId}`)).data, enabled: !!customerId });
}
export function useGroup(key) {
  return useQuery({ queryKey: ['group', key], queryFn: async () => (await api.get(`/groups/${encodeURIComponent(key)}/members`)).data, enabled: !!key });
}

function useChange(message) {
  const qc = useQueryClient();
  return {
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['group'] });
      // Their groups show on Customers, a customer's page and the Counter card: CRM's own, so at once.
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customer'] });
      if (message) toast.success(message);
    }
  };
}
export const useCreateGroup = () => useMutation({ mutationFn: async (name) => (await api.post('/groups', { name })).data, ...useChange('Group made') });
export const useRenameGroup = (key) => useMutation({ mutationFn: async (name) => (await api.post(`/groups/${encodeURIComponent(key)}/rename`, { name })).data, ...useChange('Group renamed') });
export const useMergeGroup = (key) => useMutation({ mutationFn: async (into) => (await api.post(`/groups/${encodeURIComponent(key)}/merge`, { into })).data, ...useChange('Groups merged') });
export const useGroupRules = (key) => useMutation({ mutationFn: async (rules) => (await api.patch(`/groups/${encodeURIComponent(key)}/rules`, rules)).data, ...useChange('Rules saved') });
export const useDeleteGroup = (key) => useMutation({ mutationFn: async () => (await api.delete(`/groups/${encodeURIComponent(key)}`)).data, ...useChange('Group deleted') });
export const useAddToGroup = () => useMutation({ mutationFn: async ({ group, customerIds }) => (await api.post('/groups/members', { group, customerIds })).data, ...useChange() });
export const useRemoveFromGroup = (key) => useMutation({ mutationFn: async (customerId) => (await api.delete(`/groups/${encodeURIComponent(key)}/members/${customerId}`)).data, ...useChange('Taken out of the group') });
/** Take one customer out of any group (the Groups card on their page). */
export const useTakeOutOfGroup = () => useMutation({ mutationFn: async ({ key, customerId }) => (await api.delete(`/groups/${encodeURIComponent(key)}/members/${customerId}`)).data, ...useChange() });
