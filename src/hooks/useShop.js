import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

/**
 * Is this shop's copy from Inventory in place yet? Asked again every few seconds while the first
 * copy is on its way, and left alone once it is done.
 */
export function useShop() {
  return useQuery({
    queryKey: ['shop'],
    queryFn: async () => (await api.get('/shop')).data,
    refetchInterval: (q) => (q.state.data && q.state.data.firstCopyDone ? false : 5000)
  });
}
