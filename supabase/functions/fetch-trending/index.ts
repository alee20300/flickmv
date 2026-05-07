// Fetch trending movies & TV from TMDB — cache in Supabase

import { getServiceClient, jsonResponse, errorResponse, corsHeaders } from "../_shared/index.ts";

const TMDB_BASE = "https://api.themoviedb.org/3";

interface TMDBItem {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
}

async function fetchTMDB(path: string, apiKey: string): Promise<any> {
  const url = `${TMDB_BASE}${path}?api_key=${apiKey}&language=en-US`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB error ${res.status}`);
  return res.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  try {
    const supabase = getServiceClient();

    const { data: settings } = await supabase
      .from("settings")
      .select("tmdb_api_key")
      .single();

    const apiKey = settings?.tmdb_api_key;
    if (!apiKey) return errorResponse("TMDB API key not configured", 503);

    // Fetch trending movies and TV shows
    const [trendingMovies, trendingTV] = await Promise.all([
      fetchTMDB("/trending/movie/week", apiKey),
      fetchTMDB("/trending/tv/week", apiKey),
    ]);

    const movies = (trendingMovies.results || [])
      .slice(0, 10)
      .map((m: TMDBItem, i: number) => ({
        tmdb_id: String(m.id),
        title: m.title || m.name || "Untitled",
        media_type: "movie",
        poster_path: m.poster_path || "",
        backdrop_path: m.backdrop_path || "",
        rating: Math.round((m.vote_average || 0) * 10) / 10,
        category: "movies",
        ordering: i,
      }));

    const shows = (trendingTV.results || [])
      .slice(0, 10)
      .map((m: TMDBItem, i: number) => ({
        tmdb_id: String(m.id),
        title: m.name || m.title || "Untitled",
        media_type: "tv",
        poster_path: m.poster_path || "",
        backdrop_path: m.backdrop_path || "",
        rating: Math.round((m.vote_average || 0) * 10) / 10,
        category: "tv_shows",
        ordering: i,
      }));

    // Replace all cached data
    await supabase.from("trending_media").delete().neq("id", 0);
    await supabase.from("trending_media").insert([...movies, ...shows]);

    return jsonResponse({ ok: true, movies: movies.length, shows: shows.length });

  } catch (err) {
    console.error("Fetch trending error:", err);
    return errorResponse(err.message || "Internal server error", 500);
  }
});
