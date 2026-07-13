import React, { useEffect } from 'react'
import MainRoutes from './routes/Mainroutes'
import Lenis from 'lenis'
import './App.css'
import socket from './utils/socket'
import { useAuth, useAppDispatch } from './store/hooks'
import { useBranding } from './context/BrandingContext'
import { updateUser, logout } from './store/slices/authSlice'
import IdleWarningModal from './components/IdleWarningModal'
import { useStore } from 'react-redux'
import { startSessionMonitoring, stopSessionMonitoring } from './utils/sessionManager'
import { subscribeToAuthSync } from './utils/authSync'

const App = () => {
  const { user, isAuthenticated } = useAuth();
  const dispatch = useAppDispatch();
  const store = useStore();
  const { loadBranding, resetBranding } = useBranding();

  // Sync state with storage to prevent Back-Forward Cache (BF Cache) mismatch
  useEffect(() => {
    const hasUser = !!localStorage.getItem('user');
    if (isAuthenticated && !hasUser) {
      dispatch(logout());
    }
  }, [isAuthenticated, dispatch]);




  // ── Multi-tab synchronization via BroadcastChannel + localStorage fallback ─────
  useEffect(() => {
    const handleSync = (msg) => {
      if (!msg || !msg.type) return;
      window.__authLogger?.(`subscribeToAuthSync Message Received: ${msg.type}`, { msg });
      switch (msg.type) {
        case 'LOGOUT':
        case 'FORCED_LOGOUT':
        case 'PASSWORD_CHANGED':
        case 'SESSION_REVOKED':
          // Another tab logged out — clear this tab too
          window.__authLogger?.(`dispatch(logout()) forced from sync event: ${msg.type}`);
          dispatch(logout());
          break;
        case 'LOGIN':
          // Another tab logged in — sync if this tab isn't already authenticated
          if (!store.getState().auth.isAuthenticated) {
            try {
              const freshUser = msg.payload?.user;
              if (freshUser) {
                localStorage.setItem('user', JSON.stringify(freshUser));
                dispatch(updateUser(freshUser));
              }
            } catch (_) {}
          }
          break;
        default:
          break;
      }
    };

    // Use unified synchronization handler (only fires on manual/administrative actions)
    const unsubscribe = subscribeToAuthSync(handleSync);
    return () => unsubscribe();
  }, [dispatch, store]);

  // ── Auto-load hospital branding when user logs in ───────────────────────────
  useEffect(() => {
    if (isAuthenticated && user) {
      const hospitalId = user.hospitalId;
      const role = (user.role || '').toLowerCase();
      if (hospitalId && !['centraladmin', 'superadmin'].includes(role)) {
        loadBranding(hospitalId);
      }
    } else {
      resetBranding();
    }
  }, [isAuthenticated, user]);

  const userId = user?._id || user?.id;
  const userRole = user?.role;
  const hospitalId = user?.hospitalId;

  // ── Session monitoring — start on login, stop on logout ─────────────────────
  useEffect(() => {
    if (isAuthenticated && userId) {
      startSessionMonitoring(store);
    } else {
      stopSessionMonitoring();
    }
  }, [isAuthenticated, userId]);

  // ── Socket Connection Management ────────────────────────────────────────────
  useEffect(() => {
    if (isAuthenticated && userId) {
      const roleStr = typeof userRole === 'string'
        ? userRole.toLowerCase()
        : '';

      const joinRooms = () => {
        socket.emit('join', userId);

        const roomsToJoin = [];
        if (roleStr) {
          const isAdminRole = ['admin', 'hospitaladmin', 'clinicadmin', 'superadmin', 'centraladmin', 'administrator'].includes(roleStr);
          if (!isAdminRole) {
            roomsToJoin.push(roleStr);
          }
          if (['reception', 'receptionist', 'receptiondeskmanager'].includes(roleStr)) {
            roomsToJoin.push('reception', 'receptionist', 'receptiondeskmanager');
          } else if (['pharmacy', 'pharmacist'].includes(roleStr)) {
            roomsToJoin.push('pharmacy', 'pharmacist');
          } else if (['lab', 'laboratory', 'labtechnician'].includes(roleStr)) {
            roomsToJoin.push('lab', 'laboratory', 'labtechnician');
          }
        }

        const uniqueRooms = [...new Set(roomsToJoin)];
        uniqueRooms.forEach(room => socket.emit('join', room));

        if (hospitalId) {
          socket.emit('join', `hospital_${hospitalId}`);
          uniqueRooms.forEach(room => socket.emit('join', `hospital_${hospitalId}_${room}`));
        }
      };

      const handleNewNotification = (notification) => {
        dispatch({ type: 'notifications/addNotification', payload: notification });
      };

      const handleConnectError = (err) => {
        if (err.message && err.message.toLowerCase().includes('authentication')) {
          socket.disconnect();
        }
      };

      socket.on('connect', joinRooms);
      socket.on('new_notification', handleNewNotification);
      socket.on('connect_error', handleConnectError);

      if (!socket.connected) {
        socket.connect();
      } else {
        joinRooms();
      }

      return () => {
        socket.off('connect', joinRooms);
        socket.off('new_notification', handleNewNotification);
        socket.off('connect_error', handleConnectError);
        socket.disconnect();
      };
    } else {
      socket.disconnect();
    }
  }, [isAuthenticated, userId, userRole, hospitalId, dispatch]);

  // ── Smooth scrolling ────────────────────────────────────────────────────────
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      direction: 'vertical',
      smooth: true,
    });

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);
    return () => { lenis.destroy(); };
  }, []);

  // ── Restore wheel scrolling inside scrollable containers ───────────────────
  useEffect(() => {
    const handleGlobalWheel = (e) => {
      let el = e.target;
      while (el && el !== document.body && el !== document.documentElement) {
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        const overflowX = style.overflowX;

        const isScrollableY = (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
        const isScrollableX = (overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth;

        if (isScrollableY || isScrollableX) {
          e.stopPropagation();
          if (isScrollableX && !isScrollableY && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            el.scrollLeft += e.deltaY;
            e.preventDefault();
          }
          return;
        }
        el = el.parentElement;
      }
    };

    document.addEventListener('wheel', handleGlobalWheel, { passive: false });
    return () => {
      document.removeEventListener('wheel', handleGlobalWheel);
    };
  }, []);


  return (
    <div style={{ width: '100%', maxWidth: '100vw', overflowX: 'hidden' }}>
      <MainRoutes />
      {/* Non-blocking idle session notice (informational only — no auto-logout) */}
      <IdleWarningModal />
    </div>
  )
}

// ── Best-effort audit log for session restoration events ─────────────────────
async function _logRestoreAudit(action, extra = {}) {
  try {
    const userStr = localStorage.getItem('user');
    if (!userStr) return;

    const apiBase = (() => {
      if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) return import.meta.env.VITE_API_URL;
      const h = window.location.hostname;
      if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost')) return '';
      return 'https://gatecodexharsh-1.onrender.com';
    })();

    await fetch(`${apiBase}/api/auth/log-session-event`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Domain': window.location.hostname,
      },
      body: JSON.stringify({
        action,
        reason: extra.failureCause || extra.reason || '',
        meta: { durationMs: extra.durationMs },
      }),
    });
  } catch (_) { /* best-effort */ }
}

export default App