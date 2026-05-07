import { useMemo, useState } from "react";

const TIME_ZONE = "Asia/Karachi";

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE }).format(date);
};

const getUserKey = (user) => user?.userId || user?.username || "";

const isUnlimitedUser = (user, unlimitedList = []) => {
  const userId = user?.userId || user?.Id || user?.id || "";
  const username = String(user?.username || user?.Name || "").toLowerCase();
  return (unlimitedList || []).some(
    (item) =>
      item?.key === userId ||
      (item?.userId && item.userId === userId) ||
      (item?.username || "").toLowerCase() === username
  );
};

const getActiveSubscription = (subscriptions, userKey) => {
  if (!userKey) return null;
  const now = Date.now();
  return (
    subscriptions
      .filter((sub) => sub.userKey === userKey || sub.userId === userKey)
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
      .find((sub) => {
        if (sub.status !== "approved") return false;
        if (!sub.endDate) return true;
        return new Date(sub.endDate).getTime() >= now;
      }) || null
  );
};

const getUserContact = ({ currentUser, subscriptions = [], registrations = [], userContacts = {} }) => {
  const username = String(currentUser?.username || "").trim().toLowerCase();
  const userId = String(currentUser?.userId || "").trim();
  if (!username && !userId) return { email: "", phone: "" };

  const contactByKey =
    userContacts?.[userId?.toLowerCase?.() || ""] ||
    userContacts?.[username] ||
    null;
  if (contactByKey?.email || contactByKey?.phone) {
    return {
      email: String(contactByKey.email || "").trim().toLowerCase(),
      phone: String(contactByKey.phone || "").trim(),
    };
  }

  const byRecent = [...subscriptions].sort(
    (a, b) => new Date(b.updatedAt || b.submittedAt || 0) - new Date(a.updatedAt || a.submittedAt || 0)
  );
  const subMatch = byRecent.find((sub) => {
    const subUserId = String(sub?.userId || sub?.userKey || "").trim();
    const subName = String(sub?.username || sub?.email || "").trim().toLowerCase();
    return (userId && subUserId && subUserId === userId) || (username && subName === username);
  });
  if (subMatch?.phone || subMatch?.email) {
    return {
      email: String(subMatch.email || subMatch.username || "").trim().toLowerCase(),
      phone: String(subMatch.phone || "").trim(),
    };
  }

  const regByRecent = [...registrations].sort(
    (a, b) =>
      new Date(b.updatedAt || b.approvedAt || b.verifiedAt || b.requestedAt || 0) -
      new Date(a.updatedAt || a.approvedAt || a.verifiedAt || a.requestedAt || 0)
  );
  const regMatch = regByRecent.find(
    (item) => String(item?.email || "").trim().toLowerCase() === username
  );
  return {
    email: String(regMatch?.email || "").trim().toLowerCase(),
    phone: regMatch?.phone ? String(regMatch.phone) : "",
  };
};

export default function UserSettingsPage({
  currentUser,
  subscriptions = [],
  unlimitedUsers = [],
  registrations = [],
  userContacts = {},
}) {
  const userKey = getUserKey(currentUser);
  const unlimited = useMemo(
    () => isUnlimitedUser(currentUser, unlimitedUsers),
    [currentUser, unlimitedUsers]
  );
  const activeSub = useMemo(
    () => getActiveSubscription(subscriptions, userKey),
    [subscriptions, userKey]
  );
  const statusLabel = unlimited ? "Unlimited" : activeSub ? "Active" : "Not subscribed";
  const planLabel = unlimited ? "MovieFlixHD Premium" : activeSub?.planName || "-";
  const startLabel = unlimited ? "Unlimited" : formatDate(activeSub?.startDate);
  const endLabel = unlimited ? "Unlimited" : formatDate(activeSub?.endDate);
  const contact = useMemo(
    () => getUserContact({ currentUser, subscriptions, registrations, userContacts }),
    [currentUser, subscriptions, registrations, userContacts]
  );
  const phoneLabel = contact.phone || "-";
  const emailLabel = contact.email || currentUser?.username || "-";
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  const isStrongPassword = (value) => {
    if (!value || value.length < 6) return false;
    return /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);
  };

  const handlePasswordChange = async (event) => {
    event.preventDefault();
    setPasswordMessage("");
    if (!currentUser?.token || !currentUser?.userId) {
      setPasswordMessage("Please log in again.");
      return;
    }
    if (!currentPassword) {
      setPasswordMessage("Enter your current password.");
      return;
    }
    if (!newPassword || !isStrongPassword(newPassword)) {
      setPasswordMessage(
        "Password must be 6+ chars with upper, lower, and number."
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage("Passwords do not match.");
      return;
    }
    setPasswordSaving(true);
    try {
      const resp = await fetch("/api/emby-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.userId,
          token: currentUser.token,
          currentPassword,
          newPassword,
        }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        setPasswordMessage(text || "Failed to update password.");
        return;
      }
      setPasswordMessage("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordMessage(err?.message || "Failed to update password.");
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <section className="card settings-page user-settings-page">
      <div className="card-header">
        <h2>Settings</h2>
        <div className="pill">user</div>
      </div>
      <div className="user-detail-grid">
        <div className="detail-item">
          <span className="detail-label">Username</span>
          <span className="detail-value">{currentUser?.username || "-"}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Role</span>
          <span className="detail-value">User</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Email</span>
          <span className="detail-value">{emailLabel}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Phone</span>
          <span className="detail-value">{phoneLabel}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Subscription</span>
          <span className="detail-value">{statusLabel}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Plan</span>
          <span className="detail-value">{planLabel}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Start</span>
          <span className="detail-value">{startLabel}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">End</span>
          <span className="detail-value">{endLabel}</span>
        </div>
      </div>
      <div className="settings-group">
        <div className="section-title">Change Password</div>
        <div className="note">
          This password is the same one used to log in to Emby apps.
        </div>
        <form className="stack" onSubmit={handlePasswordChange}>
          <label>
            Current Password
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </label>
          <label>
            New Password
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </label>
          <label>
            Confirm Password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </label>
          <button className="btn primary" type="submit" disabled={passwordSaving}>
            {passwordSaving ? "Saving..." : "Update Password"}
          </button>
          {passwordMessage && <div className="note">{passwordMessage}</div>}
        </form>
      </div>
    </section>
  );
}
