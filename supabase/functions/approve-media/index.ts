// Media Request Management Edge Function
// Handles approval, rejection, and status reconciliation

import { getServiceClient, jsonResponse, errorResponse, corsHeaders } from "../_shared/index.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  try {
    const { action, requestId, rootFolder, profileId, notes } = await req.json();
    const supabase = getServiceClient();

    // Get settings
    const { data: settings } = await supabase.from("settings")
      .select("seer_url, seer_api_key, sonarr_url, sonarr_api_key, radarr_url, radarr_api_key")
      .single();

    const seerUrl = settings?.seer_url?.replace(/\/$/, "");
    const seerKey = settings?.seer_api_key;
    const sonarrUrl = settings?.sonarr_url?.replace(/\/$/, "");
    const sonarrKey = settings?.sonarr_api_key;
    const radarrUrl = settings?.radarr_url?.replace(/\/$/, "");
    const radarrKey = settings?.radarr_api_key;

    if (action === "approve") {
      if (!requestId) return errorResponse("requestId required");

      const { data: req_ } = await supabase.from("media_requests")
        .select("*").eq("id", requestId).single();
      if (!req_) return errorResponse("Request not found", 404);

      // Forward to Jellyseerr if configured
      if (seerUrl && seerKey) {
        const seerPayload: any = {
          mediaType: req_.media_type,
          mediaId: parseInt(req_.tmdb_id || "0"),
          seasons: req_.media_type === "tv" ? "all" : undefined,
          is4k: false,
        };

        if (rootFolder) seerPayload.rootFolder = rootFolder;
        if (profileId) seerPayload.profileId = profileId;

        const seerRes = await fetch(`${seerUrl}/api/v1/request`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Api-Key": seerKey },
          body: JSON.stringify(seerPayload),
        });

        if (seerRes.ok) {
          const seerData = await seerRes.json();
          await supabase.from("media_requests").update({
            status: "approved",
            jellyseerr_request_id: String(seerData.id),
            approved_at: new Date().toISOString(),
            root_folder: rootFolder,
            profile_id: profileId,
            notes,
          }).eq("id", requestId);
        } else {
          return errorResponse(`Jellyseerr request failed: ${seerRes.status}`, 502);
        }
      } else {
        // Mark approved without Seer
        await supabase.from("media_requests").update({
          status: "approved",
          approved_at: new Date().toISOString(),
          root_folder: rootFolder,
          profile_id: profileId,
          notes,
        }).eq("id", requestId);
      }

      return jsonResponse({ ok: true });
    }

    if (action === "reject") {
      if (!requestId) return errorResponse("requestId required");

      await supabase.from("media_requests").update({
        status: "rejected",
        rejected_at: new Date().toISOString(),
        notes,
      }).eq("id", requestId);

      return jsonResponse({ ok: true });
    }

    if (action === "mark-available") {
      if (!requestId) return errorResponse("requestId required");

      await supabase.from("media_requests").update({
        status: "available",
        available_at: new Date().toISOString(),
      }).eq("id", requestId);

      return jsonResponse({ ok: true });
    }

    if (action === "check-status") {
      // Reconcile all active requests
      const { data: activeRequests } = await supabase
        .from("media_requests")
        .select("*")
        .in("status", ["approved", "downloading"]);

      const updates: any[] = [];

      for (const req_ of activeRequests || []) {
        // Check Sonarr/Radarr queue
        if (req_.media_type === "tv" && sonarrUrl && sonarrKey) {
          try {
            const queueRes = await fetch(`${sonarrUrl}/api/v3/queue?apiKey=${sonarrKey}`);
            const queue = await queueRes.json();
            const queueItem = Array.isArray(queue?.records) ? queue.records.find((q: any) =>
              q.series?.tvdbId?.toString() === req_.tmdb_id || q.series?.title === req_.title
            ) : null;

            if (queueItem) {
              const progress = queueItem.sizeleft > 0 && queueItem.size > 0
                ? Math.round(((queueItem.size - queueItem.sizeleft) / queueItem.size) * 100)
                : 0;
              updates.push({ id: req_.id, status: "downloading", download_progress: progress });

              if (queueItem.status === "completed") {
                updates.push({ id: req_.id, status: "available" });
              }
            }
          } catch { /* skip */ }
        } else if (req_.media_type === "movie" && radarrUrl && radarrKey) {
          try {
            const queueRes = await fetch(`${radarrUrl}/api/v3/queue?apiKey=${radarrKey}`);
            const queue = await queueRes.json();
            const queueItem = Array.isArray(queue?.records) ? queue.records.find((q: any) =>
              q.movie?.tmdbId?.toString() === req_.tmdb_id || q.movie?.title === req_.title
            ) : null;

            if (queueItem) {
              const progress = queueItem.sizeleft > 0 && queueItem.size > 0
                ? Math.round(((queueItem.size - queueItem.sizeleft) / queueItem.size) * 100)
                : 0;
              updates.push({ id: req_.id, status: "downloading", download_progress: progress });
            }
          } catch { /* skip */ }
        }
      }

      // Apply updates
      for (const update of updates) {
        await supabase.from("media_requests").update(update).eq("id", update.id);
      }

      return jsonResponse({ ok: true, updated: updates.length });
    }

    return errorResponse("Unknown action");

  } catch (err) {
    console.error("Media request error:", err);
    return errorResponse("Internal server error", 500);
  }
});
