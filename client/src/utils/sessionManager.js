/**
 * sessionManager.js — Enterprise Persistent Session Manager
 *
 * Policy (v2 — Persistent Session Edition):
 * ─────────────────────────────────────────
 * • Sessions persist across page refresh, browser restart, and computer restart.
 * • Sessions are ONLY terminated by:
 *     - Manual Logout
 *     - Password Changed (server revokes refresh token)
 *     - Administrator Force Logout (server revokes refresh token)
 *     - Account Disabled / Deleted (server rejects refresh)
 *     - Refresh Token expired or revoked
 * • Idle inactivity NEVER causes logout.
 * • Maximum session duration NO LONGER forces logout.
 * • Access tokens are refreshed silently every 25 minutes.
 * • After 60 minutes of inactivity, a single non-blocking informational
 *   toast is shown. Any user interaction dismisses it.
 * • The toast is shown ONLY ONCE per inactivity cycle — not repeatedly.
 */
import socket from "./socket";

// ── API Base URL ──────────────────────────────────────────────────────────────
const _getApiBase = () => {
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) {
        return import.meta.env.VITE_API_URL;
    }
    if (typeof window !== 'undefined') {
        const h = window.location.hostname;
        if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost')) {
            return '';
        }
    }
    return 'https://gatecodexharsh-1.onrender.com';
};
const API_BASE = _getApiBase();

// ── Configuration ─────────────────────────────────────────────────────────────
const CONFIG = {
    IDLE_WARN_MS:      60 * 60 * 1000,   // 60 minutes — show informational toast
    TOKEN_REFRESH_MS:  25 * 60 * 1000,   // Refresh access token every 25 min (before 30 min expiry)
};

// ── Activity Events ───────────────────────────────────────────────────────────
const ACTIVITY_EVENTS = [
    "mousedown", "mousemove", "keydown", "touchstart",
    "scroll", "click", "keypress", "pointerdown",
];

// ── Internal State ────────────────────────────────────────────────────────────
let _store               = null;   // Redux store reference
let _lastActivity        = Date.now();
let _idleWarnTimer       = null;
let _tokenRefreshInterval = null;
let _warningShownThisCycle = false;  // Guard: show toast only once per inactivity cycle
let _isRunning           = false;

// ── Activity Tracking ─────────────────────────────────────────────────────────
function _handleActivity() {
    _lastActivity = Date.now();

    // Any interaction dismisses the idle warning toast
    if (_warningShownThisCycle) {
        _warningShownThisCycle = false;
        _store?.dispatch({ type: "auth/hideIdleWarning" });
        _logSessionEvent("SESSION_WARNING_DISMISSED", "User resumed activity after idle notice");
    }

    // Reset the idle warning timer
    _scheduleIdleWarnTimer();
}

// ── Timer Management ──────────────────────────────────────────────────────────
function _clearIdleWarnTimer() {
    if (_idleWarnTimer) clearTimeout(_idleWarnTimer);
    _idleWarnTimer = null;
}

function _scheduleIdleWarnTimer() {
    _clearIdleWarnTimer();

    _idleWarnTimer = setTimeout(() => {
        // Only show the toast once per inactivity cycle (don't spam)
        if (!_warningShownThisCycle) {
            _warningShownThisCycle = true;
            _store?.dispatch({ type: "auth/showIdleWarning" });
            _logSessionEvent("SESSION_WARNING_SHOWN", "User idle for 60 minutes — informational notice displayed");
        }
        // Do NOT set another timer — the toast stays visible until the user interacts.
        // No auto-logout is triggered.
    }, CONFIG.IDLE_WARN_MS);
}

// ── Token Refresh ─────────────────────────────────────────────────────────────
export async function refreshAccessToken() {
    try {
        const res = await fetch(`${API_BASE}/api/auth/refresh`, {
            method: "POST",
            credentials: "include",
            headers: {
                "X-Tenant-Domain": typeof window !== 'undefined' ? window.location.hostname : ""
            }
        });
        const data = await res.json();

        if (data.success) {
            _logSessionEvent("REFRESH_SUCCESS", "Silent access token refresh succeeded");
            return true;
        } else {
            // Only the server can terminate the session (revoked/expired refresh token,
            // account disabled, password changed, admin force-logout).
            _logSessionEvent("REFRESH_FAILED", data.message || "Refresh token invalid or expired");
            const { logout } = await import("../store/slices/authSlice");
            _store?.dispatch(logout());
            return false;
        }
    } catch (err) {
        console.warn("[SessionManager] Token refresh failed (network):", err);
        // Network error — do NOT logout. The user may be temporarily offline.
        // The next refresh cycle or API call will retry.
        return false;
    }
}

// ── Audit Logging ─────────────────────────────────────────────────────────────
async function _logSessionEvent(action, reason) {
    try {
        const user = localStorage.getItem("user");
        if (!user) return;
        await fetch(`${API_BASE}/api/auth/log-session-event`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                "X-Tenant-Domain": typeof window !== 'undefined' ? window.location.hostname : ""
            },
            body: JSON.stringify({ action, reason }),
        });
    } catch (_) {
        // Audit logging is best-effort — never block the user
    }
}

// ── Forced Logout (only called by server-driven events) ───────────────────────
export async function _performForceLogout(message) {
    if (!_store) return;
    _logSessionEvent("FORCED_LOGOUT", message);
    socket.disconnect();
    const { logoutUser } = await import("../store/slices/authSlice");
    _store.dispatch(logoutUser());
}

// ── "Continue Working" — dismiss the toast and reset the inactivity timer ─────
export async function continueSession() {
    _warningShownThisCycle = false;
    _lastActivity = Date.now();
    _store?.dispatch({ type: "auth/hideIdleWarning" });
    _logSessionEvent("SESSION_EXTENDED", "User dismissed idle notice — session continuing");
    _scheduleIdleWarnTimer();

    // Proactively refresh the token when the user re-engages
    await refreshAccessToken();
}

// ── Reset activity timer (called from api.js request interceptor) ─────────────
export function resetActivityTimer() {
    if (!_isRunning) return;
    _handleActivity();
}

// ── Critical Workflow Flag (kept for API compatibility) ───────────────────────
export function setCriticalWorkflow(_active) {
    // No-op in the persistent session policy — inactivity never causes logout
}

// ── Start / Stop ──────────────────────────────────────────────────────────────
export function startSessionMonitoring(store) {
    if (_isRunning) return;
    _isRunning = true;
    _store = store;
    _lastActivity = Date.now();
    _warningShownThisCycle = false;

    // Attach passive activity listeners to track inactivity for the toast
    ACTIVITY_EVENTS.forEach(ev => document.addEventListener(ev, _handleActivity, { passive: true }));

    // Start idle warning timer (informational only — no auto-logout)
    _scheduleIdleWarnTimer();

    // Silent token refresh — every 25 minutes
    _tokenRefreshInterval = setInterval(refreshAccessToken, CONFIG.TOKEN_REFRESH_MS);

    console.debug("[SessionManager] Persistent session started. Idle notice at:", CONFIG.IDLE_WARN_MS / 60000, "min | Token refresh every:", CONFIG.TOKEN_REFRESH_MS / 60000, "min");
}

export function stopSessionMonitoring() {
    if (!_isRunning) return;
    _isRunning = false;
    _warningShownThisCycle = false;

    ACTIVITY_EVENTS.forEach(ev => document.removeEventListener(ev, _handleActivity));
    _clearIdleWarnTimer();

    if (_tokenRefreshInterval) {
        clearInterval(_tokenRefreshInterval);
        _tokenRefreshInterval = null;
    }

    console.debug("[SessionManager] Stopped.");
}
