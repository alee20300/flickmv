import { useAuthStore } from '../stores/authStore';
import { GATES } from '../constants/config';
import type { SubscriptionTier } from '../types/database';

export const useSubscription = () => {
  const tier = (useAuthStore((s) => s.profile?.subscription_tier) ?? 'free') as SubscriptionTier;

  return {
    tier,
    isPremium: tier === 'premium' || tier === 'premium_plus',
    isPremiumPlus: tier === 'premium_plus',
    maxWatchlists: GATES.maxWatchlists[tier],
    maxCollaborativeWatchlists: GATES.maxCollaborativeWatchlists[tier],
    canHavePrivateWatchlists: GATES.canHavePrivateWatchlists[tier],
    canSeeFullLeaderboard: GATES.canSeeFullLeaderboard[tier],
    xpMultiplier: GATES.xpMultiplier[tier],
  };
};
