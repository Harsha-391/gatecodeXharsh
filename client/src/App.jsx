import React, { useEffect } from 'react'
import MainRoutes from './routes/Mainroutes'
import Lenis from 'lenis'
import './App.css'
import socket from './utils/socket'
import { useAuth, useAppDispatch } from './store/hooks'
import { useBranding } from './context/BrandingContext'
import { updateUser } from './store/slices/authSlice'
import { authAPI } from './utils/api'

const App = () => {
  const { user, isAuthenticated } = useAuth();
  const dispatch = useAppDispatch();
  const { loadBranding, resetBranding } = useBranding();

  // Refresh user profile/permissions on mount/load if authenticated
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      const fetchProfile = async () => {
        try {
          const res = await authAPI.getProfile();
          if (res.success && res.user) {
            dispatch(updateUser(res.user));
          }
        } catch (err) {
          console.error('Failed to sync profile permissions on mount:', err);
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

  // Socket Connection Management
  useEffect(() => {
    if (isAuthenticated && user) {
      const roleStr = typeof user.role === 'string'
        ? user.role.toLowerCase()
        : user._roleData?.name?.toLowerCase();

      const joinRooms = () => {
        const uId = user._id || user.id;
        if (uId) socket.emit('join', uId);

        const roomsToJoin = [];
        if (roleStr) {
          roomsToJoin.push(roleStr);

          // Role aliases mapping
          if (['reception', 'receptionist', 'receptiondeskmanager'].includes(roleStr)) {
            roomsToJoin.push('reception', 'receptionist', 'receptiondeskmanager');
          } else if (['pharmacy', 'pharmacist'].includes(roleStr)) {
            roomsToJoin.push('pharmacy', 'pharmacist');
          } else if (['lab', 'laboratory', 'labtechnician'].includes(roleStr)) {
            roomsToJoin.push('lab', 'laboratory', 'labtechnician');
          }
        }

        // Emit joins for global rooms
        const uniqueRooms = [...new Set(roomsToJoin)];
        uniqueRooms.forEach(room => socket.emit('join', room));

        // Join hospital-scoped rooms for multi-tenancy isolation
        if (user.hospitalId) {
          socket.emit('join', `hospital_${user.hospitalId}`);
          uniqueRooms.forEach(room => {
            socket.emit('join', `hospital_${user.hospitalId}_${room}`);
          });
        }
      };

      // Register listener so that we re-join on reconnect
      socket.on('connect', joinRooms);

      // Connect if disconnected
      if (!socket.connected) {
        socket.connect();
      } else {
        // Already connected, join immediately
        joinRooms();
      }

      socket.on('new_notification', (notification) => {
        dispatch({ type: 'notifications/addNotification', payload: notification });
      });

      return () => {
        socket.off('connect', joinRooms);
        socket.off('new_notification');
        socket.disconnect();
      };
    } else {
      socket.disconnect();
    }
  }, [isAuthenticated, user, dispatch]);

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
    </div>
  )
}

export default App