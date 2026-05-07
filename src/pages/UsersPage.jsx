import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const TIME_ZONE = "Asia/Karachi";
const UNLIMITED_ADMIN_NAMES = ["admin", "hucksarn"];

const getPlayStatus = (user) => {
  if (user?.Policy?.EnableMediaPlayback === true) return "ON";
  if (user?.Policy?.EnableMediaPlayback === false) return "OFF";
  return "-";
};

const getUserKey = (user) => user?.userId || user?.username || "";
const getUserId = (user) => user?.userId || user?.Id || user?.id || "";
const getTagKeyForUser = (user) => {
  const id = user?.Id || user?.id || user?.userId || "";
  if (id) return id;
  const name = (user?.Name || user?.name || user?.username || "").toLowerCase();
  return name;
};

const getRegisteredDisplayName = ({ currentUser, subscriptions = [], registrations = [] }) => {
  const username = String(currentUser?.username || "").trim().toLowerCase();
  const userId = String(currentUser?.userId || "").trim();
  if (!username && !userId) return "";

  const byRecentSubscriptions = [...subscriptions].sort(
    (a, b) => new Date(b.updatedAt || b.approvedAt || b.submittedAt || 0) - new Date(a.updatedAt || a.approvedAt || a.submittedAt || 0)
  );
  const subMatch = byRecentSubscriptions.find((sub) => {
    const subUserId = String(sub?.userId || sub?.userKey || "").trim();
    const subName = String(sub?.username || sub?.email || "").trim().toLowerCase();
    return (userId && subUserId && subUserId === userId) || (username && subName === username);
  });
  if (subMatch?.name) return String(subMatch.name).trim();

  const byRecentRegistrations = [...registrations].sort(
    (a, b) =>
      new Date(b.updatedAt || b.approvedAt || b.verifiedAt || b.requestedAt || 0) -
      new Date(a.updatedAt || a.approvedAt || a.verifiedAt || a.requestedAt || 0)
  );
  const regMatch = byRecentRegistrations.find((item) => {
    const embyUserId = String(item?.embyUserId || "").trim();
    const email = String(item?.email || "").trim().toLowerCase();
    return (userId && embyUserId && embyUserId === userId) || (username && email === username);
  });
  return regMatch?.name ? String(regMatch.name).trim() : "";
};
const getContactKeyForUser = (user) => {
  const id = user?.Id || user?.id || user?.userId || "";
  if (id) return String(id).toLowerCase();
  return String(user?.Name || user?.name || user?.username || "").trim().toLowerCase();
};

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE }).format(date);
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const getDateParts = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = {};
  parts.forEach((part) => {
    if (part.type !== "literal") map[part.type] = part.value;
  });
  if (!map.year || !map.month || !map.day) return null;
  return map;
};

const calcDaysLeft = (endDate) => {
  if (!endDate) return "-";
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return "-";
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const now = new Date();
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diff = (endUtc - nowUtc) / (1000 * 60 * 60 * 24);
  if (!Number.isFinite(diff)) return "-";
  return diff >= 0 ? Math.ceil(diff) : Math.floor(diff);
};

const getSubscriptionStatus = (subscriptions, userKey, plans = []) => {
  if (!userKey) return { status: "Not subscribed" };

  const userSubs = subscriptions
    .filter((sub) => sub.userKey === userKey || sub.userId === userKey)
    .sort((a, b) => new Date(b.endDate || b.submittedAt) - new Date(a.endDate || a.submittedAt));

  const active = userSubs.find((sub) => {
    if (!sub.endDate) return false;
    const end = new Date(sub.endDate);
    const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
    const now = new Date();
    const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return endUtc >= nowUtc;
  });
  if (active) {
    return {
      statusTitle: "Subscription Active",
      status: "Active",
      planName: active.planName,
      startDate: active.startDate,
      endDate: active.endDate,
      expiryLabel: "End",
    };
  }

  const pending = userSubs.find((sub) => sub.status === "pending");
  if (pending) {
    return {
      statusTitle: "Subscription Pending",
      status: "Pending",
      planName: pending.planName,
      startDate: pending.submittedAt,
      expiryLabel: "Submitted",
    };
  }

  const lastExpired = userSubs.find((sub) => sub.endDate);
  if (lastExpired) {
    return {
      statusTitle: "Subscription Expired",
      status: "Expired",
      planName: lastExpired.planName,
      startDate: lastExpired.startDate,
      endDate: lastExpired.endDate,
      expiryLabel: "Expired",
    };
  }

  const fallbackPlan = plans.find((plan) => plan.status === "Active") || plans[0];
  return {
    statusTitle: "Subscription Expired",
    status: "Expired",
    planName: fallbackPlan?.name || "-",
    expiryLabel: "Expired",
  };
};

const getUserSubscriptionRow = (subscriptions, user) => {
  const userId = user?.Id || user?.id || "";
  const username = (user?.Name || user?.name || "").toLowerCase();
  if (!userId && !username) return { status: "-", startDate: "-", endDate: "-", daysLeft: "-" };

  const matchesUser = (sub) => {
    if (!sub) return false;
    if (userId && (sub.userId === userId || sub.userKey === userId)) return true;
    if (username && (sub.username || "").toLowerCase() === username) return true;
    if (username && (sub.userKey || "").toLowerCase() === username) return true;
    return false;
  };

  const userSubs = subscriptions
    .filter(matchesUser)
    .sort((a, b) => new Date(b.endDate || b.submittedAt) - new Date(a.endDate || a.submittedAt));

  const active = userSubs.find((sub) => {
    if (!sub.endDate) return false;
    const end = new Date(sub.endDate);
    const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
    const now = new Date();
    const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return endUtc >= nowUtc;
  });
  if (active) {
    const endDate = active.endDate;
    const daysLeft = calcDaysLeft(endDate);
    return {
      status: "Active",
      startDate: active.startDate,
      endDate: active.endDate,
      daysLeft,
    };
  }

  const pending = userSubs.find((sub) => sub.status === "pending");
  if (pending) {
    return {
      status: "Pending",
      startDate: pending.submittedAt,
      endDate: "-",
      daysLeft: "-",
    };
  }

  const lastExpired = userSubs.find((sub) => sub.endDate);
  if (lastExpired) {
    return {
      status: "Expired",
      startDate: lastExpired.startDate,
      endDate: lastExpired.endDate,
      daysLeft: calcDaysLeft(lastExpired.endDate),
    };
  }

  return { status: "-", startDate: "-", endDate: "-", daysLeft: "-" };
};

const statusConfig = (status) => {
  switch (status) {
    case "Active":
      return { badge: "Active", tone: "success" };
    case "Unlimited":
      return { badge: "Unlimited", tone: "success" };
    case "Pending":
      return { badge: "Pending", tone: "warning" };
    case "Expired":
    default:
      return { badge: "Expired", tone: "danger" };
  }
};

const toInputDate = (value) => {
  if (!value || value === "-") return "";
  const parts = getDateParts(value);
  if (!parts) return "";
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const toMs = (value) => {
  if (!value || value === "-") return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

const addDaysToInput = (value, days) => {
  if (!value) return "";
  const parts = String(value).split("-");
  if (parts.length !== 3) return "";
  const [yearStr, monthStr, dayStr] = parts;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return "";
  const utcMs = Date.UTC(year, month - 1, day, 12, 0, 0);
  if (!Number.isFinite(utcMs)) return "";
  const date = new Date(utcMs);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  const y = String(date.getUTCFullYear());
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const getCreatorLabel = (user) => {
  const creator = String(user?.createdBy || user?.created_by || "").trim();
  return creator || "admin";
};

const getRecordSortTime = (record) => {
  const raw =
    record?.updatedAt ||
    record?.approvedAt ||
    record?.verifiedAt ||
    record?.submittedAt ||
    record?.requestedAt ||
    record?.createdAt ||
    "";
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

export default function UsersPage({
  users,
  isAdmin,
  currentUser,
  settings,
  subscriptions = [],
  plans = [],
  onUpdateDates,
  unlimitedUsers = [],
  userTags = {},
  userContacts = {},
  onUpdateUserTags,
  onUpdateUserContact,
  onAddUnlimitedUser,
  onRemoveUnlimitedUser,
  onSyncUsers,
  registrations = [],
}) {
  const baseUsers = useMemo(() => users || [], [users]);
  const [newTagByKey, setNewTagByKey] = useState({});
  const [editingTag, setEditingTag] = useState(null);
  const [activeTagKey, setActiveTagKey] = useState(null);
  const [activeTab, setActiveTab] = useState("users");
  const [sortKey, setSortKey] = useState("user");
  const [sortDir, setSortDir] = useState("asc");
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [dateDrafts, setDateDrafts] = useState({});
  const [contactDrafts, setContactDrafts] = useState({});
  const [userSearch, setUserSearch] = useState("");
  const navigate = useNavigate();

  if (!isAdmin) {
    const userKey = getUserKey(currentUser);
    const userId = getUserId(currentUser);
    const isUnlimited =
      unlimitedUsers.some(
        (item) =>
          item.key === userId ||
          (item.userId && item.userId === userId) ||
          (item.username || "").toLowerCase() === (currentUser?.username || "").toLowerCase()
      );
    const planLabel = "MovieFlixHD Premium";
    const subInfo = isUnlimited
      ? {
          statusTitle: "Unlimited Access",
          status: "Unlimited",
          planName: planLabel,
          startDate: null,
          endDate: null,
          expiryLabel: "Access",
        }
      : getSubscriptionStatus(subscriptions, userKey, plans);
    const embyUser =
      users.find(
        (user) =>
          (currentUser?.userId && (user.Id || user.id) === currentUser.userId) ||
          (user.Name || user.name || "").toLowerCase() ===
            (currentUser?.username || "").toLowerCase()
      ) || null;
    const daysLeft = calcDaysLeft(subInfo.endDate);
    const daysLeftValue =
      typeof daysLeft === "number" && Number.isFinite(daysLeft)
        ? daysLeft < 0
          ? "NONE"
          : daysLeft
        : "-";
    const playbackStatus =
      subInfo.status === "Expired" ||
      (typeof daysLeft === "number" && daysLeft < 0)
        ? "OFF"
        : getPlayStatus(embyUser);
    const registeredDisplayName = getRegisteredDisplayName({
      currentUser,
      subscriptions,
      registrations,
    });
    const tone = statusConfig(subInfo.status);
    return (
      <section className="card user-home">
        <div>
          <h1 className="welcome-title">
            {registeredDisplayName ? `Welcome, ${registeredDisplayName}` : "Welcome"}
          </h1>
          <p className="welcome-subtitle">Manage your subscription below.</p>
        </div>

        <div className={`status-card ${tone.tone}`}>
          <div className="status-header">
            <span className={`status-title ${tone.tone}`}>{subInfo.statusTitle}</span>
            <span className={`badge ${tone.tone}`}>{tone.badge}</span>
          </div>
          <div className={`status-grid ${tone.tone}`}>
            <div>
              <p className="status-label">Plan</p>
              <p className="status-value">{planLabel}</p>
            </div>
            <div>
              <p className="status-label">{subInfo.expiryLabel || "End"}</p>
              <p className={`status-value ${tone.tone}`}>
                {subInfo.status === "Unlimited"
                  ? "Unlimited"
                  : formatDate(subInfo.endDate || subInfo.startDate)}
              </p>
            </div>
            <div>
              <p className="status-label">Days left</p>
              <p className="status-value">
                {subInfo.status === "Unlimited" ? "Unlimited" : daysLeftValue}
              </p>
            </div>
            <div>
              <p className="status-label">Playback</p>
              <span className={`badge ${tone.tone}`}>{playbackStatus}</span>
            </div>
          </div>
          {subInfo.status !== "Active" && subInfo.status !== "Unlimited" && (
            <button
              className="btn primary full"
              type="button"
              onClick={() => navigate("/subscriptions")}
            >
              Resubscribe Now
            </button>
          )}
        </div>

        <div className="mini-card">
          <div className="mini-header">
            <div className="mini-app-copy">
              <span className="mini-title">Emby App</span>
              <span className="mini-download-hint mini-download-hint-strong">
                PLEASE DOWNLOAD THE APP FIRST
              </span>
              <span className="mini-download-hint">
                Streaming is designed for the Emby app. Browser playback may feel less smooth.
              </span>
            </div>
            <div className="mini-actions mini-actions-download">
              <span className="mini-download-label">Download</span>
              <a
                href="https://apps.apple.com/us/app/emby/id992180193"
                target="_blank"
                rel="noreferrer"
              >
                <img
                  className="store-badge"
                  src="/appstore-badge.svg"
                  alt="Download on the App Store"
                  loading="lazy"
                />
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=com.mb.android&hl=en"
                target="_blank"
                rel="noreferrer"
              >
                <img
                  className="store-badge"
                  src="/googleplay-badge.svg"
                  alt="Get it on Google Play"
                  loading="lazy"
                />
              </a>
            </div>
          </div>
        </div>

        <div className="mini-card mini-card-streaming">
          <div className="section-title">Start Streaming</div>
          <div className="muted mini-card-streaming-copy">
            Once the app is downloaded, follow this guide to set up and log in to Emby properly.
          </div>
          <div className="mini-card-streaming-actions">
            <button
              className="btn ghost small"
              type="button"
              onClick={() => navigate("/emby-login-guide")}
            >
              How To Login
            </button>
          </div>
        </div>


      </section>
    );
  }

  const unlimitedMap = new Map(
    unlimitedUsers.map((item) => [item.key, item])
  );
  const isDefaultUnlimited = (user) => {
    const name = (user.Name || user.name || "").toLowerCase();
    if (UNLIMITED_ADMIN_NAMES.includes(name)) return true;
    if (user?.Policy?.IsAdministrator === true) return true;
    if (user?.Configuration?.IsAdministrator === true) return true;
    return false;
  };
  const isMarkedUnlimited = (user) => {
    const name = (user.Name || user.name || "").toLowerCase();
    const userId = user.Id || user.id || "";
    const key = userId || name;
    return unlimitedMap.has(key);
  };

  const unlimitedList = baseUsers.filter(
    (user) => isDefaultUnlimited(user) || isMarkedUnlimited(user)
  );
  const normalUsers = baseUsers.filter(
    (user) => !isDefaultUnlimited(user) && !isMarkedUnlimited(user)
  );

  const expiredList = useMemo(
    () =>
      normalUsers.filter((user) => {
        const subRow = getUserSubscriptionRow(subscriptions, user);
        if (subRow.status === "Expired") return true;
        return typeof subRow.daysLeft === "number" && subRow.daysLeft < 0;
      }),
    [normalUsers, subscriptions]
  );

  const activeList = useMemo(
    () =>
      normalUsers.filter((user) => {
        const subRow = getUserSubscriptionRow(subscriptions, user);
        return subRow.status === "Active";
      }),
    [normalUsers, subscriptions]
  );

  const visibleUsers =
    activeTab === "unlimited"
      ? unlimitedList
      : activeTab === "expired"
        ? expiredList
        : activeList;
  const normalizedSearch = userSearch.trim().toLowerCase();
  const filteredUsers = useMemo(() => {
    if (!normalizedSearch) return visibleUsers;
    return visibleUsers.filter((user) => {
      const name = String(user?.Name || user?.name || "").toLowerCase();
      const username = String(user?.UserName || user?.username || "").toLowerCase();
      const id = String(user?.Id || user?.id || "").toLowerCase();
      return (
        name.includes(normalizedSearch) ||
        username.includes(normalizedSearch) ||
        id.includes(normalizedSearch)
      );
    });
  }, [normalizedSearch, visibleUsers]);

  const rows = useMemo(
    () =>
      filteredUsers.map((user) => {
        const subRow = getUserSubscriptionRow(subscriptions, user);
        const daysLeftNum =
          typeof subRow.daysLeft === "number" && Number.isFinite(subRow.daysLeft)
            ? subRow.daysLeft
            : null;
        const shouldForceOff =
          subRow.status === "Expired" &&
          typeof subRow.daysLeft === "number" &&
          subRow.daysLeft < 0;
        const isUnlimited = isDefaultUnlimited(user) || isMarkedUnlimited(user);
        const playStatus = isUnlimited ? "ON" : shouldForceOff ? "OFF" : getPlayStatus(user);
        const startMs = toMs(subRow.startDate);
        const endMs = toMs(subRow.endDate);
        const name = (user.Name || user.name || "Unknown").toLowerCase();
        return {
          user,
          subRow,
          daysLeftNum,
          playStatus,
          startMs,
          endMs,
          name,
          statusLabel: activeTab === "unlimited" ? "Unlimited" : subRow.status,
        };
      }),
    [filteredUsers, subscriptions, activeTab]
  );

  const sortedRows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const getValue = (row) => {
      switch (sortKey) {
        case "user":
          return row.name;
        case "status":
          return row.statusLabel || "";
        case "start":
          return row.startMs;
        case "end":
          return row.endMs;
        case "daysLeft":
          return row.daysLeftNum;
        case "play":
          return row.playStatus;
        default:
          return row.name;
      }
    };
    return [...rows].sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      const aEmpty = av === null || av === undefined || av === "";
      const bEmpty = bv === null || bv === undefined || bv === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv) * dir;
      }
      return (av - bv) * dir;
    });
  }, [rows, sortKey, sortDir]);

  const contactMap = useMemo(() => {
    const map = new Map();
    const setContact = (key, entry) => {
      const normalizedKey = String(key || "").trim().toLowerCase();
      if (!normalizedKey) return;
      const email = String(entry?.email || "").trim().toLowerCase();
      const phone = String(entry?.phone || "").trim();
      if (!email && !phone) return;
      if (map.has(normalizedKey)) return;
      map.set(normalizedKey, { email, phone });
    };

    const sortedSubs = [...subscriptions].sort((a, b) => getRecordSortTime(b) - getRecordSortTime(a));
    sortedSubs.forEach((sub) => {
      const entry = {
        email: String(sub?.email || sub?.username || "").trim().toLowerCase(),
        phone: String(sub?.phone || "").trim(),
      };
      setContact(sub?.userId, entry);
      setContact(sub?.userKey, entry);
      setContact(sub?.username, entry);
      setContact(sub?.email, entry);
    });

    const sortedRegs = [...registrations].sort((a, b) => getRecordSortTime(b) - getRecordSortTime(a));
    sortedRegs.forEach((reg) => {
      const entry = {
        email: String(reg?.email || "").trim().toLowerCase(),
        phone: String(reg?.phone || "").trim(),
      };
      setContact(reg?.embyUserId, entry);
      setContact(reg?.email, entry);
    });
    Object.entries(userContacts || {}).forEach(([key, entry]) => {
      const normalizedKey = String(key || "").trim().toLowerCase();
      if (!normalizedKey || !entry || typeof entry !== "object") return;
      map.set(normalizedKey, {
        email: String(entry.email || "").trim().toLowerCase(),
        phone: String(entry.phone || "").trim(),
      });
    });
    return map;
  }, [subscriptions, registrations, userContacts]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  };

  const sortIndicator = (key) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? "▲" : "▼";
  };

  useEffect(() => {
    setExpandedUserId(null);
  }, [activeTab]);

  const handleAddTag = (key, tags) => {
    if (!onUpdateUserTags || !key) return;
    const value = String(newTagByKey[key] || "").trim().toLowerCase();
    if (!value) return;
    onUpdateUserTags(key, [...tags, value]);
    setNewTagByKey((prev) => ({ ...prev, [key]: "" }));
    setActiveTagKey(null);
  };

  const handleRemoveTag = (key, tags, index) => {
    if (!onUpdateUserTags || !key) return;
    const next = tags.filter((_, i) => i !== index);
    onUpdateUserTags(key, next);
  };

  const commitEditTag = (key, tags, index, value) => {
    if (!onUpdateUserTags || !key) return;
    const nextValue = String(value || "").trim().toLowerCase();
    const next = [...tags];
    if (!nextValue) {
      next.splice(index, 1);
    } else {
      next[index] = nextValue;
    }
    onUpdateUserTags(key, next);
    setEditingTag(null);
  };

  const setContactDraft = (key, field, value) => {
    setContactDrafts((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        [field]: value,
      },
    }));
  };

  const saveUserContact = (key, currentContact) => {
    if (!onUpdateUserContact || !key) return;
    const draft = contactDrafts[key] || {};
    onUpdateUserContact(key, {
      email: draft.email ?? currentContact.email ?? "",
      phone: draft.phone ?? currentContact.phone ?? "",
    });
  };

  return (
    <section className="card users-page">
      <div className="card-header">
        <h2>Users</h2>
        <div className="row">
          <div className="count">
            {filteredUsers.length} total
          </div>
          {isAdmin && (
            <button className="btn ghost small" type="button" onClick={onSyncUsers}>
              Sync Emby Users
            </button>
          )}
        </div>
      </div>
      <div className="tab-row">
        <button
          className={`tab-button ${activeTab === "users" ? "active" : ""}`}
          type="button"
          onClick={() => setActiveTab("users")}
        >
          Users
        </button>
        <button
          className={`tab-button ${activeTab === "expired" ? "active" : ""}`}
          type="button"
          onClick={() => setActiveTab("expired")}
        >
          Expired Users
        </button>
        <button
          className={`tab-button ${activeTab === "unlimited" ? "active" : ""}`}
          type="button"
          onClick={() => setActiveTab("unlimited")}
        >
          Unlimited Users
        </button>
      </div>
      <div className="row">
        <input
          type="text"
          className="user-search"
          value={userSearch}
          onChange={(event) => setUserSearch(event.target.value)}
          placeholder="Search users"
        />
      </div>
      <div className="table-wrap">
        <table className="table">
          <colgroup>
            <col className="col-user" />
            {isAdmin && <col className="col-phone" />}
            <col className="col-status" />
            <col className="col-days" />
            <col className="col-play" />
            {isAdmin && <col className="col-last-active" />}
            <col className="col-action" />
          </colgroup>
          <thead>
            {activeTab === "unlimited" ? (
              <tr>
                <th className={`sortable col-user ${sortKey === "user" ? "active" : ""}`}>
                  <button type="button" onClick={() => toggleSort("user")}>
                    User <span className="sort-indicator">{sortIndicator("user")}</span>
                  </button>
                </th>
                {isAdmin && <th className="col-phone">Phone</th>}
                <th className={`sortable col-status ${sortKey === "status" ? "active" : ""}`}>
                  <button type="button" onClick={() => toggleSort("status")}>
                    Status <span className="sort-indicator">{sortIndicator("status")}</span>
                  </button>
                </th>
                <th className={`sortable col-days ${sortKey === "daysLeft" ? "active" : ""}`}>
                  <button type="button" onClick={() => toggleSort("daysLeft")}>
                    Days <span className="sort-indicator">{sortIndicator("daysLeft")}</span>
                  </button>
                </th>
                <th className={`sortable col-play ${sortKey === "play" ? "active" : ""}`}>
                  <button type="button" onClick={() => toggleSort("play")}>
                    Play <span className="sort-indicator">{sortIndicator("play")}</span>
                  </button>
                </th>
                {isAdmin && <th className="col-last-active">Last Active</th>}
                <th className="col-action">Action</th>
              </tr>
            ) : (
              <tr>
                <th className={`sortable col-user ${sortKey === "user" ? "active" : ""}`}>
                  <button type="button" onClick={() => toggleSort("user")}>
                    User <span className="sort-indicator">{sortIndicator("user")}</span>
                  </button>
                </th>
                {isAdmin && <th className="col-phone">Phone</th>}
                <th className={`sortable col-status ${sortKey === "status" ? "active" : ""}`}>
                  <button type="button" onClick={() => toggleSort("status")}>
                    Status <span className="sort-indicator">{sortIndicator("status")}</span>
                  </button>
                </th>
                <th className={`sortable col-days ${sortKey === "daysLeft" ? "active" : ""}`}>
                  <button type="button" onClick={() => toggleSort("daysLeft")}>
                    Days <span className="sort-indicator">{sortIndicator("daysLeft")}</span>
                  </button>
                </th>
                <th className={`sortable col-play ${sortKey === "play" ? "active" : ""}`}>
                  <button type="button" onClick={() => toggleSort("play")}>
                    Play <span className="sort-indicator">{sortIndicator("play")}</span>
                  </button>
                </th>
                {isAdmin && <th className="col-last-active">Last Active</th>}
                <th className="col-action">Action</th>
              </tr>
            )}
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const { user, subRow, playStatus } = row;
              const daysLeft =
                typeof subRow.daysLeft === "number" && subRow.daysLeft < 0
                  ? "NONE"
                  : subRow.daysLeft === "-"
                    ? "-"
                    : String(subRow.daysLeft);
              const userId = user.Id || user.id || user.Name;
              const startValue = toInputDate(subRow.startDate);
              const endValue = toInputDate(subRow.endDate);
              const draft = dateDrafts[userId] || {};
              const draftStart = draft.startDate ?? startValue;
              const draftEnd = draft.endDate ?? endValue;
              const lastActiveRaw =
                user?.LastActivityDate || user?.LastLoginDate || user?.lastActivityDate || "";
              const lastActive = formatDateTime(lastActiveRaw);
              const markedUnlimited = isMarkedUnlimited(user);
              const defaultUnlimited = isDefaultUnlimited(user);
              const canMakeUnlimited =
                !defaultUnlimited && !markedUnlimited && typeof onAddUnlimitedUser === "function";
              const canRemoveUnlimited =
                markedUnlimited && typeof onRemoveUnlimitedUser === "function";
            const isAdminUser =
              user?.Policy?.IsAdministrator === true ||
              user?.Configuration?.IsAdministrator === true;
              const tagKey = getTagKeyForUser(user);
              const contactKey = getContactKeyForUser(user);
              const nameKey = (user.Name || user.name || user.username || "").toLowerCase();
              const emailKey = String(user?.Name || user?.name || "").toLowerCase();
              const contactEntry =
                contactMap.get(String(user?.Id || user?.id || "").toLowerCase()) ||
                contactMap.get(nameKey) ||
                contactMap.get(emailKey) ||
                { email: "", phone: "" };
              const userPhone = contactEntry.phone || "-";
              const userEmail = contactEntry.email || "-";
              const contactDraft = contactDrafts[contactKey] || {};
              const rawTags = userTags?.[tagKey] || (nameKey && userTags?.[nameKey]) || [];
              const tags = Array.isArray(rawTags)
                ? rawTags
                    .map((tag) => String(tag || "").trim().toLowerCase())
                    .filter(Boolean)
                : [];

            const isExpanded = expandedUserId === userId;

            return (
              <Fragment key={userId}>
                <tr>
                <td className="col-user">
                  <div className="user-cell">
                    <button
                      type="button"
                      className="user-expand"
                      onClick={() =>
                        setExpandedUserId((prev) => (prev === userId ? null : userId))
                      }
                      aria-expanded={isExpanded}
                      title="Toggle user details"
                    >
                      <span className="user-name">{user.Name || user.name || "Unknown"}</span>
                      <span className="expand-caret" aria-hidden="true">
                        {isExpanded ? "v" : ">"}
                      </span>
                    </button>
                    {tags.length > 0 && (
                      <span className="user-tags-inline">
                        {tags.map((tag, index) => (
                          <span className="tag-chip" key={`${tagKey}-inline-${index}`}>
                            <span className="tag-label">{tag}</span>
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                </td>
                {isAdmin && <td className="col-phone">{userPhone}</td>}
                <td className="col-status">
                  {activeTab === "unlimited" ? "Unlimited" : subRow.status}
                </td>
                <td className="col-days">
                  {activeTab === "unlimited" ? "-" : daysLeft}
                </td>
                <td className="col-play">
                  <button
                    type="button"
                    className={`btn tiny play-status ${
                      playStatus === "ON" ? "on" : playStatus === "OFF" ? "off" : "unknown"
                    }`}
                    aria-label={`Playback ${playStatus}`}
                    tabIndex={-1}
                  >
                    {playStatus}
                  </button>
                </td>
                {isAdmin && <td className="col-last-active">{lastActive}</td>}
                <td className="col-action">
                  {activeTab !== "unlimited" && canMakeUnlimited ? (
                    <button
                      className="btn ghost tiny make-unlimited-btn"
                      type="button"
                      onClick={() => onAddUnlimitedUser(user)}
                    >
                      Make Unlimited
                    </button>
                  ) : activeTab === "unlimited" && canRemoveUnlimited ? (
                    <button
                      className="btn ghost tiny"
                      type="button"
                      onClick={() => {
                        const name = (user.Name || user.name || "").toLowerCase();
                        const key = (user.Id || user.id || "") || name;
                        onRemoveUnlimitedUser(key);
                      }}
                    >
                      Remove Unlimited
                    </button>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
              {isExpanded && (
                <tr className="user-detail-row">
                  <td colSpan={isAdmin ? 7 : 5}>
                    <div className="user-detail-grid">
                      <div className="detail-item">
                        <span className="detail-label">Username</span>
                        <span className="detail-value">{user.Name || user.name || "-"}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Admin</span>
                        <span className="detail-value">{isAdminUser ? "Yes" : "No"}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Phone</span>
                        <span className="detail-value">{userPhone}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Email</span>
                        <span className="detail-value">{userEmail}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Status</span>
                        <span className="detail-value">
                          {activeTab === "unlimited" ? "Unlimited" : subRow.status}
                        </span>
                      </div>
                      {isAdmin && (
                        <div className="detail-item detail-item-wide">
                          <span className="detail-label">Contact Details</span>
                          <div className="user-contact-editor">
                            <input
                              type="email"
                              className="user-contact-input"
                              value={contactDraft.email ?? contactEntry.email ?? ""}
                              onChange={(event) =>
                                setContactDraft(contactKey, "email", event.target.value)
                              }
                              placeholder="Email"
                            />
                            <input
                              type="tel"
                              className="user-contact-input"
                              value={contactDraft.phone ?? contactEntry.phone ?? ""}
                              onChange={(event) =>
                                setContactDraft(contactKey, "phone", event.target.value)
                              }
                              placeholder="+9607000000"
                            />
                            <button
                              type="button"
                              className="btn ghost tiny"
                              onClick={() => saveUserContact(contactKey, contactEntry)}
                            >
                              Save Contact
                            </button>
                          </div>
                        </div>
                      )}
                      {activeTab !== "unlimited" && (
                        <>
                          <div className="detail-item">
                            <span className="detail-label">Start</span>
                            <span className="detail-value">
                              <input
                                type="date"
                                value={draftStart}
                                onChange={(event) => {
                                  const nextStart = event.target.value;
                                  const nextEnd = addDaysToInput(nextStart, 30) || draftEnd || "";
                                  setDateDrafts((prev) => ({
                                    ...prev,
                                    [userId]: { ...(prev[userId] || {}), startDate: nextStart, endDate: nextEnd },
                                  }));
                                  if (!onUpdateDates) return;
                                  if (!nextStart || !nextEnd) return;
                                  onUpdateDates({ user, startDate: nextStart, endDate: nextEnd });
                                }}
                              />
                            </span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">End</span>
                            <span className="detail-value">
                              <input
                                type="date"
                                value={draftEnd}
                                onChange={(event) => {
                                  const nextEnd = event.target.value;
                                  setDateDrafts((prev) => ({
                                    ...prev,
                                    [userId]: { ...(prev[userId] || {}), endDate: nextEnd },
                                  }));
                                  if (!onUpdateDates) return;
                                  const startForSave = draftStart || startValue;
                                  if (!startForSave || !nextEnd) return;
                                  onUpdateDates({ user, startDate: startForSave, endDate: nextEnd });
                                }}
                              />
                            </span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Days left</span>
                            <span className="detail-value">
                              {typeof subRow.daysLeft === "number" && subRow.daysLeft < 0
                                ? "NONE"
                                : subRow.daysLeft}
                            </span>
                          </div>
                        </>
                      )}
                      <div className="detail-item">
                        <span className="detail-label">Playback</span>
                        <span className="detail-value">{playStatus}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Tags</span>
                        <span className="detail-value">
                          <div className="tag-row">
                            {tags.map((tag, index) => {
                              const isEditing =
                                editingTag?.key === tagKey && editingTag?.index === index;
                              if (isEditing && isAdmin) {
                                return (
                                  <span className="tag-edit" key={`${tagKey}-edit-${index}`}>
                                    <input
                                      className="tag-edit-input"
                                      type="text"
                                      value={editingTag.value}
                                      autoFocus
                                      onChange={(event) =>
                                        setEditingTag((prev) =>
                                          prev ? { ...prev, value: event.target.value } : prev
                                        )
                                      }
                                      onBlur={() =>
                                        commitEditTag(tagKey, tags, index, editingTag?.value)
                                      }
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                          event.preventDefault();
                                          commitEditTag(tagKey, tags, index, editingTag?.value);
                                        }
                                        if (event.key === "Escape") {
                                          event.preventDefault();
                                          setEditingTag(null);
                                        }
                                      }}
                                    />
                                  </span>
                                );
                              }
                              return (
                                <span className="tag-chip" key={`${tagKey}-${index}`}>
                                  {isAdmin ? (
                                    <>
                                      <button
                                        type="button"
                                        className="tag-label"
                                        onClick={() =>
                                          setEditingTag({ key: tagKey, index, value: tag })
                                        }
                                      >
                                        {tag}
                                      </button>
                                      <button
                                        type="button"
                                        className="tag-remove"
                                        onClick={() => handleRemoveTag(tagKey, tags, index)}
                                        aria-label={`Remove tag ${tag}`}
                                      >
                                        ×
                                      </button>
                                    </>
                                  ) : (
                                    <span className="tag-label">{tag}</span>
                                  )}
                                </span>
                              );
                            })}
                            <span className="tag-add">
                              {isAdmin && activeTagKey === tagKey ? (
                                <>
                                  <input
                                    type="text"
                                    className="tag-add-input"
                                    placeholder="Add tag"
                                    value={newTagByKey[tagKey] || ""}
                                    autoFocus
                                    onChange={(event) =>
                                      setNewTagByKey((prev) => ({
                                        ...prev,
                                        [tagKey]: event.target.value,
                                      }))
                                    }
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        event.preventDefault();
                                        handleAddTag(tagKey, tags);
                                      }
                                      if (event.key === "Escape") {
                                        event.preventDefault();
                                        setActiveTagKey(null);
                                      }
                                    }}
                                  />
                                  <button
                                    type="button"
                                    className="btn ghost tiny"
                                    onClick={() => handleAddTag(tagKey, tags)}
                                  >
                                    +
                                  </button>
                                </>
                              ) : isAdmin ? (
                                <button
                                  type="button"
                                  className="btn ghost tiny"
                                  onClick={() => setActiveTagKey(tagKey)}
                                >
                                  +
                                </button>
                              ) : null}
                            </span>
                          </div>
                        </span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Actions</span>
                        <span className="detail-value">
                          <div className="actions">
                            {activeTab !== "unlimited" && canMakeUnlimited && (
                              <button
                                className="btn small make-unlimited-btn"
                                type="button"
                                onClick={() => onAddUnlimitedUser(user)}
                              >
                                Make Unlimited
                              </button>
                            )}
                            {activeTab === "unlimited" && !defaultUnlimited && (
                              <button
                                className="btn ghost small"
                                type="button"
                                onClick={() => {
                                  if (!canRemoveUnlimited) return;
                                  const name = (user.Name || user.name || "").toLowerCase();
                                  const key = (user.Id || user.id || "") || name;
                                  onRemoveUnlimitedUser(key);
                                }}
                              >
                                Remove Unlimited
                              </button>
                            )}
                          </div>
                        </span>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
          {filteredUsers.length === 0 && (
            <tr>
              <td colSpan={isAdmin ? 7 : 5}>
                <div className="empty-state">
                  <div className="empty-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="8" cy="8" r="3" />
                      <circle cx="17" cy="8" r="3" />
                      <path d="M2 20c0-3 3-5 6-5" />
                      <path d="M22 20c0-3-3-5-6-5" />
                    </svg>
                  </div>
                  <div className="empty-title">No users found</div>
                  <div className="empty-subtitle">Try adjusting your filters.</div>
                </div>
              </td>
            </tr>
          )}
        </tbody>
        </table>
      </div>
    </section>
  );
}
