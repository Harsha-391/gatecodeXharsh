import React, { useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

// Components
import Navbar from '../components/Navbar';
import DashboardLayout from '../components/layouts/DashboardLayout';
import ProtectedRoute from '../components/ProtectedRoute';
import RoleDashboard from '../pages/RoleDashboard';
import { useAuth, useAppDispatch } from '../store/hooks';
import { getSubdomain } from '../utils/subdomain';
import { logout } from '../store/slices/authSlice';

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
import InventoryMonitoring from '../pages/admin/InventoryMonitoring';
import Reports from '../pages/admin/Reports';

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
import DocumentTemplates from '../pages/hospitaladmin/DocumentTemplates';

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
import CompletedReportsDetails from '../pages/lab/CompletedReports';

// Pharmacy Management Pages
import PharmacyInventory from '../pages/pharmacy/PharmacyInventory';
import PharmacyOrders from '../pages/pharmacy/PharmacyOrders';
import PharmacyPurchaseApprovals from '../pages/pharmacy/PharmacyPurchaseApprovals';

// Reception Pages
import ReceptionDashboard from '../pages/reception/ReceptionDashboard';

// Accountant / Finance Pages
import AccountantDashboard from '../pages/accountant/AccountantDashboard';
import OutstandingPayments from '../pages/accountant/OutstandingPayments';
import InsuranceClaims from '../pages/accountant/InsuranceClaims';
import ExpensesPage from '../pages/accountant/ExpensesPage';
import ProfitLoss from '../pages/accountant/ProfitLoss';
import FinancialStatements from '../pages/accountant/FinancialStatements';
import Reconciliation from '../pages/accountant/Reconciliation';
import TransactionLogs from '../pages/accountant/TransactionLogs';
import FinancialAuditCenter from '../pages/accountant/FinancialAuditCenter';
import PayrollManagement from '../pages/accountant/PayrollManagement';
import DoctorPayouts from '../pages/accountant/DoctorPayouts';
import DiscountApprovals from '../pages/accountant/DiscountApprovals';
import ReceptionCollections from '../pages/finance/ReceptionCollections';

// Billing Pages
import BillingDashboard from '../pages/billing/BillingDashboard';
import InsuranceBilling from '../pages/billing/InsuranceBilling';
import IPDSettlement from '../pages/billing/IPDSettlement';
import ReceiptReprint from '../pages/billing/ReceiptReprint';
import DiscountsAdjustments from '../pages/billing/DiscountsAdjustments';

// Administrator Pages
import LaboratoryManagement from '../pages/admin/LaboratoryManagement';
import PharmacyManagement from '../pages/admin/PharmacyManagement';
import AuditLogs from '../pages/admin/AuditLogs';
import ResourceManagement from '../pages/admin/ResourceManagement';
import AdmissionsOversight from '../pages/admin/AdmissionsOversight';
import PatientFlow from '../pages/admin/PatientFlow';

// Subdomains reserved for the platform itself — NOT hospital slugs
const RESERVED_SUBDOMAINS = ['admin', 'www', 'api'];

const SmartLogin = () => {
    const { isAuthenticated } = useAuth();
    const dispatch = useAppDispatch();
    const subdomain = getSubdomain();
    const wasAuthenticatedRef = useRef(isAuthenticated);

    // Redirect to admin subdomain if accessing login from base domain in production
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const hostname = window.location.hostname;
            const isBaseBoonkies = hostname === 'boonkies.com' || hostname === 'www.boonkies.com';
            const isBaseMedical = hostname === 'medicalhms.in' || hostname === 'www.medicalhms.in';
            
            if (isBaseBoonkies) {
                window.location.href = `https://admin.boonkies.com/login${window.location.search}`;
            } else if (isBaseMedical) {
                window.location.href = `https://admin.medicalhms.in/login${window.location.search}`;
            }
        }
    }, []);

    useEffect(() => {
        if (wasAuthenticatedRef.current && isAuthenticated) {
            dispatch(logout());
            wasAuthenticatedRef.current = false;
        }
    }, [isAuthenticated, dispatch]);

    if (wasAuthenticatedRef.current && isAuthenticated) {
        return (
            <div className="hospital-login-loading">
                <div className="hospital-login-spinner"></div>
                <p>Logging out...</p>
            </div>
        );
    }

    if (subdomain && !RESERVED_SUBDOMAINS.includes(subdomain)) return <HospitalLogin />;
    // On localhost (no subdomain), show HospitalLogin so hospital staff can log in during dev.
    // In production (no subdomain), CentralAdminLogin is correct.
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        return <HospitalLogin />;
    }
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
            const hostname = window.location.hostname;
            const port = window.location.port ? `:${window.location.port}` : '';
            const parts = hostname.split('.');
            let targetHost = hostname;
            if (parts.length >= 2) {
                parts[0] = 'admin';
                targetHost = parts.join('.');
            } else {
                targetHost = `admin.${hostname}`;
            }
            window.location.href = `${window.location.protocol}//${targetHost}${port}/supremeadmin`;
            return null;
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
    const location = useLocation();
    const isLoginPath = location.pathname.toLowerCase() === '/login';
    
    return (
        <>
            {(!isAuthenticated || isLoginPath) && <Navbar />}

            {isAuthenticated && !isLoginPath ? (
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
                            {/* <Route path="admin/facilities" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminFacilities /></ProtectedRoute>} /> */}
                            <Route path="admin/roles" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminRoles /></ProtectedRoute>} />
                            <Route path="admin/medicines" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminMedicines /></ProtectedRoute>} />
                            <Route path="admin/question-library" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminQuestionLibrary /></ProtectedRoute>} />
                            <Route path="admin/test-packages" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminTestPackages /></ProtectedRoute>} />
                            <Route path="admin/permissions" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminPermissionsPage /></ProtectedRoute>} />
                            <Route path="admin/inventory" element={<ProtectedRoute requiredPermissions={['inventory_view']}><InventoryMonitoring /></ProtectedRoute>} />
                            <Route path="admin/reports" element={<ProtectedRoute requiredPermissions={['reports_view']}><Reports /></ProtectedRoute>} />
                            <Route path="admin/report" element={<ProtectedRoute requiredPermissions={['reports_view']}><Reports /></ProtectedRoute>} />
                            
                            {/* Dashboard routes — clinic vs full hospital */}
                            <Route path="clinicadmin" element={
                                <ProtectedRoute allowedRoles={['clinicadmin']}>
                                    <ClinicDashboard />
                                </ProtectedRoute>
                            } />
                            <Route path="clinicadmin/question-library" element={<ProtectedRoute allowedRoles={['clinicadmin']}><HospitalAdminQuestionLibrary /></ProtectedRoute>} />
                            <Route path="clinicadmin/document-templates" element={<ProtectedRoute allowedRoles={['clinicadmin', 'admin']}><DocumentTemplates /></ProtectedRoute>} />

                            <Route path="hospitaladmin" element={
                                <ProtectedRoute allowedRoles={['hospitaladmin', 'clinicadmin']}>
                                    {(() => {
                                        const u = JSON.parse(localStorage.getItem('user') || '{}');
                                        return u.clinicType === 'clinic' ? <ClinicDashboard /> : <HospitalAdminDashboard />;
                                    })()}
                                </ProtectedRoute>
                            } />
                            <Route path="hospitaladmin/question-library" element={<ProtectedRoute allowedRoles={['hospitaladmin', 'clinicadmin']}><HospitalAdminQuestionLibrary /></ProtectedRoute>} />
                             <Route path="hospitaladmin/document-templates" element={<ProtectedRoute allowedRoles={['hospitaladmin', 'clinicadmin', 'admin']}><DocumentTemplates /></ProtectedRoute>} />
                             <Route path="admin/document-templates" element={<ProtectedRoute allowedRoles={['hospitaladmin', 'clinicadmin', 'admin']}><DocumentTemplates /></ProtectedRoute>} />

                            <Route path="lab/dashboard" element={<ProtectedRoute requiredPermissions={['lab_view', 'lab_manage']}><LabDashboard /></ProtectedRoute>} />
                            <Route path="lab/tests" element={<ProtectedRoute requiredPermissions={['lab_view', 'lab_manage']}><AssignedTests /></ProtectedRoute>} />
                            <Route path="lab/orders" element={<ProtectedRoute requiredPermissions={['lab_view', 'lab_manage']}><LabOrders /></ProtectedRoute>} />
                            <Route path="lab/sample-collection" element={<ProtectedRoute requiredPermissions={['lab_view', 'lab_manage']}><SampleCollection /></ProtectedRoute>} />
                            <Route path="lab/processing" element={<ProtectedRoute requiredPermissions={['lab_view', 'lab_manage']}><TestProcessing /></ProtectedRoute>} />
                            <Route path="lab/completed" element={<ProtectedRoute requiredPermissions={['lab_view', 'lab_manage', 'lab_reports_view']}><CompletedReports /></ProtectedRoute>} />

                            {/* Pharmacy Management Pages */}
                            <Route path="pharmacy/inventory" element={<ProtectedRoute requiredPermissions={['pharmacy_view', 'pharmacy_manage']}><PharmacyInventory /></ProtectedRoute>} />
                            <Route path="pharmacy/orders" element={<ProtectedRoute requiredPermissions={['pharmacy_view', 'pharmacy_manage']}><PharmacyOrders /></ProtectedRoute>} />
                            <Route path="pharmacy/purchase-approvals" element={<ProtectedRoute requiredPermissions={['pharmacy_view', 'pharmacy_manage']}><PharmacyPurchaseApprovals /></ProtectedRoute>} />
                            <Route path="admin/purchase-approvals" element={<ProtectedRoute requiredPermissions={['inventory_view']}><PharmacyPurchaseApprovals /></ProtectedRoute>} />

                            {/* Reception Pages */}
                            <Route path="reception/dashboard" element={<ProtectedRoute requiredPermissions={['appointment_manage']}><ReceptionDashboard /></ProtectedRoute>} />

                            {/* Accountant / Finance Pages */}
                            <Route path="accountant/dashboard" element={<ProtectedRoute requiredPermissions={['finance_view']} allowedRoles={['accountant', 'centraladmin', 'superadmin', 'hospitaladmin']}><AccountantDashboard /></ProtectedRoute>} />
                            <Route path="accountant/outstanding" element={<ProtectedRoute requiredPermissions={['finance_view', 'finance_outstanding']} allowedRoles={['accountant', 'centraladmin', 'superadmin', 'hospitaladmin']}><OutstandingPayments /></ProtectedRoute>} />
                            <Route path="accountant/claims" element={<ProtectedRoute requiredPermissions={['finance_view', 'finance_claims']} allowedRoles={['accountant', 'centraladmin', 'superadmin', 'hospitaladmin']}><InsuranceClaims /></ProtectedRoute>} />
                            <Route path="accountant/expenses" element={<ProtectedRoute requiredPermissions={['finance_view', 'finance_expenses']} allowedRoles={['accountant', 'centraladmin', 'superadmin', 'hospitaladmin']}><ExpensesPage /></ProtectedRoute>} />
                            <Route path="accountant/profit-loss" element={<ProtectedRoute requiredPermissions={['finance_view', 'finance_profit_loss']} allowedRoles={['accountant', 'centraladmin', 'superadmin', 'hospitaladmin']}><ProfitLoss /></ProtectedRoute>} />
                            <Route path="accountant/statements" element={<ProtectedRoute requiredPermissions={['finance_view', 'finance_statements']} allowedRoles={['accountant', 'centraladmin', 'superadmin', 'hospitaladmin']}><FinancialStatements /></ProtectedRoute>} />
                            <Route path="accountant/reconciliation" element={<ProtectedRoute requiredPermissions={['finance_view', 'finance_reconciliation']} allowedRoles={['accountant', 'centraladmin', 'superadmin', 'hospitaladmin']}><Reconciliation /></ProtectedRoute>} />
                            <Route path="accountant/transactions" element={<ProtectedRoute requiredPermissions={['finance_view', 'finance_transactions']} allowedRoles={['accountant', 'centraladmin', 'superadmin', 'hospitaladmin']}><TransactionLogs /></ProtectedRoute>} />
                            <Route path="accountant/audit-logs" element={<ProtectedRoute requiredPermissions={['finance_view', 'finance_audit']} allowedRoles={['accountant', 'centraladmin', 'superadmin', 'hospitaladmin']}><FinancialAuditCenter /></ProtectedRoute>} />
                            <Route path="accountant/audit-logs/:section" element={<ProtectedRoute requiredPermissions={['finance_view', 'finance_audit']} allowedRoles={['accountant', 'centraladmin', 'superadmin', 'hospitaladmin']}><FinancialAuditCenter /></ProtectedRoute>} />
                            <Route path="accountant/payroll" element={<ProtectedRoute requiredPermissions={['finance_view', 'finance_payroll']} allowedRoles={['accountant', 'centraladmin', 'superadmin', 'hospitaladmin']}><PayrollManagement /></ProtectedRoute>} />
                            <Route path="accountant/doctor-payouts" element={<ProtectedRoute requiredPermissions={['finance_view', 'finance_doctor_payouts']} allowedRoles={['accountant', 'centraladmin', 'superadmin', 'hospitaladmin']}><DoctorPayouts /></ProtectedRoute>} />
                            <Route path="accountant/discount-approvals" element={<ProtectedRoute requiredPermissions={['finance_view']} allowedRoles={['accountant', 'centraladmin', 'superadmin', 'hospitaladmin']}><DiscountApprovals /></ProtectedRoute>} />
                            <Route path="finance/reception-collections" element={<ProtectedRoute requiredPermissions={['finance_reception_collections']} allowedRoles={['receptionist', 'reception', 'accountant', 'centraladmin', 'superadmin', 'hospitaladmin', 'billing', 'cashier']}><ReceptionCollections /></ProtectedRoute>} />

                            {/* Centralized Patient Billing & Cashier Workspace */}
                            <Route path="billing/dashboard" element={<ProtectedRoute requiredPermissions={['billing_view', 'billing_manage']} allowedRoles={['billing', 'cashier', 'billing executive', 'billing manager', 'senior billing officer', 'accountant', 'hospitaladmin', 'admin']}><BillingDashboard tab="dashboard" /></ProtectedRoute>} />
                            <Route path="billing/patient" element={<ProtectedRoute requiredPermissions={['billing_patient', 'billing_view', 'billing_manage']} allowedRoles={['billing', 'cashier', 'billing executive', 'billing manager', 'senior billing officer', 'hospitaladmin', 'admin']}><BillingDashboard tab="patient" /></ProtectedRoute>} />
                            <Route path="billing/pending" element={<ProtectedRoute requiredPermissions={['billing_pending', 'billing_view', 'billing_manage']} allowedRoles={['billing', 'cashier', 'billing executive', 'billing manager', 'senior billing officer', 'hospitaladmin', 'admin']}><BillingDashboard tab="pending" /></ProtectedRoute>} />
                            <Route path="billing/invoices" element={<ProtectedRoute requiredPermissions={['billing_invoices', 'billing_view', 'billing_manage']} allowedRoles={['billing', 'cashier', 'billing executive', 'billing manager', 'senior billing officer', 'hospitaladmin', 'admin']}><BillingDashboard tab="invoices" /></ProtectedRoute>} />
                            <Route path="billing/collect" element={<ProtectedRoute requiredPermissions={['billing_collect_payment', 'billing_view', 'billing_manage']} allowedRoles={['billing', 'cashier', 'billing executive', 'billing manager', 'senior billing officer', 'hospitaladmin', 'admin']}><BillingDashboard tab="collect" /></ProtectedRoute>} />
                            <Route path="billing/refunds" element={<ProtectedRoute requiredPermissions={['billing_refund', 'billing_view', 'billing_manage']} allowedRoles={['billing', 'cashier', 'billing executive', 'billing manager', 'senior billing officer', 'hospitaladmin', 'admin']}><BillingDashboard tab="refunds" /></ProtectedRoute>} />
                            <Route path="billing/insurance" element={<ProtectedRoute requiredPermissions={['billing_insurance', 'billing_view', 'billing_manage']} allowedRoles={['billing', 'cashier', 'billing executive', 'billing manager', 'senior billing officer', 'accountant', 'hospitaladmin', 'admin']}><InsuranceBilling /></ProtectedRoute>} />
                            <Route path="billing/ipd-settlement" element={<ProtectedRoute requiredPermissions={['billing_ipd_settlement', 'billing_view', 'billing_manage']} allowedRoles={['billing', 'cashier', 'billing executive', 'billing manager', 'senior billing officer', 'hospitaladmin', 'admin']}><IPDSettlement /></ProtectedRoute>} />
                            <Route path="billing/receipt-reprint" element={<ProtectedRoute requiredPermissions={['billing_receipt_reprint', 'billing_view', 'billing_manage']} allowedRoles={['billing', 'cashier', 'billing executive', 'billing manager', 'senior billing officer', 'hospitaladmin', 'admin']}><ReceiptReprint /></ProtectedRoute>} />
                            <Route path="billing/discounts" element={<ProtectedRoute requiredPermissions={['billing_discounts', 'billing_view', 'billing_manage']} allowedRoles={['billing', 'cashier', 'billing executive', 'billing manager', 'senior billing officer', 'accountant']}><DiscountsAdjustments /></ProtectedRoute>} />
                            <Route path="billing/reports" element={<ProtectedRoute requiredPermissions={['billing_reports', 'billing_view', 'finance_view']} allowedRoles={['billing', 'cashier', 'billing executive', 'billing manager', 'senior billing officer', 'accountant']}><BillingDashboard tab="reports" /></ProtectedRoute>} />
                            <Route path="billing/analytics" element={<ProtectedRoute requiredPermissions={['billing_analytics', 'billing_view', 'finance_view']} allowedRoles={['billing', 'cashier', 'billing executive', 'billing manager', 'senior billing officer', 'accountant']}><BillingDashboard tab="analytics" /></ProtectedRoute>} />
                            <Route path="billing/templates" element={<ProtectedRoute requiredPermissions={['billing_templates', 'billing_view', 'billing_manage']} allowedRoles={['billing', 'cashier', 'billing executive', 'billing manager', 'senior billing officer', 'accountant']}><BillingDashboard tab="templates" /></ProtectedRoute>} />
                            <Route path="billing/settings" element={<ProtectedRoute requiredPermissions={['billing_settings', 'billing_view', 'billing_manage']} allowedRoles={['billing', 'cashier', 'billing executive', 'billing manager', 'senior billing officer', 'accountant']}><BillingDashboard tab="settings" /></ProtectedRoute>} />
                            {/* Legacy Cashier Dashboard Support */}
                            <Route path="cashier/billing" element={<ProtectedRoute requiredPermissions={['billing_view']} allowedRoles={['billing', 'cashier', 'billing executive', 'billing manager', 'senior billing officer']}><BillingDashboard tab="patient" /></ProtectedRoute>} />

                            {/* Hospital Administrator Department */}
                            <Route path="admin/patient-flow" element={<ProtectedRoute requiredPermissions={['patient_monitor']} allowedRoles={['receptionist', 'reception']}><PatientFlow /></ProtectedRoute>} />
                            <Route path="admin/admissions" element={<ProtectedRoute requiredPermissions={['accountant_view', 'admission_manage']} allowedRoles={['centraladmin', 'admin', 'hospitaladmin']}><AdmissionsOversight /></ProtectedRoute>} />
                            
                            <Route path="admin/lab-management" element={<ProtectedRoute requiredPermissions={['accountant_view']}><LaboratoryManagement /></ProtectedRoute>} />
                            <Route path="admin/pharmacy-management" element={<ProtectedRoute requiredPermissions={['accountant_view']}><PharmacyManagement /></ProtectedRoute>} />
                            <Route path="admin/audit-logs" element={<ProtectedRoute requiredPermissions={['accountant_view']}><AuditLogs /></ProtectedRoute>} />
                            <Route path="admin/audit-log" element={<ProtectedRoute requiredPermissions={['accountant_view']}><AuditLogs /></ProtectedRoute>} />
                            <Route path="admin/resources" element={<ProtectedRoute requiredPermissions={['accountant_view', 'resource_manage']}><ResourceManagement /></ProtectedRoute>} />
                            
                            <Route path="admin/profile-settings" element={<ProtectedRoute requiredPermissions={['accountant_view', 'billing_view']}><AdminProfile /></ProtectedRoute>} />

                        {/* Supreme Admin remains outside of hospital slugs */}
                        <Route path="/supremeadmin" element={<ProtectedRoute allowedRoles={['centraladmin', 'superadmin']}><CentralAdminDashboard /></ProtectedRoute>} />
                        <Route path="/supremeadmin/revenue" element={<ProtectedRoute allowedRoles={['centraladmin', 'superadmin']}><SystemRevenueDashboard /></ProtectedRoute>} />
                        <Route path="/profile" element={<ProtectedRoute requiredPermissions={[]}><AdminProfile /></ProtectedRoute>} />
                        <Route path="/login" element={<SmartLogin />} />

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
