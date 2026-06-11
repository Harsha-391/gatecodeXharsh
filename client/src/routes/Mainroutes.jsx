import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Components
import Navbar from '../components/Navbar';
import DashboardLayout from '../components/layouts/DashboardLayout';
import ProtectedRoute from '../components/ProtectedRoute';
import RoleDashboard from '../pages/RoleDashboard';
import { useAuth } from '../store/hooks';
import { getSubdomain } from '../utils/subdomain';

// User Pages
import Services from '../pages/user/Services';
import Doctors from '../pages/user/Doctors';
import Appointment from '../pages/user/Appointment';
import AppointmentSuccess from '../pages/user/AppointmentSuccess';
import LabReports from '../pages/user/LabReports';
import Dashboard from '../pages/user/Dashboard';
import Pharmacy from '../pages/user/Pharmacy';
import Login from '../pages/user/Login';
import Signup from '../pages/user/Signup';

// Doctor Pages
import Patient from '../pages/doctors/Patient';
import AdminLabTests from '../pages/admin/AdminLabTests';
import DoctorPatientDetails from '../pages/doctors/DoctorPatientDetails';
import UnifiedPatientProfile from '../pages/patient/UnifiedPatientProfile';

// Hospital Admin (Tier 2) Pages
import Admin from '../pages/admin/Admin';
import AdminDoctors from '../pages/admin/AdminDoctors';
import AdminLabs from '../pages/admin/AdminLabs';
import AdminPharmacy from '../pages/admin/AdminPharmacy';
import AdminReception from '../pages/admin/AdminReception';
import AdminServices from '../pages/admin/AdminServices';
import AdminFacilities from '../pages/admin/AdminFacilities';
import AdminRoles from '../pages/admin/AdminRoles';
import AdminMainDashboard from '../pages/admin/AdminMainDashboard';
import AdminMedicines from '../pages/admin/AdminMedicines';
import AdminQuestionLibrary from '../pages/admin/AdminQuestionLibrary';
import AdminTestPackages from '../pages/admin/AdminTestPackages';
import AdminPermissionsPage from '../pages/admin/AdminPermissionsPage';

// Central Admin (Tier 1) Pages — /supremeadmin
import CentralAdminLogin from '../pages/centraladmin/CentralAdminLogin';
import CentralAdminSignup from '../pages/centraladmin/CentralAdminSignup';
import CentralAdminDashboard from '../pages/centraladmin/CentralAdminDashboard';
import SystemRevenueDashboard from '../pages/centraladmin/SystemRevenueDashboard';
import AdminProfile from '../pages/centraladmin/AdminProfile';

// Hospital Admin (Tier 2) Pages — /hospitaladmin
import HospitalAdminLogin from '../pages/hospitaladmin/HospitalAdminLogin';
import HospitalAdminDashboard from '../pages/hospitaladmin/HospitalAdminDashboard';
import ClinicDashboard from '../pages/hospitaladmin/ClinicDashboard';
import HospitalLogin from '../pages/hospitaladmin/HospitalLogin';
import HospitalAdminQuestionLibrary from '../pages/hospitaladmin/HospitalAdminQuestionLibrary';

// Cashier Routing
import CashierDashboard from '../pages/cashier/CashierDashboard';

// Legacy Admin Auth (keep for backward-compat)
import AdminLogin from '../pages/administration/AdminLogin';
import AdminSignup from '../pages/administration/AdminSignup';

// Lab Pages
import LabDashboard from '../pages/lab/LabDashboard';
import AssignedTests from '../pages/lab/AssignedTests';
import CompletedReports from '../pages/lab/CompletedReports';
import LabOrders from '../pages/lab/LabOrders';
import SampleCollection from '../pages/lab/SampleCollection';
import TestProcessing from '../pages/lab/TestProcessing';

// Pharmacy Management Pages
import PharmacyInventory from '../pages/pharmacy/PharmacyInventory';
import PharmacyOrders from '../pages/pharmacy/PharmacyOrders';

// Reception Pages
import ReceptionDashboard from '../pages/reception/ReceptionDashboard';

// Accountant / Finance Pages
import AccountantDashboard from '../pages/accountant/AccountantDashboard';

// Billing Pages
import BillingDashboard from '../pages/billing/BillingDashboard';

// Administrator Pages
import OldAdministratorDashboard from '../pages/administrator/AdministratorDashboard';
import AdministratorDashboard from '../pages/admin/AdministratorDashboard';
import DoctorManagement from '../pages/admin/DoctorManagement';
import LaboratoryManagement from '../pages/admin/LaboratoryManagement';
import PharmacyManagement from '../pages/admin/PharmacyManagement';
import RoleManagement from '../pages/admin/RoleManagement';
import NotificationCenter from '../pages/admin/NotificationCenter';
import AuditLogs from '../pages/admin/AuditLogs';
import RevenueMonitoring from '../pages/admin/RevenueMonitoring';
import ResourceManagement from '../pages/admin/ResourceManagement';

// Subdomains reserved for the platform itself — NOT hospital slugs
const RESERVED_SUBDOMAINS = ['admin', 'www', 'api'];

const SmartLogin = () => {
    const subdomain = getSubdomain();
    if (subdomain && !RESERVED_SUBDOMAINS.includes(subdomain)) return <HospitalLogin />;
    return <CentralAdminLogin />;
};

const SmartDashboardRedirector = () => {
    const subdomain = getSubdomain();
    if (subdomain && !RESERVED_SUBDOMAINS.includes(subdomain)) return <Navigate to="/my-dashboard" replace />;
    return <Navigate to="/supremeadmin" replace />;
};

/**
 * SubdomainRoleGuard — enforces that the user's role matches the subdomain context.
 *
 * admin.domain.com   → only centraladmin / superadmin allowed
 * slug.domain.com    → hospital staff allowed, centraladmin/superadmin blocked
 * localhost (null)   → no enforcement (local dev without subdomain)
 */
const SubdomainRoleGuard = ({ children }) => {
    const { user, isAuthenticated } = useAuth();
    const subdomain = getSubdomain();

    if (subdomain && isAuthenticated && user) {
        const role = (user.role || '').toLowerCase();
        const isCentralRole = role === 'centraladmin' || role === 'superadmin';
        const isAdminSubdomain = subdomain === 'admin';

        // Central admin must operate from admin.* subdomain only
        if (isCentralRole && !isAdminSubdomain) {
            return <Navigate to="/login" replace />;
        }

        // Hospital staff / hospital admin must NOT operate from admin.* subdomain
        if (!isCentralRole && isAdminSubdomain) {
            return <Navigate to="/login" replace />;
        }
    }

    return children;
};

const MainRoutes = () => {
    const { isAuthenticated } = useAuth();
    
    return (
        <>
            {!isAuthenticated && <Navbar />}

            {isAuthenticated ? (
                <DashboardLayout>
                  <SubdomainRoleGuard>
                    <Routes>
                        <Route path="/" element={<SmartDashboardRedirector />} />
                        <Route path="/services" element={<Navigate to="/" replace />} />
                        <Route path="/doctors" element={<Navigate to="/" replace />} />
                        <Route path="/services/:serviceId/doctors" element={<Navigate to="/" replace />} />

                        {/* Flat Architecture - Handled by Subdomains */}
                        <Route path="patient/:id" element={<ProtectedRoute requiredPermissions={[]}><UnifiedPatientProfile /></ProtectedRoute>} />
                            <Route path="my-dashboard" element={<ProtectedRoute requiredPermissions={[]}><RoleDashboard /></ProtectedRoute>} />
                            <Route path="appointment" element={<Appointment />} />
                            <Route path="appointment/success" element={<AppointmentSuccess />} />
                            <Route path="lab-reports" element={<LabReports />} />
                            <Route path="dashboard" element={<Dashboard />} />
                            <Route path="pharmacy" element={<Pharmacy />} />

                            {/* Transitions between roles/admin */}
                            <Route path="doctor/dashboard" element={<ProtectedRoute requiredPermissions={['visit_diagnose']}><Patient /></ProtectedRoute>} />
                            <Route path="doctor/patients" element={<Patient />} />
                            <Route path="doctor/patient/:appointmentId" element={<ProtectedRoute requiredPermissions={['visit_diagnose']}><DoctorPatientDetails /></ProtectedRoute>} />

                            <Route path="admin" element={<ProtectedRoute requiredPermissions={['admin_view_stats', 'admin_manage_roles']}><AdminMainDashboard /></ProtectedRoute>} />
                            <Route path="admin/users" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><Admin /></ProtectedRoute>} />
                            <Route path="admin/doctors" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminDoctors /></ProtectedRoute>} />
                            <Route path="admin/labs" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminLabs /></ProtectedRoute>} />
                            <Route path="admin/lab-tests" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminLabTests /></ProtectedRoute>} />
                            <Route path="admin/pharmacy" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminPharmacy /></ProtectedRoute>} />
                            <Route path="admin/reception" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminReception /></ProtectedRoute>} />
                            <Route path="admin/services" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminServices /></ProtectedRoute>} />
                            <Route path="admin/facilities" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminFacilities /></ProtectedRoute>} />
                            <Route path="admin/roles" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminRoles /></ProtectedRoute>} />
                            <Route path="admin/medicines" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminMedicines /></ProtectedRoute>} />
                            <Route path="admin/question-library" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminQuestionLibrary /></ProtectedRoute>} />
                            <Route path="admin/test-packages" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminTestPackages /></ProtectedRoute>} />
                            <Route path="admin/permissions" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminPermissionsPage /></ProtectedRoute>} />
                            
                            {/* Dashboard routes — clinic vs full hospital */}
                            <Route path="hospitaladmin" element={
                                <ProtectedRoute allowedRoles={['hospitaladmin']}>
                                    {(() => {
                                        const u = JSON.parse(localStorage.getItem('user') || '{}');
                                        return u.clinicType === 'clinic' ? <ClinicDashboard /> : <HospitalAdminDashboard />;
                                    })()}
                                </ProtectedRoute>
                            } />
                            <Route path="hospitaladmin/question-library" element={<ProtectedRoute allowedRoles={['hospitaladmin']}><HospitalAdminQuestionLibrary /></ProtectedRoute>} />

                            <Route path="lab/dashboard" element={<ProtectedRoute requiredPermissions={['lab_view', 'lab_manage']}><LabDashboard /></ProtectedRoute>} />
                            <Route path="lab/tests" element={<ProtectedRoute requiredPermissions={['lab_view', 'lab_manage']}><AssignedTests /></ProtectedRoute>} />
                            <Route path="lab/orders" element={<ProtectedRoute requiredPermissions={['lab_view', 'lab_manage']}><LabOrders /></ProtectedRoute>} />
                            <Route path="lab/sample-collection" element={<ProtectedRoute requiredPermissions={['lab_view', 'lab_manage']}><SampleCollection /></ProtectedRoute>} />
                            <Route path="lab/processing" element={<ProtectedRoute requiredPermissions={['lab_view', 'lab_manage']}><TestProcessing /></ProtectedRoute>} />
                            <Route path="lab/completed" element={<ProtectedRoute requiredPermissions={['lab_view', 'lab_manage']}><CompletedReports /></ProtectedRoute>} />

                            {/* Pharmacy Management Pages */}
                            <Route path="pharmacy/inventory" element={<ProtectedRoute requiredPermissions={['pharmacy_view', 'pharmacy_manage']}><PharmacyInventory /></ProtectedRoute>} />
                            <Route path="pharmacy/orders" element={<ProtectedRoute requiredPermissions={['pharmacy_view', 'pharmacy_manage']}><PharmacyOrders /></ProtectedRoute>} />

                            {/* Reception Pages */}
                            <Route path="reception/dashboard" element={<ProtectedRoute requiredPermissions={['appointment_manage']}><ReceptionDashboard /></ProtectedRoute>} />

                            {/* Accountant / Finance Pages */}
                            <Route path="accountant/dashboard" element={<ProtectedRoute requiredPermissions={['finance_view']} allowedRoles={['accountant', 'centraladmin', 'superadmin', 'hospitaladmin']}><AccountantDashboard /></ProtectedRoute>} />

                            {/* Centralized Patient Billing & Cashier Workspace */}
                            <Route path="billing/dashboard" element={<ProtectedRoute requiredPermissions={['billing_view']} allowedRoles={['receptionist', 'reception', 'billing', 'cashier', 'billing executive', 'billing manager', 'senior billing officer', 'accountant']}><BillingDashboard tab="dashboard" /></ProtectedRoute>} />
                            <Route path="billing/patient" element={<ProtectedRoute requiredPermissions={['billing_view']} allowedRoles={['receptionist', 'reception', 'billing', 'cashier', 'billing executive', 'billing manager', 'senior billing officer']}><BillingDashboard tab="patient" /></ProtectedRoute>} />
                            <Route path="billing/pending" element={<ProtectedRoute requiredPermissions={['billing_view']} allowedRoles={['receptionist', 'reception', 'billing', 'cashier', 'billing executive', 'billing manager', 'senior billing officer']}><BillingDashboard tab="pending" /></ProtectedRoute>} />
                            <Route path="billing/invoices" element={<ProtectedRoute requiredPermissions={['billing_view']} allowedRoles={['receptionist', 'reception', 'billing', 'cashier', 'billing executive', 'billing manager', 'senior billing officer']}><BillingDashboard tab="invoices" /></ProtectedRoute>} />
                            <Route path="billing/collect" element={<ProtectedRoute requiredPermissions={['billing_view']} allowedRoles={['receptionist', 'reception', 'billing', 'cashier', 'billing executive', 'billing manager', 'senior billing officer']}><BillingDashboard tab="collect" /></ProtectedRoute>} />
                            <Route path="billing/history" element={<ProtectedRoute requiredPermissions={['billing_view']} allowedRoles={['billing', 'cashier', 'billing executive', 'billing manager', 'senior billing officer']}><BillingDashboard tab="history" /></ProtectedRoute>} />
                            <Route path="billing/refunds" element={<ProtectedRoute requiredPermissions={['billing_view']} allowedRoles={['receptionist', 'reception', 'billing', 'cashier', 'billing executive', 'billing manager', 'senior billing officer']}><BillingDashboard tab="refunds" /></ProtectedRoute>} />
                            <Route path="billing/reports" element={<ProtectedRoute requiredPermissions={['billing_view']} allowedRoles={['receptionist', 'reception', 'billing', 'cashier', 'billing executive', 'billing manager', 'senior billing officer', 'accountant']}><BillingDashboard tab="reports" /></ProtectedRoute>} />
                            <Route path="billing/analytics" element={<ProtectedRoute requiredPermissions={['billing_view']} allowedRoles={['receptionist', 'reception', 'billing', 'cashier', 'billing executive', 'billing manager', 'senior billing officer', 'accountant']}><BillingDashboard tab="analytics" /></ProtectedRoute>} />
                            <Route path="billing/templates" element={<ProtectedRoute requiredPermissions={['billing_view']} allowedRoles={['receptionist', 'reception', 'billing', 'cashier', 'billing executive', 'billing manager', 'senior billing officer', 'accountant']}><BillingDashboard tab="templates" /></ProtectedRoute>} />
                            <Route path="billing/settings" element={<ProtectedRoute requiredPermissions={['billing_view']} allowedRoles={['receptionist', 'reception', 'billing', 'cashier', 'billing executive', 'billing manager', 'senior billing officer', 'accountant']}><BillingDashboard tab="settings" /></ProtectedRoute>} />
                            {/* Legacy Cashier Dashboard Support */}
                            <Route path="cashier/billing" element={<ProtectedRoute requiredPermissions={['billing_view']} allowedRoles={['receptionist', 'reception', 'billing', 'cashier', 'billing executive', 'billing manager', 'senior billing officer']}><BillingDashboard tab="patient" /></ProtectedRoute>} />

                            {/* Hospital Administrator Department */}
                            <Route path="administrator/dashboard" element={<ProtectedRoute requiredPermissions={['administrator_view']}><AdministratorDashboard /></ProtectedRoute>} />
                            <Route path="administrator/operations" element={<ProtectedRoute requiredPermissions={['administrator_view']}><OldAdministratorDashboard tab="operations" /></ProtectedRoute>} />
                            <Route path="administrator/patient-flow" element={<ProtectedRoute requiredPermissions={['administrator_view']}><OldAdministratorDashboard tab="patient-flow" /></ProtectedRoute>} />
                            <Route path="administrator/staff" element={<ProtectedRoute requiredPermissions={['administrator_view']}><OldAdministratorDashboard tab="staff" /></ProtectedRoute>} />
                            <Route path="administrator/departments" element={<ProtectedRoute requiredPermissions={['administrator_view']}><OldAdministratorDashboard tab="departments" /></ProtectedRoute>} />
                            <Route path="administrator/admissions" element={<ProtectedRoute requiredPermissions={['administrator_view']}><OldAdministratorDashboard tab="admissions" /></ProtectedRoute>} />
                            <Route path="administrator/beds" element={<ProtectedRoute requiredPermissions={['administrator_view']}><OldAdministratorDashboard tab="beds" /></ProtectedRoute>} />
                            <Route path="administrator/appointments" element={<ProtectedRoute requiredPermissions={['administrator_view']}><OldAdministratorDashboard tab="appointments" /></ProtectedRoute>} />
                            <Route path="administrator/billing" element={<ProtectedRoute requiredPermissions={['administrator_view']}><OldAdministratorDashboard tab="billing" /></ProtectedRoute>} />
                            
                            <Route path="administrator/doctors" element={<ProtectedRoute requiredPermissions={['administrator_view']}><DoctorManagement /></ProtectedRoute>} />
                            <Route path="administrator/lab" element={<ProtectedRoute requiredPermissions={['administrator_view']}><LaboratoryManagement /></ProtectedRoute>} />
                            <Route path="administrator/pharmacy" element={<ProtectedRoute requiredPermissions={['administrator_view']}><PharmacyManagement /></ProtectedRoute>} />
                            <Route path="administrator/roles" element={<ProtectedRoute requiredPermissions={['administrator_view']}><RoleManagement /></ProtectedRoute>} />
                            <Route path="administrator/notifications" element={<ProtectedRoute requiredPermissions={['administrator_view']}><NotificationCenter /></ProtectedRoute>} />
                            <Route path="administrator/audit-logs" element={<ProtectedRoute requiredPermissions={['administrator_view']}><AuditLogs /></ProtectedRoute>} />
                            <Route path="administrator/revenue" element={<ProtectedRoute requiredPermissions={['administrator_view']}><RevenueMonitoring /></ProtectedRoute>} />
                            <Route path="administrator/resources" element={<ProtectedRoute requiredPermissions={['administrator_view']}><ResourceManagement /></ProtectedRoute>} />
                            
                            <Route path="administrator/inventory" element={<ProtectedRoute requiredPermissions={['administrator_view']}><OldAdministratorDashboard tab="inventory" /></ProtectedRoute>} />
                            <Route path="administrator/reports" element={<ProtectedRoute requiredPermissions={['administrator_view']}><OldAdministratorDashboard tab="reports" /></ProtectedRoute>} />
                            <Route path="administrator/analytics" element={<ProtectedRoute requiredPermissions={['administrator_view']}><OldAdministratorDashboard tab="analytics" /></ProtectedRoute>} />
                            <Route path="administrator/settings" element={<ProtectedRoute requiredPermissions={['administrator_view']}><OldAdministratorDashboard tab="settings" /></ProtectedRoute>} />
                            <Route path="administrator/profile-settings" element={<ProtectedRoute requiredPermissions={['administrator_view']}><AdminProfile /></ProtectedRoute>} />

                        {/* Supreme Admin remains outside of hospital slugs */}
                        <Route path="/supremeadmin" element={<ProtectedRoute allowedRoles={['centraladmin', 'superadmin']}><CentralAdminDashboard /></ProtectedRoute>} />
                        <Route path="/supremeadmin/revenue" element={<ProtectedRoute allowedRoles={['centraladmin', 'superadmin']}><SystemRevenueDashboard /></ProtectedRoute>} />
                        <Route path="/profile" element={<ProtectedRoute requiredPermissions={[]}><AdminProfile /></ProtectedRoute>} />


                        <Route path="*" element={<Navigate to="/my-dashboard" />} />
                    </Routes>
                  </SubdomainRoleGuard>
                </DashboardLayout>
            ) : (
                <Routes>
                    {/* Unified Smart Login URL - Reads current domain/subdomain natively */}
                    <Route path="/login" element={<SmartLogin />} />
                    
                    {/* Legacy/Signups routing */}
                    <Route path="/signup" element={<Signup />} />
                    <Route path="/supremeadmin/signup" element={<CentralAdminSignup />} />
                    <Route path="/admin/signup" element={<AdminSignup />} />
                    <Route path="*" element={<Navigate to="/login" />} />
                </Routes>
            )}
        </>
    );
};

export default MainRoutes;
