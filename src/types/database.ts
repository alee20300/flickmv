export type SubscriptionTier = 'free' | 'premium' | 'premium_plus';
export type VisibilityType = 'public' | 'friends' | 'private';
export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';
export type MediaType = 'movie' | 'tv';

export interface DbUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  bio: string | null;
  favorite_genres: number[];
  subscription_tier: SubscriptionTier;
  xp_total: number;
  push_token: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbFriendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  updated_at: string;
}

export interface DbWatchlist {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  cover_tmdb_id: number | null;
  cover_media_type: MediaType | null;
  visibility: VisibilityType;
  is_collaborative: boolean;
  item_count: number;
  created_at: string;
  updated_at: string;
}

export interface DbWatchlistCollaborator {
  id: string;
  watchlist_id: string;
  user_id: string;
  can_edit: boolean;
  invited_by: string | null;
  joined_at: string;
}

export interface DbWatchlistItem {
  id: string;
  watchlist_id: string;
  added_by: string;
  tmdb_id: number;
  media_type: MediaType;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string | null;
  release_date: string | null;
  vote_average: number | null;
  runtime: number | null;
  sort_order: number;
  watched: boolean;
  watched_at: string | null;
  watch_progress: number | null;
  created_at: string;
}

export interface DbNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

export interface DbLeaderboardEntry {
  id: string;
  user_id: string;
  period: string;
  xp: number;
  rank: number | null;
  badges_earned: string[];
  computed_at: string;
}

export interface DbMovieLike {
  id: string;
  user_id: string;
  tmdb_id: number;
  media_type: MediaType;
  title: string;
  poster_path: string | null;
  genre_ids: number[];
  created_at: string;
}

export interface DbActivityFeed {
  id: string;
  actor_id: string;
  type: string;
  tmdb_id: number | null;
  media_type: MediaType | null;
  media_title: string | null;
  poster_path: string | null;
  watchlist_id: string | null;
  watchlist_title: string | null;
  target_user_id: string | null;
  created_at: string;
}
