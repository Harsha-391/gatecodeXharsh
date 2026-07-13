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

    if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL;

    // Production: connect directly to the Render backend
    return 'https://gatecodexharsh-1.onrender.com';
};

// ─── Singleton Socket Instance ────────────────────────────────────────────────
// ES module caching guarantees this is created ONCE across the entire app.
// All components import the SAME socket object — no duplicate connections.
const socket = io(getSocketURL(), {
    autoConnect:             false,              // Connect manually after login
    transports:              IS_DEV ? ['polling'] : ['websocket', 'polling'],
    withCredentials:         false,

    // Production-grade reconnection with exponential back-off
    reconnection:            true,
    reconnectionAttempts:    10,
    reconnectionDelay:       1000,
    reconnectionDelayMax:    10000,
    timeout:                 20000,             // Generous timeout for Render cold starts
});

// Dynamically resolve auth token from localStorage on every connection/reconnection handshake
Object.defineProperty(socket, 'auth', {
    get: () => ({
        token: localStorage.getItem('accessToken')
    }),
    configurable: true
});

// ─── Dev-Mode Lifecycle Logging ───────────────────────────────────────────────
// Registered once at module load — never duplicated, never removed in production.
if (IS_DEV) {
    socket.on('connect', () => {
        window.__authLogger?.('Socket.IO connected successfully', { socketId: socket.id });
        console.log(
            '%c[Socket.IO] ✅ Connected',
            'color:#22c55e;font-weight:bold',
            '| id:', socket.id,
            '| url:', socket.io.uri || getSocketURL(),
        );
    });
    socket.on('disconnect', (reason) => {
        window.__authLogger?.('Socket.IO disconnected', { reason });
        console.warn(
            '%c[Socket.IO] ❌ Disconnected',
            'color:#f97316;font-weight:bold',
            '| reason:', reason,
        );
    });
    socket.on('connect_error', (err) => {
        window.__authLogger?.('Socket.IO connection error caught', { message: err.message });
        console.error(
            '%c[Socket.IO] 🔴 Connection error',
            'color:#ef4444;font-weight:bold',
            '|', err.message,
        );
    });
    socket.on('reconnect_attempt', (n) => {
        window.__authLogger?.(`Socket.IO reconnection attempt #${n}`);
        console.log(`%c[Socket.IO] 🔄 Reconnect attempt #${n}`, 'color:#a78bfa');
    });
    socket.on('reconnect', (n) => {
        window.__authLogger?.(`Socket.IO reconnected after ${n} attempts`);
        console.log(
            `%c[Socket.IO] ✅ Reconnected after ${n} attempt(s)`,
            'color:#22c55e;font-weight:bold',
        );
    });
    socket.on('reconnect_failed', () => {
        window.__authLogger?.('Socket.IO reconnection failed');
        console.error(
            '%c[Socket.IO] 💀 Reconnection failed — max attempts reached',
            'color:#ef4444;font-weight:bold',
        );
    });
}

export default socket;
