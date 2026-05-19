import { useQuery } from '@tanstack/react-query';
import { tmdb } from '../lib/tmdb';

export const useSearch = (query: string) =>
  useQuery({
    queryKey: ['search', query],
    queryFn: () => tmdb.searchMulti(query),
    enabled: query.trim().length > 1,
    staleTime: 1000 * 60 * 2,
  });
