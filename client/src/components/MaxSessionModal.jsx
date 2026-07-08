import React from "react";
import { useSelector } from "react-redux";

const MaxSessionModal = () => {
  const maxSessionReached = useSelector((s) => s.auth.maxSessionReached);

  if (!maxSessionReached) return null;

  const handleReLogin = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/login?reason=max_session";
  };

  return (
    <div style={styles.overlay} id="max-session-modal">
      <div style={styles.modal}>
        <div style={styles.iconWrap}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M12 8v4" /><path d="M12 16h.01" />
          </svg>
        </div>
        <h2 style={styles.title}>Work Shift Session Ended</h2>
        <p style={styles.desc}>
          Your work shift session has ended after 8 hours of continuous login.
          <br />
          Please sign in again to continue.
        </p>
        <div style={styles.badge}>🔒 Security Policy</div>
        <button id="max-session-relogin-btn" onClick={handleReLogin} style={styles.btn}>
          Sign In Again
        </button>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 99999,
    background: "rgba(0,0,0,0.80)",
    backdropFilter: "blur(12px)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  modal: {
    background: "linear-gradient(145deg, #0f172a 0%, #1e1b4b 100%)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: "24px",
    padding: "48px 40px",
    maxWidth: "440px",
    width: "90%",
    textAlign: "center",
    boxShadow: "0 30px 80px rgba(0,0,0,0.6), 0 0 60px rgba(239,68,68,0.1)",
  },
  iconWrap: {
    width: "72px", height: "72px", borderRadius: "20px",
    background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#fff", margin: "0 auto 24px",
    boxShadow: "0 8px 24px rgba(239,68,68,0.4)",
  },
  title: {
    margin: "0 0 16px", fontSize: "24px", fontWeight: 800,
    color: "#f1f5f9",
  },
  desc: {
    color: "#94a3b8", fontSize: "15px", lineHeight: 1.7,
    marginBottom: "24px",
  },
  badge: {
    display: "inline-block", padding: "6px 16px",
    background: "rgba(239,68,68,0.15)", borderRadius: "100px",
    color: "#fca5a5", fontSize: "12px", fontWeight: 600,
    border: "1px solid rgba(239,68,68,0.3)",
    marginBottom: "32px",
  },
  btn: {
    width: "100%", padding: "16px", borderRadius: "14px",
    border: "none", cursor: "pointer",
    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    color: "#fff", fontWeight: 700, fontSize: "16px",
    boxShadow: "0 4px 20px rgba(99,102,241,0.4)",
  },
};

export default MaxSessionModal;
