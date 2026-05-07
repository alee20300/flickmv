import { Fragment, useState } from "react";

const defaultPlan = {
  name: "",
  durationDays: "",
  price: "",
  currency: "MVR",
  status: "Active",
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

export default function PlansPage({ plans, onAdd, onRemove, onUpdate }) {
  const [draft, setDraft] = useState(defaultPlan);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(defaultPlan);
  const [expandedPlanId, setExpandedPlanId] = useState(null);

  const handleChange = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!draft.name || !draft.durationDays || !draft.price || !draft.currency) return;

    onAdd({
      ...draft,
      createdAt: new Date().toISOString(),
    });

    setDraft(defaultPlan);
    setIsFormOpen(false);
  };

  const startEdit = (plan) => {
    setEditingId(plan.id);
    setEditDraft({
      name: plan.name || "",
      durationDays: String(plan.durationDays || plan.duration || ""),
      price: String(plan.price || ""),
      currency: plan.currency || "MVR",
      status: plan.status || "Active",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(defaultPlan);
  };

  return (
    <section className="card plans-page">
      <div className="card-header">
        <h2>Subscription Plans</h2>
        <div className="count">{plans.length} total</div>
      </div>

      <div className="row">
        <button className="btn" type="button" onClick={() => setIsFormOpen(true)}>
          Add Plan
        </button>
      </div>

      {isFormOpen && (
        <form className="stack form-card" onSubmit={handleSubmit}>
          <div className="grid-2">
            <label>
              Name
              <input
                type="text"
                value={draft.name}
                onChange={(event) => handleChange("name", event.target.value)}
                placeholder="Premium"
                required
              />
            </label>
            <label>
              Duration
              <input
                type="number"
                min="1"
                value={draft.durationDays}
                onChange={(event) => handleChange("durationDays", event.target.value)}
                placeholder="30"
                required
              />
            </label>
          </div>
          <div className="grid-2">
            <label>
              Price
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.price}
                onChange={(event) => handleChange("price", event.target.value)}
                placeholder="9.99"
                required
              />
            </label>
            <label>
              Currency
              <input
                type="text"
                value={draft.currency}
                onChange={(event) => handleChange("currency", event.target.value.toUpperCase())}
                placeholder="MVR"
                required
              />
            </label>
          </div>
          <label>
            Status
            <select
              className="select"
              value={draft.status}
              onChange={(event) => handleChange("status", event.target.value)}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </label>
          <div className="row">
            <button className="btn" type="submit">
              Save Plan
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setIsFormOpen(false);
                setDraft(defaultPlan);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="table-wrap">
        <table className="table">
          <colgroup>
            <col className="col-plan-name" />
            <col className="col-plan-status" />
            <col className="col-plan-price" />
          </colgroup>
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => {
              const isExpanded = expandedPlanId === plan.id;
              return (
                <Fragment key={plan.id}>
                  <tr>
                    <td className="col-plan-name">
                      <button
                        type="button"
                        className="plan-expand"
                        onClick={() =>
                          setExpandedPlanId((prev) => (prev === plan.id ? null : plan.id))
                        }
                        aria-expanded={isExpanded}
                        title="Toggle plan details"
                      >
                        <span className="plan-name-text">{plan.name}</span>
                        <span className="plan-caret" aria-hidden="true">
                          {isExpanded ? "v" : ">"}
                        </span>
                      </button>
                    </td>
                    <td className="col-plan-status">{plan.status}</td>
                    <td className="col-plan-price">
                      {formatAmount(plan.price, plan.currency)}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="plan-detail-row">
                      <td colSpan={3}>
                        <div className="plan-detail-grid">
                          <div className="detail-item">
                            <span className="detail-label">Duration</span>
                            <span className="detail-value">
                              {plan.durationDays || plan.duration || 0} days
                            </span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Currency</span>
                            <span className="detail-value">{plan.currency}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Created</span>
                            <span className="detail-value">{plan.createdAt?.slice(0, 10)}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Actions</span>
                            <span className="detail-value">
                              <div className="actions">
                                <button className="btn small" onClick={() => startEdit(plan)}>
                                  Edit
                                </button>
                                <button
                                  className="btn ghost small"
                                  onClick={() => onRemove(plan.id)}
                                >
                                  Remove
                                </button>
                              </div>
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {plans.length === 0 && (
              <tr>
                <td colSpan={3}>
                  <div className="empty-state">
                    <div className="empty-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 12a8 8 0 1 1-4-6.9" />
                        <path d="M20 4v6h-6" />
                      </svg>
                    </div>
                    <div className="empty-title">No plans yet</div>
                    <div className="empty-subtitle">Create a plan to get started.</div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingId && (
        <div className="stack form-card">
          <div className="grid-2">
            <label>
              Name
              <input
                type="text"
                value={editDraft.name}
                onChange={(event) => setEditDraft((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </label>
            <label>
              Duration
              <input
                type="number"
                min="1"
                value={editDraft.durationDays}
                onChange={(event) =>
                  setEditDraft((prev) => ({ ...prev, durationDays: event.target.value }))
                }
                required
              />
            </label>
          </div>
          <div className="grid-2">
            <label>
              Price
              <input
                type="number"
                min="0"
                step="0.01"
                value={editDraft.price}
                onChange={(event) => setEditDraft((prev) => ({ ...prev, price: event.target.value }))}
                required
              />
            </label>
            <label>
              Currency
              <input
                type="text"
                value={editDraft.currency}
                onChange={(event) =>
                  setEditDraft((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))
                }
                required
              />
            </label>
          </div>
          <label>
            Status
            <select
              className="select"
              value={editDraft.status}
              onChange={(event) => setEditDraft((prev) => ({ ...prev, status: event.target.value }))}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </label>
          <div className="row">
            <button
              className="btn"
              type="button"
              onClick={() => {
                if (typeof onUpdate !== "function") return;
                onUpdate(editingId, {
                  name: editDraft.name,
                  durationDays: Number(editDraft.durationDays),
                  price: Number(editDraft.price),
                  currency: editDraft.currency,
                  status: editDraft.status,
                });
                cancelEdit();
              }}
            >
              Save Changes
            </button>
            <button className="btn ghost" type="button" onClick={cancelEdit}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
