/**
 * SessionRestoringScreen — Lightweight loading screen shown during session validation.
 *
 * Displayed when the app boots with a cached user in localStorage.
 * Hidden as soon as the backend confirms (or denies) the session.
 * Prevents the dashboard from briefly flashing before a redirect to Login.
 */
import React, { useEffect, useState } from "react";

const dots = [".", "..", "..."];

const SessionRestoringScreen = () => {
  const [dotIdx, setDotIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setDotIdx(i => (i + 1) % dots.length);
    }, 500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={styles.overlay} id="session-restoring-screen" aria-live="polite" aria-label="Restoring session">
      <div style={styles.card}>
        {/* Animated lock icon */}
        <div style={styles.iconWrap}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <circle cx="12" cy="13" r="1.5" fill="currentColor" />
          </svg>
        </div>

        {/* Spinner ring */}
        <div style={styles.spinnerWrap}>
          <div style={styles.spinner} />
        </div>

        <h2 style={styles.title}>Restoring Session{dots[dotIdx]}</h2>
        <p style={styles.subtitle}>Verifying your credentials securely</p>

        <div style={styles.badges}>
          <span style={styles.badge}>🔒 Encrypted</span>
          <span style={styles.badge}>🛡 Secure</span>
          <span style={styles.badge}>⚡ Fast</span>
        </div>
      </div>

      {/* Inject keyframes */}
      <style>{`
        @keyframes srs-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes srs-fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes srs-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(99,102,241,0.4); }
          50%       { box-shadow: 0 0 0 12px rgba(99,102,241,0); }
        }
      `}</style>
    </div>
  );
};

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 99999,
    background: "linear-gradient(135deg, #0a0e1a 0%, #0f172a 50%, #0a0e1a 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "16px",
    animation: "srs-fadeIn 0.4s ease",
  },
  iconWrap: {
    width: "72px",
    height: "72px",
    borderRadius: "20px",
    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    animation: "srs-pulse 2s infinite",
    marginBottom: "8px",
  },
  spinnerWrap: {
    position: "relative",
    width: "48px",
    height: "48px",
  },
  spinner: {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    border: "3px solid rgba(99,102,241,0.15)",
    borderTop: "3px solid #6366f1",
    animation: "srs-spin 0.9s linear infinite",
  },
  title: {
    margin: 0,
    fontSize: "22px",
    fontWeight: 700,
    color: "#f1f5f9",
    letterSpacing: "-0.3px",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    minWidth: "220px",
    textAlign: "center",
  },
  subtitle: {
    margin: 0,
    fontSize: "14px",
    color: "#64748b",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  badges: {
    display: "flex",
    gap: "8px",
    marginTop: "8px",
  },
  badge: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#8b5cf6",
    background: "rgba(139,92,246,0.1)",
    border: "1px solid rgba(139,92,246,0.2)",
    borderRadius: "100px",
    padding: "4px 10px",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
};

export default SessionRestoringScreen;
