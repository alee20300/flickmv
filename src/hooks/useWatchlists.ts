import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import type { DbWatchlist, VisibilityType } from '../types/database';

export const useWatchlists = () => {
  const userId = useAuthStore((s) => s.profile?.id);

  return useQuery({
    queryKey: ['watchlists', userId],
    queryFn: async () => {
      const [ownedRes, collabRes] = await Promise.all([
        supabase
          .from('watchlists')
          .select('*')
          .eq('owner_id', userId!)
          .order('updated_at', { ascending: false }),
        supabase
          .from('watchlist_collaborators')
          .select('watchlist:watchlists(*)')
          .eq('user_id', userId!),
      ]);
      return {
        owned: (ownedRes.data ?? []) as DbWatchlist[],
        collaborative: ((collabRes.data ?? []) as any[])
          .map((c) => c.watchlist)
          .filter(Boolean) as DbWatchlist[],
      };
    },
    enabled: !!userId,
  });
};

export const useCreateWatchlist = () => {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.profile?.id);

  return useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      visibility: VisibilityType;
      is_collaborative: boolean;
    }) => {
      const { data: result, error } = await supabase
        .from('watchlists')
        .insert({ ...data, owner_id: userId })
        .select()
        .single();
      if (error) throw error;
      return result as DbWatchlist;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlists', userId] });
    },
  });
};

export const useDeleteWatchlist = () => {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.profile?.id);

  return useMutation({
    mutationFn: async (watchlistId: string) => {
      const { error } = await supabase.from('watchlists').delete().eq('id', watchlistId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlists', userId] });
    },
  });
};
