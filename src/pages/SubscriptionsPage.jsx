import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const TIME_ZONE = "Asia/Karachi";

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE }).format(date);
};

const getUserKey = (user) => user?.userId || user?.username || "";
const getDurationInfo = (plan) => {
  const days = Number(plan?.durationDays || plan?.duration || 0);
  if (!days) return { short: "", long: "" };
  if (days % 30 === 0) {
    const months = Math.max(1, Math.round(days / 30));
    return {
      short: `${months}mo`,
      long: `${months} month${months === 1 ? "" : "s"}`,
    };
  }
  return {
    short: `${days}d`,
    long: `${days} day${days === 1 ? "" : "s"}`,
  };
};

const formatAmount = (price, currency) => {
  const amount = Number(price || 0);
  const safeCurrency = currency || "MVR";
  const normalizedCurrency = safeCurrency === "USD" ? "MVR" : safeCurrency;
  const formatted = Number.isFinite(amount)
    ? amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";
  return `${normalizedCurrency} ${formatted}`;
};

export default function SubscriptionsPage({
  plans,
  subscriptions,
  currentUser,
  accounts = [],
  onSubmitPayment,
}) {
  const [slipName, setSlipName] = useState("");
  const [slipData, setSlipData] = useState("");
  const [message, setMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [lastSubmittedAt, setLastSubmittedAt] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const copyTimeoutRef = useRef(null);
  const redirectTimerRef = useRef(null);
  const navigate = useNavigate();
  const { planId } = useParams();
  const isUploadView = Boolean(planId);

  const userKey = getUserKey(currentUser);

  const userSubscriptions = useMemo(() => {
    if (!userKey) return [];
    return subscriptions
      .filter((sub) => sub.userKey === userKey)
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  }, [subscriptions, userKey]);

  const activePlans = useMemo(
    () =>
      plans
        .filter((plan) => plan.status === "Active")
        .sort(
          (a, b) =>
            Number(a.durationDays || a.duration || 0) - Number(b.durationDays || b.duration || 0)
        ),
    [plans]
  );

  const latestSubmission = userSubscriptions[0] || null;
  const pending = latestSubmission?.status === "pending" ? latestSubmission : null;

  const selectedPlan = activePlans.find((plan) => plan.id === planId) || null;

  useEffect(() => {
    setMessage("");
    setSuccessMessage("");
    setSlipData("");
    setSlipName("");
  }, [planId]);

  useEffect(
    () => () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
    },
    []
  );

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setSlipData(reader.result || "");
      setSlipName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");

    if (!selectedPlan) {
      setMessage("Select a plan first.");
      return;
    }

    if (!slipData) {
      setMessage("Upload your payment slip.");
      return;
    }

    if (!userKey) {
      setMessage("Missing user identity. Please log in again.");
      return;
    }

    const submittedAt = new Date().toISOString();
    const ok = await onSubmitPayment({
      userKey,
      userId: currentUser?.userId || "",
      username: currentUser?.username || "",
      planId: selectedPlan.id,
      planName: selectedPlan.name,
      durationDays: Number(selectedPlan.durationDays || selectedPlan.duration || 0),
      price: selectedPlan.price,
      currency: selectedPlan.currency,
      submittedAt,
      slipName,
      slipData,
      status: "pending",
    });

    if (!ok) {
      setMessage("Payment could not be submitted. Please try again.");
      return;
    }

    setSlipData("");
    setSlipName("");
    setLastSubmittedAt(submittedAt);
    setMessage("");
    setSuccessMessage("Payment submitted.");
    if (redirectTimerRef.current) {
      clearTimeout(redirectTimerRef.current);
    }
    redirectTimerRef.current = setTimeout(() => {
      navigate("/payment-history");
    }, 2500);
  };

  const handleCopyAccount = async (value) => {
    if (!value) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopyNotice(String(value));
    } catch {
      setCopyNotice("");
    }
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }
    copyTimeoutRef.current = setTimeout(() => {
      setCopyNotice("");
    }, 1500);
  };

  return (
    <section className="card subscriptions-page">
      <div className="card-header">
        <div>
          <h2>{isUploadView ? "Upload Payment" : "Please select a Plan"}</h2>
          {isUploadView && selectedPlan && (
            <div className="muted">
              {selectedPlan.name} • {selectedPlan.durationDays || selectedPlan.duration || 0} days
            </div>
          )}
        </div>
        {isUploadView ? (
          <button className="btn ghost small" type="button" onClick={() => navigate("/subscriptions")}>
            Back to plans
          </button>
        ) : (
          <div className="count">{activePlans.length} available</div>
        )}
      </div>

      {!isUploadView && (
        <>
          <div className="plan-grid">
            {activePlans.map((plan) => {
              const duration = getDurationInfo(plan);
              return (
                <button
                  key={plan.id}
                  type="button"
                  className="plan-card"
                  onClick={() => navigate(`/subscriptions/${plan.id}`)}
                  disabled={Boolean(pending)}
                >
                  <span className="plan-header">
                    <span className="plan-name">{plan.name}</span>
                    <span className="plan-meta">Best for full access</span>
                  </span>
                  <span className="plan-price-row">
                    <span className="plan-price">
                      {formatAmount(plan.price, plan.currency)}
                    </span>
                    {duration.short && <span className="plan-period">/{duration.short}</span>}
                  </span>
                  <span className="plan-features">
                    <span className="plan-feature">
                      <span className="plan-check" aria-hidden="true">
                        &#10003;
                      </span>
                      Full Emby access
                    </span>
                    <span className="plan-feature">
                      <span className="plan-check" aria-hidden="true">
                        &#10003;
                      </span>
                      {duration.long || "Flexible"} subscription
                    </span>
                    <span className="plan-feature">
                      <span className="plan-check" aria-hidden="true">
                        &#10003;
                      </span>
                      24/7 support
                    </span>
                  </span>
                  <span className="plan-cta">Select plan</span>
                </button>
              );
            })}
          </div>



        </>
      )}

      {isUploadView && !selectedPlan && (
        <div className="note">That plan is no longer available. Please pick another plan.</div>
      )}

      {isUploadView && selectedPlan && (
        <>
          <div className="transfer-card">
            <h3>Kindly transfer and upload the payment slip</h3>
            <div className="note">
              Amount to transfer: {formatAmount(selectedPlan.price, selectedPlan.currency)}
            </div>
            <div className="transfer-lines">
              {accounts.length === 0 && <div className="muted">No accounts available.</div>}
              {accounts.map((account) => {
                const lineKey =
                  account.id || account.accountNumber || account.accountName || account.bankName;
                const copied = copyNotice === String(account.accountNumber || "");
                return (
                  <div className="transfer-line" key={lineKey}>
                    <div className="account-main">
                      <span className="muted">
                        {account.bankName || "-"} • {account.accountName || "-"}
                      </span>
                    </div>
                    <div className="account-number-row">
                      <span className="account-number">{account.accountNumber || "-"}</span>
                      {account.accountNumber && (
                        <button
                          className={`btn ghost tiny account-copy ${copied ? "copied" : ""}`}
                          type="button"
                          onClick={() => handleCopyAccount(account.accountNumber)}
                        >
                          {copied ? "(Copied)" : "(Click to copy)"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {successMessage && <div className="note success">{successMessage}</div>}
          {message && <div className="note">{message}</div>}
          <form className="stack" onSubmit={handleSubmit}>
            <label>
              Upload Payment Slip
              <input
                type="file"
                className="file-input"
                onChange={handleFileChange}
                disabled={Boolean(pending)}
              />
            </label>
            {slipName && <div className="note">Selected file: {slipName}</div>}
            <div className="row">
              <button className="btn" type="submit" disabled={Boolean(pending)}>
                Submit Payment
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
