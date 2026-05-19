import { useQuery } from '@tanstack/react-query';
import { tmdb } from '../lib/tmdb';

export const useTrending = (window: 'day' | 'week' = 'week') =>
  useQuery({
    queryKey: ['trending', window],
    queryFn: () => tmdb.trending(window),
    staleTime: 1000 * 60 * 15,
  });
