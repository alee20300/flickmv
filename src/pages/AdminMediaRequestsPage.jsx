import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../lib/api.js";

const TIME_ZONE = "Asia/Karachi";

const apiUrl = (path) => `${path.startsWith("/") ? path : `/${path}`}`;

const normalizeMediaType = (value) => {
  const raw = String(value || "").toLowerCase();
  if (raw === "tv" || raw === "show" || raw === "series") return "tv";
  return "movie";
};

const formatLanguage = (value) => {
  if (!value) return "";
  const code = String(value).trim();
  try {
    if (typeof Intl !== "undefined" && Intl.DisplayNames) {
      const display = new Intl.DisplayNames(["en"], { type: "language" });
      const name = display.of(code.toLowerCase());
      return name || code.toUpperCase();
    }
  } catch {
    // ignore
  }
  return code.toUpperCase();
};

const fetchSeerDetails = async (mediaType, mediaId) => {
  const primary =
    normalizeMediaType(mediaType) === "tv"
      ? `/api/seer/api/v1/tv/${mediaId}`
      : `/api/seer/api/v1/movie/${mediaId}`;
  const secondary =
    normalizeMediaType(mediaType) === "tv"
      ? `/api/seer/api/v1/movie/${mediaId}`
      : `/api/seer/api/v1/tv/${mediaId}`;
  const tryFetch = async (endpoint) => {
    const response = await fetch(apiUrl(endpoint));
    if (!response.ok) return null;
    try {
      return await response.json();
    } catch {
      return null;
    }
  };
  return (await tryFetch(primary)) || (await tryFetch(secondary));
};

const logClientError = async (payload) => {
  try {
    await fetch(apiUrl("/api/client-errors"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // ignore logging errors
  }
};

const fetchServerJson = async (path) => {
  try {
    const response = await fetch(apiUrl(path));
    if (!response.ok) {
      const text = await response.text();
      const message = text || `Failed to load ${path}.`;
      await logClientError({ type: "fetch_error", path, status: response.status, message });
      throw new Error(message);
    }
    return response.json();
  } catch (err) {
    const message = err?.message || String(err || "unknown_error");
    await logClientError({ type: "fetch_exception", path, message });
    throw new Error(`Failed to load ${path}: ${message}`);
  }
};

const getAdminHeaders = () => {
  try {
    const raw = localStorage.getItem("movieflix_session");
    const session = raw ? JSON.parse(raw) : null;
    if (session?.role === "admin" && session?.username) {
      return { "x-admin-user": session.username };
    }
  } catch {
    // ignore
  }
  return {};
};

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE }).format(date);
};

const formatAvailabilityDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
};

const normalizeStatus = (request) => {
  const rawStatus = String(request?.status || request?.request_status || "").trim().toLowerCase();
  const releaseStatus = String(
    request?.release_status || request?.releaseStatus || request?.release_state || ""
  ).toLowerCase();
  const hasAvailabilityDate = Boolean(request?.availableAt || request?.available_at);
  const approvedNote = "Upload in progress, will be uploaded as soon as it is available.";

  if (rawStatus === "available") return { label: "Available", tone: "done" };
  if (rawStatus === "approved" && hasAvailabilityDate) {
    return { label: "Upcoming", tone: "open" };
  }
  if (releaseStatus === "upcoming") return { label: "Upcoming", tone: "open" };
  if (releaseStatus === "in_cinemas") return { label: "In Cinemas", tone: "open" };
  if (releaseStatus === "unreleased") return { label: "Unreleased", tone: "open" };
  if (rawStatus === "downloading") return { label: "Approved", tone: "open", note: approvedNote };
  if (rawStatus === "approved") return { label: "Approved", tone: "done", note: approvedNote };
  if (rawStatus === "rejected" || rawStatus === "declined") {
    return { label: "Rejected", tone: "declined" };
  }
  if (rawStatus === "pending") return { label: "Pending", tone: "open" };
  return { label: rawStatus ? rawStatus.toUpperCase() : "Pending", tone: "open" };
};

export default function AdminMediaRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [actionStatus, setActionStatus] = useState({});
  const [approveTarget, setApproveTarget] = useState(null);
  const [serverStatus, setServerStatus] = useState("idle");
  const [serverError, setServerError] = useState("");
  const [rootOptions, setRootOptions] = useState([]);
  const [profileOptions, setProfileOptions] = useState([]);
  const [rootStatus, setRootStatus] = useState("idle");
  const [rootError, setRootError] = useState("");
  const [selectedRootKey, setSelectedRootKey] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [manualRoot, setManualRoot] = useState("");
  const [manualProfileId, setManualProfileId] = useState("");
  const [detailsById, setDetailsById] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [activeTab, setActiveTab] = useState("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const requestsFetchInFlightRef = useRef(false);

  const fetchRequests = async ({ background = false } = {}) => {
    if (requestsFetchInFlightRef.current) return;
    requestsFetchInFlightRef.current = true;
    setStatus((prev) => (background && prev === "success" ? prev : "loading"));
    if (!background) setError("");
    try {
      const data = await api.fetchMediaRequests();
      setRequests(Array.isArray(data) ? data : []);
      setStatus("success");
    } catch (err) {
      if (!background) {
        setStatus("error");
        setError(err?.message || "Failed to load media requests.");
      }
    } finally {
      requestsFetchInFlightRef.current = false;
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      fetchRequests({ background: true });
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleForceSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setError("");
    try {
      await api.checkMediaRequestStatus();
      await fetchRequests();
    } catch (err) {
      setError(err?.message || "Failed to sync media statuses.");
    } finally {
      setSyncing(false);
    }
  };

  const handleApprove = async (request, rootPayload = {}) => {
    const id = request?.id;
    if (!id) return;
    setActionStatus((prev) => ({ ...prev, [id]: "approving" }));
    try {
      await api.approveMediaRequest(id, rootPayload);
      await fetchRequests();
      setActionStatus((prev) => ({ ...prev, [id]: "" }));
    } catch (err) {
      setActionStatus((prev) => ({ ...prev, [id]: "error" }));
      setError(err?.message || "Failed to approve.");
    }
  };

  const handleReject = async (request) => {
    const id = request?.id;
    if (!id) return;
    setActionStatus((prev) => ({ ...prev, [id]: "rejecting" }));
    try {
      await api.rejectMediaRequest(id);
      await fetchRequests();
      setActionStatus((prev) => ({ ...prev, [id]: "" }));
    } catch (err) {
      setActionStatus((prev) => ({ ...prev, [id]: "error" }));
      setError(err?.message || "Failed to reject.");
    }
  };

  const handleDelete = async (request) => {
    const id = request?.id;
    if (!id) return;
    setActionStatus((prev) => ({ ...prev, [id]: "deleting" }));
    try {
      await api.deleteMediaRequest(id);
      await fetchRequests();
      setActionStatus((prev) => ({ ...prev, [id]: "" }));
    } catch (err) {
      setActionStatus((prev) => ({ ...prev, [id]: "error" }));
      setError(err?.message || "Failed to delete.");
    }
  };

  const handleMarkAvailable = async (request) => {
    const id = request?.id;
    if (!id) return;
    setActionStatus((prev) => ({ ...prev, [id]: "marking-available" }));
    try {
      await api.markAvailableMediaRequest(id);
      await fetchRequests();
      setActionStatus((prev) => ({ ...prev, [id]: "" }));
    } catch (err) {
      setActionStatus((prev) => ({ ...prev, [id]: "error" }));
      setError(err?.message || "Failed to mark available.");
    }
  };

  const confirmDelete = (request) => {
    if (!request) return;
    setDeleteTarget(request);
  };

  const closeDelete = () => {
    setDeleteTarget(null);
  };

  const normalizeProfileList = (data) => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.profiles)) return data.profiles;
    if (Array.isArray(data?.qualityProfiles)) return data.qualityProfiles;
    if (Array.isArray(data?.data)) return data.data;
    return [];
  };

  const normalizeRootFolderList = (data) => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.rootFolders)) return data.rootFolders;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.records)) return data.records;
    return [];
  };

  const loadDownloadOptions = async (request) => {
    setServerStatus("loading");
    setServerError("");
    setRootStatus("idle");
    setRootError("");
    setRootOptions([]);
    setProfileOptions([]);
    setSelectedRootKey("");
    setSelectedProfileId("");
    setManualRoot("");
    setManualProfileId("");
    try {
      const isSeries = String(request?.media_type || "").toLowerCase() === "tv";
      const base = isSeries ? "sonarr" : "radarr";
      const [rootFoldersRaw, profilesRaw] = await Promise.all([
        fetchServerJson(`/api/${base}/api/v3/rootfolder`),
        fetchServerJson(`/api/${base}/api/v3/qualityprofile`),
      ]);
      await logClientError({
        type: "download_options_success",
        mediaType: isSeries ? "tv" : "movie",
        rootCount: Array.isArray(rootFoldersRaw) ? rootFoldersRaw.length : -1,
        profileCount: Array.isArray(profilesRaw) ? profilesRaw.length : -1,
      });
      const rootFolders = normalizeRootFolderList(rootFoldersRaw);
      const profiles = normalizeProfileList(profilesRaw);
      const nextRoots = rootFolders.map((root) => ({
        path: root?.path || "",
      }));
      const nextProfiles = normalizeProfileList(profiles).map((profile) => ({
        id: profile?.id ?? profile?.profileId ?? profile?.profile_id ?? "",
        name: profile?.name || profile?.profileName || "Profile",
      }));
      setServerStatus("success");
      setRootOptions(nextRoots);
      setProfileOptions(nextProfiles.filter((profile) => profile.id !== ""));
      setSelectedRootKey(nextRoots[0]?.path || "");
      setSelectedProfileId(
        nextProfiles.length > 0 ? String(nextProfiles[0].id) : ""
      );
      if (nextRoots.length === 0) {
        setRootError("No root folders found. You can enter one manually.");
      }
      setRootStatus("success");
    } catch (err) {
      const message = err?.message || String(err || "Failed to load download options.");
      await logClientError({ type: "download_options_error", message });
      setServerStatus("error");
      setServerError(message);
      setRootStatus("error");
      setRootError(message);
    }
  };

  const openApproveModal = (request) => {
    if (!request) return;
    setApproveTarget(request);
    logClientError({
      type: "approve_open",
      requestId: request?.id || "",
      mediaType: request?.media_type || "",
    });
    loadDownloadOptions(request);
  };

  const closeApproveModal = () => {
    setApproveTarget(null);
    setServerStatus("idle");
    setServerError("");
    setRootOptions([]);
    setProfileOptions([]);
    setRootStatus("idle");
    setRootError("");
    setSelectedRootKey("");
    setSelectedProfileId("");
    setManualRoot("");
    setManualProfileId("");
  };

  const confirmApprove = async () => {
    if (!approveTarget) return;
    const rootFolder = selectedRootKey || manualRoot.trim();
    const profileValue = selectedProfileId || manualProfileId.trim();
    const profileId =
      profileValue && !Number.isNaN(Number(profileValue)) ? Number(profileValue) : null;
    const payload = {};
    if (rootFolder) payload.rootFolder = rootFolder;
    if (Number.isFinite(profileId)) payload.profileId = profileId;
    await handleApprove(approveTarget, payload);
    closeApproveModal();
  };

  const canApprove = useMemo(() => {
    const rootFolder = selectedRootKey || manualRoot.trim();
    const profileValue = selectedProfileId || manualProfileId.trim();
    const hasProfile =
      profileValue !== "" && !Number.isNaN(Number(profileValue)) && Number(profileValue) >= 0;
    return Boolean(rootFolder) && hasProfile;
  }, [manualProfileId, manualRoot, selectedProfileId, selectedRootKey]);

  useEffect(() => {
    let cancelled = false;
    const loadExpandedDetails = async () => {
      if (!expandedId || detailsById[expandedId]) return;
      const entry = (requests || []).find((item) => item.id === expandedId);
      if (!entry) return;
      try {
        const mediaId = entry?.tmdb_id || entry?.tmdbId || entry?.media_id || entry?.mediaId;
        if (!mediaId) return;
        const details = await fetchSeerDetails(entry.media_type, mediaId);
        if (!details || cancelled) return;
        const detailType = normalizeMediaType(details?.mediaType || entry?.media_type);
        const rawDate =
          details?.releaseDate || details?.firstAirDate || details?.release_date || "";
        const year = rawDate ? String(rawDate).slice(0, 4) : "";
        const overview = details?.overview || details?.summary || "";
        setDetailsById((prev) => ({
          ...prev,
          [entry.id]: {
            year,
            type: detailType === "tv" ? "TV" : "Movie",
            overview,
            language:
              details?.originalLanguage ||
              details?.original_language ||
              details?.language ||
              "",
          },
        }));
      } catch {
        // ignore detail fetch errors
      }
    };
    loadExpandedDetails();
    return () => {
      cancelled = true;
    };
  }, [expandedId, detailsById, requests]);

  const normalized = useMemo(() => {
    return (requests || []).map((entry) => {
      const statusInfo = normalizeStatus(entry);
      const rawStatus = String(entry?.status || entry?.request_status || "").trim().toLowerCase();
      const canApprove = rawStatus === "pending";
      const canReject = !["available", "rejected", "declined"].includes(rawStatus);
      const canMarkAvailable = rawStatus === "approved";
      const availableAt = entry?.available_at || entry?.availableAt || "";
      const availableDateLabel =
        rawStatus === "approved" && availableAt ? formatAvailabilityDate(availableAt) : "";
      const posterPath = entry?.poster_path || entry?.posterPath || "";
      const posterUrl = entry?.poster_url || entry?.posterUrl || "";
      const posterSrc = posterUrl
        ? posterUrl
        : posterPath
        ? `https://image.tmdb.org/t/p/w342${posterPath}`
        : "";
      const details = detailsById[entry.id] || {};
      const language = entry?.language || details.language || "";
      return {
        ...entry,
        statusInfo,
        canApprove,
        canReject,
        canMarkAvailable,
        availableAt,
        availableDateLabel,
        posterSrc,
        detailYear: details.year || "",
        detailType: details.type || (normalizeMediaType(entry?.media_type) === "tv" ? "TV" : "Movie"),
        detailOverview: details.overview || "",
        detailLanguage: formatLanguage(language),
        requestedBy:
          entry?.requested_by_username ||
          entry?.requestedByUsername ||
          entry?.requested_by_name ||
          entry?.requestedByName ||
          entry?.username ||
          "-",
        requestedAt:
          entry?.requested_at || entry?.created_at || entry?.createdAt || entry?.requestedAt || "",
      };
    });
  }, [requests]);

  const tabbedRequests = useMemo(() => {
    const pending = [];
    const approved = [];
    const completed = [];

    for (const request of normalized) {
      const rawStatus = String(request?.status || request?.request_status || "").trim().toLowerCase();
      if (["available", "rejected", "declined"].includes(rawStatus)) {
        completed.push(request);
      } else if (["approved", "downloading"].includes(rawStatus)) {
        approved.push(request);
      } else {
        pending.push(request);
      }
    }

    return { pending, approved, completed };
  }, [normalized]);

  const activeRequests =
    activeTab === "completed"
      ? tabbedRequests.completed
      : activeTab === "approved"
      ? tabbedRequests.approved
      : tabbedRequests.pending;

  const filteredRequests = useMemo(() => {
    const q = String(appliedSearch || "").trim().toLowerCase();
    if (!q) return activeRequests;
    return activeRequests.filter((request) => {
      const title = String(request?.title || request?.media_title || "").toLowerCase();
      const user = String(request?.requestedBy || "").toLowerCase();
      const language = String(request?.detailLanguage || request?.language || "").toLowerCase();
      const year = String(request?.detailYear || request?.year || "");
      return (
        title.includes(q) ||
        user.includes(q) ||
        language.includes(q) ||
        year.includes(q)
      );
    });
  }, [activeRequests, appliedSearch]);

  return (
    <section className="card admin-requests-page">
      <div className="card-header">
        <h2>Media Requests</h2>
        <div className="card-header-actions">
          <button
            type="button"
            className="btn tiny"
            onClick={handleForceSync}
            disabled={syncing}
          >
            {syncing ? "Syncing..." : "Force Sync"}
          </button>
          <div className="count">{filteredRequests.length} shown / {requests.length} total</div>
        </div>
      </div>
      {error && <div className="note">{error}</div>}
      <div className="tab-row">
        <button
          className={`tab-button ${activeTab === "pending" ? "active" : ""}`}
          type="button"
          onClick={() => setActiveTab("pending")}
        >
          Pending Requests ({tabbedRequests.pending.length})
        </button>
        <button
          className={`tab-button ${activeTab === "approved" ? "active" : ""}`}
          type="button"
          onClick={() => setActiveTab("approved")}
        >
          Approved Media ({tabbedRequests.approved.length})
        </button>
        <button
          className={`tab-button ${activeTab === "completed" ? "active" : ""}`}
          type="button"
          onClick={() => setActiveTab("completed")}
        >
          Completed Requests ({tabbedRequests.completed.length})
        </button>
      </div>
      <div className="tab-row admin-request-search-row">
        <input
          type="text"
          className="request-search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") setAppliedSearch(searchQuery);
          }}
          placeholder="Search title, user, language, year"
        />
        <button
          className="btn tiny"
          type="button"
          onClick={() => setAppliedSearch(searchQuery)}
        >
          Search
        </button>
      </div>
      <div className="table-wrap admin-request-list-container">
        <table className="table">
          <colgroup>
            <col className="col-request-title" />
            <col className="col-request-lang" />
            <col className="col-request-user" />
            <col className="col-request-status" />
            <col className="col-request-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>Title</th>
              <th>Language</th>
              <th>User</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRequests.map((request) => {
      const isExpanded = expandedId === request.id;
              return (
                <Fragment key={request.id}>
                  <tr>
                    <td className="col-request-title">
                      <button
                        type="button"
                        className="request-expand"
                        onClick={() =>
                          setExpandedId((prev) => (prev === request.id ? null : request.id))
                        }
                        aria-expanded={isExpanded}
                        title="Toggle request details"
                      >
                        <span className="request-thumb">
                          {request.posterSrc ? (
                            <img
                              src={request.posterSrc}
                              alt=""
                              loading="lazy"
                              onError={(event) => {
                                event.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <span className="request-thumb-fallback">No poster</span>
                          )}
                        </span>
                        <span className="request-title">
                          <span className="request-title-text">
                            {request.title || request.media_title || "Untitled"}
                          </span>
                          <span className="request-meta-line">
                            <span className="request-chip">{request.detailType}</span>
                            {request.detailYear && (
                              <span className="request-chip">{request.detailYear}</span>
                            )}
                          </span>
                        </span>
                        <span
                          className={`request-caret ${isExpanded ? "is-open" : ""}`}
                          aria-hidden="true"
                        >
                          ›
                        </span>
                      </button>
                    </td>
                    <td className="col-request-lang">
                      {request.detailLanguage || "-"}
                    </td>
                    <td className="col-request-user">{request.requestedBy || "-"}</td>
                    <td className="col-request-status">
                      <div className="request-status-stack">
                        <button
                          type="button"
                          className={`btn tiny request-status ${request.statusInfo.tone}`}
                          tabIndex={-1}
                          aria-label={`Status ${request.statusInfo.label}`}
                        >
                          {request.statusInfo.label}
                        </button>
                        {request.availableDateLabel && (
                          <span className="request-chip request-chip-available-date">
                            Available {request.availableDateLabel}
                          </span>
                        )}
                        {request.statusInfo.note && (
                          <span className="request-status-note">{request.statusInfo.note}</span>
                        )}
                      </div>
                    </td>
                    <td className="col-request-actions">
                      {request.canApprove && (
                        <button
                          className="btn tiny"
                          type="button"
                          onClick={() => openApproveModal(request)}
                          disabled={actionStatus[request.id] === "approving"}
                        >
                          {actionStatus[request.id] === "approving"
                            ? "Approving..."
                            : "Approve"}
                        </button>
                      )}
                      <button
                        className="btn ghost tiny"
                        type="button"
                        onClick={() => confirmDelete(request)}
                        disabled={actionStatus[request.id] === "deleting"}
                      >
                        {actionStatus[request.id] === "deleting" ? "Deleting..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="request-detail-row">
                      <td colSpan={3}>
                        <div className="request-cinema-card">
                          <div className="request-cinema-poster">
                            {request.posterSrc ? (
                              <img src={request.posterSrc} alt="" loading="lazy" />
                            ) : (
                              <span className="request-thumb-fallback">No poster</span>
                            )}
                          </div>
                          <div className="request-cinema-content">
                            <div className="request-cinema-title">
                              {request.title || request.media_title || "Untitled"}
                            </div>
                            <div className="request-cinema-meta">
                              {request.detailYear || "-"} • {request.detailType || "-"} • {request.detailLanguage || "-"}
                            </div>
                            <div className="request-cinema-meta">
                              Requested {formatDate(request.requestedAt)}
                              {request.availableDateLabel ? ` • Available ${request.availableDateLabel}` : ""}
                            </div>
                            <div className="request-cinema-overview">
                              {request.detailOverview || "No overview available."}
                            </div>
                            <div className="actions request-cinema-actions">
                              {request.canApprove && (
                                <button
                                  className="btn small"
                                  type="button"
                                  onClick={() => openApproveModal(request)}
                                  disabled={actionStatus[request.id] === "approving"}
                                >
                                  {actionStatus[request.id] === "approving" ? "Approving..." : "Approve"}
                                </button>
                              )}
                              {request.canMarkAvailable && (
                                <button
                                  className="btn small"
                                  type="button"
                                  onClick={() => handleMarkAvailable(request)}
                                  disabled={actionStatus[request.id] === "marking-available"}
                                >
                                  {actionStatus[request.id] === "marking-available" ? "Updating..." : "Mark Available"}
                                </button>
                              )}
                              {request.canReject && (
                                <button
                                  className="btn ghost small"
                                  type="button"
                                  onClick={() => handleReject(request)}
                                  disabled={actionStatus[request.id] === "rejecting"}
                                >
                                  {actionStatus[request.id] === "rejecting" ? "Rejecting..." : "Reject"}
                                </button>
                              )}
                              <button
                                className="btn ghost small"
                                type="button"
                                onClick={() => confirmDelete(request)}
                                disabled={actionStatus[request.id] === "deleting"}
                              >
                                {actionStatus[request.id] === "deleting" ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                            {request.statusInfo.note && (
                              <div className="request-cinema-note">{request.statusInfo.note}</div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {status === "success" && filteredRequests.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">No requests in this tab.</td>
              </tr>
            )}
            {status === "loading" && (
              <>
                {Array.from({ length: 5 }).map((_, index) => (
                  <tr className="table-skeleton-row" key={`req-skel-${index}`}>
                    <td><div className="table-skeleton" /></td>
                    <td><div className="table-skeleton" /></td>
                    <td><div className="table-skeleton" /></td>
                    <td><div className="table-skeleton" /></td>
                  </tr>
                ))}
              </>
            )}
            {status === "success" && normalized.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">
                    <div className="empty-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="16" rx="2" />
                        <path d="M8 4v16M16 4v16" />
                      </svg>
                    </div>
                    <div className="empty-title">No media requests</div>
                    <div className="empty-subtitle">New requests will appear here.</div>
                  </div>
                </td>
              </tr>
            )}
            {status === "error" && (
              <tr>
                <td colSpan={4}>Unable to load media requests.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {approveTarget && (
        <div className="request-modal" role="dialog" aria-modal="true">
          <div className="request-modal-backdrop" onClick={closeApproveModal} />
          <div className="request-modal-card">
            <div className="request-modal-header">
              <div className="request-modal-title">Choose Root Folder</div>
            </div>
            <div className="request-modal-body">
              <div className="muted">
                Select where to save{" "}
                <strong>{approveTarget.title || approveTarget.media_title || "this request"}</strong>.
              </div>
              {serverStatus === "loading" && (
                <div className="muted">Loading download options...</div>
              )}
              {serverError && <div className="note">{serverError}</div>}
              {rootStatus === "loading" && <div className="muted">Loading root folders...</div>}
              {rootError && <div className="note">{rootError}</div>}
              {rootOptions.length > 0 ? (
                <label>
                  Root Folder
                  <select
                    className="request-root-select"
                    value={selectedRootKey}
                    onChange={(event) => setSelectedRootKey(event.target.value)}
                  >
                    {rootOptions.map((option) => (
                      <option key={option.path} value={option.path}>
                        {option.path}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  Root Folder
                  <input
                    type="text"
                    className="request-root-input"
                    value={manualRoot}
                    onChange={(event) => setManualRoot(event.target.value)}
                    placeholder="/media/movies"
                  />
                </label>
              )}
              {profileOptions.length > 0 ? (
                <label>
                  Quality Profile
                  <select
                    className="request-profile-select"
                    value={selectedProfileId}
                    onChange={(event) => setSelectedProfileId(event.target.value)}
                  >
                    {profileOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  Quality Profile Id
                  <input
                    type="number"
                    className="request-profile-input"
                    value={manualProfileId}
                    onChange={(event) => setManualProfileId(event.target.value)}
                    placeholder="1"
                  />
                </label>
              )}
              <div className="row">
                <button className="btn" type="button" onClick={confirmApprove} disabled={!canApprove}>
                  Approve Request
                </button>
                <button className="btn ghost" type="button" onClick={closeApproveModal}>
                  Cancel
                </button>
              </div>
              {!canApprove && (
                <div className="note">
                  Root folder and quality profile are required to approve.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="request-modal" role="dialog" aria-modal="true">
          <div className="request-modal-backdrop" onClick={closeDelete} />
          <div className="request-modal-card delete-dialog">
            <div className="request-modal-header">
              <div className="request-modal-title">Delete Request</div>
            </div>
            <div className="request-modal-body">
              <div className="muted">
                This will remove{" "}
                <strong>{deleteTarget.title || deleteTarget.media_title || "this request"}</strong>{" "}
                from the dashboard and also delete it from Seer and Radarr.
              </div>
              <div className="row">
                <button
                  className="btn danger"
                  type="button"
                  onClick={async () => {
                    await handleDelete(deleteTarget);
                    closeDelete();
                  }}
                >
                  Delete Now
                </button>
                <button className="btn ghost" type="button" onClick={closeDelete}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
