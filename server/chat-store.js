import fs from "fs";
import crypto from "crypto";

const EMPTY_STATE = { conversations: [] };

const safeId = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const normalizeText = (value) => String(value || "").trim();

const normalizeAttachment = (attachment) => {
  if (!attachment || typeof attachment !== "object") return null;
  const url = normalizeText(attachment?.url);
  if (!url) return null;
  return {
    id: normalizeText(attachment?.id) || safeId(),
    url,
    mime: normalizeText(attachment?.mime) || "image/jpeg",
    name: normalizeText(attachment?.name) || "image",
  };
};

const normalizeMessage = (message) => {
  const body = normalizeText(message?.body || message?.message);
  const attachment = normalizeAttachment(message?.attachment);
  if (!body && !attachment) return null;
  return {
    id: String(message?.id || safeId()),
    senderRole: String(message?.senderRole || "user").trim().toLowerCase() === "admin" ? "admin" : "user",
    senderName: normalizeText(message?.senderName) || "MovieFlix",
    body,
    attachment,
    via: normalizeText(message?.via) || "dashboard",
    createdAt: String(message?.createdAt || new Date().toISOString()),
  };
};

const normalizeConversation = (conversation) => {
  const messages = Array.isArray(conversation?.messages)
    ? conversation.messages.map(normalizeMessage).filter(Boolean)
    : [];
  const lastMessage = messages[messages.length - 1] || null;
  return {
    id: String(conversation?.id || safeId()),
    userId: normalizeText(conversation?.userId),
    username: normalizeEmail(conversation?.username),
    displayName: normalizeText(conversation?.displayName),
    email: normalizeEmail(conversation?.email),
    phone: normalizeText(conversation?.phone),
    createdAt: String(conversation?.createdAt || lastMessage?.createdAt || new Date().toISOString()),
    updatedAt: String(conversation?.updatedAt || lastMessage?.createdAt || new Date().toISOString()),
    unreadForAdmin: Number(conversation?.unreadForAdmin || 0),
    unreadForUser: Number(conversation?.unreadForUser || 0),
    messages,
  };
};

export const loadChatState = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) return { ...EMPTY_STATE };
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = raw ? JSON.parse(raw) : EMPTY_STATE;
    const conversations = Array.isArray(parsed?.conversations)
      ? parsed.conversations.map(normalizeConversation)
      : Array.isArray(parsed)
        ? parsed.map(normalizeConversation)
        : [];
    return { conversations };
  } catch {
    return { ...EMPTY_STATE };
  }
};

export const saveChatState = (filePath, state) => {
  fs.writeFileSync(filePath, JSON.stringify({ conversations: state.conversations || [] }, null, 2));
};

const matchesConversation = (conversation, { conversationId, userId, username }) => {
  const targetId = normalizeText(conversationId);
  const targetUserId = normalizeText(userId);
  const targetUsername = normalizeEmail(username);
  if (targetId && conversation.id === targetId) return true;
  if (targetUserId && conversation.userId && conversation.userId === targetUserId) return true;
  if (targetUsername && conversation.username && conversation.username === targetUsername) return true;
  return false;
};

export const findConversation = (state, identity) =>
  (state?.conversations || []).find((conversation) => matchesConversation(conversation, identity)) || null;

export const upsertConversation = (state, identity = {}) => {
  const existing = findConversation(state, identity);
  if (existing) {
    if (identity.userId) existing.userId = normalizeText(identity.userId);
    if (identity.username) existing.username = normalizeEmail(identity.username);
    if (identity.displayName) existing.displayName = normalizeText(identity.displayName);
    if (identity.email) existing.email = normalizeEmail(identity.email);
    if (identity.phone) existing.phone = normalizeText(identity.phone);
    return existing;
  }
  const conversation = normalizeConversation({
    id: safeId(),
    ...identity,
    messages: [],
    unreadForAdmin: 0,
    unreadForUser: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  state.conversations = [conversation, ...(state.conversations || [])];
  return conversation;
};

export const appendConversationMessage = (state, identity, messageInput) => {
  const conversation = upsertConversation(state, identity);
  const message = normalizeMessage(messageInput);
  if (!message) return conversation;
  conversation.messages.push(message);
  conversation.updatedAt = message.createdAt;
  if (message.senderRole === "user") {
    conversation.unreadForAdmin = Number(conversation.unreadForAdmin || 0) + 1;
  } else {
    conversation.unreadForUser = Number(conversation.unreadForUser || 0) + 1;
  }
  state.conversations = [...(state.conversations || [])]
    .filter((item) => item.id !== conversation.id)
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  state.conversations.unshift(conversation);
  return conversation;
};

export const markConversationRead = (state, identity, role) => {
  const conversation = findConversation(state, identity);
  if (!conversation) return null;
  if (String(role || "").toLowerCase() === "admin") {
    conversation.unreadForAdmin = 0;
  } else {
    conversation.unreadForUser = 0;
  }
  return conversation;
};

export const serializeConversation = (conversation) => ({
  id: conversation.id,
  userId: conversation.userId || "",
  username: conversation.username || "",
  displayName: conversation.displayName || "",
  email: conversation.email || "",
  phone: conversation.phone || "",
  createdAt: conversation.createdAt || "",
  updatedAt: conversation.updatedAt || "",
  unreadForAdmin: Number(conversation.unreadForAdmin || 0),
  unreadForUser: Number(conversation.unreadForUser || 0),
  messages: Array.isArray(conversation.messages) ? conversation.messages : [],
});

export const serializeConversationList = (state) =>
  (state?.conversations || [])
    .map(serializeConversation)
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
