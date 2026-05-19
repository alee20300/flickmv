import type {
  DbUser,
  DbWatchlist,
  DbWatchlistItem,
  DbFriendship,
  DbActivityFeed,
} from './database';

export interface UserProfile extends DbUser {}

export interface WatchlistWithOwner extends DbWatchlist {
  owner?: Pick<DbUser, 'id' | 'username' | 'avatar_url'>;
  collaborator_count?: number;
}

export interface WatchlistItemEnriched extends DbWatchlistItem {
  added_by_user?: Pick<DbUser, 'username' | 'avatar_url'>;
}

export interface FriendshipWithUser extends DbFriendship {
  user: Pick<
    DbUser,
    'id' | 'username' | 'display_name' | 'avatar_url' | 'xp_total' | 'subscription_tier'
  >;
}

export interface ActivityFeedItemEnriched extends DbActivityFeed {
  actor: Pick<DbUser, 'id' | 'username' | 'display_name' | 'avatar_url'>;
}

export interface LeaderboardUser {
  rank: number;
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  subscription_tier: string;
  xp: number;
  badges_earned: string[];
}

export type TabRoute = 'index' | 'watchlists' | 'friends' | 'leaderboard' | 'profile';
