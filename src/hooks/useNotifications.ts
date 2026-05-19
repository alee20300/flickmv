import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import type { DbNotification } from '../types/database';

export const useNotifications = () => {
  const userId = useAuthStore((s) => s.profile?.id);

  return useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as DbNotification[];
    },
    enabled: !!userId,
    staleTime: 1000 * 30,
  });
};

export const useUnreadCount = () => {
  const { data: notifications } = useNotifications();
  return notifications?.filter((n) => !n.read).length ?? 0;
};

export const useMarkAllRead = () => {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.profile?.id);

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId!)
        .eq('read', false);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
    },
  });
};
