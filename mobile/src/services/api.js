// mobile/src/services/api.js
import { getResolvedApiUrl } from '../config/env.js';

/**
 * Robust fetch wrapper with timeout
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-client-type': 'mobile',
        'Bypass-Tunnel-Reminder': 'true',
        ...(options.headers || {})
      }
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

/**
 * Health Check Service
 * Pings the Node backend health endpoints to verify connectivity and DB status.
 */
export async function checkBackendHealth(customBaseUrl = null) {
  const baseUrl = customBaseUrl ? customBaseUrl.replace(/\/$/, '') : getResolvedApiUrl();
  const start = Date.now();
  const candidateUrls = [
    `${baseUrl}/api/health`,
    `${baseUrl}/health`
  ];

  let lastError = null;

  for (const url of candidateUrls) {
    try {
      const res = await fetchWithTimeout(url, { method: 'GET' }, 5000);
      const latencyMs = Date.now() - start;

      if (res.ok) {
        const data = await res.json();
        return {
          success: true,
          endpoint: url,
          latencyMs,
          status: data.status || 'UP',
          database: data.database?.status || 'CONNECTED',
          uptime: data.uptime || 0,
          environment: data.environment || 'production'
        };
      }
    } catch (err) {
      lastError = err;
    }
  }

  return {
    success: false,
    endpoint: baseUrl,
    latencyMs: Date.now() - start,
    status: 'DOWN',
    database: 'UNKNOWN',
    error: lastError ? (lastError.name === 'AbortError' ? 'Connection timed out (5s)' : lastError.message) : 'Connection failed'
  };
}

/**
 * Real Login API Call
 * Authenticates credentials against the Node backend.
 */
export async function loginUserApi(email, password, customBaseUrl = null) {
  const baseUrl = customBaseUrl ? customBaseUrl.replace(/\/$/, '') : getResolvedApiUrl();
  const normalizedEmail = email.trim().toLowerCase();
  const payload = JSON.stringify({ email: normalizedEmail, password });

  // 1. Try standard /api/auth/login first (handles doctor, patient, reception, staff)
  try {
    const res = await fetchWithTimeout(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      body: payload
    });

    const data = await res.json();

    if (res.ok && data.success) {
      return {
        success: true,
        token: data.token,
        user: data.user
      };
    }

    // 2. If rejected or account is superadmin/centraladmin, try dedicated /api/admin/login
    if (res.status === 401 || res.status === 403) {
      try {
        const adminRes = await fetchWithTimeout(`${baseUrl}/api/admin/login`, {
          method: 'POST',
          body: payload
        });
        const adminData = await adminRes.json();
        if (adminRes.ok && adminData.success) {
          return {
            success: true,
            token: adminData.token,
            user: adminData.user
          };
        }
      } catch (_) {}
    }

    return {
      success: false,
      message: data.message || 'Invalid email or password'
    };
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    return {
      success: false,
      isNetworkError: true,
      message: isTimeout
        ? `Connection to ${baseUrl} timed out. Please check your network or server URL.`
        : `Unable to connect to hospital system at ${baseUrl}. If on mobile data, connect to Wi-Fi or update Server URL below.`
    };
  }
}

/**
 * Authenticated Request Helper
 */
async function authFetch(endpoint, token, options = {}) {
  const baseUrl = getResolvedApiUrl();
  const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  return fetchWithTimeout(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'x-client-type': 'mobile',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
}

/**
 * Admin Overview & KPIs
 * Aggregates statistics from users, roles, hospitals, and clinics.
 */
export async function fetchAdminOverview(token) {
  try {
    const [usersRes, rolesRes, hospRes, clinicsRes] = await Promise.allSettled([
      authFetch('/api/admin/users', token),
      authFetch('/api/admin/roles', token),
      authFetch('/api/hospitals', token),
      authFetch('/api/simple-clinics', token)
    ]);

    let totalUsers = 0;
    let totalDoctors = 0;
    let totalPatients = 0;
    let totalRoles = 0;
    let totalHospitals = 0;
    let totalClinics = 0;

    if (usersRes.status === 'fulfilled' && usersRes.value.ok) {
      const uData = await usersRes.value.json();
      if (uData.success && Array.isArray(uData.users)) {
        totalUsers = uData.users.length;
        totalDoctors = uData.users.filter(u => {
          const r = String(u.role || '').toLowerCase();
          return r.includes('doctor');
        }).length;
        totalPatients = uData.users.filter(u => {
          const r = String(u.role || '').toLowerCase();
          return r.includes('patient') || !!u.patientId;
        }).length;
      }
    }

    if (rolesRes.status === 'fulfilled' && rolesRes.value.ok) {
      const rData = await rolesRes.value.json();
      if (rData.success && Array.isArray(rData.data)) {
        totalRoles = rData.data.length;
      }
    }

    if (hospRes.status === 'fulfilled' && hospRes.value.ok) {
      const hData = await hospRes.value.json();
      if (hData.success && Array.isArray(hData.hospitals)) {
        totalHospitals = hData.hospitals.length;
      }
    }

    if (clinicsRes.status === 'fulfilled' && clinicsRes.value.ok) {
      const cData = await clinicsRes.value.json();
      if (cData.success && Array.isArray(cData.clinics)) {
        totalClinics = cData.clinics.length;
      }
    }

    return {
      success: true,
      stats: {
        totalUsers,
        totalDoctors,
        totalPatients,
        totalRoles,
        totalHospitals,
        totalClinics,
        totalUnits: totalHospitals + totalClinics
      }
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      stats: {
        totalUsers: 0,
        totalDoctors: 0,
        totalPatients: 0,
        totalRoles: 0,
        totalHospitals: 0,
        totalClinics: 0,
        totalUnits: 0
      }
    };
  }
}

/**
 * Fetch Hospitals & Clinics List
 */
export async function fetchHospitalsList(token) {
  try {
    const [hospRes, clinicRes] = await Promise.allSettled([
      authFetch('/api/hospitals', token),
      authFetch('/api/simple-clinics', token)
    ]);

    let combined = [];

    if (hospRes.status === 'fulfilled' && hospRes.value.ok) {
      const hData = await hospRes.value.json();
      if (hData.success && Array.isArray(hData.hospitals)) {
        combined.push(...hData.hospitals.map(h => ({ ...h, unitType: 'hospital' })));
      }
    }

    if (clinicRes.status === 'fulfilled' && clinicRes.value.ok) {
      const cData = await clinicRes.value.json();
      if (cData.success && Array.isArray(cData.clinics)) {
        combined.push(...cData.clinics.map(c => ({ ...c, unitType: 'clinic' })));
      }
    }

    return { success: true, units: combined };
  } catch (err) {
    return { success: false, units: [], message: err.message };
  }
}

/**
 * Register a New Hospital Unit
 */
export async function createHospitalUnit(hospitalData, token) {
  try {
    const res = await authFetch('/api/hospitals', token, {
      method: 'POST',
      body: JSON.stringify(hospitalData)
    });
    const data = await res.json();
    return { success: res.ok && data.success, data, message: data.message };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Fetch Staff & Users List
 */
export async function fetchStaffUsers(token) {
  try {
    const res = await authFetch('/api/admin/users', token);
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, users: data.users || [] };
    }
    return { success: false, users: [], message: data.message };
  } catch (err) {
    return { success: false, users: [], message: err.message };
  }
}

/**
 * Create New Staff User
 */
export async function createStaffUser(userData, token) {
  try {
    const res = await authFetch('/api/admin/users', token, {
      method: 'POST',
      body: JSON.stringify(userData)
    });
    const data = await res.json();
    return { success: res.ok && data.success, data, message: data.message };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Toggle User Active / Inactive Status
 */
export async function toggleUserActiveStatus(userId, isActive, token) {
  try {
    const res = await authFetch(`/api/admin/users/${userId}/status`, token, {
      method: 'PUT',
      body: JSON.stringify({ isActive })
    });
    const data = await res.json();
    return { success: res.ok && data.success, message: data.message };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Reset Staff Password
 */
export async function resetStaffPassword(userId, newPassword, token) {
  try {
    const res = await authFetch(`/api/admin/users/${userId}/reset-password`, token, {
      method: 'PUT',
      body: JSON.stringify({ password: newPassword })
    });
    const data = await res.json();
    return { success: res.ok && data.success, message: data.message };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Delete Staff User
 */
export async function deleteStaffUser(userId, token) {
  try {
    const res = await authFetch(`/api/admin/users/${userId}`, token, {
      method: 'DELETE'
    });
    const data = await res.json();
    return { success: res.ok && data.success, message: data.message };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Fetch Roles List
 */
export async function fetchRolesList(token) {
  try {
    const res = await authFetch('/api/admin/roles', token);
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, roles: data.data || [] };
    }
    return { success: false, roles: [], message: data.message };
  } catch (err) {
    return { success: false, roles: [], message: err.message };
  }
}

/**
 * Create Custom Role
 */
export async function createCustomRole(roleData, token) {
  try {
    const res = await authFetch('/api/admin/roles', token, {
      method: 'POST',
      body: JSON.stringify(roleData)
    });
    const data = await res.json();
    return { success: res.ok && data.success, data, message: data.message };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Fetch Audit Logs
 */
export async function fetchAuditLogs(token, queryParams = {}) {
  try {
    const params = new URLSearchParams(queryParams).toString();
    const endpoint = `/api/administrator/audit-logs${params ? `?${params}` : ''}`;
    const res = await authFetch(endpoint, token);
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, logs: data.logs || [], meta: data.meta || {} };
    }
    return { success: false, logs: [], message: data.message };
  } catch (err) {
    return { success: false, logs: [], message: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ── DOCTOR SERVICES ───────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════

export async function fetchDoctorAppointments(token, queryParams = { all: 'true' }) {
  try {
    const params = new URLSearchParams(queryParams).toString();
    const res = await authFetch(`/api/doctor/appointments${params ? `?${params}` : ''}`, token);
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, appointments: data.appointments || [] };
    }
    return { success: false, appointments: [], message: data.message };
  } catch (err) {
    return { success: false, appointments: [], message: err.message };
  }
}

export async function fetchDoctorAppointmentDetail(id, token) {
  try {
    const res = await authFetch(`/api/doctor/appointments/${id}`, token);
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, appointment: data.appointment, departments: data.departments || [] };
    }
    return { success: false, message: data.message };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

export async function updateDoctorPrescription(id, payload, token) {
  try {
    const res = await authFetch(`/api/doctor/appointments/${id}/prescription`, token, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    return { success: res.ok, data, message: data.message };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

export async function fetchDoctorPatients(token) {
  try {
    const res = await authFetch('/api/doctor/patients', token);
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, patients: data.patients || [] };
    }
    return { success: false, patients: [], message: data.message };
  } catch (err) {
    return { success: false, patients: [], message: err.message };
  }
}

export async function startDoctorSession(patientId, token) {
  try {
    const res = await authFetch('/api/doctor/session/start', token, {
      method: 'POST',
      body: JSON.stringify({ patientId })
    });
    const data = await res.json();
    return { success: res.ok && data.success, appointment: data.appointment, message: data.message };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ── LAB SERVICES ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════

export async function fetchLabStats(token, scope = 'mine') {
  try {
    const res = await authFetch(`/api/lab/stats?scope=${scope}`, token);
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, stats: data.stats || {}, canViewAll: data.canViewAll };
    }
    return { success: false, stats: {}, message: data.message };
  } catch (err) {
    return { success: false, stats: {}, message: err.message };
  }
}

export async function fetchLabRequests(token, queryParams = { scope: 'mine' }) {
  try {
    const params = new URLSearchParams(queryParams).toString();
    const res = await authFetch(`/api/lab/requests${params ? `?${params}` : ''}`, token);
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, requests: data.requests || [], canViewAll: data.canViewAll };
    }
    return { success: false, requests: [], message: data.message };
  } catch (err) {
    return { success: false, requests: [], message: err.message };
  }
}

export async function collectLabSample(id, sampleData, token) {
  try {
    const res = await authFetch(`/api/lab/${id}/collect-sample`, token, {
      method: 'POST',
      body: JSON.stringify(sampleData)
    });
    const data = await res.json();
    return { success: res.ok && data.success, report: data.report, message: data.message };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

export async function updateLabStatus(id, status, notes = '', token) {
  try {
    const res = await authFetch(`/api/lab/${id}/status`, token, {
      method: 'PATCH',
      body: JSON.stringify({ status, notes })
    });
    const data = await res.json();
    return { success: res.ok && data.success, report: data.report, message: data.message };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

export async function createManualLabTest(testData, token) {
  try {
    const res = await authFetch('/api/lab/create', token, {
      method: 'POST',
      body: JSON.stringify(testData)
    });
    const data = await res.json();
    return { success: res.ok && data.success, report: data.report, message: data.message };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

export async function cancelLabRequest(id, token) {
  try {
    const res = await authFetch(`/api/lab/${id}/cancel`, token, {
      method: 'PATCH'
    });
    const data = await res.json();
    return { success: res.ok && data.success, report: data.report, message: data.message };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ── PHARMACY SERVICES ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════

export async function fetchPharmacyOrders(token) {
  try {
    const res = await authFetch('/api/pharmacy-orders', token);
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, orders: data.orders || [] };
    }
    return { success: false, orders: [], message: data.message };
  } catch (err) {
    return { success: false, orders: [], message: err.message };
  }
}

export async function completePharmacyOrder(id, payload = {}, token) {
  try {
    const res = await authFetch(`/api/pharmacy-orders/${id}/complete`, token, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    return { success: res.ok && data.success, message: data.message };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

export async function fetchPharmacyInventory(token) {
  try {
    const res = await authFetch('/api/pharmacy/inventory', token);
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, inventory: data.data || [] };
    }
    return { success: false, inventory: [], message: data.message };
  } catch (err) {
    return { success: false, inventory: [], message: err.message };
  }
}

export async function addPharmacyMedicine(itemData, token) {
  try {
    const res = await authFetch('/api/pharmacy/inventory', token, {
      method: 'POST',
      body: JSON.stringify(itemData)
    });
    const data = await res.json();
    return { success: res.ok && data.success, data: data.data, message: data.message };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

export async function updatePharmacyInventoryItem(id, itemData, token) {
  try {
    const res = await authFetch(`/api/pharmacy/inventory/${id}`, token, {
      method: 'PUT',
      body: JSON.stringify(itemData)
    });
    const data = await res.json();
    return { success: res.ok && data.success, data: data.data, message: data.message };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ── RECEPTION / FRONT DESK SERVICES ───────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════

export async function fetchReceptionAppointments(token, queryParams = { all: 'true' }) {
  try {
    const params = new URLSearchParams(queryParams).toString();
    const res = await authFetch(`/api/reception/appointments${params ? `?${params}` : ''}`, token);
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, appointments: data.appointments || [] };
    }
    return { success: false, appointments: [], message: data.message };
  } catch (err) {
    return { success: false, appointments: [], message: err.message };
  }
}

export async function registerWalkInPatient(patientData, token) {
  try {
    const res = await authFetch('/api/reception/register', token, {
      method: 'POST',
      body: JSON.stringify(patientData)
    });
    const data = await res.json();
    return { success: res.ok && data.success, user: data.user, appointment: data.appointment, message: data.message };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

export async function searchPatientsReception(query, token) {
  try {
    const res = await authFetch(`/api/reception/search-patients?query=${encodeURIComponent(query)}`, token);
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, patients: data.patients || [] };
    }
    return { success: false, patients: [], message: data.message };
  } catch (err) {
    return { success: false, patients: [], message: err.message };
  }
}

export async function bookAppointmentReception(bookingData, token) {
  try {
    const res = await authFetch('/api/reception/book-appointment', token, {
      method: 'POST',
      body: JSON.stringify(bookingData)
    });
    const data = await res.json();
    return { success: res.ok && data.success, appointment: data.appointment, message: data.message };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

export async function checkInPatientReception(checkInData, token) {
  try {
    const res = await authFetch('/api/reception/check-in', token, {
      method: 'POST',
      body: JSON.stringify(checkInData)
    });
    const data = await res.json();
    return { success: res.ok && data.success, message: data.message };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

export async function rescheduleAppointmentReception(id, payload, token) {
  try {
    const res = await authFetch(`/api/reception/appointments/${id}/reschedule`, token, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    return { success: res.ok && data.success, message: data.message };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

export async function cancelAppointmentReception(id, token) {
  try {
    const res = await authFetch(`/api/reception/appointments/${id}/cancel`, token, {
      method: 'PATCH'
    });
    const data = await res.json();
    return { success: res.ok && data.success, message: data.message };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

export async function confirmPaymentReception(id, payload, token) {
  try {
    const res = await authFetch(`/api/reception/appointments/${id}/confirm-payment`, token, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    return { success: res.ok && data.success, appointment: data.appointment, message: data.message };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ── PATIENT SERVICES ──────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════

export async function fetchPatientAppointments(token) {
  try {
    const res = await authFetch('/api/appointment/my-appointments', token);
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, appointments: data.appointments || [] };
    }
    return { success: false, appointments: [], message: data.message };
  } catch (err) {
    return { success: false, appointments: [], message: err.message };
  }
}

export async function bookPatientAppointment(bookingData, token) {
  try {
    const res = await authFetch('/api/appointment/create', token, {
      method: 'POST',
      body: JSON.stringify(bookingData)
    });
    const data = await res.json();
    return { success: res.ok && data.success, appointment: data.appointment, message: data.message };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

export async function fetchPatientOrders(token) {
  try {
    const res = await authFetch('/api/pharmacy-orders/my-orders', token);
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, orders: data.orders || [] };
    }
    return { success: false, orders: [], message: data.message };
  } catch (err) {
    return { success: false, orders: [], message: err.message };
  }
}

export async function fetchDoctorsPublic(token = null) {
  try {
    const res = await authFetch('/api/doctor', token);
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, doctors: data.doctors || [] };
    }
    return { success: false, doctors: [], message: data.message };
  } catch (err) {
    return { success: false, doctors: [], message: err.message };
  }
}

/**
 * ── User Profile & Credentials APIs (1:1 Webapp /profile) ──
 */
export async function fetchUserProfileApi(token) {
  try {
    const res = await authFetch('/api/auth/me', token);
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, user: data.user };
    }
    return { success: false, message: data.message || 'Failed to fetch profile' };
  } catch (err) {
    return { success: false, message: err.message || 'Network error' };
  }
}

export async function updateUserProfileApi(token, profileData) {
  try {
    const res = await authFetch('/api/auth/profile', token, {
      method: 'PUT',
      body: JSON.stringify(profileData)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, user: data.user, message: data.message || 'Profile updated successfully' };
    }
    return { success: false, message: data.message || 'Failed to update profile' };
  } catch (err) {
    return { success: false, message: err.message || 'Network error' };
  }
}

export async function changeUserPasswordApi(token, currentPassword, newPassword) {
  try {
    const res = await authFetch('/api/auth/change-password', token, {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, message: data.message || 'Password changed successfully' };
    }
    return { success: false, message: data.message || 'Failed to change password' };
  } catch (err) {
    return { success: false, message: err.message || 'Network error' };
  }
}



