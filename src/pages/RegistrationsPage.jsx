import { useEffect, useMemo, useState } from "react";

export default function RegistrationsPage({
  registrations = [],
  onRefresh,
  onApprove,
  onReject,
  onDelete,
}) {
  const [deleteTarget, setDeleteTarget] = useState(null);
  const normalized = useMemo(
    () =>
      [...registrations].sort((a, b) => {
        const left = new Date(
          b.submittedAt || b.verifiedAt || b.requestedAt || b.approvedAt || 0
        ).getTime();
        const right = new Date(
          a.submittedAt || a.verifiedAt || a.requestedAt || a.approvedAt || 0
        ).getTime();
        return left - right;
      }),
    [registrations]
  );

  const pendingRegistrations = normalized.filter(
    (reg) => String(reg.status || "").toLowerCase() === "pending"
  );
  const successfulRegistrations = normalized.filter(
    (reg) => String(reg.status || "").toLowerCase() === "approved"
  );
  const failedRegistrations = normalized.filter((reg) => {
    const status = String(reg.status || "").toLowerCase();
    return status && status !== "pending" && status !== "approved";
  });

  const tabCounts = {
    pending: pendingRegistrations.length,
    successful: successfulRegistrations.length,
    failed: failedRegistrations.length,
  };

  const getDefaultTab = () => {
    if (tabCounts.pending > 0) return "pending";
    if (tabCounts.successful > 0) return "successful";
    return "failed";
  };

  const [activeTab, setActiveTab] = useState(getDefaultTab);

  useEffect(() => {
    if (tabCounts[activeTab] > 0) return;
    setActiveTab(getDefaultTab());
  }, [activeTab, tabCounts.failed, tabCounts.pending, tabCounts.successful]);

  const activeRegistrations =
    activeTab === "pending"
      ? pendingRegistrations
      : activeTab === "successful"
        ? successfulRegistrations
        : failedRegistrations;

  const getStatusTone = (status) => {
    if (status === "approved") return "success";
    if (status === "pending") return "warning";
    return "bad";
  };

  const renderRegistrationCard = (reg) => {
    const status = String(reg.status || "").toLowerCase();
    return (
      <div key={reg.id} className="status-card">
        <div>
          <div className="section-title">{reg.name || "New User"}</div>
          <div className="muted">{reg.email}</div>
          {reg.phone && <div className="muted">{reg.phone}</div>}
          <div className="muted">
            {reg.submittedAt || reg.verifiedAt || reg.requestedAt || reg.approvedAt || ""}
          </div>
        </div>
        <div className="registrations-card-actions">
          <span className={`status-pill registration-pill ${getStatusTone(status)}`}>{status || "pending"}</span>
          {status === "pending" && (
            <>
              <button className="btn small" type="button" onClick={() => onApprove?.(reg.id)}>
                Approve
              </button>
              <button className="btn ghost small" type="button" onClick={() => onReject?.(reg.id)}>
                Reject
              </button>
            </>
          )}
          <button
            className="btn ghost small"
            type="button"
            onClick={() => setDeleteTarget(reg)}
          >
            Delete
          </button>
        </div>
      </div>
    );
  };

  return (
    <section className="card settings-page registrations-page">
      <div className="card-header">
        <h2>Registrations</h2>
        <button className="btn ghost small" type="button" onClick={onRefresh}>
          Refresh
        </button>
      </div>
      <div className="stack">
        {registrations.length === 0 && <div className="muted">No registrations yet.</div>}
        {registrations.length > 0 && (
          <>
            <div className="tab-row">
              <button
                className={`tab-button ${activeTab === "pending" ? "active" : ""}`}
                type="button"
                onClick={() => setActiveTab("pending")}
              >
                Pending ({tabCounts.pending})
              </button>
              <button
                className={`tab-button ${activeTab === "successful" ? "active" : ""}`}
                type="button"
                onClick={() => setActiveTab("successful")}
              >
                Successful ({tabCounts.successful})
              </button>
              <button
                className={`tab-button ${activeTab === "failed" ? "active" : ""}`}
                type="button"
                onClick={() => setActiveTab("failed")}
              >
                Failed ({tabCounts.failed})
              </button>
            </div>
            {activeRegistrations.length === 0 ? (
              <div className="muted">No records in this tab.</div>
            ) : (
              activeRegistrations.map(renderRegistrationCard)
            )}
          </>
        )}
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
              <h3>Delete Registration</h3>
            </div>
            <div className="modal-body">
              Remove <strong>{deleteTarget.email || deleteTarget.name || "this registration"}</strong> and clear its saved email and phone from the server?
            </div>
            <div className="modal-actions">
              <button className="btn ghost small" type="button" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button
                className="btn small"
                type="button"
                onClick={() => {
                  onDelete?.(deleteTarget.id);
                  setDeleteTarget(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
