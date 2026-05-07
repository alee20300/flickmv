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

export default function AdminChatsPage({ currentUser }) {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef(null);
  const chatWindowRef = useRef(null);

  const loadConversations = async ({ silent = false } = {}) => {
    try {
      const data = await api.loadAdminConversations();
      const list = Array.isArray(data) ? data : [];
      setConversations(list);
      setSelectedId((prev) => prev || list[0]?.id || "");
      if (!silent) setMessage("");
    } catch (error) {
      if (!silent) setMessage(error?.message || "Failed to load chats.");
    }
  };

  useEffect(() => {
    loadConversations();
    const timer = setInterval(() => loadConversations({ silent: true }), 5000);
    return () => clearInterval(timer);
  }, []);

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selectedId) || conversations[0] || null,
    [conversations, selectedId]
  );

  useEffect(() => {
    if (!selectedConversation?.id) return;
    api.markChatRead(selectedConversation.id, "admin").catch(() => {});
  }, [selectedConversation?.id]);

  useEffect(() => {
    const el = chatWindowRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [selectedConversation?.id, selectedConversation?.messages?.length]);

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
    if (!selectedConversation?.id) return;
    const body = draft.trim();
    if ((!body && !photoDataUrl) || sending) return;
    setSending(true);
    setMessage("");
    try {
      await api.sendChatMessage({
        userId: selectedConversation.user_id,
        username: selectedConversation.username,
        displayName: selectedConversation.display_name || "",
        body,
        senderRole: "admin",
        attachmentDataUrl: photoDataUrl || undefined,
        conversationId: selectedConversation.id,
      });
      setDraft("");
      setPhotoDataUrl("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setConversations((prev) => {
        const next = prev.filter((item) => item.id !== data.conversation.id);
        return [data.conversation, ...next];
      });
      setSelectedId(data.conversation.id);
    } catch (error) {
      setMessage(error?.message || "Failed to send reply.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="card support-admin-page">
      <div className="section-heading compact">
        <div>
          <h2>User Chats</h2>
          <p className="section-copy">Reply from the dashboard.</p>
        </div>
      </div>

      <div className="support-admin-layout">
        <aside className="support-chat-sidebar">
          {conversations.length === 0 ? (
            <div className="support-chat-empty">No chat conversations yet.</div>
          ) : (
            conversations.map((item) => {
              const active = item.id === selectedConversation?.id;
              const preview = item.messages?.[item.messages.length - 1]?.body || "No messages yet";
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`support-chat-thread ${active ? "active" : ""}`}
                  onClick={() => setSelectedId(item.id)}
                >
                  <div className="support-chat-thread-title-row">
                    <strong>{item.displayName || item.username || item.id}</strong>
                    {item.unreadForAdmin > 0 && <span className="support-chat-unread">{item.unreadForAdmin}</span>}
                  </div>
                  <div className="support-chat-thread-subtitle">{item.username || item.phone || item.userId || "-"}</div>
                  <div className="support-chat-thread-preview">{preview}</div>
                  <div className="support-chat-thread-time">{formatTime(item.updatedAt)}</div>
                </button>
              );
            })
          )}
        </aside>

        <div className="support-chat-panel">
          {selectedConversation ? (
            <>
              <div className="support-chat-panel-header">
                <div>
                  <h3>{selectedConversation.displayName || selectedConversation.username || "User"}</h3>
                  <p>{selectedConversation.username || selectedConversation.phone || selectedConversation.userId || "-"}</p>
                </div>

              </div>

              <div className="support-chat-window admin" ref={chatWindowRef}>
                {(selectedConversation.messages || []).map((item) => (
                  <div
                    key={item.id}
                    className={`support-chat-bubble ${item.senderRole === "admin" ? "admin" : "user"}`}
                  >
                    <div className="support-chat-meta">
                      <strong>{item.senderRole === "admin" ? item.senderName || "Admin" : selectedConversation.displayName || selectedConversation.username || "User"}</strong>
                      <span>{formatTime(item.createdAt)}</span>
                    </div>
                    {item.body ? <div className="support-chat-text">{item.body}</div> : null}
                    {item.attachment?.url ? (
                      <div className="support-chat-attachment">
                        <img src={item.attachment.url} alt="Chat attachment" loading="lazy" />
                      </div>
                    ) : null}
                    {item.via === "telegram" && <div className="support-chat-via">Sent from Telegram</div>}
                  </div>
                ))}
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
                  placeholder="Reply to user"
                  rows={3}
                />
                <div className="support-chat-actions">
                  <label className="btn ghost tiny support-chat-attach">
                    Attach Photo
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoSelect} hidden />
                  </label>
                  {message && <div className="note">{message}</div>}
                  <button className="btn primary" type="submit" disabled={sending || (!draft.trim() && !photoDataUrl)}>
                    {sending ? "Sending..." : "Send Reply"}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="support-chat-empty">Select a conversation.</div>
          )}
        </div>
      </div>
    </section>
  );
}
