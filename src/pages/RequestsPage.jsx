import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../lib/api.js";

const formatAvailabilityDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
};

const normalizeStatus = (request) => {
  const rawStatus = String(request?.status || request?.requestStatus || "").trim().toLowerCase();
  const releaseStatus = String(
    request?.releaseStatus || request?.release_status || request?.release_state || ""
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

const buildRequestKey = (mediaType, mediaId) =>
  `${String(mediaType || "").toLowerCase()}:${String(mediaId || "")}`;

const apiUrl = (path) => `${path.startsWith("/") ? path : `/${path}`}`;

export default function RequestsPage({ currentUser, jellyseerrToken = "" }) {
  const currentUserId = currentUser?.userId || "";
  const [expandedRequestId, setExpandedRequestId] = useState(null);
  const [activeTab, setActiveTab] = useState("search");
  const [myRequestsTab, setMyRequestsTab] = useState("pending");
  const [searchResults, setSearchResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState("idle");
  const [searchError, setSearchError] = useState("");
  const [requestStatusById, setRequestStatusById] = useState({});
  const [requestedLookup, setRequestedLookup] = useState({});
  const [requestedByMeLookup, setRequestedByMeLookup] = useState({});
  const [requestedStatusByKey, setRequestedStatusByKey] = useState({});
  const [requestedByMeStatusByKey, setRequestedByMeStatusByKey] = useState({});
  const [mediaRequests, setMediaRequests] = useState([]);
  const [requestsStatus, setRequestsStatus] = useState("idle");
  const [requestsError, setRequestsError] = useState("");
  const [detailItem, setDetailItem] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailStatus, setDetailStatus] = useState("idle");
  const [detailError, setDetailError] = useState("");
  const [deleteStatusById, setDeleteStatusById] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef(null);
  const requestsFetchInFlightRef = useRef(false);

  const buildUserHeaders = () => {
    const headers = {};
    if (jellyseerrToken) {
      headers["x-seer-auth"] = "user";
      headers.Authorization = `Bearer ${jellyseerrToken}`;
    }
    return headers;
  };

  const normalizedSearchResults = useMemo(() => {
    return (searchResults || [])
      .filter((item) => {
        const rawMediaType = String(item?.mediaType || item?.type || "").toLowerCase();
        return rawMediaType !== "person";
      })
      .map((item) => {
      const title =
        item?.title ||
        item?.name ||
        item?.originalTitle ||
        item?.originalName ||
        "Untitled";
      const rawDate = item?.releaseDate || item?.firstAirDate || "";
      const year = item?.year || (rawDate ? rawDate.slice(0, 4) : "");
      const rawMediaType = String(item?.mediaType || item?.type || "").toLowerCase();
      const mediaType = rawMediaType === "tv" || rawMediaType === "show" ? "tv" : "movie";
      const displayType = rawMediaType ? rawMediaType.toUpperCase() : "-";
      const language =
        item?.originalLanguage || item?.original_language || item?.language || "";
      const posterPath = item?.posterPath || item?.poster_path || "";
      const id = item?.id || item?.tmdbId || `${title}-${year}-${rawMediaType}`;
      const imdbId =
        item?.imdbId ||
        item?.externalIds?.imdbId ||
        item?.externalIds?.imdb_id ||
        item?.external_ids?.imdb_id ||
        "";
      const rawStatus = item?.mediaInfo?.status ?? item?.mediaInfo?.statusCode ?? "";
      let availability = "Not available";
      if (typeof rawStatus === "number") {
        if (rawStatus >= 5) availability = "Available";
        else if (rawStatus === 4) availability = "Available";
      } else if (typeof rawStatus === "string") {
        const statusText = rawStatus.toLowerCase();
        if (statusText.includes("available")) availability = "Available";
        else if (statusText.includes("partial")) availability = "Available";
      }
      const tmdbPoster = posterPath ? `https://image.tmdb.org/t/p/w342${posterPath}` : "";
      const posterSources = [
        tmdbPoster,
        posterPath ? apiUrl(`/api/seer/api/v1/image?path=${encodeURIComponent(posterPath)}`) : "",
        tmdbPoster ? apiUrl(`/api/seer/api/v1/image?url=${encodeURIComponent(tmdbPoster)}`) : "",
      ].filter(Boolean);
      return {
        id,
        title,
        year: year || "-",
        type: displayType,
        overview: item?.overview || "",
        posterSources,
        posterPath,
        posterUrl: tmdbPoster,
        language,
        availability,
        mediaId: item?.id || item?.tmdbId || null,
        mediaType,
        imdbId,
      };
    });
  }, [searchResults]);

  const normalizedRequests = useMemo(() => {
    return (mediaRequests || []).map((entry) => {
      const mediaType =
        entry?.media_type ||
        entry?.mediaType ||
        entry?.type ||
        entry?.media_kind ||
        "";
      const mediaId =
        entry?.tmdb_id ||
        entry?.tmdbId ||
        entry?.media_id ||
        entry?.mediaId ||
        entry?.id ||
        "";
      const requestedByUserId =
        entry?.requested_by ||
        entry?.requestedBy ||
        entry?.user_id ||
        entry?.userId ||
        entry?.jellyfin_user_id ||
        "";
      const requestedBy =
        entry?.requested_by_username ||
        entry?.requestedByUsername ||
        entry?.requested_by_name ||
        entry?.requestedByName ||
        entry?.username ||
        "-";
      const requestedAt =
        entry?.requested_at ||
        entry?.created_at ||
        entry?.createdAt ||
        entry?.requestedAt ||
        "";
      return {
        id: entry?.id || `${mediaType}:${mediaId}:${requestedAt}`,
        title: entry?.title || entry?.media_title || entry?.name || "Untitled",
        requestedBy,
        requestedByUserId,
        requestedByKey: String(requestedBy || "").toLowerCase(),
        requestedAt,
        status: entry?.status || entry?.request_status || "pending",
        downloadProgress:
          typeof entry?.download_progress === "number"
            ? entry.download_progress
            : typeof entry?.downloadProgress === "number"
            ? entry.downloadProgress
            : typeof entry?.progress === "number"
            ? entry.progress
            : null,
        releaseStatus: entry?.release_status || entry?.releaseStatus || entry?.release_state || "",
        availableAt: entry?.available_at || entry?.availableAt || "",
        notes: entry?.notes || entry?.comment || "-",
        mediaType,
        mediaId,
        posterUrl: entry?.poster_url || entry?.posterUrl || "",
        posterPath: entry?.poster_path || entry?.posterPath || "",
      };
    });
  }, [mediaRequests]);

  const myRequests = useMemo(() => {
    const username = String(currentUser?.username || "").toLowerCase();
    const userId = currentUserId ? String(currentUserId) : "";
    if (!username && !userId) return [];
    return normalizedRequests.filter((request) => {
      if (userId && request.requestedByUserId) {
        return String(request.requestedByUserId) === userId;
      }
      return request.requestedByKey === username;
    });
  }, [currentUser, currentUserId, normalizedRequests]);

  const myRequestsByTab = useMemo(() => {
    const pending = [];
    const approved = [];
    const completed = [];

    for (const request of myRequests) {
      const rawStatus = String(request?.status || request?.requestStatus || "").trim().toLowerCase();
      if (["available", "rejected", "declined"].includes(rawStatus)) {
        completed.push(request);
      } else if (["approved", "downloading"].includes(rawStatus)) {
        approved.push(request);
      } else {
        pending.push(request);
      }
    }

    return { pending, approved, completed };
  }, [myRequests]);

  const activeMyRequests =
    myRequestsTab === "completed"
      ? myRequestsByTab.completed
      : myRequestsTab === "approved"
      ? myRequestsByTab.approved
      : myRequestsByTab.pending;

  const fetchMediaRequests = useCallback(async ({ background = false } = {}) => {
    if (requestsFetchInFlightRef.current) return;
    requestsFetchInFlightRef.current = true;
    setRequestsStatus((prev) => (background && prev === "success" ? prev : "loading"));
    if (!background) setRequestsError("");
    try {
      const list = await api.fetchMediaRequests();
      const nextRequested = {};
      const nextMine = {};
      const nextRequestedStatus = {};
      const nextMyStatus = {};
      const usernameKey = String(currentUser?.username || "").toLowerCase();
      const userIdKey = String(currentUserId || "");
      (Array.isArray(list) ? list : []).forEach((entry) => {
        const mediaType =
          entry?.media_type || entry?.mediaType || entry?.type || entry?.media_kind || "";
        const mediaId =
          entry?.tmdb_id || entry?.tmdbId || entry?.media_id || entry?.mediaId || "";
        if (!mediaType || !mediaId) return;
        const key = buildRequestKey(mediaType, mediaId);
        const status = String(entry?.status || entry?.request_status || "pending").trim().toLowerCase();
        const ts =
          new Date(
            entry?.updated_at ||
              entry?.updatedAt ||
              entry?.created_at ||
              entry?.createdAt ||
              entry?.requested_at ||
              entry?.requestedAt ||
              0
          ).getTime() || 0;
        nextRequested[key] = true;
        const requestedByUserId =
          entry?.requested_by ||
          entry?.requestedBy ||
          entry?.user_id ||
          entry?.userId ||
          entry?.jellyfin_user_id ||
          "";
        const requestedByName =
          entry?.requested_by_username ||
          entry?.requestedByUsername ||
          entry?.requested_by_name ||
          entry?.requestedByName ||
          entry?.username ||
          "";
        const requestedByKey = String(requestedByName || "").toLowerCase();
        const isMine =
          (userIdKey && requestedByUserId === userIdKey) || requestedByKey === usernameKey;
        if (isMine) {
          nextMine[key] = true;
          if (!nextMyStatus[key] || ts >= nextMyStatus[key].ts) {
            nextMyStatus[key] = { status, ts };
          }
        } else if (!nextRequestedStatus[key] || ts >= nextRequestedStatus[key].ts) {
          nextRequestedStatus[key] = { status, ts };
        }
      });
      setRequestedLookup(nextRequested);
      setRequestedByMeLookup(nextMine);
      setRequestedStatusByKey(nextRequestedStatus);
      setRequestedByMeStatusByKey(nextMyStatus);
      setMediaRequests(Array.isArray(list) ? list : []);
      setRequestsStatus("success");
    } catch (error) {
      setMediaRequests([]);
      setRequestedLookup({});
      setRequestedByMeLookup({});
      setRequestedStatusByKey({});
      setRequestedByMeStatusByKey({});
      if (!background) {
        setRequestsStatus("error");
        setRequestsError(error?.message || "Unable to load requests.");
      }
    } finally {
      requestsFetchInFlightRef.current = false;
    }
  }, [currentUser, currentUserId]);

  const handleDeleteRequest = useCallback(
    async (request) => {
      const id = request?.id;
      if (!id) return;
      if (!window.confirm("Remove this request?")) return;
      setDeleteStatusById((prev) => ({ ...prev, [id]: "loading" }));
      try {
        await api.deleteMediaRequest(id);
        await fetchMediaRequests({ background: true });
        setDeleteStatusById((prev) => ({ ...prev, [id]: "done" }));
      } catch (err) {
        setDeleteStatusById((prev) => ({ ...prev, [id]: "error" }));
        console.error(err);
      }
    },
    [fetchMediaRequests]
  );

  const createMediaRequest = async (payload) => {
    return api.createMediaRequest(payload);
  };

  useEffect(() => {
    fetchMediaRequests();
  }, [fetchMediaRequests]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      fetchMediaRequests({ background: true }).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchMediaRequests]);

  useEffect(() => {
    if (activeTab !== "search") return;
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearchStatus("idle");
      setSearchError("");
      return;
    }

    setSearchStatus("loading");
    setSearchError("");
    const handle = setTimeout(async () => {
      try {
        const response = await fetch(
          apiUrl(`/api/seer/api/v1/search?query=${encodeURIComponent(query)}`),
          {
            headers: buildUserHeaders(),
            credentials: "include",
          }
        );
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Search failed.");
        }
        const data = await response.json();
        const results = Array.isArray(data?.results) ? data.results : [];
        setSearchResults(results);
        setSearchStatus("success");
      } catch (error) {
        setSearchResults([]);
        setSearchStatus("error");
        setSearchError(error?.message || "Search failed.");
      }
    }, 450);

    return () => clearTimeout(handle);
  }, [activeTab, searchQuery, jellyseerrToken]);

  useEffect(() => {
    if (!detailItem?.mediaId) {
      setDetailData(null);
      setDetailStatus("idle");
      setDetailError("");
      return;
    }
    let cancelled = false;

    const loadDetails = async () => {
      setDetailStatus("loading");
      setDetailError("");
      try {
        const endpoint =
          detailItem.mediaType === "tv"
            ? apiUrl(`/api/seer/api/v1/tv/${detailItem.mediaId}`)
            : apiUrl(`/api/seer/api/v1/movie/${detailItem.mediaId}`);
        const response = await fetch(endpoint, {
          headers: buildUserHeaders(),
          credentials: "include",
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Failed to load details.");
        }
        const data = await response.json();
        if (!cancelled) {
          setDetailData(data);
          setDetailStatus("success");
        }
      } catch (error) {
        if (!cancelled) {
          setDetailData(null);
          setDetailStatus("error");
          setDetailError(error?.message || "Failed to load details.");
        }
      }
    };

    loadDetails();
    return () => {
      cancelled = true;
    };
  }, [detailItem, jellyseerrToken]);

  useEffect(() => {
    setExpandedRequestId(null);
  }, [activeTab]);

  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
      searchInputRef.current.select();
    }
  }, []);

  const handleRequest = async (result) => {
    if (!result?.mediaId || requestStatusById[result.id] === "loading") return;
    setRequestStatusById((prev) => ({ ...prev, [result.id]: "loading" }));
    try {
      await createMediaRequest({
        title: result.title,
        media_type: result.mediaType,
        tmdb_id: result.mediaId,
        imdb_id: result.imdbId || null,
        poster_path: result.posterPath || "",
        poster_url: result.posterUrl || "",
        language: result.language || "",
        requested_by: currentUserId,
        requested_by_username: currentUser?.username || "",
        status: "pending",
        requested_at: new Date().toISOString(),
      });
      setRequestStatusById((prev) => ({ ...prev, [result.id]: "done" }));
      fetchMediaRequests();
    } catch (error) {
      setRequestStatusById((prev) => ({ ...prev, [result.id]: "error" }));
      setSearchError(error?.message || "Request failed.");
    }
  };

  const openDetails = (result) => {
    setDetailItem(result);
  };

  const closeDetails = () => {
    setDetailItem(null);
  };

  const canRequestDetail = detailItem
    ? (() => {
        const key = buildRequestKey(detailItem.mediaType, detailItem.mediaId);
        const myStatus = requestedByMeStatusByKey[key]?.status;
        const isRejected =
          myStatus === "rejected" || myStatus === "declined";
        const alreadyMine = requestedByMeLookup[key] && !isRejected;
        const alreadyOther = requestedLookup[key] && !requestedByMeLookup[key];
        return (
          !(["Available","Partial"].includes(detailItem.availability)) &&
          !alreadyMine &&
          !alreadyOther
        );
      })()
    : false;

  return (
    <section className="card requests-page">
      <div className="card-header">
        <h2>Movie Requests</h2>
        <div className="count">
          {activeTab === "mine" ? activeMyRequests.length : normalizedSearchResults.length} total
        </div>
      </div>

      <div className="tab-row">
        <input
          ref={searchInputRef}
          type="text"
          className="request-search"
          value={searchQuery}
          onChange={(event) => {
            const value = event.target.value;
            setSearchQuery(value);
            if (value.trim().length > 0 && activeTab !== "search") {
              setActiveTab("search");
            }
          }}
          placeholder="Search Movies & TV Shows"
        />
        <button
          className={`tab-button ${activeTab === "mine" ? "active" : ""}`}
          type="button"
          onClick={() => setActiveTab("mine")}
        >
          My Requests
        </button>
      </div>

      {activeTab === "search" && searchError && <div className="note">{searchError}</div>}


      {activeTab === "search" ? (
        <div className="request-list-container">
        <div className="request-grid">
          {searchStatus === "loading" && (
            <>
              {Array.from({ length: 8 }).map((_, index) => (
                <div className="request-mine-card skeleton-card" key={`search-skel-${index}`}>
                  <div className="skeleton-poster" />
                  <div className="skeleton-line" />
                  <div className="skeleton-line short" />
                </div>
              ))}
            </>
          )}
          {searchStatus === "success" && normalizedSearchResults.length === 0 && (
            <div className="request-empty">No results found.</div>
          )}
          {searchStatus === "error" && (
            <div className="request-empty">Search failed. Check Seer settings.</div>
          )}
          {normalizedSearchResults.map((result) => {
            const key = buildRequestKey(result.mediaType, result.mediaId);
            const myStatus = requestedByMeStatusByKey[key]?.status || "";
            const isRejected = myStatus === "rejected" || myStatus === "declined";
            const alreadyMine = requestedByMeLookup[key] && !isRejected;
            const alreadyOther = requestedLookup[key] && !requestedByMeLookup[key];
            const showRequested =
              requestStatusById[result.id] === "done" || alreadyMine;
            const showRejected = isRejected;
            const showAlreadyOther = !showRejected && !alreadyMine && alreadyOther;
            return (
              <article className="request-mine-card" key={result.id}>
                <button
                  type="button"
                  className="request-mine-header"
                  onClick={() => openDetails(result)}
                  aria-label={`View details for ${result.title}`}
                >
                <div className="request-mine-poster poster-frame">
                  <div className="poster-fallback">No poster</div>
                  {result.posterSources.length > 0 && (
                    <img
                      src={result.posterSources[0]}
                      data-index="0"
                      loading="lazy"
                      alt={`${result.title} poster`}
                      onLoad={(event) => {
                        const img = event.currentTarget;
                        img.classList.remove("is-hidden");
                        img.closest(".poster-frame")?.classList.add("has-poster");
                      }}
                      onError={(event) => {
                        const img = event.currentTarget;
                        const currentIndex = Number(img.dataset.index || "0");
                        const nextIndex = currentIndex + 1;
                        if (nextIndex < result.posterSources.length) {
                          img.dataset.index = String(nextIndex);
                          img.src = result.posterSources[nextIndex];
                        } else {
                          img.classList.add("is-hidden");
                          img.closest(".poster-frame")?.classList.remove("has-poster");
                        }
                      }}
                    />
                  )}
                  {(["Available", "Partial"].includes(result.availability)) && (
                    <span className="poster-available" title="Available">
                      ✓
                    </span>
                  )}
                </div>
                <div className="request-mine-info">
                  <div className="request-mine-title">{result.title}</div>
                  <div className="request-meta-stack">
                    <span className="request-chip request-chip-type">{result.type}</span>
                    {result.year && <span className="request-chip">{result.year}</span>}
                  </div>
                  {(["Available", "Partial"].includes(result.availability)) && (
                    <div className="request-available-text">Available</div>
                  )}
                </div>
              </button>
              <div className="request-mine-details">
                {(["Available", "Partial"].includes(result.availability)) ? null : showRequested ? (
                  <span className="request-status requested">Requested</span>
                ) : showRejected ? (
                  <>
                    <span className="request-status error">Rejected</span>
                    <button
                      className="btn tiny"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleRequest(result);
                      }}
                      disabled={requestStatusById[result.id] === "loading" || !result.mediaId}
                    >
                      {requestStatusById[result.id] === "loading"
                        ? "Requesting..."
                        : "Request again"}
                    </button>
                  </>
                ) : showAlreadyOther ? (
                  <span className="request-status requested">Already requested</span>
                ) : (
                  <button
                    className="btn tiny"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleRequest(result);
                    }}
                    disabled={requestStatusById[result.id] === "loading" || !result.mediaId}
                  >
                    {requestStatusById[result.id] === "loading" ? "Requesting..." : "Request"}
                  </button>
                )}
                {requestStatusById[result.id] === "error" && (
                  <span className="request-status error">Failed</span>
                )}
              </div>
            </article>
            );
          })}
        </div>
        </div>
      ) : (
        <>
          <div className="tab-row">
            <button
              className={`tab-button ${myRequestsTab === "pending" ? "active" : ""}`}
              type="button"
              onClick={() => setMyRequestsTab("pending")}
            >
              Pending Requests ({myRequestsByTab.pending.length})
            </button>
            <button
              className={`tab-button ${myRequestsTab === "approved" ? "active" : ""}`}
              type="button"
              onClick={() => setMyRequestsTab("approved")}
            >
              Approved Media ({myRequestsByTab.approved.length})
            </button>
            <button
              className={`tab-button ${myRequestsTab === "completed" ? "active" : ""}`}
              type="button"
              onClick={() => setMyRequestsTab("completed")}
            >
              Completed Requests ({myRequestsByTab.completed.length})
            </button>
          </div>
        <div className="request-list-container">
        <div className="request-grid">
          {requestsStatus === "loading" && activeMyRequests.length === 0 && (
            <>
              {Array.from({ length: 6 }).map((_, index) => (
                <div className="request-mine-card skeleton-card" key={`mine-skel-${index}`}>
                  <div className="skeleton-poster" />
                  <div className="skeleton-line" />
                  <div className="skeleton-line short" />
                </div>
              ))}
            </>
          )}
          {requestsStatus === "success" && activeMyRequests.length === 0 && (
            <div className="request-empty">No requests in this tab.</div>
          )}
          {activeMyRequests.map((request) => {
            const isExpanded = expandedRequestId === request.id;
            const statusInfo = normalizeStatus(request);
            const availableDateLabel =
              String(request.status || "").trim().toLowerCase() === "approved" && request.availableAt
                ? formatAvailabilityDate(request.availableAt)
                : "";
            const posterSrc = request.posterUrl
              ? request.posterUrl
              : request.posterPath
              ? `https://image.tmdb.org/t/p/w342${request.posterPath}`
              : "";
            return (
              <article
                className={`request-mine-card ${isExpanded ? "is-open" : ""}`}
                key={request.id}
              >
                <button
                  type="button"
                  className="request-mine-header"
                  onClick={() =>
                    setExpandedRequestId((prev) => (prev === request.id ? null : request.id))
                  }
                  aria-expanded={isExpanded}
                  title="Toggle request details"
                >
                  <div className="request-mine-poster poster-frame">
                    <div className="poster-fallback">No poster</div>
                    {posterSrc ? (
                      <img
                        src={posterSrc}
                        alt=""
                        loading="lazy"
                        onLoad={(event) => {
                          event.currentTarget
                            .closest(".poster-frame")
                            ?.classList.add("has-poster");
                        }}
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                          event.currentTarget
                            .closest(".poster-frame")
                            ?.classList.remove("has-poster");
                        }}
                      />
                    ) : null}
                  </div>
                  <div className="request-mine-info">
                    <div className="request-mine-title">{request.title || "Untitled"}</div>
                    <div className="request-meta-stack">
                      <span className="request-chip">
                        {request.mediaType === "tv" ? "TV" : "MOVIE"}
                      </span>
                      <button
                        type="button"
                        className={`btn tiny request-status ${statusInfo.tone}`}
                        tabIndex={-1}
                        aria-label={`Status ${statusInfo.label}`}
                      >
                        {statusInfo.label}
                      </button>
                      {availableDateLabel && (
                        <span className="request-chip request-chip-available-date">
                          Available {availableDateLabel}
                        </span>
                      )}
                      {statusInfo.note && (
                        <span className="request-status-note">{statusInfo.note}</span>
                      )}
                    </div>
                  </div>
                </button>
                {isExpanded && (
                  <div className="request-mine-details">
                    <div className="detail-item">
                      <span className="detail-label">Requested</span>
                      <span className="detail-value">{request.requestedAt?.slice(0, 10)}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Notes</span>
                      <span className="detail-value">{request.notes || "-"}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Status</span>
                      <span className="detail-value">
                        {statusInfo.label}
                        {statusInfo.note ? ` — ${statusInfo.note}` : ""}
                      </span>
                    </div>
                    {availableDateLabel && (
                      <div className="detail-item">
                        <span className="detail-label">Available</span>
                        <span className="detail-value">{availableDateLabel}</span>
                      </div>
                    )}
                    <div className="detail-item">
                      <span className="detail-label">Actions</span>
                      <div className="detail-value">
                        <button
                          className="btn tiny danger"
                          type="button"
                          onClick={() => handleDeleteRequest(request)}
                          disabled={deleteStatusById[request.id] === "loading"}
                        >
                          {deleteStatusById[request.id] === "loading" ? "Removing..." : "Remove"}
                        </button>
                        {deleteStatusById[request.id] === "error" && (
                          <span className="request-status error">Failed</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
          {requestsStatus === "loading" && myRequests.length === 0 && null}
          {requestsStatus === "error" && myRequests.length === 0 && (
            <div className="request-empty">
              {requestsError || "Unable to load requests from media_requests."}
            </div>
          )}
          {requestsStatus !== "loading" &&
            requestsStatus !== "error" &&
            myRequests.length === 0 && <div className="request-empty">No requests yet.</div>}
        </div>
        </div>
        </>
      )}
      {detailItem && (
        <div className="request-modal" role="dialog" aria-modal="true">
          <div className="request-modal-backdrop" onClick={closeDetails} />
          <div className="request-modal-card">
            <div className="request-modal-header">
              <div className="request-modal-title">
                {detailItem.title} {detailItem.year !== "-" ? `(${detailItem.year})` : ""}
              </div>
              <div className="request-modal-actions">
                {canRequestDetail && (
                  <button
                    className="btn tiny"
                    type="button"
                    onClick={() => handleRequest(detailItem)}
                    disabled={requestStatusById[detailItem.id] === "loading"}
                  >
                    {requestStatusById[detailItem.id] === "loading"
                      ? "Requesting..."
                      : "Request"}
                  </button>
                )}
              </div>
            </div>
            {detailStatus === "loading" && (
              <div className="request-modal-body">Loading details...</div>
            )}
            {detailStatus === "error" && (
              <div className="request-modal-body">
                {detailError || "Failed to load details."}
              </div>
            )}
            {(detailStatus === "success" || detailStatus === "idle") && (
              <div className="request-modal-body">
                <div className="request-modal-grid">
                  <div className="request-modal-poster">
                    <div className="poster-fallback">No poster</div>
                    {detailItem.posterSources?.[0] && (
                      <img
                        src={detailItem.posterSources[0]}
                        data-index="0"
                        alt={`${detailItem.title} poster`}
                        onError={(event) => {
                          const img = event.currentTarget;
                          const currentIndex = Number(img.dataset.index || "0");
                          const nextIndex = currentIndex + 1;
                          if (
                            detailItem.posterSources &&
                            nextIndex < detailItem.posterSources.length
                          ) {
                            img.dataset.index = String(nextIndex);
                            img.src = detailItem.posterSources[nextIndex];
                          } else {
                            img.classList.add("is-hidden");
                          }
                        }}
                      />
                    )}
                  </div>
                  <div className="request-modal-info">
                    <div className="request-modal-row">
                      <span className="detail-label">Type</span>
                      <span className="detail-value">{detailItem.type}</span>
                    </div>
                    {detailData?.genres?.length > 0 && (
                      <div className="request-modal-row">
                        <span className="detail-label">Genres</span>
                        <span className="detail-value">
                          {detailData.genres.map((g) => g.name).join(", ")}
                        </span>
                      </div>
                    )}
                    {(detailData?.releaseDate || detailData?.firstAirDate) && (
                      <div className="request-modal-row">
                        <span className="detail-label">Release</span>
                        <span className="detail-value">
                          {(detailData.releaseDate || detailData.firstAirDate || "").slice(0, 10)}
                        </span>
                      </div>
                    )}
                    {typeof detailData?.voteAverage === "number" && (
                      <div className="request-modal-row">
                        <span className="detail-label">Rating</span>
                        <span className="detail-value">{detailData.voteAverage.toFixed(1)}</span>
                      </div>
                    )}
                    <div className="request-modal-overview">
                      {detailData?.overview || detailItem.overview || "No overview available."}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
