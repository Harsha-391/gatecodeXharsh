import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

// Components
import Navbar from '../components/Navbar';
import DashboardLayout from '../components/layouts/DashboardLayout';
import ProtectedRoute from '../components/ProtectedRoute';
import RoleDashboard from '../pages/RoleDashboard';
import { useAuth, useAppDispatch } from '../store/hooks';
import { getSubdomain } from '../utils/subdomain';

// User Pages
const Services = React.lazy(() => import('../pages/user/Services'));
const Doctors = React.lazy(() => import('../pages/user/Doctors'));
const Appointment = React.lazy(() => import('../pages/user/Appointment'));
const AppointmentSuccess = React.lazy(() => import('../pages/user/AppointmentSuccess'));
const LabReports = React.lazy(() => import('../pages/user/LabReports'));
const Dashboard = React.lazy(() => import('../pages/user/Dashboard'));
const Pharmacy = React.lazy(() => import('../pages/user/Pharmacy'));
const Login = React.lazy(() => import('../pages/user/Login'));
const Signup = React.lazy(() => import('../pages/user/Signup'));

// Doctor Pages
const Patient = React.lazy(() => import('../pages/doctors/Patient'));
const AdminLabTests = React.lazy(() => import('../pages/admin/AdminLabTests'));
const DoctorPatientDetails = React.lazy(() => import('../pages/doctors/DoctorPatientDetails'));
const UnifiedPatientProfile = React.lazy(() => import('../pages/patient/UnifiedPatientProfile'));

// Hospital Admin (Tier 2) Pages
const Admin = React.lazy(() => import('../pages/admin/Admin'));
const AdminDoctors = React.lazy(() => import('../pages/admin/AdminDoctors'));
const AdminLabs = React.lazy(() => import('../pages/admin/AdminLabs'));
const AdminPharmacy = React.lazy(() => import('../pages/admin/AdminPharmacy'));
const AdminReception = React.lazy(() => import('../pages/admin/AdminReception'));
const AdminServices = React.lazy(() => import('../pages/admin/AdminServices'));
const AdminFacilities = React.lazy(() => import('../pages/admin/AdminFacilities'));
const AdminRoles = React.lazy(() => import('../pages/admin/AdminRoles'));
const AdminMainDashboard = React.lazy(() => import('../pages/admin/AdminMainDashboard'));
const AdminMedicines = React.lazy(() => import('../pages/admin/AdminMedicines'));
const AdminQuestionLibrary = React.lazy(() => import('../pages/admin/AdminQuestionLibrary'));
const AdminTestPackages = React.lazy(() => import('../pages/admin/AdminTestPackages'));
const AdminPermissionsPage = React.lazy(() => import('../pages/admin/AdminPermissionsPage'));
const InventoryMonitoring = React.lazy(() => import('../pages/admin/InventoryMonitoring'));
const Reports = React.lazy(() => import('../pages/admin/Reports'));

// Central Admin (Tier 1) Pages — /supremeadmin
const CentralAdminLogin = React.lazy(() => import('../pages/centraladmin/CentralAdminLogin'));
const CentralAdminSignup = React.lazy(() => import('../pages/centraladmin/CentralAdminSignup'));
const CentralAdminDashboard = React.lazy(() => import('../pages/centraladmin/CentralAdminDashboard'));
const SystemRevenueDashboard = React.lazy(() => import('../pages/centraladmin/SystemRevenueDashboard'));
const AdminProfile = React.lazy(() => import('../pages/centraladmin/AdminProfile'));

// Hospital Admin (Tier 2) Pages — /hospitaladmin
const HospitalAdminLogin = React.lazy(() => import('../pages/hospitaladmin/HospitalAdminLogin'));
const HospitalAdminDashboard = React.lazy(() => import('../pages/hospitaladmin/HospitalAdminDashboard'));
const ClinicDashboard = React.lazy(() => import('../pages/hospitaladmin/ClinicDashboard'));
const HospitalLogin = React.lazy(() => import('../pages/hospitaladmin/HospitalLogin'));
const HospitalAdminQuestionLibrary = React.lazy(() => import('../pages/hospitaladmin/HospitalAdminQuestionLibrary'));
const DocumentTemplates = React.lazy(() => import('../pages/hospitaladmin/DocumentTemplates'));

// Cashier Routing
const CashierDashboard = React.lazy(() => import('../pages/cashier/CashierDashboard'));

// Legacy Admin Auth (keep for backward-compat)
const AdminLogin = React.lazy(() => import('../pages/administration/AdminLogin'));
const AdminSignup = React.lazy(() => import('../pages/administration/AdminSignup'));

// Lab Pages
const LabDashboard = React.lazy(() => import('../pages/lab/LabDashboard'));
const AssignedTests = React.lazy(() => import('../pages/lab/AssignedTests'));
const CompletedReports = React.lazy(() => import('../pages/lab/CompletedReports'));
const LabOrders = React.lazy(() => import('../pages/lab/LabOrders'));
const SampleCollection = React.lazy(() => import('../pages/lab/SampleCollection'));
const TestProcessing = React.lazy(() => import('../pages/lab/TestProcessing'));
const CompletedReportsDetails = React.lazy(() => import('../pages/lab/CompletedReports'));

// Pharmacy Management Pages
const PharmacyInventory = React.lazy(() => import('../pages/pharmacy/PharmacyInventory'));
const PharmacyOrders = React.lazy(() => import('../pages/pharmacy/PharmacyOrders'));
const PharmacyPurchaseApprovals = React.lazy(() => import('../pages/pharmacy/PharmacyPurchaseApprovals'));

// Reception Pages
const ReceptionDashboard = React.lazy(() => import('../pages/reception/ReceptionDashboard'));

// Accountant / Finance Pages
const AccountantDashboard = React.lazy(() => import('../pages/accountant/AccountantDashboard'));
const OutstandingPayments = React.lazy(() => import('../pages/accountant/OutstandingPayments'));
const InsuranceClaims = React.lazy(() => import('../pages/accountant/InsuranceClaims'));
const ExpensesPage = React.lazy(() => import('../pages/accountant/ExpensesPage'));
const ProfitLoss = React.lazy(() => import('../pages/accountant/ProfitLoss'));
const FinancialStatements = React.lazy(() => import('../pages/accountant/FinancialStatements'));
const Reconciliation = React.lazy(() => import('../pages/accountant/Reconciliation'));
const TransactionLogs = React.lazy(() => import('../pages/accountant/TransactionLogs'));
const FinancialAuditCenter = React.lazy(() => import('../pages/accountant/FinancialAuditCenter'));
const PayrollManagement = React.lazy(() => import('../pages/accountant/PayrollManagement'));
const DoctorPayouts = React.lazy(() => import('../pages/accountant/DoctorPayouts'));
const DiscountApprovals = React.lazy(() => import('../pages/accountant/DiscountApprovals'));
const ReceptionCollections = React.lazy(() => import('../pages/finance/ReceptionCollections'));

// Billing Pages
const BillingDashboard = React.lazy(() => import('../pages/billing/BillingDashboard'));
const InsuranceBilling = React.lazy(() => import('../pages/billing/InsuranceBilling'));
const IPDSettlement = React.lazy(() => import('../pages/billing/IPDSettlement'));
const ReceiptReprint = React.lazy(() => import('../pages/billing/ReceiptReprint'));
const DiscountsAdjustments = React.lazy(() => import('../pages/billing/DiscountsAdjustments'));

// Administrator Pages
const LaboratoryManagement = React.lazy(() => import('../pages/admin/LaboratoryManagement'));
const PharmacyManagement = React.lazy(() => import('../pages/admin/PharmacyManagement'));
const AuditLogs = React.lazy(() => import('../pages/admin/AuditLogs'));
const ResourceManagement = React.lazy(() => import('../pages/admin/ResourceManagement'));
const AdmissionsOversight = React.lazy(() => import('../pages/admin/AdmissionsOversight'));
const PatientFlow = React.lazy(() => import('../pages/admin/PatientFlow'));

// Subdomains reserved for the platform itself — NOT hospital slugs
const RESERVED_SUBDOMAINS = ['admin', 'www', 'api'];

const SmartLogin = () => {
    const { isAuthenticated, isRestoring } = useAuth();
    const subdomain = getSubdomain();

    window.__authLogger?.('SmartLogin evaluated', { isAuthenticated, isRestoring, subdomain });

    // Redirect to admin subdomain if accessing login from base domain in production
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const hostname = window.location.hostname;
            const isBaseBoonkies = hostname === 'boonkies.com' || hostname === 'www.boonkies.com';
            const isBaseMedical = hostname === 'medicalhms.in' || hostname === 'www.medicalhms.in';
            
            if (isBaseBoonkies) {
                window.__authLogger?.('SmartLogin redirecting to admin subdomain (boonkies)');
                window.location.href = `https://admin.boonkies.com/login${window.location.search}`;
            } else if (isBaseMedical) {
                window.__authLogger?.('SmartLogin redirecting to admin subdomain (medicalhms)');
                window.location.href = `https://admin.medicalhms.in/login${window.location.search}`;
            }
        }
    }, []);

    // If already authenticated, redirect to dashboard instead of showing login
    // (removed the previous auto-logout behavior which was causing unintended logouts)
    if (isAuthenticated) {
        window.__authLogger?.('SmartLogin Redirect triggered to dashboard because isAuthenticated is true');
        return <SmartDashboardRedirector />;
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
    window.__authLogger?.('SmartDashboardRedirector evaluated', { subdomain });
    if (subdomain && !RESERVED_SUBDOMAINS.includes(subdomain)) return <Navigate to="/my-dashboard" replace />;
    return <Navigate to="/supremeadmin" replace />;
};




const SubdomainRoleGuard = ({ children }) => {
    const { user, isAuthenticated, isRestoring } = useAuth();
    const subdomain = getSubdomain();
    const location = useLocation();

    // Trace logging
    window.__authLogger?.('SubdomainRoleGuard evaluated', { subdomain, isAuthenticated, isRestoring, role: user?.role, userSubdomain: user?.subdomain });

    // NEVER make a redirect or routing decision while session restoration is active
    if (isRestoring) {
        console.debug(`[SUBDOMAIN ROLE GUARD] Session is still restoring. Suppressing redirect. Route: ${location.pathname}`);
        return null;
    }

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
            const targetUrl = `${window.location.protocol}//${targetHost}${port}/supremeadmin`;
            window.__authLogger?.('SubdomainRoleGuard redirecting central admin to admin.* subdomain', { targetUrl });
            window.location.href = targetUrl;
            return null;
        }

        // Hospital staff / hospital admin must NOT operate from admin.* subdomain
        if (!isCentralRole && isAdminSubdomain) {
            // Resolve the infinite redirect loop:
            // Instead of redirecting to /login on the admin subdomain (which redirects to /supremeadmin and loops),
            // redirect the user directly to their designated hospital tenant subdomain.
            if (user.subdomain) {
                const hostname = window.location.hostname;
                const port = window.location.port ? `:${window.location.port}` : '';
                const cleanHost = hostname.replace('admin.', '');
                const targetUrl = `${window.location.protocol}//${user.subdomain}.${cleanHost}${port}/my-dashboard`;
                window.__authLogger?.('SubdomainRoleGuard redirecting hospital staff to tenant subdomain', { targetUrl });
                window.location.href = targetUrl;
                return null;
            } else {
                window.__authLogger?.('SubdomainRoleGuard redirecting hospital staff to /login (no user subdomain configured)');
                return <Navigate to="/login" replace />;
            }
        }
    }

    return children;
};

const PageLoader = () => (
    <div className="hospital-login-loading" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
        <div className="hospital-login-spinner"></div>
        <p style={{ marginTop: '16px', color: '#64748b', fontSize: '14px' }}>Loading page...</p>
    </div>
);

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
                    <React.Suspense fallback={<PageLoader />}>
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
                    </React.Suspense>
                  </SubdomainRoleGuard>
                </DashboardLayout>
            ) : (
                <React.Suspense fallback={<PageLoader />}>
                  <Routes>
                    {/* Unified Smart Login URL - Reads current domain/subdomain natively */}
                    <Route path="/login" element={<SmartLogin />} />
                    
                    {/* Legacy/Signups routing */}
                    <Route path="/signup" element={<Signup />} />
                    <Route path="/supremeadmin/signup" element={<CentralAdminSignup />} />
                    <Route path="/admin/signup" element={<AdminSignup />} />
                    <Route path="*" element={<Navigate to="/login" />} />
                  </Routes>
                </React.Suspense>
            )}
        </>
    );
};

export default MainRoutes;
