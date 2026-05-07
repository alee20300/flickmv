import { Fragment, useMemo, useState } from "react";

const TIME_ZONE = "Asia/Karachi";

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE }).format(date);
};

const getUserKey = (user) => user?.userId || user?.username || "";

const getDurationLabel = (daysValue) => {
  const days = Number(daysValue || 0);
  if (!days) return "-";
  if (days % 30 === 0) {
    const months = Math.max(1, Math.round(days / 30));
    return `${months} month${months === 1 ? "" : "s"}`;
  }
  return `${days} day${days === 1 ? "" : "s"}`;
};

const formatFromSub = (sub, amount) => {
  const rawCurrency = sub?.currency || "MVR";
  const currency = rawCurrency === "USD" ? "MVR" : rawCurrency;
  const value = Number(amount || 0);
  const formatted = Number.isFinite(value)
    ? value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";
  return `${currency} ${formatted}`;
};

const formatStatus = (status) => {
  if (!status) return "-";
  const value = String(status);
  if (value.toLowerCase() === "expired") return "Approved";
  return value.charAt(0).toUpperCase() + value.slice(1);
};

export default function PaymentHistoryPage({ subscriptions = [], currentUser }) {
  const [expandedId, setExpandedId] = useState(null);
  const [openSlip, setOpenSlip] = useState(null);
  const userKey = getUserKey(currentUser);

  const userSubscriptions = useMemo(() => {
    if (!userKey) return [];
    return subscriptions
      .filter((sub) => sub.userKey === userKey || sub.userId === userKey)
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  }, [subscriptions, userKey]);

  return (
    <section className="card payments-page">
      <div className="card-header">
        <h2>Payment History</h2>
        <div className="count">{userSubscriptions.length} total</div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <colgroup>
            <col className="col-payment-date" />
            <col className="col-payment-plan" />
            <col className="col-payment-status" />
            <col className="col-payment-amount" />
            <col className="col-payment-slip" />
          </colgroup>
          <thead>
            <tr>
              <th>Date</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Amount</th>
              <th>Slip</th>
            </tr>
          </thead>
          <tbody>
            {userSubscriptions.map((sub) => {
              const rowId =
                sub.id || `${sub.submittedAt || "no-date"}-${sub.planId || sub.planName || ""}`;
              const isExpanded = expandedId === rowId;
              const statusLabel = formatStatus(sub.status);
              const submittedLabel = formatDate(sub.submittedAt);
              const slipUrl = sub.slipData || sub.slipUrl || "";
              return (
                <Fragment key={rowId}>
                  <tr>
                    <td className="col-payment-date">{submittedLabel}</td>
                    <td className="col-payment-plan">
                      <button
                        type="button"
                        className="payment-expand"
                        onClick={() =>
                          setExpandedId((prev) => (prev === rowId ? null : rowId))
                        }
                        aria-expanded={isExpanded}
                        title="Toggle payment details"
                      >
                        <span className="payment-title">{sub.planName || "Plan"}</span>
                        <span className="payment-caret" aria-hidden="true">
                          {isExpanded ? "v" : ">"}
                        </span>
                      </button>
                    </td>
                    <td className="col-payment-status">{statusLabel}</td>
                    <td className="col-payment-amount">
                      {formatFromSub(
                        sub,
                        sub?.finalAmount !== undefined && sub?.finalAmount !== null
                          ? sub.finalAmount
                          : sub?.price
                      )}
                    </td>
                    <td className="col-payment-slip">
                      {slipUrl ? (
                        <button
                          type="button"
                          className="btn ghost tiny"
                          onClick={() => setOpenSlip({ url: slipUrl, name: sub.slipName })}
                        >
                          View
                        </button>
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="payment-detail-row">
                      <td colSpan={5}>
                        <div className="payment-detail-grid">
                          <div className="detail-item">
                            <span className="detail-label">Submitted</span>
                            <span className="detail-value">{formatDate(sub.submittedAt)}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Plan Price</span>
                            <span className="detail-value">{formatFromSub(sub, sub?.price)}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Amount Paid</span>
                            <span className="detail-value">
                              {formatFromSub(
                                sub,
                                sub?.finalAmount !== undefined && sub?.finalAmount !== null
                                  ? sub.finalAmount
                                  : sub?.price
                              )}
                            </span>
                          </div>
                          {(() => {
                            const price = Number(sub?.price || 0);
                            const actual =
                              sub?.finalAmount !== undefined && sub?.finalAmount !== null
                                ? Number(sub.finalAmount)
                                : price;
                            const discount =
                              typeof sub?.discountAmount === "number"
                                ? Number(sub.discountAmount)
                                : price - actual;
                            if (!Number.isFinite(discount) || discount <= 0 || price <= 0) {
                              return null;
                            }
                            const percent = Math.round((discount / price) * 100);
                            return (
                              <div className="detail-item">
                                <span className="detail-label">Discount</span>
                                <span className="detail-value">{percent}% off</span>
                              </div>
                            );
                          })()}
                          <div className="detail-item">
                            <span className="detail-label">Start</span>
                            <span className="detail-value">{formatDate(sub.startDate)}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">End</span>
                            <span className="detail-value">{formatDate(sub.endDate)}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Duration</span>
                            <span className="detail-value">
                              {getDurationLabel(sub.durationDays)}
                            </span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Slip</span>
                            <span className="detail-value">{sub.slipName || "-"}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {userSubscriptions.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">
                    <div className="empty-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 5h18v14H3z" />
                        <path d="M7 9h10M7 13h6" />
                      </svg>
                    </div>
                    <div className="empty-title">No payment history</div>
                    <div className="empty-subtitle">Your recent payments will show here.</div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {openSlip && (
        <div className="modal-backdrop" role="presentation" onClick={() => setOpenSlip(null)}>
          <div
            className="modal-card slip-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3>Payment Slip</h3>
                {openSlip.name && <div className="muted">{openSlip.name}</div>}
              </div>
            </div>
            <div className="slip-preview">
              {openSlip.url.startsWith("data:application/pdf") ? (
                <iframe title="Payment slip" src={openSlip.url} />
              ) : (
                <img src={openSlip.url} alt="Payment slip" />
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
