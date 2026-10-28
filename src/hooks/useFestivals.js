import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

/**
 * The shop's festivals (backend lib/festivals): which count as festival buying, and their dates.
 * A change refreshes every customer's reading, since festival buying is worked out from them.
 */
export function useFestivals() {
  return useQuery({ queryKey: ['festivals'], queryFn: async () => (await api.get('/festivals')).data });
}

function useChange(message) {
  const qc = useQueryClient();
  return {
    onSuccess: (data) => {
      qc.setQueryData(['festivals'], data);
      qc.invalidateQueries({ queryKey: ['counterCard'] });
      if (message) toast.success(message);
    }
  };
}
export const useSetFestivalOn = () => useMutation({
  mutationFn: async ({ key, on }) => (await api.put(`/festivals/${key}`, { on })).data,
  ...useChange(null)
});
export const useSetFestivalDate = () => useMutation({
  mutationFn: async ({ key, year, date }) => (await api.put(`/festivals/${key}/date`, { year, date })).data,
  ...useChange('Date changed')
});
