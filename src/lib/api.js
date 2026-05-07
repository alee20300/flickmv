import supabase from "./supabase.js";

// ── Helpers ─────────────────────────────────────────────────

function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function normalizeKeys(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(normalizeKeys);
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    out[snakeToCamel(key)] = value;
  }
  return out;
}

async function invokeFunction(name, body) {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": key,
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `Function ${name} returned ${res.status}`);
  if (data.error) throw new Error(data.error);
  return data;
}

export async function authenticateEmby(username, password) {
  return invokeFunction("emby-auth", { action: "login", username, password });
}

export async function verifyEmbySSO(embyUserId, embyToken) {
  return invokeFunction("emby-auth", { action: "sso", embyUserId, embyToken });
}

// ── Settings ────────────────────────────────────────────────

export async function fetchSettings() {
  const { data, error } = await supabase.from("settings").select("*").single();
  if (error) throw error;
  const normalized = normalizeKeys(data);
  // jellyseerr aliases
  normalized.jellyseerrUrl = normalized.seerUrl;
  normalized.jellyseerrApiKey = normalized.seerApiKey;
  return normalized;
}

export async function saveSettings(payload) {
  const { error } = await supabase.from("settings").update(payload).eq("id", 1);
  if (error) throw error;
}

// ── Plans ───────────────────────────────────────────────────

export async function fetchPlans() {
  const { data, error } = await supabase.from("plans").select("*").order("price", { ascending: true });
  if (error) throw error;
  return (data || []).map(normalizeKeys);
}

export async function savePlans(plans) {
  // Full replacement: delete all, then insert
  await supabase.from("plans").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (plans.length > 0) {
    const { error } = await supabase.from("plans").insert(plans);
    if (error) throw error;
  }
}

// ── Subscriptions ───────────────────────────────────────────

export async function fetchSubscriptions() {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeKeys);
}

export async function submitPayment({ userId, username, email, phone, name, planId }) {
  await invokeFunction("approve-payment", { action: "submit-payment", userId, username, email, phone, name, planId });
}

export async function approvePayment({ subscriptionId, finalAmount, discountAmount, startDate, durationDays }) {
  await invokeFunction("approve-payment", { action: "approve-payment", subscriptionId, finalAmount, discountAmount, startDate, durationDays });
}

export async function rejectPayment(subscriptionId) {
  await invokeFunction("approve-payment", { action: "reject-payment", subscriptionId });
}

export async function deletePayment(subscriptionId) {
  const { error } = await supabase.from("subscriptions").delete().eq("id", subscriptionId);
  if (error) throw error;
}

export async function updatePaymentDates(subscriptionId, { startDate, endDate, durationDays, status }) {
  const { error } = await supabase
    .from("subscriptions")
    .update({ start_date: startDate, end_date: endDate, duration_days: durationDays, status })
    .eq("id", subscriptionId);
  if (error) throw error;
}

export async function updatePaymentAmount(subscriptionId, { finalAmount, discountAmount }) {
  const { error } = await supabase
    .from("subscriptions")
    .update({ final_amount: finalAmount, discount_amount: discountAmount })
    .eq("id", subscriptionId);
  if (error) throw error;
}

export async function addManualPayment(payload) {
  const { error } = await supabase.from("subscriptions").insert({
    ...payload,
    status: "approved",
    approved_at: new Date().toISOString(),
    source: "manual",
  });
  if (error) throw error;
}

export async function markPlaybackDisabled(subscriptionIds) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("subscriptions")
    .update({ playback_disabled_at: now })
    .in("id", subscriptionIds);
  if (error) throw error;
}

export async function uploadSlip(subscriptionId, slipData) {
  if (!slipData) return;
  const base64 = slipData.replace(/^data:image\/\w+;base64,/, "");
  const buf = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const ext = slipData.match(/data:image\/(\w+)/)?.[1] || "png";
  const { error } = await supabase.storage
    .from("payment_slips")
    .upload(`${subscriptionId}.${ext}`, buf, { contentType: `image/${ext}`, upsert: true });
  if (error) throw error;
  await supabase.from("subscriptions").update({ slip_file_path: `${subscriptionId}.${ext}` }).eq("id", subscriptionId);
}

export async function updatePaymentDate(subscriptionId, { submittedAt, approvedAt, reviewedAt }) {
  const updates = {};
  if (submittedAt) updates.submitted_at = submittedAt;
  if (approvedAt) updates.approved_at = approvedAt;
  if (reviewedAt) updates.reviewed_at = reviewedAt;
  const { error } = await supabase.from("subscriptions").update(updates).eq("id", subscriptionId);
  if (error) throw error;
}

// ── Media Requests ──────────────────────────────────────────

export async function fetchMediaRequests() {
  const { data, error } = await supabase
    .from("media_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeKeys);
}

export async function createMediaRequest(payload) {
  const { data, error } = await supabase
    .from("media_requests")
    .insert({
      user_id: payload.requested_by,
      username: payload.requested_by_username,
      title: payload.title,
      media_type: payload.media_type,
      tmdb_id: payload.tmdb_id,
      imdb_id: payload.imdb_id,
      poster_path: payload.poster_path,
      poster_url: payload.poster_url,
      language: payload.language,
      status: "pending",
      requested_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function approveMediaRequest(requestId, options = {}) {
  await invokeFunction("approve-media", { action: "approve", requestId, ...options });
}

export async function rejectMediaRequest(requestId) {
  return invokeFunction("approve-media", { action: "reject", requestId });
}

export async function deleteMediaRequest(requestId) {
  await invokeFunction("approve-media", { action: "reject", requestId });
  await supabase.from("media_requests").delete().eq("id", requestId);
}

export async function checkMediaRequestStatus() {
  return invokeFunction("approve-media", { action: "check-status" });
}

export async function markAvailableMediaRequest(requestId) {
  return invokeFunction("approve-media", { action: "mark-available", requestId });
}

// ── Unlimited Users ──────────────────────────────────────────

export async function fetchUnlimitedUsers() {
  const { data, error } = await supabase
    .from("unlimited_users")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function saveUnlimitedUsers(users) {
  await supabase.from("unlimited_users").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (users.length > 0) {
    const { error } = await supabase.from("unlimited_users").insert(users);
    if (error) throw error;
  }
}

// ── User Tags ────────────────────────────────────────────────

export async function fetchUserTags() {
  const { data, error } = await supabase.from("user_tags").select("*");
  if (error) throw error;
  // Convert to object format { user_id: [tags] }
  const tags = {};
  for (const row of data || []) {
    if (!tags[row.user_id]) tags[row.user_id] = [];
    tags[row.user_id].push(row.tag);
  }
  return tags;
}

export async function saveUserTags(tagsObj) {
  await supabase.from("user_tags").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  const rows = [];
  for (const [userId, tagList] of Object.entries(tagsObj)) {
    for (const tag of (Array.isArray(tagList) ? tagList : [tagList])) {
      if (tag && userId) rows.push({ user_id: userId, tag });
    }
  }
  if (rows.length > 0) {
    const { error } = await supabase.from("user_tags").insert(rows);
    if (error) throw error;
  }
}

// ── User Contacts ────────────────────────────────────────────

export async function fetchUserContacts() {
  const { data, error } = await supabase.from("user_contacts").select("*");
  if (error) throw error;
  // Convert to object format { user_id: { email, phone } }
  const contacts = {};
  for (const row of data || []) {
    contacts[row.user_id] = { email: row.email, phone: row.phone, updatedAt: row.updated_at };
  }
  return contacts;
}

export async function saveUserContacts(contactsObj) {
  const rows = [];
  for (const [userId, contact] of Object.entries(contactsObj)) {
    if (userId && contact) {
      rows.push({
        user_id: userId,
        email: contact.email || null,
        phone: contact.phone || null,
      });
    }
  }
  // Upsert by user_id
  for (const row of rows) {
    const { error } = await supabase.from("user_contacts").upsert(row, { onConflict: "user_id" });
    if (error) throw error;
  }
}

// ── Registrations ────────────────────────────────────────────

export async function fetchRegistrations() {
  const { data, error } = await supabase
    .from("registrations")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function requestOTP({ name, email, phone }) {
  return invokeFunction("register-otp", { action: "request-otp", name, email, phone });
}

export async function verifyOTP(email, otp) {
  return invokeFunction("register-otp", { action: "verify-otp", email, otp });
}

export async function approveRegistration(registrationId) {
  return invokeFunction("register-otp", { action: "approve", registrationId });
}

export async function rejectRegistration(registrationId) {
  return invokeFunction("register-otp", { action: "reject", registrationId });
}

export async function fetchTrending() {
  const [{ data: movies }, { data: shows }] = await Promise.all([
    supabase.from("trending_media").select("*").eq("category", "movies").order("ordering"),
    supabase.from("trending_media").select("*").eq("category", "tv_shows").order("ordering"),
  ]);
  return { movies: movies || [], shows: shows || [] };
}

export async function refreshTrending() {
  return invokeFunction("fetch-trending", {});
}

export async function checkStatus() {
  return invokeFunction("status", {});
}

export async function policySync() {
  return invokeFunction("policy-sync", {});
}

// ── Chat ─────────────────────────────────────────────────────

export async function loadUserConversation(userId, username) {
  const { data: conv } = await supabase
    .from("chat_conversations")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!conv) return null;

  const { data: messages } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: true });

  return { ...conv, messages: messages || [] };
}

export async function loadAdminConversations() {
  const { data: conversations } = await supabase
    .from("chat_conversations")
    .select("*")
    .order("updated_at", { ascending: false });

  return conversations || [];
}

export async function sendChatMessage({ userId, username, displayName, body, senderRole, attachmentDataUrl, conversationId }) {
  let convId = conversationId;

  if (!convId) {
    // Find or create conversation
    const { data: existing } = await supabase
      .from("chat_conversations")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      convId = existing.id;
    } else {
      const { data: created } = await supabase
        .from("chat_conversations")
        .insert({ user_id: userId, username: username || "", display_name: displayName || "" })
        .select("id")
        .single();
      convId = created?.id;
    }
  }

  if (!convId) throw new Error("Failed to create conversation");

  let attachmentPath = null;
  if (attachmentDataUrl) {
    const base64 = attachmentDataUrl.replace(/^data:image\/\w+;base64,/, "");
    const buf = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const ext = attachmentDataUrl.match(/data:image\/(\w+)/)?.[1] || "png";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from("chat_attachments")
      .upload(filename, buf, { contentType: `image/${ext}`, upsert: true });
    if (uploadErr) throw uploadErr;
    attachmentPath = filename;
  }

  const { data: msg, error } = await supabase.from("chat_messages").insert({
    conversation_id: convId,
    sender_role: senderRole,
    sender_name: displayName || username || "",
    body: body || "",
    attachment_path: attachmentPath,
  }).select("id").single();

  if (error) throw error;

  return { conversationId: convId, messageId: msg?.id };
}

export async function markChatRead(conversationId, readerRole) {
  const field = readerRole === "admin" ? "unread_for_admin" : "unread_for_user";
  await supabase.from("chat_conversations").update({ [field]: 0 }).eq("id", conversationId);
}

// ── Realtime Subscriptions ───────────────────────────────────

export function subscribeToTable(table, callback) {
  const channel = supabase
    .channel(`${table}-changes`)
    .on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
      callback(payload);
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// Subscribe to all relevant tables and refetch data
export function subscribeToAll(callbacks) {
  const cleanupFns = [];
  const tables = ["settings", "plans", "subscriptions", "media_requests", "unlimited_users", "user_tags", "user_contacts", "registrations"];

  for (const table of tables) {
    const clean = subscribeToTable(table, (payload) => {
      if (callbacks[table]) callbacks[table](payload);
    });
    cleanupFns.push(clean);
  }

  return () => cleanupFns.forEach((fn) => fn());
}
