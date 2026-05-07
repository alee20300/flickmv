import { useState } from "react";

const isImageSlip = (value) => typeof value === "string" && value.startsWith("data:image");
const TIME_ZONE = "Asia/Karachi";

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE }).format(date);
};

const formatAmount = (price, currency) => {
  const amount = Number(price || 0);
  const safeCurrency = currency || "MVR";
  const normalizedCurrency = safeCurrency === "USD" ? "MVR" : safeCurrency;
  const formatted = Number.isFinite(amount)
    ? amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";
  return `${formatted} ${normalizedCurrency}`;
};

export default function ApprovalsPage({ pending, onApprove, onReject }) {
  const [previewSlip, setPreviewSlip] = useState(null);
  const [actualAmounts, setActualAmounts] = useState({});

  const getActualAmount = (sub) => {
    const stored = actualAmounts[sub.id];
    if (stored === "" || stored === undefined) return String(sub.price || "");
    return stored;
  };

  const handleAmountChange = (subId, value) => {
    setActualAmounts((prev) => ({ ...prev, [subId]: value }));
  };

  return (
    <section className="card">
      <div className="card-header">
        <h2>Pending Approvals</h2>
        <div className="count">{pending.length} pending</div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>User</th>
              <th>Plan</th>
              <th>Payment</th>
              <th>Actual Paid</th>
              <th>Discount</th>
              <th>Submitted</th>
              <th>Slip</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((sub) => (
              <tr key={sub.id}>
                <td>{sub.username}</td>
                <td>{sub.planName}</td>
                <td>
                  {formatAmount(sub.price, sub.currency)}
                  <div className="muted small">Paid</div>
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="table-input"
                    value={getActualAmount(sub)}
                    onChange={(event) => handleAmountChange(sub.id, event.target.value)}
                  />
                </td>
                <td>
                  {(() => {
                    const planPrice = Number(sub.price || 0);
                    const actual = Number(actualAmounts[sub.id] ?? sub.price ?? 0);
                    if (!Number.isFinite(planPrice) || !Number.isFinite(actual)) return "-";
                    const diff = planPrice - actual;
                    if (diff <= 0) return "-";
                    return formatAmount(diff, sub.currency);
                  })()}
                </td>
                <td>{formatDate(sub.submittedAt)}</td>
                <td>
                  {sub.slipData ? (
                    <button
                      type="button"
                      className="slip-link"
                      title="Open slip"
                      onClick={() =>
                        setPreviewSlip({
                          data: sub.slipData,
                          name: sub.slipName || `${sub.username}-slip`,
                        })
                      }
                    >
                      {isImageSlip(sub.slipData) ? (
                        <img className="slip-thumb" src={sub.slipData} alt="Payment slip" />
                      ) : (
                        <span className="btn ghost small">View Slip</span>
                      )}
                    </button>
                  ) : (
                    "-"
                  )}
                </td>
                <td>Pending</td>
                <td>
                  <div className="actions">
                    <button
                      className="btn small"
                      onClick={() => {
                        const raw = actualAmounts[sub.id];
                        const actualPaid = raw === "" || raw === undefined ? null : Number(raw);
                        onApprove(sub.id, Number.isFinite(actualPaid) ? actualPaid : null);
                      }}
                    >
                      Approve
                    </button>
                    <button className="btn ghost small" onClick={() => onReject(sub.id)}>
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {pending.length === 0 && (
              <tr>
                <td colSpan="9">
                  <div className="empty-state">
                    <div className="empty-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 12l2 2 4-4" />
                        <circle cx="12" cy="12" r="9" />
                      </svg>
                    </div>
                    <div className="empty-title">No pending approvals</div>
                    <div className="empty-subtitle">Everything is up to date.</div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {previewSlip && (
        <div className="slip-preview">
          <div className="slip-preview-header">
            <div>
              <div className="slip-title">Payment Slip</div>
              <div className="muted">{previewSlip.name}</div>
            </div>
            <button className="btn ghost small" onClick={() => setPreviewSlip(null)}>
              Close
            </button>
          </div>
          <div className="slip-preview-body">
            {isImageSlip(previewSlip.data) ? (
              <img className="slip-large" src={previewSlip.data} alt="Payment slip" />
            ) : (
              <iframe
                className="slip-frame"
                title="Payment slip preview"
                src={previewSlip.data}
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
