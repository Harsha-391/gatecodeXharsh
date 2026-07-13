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

// ── Enterprise Persistent Session Policy ─────────────────────────────────────
// All values are configurable via environment variables.
// Access token: short-lived (30 min). Refreshed silently by the client every 25 min.
// Refresh token: long-lived (default 7d). Stored in httpOnly cookie.
//
// PERSISTENT SESSION — Sessions are NOT terminated by:
//   • Idle inactivity
//   • Long-running shifts (max session removed)
//   • Browser refresh, restart, or computer restart
//
// Sessions are terminated ONLY by:
//   • Manual Logout
//   • Password Changed (revokes all refresh tokens)
//   • Administrator Force Logout (revokes session)
//   • Account Disabled / Deleted
//   • Refresh Token expired or revoked
//
// Idle warning: show a non-blocking informational toast after 60 min of inactivity.
// No forced logout from idle inactivity.

// ── Phase 2: Parse REFRESH_TOKEN_EXPIRES_IN into milliseconds ─────────────────
// Supports formats: 7d, 14d, 30d, 720h, 3600m, 60s, or raw milliseconds.
// Change REFRESH_TOKEN_EXPIRES_IN in .env — no code changes required.
function parseDurationToMs(str) {
    if (!str) return 7 * 24 * 60 * 60 * 1000; // default 7 days
    const raw = String(str).trim();
    if (/^\d+$/.test(raw)) return parseInt(raw, 10); // raw ms
    const match = raw.match(/^(\d+)(d|h|m|s)$/i);
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const n = parseInt(match[1], 10);
    switch (match[2].toLowerCase()) {
        case 'd': return n * 24 * 60 * 60 * 1000;
        case 'h': return n * 60 * 60 * 1000;
        case 'm': return n * 60 * 1000;
        case 's': return n * 1000;
        default:  return 7 * 24 * 60 * 60 * 1000;
    }
}

const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
const REFRESH_TOKEN_EXPIRES_MS = parseDurationToMs(REFRESH_TOKEN_EXPIRES_IN);

module.exports = {
    JWT_SECRET: secret,

    // Short-lived access token (default: 45 minutes)
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '45m',

    // Pre-computed ms value for access token cookie maxAge
    JWT_EXPIRES_MS: parseDurationToMs(process.env.JWT_EXPIRES_IN || '45m'),

    // ── Refresh token lifetime ────────────────────────────────────────────────
    // Configurable via REFRESH_TOKEN_EXPIRES_IN env var (e.g. '7d', '14d', '30d').
    // Change only the env var — no code changes required.
    REFRESH_TOKEN_EXPIRES_IN,
    REFRESH_TOKEN_EXPIRES_MS,

    // Max session (retained for environment variable compatibility, no longer used for forced logout)
    MAX_SESSION_HOURS: parseInt(process.env.MAX_SESSION_HOURS || '8'),
    MAX_SESSION_MS: parseInt(process.env.MAX_SESSION_MS || String(8 * 60 * 60 * 1000)),

    // Idle warning threshold — show informational notice after this many minutes (default: 60 min)
    // Does NOT cause logout. Informational only.
    IDLE_WARN_MINUTES: parseInt(process.env.IDLE_WARN_MINUTES || '60'),
    IDLE_WARN_MS: parseInt(process.env.IDLE_WARN_MS || String(60 * 60 * 1000)),

    // Idle logout (retained for environment variable compatibility, no longer triggers logout)
    IDLE_LOGOUT_MINUTES: parseInt(process.env.IDLE_LOGOUT_MINUTES || '90'),
    IDLE_LOGOUT_MS: parseInt(process.env.IDLE_LOGOUT_MS || String(90 * 60 * 1000)),

    // Countdown duration (retained for environment variable compatibility — no countdown shown)
    IDLE_COUNTDOWN_SECONDS: parseInt(process.env.IDLE_COUNTDOWN_SECONDS || '120'),
};
