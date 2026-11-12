import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export const PAGE_SIZE = 25;

/**
 * One page of the shop's customers. The previous page stays on screen while the next one loads,
 * so paging and typing a search do not flash an empty list between answers.
 */
export function useCustomers({ search = '', page = 1, pageSize = PAGE_SIZE, rules = null, sort = 'newest', refetchInterval = false } = {}) {
  const filters = rules && Object.keys(rules).length ? JSON.stringify(rules) : '';
  return useQuery({
    queryKey: ['customers', { search, page, pageSize, filters, sort }],
    queryFn: async () => (await api.get('/customers', { params: { search, page, pageSize, ...(filters ? { rules: filters } : {}), ...(sort !== 'newest' ? { sort } : {}) } })).data,
    placeholderData: keepPreviousData,
    // Customers arrive from elsewhere (the till, Inventory, the Sales dashboard): the list is asked again
    // whenever it is opened or the window comes back into view, and every minute while it is on screen.
    // While the shop's first copy from Inventory is on its way, sooner (refetchInterval).
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: refetchInterval || 60_000
  });
}

/** How many customers at each budget, by what they buy and how often: asked again like the list, every two minutes. */
export function useCustomerOverview() {
  return useQuery({
    queryKey: ['customers', 'overview'], queryFn: async () => (await api.get('/customers/overview')).data,
    staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: true, refetchInterval: 120_000
  });
}
