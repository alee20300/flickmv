import { useQuery } from '@tanstack/react-query';
import { tmdb } from '../lib/tmdb';
import { useAuthStore } from '../stores/authStore';
import { useLikedGenres } from './useLikes';

export const useRecommended = () => {
  // Use a string (primitive) so Zustand's === check is stable — avoids infinite loop
  // when profile is null (new [] reference every render).
  const favoriteGenres = useAuthStore((s) => s.profile?.favorite_genres ?? []);
  const { data: likedGenres = [] } = useLikedGenres();

  const mergedIds = [...new Set([...favoriteGenres, ...likedGenres])];
  const genreKey = mergedIds.join('|');

  return useQuery({
    queryKey: ['recommended', genreKey],
    queryFn: () => tmdb.discoverMovies(genreKey.length > 0 ? { with_genres: genreKey } : undefined),
    staleTime: 1000 * 60 * 30,
  });
};
