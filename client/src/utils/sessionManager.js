/**
 * sessionManager.js — Simplified Session Manager
 * Inactivity auto-logout and cookie refresh are disabled.
 * The session remains completely active until the user manually logs out.
 */

export async function refreshAccessToken() {
    return true;
}

export function startSessionMonitoring(store) {
    console.debug("[SessionManager] Monitoring active. Simple session (persists until manual logout).");
}

export function stopSessionMonitoring() {
    console.debug("[SessionManager] Stopped.");
}

export function resetActivityTimer() {
    // No-op
}

export function continueSession() {
    // No-op
}

export function _performForceLogout() {
    // No-op
}
