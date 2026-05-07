import { Fragment, useMemo, useState } from "react";

const TIME_ZONE = "Asia/Karachi";

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE }).format(date);
};

const formatAmount = (sub) => {
  const amount = Number(
    sub?.finalAmount !== undefined && sub?.finalAmount !== null ? sub.finalAmount : sub?.price || 0
  );
  const rawCurrency = sub?.currency || "MVR";
  const currency = rawCurrency === "USD" ? "MVR" : rawCurrency;
  const formatted = Number.isFinite(amount)
    ? amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";
  return `${currency} ${formatted}`;
};

const formatDiscount = (sub) => {
  const price = Number(sub?.price || 0);
  const actual = Number(
    sub?.finalAmount !== undefined && sub?.finalAmount !== null ? sub.finalAmount : sub?.price || 0
  );
  if (!Number.isFinite(price) || !Number.isFinite(actual)) return "-";
  const diff = price - actual;
  if (diff <= 0) return "-";
  const rawCurrency = sub?.currency || "MVR";
  const currency = rawCurrency === "USD" ? "MVR" : rawCurrency;
  const formatted = diff.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${formatted}`;
};

const parseAmount = (value) => {
  if (value === null || value === undefined) return NaN;
  const cleaned = String(value).replace(/[^0-9.]/g, "");
  return cleaned ? Number(cleaned) : NaN;
};

export default function PaymentsReceivedPage({
  subscriptions = [],
  plans = [],
  users = [],
  onDeletePayment,
  onUploadSlip,
  onUpdatePaymentAmount,
  onUpdatePaymentDate,
  onAddManualPayment,
}) {
  const [openSlip, setOpenSlip] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [amountDrafts, setAmountDrafts] = useState({});
  const [showManualModal, setShowManualModal] = useState(false);
  const [editingAmountId, setEditingAmountId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [editingDateId, setEditingDateId] = useState(null);
  const [dateDrafts, setDateDrafts] = useState({});
  const [manualForm, setManualForm] = useState({
    username: "",
    planId: "",
    amount: "",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    slipName: "",
    slipData: "",
  });
  const [manualMessage, setManualMessage] = useState("");

  const approved = useMemo(
    () =>
      subscriptions
        .filter((sub) => {
          const status = String(sub.status || "").toLowerCase();
          if (!(status === "approved" || status === "expired" || status === "rejected")) {
            return false;
          }
          return Number(sub.price || sub.finalAmount || 0) > 0;
        })
        .sort(
          (a, b) =>
            new Date(b.reviewedAt || b.approvedAt || b.updatedAt || b.submittedAt || 0) -
            new Date(a.reviewedAt || a.approvedAt || a.updatedAt || a.submittedAt || 0)
        ),
    [subscriptions]
  );

  const handleSlipUpload = (sub, event) => {
    const file = event.target.files?.[0];
    if (!file || !onUploadSlip) return;
    const reader = new FileReader();
    reader.onload = () => {
      onUploadSlip(sub.id, {
        slipName: file.name,
        slipData: reader.result || "",
      });
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const handleAmountChange = (subId, value) => {
    setAmountDrafts((prev) => ({ ...prev, [subId]: value }));
  };

  const commitAmount = (sub) => {
    if (!onUpdatePaymentAmount) return;
    const raw = amountDrafts[sub.id];
    const actualPaid = raw === "" || raw === undefined ? null : Number(raw);
    if (actualPaid === null || !Number.isFinite(actualPaid)) return;
    onUpdatePaymentAmount(sub.id, actualPaid);
    setEditingAmountId(null);
  };

  const commitPaymentDate = (sub) => {
    if (!onUpdatePaymentDate) return;
    const nextDate = dateDrafts[sub.id];
    if (!nextDate) return;
    const nextIso = new Date(`${nextDate}T00:00:00`).toISOString();
    onUpdatePaymentDate(sub.id, nextIso);
    setEditingDateId(null);
  };

  const handleManualSlip = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setManualForm((prev) => ({
        ...prev,
        slipName: file.name,
        slipData: reader.result || "",
      }));
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const handleManualSubmit = (event) => {
    event.preventDefault();
    if (!onAddManualPayment) return;
    setManualMessage("");
    const username = manualForm.username.trim();
    if (!username) {
      setManualMessage("Username is required.");
      return;
    }
    if (!manualForm.planId) {
      setManualMessage("Select a plan.");
      return;
    }
    const amount = parseAmount(manualForm.amount);
    if (!Number.isFinite(amount)) {
      setManualMessage("Enter a valid paid amount (numbers only).");
      return;
    }
    if (!manualForm.startDate || !manualForm.endDate) {
      setManualMessage("Start and end dates are required.");
      return;
    }

    const plan = plans.find((item) => item.id === manualForm.planId);
    if (!plan) {
      setManualMessage("Plan not found.");
      return;
    }

    const matchedUser = users.find(
      (user) =>
        String(user?.Name || user?.name || "").toLowerCase() === username.toLowerCase()
    );

    let saved = false;
    try {
      saved = onAddManualPayment({
        userKey: username.toLowerCase(),
        userId: matchedUser?.Id || matchedUser?.id || "",
        username,
        planId: plan.id,
        planName: plan.name,
        durationDays: Number(plan.durationDays || plan.duration || 0),
        price: plan.price,
        currency: plan.currency || "MVR",
        finalAmount: amount,
        startDate: new Date(manualForm.startDate).toISOString(),
        endDate: new Date(manualForm.endDate).toISOString(),
        slipName: manualForm.slipName,
        slipData: manualForm.slipData,
      });
    } catch (err) {
      setManualMessage(err?.message || "Save failed. Please try again.");
      return;
    }

    if (!saved) {
      setManualMessage("Save failed. Please try again.");
      return;
    }
    setManualForm({
      username: "",
      planId: "",
      amount: "",
      startDate: new Date().toISOString().slice(0, 10),
      endDate: "",
      slipName: "",
      slipData: "",
    });
    setManualMessage("Saved successfully.");
    setTimeout(() => setManualMessage(""), 2000);
    setShowManualModal(false);
  };

  return (
    <section className="card payments-received-page">
      <div className="card-header">
        <h2>Payments Received</h2>
        <div className="row">
          <div className="count">{approved.length} total</div>
          {onAddManualPayment && (
            <button
              className="btn ghost small"
              type="button"
              onClick={() => setShowManualModal(true)}
            >
              Add Payment
            </button>
          )}
        </div>
      </div>

      {onAddManualPayment && showManualModal && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setShowManualModal(false)}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3>Add Manual Payment</h3>
                <div className="muted">Record payment without requiring a slip.</div>
              </div>
            </div>
            <form className="modal-body stack" onSubmit={handleManualSubmit}>
              <div className="grid-2">
                <label>
                  Username
                  <input
                    type="text"
                    value={manualForm.username}
                    onChange={(event) =>
                      setManualForm((prev) => ({ ...prev, username: event.target.value }))
                    }
                    placeholder="User name"
                    list="manual-payment-users"
                  />
                </label>
                <datalist id="manual-payment-users">
                  {users.map((user) => {
                    const name = user?.Name || user?.name || "";
                    if (!name) return null;
                    return <option key={user.Id || user.id || name} value={name} />;
                  })}
                </datalist>
                <label>
                  Plan
                <select
                  className="select"
                  value={manualForm.planId}
                  onChange={(event) =>
                    setManualForm((prev) => {
                      const nextPlanId = event.target.value;
                      const plan = plans.find((item) => item.id === nextPlanId);
                      const days = Number(plan?.durationDays || plan?.duration || 0);
                      let nextEnd = prev.endDate;
                      let nextAmount = prev.amount;
                      if (prev.startDate && days) {
                        const start = new Date(prev.startDate);
                        if (!Number.isNaN(start.getTime())) {
                          const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
                          nextEnd = end.toISOString().slice(0, 10);
                        }
                      }
                      if (plan?.price !== undefined && plan?.price !== null) {
                        const parsed = parseAmount(plan.price);
                        if (Number.isFinite(parsed)) {
                          nextAmount = String(parsed);
                        }
                      }
                      return { ...prev, planId: nextPlanId, endDate: nextEnd, amount: nextAmount };
                    })
                  }
                >
                    <option value="">Select plan</option>
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} ({plan.durationDays || plan.duration || 0} days)
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Amount Paid
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={manualForm.amount}
                    onChange={(event) =>
                      setManualForm((prev) => ({ ...prev, amount: event.target.value }))
                    }
                    placeholder="0.00"
                  />
                </label>
                <label>
                  Start Date
                  <input
                    type="date"
                    value={manualForm.startDate}
                    onChange={(event) =>
                      setManualForm((prev) => {
                        const nextStart = event.target.value;
                        const plan = plans.find((item) => item.id === prev.planId);
                        const days = Number(plan?.durationDays || plan?.duration || 0);
                        let nextEnd = prev.endDate;
                        if (nextStart && days) {
                          const start = new Date(nextStart);
                          if (!Number.isNaN(start.getTime())) {
                            const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
                            nextEnd = end.toISOString().slice(0, 10);
                          }
                        }
                        return { ...prev, startDate: nextStart, endDate: nextEnd };
                      })
                    }
                  />
                </label>
                <label>
                  End Date
                  <input
                    type="date"
                    value={manualForm.endDate}
                    onChange={(event) =>
                      setManualForm((prev) => ({ ...prev, endDate: event.target.value }))
                    }
                  />
                </label>
              </div>
              <div className="row">
                <label className="btn ghost small">
                  {manualForm.slipName ? "Replace Slip" : "Upload Slip"}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="file-input"
                    onChange={handleManualSlip}
                    hidden
                  />
                </label>
                {manualForm.slipName && <span className="muted">{manualForm.slipName}</span>}
              </div>
              {manualMessage && (
                <div className={`note ${manualMessage.toLowerCase().includes("failed") ? "danger" : "success"}`}>
                  {manualMessage}
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setShowManualModal(false)}
                >
                  Cancel
                </button>
                <button className="btn" type="submit">
                  Save Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <div className="table-wrap payments-received-table">
        <table className="table">
          <colgroup>
            <col className="col-received-date" />
            <col className="col-received-user" />
            <col className="col-received-plan" />
            <col className="col-received-amount" />
            <col className="col-received-status" />
            <col className="col-received-slip" />
            <col className="col-received-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>Date</th>
              <th>User</th>
              <th>Plan</th>
              <th>Amount Paid</th>
              <th>Status</th>
              <th>Slip</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {approved.map((sub) => {
              const rowId =
                sub.id || `${sub.submittedAt || "no-date"}-${sub.planId || sub.planName || ""}`;
              const isExpanded = expandedId === rowId;
              const slipUrl = sub.slipData || sub.slipUrl || "";
              const dateValue = formatDate(sub.reviewedAt || sub.approvedAt || sub.submittedAt);
              const dateInput =
                dateDrafts[sub.id] ??
                (() => {
                  const raw = sub.reviewedAt || sub.approvedAt || sub.submittedAt;
                  if (!raw) return "";
                  const d = new Date(raw);
                  if (Number.isNaN(d.getTime())) return "";
                  return d.toISOString().slice(0, 10);
                })();
              const currentAmount =
                amountDrafts[sub.id] ??
                (sub.finalAmount !== undefined && sub.finalAmount !== null
                  ? String(sub.finalAmount)
                  : String(sub.price || ""));
              return (
                <Fragment key={rowId}>
                  <tr>
                    <td
                      className="col-received-date"
                      data-label="Date"
                      onClick={() => {
                        if (!onUpdatePaymentDate) return;
                        setEditingDateId(sub.id);
                        setDateDrafts((prev) => ({
                          ...prev,
                          [sub.id]: dateInput,
                        }));
                      }}
                      style={{ cursor: onUpdatePaymentDate ? "pointer" : "default" }}
                      title={onUpdatePaymentDate ? "Click to edit date" : undefined}
                    >
                      {editingDateId === sub.id && onUpdatePaymentDate ? (
                        <input
                          type="date"
                          value={dateInput}
                          onChange={(event) =>
                            setDateDrafts((prev) => ({
                              ...prev,
                              [sub.id]: event.target.value,
                            }))
                          }
                          onBlur={() => commitPaymentDate(sub)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              commitPaymentDate(sub);
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              setEditingDateId(null);
                            }
                          }}
                          onClick={(event) => event.stopPropagation()}
                        />
                      ) : (
                        dateValue
                      )}
                    </td>
                    <td className="col-received-user" data-label="User">
                      {sub.username || sub.userId || "-"}
                    </td>
                    <td className="col-received-plan" data-label="Plan">
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
                    <td className="col-received-amount" data-label="Amount">
                      {formatAmount(sub)}
                    </td>
                    <td className="col-received-status" data-label="Status">
                      {String(sub.status || "-").toUpperCase()}
                    </td>
                    <td className="col-received-slip" data-label="Slip">
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
                    <td className="col-received-actions" data-label="Actions">
                      <button
                        type="button"
                        className="btn ghost tiny"
                        onClick={() => setDeleteTarget(sub)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="payment-detail-row">
                      <td colSpan={7}>
                        <div className="payment-detail-grid">
                          <div className="detail-item">
                            <span className="detail-label">Plan Price</span>
                            <span className="detail-value">
                              {formatAmount({ ...sub, finalAmount: sub.price })}
                            </span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Payment Date</span>
                            <span className="detail-value">{dateValue}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Amount Paid</span>
                            <span className="detail-value">
                              {editingAmountId === sub.id && onUpdatePaymentAmount ? (
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className="table-input"
                                  value={currentAmount}
                                  onChange={(event) =>
                                    handleAmountChange(sub.id, event.target.value)
                                  }
                                  onBlur={() => commitAmount(sub)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      commitAmount(sub);
                                    }
                                    if (event.key === "Escape") {
                                      event.preventDefault();
                                      setEditingAmountId(null);
                                    }
                                  }}
                                />
                              ) : (
                                formatAmount(sub)
                              )}
                            </span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Discount</span>
                            <span className="detail-value">
                              {(() => {
                                const price = Number(sub?.price || 0);
                                const actual =
                                  amountDrafts[sub.id] ?? sub.finalAmount ?? sub.price ?? 0;
                                const paid = Number(actual || 0);
                                const diff = price - paid;
                                if (!Number.isFinite(diff) || diff <= 0 || price <= 0) {
                                  return "-";
                                }
                                return `${Math.round((diff / price) * 100)}% off`;
                              })()}
                            </span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Start</span>
                            <span className="detail-value">{formatDate(sub.startDate)}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">End</span>
                            <span className="detail-value">{formatDate(sub.endDate)}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Actions</span>
                            <span className="detail-value">
                              {onUploadSlip && (
                                <label className="btn ghost tiny">
                                  {slipUrl ? "Replace Slip" : "Upload Slip"}
                                  <input
                                    type="file"
                                    accept="image/*,application/pdf"
                                    className="file-input"
                                    onChange={(event) => handleSlipUpload(sub, event)}
                                    hidden
                                  />
                                </label>
                              )}
                              {onUpdatePaymentAmount && (
                                <button
                                  type="button"
                                  className="btn ghost tiny"
                                  onClick={() => {
                                    setEditingAmountId(sub.id);
                                    setAmountDrafts((prev) => ({
                                      ...prev,
                                      [sub.id]: currentAmount,
                                    }));
                                  }}
                                >
                                  Edit Amount
                                </button>
                              )}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {approved.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    <div className="empty-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 12h18" />
                        <path d="M12 3v18" />
                      </svg>
                    </div>
                    <div className="empty-title">No payments received yet</div>
                    <div className="empty-subtitle">Approved payments will appear here.</div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {deleteTarget && (
        <div className="modal-backdrop" role="presentation" onClick={() => setDeleteTarget(null)}>
          <div
            className="modal-card delete-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3>Delete payment?</h3>
                <div className="muted">
                  {deleteTarget.username || deleteTarget.userId || "Unknown"} •{" "}
                  {deleteTarget.planName || "-"}
                </div>
              </div>
            </div>
            <div className="modal-body">
              This will permanently remove the payment record from history.
            </div>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  if (onDeletePayment && deleteTarget?.id) {
                    onDeletePayment(deleteTarget.id);
                  }
                  setDeleteTarget(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

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
