import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import type { FriendshipWithUser } from '../types/app';

export const useFriends = () => {
  const userId = useAuthStore((s) => s.profile?.id);

  return useQuery({
    queryKey: ['friends', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('friendships')
        .select(
          `id, status, requester_id, addressee_id, created_at, updated_at,
          requester:users!requester_id(id, username, display_name, avatar_url, xp_total, subscription_tier),
          addressee:users!addressee_id(id, username, display_name, avatar_url, xp_total, subscription_tier)`,
        )
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .eq('status', 'accepted');
      if (error) throw error;

      return (data ?? []).map((f: any) => {
        const isRequester = f.requester_id === userId;
        return {
          ...f,
          user: isRequester ? f.addressee : f.requester,
        };
      }) as unknown as FriendshipWithUser[];
    },
    enabled: !!userId,
  });
};

export const usePendingRequests = () => {
  const userId = useAuthStore((s) => s.profile?.id);

  return useQuery({
    queryKey: ['friend-requests', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('friendships')
        .select(
          `id, status, requester_id, addressee_id, created_at,
          requester:users!requester_id(id, username, display_name, avatar_url)`,
        )
        .eq('addressee_id', userId!)
        .eq('status', 'pending');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
  });
};

export const useSendFriendRequest = () => {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.profile?.id);

  return useMutation({
    mutationFn: async (addresseeId: string) => {
      const { error } = await supabase.from('friendships').insert({
        requester_id: userId,
        addressee_id: addresseeId,
        status: 'pending',
      });
      if (error) throw error;

      await supabase.from('notifications').insert({
        user_id: addresseeId,
        type: 'friend_request',
        title: 'New Friend Request',
        body: `${userId} sent you a friend request`,
        data: { requester_id: userId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    },
  });
};

export const useRespondToFriendRequest = () => {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.profile?.id);

  return useMutation({
    mutationFn: async ({
      friendshipId,
      accept,
      requesterId,
    }: {
      friendshipId: string;
      accept: boolean;
      requesterId: string;
    }) => {
      const { error } = await supabase
        .from('friendships')
        .update({ status: accept ? 'accepted' : 'blocked' })
        .eq('id', friendshipId);
      if (error) throw error;

      if (accept) {
        await Promise.all([
          supabase.rpc('award_xp', {
            p_user_id: userId,
            p_amount: 25,
            p_reason: 'friend_accepted',
          }),
          supabase.rpc('award_xp', {
            p_user_id: requesterId,
            p_amount: 25,
            p_reason: 'friend_accepted',
          }),
          supabase.from('notifications').insert({
            user_id: requesterId,
            type: 'friend_accepted',
            title: 'Friend Request Accepted',
            body: 'Your friend request was accepted!',
            data: { accepter_id: userId },
          }),
        ]);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
    },
  });
};

export const useSearchUsers = (query: string) => {
  const userId = useAuthStore((s) => s.profile?.id);

  return useQuery({
    queryKey: ['user-search', query],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, display_name, avatar_url, subscription_tier, xp_total')
        .ilike('username', `%${query}%`)
        .neq('id', userId!)
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: query.trim().length > 1,
    staleTime: 1000 * 30,
  });
};
