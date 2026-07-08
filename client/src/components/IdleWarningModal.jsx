import React, { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { continueSession } from "../utils/sessionManager";
import { useAppDispatch } from "../store/hooks";
import { logoutUser } from "../store/slices/authSlice";

const IdleWarningModal = () => {
  const dispatch = useAppDispatch();
  const { idleWarningActive, idleCountdown } = useSelector((s) => s.auth);
  const [secondsLeft, setSecondsLeft] = useState(idleCountdown || 120);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!idleWarningActive) {
      setSecondsLeft(idleCountdown || 120);
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    setSecondsLeft(idleCountdown || 120);
    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [idleWarningActive, idleCountdown]);

  if (!idleWarningActive) return null;

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const urgent = secondsLeft <= 30;

  const handleContinue = async () => {
    await continueSession();
  };

  const handleLogout = () => {
    dispatch(logoutUser());
  };

  return (
    <div style={styles.overlay} id="idle-warning-modal">
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.iconWrap}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <h2 style={styles.title}>Session Expiring</h2>
        </div>

        {/* Body */}
        <p style={styles.desc}>
          No activity has been detected. Your session will expire in:
        </p>

        <div style={{ ...styles.countdown, ...(urgent ? styles.urgent : {}) }}>
          {mm}:{ss}
        </div>

        <p style={styles.subtext}>
          Click <strong>Continue Working</strong> to stay logged in.
        </p>

        {/* Actions */}
        <div style={styles.actions}>
          <button id="idle-continue-btn" onClick={handleContinue} style={styles.btnPrimary}>
            ✓ Continue Working
          </button>
          <button id="idle-logout-btn" onClick={handleLogout} style={styles.btnSecondary}>
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 99999,
    background: "rgba(0,0,0,0.65)",
    backdropFilter: "blur(8px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    animation: "fadeIn 0.3s ease",
  },
  modal: {
    background: "linear-gradient(145deg, #1a1f35 0%, #0f1628 100%)",
    border: "1px solid rgba(99,102,241,0.3)",
    borderRadius: "20px",
    padding: "40px 36px",
    maxWidth: "420px",
    width: "90%",
    boxShadow: "0 25px 60px rgba(0,0,0,0.5), 0 0 40px rgba(99,102,241,0.15)",
    textAlign: "center",
    animation: "slideUp 0.4s cubic-bezier(0.34,1.56,0.64,1)",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "center",
    gap: "12px", marginBottom: "16px",
  },
  iconWrap: {
    width: "48px", height: "48px", borderRadius: "14px",
    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#fff", flexShrink: 0,
  },
  title: {
    margin: 0, fontSize: "22px", fontWeight: 700,
    color: "#f1f5f9", letterSpacing: "-0.3px",
  },
  desc: {
    color: "#94a3b8", fontSize: "15px", lineHeight: 1.6,
    marginBottom: "24px",
  },
  countdown: {
    fontSize: "56px", fontWeight: 800, letterSpacing: "-2px",
    color: "#6366f1", marginBottom: "16px",
    fontVariantNumeric: "tabular-nums",
    transition: "color 0.3s ease",
  },
  urgent: {
    color: "#ef4444",
    textShadow: "0 0 20px rgba(239,68,68,0.4)",
  },
  subtext: {
    color: "#64748b", fontSize: "13px", marginBottom: "28px",
  },
  actions: {
    display: "flex", gap: "12px", flexDirection: "column",
  },
  btnPrimary: {
    padding: "14px 24px", borderRadius: "12px", border: "none", cursor: "pointer",
    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    color: "#fff", fontWeight: 700, fontSize: "15px",
    transition: "all 0.2s ease",
    boxShadow: "0 4px 15px rgba(99,102,241,0.4)",
  },
  btnSecondary: {
    padding: "12px 24px", borderRadius: "12px", cursor: "pointer",
    background: "transparent",
    border: "1px solid rgba(148,163,184,0.2)",
    color: "#94a3b8", fontWeight: 600, fontSize: "14px",
    transition: "all 0.2s ease",
  },
};

export default IdleWarningModal;
