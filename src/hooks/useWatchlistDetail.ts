import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import type {
  DbWatchlist,
  DbWatchlistItem,
  DbWatchlistCollaborator,
  MediaType,
} from '../types/database';

export const useWatchlistDetail = (watchlistId: string) => {
  const queryClient = useQueryClient();

  const watchlistQuery = useQuery({
    queryKey: ['watchlist', watchlistId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('watchlists')
        .select('*, owner:users(id, username, avatar_url)')
        .eq('id', watchlistId)
        .single();
      if (error) throw error;
      return data as DbWatchlist & {
        owner: { id: string; username: string; avatar_url: string | null };
      };
    },
    enabled: !!watchlistId,
  });

  const itemsQuery = useQuery({
    queryKey: ['watchlist', watchlistId, 'items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('watchlist_items')
        .select('*, added_by_user:users!added_by(username, avatar_url)')
        .eq('watchlist_id', watchlistId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data as DbWatchlistItem[];
    },
    enabled: !!watchlistId,
  });

  const collaboratorsQuery = useQuery({
    queryKey: ['watchlist', watchlistId, 'collaborators'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('watchlist_collaborators')
        .select('*, user:users(id, username, avatar_url, display_name)')
        .eq('watchlist_id', watchlistId);
      if (error) throw error;
      return data as (DbWatchlistCollaborator & {
        user: {
          id: string;
          username: string;
          avatar_url: string | null;
          display_name: string | null;
        };
      })[];
    },
    enabled: !!watchlistId,
  });

  // Realtime subscription for collaborative watchlists
  useEffect(() => {
    if (!watchlistQuery.data?.is_collaborative) return;

    const channel = supabase
      .channel(`watchlist_${watchlistId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'watchlist_items',
          filter: `watchlist_id=eq.${watchlistId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['watchlist', watchlistId, 'items'] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [watchlistId, watchlistQuery.data?.is_collaborative, queryClient]);

  return { watchlistQuery, itemsQuery, collaboratorsQuery };
};

export const useAddWatchlistItem = (watchlistId: string) => {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.profile?.id);

  return useMutation({
    mutationFn: async (item: {
      tmdb_id: number;
      media_type: MediaType;
      title: string;
      poster_path?: string | null;
      backdrop_path?: string | null;
      overview?: string | null;
      release_date?: string | null;
      vote_average?: number | null;
    }) => {
      const { data: existing } = await supabase
        .from('watchlist_items')
        .select('id')
        .eq('watchlist_id', watchlistId)
        .eq('tmdb_id', item.tmdb_id)
        .eq('media_type', item.media_type)
        .single();

      if (existing) throw new Error('Already in watchlist');

      const { data: maxItem } = await supabase
        .from('watchlist_items')
        .select('sort_order')
        .eq('watchlist_id', watchlistId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .single();

      const sort_order = (maxItem?.sort_order ?? 0) + 1000;

      const { error } = await supabase.from('watchlist_items').insert({
        watchlist_id: watchlistId,
        added_by: userId,
        sort_order,
        ...item,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist', watchlistId, 'items'] });
      queryClient.invalidateQueries({ queryKey: ['watchlists'] });
    },
  });
};

export const useToggleWatched = (watchlistId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ itemId, watched }: { itemId: string; watched: boolean }) => {
      const { error } = await supabase
        .from('watchlist_items')
        .update({
          watched,
          watched_at: watched ? new Date().toISOString() : null,
        })
        .eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist', watchlistId, 'items'] });
    },
  });
};

export const useRemoveWatchlistItem = (watchlistId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from('watchlist_items').delete().eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist', watchlistId, 'items'] });
      queryClient.invalidateQueries({ queryKey: ['watchlists'] });
    },
  });
};

export const useUpdateItemOrder = (watchlistId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]) => {
      await Promise.all(
        updates.map(({ id, sort_order }) =>
          supabase.from('watchlist_items').update({ sort_order }).eq('id', id),
        ),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist', watchlistId, 'items'] });
    },
  });
};
