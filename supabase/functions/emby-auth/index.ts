// Emby Auth Edge Function
// Authenticates user against Emby server and creates/returns Supabase session

import { getServiceClient, corsHeaders, jsonResponse, errorResponse } from "../_shared/index.ts";

const ADMIN_USERNAMES = ["hucksarn"]; // Fallback admin list

interface EmbyAuthPayload {
  action: "login" | "sso";
  username?: string;
  password?: string;
  embyUserId?: string;
  embyToken?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  try {
    const payload: EmbyAuthPayload = await req.json();

    // Get settings from DB
    const supabase = getServiceClient();
    const { data: settings, error: settingsErr } = await supabase
      .from("settings")
      .select("emby_url, emby_api_key, admin_usernames")
      .single();

    if (settingsErr || !settings?.emby_url || !settings?.emby_api_key) {
      return errorResponse("Emby server not configured", 503);
    }

    const embyUrl = settings.emby_url.replace(/\/$/, "");
    const apiKey = settings.emby_api_key;
    const adminList = [...ADMIN_USERNAMES, ...(settings.admin_usernames || [])];

    let embyUserId: string;
    let embyUsername: string;
    let isAdmin: boolean;

    if (payload.action === "login" && payload.username && payload.password) {
      // --- Login flow: authenticate with Emby ---
      const authRes = await fetch(`${embyUrl}/Users/AuthenticateByName`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Emby-Authorization": 'Emby Client="MovieFlix Dashboard", Device="Web", DeviceId="movieflix-web", Version="1.0.0"',
        },
        body: JSON.stringify({ Username: payload.username, Pw: payload.password }),
      });

      if (!authRes.ok) {
        const status = authRes.status;
        if (status === 401) return errorResponse("Invalid username or password", 401);
        return errorResponse(`Emby auth failed: ${status}`, 502);
      }

      const authData = await authRes.json();
      embyUserId = authData.User?.Id;
      embyUsername = authData.User?.Name;
      const accessToken = authData.AccessToken;
      const isAdministrator = authData.User?.Policy?.IsAdministrator === true;

      isAdmin = isAdministrator || adminList.includes(embyUsername?.toLowerCase() || "");

      // --- Create/update Supabase user ---
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("emby_user_id", embyUserId)
        .maybeSingle();

      if (!profile) {
        // Create profile
        const { data: newProfile, error: createErr } = await supabase
          .from("profiles")
          .insert({
            email: `${embyUserId}@emby.local`,
            name: embyUsername,
            emby_user_id: embyUserId,
            role: isAdmin ? "admin" : "user",
          })
          .select("id")
          .single();

        if (createErr) {
          console.error("Failed to create profile:", createErr);
          return errorResponse("Failed to create user profile", 500);
        }
      }

      return jsonResponse({
        ok: true,
        user: {
          userId: embyUserId,
          username: embyUsername,
          role: isAdmin ? "admin" : "user",
          accessToken,
        },
      });

    } else if (payload.action === "sso" && payload.embyUserId && payload.embyToken) {
      // --- SSO flow: validate existing Emby token ---
      const userRes = await fetch(`${embyUrl}/Users/${payload.embyUserId}?api_key=${apiKey}`);

      if (!userRes.ok) return errorResponse("Invalid SSO token", 401);

      const userData = await userRes.json();
      embyUserId = userData.Id;
      embyUsername = userData.Name;
      isAdmin = userData.Policy?.IsAdministrator === true || adminList.includes(embyUsername?.toLowerCase() || "");

      return jsonResponse({
        ok: true,
        user: {
          userId: embyUserId,
          username: embyUsername,
          role: isAdmin ? "admin" : "user",
          accessToken: payload.embyToken,
        },
      });
    }

    return errorResponse("Missing required fields");

  } catch (err) {
    console.error("Emby auth error:", err);
    return errorResponse("Internal server error", 500);
  }
});
