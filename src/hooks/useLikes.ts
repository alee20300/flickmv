import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import type { MediaType, DbMovieLike } from '../types/database';

export const useLikeStatus = (tmdbId: number, mediaType: MediaType) => {
  const userId = useAuthStore((s) => s.profile?.id);

  return useQuery({
    queryKey: ['like-status', userId, tmdbId, mediaType],
    queryFn: async () => {
      const { data } = await supabase
        .from('movie_likes')
        .select('id')
        .eq('user_id', userId!)
        .eq('tmdb_id', tmdbId)
        .eq('media_type', mediaType)
        .maybeSingle();
      return !!data;
    },
    enabled: !!userId && !!tmdbId,
  });
};

export const useToggleLike = () => {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.profile?.id);

  return useMutation({
    mutationFn: async (item: {
      tmdb_id: number;
      media_type: MediaType;
      title: string;
      poster_path: string | null;
      genre_ids: number[];
      isLiked: boolean;
    }) => {
      if (item.isLiked) {
        const { error } = await supabase
          .from('movie_likes')
          .delete()
          .eq('user_id', userId!)
          .eq('tmdb_id', item.tmdb_id)
          .eq('media_type', item.media_type);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('movie_likes').insert({
          user_id: userId!,
          tmdb_id: item.tmdb_id,
          media_type: item.media_type,
          title: item.title,
          poster_path: item.poster_path,
          genre_ids: item.genre_ids,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_, item) => {
      queryClient.invalidateQueries({
        queryKey: ['like-status', userId, item.tmdb_id, item.media_type],
      });
      queryClient.invalidateQueries({ queryKey: ['liked-genres', userId] });
    },
  });
};

export const useLikedGenres = () => {
  const userId = useAuthStore((s) => s.profile?.id);

  return useQuery({
    queryKey: ['liked-genres', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('movie_likes')
        .select('genre_ids')
        .eq('user_id', userId!);
      const flat = (data ?? []).flatMap((r: Pick<DbMovieLike, 'genre_ids'>) => r.genre_ids);
      return [...new Set(flat)] as number[];
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 10,
  });
};
