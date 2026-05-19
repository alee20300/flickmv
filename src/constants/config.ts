export const GATES = {
  maxWatchlists: { free: 3, premium: 20, premium_plus: Infinity },
  maxCollaborativeWatchlists: { free: 0, premium: 3, premium_plus: Infinity },
  canHavePrivateWatchlists: { free: false, premium: true, premium_plus: true },
  canSeeFullLeaderboard: { free: false, premium: true, premium_plus: true },
  xpMultiplier: { free: 1, premium: 1.5, premium_plus: 2 },
} as const;

export const XP = {
  onboarding: 100,
  addToWatchlist: 10,
  markWatched: 50,
  friendAccepted: 25,
  createWatchlist: 30,
  firstWatchlist: 50,
  tenWatched: 100,
  fiveFriends: 75,
} as const;

export const BADGES = {
  FIRST_WATCHLIST: { id: 'first_watchlist', label: 'Curator', emoji: '🎬' },
  TEN_WATCHED: { id: 'ten_watched', label: 'Binge Watcher', emoji: '📺' },
  FIVE_FRIENDS: { id: 'five_friends', label: 'Social Butterfly', emoji: '🦋' },
  COLLAB_KING: { id: 'collab_king', label: 'Collab King', emoji: '👑' },
} as const;

export const TMDB_GENRES = [
  { id: 28, name: 'Action' },
  { id: 12, name: 'Adventure' },
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comedy' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentary' },
  { id: 18, name: 'Drama' },
  { id: 14, name: 'Fantasy' },
  { id: 27, name: 'Horror' },
  { id: 10749, name: 'Romance' },
  { id: 878, name: 'Sci-Fi' },
  { id: 53, name: 'Thriller' },
] as const;
