import React, { useEffect } from 'react'
import MainRoutes from './routes/Mainroutes'
import Lenis from 'lenis'
import './App.css'
import socket from './utils/socket'
import { useAuth, useAppDispatch } from './store/hooks'
import { useBranding } from './context/BrandingContext'
import { updateUser, logout } from './store/slices/authSlice'
import { authAPI } from './utils/api'
import { startSessionMonitoring, stopSessionMonitoring } from './utils/sessionManager'
import IdleWarningModal from './components/IdleWarningModal'
import MaxSessionModal from './components/MaxSessionModal'
import { useStore } from 'react-redux'

const App = () => {
  const { user, isAuthenticated } = useAuth();
  const dispatch = useAppDispatch();
  const store = useStore();
  const { loadBranding, resetBranding } = useBranding();

  // Refresh user profile/permissions on mount/load if authenticated
  useEffect(() => {
    const cachedUser = localStorage.getItem('user');
    if (cachedUser) {
      const fetchProfile = async () => {
        try {
          const res = await authAPI.getProfile();
          if (res.success && res.user) {
            dispatch(updateUser(res.user));
          } else {
            dispatch(logout());
          }
        } catch (err) {
          console.error('Failed to sync profile permissions on mount:', err);
          if (err.response?.status === 401 || err.message?.includes('401') || err.response?.data?.message?.includes('unauthorized')) {
            dispatch(logout());
          }
        }
      };
      fetchProfile();
    }
  }, [dispatch]);

  // Auto-load hospital branding when user logs in
  useEffect(() => {
    if (isAuthenticated && user) {
      const hospitalId = user.hospitalId;
      const role = (user.role || '').toLowerCase();
      // Apply branding only for hospital-scoped users (not central admins)
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

  // Session monitoring — start on login, stop on logout
  useEffect(() => {
    if (isAuthenticated && userId) {
      const sessionStart = user?.sessionStart || null;
      startSessionMonitoring(store, sessionStart);
    } else {
      stopSessionMonitoring();
    }
  }, [isAuthenticated, userId]);

  // Socket Connection Management
  useEffect(() => {
    if (isAuthenticated && userId) {
      const roleStr = typeof userRole === 'string'
        ? userRole.toLowerCase()
        : '';

      // ── Room join helper (called on connect and on every reconnect) ──────────
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

      // ── Named notification handler — prevents duplicate listeners ────────────
      const handleNewNotification = (notification) => {
        dispatch({ type: 'notifications/addNotification', payload: notification });
      };

      // ── Auth-error handler — handles token expiration gracefully ─────────────
      const handleConnectError = (err) => {
        if (err.message && err.message.toLowerCase().includes('authentication')) {
          // Token is expired or invalid — disconnect cleanly.
          // The user will be redirected to login by the api.js 401 interceptor.
          socket.disconnect();
        }
      };

      // Socket auth token is handled automatically via cookie headers

      // Register listeners (each is a stable named reference so off() is precise)
      socket.on('connect', joinRooms);
      socket.on('new_notification', handleNewNotification);
      socket.on('connect_error', handleConnectError);

      // Connect (or re-join rooms if already connected)
      if (!socket.connected) {
        socket.connect();
      } else {
        joinRooms();
      }

      // ── Cleanup — remove only OUR listeners, don't touch others ─────────────
      return () => {
        socket.off('connect', joinRooms);
        socket.off('new_notification', handleNewNotification);
        socket.off('connect_error', handleConnectError);
        socket.disconnect();
      };
    } else {
      // Logged out — disconnect socket
      socket.disconnect();
    }
  }, [isAuthenticated, userId, userRole, hospitalId, dispatch]);

  // Smooth scrolling
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

  // Restore mouse wheel scrolling inside scrollable containers and forms
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
          // Prevent Lenis from swallowing/intercepting this wheel event
          e.stopPropagation();
          
          // Translate vertical scrolling to horizontal scrolling for horizontal-only scrollbars
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
      <IdleWarningModal />
      <MaxSessionModal />
    </div>
  )
}

export default App