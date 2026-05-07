import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "../lib/api.js";

const readImageFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read photo."));
    reader.readAsDataURL(file);
  });

const formatTime = (value) => {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-MV", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

export default function UserChatPage({ currentUser, registrations = [] }) {
  const [conversation, setConversation] = useState(null);
  const [draft, setDraft] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef(null);
  const listRef = useRef(null);

  const displayName = useMemo(() => {
    const userId = String(currentUser?.userId || "").trim();
    const username = String(currentUser?.username || "").trim().toLowerCase();
    const match = (registrations || []).find((item) => {
      const email = String(item?.email || "").trim().toLowerCase();
      const embyUserId = String(item?.embyUserId || "").trim();
      return (userId && embyUserId === userId) || (username && email === username);
    });
    return String(match?.name || currentUser?.username || "").trim();
  }, [currentUser, registrations]);
  const messages = conversation?.messages || [];

  function scrollToLatest() {
    const list = listRef.current;
    if (!list) return;
    requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
      requestAnimationFrame(() => {
        list.scrollTop = list.scrollHeight;
      });
    });
  }

  function forceScrollToLatest() {
    scrollToLatest();
    setTimeout(() => scrollToLatest(), 80);
    setTimeout(() => scrollToLatest(), 260);
  }

  const loadConversation = async ({ silent = false } = {}) => {
    if (!currentUser?.username && !currentUser?.userId) return;
    try {
      const data = await api.loadUserConversation(currentUser?.userId, currentUser?.username);
      setConversation(data || null);
      setTimeout(() => forceScrollToLatest(), 0);
      if (data?.id) {
        api.markChatRead(data.id, "user").catch(() => {});
      }
      if (!silent) setMessage("");
    } catch (error) {
      if (!silent) setMessage(error?.message || "Failed to load chat.");
    }
  };

  useEffect(() => {
    loadConversation();
    const timer = setInterval(() => loadConversation({ silent: true }), 5000);
    return () => clearInterval(timer);
  }, [currentUser?.username, currentUser?.userId]);

  useEffect(() => {
    forceScrollToLatest();
  }, [conversation?.id, conversation?.messages?.length]);

  const handlePhotoSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) {
      setMessage("Only image files are allowed.");
      event.target.value = "";
      return;
    }
    try {
      const dataUrl = await readImageFile(file);
      setPhotoDataUrl(dataUrl);
      setMessage("");
    } catch (error) {
      setMessage(error?.message || "Failed to attach photo.");
      event.target.value = "";
    }
  };

  const handleSend = async (event) => {
    event.preventDefault();
    const body = draft.trim();
    if ((!body && !photoDataUrl) || sending) return;
    setSending(true);
    setMessage("");
    try {
      await api.sendChatMessage({
        userId: currentUser?.userId,
        username: currentUser?.username,
        displayName,
        body,
        senderRole: "user",
        attachmentDataUrl: photoDataUrl || undefined,
      });
      setDraft("");
      setPhotoDataUrl("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      forceScrollToLatest();
      await loadConversation({ silent: true });
    } catch (error) {
      setMessage(error?.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="card support-chat-page">
      <div className="section-heading compact">
        <div>
          <h2>Support</h2>
          <p className="section-copy">Message admin here for account, payment, or app setup help.</p>
        </div>
      </div>

      <div className="support-chat-window" ref={listRef}>
        {messages.length === 0 ? (
          <div className="support-chat-empty">No messages yet. Start the conversation below.</div>
        ) : (
          messages.map((item) => (
            <div
              key={item.id}
              className={`support-chat-bubble ${item.senderRole === "admin" ? "admin" : "user"}`}
            >
              <div className="support-chat-meta">
                <strong>{item.senderRole === "admin" ? "Admin" : "You"}</strong>
                <span>{formatTime(item.createdAt)}</span>
              </div>
              {item.body ? <div className="support-chat-text">{item.body}</div> : null}
              {item.attachment?.url ? (
                <div className="support-chat-attachment">
                  <img src={item.attachment.url} alt="Chat attachment" loading="lazy" />
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      <form className="support-chat-compose" onSubmit={handleSend}>
        {photoDataUrl ? (
          <div className="support-chat-upload-preview">
            <img src={photoDataUrl} alt="Selected attachment" />
            <button
              className="btn ghost tiny"
              type="button"
              onClick={() => {
                setPhotoDataUrl("");
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            >
              Remove Photo
            </button>
          </div>
        ) : null}
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => {
            scrollToLatest();
            setTimeout(() => scrollToLatest(), 180);
          }}
          placeholder="Type your message to admin..."
          rows={3}
        />
        <div className="support-chat-actions">
          <label className="btn ghost tiny support-chat-attach">
            Attach Photo
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoSelect} hidden />
          </label>
          <div className="support-chat-hint">You can attach screenshots for faster support.</div>
          {message && <div className="note">{message}</div>}
          <button className="btn primary" type="submit" disabled={sending || (!draft.trim() && !photoDataUrl)}>
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}
