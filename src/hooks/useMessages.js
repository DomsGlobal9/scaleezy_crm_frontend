import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

/**
 * WhatsApp messages from CRM (Phase 3): the list, one message, the dry run of who gets it, the shop's
 * pictures, the wishes, and a note to one customer. Every change refreshes the list and that message.
 */
export function useMessagesOverview(enabled = true) {
  return useQuery({ queryKey: ['messages', 'overview'], queryFn: async () => (await api.get('/messages/overview')).data, enabled, staleTime: 30_000 });
}
export function useMessages(tab) {
  return useQuery({ queryKey: ['messages', 'list', tab], queryFn: async () => (await api.get('/messages', { params: { tab } })).data, refetchInterval: 30_000 });
}
export function useMessage(id) {
  return useQuery({
    queryKey: ['messages', 'one', id],
    queryFn: async () => (await api.get(`/messages/${id}`)).data,
    enabled: !!id,
    // While it is going out, the numbers move: asked again every 15 seconds.
    refetchInterval: (q) => (q.state.data?.status === 'sending' ? 15_000 : false)
  });
}
/** Who would get it, and who is left out and why: the last answer stays while the next is worked out. */
export function useMessagePreview(audience) {
  return useQuery({
    queryKey: ['messages', 'preview', audience],
    queryFn: async () => (await api.post('/messages/preview', { audience })).data,
    enabled: !!audience,
    placeholderData: keepPreviousData
  });
}
export function usePictures(enabled = true) {
  return useQuery({ queryKey: ['messages', 'pictures'], queryFn: async () => (await api.get('/messages/pictures')).data, enabled, staleTime: 5 * 60_000 });
}
export function useWishes(enabled = true) {
  return useQuery({ queryKey: ['messages', 'wishes'], queryFn: async () => (await api.get('/messages/wishes')).data, enabled });
}
export function useOneStatus(enabled = true) {
  return useQuery({ queryKey: ['messages', 'one-status'], queryFn: async () => (await api.get('/messages/one-status')).data, enabled, staleTime: 60_000 });
}

function useRefresh() {
  const qc = useQueryClient();
  return (id) => {
    qc.invalidateQueries({ queryKey: ['messages', 'list'] });
    if (id) qc.invalidateQueries({ queryKey: ['messages', 'one', id] });
  };
}

export function useSaveMessage(id) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (body) => (id ? await api.put(`/messages/${id}`, body) : await api.post('/messages', body)).data,
    onSuccess: (m) => refresh(m?.id)
  });
}
/** start, pause, resume, stop, test */
export function useMessageAction(id) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (action) => (await api.post(`/messages/${id}/${action}`)).data,
    onSuccess: () => refresh(id)
  });
}
export function useDeleteDraft(id) {
  const refresh = useRefresh();
  return useMutation({ mutationFn: async () => (await api.delete(`/messages/${id}`)).data, onSuccess: () => refresh() });
}
export function useSaveWishes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.put('/messages/wishes', body)).data,
    onSuccess: (data) => qc.setQueryData(['messages', 'wishes'], data)
  });
}
export function useSendOne(customerId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (text) => (await api.post(`/messages/one/${customerId}`, { text })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customer', customerId] })
  });
}

/** A1: "How was your visit?" -- the owner's switch and Google review link (Shop settings). */
export function useFeedbackSettings(enabled = true) {
  return useQuery({ queryKey: ['shop', 'feedback'], queryFn: async () => (await api.get('/shop/feedback')).data, enabled });
}
export function useSaveFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.put('/shop/feedback', body)).data,
    onSuccess: (data) => qc.setQueryData(['shop', 'feedback'], data)
  });
}

/** A2: "New in their size and colour" -- the owner's switch (Shop settings). */
export function usePriceBands() {
  return useQuery({ queryKey: ['shop', 'price-bands'], queryFn: async () => (await api.get('/shop/price-bands')).data });
}
export function useSavePriceBands() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bands) => (await api.put('/shop/price-bands', { bands })).data,
    onSuccess: (data) => { qc.setQueryData(['shop', 'price-bands'], data); qc.invalidateQueries({ queryKey: ['segmentChoices'] }); qc.invalidateQueries({ queryKey: ['customers'] }); }
  });
}
export function useWinbackSettings(enabled = true) {
  return useQuery({ queryKey: ['shop', 'winback'], queryFn: async () => (await api.get('/shop/winback')).data, enabled });
}
export function useSaveWinback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.put('/shop/winback', body)).data,
    onSuccess: (data) => qc.setQueryData(['shop', 'winback'], data)
  });
}
export function useReviewAskSettings(enabled = true) {
  return useQuery({ queryKey: ['shop', 'review-ask'], queryFn: async () => (await api.get('/shop/review-ask')).data, enabled });
}
export function useSaveReviewAsk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.put('/shop/review-ask', body)).data,
    onSuccess: (data) => qc.setQueryData(['shop', 'review-ask'], data)
  });
}
export function useArrivalsSettings(enabled = true) {
  return useQuery({ queryKey: ['shop', 'arrivals'], queryFn: async () => (await api.get('/shop/arrivals')).data, enabled });
}
export function useSaveArrivals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.put('/shop/arrivals', body)).data,
    onSuccess: (data) => qc.setQueryData(['shop', 'arrivals'], data)
  });
}
