import { io } from 'socket.io-client';

// ─── Environment ─────────────────────────────────────────────────────────────
const IS_DEV = import.meta.env.DEV;

// ─── URL Resolution (matches api.js logic) ───────────────────────────────────
// Priority:
//   1. VITE_SOCKET_URL      — explicit Vercel env var (set this in production)
//   2. VITE_API_BASE_URL    — legacy fallback (backward compat)
//   3. Hostname check       — if on localhost/IP → '' (Vite proxy handles it)
//   4. Production hardcode  — Render backend URL
const getSocketURL = () => {
    if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
    if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL;

    if (typeof window !== 'undefined') {
        const { hostname } = window.location;
        if (
            hostname === 'localhost' ||
            hostname.endsWith('.localhost') ||
            /^\d+\.\d+\.\d+\.\d+$/.test(hostname)
        ) {
            // Vite dev proxy forwards /socket.io → localhost:3000
            return '';
        }
    }

    // Production: connect directly to the Render backend
    return 'https://hms-h939.onrender.com';
};

// ─── Singleton Socket Instance ────────────────────────────────────────────────
// ES module caching guarantees this is created ONCE across the entire app.
// All components import the SAME socket object — no duplicate connections.
const socket = io(getSocketURL(), {
    autoConnect:             false,              // Connect manually after login
    transports:              ['websocket', 'polling'], // polling fallback for Render cold starts
    withCredentials:         true,
    auth:                    { token: localStorage.getItem('token') || '' },

    // Production-grade reconnection with exponential back-off
    reconnection:            true,
    reconnectionAttempts:    10,
    reconnectionDelay:       1000,
    reconnectionDelayMax:    10000,
    timeout:                 20000,             // Generous timeout for Render cold starts
});

// ─── Dev-Mode Lifecycle Logging ───────────────────────────────────────────────
// Registered once at module load — never duplicated, never removed in production.
if (IS_DEV) {
    socket.on('connect', () => {
        console.log(
            '%c[Socket.IO] ✅ Connected',
            'color:#22c55e;font-weight:bold',
            '| id:', socket.id,
            '| url:', socket.io.uri || getSocketURL(),
        );
    });
    socket.on('disconnect', (reason) => {
        console.warn(
            '%c[Socket.IO] ❌ Disconnected',
            'color:#f97316;font-weight:bold',
            '| reason:', reason,
        );
    });
    socket.on('connect_error', (err) => {
        console.error(
            '%c[Socket.IO] 🔴 Connection error',
            'color:#ef4444;font-weight:bold',
            '|', err.message,
        );
    });
    socket.on('reconnect_attempt', (n) => {
        console.log(`%c[Socket.IO] 🔄 Reconnect attempt #${n}`, 'color:#a78bfa');
    });
    socket.on('reconnect', (n) => {
        console.log(
            `%c[Socket.IO] ✅ Reconnected after ${n} attempt(s)`,
            'color:#22c55e;font-weight:bold',
        );
    });
    socket.on('reconnect_failed', () => {
        console.error(
            '%c[Socket.IO] 💀 Reconnection failed — max attempts reached',
            'color:#ef4444;font-weight:bold',
        );
    });
}

export default socket;
