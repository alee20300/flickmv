import type {
  TMDBResponse,
  TMDBMediaItem,
  TMDBMovieDetail,
  TMDBTVDetail,
  TMDBVideo,
} from '../types/tmdb';

const BASE = process.env.EXPO_PUBLIC_TMDB_BASE_URL!;
const KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY!;
const IMAGE_BASE = process.env.EXPO_PUBLIC_TMDB_IMAGE_BASE!;

export async function tmdbGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  // v3 API key — always pass as query param
  url.searchParams.set('api_key', KEY);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString(), {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export const posterUrl = (
  path: string | null | undefined,
  size: 'w185' | 'w342' | 'w500' | 'original' = 'w342',
): string | null => (path ? `${IMAGE_BASE}/${size}${path}` : null);

export const backdropUrl = (
  path: string | null | undefined,
  size: 'w780' | 'w1280' | 'original' = 'w780',
): string | null => (path ? `${IMAGE_BASE}/${size}${path}` : null);

export const mediaTitle = (item: { title?: string; name?: string }): string =>
  item.title ?? item.name ?? 'Unknown';

export const mediaYear = (item: { release_date?: string; first_air_date?: string }): string => {
  const date = item.release_date ?? item.first_air_date ?? '';
  return date.slice(0, 4);
};

export const tmdb = {
  trending: (window: 'day' | 'week' = 'week') =>
    tmdbGet<TMDBResponse<TMDBMediaItem>>(`/trending/all/${window}`),

  trendingMovies: (window: 'day' | 'week' = 'week') =>
    tmdbGet<TMDBResponse<TMDBMediaItem>>(`/trending/movie/${window}`),

  discoverMovies: (params?: Record<string, string>) =>
    tmdbGet<TMDBResponse<TMDBMediaItem>>('/discover/movie', {
      sort_by: 'popularity.desc',
      'vote_average.gte': '6',
      ...params,
    }),

  discoverTV: (params?: Record<string, string>) =>
    tmdbGet<TMDBResponse<TMDBMediaItem>>('/discover/tv', {
      sort_by: 'popularity.desc',
      'vote_average.gte': '6',
      ...params,
    }),

  searchMulti: (query: string, page = 1) =>
    tmdbGet<TMDBResponse<TMDBMediaItem>>('/search/multi', {
      query,
      page: String(page),
    }),

  movieDetail: (id: number) => tmdbGet<TMDBMovieDetail>(`/movie/${id}`),

  tvDetail: (id: number) => tmdbGet<TMDBTVDetail>(`/tv/${id}`),

  movieVideos: (id: number) => tmdbGet<{ results: TMDBVideo[] }>(`/movie/${id}/videos`),

  tvVideos: (id: number) => tmdbGet<{ results: TMDBVideo[] }>(`/tv/${id}/videos`),

  similar: (type: 'movie' | 'tv', id: number) =>
    tmdbGet<TMDBResponse<TMDBMediaItem>>(`/${type}/${id}/similar`),

  genreMovieList: () => tmdbGet<{ genres: { id: number; name: string }[] }>('/genre/movie/list'),
};
