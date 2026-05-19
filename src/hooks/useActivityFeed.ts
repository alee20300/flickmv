import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';

const PAGE_SIZE = 20;

export const useActivityFeed = () => {
  const userId = useAuthStore((s) => s.profile?.id);

  return useInfiniteQuery({
    queryKey: ['activity-feed', userId],
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await supabase
        .from('activity_feed')
        .select(
          'id, type, tmdb_id, media_type, media_title, poster_path, watchlist_id, watchlist_title, created_at, actor:users!actor_id(id, username, display_name, avatar_url)',
        )
        .neq('actor_id', userId!)
        .order('created_at', { ascending: false })
        .range(pageParam as number, (pageParam as number) + PAGE_SIZE - 1);
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined,
    initialPageParam: 0,
    enabled: !!userId,
    staleTime: 1000 * 60,
  });
};
