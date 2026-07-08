/**
 * sessionManager.js — Enterprise Session Management Singleton
 *
 * Responsibilities:
 * - Track user activity (mouse, keyboard, API calls, navigation)
 * - Implement sliding session: reset idle timer on any activity
 * - Silently refresh access token before it expires (every 25 min)
 * - Show idle warning modal after 60 min of inactivity
 * - Auto-logout after 90 min of inactivity
 * - Force re-authentication after 8 hour max session
 * - Coordinate with Socket.IO on login/logout
 * - Log session events to the audit API
 */
import socket from "./socket";

// ── Configuration (mirrors server/src/config/jwt.js) ─────────────────────────
const CONFIG = {
    IDLE_WARN_MS:      60 * 60 * 1000,   // 60 minutes
    IDLE_LOGOUT_MS:    90 * 60 * 1000,   // 90 minutes
    IDLE_COUNTDOWN_S:  120,               // 2 minute countdown in modal
    MAX_SESSION_MS:     8 * 60 * 60 * 1000, // 8 hours
    TOKEN_REFRESH_MS:  25 * 60 * 1000,   // Refresh access token every 25 min (before 30 min expiry)
};

// ── Activity Events ───────────────────────────────────────────────────────────
const ACTIVITY_EVENTS = [
    "mousedown", "mousemove", "keydown", "touchstart",
    "scroll", "click", "keypress", "pointerdown",
];

// ── Internal State ────────────────────────────────────────────────────────────
let _store         = null;   // Redux store reference
let _lastActivity  = Date.now();
let _sessionStart  = Date.now();
let _idleWarnTimer   = null;
let _idleLogoutTimer = null;
let _maxSessionTimer = null;
let _tokenRefreshInterval = null;
let _warningActive = false;
let _criticalWorkflow = false;  // Phase 7: role-aware protection
let _isRunning = false;

// ── Activity Tracking ─────────────────────────────────────────────────────────
function _handleActivity() {
    _lastActivity = Date.now();
    if (_warningActive) return; // Don't reset during active warning countdown
    _scheduleTimers();
}

// ── Timer Management ──────────────────────────────────────────────────────────
function _clearTimers() {
    if (_idleWarnTimer)    clearTimeout(_idleWarnTimer);
    if (_idleLogoutTimer)  clearTimeout(_idleLogoutTimer);
    if (_maxSessionTimer)  clearTimeout(_maxSessionTimer);
    _idleWarnTimer = _idleLogoutTimer = _maxSessionTimer = null;
}

function _scheduleTimers() {
    _clearTimers();

    // Idle warning timer
    _idleWarnTimer = setTimeout(() => {
        _warningActive = true;
        _store?.dispatch({ type: "auth/showIdleWarning", payload: { countdown: CONFIG.IDLE_COUNTDOWN_S } });
        _logSessionEvent("SESSION_WARNING", "User idle for 60 minutes");
    }, CONFIG.IDLE_WARN_MS);

    // Auto-logout timer (warning + countdown period)
    _idleLogoutTimer = setTimeout(() => {
        if (_criticalWorkflow) {
            // Phase 7: delay 5 more minutes if user is mid-workflow
            setTimeout(() => _performAutoLogout(), 5 * 60 * 1000);
        } else {
            _performAutoLogout();
        }
    }, CONFIG.IDLE_LOGOUT_MS);
}

function _scheduleMaxSession(sessionStartTime) {
    const elapsed = Date.now() - sessionStartTime;
    const remaining = Math.max(CONFIG.MAX_SESSION_MS - elapsed, 1000);

    _maxSessionTimer = setTimeout(() => {
        _store?.dispatch({ type: "auth/setMaxSession", payload: true });
        _performForceLogout("Your work shift session has ended. Please sign in again.");
    }, remaining);
}

// ── Logout Helpers ────────────────────────────────────────────────────────────
async function _performAutoLogout() {
    if (!_store) return;
    _warningActive = false;
    _logSessionEvent("AUTO_LOGOUT_IDLE", "Session expired due to 90 minutes of inactivity");

    socket.disconnect();

    const { logoutUser } = await import("../store/slices/authSlice");
    _store.dispatch(logoutUser());
}

async function _performForceLogout(message) {
    if (!_store) return;
    _logSessionEvent("FORCED_LOGOUT", message);
    socket.disconnect();
    const { logoutUser } = await import("../store/slices/authSlice");
    _store.dispatch(logoutUser());
}

// ── Token Refresh ─────────────────────────────────────────────────────────────
async function refreshAccessToken() {
    try {
        const res = await fetch("/api/auth/refresh", {
            method: "POST",
            credentials: "include", // sends the httpOnly cookie
        });
        const data = await res.json();

        if (data.success) {
            if (data.sessionStart) {
                _sessionStart = new Date(data.sessionStart).getTime();
            }
            return true;
        } else if (data.code === "MAX_SESSION") {
            _store?.dispatch({ type: "auth/setMaxSession", payload: true });
            _performForceLogout("Maximum session duration reached.");
            return false;
        } else {
            // Refresh token invalid or expired — logout
            const { logout } = await import("../store/slices/authSlice");
            _store?.dispatch(logout());
            return false;
        }
    } catch (err) {
        console.warn("[SessionManager] Token refresh failed:", err);
        return false;
    }
}

// ── Audit Logging ─────────────────────────────────────────────────────────────
async function _logSessionEvent(action, reason) {
    try {
        const user = localStorage.getItem("user");
        if (!user) return;
        await fetch("/api/auth/log-session-event", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ action, reason }),
        });
    } catch (_) {}
}

// ── Critical Workflow (Phase 7) ───────────────────────────────────────────────
export function setCriticalWorkflow(active) {
    _criticalWorkflow = !!active;
}

// ── Reset (called on "Continue Working") ─────────────────────────────────────
export async function continueSession() {
    _warningActive = false;
    _lastActivity = Date.now();
    _store?.dispatch({ type: "auth/hideIdleWarning" });

    const success = await refreshAccessToken();
    if (success) {
        _logSessionEvent("SESSION_EXTENDED", "User continued session from idle warning");
        _scheduleTimers();
    }
}

// ── Reset activity timer (called from api.js interceptor) ────────────────────
export function resetActivityTimer() {
    if (!_isRunning) return;
    _lastActivity = Date.now();
    if (!_warningActive) _scheduleTimers();
}

// ── Start / Stop ──────────────────────────────────────────────────────────────
export function startSessionMonitoring(store, sessionStartTime) {
    if (_isRunning) return;
    _isRunning = true;
    _store = store;
    _lastActivity = Date.now();
    _sessionStart = sessionStartTime ? new Date(sessionStartTime).getTime() : Date.now();

    // Attach activity listeners
    ACTIVITY_EVENTS.forEach(ev => document.addEventListener(ev, _handleActivity, { passive: true }));

    // Start timers
    _scheduleTimers();
    _scheduleMaxSession(_sessionStart);

    // Token refresh interval: every 25 minutes
    _tokenRefreshInterval = setInterval(refreshAccessToken, CONFIG.TOKEN_REFRESH_MS);

    console.debug("[SessionManager] Started. Idle warn:", CONFIG.IDLE_WARN_MS / 60000, "min | Auto-logout:", CONFIG.IDLE_LOGOUT_MS / 60000, "min | Max session:", CONFIG.MAX_SESSION_MS / 3600000, "h");
}

export function stopSessionMonitoring() {
    if (!_isRunning) return;
    _isRunning = false;
    _warningActive = false;

    ACTIVITY_EVENTS.forEach(ev => document.removeEventListener(ev, _handleActivity));
    _clearTimers();

    if (_tokenRefreshInterval) {
        clearInterval(_tokenRefreshInterval);
        _tokenRefreshInterval = null;
    }

    console.debug("[SessionManager] Stopped.");
}
