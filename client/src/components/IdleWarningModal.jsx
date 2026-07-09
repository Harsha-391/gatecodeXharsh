/**
 * IdleWarningModal — Non-blocking Persistent Session Notice (v2.1)
 *
 * Policy:
 * • Appears as a small toast in the bottom-right corner.
 * • No countdown. No urgency. No forced logout. No blocking overlay.
 * • States clearly that the session is STILL ACTIVE.
 * • Dismissed by:
 *     - "Continue Working" button → hides toast + resets timer + keeps session
 *     - "Dismiss" button → same as Continue Working
 *     - "Logout" button → ends session explicitly
 *     - Any user interaction (mouse/keyboard) → auto-dismissed
 */
import React from "react";
import { useSelector } from "react-redux";
import { continueSession } from "../utils/sessionManager";
import { useAppDispatch } from "../store/hooks";
import { logoutUser } from "../store/slices/authSlice";

const IdleWarningModal = () => {
  const dispatch = useAppDispatch();
  const idleWarningActive = useSelector((s) => s.auth.idleWarningActive);

  if (!idleWarningActive) return null;

  // Both "Continue Working" and "Dismiss" do the same thing:
  // hide the toast, reset inactivity timer, and continue the session.
  const handleContinue = async () => {
    await continueSession();
  };

  const handleDismiss = async () => {
    await continueSession();
  };

  const handleLogout = () => {
    dispatch(logoutUser());
  };

  return (
    <div style={styles.toast} id="idle-session-notice" role="status" aria-live="polite">
      {/* Icon + Title Row */}
      <div style={styles.header}>
        <div style={styles.iconWrap}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <span style={styles.title}>Session Active</span>
        <span style={styles.badge}>🟢 Active</span>
      </div>

      {/* Message */}
      <p style={styles.message}>
        You have been inactive for a while.
        <br />
        <strong>Your session is still active.</strong>
      </p>

      {/* Primary Actions */}
      <div style={styles.actions}>
        <button
          id="idle-continue-btn"
          onClick={handleContinue}
          style={styles.btnPrimary}
          title="Continue your session"
        >
          Continue Working
        </button>
        <button
          id="idle-dismiss-btn"
          onClick={handleDismiss}
          style={styles.btnDismiss}
          title="Dismiss this notice"
        >
          Dismiss
        </button>
      </div>

      {/* Secondary logout link */}
      <div style={styles.logoutRow}>
        <button
          id="idle-logout-btn"
          onClick={handleLogout}
          style={styles.btnLogout}
          title="End session"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
};

const styles = {
  toast: {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    zIndex: 99999,
    background: "linear-gradient(145deg, #1a1f35 0%, #0f1628 100%)",
    border: "1px solid rgba(99,102,241,0.35)",
    borderRadius: "16px",
    padding: "20px 22px",
    width: "312px",
    boxShadow: "0 16px 48px rgba(0,0,0,0.45), 0 0 24px rgba(99,102,241,0.12)",
    animation: "slideInRight 0.35s cubic-bezier(0.34,1.56,0.64,1)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "12px",
  },
  iconWrap: {
    width: "32px",
    height: "32px",
    borderRadius: "9px",
    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    flexShrink: 0,
  },
  title: {
    fontSize: "14px",
    fontWeight: 700,
    color: "#f1f5f9",
    flex: 1,
  },
  badge: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#4ade80",
    background: "rgba(74,222,128,0.1)",
    border: "1px solid rgba(74,222,128,0.25)",
    borderRadius: "100px",
    padding: "2px 8px",
    whiteSpace: "nowrap",
  },
  message: {
    fontSize: "13px",
    color: "#94a3b8",
    lineHeight: 1.6,
    margin: "0 0 14px",
  },
  actions: {
    display: "flex",
    gap: "8px",
    marginBottom: "10px",
  },
  // "Continue Working" — primary CTA
  btnPrimary: {
    flex: 1,
    padding: "9px 12px",
    borderRadius: "9px",
    border: "none",
    cursor: "pointer",
    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    color: "#fff",
    fontWeight: 700,
    fontSize: "13px",
    boxShadow: "0 3px 10px rgba(99,102,241,0.35)",
    transition: "opacity 0.15s ease",
  },
  // "Dismiss" — secondary, same effect as Continue Working
  btnDismiss: {
    padding: "9px 14px",
    borderRadius: "9px",
    cursor: "pointer",
    background: "transparent",
    border: "1px solid rgba(99,102,241,0.3)",
    color: "#a5b4fc",
    fontWeight: 600,
    fontSize: "13px",
    transition: "all 0.15s ease",
  },
  // Logout row — below primary actions, styled as a subtle text link
  logoutRow: {
    display: "flex",
    justifyContent: "center",
    paddingTop: "2px",
  },
  btnLogout: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    color: "#64748b",
    fontSize: "12px",
    fontWeight: 500,
    textDecoration: "underline",
    padding: "2px 4px",
    transition: "color 0.15s ease",
  },
};


// Inject the slide-in animation (added once to the document head)
if (typeof document !== "undefined") {
  const styleId = "idle-toast-anim";
  if (!document.getElementById(styleId)) {
    const styleEl = document.createElement("style");
    styleEl.id = styleId;
    styleEl.textContent = `
      @keyframes slideInRight {
        from { opacity: 0; transform: translateX(40px); }
        to   { opacity: 1; transform: translateX(0); }
      }
    `;
    document.head.appendChild(styleEl);
  }
}

export default IdleWarningModal;
