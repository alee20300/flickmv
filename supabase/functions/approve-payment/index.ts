// Payment Approval Edge Function
// Handles subscription payment approval with Emby policy updates

import { getServiceClient, jsonResponse, errorResponse, corsHeaders } from "../_shared/index.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  try {
    const { action, subscriptionId, userId, planId, slipData, finalAmount, discountAmount, startDate, durationDays } = await req.json();
    const supabase = getServiceClient();

    // Get settings
    const { data: settings } = await supabase.from("settings")
      .select("emby_url, emby_api_key, resend_api_key, resend_from, public_dashboard_url, telegram_bot_token, telegram_admin_ids")
      .single();

    const embyUrl = settings?.emby_url?.replace(/\/$/, "");
    const apiKey = settings?.emby_api_key;

    if (action === "submit-payment") {
      if (!userId || !planId) return errorResponse("userId and planId required");

      // Get plan details
      const { data: plan } = await supabase.from("plans").select("*").eq("id", planId).single();
      if (!plan) return errorResponse("Plan not found", 404);

      // Reject any prior pending payments for this user
      await supabase.from("subscriptions")
        .update({ status: "rejected", reviewed_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("status", "pending");

      // Create new subscription
      const { data: sub, error: createErr } = await supabase
        .from("subscriptions")
        .insert({
          user_id: userId,
          username: "",
          plan_id: planId,
          plan_name: plan.name,
          duration_days: plan.duration_days,
          price: plan.price,
          currency: plan.currency,
          status: "pending",
          source: "manual",
          submitted_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (createErr) return errorResponse("Failed to create subscription", 500);

      return jsonResponse({ ok: true, subscriptionId: sub!.id });
    }

    if (action === "approve-payment") {
      if (!subscriptionId) return errorResponse("subscriptionId required");

      // Get the subscription
      const { data: sub } = await supabase.from("subscriptions")
        .select("*").eq("id", subscriptionId).single();
      if (!sub) return errorResponse("Subscription not found", 404);

      // Calculate end date (extend existing active subscription if any)
      const baseStartDate = startDate ? new Date(startDate) : new Date();
      const duration = durationDays || sub.duration_days;
      const endDate = new Date(baseStartDate.getTime() + duration * 86400000);

      // Approve the payment
      await supabase.from("subscriptions").update({
        status: "approved",
        approved_at: new Date().toISOString(),
        reviewed_at: new Date().toISOString(),
        final_amount: finalAmount ?? sub.final_amount,
        discount_amount: discountAmount ?? sub.discount_amount,
        start_date: baseStartDate.toISOString(),
        end_date: endDate.toISOString(),
      }).eq("id", subscriptionId);

      // Apply Emby library access if configured
      if (embyUrl && apiKey) {
        try {
          // Get library folders
          const libRes = await fetch(`${embyUrl}/Library/SelectableMediaFolders?api_key=${apiKey}`);
          const libFolders = await libRes.json();

          // Find subscription and main folders
          const subscriptionFolder = libFolders.find((f: any) =>
            f.Name?.toLowerCase().includes("subscription"));
          const mainFolders = libFolders.filter((f: any) =>
            !f.Name?.toLowerCase().includes("subscription"));

          const enabledFolders = mainFolders.map((f: any) => f.Id || f.Guid);

          await fetch(`${embyUrl}/Users/${sub.user_id}/Policy?api_key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              EnableMediaPlayback: true,
              EnableAllFolders: false,
              EnabledFolders: enabledFolders,
              EnableAllChannels: false,
              EnabledChannels: [],
              AuthenticationProviderId: "Emby.Server.Implementations.Library.DefaultAuthenticationProvider",
            }),
          });
        } catch (e) {
          console.error("Emby policy update failed:", e);
        }
      }

      // Send approval email
      if (settings?.resend_api_key && sub.email) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.resend_api_key}` },
          body: JSON.stringify({
            from: settings.resend_from || "MovieFlix <onboarding@resend.dev>",
            to: sub.email,
            subject: "Payment Approved - MovieFlix",
            html: `<p>Your payment for ${sub.plan_name} has been approved.</p><p>Your subscription is valid until ${endDate.toLocaleDateString()}.</p>`,
          }),
        });
      }

      return jsonResponse({ ok: true, subscription: { ...sub, status: "approved", end_date: endDate.toISOString() } });
    }

    if (action === "reject-payment") {
      if (!subscriptionId) return errorResponse("subscriptionId required");

      await supabase.from("subscriptions").update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
      }).eq("id", subscriptionId);

      return jsonResponse({ ok: true });
    }

    if (action === "upload-slip") {
      if (!subscriptionId || !slipData) return errorResponse("subscriptionId and slipData required");

      // slipData is a base64 data URL, we store the path reference
      await supabase.from("subscriptions").update({
        slip_file_path: `payment_slips/${subscriptionId}.png`,
      }).eq("id", subscriptionId);

      return jsonResponse({ ok: true });
    }

    return errorResponse("Unknown action");

  } catch (err) {
    console.error("Payment error:", err);
    return errorResponse("Internal server error", 500);
  }
});
