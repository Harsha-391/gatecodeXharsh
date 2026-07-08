import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { useAuth } from "../../store/hooks";

const api = (url, options = {}) => {
  return axios({
    url, withCredentials: true,
    headers: { "Content-Type": "application/json" },
    ...options,
  }).then((r) => r.data);
};

const DeviceIcon = ({ device }) => {
  if (device === "Mobile")  return <>📱</>;
  if (device === "Tablet")  return <>📟</>;
  return <>💻</>;
};

const StatusBadge = ({ isCurrent }) => (
  <span style={{
    padding: "3px 10px", borderRadius: "100px", fontSize: "11px", fontWeight: 700,
    background: isCurrent ? "rgba(34,197,94,0.15)" : "rgba(99,102,241,0.15)",
    color: isCurrent ? "#22c55e" : "#818cf8",
    border: `1px solid ${isCurrent ? "rgba(34,197,94,0.3)" : "rgba(99,102,241,0.3)"}`,
  }}>
    {isCurrent ? "● Current" : "● Active"}
  </span>
);

export default function ActiveSessions() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(null);
  const [msg, setMsg] = useState(null);

  const role = String(user?.role || "").toLowerCase();
  const isSuperAdmin = ["superadmin", "centraladmin"].includes(role);
  const isHospitalAdmin = ["hospitaladmin", "clinicadmin"].includes(role);

  const endpoint = isSuperAdmin ? "/api/sessions/all" : isHospitalAdmin ? "/api/sessions/hospital" : "/api/sessions/mine";

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api(endpoint);
      if (data.success) setSessions(data.sessions || []);
    } catch (e) {
      setMsg({ type: "error", text: "Failed to load sessions." });
    } finally { setLoading(false); }
  }, [endpoint]);

  useEffect(() => { load(); }, [load]);

  const revoke = async (id, label) => {
    if (!window.confirm(`Terminate ${label}?`)) return;
    setRevoking(id);
    try {
      await api(`/api/sessions/${id}`, { method: "DELETE" });
      setMsg({ type: "success", text: "Session terminated." });
      await load();
    } catch { setMsg({ type: "error", text: "Failed to terminate session." }); }
    finally { setRevoking(null); }
  };

  const revokeOther = async () => {
    if (!window.confirm("Logout all other devices?")) return;
    try {
      await api("/api/sessions/other", { method: "DELETE" });
      setMsg({ type: "success", text: "All other sessions logged out." });
      await load();
    } catch { setMsg({ type: "error", text: "Failed." }); }
  };

  const revokeAll = async () => {
    if (!window.confirm("Logout ALL sessions including this one?")) return;
    try {
      await api("/api/sessions/all", { method: "DELETE" });
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    } catch { setMsg({ type: "error", text: "Failed." }); }
  };

  const formatTime = (iso) => {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  };

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>🔐 Active Sessions</h1>
          <p style={s.subtitle}>Manage all authenticated sessions across devices</p>
        </div>
        <div style={s.headerActions}>
          <button onClick={revokeOther} style={s.btnWarn} id="revoke-other-sessions-btn">
            Logout Other Devices
          </button>
          <button onClick={revokeAll} style={s.btnDanger} id="revoke-all-sessions-btn">
            Logout All
          </button>
          <button onClick={load} style={s.btnSecondary} id="refresh-sessions-btn">⟳ Refresh</button>
        </div>
      </div>

      {/* Message */}
      {msg && (
        <div style={{ ...s.alert, ...(msg.type === "error" ? s.alertErr : s.alertOk) }}
          onClick={() => setMsg(null)}>
          {msg.text}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={s.loading}>Loading sessions…</div>
      ) : sessions.length === 0 ? (
        <div style={s.empty}>No active sessions found.</div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                {["Device", "Browser / OS", "IP Address", "Login Time", "Last Activity", "Duration", "Status", "Action"].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map((sess) => (
                <tr key={sess.id} style={{ ...s.tr, ...(sess.isCurrentSession ? s.trCurrent : {}) }}>
                  <td style={s.td}>
                    <DeviceIcon device={sess.device} /> {sess.device}
                    {sess.user && <div style={s.userLabel}>{sess.user.name} · {sess.user.email}</div>}
                  </td>
                  <td style={s.td}>
                    <div style={s.browserLine}>{sess.browser}</div>
                    <div style={s.osLine}>{sess.os}</div>
                  </td>
                  <td style={s.td}><code style={s.ip}>{sess.ip || "—"}</code></td>
                  <td style={s.td}>{formatTime(sess.loginTime)}</td>
                  <td style={s.td}>{formatTime(sess.lastActivity)}</td>
                  <td style={s.td}>{sess.duration}</td>
                  <td style={s.td}><StatusBadge isCurrent={sess.isCurrentSession} /></td>
                  <td style={s.td}>
                    {sess.isCurrentSession ? (
                      <span style={s.currentLabel}>Current</span>
                    ) : (
                      <button
                        id={`revoke-session-${sess.id}`}
                        disabled={revoking === sess.id}
                        onClick={() => revoke(sess.id, `session on ${sess.device}`)}
                        style={s.revokeBtn}>
                        {revoking === sess.id ? "…" : "Terminate"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const s = {
  page: { padding: "32px", fontFamily: "'Inter', sans-serif", minHeight: "100vh", background: "#0f172a", color: "#f1f5f9" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px", flexWrap: "wrap", gap: "16px" },
  title: { margin: 0, fontSize: "26px", fontWeight: 800, color: "#f1f5f9" },
  subtitle: { margin: "4px 0 0", color: "#64748b", fontSize: "14px" },
  headerActions: { display: "flex", gap: "10px", flexWrap: "wrap" },
  btnWarn:    { padding: "10px 18px", borderRadius: "10px", border: "1px solid rgba(251,191,36,0.3)", background: "rgba(251,191,36,0.1)", color: "#fbbf24", fontWeight: 600, cursor: "pointer", fontSize: "13px" },
  btnDanger:  { padding: "10px 18px", borderRadius: "10px", border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.1)", color: "#ef4444", fontWeight: 600, cursor: "pointer", fontSize: "13px" },
  btnSecondary:{ padding: "10px 18px", borderRadius: "10px", border: "1px solid rgba(148,163,184,0.2)", background: "transparent", color: "#94a3b8", fontWeight: 600, cursor: "pointer", fontSize: "13px" },
  alert: { padding: "12px 16px", borderRadius: "10px", marginBottom: "16px", fontSize: "14px", cursor: "pointer" },
  alertOk:  { background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)" },
  alertErr: { background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" },
  loading: { color: "#64748b", textAlign: "center", padding: "40px" },
  empty:   { color: "#64748b", textAlign: "center", padding: "40px" },
  tableWrap: { overflowX: "auto", borderRadius: "16px", border: "1px solid rgba(148,163,184,0.1)", background: "rgba(255,255,255,0.03)" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
  th: { padding: "14px 16px", textAlign: "left", color: "#64748b", fontWeight: 600, borderBottom: "1px solid rgba(148,163,184,0.1)", whiteSpace: "nowrap", textTransform: "uppercase", fontSize: "11px", letterSpacing: "0.5px" },
  tr: { borderBottom: "1px solid rgba(148,163,184,0.07)", transition: "background 0.15s" },
  trCurrent: { background: "rgba(99,102,241,0.05)" },
  td: { padding: "14px 16px", color: "#cbd5e1", verticalAlign: "middle" },
  userLabel: { color: "#64748b", fontSize: "11px", marginTop: "2px" },
  browserLine: { color: "#e2e8f0", fontWeight: 500 },
  osLine: { color: "#64748b", fontSize: "11px" },
  ip: { background: "rgba(99,102,241,0.1)", padding: "2px 8px", borderRadius: "6px", color: "#a5b4fc", fontSize: "12px" },
  currentLabel: { color: "#22c55e", fontSize: "12px", fontWeight: 600 },
  revokeBtn: { padding: "6px 14px", borderRadius: "8px", border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.1)", color: "#ef4444", cursor: "pointer", fontWeight: 600, fontSize: "12px" },
};
