import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

/**
 * Working with customers: notes, follow-ups, the team, Today, duplicates. Every write refreshes
 * whatever shows the same thing (the customer's card and timeline, Today, the badge), so a change made
 * in one place is right everywhere.
 */

export function useFollowUps(customerId) {
  return useQuery({ queryKey: ['followups', customerId], queryFn: async () => (await api.get(`/customers/${customerId}/followups`)).data, enabled: !!customerId });
}
export function useNotes(customerId) {
  return useQuery({ queryKey: ['notes', customerId], queryFn: async () => (await api.get(`/customers/${customerId}/notes`)).data, enabled: !!customerId });
}
export function useStaff() {
  return useQuery({ queryKey: ['staff'], queryFn: async () => (await api.get('/staff')).data, staleTime: 5 * 60_000 });
}
export function useToday(scope) {
  return useQuery({ queryKey: ['today', scope], queryFn: async () => (await api.get('/today', { params: { scope, notSeen: 20 } })).data, refetchInterval: 5 * 60_000 });
}
export function useTodayCount(enabled = true) {
  return useQuery({ queryKey: ['todayCount'], queryFn: async () => (await api.get('/today/count')).data, enabled, refetchInterval: 5 * 60_000 });
}
export function useMerges(status = 'open', enabled = true) {
  return useQuery({ queryKey: ['merges', status], queryFn: async () => (await api.get('/merges', { params: { status } })).data, enabled });
}

function useRefresh() {
  const qc = useQueryClient();
  return (customerId) => {
    if (customerId) {
      qc.invalidateQueries({ queryKey: ['followups', customerId] });
      qc.invalidateQueries({ queryKey: ['notes', customerId] });
      qc.invalidateQueries({ queryKey: ['customer', customerId] });
    }
    qc.invalidateQueries({ queryKey: ['today'] });
    qc.invalidateQueries({ queryKey: ['todayCount'] });
  };
}

const failed = (fallback) => (e) => toast.error(e?.message || fallback);

export function useAddFollowUp(customerId) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (input) => (await api.post(`/customers/${customerId}/followups`, input)).data,
    onSuccess: () => { toast.success('Follow-up saved'); refresh(customerId); },
    onError: failed('The follow-up could not be saved.')
  });
}
export function useFollowUpDone() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({ id, done }) => (await api.post(`/followups/${id}/${done ? 'done' : 'undo'}`)).data,
    onSuccess: (f) => refresh(f?.customerId),
    onError: failed('That could not be changed.')
  });
}
export function useMoveFollowUp() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({ id, ...change }) => (await api.patch(`/followups/${id}`, change)).data,
    onSuccess: (f) => { toast.success('Follow-up moved'); refresh(f?.customerId); },
    onError: failed('The follow-up could not be changed.')
  });
}
export function useAddNote(customerId) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (body) => (await api.post(`/customers/${customerId}/notes`, { body })).data,
    onSuccess: () => { toast.success('Note saved'); refresh(customerId); },
    onError: failed('The note could not be saved.')
  });
}

export function useMergeAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action, keepId }) => (await api.post(`/merges/${id}/${action}`, action === 'merge' ? { keepId } : {})).data,
    onSuccess: (_d, v) => {
      toast.success(v.action === 'merge' ? 'Merged into one customer' : v.action === 'undo' ? 'Merge undone: two customers again' : 'Kept as two different people');
      qc.invalidateQueries({ queryKey: ['merges'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customer'] });
    },
    onError: failed('That could not be done. Nothing was changed.')
  });
}

/** Today as one ranked list (backend services/today/talk.service). */
export function useTalkList(scope) {
  return useQuery({ queryKey: ['today', 'list', scope], queryFn: async () => (await api.get('/today/list', { params: { scope } })).data, refetchInterval: 5 * 60_000 });
}
/** Done or Later for one row; "open" takes it back. */
export function useTodayAct() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (body) => (await api.post('/today/act', body)).data,
    onSuccess: (_d, body) => refresh(body?.customerId),
    onError: failed('That could not be saved.')
  });
}
/** The language a customer's messages are written in, remembered. */
export function useSetLanguage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ customerId, language }) => (await api.put(`/customers/${customerId}/language`, { language })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['today', 'list'] })
  });
}
