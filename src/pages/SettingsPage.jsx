import { useState } from "react";

export default function SettingsPage({
  isAdmin,
  settings,
  savedSettings,
  onSettingsChange,
  onSave,
  onSaveNow,
  onDiscard,
  message,
  serverStatus,
  serverStatusError,
  onRefreshStatus,
  onStartTunnel,
  onStopTunnel,
  onStartTelegram,
  onStopTelegram,
}) {
  const [copyNotice, setCopyNotice] = useState("");
  const [activeSettingsTab, setActiveSettingsTab] = useState("system");
  const base = savedSettings || {};
  const normalizeValue = (value) => String(value || "").trim();
  const normalizeAccounts = (accounts = []) =>
    (accounts || []).map((account) => ({
      bankName: normalizeValue(account.bankName),
      accountName: normalizeValue(account.accountName),
      accountNumber: normalizeValue(account.accountNumber),
    }));

  const isEmbyDirty =
    normalizeValue(settings.embyUrl) !== normalizeValue(base.embyUrl) ||
    normalizeValue(settings.embyHomeUrl) !== normalizeValue(base.embyHomeUrl) ||
    normalizeValue(settings.apiKey) !== normalizeValue(base.apiKey);

  const isSeerDirty =
    normalizeValue(settings.seerUrl || settings.jellyseerrUrl) !== normalizeValue(base.seerUrl || base.jellyseerrUrl) ||
    normalizeValue(settings.seerApiKey || settings.jellyseerrApiKey) !== normalizeValue(base.seerApiKey || base.jellyseerrApiKey);

  const isServersDirty =
    normalizeValue(settings.sonarrUrl) !== normalizeValue(base.sonarrUrl) ||
    normalizeValue(settings.sonarrApiKey) !== normalizeValue(base.sonarrApiKey) ||
    normalizeValue(settings.radarrUrl) !== normalizeValue(base.radarrUrl) ||
    normalizeValue(settings.radarrApiKey) !== normalizeValue(base.radarrApiKey);

  const isAccountsDirty =
    JSON.stringify(normalizeAccounts(settings.accounts)) !==
      JSON.stringify(normalizeAccounts(base.accounts)) ||
    normalizeValue(settings.instructions) !== normalizeValue(base.instructions);

  const isAppearanceDirty =
    Boolean(settings.allowUserThemeToggle) !== Boolean(base.allowUserThemeToggle) ||
    Boolean(settings.disableAutoTrial) !== Boolean(base.disableAutoTrial);
  const isAdminsDirty =
    normalizeValue(settings.adminUsernames) !== normalizeValue(base.adminUsernames);
  const isEmailDirty =
    normalizeValue(settings.resendApiKey) !== normalizeValue(base.resendApiKey) ||
    normalizeValue(settings.resendFrom) !== normalizeValue(base.resendFrom);
  const isTelegramDirty =
    normalizeValue(settings.telegramBotToken) !== normalizeValue(base.telegramBotToken) ||
    normalizeValue(settings.telegramAdminIds) !== normalizeValue(base.telegramAdminIds) ||
    Boolean(settings.telegramSetupComplete) !== Boolean(base.telegramSetupComplete);
  const isRegistrationVerificationDirty =
    normalizeValue(settings.registrationVerificationMode) !==
      normalizeValue(base.registrationVerificationMode) ||
    normalizeValue(settings.msgowlApiKey) !== normalizeValue(base.msgowlApiKey) ||
    normalizeValue(settings.msgowlOtpApiKey) !==
      normalizeValue(base.msgowlOtpApiKey || base.msgowlApiKey) ||
    normalizeValue(settings.msgowlOtpBaseUrl) !== normalizeValue(base.msgowlOtpBaseUrl) ||
    normalizeValue(settings.msgowlSender) !== normalizeValue(base.msgowlSender);
  const isGuideDirty =
    JSON.stringify(settings.embyGuideSteps || []) !== JSON.stringify(base.embyGuideSteps || []) ||
    JSON.stringify(settings.embyGuideMedia || []) !== JSON.stringify(base.embyGuideMedia || []);

  const telegramToken = normalizeValue(settings.telegramBotToken);
  const telegramAdmins = normalizeValue(settings.telegramAdminIds);
  const wizardStep =
    !telegramToken ? 1 : !telegramAdmins ? 2 : !settings.telegramSetupComplete ? 3 : 4;

  const markTelegramComplete = () => {
    onSettingsChange("telegramSetupComplete", true);
    onSaveNow?.();
  };

  const safeUUID = () => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const handleCopy = async (value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopyNotice(value);
      window.setTimeout(() => setCopyNotice(""), 1500);
    } catch {
      // Ignore clipboard errors.
    }
  };

  const uploadGuideImage = async (slot, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const resp = await fetch(`/api/emby-guide-images/${slot}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-admin-user": "admin" },
          body: JSON.stringify({ dataUrl: reader.result }),
        });
        const payload = await resp.json().catch(() => ({}));
        if (resp.ok && payload?.url) {
          const cacheBusted = `${payload.url}?v=${Date.now()}`;
          const list = Array.isArray(settings.embyGuideMedia) ? [...settings.embyGuideMedia] : [];
          const idx = list.findIndex((item) => item.id === slot);
          if (idx >= 0) list[idx] = { ...list[idx], src: cacheBusted };
          else list.push({ id: slot, label: `Step ${slot}`, src: cacheBusted });
          onSettingsChange("embyGuideMedia", list);
        }
      } catch {
        // ignore upload errors
      }
    };
    reader.readAsDataURL(file);
  };

  const defaultGuideSteps = [
    "Open the Emby app",
    "Connect to server manually",
    "Enter host",
    "Sign in",
  ];

  const defaultGuideMedia = [
    { id: 1, label: "Step 1", src: "" },
    { id: 2, label: "Step 2", src: "" },
    { id: 3, label: "Step 3", src: "" },
  ];

  return (
    <section className="card settings-page">
      <div className="card-header">
        <h2>Settings</h2>
        <div className="pill">{isAdmin ? "admin" : "user"}</div>
      </div>

      <div className="tab-row">
        <button
          className={`tab-button ${activeSettingsTab === "system" ? "active" : ""}`}
          type="button"
          onClick={() => setActiveSettingsTab("system")}
        >
          System
        </button>
        <button
          className={`tab-button ${activeSettingsTab === "services" ? "active" : ""}`}
          type="button"
          onClick={() => setActiveSettingsTab("services")}
        >
          Services
        </button>
        <button
          className={`tab-button ${activeSettingsTab === "registration" ? "active" : ""}`}
          type="button"
          onClick={() => setActiveSettingsTab("registration")}
        >
          Registration
        </button>
        <button
          className={`tab-button ${activeSettingsTab === "payments" ? "active" : ""}`}
          type="button"
          onClick={() => setActiveSettingsTab("payments")}
        >
          Payments
        </button>
        <button
          className={`tab-button ${activeSettingsTab === "guide" ? "active" : ""}`}
          type="button"
          onClick={() => setActiveSettingsTab("guide")}
        >
          Guide
        </button>
        {isAdmin && (
          <button
            className={`tab-button ${activeSettingsTab === "wizard" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveSettingsTab("wizard")}
          >
            Wizard
          </button>
        )}
      </div>

      <form onSubmit={onSave} className="stack">
        {activeSettingsTab === "system" && (
          <div className="settings-grid">
            {isAdmin && (
              <div className="settings-group full">
                <div className="section-title">System Status</div>
                {serverStatusError && <div className="note">{serverStatusError}</div>}
                <div className="status-grid">
                  <div className="status-item">
                    <span className="status-label">Telegram Bot</span>
                    <span className={`status-pill ${serverStatus?.telegramBot?.running ? "ok" : "bad"}`}>
                      {serverStatus?.telegramBot?.running ? "Running" : "Stopped"}
                    </span>
                  </div>
                  <div className="status-item">
                    <span className="status-label">Cloudflare Tunnel</span>
                    <span className={`status-pill ${serverStatus?.tunnel?.running ? "ok" : "bad"}`}>
                      {serverStatus?.tunnel?.running ? "Running" : "Stopped"}
                    </span>
                  </div>
                  <div className="status-item">
                    <span className="status-label">Emby</span>
                    <span className={`status-pill ${serverStatus?.emby?.ok ? "ok" : "bad"}`}>
                      {serverStatus?.emby?.ok ? "OK" : "Error"}
                    </span>
                    {!serverStatus?.emby?.ok && serverStatus?.emby?.message && (
                      <span className="status-note">{serverStatus.emby.message}</span>
                    )}
                  </div>
                  <div className="status-item">
                    <span className="status-label">Seer</span>
                    <span className={`status-pill ${serverStatus?.seer?.ok ? "ok" : "bad"}`}>
                      {serverStatus?.seer?.ok ? "OK" : "Error"}
                    </span>
                    {!serverStatus?.seer?.ok && serverStatus?.seer?.message && (
                      <span className="status-note">{serverStatus.seer.message}</span>
                    )}
                  </div>
                  <div className="status-item">
                    <span className="status-label">Sonarr</span>
                    <span className={`status-pill ${serverStatus?.sonarr?.ok ? "ok" : "bad"}`}>
                      {serverStatus?.sonarr?.ok ? "OK" : "Error"}
                    </span>
                    {!serverStatus?.sonarr?.ok && serverStatus?.sonarr?.message && (
                      <span className="status-note">{serverStatus.sonarr.message}</span>
                    )}
                  </div>
                  <div className="status-item">
                    <span className="status-label">Radarr</span>
                    <span className={`status-pill ${serverStatus?.radarr?.ok ? "ok" : "bad"}`}>
                      {serverStatus?.radarr?.ok ? "OK" : "Error"}
                    </span>
                    {!serverStatus?.radarr?.ok && serverStatus?.radarr?.message && (
                      <span className="status-note">{serverStatus.radarr.message}</span>
                    )}
                  </div>
                </div>
                <div className="row">
                  <button className="btn ghost small" type="button" onClick={onRefreshStatus}>
                    Refresh Status
                  </button>
                  <button className="btn small" type="button" onClick={onStartTelegram} disabled={!onStartTelegram}>
                    Start Telegram Bot
                  </button>
                  <button className="btn ghost small" type="button" onClick={onStopTelegram} disabled={!onStopTelegram}>
                    Stop Telegram Bot
                  </button>
                  <button className="btn small" type="button" onClick={onStartTunnel} disabled={!onStartTunnel}>
                    Start Tunnel
                  </button>
                  <button className="btn ghost small" type="button" onClick={onStopTunnel} disabled={!onStopTunnel}>
                    Stop Tunnel
                  </button>
                </div>
              </div>
            )}

            {isAdmin && (
              <div className="settings-group full">
                <div className="section-title">Telegram Access</div>
                <label>
                  Bot Token
                  <input
                    type="password"
                    value={settings.telegramBotToken || ""}
                    onChange={(event) => onSettingsChange("telegramBotToken", event.target.value)}
                    placeholder="Paste Telegram bot token"
                    disabled={!isAdmin}
                  />
                </label>
                <label>
                  Admin Telegram IDs
                  <input
                    type="text"
                    value={settings.telegramAdminIds || ""}
                    onChange={(event) => onSettingsChange("telegramAdminIds", event.target.value)}
                    placeholder="123456789, 987654321"
                    disabled={!isAdmin}
                  />
                </label>
                <div className="note">Only these Telegram numeric IDs can receive notifications and use bot actions.</div>
                {isTelegramDirty && (
                  <div className="row">
                    <button className="btn small" type="submit" disabled={!isAdmin}>Save Telegram</button>
                    <button className="btn ghost small" type="button" onClick={() => onDiscard?.("telegram")} disabled={!isAdmin}>
                      Discard
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="settings-group">
              <div className="section-title">Appearance</div>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={Boolean(settings.allowUserThemeToggle)}
                  onChange={(event) => onSettingsChange("allowUserThemeToggle", event.target.checked)}
                  disabled={!isAdmin}
                />
                <span>Allow users to toggle light mode</span>
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={Boolean(settings.disableAutoTrial)}
                  onChange={(event) => onSettingsChange("disableAutoTrial", event.target.checked)}
                  disabled={!isAdmin}
                />
                <span>Disable auto trial creation</span>
              </label>
              {isAppearanceDirty && (
                <div className="row">
                  <button className="btn small" type="submit" disabled={!isAdmin}>Save Appearance</button>
                  <button className="btn ghost small" type="button" onClick={() => onDiscard?.("appearance")} disabled={!isAdmin}>
                    Discard
                  </button>
                </div>
              )}
            </div>

            {isAdmin && (
              <div className="settings-group">
                <div className="section-title">Admins</div>
                <label>
                  Admin Emby Usernames (comma separated)
                  <input
                    type="text"
                    value={settings.adminUsernames || ""}
                    onChange={(event) => onSettingsChange("adminUsernames", event.target.value)}
                    placeholder="hucksarn, anotheradmin"
                    disabled={!isAdmin}
                  />
                </label>
                <div className="note">These usernames will be treated as admins after Emby login.</div>
                {isAdminsDirty && (
                  <div className="row">
                    <button className="btn small" type="submit" disabled={!isAdmin}>Save Admins</button>
                    <button className="btn ghost small" type="button" onClick={() => onDiscard?.("admins")} disabled={!isAdmin}>
                      Discard
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeSettingsTab === "services" && (
          <div className="settings-grid">
            <div className="settings-group">
              <div className="section-title">Emby</div>
              <div className="grid-2">
                <label>
                  Emby URL
                  <div className="input-row">
                    <input
                      type="url"
                      value={settings.embyUrl || ""}
                      onChange={(event) => onSettingsChange("embyUrl", event.target.value)}
                      placeholder="https://emby.yourdomain.com"
                      required
                      disabled={!isAdmin}
                    />
                    <button
                      type="button"
                      className={`btn ghost tiny account-copy ${copyNotice === settings.embyUrl ? "copied" : ""}`}
                      disabled={!settings.embyUrl}
                      onClick={() => handleCopy(settings.embyUrl)}
                    >
                      {copyNotice === settings.embyUrl ? "(Copied)" : "(Click to copy)"}
                    </button>
                  </div>
                </label>
                <label>
                  Emby Home URL
                  <input
                    type="url"
                    value={settings.embyHomeUrl || ""}
                    onChange={(event) => onSettingsChange("embyHomeUrl", event.target.value)}
                    placeholder="https://movieflix.yourdomain.com"
                    disabled={!isAdmin}
                  />
                </label>
              </div>
              <label>
                Emby API Key
                <input
                  type="password"
                  value={settings.apiKey || ""}
                  onChange={(event) => onSettingsChange("apiKey", event.target.value)}
                  placeholder="Paste API key"
                  required
                  disabled={!isAdmin}
                />
              </label>
              {isEmbyDirty && (
                <div className="row">
                  <button className="btn small" type="submit" disabled={!isAdmin}>Save Emby</button>
                  <button className="btn ghost small" type="button" onClick={() => onDiscard?.("emby")} disabled={!isAdmin}>
                    Discard
                  </button>
                </div>
              )}
            </div>

            {isAdmin && (
              <div className="settings-group">
                <div className="section-title">Email (Resend)</div>
                <label>
                  Resend API Key
                  <input
                    type="password"
                    value={settings.resendApiKey || ""}
                    onChange={(event) => onSettingsChange("resendApiKey", event.target.value)}
                    placeholder="re_..."
                    disabled={!isAdmin}
                  />
                </label>
                <label>
                  Resend From
                  <input
                    type="text"
                    value={settings.resendFrom || ""}
                    onChange={(event) => onSettingsChange("resendFrom", event.target.value)}
                    placeholder="MovieFlix <noreply@subs.movieflixhd.cloud>"
                    disabled={!isAdmin}
                  />
                </label>
                <div className="note">Use a verified sender like noreply@subs.movieflixhd.cloud.</div>
                {isEmailDirty && (
                  <div className="row">
                    <button className="btn small" type="submit" disabled={!isAdmin}>Save Email</button>
                    <button className="btn ghost small" type="button" onClick={() => onDiscard?.("email")} disabled={!isAdmin}>
                      Discard
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="settings-group">
              <div className="section-title">Seer</div>
              <div className="grid-2">
                <label>
                  Seer URL
                  <input
                    type="url"
                    value={settings.seerUrl || settings.jellyseerrUrl || ""}
                    onChange={(event) => { onSettingsChange("seerUrl", event.target.value); onSettingsChange("jellyseerrUrl", event.target.value); }}
                    placeholder="https://requests.yourdomain.com"
                    disabled={!isAdmin}
                  />
                </label>
                <label>
                  Seer API Key
                  <input
                    type="password"
                    value={settings.seerApiKey || settings.jellyseerrApiKey || ""}
                    onChange={(event) => { onSettingsChange("seerApiKey", event.target.value); onSettingsChange("jellyseerrApiKey", event.target.value); }}
                    placeholder="Paste Seer API key"
                    disabled={!isAdmin}
                  />
                </label>
              </div>
              {isSeerDirty && (
                <div className="row">
                  <button className="btn small" type="submit" disabled={!isAdmin}>Save Seer</button>
                  <button className="btn ghost small" type="button" onClick={() => onDiscard?.("seer")} disabled={!isAdmin}>
                    Discard
                  </button>
                </div>
              )}
            </div>

            <div className="settings-group">
              <div className="section-title">Download Servers</div>
              <div className="grid-2">
                <label>
                  Sonarr URL
                  <input
                    type="url"
                    value={settings.sonarrUrl || ""}
                    onChange={(event) => onSettingsChange("sonarrUrl", event.target.value)}
                    placeholder="https://sonarr.yourdomain.com"
                    disabled={!isAdmin}
                  />
                </label>
                <label>
                  Sonarr API Key
                  <input
                    type="password"
                    value={settings.sonarrApiKey || ""}
                    onChange={(event) => onSettingsChange("sonarrApiKey", event.target.value)}
                    placeholder="Paste Sonarr API key"
                    disabled={!isAdmin}
                  />
                </label>
                <label>
                  Radarr URL
                  <input
                    type="url"
                    value={settings.radarrUrl || ""}
                    onChange={(event) => onSettingsChange("radarrUrl", event.target.value)}
                    placeholder="https://radarr.yourdomain.com"
                    disabled={!isAdmin}
                  />
                </label>
                <label>
                  Radarr API Key
                  <input
                    type="password"
                    value={settings.radarrApiKey || ""}
                    onChange={(event) => onSettingsChange("radarrApiKey", event.target.value)}
                    placeholder="Paste Radarr API key"
                    disabled={!isAdmin}
                  />
                </label>
              </div>
              {isServersDirty && (
                <div className="row">
                  <button className="btn small" type="submit" disabled={!isAdmin}>Save Servers</button>
                  <button className="btn ghost small" type="button" onClick={() => onDiscard?.("servers")} disabled={!isAdmin}>
                    Discard
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeSettingsTab === "registration" && (
          <div className="settings-grid">
            {isAdmin && (
              <div className="settings-group">
                <div className="section-title">Registration Verification</div>
                <label>
                  Verification Mode
                  <select
                    value={settings.registrationVerificationMode || "both"}
                    onChange={(event) => onSettingsChange("registrationVerificationMode", event.target.value)}
                    disabled={!isAdmin}
                  >
                    <option value="both">Email + SMS</option>
                    <option value="email">Email only</option>
                    <option value="sms">SMS only</option>
                  </select>
                </label>
                <label>
                  MsgOwl REST API Key
                  <input
                    type="password"
                    value={settings.msgowlApiKey || ""}
                    onChange={(event) => onSettingsChange("msgowlApiKey", event.target.value)}
                    placeholder="MsgOwl REST SMS access key"
                    disabled={!isAdmin}
                  />
                </label>
                <label>
                  MsgOwl OTP API Key
                  <input
                    type="password"
                    value={settings.msgowlOtpApiKey || settings.msgowlApiKey || ""}
                    onChange={(event) => onSettingsChange("msgowlOtpApiKey", event.target.value)}
                    placeholder="MsgOwl OTP access key"
                    disabled={!isAdmin}
                  />
                </label>
                <label>
                  MsgOwl OTP Base URL
                  <input
                    type="text"
                    value={settings.msgowlOtpBaseUrl || "https://otp.msgowl.com"}
                    onChange={(event) => onSettingsChange("msgowlOtpBaseUrl", event.target.value)}
                    placeholder="https://otp.msgowl.com"
                    disabled={!isAdmin}
                  />
                </label>
                <label>
                  MsgOwl Sender Name
                  <input
                    type="text"
                    value={settings.msgowlSender || "MovieFlix"}
                    onChange={(event) => onSettingsChange("msgowlSender", event.target.value)}
                    placeholder="MovieFlix"
                    disabled={!isAdmin}
                  />
                </label>
                <div className="note">Use the REST key for credential SMS and the OTP key for verification. Maldives (+960) only.</div>
                {isRegistrationVerificationDirty && (
                  <div className="row">
                    <button className="btn small" type="submit" disabled={!isAdmin}>Save Registration</button>
                    <button className="btn ghost small" type="button" onClick={() => onDiscard?.("registrationVerification")} disabled={!isAdmin}>
                      Discard
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeSettingsTab === "payments" && (
          <div className="settings-grid">
            <div className="settings-group full">
              <div className="section-title">Payment Accounts</div>
              {(settings.accounts || []).map((account, index) => (
                <div className="account-row" key={account.id || index}>
                  <label className="account-field">
                    Bank Name:
                    <input
                      type="text"
                      value={account.bankName || ""}
                      onChange={(event) => {
                        const next = [...(settings.accounts || [])];
                        next[index] = { ...next[index], bankName: event.target.value };
                        onSettingsChange("accounts", next);
                      }}
                      placeholder="Bank"
                      disabled={!isAdmin}
                    />
                  </label>
                  <label className="account-field">
                    Account Name:
                    <input
                      type="text"
                      value={account.accountName || ""}
                      onChange={(event) => {
                        const next = [...(settings.accounts || [])];
                        next[index] = { ...next[index], accountName: event.target.value };
                        onSettingsChange("accounts", next);
                      }}
                      placeholder="Account holder name"
                      disabled={!isAdmin}
                    />
                  </label>
                  <label className="account-field">
                    Account Number:
                    <input
                      type="text"
                      value={account.accountNumber || ""}
                      onChange={(event) => {
                        const next = [...(settings.accounts || [])];
                        next[index] = { ...next[index], accountNumber: event.target.value };
                        onSettingsChange("accounts", next);
                      }}
                      placeholder="Account number"
                      disabled={!isAdmin}
                    />
                  </label>
                  <button
                    className="btn ghost small"
                    type="button"
                    onClick={() => {
                      const next = (settings.accounts || []).filter((_, idx) => idx !== index);
                      onSettingsChange("accounts", next);
                    }}
                    disabled={!isAdmin}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <div className="row">
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    const next = [
                      ...(settings.accounts || []),
                      { id: safeUUID(), bankName: "", accountName: "", accountNumber: "" },
                    ];
                    onSettingsChange("accounts", next);
                  }}
                  disabled={!isAdmin}
                >
                  Add Account
                </button>
              </div>
              <label>
                Payment Notes
                <textarea
                  className="textarea"
                  value={settings.instructions || ""}
                  onChange={(event) => onSettingsChange("instructions", event.target.value)}
                  placeholder="Any transfer notes or reference details"
                  disabled={!isAdmin}
                />
              </label>
              {isAccountsDirty && (
                <div className="row">
                  <button className="btn small" type="submit" disabled={!isAdmin}>Save Accounts</button>
                  <button className="btn ghost small" type="button" onClick={() => onDiscard?.("accounts")} disabled={!isAdmin}>
                    Discard
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeSettingsTab === "guide" && isAdmin && (
          <div className="settings-grid">
            <div className="settings-group full">
              <div className="section-title">Emby Login Guide (iOS)</div>
              <div className="note">Manage the steps and images shown to users.</div>
              <div className="stack">
                {(settings.embyGuideSteps && settings.embyGuideSteps.length > 0
                  ? settings.embyGuideSteps
                  : defaultGuideSteps
                ).map((step, index) => (
                  <label key={`step-${index}`}>
                    Step {index + 1}
                    <textarea
                      className="textarea"
                      value={step}
                      onChange={(event) => {
                        const current =
                          settings.embyGuideSteps && settings.embyGuideSteps.length > 0
                            ? settings.embyGuideSteps
                            : defaultGuideSteps;
                        const next = [...current];
                        next[index] = event.target.value;
                        onSettingsChange("embyGuideSteps", next);
                      }}
                    />
                  </label>
                ))}
                <div className="row">
                  <button
                    className="btn ghost small"
                    type="button"
                    onClick={() => onSettingsChange("embyGuideSteps", [...(settings.embyGuideSteps || []), "New step"])}
                  >
                    Add Step
                  </button>
                  {(settings.embyGuideSteps || []).length > 0 && (
                    <button
                      className="btn ghost small"
                      type="button"
                      onClick={() => {
                        const next = [...(settings.embyGuideSteps || [])];
                        next.pop();
                        onSettingsChange("embyGuideSteps", next);
                      }}
                    >
                      Remove Last Step
                    </button>
                  )}
                </div>
              </div>
              <div className="grid-2">
                {(settings.embyGuideMedia && settings.embyGuideMedia.length > 0
                  ? settings.embyGuideMedia
                  : defaultGuideMedia
                ).map((media, idx) => (
                  <label key={`media-${media.id || idx}`}>
                    Image {idx + 1}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => uploadGuideImage(media.id || idx + 1, event.target.files?.[0])}
                    />
                  </label>
                ))}
              </div>
              <div className="row">
                <button
                  className="btn ghost small"
                  type="button"
                  onClick={() => {
                    const list = Array.isArray(settings.embyGuideMedia) ? [...settings.embyGuideMedia] : [];
                    const nextId = list.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
                    list.push({ id: nextId, label: `Step ${nextId}`, src: "" });
                    onSettingsChange("embyGuideMedia", list);
                  }}
                >
                  Add Image Slot
                </button>
                {isGuideDirty && (
                  <>
                    <button className="btn small" type="submit" disabled={!isAdmin}>Save Guide</button>
                    <button className="btn ghost small" type="button" onClick={() => onDiscard?.("guide")} disabled={!isAdmin}>
                      Discard
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {isAdmin && activeSettingsTab === "wizard" && (
          <div className="settings-group wizard-card">
            <div className="section-title">Setup Wizard</div>
            <div className="wizard-step">
              <div className="wizard-label">
                {wizardStep >= 4 ? "Step 3 of 3" : `Step ${wizardStep} of 3`}
              </div>
              {wizardStep === 1 && (
                <>
                  <div className="wizard-title">Create Telegram Bot</div>
                  <div className="wizard-body">
                    Open Telegram, chat <strong>@BotFather</strong>, send <code>/newbot</code>, then copy the bot token.
                  </div>
                  <label>
                    Bot Token
                    <input
                      type="password"
                      value={settings.telegramBotToken || ""}
                      onChange={(event) => onSettingsChange("telegramBotToken", event.target.value)}
                      placeholder="Paste Telegram bot token"
                      disabled={!isAdmin}
                    />
                  </label>
                </>
              )}
              {wizardStep === 2 && (
                <>
                  <div className="wizard-title">Add Admin Telegram IDs</div>
                  <div className="wizard-body">
                    Use <strong>@userinfobot</strong> to get your Telegram ID. Paste one or more IDs separated by commas.
                  </div>
                  <label>
                    Admin Telegram IDs
                    <input
                      type="text"
                      value={settings.telegramAdminIds || ""}
                      onChange={(event) => onSettingsChange("telegramAdminIds", event.target.value)}
                      placeholder="123456789, 987654321"
                      disabled={!isAdmin}
                    />
                  </label>
                </>
              )}
              {wizardStep === 3 && (
                <>
                  <div className="wizard-title">Finish Telegram Setup</div>
                  <div className="wizard-body">
                    Telegram bot is configured. Save settings and mark as complete to unlock the next step.
                  </div>
                  <div className="row">
                    <button className="btn small" type="submit" disabled={!isAdmin}>Save Telegram</button>
                    <button className="btn ghost small" type="button" onClick={markTelegramComplete} disabled={!isAdmin}>
                      Mark Complete
                    </button>
                  </div>
                </>
              )}
              {wizardStep === 4 && (
                <>
                  <div className="wizard-title">Telegram Complete</div>
                  <div className="wizard-body">
                    Telegram bot is configured. You can now receive approvals and notifications.
                  </div>
                  <div className="row">
                    <button className="btn small" type="submit" disabled={!isAdmin}>Save Telegram</button>
                    <button
                      className="btn ghost small"
                      type="button"
                      onClick={() => {
                        onSettingsChange("telegramSetupComplete", false);
                        onSettingsChange("telegramBotToken", "");
                        onSettingsChange("telegramAdminIds", "");
                        onSaveNow?.();
                      }}
                      disabled={!isAdmin}
                    >
                      Reset Wizard
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {message && <div className="note">{message}</div>}
      </form>
    </section>
  );
}
