import React, { createContext, useContext, useState, useEffect } from 'react';
import { loginUserApi, checkBackendHealth } from '../services/api';
import { loadSavedServerUrl, saveServerUrl, getResolvedApiUrl } from '../config/env';

const AuthContext = createContext(null);

/**
 * Normalizes backend role representation into dedicated mobile panels:
 * - 'admin'
 * - 'doctor'
 * - 'lab'
 * - 'pharmacy'
 * - 'patient'
 * - 'staff' (Reception / Front desk)
 */
export function normalizeRole(role, user = {}) {
  if (!role && user.patientId) return 'patient';
  
  const dashboardPath = String(user.dashboardPath || '').toLowerCase();
  const roleStr = String(role || '').toLowerCase();
  const permissions = user.permissions || user._roleData?.permissions || [];
  const email = String(user.email || '').toLowerCase();

  // 1. Check dashboardPath (highest accuracy from backend user model)
  if (dashboardPath.includes('/lab')) return 'lab';
  if (dashboardPath.includes('/pharmacy')) return 'pharmacy';
  if (dashboardPath.includes('/doctor')) return 'doctor';
  if (dashboardPath.includes('/reception') || dashboardPath.includes('/staff')) return 'staff';
  if (dashboardPath.includes('/admin') || dashboardPath.includes('/superadmin') || dashboardPath.includes('/hospitaladmin')) return 'admin';
  if (dashboardPath.includes('/dashboard') && user.patientId) return 'patient';

  // 2. Admin roles
  if (
    roleStr.includes('admin') ||
    roleStr === 'superadmin' ||
    roleStr === 'centraladmin' ||
    roleStr === 'hospitaladmin' ||
    roleStr === 'clinicadmin'
  ) {
    return 'admin';
  }

  // 3. Doctor roles
  if (roleStr.includes('doctor') || user.departments?.includes('Doctor')) {
    return 'doctor';
  }

  // 4. Lab roles (e.g. "Lab Technician", "lab")
  if (
    roleStr.includes('lab') ||
    permissions.includes('lab_manage') ||
    permissions.includes('lab_view')
  ) {
    return 'lab';
  }

  // 5. Pharmacy roles (e.g. "Pharmacist", "pharmacy")
  if (
    roleStr.includes('pharma') ||
    permissions.includes('pharmacy_manage') ||
    permissions.includes('pharmacy_view')
  ) {
    return 'pharmacy';
  }

  // 6. Patient roles
  if (roleStr.includes('patient') || user.patientId) {
    return 'patient';
  }

  // 7. Front desk / Receptionist / Operational roles
  if (
    roleStr.includes('reception') ||
    roleStr.includes('staff') ||
    roleStr.includes('front') ||
    roleStr.includes('bill') ||
    roleStr.includes('account')
  ) {
    return 'staff';
  }

  // 8. Email heuristics fallback
  if (email.includes('lab')) return 'lab';
  if (email.includes('pharma')) return 'pharmacy';
  if (email.includes('doctor') || email === 'rajesh@crm.com' || email === 'pradeep@crm.com') return 'doctor';
  if (email.includes('admin')) return 'admin';
  if (email.includes('patient')) return 'patient';
  if (email.includes('reception') || email.includes('staff')) return 'staff';

  return 'staff';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [serverUrl, setServerUrl] = useState(getResolvedApiUrl());

  useEffect(() => {
    loadSavedServerUrl().then(url => {
      if (url) setServerUrl(url);
    });
  }, []);

  const updateServerUrl = async (newUrl) => {
    const saved = await saveServerUrl(newUrl);
    setServerUrl(saved);
    return saved;
  };

  // Derive activeRole dynamically from user to prevent state desync
  const activeRole = user ? normalizeRole(user.role, user) : null;

  const login = async (email, password, customBaseUrl = null) => {
    setLoading(true);
    setAuthError(null);

    const targetUrl = customBaseUrl || serverUrl;
    const result = await loginUserApi(email, password, targetUrl);

    if (result.success) {
      const normalized = normalizeRole(result.user?.role, result.user);
      setUser(result.user);
      setToken(result.token);
      setLoading(false);
      return { success: true, role: normalized };
    } else {
      setAuthError(result.message);
      setLoading(false);
      return { success: false, message: result.message };
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setAuthError(null);
  };

  const updateUser = (updatedFields) => {
    if (!updatedFields) return;
    setUser(prev => {
      if (!prev) return updatedFields;
      return { ...prev, ...updatedFields };
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        activeRole,
        isAuthenticated: !!user,
        loading,
        authError,
        serverUrl,
        updateServerUrl,
        login,
        logout,
        updateUser,
        clearError: () => setAuthError(null)
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
