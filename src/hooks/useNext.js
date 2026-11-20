import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

/**
 * The next five (the mockups approved 19 Nov): levels (C9), money owed (C7), bring a friend (C8), send picks (A3),
 * and the owner's switches for parcel updates (C10), money owed and bring a friend.
 */
export const useLevel = (customerId) => useQuery({ queryKey: ['customer', customerId, 'level'], queryFn: async () => (await api.get(`/groups/customer/${customerId}/level`)).data, enabled: !!customerId });
export const useLevels = (enabled = true) => useQuery({ queryKey: ['levels'], queryFn: async () => (await api.get('/groups/levels')).data, enabled });
export function useSaveLevels() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (levels) => (await api.put('/groups/levels', { levels })).data, onSuccess: (d) => { qc.setQueryData(['levels'], d); qc.invalidateQueries({ queryKey: ['customer'] }); } });
}

export const useDues = (customerId) => useQuery({ queryKey: ['customer', customerId, 'dues'], queryFn: async () => (await api.get(`/loyalty/customers/${customerId}/dues`)).data, enabled: !!customerId, retry: false });
export function useRemindDues(customerId) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async () => (await api.post(`/loyalty/customers/${customerId}/dues/remind`)).data, onSuccess: (d) => qc.setQueryData(['customer', customerId, 'dues'], d) });
}
export function useStopDues(customerId) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (on) => (await api.put(`/loyalty/customers/${customerId}/dues/stop`, { on })).data, onSuccess: (d) => qc.setQueryData(['customer', customerId, 'dues'], d) });
}

export const useReferral = (customerId) => useQuery({ queryKey: ['customer', customerId, 'referral'], queryFn: async () => (await api.get(`/loyalty/customers/${customerId}/referral`)).data, enabled: !!customerId });
export function useMakeCode(customerId) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async () => (await api.post(`/loyalty/customers/${customerId}/referral/code`)).data, onSuccess: () => qc.invalidateQueries({ queryKey: ['customer', customerId, 'referral'] }) });
}
export const lookupCode = async (code) => (await api.get(`/loyalty/referral-codes/${encodeURIComponent(code)}`)).data;
export function useUseCode(customerId) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (code) => (await api.post('/loyalty/referrals', { friendId: customerId, code })).data, onSuccess: (d) => qc.setQueryData(['customer', customerId, 'referral'], d) });
}

export const usePickChoices = (customerId, params, enabled) => useQuery({ queryKey: ['customer', customerId, 'picks', params], queryFn: async () => (await api.get(`/loyalty/customers/${customerId}/picks/choices`, { params })).data, enabled: !!customerId && enabled, retry: false });
export const usePicksSent = (customerId) => useQuery({ queryKey: ['customer', customerId, 'picks-sent'], queryFn: async () => (await api.get(`/loyalty/customers/${customerId}/picks`)).data, enabled: !!customerId });
export function useSendPicks(customerId) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (variantIds) => (await api.post(`/loyalty/customers/${customerId}/picks`, { variantIds })).data, onSuccess: () => qc.invalidateQueries({ queryKey: ['customer', customerId, 'picks-sent'] }) });
}

const setting = (key) => ({
  use: (enabled = true) => useQuery({ queryKey: ['shop', key], queryFn: async () => (await api.get(`/shop/${key}`)).data, enabled }),
  save: () => {
    const qc = useQueryClient();
    return useMutation({ mutationFn: async (body) => (await api.put(`/shop/${key}`, body)).data, onSuccess: (d) => qc.setQueryData(['shop', key], d) });
  }
});
export const parcelSetting = setting('parcel');
export const duesSetting = setting('dues');
export const referralSetting = setting('referral');

export const rupees = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;
export const rupeesFromPaise = (p) => rupees((p ?? 0) / 100);
