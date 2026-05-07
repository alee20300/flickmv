// Registration OTP Edge Function
// Handles OTP generation, verification, and approval

import { getServiceClient, jsonResponse, errorResponse, corsHeaders } from "../_shared/index.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  try {
    const { action, name, email, phone, otp, registrationId } = await req.json();
    const supabase = getServiceClient();

    // Get settings
    const { data: settings } = await supabase.from("settings").select("registration_verification_mode, resend_api_key, resend_from").single();
    const mode = settings?.registration_verification_mode || "both";
    const resendKey = settings?.resend_api_key;
    const resendFrom = settings?.resend_from || "MovieFlix <onboarding@resend.dev>";

    if (action === "request-otp") {
      if (!name || !email || !phone) {
        return errorResponse("Name, email, and phone are required");
      }

      // Check for existing registration
      const { data: existing } = await supabase
        .from("registrations")
        .select("id, status")
        .eq("email", email.toLowerCase().trim())
        .maybeSingle();

      if (existing && existing.status === "approved") {
        return errorResponse("This email is already registered");
      }

      // Generate OTP
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const otpHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(otp));
      const otpHashHex = Array.from(new Uint8Array(otpHash)).map(b => b.toString(16).padStart(2, "0")).join("");

      const requiresEmailOtp = mode === "both" || mode === "email";
      const requiresSmsOtp = mode === "both" || mode === "sms";

      // Create or update registration
      let regId = existing?.id;
      if (regId) {
        await supabase.from("registrations").update({
          name, phone, status: "otp_sent",
          otp_hash: otpHashHex,
          otp_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          requires_email_otp: requiresEmailOtp,
          requires_sms_otp: requiresSmsOtp,
          requested_at: new Date().toISOString(),
        }).eq("id", regId);
      } else {
        const { data: newReg } = await supabase.from("registrations").insert({
          name, email: email.toLowerCase().trim(), phone,
          status: "otp_sent",
          otp_hash: otpHashHex,
          otp_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          requires_email_otp: requiresEmailOtp,
          requires_sms_otp: requiresSmsOtp,
        }).select("id").single();
        regId = newReg!.id;
      }

      // Send email OTP via Resend if needed
      let emailSent = false;
      let smsSent = false;
      let sendErrors: string[] = [];

      if (requiresEmailOtp && resendKey) {
        try {
          const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
            body: JSON.stringify({
              from: resendFrom,
              to: email,
              subject: "Your MovieFlix Verification Code",
              html: `<p>Hi ${name},</p><p>Your verification code is: <strong>${otp}</strong></p><p>This code expires in 10 minutes.</p>`,
            }),
          });
          if (!emailRes.ok) sendErrors.push(`Email send failed: ${emailRes.status}`);
          else emailSent = true;
        } catch (e) {
          sendErrors.push(`Email send error: ${e.message}`);
        }
      } else if (requiresEmailOtp && !resendKey) {
        sendErrors.push("Resend API key not configured");
      }

      // Send SMS via MsgOwl REST API
      if (requiresSmsOtp) {
        const { data: smsSettings } = await supabase.from("settings")
          .select("msgowl_otp_api_key, msgowl_api_key, msgowl_sender").single();
        const smsKey = smsSettings?.msgowl_api_key || smsSettings?.msgowl_otp_api_key;
        const sender = smsSettings?.msgowl_sender || "SALESIFY";

        if (smsKey) {
          try {
            const smsRes = await fetch("https://rest.msgowl.com/messages", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `AccessKey ${smsKey}` },
              body: JSON.stringify({
                recipients: phone,
                sender_id: sender,
                body: `Your MovieFlix verification code is: ${otp}`,
              }),
            });
            if (!smsRes.ok) {
              const smsBody = await smsRes.text().catch(() => "");
              sendErrors.push(`SMS send failed: ${smsRes.status} ${smsBody}`);
            } else {
              smsSent = true;
            }
          } catch (e) {
            sendErrors.push(`SMS send error: ${e.message}`);
          }
        } else {
          sendErrors.push("SMS API key not configured");
        }
      }

      if (sendErrors.length > 0 && !emailSent && !smsSent) {
        return errorResponse(`OTP delivery failed: ${sendErrors.join("; ")}`);
      }

      return jsonResponse({
        ok: true,
        registrationId: regId,
        requiresEmailOtp,
        requiresSmsOtp,
      });
    }

    if (action === "verify-otp") {
      if (!email || !otp) return errorResponse("Email and OTP are required");

      const { data: reg } = await supabase
        .from("registrations")
        .select("*")
        .eq("email", email.toLowerCase().trim())
        .maybeSingle();

      if (!reg) return errorResponse("Registration not found", 404);

      // Verify OTP hash
      const otpHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(otp));
      const otpHashHex = Array.from(new Uint8Array(otpHash)).map(b => b.toString(16).padStart(2, "0")).join("");

      if (otpHashHex !== reg.otp_hash) return errorResponse("Invalid OTP", 401);
      if (reg.otp_expires_at && new Date(reg.otp_expires_at) < new Date()) return errorResponse("OTP expired", 401);

      await supabase.from("registrations").update({
        status: "approved",
        verified_at: new Date().toISOString(),
        approved_at: new Date().toISOString(),
        otp_hash: null,
        otp_expires_at: null,
      }).eq("id", reg.id);

      // Create Emby user + send credentials
      let autoLogin: { username: string; password: string } | null = null;
      const { data: settings } = await supabase.from("settings")
        .select("emby_url, emby_api_key, msgowl_api_key, msgowl_sender").single();

      if (settings?.emby_url && settings?.emby_api_key) {
        const embyUrl = settings.emby_url.replace(/\/$/, "");
        const tempPassword = Array.from(crypto.getRandomValues(new Uint8Array(6)))
          .map(b => "abcdefghjkmnpqrstuvwxyz23456789"[b % 32]).join("");

        try {
          // Create Emby user
          const createRes = await fetch(`${embyUrl}/Users/New?api_key=${settings.emby_api_key}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ Name: reg.email }),
          });
          if (createRes.ok) {
            const embyUser = await createRes.json();
            const userId = embyUser.Id;

            // Set password
            await fetch(`${embyUrl}/Users/${userId}/Password?api_key=${settings.emby_api_key}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                Id: userId,
                CurrentPw: "",
                NewPw: tempPassword,
                ResetPassword: false,
              }),
            });

            // Update registration
            await supabase.from("registrations").update({
              emby_user_id: userId,
            }).eq("id", reg.id);

            autoLogin = { username: reg.email, password: tempPassword };

            // Send SMS with credentials
            const smsKey = settings.msgowl_api_key;
            const sender = settings.msgowl_sender || "SALESIFY";
            if (smsKey) {
              await fetch("https://rest.msgowl.com/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `AccessKey ${smsKey}` },
                body: JSON.stringify({
                  recipients: reg.phone,
                  sender_id: sender,
                  body: `MovieFlix login - Email: ${reg.email} Password: ${tempPassword}`,
                }),
              });
            }
          }
        } catch (e) {
          console.error("Emby user creation failed:", e);
        }
      }

      return jsonResponse({ ok: true, verified: true, autoLogin });
    }

    if (action === "approve") {
      // Admin approves a registration
      if (!registrationId) return errorResponse("registrationId required");

      const { data: reg } = await supabase.from("registrations").select("*").eq("id", registrationId).single();
      if (!reg) return errorResponse("Registration not found", 404);

      await supabase.from("registrations").update({
        status: "approved",
        approved_at: new Date().toISOString(),
      }).eq("id", registrationId);

      return jsonResponse({ ok: true });
    }

    if (action === "reject") {
      if (!registrationId) return errorResponse("registrationId required");

      await supabase.from("registrations").update({
        status: "rejected",
        rejected_at: new Date().toISOString(),
      }).eq("id", registrationId);

      return jsonResponse({ ok: true });
    }

    return errorResponse("Unknown action");

  } catch (err) {
    console.error("Registration error:", err);
    return errorResponse("Internal server error", 500);
  }
});
