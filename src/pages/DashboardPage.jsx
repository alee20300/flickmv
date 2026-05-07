import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const TIME_ZONE = "Asia/Karachi";

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE }).format(date);
};

const getLatestSubsByUser = (subscriptions) => {
  const latest = new Map();
  (subscriptions || []).forEach((sub) => {
    const key = sub.userId || sub.userKey || "";
    if (!key) return;
    const prev = latest.get(key);
    const prevTime = prev ? new Date(prev.endDate || prev.submittedAt || 0).getTime() : 0;
    const nextTime = new Date(sub.endDate || sub.submittedAt || 0).getTime();
    if (!prev || nextTime >= prevTime) {
      latest.set(key, sub);
    }
  });
  return latest;
};

const formatMoney = (amount, currency) => {
  const value = Number(amount || 0);
  const safeCurrency = currency || "MVR";
  const normalized = safeCurrency === "USD" ? "MVR" : safeCurrency;
  const formatted = Number.isFinite(value)
    ? value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";
  return `${normalized} ${formatted}`;
};

const sumByCurrency = (subs) => {
  const totals = {};
  (subs || []).forEach((sub) => {
    const rawCurrency = sub?.currency || "MVR";
    const currency = rawCurrency === "USD" ? "MVR" : rawCurrency;
    const amount =
      sub?.finalAmount !== undefined && sub?.finalAmount !== null ? sub.finalAmount : sub?.price;
    const value = Number(amount || 0);
    if (!Number.isFinite(value)) return;
    totals[currency] = (totals[currency] || 0) + value;
  });
  return totals;
};

const formatMonthLabel = (value) => {
  if (!value) return "";
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
};

export default function DashboardPage({ users = [], subscriptions = [] }) {
  const navigate = useNavigate();
  const pendingApprovals = useMemo(
    () => (subscriptions || []).filter((sub) => sub.status === "pending"),
    [subscriptions]
  );
  const expiredUsers = useMemo(() => {
    const latest = getLatestSubsByUser(subscriptions);
    const now = new Date();
    const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const results = [];
    latest.forEach((sub, key) => {
      const endTime = sub?.endDate ? new Date(sub.endDate).getTime() : null;
      const isExpired =
        (sub?.status === "approved" || sub?.status === "expired") &&
        typeof endTime === "number" &&
        endTime < nowUtc;
      if (!isExpired) return;
      const user = users.find((item) => (item.Id || item.id) === key);
      results.push({
        userId: key,
        username: user?.Name || user?.name || sub?.username || "Unknown",
        endDate: sub?.endDate,
        planName: sub?.planName || "-",
      });
    });
    return results;
  }, [subscriptions, users]);

  const paymentsReceived = useMemo(
    () =>
      (subscriptions || [])
        .filter((sub) => {
          const status = String(sub.status || "").toLowerCase();
          if (!["approved", "expired"].includes(status)) return false;
          return Number(sub.price || sub.finalAmount || 0) > 0;
        }),
    [subscriptions]
  );
  const paymentsTotals = useMemo(() => sumByCurrency(paymentsReceived), [paymentsReceived]);
  const recentTotals = useMemo(() => {
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recent = paymentsReceived.filter((sub) => {
      const ts = new Date(sub.approvedAt || sub.reviewedAt || sub.submittedAt || 0).getTime();
      return ts >= since;
    });
    return sumByCurrency(recent);
  }, [paymentsReceived]);
  const monthOptions = useMemo(() => {
    const set = new Set();
    paymentsReceived.forEach((sub) => {
      const ts = new Date(sub.approvedAt || sub.reviewedAt || sub.submittedAt || 0);
      if (Number.isNaN(ts.getTime())) return;
      const key = `${ts.getUTCFullYear()}-${String(ts.getUTCMonth() + 1).padStart(2, "0")}`;
      set.add(key);
    });
    return Array.from(set).sort().reverse();
  }, [paymentsReceived]);
  const [selectedMonth, setSelectedMonth] = useState(() => monthOptions[0] || "");
  useEffect(() => {
    if (!selectedMonth && monthOptions.length > 0) {
      setSelectedMonth(monthOptions[0]);
    }
  }, [monthOptions, selectedMonth]);
  const monthPayments = useMemo(() => {
    if (!selectedMonth) return [];
    return paymentsReceived.filter((sub) => {
      const ts = new Date(sub.approvedAt || sub.reviewedAt || sub.submittedAt || 0);
      if (Number.isNaN(ts.getTime())) return false;
      const key = `${ts.getUTCFullYear()}-${String(ts.getUTCMonth() + 1).padStart(2, "0")}`;
      return key === selectedMonth;
    });
  }, [paymentsReceived, selectedMonth]);
  const monthTotals = useMemo(() => sumByCurrency(monthPayments), [monthPayments]);

  const userCount = users.length;

  return (
    <section className="card dashboard-page">
      <div className="card-header">
        <h2>Dashboard</h2>
        <div className="count">{userCount} users</div>
      </div>

      <div className="dashboard-cards">
        <button
          type="button"
          className="mini-card"
          onClick={() => navigate("/approvals")}
        >
          <div className="mini-header">
            <div className="mini-title">Pending Approvals</div>
            <div className="mini-pill">{pendingApprovals.length}</div>
          </div>
          <div className="mini-body">Payments waiting for approval.</div>
        </button>
        <button
          type="button"
          className="mini-card"
          onClick={() => navigate("/payments-received")}
        >
          <div className="mini-header">
            <div className="mini-title">Payments Received</div>
            <div className="mini-pill">{paymentsReceived.length}</div>
          </div>
          <div className="mini-body">View total collected payments.</div>
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Payments Report</h3>
          <div className="count">{paymentsReceived.length} total</div>
        </div>
        <div className="status-grid">
          <div className="status-item">
            <div className="status-label">Total Received</div>
            <div className="status-value">
              {Object.keys(paymentsTotals).length === 0
                ? "-"
                : Object.entries(paymentsTotals)
                    .map(([currency, total]) => formatMoney(total, currency))
                    .join(" • ")}
            </div>
          </div>
          <div className="status-item">
            <div className="status-label">Last 30 Days</div>
            <div className="status-value">
              {Object.keys(recentTotals).length === 0
                ? "-"
                : Object.entries(recentTotals)
                    .map(([currency, total]) => formatMoney(total, currency))
                    .join(" • ")}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Monthly Payments</h3>
          <div className="row">
            <select
              className="select"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
            >
              <option value="">Select month</option>
              {monthOptions.map((month) => (
                <option key={month} value={month}>
                  {formatMonthLabel(month)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="status-grid">
          <div className="status-item">
            <div className="status-label">Monthly Total</div>
            <div className="status-value">
              {Object.keys(monthTotals).length === 0
                ? "-"
                : Object.entries(monthTotals)
                    .map(([currency, total]) => formatMoney(total, currency))
                    .join(" • ")}
            </div>
          </div>
          <div className="status-item">
            <div className="status-label">Payments Count</div>
            <div className="status-value">{monthPayments.length}</div>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <colgroup>
              <col className="col-dash-date" />
              <col className="col-dash-user" />
              <col className="col-dash-plan" />
              <col className="col-dash-amount" />
            </colgroup>
            <thead>
              <tr>
                <th>Date</th>
                <th>User</th>
                <th>Plan</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {monthPayments.map((sub) => (
                <tr key={sub.id || sub.submittedAt}>
                  <td>{formatDate(sub.approvedAt || sub.reviewedAt || sub.submittedAt)}</td>
                  <td>{sub.username || "Unknown"}</td>
                  <td>{sub.planName || "-"}</td>
                  <td>{formatMoney(sub.finalAmount ?? sub.price, sub.currency)}</td>
                </tr>
              ))}
              {monthPayments.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state">
                      <div className="empty-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 12h18" />
                          <path d="M12 3v18" />
                        </svg>
                      </div>
                      <div className="empty-title">No payments for this month</div>
                      <div className="empty-subtitle">Select another month to view data.</div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
