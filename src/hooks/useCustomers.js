import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export const PAGE_SIZE = 25;

/**
 * One page of the shop's customers. The previous page stays on screen while the next one loads,
 * so paging and typing a search do not flash an empty list between answers.
 */
export function useCustomers({ search = '', page = 1 } = {}) {
  return useQuery({
    queryKey: ['customers', { search, page }],
    queryFn: async () => (await api.get('/customers', { params: { search, page, pageSize: PAGE_SIZE } })).data,
    placeholderData: keepPreviousData
  });
}
