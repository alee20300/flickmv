import fs from "fs";
import http from "http";
import path from "path";
import os from "os";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { execFileSync, spawn } from "child_process";
import fetch from "node-fetch";
import {
  appendConversationMessage,
  findConversation,
  loadChatState,
  markConversationRead,
  saveChatState,
  serializeConversation,
  serializeConversationList,
  upsertConversation,
} from "./chat-store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..");
const DIST = path.resolve(ROOT, "dist");

const settingsFile = path.resolve(ROOT, "settings.json");
const subscriptionsFile = path.resolve(ROOT, "subscriptions.json");
const slipsDir = path.resolve(ROOT, "slips");
const slipsIndexFile = path.resolve(ROOT, "slips.json");
const telegramStateFile = path.resolve(ROOT, "telegram-state.json");
const plansFile = path.resolve(ROOT, "plans.json");
const movieRequestsFile = path.resolve(ROOT, "movie-requests.json");
const mediaRequestsFile = path.resolve(ROOT, "media-requests.json");
const unlimitedFile = path.resolve(ROOT, "unlimited-users.json");
const tagsFile = path.resolve(ROOT, "user-tags.json");
const userContactsFile = path.resolve(ROOT, "user-contacts.json");
const registrationsFile = path.resolve(ROOT, "registrations.json");
const userChatsFile = path.resolve(ROOT, "user-chats.json");
const chatUploadsDir = path.resolve(ROOT, "chat-uploads");
const embyGuideUploadsDir = path.resolve(ROOT, "emby-guide");
const embyGuideDir = {
  public: path.resolve(ROOT, "public", "emby-guide"),
  dist: path.resolve(DIST, "emby-guide"),
};
const telegramPidFile = path.resolve(ROOT, ".pids", "telegram-bot.pid");
const telegramLockFile = path.resolve(ROOT, "telegram-bot.lock");
const cloudflaredPidFile = path.resolve(ROOT, ".pids", "cloudflared.pid");
const cloudflaredLockFile = path.resolve(ROOT, "cloudflared.lock");
const cloudflaredLogFile = path.resolve("/tmp", "cloudflared.log");
const cloudflaredBin =
  process.env.CLOUDFLARED_BIN || path.resolve(os.homedir(), "bin", "cloudflared");
const cloudflaredTunnelName = process.env.CLOUDFLARED_TUNNEL || "movieflix";
const telegramLogFile = path.resolve("/tmp", "telegram-bot.log");
const telegramScript = path.resolve(ROOT, "server", "telegram-bot.js");

const clientErrorsLog = path.resolve(ROOT, "client-errors.log");
const embyProxyLog = path.resolve(ROOT, "emby-proxy.log");
const serviceProxyLog = path.resolve(ROOT, "service-proxy.log");
const errorLogFile = path.resolve("/tmp", "movieflix-error.log");
const paymentLogFile = path.resolve("/tmp", "movieflix-payments.log");
const clientErrorFile = path.resolve("/tmp", "movieflix-client.log");
const auditLogFile = path.resolve(ROOT, "audit.log");
const backupDir = path.resolve(ROOT, "backups");
const backupTargets = new Set([
  settingsFile,
  subscriptionsFile,
  plansFile,
  movieRequestsFile,
  mediaRequestsFile,
  unlimitedFile,
  tagsFile,
  userContactsFile,
  registrationsFile,
  userChatsFile,
]);

const PORT = Number(process.env.PORT || 5001);
const POLICY_SYNC_DEBOUNCE_MS = 500;
const MEDIA_REQUEST_SYNC_INTERVAL_MS = 10 * 60 * 1000;
const POLICY_SYNC_INTERVAL_MS = 10 * 1000;
const SAFE_FETCH_TIMEOUT_MS = Number(process.env.SAFE_FETCH_TIMEOUT_MS || 5000);
const MEDIA_REQUEST_RECONCILE_BATCH_SIZE = Number(process.env.MEDIA_REQUEST_RECONCILE_BATCH_SIZE || 10);
const MEDIA_REQUEST_RECONCILE_TIME_BUDGET_MS = Number(process.env.MEDIA_REQUEST_RECONCILE_TIME_BUDGET_MS || 12000);
const MEDIA_REQUEST_WEBHOOK_DEBOUNCE_MS = 2000;
let mediaRequestWebhookTimer = null;

const loadEnv = () => {
  const envPath = path.resolve(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf-8");
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const idx = trimmed.indexOf("=");
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
};

loadEnv();

const readJson = (filePath, fallback) => {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const ensureBackupDir = () => {
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
};

const backupFile = (filePath) => {
  if (!backupTargets.has(filePath)) return;
  try {
    if (!fs.existsSync(filePath)) return;
    ensureBackupDir();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const base = path.basename(filePath);
    const backupPath = path.join(backupDir, `${base}.${stamp}.bak`);
    fs.copyFileSync(filePath, backupPath);
    const backups = fs
      .readdirSync(backupDir)
      .filter((name) => name.startsWith(`${base}.`) && name.endsWith(".bak"))
      .sort()
      .reverse();
    backups.slice(20).forEach((name) => {
      try {
        fs.unlinkSync(path.join(backupDir, name));
      } catch {
        // ignore cleanup errors
      }
    });
  } catch {
    // ignore backup errors
  }
};

const writeJson = (filePath, data) => {
  backupFile(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

const getActor = (req) =>
  String(req?.headers?.["x-admin-user"] || req?.headers?.["x-actor"] || "unknown");

const appendAudit = (action, actor, details = {}) => {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      actor: actor || "unknown",
      action,
      ...details,
    };
    fs.appendFileSync(auditLogFile, `${JSON.stringify(entry)}\n`);
  } catch {
    // ignore audit errors
  }
};

const bootstrapBackups = () => {
  const files = [
    settingsFile,
    subscriptionsFile,
    plansFile,
    movieRequestsFile,
    mediaRequestsFile,
    unlimitedFile,
    tagsFile,
    userContactsFile,
    registrationsFile,
    userChatsFile,
  ];
  files.forEach((filePath) => {
    if (fs.existsSync(filePath)) {
      backupFile(filePath);
    }
  });
};

const sendJson = (res, payload, status = 200) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
};

const getBody = async (req) =>
  await new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", () => resolve(""));
  });

const safeUUID = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const addDays = (isoDate, days) => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString();
};

const parseDataUrl = (value) => {
  const match = String(value || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const data = match[2];
  return { mime, data };
};

const getImageExt = (mime) => {
  if (!mime) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("webp")) return "webp";
  return "jpg";
};

const saveChatAttachment = (dataUrl) => {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  if (!parsed.mime.startsWith("image/")) return null;
  const buffer = Buffer.from(parsed.data, "base64");
  if (!buffer.length) return null;
  const ext = getImageExt(parsed.mime);
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  fs.mkdirSync(chatUploadsDir, { recursive: true });
  const filePath = path.resolve(chatUploadsDir, filename);
  fs.writeFileSync(filePath, buffer);
  return {
    id: filename,
    url: `/api/chat-attachments/${filename}`,
    mime: parsed.mime,
    name: filename,
  };
};

const safeFetch = async (url, options = {}) => {
  const controller = new AbortController();
  const timeoutMs = Number(options?.timeoutMs ?? SAFE_FETCH_TIMEOUT_MS);
  const timer = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  const fetchOptions = { ...options, signal: controller.signal };
  delete fetchOptions.timeoutMs;

  try {
    const response = await fetch(url, fetchOptions);
    const text = await response.text();
    return { ok: response.ok, status: response.status, text, headers: response.headers };
  } catch (err) {
    const message = err?.name === "AbortError" ? "fetch_timeout" : (err?.message || "fetch_failed");
    return { ok: false, status: 0, text: message };
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const sendResendEmail = async ({ to, subject, html, text, settings }) => {
  const apiKey = process.env.RESEND_API_KEY || settings?.resendApiKey;
  if (!apiKey) {
    return { ok: false, status: 0, text: "Resend API key not configured." };
  }
  const from =
    process.env.RESEND_FROM || settings?.resendFrom || "MovieFlix <onboarding@resend.dev>";
  return await safeFetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
    }),
  });
};

const sendLoggedResendEmail = async ({ to, subject, html, text, settings, context }) => {
  const response = await sendResendEmail({ to, subject, html, text, settings });
  if (!response.ok) {
    writeLog(
      errorLogFile,
      `resend_email_failed context=${context || "unknown"} to=${Array.isArray(to) ? to.join(",") : to} status=${response.status} body=${response.text || ""}`.trim()
    );
  }
  return response;
};

const getDashboardBaseUrl = (settings) =>
  String(process.env.PUBLIC_DASHBOARD_URL || settings?.publicDashboardUrl || "https://movieflixhd.cloud").replace(/\/+$/, "");

const normalizeMediaType = (value) =>
  String(value || "").trim().toLowerCase() === "tv" ? "tv" : "movie";

const normalizeTitleToken = (value) =>
  String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();

const titleLooksSame = (a, b) => {
  const left = normalizeTitleToken(a);
  const right = normalizeTitleToken(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return left.includes(right) || right.includes(left);
};

const extractYear = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return NaN;
  const fromDate = new Date(raw);
  if (!Number.isNaN(fromDate.getTime())) return fromDate.getUTCFullYear();
  const m = raw.match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : NaN;
};

const firstIsoDate = (...values) => {
  for (const value of values) {
    const raw = String(value || "").trim();
    if (!raw) continue;
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return "";
};

const toIsoDay = (date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const getNextSonarrEpisodeAirDate = async ({ sonarrBase, sonarrKey, seriesId }) => {
  if (!seriesId) return "";
  const now = Date.now();
  const start = new Date();
  const end = new Date(start.getTime() + 365 * 24 * 60 * 60 * 1000);
  const calendar = await safeFetch(
    `${sonarrBase}/api/v3/calendar?seriesId=${encodeURIComponent(seriesId)}&start=${encodeURIComponent(
      toIsoDay(start)
    )}&end=${encodeURIComponent(toIsoDay(end))}`,
    { headers: { "X-Api-Key": sonarrKey, Accept: "application/json" } }
  );
  if (!calendar.ok) return "";
  try {
    const items = calendar.text ? JSON.parse(calendar.text) : [];
    if (!Array.isArray(items) || items.length === 0) return "";
    const sorted = items
      .map((item) => firstIsoDate(item?.airDateUtc, item?.airDate))
      .filter(Boolean)
      .filter((value) => new Date(value).getTime() >= now)
      .sort((a, b) => new Date(a) - new Date(b));
    return sorted[0] || "";
  } catch {
    return "";
  }
};

const lookupSonarrSeries = async ({ sonarrBase, sonarrKey, record }) => {
  const terms = [];
  if (record?.imdb_id) terms.push(`imdb:${record.imdb_id}`);
  if (record?.tmdb_id) terms.push(`tmdb:${record.tmdb_id}`);
  if (record?.title) terms.push(String(record.title).trim());

  for (const term of terms) {
    if (!term) continue;
    const response = await safeFetch(
      `${sonarrBase}/api/v3/series/lookup?term=${encodeURIComponent(term)}`,
      { headers: { "X-Api-Key": sonarrKey, Accept: "application/json" } }
    );
    if (!response.ok) continue;
    try {
      const list = response.text ? JSON.parse(response.text) : [];
      if (!Array.isArray(list) || list.length === 0) continue;

      if (term === String(record?.title || "").trim()) {
        const targetTitle = String(record?.title || "").trim().toLowerCase();
        const exact =
          list.find((item) => String(item?.title || "").trim().toLowerCase() === targetTitle) ||
          list[0];
        if (exact) return exact;
      }

      return list[0];
    } catch {
      // ignore parse errors
    }
  }

  return null;
};

const summarizeQueueRecords = (records) => {
  const list = Array.isArray(records) ? records : [];
  const activeRecords = list.filter((q) => {
    const percent = Number(q?.percentComplete);
    const size = Number(q?.size || 0);
    const sizeLeft = Number(q?.sizeleft ?? q?.sizeLeft ?? 0);
    const hasRemaining = Number.isFinite(size) && size > 0 && Number.isFinite(sizeLeft) && sizeLeft > 0;
    const percentIncomplete = Number.isFinite(percent) ? percent >= 0 && percent < 100 : false;
    return hasRemaining || percentIncomplete;
  });
  const hasCompletedLike = list.some((q) => {
    const rawStatus = String(q?.status || "").toLowerCase();
    const tracked = String(q?.trackedDownloadState || q?.trackedDownloadStatus || "").toLowerCase();
    return ["completed", "imported"].includes(rawStatus) || ["completed", "imported"].includes(tracked);
  });
  return {
    activeRecords,
    hasCompletedLike,
    hasAny: list.length > 0,
  };
};

const getSeerMediaDetails = async ({ jellyseerrBase, jellyseerrKey, mediaType, mediaId }) => {
  if (!jellyseerrBase || !jellyseerrKey || !mediaId) return null;
  const isTv = normalizeMediaType(mediaType) === "tv";
  const endpoints = isTv
    ? [
        `${jellyseerrBase}/api/v1/tv/${mediaId}`,
        `${jellyseerrBase}/api/v1/movie/${mediaId}`,
      ]
    : [
        `${jellyseerrBase}/api/v1/movie/${mediaId}`,
        `${jellyseerrBase}/api/v1/tv/${mediaId}`,
      ];

  for (const endpoint of endpoints) {
    const response = await safeFetch(endpoint, {
      headers: { "X-Api-Key": jellyseerrKey, Accept: "application/json" },
    });
    if (!response.ok) continue;
    try {
      const parsed = response.text ? JSON.parse(response.text) : null;
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // try next endpoint
    }
  }
  return null;
};


const isSeerMediaAvailable = (details) => {
  if (!details || typeof details !== "object") return false;
  const mediaInfo = details.mediaInfo || details.media || {};
  const statusValue = Number(mediaInfo?.status ?? details?.status ?? NaN);
  if (Number.isFinite(statusValue) && statusValue >= 4) return true;
  const textFlags = [
    String(mediaInfo?.statusText || "").toLowerCase(),
    String(mediaInfo?.downloadStatus || "").toLowerCase(),
    String(details?.status || "").toLowerCase(),
  ];
  if (textFlags.some((value) => ["available", "partially available", "partially_available", "downloaded"].includes(value))) {
    return true;
  }
  if (mediaInfo?.hasFile === true || details?.hasFile === true) return true;
  return false;
};


const isEmbyMediaAvailableByTmdb = async ({
  embyUrl,
  embyApiKey,
  mediaType,
  tmdbId,
  tvdbId,
  imdbId,
}) => {
  if (!embyUrl || !embyApiKey) return false;
  const base = String(embyUrl).replace(/\/+$/, "");
  const type = normalizeMediaType(mediaType) === "tv" ? "Series" : "Movie";
  const key = encodeURIComponent(String(embyApiKey));

  const providerPairs = [];
  if (tmdbId) providerPairs.push(["Tmdb", String(tmdbId)]);
  if (tvdbId) providerPairs.push(["Tvdb", String(tvdbId)]);
  if (imdbId) providerPairs.push(["Imdb", String(imdbId).replace(/^tt/i, "")]);

  for (const [providerKey, providerValue] of providerPairs) {
    const provider = encodeURIComponent(`${providerKey}.${providerValue}`);
    const providerCandidates = [
      `${base}/Items?Recursive=true&IncludeItemTypes=${type}&AnyProviderIdEquals=${provider}&api_key=${key}`,
      `${base}/Items?Recursive=true&AnyProviderIdEquals=${provider}&api_key=${key}`,
    ];

    for (const url of providerCandidates) {
      const resp = await safeFetch(url, { headers: { Accept: "application/json" } });
      if (!resp.ok) continue;
      try {
        const parsed = resp.text ? JSON.parse(resp.text) : null;
        const total = Number(parsed?.TotalRecordCount ?? 0);
        const items = Array.isArray(parsed?.Items) ? parsed.Items : [];
        if (total > 0 || items.length > 0) return true;
      } catch {
        // ignore parse errors and keep trying
      }
    }
  }

  return false;
};


const resolveMediaRequestEmail = (record) => {
  const requestedByUsername = normalizeEmail(record?.requested_by_username || record?.requestedByUsername || "");
  if (requestedByUsername && requestedByUsername.includes("@")) return requestedByUsername;

  const requestedBy = String(record?.requested_by || record?.requestedBy || "").trim();
  const contacts = normalizeUserContacts(readJson(userContactsFile, {}));
  const contactCandidates = [
    String(requestedBy || "").toLowerCase(),
    normalizeEmail(requestedBy),
    normalizeEmail(requestedByUsername),
  ].filter(Boolean);
  for (const key of contactCandidates) {
    const email = normalizeEmail(contacts[key]?.email);
    if (email) return email;
  }
  const registrations = readJson(registrationsFile, []);
  const subscriptions = readJson(subscriptionsFile, []);

  const registrationMatch = registrations.find((item) => {
    const email = normalizeEmail(item?.email);
    const embyUserId = String(item?.embyUserId || "").trim();
    return (
      (requestedBy && embyUserId && embyUserId === requestedBy) ||
      (requestedByUsername && email === requestedByUsername) ||
      (requestedBy && normalizeEmail(item?.email) === normalizeEmail(requestedBy))
    );
  });
  if (registrationMatch?.email) return normalizeEmail(registrationMatch.email);

  const subscriptionMatch = subscriptions.find((item) => {
    const email = normalizeEmail(item?.email);
    const userId = String(item?.userId || item?.userKey || "").trim();
    const username = normalizeEmail(item?.username || "");
    return (
      (requestedBy && userId && userId === requestedBy) ||
      (requestedByUsername && username === requestedByUsername) ||
      (requestedByUsername && email === requestedByUsername) ||
      (requestedBy && email === normalizeEmail(requestedBy))
    );
  });
  return subscriptionMatch?.email ? normalizeEmail(subscriptionMatch.email) : "";
};

const resolveConversationIdentity = (payload = {}) => {
  const requestedUserId = String(payload?.userId || "").trim();
  const requestedUsername = normalizeEmail(payload?.username || "");
  const contacts = normalizeUserContacts(readJson(userContactsFile, {}));
  const registrations = readJson(registrationsFile, []);
  const subscriptions = readJson(subscriptionsFile, []);

  const registrationMatch = registrations.find((item) => {
    const email = normalizeEmail(item?.email);
    const embyUserId = String(item?.embyUserId || "").trim();
    return (
      (requestedUserId && embyUserId && embyUserId === requestedUserId) ||
      (requestedUsername && email === requestedUsername) ||
      (requestedUsername && normalizeEmail(item?.username) === requestedUsername)
    );
  });

  const subscriptionMatch = subscriptions.find((item) => {
    const userId = String(item?.userId || item?.userKey || "").trim();
    const username = normalizeEmail(item?.username || "");
    const email = normalizeEmail(item?.email || "");
    return (
      (requestedUserId && userId && userId === requestedUserId) ||
      (requestedUsername && username === requestedUsername) ||
      (requestedUsername && email === requestedUsername)
    );
  });

  const contactCandidates = [
    requestedUserId.toLowerCase(),
    requestedUsername,
    normalizeEmail(registrationMatch?.email),
    normalizeEmail(subscriptionMatch?.email),
  ].filter(Boolean);
  let contactEmail = "";
  let contactPhone = "";
  for (const key of contactCandidates) {
    const entry = contacts[key];
    if (!entry) continue;
    contactEmail = contactEmail || normalizeEmail(entry?.email);
    contactPhone = contactPhone || String(entry?.phone || "").trim();
  }

  return {
    userId: requestedUserId || String(registrationMatch?.embyUserId || subscriptionMatch?.userId || subscriptionMatch?.userKey || "").trim(),
    username:
      requestedUsername ||
      normalizeEmail(registrationMatch?.email) ||
      normalizeEmail(subscriptionMatch?.username) ||
      normalizeEmail(subscriptionMatch?.email),
    displayName:
      String(payload?.displayName || "").trim() ||
      String(registrationMatch?.name || "").trim() ||
      String(subscriptionMatch?.name || "").trim() ||
      "",
    email:
      normalizeEmail(payload?.email) ||
      normalizeEmail(registrationMatch?.email) ||
      normalizeEmail(subscriptionMatch?.email) ||
      contactEmail,
    phone:
      String(payload?.phone || "").trim() ||
      String(registrationMatch?.phone || "").trim() ||
      String(subscriptionMatch?.phone || "").trim() ||
      contactPhone,
  };
};

const getMediaRequestPosterUrl = (record, settings) => {
  const posterUrl = String(record?.poster_url || record?.posterUrl || "").trim();
  if (posterUrl) return posterUrl;
  const posterPath = String(record?.poster_path || record?.posterPath || "").trim();
  if (!posterPath) return "";
  return `${getDashboardBaseUrl(settings)}/api/seer/api/v1/image?path=${encodeURIComponent(posterPath)}`;
};

const notifyMediaRequestAvailable = async ({ record, settings }) => {
  const email = resolveMediaRequestEmail(record);
  if (!email) {
    return { ok: false, skipped: true, reason: "email_not_found" };
  }
  const title = String(record?.title || record?.media_title || "your requested title").trim();
  const posterUrl = getMediaRequestPosterUrl(record, settings);
  const subject = `${title} is now ready to stream on MovieFlix`;
  const text = `Good news.

Your requested ${String(record?.media_type || "movie").toLowerCase() === "tv" ? "show" : "movie"} "${title}" is now available for streaming on MovieFlix.

Enjoy.

MovieFlix Team`;
  const posterHtml = posterUrl
    ? `<p style="margin:0 0 16px;"><img src="${escapeHtml(posterUrl)}" alt="${escapeHtml(title)} poster" style="display:block;max-width:260px;width:100%;height:auto;border-radius:14px;" /></p>`
    : "";
  const html = `${posterHtml}<p>Good news.</p><p>Your requested ${String(record?.media_type || "movie").toLowerCase() === "tv" ? "show" : "movie"} <strong>${escapeHtml(title)}</strong> is now available for streaming on MovieFlix.</p><p>Enjoy.</p><p>MovieFlix Team</p>`;
  return await sendLoggedResendEmail({
    to: email,
    subject,
    html,
    text,
    settings,
    context: "media_request_available",
  });
};

const markMediaRequestAvailable = async ({ record, settings }) => {
  const next = {
    ...record,
    status: "available",
    download_progress: 100,
    available_at: "",
    release_status: "",
    updated_at: new Date().toISOString(),
  };
  if (!record?.availableEmailSentAt) {
    const emailResp = await notifyMediaRequestAvailable({ record: next, settings });
    if (emailResp.ok) {
      next.availableEmailSentAt = new Date().toISOString();
    }
  }
  return next;
};

let mediaRequestReconcilePromise = null;
let mediaRequestLastReconciledAt = 0;
let mediaRequestReconcileCursor = 0;

const reconcileMediaRequests = async ({ full = false } = {}) => {
  if (mediaRequestReconcilePromise) return await mediaRequestReconcilePromise;

  mediaRequestReconcilePromise = (async () => {
  const records = readJson(mediaRequestsFile, []);
  const settings = loadSettings();
  const jellyseerrUrl = getSeerUrl(settings);
  const jellyseerrKey = getSeerApiKey(settings);
  const embyUrl = getSetting(settings, "embyUrl", "EMBY_URL");
  const embyApiKey = getSetting(settings, "apiKey", "EMBY_API_KEY");
  const radarrUrl = getSetting(settings, "radarrUrl", "RADARR_URL");
  const radarrKey = getSetting(settings, "radarrApiKey", "RADARR_API_KEY");
  const sonarrUrl = getSetting(settings, "sonarrUrl", "SONARR_URL");
  const sonarrKey = getSetting(settings, "sonarrApiKey", "SONARR_API_KEY");

  let updated = 0;
  const results = [];
  const actionableStatuses = new Set(["pending", "approved", "downloading"]);
  const candidates = records.filter((record) => {
    const status = String(record?.status || "").toLowerCase();
    if (actionableStatuses.has(status)) return true;
    if (status === "available" && !record?.availableEmailSentAt) return true;
    return false;
  });

  let recordsToReconcile = candidates;
  const batchSize = Math.max(1, Number(MEDIA_REQUEST_RECONCILE_BATCH_SIZE) || 10);
  if (!full && candidates.length > batchSize) {
    const start = mediaRequestReconcileCursor % candidates.length;
    recordsToReconcile = [];
    for (let i = 0; i < batchSize; i += 1) {
      recordsToReconcile.push(candidates[(start + i) % candidates.length]);
    }
    mediaRequestReconcileCursor = (start + batchSize) % candidates.length;
  } else {
    mediaRequestReconcileCursor = 0;
  }

  const reconcileStartedAt = Date.now();

  for (const record of recordsToReconcile) {
    if (!full && Date.now() - reconcileStartedAt > MEDIA_REQUEST_RECONCILE_TIME_BUDGET_MS) {
      break;
    }
    const mediaType = normalizeMediaType(record?.media_type);
    const currentStatus = String(record?.status || "").toLowerCase();
    const previousAvailableAt = String(record?.available_at || "");
    const previousReleaseStatus = String(record?.release_status || "");
    let nextStatus = currentStatus === "downloading" ? "approved" : record.status;
    let nextProgress = String(record?.status || "").toLowerCase() === "available" ? 100 : null;
    let nextAvailableAt = previousAvailableAt;
    let nextReleaseStatus = previousReleaseStatus;
    let seerDetails = null;
    const jellyseerrBase = jellyseerrUrl ? jellyseerrUrl.replace(/\/+$/, "") : "";
    const currentTime = Date.now();
    const previousAvailableAtTime = previousAvailableAt ? new Date(previousAvailableAt).getTime() : NaN;

    // Upcoming dates are sourced from Seer. If a saved upcoming date is already in the past,
    // clear it first so stale values do not survive future reconciliations.
    if (
      String(nextStatus || "").toLowerCase() !== "available" &&
      previousAvailableAt &&
      !Number.isNaN(previousAvailableAtTime) &&
      previousAvailableAtTime <= currentTime
    ) {
      nextAvailableAt = "";
      if (String(nextReleaseStatus || "").toLowerCase() === "upcoming") {
        nextReleaseStatus = "";
      }
    }

    if (record?.tmdb_id && jellyseerrBase && jellyseerrKey && String(nextStatus || "").toLowerCase() !== "available") {
      const details = await getSeerMediaDetails({
        jellyseerrBase,
        jellyseerrKey,
        mediaType,
        mediaId: record.tmdb_id,
      });
      seerDetails = details;
      if (isSeerMediaAvailable(details)) {
        nextStatus = "available";
        nextProgress = 100;
        nextAvailableAt = "";
        nextReleaseStatus = "";
      }
      if (String(nextStatus || "").toLowerCase() !== "available") {
        const jellyDate =
          mediaType === "tv"
            ? firstIsoDate(
                details?.nextEpisodeToAir?.airDate,
                details?.nextEpisodeToAir?.airDateUtc,
                details?.firstAirDate
              )
            : firstIsoDate(details?.releaseDate);
        if (jellyDate && new Date(jellyDate).getTime() > currentTime) {
          nextAvailableAt = jellyDate;
          nextReleaseStatus = "upcoming";
        } else {
          nextAvailableAt = "";
          if (String(nextReleaseStatus || "").toLowerCase() === "upcoming") {
            nextReleaseStatus = "";
          }
        }
      }

      if (String(nextStatus || "").toLowerCase() !== "available") {
        const embyAvailable = await isEmbyMediaAvailableByTmdb({
          embyUrl,
          embyApiKey,
          mediaType,
          tmdbId: record?.tmdb_id,
          tvdbId: record?.tvdb_id || details?.mediaInfo?.tvdbId || details?.tvdbId || details?.externalIds?.tvdbId,
          imdbId: record?.imdb_id || details?.imdbId || details?.externalIds?.imdbId,
        });
        if (embyAvailable) {
          nextStatus = "available";
          nextProgress = 100;
          nextAvailableAt = "";
          nextReleaseStatus = "";
        }
      }
    }

    if (record?.jellyseerr_request_id && jellyseerrUrl && jellyseerrKey && String(nextStatus || "").toLowerCase() !== "available") {
      const base = jellyseerrUrl.replace(/\/+$/, "");
      const response = await safeFetch(`${base}/api/v1/request/${record.jellyseerr_request_id}`, {
        headers: { "X-Api-Key": jellyseerrKey },
      });
      if (response.ok) {
        try {
          const data = response.text ? JSON.parse(response.text) : null;
          const rawStatus = String(data?.status || "").toLowerCase();
          if (rawStatus === "available") {
            const canMarkAvailable = !record?.tmdb_id || isSeerMediaAvailable(seerDetails);
            if (canMarkAvailable) {
              nextStatus = "available";
            }
          } else if (rawStatus === "approved" && String(nextStatus || "").toLowerCase() !== "available") {
            nextStatus = "approved";
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    if (
      mediaType === "tv" &&
      sonarrUrl &&
      sonarrKey &&
      String(nextStatus || "").toLowerCase() !== "available"
    ) {
      const sonarrBase = sonarrUrl.replace(/\/+$/, "");
      const show = await lookupSonarrSeries({ sonarrBase, sonarrKey, record });
      if (show?.statistics?.episodeFileCount > 0) {
        nextProgress = 100;
      } else if (show?.id) {
        const queue = await safeFetch(
          `${sonarrBase}/api/v3/queue?seriesId=${show.id}&page=1&pageSize=20`,
          { headers: { "X-Api-Key": sonarrKey, Accept: "application/json" } }
        );
        if (queue.ok) {
          try {
            const queueData = queue.text ? JSON.parse(queue.text) : null;
            const queueRecords = Array.isArray(queueData?.records) ? queueData.records : [];
            const { activeRecords: activeQueueRecords, hasCompletedLike } = summarizeQueueRecords(queueRecords);
            if (activeQueueRecords.length > 0) {
              nextStatus = "downloading";
              const percents = activeQueueRecords
                .map((q) => {
                  const p = Number(q?.percentComplete);
                  return Number.isFinite(p) ? p : null;
                })
                .filter((p) => p !== null);
              if (percents.length > 0) {
                nextProgress = Math.max(0, Math.min(100, Math.round(percents.reduce((a, b) => a + b, 0) / percents.length)));
              } else {
                const total = activeQueueRecords.reduce((sum, q) => sum + (q.size || 0), 0);
                const downloaded = activeQueueRecords.reduce(
                  (sum, q) => sum + ((q.size || 0) - (q.sizeleft || 0)),
                  0
                );
                nextProgress = total > 0 ? Math.max(0, Math.min(100, Math.round((downloaded / total) * 100))) : null;
              }
            } else if (hasCompletedLike) {
              nextProgress = 100;
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    }

    if (
      mediaType === "movie" &&
      radarrUrl &&
      radarrKey &&
      record?.tmdb_id &&
      String(nextStatus || "").toLowerCase() !== "available"
    ) {
      const radarrBase = radarrUrl.replace(/\/+$/, "");
      const movieLookup = await safeFetch(`${radarrBase}/api/v3/movie?tmdbId=${record.tmdb_id}`, {
        headers: { "X-Api-Key": radarrKey, Accept: "application/json" },
      });
      if (movieLookup.ok) {
        try {
          const list = movieLookup.text ? JSON.parse(movieLookup.text) : [];
          const movie = Array.isArray(list) ? list[0] : null;
          if (movie?.hasFile) {
            nextProgress = 100;
          } else if (movie?.id) {
            const queue = await safeFetch(
              `${radarrBase}/api/v3/queue?movieId=${movie.id}&page=1&pageSize=20`,
              { headers: { "X-Api-Key": radarrKey, Accept: "application/json" } }
            );
            if (queue.ok) {
              const queueData = queue.text ? JSON.parse(queue.text) : null;
              const queueRecords = queueData?.records || [];
              const { activeRecords: activeQueueRecords, hasCompletedLike } = summarizeQueueRecords(queueRecords);
              if (activeQueueRecords.length > 0) {
                nextStatus = "downloading";
                const percents = activeQueueRecords
                  .map((q) => {
                    const p = Number(q?.percentComplete);
                    return Number.isFinite(p) ? p : null;
                  })
                  .filter((p) => p !== null);
                if (percents.length > 0) {
                  nextProgress = Math.max(0, Math.min(100, Math.round(percents.reduce((a, b) => a + b, 0) / percents.length)));
                } else {
                  const total = activeQueueRecords.reduce((sum, q) => sum + (q.size || 0), 0);
                  const downloaded = activeQueueRecords.reduce(
                    (sum, q) => sum + ((q.size || 0) - (q.sizeleft || 0)),
                    0
                  );
                  nextProgress = total > 0 ? Math.max(0, Math.min(100, Math.round((downloaded / total) * 100))) : null;
                }
              } else if (hasCompletedLike) {
                nextProgress = 100;
              }
            }
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    if (String(nextStatus || "").toLowerCase() === "downloading") {
      if (typeof nextProgress !== "number" || !Number.isFinite(nextProgress) || nextProgress < 0) {
        nextProgress = null;
      } else {
        nextProgress = Math.max(0, Math.min(100, Math.round(nextProgress)));
      }
    } else if (String(nextStatus || "").toLowerCase() === "available") {
      nextProgress = 100;
    } else if (String(nextStatus || "").toLowerCase() === "approved") {
      nextProgress = 0;
    } else {
      nextProgress = null;
    }

    const needsAvailabilityEmail =
      String(nextStatus || "").toLowerCase() === "available" && !record.availableEmailSentAt;
    const statusChanged = nextStatus !== record.status;
    const progressChanged = nextProgress !== record.download_progress;
    const availableAtChanged = nextAvailableAt !== previousAvailableAt;
    const releaseStatusChanged = nextReleaseStatus !== previousReleaseStatus;

    if (needsAvailabilityEmail) {
      Object.assign(
        record,
        await markMediaRequestAvailable({
          record: {
            ...record,
            status: nextStatus,
            available_at: nextAvailableAt,
            release_status: nextReleaseStatus,
          },
          settings,
        })
      );
    } else if (statusChanged || progressChanged || availableAtChanged || releaseStatusChanged) {
      record.status = nextStatus;
      record.download_progress = nextProgress;
      record.available_at = nextAvailableAt;
      record.release_status = nextReleaseStatus;
      record.updated_at = new Date().toISOString();
    }

    if (
      statusChanged ||
      progressChanged ||
      availableAtChanged ||
      releaseStatusChanged ||
      needsAvailabilityEmail
    ) {
      updated += 1;
      results.push({
        id: record.id,
        status: record.status,
        progress: record.download_progress ?? null,
        previousStatus: currentStatus,
        availableAt: record.available_at || "",
        releaseStatus: record.release_status || "",
      });
    }
  }

  if (updated > 0) {
    writeJson(mediaRequestsFile, records);
  }

  return { ok: true, updated, results };
  })();

  try {
    const result = await mediaRequestReconcilePromise;
    mediaRequestLastReconciledAt = Date.now();
    return result;
  } finally {
    mediaRequestReconcilePromise = null;
  }
};

const getTelegramAdminIds = (settings) => {
  const raw = String(settings?.telegramAdminIds || "");
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sendTelegramMessage = async (token, chatId, text, replyMarkup) =>
  await safeFetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });

const notifyTelegramAdmins = async (settings, text, replyMarkup) => {
  const token = String(settings?.telegramBotToken || "");
  const admins = getTelegramAdminIds(settings);
  if (!token || admins.length === 0 || !text) return;
  try {
    await Promise.all(
      admins.map((chatId) => sendTelegramMessage(token, chatId, text, replyMarkup))
    );
  } catch {
    // ignore telegram notification errors
  }
};

const notifyTelegramRegistration = async ({ settings, record, subRecord, userId }) => {
  const token = String(settings?.telegramBotToken || "");
  const admins = getTelegramAdminIds(settings);
  if (!token || admins.length === 0) return { ok: false, skipped: true };
  const text = [
    "<b>New Registration Approved</b>",
    `Name: ${escapeHtml(record?.name || "-")}`,
    `Email: ${escapeHtml(record?.email || "-")}`,
    `Phone: ${escapeHtml(record?.phone || "-")}`,
    `Emby ID: ${escapeHtml(userId || record?.embyUserId || "-")}`,
    `Trial: ${escapeHtml(subRecord?.planName || "Auto Trial")}`,
    `Start: ${escapeHtml(subRecord?.startDate || "-")}`,
    `End: ${escapeHtml(subRecord?.endDate || "-")}`,
  ].join("\n");
  const results = await Promise.all(
    admins.map((chatId) => sendTelegramMessage(token, chatId, text))
  );
  return { ok: results.some((res) => res.ok), results };
};

const findEmbyUserByName = async ({ base, apiKey, username }) => {
  if (!base || !apiKey || !username) return null;
  const url = `${base}/Users?api_key=${encodeURIComponent(apiKey)}`;
  const resp = await safeFetch(url, {
    headers: { "X-Emby-Token": apiKey, "accept-encoding": "identity" },
  });
  if (!resp.ok) return null;
  try {
    const users = JSON.parse(resp.text || "[]");
    return users.find(
      (user) => String(user?.Name || "").toLowerCase() === String(username).toLowerCase()
    );
  } catch {
    return null;
  }
};

const createEmbyUser = async ({ base, apiKey, username, password }) => {
  if (!base || !apiKey) {
    return { ok: false, error: "Emby URL or API key not set." };
  }
  const existing = await findEmbyUserByName({ base, apiKey, username });
  if (existing?.Id) {
    return { ok: false, error: "User already exists. Please reset password." };
  }

  const createUrl = `${base}/Users/New?api_key=${encodeURIComponent(apiKey)}`;
  const createResp = await safeFetch(createUrl, {
    method: "POST",
    headers: {
      "X-Emby-Token": apiKey,
      "Content-Type": "application/json",
      "accept-encoding": "identity",
    },
    body: JSON.stringify({ Name: username }),
  });
  if (!createResp.ok) {
    return { ok: false, error: createResp.text || "Failed to create Emby user." };
  }
  let created;
  try {
    created = JSON.parse(createResp.text || "{}");
  } catch {
    created = {};
  }
  const userId = created?.Id || created?.id;
  if (!userId) {
    return { ok: false, error: "Emby user created but ID missing." };
  }

  const passwordUrl = `${base}/Users/${userId}/Password?api_key=${encodeURIComponent(apiKey)}`;
  const passResp = await safeFetch(passwordUrl, {
    method: "POST",
    headers: {
      "X-Emby-Token": apiKey,
      "Content-Type": "application/json",
      "accept-encoding": "identity",
    },
    body: JSON.stringify({ CurrentPw: null, NewPw: password }),
  });
  if (!passResp.ok) {
    return { ok: false, error: passResp.text || "Failed to set Emby password." };
  }
  return { ok: true, id: userId };
};

const resetEmbyPasswordForUsername = async ({ base, apiKey, username, password }) => {
  if (!base || !apiKey || !username) {
    return { ok: false, error: "Emby URL or API key not set." };
  }
  const existing = await findEmbyUserByName({ base, apiKey, username });
  const userId = existing?.Id || existing?.id;
  if (!userId) {
    return { ok: false, error: "Emby user not found." };
  }
  const passwordUrl = `${base}/Users/${userId}/Password?api_key=${encodeURIComponent(apiKey)}`;
  const passResp = await safeFetch(passwordUrl, {
    method: "POST",
    headers: {
      "X-Emby-Token": apiKey,
      "Content-Type": "application/json",
      "accept-encoding": "identity",
    },
    body: JSON.stringify({ CurrentPw: null, NewPw: password }),
  });
  if (!passResp.ok) {
    return { ok: false, error: passResp.text || "Failed to reset Emby password." };
  }
  return { ok: true, id: userId };
};

const applyEmbyAccessPolicy = async ({ base, apiKey, userId, enablePlayback }) => {
  if (!base || !apiKey || !userId) {
    return { ok: false, error: "Missing Emby settings or user id." };
  }
  const headers = { "X-Emby-Token": apiKey };
  const userResp = await safeFetch(
    `${base}/Users/${encodeURIComponent(userId)}?api_key=${encodeURIComponent(apiKey)}`,
    { headers }
  );
  if (!userResp.ok) {
    return { ok: false, error: userResp.text || "Failed to fetch Emby user." };
  }
  let user = {};
  try {
    user = userResp.text ? JSON.parse(userResp.text) : {};
  } catch {
    user = {};
  }
  const currentPolicy = user?.Policy || {};

  const libsResp = await safeFetch(
    `${base}/Library/SelectableMediaFolders?api_key=${encodeURIComponent(apiKey)}`,
    { headers }
  );
  if (!libsResp.ok) {
    return { ok: false, error: libsResp.text || "Failed to load Emby libraries." };
  }
  let libs = [];
  try {
    libs = libsResp.text ? JSON.parse(libsResp.text) : [];
  } catch {
    libs = [];
  }
  const allGuids = (Array.isArray(libs) ? libs : [])
    .map((item) => item?.Guid || item?.Id || "")
    .filter(Boolean);
  const subscription = (Array.isArray(libs) ? libs : []).find(
    (item) => String(item?.Name || "").trim().toLowerCase().includes("subscription")
  );
  const subscriptionGuid = subscription?.Guid || subscription?.Id || "";
  const targetFolders = enablePlayback
    ? subscriptionGuid
      ? allGuids.filter((guid) => guid !== subscriptionGuid)
      : allGuids
    : subscriptionGuid
      ? [subscriptionGuid]
      : [];
  const targetPolicy = {
    ...currentPolicy,
    EnableMediaPlayback: Boolean(enablePlayback),
    EnableAllFolders: false,
    EnabledFolders: targetFolders,
    EnableAllChannels: Boolean(enablePlayback),
    EnabledChannels: [],
  };

  const normalize = (value) =>
    (Array.isArray(value) ? value : []).map(String).filter(Boolean).sort().join("|");
  const noChange =
    Boolean(currentPolicy.EnableMediaPlayback) === Boolean(targetPolicy.EnableMediaPlayback) &&
    Boolean(currentPolicy.EnableAllFolders) === Boolean(targetPolicy.EnableAllFolders) &&
    Boolean(currentPolicy.EnableAllChannels) === Boolean(targetPolicy.EnableAllChannels) &&
    normalize(currentPolicy.EnabledFolders) === normalize(targetPolicy.EnabledFolders) &&
    normalize(currentPolicy.EnabledChannels) === normalize(targetPolicy.EnabledChannels);
  if (noChange) return { ok: true, skipped: true };

  const policyUrl = `${base}/Users/${encodeURIComponent(userId)}/Policy?api_key=${encodeURIComponent(apiKey)}`;
  let updateResp = await safeFetch(policyUrl, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(targetPolicy),
  });
  if (!updateResp.ok) {
    updateResp = await safeFetch(policyUrl, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(targetPolicy),
    });
  }
  if (!updateResp.ok) {
    return { ok: false, error: updateResp.text || "Failed to update Emby user policy." };
  }
  return { ok: true };
};

const finalizeRegistrationApproval = async ({ record, settings, registrations, nowIso }) => {
  const { base: embyBase, apiKey: embyApiKey } = getEmbyAdminSettings(settings);
  if (!embyBase || !embyApiKey) {
    return { ok: false, error: "Emby settings missing." };
  }
  const password = generatePassword();
  const embyCreate = await createEmbyUser({
    base: embyBase,
    apiKey: embyApiKey,
    username: record.email,
    password,
  });
  if (!embyCreate.ok) {
    return { ok: false, error: embyCreate.error || "Emby create failed." };
  }

  const smsResp = await sendLoggedMsgOwlSms({
    to: record.phone,
    text: `Your MovieFlix account is ready.\n\nUsername: ${record.email}\nPassword: ${password}\n\nLog in to the dashboard and follow the instructions to get started.`,
    settings,
    context: "registration_approved",
  });
  if (!smsResp.ok) {
    return { ok: false, error: smsResp.text || "Failed to send credentials SMS." };
  }

  const emailResp = await sendLoggedResendEmail({
    to: record.email,
    subject: "MovieFlix account approved",
    text: `Your MovieFlix account is ready.\n\nUsername: ${record.email}\nPassword: ${password}\n\nLog in to the dashboard and follow the instructions to get started.`,
    html: `<p>Your MovieFlix account is ready.</p><p><strong>Username:</strong> ${record.email}<br/><strong>Password:</strong> ${password}</p><p>Log in to the dashboard and follow the instructions to get started.</p>`,
    settings,
    context: "registration_approved",
  });

  record.status = "approved";
  record.approvedAt = nowIso;
  record.embyUserId = embyCreate.id || record.embyUserId || "";
  record.credentialsSmsSentAt = nowIso;
  record.credentialsEmailSentAt = emailResp.ok ? nowIso : "";
  record.credentialsEmailError = emailResp.ok ? "" : emailResp.text || "Failed to send credentials email.";

  const subs = readJson(subscriptionsFile, []);
  const start = new Date();
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  const subRecord = {
    id: `reg-${record.id}`,
    username: record.email,
    email: record.email,
    phone: record.phone || "",
    name: record.name,
    userId: embyCreate.id || record.embyUserId || "",
    status: "approved",
    planName: "Auto Trial",
    price: 0,
    isTrial: true,
    submittedAt: nowIso,
    approvedAt: nowIso,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    source: "registration",
  };
  subs.push(subRecord);
  writeJson(subscriptionsFile, subs);
  const accessResp = await applyEmbyAccessPolicy({
    base: embyBase,
    apiKey: embyApiKey,
    userId: embyCreate.id || record.embyUserId || "",
    enablePlayback: true,
  });
  if (!accessResp.ok) {
    writeLog(errorLogFile, `registration_access_policy_failed ${record.email} ${accessResp.error || "unknown_error"}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const delayedAccessResp = await applyEmbyAccessPolicy({
    base: embyBase,
    apiKey: embyApiKey,
    userId: embyCreate.id || record.embyUserId || "",
    enablePlayback: true,
  });
  if (!delayedAccessResp.ok) {
    writeLog(
      errorLogFile,
      `registration_access_policy_retry_failed ${record.email} ${delayedAccessResp.error || "unknown_error"}`
    );
  }
  appendAudit("registrations.approve", "auto", { email: record.email });
  try {
    await notifyTelegramRegistration({
      settings,
      record,
      subRecord,
      userId: embyCreate.id || record.embyUserId || "",
    });
  } catch {
    // ignore telegram notification errors
  }
  return { ok: true, password, userId: embyCreate.id || record.embyUserId || "" };
};

const extractPublicBase = (text) => {
  if (!text) return "";
  const match = text.match(/public base URL of\s+([^\s]+)/i);
  if (!match) return "";
  const raw = match[1].replace(/['"]/g, "");
  if (!raw) return "";
  const normalized = raw.startsWith("/") ? raw : `/${raw}`;
  return normalized.replace(/\/+$/, "");
};

const loadSettings = () => readJson(settingsFile, {});
const getSetting = (settings, key, envKey) => process.env[envKey] || settings?.[key] || "";

const getSeerUrl = (settings) =>
  process.env.SEER_URL ||
  settings?.seerUrl ||
  getSetting(settings, "jellyseerrUrl", "JELLYSEERR_URL");

const getSeerApiKey = (settings) =>
  process.env.SEER_API_KEY ||
  settings?.seerApiKey ||
  getSetting(settings, "jellyseerrApiKey", "JELLYSEERR_API_KEY");

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const allowedEmailDomains = new Set(["gmail.com"]);
const isAllowedEmail = (email) => {
  const parts = normalizeEmail(email).split("@");
  if (parts.length !== 2) return false;
  const domain = parts[1];
  if (!domain || !allowedEmailDomains.has(domain)) return false;
  return true;
};

const normalizePhone = (value) => {
  const raw = String(value || "").trim().replace(/\s+/g, "");
  if (!raw) return "";
  if (raw.startsWith("+")) return raw;
  if (/^\d+$/.test(raw)) return `+${raw}`;
  return raw;
};

const isAllowedPhone = (value) => {
  const phone = normalizePhone(value);
  return /^\+960\d{7}$/.test(phone);
};

const normalizeUserContacts = (value) => {
  if (!value || typeof value !== "object") return {};
  const next = {};
  Object.entries(value).forEach(([key, entry]) => {
    const contactKey = String(key || "").trim().toLowerCase();
    if (!contactKey || !entry || typeof entry !== "object") return;
    const email = normalizeEmail(entry.email);
    const phone = normalizePhone(entry.phone);
    if (!email && !phone) return;
    next[contactKey] = {
      email,
      phone,
      updatedAt: entry.updatedAt || new Date().toISOString(),
    };
  });
  return next;
};

const resolveEmailByPhone = ({ phone, registrations = [], subscriptions = [], userContacts = {} }) => {
  const targetPhone = normalizePhone(phone);
  if (!targetPhone) return "";

  const contactMatch = Object.values(userContacts || {}).find(
    (entry) => normalizePhone(entry?.phone) === targetPhone && normalizeEmail(entry?.email)
  );
  if (contactMatch?.email) return normalizeEmail(contactMatch.email);

  const approvedRecords = (registrations || [])
    .filter(
      (item) =>
        String(item?.status || "").toLowerCase() === "approved" &&
        normalizePhone(item?.phone) === targetPhone &&
        normalizeEmail(item?.email)
    )
    .sort((a, b) =>
      String(b?.approvedAt || b?.requestedAt || "").localeCompare(String(a?.approvedAt || a?.requestedAt || ""))
    );
  if (approvedRecords[0]?.email) return normalizeEmail(approvedRecords[0].email);

  const subscriptionMatch = (subscriptions || [])
    .filter((item) => normalizePhone(item?.phone) === targetPhone && normalizeEmail(item?.email))
    .sort((a, b) =>
      String(b?.createdAt || b?.submittedAt || "").localeCompare(String(a?.createdAt || a?.submittedAt || ""))
    )[0];
  if (subscriptionMatch?.email) return normalizeEmail(subscriptionMatch.email);

  return "";
};

const hashOtp = (value) =>
  crypto.createHash("sha256").update(String(value || "")).digest("hex");

const generateOtp = () => {
  const code = Math.floor(100000 + Math.random() * 900000);
  return String(code);
};

const generatePassword = (length = 6) => {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits;
  const pick = (set) => set[crypto.randomInt(0, set.length)];
  const chars = [pick(upper), pick(lower), pick(digits)];
  while (chars.length < length) {
    chars.push(pick(all));
  }
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
};

const isStrongPassword = (value) => {
  const pwd = String(value || "");
  if (pwd.length < 6) return false;
  return /[a-z]/.test(pwd) && /[A-Z]/.test(pwd) && /\d/.test(pwd);
};

const normalizeBaseUrl = (value) => String(value || "").replace(/\/+$/, "");

const getEmbyAdminSettings = (settings) => {
  const base = normalizeBaseUrl(settings?.embyUrl || process.env.EMBY_URL || "");
  const apiKey = settings?.apiKey || process.env.EMBY_API_KEY || "";
  return { base, apiKey };
};

const getTwilioSettings = (settings) => ({
  sid: settings?.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID || "",
  token: settings?.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN || "",
  verifySid: settings?.twilioVerifySid || process.env.TWILIO_VERIFY_SID || "",
  blockVoip: Boolean(settings?.twilioBlockVoip) || process.env.TWILIO_BLOCK_VOIP === "true",
});

const getRegistrationVerificationMode = (settings) => {
  const raw = String(settings?.registrationVerificationMode || "both").trim().toLowerCase();
  if (raw === "email" || raw === "sms" || raw === "both") return raw;
  return "both";
};

const getMsgOwlSettings = (settings) => ({
  apiKey: String(settings?.msgowlApiKey || process.env.MSGOWL_API_KEY || "").trim(),
  otpApiKey: String(
    settings?.msgowlOtpApiKey ||
      settings?.msgowlApiKey ||
      process.env.MSGOWL_OTP_API_KEY ||
      process.env.MSGOWL_API_KEY ||
      ""
  ).trim(),
  otpBaseUrl: String(settings?.msgowlOtpBaseUrl || process.env.MSGOWL_OTP_BASE_URL || "https://otp.msgowl.com")
    .trim()
    .replace(/\/+$/, ""),
  sender: String(settings?.msgowlSender || process.env.MSGOWL_SENDER || "MovieFlix").trim(),
});

const normalizePhoneForSms = (value) => String(value || "").replace(/[^\d]/g, "");

const getRegistrationOtpRequirements = (record, settings) => {
  if (record && typeof record.requiresEmailOtp === "boolean" && typeof record.requiresSmsOtp === "boolean") {
    return {
      requireEmailOtp: Boolean(record.requiresEmailOtp),
      requireSmsOtp: Boolean(record.requiresSmsOtp),
    };
  }
  const verificationMode = getRegistrationVerificationMode(settings);
  return {
    requireEmailOtp: verificationMode === "email" || verificationMode === "both",
    requireSmsOtp: verificationMode === "sms" || verificationMode === "both",
  };
};

const msgOwlRequest = async ({ url, apiKey, body }) =>
  await safeFetch(url, {
    method: "POST",
    headers: {
      Authorization: `AccessKey ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "accept-encoding": "identity",
    },
    body: JSON.stringify(body),
  });

const sendMsgOwlSms = async ({ to, text, settings }) => {
  const msgOwl = getMsgOwlSettings(settings);
  if (!msgOwl.apiKey) {
    return { ok: false, status: 0, text: "MsgOwl REST API key not configured." };
  }
  if (!msgOwl.sender) {
    return { ok: false, status: 0, text: "MsgOwl sender not configured." };
  }
  return await safeFetch("https://rest.msgowl.com/messages", {
    method: "POST",
    headers: {
      Authorization: `AccessKey ${msgOwl.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "accept-encoding": "identity",
    },
    body: JSON.stringify({
      sender_id: msgOwl.sender,
      recipients: normalizePhoneForSms(to),
      body: text,
    }),
  });
};

const sendLoggedMsgOwlSms = async ({ to, text, settings, context }) => {
  const response = await sendMsgOwlSms({ to, text, settings });
  if (!response.ok) {
    writeLog(
      errorLogFile,
      `msgowl_sms_failed context=${context || "unknown"} to=${to} status=${response.status} body=${response.text || ""}`.trim()
    );
  }
  return response;
};

const twilioRequest = async ({ url, sid, token, body }) => {
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  return await safeFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
};

const twilioLookup = async ({ phone, sid, token }) => {
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(
    phone
  )}?Fields=line_type_intelligence`;
  return await safeFetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      "accept-encoding": "identity",
    },
  });
};

const writeLog = (filePath, line) => {
  try {
    fs.appendFileSync(filePath, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // ignore log errors
  }
};

const logRequestError = (req, err) => {
  const method = req?.method || "-";
  const url = req?.url || "-";
  const message =
    err && typeof err === "object"
      ? `${err.message || ""} ${err.stack || ""}`.trim()
      : String(err || "Unknown request error");
  writeLog(errorLogFile, `request_error ${method} ${url} ${message}`.trim());
};

const logServerError = (label, err) => {
  const message =
    err && typeof err === "object"
      ? `${label} ${err.message || ""} ${err.stack || ""}`.trim()
      : `${label} ${String(err)}`;
  writeLog(errorLogFile, message);
};

const logPaymentEvent = (label, payload = {}) => {
  try {
    writeLog(paymentLogFile, `${label} ${JSON.stringify(payload)}`);
  } catch {
    // ignore log errors
  }
};

process.on("uncaughtException", (err) => {
  logServerError("uncaughtException", err);
});

process.on("unhandledRejection", (err) => {
  logServerError("unhandledRejection", err);
});

const ensureSlipDir = () => {
  if (!fs.existsSync(slipsDir)) fs.mkdirSync(slipsDir, { recursive: true });
};

const loadSlipIndex = () => readJson(slipsIndexFile, {});
const saveSlipIndex = (index) => writeJson(slipsIndexFile, index);
const loadTelegramState = () => readJson(telegramStateFile, {});
const saveTelegramState = (state) => writeJson(telegramStateFile, state);

const getSlipExt = (mime) => {
  if (!mime) return "bin";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("gif")) return "gif";
  return "bin";
};

const buildPaymentResultText = (sub, statusLabel, approvedBy) => {
  const amount = sub?.finalAmount !== undefined && sub?.finalAmount !== null ? sub.finalAmount : sub?.price;
  return `${statusLabel}\n` +
    `Date: ${String(sub?.approvedAt || sub?.reviewedAt || sub?.submittedAt || "").slice(0, 10)}\n` +
    `User: ${sub?.username || sub?.userId || "Unknown"}\n` +
    `Plan: ${sub?.planName || "-"}\n` +
    `Amount: ${sub?.currency || ""} ${amount || 0}\n` +
    `Approved by: ${approvedBy || "dashboard"}`;
};

const formatTelegramDate = (value) => {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
};

const editTelegramMessage = async (token, msg, text, replyMarkup = { inline_keyboard: [] }) => {
  if (!msg?.chatId || !msg?.messageId) return;
  const payload = {
    chat_id: msg.chatId,
    message_id: msg.messageId,
    reply_markup: replyMarkup,
  };
  const method = msg.hasPhoto ? "editMessageCaption" : "editMessageText";
  const body = msg.hasPhoto ? { ...payload, caption: text, parse_mode: "HTML" } : { ...payload, text, parse_mode: "HTML" };
  try {
    await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // ignore telegram errors
  }
};

const buildActionLockedMarkup = (label) => ({
  inline_keyboard: [[{ text: label, callback_data: "noop" }]],
});

const updateTelegramPaymentStatus = async (sub, statusLabel) => {
  const settings = loadSettings();
  const token = String(settings?.telegramBotToken || "").trim();
  if (!token || !sub?.id) return;
  const state = loadTelegramState();
  const paymentMessages = state?.paymentMessages || {};
  const messages = paymentMessages[sub.id];
  if (!Array.isArray(messages) || messages.length === 0) return;
  const text = buildPaymentResultText(sub, statusLabel, "dashboard");
  for (const msg of messages) {
    await editTelegramMessage(token, msg, text);
  }
  delete paymentMessages[sub.id];
  state.paymentMessages = paymentMessages;
  saveTelegramState(state);
};

const buildMediaResultText = (request, statusLabel, actorLabel) => {
  const title = request?.title || request?.media_title || "Untitled";
  const type = String(request?.media_type || "movie").toUpperCase();
  const requestedBy =
    request?.requested_by_username || request?.requestedByUsername || request?.requested_by || "-";
  const date = formatTelegramDate(
    request?.updated_at || request?.updatedAt || request?.requested_at || request?.created_at
  );
  const rootFolder = request?.root_folder || request?.rootFolder || "-";
  return (
    `${statusLabel}\n\n` +
    `Date: ${date}\n` +
    `Title: ${title}\n` +
    `Type: ${type}\n` +
    `Requested by: ${requestedBy}\n` +
    `Approved by: ${actorLabel || "dashboard"}\n` +
    `Root folder: ${rootFolder}`
  );
};

const updateTelegramMediaStatus = async (request, statusLabel, actorLabel, buttonLabel) => {
  const settings = loadSettings();
  const token = String(settings?.telegramBotToken || "").trim();
  if (!token || !request?.id) return;
  const state = loadTelegramState();
  const mediaMessages = state?.mediaMessages || {};
  const messages = mediaMessages[request.id];
  if (!Array.isArray(messages) || messages.length === 0) return;
  const text = buildMediaResultText(request, statusLabel, actorLabel);
  const markup = buildActionLockedMarkup(buttonLabel || statusLabel.replace(/<[^>]*>/g, "").trim());
  for (const msg of messages) {
    await editTelegramMessage(token, msg, text, markup);
  }
  delete mediaMessages[request.id];
  state.mediaMessages = mediaMessages;
  saveTelegramState(state);
};

const storeSlipForSub = (sub, index) => {
  const parsed = parseDataUrl(sub?.slipData);
  if (!parsed) return sub;
  ensureSlipDir();
  const slipId = sub.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const ext = getSlipExt(parsed.mime);
  const filePath = path.resolve(slipsDir, `${slipId}.${ext}`);
  try {
    fs.writeFileSync(filePath, Buffer.from(parsed.data, "base64"));
    index[slipId] = {
      id: slipId,
      path: filePath,
      mime: parsed.mime,
      name: sub.slipName || `slip-${slipId}.${ext}`,
    };
  } catch (err) {
    logServerError("storeSlip", err);
  }
  const { slipData, ...rest } = sub || {};
  return {
    ...rest,
    id: slipId,
    slipUrl: `/api/slips/${slipId}`,
  };
};

const migrateSlips = (subs) => {
  const index = loadSlipIndex();
  let changed = false;
  const next = (subs || []).map((sub) => {
    if (sub?.slipData) {
      changed = true;
      return storeSlipForSub(sub, index);
    }
    return sub;
  });
  if (changed) {
    saveSlipIndex(index);
  }
  return { next, changed };
};

const isProcessRunning = (pid) => {
  if (!pid || Number.isNaN(Number(pid))) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
};

const readProcessList = () => {
  const bins = ["/bin/ps", "/usr/bin/ps", "ps"];
  for (const bin of bins) {
    try {
      const output = execFileSync(bin, ["-ef"], { encoding: "utf-8" });
      if (output) return output.split("\n");
    } catch {
      // try next
    }
  }
  return [];
};

const isProcessMatching = (pattern) => {
  const needle = String(pattern || "");
  if (!needle) return false;
  if (process.platform === "linux" && fs.existsSync("/proc")) {
    try {
      const entries = fs.readdirSync("/proc");
      for (const entry of entries) {
        if (!/^\d+$/.test(entry)) continue;
        try {
          const cmdline = fs.readFileSync(`/proc/${entry}/cmdline`, "utf-8");
          const text = cmdline.replace(/\0/g, " ").trim();
          if (text.includes(needle)) return true;
        } catch {
          // ignore per-process read errors
        }
      }
    } catch {
      // ignore /proc scan errors
    }
  }
  const pgrepBins = ["/usr/bin/pgrep", "/bin/pgrep", "pgrep"];
  for (const bin of pgrepBins) {
    try {
      const output = execFileSync(bin, ["-f", needle], { encoding: "utf-8" }).trim();
      if (output) return true;
    } catch {
      // ignore and try next
    }
  }
  const lines = readProcessList();
  if (lines.length) return lines.some((line) => line.includes(needle));
  return false;
};

const ensurePidDir = () => {
  const dir = path.resolve(ROOT, ".pids");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const isTelegramBotRunning = () => {
  if (fs.existsSync(telegramPidFile)) {
    try {
      const pid = Number(fs.readFileSync(telegramPidFile, "utf-8").trim());
      if (isProcessRunning(pid)) return true;
    } catch {
      // ignore pid read errors
    }
  }
  if (fs.existsSync(telegramLockFile)) {
    try {
      const stat = fs.statSync(telegramLockFile);
      const ageMs = Date.now() - stat.mtimeMs;
      return ageMs < 10 * 60 * 1000;
    } catch {
      // ignore stat errors
    }
  }
  return (
    isProcessMatching("telegram-bot.js") ||
    isProcessMatching("server/telegram-bot.js")
  );
};

const isCloudflaredRunning = () => {
  if (fs.existsSync(cloudflaredPidFile)) {
    try {
      const pid = Number(fs.readFileSync(cloudflaredPidFile, "utf-8").trim());
      if (isProcessRunning(pid)) return true;
    } catch {
      // ignore
    }
  }
  if (fs.existsSync(cloudflaredLockFile)) {
    try {
      const stat = fs.statSync(cloudflaredLockFile);
      const ageMs = Date.now() - stat.mtimeMs;
      return ageMs < 10 * 60 * 1000;
    } catch {
      // ignore
    }
  }
  const lines = readProcessList();
  if (lines.length) {
    return lines.some(
      (line) =>
        line.includes("cloudflared") &&
        line.includes("tunnel") &&
        line.includes("run")
    );
  }
  return isProcessMatching("cloudflared") || isProcessMatching("cloudflared tunnel run");
};

const isUnlimitedUser = (user, unlimitedList) => {
  const name = String(user?.Name || user?.name || "").toLowerCase();
  const userId = user?.Id || user?.id || "";
  return (unlimitedList || []).some(
    (item) =>
      item?.key === userId ||
      (item?.userId && item.userId === userId) ||
      (item?.username || "").toLowerCase() === name
  );
};

const getUserSubscriptionStatus = (subs, user) => {
  const userId = user?.Id || user?.id || "";
  const nameKey = String(user?.Name || user?.name || "").toLowerCase();
  const matching = (subs || []).filter((sub) => {
    const subUserId = sub?.userId || sub?.userKey || "";
    const subName = String(sub?.username || "").toLowerCase();
    return (userId && subUserId === userId) || (nameKey && subName === nameKey);
  });

  if (matching.length === 0) return { status: "expired" };

  const latest = matching
    .filter((sub) => sub?.endDate)
    .sort(
      (a, b) =>
        new Date(b.endDate || b.submittedAt || 0) -
        new Date(a.endDate || a.submittedAt || 0)
    )[0];

  if (!latest?.endDate) return { status: "expired" };

  const end = new Date(latest.endDate);
  if (Number.isNaN(end.getTime())) return { status: "expired" };
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const now = new Date();
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return endUtc >= nowUtc ? { status: "active" } : { status: "expired" };
};

const syncPlaybackLibraries = async () => {
  const settings = loadSettings();
  const embyUrl = settings?.embyUrl;
  const apiKey = settings?.apiKey;
  if (!embyUrl || !apiKey) return;

  const base = embyUrl.replace(/\/+$/, "");
  const headers = { "X-Emby-Token": apiKey };

  const libsRes = await safeFetch(
    `${base}/Library/SelectableMediaFolders?api_key=${apiKey}`,
    { headers }
  );
  if (!libsRes.ok) {
    writeLog(embyProxyLog, `policy-sync libs failed ${libsRes.status}`);
    return;
  }
  let libs = [];
  try {
    libs = libsRes.text ? JSON.parse(libsRes.text) : [];
  } catch {
    libs = [];
  }
  const allGuids = (Array.isArray(libs) ? libs : [])
    .map((item) => item?.Guid || item?.Id || "")
    .filter(Boolean);
  const kidsGuids = (Array.isArray(libs) ? libs : [])
    .filter((item) => {
      const name = String(item?.Name || "").trim().toLowerCase();
      return name === "anime series" || name === "cartoons";
    })
    .map((item) => item?.Guid || item?.Id || "")
    .filter(Boolean);
  const subscription = (Array.isArray(libs) ? libs : []).find(
    (item) => String(item?.Name || "").trim().toLowerCase() === "subscription"
  );
  const subscriptionGuid = subscription?.Guid || subscription?.Id || null;

  const usersRes = await safeFetch(`${base}/Users?api_key=${apiKey}`, { headers });
  if (!usersRes.ok) {
    writeLog(embyProxyLog, `policy-sync users failed ${usersRes.status}`);
    return;
  }
  let users = [];
  try {
    users = usersRes.text ? JSON.parse(usersRes.text) : [];
  } catch {
    users = [];
  }

  const currentIds = new Set(
    (users || []).map((user) => user?.Id || user?.id || "").filter(Boolean)
  );
  const currentNames = new Set(
    (users || [])
      .map((user) => String(user?.Name || user?.name || "").toLowerCase())
      .filter(Boolean)
  );

  const subscriptions = readJson(subscriptionsFile, []);
  const unlimitedUsers = readJson(unlimitedFile, []);
  const userTags = readJson(tagsFile, {});
  const movieRequests = readJson(movieRequestsFile, []);

  const pruneByUsers = () => {
    let changed = false;

    const nextSubs = (subscriptions || []).filter((sub) => {
      const key = sub?.userId || sub?.userKey || "";
      const name = String(sub?.username || "").toLowerCase();
      if (key && !currentIds.has(key)) return false;
      if (!key && name && !currentNames.has(name)) return false;
      return true;
    });
    if (nextSubs.length !== (subscriptions || []).length) {
      writeJson(subscriptionsFile, nextSubs);
      changed = true;
    }

    const nextUnlimited = (unlimitedUsers || []).filter((item) => {
      const key = item?.userId || item?.key || "";
      const name = String(item?.username || "").toLowerCase();
      if (key && !currentIds.has(key)) return false;
      if (!item?.userId && name && !currentNames.has(name)) return false;
      return true;
    });
    if (nextUnlimited.length !== (unlimitedUsers || []).length) {
      writeJson(unlimitedFile, nextUnlimited);
      changed = true;
    }

    if (userTags && typeof userTags === "object") {
      const nextTags = { ...userTags };
      let tagsChanged = false;
      Object.keys(nextTags).forEach((key) => {
        const lower = key.toLowerCase();
        const isId = currentIds.has(key);
        const isName = currentNames.has(lower);
        if (!isId && !isName) {
          delete nextTags[key];
          tagsChanged = true;
        }
      });
      if (tagsChanged) {
        writeJson(tagsFile, nextTags);
        changed = true;
      }
    }

    const nextRequests = (movieRequests || []).filter((req) => {
      const name = String(req?.requestedBy || "").toLowerCase();
      if (name && !currentNames.has(name)) return false;
      return true;
    });
    if (nextRequests.length !== (movieRequests || []).length) {
      writeJson(movieRequestsFile, nextRequests);
      changed = true;
    }

    if (changed) {
      writeLog(embyProxyLog, "policy-sync pruned deleted users from dashboard data");
    }
  };

  pruneByUsers();

  const normalizeList = (value) =>
    (Array.isArray(value) ? value : []).map(String).filter(Boolean).sort();
  const hasParentalRating = (policy) => {
    if (!policy) return false;
    const candidates = [
      policy.MaxParentalRating,
      policy.MaxAllowedRating,
      policy.MaxAllowedContentRating,
    ];
    return candidates.some((value) => value !== null && value !== undefined);
  };

  let updated = 0;
  const configuredAdmins = new Set(
    (Array.isArray(settings?.adminUsernames)
      ? settings.adminUsernames
      : String(settings?.adminUsernames || "").split(","))
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const envAdmin = String(process.env.EMBY_ADMIN_USERNAME || "").trim().toLowerCase();
  if (envAdmin) configuredAdmins.add(envAdmin);
  const disableAutoTrial = Boolean(settings?.disableAutoTrial);
  const nowIso = new Date().toISOString();
  const addHours = (iso, hours) => {
    const base = new Date(iso);
    if (Number.isNaN(base.getTime())) return iso;
    base.setUTCHours(base.getUTCHours() + hours);
    return base.toISOString();
  };
  const subscriptionsByUser = new Map();
  (subscriptions || []).forEach((sub) => {
    const key = sub?.userId || sub?.userKey || "";
    if (!key) return;
    const time = new Date(sub.endDate || sub.submittedAt || 0).getTime();
    const existing = subscriptionsByUser.get(key);
    if (!existing || time >= existing.time) {
      subscriptionsByUser.set(key, { sub, time });
    }
  });
  const hasAnySubscription = (userId, username) => {
    const nameKey = String(username || "").toLowerCase();
    return (subscriptions || []).some((sub) => {
      const key = sub?.userId || sub?.userKey || "";
      const name = String(sub?.username || "").toLowerCase();
      return (userId && key === userId) || (nameKey && name === nameKey);
    });
  };
  for (const user of users) {
    const userId = user?.Id || user?.id;
    const policy = user?.Policy || {};
    if (!userId) continue;

    if (!disableAutoTrial && !isUnlimitedUser(user, unlimitedUsers)) {
      const username = user?.Name || user?.name || "";
      if (hasAnySubscription(userId, username)) {
        // Never touch existing users' subscription history.
      } else {
      const latest = subscriptionsByUser.get(userId)?.sub;
      const hasApproved = latest?.status === "approved" || latest?.status === "active";
      if (!hasApproved) {
        const trial = {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          userKey: userId,
          userId,
          username: user?.Name || user?.name || "Unknown",
          planId: "auto-trial-7d",
          planName: "Auto Trial",
          durationDays: 7,
          price: 0,
          currency: "MVR",
          status: "approved",
          submittedAt: nowIso,
          startDate: nowIso,
          endDate: addHours(nowIso, 24 * 7),
          source: "auto",
        };
        subscriptions.push(trial);
        subscriptionsByUser.set(userId, {
          sub: trial,
          time: new Date(trial.endDate).getTime(),
        });
        writeJson(subscriptionsFile, subscriptions);
      }
      }
    }

    const status = getUserSubscriptionStatus(subscriptions, user);
    const unlimited = isUnlimitedUser(user, unlimitedUsers);
    const normalizedUsername = String(user?.Name || user?.name || "").trim().toLowerCase();
    const isConfiguredAdmin = normalizedUsername ? configuredAdmins.has(normalizedUsername) : false;
    const isAdmin =
      user?.Policy?.IsAdministrator === true ||
      user?.Configuration?.IsAdministrator === true ||
      isConfiguredAdmin;
    const isKids = hasParentalRating(policy);
    const shouldEnableLibraries = unlimited || isAdmin || status.status === "active";
    const targetPlayback = shouldEnableLibraries;

    let target = {};
    if (isKids && kidsGuids.length > 0) {
      target = {
        EnableAllFolders: false,
        EnabledFolders: kidsGuids,
        EnableAllChannels: false,
        EnabledChannels: [],
      };
    } else if (shouldEnableLibraries) {
      target = {
        EnableAllFolders: false,
        EnabledFolders: subscriptionGuid
          ? allGuids.filter((guid) => guid !== subscriptionGuid)
        : allGuids,
        EnableAllChannels: true,
        EnabledChannels: [],
      };
    } else {
      target = {
        EnableAllFolders: false,
        EnabledFolders: subscriptionGuid ? [subscriptionGuid] : [],
        EnableAllChannels: false,
        EnabledChannels: [],
      };
    }

    const needsUpdate =
      Boolean(policy.EnableAllFolders) !== Boolean(target.EnableAllFolders) ||
      Boolean(policy.EnableAllChannels) !== Boolean(target.EnableAllChannels) ||
      normalizeList(policy.EnabledFolders).join("|") !==
        normalizeList(target.EnabledFolders).join("|") ||
      normalizeList(policy.EnabledChannels).join("|") !==
        normalizeList(target.EnabledChannels).join("|") ||
      Boolean(policy.EnableMediaPlayback) !== Boolean(targetPlayback);

    if (!needsUpdate) continue;

    const nextPolicy = { ...policy, ...target, EnableMediaPlayback: targetPlayback };
    const policyUrl = `${base}/Users/${userId}/Policy?api_key=${apiKey}`;
    let resp = await safeFetch(policyUrl, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(nextPolicy),
    });
    if (!resp.ok) {
      resp = await safeFetch(policyUrl, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(nextPolicy),
      });
    }
    if (resp.ok) updated += 1;
  }

  if (updated > 0) {
    writeLog(embyProxyLog, `policy-sync updated=${updated}`);
  }
  return updated;
};

const handleSettings = async (req, res) => {
  if (req.method === "GET") {
    sendJson(res, readJson(settingsFile, {}));
    return true;
  }
  if (req.method === "POST") {
    const body = await getBody(req);
    let data = {};
    try {
      data = body ? JSON.parse(body) : {};
    } catch {
      data = {};
    }
    writeJson(settingsFile, data);
    appendAudit("settings.update", getActor(req));
    sendJson(res, { ok: true });
    return true;
  }
  return false;
};

const handleEmbyGuideImages = async (req, res, url) => {
  const pathname = url?.pathname || "";
  const subPath = pathname.replace(/^\/api\/emby-guide-images\/?/, "");
  const slot = Number(subPath.split("/").filter(Boolean)[0]);
  if (!Number.isFinite(slot) || slot < 1) {
    sendJson(res, { ok: false, error: "Invalid image slot." }, 400);
    return true;
  }
  if (req.method !== "POST") return false;
  const body = await getBody(req);
  let payload = {};
  try {
    payload = body ? JSON.parse(body) : {};
  } catch {
    payload = {};
  }
  const dataUrl = payload?.dataUrl || "";
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    sendJson(res, { ok: false, error: "Invalid image data." }, 400);
    return true;
  }
  if (!["image/png", "image/jpeg", "image/jpg", "image/gif"].includes(parsed.mime)) {
    sendJson(res, { ok: false, error: "Only PNG, JPG, or GIF allowed." }, 400);
    return true;
  }
  const buffer = Buffer.from(parsed.data, "base64");
  if (buffer.length > 3 * 1024 * 1024) {
    sendJson(res, { ok: false, error: "Image too large (max 3MB)." }, 400);
    return true;
  }
  const ext =
    parsed.mime.includes("png") ? "png" :
    parsed.mime.includes("gif") ? "gif" : "jpg";
  const filename = `${slot}.${ext}`;
  const uploadPath = path.resolve(embyGuideUploadsDir, filename);
  const publicPath = path.resolve(embyGuideDir.public, filename);
  const distPath = path.resolve(embyGuideDir.dist, filename);
  try {
    fs.mkdirSync(embyGuideUploadsDir, { recursive: true });
    fs.mkdirSync(embyGuideDir.public, { recursive: true });
    fs.mkdirSync(embyGuideDir.dist, { recursive: true });
    fs.writeFileSync(uploadPath, buffer);
    fs.writeFileSync(publicPath, buffer);
    fs.writeFileSync(distPath, buffer);
  } catch {
    sendJson(res, { ok: false, error: "Failed to save image." }, 500);
    return true;
  }
  appendAudit("emby-guide.upload", getActor(req), { slot });
  sendJson(res, { ok: true, url: `/emby-guide/${filename}` });
  return true;
};

const handleRegistrations = async (req, res, url) => {
  const pathname = url?.pathname || "";
  const subPath = pathname.replace(/^\/api\/registrations\/?/, "");
  const parts = subPath ? subPath.split("/").filter(Boolean) : [];

  const loadRegistrations = () => readJson(registrationsFile, []);
  const saveRegistrations = (data) => writeJson(registrationsFile, data);
  const sanitizeList = (items) =>
    (items || []).map((item) => {
      const { otpHash, otpExpiresAt, ...rest } = item || {};
      return rest;
    });

  if (req.method === "GET" && parts.length === 0) {
    const data = loadRegistrations();
    sendJson(res, sanitizeList(data));
    return true;
  }

  if (req.method !== "POST") return false;

  const body = await getBody(req);
  let payload = {};
  try {
    payload = body ? JSON.parse(body) : {};
  } catch {
    payload = {};
  }

  const email = normalizeEmail(payload.email);
  const phone = normalizePhone(payload.phone);
  const name = String(payload.name || "").trim();
  const nowIso = new Date().toISOString();
  const registrations = loadRegistrations();
  const settings = loadSettings();
  const verificationMode = getRegistrationVerificationMode(settings);
  const defaultOtpRequirements = getRegistrationOtpRequirements(null, settings);
  const requireEmailOtp = defaultOtpRequirements.requireEmailOtp;
  const requireSmsOtp = defaultOtpRequirements.requireSmsOtp;
  const msgOwlSettings = getMsgOwlSettings(settings);
  const twilioSettings = getTwilioSettings(settings);
  const userContacts = normalizeUserContacts(readJson(userContactsFile, {}));
  const subscriptions = readJson(subscriptionsFile, []);

  const isSuccessfulRegistration = (item) => String(item?.status || "").toLowerCase() === "approved";
  const emailInRegistrations = registrations.some(
    (item) => normalizeEmail(item?.email) === email && isSuccessfulRegistration(item)
  );
  const phoneInRegistrations = registrations.some(
    (item) => normalizePhone(item?.phone) === phone && isSuccessfulRegistration(item)
  );
  const contactEntries = Object.values(userContacts);
  const emailInContacts = contactEntries.some((item) => normalizeEmail(item?.email) === email);
  const phoneInContacts = contactEntries.some((item) => normalizePhone(item?.phone) === phone);

  if (parts[0] === "otp") {
    if (!name) {
      sendJson(res, { ok: false, error: "Name is required." }, 400);
      return true;
    }
    if (!phone || !isAllowedPhone(phone)) {
      sendJson(res, { ok: false, error: "Enter a valid Maldives phone number." }, 400);
      return true;
    }

    if (!email || !isAllowedEmail(email)) {
      sendJson(res, { ok: false, error: "Use a gmail.com email." }, 400);
      return true;
    }
    const { base: embyBase, apiKey: embyApiKey } = getEmbyAdminSettings(settings);
    if (embyBase && embyApiKey) {
      const existingEmbyUser = await findEmbyUserByName({
        base: embyBase,
        apiKey: embyApiKey,
        username: email,
      });
      if (existingEmbyUser?.Id) {
        sendJson(
          res,
          { ok: false, error: "User already exists. Please go to Forgot Password and reset it." },
          400
        );
        return true;
      }
    }

    const existingByPhone = registrations.find(
      (item) => normalizePhone(item?.phone) === phone && !isSuccessfulRegistration(item)
    );
    if ((existingByPhone && normalizeEmail(existingByPhone?.email) !== email) || phoneInRegistrations || phoneInContacts) {
      sendJson(
        res,
        { ok: false, error: "An account already exists for this number. Please go to Forgot Password and reset it." },
        400
      );
      return true;
    }
    const existing = registrations.find(
      (item) => normalizeEmail(item?.email) === email && !isSuccessfulRegistration(item)
    );
    if (emailInRegistrations || emailInContacts) {
      sendJson(res, { ok: false, error: "Email already used." }, 400);
      return true;
    }
    if (existing && existing.status === "otp_sent") {
      const otp = requireEmailOtp ? generateOtp() : "";
      existing.otpHash = requireEmailOtp ? hashOtp(otp) : "";
      existing.otpExpiresAt = requireEmailOtp ? Date.now() + 10 * 60 * 1000 : 0;
      existing.requestedAt = nowIso;
      existing.name = name || existing.name;
      existing.email = email || existing.email;
      existing.phone = phone || existing.phone;
      existing.smsOtpVerifiedAt = "";
      existing.smsOtpSentAt = "";
      existing.smsOtpRequestId = "";
      existing.verifiedAt = "";
      saveRegistrations(registrations);
      if (requireEmailOtp) {
        const resp = await sendResendEmail({
          to: email,
          subject: "MovieFlix verification code",
          text: `Your MovieFlix verification code is ${otp}. It expires in 10 minutes.`,
          html: `<p>Your MovieFlix verification code is <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
          settings,
        });
        if (!resp.ok) {
          sendJson(res, { ok: false, error: "Failed to send email." }, 500);
          return true;
        }
      }
      if (requireSmsOtp) {
        if (!msgOwlSettings.otpApiKey || !msgOwlSettings.otpBaseUrl) {
          sendJson(res, { ok: false, error: "MsgOwl settings missing." }, 400);
          return true;
        }
        const smsResp = await msgOwlRequest({
          url: `${msgOwlSettings.otpBaseUrl}/send`,
          apiKey: msgOwlSettings.otpApiKey,
          body: { phone_number: normalizePhoneForSms(existing.phone) },
        });
        if (!smsResp.ok) {
          sendJson(res, { ok: false, error: smsResp.text || "Failed to send SMS code." }, 500);
          return true;
        }
        let smsData = {};
        try {
          smsData = smsResp.text ? JSON.parse(smsResp.text) : {};
        } catch {
          smsData = {};
        }
        existing.smsOtpRequestId =
          smsData?.request_id || smsData?.requestId || smsData?.id || existing.smsOtpRequestId || "";
        existing.smsOtpSentAt = nowIso;
        saveRegistrations(registrations);
      }
      sendJson(res, {
        ok: true,
        resent: true,
        verificationMode,
        requiresEmailOtp: requireEmailOtp,
        requiresSmsOtp: requireSmsOtp,
      });
      return true;
    }

    for (let i = registrations.length - 1; i >= 0; i -= 1) {
      const item = registrations[i];
      if (isSuccessfulRegistration(item)) continue;
      const sameEmail = normalizeEmail(item?.email) === email;
      const samePhone = normalizePhone(item?.phone) === phone;
      if (sameEmail || samePhone) {
        registrations.splice(i, 1);
      }
    }

    const otp = generateOtp();
    const record = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name,
      email,
      phone,
      status: "otp_sent",
      requestedAt: nowIso,
      otpHash: requireEmailOtp ? hashOtp(otp) : "",
      otpExpiresAt: requireEmailOtp ? Date.now() + 10 * 60 * 1000 : 0,
      smsOtpRequestId: "",
      smsOtpSentAt: "",
      smsOtpVerifiedAt: "",
    };
    registrations.push(record);
    saveRegistrations(registrations);
    if (requireEmailOtp) {
      const resp = await sendResendEmail({
        to: email,
        subject: "MovieFlix verification code",
        text: `Your MovieFlix verification code is ${otp}. It expires in 10 minutes.`,
        html: `<p>Your MovieFlix verification code is <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
        settings,
      });
      if (!resp.ok) {
        sendJson(res, { ok: false, error: "Failed to send email." }, 500);
        return true;
      }
    }
    if (requireSmsOtp) {
      if (!msgOwlSettings.otpApiKey || !msgOwlSettings.otpBaseUrl) {
        sendJson(res, { ok: false, error: "MsgOwl settings missing." }, 400);
        return true;
      }
      const smsResp = await msgOwlRequest({
        url: `${msgOwlSettings.otpBaseUrl}/send`,
        apiKey: msgOwlSettings.otpApiKey,
        body: { phone_number: normalizePhoneForSms(phone) },
      });
      if (!smsResp.ok) {
        sendJson(res, { ok: false, error: smsResp.text || "Failed to send SMS code." }, 500);
        return true;
      }
      try {
        const smsData = smsResp.text ? JSON.parse(smsResp.text) : {};
        record.smsOtpRequestId = smsData?.request_id || smsData?.requestId || smsData?.id || "";
      } catch {
        record.smsOtpRequestId = "";
      }
      record.smsOtpSentAt = nowIso;
      saveRegistrations(registrations);
    }
    appendAudit("registrations.otp", getActor(req), { email });
    sendJson(res, {
      ok: true,
      verificationMode,
      requiresEmailOtp: requireEmailOtp,
      requiresSmsOtp: requireSmsOtp,
    });
    return true;
  }

  if (parts[0] === "forgot-otp") {
    if (!phone) {
      sendJson(res, { ok: false, error: "Phone required." }, 400);
      return true;
    }
    const record = registrations.find(
      (item) =>
        normalizePhone(item?.phone) === phone &&
        item?.status === "approved"
    );
    if (!record) {
      sendJson(res, { ok: false, error: "No user found with this phone number." }, 404);
      return true;
    }
    const targetEmail =
      resolveEmailByPhone({ phone, registrations, subscriptions, userContacts }) || normalizeEmail(record.email);
    if (!targetEmail) {
      sendJson(res, { ok: false, error: "No registered email found for this number." }, 404);
      return true;
    }
    const otp = generateOtp();
    record.forgotOtpHash = hashOtp(otp);
    record.forgotOtpExpiresAt = Date.now() + 10 * 60 * 1000;
    record.forgotRequestedAt = nowIso;
    record.forgotOtpEmail = targetEmail;
    saveRegistrations(registrations);
    const resp = await sendResendEmail({
      to: targetEmail,
      subject: "MovieFlix password reset code",
      text: `Your MovieFlix password reset code is ${otp}. It expires in 10 minutes.`,
      html: `<p>Your MovieFlix password reset code is <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
      settings,
    });
    if (!resp.ok) {
      sendJson(res, { ok: false, error: "Failed to send reset OTP." }, 500);
      return true;
    }
    appendAudit("registrations.forgot_otp", getActor(req), { phone, email: targetEmail });
    sendJson(res, { ok: true });
    return true;
  }

  if (parts[0] === "forgot-reset") {
    const otp = String(payload.otp || "").trim();
    if (!phone || !otp) {
      sendJson(res, { ok: false, error: "Phone and OTP required." }, 400);
      return true;
    }
    const record = registrations.find(
      (item) =>
        normalizePhone(item?.phone) === phone &&
        item?.status === "approved"
    );
    if (!record) {
      sendJson(res, { ok: false, error: "No user found with this phone number." }, 404);
      return true;
    }
    const targetEmail =
      normalizeEmail(record.forgotOtpEmail) ||
      resolveEmailByPhone({ phone, registrations, subscriptions, userContacts }) ||
      normalizeEmail(record.email);
    if (!targetEmail) {
      sendJson(res, { ok: false, error: "No registered email found for this number." }, 404);
      return true;
    }
    if (!record.forgotOtpHash || record.forgotOtpExpiresAt < Date.now()) {
      sendJson(res, { ok: false, error: "OTP expired. Request again." }, 400);
      return true;
    }
    if (hashOtp(otp) !== record.forgotOtpHash) {
      sendJson(res, { ok: false, error: "Invalid OTP." }, 400);
      return true;
    }
    const { base: embyBase, apiKey: embyApiKey } = getEmbyAdminSettings(settings);
    if (!embyBase || !embyApiKey) {
      sendJson(res, { ok: false, error: "Emby settings missing." }, 400);
      return true;
    }
    const newPassword = generatePassword();
    const reset = await resetEmbyPasswordForUsername({
      base: embyBase,
      apiKey: embyApiKey,
      username: targetEmail,
      password: newPassword,
    });
    let recreated = false;
    let embyUserId = reset.id || "";
    if (!reset.ok && String(reset.error || "") === "Emby user not found.") {
      const created = await createEmbyUser({
        base: embyBase,
        apiKey: embyApiKey,
        username: targetEmail,
        password: newPassword,
      });
      if (!created.ok) {
        sendJson(res, { ok: false, error: created.error || "Failed to recreate account." }, 500);
        return true;
      }
      recreated = true;
      embyUserId = created.id || "";
    } else if (!reset.ok) {
      sendJson(res, { ok: false, error: reset.error || "Failed to reset password." }, 500);
      return true;
    }
    const emailResp = await sendResendEmail({
      to: targetEmail,
      subject: recreated ? "MovieFlix account restored" : "MovieFlix password reset successful",
      text: recreated
        ? `Your MovieFlix login details are ready.

Username: ${targetEmail}
Password: ${newPassword}`
        : `Your password has been reset.

Username: ${targetEmail}
New Password: ${newPassword}`,
      html: recreated
        ? `<p>Your MovieFlix login details are ready.</p><p><strong>Username:</strong> ${targetEmail}<br/><strong>Password:</strong> ${newPassword}</p>`
        : `<p>Your password has been reset.</p><p><strong>Username:</strong> ${targetEmail}<br/><strong>New Password:</strong> ${newPassword}</p>`,
      settings,
    });
    if (!emailResp.ok) {
      sendJson(res, { ok: false, error: recreated ? "Account restored, but email failed." : "Password reset done, but email failed." }, 500);
      return true;
    }
    record.forgotOtpHash = "";
    record.forgotOtpExpiresAt = 0;
    record.forgotOtpEmail = "";
    record.forgotResetAt = nowIso;
    if (embyUserId) record.embyUserId = embyUserId;
    saveRegistrations(registrations);
    appendAudit("registrations.forgot_reset", getActor(req), { phone, email: targetEmail, recreated });
    sendJson(res, { ok: true, recreated });
    return true;
  }

  if (parts[0] === "verify") {
    const otp = String(payload.otp || "").trim();
    const smsCode = String(payload.smsCode || "").trim();
    const record = registrations.find((item) => normalizeEmail(item?.email) === email);
    const otpRequirements = getRegistrationOtpRequirements(record, settings);
    if (!email || (otpRequirements.requireEmailOtp && !otp)) {
      if (otpRequirements.requireEmailOtp) {
        sendJson(res, { ok: false, error: "Email and OTP required." }, 400);
        return true;
      }
    }
    if (!email || (otpRequirements.requireSmsOtp && !smsCode)) {
      if (otpRequirements.requireSmsOtp) {
        sendJson(res, { ok: false, error: "Email and SMS code required." }, 400);
        return true;
      }
    }
    if (!record || record.status !== "otp_sent") {
      sendJson(res, { ok: false, error: "OTP not requested." }, 400);
      return true;
    }
    if (otpRequirements.requireEmailOtp) {
      if (!record.otpHash || record.otpExpiresAt < Date.now()) {
        sendJson(res, { ok: false, error: "OTP expired. Request again." }, 400);
        return true;
      }
      if (hashOtp(otp) !== record.otpHash) {
        sendJson(res, { ok: false, error: "Incorrect code. Please try again." }, 400);
        return true;
      }
    }
    if (otpRequirements.requireSmsOtp) {
      if (!msgOwlSettings.otpApiKey || !msgOwlSettings.otpBaseUrl) {
        sendJson(res, { ok: false, error: "MsgOwl settings missing." }, 400);
        return true;
      }
      const smsResp = await msgOwlRequest({
        url: `${msgOwlSettings.otpBaseUrl}/verify`,
        apiKey: msgOwlSettings.otpApiKey,
        body: { phone_number: normalizePhoneForSms(record.phone), code: smsCode },
      });
      if (!smsResp.ok) {
        sendJson(res, { ok: false, error: smsResp.text || "Incorrect SMS code." }, 400);
        return true;
      }
      try {
        const smsData = smsResp.text ? JSON.parse(smsResp.text) : {};
        if (smsData?.status !== true) {
          sendJson(res, { ok: false, error: "Incorrect SMS code." }, 400);
          return true;
        }
      } catch {
        sendJson(res, { ok: false, error: "Incorrect SMS code." }, 400);
        return true;
      }
      record.smsOtpVerifiedAt = nowIso;
    }
    record.status = "email_verified";
    record.verifiedAt = nowIso;
    record.otpHash = "";
    record.otpExpiresAt = 0;
    const result = await finalizeRegistrationApproval({
      record,
      settings,
      registrations,
      nowIso,
    });
    if (!result.ok) {
      sendJson(res, { ok: false, error: result.error || "Approval failed." }, 500);
      return true;
    }
    saveRegistrations(registrations);
    appendAudit("registrations.verify", getActor(req), { email });
    appendAudit("registrations.approve", getActor(req), { email });
    sendJson(res, {
      ok: true,
      autoLogin: { username: record.email, password: result.password },
    });
    return true;
  }

  if (parts[0] === "sms-start") {
    const record = registrations.find((item) => normalizeEmail(item?.email) === email);
    if (!record || record.status !== "email_verified") {
      sendJson(res, { ok: false, error: "Email verification required." }, 400);
      return true;
    }
    if (!record.phone || !isAllowedPhone(record.phone)) {
      sendJson(res, { ok: false, error: "Valid Maldives phone required." }, 400);
      return true;
    }
    if (!twilioSettings.sid || !twilioSettings.token || !twilioSettings.verifySid) {
      sendJson(res, { ok: false, error: "Twilio settings missing." }, 400);
      return true;
    }
    if (twilioSettings.blockVoip) {
      const lookup = await twilioLookup({
        phone: record.phone,
        sid: twilioSettings.sid,
        token: twilioSettings.token,
      });
      if (lookup.ok) {
        try {
          const data = JSON.parse(lookup.text || "{}");
          const type = data?.line_type_intelligence?.type;
          if (type && ["voip", "nonFixedVoip", "fixedVoip"].includes(type)) {
            sendJson(res, { ok: false, error: "VoIP numbers not allowed." }, 400);
            return true;
          }
        } catch {
          // ignore lookup parse errors
        }
      }
    }
    const resp = await twilioRequest({
      url: `https://verify.twilio.com/v2/Services/${twilioSettings.verifySid}/Verifications`,
      sid: twilioSettings.sid,
      token: twilioSettings.token,
      body: { To: record.phone, Channel: "sms" },
    });
    if (!resp.ok) {
      sendJson(res, { ok: false, error: "Failed to send SMS code." }, 500);
      return true;
    }
    record.smsSentAt = nowIso;
    saveRegistrations(registrations);
    sendJson(res, { ok: true });
    return true;
  }

  if (parts[0] === "sms-verify") {
    const code = String(payload.code || "").trim();
    const record = registrations.find((item) => normalizeEmail(item?.email) === email);
    if (!record || record.status !== "email_verified") {
      sendJson(res, { ok: false, error: "Email verification required." }, 400);
      return true;
    }
    if (!record.phone || !code) {
      sendJson(res, { ok: false, error: "Phone and code required." }, 400);
      return true;
    }
    if (!twilioSettings.sid || !twilioSettings.token || !twilioSettings.verifySid) {
      sendJson(res, { ok: false, error: "Twilio settings missing." }, 400);
      return true;
    }
    const resp = await twilioRequest({
      url: `https://verify.twilio.com/v2/Services/${twilioSettings.verifySid}/VerificationCheck`,
      sid: twilioSettings.sid,
      token: twilioSettings.token,
      body: { To: record.phone, Code: code },
    });
    if (!resp.ok) {
      sendJson(res, { ok: false, error: "Incorrect SMS code." }, 400);
      return true;
    }
    try {
      const data = JSON.parse(resp.text || "{}");
      if (data.status !== "approved") {
        sendJson(res, { ok: false, error: "Incorrect SMS code." }, 400);
        return true;
      }
    } catch {
      // ignore parse errors
    }
    const result = await finalizeRegistrationApproval({
      record,
      settings,
      registrations,
      nowIso,
    });
    if (!result.ok) {
      sendJson(res, { ok: false, error: result.error || "Approval failed." }, 500);
      return true;
    }
    saveRegistrations(registrations);
    appendAudit("registrations.sms_verify", getActor(req), { email });
    sendJson(res, {
      ok: true,
      autoLogin: { username: record.email, password: result.password },
    });
    return true;
  }

  if (parts[0] === "approve") {
    const id = String(payload.id || "").trim();
    const record = registrations.find((item) => String(item?.id) === id);
    if (!record) {
      sendJson(res, { ok: false, error: "Registration not found." }, 404);
      return true;
    }
    if (record.status !== "pending") {
      sendJson(res, { ok: false, error: "Registration not pending." }, 400);
      return true;
    }
    const emailUsed =
      registrations.some(
        (item) =>
          String(item?.status || "").toLowerCase() === "approved" &&
          normalizeEmail(item?.email) === normalizeEmail(record.email) &&
          String(item?.id) !== String(record.id)
      );
    const contacts = normalizeUserContacts(readJson(userContactsFile, {}));
    const emailInContacts = Object.values(contacts).some(
      (item) => normalizeEmail(item?.email) === normalizeEmail(record.email)
    );
    if (!record.email || emailUsed || emailInContacts) {
      sendJson(res, { ok: false, error: "Email already used." }, 400);
      return true;
    }

    const result = await finalizeRegistrationApproval({
      record,
      settings,
      registrations,
      nowIso,
    });
    if (!result.ok) {
      sendJson(res, { ok: false, error: result.error || "Approval failed." }, 500);
      return true;
    }
    saveRegistrations(registrations);
    appendAudit("registrations.approve", getActor(req), { email: record.email });
    sendJson(res, { ok: true });
    return true;
  }

  if (parts[0] === "reject") {
    const id = String(payload.id || "").trim();
    const record = registrations.find((item) => String(item?.id) === id);
    if (!record) {
      sendJson(res, { ok: false, error: "Registration not found." }, 404);
      return true;
    }
    if (record.status !== "pending") {
      sendJson(res, { ok: false, error: "Registration not pending." }, 400);
      return true;
    }
    record.status = "rejected";
    record.rejectedAt = nowIso;
    saveRegistrations(registrations);
    appendAudit("registrations.reject", getActor(req), { email: record.email });
    sendJson(res, { ok: true });
    return true;
  }

  if (parts[0] === "delete") {
    const id = String(payload.id || "").trim();
    const index = registrations.findIndex((item) => String(item?.id) === id);
    if (index === -1) {
      sendJson(res, { ok: false, error: "Registration not found." }, 404);
      return true;
    }
    const record = registrations[index];
    registrations.splice(index, 1);
    saveRegistrations(registrations);

    const contacts = normalizeUserContacts(readJson(userContactsFile, {}));
    const targetEmail = normalizeEmail(record?.email);
    const targetPhone = normalizePhone(record?.phone);
    const targetUserId = String(record?.embyUserId || "").trim();
    let contactsChanged = false;
    Object.entries(contacts).forEach(([key, entry]) => {
      const email = normalizeEmail(entry?.email);
      const phone = normalizePhone(entry?.phone);
      if (
        (targetEmail && email === targetEmail) ||
        (targetPhone && phone === targetPhone) ||
        (targetUserId && key === targetUserId.toLowerCase())
      ) {
        delete contacts[key];
        contactsChanged = true;
      }
    });
    if (contactsChanged) {
      writeJson(userContactsFile, contacts);
    }

    appendAudit("registrations.delete", getActor(req), {
      id,
      email: record?.email || "",
      phone: record?.phone || "",
    });
    sendJson(res, { ok: true });
    return true;
  }

  return false;
};

const handleSubscriptions = async (req, res) => {
  if (req.method === "GET") {
    const data = readJson(subscriptionsFile, []);
    const migrated = migrateSlips(data);
    let next = migrated.next;

    const registrations = readJson(registrationsFile, []);
    const phoneByEmail = new Map();
    for (const item of registrations) {
      const email = normalizeEmail(item?.email);
      const phone = normalizePhone(item?.phone);
      if (email && phone && !phoneByEmail.has(email)) {
        phoneByEmail.set(email, phone);
      }
    }

    next = next.map((sub) => {
      if (sub?.phone) return sub;
      const key = normalizeEmail(sub?.email || sub?.username || sub?.userKey);
      const phone = key ? phoneByEmail.get(key) : "";
      return phone ? { ...sub, phone } : sub;
    });

    sendJson(res, next);
    return true;
  }

  if (req.method === "POST") {
    const body = await getBody(req);
    let data = null;
    try {
      data = body ? JSON.parse(body) : null;
    } catch {
      data = null;
    }

    if (Array.isArray(data)) {
      sendJson(res, { ok: false, error: "Bulk subscription overwrite disabled." }, 400);
      return true;
    }

    const action = String(data?.action || "").trim();
    const subscriptions = readJson(subscriptionsFile, []);
    let next = [...subscriptions];
    const nowIso = new Date().toISOString();

    if (action === "update-dates") {
      const targetId = String(data?.targetId || "").trim();
      const startDate = String(data?.startDate || "").trim();
      const endDate = String(data?.endDate || "").trim();
      const durationDays = Number(data?.durationDays || 0) || 0;
      const status = String(data?.status || "approved").trim() || "approved";
      if (!targetId || !startDate || !endDate) {
        sendJson(res, { ok: false, error: "Missing required fields." }, 400);
        return true;
      }
      next = next.map((sub) =>
        String(sub?.id || "") === targetId
          ? { ...sub, status, startDate, endDate, durationDays }
          : sub
      );
      writeJson(subscriptionsFile, next);
      appendAudit("subscriptions.update_dates", getActor(req), { targetId, startDate, endDate, status });
      sendJson(res, next);
      return true;
    }

    if (action === "submit-payment") {
      const payload = data?.payload || {};
      logPaymentEvent("submit-payment.received", {
        username: payload?.username || "",
        userId: payload?.userId || "",
        userKey: payload?.userKey || "",
        planName: payload?.planName || "",
        price: payload?.price ?? null,
        currency: payload?.currency || "",
        hasSlipData: Boolean(payload?.slipData),
        slipName: payload?.slipName || "",
      });
      const userKey = payload.userId || payload.userKey || payload.username || "";
      next = next.map((sub) => {
        const sameUser =
          userKey &&
          (sub.userId === userKey ||
            sub.userKey === userKey ||
            (payload.username &&
              (sub.username || "").toLowerCase() === String(payload.username).toLowerCase()));
        if (!sameUser) return sub;
        if (sub.status === "pending") return { ...sub, status: "rejected" };
        return sub;
      });
      const created = { id: safeUUID(), ...payload };
      next.unshift(created);
      writeJson(subscriptionsFile, next);
      appendAudit("subscriptions.submit_payment", getActor(req), {
        username: payload?.username || "",
        userId: payload?.userId || "",
      });
      logPaymentEvent("submit-payment.saved", {
        id: created.id,
        username: created.username || "",
        userId: created.userId || "",
        status: created.status || "",
        hasSlipData: Boolean(created.slipData),
        totalSubscriptions: next.length,
      });
      sendJson(res, next);
      return true;
    }

    if (action === "approve-payment") {
      const subId = String(data?.subId || "").trim();
      const actualAmount = typeof data?.actualAmount === "number" ? data.actualAmount : Number(data?.actualAmount);
      const target = next.find((sub) => sub.id === subId);
      if (!target) {
        logPaymentEvent("approve-payment.missing", { subId, actualAmount });
        sendJson(res, { ok: false, error: "Payment not found." }, 404);
        return true;
      }
      const days = Number(target.durationDays || target.duration || 0) || 30;
      const userKey = target.userId || target.userKey || "";
      const now = Date.now();
      const related = next.filter(
        (sub) =>
          sub.userId === userKey ||
          sub.userKey === userKey ||
          (target.username && (sub.username || "").toLowerCase() === target.username.toLowerCase())
      );
      const byLatestEnd = related
        .filter((sub) => sub?.endDate)
        .sort((a, b) => new Date(b.endDate || b.submittedAt || 0) - new Date(a.endDate || a.submittedAt || 0));
      const latestEndRecord = byLatestEnd[0] || null;
      const latestEndMs = latestEndRecord?.endDate ? new Date(latestEndRecord.endDate).getTime() : 0;
      const isActive = latestEndMs >= now;
      const baseEndIso = isActive && latestEndRecord?.endDate ? latestEndRecord.endDate : nowIso;
      const startDate = isActive && latestEndRecord?.startDate ? latestEndRecord.startDate : nowIso;
      const endDate = addDays(baseEndIso, days);
      const approvedAt = nowIso;
      const planPrice = Number(target.price || 0);
      const actualPaid = Number.isFinite(actualAmount) ? actualAmount : planPrice;
      const discountAmount = planPrice - actualPaid;
      next = next.map((sub) => {
        const matchesUser =
          sub.userId === userKey ||
          sub.userKey === userKey ||
          (target.username && (sub.username || "").toLowerCase() === target.username.toLowerCase());
        if (!matchesUser) return sub;
        if (sub.status === "pending" && sub.id !== subId) return { ...sub, status: "rejected" };
        if (sub.id !== subId) return sub;
        return {
          ...sub,
          status: "approved",
          approvedAt,
          finalAmount: actualPaid,
          discountAmount: discountAmount > 0 ? discountAmount : 0,
          startDate,
          endDate,
          playbackDisabledAt: null,
        };
      });
      writeJson(subscriptionsFile, next);
      appendAudit("subscriptions.approve_payment", getActor(req), { subId, actualPaid, startDate, endDate });
      logPaymentEvent("approve-payment.saved", { subId, actualPaid, startDate, endDate });
      const approved = next.find((sub) => sub.id === subId);
      if (approved?.userId) {
        const settings = loadSettings();
        const { base, apiKey } = getEmbyAdminSettings(settings);
        if (base && apiKey) {
          const accessResp = await applyEmbyAccessPolicy({
            base,
            apiKey,
            userId: approved.userId,
            enablePlayback: true,
          });
          if (!accessResp.ok) {
            writeLog(
              errorLogFile,
              `approve_payment_access_policy_failed ${approved.userId} ${accessResp.error || "unknown_error"}`
            );
          }
        }
      }
      await updateTelegramPaymentStatus(approved, "✅ <b>APPROVED</b>");

      try {
        const settings = loadSettings();
        let targetEmail = normalizeEmail(approved?.email || approved?.username || "");
        if (!targetEmail) {
          const registrations = readJson(registrationsFile, []);
          const subscriptions = readJson(subscriptionsFile, []);
          const userContacts = normalizeUserContacts(readJson(userContactsFile, {}));
          targetEmail =
            resolveEmailByPhone({
              phone: approved?.phone,
              registrations,
              subscriptions,
              userContacts,
            }) ||
            normalizeEmail(
              registrations.find((item) => String(item?.embyUserId || "") === String(approved?.userId || ""))?.email ||
              subscriptions.find(
                (item) =>
                  String(item?.userId || item?.userKey || "") === String(approved?.userId || "")
              )?.email ||
              ""
            );
        }

        if (targetEmail) {
          let endDateLabel = "-";
          const endDate = new Date(approved?.endDate || "");
          if (!Number.isNaN(endDate.getTime())) {
            endDateLabel = endDate.toISOString().slice(0, 10);
          }
          const planName = String(approved?.planName || "MovieFlix Plan").trim();
          await sendLoggedResendEmail({
            to: targetEmail,
            subject: "MovieFlix Payment Approved",
            text: `Your payment has been approved successfully.

Plan: ${planName}
Subscription End Date: ${endDateLabel}
Status: Active

Thank you for choosing MovieFlix.
MovieFlix Team`,
            html: `<p>Your payment has been approved successfully.</p><p><strong>Plan:</strong> ${escapeHtml(planName)}<br/><strong>Subscription End Date:</strong> ${escapeHtml(endDateLabel)}<br/><strong>Status:</strong> Active</p><p>Thank you for choosing MovieFlix.</p><p>MovieFlix Team</p>`,
            settings,
            context: "payment_approved",
          });
        }
      } catch (err) {
        writeLog(errorLogFile, `payment_approval_email_failed ${err?.message || err || "unknown_error"}`);
      }

      sendJson(res, next);
      return true;
    }

    if (action === "reject-payment") {
      const subId = String(data?.subId || "").trim();
      next = next.map((sub) => (sub.id === subId ? { ...sub, status: "rejected" } : sub));
      writeJson(subscriptionsFile, next);
      appendAudit("subscriptions.reject_payment", getActor(req), { subId });
      logPaymentEvent("reject-payment.saved", { subId });
      const rejected = next.find((sub) => sub.id === subId);
      await updateTelegramPaymentStatus(rejected, "❌ <b>REJECTED</b>");
      sendJson(res, next);
      return true;
    }

    if (action === "delete-payment") {
      const subId = String(data?.subId || "").trim();
      next = next.filter((sub) => sub.id !== subId);
      writeJson(subscriptionsFile, next);
      appendAudit("subscriptions.delete_payment", getActor(req), { subId });
      logPaymentEvent("delete-payment.saved", { subId, remaining: next.length });
      sendJson(res, next);
      return true;
    }

    if (action === "upload-slip") {
      const subId = String(data?.subId || "").trim();
      const slipName = String(data?.slipName || "").trim();
      const slipData = data?.slipData || "";
      logPaymentEvent("upload-slip.received", {
        subId,
        slipName,
        hasSlipData: Boolean(slipData),
      });
      next = next.map((sub) =>
        sub.id === subId ? { ...sub, slipName: slipName || sub.slipName || "", slipData } : sub
      );
      writeJson(subscriptionsFile, next);
      appendAudit("subscriptions.upload_slip", getActor(req), { subId });
      logPaymentEvent("upload-slip.saved", { subId, slipName, hasSlipData: Boolean(slipData) });
      sendJson(res, next);
      return true;
    }

    if (action === "update-amount") {
      const subId = String(data?.subId || "").trim();
      const actualPaid = Number(data?.actualPaid);
      next = next.map((sub) => {
        if (sub.id !== subId) return sub;
        const planPrice = Number(sub.price || 0);
        const discount = planPrice - actualPaid;
        return { ...sub, finalAmount: actualPaid, discountAmount: discount > 0 ? discount : 0 };
      });
      writeJson(subscriptionsFile, next);
      appendAudit("subscriptions.update_amount", getActor(req), { subId, actualPaid });
      sendJson(res, next);
      return true;
    }

    if (action === "update-payment-date") {
      const subId = String(data?.subId || "").trim();
      const nextIso = String(data?.nextIso || "").trim();
      next = next.map((sub) =>
        sub.id === subId ? { ...sub, submittedAt: nextIso, approvedAt: nextIso, reviewedAt: nextIso } : sub
      );
      writeJson(subscriptionsFile, next);
      appendAudit("subscriptions.update_payment_date", getActor(req), { subId, nextIso });
      sendJson(res, next);
      return true;
    }

    if (action === "add-manual-payment") {
      const payload = data?.payload || {};
      const submittedAt = nowIso;
      const priceValue = Number(payload.price || 0);
      const actualPaid = Number(payload.finalAmount || payload.price || 0);
      const discount = priceValue - actualPaid;
      next = [
        {
          id: safeUUID(),
          status: "approved",
          approvedAt: submittedAt,
          reviewedAt: submittedAt,
          submittedAt,
          playbackDisabledAt: null,
          ...payload,
          price: priceValue,
          finalAmount: actualPaid,
          discountAmount: discount > 0 ? discount : 0,
        },
        ...next,
      ];
      writeJson(subscriptionsFile, next);
      if (payload?.userId) {
        const settings = loadSettings();
        const { base, apiKey } = getEmbyAdminSettings(settings);
        if (base && apiKey) {
          const accessResp = await applyEmbyAccessPolicy({
            base,
            apiKey,
            userId: payload.userId,
            enablePlayback: true,
          });
          if (!accessResp.ok) {
            writeLog(
              errorLogFile,
              `manual_payment_access_policy_failed ${payload.userId} ${accessResp.error || "unknown_error"}`
            );
          }
        }
      }
      appendAudit("subscriptions.add_manual_payment", getActor(req), {
        username: payload?.username || "",
        userId: payload?.userId || "",
      });
      sendJson(res, next);
      return true;
    }

    if (action === "mark-playback-disabled") {
      const subIds = Array.isArray(data?.subIds) ? data.subIds.map((id) => String(id || "")) : [];
      if (subIds.length === 0) {
        sendJson(res, next);
        return true;
      }
      next = next.map((sub) =>
        subIds.includes(String(sub?.id || "")) && !sub.playbackDisabledAt
          ? { ...sub, playbackDisabledAt: nowIso }
          : sub
      );
      writeJson(subscriptionsFile, next);
      appendAudit("subscriptions.mark_playback_disabled", getActor(req), { count: subIds.length });
      sendJson(res, next);
      return true;
    }

    sendJson(res, { ok: false, error: "Unsupported subscription action." }, 400);
    return true;
  }

  return false;
};

const handlePlans = async (req, res) => {
  if (req.method === "GET") {
    sendJson(res, readJson(plansFile, []));
    return true;
  }
  if (req.method === "POST") {
    const body = await getBody(req);
    let data = [];
    try {
      data = body ? JSON.parse(body) : [];
    } catch {
      data = [];
    }
    writeJson(plansFile, data);
    appendAudit("plans.update", getActor(req), {
      count: Array.isArray(data) ? data.length : 0,
    });
    sendJson(res, { ok: true });
    return true;
  }
  return false;
};

const handleSlip = async (req, res, url) => {
  if (req.method !== "GET") return false;
  const parts = (url?.pathname || "").split("/").filter(Boolean);
  const slipId = parts[2] || "";
  if (!slipId) return false;
  const index = loadSlipIndex();
  const entry = index[slipId];
  if (!entry || !entry.path || !fs.existsSync(entry.path)) {
    res.statusCode = 404;
    res.end("Not found");
    return true;
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", entry.mime || "application/octet-stream");
  fs.createReadStream(entry.path).pipe(res);
  return true;
};

const handleMovieRequests = async (req, res) => {
  if (req.method === "GET") {
    sendJson(res, readJson(movieRequestsFile, []));
    return true;
  }
  if (req.method === "POST") {
    const body = await getBody(req);
    let data = [];
    try {
      data = body ? JSON.parse(body) : [];
    } catch {
      data = [];
    }
    writeJson(movieRequestsFile, data);
    appendAudit("movie-requests.update", getActor(req), {
      count: Array.isArray(data) ? data.length : 0,
    });
    sendJson(res, { ok: true });
    return true;
  }
  return false;
};

const handleUnlimitedUsers = async (req, res) => {
  if (req.method === "GET") {
    sendJson(res, readJson(unlimitedFile, []));
    return true;
  }
  if (req.method === "POST") {
    const body = await getBody(req);
    let data = [];
    try {
      data = body ? JSON.parse(body) : [];
    } catch {
      data = [];
    }
    writeJson(unlimitedFile, data);
    appendAudit("unlimited.update", getActor(req), {
      count: Array.isArray(data) ? data.length : 0,
    });
    sendJson(res, { ok: true });
    return true;
  }
  return false;
};

const handleUserTags = async (req, res) => {
  if (req.method === "GET") {
    sendJson(res, readJson(tagsFile, {}));
    return true;
  }
  if (req.method === "POST") {
    const body = await getBody(req);
    let data = {};
    try {
      data = body ? JSON.parse(body) : {};
    } catch {
      data = {};
    }
    writeJson(tagsFile, data);
    appendAudit("tags.update", getActor(req));
    sendJson(res, { ok: true });
    return true;
  }
  return false;
};

const handleUserContacts = async (req, res) => {
  if (req.method === "GET") {
    sendJson(res, normalizeUserContacts(readJson(userContactsFile, {})));
    return true;
  }
  if (req.method === "POST") {
    const body = await getBody(req);
    let data = {};
    try {
      data = body ? JSON.parse(body) : {};
    } catch {
      data = {};
    }
    const normalized = normalizeUserContacts(data);
    writeJson(userContactsFile, normalized);
    appendAudit("user-contacts.update", getActor(req), {
      count: Object.keys(normalized).length,
    });
    sendJson(res, { ok: true });
    return true;
  }
  return false;
};

const handleChats = async (req, res) => {
  if (req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const scope = String(url.searchParams.get("scope") || "user").trim().toLowerCase();
    const identity = resolveConversationIdentity({
      conversationId: url.searchParams.get("conversationId") || "",
      userId: url.searchParams.get("userId") || "",
      username: url.searchParams.get("username") || "",
    });
    const state = loadChatState(userChatsFile);
    if (scope === "admin") {
      sendJson(res, serializeConversationList(state));
      return true;
    }
    const conversation = findConversation(state, identity);
    sendJson(res, conversation ? serializeConversation(conversation) : null);
    return true;
  }

  if (req.method !== "POST") return false;

  const body = await getBody(req);
  let payload = {};
  try {
    payload = body ? JSON.parse(body) : {};
  } catch {
    payload = {};
  }

  const action = String(payload?.action || "send").trim().toLowerCase();
  const state = loadChatState(userChatsFile);

  if (action === "read") {
    const conversation = markConversationRead(
      state,
      {
        conversationId: payload?.conversationId || "",
        userId: payload?.userId || "",
        username: payload?.username || "",
      },
      payload?.readerRole || "user"
    );
    if (!conversation) {
      sendJson(res, { ok: false, error: "Conversation not found." }, 404);
      return true;
    }
    saveChatState(userChatsFile, state);
    sendJson(res, { ok: true, conversation: serializeConversation(conversation) });
    return true;
  }

  if (action !== "send") {
    sendJson(res, { ok: false, error: "Unsupported action." }, 400);
    return true;
  }

  const senderRole =
    String(payload?.senderRole || "").trim().toLowerCase() === "admin" ? "admin" : "user";
  const bodyText = String(payload?.body || "").trim();
  const attachment = payload?.attachmentDataUrl ? saveChatAttachment(payload.attachmentDataUrl) : null;
  if (!bodyText && !attachment) {
    sendJson(res, { ok: false, error: "Message or photo is required." }, 400);
    return true;
  }
  if (payload?.attachmentDataUrl && !attachment) {
    sendJson(res, { ok: false, error: "Invalid photo attachment." }, 400);
    return true;
  }

  const identity = resolveConversationIdentity(payload);
  if (!identity.userId && !identity.username && !payload?.conversationId) {
    sendJson(res, { ok: false, error: "User identity is required." }, 400);
    return true;
  }

  const conversation = appendConversationMessage(
    state,
    { ...identity, conversationId: payload?.conversationId || "" },
    {
      senderRole,
      senderName:
        senderRole === "admin"
          ? String(payload?.senderName || req.headers["x-admin-user"] || "Admin").trim()
          : String(payload?.senderName || identity.displayName || identity.username || "User").trim(),
      body: bodyText,
      attachment,
      via: String(payload?.via || (senderRole === "admin" ? "dashboard" : "dashboard")).trim(),
    }
  );

  if (senderRole === "user") {
    upsertConversation(state, identity);
  } else {
    conversation.unreadForAdmin = 0;
  }

  saveChatState(userChatsFile, state);
  appendAudit("chat.send", getActor(req), {
    conversationId: conversation.id,
    senderRole,
    userId: conversation.userId || "",
    username: conversation.username || "",
  });

  if (senderRole === "user") {
    const settings = loadSettings();
    const summary = [
      "<b>New User Chat</b>",
      `User: ${escapeHtml(conversation.displayName || conversation.username || "Unknown")}`,
      conversation.username ? `Email: ${escapeHtml(conversation.username)}` : "",
      conversation.phone ? `Phone: ${escapeHtml(conversation.phone)}` : "",
      "",
      bodyText ? escapeHtml(bodyText) : "",
      attachment ? "[Photo attached]" : "",
    ]
      .filter(Boolean)
      .join("\n");
    await notifyTelegramAdmins(settings, summary, {
      inline_keyboard: [[{ text: "Reply", callback_data: `reply_chat:${conversation.id}` }]],
    });
  }

  sendJson(res, { ok: true, conversation: serializeConversation(conversation) });
  return true;
};

const handleChatAttachments = async (req, res, url) => {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const pathname = decodeURIComponent(url.pathname || "");
  const filename = pathname.replace(/^\/api\/chat-attachments\/?/, "");
  if (!filename) return false;
  const filePath = path.resolve(chatUploadsDir, filename);
  if (!filePath.startsWith(chatUploadsDir)) return false;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.statusCode = 404;
    res.end("Not found");
    return true;
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", getMimeType(filePath));
  fs.createReadStream(filePath).pipe(res);
  return true;
};

const handleClientErrors = async (req, res) => {
  if (req.method !== "POST") return false;
  const body = await getBody(req);
  let payload = {};
  try {
    payload = body ? JSON.parse(body) : {};
  } catch {
    payload = { raw: body };
  }
  const entry = { timestamp: new Date().toISOString(), ...payload };
  try {
    fs.appendFileSync(clientErrorsLog, `${JSON.stringify(entry)}\n`);
    fs.appendFileSync(clientErrorFile, `${JSON.stringify(entry)}\n`);
    fs.appendFileSync(errorLogFile, `${new Date().toISOString()} client_error ${JSON.stringify(entry)}\n`);
  } catch {
    // ignore log errors
  }
  sendJson(res, { ok: true });
  return true;
};

const handleStatus = async (req, res) => {
  if (req.method !== "GET") return false;
  const settings = loadSettings();
  const status = {
    telegramBot: { running: isTelegramBotRunning() },
    tunnel: { running: isCloudflaredRunning() },
    emby: { ok: false, message: "Emby URL not set." },
    seer: { ok: false, message: "Seer URL not set." },
    sonarr: { ok: false, message: "Sonarr URL not set." },
    radarr: { ok: false, message: "Radarr URL not set." },
  };

  if (settings?.embyUrl && settings?.apiKey) {
    const base = settings.embyUrl.replace(/\/+$/, "");
    const resp = await safeFetch(`${base}/System/Info/Public?api_key=${settings.apiKey}`);
    status.emby = resp.ok
      ? { ok: true, message: "OK" }
      : { ok: false, message: resp.text || `HTTP ${resp.status}` };
  }

  const seerUrl = getSeerUrl(settings);
  const seerApiKey = getSeerApiKey(settings);
  if (seerUrl && seerApiKey) {
    const base = seerUrl.replace(/\/+$/, "");
    const resp = await safeFetch(`${base}/api/v1/status`, {
      headers: { "X-Api-Key": seerApiKey },
    });
    status.seer = resp.ok
      ? { ok: true, message: "OK" }
      : { ok: false, message: resp.text || `HTTP ${resp.status}` };
  }

  if (settings?.sonarrUrl && settings?.sonarrApiKey) {
    const base = settings.sonarrUrl.replace(/\/+$/, "");
    const resp = await safeFetch(`${base}/api/v3/system/status`, {
      headers: { "X-Api-Key": settings.sonarrApiKey },
    });
    status.sonarr = resp.ok
      ? { ok: true, message: "OK" }
      : { ok: false, message: resp.text || `HTTP ${resp.status}` };
  }

  if (settings?.radarrUrl && settings?.radarrApiKey) {
    const base = settings.radarrUrl.replace(/\/+$/, "");
    const resp = await safeFetch(`${base}/api/v3/system/status`, {
      headers: { "X-Api-Key": settings.radarrApiKey },
    });
    status.radarr = resp.ok
      ? { ok: true, message: "OK" }
      : { ok: false, message: resp.text || `HTTP ${resp.status}` };
  }

  status.jellyseerr = status.seer;
  sendJson(res, status);
  return true;
};

const handlePolicySync = async (req, res) => {
  if (req.method !== "POST") return false;
  try {
    const updated = await syncPlaybackLibraries();
    sendJson(res, { ok: true, updated: Number(updated || 0) });
  } catch (err) {
    writeLog(errorLogFile, `policy_sync_failed ${err?.message || err || "unknown_error"}`);
    sendJson(res, { ok: false, error: "Policy sync failed." }, 500);
  }
  return true;
};

const handleMediaEvents = async (req, res) => {
  if (req.method === "GET") {
    sendJson(res, { ok: true, mode: "webhook", fallbackIntervalSeconds: Math.round(MEDIA_REQUEST_SYNC_INTERVAL_MS / 1000) });
    return true;
  }
  if (req.method !== "POST") return false;

  const settings = loadSettings();
  const expectedToken =
    String(settings?.mediaWebhookToken || settings?.seerWebhookToken || settings?.jellyseerrWebhookToken || "").trim() ||
    String(process.env.MEDIA_WEBHOOK_TOKEN || process.env.JELLYSEERR_WEBHOOK_TOKEN || "").trim();

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const providedToken =
    String(req.headers["x-webhook-token"] || req.headers["x-media-webhook-token"] || req.headers["x-seer-webhook-token"] || req.headers["x-jellyseerr-webhook-token"] || "").trim() ||
    String(url.searchParams.get("token") || "").trim();

  if (expectedToken && providedToken !== expectedToken) {
    sendJson(res, { ok: false, error: "unauthorized" }, 403);
    return true;
  }

  let payload = {};
  try {
    const raw = await getBody(req);
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }

  const eventType = String(payload?.eventType || payload?.event || payload?.notification_type || "unknown");
  const eventTypeLower = eventType.toLowerCase();
  const isAvailabilityEvent =
    eventTypeLower.includes("now available") ||
    eventTypeLower.includes("request available") ||
    eventTypeLower.includes("available");

  writeLog(clientErrorsLog, JSON.stringify({
    timestamp: new Date().toISOString(),
    type: "media_webhook_received",
    eventType,
    availabilityEvent: isAvailabilityEvent,
  }));

  if (!isAvailabilityEvent) {
    sendJson(res, { ok: true, queued: false, ignored: true, reason: "non_availability_event" });
    return true;
  }

  if (mediaRequestWebhookTimer) clearTimeout(mediaRequestWebhookTimer);
  mediaRequestWebhookTimer = setTimeout(() => {
    reconcileMediaRequests().catch((err) => {
      writeLog(errorLogFile, `media_request_webhook_reconcile_failed ${err?.message || err || "unknown_error"}`);
    });
    mediaRequestWebhookTimer = null;
  }, Math.max(250, Math.min(1000, MEDIA_REQUEST_WEBHOOK_DEBOUNCE_MS || 500)));

  sendJson(res, { ok: true, queued: true });
  return true;
};

const handleTunnel = async (req, res) => {
  if (req.method === "GET") {
    sendJson(res, { running: isCloudflaredRunning() });
    return true;
  }

  if (req.method === "POST") {
    const action = String(req.url || "").includes("stop") ? "stop" : "start";
    if (action === "stop") {
      let stopped = false;
      if (fs.existsSync(cloudflaredPidFile)) {
        try {
          const pid = Number(fs.readFileSync(cloudflaredPidFile, "utf-8").trim());
          if (isProcessRunning(pid)) {
            process.kill(pid);
            stopped = true;
          }
        } catch {
          // ignore stop errors
        }
      }
      const pkillBins = ["/usr/bin/pkill", "/bin/pkill", "pkill"];
      for (const bin of pkillBins) {
        try {
          execFileSync(bin, ["-f", "cloudflared tunnel run"]);
          stopped = true;
        } catch {
          // ignore
        }
      }
      try {
        if (fs.existsSync(cloudflaredPidFile)) fs.unlinkSync(cloudflaredPidFile);
        if (fs.existsSync(cloudflaredLockFile)) fs.unlinkSync(cloudflaredLockFile);
      } catch {
        // ignore cleanup errors
      }
      sendJson(res, { ok: true, running: isCloudflaredRunning(), stopped });
      return true;
    }

    if (isCloudflaredRunning()) {
      sendJson(res, { ok: true, running: true, alreadyRunning: true });
      return true;
    }

    try {
      ensurePidDir();
      const out = fs.openSync(cloudflaredLogFile, "a");
      const err = fs.openSync(cloudflaredLogFile, "a");
      const child = spawn(
        cloudflaredBin,
        ["tunnel", "run", cloudflaredTunnelName],
        {
          detached: true,
          stdio: ["ignore", out, err],
        }
      );
      fs.writeFileSync(cloudflaredPidFile, String(child.pid));
      fs.writeFileSync(cloudflaredLockFile, new Date().toISOString());
      child.unref();
      sendJson(res, { ok: true, running: true, pid: child.pid });
      return true;
    } catch (err) {
      sendJson(res, { ok: false, running: false, error: err?.message || "start_failed" });
      return true;
    }
  }
  return false;
};

const handleTelegramBot = async (req, res) => {
  if (req.method === "GET") {
    sendJson(res, { running: isTelegramBotRunning() });
    return true;
  }

  if (req.method === "POST") {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const action = (url.pathname || "").endsWith("/stop") ? "stop" : "start";

    if (action === "stop") {
      let stopped = false;
      if (fs.existsSync(telegramPidFile)) {
        try {
          const pid = Number(fs.readFileSync(telegramPidFile, "utf-8").trim());
          if (pid) {
            process.kill(pid);
            stopped = true;
          }
        } catch {
          // ignore kill errors
        }
      }
      try {
        execFileSync("pkill", ["-f", "telegram-bot.js"]);
        stopped = true;
      } catch {
        // ignore pkill errors
      }
      sendJson(res, { ok: true, running: isTelegramBotRunning(), stopped });
      return true;
    }

    if (isTelegramBotRunning()) {
      sendJson(res, { ok: true, running: true, alreadyRunning: true });
      return true;
    }

    try {
      ensurePidDir();
      const out = fs.openSync(telegramLogFile, "a");
      const err = fs.openSync(telegramLogFile, "a");
      const child = spawn(process.execPath, [telegramScript], {
        detached: true,
        stdio: ["ignore", out, err],
      });
      fs.writeFileSync(telegramPidFile, String(child.pid));
      fs.writeFileSync(telegramLockFile, new Date().toISOString());
      child.unref();
      sendJson(res, { ok: true, running: true, pid: child.pid });
      return true;
    } catch (err) {
      sendJson(res, { ok: false, running: false, error: err?.message || "start_failed" });
      return true;
    }
  }
  return false;
};

const handleMediaRequests = async (req, res, urlParts) => {
  const readData = () => readJson(mediaRequestsFile, []);
  const writeData = (data) => writeJson(mediaRequestsFile, data);
  const normalizeRequesterKey = (item) => {
    const byId = String(item?.requested_by || item?.requestedBy || "").trim();
    if (byId) return byId;
    return normalizeEmail(
      item?.requested_by_username || item?.requestedByUsername || item?.username || ""
    );
  };
  const isOpenMediaStatus = (status) =>
    ["pending", "approved", "downloading", "available"].includes(String(status || "").toLowerCase());
  const isDuplicateRequest = (a, b) => {
    const sameMediaType =
      normalizeMediaType(a?.media_type || a?.mediaType || a?.type || "") ===
      normalizeMediaType(b?.media_type || b?.mediaType || b?.type || "");
    const sameTmdb = String(a?.tmdb_id || a?.tmdbId || "") === String(b?.tmdb_id || b?.tmdbId || "");
    const sameRequester = normalizeRequesterKey(a) !== "" && normalizeRequesterKey(a) === normalizeRequesterKey(b);
    return sameMediaType && sameTmdb && sameRequester;
  };

  const method = req.method || "GET";
  const parts = urlParts;

  if (method === "GET" && parts.length === 0) {
    sendJson(res, readData());
    return true;
  }

  if (method === "POST" && parts.length === 0) {
    const raw = await getBody(req);
    let payload = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = {};
    }
    const next = readData();
    const now = new Date().toISOString();
    const id = payload.id || crypto.randomUUID();
    const record = {
      id,
      title: payload.title || payload.media_title || payload.name || "Untitled",
      media_type: normalizeMediaType(payload.media_type || payload.mediaType || payload.type || "movie"),
      tmdb_id: payload.tmdb_id || payload.tmdbId || payload.media_id || payload.mediaId || "",
      imdb_id: payload.imdb_id || payload.imdbId || "",
      poster_path: payload.poster_path || payload.posterPath || "",
      poster_url: payload.poster_url || payload.posterUrl || "",
      language: payload.language || payload.originalLanguage || payload.original_language || "",
      requested_by: payload.requested_by || payload.requestedBy || "",
      requested_by_username:
        payload.requested_by_username || payload.requestedByUsername || payload.username || "",
      status: payload.status || "pending",
      requested_at: payload.requested_at || payload.requestedAt || now,
      notes: payload.notes || "",
      jellyseerr_request_id:
        payload.jellyseerr_request_id || payload.jellyseerrRequestId || null,
      download_progress:
        typeof payload.download_progress === "number"
          ? payload.download_progress
          : payload.downloadProgress ?? null,
      release_status: payload.release_status || payload.releaseStatus || "",
      created_at: now,
      updated_at: now,
    };

    const duplicate = next.find(
      (item) =>
        isDuplicateRequest(item, record) && isOpenMediaStatus(item?.status || item?.request_status || "")
    );
    if (duplicate) {
      sendJson(res, { error: "You already have a request for this title." }, 409);
      return true;
    }

    const settings = loadSettings();
    const jellyseerrBase = getSeerUrl(settings);
    const jellyseerrKey = getSeerApiKey(settings);
    const mediaId = Number(record.tmdb_id || 0);
    if (jellyseerrBase && jellyseerrKey && Number.isFinite(mediaId) && mediaId > 0) {
      const details = await getSeerMediaDetails({
        jellyseerrBase: jellyseerrBase.replace(/\/+$/, ""),
        jellyseerrKey,
        mediaType: record.media_type,
        mediaId,
      });
      if (isSeerMediaAvailable(details)) {
        sendJson(res, { error: "This title is already available to watch." }, 409);
        return true;
      }
    }

    next.unshift(record);
    writeData(next);
    sendJson(res, record, 201);
    return true;
  }

  if (method === "PATCH" && parts.length === 1) {
    const id = parts[0];
    const raw = await getBody(req);
    let payload = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = {};
    }
    const next = readData();
    const index = next.findIndex((item) => item.id === id);
    if (index === -1) {
      sendJson(res, { error: "Not found" }, 404);
      return true;
    }
    next[index] = { ...next[index], ...payload, updated_at: new Date().toISOString() };
    writeData(next);
    sendJson(res, next[index]);
    return true;
  }

  if (method === "POST" && parts.length === 2 && parts[1] === "approve") {
    const id = parts[0];
    const next = readData();
    const index = next.findIndex((item) => item.id === id);
    if (index === -1) {
      sendJson(res, { error: "Not found" }, 404);
      return true;
    }
    const record = next[index];
    const rawBody = await getBody(req);
    let approvePayload = {};
    try {
      approvePayload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      approvePayload = {};
    }
    const rootFolder =
      approvePayload?.rootFolder ||
      approvePayload?.root_folder ||
      approvePayload?.rootFolderPath ||
      "";
    const serverId =
      approvePayload?.serverId || approvePayload?.server_id || approvePayload?.serverID || "";
    const profileIdRaw =
      approvePayload?.profileId ||
      approvePayload?.profile_id ||
      approvePayload?.qualityProfileId ||
      "";
    const profileId =
      profileIdRaw !== "" && !Number.isNaN(Number(profileIdRaw)) ? Number(profileIdRaw) : null;

    const settings = loadSettings();
    const baseUrl = settings?.seerUrl || settings?.jellyseerrUrl;
    const apiKey = settings?.seerApiKey || settings?.jellyseerrApiKey;
    if (!baseUrl || !apiKey) {
      sendJson(res, { error: "Seer settings missing." }, 400);
      return true;
    }
    try {
      const base = baseUrl.replace(/\/+$/, "");
      const mediaId = record?.tmdb_id ? Number(record.tmdb_id) : null;
      if (!Number.isFinite(mediaId)) {
        sendJson(res, { error: "Invalid TMDB id for this request." }, 400);
        return true;
      }
      const requestPayload = { mediaType: record.media_type, mediaId };
      if (String(record.media_type).toLowerCase() === "tv") {
        requestPayload.seasons = "all";
      }
      if (rootFolder) requestPayload.rootFolder = rootFolder;
      if (serverId) requestPayload.serverId = serverId;
      if (Number.isFinite(profileId)) requestPayload.profileId = profileId;
      const payload = JSON.stringify(requestPayload);
      const doRequest = async (url) =>
        await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": apiKey,
          },
          body: payload,
        });

      let response = await doRequest(`${base}/api/v1/request`);
      if (!response.ok) {
        const text = await response.text();
        const publicBase = extractPublicBase(text);
        if (publicBase) {
          response = await doRequest(`${base}${publicBase}/api/v1/request`);
        } else {
          sendJson(res, { error: text || "Seer request failed." }, response.status);
          return true;
        }
      }
      if (!response.ok) {
        const text = await response.text();
        sendJson(res, { error: text || "Seer request failed." }, response.status);
        return true;
      }
      const data = await response.json();
      next[index] = {
        ...record,
        status: "approved",
        jellyseerr_request_id: data?.id || data?.requestId || record.jellyseerr_request_id,
        updated_at: new Date().toISOString(),
      };
      const canonical = next[index];
      const beforeCount = next.length;
      const deduped = [];
      for (let i = 0; i < next.length; i += 1) {
        const item = next[i];
        if (i === index) {
          deduped.push(item);
          continue;
        }
        if (
          isDuplicateRequest(item, canonical) &&
          ["pending", "approved", "downloading"].includes(
            String(item?.status || item?.request_status || "").toLowerCase()
          )
        ) {
          continue;
        }
        deduped.push(item);
      }
      next.length = 0;
      next.push(...deduped);
      writeData(next);
      appendAudit("media-request.approve", getActor(req), {
        id,
        title: record?.title || record?.media_title,
        removedDuplicates: Math.max(0, beforeCount - next.length),
      });
      const approvedRecord = next.find((item) => item.id === id) || canonical;
      const actor = getActor(req) || "dashboard";
      updateTelegramMediaStatus(
        approvedRecord,
        "✅ <b>APPROVED</b>",
        actor,
        `✅ Approved by ${actor}`
      ).catch((err) => {
        writeLog(errorLogFile, `telegram_media_update_failed approve ${id} ${err?.message || err || "unknown_error"}`);
      });
      sendJson(res, approvedRecord);
      return true;
    } catch {
      sendJson(res, { error: "Failed to reach Seer." }, 502);
      return true;
    }
  }

  if (method === "POST" && parts.length === 2 && parts[1] === "reject") {
    const id = parts[0];
    const next = readData();
    const index = next.findIndex((item) => item.id === id);
    if (index === -1) {
      sendJson(res, { error: "Not found" }, 404);
      return true;
    }
    const record = next[index];
    const settings = loadSettings();
    const jellyseerrUrl = getSeerUrl(settings);
    const jellyseerrKey = getSeerApiKey(settings);
    if (jellyseerrUrl && jellyseerrKey && record?.jellyseerr_request_id) {
      const base = jellyseerrUrl.replace(/\/+$/, "");
      const targetUrl = `${base}/api/v1/request/${record.jellyseerr_request_id}`;
      const response = await safeFetch(targetUrl, {
        method: "DELETE",
        headers: { "X-Api-Key": jellyseerrKey },
      });
      if (!response.ok) {
        const publicBase = extractPublicBase(response.text);
        if (publicBase) {
          await safeFetch(`${base}${publicBase}/api/v1/request/${record.jellyseerr_request_id}`, {
            method: "DELETE",
            headers: { "X-Api-Key": jellyseerrKey },
          });
        }
      }
    }
    next[index] = { ...record, status: "rejected", updated_at: new Date().toISOString() };
    writeData(next);
    const actor = getActor(req) || "dashboard";
    updateTelegramMediaStatus(
      next[index],
      "❌ <b>REJECTED</b>",
      actor,
      `❌ Rejected by ${actor}`
    ).catch((err) => {
      writeLog(errorLogFile, `telegram_media_update_failed reject ${id} ${err?.message || err || "unknown_error"}`);
    });
    appendAudit("media-request.reject", getActor(req), {
      id,
      title: record?.title || record?.media_title,
    });
    sendJson(res, next[index]);
    return true;
  }

  if (method === "POST" && parts.length === 2 && parts[1] === "mark-available") {
    const id = parts[0];
    const next = readData();
    const index = next.findIndex((item) => item.id === id);
    if (index === -1) {
      sendJson(res, { error: "Not found" }, 404);
      return true;
    }
    const settings = loadSettings();
    next[index] = await markMediaRequestAvailable({ record: next[index], settings });
    writeData(next);
    updateTelegramMediaStatus(
      next[index],
      "✅ <b>AVAILABLE</b>",
      "dashboard",
      "✅ Available"
    ).catch((err) => {
      writeLog(
        errorLogFile,
        `telegram_media_update_failed available ${id} ${err?.message || err || "unknown_error"}`
      );
    });
    appendAudit("media-request.mark-available", getActor(req), {
      id,
      title: next[index]?.title || next[index]?.media_title,
    });
    sendJson(res, next[index]);
    return true;
  }

  if ((method === "POST" || method === "DELETE") && parts.length === 2 && parts[1] === "delete") {
    const id = parts[0];
    const next = readData();
    const index = next.findIndex((item) => item.id === id);
    if (index === -1) {
      sendJson(res, { error: "Not found" }, 404);
      return true;
    }
    const record = next[index];
    const settings = loadSettings();
    const jellyseerrUrl = getSeerUrl(settings);
    const jellyseerrKey = getSeerApiKey(settings);
    const radarrUrl = getSetting(settings, "radarrUrl", "RADARR_URL");
    const radarrKey = getSetting(settings, "radarrApiKey", "RADARR_API_KEY");
    const sonarrUrl = getSetting(settings, "sonarrUrl", "SONARR_URL");
    const sonarrKey = getSetting(settings, "sonarrApiKey", "SONARR_API_KEY");

    const results = { jellyseerr: null, radarr: null, sonarr: null };

    const runDelete = async (url, label, headers) => {
      const response = await safeFetch(url, { method: "DELETE", headers });
      results[label] = response.ok ? "ok" : response.text || "error";
      return response;
    };

    if (jellyseerrUrl && jellyseerrKey && record?.jellyseerr_request_id) {
      const base = jellyseerrUrl.replace(/\/+$/, "");
      const targetUrl = `${base}/api/v1/request/${record.jellyseerr_request_id}`;
      let response = await runDelete(targetUrl, "jellyseerr", { "X-Api-Key": jellyseerrKey });
      if (!response.ok) {
        const publicBase = extractPublicBase(response.text);
        if (publicBase) {
          response = await runDelete(
            `${base}${publicBase}/api/v1/request/${record.jellyseerr_request_id}`,
            "jellyseerr",
            { "X-Api-Key": jellyseerrKey }
          );
        }
      }
    }

    if (record?.media_type === "movie" && radarrUrl && radarrKey && record?.tmdb_id) {
      const base = radarrUrl.replace(/\/+$/, "");
      const lookup = await safeFetch(`${base}/api/v3/movie?tmdbId=${record.tmdb_id}`, {
        headers: { "X-Api-Key": radarrKey, Accept: "application/json" },
      });
      if (lookup.ok) {
        try {
          const list = lookup.text ? JSON.parse(lookup.text) : [];
          const movie = Array.isArray(list) ? list[0] : null;
          if (movie?.id) {
            await runDelete(`${base}/api/v3/movie/${movie.id}?deleteFiles=true`, "radarr", {
              "X-Api-Key": radarrKey,
            });
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    if (record?.media_type === "tv" && sonarrUrl && sonarrKey && record?.imdb_id) {
      const base = sonarrUrl.replace(/\/+$/, "");
      const lookup = await safeFetch(
        `${base}/api/v3/series/lookup?term=${encodeURIComponent(`imdb:${record.imdb_id}`)}`,
        { headers: { "X-Api-Key": sonarrKey, Accept: "application/json" } }
      );
      if (lookup.ok) {
        try {
          const list = lookup.text ? JSON.parse(lookup.text) : [];
          const series = Array.isArray(list) ? list[0] : null;
          if (series?.id) {
            await runDelete(`${base}/api/v3/series/${series.id}?deleteFiles=true`, "sonarr", {
              "X-Api-Key": sonarrKey,
            });
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    next.splice(index, 1);
    writeData(next);
    appendAudit("media-request.delete", getActor(req), {
      id,
      title: record?.title || record?.media_title,
    });
    sendJson(res, { ok: true, results });
    return true;
  }

  if (method === "POST" && parts.length === 1 && parts[0] === "check-status") {
    const result = await reconcileMediaRequests({ full: true });
    sendJson(res, result);
    return true;
  }

  if (method === "POST" && parts.length === 1 && parts[0] === "check-availability") {
    const result = await reconcileMediaRequests({ full: true });
    sendJson(res, result);
    return true;
  }

  return false;
};

const proxyToService = async (req, res, { urlKey, apiKeyKey, label, envUrlKey, envApiKeyKey, routePrefix = "" }) => {
  const settings = loadSettings();
  let baseUrl = process.env[envUrlKey] || settings?.[urlKey];
  if (baseUrl && !String(baseUrl).includes("://")) {
    baseUrl = `http://${baseUrl}`;
  }
  const apiKey = process.env[envApiKeyKey] || settings?.[apiKeyKey];
  if (!baseUrl) {
    res.statusCode = 400;
    res.end(`${label} URL not set.`);
    return true;
  }
  if (!apiKey) {
    res.statusCode = 400;
    res.end(`${label} API key not set.`);
    return true;
  }
  let reqPath = req.url || "/";
  if (routePrefix && reqPath.startsWith(routePrefix)) {
    reqPath = reqPath.slice(routePrefix.length) || "/";
  }
  const base = baseUrl.replace(/\/+$/, "");
  let targetUrl = `${base}${reqPath.startsWith("/") ? "" : "/"}${reqPath}`;
  const method = req.method || "GET";
  const headers = {
    "X-Api-Key": apiKey,
    "accept-encoding": "identity",
  };
  if (req.headers["content-type"]) headers["content-type"] = req.headers["content-type"];
  let body = undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await new Promise((resolve) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", () => resolve(null));
    });
  }
  const tryRequest = async (url) => await fetch(url, { method, headers, body });
  const withHttpFallback = (url) =>
    url.startsWith("https://") ? `http://${url.slice("https://".length)}` : url;

  try {
    writeLog(serviceProxyLog, `${label} ${method} ${reqPath} -> ${targetUrl}`);
    let upstream = await tryRequest(targetUrl);
    if (!upstream.ok) {
      const fallbackUrl = withHttpFallback(targetUrl);
      if (fallbackUrl !== targetUrl) {
        writeLog(serviceProxyLog, `${label} retry ${method} ${reqPath} -> ${fallbackUrl}`);
        upstream = await tryRequest(fallbackUrl);
      }
    }
    res.statusCode = upstream.status;
    writeLog(serviceProxyLog, `${label} ${method} ${reqPath} <- ${upstream.status}`);
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") return;
      res.setHeader(key, value);
    });
    const buffer = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get("content-type") || "";
    const preview = buffer.toString("utf8", 0, 200).replace(/\s+/g, " ").trim();
    writeLog(serviceProxyLog, `${label} ${method} ${reqPath} content-type=${contentType}`);
    if (preview) {
      writeLog(serviceProxyLog, `${label} ${method} ${reqPath} preview=${preview}`);
    }
    res.end(buffer);
    return true;
  } catch (err) {
    const message = err?.message || String(err || "unknown_error");
    res.statusCode = 502;
    res.end(`Failed to reach ${label} server at ${targetUrl}: ${message}`);
    writeLog(serviceProxyLog, `${label} ${method} ${reqPath} !! ${message}`);
    return true;
  }
};

const handleEmbyProxy = async (req, res) => {
  const settings = loadSettings();
  const baseUrl = settings?.embyUrl;
  const apiKey = String(settings?.apiKey || "").trim();
  if (!baseUrl) {
    res.statusCode = 400;
    res.end("Emby URL not set.");
    return true;
  }
  if (!apiKey) {
    res.statusCode = 400;
    res.end("Emby API key not set.");
    return true;
  }
  let reqPath = req.url || "/";
  if (reqPath.startsWith("/api/emby")) {
    reqPath = reqPath.replace(/^\/api\/emby/, "") || "/";
  }
  const base = baseUrl.replace(/\/+$/, "");
  const targetUrl = `${base}${reqPath.startsWith("/") ? "" : "/"}${reqPath}`;
  const method = req.method || "GET";

  const headers = {
    "X-Emby-Token": apiKey,
  };
  if (req.headers["content-type"]) headers["content-type"] = req.headers["content-type"];
  if (req.headers["x-emby-authorization"]) {
    headers["x-emby-authorization"] = req.headers["x-emby-authorization"];
  }

  let body = undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await new Promise((resolve) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", () => resolve(null));
    });
  }

  try {
    const upstream = await fetch(targetUrl, { method, headers, body });
    res.statusCode = upstream.status;
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === "set-cookie") return;
      if (lower === "content-encoding") return;
      if (lower === "content-length") return;
      res.setHeader(key, value);
    });
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.end(buffer);
    writeLog(embyProxyLog, `${method} ${reqPath} -> ${upstream.status}`);
    return true;
  } catch {
    res.statusCode = 502;
    res.end("Failed to reach Emby server.");
    writeLog(embyProxyLog, `${method} ${reqPath} -> 502 proxy_error`);
    return true;
  }
};

const handleEmbySso = async (req, res) => {
  const settings = loadSettings();
  const embyUrl = settings?.embyUrl;
  const apiKey = String(settings?.apiKey || "").trim();
  if (!embyUrl || !apiKey) {
    sendJson(res, { ok: false, error: "Emby settings missing." }, 400);
    return true;
  }

  let embyUserId = "";
  let embyToken = "";
  if (req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    embyUserId = String(url.searchParams.get("embyUserId") || "");
    embyToken = String(url.searchParams.get("embyToken") || "");
  } else if (req.method === "POST") {
    const body = await getBody(req);
    try {
      const payload = body ? JSON.parse(body) : {};
      embyUserId = String(payload.embyUserId || "");
      embyToken = String(payload.embyToken || "");
    } catch {
      // ignore parse errors
    }
  } else {
    return false;
  }

  if (!embyUserId || !embyToken) {
    sendJson(res, { ok: false, error: "Missing embyUserId/embyToken." }, 400);
    return true;
  }

  const base = embyUrl.replace(/\/+$/, "");
  const headers = { "X-Emby-Token": embyToken };

  const fetchUser = async (url) => {
    const resp = await safeFetch(url, { headers });
    if (!resp.ok) return { ok: false, status: resp.status, text: resp.text };
    try {
      const user = resp.text ? JSON.parse(resp.text) : null;
      return { ok: true, user };
    } catch {
      return { ok: false, status: 500, text: "Invalid Emby response." };
    }
  };

  let result = await fetchUser(`${base}/Users/${embyUserId}?api_key=${apiKey}`);
  if (!result.ok) {
    const me = await fetchUser(`${base}/Users/Me?api_key=${apiKey}`);
    if (!me.ok || me.user?.Id !== embyUserId) {
      sendJson(res, { ok: false, error: "Emby token invalid." }, 401);
      return true;
    }
    result = me;
  }

  const user = result.user || {};
  sendJson(res, {
    ok: true,
    user: { Id: user.Id, Name: user.Name || user.Username || "" },
    token: embyToken,
  });
  return true;
};

const handleEmbyPassword = async (req, res) => {
  if (req.method !== "POST") return false;
  const body = await getBody(req);
  let payload = {};
  try {
    payload = body ? JSON.parse(body) : {};
  } catch {
    payload = {};
  }

  const userId = String(payload.userId || "").trim();
  const token = String(payload.token || "").trim();
  const currentPassword = String(payload.currentPassword || "");
  const newPassword = String(payload.newPassword || "");

  if (!userId || !token) {
    sendJson(res, { ok: false, error: "Missing user session." }, 400);
    return true;
  }
  if (!newPassword || !isStrongPassword(newPassword)) {
    sendJson(
      res,
      {
        ok: false,
        error:
          "Password must be 6+ characters with upper, lower, and number.",
      },
      400
    );
    return true;
  }

  const settings = loadSettings();
  const { base } = getEmbyAdminSettings(settings);
  if (!base) {
    sendJson(res, { ok: false, error: "Emby URL not set." }, 400);
    return true;
  }

  const url = `${base}/Users/${userId}/Password`;
  const resp = await safeFetch(url, {
    method: "POST",
    headers: {
      "X-Emby-Token": token,
      "Content-Type": "application/json",
      "accept-encoding": "identity",
    },
    body: JSON.stringify({ CurrentPw: currentPassword || null, NewPw: newPassword }),
  });

  if (!resp.ok) {
    sendJson(res, { ok: false, error: resp.text || "Failed to update password." }, 400);
    return true;
  }

  sendJson(res, { ok: true });
  return true;
};


const enrichSeerAvailabilityFromEmby = async ({ reqPath, payload, settings }) => {
  if (!payload || typeof payload !== "object") return payload;
  const embyUrl = getSetting(settings, "embyUrl", "EMBY_URL");
  const embyApiKey = getSetting(settings, "apiKey", "EMBY_API_KEY");
  if (!embyUrl || !embyApiKey) return payload;

  const markAvailable = (obj) => {
    if (!obj || typeof obj !== "object") return;
    obj.mediaInfo = {
      ...(obj.mediaInfo || {}),
      status: 5,
      statusText: "available",
      hasFile: true,
    };
  };

  if (reqPath.startsWith("/api/v1/search")) {
    const results = Array.isArray(payload?.results) ? payload.results : [];
    for (const item of results) {
      const alreadyAvailable = isSeerMediaAvailable(item);
      if (alreadyAvailable) continue;
      const tmdbId = Number(item?.id || item?.tmdbId || item?.mediaId || NaN);
      if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;
      const mediaType = normalizeMediaType(item?.mediaType || item?.media_type || "movie");
      const existsInEmby = await isEmbyMediaAvailableByTmdb({
        embyUrl,
        embyApiKey,
        mediaType,
        tmdbId,
        tvdbId: item?.tvdbId || item?.externalIds?.tvdbId,
        imdbId: item?.imdbId || item?.externalIds?.imdbId,
      });
      if (existsInEmby) markAvailable(item);
    }
    return payload;
  }

  if (reqPath.startsWith("/api/v1/movie/") || reqPath.startsWith("/api/v1/tv/")) {
    if (isSeerMediaAvailable(payload)) return payload;
    const mediaType = reqPath.startsWith("/api/v1/tv/") ? "tv" : "movie";
    const rawId = reqPath.split("?")[0].split("/").filter(Boolean).pop();
    const tmdbId = Number(rawId || payload?.id || NaN);
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) return payload;
    const existsInEmby = await isEmbyMediaAvailableByTmdb({
      embyUrl,
      embyApiKey,
      mediaType,
      tmdbId,
      tvdbId: payload?.tvdbId || payload?.mediaInfo?.tvdbId || payload?.externalIds?.tvdbId,
      imdbId: payload?.imdbId || payload?.externalIds?.imdbId,
    });
    if (existsInEmby) markAvailable(payload);
    return payload;
  }

  return payload;
};

const handleSeerProxy = async (req, res) => {
  const settings = loadSettings();
  const baseUrl = settings?.seerUrl || settings?.jellyseerrUrl;
  const apiKey = settings?.seerApiKey || settings?.jellyseerrApiKey;
  const isUserAuth = req.headers["x-seer-auth"] === "user";
  if (!baseUrl) {
    res.statusCode = 400;
    res.end("Seer URL not set.");
    return true;
  }
  if (!apiKey && !isUserAuth) {
    res.statusCode = 400;
    res.end("Seer API key not set.");
    return true;
  }

  let reqPath = req.url || "/";
  if (reqPath.startsWith("/api/seer")) {
    reqPath = reqPath.replace(/^\/api\/seer/, "") || "/";
  } else if (reqPath.startsWith("/api/jellyseerr")) {
    reqPath = reqPath.replace(/^\/api\/jellyseerr/, "") || "/";
  }
  const base = baseUrl.replace(/\/+$/, "");
  const targetUrl = `${base}${reqPath.startsWith("/") ? "" : "/"}${reqPath}`;
  const method = req.method || "GET";

  const headers = {};
  if (!isUserAuth && apiKey) headers["x-api-key"] = apiKey;
  if (req.headers["content-type"]) headers["content-type"] = req.headers["content-type"];
  if (req.headers.cookie) headers.cookie = req.headers.cookie;
  if (req.headers.authorization) headers.authorization = req.headers.authorization;

  let body = undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await new Promise((resolve) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", () => resolve(null));
    });
  }

  const rewriteSetCookie = (value) => {
    if (!value) return value;
    let next = value.replace(/;\s*Domain=[^;]+/gi, "");
    next = next.replace(/;\s*Secure/gi, "");
    next = next.replace(/SameSite=None/gi, "SameSite=Lax");
    return next;
  };

  try {
    const upstream = await fetch(targetUrl, { method, headers, body });
    res.statusCode = upstream.status;
    const setCookieList =
      typeof upstream.headers.getSetCookie === "function"
        ? upstream.headers.getSetCookie()
        : null;
    if (setCookieList && setCookieList.length > 0) {
      res.setHeader("set-cookie", setCookieList.map((cookie) => rewriteSetCookie(cookie)));
    }
    if ((reqPath || "").startsWith("/api/v1/auth/emby")) {
      const logLine = `[seer-auth] ${method} ${reqPath} -> ${upstream.status} cookies=${
        setCookieList ? setCookieList.length : 0
      }`;
      writeLog(embyProxyLog, logLine);
    }
    const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();
    let bodyBuffer = null;

    if ((method === "GET" || method === "HEAD") && contentType.includes("application/json")) {
      const rawText = await upstream.text();
      let outputText = rawText;
      if (method === "GET" && reqPath.startsWith("/api/v1/")) {
        try {
          const parsed = rawText ? JSON.parse(rawText) : null;
          const enriched = await enrichSeerAvailabilityFromEmby({ reqPath, payload: parsed, settings });
          outputText = JSON.stringify(enriched);
        } catch {
          outputText = rawText;
        }
      }
      bodyBuffer = Buffer.from(outputText);
    } else {
      bodyBuffer = Buffer.from(await upstream.arrayBuffer());
    }

    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === "set-cookie" || lower === "content-length") return;
      res.setHeader(key, value);
    });
    res.setHeader("content-length", String(bodyBuffer.length));
    res.end(bodyBuffer);
    return true;
  } catch {
    res.statusCode = 502;
    res.end("Failed to reach Seer server.");
    return true;
  }
};

const getMimeType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html";
  if (ext === ".js") return "text/javascript";
  if (ext === ".css") return "text/css";
  if (ext === ".json") return "application/json";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".ico") return "image/x-icon";
  if (ext === ".woff") return "font/woff";
  if (ext === ".woff2") return "font/woff2";
  return "application/octet-stream";
};

const serveStatic = (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  if (pathname.startsWith("/emby-guide/")) {
    const embyGuidePath = path.join(embyGuideUploadsDir, pathname.replace(/^\/emby-guide\//, ""));
    if (
      embyGuidePath.startsWith(embyGuideUploadsDir) &&
      fs.existsSync(embyGuidePath) &&
      fs.statSync(embyGuidePath).isFile()
    ) {
      res.statusCode = 200;
      res.setHeader("Content-Type", getMimeType(embyGuidePath));
      fs.createReadStream(embyGuidePath).pipe(res);
      return true;
    }
  }
  const filePath = path.join(DIST, pathname);
  if (!filePath.startsWith(DIST)) return false;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.statusCode = 200;
    res.setHeader("Content-Type", getMimeType(filePath));
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    return true;
  }
  return false;
};

const serveSpa = (_req, res) => {
  const indexPath = path.join(DIST, "index.html");
  if (!fs.existsSync(indexPath)) {
    res.statusCode = 404;
    res.end("Not built yet. Run npm run build.");
    return true;
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html");
  fs.createReadStream(indexPath).pipe(res);
  return true;
};

const router = async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname || "/";

  if (pathname.startsWith("/api/settings")) return await handleSettings(req, res);
  if (pathname.startsWith("/api/emby-guide-images")) return await handleEmbyGuideImages(req, res, url);
  if (pathname.startsWith("/api/subscriptions")) return await handleSubscriptions(req, res);
  if (pathname.startsWith("/api/plans")) return await handlePlans(req, res);
  if (pathname.startsWith("/api/movie-requests")) return await handleMovieRequests(req, res);
  if (pathname.startsWith("/api/unlimited-users")) return await handleUnlimitedUsers(req, res);
  if (pathname.startsWith("/api/user-tags")) return await handleUserTags(req, res);
  if (pathname.startsWith("/api/user-contacts")) return await handleUserContacts(req, res);
  if (pathname.startsWith("/api/chats")) return await handleChats(req, res);
  if (pathname.startsWith("/api/chat-attachments")) return await handleChatAttachments(req, res, url);
  if (pathname.startsWith("/api/client-errors")) return await handleClientErrors(req, res);
  if (pathname.startsWith("/api/slips")) return await handleSlip(req, res, url);
  if (pathname.startsWith("/api/registrations")) return await handleRegistrations(req, res, url);
  if (pathname.startsWith("/api/tunnel")) return await handleTunnel(req, res);
  if (pathname.startsWith("/api/telegram-bot")) return await handleTelegramBot(req, res);
  if (pathname.startsWith("/api/status")) return await handleStatus(req, res);
  if (pathname.startsWith("/api/policy-sync")) return await handlePolicySync(req, res);
  if (pathname.startsWith("/api/media-events")) return await handleMediaEvents(req, res);
  if (pathname.startsWith("/api/sso/emby")) return await handleEmbySso(req, res);
  if (pathname.startsWith("/api/emby-password")) return await handleEmbyPassword(req, res);
  if (pathname.startsWith("/api/emby")) return await handleEmbyProxy(req, res);
  if (pathname.startsWith("/api/seer") || pathname.startsWith("/api/jellyseerr")) return await handleSeerProxy(req, res);
  if (pathname.startsWith("/api/sonarr")) {
    return await proxyToService(req, res, {
      urlKey: "sonarrUrl",
      apiKeyKey: "sonarrApiKey",
      envUrlKey: "SONARR_URL",
      envApiKeyKey: "SONARR_API_KEY",
      label: "Sonarr",
      routePrefix: "/api/sonarr",
    });
  }
  if (pathname.startsWith("/api/radarr")) {
    return await proxyToService(req, res, {
      urlKey: "radarrUrl",
      apiKeyKey: "radarrApiKey",
      envUrlKey: "RADARR_URL",
      envApiKeyKey: "RADARR_API_KEY",
      label: "Radarr",
      routePrefix: "/api/radarr",
    });
  }

  if (pathname.startsWith("/api/media-requests")) {
    const subPath = pathname.replace(/^\/api\/media-requests\/?/, "");
    const parts = subPath ? subPath.split("/").filter(Boolean) : [];
    return await handleMediaRequests(req, res, parts);
  }

  if (serveStatic(req, res)) return true;
  return serveSpa(req, res);
};

const server = http.createServer(async (req, res) => {
  try {
    const handled = await router(req, res);
    if (!handled && !res.writableEnded) {
      res.statusCode = 404;
      res.end("Not found");
    }
  } catch (err) {
    logRequestError(req, err);
    res.statusCode = 500;
    res.end(err?.message || "Server error");
  }
});

bootstrapBackups();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});

const schedulePolicySync = () => {
  syncPlaybackLibraries().catch((err) => {
    writeLog(errorLogFile, `policy_sync_failed ${err?.message || err || "unknown_error"}`);
  });
};

try {
  fs.watch(subscriptionsFile, schedulePolicySync);
  fs.watch(unlimitedFile, schedulePolicySync);
  fs.watch(settingsFile, schedulePolicySync);
} catch {
  // ignore fs.watch errors on unsupported filesystems
}

setTimeout(schedulePolicySync, 3 * 1000);
setInterval(schedulePolicySync, POLICY_SYNC_INTERVAL_MS);

const scheduleMediaRequestSync = () => {
  reconcileMediaRequests().catch((err) => {
    writeLog(errorLogFile, `media_request_sync_failed ${err?.message || err || "unknown_error"}`);
  });
};

setTimeout(scheduleMediaRequestSync, 5 * 1000);
setInterval(scheduleMediaRequestSync, MEDIA_REQUEST_SYNC_INTERVAL_MS);
