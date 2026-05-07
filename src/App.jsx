import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import SettingsPage from "./pages/SettingsPage";
import SubscriptionsPage from "./pages/SubscriptionsPage";
import ApprovalsPage from "./pages/ApprovalsPage";
import PaymentsReceivedPage from "./pages/PaymentsReceivedPage";
import PlansPage from "./pages/PlansPage";
import UsersPage from "./pages/UsersPage";
import RequestsPage from "./pages/RequestsPage";
import PaymentHistoryPage from "./pages/PaymentHistoryPage";
import UserSettingsPage from "./pages/UserSettingsPage";
import DashboardPage from "./pages/DashboardPage";
import AdminMediaRequestsPage from "./pages/AdminMediaRequestsPage";
import RegistrationsPage from "./pages/RegistrationsPage";
import EmbyLoginGuidePage from "./pages/EmbyLoginGuidePage";
import UserChatPage from "./pages/UserChatPage";
import AdminChatsPage from "./pages/AdminChatsPage";
import ErrorBoundary from "./components/ErrorBoundary";
import * as api from "./lib/api.js";
import supabase from "./lib/supabase.js";
import "./App.css";

// ═══════════════════════════════════════════════════════════
// TODO: REMOVE BEFORE PRODUCTION
// "Start Watching →" button in the landing page nav currently
// bypasses login with a mock session for testing.
// Search for "TODO: REMOVE BEFORE PRODUCTION" to find & revert.
// ═══════════════════════════════════════════════════════════

const ADMIN_CREDENTIALS = { username: "admin", password: "Hucks4rn" };
const EMBY_ADMIN_USERNAME = "hucksarn";
const normalizeAdminUsers = (value) => {
  const raw = Array.isArray(value) ? value.join(",") : String(value || "");
  const list = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (EMBY_ADMIN_USERNAME) {
    list.push(EMBY_ADMIN_USERNAME.toLowerCase());
  }
  return Array.from(new Set(list));
};
const LS_SETTINGS = "movieflix_settings";
const LS_USERS = "movieflix_synced_users";
const LS_SESSION = "movieflix_session";
const LS_PLANS = "movieflix_subscription_plans";
const LS_SUBSCRIPTIONS = "movieflix_subscriptions";
const LS_UNLIMITED_USERS = "movieflix_unlimited_users";
const LS_USER_TAGS = "movieflix_user_tags";
const LS_USER_CONTACTS = "movieflix_user_contacts";
const LS_MOVIE_REQUESTS = "movieflix_movie_requests";
const TIME_ZONE_OFFSET = "+05:00";
const BASE_URL = '/';
const API_BASE = BASE_URL.replace(/\/+$/, "");
const normalizeRegistrationVerificationMode = (value) => {
  const mode = String(value || "both").trim().toLowerCase();
  if (mode === "email" || mode === "sms" || mode === "both") return mode;
  return "both";
};
const logClientError = async (payload) => {
  try {
    await fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // ignore logging errors
  }
};

const AppErrorFallback = () => (
  <section className="card">
    <div className="section-title">Page failed to load</div>
    <div className="muted">The error was logged on the server. Refresh and try again.</div>
  </section>
);

const getSettings = () => JSON.parse(localStorage.getItem(LS_SETTINGS) || "{}");
const saveSettings = (settings) => localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
const clearSettings = () => localStorage.removeItem(LS_SETTINGS);
const getSyncedUsers = () => JSON.parse(localStorage.getItem(LS_USERS) || "[]");
const saveSyncedUsers = (users) => localStorage.setItem(LS_USERS, JSON.stringify(users));
const getSession = () => JSON.parse(localStorage.getItem(LS_SESSION) || "null");
const saveSession = (session) => localStorage.setItem(LS_SESSION, JSON.stringify(session));
const clearSession = () => localStorage.removeItem(LS_SESSION);
const getPlans = () => JSON.parse(localStorage.getItem(LS_PLANS) || "[]");
const savePlans = (plans) => localStorage.setItem(LS_PLANS, JSON.stringify(plans));
const normalizeSubscriptions = (subs) => {
  if (!Array.isArray(subs)) return [];
  return subs.map((sub) => ({
    ...sub,
    currency: sub?.currency === "USD" || !sub?.currency ? "MVR" : sub.currency,
  }));
};

const sanitizeSubscriptionsForStorage = (subs) =>
  (subs || []).map((sub) => {
    const { slipData, ...rest } = sub || {};
    return rest;
  });
const getSubscriptions = () =>
  normalizeSubscriptions(JSON.parse(localStorage.getItem(LS_SUBSCRIPTIONS) || "[]"));
const saveSubscriptions = (subs) =>
  localStorage.setItem(
    LS_SUBSCRIPTIONS,
    JSON.stringify(sanitizeSubscriptionsForStorage(subs))
  );
const getUnlimitedUsers = () =>
  JSON.parse(localStorage.getItem(LS_UNLIMITED_USERS) || "[]");
const saveUnlimitedUsers = (list) =>
  localStorage.setItem(LS_UNLIMITED_USERS, JSON.stringify(list));
const normalizeUserTags = (tags) => {
  if (!tags || typeof tags !== "object") return {};
  const next = {};
  Object.entries(tags).forEach(([key, list]) => {
    const normalized = Array.from(
      new Set(
        (Array.isArray(list) ? list : [])
          .map((tag) => String(tag || "").trim().toLowerCase())
          .filter(Boolean)
      )
    );
    if (normalized.length > 0) {
      next[key] = normalized;
    }
  });
  return next;
};

const getUserTags = () => {
  const raw = localStorage.getItem(LS_USER_TAGS) || "{}";
  try {
    const parsed = JSON.parse(raw);
    return normalizeUserTags(parsed);
  } catch {
    return {};
  }
};
const saveUserTags = (tags) =>
  localStorage.setItem(LS_USER_TAGS, JSON.stringify(tags));
const normalizeUserContacts = (contacts) => {
  if (!contacts || typeof contacts !== "object") return {};
  const next = {};
  Object.entries(contacts).forEach(([key, entry]) => {
    const contactKey = String(key || "").trim().toLowerCase();
    if (!contactKey || !entry || typeof entry !== "object") return;
    const email = String(entry.email || "").trim().toLowerCase();
    const phone = String(entry.phone || "").trim();
    if (!email && !phone) return;
    next[contactKey] = {
      email,
      phone,
      updatedAt: entry.updatedAt || new Date().toISOString(),
    };
  });
  return next;
};
const getUserContacts = () => {
  const raw = localStorage.getItem(LS_USER_CONTACTS) || "{}";
  try {
    return normalizeUserContacts(JSON.parse(raw));
  } catch {
    return {};
  }
};
const saveUserContacts = (contacts) =>
  localStorage.setItem(LS_USER_CONTACTS, JSON.stringify(normalizeUserContacts(contacts)));
const getMovieRequests = () =>
  JSON.parse(localStorage.getItem(LS_MOVIE_REQUESTS) || "[]");
const saveMovieRequests = (requests) =>
  localStorage.setItem(LS_MOVIE_REQUESTS, JSON.stringify(requests));

const normalizeUrl = (value) => value.replace(/\/+$/, "");
const safeUUID = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const normalizeAccounts = (settings) => {
  if (Array.isArray(settings.accounts) && settings.accounts.length > 0) {
    return settings.accounts;
  }
  if (settings.accountName || settings.accountNumber || settings.bankName) {
    return [
      {
        id: safeUUID(),
        accountName: settings.accountName || "",
        accountNumber: settings.accountNumber || "",
        bankName: settings.bankName || "",
      },
    ];
  }
  return [];
};
const addDays = (dateValue, days) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString();
};
const toIsoFromDateInput = (value) => {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00${TIME_ZONE_OFFSET}`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
};
const diffInDays = (startIso, endIso) => {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
};

const fetchServerSettings = async () => {
  try { return await api.fetchSettings(); } catch { return null; }
};

const saveServerSettings = async (payload) => {
  try { await api.saveSettings(payload); } catch (e) { throw new Error(e.message || "Failed to persist settings."); }
};

const fetchServerSubscriptions = async () => {
  try { return await api.fetchSubscriptions(); } catch { return null; }
};

const runServerSubscriptionAction = async (action, payload = {}) => {
  try {
    switch (action) {
      case "submit-payment": await api.submitPayment(payload); break;
      case "approve-payment": await api.approvePayment(payload); break;
      case "reject-payment": await api.rejectPayment(payload.subscriptionId); break;
      case "delete-payment": await api.deletePayment(payload.subscriptionId); break;
      case "update-dates": await api.updatePaymentDates(payload.subscriptionId, payload); break;
      case "update-amount": await api.updatePaymentAmount(payload.subscriptionId, payload); break;
      case "add-manual-payment": await api.addManualPayment(payload); break;
      case "mark-playback-disabled": await api.markPlaybackDisabled(payload.subIds); break;
      case "upload-slip": await api.uploadSlip(payload.subscriptionId, payload.slipData); break;
      case "update-payment-date": await api.updatePaymentDate(payload.subscriptionId, payload); break;
      default: throw new Error(`Unknown action: ${action}`);
    }
    return { ok: true };
  } catch (e) {
    throw new Error(e.message || "Failed to persist subscription change.");
  }
};

const fetchServerPlans = async () => {
  try { return await api.fetchPlans(); } catch { return null; }
};

const fetchServerMovieRequests = async () => {
  try { return await api.fetchMediaRequests(); } catch { return null; }
};

const saveServerPlans = async (payload) => {
  try { await api.savePlans(payload); } catch (e) { throw new Error(e.message || "Failed to persist plans."); }
};

const saveServerMovieRequests = async (payload) => {
  // Legacy endpoint — now using media_requests table
  try {
    for (const req of payload) {
      await api.createMediaRequest(req);
    }
  } catch (e) {
    throw new Error(e.message || "Failed to persist movie requests.");
  }
};

const fetchServerUnlimitedUsers = async () => {
  try { return await api.fetchUnlimitedUsers(); } catch { return null; }
};

const saveServerUnlimitedUsers = async (payload) => {
  try { await api.saveUnlimitedUsers(payload); } catch (e) { throw new Error(e.message || "Failed to persist unlimited users."); }
};

const fetchServerUserTags = async () => {
  try { return await api.fetchUserTags(); } catch { return null; }
};

const saveServerUserTags = async (payload) => {
  try { await api.saveUserTags(payload); } catch (e) { throw new Error(e.message || "Failed to persist user tags."); }
};

const fetchServerUserContacts = async () => {
  try { return await api.fetchUserContacts(); } catch { return null; }
};

const saveServerUserContacts = async (payload) => {
  try { await api.saveUserContacts(payload); } catch (e) { throw new Error(e.message || "Failed to persist user contacts."); }
};

const getUtcMidnight = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime();
};

const getExpiredUserCount = (subscriptions) => {
  if (!Array.isArray(subscriptions) || subscriptions.length === 0) return 0;
  const latestByUser = new Map();
  subscriptions.forEach((sub) => {
    const key = sub.userKey || sub.userId || "";
    if (!key) return;
    const prev = latestByUser.get(key);
    const prevTime = prev ? new Date(prev.endDate || prev.submittedAt || 0).getTime() : 0;
    const nextTime = new Date(sub.endDate || sub.submittedAt || 0).getTime();
    if (!prev || nextTime >= prevTime) {
      latestByUser.set(key, sub);
    }
  });
  const todayUtc = getUtcMidnight();
  let count = 0;
  latestByUser.forEach((sub) => {
    const endTime = sub?.endDate ? new Date(sub.endDate).getTime() : null;
    const isExpired = typeof endTime === "number" && endTime < todayUtc;
    if (isExpired) count += 1;
  });
  return count;
};

const buildEmbyUrl = (_settings, path) => {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}/api/emby${normalized}`;
};

const authenticateEmby = async (username, password, settings) => {
  const response = await fetch(buildEmbyUrl(settings, "/Users/AuthenticateByName"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Emby-Authorization":
        'Emby Client="MovieFlix Dashboard", Device="Web", DeviceId="movieflix-web", Version="1.0.0"',
    },
    body: JSON.stringify({ Username: username, Pw: password }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Emby authentication failed.");
  }

  return response.json();
};

const fetchSeerJson = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}/api/seer${path}`, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Seer request failed.");
  }
  return response.json();
};

let cachedLibraryGuids = null;
let cachedSubscriptionGuid = null;
let cachedKidsGuids = null;
const fetchLibraryGuids = async () => {
  if (cachedLibraryGuids) {
    return { all: cachedLibraryGuids, subscription: cachedSubscriptionGuid, kids: cachedKidsGuids };
  }
  const response = await fetch(`${API_BASE}/api/emby/Library/SelectableMediaFolders`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to load libraries.");
  }
  const data = await response.json();
  const allGuids = (Array.isArray(data) ? data : [])
    .map((item) => item?.Guid || item?.Id || "")
    .filter(Boolean);
  const kidsGuids = (Array.isArray(data) ? data : [])
    .filter((item) => {
      const name = String(item?.Name || "").trim().toLowerCase();
      return name === "anime series" || name === "cartoons";
    })
    .map((item) => item?.Guid || item?.Id || "")
    .filter(Boolean);
  const subscription = (Array.isArray(data) ? data : []).find(
    (item) => String(item?.Name || "").trim().toLowerCase() === "subscription"
  );
  cachedLibraryGuids = allGuids;
  cachedSubscriptionGuid = subscription?.Guid || subscription?.Id || null;
  cachedKidsGuids = kidsGuids;
  return { all: cachedLibraryGuids, subscription: cachedSubscriptionGuid, kids: cachedKidsGuids };
};

const normalizeGuidList = (value) =>
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

const libraryPolicyForPlayback = async (user, enablePlayback) => {
  const { all, subscription, kids } = await fetchLibraryGuids();
  if (hasParentalRating(user?.Policy) && kids?.length) {
    return {
      EnableAllFolders: false,
      EnabledFolders: kids,
      EnableAllChannels: false,
      EnabledChannels: [],
    };
  }
  if (enablePlayback) {
    return {
      EnableAllFolders: false,
      EnabledFolders: subscription ? all.filter((guid) => guid !== subscription) : all,
      EnableAllChannels: true,
      EnabledChannels: [],
    };
  }
  return {
    EnableAllFolders: false,
    EnabledFolders: subscription ? [subscription] : [],
    EnableAllChannels: false,
    EnabledChannels: [],
  };
};

const shouldUpdateLibraryPolicy = (policy, target) => {
  if (!policy) return true;
  if (Boolean(policy.EnableAllFolders) !== Boolean(target.EnableAllFolders)) return true;
  if (Boolean(policy.EnableAllChannels) !== Boolean(target.EnableAllChannels)) return true;
  const leftFolders = normalizeGuidList(policy.EnabledFolders);
  const rightFolders = normalizeGuidList(target.EnabledFolders);
  if (leftFolders.length !== rightFolders.length) return true;
  for (let i = 0; i < leftFolders.length; i += 1) {
    if (leftFolders[i] !== rightFolders[i]) return true;
  }
  const leftChannels = normalizeGuidList(policy.EnabledChannels);
  const rightChannels = normalizeGuidList(target.EnabledChannels);
  if (leftChannels.length !== rightChannels.length) return true;
  for (let i = 0; i < leftChannels.length; i += 1) {
    if (leftChannels[i] !== rightChannels[i]) return true;
  }
  return false;
};

export default function App() {
  useEffect(() => {
    const handleError = (event) => {
      logClientError({
        type: "error",
        message: event?.message || "unknown_error",
        source: event?.filename || "",
        lineno: event?.lineno || null,
        colno: event?.colno || null,
        stack: event?.error?.stack || "",
        href: window.location.href,
      });
    };

    const handleRejection = (event) => {
      const reason = event?.reason;
      logClientError({
        type: "unhandledrejection",
        message: reason?.message || String(reason || "unknown_rejection"),
        stack: reason?.stack || "",
        href: window.location.href,
      });
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);
  const navigate = useNavigate();
  const location = useLocation();
  const routePath = (location?.pathname || "").replace(/^\/emby/, "") || "/";
  const isPaymentsReceived = routePath === "/payments-received";
  const tableRoutes = [
    "/users",
    "/approvals",
    "/payments-received",
    "/plans",
    "/media-requests",
    "/registrations",
  ];
  const isTableRoute = tableRoutes.includes(routePath);
  const [session, setSession] = useState(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return true;
    return !window.matchMedia("(max-width: 1100px)").matches;
  });
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [showRegister, setShowRegister] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotPhone, setForgotPhone] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [forgotStep, setForgotStep] = useState("form");
  const [forgotMessage, setForgotMessage] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerOtp, setRegisterOtp] = useState("");
  const [registerPhone, setRegisterPhone] = useState("");
  const [registerSmsCode, setRegisterSmsCode] = useState("");
  const [registerStep, setRegisterStep] = useState("form");
  const [registerMessage, setRegisterMessage] = useState("");
  const [registrations, setRegistrations] = useState([]);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [serverStatus, setServerStatus] = useState(null);
  const [serverStatusError, setServerStatusError] = useState("");
  const [themeMode, setThemeMode] = useState(() => {
    if (typeof window === "undefined") return "dark";
    return localStorage.getItem("movieflix_theme") || "dark";
  });
  const [settings, setSettingsState] = useState(() => {
    const base = getSettings();
    return { ...base, accounts: normalizeAccounts(base) };
  });
  const [savedSettings, setSavedSettings] = useState(() => {
    const base = getSettings();
    return { ...base, accounts: normalizeAccounts(base) };
  });
  const reportRenderError = useCallback(
    (error, info) => {
      logClientError({
        type: "react_render_error",
        message: error?.message || "render_error",
        stack: error?.stack || "",
        componentStack: info?.componentStack || "",
        route: routePath,
        href: window.location.href,
        username: session?.username || "",
      });
    },
    [routePath, session?.username]
  );
  const fetchServerStatus = useCallback(async () => {
    try {
      const data = await api.checkStatus();
      setServerStatus(data);
      setServerStatusError("");
    } catch (err) {
      setServerStatusError(err?.message || "Status check failed.");
    }
  }, []);

  const startCloudflareTunnel = useCallback(async () => {
    const response = await fetch("/api/tunnel/start", { method: "POST" });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Failed to start tunnel.");
    }
    await fetchServerStatus();
  }, [fetchServerStatus]);

  const stopCloudflareTunnel = useCallback(async () => {
    const response = await fetch("/api/tunnel/stop", { method: "POST" });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Failed to stop tunnel.");
    }
    await fetchServerStatus();
  }, [fetchServerStatus]);

  const startTelegramBot = useCallback(async () => {
    const response = await fetch("/api/telegram-bot/start", { method: "POST" });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Failed to start Telegram bot.");
    }
    await fetchServerStatus();
  }, [fetchServerStatus]);

  const stopTelegramBot = useCallback(async () => {
    const response = await fetch("/api/telegram-bot/stop", { method: "POST" });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Failed to stop Telegram bot.");
    }
    await fetchServerStatus();
  }, [fetchServerStatus]);
  const [syncedUsers, setSyncedUsersState] = useState(() => getSyncedUsers());
  const [plans, setPlans] = useState(() => getPlans());
  const [subscriptions, setSubscriptions] = useState(() => getSubscriptions());
  const [unlimitedUsers, setUnlimitedUsers] = useState(() => getUnlimitedUsers());
  const [userTags, setUserTags] = useState(() => getUserTags());
  const [userContacts, setUserContacts] = useState(() => getUserContacts());
  const [movieRequests, setMovieRequests] = useState(() => getMovieRequests());
  const [toasts, setToasts] = useState([]);
  const [trending, setTrending] = useState({ movies: [], shows: [] });
  const subscriptionsRef = useRef(subscriptions);
  const toastInitRef = useRef(false);
  const plansRef = useRef(plans);
  const unlimitedRef = useRef(unlimitedUsers);
  const tagsRef = useRef(userTags);
  const [showPwaInstall, setShowPwaInstall] = useState(false);

  useEffect(() => {
    const handler = () => setShowPwaInstall(true);
    window.addEventListener("beforeinstallprompt", handler, { once: true });
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  const contactsRef = useRef(userContacts);
  const movieRequestsRef = useRef(movieRequests);
  const playbackDisableAttemptedRef = useRef(new Set());
  const isAdmin = session?.role === "admin";
  const dashboardAlerts = useMemo(() => {
    const pendingApprovals = subscriptions.filter((sub) => sub.status === "pending").length;
    const openRequests = movieRequests.filter((req) => req.status !== "done").length;
    return {
      total: pendingApprovals + openRequests,
      pendingApprovals,
      openRequests,
    };
  }, [subscriptions, movieRequests]);

  useEffect(() => {
    if (!session || typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(max-width: 1100px)");
    const handle = (event) => {
      if (event.matches) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };
    handle(media);
    if (media.addEventListener) {
      media.addEventListener("change", handle);
    } else if (media.addListener) {
      media.addListener(handle);
    }
    return () => {
      if (media.removeEventListener) {
        media.removeEventListener("change", handle);
      } else if (media.removeListener) {
        media.removeListener(handle);
      }
    };
  }, [session]);

  const syncSeerUser = useCallback(
    async ({ username, password, embyUserId }) => {
      const seerUrl = settings.seerUrl || settings.jellyseerrUrl;
      const seerApiKey = settings.seerApiKey || settings.jellyseerrApiKey;
      if (!seerUrl || !seerApiKey) return null;
      const lowerName = String(username || "").toLowerCase();

      let userList = [];
      try {
        const data = await fetchSeerJson("/api/v1/user?take=1000&skip=0");
        userList = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
      } catch {
        userList = [];
      }

      const hasUser = userList.some((user) => {
        const jellyfinId =
          user?.jellyfinUserId || user?.jellyfinId || user?.jellyfin_id || "";
        const name = String(user?.displayName || user?.username || user?.name || "").toLowerCase();
        return (embyUserId && jellyfinId === embyUserId) || (lowerName && name === lowerName);
      });

      if (!hasUser) {
        try {
          const jellyfinUsers = await fetchSeerJson("/api/v1/settings/jellyfin/users");
          const candidates = Array.isArray(jellyfinUsers) ? jellyfinUsers : [];
          const match = candidates.find((user) => {
            const id = user?.Id || user?.id || user?.jellyfinUserId || "";
            const name = String(user?.Name || user?.name || user?.Username || "").toLowerCase();
            return (embyUserId && id === embyUserId) || (lowerName && name === lowerName);
          });
          if (match) {
            const jellyfinUserId = match?.Id || match?.id || match?.jellyfinUserId;
            await fetch(`${API_BASE}/api/seer/api/v1/user/import-from-jellyfin`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jellyfinUserId,
                userId: jellyfinUserId,
              }),
            });
          }
        } catch {
          // ignore import failures
        }
      }

      try {
          const authResponse = await fetch(`${API_BASE}/api/seer/api/v1/auth/jellyfin`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-seer-auth": "user",
          },
          credentials: "include",
          body: JSON.stringify({ username, password, rememberMe: true }),
        });
        if (!authResponse.ok) {
          const text = await authResponse.text();
          throw new Error(text || "Seer auth failed.");
        }
        const data = await authResponse.json();
        return data?.accessToken || data?.token || data?.jwt || null;
      } catch {
        return null;
      }
    },
    [settings.seerUrl, settings.seerApiKey, settings.jellyseerrUrl, settings.jellyseerrApiKey]
  );

  useEffect(() => {
    const savedSession = getSession();
    if (savedSession) {
      setSession(savedSession);
    }
    setSessionReady(true);
  }, []);

  useEffect(() => {
    if (!sessionReady || session) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search || "");
    const embyUserId = params.get("embyUserId") || "";
    const embyToken = params.get("embyToken") || "";
    if (!embyUserId || !embyToken) return;

    const runSso = async () => {
      try {
        const response = await fetch(
          `${API_BASE}/api/sso/emby?embyUserId=${encodeURIComponent(
            embyUserId
          )}&embyToken=${encodeURIComponent(embyToken)}`,
          { cache: "no-store" }
        );
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const data = await response.json();
        if (!data?.ok || !data?.user?.Id) {
          throw new Error("SSO failed.");
        }
        const freshSettings = (await fetchServerSettings()) || settings;
        const adminList = normalizeAdminUsers(freshSettings?.adminUsernames);
        const username = data.user.Name || "";
        const newSession = {
          username,
          role: adminList.includes(username.toLowerCase()) ? "admin" : "user",
          token: data.token || embyToken,
          userId: data.user.Id,
          sso: true,
        };
        saveSession(newSession);
        setSession(newSession);
        const url = new URL(window.location.href);
        url.searchParams.delete("embyUserId");
        url.searchParams.delete("embyToken");
        window.history.replaceState({}, "", url.toString());
        navigate("/dashboard", { replace: true });
      } catch (err) {
        setLoginMessage(err?.message || "SSO failed.");
      }
    };
    runSso();
  }, [sessionReady, session, settings, navigate]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("theme-light", themeMode === "light");
    if (typeof window !== "undefined") {
      localStorage.setItem("movieflix_theme", themeMode);
    }
  }, [themeMode]);

  useEffect(() => {
    let mounted = true;
    const loadServerSettings = async () => {
      try {
        const data = await fetchServerSettings();
        if (!mounted || !data) return;
        if (Object.keys(data).length === 0) {
          clearSettings();
          const empty = { accounts: [] };
          if (mounted) {
            setSettingsState(empty);
            setSavedSettings(empty);
          }
          return;
        }
        const next = { ...getSettings(), ...data };
        if (!next.accounts || next.accounts.length === 0) {
          next.accounts = normalizeAccounts(next);
        }
        saveSettings(next);
        if (mounted) {
          setSettingsState(next);
          setSavedSettings(next);
        }
      } catch {
        // Ignore server settings failures; fallback to local storage.
      }
    };
    loadServerSettings();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const data = await fetchServerSettings();
        if (cancelled || !data || Object.keys(data).length === 0) return;
        const next = { ...getSettings(), ...data };
        if (!next.accounts || next.accounts.length === 0) {
          next.accounts = normalizeAccounts(next);
        }
        const hasUnsavedAdminChanges =
          isAdmin && JSON.stringify(settings) !== JSON.stringify(savedSettings);
        if (hasUnsavedAdminChanges) return;
        saveSettings(next);
        setSettingsState(next);
        setSavedSettings(next);
      } catch {
        // ignore polling failures
      }
    }, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session, isAdmin, settings, savedSettings]);

  useEffect(() => {
    let mounted = true;
    const loadServerTags = async () => {
      try {
        const serverData = await fetchServerUserTags();
        if (!mounted || !serverData || typeof serverData !== "object") return;
        const localData = getUserTags();
        const normalizedServer = normalizeUserTags(serverData);
        const serverHasKeys = Object.keys(serverData).length > 0;
        const next = serverHasKeys ? normalizedServer : localData;
        if (next && Object.keys(next).length > 0 && !serverHasKeys) {
          saveServerUserTags(next).catch(() => {});
        }
        saveUserTags(next || {});
        if (mounted) setUserTags(next || {});
      } catch {
        // Ignore failures; fallback to local storage.
      }
    };
    loadServerTags();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadServerContacts = async () => {
      try {
        const serverData = await fetchServerUserContacts();
        if (!mounted || !serverData || typeof serverData !== "object") return;
        const localData = getUserContacts();
        const normalizedServer = normalizeUserContacts(serverData);
        const serverHasKeys = Object.keys(normalizedServer).length > 0;
        const next = serverHasKeys ? normalizedServer : localData;
        if (next && Object.keys(next).length > 0 && !serverHasKeys) {
          saveServerUserContacts(next).catch(() => {});
        }
        saveUserContacts(next || {});
        if (mounted) setUserContacts(next || {});
      } catch {
        // Ignore failures; fallback to local storage.
      }
    };
    loadServerContacts();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadServerPlans = async () => {
      try {
        const serverData = await fetchServerPlans();
        if (!mounted || !Array.isArray(serverData)) return;
        const localData = getPlans();
        const next = normalizeSubscriptions(serverData.length > 0 ? serverData : localData);
        if (next && next.length > 0 && serverData.length === 0) {
          saveServerPlans(next).catch(() => {});
        }
        savePlans(next || []);
        if (mounted) setPlans(next || []);
      } catch {
        // Ignore failures; fallback to local storage.
      }
    };
    loadServerPlans();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadServerMovieRequests = async () => {
      try {
        const serverData = await fetchServerMovieRequests();
        if (!mounted || !Array.isArray(serverData)) return;
        const localData = getMovieRequests();
        const next = serverData.length > 0 ? serverData : localData;
        if (next && next.length > 0 && serverData.length === 0) {
          saveServerMovieRequests(next).catch(() => {});
        }
        saveMovieRequests(next || []);
        if (mounted) setMovieRequests(next || []);
      } catch {
        // Ignore failures; fallback to local storage.
      }
    };
    loadServerMovieRequests();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadServerUnlimited = async () => {
      try {
        const serverData = await fetchServerUnlimitedUsers();
        if (!mounted || !Array.isArray(serverData)) return;
        const localData = getUnlimitedUsers();
        const next = serverData.length > 0 ? serverData : localData;
        if (next && next.length > 0 && serverData.length === 0) {
          saveServerUnlimitedUsers(next).catch(() => {});
        }
        saveUnlimitedUsers(next || []);
        if (mounted) setUnlimitedUsers(next || []);
      } catch {
        // Ignore failures; fallback to local storage.
      }
    };
    loadServerUnlimited();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadServerSubscriptions = async () => {
      try {
        const serverData = await fetchServerSubscriptions();
        if (!mounted || !Array.isArray(serverData)) return;
        const next = normalizeSubscriptions(serverData);
        saveSubscriptions(next || []);
        if (mounted) setSubscriptions(next || []);
      } catch {
        // Ignore failures; fallback to local storage.
      }
    };
    loadServerSubscriptions();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const base = getSettings();
    const normalized = { ...base, accounts: normalizeAccounts(base) };
    setSettingsState(normalized);
    setSavedSettings(normalized);
    setSyncedUsersState(getSyncedUsers());
    setPlans(getPlans());
    setSubscriptions(getSubscriptions());
    setUnlimitedUsers(getUnlimitedUsers());
    setUserTags(getUserTags());
    setMovieRequests(getMovieRequests());
  }, [session]);

  useEffect(() => {
    subscriptionsRef.current = subscriptions;
  }, [subscriptions]);

  const pushToast = useCallback((toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nextToast = {
      id,
      title: toast.title || "",
      message: toast.message || "",
      tone: toast.tone || "info",
    };
    setToasts((prev) => [nextToast, ...prev].slice(0, 4));
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4500);
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const serverData = await fetchServerSubscriptions();
        if (cancelled || !Array.isArray(serverData)) return;
        const next = normalizeSubscriptions(serverData);
        const prev = subscriptionsRef.current || [];
        const prevById = new Map(prev.map((sub) => [sub.id, sub]));
        const userKey = session?.userId || session?.username || "";
        if (toastInitRef.current) {
          next.forEach((sub) => {
            const prevSub = prevById.get(sub.id);
            if (!prevSub) {
              if (isAdmin && sub.status === "pending") {
                pushToast({
                  title: "New payment submitted",
                  message: `${sub.username || sub.userId || "User"} • ${sub.planName || "Plan"}`,
                  tone: "info",
                });
              }
              return;
            }
            if (prevSub.status !== sub.status) {
              const status = String(sub.status || "").toLowerCase();
              const label = status.charAt(0).toUpperCase() + status.slice(1);
              if (isAdmin) {
                pushToast({
                  title: `Payment ${label}`,
                  message: `${sub.username || sub.userId || "User"} • ${sub.planName || "Plan"}`,
                  tone: status === "approved" ? "success" : status === "rejected" ? "danger" : "info",
                });
              }
            }
          });
        }
        toastInitRef.current = true;
        saveSubscriptions(next || []);
        setSubscriptions(next || []);
      } catch {
        // ignore polling errors
      }
    };
    const interval = setInterval(poll, 2000);
    poll();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session, isAdmin, pushToast]);

  useEffect(() => {
    plansRef.current = plans;
  }, [plans]);

  useEffect(() => {
    unlimitedRef.current = unlimitedUsers;
  }, [unlimitedUsers]);

  useEffect(() => {
    tagsRef.current = userTags;
  }, [userTags]);

  useEffect(() => {
    contactsRef.current = userContacts;
  }, [userContacts]);

  useEffect(() => {
    movieRequestsRef.current = movieRequests;
  }, [movieRequests]);


  const sortedUsers = useMemo(() => {
    return [...syncedUsers].sort((a, b) => {
      const nameA = (a.Name || a.name || "").toLowerCase();
      const nameB = (b.Name || b.name || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [syncedUsers]);

  const ensureSettings = async () => {
    const hasEmby = (s) => (s.embyUrl || s.emby_url) && (s.apiKey || s.emby_api_key);
    if (hasEmby(settings)) return settings;
    try {
      const serverSettings = await fetchServerSettings();
      if (serverSettings && hasEmby(serverSettings)) {
        const next = { ...getSettings(), ...serverSettings };
        saveSettings(next);
        setSettingsState(next);
        return next;
      }
    } catch {
      // Ignore failures; handled below.
    }
    setLoginMessage("Admin must save Emby URL + API key before Emby login.");
    return null;
  };

  const isAllowedEmail = (value) => {
    const email = String(value || "").trim().toLowerCase();
    if (!email.includes("@")) return false;
    const domain = email.split("@").pop();
    return domain === "gmail.com";
  };

  const fetchRegistrations = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const data = await api.fetchRegistrations();
      setRegistrations(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    }
  }, [isAdmin]);

  const handleRequestOtp = async () => {
    setRegisterMessage("");
    const name = registerName.trim();
    const email = registerEmail.trim().toLowerCase();
    const phone = `+960${registerPhone}`;
    if (!name) {
      setRegisterMessage("Enter your name.");
      return;
    }
    if (!isAllowedEmail(email)) {
      setRegisterMessage("Use a gmail.com email.");
      return;
    }
    if (!registerPhone) {
      setRegisterMessage("Enter your phone number.");
      return;
    }
    try {
      const payload = await api.requestOTP({ name, email, phone });
      setRegisterStep("otp");
      const requiresEmailOtp = payload?.requiresEmailOtp !== false;
      const requiresSmsOtp = payload?.requiresSmsOtp === true;
      if (requiresEmailOtp && requiresSmsOtp) {
        setRegisterMessage("Email OTP and SMS OTP sent.");
      } else if (requiresEmailOtp) {
        setRegisterMessage("OTP sent. Check your email.");
      } else if (requiresSmsOtp) {
        setRegisterMessage("SMS OTP sent.");
      } else {
        setRegisterMessage("Verification started.");
      }
    } catch (err) {
      setRegisterMessage(err?.message || "Failed to send OTP.");
    }
  };

  const handleVerifyOtp = async () => {
    setRegisterMessage("");
    const email = registerEmail.trim().toLowerCase();
    const otp = registerOtp.trim();
    const smsCode = registerSmsCode.trim();
    const registrationMode = normalizeRegistrationVerificationMode(
      settings?.registrationVerificationMode
    );
    const requiresEmailOtp = registrationMode === "email" || registrationMode === "both";
    const requiresSmsOtp = registrationMode === "sms" || registrationMode === "both";
    if (requiresEmailOtp && !otp) {
      setRegisterMessage("Enter the OTP.");
      return;
    }
    if (requiresSmsOtp && !smsCode) {
      setRegisterMessage("Enter the SMS code.");
      return;
    }
    try {
      const code = requiresEmailOtp ? otp : smsCode;
      const payload = await api.verifyOTP(email, code);
      if (payload?.autoLogin?.username && payload?.autoLogin?.password) {
        try {
          const result = await api.authenticateEmby(
            payload.autoLogin.username,
            payload.autoLogin.password
          );
          const userId = result.user?.userId;
          const newSession = {
            username: payload.autoLogin.username,
            role: "user",
            token: result.user?.accessToken,
            userId,
          };
          saveSession(newSession);
          setSession(newSession);
          setShowRegister(false);
          setRegisterName("");
          setRegisterEmail("");
          setRegisterPhone("");
          setRegisterOtp("");
          setRegisterSmsCode("");
          setRegisterStep("done");
          setRegisterMessage("Registration complete. You are now logged in.");
          navigate("/dashboard", { replace: true });
          return;
        } catch {
          // fall back to normal completion message
        }
      }
      setRegisterStep("done");
      setRegisterMessage("Registration complete. Login details sent to your mobile number.");
    } catch (err) {
      setRegisterMessage(err?.message || "Failed to verify OTP.");
    }
  };

  const handleVerifySms = async () => {
    setRegisterMessage("");
    const email = registerEmail.trim().toLowerCase();
    const code = registerSmsCode.trim();
    if (!code) {
      setRegisterMessage("Enter the SMS code.");
      return;
    }
    try {
      const payload = await api.verifyOTP(email, code);
      if (payload?.autoLogin?.username && payload?.autoLogin?.password) {
        try {
          const result = await api.authenticateEmby(
            payload.autoLogin.username,
            payload.autoLogin.password
          );
          const userId = result.user?.userId;
          const newSession = {
            username: payload.autoLogin.username,
            role: "user",
            token: result.user?.accessToken,
            userId,
          };
          saveSession(newSession);
          setSession(newSession);
          setShowRegister(false);
          setRegisterName("");
          setRegisterEmail("");
          setRegisterPhone("");
          setRegisterOtp("");
          setRegisterSmsCode("");
          setRegisterStep("done");
          setRegisterMessage("Registration complete. You are now logged in.");
          navigate("/dashboard", { replace: true });
          return;
        } catch {
          // fall back to normal message
        }
      }
      setRegisterStep("done");
      setRegisterMessage("Registration complete. Login details sent to your mobile number.");
    } catch (err) {
      setRegisterMessage(err?.message || "Failed to verify SMS.");
    }
  };

  const handleForgotStart = async () => {
    setForgotMessage("");
    const phone = `+960${forgotPhone}`;
    if (!forgotPhone) {
      setForgotMessage("Enter your phone number.");
      return;
    }
    try {
      await api.requestOTP({ name: "User", email: forgotPhone, phone });
      setForgotStep("otp");
      setForgotMessage("OTP sent to your email.");
    } catch (err) {
      setForgotMessage(err?.message || "Failed to send reset OTP.");
    }
  };

  const handleForgotReset = async () => {
    setForgotMessage("");
    const phone = `+960${forgotPhone}`;
    const otp = forgotOtp.trim();
    if (!otp) {
      setForgotMessage("Enter OTP.");
      return;
    }
    try {
      const payload = await api.verifyOTP(phone, otp);
      setForgotMessage(payload?.recreated ? "Login details were sent to your email." : "Password reset successful. Check your email.");
      setForgotStep("done");
    } catch (err) {
      setForgotMessage(err?.message || "Failed to reset password.");
    }
  };

  const handleApproveRegistration = async (id) => {
    try {
      await api.approveRegistration(id);
      await fetchRegistrations();
    } catch {
      // ignore
    }
  };

  const handleRejectRegistration = async (id) => {
    try {
      await api.rejectRegistration(id);
      await fetchRegistrations();
    } catch {
      // ignore
    }
  };

  const handleDeleteRegistration = async (id) => {
    try {
      await supabase.from("registrations").delete().eq("id", id);
      await fetchRegistrations();
    } catch {
      // ignore
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginMessage("");

    const username = loginUser.trim();
    const password = loginPass;
    const isLocalAdmin = username.toLowerCase() === ADMIN_CREDENTIALS.username.toLowerCase();

    if (!username || !password) {
      setLoginMessage("Enter both username and password.");
      return;
    }

    if (isLocalAdmin && password === ADMIN_CREDENTIALS.password) {
      const newSession = { username, role: "admin" };
      saveSession(newSession);
      setSession(newSession);
      setShowRegister(false);
      setLoginUser("");
      setLoginPass("");
      navigate("/dashboard", { replace: true });
      return;
    }

    const readySettings = await ensureSettings();
    if (!readySettings) return;

    try {
      const result = await api.authenticateEmby(username, password);
      const userId = result.user?.userId;
      const isAdminUser = result.user?.role === "admin";
      const isSynced = syncedUsers.some(
        (user) =>
          (user.Id || user.id) === userId ||
          (user.Name || user.name || "").toLowerCase() === username.toLowerCase()
      );

      if (!isSynced && result.User) {
        const nextUsers = [result.User, ...syncedUsers];
        saveSyncedUsers(nextUsers);
        setSyncedUsersState(nextUsers);
      }

      const newSession = {
        username,
        role: isAdminUser ? "admin" : "user",
        token: result.user?.accessToken,
        userId,
      };
      const seerToken = await syncSeerUser({
        username,
        password,
        embyUserId: userId,
      });
      if (seerToken) {
        newSession.jellyseerrToken = seerToken;
      }
      saveSession(newSession);
      setSession(newSession);
      setShowRegister(false);
      setLoginUser("");
      setLoginPass("");
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setLoginMessage(error.message || "Login failed.");
    }
  };

  const handleRegister = () => {
    setLoginMessage("");
    setRegisterMessage("");
    setRegisterStep("form");
    setShowForgot(false);
    setShowRegister(true);
  };

  const handleLoginKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleLogin(event);
    }
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
    setLoginMessage("");
    navigate("/", { replace: true });
  };

  const handleSettingsSave = (event) => {
    event.preventDefault();
    const embyUrl = normalizeUrl(settings.embyUrl || "");
    const apiKey = (settings.apiKey || "").trim();

    if (!embyUrl || !apiKey) {
      setSettingsMessage("Emby URL and API key are required.");
      return;
    }

    const nextSettings = {
      ...settings,
      embyUrl,
      apiKey,
      seerUrl: settings.seerUrl || settings.jellyseerrUrl || "",
      seerApiKey: settings.seerApiKey || settings.jellyseerrApiKey || "",
      jellyseerrUrl: settings.seerUrl || settings.jellyseerrUrl || "",
      jellyseerrApiKey: settings.seerApiKey || settings.jellyseerrApiKey || "",
      allowUserThemeToggle: Boolean(settings.allowUserThemeToggle),
      disableAutoTrial: Boolean(settings.disableAutoTrial),
      telegramBotToken: settings.telegramBotToken || "",
      telegramAdminIds: settings.telegramAdminIds || "",
      telegramSetupComplete: Boolean(settings.telegramSetupComplete),
      adminUsernames: settings.adminUsernames || "",
      registrationVerificationMode: normalizeRegistrationVerificationMode(
        settings.registrationVerificationMode
      ),
      msgowlApiKey: settings.msgowlApiKey || "",
      msgowlOtpApiKey: settings.msgowlOtpApiKey || settings.msgowlApiKey || "",
      msgowlOtpBaseUrl: settings.msgowlOtpBaseUrl || "https://otp.msgowl.com",
      msgowlSender: settings.msgowlSender || "MovieFlix",
      accounts: normalizeAccounts(settings),
      accountName: settings.accountName || "",
      accountNumber: settings.accountNumber || "",
      bankName: settings.bankName || "",
      instructions: settings.instructions || "",
    };
    saveSettings(nextSettings);
    setSettingsState(nextSettings);
    setSavedSettings(nextSettings);
    saveServerSettings(nextSettings)
      .then(() => setSettingsMessage("Settings saved."))
      .catch(() => setSettingsMessage("Settings saved locally, but server sync failed."));
  };

  const handleSettingsSaveNow = () => {
    handleSettingsSave({ preventDefault: () => {} });
  };

  const handleSettingsDiscard = (section) => {
    const base = savedSettings || {};
    setSettingsState((prev) => {
      if (section === "emby") {
        return {
          ...prev,
          embyUrl: base.embyUrl || "",
          embyHomeUrl: base.embyHomeUrl || "",
          apiKey: base.apiKey || "",
        };
      }
      if (section === "seer" || section === "jellyseerr") {
        return {
          ...prev,
          seerUrl: base.seerUrl || base.jellyseerrUrl || "",
          seerApiKey: base.seerApiKey || base.jellyseerrApiKey || "",
          jellyseerrUrl: base.seerUrl || base.jellyseerrUrl || "",
          jellyseerrApiKey: base.seerApiKey || base.jellyseerrApiKey || "",
        };
      }
      if (section === "admins") {
        return {
          ...prev,
          adminUsernames: base.adminUsernames || "",
        };
      }
      if (section === "telegram") {
        return {
          ...prev,
          telegramBotToken: base.telegramBotToken || "",
          telegramAdminIds: base.telegramAdminIds || "",
          telegramSetupComplete: Boolean(base.telegramSetupComplete),
        };
      }
      if (section === "twilio") {
        return {
          ...prev,
          twilioAccountSid: base.twilioAccountSid || "",
          twilioAuthToken: base.twilioAuthToken || "",
          twilioVerifySid: base.twilioVerifySid || "",
          twilioBlockVoip: Boolean(base.twilioBlockVoip),
        };
      }
      if (section === "registrationVerification") {
        return {
          ...prev,
          registrationVerificationMode:
            normalizeRegistrationVerificationMode(base.registrationVerificationMode),
          msgowlApiKey: base.msgowlApiKey || "",
          msgowlOtpApiKey: base.msgowlOtpApiKey || base.msgowlApiKey || "",
          msgowlOtpBaseUrl: base.msgowlOtpBaseUrl || "https://otp.msgowl.com",
          msgowlSender: base.msgowlSender || "MovieFlix",
        };
      }
      if (section === "email") {
        return {
          ...prev,
          resendApiKey: base.resendApiKey || "",
          resendFrom: base.resendFrom || "",
        };
      }
      if (section === "guide") {
        return {
          ...prev,
          embyGuideSteps: Array.isArray(base.embyGuideSteps) ? base.embyGuideSteps : undefined,
          embyGuideMedia: Array.isArray(base.embyGuideMedia) ? base.embyGuideMedia : undefined,
        };
      }
      if (section === "servers") {
        return {
          ...prev,
          sonarrUrl: base.sonarrUrl || "",
          sonarrApiKey: base.sonarrApiKey || "",
          radarrUrl: base.radarrUrl || "",
          radarrApiKey: base.radarrApiKey || "",
        };
      }
      if (section === "accounts") {
        return {
          ...prev,
          accounts: normalizeAccounts(base),
          instructions: base.instructions || "",
        };
      }
      if (section === "appearance") {
        return {
          ...prev,
          allowUserThemeToggle: Boolean(base.allowUserThemeToggle),
        };
      }
      return prev;
    });
  };

  const handleAddPlan = (plan) => {
    if (!isAdmin) return;
    const nextPlan = {
      id: safeUUID(),
      durationDays: Number(plan.durationDays),
      ...plan,
    };
    const nextPlans = [nextPlan, ...plans];
    savePlans(nextPlans);
    setPlans(nextPlans);
    saveServerPlans(nextPlans).catch(() => {});
  };

  const handleAddMovieRequest = (request) => {
    const nextRequest = {
      id: safeUUID(),
      title: String(request.title || "").trim(),
      requestedBy: String(request.requestedBy || "").trim(),
      notes: String(request.notes || "").trim(),
      status: request.status || "open",
      requestedAt: new Date().toISOString(),
    };
    if (!nextRequest.title) return;
    const nextRequests = [nextRequest, ...movieRequests];
    saveMovieRequests(nextRequests);
    setMovieRequests(nextRequests);
    saveServerMovieRequests(nextRequests).catch(() => {});
  };

  const handleUpdateMovieRequest = (id, updates) => {
    const nextRequests = movieRequests.map((request) =>
      request.id === id ? { ...request, ...updates } : request
    );
    saveMovieRequests(nextRequests);
    setMovieRequests(nextRequests);
    saveServerMovieRequests(nextRequests).catch(() => {});
  };

  const handleRemoveMovieRequest = (id) => {
    const nextRequests = movieRequests.filter((request) => request.id !== id);
    saveMovieRequests(nextRequests);
    setMovieRequests(nextRequests);
    saveServerMovieRequests(nextRequests).catch(() => {});
  };

  const updateEmbyPolicy = async (userId, policy) => {
    const url = buildEmbyUrl(settings, `/Users/${userId}/Policy?api_key=${settings.apiKey}`);
    const payload = JSON.stringify(policy);
    const options = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    };
    let response = await fetch(url, options);
    if (!response.ok) {
      response = await fetch(url, { ...options, method: "PUT" });
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Failed to update Emby policy.");
    }
  };

  const fetchEmbyUser = async (userId) => {
    const response = await fetch(
      buildEmbyUrl(settings, `/Users/${userId}?api_key=${settings.apiKey}`)
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Failed to fetch Emby user.");
    }
    return response.json();
  };

  const setUserPlayback = async (userId, enable) => {
    if (!settings.embyUrl || !settings.apiKey || !userId) return false;
    let user = syncedUsers.find((item) => (item.Id || item.id) === userId);
    if (!user) {
      user = await fetchEmbyUser(userId);
    }
    if (!user?.Policy) return false;
    const desiredPlayback = Boolean(enable);
    const currentPolicy = user.Policy || {};
    const policy = { ...currentPolicy, EnableMediaPlayback: desiredPlayback };
    let libraryTarget = null;
    try {
      libraryTarget = await libraryPolicyForPlayback(user, desiredPlayback);
    } catch {
      libraryTarget = null;
    }
    if (libraryTarget) {
      policy.EnableAllFolders = libraryTarget.EnableAllFolders;
      policy.EnabledFolders = libraryTarget.EnabledFolders;
      policy.EnableAllChannels = libraryTarget.EnableAllChannels;
      policy.EnabledChannels = libraryTarget.EnabledChannels;
    }
    const needsPlaybackUpdate = Boolean(currentPolicy.EnableMediaPlayback) !== desiredPlayback;
    const needsLibraryUpdate = libraryTarget
      ? shouldUpdateLibraryPolicy(currentPolicy, libraryTarget)
      : false;
    if (!needsPlaybackUpdate && !needsLibraryUpdate) return false;
    await updateEmbyPolicy(userId, policy);
    setSyncedUsersState((prev) =>
      prev.map((item) =>
        (item.Id || item.id) === userId
          ? { ...item, Policy: { ...item.Policy, ...policy } }
          : item
      )
    );
    return true;
  };

  const handleUpdateSubscriptionDates = ({ user, startDate, endDate }) => {
    if (!isAdmin) return;
    const startIso = toIsoFromDateInput(startDate);
    const endIso = toIsoFromDateInput(endDate);
    if (!startIso || !endIso) return;

    const startMs = new Date(startIso).getTime();
    const endMs = new Date(endIso).getTime();
    if (endMs < startMs) return;

    const userId = user?.Id || user?.id || "";
    const username = user?.Name || user?.name || "";
    const durationDays = diffInDays(startIso, endIso);
    const status = endMs < Date.now() ? "expired" : "approved";

    const matching = subscriptions
      .filter(
        (sub) =>
          (userId && (sub.userId === userId || sub.userKey === userId)) ||
          (username && (sub.username || "").toLowerCase() === username.toLowerCase())
      )
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    const activeMatch = matching.find((sub) => {
      if (!sub?.endDate) return false;
      const end = new Date(sub.endDate);
      const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
      const now = new Date();
      const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      return endUtc >= nowUtc;
    });

    let nextSubs = [...subscriptions];
    if (matching.length > 0) {
      const targetId = (activeMatch || matching[0]).id;
      nextSubs = nextSubs.map((sub) =>
        sub.id === targetId
          ? {
              ...sub,
              status,
              startDate: startIso,
              endDate: endIso,
              durationDays,
            }
          : sub
      );
    } else {
      nextSubs.unshift({
        id: safeUUID(),
        userKey: userId || username,
        userId,
        username,
        planId: "manual",
        planName: "Manual",
        durationDays,
        price: 0,
        currency: "MVR",
        status,
        submittedAt: new Date().toISOString(),
        startDate: startIso,
        endDate: endIso,
      });
    }

    runServerSubscriptionAction("update-dates", {
      targetId: matching.length > 0 ? (activeMatch || matching[0]).id : "",
      startDate: startIso,
      endDate: endIso,
      durationDays,
      status,
    })
      .then((serverData) => {
        if (Array.isArray(serverData)) {
          saveSubscriptions(serverData);
          setSubscriptions(serverData);
        }
      })
      .catch(() => {});

    if (status === "expired" && userId) {
      setUserPlayback(userId, false).catch(() => {});
    }
    if (status === "approved" && userId) {
      setUserPlayback(userId, true).catch(() => {});
    }
  };

  const handleRemovePlan = (planId) => {
    if (!isAdmin) return;
    const nextPlans = plans.filter((plan) => plan.id !== planId);
    savePlans(nextPlans);
    setPlans(nextPlans);
    saveServerPlans(nextPlans).catch(() => {});
  };

  const handleUpdatePlan = (planId, updates) => {
    if (!isAdmin) return;
    const nextPlans = plans.map((plan) =>
      plan.id === planId
        ? {
            ...plan,
            ...updates,
            durationDays: Number(updates.durationDays ?? plan.durationDays ?? plan.duration ?? 0),
          }
        : plan
    );
    savePlans(nextPlans);
    setPlans(nextPlans);
    saveServerPlans(nextPlans).catch(() => {});
  };

  const handleSubmitPayment = async (payload) => {
    try {
      const serverData = await runServerSubscriptionAction("submit-payment", { payload });
      if (Array.isArray(serverData)) {
        saveSubscriptions(serverData);
        setSubscriptions(serverData);
      }
      pushToast({
        title: "Payment submitted",
        message: `${payload.planName || "Plan"} • ${payload.currency || "MVR"} ${Number(payload.price || 0).toFixed(2)}`,
        tone: "info",
      });
      return true;
    } catch (error) {
      pushToast({
        title: "Payment failed",
        message: error?.message || "Failed to submit payment.",
        tone: "error",
      });
      return false;
    }
  };

  const handleApproveSubscription = (subId, actualAmount) => {
    const target = subscriptions.find((sub) => sub.id === subId);
    if (!target) return;
    const days = Number(target.durationDays || target.duration || 0) || 30;
    const userKey = target.userId || target.userKey || "";
    const now = Date.now();
    const related = subscriptions.filter(
      (sub) =>
        sub.userId === userKey ||
        sub.userKey === userKey ||
        (target.username && (sub.username || "").toLowerCase() === target.username.toLowerCase())
    );
    const byLatestEnd = related
      .filter((sub) => sub?.endDate)
      .sort(
        (a, b) =>
          new Date(b.endDate || b.submittedAt || 0) -
          new Date(a.endDate || a.submittedAt || 0)
      );
    const latestEndRecord = byLatestEnd[0] || null;
    const latestEndMs = latestEndRecord?.endDate
      ? new Date(latestEndRecord.endDate).getTime()
      : 0;
    const isActive = latestEndMs >= now;
    const baseEndIso = isActive && latestEndRecord?.endDate
      ? latestEndRecord.endDate
      : new Date().toISOString();
    const startDate =
      isActive && latestEndRecord?.startDate ? latestEndRecord.startDate : new Date().toISOString();
    const endDate = addDays(baseEndIso, days);

    const approvedAt = new Date().toISOString();
    const planPrice = Number(target.price || 0);
    const actualPaid =
      typeof actualAmount === "number" && Number.isFinite(actualAmount)
        ? actualAmount
        : planPrice;
    const discountAmount = planPrice - actualPaid;
    const next = subscriptions.map((sub) => {
      const matchesUser =
        sub.userId === userKey ||
        sub.userKey === userKey ||
        (target.username && (sub.username || "").toLowerCase() === target.username.toLowerCase());
      if (!matchesUser) return sub;
      if (sub.status === "pending" && sub.id !== subId) {
        return { ...sub, status: "rejected" };
      }
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
    runServerSubscriptionAction("approve-payment", { subId, actualAmount: actualPaid })
      .then((serverData) => {
        if (Array.isArray(serverData)) {
          saveSubscriptions(serverData);
          setSubscriptions(serverData);
        }
      })
      .catch(() => {});
    const approved = next.find((sub) => sub.id === subId);
    if (approved?.userId) {
      setUserPlayback(approved.userId, true).catch(() => {});
    }
  };

  const handleRejectSubscription = (subId) => {
    const next = subscriptions.map((sub) =>
      sub.id === subId ? { ...sub, status: "rejected" } : sub
    );
    runServerSubscriptionAction("reject-payment", { subId })
      .then((serverData) => {
        if (Array.isArray(serverData)) {
          saveSubscriptions(serverData);
          setSubscriptions(serverData);
        }
      })
      .catch(() => {});
  };

  const handleDeletePayment = (subId) => {
    if (!isAdmin) return;
    const next = subscriptions.filter((sub) => sub.id !== subId);
    runServerSubscriptionAction("delete-payment", { subId })
      .then((serverData) => {
        if (Array.isArray(serverData)) {
          saveSubscriptions(serverData);
          setSubscriptions(serverData);
        }
      })
      .catch(() => {});
    pushToast({
      title: "Payment deleted",
      message: "The payment record was removed.",
      tone: "info",
    });
  };

  const handleUploadPaymentSlip = (subId, payload) => {
    if (!isAdmin || !subId || !payload?.slipData) return;
    const next = subscriptions.map((sub) =>
      sub.id === subId
        ? {
            ...sub,
            slipName: payload.slipName || sub.slipName || "",
            slipData: payload.slipData,
          }
        : sub
    );
    runServerSubscriptionAction("upload-slip", {
      subId,
      slipName: payload.slipName,
      slipData: payload.slipData,
    })
      .then((serverData) => {
        if (Array.isArray(serverData)) {
          saveSubscriptions(serverData);
          setSubscriptions(serverData);
        }
      })
      .catch(() => {});
    pushToast({
      title: "Slip uploaded",
      message: "Payment slip saved.",
      tone: "success",
    });
  };

  const handleUpdatePaymentAmount = (subId, actualPaid) => {
    if (!isAdmin || !subId || !Number.isFinite(actualPaid)) return;
    const next = subscriptions.map((sub) => {
      if (sub.id !== subId) return sub;
      const planPrice = Number(sub.price || 0);
      const discount = planPrice - actualPaid;
      return {
        ...sub,
        finalAmount: actualPaid,
        discountAmount: discount > 0 ? discount : 0,
      };
    });
    runServerSubscriptionAction("update-amount", { subId, actualPaid })
      .then((serverData) => {
        if (Array.isArray(serverData)) {
          saveSubscriptions(serverData);
          setSubscriptions(serverData);
        }
      })
      .catch(() => {});
    pushToast({
      title: "Amount updated",
      message: "Payment amount saved.",
      tone: "success",
    });
  };

  const handleUpdatePaymentDate = (subId, nextIso) => {
    if (!isAdmin || !subId || !nextIso) return;
    const next = subscriptions.map((sub) => {
      if (sub.id !== subId) return sub;
      return {
        ...sub,
        submittedAt: nextIso,
        approvedAt: nextIso,
        reviewedAt: nextIso,
      };
    });
    runServerSubscriptionAction("update-payment-date", { subId, nextIso })
      .then((serverData) => {
        if (Array.isArray(serverData)) {
          saveSubscriptions(serverData);
          setSubscriptions(serverData);
        }
      })
      .catch(() => {});
    pushToast({
      title: "Date updated",
      message: "Payment date saved.",
      tone: "success",
    });
  };

  const handleAddManualPayment = (payload) => {
    if (!isAdmin || !payload) return;
    const submittedAt = new Date().toISOString();
    const priceValue = Number(payload.price || 0);
    const actualPaid = Number(payload.finalAmount || payload.price || 0);
    const discount = priceValue - actualPaid;
    const next = [
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
      ...subscriptions,
    ];
    runServerSubscriptionAction("add-manual-payment", { payload })
      .then((serverData) => {
        if (Array.isArray(serverData)) {
          saveSubscriptions(serverData);
          setSubscriptions(serverData);
        }
      })
      .catch(() => {});
    if (payload.userId) {
      setUserPlayback(payload.userId, true).catch(() => {});
    }
    pushToast({
      title: "Payment submitted",
      message: "Manual payment saved successfully.",
      tone: "success",
    });
    return true;
  };

  const handleAddUnlimitedUser = (user) => {
    if (!isAdmin || !user) return;
    const userId = user.Id || user.id || "";
    const username = (user.Name || user.name || "").trim();
    if (!userId && !username) return;
    const key = userId || username.toLowerCase();
    const exists = unlimitedUsers.some(
      (item) => item.key === key || (item.userId && item.userId === userId)
    );
    if (exists) return;
    const next = [
      { key, userId: userId || null, username: username || key },
      ...unlimitedUsers,
    ];
    saveUnlimitedUsers(next);
    setUnlimitedUsers(next);
    saveServerUnlimitedUsers(next).catch(() => {});
    if (userId) {
      setUserPlayback(userId, true).catch(() => {});
    }
  };

  const handleRemoveUnlimitedUser = (userKey) => {
    if (!isAdmin) return;
    const next = unlimitedUsers.filter((item) => item.key !== userKey);
    saveUnlimitedUsers(next);
    setUnlimitedUsers(next);
    saveServerUnlimitedUsers(next).catch(() => {});
  };

  const handleUpdateUserTags = (key, tags) => {
    if (!isAdmin || !key) return;
    const normalized = Array.from(
      new Set(
        (tags || [])
          .map((tag) => String(tag || "").trim().toLowerCase())
          .filter(Boolean)
      )
    );
    const next = { ...(userTags || {}) };
    if (normalized.length > 0) {
      next[key] = normalized;
    } else {
      delete next[key];
    }
    saveUserTags(next);
    setUserTags(next);
    saveServerUserTags(next).catch(() => {});
  };

  const handleUpdateUserContact = (key, contact) => {
    if (!isAdmin || !key) return;
    const normalizedKey = String(key || "").trim().toLowerCase();
    if (!normalizedKey) return;
    const email = String(contact?.email || "").trim().toLowerCase();
    const phone = String(contact?.phone || "").trim();
    const next = { ...(userContacts || {}) };
    if (!email && !phone) {
      delete next[normalizedKey];
    } else {
      next[normalizedKey] = {
        email,
        phone,
        updatedAt: new Date().toISOString(),
      };
    }
    saveUserContacts(next);
    setUserContacts(next);
    saveServerUserContacts(next).catch(() => {});
  };

  const syncUsers = useCallback(
    async ({ showMessage = true } = {}) => {
      if (!isAdmin) {
        if (showMessage) setSettingsMessage("Only admin can sync users.");
        return;
      }

      if (!settings.embyUrl || !settings.apiKey) {
        if (showMessage) setSettingsMessage("Save Emby URL + API key first.");
        return;
      }

      if (showMessage) {
        setSettingsMessage("Syncing users...");
        pushToast({
          title: "Sync started",
          message: "Fetching Emby users…",
          tone: "info",
        });
      }

      try {
        const response = await fetch(
          buildEmbyUrl(settings, `/Users?api_key=${settings.apiKey}`)
        );
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Failed to fetch users.");
        }
        const users = await response.json();
        const existingById = new Map(
          syncedUsers
            .map((user) => [user.Id || user.id, user])
            .filter(([id]) => Boolean(id))
        );
        const adminName = session?.username || "admin";
        const nowIso = new Date().toISOString();
        const mergedUsers = (users || []).map((user) => {
          const id = user.Id || user.id;
          const existing = id ? existingById.get(id) : null;
          return {
            ...user,
            createdBy: existing?.createdBy || adminName,
            createdAt: existing?.createdAt || nowIso,
          };
        });
        const adjustedUsers = [...mergedUsers];
        const existingIds = new Set(
          syncedUsers.map((user) => user.Id || user.id).filter(Boolean)
        );
        const newUsers = mergedUsers.filter((user) => {
          const id = user.Id || user.id;
          return id && !existingIds.has(id);
        });
        if (newUsers.length > 0) {
          // User sync must not mutate live subscription history.
        }
        const currentIds = new Set(
          adjustedUsers.map((user) => user.Id || user.id).filter(Boolean)
        );
        const currentNames = new Set(
          adjustedUsers
            .map((user) => String(user?.Name || user?.name || "").toLowerCase())
            .filter(Boolean)
        );
        const prevNameToId = new Map();
        const currentNameToId = new Map();
        syncedUsers.forEach((user) => {
          const id = user?.Id || user?.id || "";
          const name = String(user?.Name || user?.name || "").toLowerCase();
          if (name && id) prevNameToId.set(name, id);
        });
        adjustedUsers.forEach((user) => {
          const id = user?.Id || user?.id || "";
          const name = String(user?.Name || user?.name || "").toLowerCase();
          if (name && id) currentNameToId.set(name, id);
        });

        const removedIds = new Set();
        const removedNames = new Set();
        const replacedNames = new Set();
        prevNameToId.forEach((prevId, name) => {
          const currentId = currentNameToId.get(name);
          if (currentId && currentId !== prevId) {
            removedIds.add(prevId);
            replacedNames.add(name);
          }
        });

        syncedUsers.forEach((user) => {
          const id = user?.Id || user?.id || "";
          const name = String(user?.Name || user?.name || "").toLowerCase();
          if (id && !currentIds.has(id)) removedIds.add(id);
          if (name && !currentNames.has(name)) removedNames.add(name);
        });

        if (removedIds.size > 0 || removedNames.size > 0) {
          const nextUnlimited = unlimitedUsers.filter((item) => {
            const key = item?.key || item?.userId || "";
            const name = String(item?.username || "").toLowerCase();
            if (key && removedIds.has(key)) return false;
            if (!item?.userId && name && (removedNames.has(name) || replacedNames.has(name))) {
              return false;
            }
            return true;
          });
          if (nextUnlimited.length !== unlimitedUsers.length) {
            saveUnlimitedUsers(nextUnlimited);
            setUnlimitedUsers(nextUnlimited);
            saveServerUnlimitedUsers(nextUnlimited).catch(() => {});
          }

          const nextTags = { ...(userTags || {}) };
          let tagsChanged = false;
          removedIds.forEach((id) => {
            if (nextTags[id]) {
              delete nextTags[id];
              tagsChanged = true;
            }
          });
          removedNames.forEach((name) => {
            if (nextTags[name]) {
              delete nextTags[name];
              tagsChanged = true;
            }
          });
          replacedNames.forEach((name) => {
            if (nextTags[name]) {
              delete nextTags[name];
              tagsChanged = true;
            }
          });
          if (tagsChanged) {
            saveUserTags(nextTags);
            setUserTags(nextTags);
            saveServerUserTags(nextTags).catch(() => {});
          }

          const nextRequests = movieRequests.filter((request) => {
            const name = String(request?.requestedBy || "").toLowerCase();
            if (name && (removedNames.has(name) || replacedNames.has(name))) return false;
            return true;
          });
          if (nextRequests.length !== movieRequests.length) {
            saveMovieRequests(nextRequests);
            setMovieRequests(nextRequests);
            saveServerMovieRequests(nextRequests).catch(() => {});
          }
        }

        saveSyncedUsers(adjustedUsers || []);
        setSyncedUsersState(adjustedUsers || []);
        if (showMessage) {
          setSettingsMessage("Users synced.");
          const addedCount = newUsers.length;
          pushToast({
            title: "Sync complete",
            message:
              addedCount > 0
                ? `${addedCount} new user${addedCount === 1 ? "" : "s"} added`
                : "No new users found",
            tone: "success",
          });
        }
      } catch (error) {
        if (showMessage) {
          setSettingsMessage(error.message || "Sync failed.");
          pushToast({
            title: "Sync failed",
            message: error.message || "Sync failed.",
            tone: "danger",
          });
        }
      }
    },
    [isAdmin, settings.embyUrl, settings.apiKey, syncedUsers, subscriptions, session]
  );

  const handleSyncUsers = async () => {
    await syncUsers({ showMessage: true });
  };

  useEffect(() => {
    if (!session || !isAdmin) return;
    if (!settings.embyUrl || !settings.apiKey) return;

    const runSync = () => syncUsers({ showMessage: false });
    runSync();

    const interval = setInterval(runSync, 3000);
    const handleFocus = () => runSync();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") runSync();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [session, isAdmin, settings.embyUrl, settings.apiKey, syncUsers]);

  useEffect(() => {
    if (!session || !isAdmin) return;
    fetchServerStatus();
    const interval = setInterval(fetchServerStatus, 30000);
    return () => clearInterval(interval);
  }, [session, isAdmin, fetchServerStatus]);

  useEffect(() => {
    if (!session || !isAdmin) return;
    fetchRegistrations();
    const interval = setInterval(fetchRegistrations, 30000);
    return () => clearInterval(interval);
  }, [session, isAdmin, fetchRegistrations]);

  useEffect(() => {
    api.fetchTrending().then((data) => {
      if (data?.movies?.length) setTrending(data);
    }).catch(() => {});
  }, [sessionReady]);

  useEffect(() => {
    if (!session || !isAdmin) return;
    api.policySync().catch(() => {});
    const interval = setInterval(() => api.policySync().catch(() => {}), 30000);
    return () => clearInterval(interval);
  }, [session, isAdmin]);

  useEffect(() => {
    if (!session || !isAdmin) return;
    if (!settings.embyUrl || !settings.apiKey) return;

    const now = Date.now();
    const latestByUser = new Map();
    subscriptions.forEach((sub) => {
      const key = sub.userId || sub.userKey || "";
      if (!key) return;
      const prev = latestByUser.get(key);
      const prevTime = prev ? new Date(prev.endDate || prev.submittedAt || 0).getTime() : 0;
      const nextTime = new Date(sub.endDate || sub.submittedAt || 0).getTime();
      if (!prev || nextTime >= prevTime) {
        latestByUser.set(key, sub);
      }
    });

    const toDisable = Array.from(latestByUser.values()).filter((sub) => {
      if (!sub.userId || !sub.endDate) return false;
      const endMs = new Date(sub.endDate).getTime();
      const attempted = playbackDisableAttemptedRef.current.has(String(sub.id || ""));
      return endMs < now && !sub.playbackDisabledAt && !attempted;
    });

    if (toDisable.length === 0) return;

    (async () => {
      const disabledSubIds = [];
      for (const sub of toDisable) {
        try {
          playbackDisableAttemptedRef.current.add(String(sub.id || ""));
          await setUserPlayback(sub.userId, false);
          if (sub?.id) disabledSubIds.push(String(sub.id));
        } catch {
          // Ignore failures; keep trying on next render.
          playbackDisableAttemptedRef.current.delete(String(sub.id || ""));
        }
      }
      if (disabledSubIds.length > 0) {
        try {
          const serverData = await runServerSubscriptionAction("mark-playback-disabled", {
            subIds: disabledSubIds,
          });
          if (Array.isArray(serverData)) {
            saveSubscriptions(serverData);
            setSubscriptions(serverData);
          }
        } catch {
          // Ignore persistence failures.
        }
      }
    })();
  }, [
    session,
    isAdmin,
    settings.embyUrl,
    settings.apiKey,
    subscriptions,
    syncedUsers,
    runServerSubscriptionAction,
  ]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const pollSubscriptions = async () => {
      try {
        const serverData = await fetchServerSubscriptions();
        if (cancelled || !Array.isArray(serverData)) return;
        const current = subscriptionsRef.current || [];
        if (JSON.stringify(serverData) !== JSON.stringify(current)) {
          saveSubscriptions(serverData);
          setSubscriptions(serverData);
        }
      } catch {
        // Ignore polling errors.
      }
    };

    const interval = setInterval(pollSubscriptions, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const pollContacts = async () => {
      try {
        const serverData = await fetchServerUserContacts();
        if (cancelled || !serverData || typeof serverData !== "object") return;
        const normalized = normalizeUserContacts(serverData);
        const current = contactsRef.current || {};
        if (JSON.stringify(normalized) !== JSON.stringify(current)) {
          saveUserContacts(normalized);
          setUserContacts(normalized);
        }
      } catch {
        // Ignore polling errors.
      }
    };

    const interval = setInterval(pollContacts, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const pollMovieRequests = async () => {
      try {
        const serverData = await fetchServerMovieRequests();
        if (cancelled || !Array.isArray(serverData)) return;
        const current = movieRequestsRef.current || [];
        if (JSON.stringify(serverData) !== JSON.stringify(current)) {
          saveMovieRequests(serverData);
          setMovieRequests(serverData);
        }
      } catch {
        // Ignore polling errors.
      }
    };

    const interval = setInterval(pollMovieRequests, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const pollTags = async () => {
      try {
        const serverData = await fetchServerUserTags();
        if (cancelled || !serverData || typeof serverData !== "object") return;
        const current = tagsRef.current || {};
        if (JSON.stringify(serverData) !== JSON.stringify(current)) {
          saveUserTags(serverData);
          setUserTags(serverData);
        }
      } catch {
        // Ignore polling errors.
      }
    };

    const interval = setInterval(pollTags, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const pollPlans = async () => {
      try {
        const serverData = await fetchServerPlans();
        if (cancelled || !Array.isArray(serverData)) return;
        const current = plansRef.current || [];
        if (JSON.stringify(serverData) !== JSON.stringify(current)) {
          savePlans(serverData);
          setPlans(serverData);
        }
      } catch {
        // Ignore polling errors.
      }
    };

    const interval = setInterval(pollPlans, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const pollUnlimited = async () => {
      try {
        const serverData = await fetchServerUnlimitedUsers();
        if (cancelled || !Array.isArray(serverData)) return;
        const current = unlimitedRef.current || [];
        if (JSON.stringify(serverData) !== JSON.stringify(current)) {
          saveUnlimitedUsers(serverData);
          setUnlimitedUsers(serverData);
        }
      } catch {
        // Ignore polling errors.
      }
    };

    const interval = setInterval(pollUnlimited, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session]);

  return (
    <main className={`app ${isAdmin ? "role-admin" : "role-user"}`}>
      {/* Keep all routed pages inside app-shell so global mobile scaling applies. */}
      <div
        className={`app-shell ${session ? "has-session" : ""} ${
          session ? (sidebarOpen ? "sidebar-open" : "sidebar-collapsed") : ""
        } ${isPaymentsReceived ? "route-payments-received" : ""} ${
          isTableRoute ? "route-table-scroll" : ""
        }`}
      >
        <header className="topbar">
          <div className="topbar-left">
            {session && (
              <button
                type="button"
                className="btn ghost sidebar-toggle"
                onClick={() => setSidebarOpen((prev) => !prev)}
                aria-label="Toggle menu"
                aria-expanded={sidebarOpen}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
                Menu
              </button>
            )}
            <NavLink to="/dashboard" className="brand">
              MovieFlix Dashboard
            </NavLink>
          </div>
          {session && (
            <div className="topbar-user">
              <div className="session">Logged in as: {session.username}</div>
              <div className="topbar-actions">
                {(isAdmin || settings.allowUserThemeToggle) && (
                  <button
                    className="btn ghost theme-toggle"
                    type="button"
                    onClick={() => setThemeMode((prev) => (prev === "dark" ? "light" : "dark"))}
                  >
                    {themeMode === "dark" ? "Light mode" : "Dark mode"}
                  </button>
                )}
                <button className="btn ghost topbar-logout" type="button" onClick={handleLogout}>
                  Log out
                </button>
              </div>
            </div>
          )}
        </header>
        {session && (
          <aside className="sidebar">
            <nav className="nav">
              <NavLink to="/dashboard" className="nav-link" title="Dashboard">
                <span className="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 12l9-9 9 9" />
                    <path d="M5 10v10h14V10" />
                  </svg>
                </span>
                <span className="nav-text">Dashboard</span>
                {isAdmin && dashboardAlerts.total > 0 && (
                  <span
                    className="nav-badge"
                    title={`Requests: ${dashboardAlerts.openRequests}, Approvals: ${dashboardAlerts.pendingApprovals}`}
                  >
                    {dashboardAlerts.total}
                  </span>
                )}
              </NavLink>
              {isAdmin && (
                <NavLink to="/users" className="nav-link" title="Users">
                  <span className="nav-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="8" cy="8" r="3" />
                      <circle cx="17" cy="8" r="3" />
                      <path d="M2 20c0-3 3-5 6-5" />
                      <path d="M22 20c0-3-3-5-6-5" />
                    </svg>
                  </span>
                  <span className="nav-text">Users</span>
                </NavLink>
              )}
              <NavLink to="/subscriptions" className="nav-link" title="Subscriptions">
                <span className="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="M3 10h18" />
                  </svg>
                </span>
                <span className="nav-text">Subscriptions</span>
              </NavLink>
              {!isAdmin && (
                <NavLink to="/requests" className="nav-link" title="Requests">
                  <span className="nav-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path d="M7 5v14" />
                      <path d="M17 5v14" />
                      <path d="M10 9h4" />
                      <path d="M10 13h4" />
                    </svg>
                  </span>
                  <span className="nav-text">Requests</span>
                </NavLink>
              )}
              {!isAdmin && (
                <NavLink to="/chat" className="nav-link" title="Chat">
                  <span className="nav-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                    </svg>
                  </span>
                  <span className="nav-text">Chat</span>
                </NavLink>
              )}
              {!isAdmin && (
                <NavLink to="/emby-login-guide" className="nav-link" title="Emby Login">
                  <span className="nav-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="6" y="2" width="12" height="20" rx="3" />
                      <path d="M9 6h6" />
                      <path d="m10 13 2 2 4-4" />
                      <circle cx="12" cy="18" r="1" />
                    </svg>
                  </span>
                  <span className="nav-text">Emby Login</span>
                </NavLink>
              )}
              {!isAdmin && (
                <NavLink to="/payment-history" className="nav-link" title="Payment History">
                  <span className="nav-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M7 3h10l2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
                      <path d="M15 3v4h4" />
                      <path d="M8 10h8" />
                      <path d="M8 14h8" />
                      <path d="M8 18h5" />
                    </svg>
                  </span>
                  <span className="nav-text">Payment History</span>
                </NavLink>
              )}
              {isAdmin && (
                <NavLink to="/plans" className="nav-link" title="Plans">
                  <span className="nav-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 12a8 8 0 1 1-4-6.9" />
                      <path d="M20 4v6h-6" />
                    </svg>
                  </span>
                  <span className="nav-text">Plans</span>
                </NavLink>
              )}
              {isAdmin && (
                <NavLink to="/approvals" className="nav-link" title="Approvals">
                  <span className="nav-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 12l2 2 4-4" />
                      <circle cx="12" cy="12" r="9" />
                    </svg>
                  </span>
                  <span className="nav-text">Approvals</span>
                </NavLink>
              )}
              {isAdmin && (
                <NavLink to="/registrations" className="nav-link" title="Registrations">
                  <span className="nav-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                  </span>
                  <span className="nav-text">Registrations</span>
                </NavLink>
              )}
              {isAdmin && (
                <NavLink to="/admin-chats" className="nav-link" title="Chats">
                  <span className="nav-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                    </svg>
                  </span>
                  <span className="nav-text">Chats</span>
                </NavLink>
              )}
              {isAdmin && (
                <NavLink to="/payments-received" className="nav-link" title="Payments Received">
                  <span className="nav-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="16" rx="2" />
                      <path d="M7 9h10M7 13h6" />
                    </svg>
                  </span>
                  <span className="nav-text">Payments Received</span>
                </NavLink>
              )}
              {isAdmin && (
                <NavLink to="/media-requests" className="nav-link" title="Media Requests">
                  <span className="nav-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="16" rx="2" />
                      <path d="M8 4v16M16 4v16" />
                    </svg>
                  </span>
                  <span className="nav-text">Media Requests</span>
                </NavLink>
              )}
              <NavLink to="/settings" className="nav-link" title="Settings">
                <span className="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a7.7 7.7 0 0 0 .1-2l2-1-2-4-2 1a7.7 7.7 0 0 0-1.7-1l-.3-2h-4l-.3 2a7.7 7.7 0 0 0-1.7 1l-2-1-2 4 2 1a7.7 7.7 0 0 0 .1 2l-2 1 2 4 2-1a7.7 7.7 0 0 0 1.7 1l.3 2h4l.3-2a7.7 7.7 0 0 0 1.7-1l2 1 2-4z" />
                  </svg>
                </span>
                <span className="nav-text">Settings</span>
              </NavLink>
            </nav>
          </aside>
        )}

        {!session && sessionReady && (
          <div className="flk">
            {showPwaInstall && (
              <div className="pwa-install-banner">
                <span className="pwa-install-text">Install FlickMV on your phone for quick access</span>
                <button className="pwa-install-btn" onClick={() => { window.__pwaInstall?.(); setShowPwaInstall(false); }}>
                  Install
                </button>
              </div>
            )}
            <div className="flk-container">
              <header className="flk-header">
                <a href="#hero" className="flk-logo">FlickMV</a>
                <nav className="flk-nav">
                  <a href="#movies">Content</a>
                  <a href="#pricing" onClick={(e) => { e.preventDefault(); document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" }); }}>Pricing</a>
                  <a href="#faq">FAQ</a>
                </nav>
                <button className="flk-cta" onClick={() => {
                  // TODO: REMOVE BEFORE PRODUCTION — test bypass, redirects to dashboard without login
                  const mockSession = { username: "test-admin", role: "admin", token: "mock", userId: "test" };
                  saveSession(mockSession);
                  setSession(mockSession);
                }}>
                  Start Watching &rarr;
                </button>
              </header>

              <section className="flk-hero">
                <h1>Stream <span className="flk-grad">Everything.</span></h1>
                <p>No VPN &middot; No Geo-blocks &middot; Pay in MVR. FlickMV delivers movies, TV shows, anime, K-dramas, and more — directly to every device in the Maldives, no restrictions.</p>
                <div className="flk-hero-ctas">
                  <button className="flk-secondary" onClick={() => { setShowRegister(true); setRegisterStep("form"); setRegisterMessage(""); }}>
                    See Plans &rarr;
                  </button>
                </div>
                <div className="flk-pills">
                  <div className="flk-pill"><span>&#128683;</span> No VPN needed</div>
                  <div className="flk-pill"><span>&#9889;</span> Pay in MVR</div>
                  <div className="flk-pill"><span>&#128241;</span> Any device</div>
                  <div className="flk-pill"><span>&#128260;</span> New content weekly</div>
                </div>
              </section>

              <h2 className="flk-section-title" id="movies">Movies <span>4K &middot; HDR &middot; Dolby</span></h2>
              <div className="flk-carousel">
                {(trending.movies.length > 0 ? trending.movies : [
                  { tmdb_id: "tt0111161", title: "Mortal Kombat II", rating: 8.2 },
                  { tmdb_id: "tt0068646", title: "The Devil Wears Prada 2", rating: 6.7 },
                  { tmdb_id: "tt0468569", title: "Michael", rating: 7.5 },
                  { tmdb_id: "tt0137523", title: "Swapped", rating: 8.0 },
                  { tmdb_id: "tt0108052", title: "Hoppers", rating: 7.7 },
                  { tmdb_id: "tt0080684", title: "Chronicles of the Sun", rating: null },
                ]).map((m, i) => (
                  <div className="flk-movie-card" key={m.tmdb_id || i}>
                    <div className="flk-movie-poster">
                      <img
                        src={m.poster_path
                          ? `https://image.tmdb.org/t/p/w342${m.poster_path}`
                          : `https://image.tmdb.org/t/p/w342/${m.tmdb_id}`}
                        alt={m.title}
                        loading="lazy"
                        onError={(e) => { e.target.style.opacity = "0.15"; }}
                      />
                    </div>
                    {m.rating && (
                      <div className="flk-rating"><span className="flk-star">&#9733;</span> {m.rating}</div>
                    )}
                    <div className="flk-movie-title">{m.title}</div>
                  </div>
                ))}
              </div>

              <h2 className="flk-section-title">TV Shows <span>New episodes weekly</span></h2>
              <div className="flk-carousel">
                {(trending.shows.length > 0 ? trending.shows : [
                  { tmdb_id: "tt0499549", title: "The Boys", rating: 8.4 },
                  { tmdb_id: "tt1375666", title: "Citadel", rating: 6.8 },
                  { tmdb_id: "tt0120737", title: "Daredevil: Born Again", rating: 8.0 },
                  { tmdb_id: "tt0816692", title: "Euphoria", rating: 8.3 },
                  { tmdb_id: "tt0070909", title: "FROM", rating: 8.2 },
                  { tmdb_id: "tt0133093", title: "The Last Voyager", rating: null },
                ]).map((m, i) => (
                  <div className="flk-movie-card" key={m.tmdb_id || i}>
                    <div className="flk-movie-poster">
                      <img
                        src={m.poster_path
                          ? `https://image.tmdb.org/t/p/w342${m.poster_path}`
                          : `https://image.tmdb.org/t/p/w342/${m.tmdb_id}`}
                        alt={m.title}
                        loading="lazy"
                        onError={(e) => { e.target.style.opacity = "0.15"; }}
                      />
                    </div>
                    {m.rating && (
                      <div className="flk-rating"><span className="flk-star">&#9733;</span> {m.rating}</div>
                    )}
                    <div className="flk-movie-title">{m.title}</div>
                  </div>
                ))}
              </div>

              <h2 className="flk-section-title" id="pricing">Pricing <span>Simple, local. Pay in MVR.</span></h2>
              <div className="flk-pricing">
                {(plans || []).filter(p => p.active !== false && p.durationDays).slice(0, 3).map((plan, i) => {
                  const featured = i === 1;
                  return (
                    <div className={`flk-price-card ${featured ? "flk-price-featured" : ""}`} key={plan.id || plan.name}>
                      {featured && <div className="flk-price-badge">Most Popular</div>}
                      <div className="flk-price-name">{plan.name}</div>
                      <div className="flk-price-amount">
                        <span className="flk-price-num">MVR {plan.price}</span>
                        <span className="flk-price-per">/{plan.durationDays}d</span>
                      </div>
                      <ul className="flk-price-list">
                        <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="oklch(65% 0.2 150)" strokeWidth="2.5"><path d="M5 13l4 4L19 7"/></svg>All content libraries</li>
                        <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="oklch(65% 0.2 150)" strokeWidth="2.5"><path d="M5 13l4 4L19 7"/></svg>4K HDR quality</li>
                        <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="oklch(65% 0.2 150)" strokeWidth="2.5"><path d="M5 13l4 4L19 7"/></svg>Multiple devices</li>
                        <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="oklch(65% 0.2 150)" strokeWidth="2.5"><path d="M5 13l4 4L19 7"/></svg>Download offline</li>
                      </ul>
                      <button
                        className={`flk-cta ${featured ? "flk-green" : ""}`}
                        onClick={() => { setShowLogin(true); setShowRegister(false); setShowForgot(false); }}
                      >
                        {featured ? "Start Streaming" : "Get Started"}
                      </button>
                    </div>
                  );
                })}
              </div>

              <footer className="flk-footer">
                <p>&copy; {new Date().getFullYear()} FlickMV</p>
              </footer>
            </div>
          </div>
        )}

        {!session && sessionReady && (showLogin || showRegister || showForgot) && (
          <div className="modal-overlay" onClick={() => { setShowLogin(false); setShowRegister(false); setShowForgot(false); }}>
            <div className="modal-panel card" onClick={(e) => e.stopPropagation()}>
              {showLogin && !showRegister && !showForgot && (
                <>
                  <h1>Welcome Back</h1>
                  <p className="muted">Sign in with your Emby credentials</p>
                  <form onSubmit={handleLogin} className="stack" autoComplete="off">
                    <label>
                      Username
                      <input
                        type="text"
                        value={loginUser}
                        onChange={(event) => setLoginUser(event.target.value)}
                        onKeyDown={handleLoginKeyDown}
                        required
                      />
                    </label>
                    <label>
                      Password
                      <input
                        type="password"
                        value={loginPass}
                        onChange={(event) => setLoginPass(event.target.value)}
                        onKeyDown={handleLoginKeyDown}
                        required
                      />
                    </label>
                    <button className="btn primary" type="submit">Log in</button>
                    <button className="btn ghost" type="button" onClick={() => { setShowLogin(false); setShowRegister(true); }}>
                      Don't have an account? Register
                    </button>
                    <button className="btn ghost" type="button" onClick={() => {
                      setShowLogin(false); setShowForgot(true); setForgotStep("form"); setForgotMessage(""); setForgotOtp("");
                    }}>Forgot Password</button>
                    {loginMessage && <div className="note">{loginMessage}</div>}
                  </form>
                </>
              )}
              {showRegister && !showForgot && (
                <>
                  <h1>Start Your Free Trial</h1>
                  {(() => {
                    const mode = normalizeRegistrationVerificationMode(settings?.registrationVerificationMode);
                    const modeLabel = mode === "both" ? "Email + SMS verification required." : mode === "sms" ? "SMS verification required." : "Email verification required.";
                    return <p className="muted">One trial per email (7 days). {modeLabel}</p>;
                  })()}
                  <div className="stack">
                    <label>Name<input type="text" value={registerName} onChange={(event) => setRegisterName(event.target.value)} required /></label>
                    <label>Email<input type="email" value={registerEmail} onChange={(event) => setRegisterEmail(event.target.value)} required /></label>
                    <label>Phone (Maldives)<div className="input-row"><span className="prefix-pill">+960</span><input type="tel" inputMode="numeric" value={registerPhone} onChange={(event) => setRegisterPhone(event.target.value.replace(/\D/g, "").slice(0, 7))} placeholder="1234567" required /></div></label>
                    {registerStep === "otp" && (() => {
                      const mode = normalizeRegistrationVerificationMode(settings?.registrationVerificationMode);
                      const showEmailOtp = mode === "email" || mode === "both";
                      const showSmsOtp = mode === "sms" || mode === "both";
                      return (<>{showEmailOtp && <label>Email OTP<input type="text" value={registerOtp} onChange={(event) => setRegisterOtp(event.target.value)} required /></label>}{showSmsOtp && <label>SMS Code<input type="text" value={registerSmsCode} onChange={(event) => setRegisterSmsCode(event.target.value)} required /></label>}</>);
                    })()}
                    {registerStep === "form" && <button className="btn primary" type="button" onClick={handleRequestOtp}>Send OTP</button>}
                    {registerStep === "otp" && <button className="btn primary" type="button" onClick={handleVerifyOtp}>Submit Registration</button>}
                    <button className="btn ghost" type="button" onClick={() => { setShowRegister(false); setShowLogin(true); setRegisterStep("form"); setRegisterMessage(""); setRegisterOtp(""); setRegisterSmsCode(""); }}>Already have an account? Sign in</button>
                    {registerMessage && <div className="note">{registerMessage}</div>}
                  </div>
                </>
              )}
              {showForgot && (
                <>
                  <h1>Reset Password</h1>
                  <p className="muted">Enter your registered mobile number. OTP will be sent to your registered email.</p>
                  <div className="stack">
                    <label>Phone (Maldives)<div className="input-row"><span className="prefix-pill">+960</span><input type="tel" inputMode="numeric" value={forgotPhone} onChange={(event) => setForgotPhone(event.target.value.replace(/\D/g, "").slice(0, 7))} placeholder="1234567" required /></div></label>
                    {forgotStep === "otp" && <label>OTP<input type="text" value={forgotOtp} onChange={(event) => setForgotOtp(event.target.value)} required /></label>}
                    {forgotStep === "form" && <button className="btn primary" type="button" onClick={handleForgotStart}>Send OTP</button>}
                    {forgotStep === "otp" && <button className="btn primary" type="button" onClick={handleForgotReset}>Reset Password</button>}
                    <button className="btn ghost" type="button" onClick={() => { setShowForgot(false); setShowLogin(true); setForgotStep("form"); setForgotMessage(""); setForgotPhone(""); setForgotOtp(""); }}>Back to sign in</button>
                    {forgotMessage && <div className="note">{forgotMessage}</div>}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {!sessionReady && (
          <section className="card">
            <div className="muted">Loading...</div>
          </section>
        )}

        {session && (
          <section className="grid">
            <div className="page-transition" key={location.pathname}>
            <ErrorBoundary resetKey={location.pathname} onError={reportRenderError} fallback={<AppErrorFallback />}>
            <Routes>
            <Route
              path="/settings"
              element={
                isAdmin ? (
                  <SettingsPage
                    isAdmin={isAdmin}
                    settings={settings}
                    onSettingsChange={(key, value) =>
                      setSettingsState((prev) => ({ ...prev, [key]: value }))
                    }
                    onSave={handleSettingsSave}
                    onSaveNow={handleSettingsSaveNow}
                    onDiscard={handleSettingsDiscard}
                    savedSettings={savedSettings}
                    message={settingsMessage}
                    serverStatus={serverStatus}
                    serverStatusError={serverStatusError}
                    onRefreshStatus={fetchServerStatus}
                    onStartTunnel={startCloudflareTunnel}
                    onStopTunnel={stopCloudflareTunnel}
                    onStartTelegram={startTelegramBot}
                    onStopTelegram={stopTelegramBot}
                    onLogout={handleLogout}
                  />
                ) : (
                  <UserSettingsPage
                    currentUser={session}
                    subscriptions={subscriptions}
                    unlimitedUsers={unlimitedUsers}
                    registrations={registrations}
                    userContacts={userContacts}
                  />
                )
              }
            />
            {isAdmin && (
              <Route
                path="/registrations"
                element={
                  <RegistrationsPage
                    registrations={registrations}
                    onRefresh={fetchRegistrations}
                    onApprove={handleApproveRegistration}
                    onReject={handleRejectRegistration}
                    onDelete={handleDeleteRegistration}
                  />
                }
              />
            )}
            <Route
              path="/dashboard"
              element={
                isAdmin ? (
                  <DashboardPage
                    users={sortedUsers}
                    subscriptions={subscriptions}
                    movieRequests={movieRequests}
                  />
                ) : (
                  <UsersPage
                    users={sortedUsers}
                    isAdmin={isAdmin}
                    currentUser={session}
                    settings={settings}
                    subscriptions={subscriptions}
                    plans={plans}
                    onUpdateDates={handleUpdateSubscriptionDates}
                    unlimitedUsers={unlimitedUsers}
                    userTags={userTags}
                    userContacts={userContacts}
                    onUpdateUserTags={handleUpdateUserTags}
                    onUpdateUserContact={handleUpdateUserContact}
                    onAddUnlimitedUser={handleAddUnlimitedUser}
                    onRemoveUnlimitedUser={handleRemoveUnlimitedUser}
                    onSyncUsers={handleSyncUsers}
                    registrations={registrations}
                  />
                )
              }
            />
            <Route
              path="/users"
              element={
                isAdmin ? (
                  <UsersPage
                    users={sortedUsers}
                    isAdmin={isAdmin}
                    currentUser={session}
                    settings={settings}
                    subscriptions={subscriptions}
                    plans={plans}
                    onUpdateDates={handleUpdateSubscriptionDates}
                    unlimitedUsers={unlimitedUsers}
                    userTags={userTags}
                    userContacts={userContacts}
                    onUpdateUserTags={handleUpdateUserTags}
                    onUpdateUserContact={handleUpdateUserContact}
                    onAddUnlimitedUser={handleAddUnlimitedUser}
                    onRemoveUnlimitedUser={handleRemoveUnlimitedUser}
                    onSyncUsers={handleSyncUsers}
                    registrations={registrations}
                  />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/emby-login-guide"
              element={
                isAdmin ? (
                  <Navigate to="/dashboard" replace />
                ) : (
                  <EmbyLoginGuidePage
                    settings={settings}
                    currentUser={session}
                    subscriptions={subscriptions}
                    plans={plans}
                  />
                )
              }
            />
            <Route
              path="/chat"
              element={
                !isAdmin ? (
                  <UserChatPage currentUser={session} registrations={registrations} />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/admin-chats"
              element={
                isAdmin ? (
                  <AdminChatsPage currentUser={session} />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/subscriptions"
              element={
                <SubscriptionsPage
                  plans={plans}
                  subscriptions={subscriptions}
                  currentUser={session}
                  accounts={settings.accounts || normalizeAccounts(settings)}
                  onSubmitPayment={handleSubmitPayment}
                />
              }
            />
            <Route
              path="/requests"
              element={
                !isAdmin ? (
                  <RequestsPage
                    movieRequests={movieRequests}
                    currentUser={session}
                    jellyseerrToken={session?.jellyseerrToken || ""}
                    onAddMovieRequest={handleAddMovieRequest}
                    onUpdateMovieRequest={handleUpdateMovieRequest}
                    onRemoveMovieRequest={handleRemoveMovieRequest}
                  />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/payment-history"
              element={
                !isAdmin ? (
                  <PaymentHistoryPage
                    subscriptions={subscriptions}
                    currentUser={session}
                  />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/subscriptions/:planId"
              element={
                <SubscriptionsPage
                  plans={plans}
                  subscriptions={subscriptions}
                  currentUser={session}
                  accounts={settings.accounts || normalizeAccounts(settings)}
                  onSubmitPayment={handleSubmitPayment}
                />
              }
            />
            <Route
              path="/plans"
              element={
                isAdmin ? (
                  <PlansPage
                    plans={plans}
                    onAdd={handleAddPlan}
                    onRemove={handleRemovePlan}
                    onUpdate={handleUpdatePlan}
                  />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/media-requests"
              element={
                isAdmin ? <AdminMediaRequestsPage /> : <Navigate to="/dashboard" replace />
              }
            />
            <Route
              path="/approvals"
              element={
                isAdmin ? (
                  <ApprovalsPage
                    pending={subscriptions.filter((sub) => sub.status === "pending")}
                    onApprove={handleApproveSubscription}
                    onReject={handleRejectSubscription}
                  />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/payments-received"
              element={
                isAdmin ? (
                  <PaymentsReceivedPage
                    subscriptions={subscriptions}
                    plans={plans}
                    users={syncedUsers}
                    onDeletePayment={handleDeletePayment}
                    onUploadSlip={handleUploadPaymentSlip}
                    onUpdatePaymentAmount={handleUpdatePaymentAmount}
                    onUpdatePaymentDate={handleUpdatePaymentDate}
                    onAddManualPayment={handleAddManualPayment}
                  />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/"
              element={<Navigate to="/dashboard" replace />}
            />
            <Route
              path="*"
              element={<Navigate to="/dashboard" replace />}
            />
            </Routes>
            </ErrorBoundary>
            </div>
          </section>
        )}

        <footer className="app-footer">All rights reserved 2026 © Salesify</footer>

      </div>

      {session && (
        <nav className="bottom-nav">
          {isAdmin ? (
            <>
              <NavLink
                to="/dashboard"
                className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
                  <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
                <span className="bottom-label">Home</span>
                {isAdmin && dashboardAlerts.total > 0 && (
                  <span
                    className="bottom-badge"
                    title={`Requests: ${dashboardAlerts.openRequests}, Approvals: ${dashboardAlerts.pendingApprovals}`}
                  >
                    {dashboardAlerts.total}
                  </span>
                )}
              </NavLink>
              <NavLink
                to="/users"
                className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span className="bottom-label">Users</span>
              </NavLink>
              <NavLink
                to="/plans"
                className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
                <span className="bottom-label">Plans</span>
              </NavLink>
              <NavLink
                to="/approvals"
                className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 11 12 14 22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
                <span className="bottom-label">Approvals</span>
              </NavLink>
              <NavLink
                to="/payments-received"
                className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M7 9h10M7 13h6" />
                </svg>
                <span className="bottom-label">Received</span>
              </NavLink>
              <NavLink
                to="/media-requests"
                className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="14" height="20" x="5" y="2" rx="2" />
                  <path d="M9 6h6" />
                  <path d="M9 10h6" />
                  <path d="M9 14h4" />
                </svg>
                <span className="bottom-label">Requests</span>
              </NavLink>
              <NavLink
                to="/admin-chats"
                className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                </svg>
                <span className="bottom-label">Chats</span>
              </NavLink>
              <NavLink
                to="/settings"
                className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3 15.4a1.65 1.65 0 0 0-1.51-1H1a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 2.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 6.6 3a1.65 1.65 0 0 0 1.51-1H8a2 2 0 1 1 4 0h-.09A1.65 1.65 0 0 0 13 2.6a1.65 1.65 0 0 0 1.82.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 20.6 8a1.65 1.65 0 0 0 1.51 1H22a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z" />
                </svg>
                <span className="bottom-label">Settings</span>
              </NavLink>
            </>
          ) : (
            <>
              <NavLink
                to="/dashboard"
                className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
                  <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
                <span className="bottom-label">Home</span>
              </NavLink>
              <NavLink
                to="/requests"
                className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M7 5v14" />
                  <path d="M17 5v14" />
                  <path d="M10 9h4" />
                  <path d="M10 13h4" />
                </svg>
                <span className="bottom-label">Requests</span>
              </NavLink>
              <NavLink
                to="/payment-history"
                className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 3h6a2 2 0 0 1 2 2v2H7V5a2 2 0 0 1 2-2z" />
                  <path d="M6 7h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
                  <path d="M8 12h8" />
                  <path d="M8 16h5" />
                </svg>
                <span className="bottom-label">Payments</span>
              </NavLink>
              <NavLink
                to="/subscriptions"
                className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="20" height="14" x="2" y="5" rx="2" />
                  <line x1="2" x2="22" y1="10" y2="10" />
                </svg>
                <span className="bottom-label">Subscribe</span>
              </NavLink>
              <NavLink
                to="/chat"
                className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                </svg>
                <span className="bottom-label">Chat</span>
              </NavLink>
              <NavLink
                to="/settings"
                className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3 15.4a1.65 1.65 0 0 0-1.51-1H1a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 2.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 6.6 3a1.65 1.65 0 0 0 1.51-1H8a2 2 0 1 1 4 0h-.09A1.65 1.65 0 0 0 13 2.6a1.65 1.65 0 0 0 1.82.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 20.6 8a1.65 1.65 0 0 0 1.51 1H22a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z" />
                </svg>
                <span className="bottom-label">Settings</span>
              </NavLink>
            </>
          )}
        </nav>
      )}

      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone}`}>
            {toast.title && <div className="toast-title">{toast.title}</div>}
            {toast.message && <div className="toast-message">{toast.message}</div>}
          </div>
        ))}
      </div>
    </main>
  );
}
