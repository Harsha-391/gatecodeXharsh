import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/hooks';

const ProtectedRoute = ({ children, requiredPermissions = [], allowedRoles = [] }) => {
  const { user, isAuthenticated, isRestoring } = useAuth();
  const location = useLocation();

  // Print guard evaluation trace log
  window.__authLogger?.('ProtectedRoute evaluated', { 
    route: location.pathname, 
    isAuthenticated, 
    isRestoring, 
    requiredPermissions, 
    allowedRoles, 
    role: user?.role, 
    permissions: user?.effectivePermissions || user?.permissions 
  });

  // NEVER decide navigation or redirect while session restoration is still in progress
  if (isRestoring) {
    console.debug(`[ProtectedRoute] Suppressing routing decision while session restoration is in progress. Route: ${location.pathname}`);
    return null;
  }

  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    window.__authLogger?.('ProtectedRoute redirecting unauthenticated user to /login', { route: location.pathname });
    return <Navigate to="/login" replace />;
  }

  // If user is authenticated, check permissions
  if (isAuthenticated && user) {
    // Use effectivePermissions (role + customPermissions merged) for the most accurate check
    const userPermissions = user.effectivePermissions || user.permissions || [];
    let userRole = (user.role || '').toLowerCase();
    if (userRole === 'clinicadmin') {
      userRole = 'hospitaladmin';
    }

    // Admin-level roles — always allowed for admin routes
    if (userPermissions.includes('*') || userRole === 'superadmin' || userRole === 'centraladmin' || userRole === 'hospitaladmin' || userRole === 'admin') {
      return children;
    }

    const hasRequiredPermission = requiredPermissions.length === 0 ||
      requiredPermissions.some(perm => userPermissions.includes(perm));
    const hasAllowedRole = allowedRoles.length === 0 ||
      allowedRoles.includes(userRole.toLowerCase());

    // Allow if EITHER the role OR permission check passes (when both are specified, OR logic)
    // When only one is specified, that check must pass
    if (requiredPermissions.length > 0 && allowedRoles.length > 0) {
      if (!hasRequiredPermission && !hasAllowedRole) {
        const dashboardPath = user.dashboardPath || '/my-dashboard';
        window.__authLogger?.('ProtectedRoute redirecting due to lack of role/permission', { dashboardPath, route: location.pathname });
        return <Navigate to={dashboardPath} replace />;
      }
    } else if (!hasRequiredPermission || !hasAllowedRole) {
      const dashboardPath = user.dashboardPath || '/my-dashboard';
      window.__authLogger?.('ProtectedRoute redirecting due to lack of role/permission', { dashboardPath, route: location.pathname });
      return <Navigate to={dashboardPath} replace />;
    }
  }

  return children;
};

export default ProtectedRoute;
