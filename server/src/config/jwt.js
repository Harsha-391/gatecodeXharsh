/**
 * Single source of truth for JWT configuration.
 * Crashes the process at startup if JWT_SECRET is not set — a missing secret
 * in production would otherwise silently fall back to a known string, allowing
 * anyone to forge tokens.
 */

let secret = process.env.JWT_SECRET;

if (!secret || secret.trim().length < 32) {
    if (process.env.NODE_ENV === 'production') {
        console.error('[FATAL] JWT_SECRET env var is missing or too short (min 32 chars). Set it before starting the server.');
        process.exit(1);
    } else {
        console.warn('[WARN] JWT_SECRET is missing or too short. Using a secure default for development.');
        secret = 'this_is_a_secure_fallback_secret_for_local_development_only_12345';
    }
}

// ── Enterprise Session Policy ────────────────────────────────────────────────
// All values are configurable via environment variables.
// Access token: short-lived (30 min). Refreshed silently by the client.
// Refresh token: long-lived (7 days). Stored in httpOnly cookie.
// Max session: regardless of activity, force re-auth after 8 hours.
// Idle warning: warn user after 60 minutes of inactivity.
// Auto logout: log out user after 90 minutes of inactivity.

module.exports = {
    JWT_SECRET: secret,

    // Short-lived access token (default: 30 minutes)
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '30m',

    // Refresh token lifetime (default: 7 days)
    REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
    REFRESH_TOKEN_EXPIRES_MS: parseInt(process.env.REFRESH_TOKEN_EXPIRES_MS || String(7 * 24 * 60 * 60 * 1000)),

    // Maximum continuous session — force re-auth after this regardless of activity (default: 8 hours)
    MAX_SESSION_HOURS: parseInt(process.env.MAX_SESSION_HOURS || '8'),
    MAX_SESSION_MS: parseInt(process.env.MAX_SESSION_MS || String(8 * 60 * 60 * 1000)),

    // Idle warning — show warning dialog after this many minutes (default: 60 min)
    IDLE_WARN_MINUTES: parseInt(process.env.IDLE_WARN_MINUTES || '60'),
    IDLE_WARN_MS: parseInt(process.env.IDLE_WARN_MS || String(60 * 60 * 1000)),

    // Auto logout — disconnect after this many minutes of inactivity (default: 90 min)
    IDLE_LOGOUT_MINUTES: parseInt(process.env.IDLE_LOGOUT_MINUTES || '90'),
    IDLE_LOGOUT_MS: parseInt(process.env.IDLE_LOGOUT_MS || String(90 * 60 * 1000)),

    // Countdown duration shown in idle warning modal (default: 2 minutes)
    IDLE_COUNTDOWN_SECONDS: parseInt(process.env.IDLE_COUNTDOWN_SECONDS || '120'),
};

