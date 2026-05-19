import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { LeaderboardUser } from '../types/app';

const weekPeriod = () => {
  const now = new Date();
  const year = now.getFullYear();
  const week = Math.ceil(
    ((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000 +
      new Date(now.getFullYear(), 0, 1).getDay() +
      1) /
      7,
  );
  return `weekly_${year}_W${String(week).padStart(2, '0')}`;
};

const monthPeriod = () => {
  const now = new Date();
  return `monthly_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export const useLeaderboard = (type: 'weekly' | 'monthly' = 'weekly') => {
  const period = type === 'weekly' ? weekPeriod() : monthPeriod();

  return useQuery({
    queryKey: ['leaderboard', period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leaderboard_entries')
        .select(
          'user_id, xp, badges_earned, rank, user:users!user_id(username, display_name, avatar_url, subscription_tier)',
        )
        .eq('period', period)
        .order('xp', { ascending: false })
        .limit(50);
      if (error) throw error;

      return (data ?? []).map((entry, index) => ({
        rank: index + 1,
        user_id: entry.user_id,
        username: (entry.user as any)?.username ?? '',
        display_name: (entry.user as any)?.display_name ?? null,
        avatar_url: (entry.user as any)?.avatar_url ?? null,
        subscription_tier: (entry.user as any)?.subscription_tier ?? 'free',
        xp: entry.xp,
        badges_earned: entry.badges_earned ?? [],
      })) as LeaderboardUser[];
    },
    staleTime: 1000 * 60,
  });
};
