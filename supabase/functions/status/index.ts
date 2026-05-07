// Health check for all connected services

import { getServiceClient, jsonResponse, corsHeaders } from "../_shared/index.ts";

async function checkUrl(url: string, label: string) {
  if (!url) return { ok: false, message: `${label} URL not configured` };
  try {
    const res = await fetch(url.replace(/\/$/, "") + "/system/status", { signal: AbortSignal.timeout(5000) });
    const ok = res.ok;
    // Try alternate paths for different services
    if (!ok) {
      const res2 = await fetch(url.replace(/\/$/, "") + "/api/v3/system/status", { signal: AbortSignal.timeout(5000) });
      return { ok: res2.ok, message: res2.ok ? "OK" : `HTTP ${res2.status}` };
    }
    return { ok: true, message: "OK" };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

async function checkArr(url: string, apiKey: string, label: string) {
  if (!url) return { ok: false, message: `${label} URL not configured` };
  try {
    const res = await fetch(url.replace(/\/$/, "") + "/api/v3/system/status?apikey=" + apiKey, { signal: AbortSignal.timeout(5000) });
    return { ok: res.ok, message: res.ok ? "OK" : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  try {
    const supabase = getServiceClient();
    const { data: settings } = await supabase.from("settings").select("emby_url, seer_url, sonarr_url, sonarr_api_key, radarr_url, radarr_api_key, telegram_bot_token").single();

    const [sonarr, radarr] = await Promise.all([
      checkArr(settings?.sonarr_url, settings?.sonarr_api_key, "Sonarr"),
      checkArr(settings?.radarr_url, settings?.radarr_api_key, "Radarr"),
    ]);

    return jsonResponse({
      emby: { ok: !!settings?.emby_url, message: settings?.emby_url ? "Configured" : "Not configured" },
      seer: { ok: !!settings?.seer_url, message: settings?.seer_url ? "Configured" : "Not configured" },
      sonarr,
      radarr,
      telegram: { ok: !!settings?.telegram_bot_token, message: settings?.telegram_bot_token ? "Configured" : "Not configured" },
      tunnel: { ok: true, message: "N/A" },
    });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
});
