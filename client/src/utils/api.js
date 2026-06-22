import axios from 'axios';

// Base URL from Environment (Vercel / Local)
const baseURL = import.meta.env.VITE_API_URL || 'https://hms-h939.onrender.com';

const apiClient = axios.create({
    baseURL: baseURL,
    headers: { 'Content-Type': 'application/json' },
});

// Request Interceptor
apiClient.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) config.headers.Authorization = `Bearer ${token}`;
        return config;
    },
    (error) => Promise.reject(error)
);

// Response Interceptor
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // CIRCULAR DEPENDENCY FIX:
            // Instead of dispatching logout action here, we simply clear storage and redirect.
            // The authSlice will pick up the initial state from localStorage on reload.
            localStorage.removeItem('token');
            localStorage.removeItem('user');

            // Only redirect if not already on the login page to avoid loops
            if (!window.location.pathname.includes('/login')) {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export const authAPI = {
    login: async (email, password, hospitalId) => {
        const payload = { email, password };
        if (hospitalId) payload.hospitalId = hospitalId;
        const response = await apiClient.post('/api/auth/login', payload);
        return response.data;
    },
    signup: async (name, email, password, phone = '') => {
        const response = await apiClient.post('/api/auth/signup', { name, email, password, phone });
        return response.data;
    },
    getProfile: async () => {
        const response = await apiClient.get('/api/auth/me');
        return response.data;
    },
    updateProfile: async (profileData) => {
        const response = await apiClient.put('/api/auth/profile', profileData);
        return response.data;
    },
    changePassword: async (currentPassword, newPassword) => {
        const response = await apiClient.put('/api/auth/change-password', { currentPassword, newPassword });
        return response.data;
    },
    logout: async () => {
        const response = await apiClient.post('/api/auth/logout');
        return response.data;
    },
};

export const doctorAPI = {
    getAppointments: async (date, tomorrow, future, all) => {
        let dbAppointments = [];
        try {
            let url = '/api/doctor/appointments';
            const params = [];
            if (date) params.push(`date=${encodeURIComponent(date)}`);
            if (tomorrow) params.push(`tomorrow=true`);
            if (future) params.push(`future=true`);
            if (all) params.push(`all=true`);
            if (params.length > 0) url += `?${params.join('&')}`;
            const response = await apiClient.get(url);
            if (response.data && response.data.success) {
                dbAppointments = response.data.appointments || [];
            }
        } catch (e) {
            console.warn("Failed to fetch real appointments:", e);
        }
        return { success: true, appointments: dbAppointments };
    },
    getAllAppointments: async () => {
        let dbAppointments = [];
        try {
            const response = await apiClient.get('/api/doctor/all-appointments');
            if (response.data && response.data.success) {
                dbAppointments = response.data.appointments || [];
            }
        } catch (e) {
            console.warn("Failed to fetch all appointments:", e);
        }
        return { success: true, appointments: dbAppointments };
    },
    getAppointmentDetails: async (id) => {
        const response = await apiClient.get(`/api/doctor/appointments/${id}`);
        return response.data;
    },
    getPatients: async () => {
        let dbPatients = [];
        try {
            const response = await apiClient.get('/api/doctor/patients');
            if (response.data && response.data.success) {
                dbPatients = response.data.patients || [];
            }
        } catch (e) {
            console.warn("Failed to fetch patients:", e);
        }
        return { success: true, patients: dbPatients };
    },
    getPatientHistory: async (patientId) => {
        const response = await apiClient.get(`/api/doctor/patients/${patientId}/history`);
        return response.data;
    },
    getFullPatientProfile: async (patientId) => {
        const response = await apiClient.get(`/api/doctor/patients/${patientId}/full-profile`);
        return response.data;
    },
    getClinicPatientReports: async (clinicPatientId) => {
        return (await apiClient.get(`/api/doctor/clinic-patients/${clinicPatientId}/reports`)).data;
    },
    startSession: async (patientId) => {
        const response = await apiClient.post('/api/doctor/session/start', { patientId });
        return response.data;
    },
    updatePatientProfile: async (patientId, profileData) => {
        const response = await apiClient.put(`/api/doctor/patients/${patientId}/profile`, profileData);
        return response.data;
    },
    updateSession: async (id, data) => {
        const formData = new FormData();
        Object.keys(data).forEach(key => {
            if (typeof data[key] === 'object' && key !== 'prescriptionFile') {
                formData.append(key, JSON.stringify(data[key]));
            } else {
                formData.append(key, data[key]);
            }
        });
        const response = await apiClient.patch(`/api/doctor/appointments/${id}/prescription`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },
    recommendAdmission: async (id, notes, priority, requestedDepartment) => {
        const response = await apiClient.post(`/api/doctor/appointments/${id}/recommend-admission`, { notes, priority, requestedDepartment });
        return response.data;
    },
    cancelRecommendAdmission: async (id) => {
        const response = await apiClient.delete(`/api/doctor/appointments/${id}/recommend-admission`);
        return response.data;
    },
    getLabs: async () => {
        try {
            const response = await apiClient.get('/api/doctor/labs-list');
            if (response.data && response.data.success && response.data.labs && response.data.labs.length > 0) {
                return response.data;
            }
        } catch (e) {
            console.warn("api getLabs failed, using fallback", e);
        }
        return {
            success: true,
            labs: [
                { _id: 'lab1', name: 'Lipid Profile' },
                { _id: 'lab2', name: 'Treadmill Test (TMT)' },
                { _id: 'lab3', name: 'ECG (12-Lead)' },
                { _id: 'lab4', name: '24-Hour Holter Monitoring' },
                { _id: 'lab5', name: 'Thyroid Profile (T3, T4, TSH)' },
                { _id: 'lab6', name: 'Serum Creatinine' },
                { _id: 'lab7', name: 'Serum Potassium' },
                { _id: 'lab8', name: 'Blood Urea' },
                { _id: 'lab9', name: 'hs-CRP' },
                { _id: 'lab10', name: 'Lipid Profile (Extended)' },
                { _id: 'lab11', name: 'Lp(a) screening' },
                { _id: 'lab12', name: 'Echocardiography (2D Echo)' },
                { _id: 'lab13', name: 'Fasting Blood Sugar' }
            ]
        };
    },
    getMedicines: async () => {
        try {
            const response = await apiClient.get('/api/doctor/medicines-list');
            if (response.data && response.data.success && response.data.medicines && response.data.medicines.length > 0) {
                return response.data;
            }
        } catch (e) {
            console.warn("api getMedicines failed, using fallback", e);
        }
        return {
            success: true,
            medicines: [
                { _id: 'med1', name: 'Aspirin 75mg', saltName: 'Aspirin' },
                { _id: 'med2', name: 'Atorvastatin 20mg', saltName: 'Atorvastatin' },
                { _id: 'med3', name: 'Atorvastatin 40mg', saltName: 'Atorvastatin' },
                { _id: 'med4', name: 'Metoprolol Succinate 25mg', saltName: 'Metoprolol' },
                { _id: 'med5', name: 'Propranolol 10mg', saltName: 'Propranolol' },
                { _id: 'med6', name: 'Telmisartan 40mg', saltName: 'Telmisartan' },
                { _id: 'med7', name: 'Amlodipine 5mg', saltName: 'Amlodipine' },
                { _id: 'med8', name: 'Hydrochlorothiazide 12.5mg', saltName: 'Hydrochlorothiazide' },
                { _id: 'med9', name: 'Clopidogrel 75mg', saltName: 'Clopidogrel' },
                { _id: 'med10', name: 'Carvedilol 6.25mg', saltName: 'Carvedilol' },
                { _id: 'med11', name: 'Coenzyme Q10 100mg', saltName: 'Coenzyme Q10' },
                { _id: 'med12', name: 'Paracetamol 500mg', saltName: 'Paracetamol' },
                { _id: 'med13', name: 'Vitamin D3', saltName: 'Cholecalciferol' },
                { _id: 'med14', name: 'Amoxicillin 500mg', saltName: 'Amoxicillin' }
            ]
        };
    },
    getBookedSlots: async (doctorId, date) => {
        const response = await apiClient.get(`/api/doctor/${doctorId}/booked-slots?date=${date}`);
        return response.data;
    }
};

export const receptionAPI = {
    getAllAppointments: async (date, future, all, tomorrow, reportFollowUp) => {
        let url = '/api/reception/appointments';
        const params = [];
        if (date) params.push(`date=${encodeURIComponent(date)}`);
        if (future) params.push(`future=true`);
        if (all) params.push(`all=true`);
        if (tomorrow) params.push(`tomorrow=true`);
        if (reportFollowUp) params.push(`reportFollowUp=true`);
        if (params.length > 0) url += `?${params.join('&')}`;
        const response = await apiClient.get(url);
        return response.data;
    },
    registerPatient: async (data) => {
        const response = await apiClient.post('/api/reception/register', data);
        return response.data;
    },
    uploadPastReport: async (patientId, file, name) => {
        const formData = new FormData();
        formData.append('report', file);
        if (name) formData.append('name', name);
        const response = await apiClient.post(`/api/reception/patients/${patientId}/reports`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },
    deletePastReport: async (patientId, reportId) => {
        const response = await apiClient.delete(`/api/reception/patients/${patientId}/reports/${reportId}`);
        return response.data;
    },
    getTransactions: async () => {
        const response = await apiClient.get('/api/reception/transactions');
        return response.data;
    },
    searchPatients: async (query) => {
        const response = await apiClient.get(`/api/reception/search-patients?query=${query}`);
        return response.data;
    },
    updateIntake: async (userId, data) => {
        const response = await apiClient.put(`/api/reception/intake/${userId}`, data);
        return response.data;
    },
    bookAppointment: async (data) => {
        const response = await apiClient.post('/api/reception/book-appointment', data);
        return response.data;
    },
    getBookedSlots: async (doctorId, date, hospitalId = '') => {
        let url = `/api/doctor/${doctorId}/booked-slots?date=${date}`;
        if (hospitalId) url += `&hospitalId=${hospitalId}`;
        const response = await apiClient.get(url);
        return response.data;
    },
    rescheduleAppointment: async (id, date, time, doctorId) => {
        const response = await apiClient.patch(`/api/reception/appointments/${id}/reschedule`, { date, time, doctorId });
        return response.data;
    },
    cancelAppointment: async (id) => {
        const response = await apiClient.patch(`/api/reception/appointments/${id}/cancel`);
        return response.data;
    },
    confirmPayment: async (id, paymentMethod, amount) => {
        const response = await apiClient.patch(`/api/reception/appointments/${id}/confirm-payment`, { paymentMethod, amount });
        return response.data;
    },
    sendAadhaarOTP: async (aadhaarNumber) => {
        const response = await apiClient.post('/api/reception/send-aadhaar-otp', { aadhaarNumber });
        return response.data;
    },
    verifyAadhaarOTP: async (aadhaarNumber, otp) => {
        const response = await apiClient.post('/api/reception/verify-aadhaar-otp', { aadhaarNumber, otp });
        return response.data;
    },
    checkIn: async (data) => {
        const response = await apiClient.post('/api/reception/check-in', data);
        return response.data;
    }
};

export const adminAPI = {
    login: async (email, password) => (await apiClient.post('/api/admin/login', { email, password })).data,
    signup: async (name, email, password, phone) => (await apiClient.post('/api/admin/signup', { name, email, password, phone })).data,
    getUsers: async () => (await apiClient.get('/api/admin/users')).data,
    createUser: async (data) => (await apiClient.post('/api/admin/users', data)).data,
    deleteUser: async (id) => (await apiClient.delete(`/api/admin/users/${id}`)).data,
    updateUser: async (id, data) => (await apiClient.put(`/api/admin/users/${id}`, data)).data,
    toggleUserStatus: async (id, isActive) => (await apiClient.put(`/api/admin/users/${id}/status`, { isActive })).data,
    resetPassword: async (id, password) => (await apiClient.put(`/api/admin/users/${id}/reset-password`, { password })).data,
    getRoles: async () => (await apiClient.get('/api/admin/roles')).data,
    createRole: async (data) => (await apiClient.post('/api/admin/roles', data)).data,
    updateRole: async (id, data) => (await apiClient.put(`/api/admin/roles/${id}`, data)).data,
    deleteRole: async (id) => (await apiClient.delete(`/api/admin/roles/${id}`)).data,
    updateUserPermissions: async (id, customPermissions, deniedPermissions) => (await apiClient.put(`/api/admin/users/${id}/permissions`, { customPermissions, deniedPermissions })).data,
    getDashboardStats: async () => (await apiClient.get('/api/admin/dashboard-stats')).data,
};

export const administratorAPI = {
    getStats: async () => (await apiClient.get('/api/administrator/stats')).data,
    getPatientFlow: async () => (await apiClient.get('/api/administrator/patient-flow')).data,
    getStaff: async () => (await apiClient.get('/api/administrator/staff')).data,
    getDepartments: async () => (await apiClient.get('/api/administrator/departments')).data,
    getDepartmentReport: async (department, startDate, endDate) => {
        const params = new URLSearchParams();
        if (department) params.set('department', department);
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        return (await apiClient.get(`/api/administrator/departments/report?${params}`)).data;
    },
    getAdmissions: async () => (await apiClient.get('/api/administrator/admissions')).data,
    getBeds: async () => (await apiClient.get('/api/administrator/beds')).data,
    transferBed: async (data) => (await apiClient.post('/api/administrator/beds/transfer', data)).data,
    getBilling: async () => (await apiClient.get('/api/administrator/billing')).data,
    getRevenue: async () => (await apiClient.get('/api/administrator/revenue')).data,
    getResources: async () => (await apiClient.get('/api/administrator/resources')).data,
    getInventory: async () => (await apiClient.get('/api/administrator/inventory')).data,
    getReports: async (startDate = null, endDate = null) => {
        const params = new URLSearchParams();
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        const qs = params.toString();
        return (await apiClient.get(`/api/administrator/reports${qs ? `?${qs}` : ''}`)).data;
    },
    getAnalytics: async () => (await apiClient.get('/api/administrator/analytics')).data,
    getAuditLogs: async (params = {}) => (await apiClient.get('/api/administrator/audit-logs', { params })).data,
    getAuditLogSessionDuration: async (sessionId) => (await apiClient.get(`/api/administrator/audit-logs/session-duration/${sessionId}`)).data,
    getExpenses: async () => (await apiClient.get('/api/administrator/expenses')).data,
    createExpense: async (data) => (await apiClient.post('/api/administrator/expenses', data)).data,
    deleteExpense: async (id) => (await apiClient.delete(`/api/administrator/expenses/${id}`)).data,
    getExpenseCategories: async () => (await apiClient.get('/api/administrator/expenses/categories')).data,
    createExpenseCategory: async (data) => (await apiClient.post('/api/administrator/expenses/categories', data)).data,
    deleteExpenseCategory: async (id) => (await apiClient.delete(`/api/administrator/expenses/categories/${id}`)).data,
    getProfitLoss: async () => (await apiClient.get('/api/administrator/profit-loss')).data,
    getSystemHealth: async () => (await apiClient.get('/api/administrator/system-health')).data,
    getAdmissionsOversightDashboard: async (params = {}) => (await apiClient.get('/api/administrator/admissions/oversight/dashboard', { params })).data,
    getAdmissionsOversightAnalytics: async () => (await apiClient.get('/api/administrator/admissions/oversight/analytics')).data,
    getAdmissionsOversightOccupancy: async () => (await apiClient.get('/api/administrator/admissions/oversight/occupancy')).data,
    getAdmissionsOversightTransfers: async () => (await apiClient.get('/api/administrator/admissions/oversight/transfers')).data,
};

export const adminEntitiesAPI = {
    getDoctors: async () => (await apiClient.get('/api/admin-entities/doctors')).data,
    createDoctor: async (data) => (await apiClient.post('/api/admin-entities/doctors', data)).data,
    updateDoctor: async (id, data) => (await apiClient.put(`/api/admin-entities/doctors/${id}`, data)).data,
    deleteDoctor: async (id) => (await apiClient.delete(`/api/admin-entities/doctors/${id}`)).data,
    getLabs: async () => (await apiClient.get('/api/admin-entities/labs')).data,
    createLab: async (data) => (await apiClient.post('/api/admin-entities/labs', data)).data,
    deleteLab: async (id) => (await apiClient.delete(`/api/admin-entities/labs/${id}`)).data,
    getPharmacies: async () => (await apiClient.get('/api/admin-entities/pharmacies')).data,
    createPharmacy: async (data) => (await apiClient.post('/api/admin-entities/pharmacies', data)).data,
    deletePharmacy: async (id) => (await apiClient.delete(`/api/admin-entities/pharmacies/${id}`)).data,
    getReceptions: async () => (await apiClient.get('/api/admin-entities/receptions')).data,
    createReception: async (data) => (await apiClient.post('/api/admin-entities/receptions', data)).data,
    deleteReception: async (id) => (await apiClient.delete(`/api/admin-entities/receptions/${id}`)).data,
    getServices: async () => (await apiClient.get('/api/admin-entities/services')).data,
    createService: async (data) => (await apiClient.post('/api/admin-entities/services', data)).data,
    updateService: async (id, data) => (await apiClient.put(`/api/admin-entities/services/${id}`, data)).data,
    deleteService: async (id) => (await apiClient.delete(`/api/admin-entities/services/${id}`)).data,
};

export const publicAPI = {
    getServices: async () => (await apiClient.get('/api/public/services')).data,
    getDoctors: async (serviceId = null) => {
        const url = serviceId ? `/api/doctor?serviceId=${serviceId}` : '/api/doctor';
        return (await apiClient.get(url)).data;
    },
    getTenantConfig: async (domain) => {
        const url = `/api/public/tenant-config?domain=${encodeURIComponent(domain)}`;
        return (await apiClient.get(url)).data;
    }
};

export const uploadAPI = {
    uploadImages: async (formData) => {
        const response = await apiClient.post('/api/upload/images', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },
};

export const labAPI = {
    getStats: async () => (await apiClient.get('/api/lab/stats')).data,
    getMyReports: async () => (await apiClient.get('/api/lab/my-reports')).data,
    getRequests: async (status, search = '') => (await apiClient.get(`/api/lab/requests?status=${status || ''}&search=${encodeURIComponent(search)}`)).data,
    updatePayment: async (id, paymentData) => (await apiClient.patch(`/api/lab/update-payment/${id}`, paymentData)).data,
    uploadReport: async (id, formData) => (await apiClient.post(`/api/lab/upload-report/${id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    })).data,
    createReport: async (formData) => (await apiClient.post('/api/lab/create', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    })).data,
    cancelReport: async (id) => (await apiClient.patch(`/api/lab/${id}/cancel`)).data,
    collectSample: async (id, data) => (await apiClient.post(`/api/lab/${id}/collect-sample`, data)).data,
    updateStatus: async (id, statusData) => (await apiClient.patch(`/api/lab/${id}/status`, statusData)).data
};

export const pharmacyAPI = {
    getInventory: async () => (await apiClient.get('/api/pharmacy/inventory')).data,
    addMedicine: async (data) => (await apiClient.post('/api/pharmacy/inventory', data)).data,
    updateMedicine: async (id, data) => (await apiClient.put(`/api/pharmacy/inventory/${id}`, data)).data,
    deleteMedicine: async (id) => (await apiClient.delete(`/api/pharmacy/inventory/${id}`)).data
};

export const pharmacyOrderAPI = {
    getOrders: async () => (await apiClient.get('/api/pharmacy/orders')).data,
    completeOrder: async (id, purchasedIndices = null, itemQuantities = null) => (await apiClient.patch(`/api/pharmacy/orders/${id}/complete`, { purchasedIndices, itemQuantities })).data,
    cancelOrder: async (id) => (await apiClient.patch(`/api/pharmacy/orders/${id}/cancel`)).data,
    markPaid: async (id, purchasedIndices = null, itemQuantities = null) => (await apiClient.patch(`/api/pharmacy/orders/${id}/mark-paid`, { purchasedIndices, itemQuantities })).data
};

export const clinicalAPI = {
    intake: async (data) => (await apiClient.post('/api/clinical/intake', data)).data,
    getHistory: async (patientId) => (await apiClient.get(`/api/clinical/history/${patientId}`)).data,
    diagnose: async (visitId, data) => (await apiClient.post(`/api/clinical/diagnose/${visitId}`, data)).data
};

export const patientAPI = {
    search: async (term) => (await apiClient.get(`/api/patients/search?term=${term}`)).data,
    getFullHistory: async (id) => (await apiClient.get(`/api/patients/${id}/full-history`)).data
};

export const notificationAPI = {
    getNotifications: async () => {
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        let dbNotifications = [];
        try {
            const response = await apiClient.get('/api/notifications');
            if (response.data && response.data.success) {
                dbNotifications = response.data.data || response.data.notifications || [];
            }
        } catch (e) {
            console.warn("Failed to fetch real notifications:", e);
        }

        const isMockRequired = currentUser.email === 'rajesh@crm.com' || 
                               currentUser.role?.toLowerCase() === 'pharmacist' || 
                               currentUser.role?.toLowerCase() === 'lab technician' ||
                               currentUser.role?.toLowerCase() === 'pharmacy' || 
                               currentUser.role?.toLowerCase() === 'lab';

        if (isMockRequired) {
            const key = 'patient_notifications';
            const stored = localStorage.getItem(key);
            let notifs = stored ? JSON.parse(stored) : [];
            if (notifs.length === 0) {
                notifs = [
                    {
                        _id: 'notif_welcome',
                        message: 'Welcome to the Hospital Information System dashboard.',
                        status: 'Unread',
                        createdAt: new Date().toISOString(),
                        recipientRole: currentUser.role?.toLowerCase() || 'doctor'
                    }
                ];
                localStorage.setItem(key, JSON.stringify(notifs));
            }
            // Filter notifications based on recipientRole
            const role = currentUser.role?.toLowerCase() || 'doctor';
            const filteredMock = notifs.filter(n => {
                const r = n.recipientRole?.toLowerCase();
                if (role === 'pharmacist' || role === 'pharmacy') {
                    return r === 'pharmacy' || r === 'pharmacist';
                }
                if (role === 'lab technician' || role === 'lab') {
                    return r === 'lab' || r === 'lab technician';
                }
                return r === role || n.recipientId === currentUser.id;
            });
            const combined = [...dbNotifications];
            filteredMock.forEach(mockN => {
                if (!combined.some(n => n._id === mockN._id)) {
                    combined.push(mockN);
                }
            });
            return { success: true, data: combined };
        }
        return { success: true, data: dbNotifications };
    },
    markAsRead: async (id) => {
        if (String(id).startsWith('notif_')) {
            const key = 'patient_notifications';
            const stored = localStorage.getItem(key);
            let notifs = stored ? JSON.parse(stored) : [];
            const idx = notifs.findIndex(n => n._id === id);
            if (idx !== -1) {
                notifs[idx].status = 'Read';
                localStorage.setItem(key, JSON.stringify(notifs));
            }
            return { success: true, data: notifs.find(n => n._id === id) };
        }
        const response = await apiClient.patch(`/api/notifications/${id}/read`);
        return response.data;
    },
    markAllAsRead: async () => {
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        const isMockRequired = currentUser.email === 'rajesh@crm.com' || 
                               currentUser.role?.toLowerCase() === 'pharmacist' || 
                               currentUser.role?.toLowerCase() === 'lab technician' ||
                               currentUser.role?.toLowerCase() === 'pharmacy' || 
                               currentUser.role?.toLowerCase() === 'lab';
        if (isMockRequired) {
            const key = 'patient_notifications';
            const stored = localStorage.getItem(key);
            let notifs = stored ? JSON.parse(stored) : [];
            const role = currentUser.role?.toLowerCase() || 'doctor';
            notifs.forEach(n => {
                const r = n.recipientRole?.toLowerCase();
                const matches = (role === 'pharmacist' || role === 'pharmacy') 
                    ? (r === 'pharmacy' || r === 'pharmacist')
                    : (role === 'lab technician' || role === 'lab')
                    ? (r === 'lab' || r === 'lab technician')
                    : (r === role);
                if (matches) {
                    n.status = 'Read';
                }
            });
            localStorage.setItem(key, JSON.stringify(notifs));
        }
        try {
            const response = await apiClient.patch('/api/notifications/read-all');
            return response.data;
        } catch (e) {
            console.warn("Failed to mark all notifications as read on backend:", e);
            if (isMockRequired) {
                return { success: true };
            }
            throw e;
        }
    }
};

export const labTestAPI = {
    getLabTests: async (hospitalId = '') => {
        try {
            const url = hospitalId ? `/api/lab-tests?hospitalId=${hospitalId}` : '/api/lab-tests';
            const response = await apiClient.get(url);
            if (response.data && response.data.success && response.data.data && response.data.data.length > 0) {
                return response.data;
            }
        } catch (e) {
            console.warn("api getLabTests failed, using fallback", e);
        }
        return {
            success: true,
            data: [
                { _id: 'lab1', name: 'Lipid Profile', price: 500 },
                { _id: 'lab2', name: 'Treadmill Test (TMT)', price: 1500 },
                { _id: 'lab3', name: 'ECG (12-Lead)', price: 300 },
                { _id: 'lab4', name: '24-Hour Holter Monitoring', price: 2500 },
                { _id: 'lab5', name: 'Thyroid Profile (T3, T4, TSH)', price: 600 },
                { _id: 'lab6', name: 'Serum Creatinine', price: 200 },
                { _id: 'lab7', name: 'Serum Potassium', price: 200 },
                { _id: 'lab8', name: 'Blood Urea', price: 150 },
                { _id: 'lab9', name: 'hs-CRP', price: 800 },
                { _id: 'lab10', name: 'Lipid Profile (Extended)', price: 1000 },
                { _id: 'lab11', name: 'Lp(a) screening', price: 1200 },
                { _id: 'lab12', name: 'Echocardiography (2D Echo)', price: 2000 },
                { _id: 'lab13', name: 'Fasting Blood Sugar', price: 100 }
            ]
        };
    },
    createLabTest: async (data) => (await apiClient.post('/api/lab-tests', data)).data,
    updateLabTest: async (id, data) => (await apiClient.put(`/api/lab-tests/${id}`, data)).data,
    setHospitalPrice: async (id, hospitalId, price) => (await apiClient.put(`/api/lab-tests/${id}/hospital-price`, { hospitalId, price })).data,
    deleteLabTest: async (id) => (await apiClient.delete(`/api/lab-tests/${id}`)).data,
    seedDummyLabTests: async () => (await apiClient.post('/api/lab-tests/seed-dummy')).data
};

export const medicineAPI = {
    getMedicines: async () => (await apiClient.get('/api/medicines')).data,
    createMedicine: async (data) => (await apiClient.post('/api/medicines', data)).data,
    updateMedicine: async (id, data) => (await apiClient.put(`/api/medicines/${id}`, data)).data,
    deleteMedicine: async (id) => (await apiClient.delete(`/api/medicines/${id}`)).data
};

export const questionLibraryAPI = {
    getLibrary: async () => (await apiClient.get('/api/question-library')).data,
    updateLibrary: async (data) => (await apiClient.post('/api/question-library', { data })).data
};

export const testPackageAPI = {
    getPackages: async () => (await apiClient.get('/api/test-packages')).data,
    getPackage: async (id) => (await apiClient.get(`/api/test-packages/${id}`)).data,
    createPackage: async (data) => (await apiClient.post('/api/test-packages', data)).data,
    updatePackage: async (id, data) => (await apiClient.put(`/api/test-packages/${id}`, data)).data,
    deletePackage: async (id) => (await apiClient.delete(`/api/test-packages/${id}`)).data,
};

export const hospitalAPI = {
    resolveHospital: async (slug) => (await apiClient.get(`/api/hospitals/resolve/${slug}`)).data,
    getHospitals: async () => (await apiClient.get('/api/hospitals')).data,
    createHospital: async (data) => (await apiClient.post('/api/hospitals', data)).data,
    updateHospital: async (id, data) => (await apiClient.put(`/api/hospitals/${id}`, data)).data,
    deleteHospital: async (id) => (await apiClient.delete(`/api/hospitals/${id}`)).data,
    getMyHospital: async () => (await apiClient.get('/api/hospitals/my-hospital')).data,
    updateFacilities: async (data) => (await apiClient.put('/api/hospitals/my-hospital/facilities', data)).data,
    updateDepartmentFees: async (data) => (await apiClient.put('/api/hospitals/my-hospital/department-fees', data)).data,
    // Hospital inventory
    getInventory: async () => (await apiClient.get('/api/hospitals/my-hospital/inventory')).data,
    addInventory: async (data) => (await apiClient.post('/api/hospitals/my-hospital/inventory', data)).data,
    updateInventory: async (id, data) => (await apiClient.put(`/api/hospitals/my-hospital/inventory/${id}`, data)).data,
    deleteInventory: async (id) => (await apiClient.delete(`/api/hospitals/my-hospital/inventory/${id}`)).data,
    // Hospital lab test pricing
    getHospitalLabTests: async () => (await apiClient.get('/api/hospitals/my-hospital/lab-tests')).data,
    setLabTestPrice: async (testId, price) => (await apiClient.put(`/api/hospitals/my-hospital/lab-tests/${testId}/price`, { price })).data,
    // Hospital-specific lab tests (create/delete)
    createLabTest: async (data) => (await apiClient.post('/api/lab-tests', data)).data,
    deleteLabTest: async (id) => (await apiClient.delete(`/api/lab-tests/${id}`)).data,
    getHospitalStats: async (id, startDate, endDate) => {
        let url = `/api/hospitals/${id}/stats`;
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        const qs = params.toString();
        if (qs) url += `?${qs}`;
        return (await apiClient.get(url)).data;
    },
    // White-label branding
    getBranding: async (id) => (await apiClient.get(`/api/hospitals/${id}/branding`)).data,
    updateBranding: async (id, data) => (await apiClient.put(`/api/hospitals/${id}/branding`, data)).data,
    // Appointment mode (Supreme Admin)
    updateAppointmentMode: async (id, appointmentMode) => (await apiClient.put(`/api/hospitals/${id}`, { appointmentMode })).data,
    getNextToken: async (hospitalId, doctorId, date) => (await apiClient.get(`/api/hospitals/${hospitalId}/next-token?doctorId=${doctorId}&date=${date}`)).data,
};

export const hospitalAdminAPI = {
    login: async (email, password) => (await apiClient.post('/api/hospitals/admin/login', { email, password })).data,
    createHospitalAdmin: async (data) => (await apiClient.post('/api/hospitals/admin/signup', data)).data,
    deleteHospitalAdmin: async (hospitalId) => (await apiClient.delete(`/api/hospitals/${hospitalId}/admin`)).data,
};

export const financeAPI = {
    getDashboardStats: async (startDate, endDate) => {
        let url = `/api/finance/dashboard`;
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        const qs = params.toString();
        if (qs) url += `?${qs}`;
        return (await apiClient.get(url)).data;
    },
    getKPIs: async () => (await apiClient.get('/api/finance/kpis')).data,
    getRevenueAnalytics: async () => (await apiClient.get('/api/finance/revenue-analytics')).data,
    getOutstandingPayments: async () => (await apiClient.get('/api/finance/outstanding-payments')).data,
    getInsuranceClaims: async () => (await apiClient.get('/api/finance/insurance-claims')).data,
    createInsuranceClaim: async (data) => (await apiClient.post('/api/finance/insurance-claims', data)).data,
    updateInsuranceClaim: async (id, data) => (await apiClient.put(`/api/finance/insurance-claims/${id}`, data)).data,
    getExpenses: async (datePreset, start, end) => {
        let url = `/api/finance/expenses`;
        const params = new URLSearchParams();
        if (datePreset) params.append('datePreset', datePreset);
        if (start) params.append('customStartDate', start);
        if (end) params.append('customEndDate', end);
        const qs = params.toString();
        if (qs) url += `?${qs}`;
        return (await apiClient.get(url)).data;
    },
    createExpense: async (data) => (await apiClient.post('/api/finance/expenses', data)).data,
    deleteExpense: async (id) => (await apiClient.delete(`/api/finance/expenses/${id}`)).data,
    getProfitLoss: async (timeframe) => {
        let url = '/api/finance/profit-loss';
        if (timeframe) url += `?timeframe=${timeframe}`;
        return (await apiClient.get(url)).data;
    },
    getReconciliation: async (date) => (await apiClient.get(`/api/finance/reconciliation?targetDate=${date}`)).data,
    submitReconciliation: async (data) => (await apiClient.post('/api/finance/reconciliation', data)).data,
    getAuditSummary: async () => (await apiClient.get('/api/finance/audit-summary')).data,
    getExpenseCategories: async () => (await apiClient.get('/api/finance/expense-categories')).data,
    createExpenseCategory: async (data) => (await apiClient.post('/api/finance/expense-categories', data)).data,
    getFinancialAuditLogs: async (params) => (await apiClient.get('/api/finance/audit-logs', { params })).data,
    logUserActivity: async (activity, details) => (await apiClient.post('/api/finance/audit-logs/activity', { activity, details })).data,
    getStaffPayrollConfig: async () => (await apiClient.get('/api/finance/payroll/staff')).data,
    updateStaffPayrollConfig: async (id, data) => (await apiClient.put(`/api/finance/payroll/staff/${id}`, data)).data,
    getPayrollRecords: async (params) => (await apiClient.get('/api/finance/payroll/records', { params })).data,
    generatePayroll: async (data) => (await apiClient.post('/api/finance/payroll/records/generate', data)).data,
    payPayroll: async (id, data) => (await apiClient.post(`/api/finance/payroll/records/pay/${id}`, data)).data,
    reversePayroll: async (id) => (await apiClient.post(`/api/finance/payroll/records/reverse/${id}`)).data,
    getDoctorPayoutConfig: async () => (await apiClient.get('/api/finance/doctor-payouts/doctors')).data,
    updateDoctorPayoutConfig: async (id, data) => (await apiClient.put(`/api/finance/doctor-payouts/doctors/${id}`, data)).data,
    getDoctorPayoutRecords: async (params) => (await apiClient.get('/api/finance/doctor-payouts/records', { params })).data,
    calculateDoctorPayouts: async (data) => (await apiClient.post('/api/finance/doctor-payouts/records/calculate', data)).data,
    approveDoctorPayout: async (id) => (await apiClient.post(`/api/finance/doctor-payouts/records/approve/${id}`)).data,
    payDoctorPayout: async (id, data) => (await apiClient.post(`/api/finance/doctor-payouts/records/pay/${id}`, data)).data,
    getReceptionCollections: async (startDate, endDate) => {
        let url = '/api/finance/reception-collections';
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        const qs = params.toString();
        if (qs) url += `?${qs}`;
        return (await apiClient.get(url)).data;
    },
    getReceptionTransactions: async (params = {}) => {
        const queryParams = new URLSearchParams();
        if (params.startDate) queryParams.append('startDate', params.startDate);
        if (params.endDate) queryParams.append('endDate', params.endDate);
        if (params.receptionistId) queryParams.append('receptionistId', params.receptionistId);
        if (params.paymentMethod) queryParams.append('paymentMethod', params.paymentMethod);
        const qs = queryParams.toString();
        return (await apiClient.get(`/api/finance/reception-collections/transactions${qs ? '?' + qs : ''}`)).data;
    },
    getReceptionReconciliation: async (date) => (await apiClient.get(`/api/finance/reception-collections/reconciliation?targetDate=${date}`)).data,
    submitReceptionReconciliation: async (data) => (await apiClient.post('/api/finance/reception-collections/reconcile', data)).data,
};

export const billingAPI = {
    getPatientBills: async (identifier) => (await apiClient.get(`/api/billing/patient/${identifier}`)).data,
    addFacilityCharge: async (data) => (await apiClient.post('/api/billing/facility-charge', data)).data,
    processPayment: async (data) => (await apiClient.put('/api/billing/pay', data)).data,
    generateInvoice: async (data) => (await apiClient.post('/api/billing/invoice', data)).data,
    collectInvoicePayment: async (id, data) => (await apiClient.post(`/api/billing/invoice/${id}/payment`, data)).data,
    cancelInvoice: async (id) => (await apiClient.put(`/api/billing/invoice/${id}/cancel`)).data,
    getInvoices: async () => (await apiClient.get('/api/billing/invoices')).data,
    getRefunds: async () => (await apiClient.get('/api/billing/refunds')).data,
    requestRefund: async (data) => (await apiClient.post('/api/billing/refunds', data)).data,
    approveRefund: async (id, notes = '') => (await apiClient.put(`/api/billing/refunds/${id}/approve`, { notes })).data,
    rejectRefund: async (id, notes = '') => (await apiClient.put(`/api/billing/refunds/${id}/reject`, { notes })).data,
    getActivityLogs: async () => (await apiClient.get('/api/billing/activity-logs')).data,
    getBillingAnalytics: async () => (await apiClient.get('/api/billing/analytics')).data,
    // Insurance Claims
    getInsuranceClaims: async (status = 'all') => (await apiClient.get(`/api/billing/insurance/claims?status=${status}`)).data,
    createInsuranceClaim: async (data) => (await apiClient.post('/api/billing/insurance/claims', data)).data,
    updateInsuranceClaim: async (id, data) => (await apiClient.put(`/api/billing/insurance/claims/${id}`, data)).data,
    // Discount & Adjustment Requests
    getDiscountRequests: async (status = 'all') => (await apiClient.get(`/api/billing/discounts?status=${status}`)).data,
    createDiscountRequest: async (data) => (await apiClient.post('/api/billing/discounts', data)).data,
    approveDiscountRequest: async (id, action, notes = '') => (await apiClient.put(`/api/billing/discounts/${id}/approve`, { action, notes })).data,
    applyDiscountRequest: async (id) => (await apiClient.put(`/api/billing/discounts/${id}/apply`, {})).data,
};

export const admissionAPI = {
    createAdmission: async (data) => (await apiClient.post('/api/admissions', data)).data,
    getActiveAdmissions: async () => (await apiClient.get('/api/admissions/active')).data,
    getPatientAdmissions: async (patientId) => (await apiClient.get(`/api/admissions/patient/${patientId}`)).data,
    updateAdmission: async (id, data) => (await apiClient.put(`/api/admissions/${id}`, data)).data,
    dischargePatient: async (id, data = {}) => (await apiClient.put(`/api/admissions/${id}/discharge`, data)).data,
    markAdmissionPaid: async (id, data = {}) => (await apiClient.put(`/api/admissions/${id}/pay`, data)).data,
};

// Clinic self-service API (for clinic admin dashboard)
export const clinicAPI = {
    getStats: async () => (await apiClient.get('/api/clinic/stats')).data,
    // Patients — uses ClinicPatient model (separate from staff)
    getPatients: async (search = '') => (await apiClient.get(`/api/clinic/patients${search ? `?search=${encodeURIComponent(search)}` : ''}`)).data,
    registerPatient: async (data) => (await apiClient.post('/api/clinic/patients', data)).data,
    updatePatient: async (id, data) => (await apiClient.put(`/api/clinic/patients/${id}`, data)).data,
    getPatientHistory: async (patientId) => (await apiClient.get(`/api/clinic/patients/${patientId}/history`)).data,
    uploadPatientReport: async (patientId, file, name) => {
        const fd = new FormData();
        fd.append('report', file);
        if (name) fd.append('name', name);
        return (await apiClient.post(`/api/clinic/patients/${patientId}/reports`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
    },
    deletePatientReport: async (patientId, reportId) => (await apiClient.delete(`/api/clinic/patients/${patientId}/reports/${reportId}`)).data,
    // Appointments — patientId is ClinicPatient._id
    getAppointments: async (date = '', status = '') => {
        const params = new URLSearchParams();
        if (date) params.append('date', date);
        if (status) params.append('status', status);
        const qs = params.toString();
        return (await apiClient.get(`/api/clinic/appointments${qs ? '?' + qs : ''}`)).data;
    },
    getConfig: async () => (await apiClient.get('/api/clinic/config')).data,
    updateConfig: async (data) => (await apiClient.put('/api/clinic/config', data)).data,
    getStaff: async () => (await apiClient.get('/api/clinic/staff')).data,
    bookAppointment: async (data) => (await apiClient.post('/api/clinic/appointments', data)).data,
    completeAppointment: async (id, data) => (await apiClient.put(`/api/clinic/appointments/${id}/complete`, data)).data,
    payAppointment: async (id, paymentMethod = 'Cash') => (await apiClient.put(`/api/clinic/appointments/${id}/pay`, { paymentMethod })).data,
    cancelAppointment: async (id) => (await apiClient.put(`/api/clinic/appointments/${id}/cancel`, {})).data,
    // Inventory
    getInventory: async () => (await apiClient.get('/api/clinic/inventory')).data,
    addInventory: async (data) => (await apiClient.post('/api/clinic/inventory', data)).data,
    // Pharmacy orders
    getPharmacyOrders: async () => (await apiClient.get('/api/clinic/pharmacy-orders')).data,
    dispenseOrder: async (id) => (await apiClient.put(`/api/clinic/pharmacy-orders/${id}/dispense`, {})).data,
    // Treatment Plans
    getTreatmentPlans: async () => (await apiClient.get('/api/clinic/treatment-plans')).data,
    createTreatmentPlan: async (data) => (await apiClient.post('/api/clinic/treatment-plans', data)).data,
    getTreatmentPlan: async (id) => (await apiClient.get(`/api/clinic/treatment-plans/${id}`)).data,
    getTodayDuePlans: async () => (await apiClient.get('/api/clinic/treatment-plans/today-due')).data,
    payVisit: async (planId, visitId, data) => (await apiClient.put(`/api/clinic/treatment-plans/${planId}/visits/${visitId}/pay`, data)).data,
    completeVisit: async (planId, visitId, data) => (await apiClient.put(`/api/clinic/treatment-plans/${planId}/visits/${visitId}/complete`, data)).data,
    missVisit: async (planId, visitId) => (await apiClient.put(`/api/clinic/treatment-plans/${planId}/visits/${visitId}/miss`, {})).data,
    cancelTreatmentPlan: async (id) => (await apiClient.put(`/api/clinic/treatment-plans/${id}/cancel`, {})).data,
};

export const simpleClinicAPI = {
    getClinics: async () => (await apiClient.get('/api/simple-clinics')).data,
    createClinic: async (data) => (await apiClient.post('/api/simple-clinics', data)).data,
    updateClinic: async (id, data) => (await apiClient.put(`/api/simple-clinics/${id}`, data)).data,
    deleteClinic: async (id) => (await apiClient.delete(`/api/simple-clinics/${id}`)).data,
    getStats: async (id, startDate, endDate) => {
        let url = `/api/simple-clinics/${id}/stats`;
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        const qs = params.toString();
        if (qs) url += `?${qs}`;
        return (await apiClient.get(url)).data;
    },
    createManager: async (id, data) => (await apiClient.post(`/api/simple-clinics/${id}/manager`, data)).data,
    getStaff: async (id) => (await apiClient.get(`/api/simple-clinics/${id}/staff`)).data,
    createStaff: async (id, data) => (await apiClient.post(`/api/simple-clinics/${id}/staff`, data)).data,
    deleteStaff: async (clinicId, userId) => (await apiClient.delete(`/api/simple-clinics/${clinicId}/staff/${userId}`)).data,
    // Tier management
    updateTier: async (id, data) => (await apiClient.put(`/api/simple-clinics/${id}`, data)).data,
    // Subscription / billing
    getSubscriptions: async (id) => (await apiClient.get(`/api/simple-clinics/${id}/subscriptions`)).data,
    setRate: async (id, data) => (await apiClient.put(`/api/simple-clinics/${id}/subscriptions/rate`, data)).data,
    updateSubscription: async (clinicId, subId, data) => (await apiClient.put(`/api/simple-clinics/${clinicId}/subscriptions/${subId}`, data)).data,
    // Appointment mode (Central Admin only)
    updateAppointmentMode: async (id, appointmentMode) =>
        (await apiClient.put(`/api/simple-clinics/${id}`, { appointmentMode })).data,
};

export const revenueAPI = {
    // Full system revenue analytics (monthly, quarterly, by model)
    getSystemAnalytics: async () => (await apiClient.get('/api/revenue/system')).data,
    // All hospitals with revenue config (lightweight)
    getHospitalsRevenue: async () => (await apiClient.get('/api/revenue/hospitals')).data,
    // Set or update revenue model for a hospital/clinic
    setHospitalPlan: async (id, data) => (await apiClient.put(`/api/revenue/hospital/${id}`, data)).data,
};

export default apiClient;
