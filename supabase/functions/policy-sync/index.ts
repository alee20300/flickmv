// Emby Policy Sync Edge Function
// Synchronizes library access permissions based on subscription status

import { getServiceClient, jsonResponse, errorResponse, corsHeaders } from "../_shared/index.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  try {
    const supabase = getServiceClient();

    // Get settings
    const { data: settings } = await supabase.from("settings")
      .select("emby_url, emby_api_key, admin_usernames, disable_auto_trial")
      .single();

    if (!settings?.emby_url || !settings?.emby_api_key) {
      return errorResponse("Emby server not configured", 503);
    }

    const embyUrl = settings.emby_url.replace(/\/$/, "");
    const apiKey = settings.emby_api_key;
    const adminList = (settings.admin_usernames || []).map((u: string) => u.toLowerCase());
    const disableAutoTrial = settings.disable_auto_trial;

    // Fetch all Emby users
    const usersRes = await fetch(`${embyUrl}/Users?api_key=${apiKey}`);
    if (!usersRes.ok) return errorResponse(`Emby API error: ${usersRes.status}`, 502);
    const embyUsers = await usersRes.json();

    // Fetch library folders
    const libRes = await fetch(`${embyUrl}/Library/SelectableMediaFolders?api_key=${apiKey}`);
    if (!libRes.ok) return errorResponse(`Emby library error: ${libRes.status}`, 502);
    const libFolders = await libRes.json();

    const subscriptionFolder = libFolders.find((f: any) =>
      f.Name?.toLowerCase().includes("subscription"));
    const kidsFolders = libFolders.filter((f: any) =>
      ["anime", "cartoon", "kids"].some((k) => f.Name?.toLowerCase().includes(k)));
    const mainFolders = libFolders.filter((f: any) =>
      !f.Name?.toLowerCase().includes("subscription") &&
      !["anime", "cartoon", "kids"].some((k) => f.Name?.toLowerCase().includes(k)));

    const mainIds = mainFolders.map((f: any) => f.Id || f.Guid);
    const kidsIds = kidsFolders.length > 0
      ? kidsFolders.map((f: any) => f.Id || f.Guid)
      : mainIds;
    const subIds = subscriptionFolder
      ? [subscriptionFolder.Id || subscriptionFolder.Guid]
      : mainIds;

    // Fetch unlimited users and subscriptions
    const { data: unlimitedUsers } = await supabase.from("unlimited_users").select("user_id");
    const unlimitedIds = new Set(unlimitedUsers?.map((u) => u.user_id) || []);
    const now = new Date().toISOString();

    const { data: activeSubs } = await supabase
      .from("subscriptions")
      .select("user_id, end_date")
      .eq("status", "approved")
      .gte("end_date", now);

    const activeUserIds = new Set(activeSubs?.map((s) => s.user_id) || []);

    let synced = 0;
    let trialed = 0;

    for (const user of embyUsers) {
      const userId = user.Id;
      const userName = (user.Name || "").toLowerCase();
      const isAdminEmby = user.Policy?.IsAdministrator === true;
      const isAdmin = isAdminEmby || adminList.includes(userName);
      const isKids = !!(user.Policy?.MaxParentalRating && user.Policy.MaxParentalRating <= 13);

      // Determine folder access
      let enabledFolders: string[];

      if (isAdmin || unlimitedIds.has(userId)) {
        // Full access to all folders
        enabledFolders = [...mainIds, ...kidsIds];
      } else if (isKids) {
        enabledFolders = kidsIds;
      } else if (activeUserIds.has(userId)) {
        enabledFolders = mainIds;
      } else {
        // No active subscription — only subscription folder
        enabledFolders = subIds;

        // Auto-trial for new users
        if (!disableAutoTrial) {
          const { data: existingSub } = await supabase
            .from("subscriptions")
            .select("id")
            .eq("user_id", userId)
            .maybeSingle();

          if (!existingSub) {
            await supabase.from("subscriptions").insert({
              user_id: userId,
              username: user.Name || "",
              plan_id: "auto-trial-7d",
              plan_name: "Auto Trial",
              duration_days: 7,
              price: 0,
              currency: "MVR",
              status: "approved",
              is_trial: true,
              source: "auto",
              start_date: new Date().toISOString(),
              end_date: new Date(Date.now() + 7 * 86400000).toISOString(),
              approved_at: new Date().toISOString(),
            });
            trialed++;
          }
        }
      }

      // Apply Emby policy
      try {
        const policy = {
          ...user.Policy,
          EnableMediaPlayback: true,
          EnableAllFolders: false,
          EnabledFolders: enabledFolders,
          EnableAllChannels: false,
          EnabledChannels: [],
        };

        const res = await fetch(`${embyUrl}/Users/${userId}/Policy?api_key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(policy),
        });

        if (!res.ok) {
          // Try PUT fallback
          await fetch(`${embyUrl}/Users/${userId}/Policy?api_key=${apiKey}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(policy),
          });
        }
        synced++;
      } catch (e) {
        console.error(`Failed to sync policy for ${userId}:`, e);
      }
    }

    return jsonResponse({ ok: true, synced, trialed });

  } catch (err) {
    console.error("Policy sync error:", err);
    return errorResponse("Internal server error", 500);
  }
});
