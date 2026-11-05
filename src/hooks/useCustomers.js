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
    // While the shop's first copy from Inventory is on its way, the list fills in by itself.
    refetchInterval
  });
}

/** How many customers at each budget and by what they buy. */
export function useCustomerOverview() {
  return useQuery({ queryKey: ['customers', 'overview'], queryFn: async () => (await api.get('/customers/overview')).data, staleTime: 60_000 });
}
