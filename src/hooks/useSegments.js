import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

/**
 * Segments: the saved ones (with their numbers now), one segment's people, and trying rules out
 * before saving. Who is in a segment is worked out by the service on every look, never stored.
 */
export function useSegments() {
  return useQuery({ queryKey: ['segments'], queryFn: async () => (await api.get('/segments')).data });
}
export function useSegment(id, page = 1) {
  return useQuery({
    queryKey: ['segment', id, page],
    queryFn: async () => (await api.get(`/segments/${id}`, { params: { page } })).data,
    enabled: !!id,
    placeholderData: keepPreviousData
  });
}
export function useSegmentChoices() {
  return useQuery({ queryKey: ['segmentChoices'], queryFn: async () => (await api.get('/segments/choices')).data, staleTime: 5 * 60_000 });
}
/** Who meets these rules now. The last answer stays on screen while the next is worked out. */
export function useSegmentPreview(rules, page = 1, enabled = true) {
  return useQuery({
    queryKey: ['segmentPreview', rules, page],
    queryFn: async () => (await api.post('/segments/preview', { rules, page })).data,
    enabled,
    placeholderData: keepPreviousData,
    retry: false,
    // The builder says what is wrong with the rules beside them; no toast as well.
    meta: { quiet: true }
  });
}

function useSaved(message) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['segments'] });
    qc.invalidateQueries({ queryKey: ['segment'] });
    if (message) toast.success(message);
  };
}
export function useCreateSegment() {
  const saved = useSaved('List saved');
  return useMutation({ mutationFn: async (body) => (await api.post('/segments', body)).data, onSuccess: saved });
}
export function useUpdateSegment(id) {
  const saved = useSaved('List saved');
  return useMutation({ mutationFn: async (body) => (await api.patch(`/segments/${id}`, body)).data, onSuccess: saved });
}
export function useRemoveSegment() {
  const saved = useSaved('List removed');
  return useMutation({ mutationFn: async (id) => (await api.delete(`/segments/${id}`)).data, onSuccess: saved });
}
