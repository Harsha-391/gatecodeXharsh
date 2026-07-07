import React, { useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth, useAppDispatch } from '../store/hooks';
import { updateUser } from '../store/slices/authSlice';
import { authAPI } from '../utils/api';
import './RoleDashboard.css';

// Icon mapping — maps common path keywords to emojis
const getIconForPath = (path, label) => {
    const text = `${path} ${label}`.toLowerCase();
    if (text.includes('patient')) return '🩺';
    if (text.includes('doctor')) return '👨‍⚕️';
    if (text.includes('appointment')) return '📅';
    if (text.includes('lab') || text.includes('test')) return '🧪';
    if (text.includes('pharmacy') || text.includes('medicine') || text.includes('inventory')) return '💊';
    if (text.includes('order')) return '📦';
    if (text.includes('reception') || text.includes('front')) return '🏥';
    if (text.includes('report')) return '📊';
    if (text.includes('dashboard') || text.includes('home')) return '🏠';
    if (text.includes('admin') || text.includes('manage')) return '⚙️';
    if (text.includes('role') || text.includes('permission')) return '🔑';
    if (text.includes('service')) return '🛠️';
    if (text.includes('billing') || text.includes('payment') || text.includes('refund')) return '💳';
    if (text.includes('user') || text.includes('staff')) return '👥';
    if (text.includes('setting')) return '⚙️';
    return '📋';
};

// Generate a description based on the label
const getDescForLink = (label) => {
    const text = label.toLowerCase();
    if (text.includes('patient')) return 'View and manage patient records';
    if (text.includes('doctor')) return 'Manage doctor profiles and schedules';
    if (text.includes('appointment')) return 'Schedule and manage appointments';
    if (text.includes('lab') && text.includes('test')) return 'View and process lab test requests';
    if (text.includes('lab')) return 'Access the laboratory dashboard';
    if (text.includes('inventory')) return 'Manage medicine stock and inventory';
    if (text.includes('order')) return 'Process and track pharmacy orders';
    if (text.includes('reception')) return 'Manage front desk operations';
    if (text.includes('report')) return 'View and download reports';
    if (text.includes('dashboard')) return 'View your overview and stats';
    if (text.includes('role')) return 'Manage roles and permissions';
    if (text.includes('service')) return 'Configure hospital services';
    if (text.includes('staff') || text.includes('user')) return 'Manage staff accounts';
    if (text.includes('refund')) return 'Access Refunds';
    return `Access ${label}`;
};

const RoleDashboard = () => {
    const navigate = useNavigate();
    const dispatch = useAppDispatch();
    const { user: authUser } = useAuth();
    const user = authUser || {};

    // Fetch and sync the profile on mount to guarantee up-to-date permissions/custom permissions
    useEffect(() => {
        const syncProfile = async () => {
            try {
                const res = await authAPI.getProfile();
                if (res.success && res.user) {
                    dispatch(updateUser(res.user));
                }
            } catch (err) {
                console.error('Failed to sync profile on RoleDashboard mount:', err);
            }
        };
        syncProfile();
    }, [dispatch]);

    // Hospital Admin (role='admin') goes directly to the full AdminMainDashboard
    const role = (user.role || '').toLowerCase();
    if (role === 'clinicadmin') {
        return <Navigate to="/clinicadmin" replace />;
    }
    if (role === 'hospitaladmin' && user.clinicType === 'clinic') {
        return <Navigate to="/clinicadmin" replace />;
    }
    if (role === 'admin' || role === 'hospitaladmin') {
        return <Navigate to="/admin" replace />;
    }
    if (role === 'centraladmin' || role === 'superadmin') {
        return <Navigate to="/supremeadmin" replace />;
    }
    if (role === 'accountant') {
        return <Navigate to="/accountant/dashboard" replace />;
    }

    const userPermissions = user.effectivePermissions || user.permissions || [];

    // Receptionist goes directly to the Reception Dashboard (skip welcome screen)
    const rawNavLinks = user.navLinks || [];
    const hasReceptionLink = rawNavLinks.some(l => String(l.path || '').includes('reception/dashboard'));
    if (role === 'reception' || role === 'receptionist' || role === 'receptiondeskmanager' || hasReceptionLink) {
        return <Navigate to="/reception/dashboard" replace />;
    }

    // Billing / Cashier roles go directly to the Billing Dashboard (skip welcome screen)
    const billingRoles = ['cashier', 'billing', 'billing executive', 'billing manager', 'senior billing officer'];
    const isBillingRole = billingRoles.includes(role) || role.includes('billing') || role.includes('cashier');
    if (isBillingRole) {
        return <Navigate to="/billing/dashboard" replace />;
    }

    // Process and self-heal navLinks for billing roles to guarantee Refunds link works
    let navLinks = [...rawNavLinks];

    // Dynamically append permission-based links for non-administrator/accountant roles
    const extraItems = [];
    // Core billing pages — accessible with billing_view or billing_manage or specific page permissions
    if (userPermissions.includes('billing_view') || userPermissions.includes('billing_manage')) {
        extraItems.push({ label: 'Billing Dashboard', path: '/billing/dashboard' });
    }
    if (userPermissions.includes('billing_patient') || userPermissions.includes('billing_view') || userPermissions.includes('billing_manage')) {
        extraItems.push({ label: 'Patient Billing', path: '/billing/patient' });
    }
    if (userPermissions.includes('billing_pending') || userPermissions.includes('billing_view') || userPermissions.includes('billing_manage')) {
        extraItems.push({ label: 'Pending Payments', path: '/billing/pending' });
    }
    if (userPermissions.includes('billing_invoices') || userPermissions.includes('billing_view') || userPermissions.includes('billing_manage')) {
        extraItems.push({ label: 'Invoices', path: '/billing/invoices' });
    }
    if (userPermissions.includes('billing_templates') || userPermissions.includes('billing_view') || userPermissions.includes('billing_manage')) {
        extraItems.push({ label: 'Invoice Templates', path: '/billing/templates' });
    }
    if (userPermissions.includes('billing_settings') || userPermissions.includes('billing_view') || userPermissions.includes('billing_manage')) {
        extraItems.push({ label: 'Settings', path: '/billing/settings' });
    }
    // Specific billing sub-pages — each requires its own dedicated permission
    if (userPermissions.includes('billing_refund')) {
        extraItems.push({ label: 'Refunds', path: '/billing/refunds' });
    }
    if (userPermissions.includes('billing_insurance')) {
        extraItems.push({ label: 'Insurance Billing', path: '/billing/insurance' });
    }
    if (userPermissions.includes('billing_ipd_settlement')) {
        extraItems.push({ label: 'IPD Settlement', path: '/billing/ipd-settlement' });
    }
    if (userPermissions.includes('billing_receipt_reprint')) {
        extraItems.push({ label: 'Receipt Reprint', path: '/billing/receipt-reprint' });
    }
    if (userPermissions.includes('billing_discounts')) {
        extraItems.push({ label: 'Discounts & Adjustments', path: '/billing/discounts' });
    }
    if (userPermissions.includes('billing_reports')) {
        extraItems.push({ label: 'Revenue Reports', path: '/billing/reports' });
    }
    if (userPermissions.includes('billing_analytics')) {
        extraItems.push({ label: 'Billing Analytics', path: '/billing/analytics' });
    }
    if (userPermissions.includes('finance_reception_collections')) {
        extraItems.push({ label: 'Reception Collections', path: '/finance/reception-collections' });
    }
    // Accountant workspace — each page requires its own specific permission
    if (userPermissions.includes('accountant_view') || userPermissions.includes('finance_view')) {
        extraItems.push({ label: 'Accountant Dashboard', path: '/accountant/dashboard' });
    }
    if (userPermissions.includes('billing_reports') || userPermissions.includes('finance_view')) {
        extraItems.push({ label: 'Revenue Reports', path: '/billing/reports' });
    }
    if (userPermissions.includes('billing_analytics') || userPermissions.includes('finance_view')) {
        extraItems.push({ label: 'Billing Analytics', path: '/billing/analytics' });
    }
    if (userPermissions.includes('billing_discounts') || userPermissions.includes('finance_view')) {
        extraItems.push({ label: 'Discount Approvals', path: '/accountant/discount-approvals' });
    }
    if (userPermissions.includes('finance_outstanding')) {
        extraItems.push({ label: 'Outstanding Payments', path: '/accountant/outstanding' });
    }
    if (userPermissions.includes('finance_claims')) {
        extraItems.push({ label: 'Insurance Claims', path: '/accountant/claims' });
    }
    if (userPermissions.includes('finance_expenses')) {
        extraItems.push({ label: 'Expenses', path: '/accountant/expenses' });
    }
    if (userPermissions.includes('finance_profit_loss')) {
        extraItems.push({ label: 'Profit & Loss', path: '/accountant/profit-loss' });
    }
    if (userPermissions.includes('finance_statements')) {
        extraItems.push({ label: 'Financial Statements', path: '/accountant/statements' });
    }
    if (userPermissions.includes('finance_reconciliation')) {
        extraItems.push({ label: 'Reconciliation', path: '/accountant/reconciliation' });
    }
    if (userPermissions.includes('finance_payroll')) {
        extraItems.push({ label: 'Payroll Management', path: '/accountant/payroll' });
    }
    if (userPermissions.includes('finance_doctor_payouts')) {
        extraItems.push({ label: 'Doctor Payouts', path: '/accountant/doctor-payouts' });
    }
    if (userPermissions.includes('finance_audit')) {
        extraItems.push({ label: 'Audit Logs', path: '/accountant/audit-logs' });
    }
    if (userPermissions.includes('finance_transactions')) {
        extraItems.push({ label: 'Transaction Logs', path: '/accountant/transactions' });
    }
    if (userPermissions.includes('lab_view') || userPermissions.includes('lab_manage')) {
        extraItems.push(
            { label: 'Lab Dashboard', path: '/lab/dashboard' },
            { label: 'Lab Orders', path: '/lab/orders' },
            { label: 'Sample Collection', path: '/lab/sample-collection' },
            { label: 'Test Processing', path: '/lab/processing' },
            { label: 'Lab Reports', path: '/lab/completed' }
        );
    } else if (userPermissions.includes('lab_reports_view')) {
        extraItems.push(
            { label: 'Lab Reports', path: '/lab/completed' }
        );
    }
    if (userPermissions.includes('pharmacy_view') || userPermissions.includes('pharmacy_manage')) {
        extraItems.push(
            { label: 'Pharma Inventory', path: '/pharmacy/inventory' },
            { label: 'Pharmacy Orders', path: '/pharmacy/orders' },
            { label: 'Purchase Approvals', path: '/pharmacy/purchase-approvals' }
        );
    }
    if (userPermissions.includes('appointment_manage') || userPermissions.includes('appointment_view_all') || userPermissions.includes('patient_create')) {
        extraItems.push(
            { label: 'Reception Dashboard', path: '/reception/dashboard' },
            { label: 'Appointments/Booking', path: '/appointment' }
        );
    }
    if (userPermissions.includes('patient_monitor')) {
        extraItems.push(
            { label: 'Patient Flow', path: '/admin/patient-flow' }
        );
    }
    if (userPermissions.includes('admission_manage')) {
        extraItems.push(
            { label: 'Admissions', path: '/admin/admissions' }
        );
    }
    if (userPermissions.includes('visit_diagnose')) {
        extraItems.push(
            { label: 'My Patients', path: '/doctor/dashboard' }
        );
    }
    if (userPermissions.includes('inventory_view')) {
        extraItems.push(
            { label: 'Inventory Monitoring', path: '/admin/inventory' }
        );
    }
    if (userPermissions.includes('resource_manage')) {
        extraItems.push(
            { label: 'Resource Management', path: '/admin/resources' }
        );
    }

    // De-duplicate extra items by path or label, and add them to navLinks
    extraItems.forEach(item => {
        const hasPath = navLinks.some(b => b.path === item.path);
        const hasLabel = navLinks.some(b => b.label === item.label);
        if (!hasPath && !hasLabel) {
            navLinks.push(item);
        }
    });

    if (isBillingRole) {
        let standardBillingLinks = [];
        if (role === 'accountant') {
            standardBillingLinks = [
                { label: 'Dashboard', path: '/accountant/dashboard' },
                { label: 'Revenue Reports', path: '/billing/reports' },
                { label: 'Billing Analytics', path: '/billing/analytics' },
                { label: 'Invoice Templates', path: '/billing/templates' },
                { label: 'Settings', path: '/billing/settings' }
            ];
        } else {
            standardBillingLinks = [
                { label: 'Dashboard', path: '/billing/dashboard' },
                { label: 'Patient Billing', path: '/billing/patient' },
                { label: 'Pending Payments', path: '/billing/pending' },
                { label: 'Invoices', path: '/billing/invoices' },
                { label: 'Refunds', path: '/billing/refunds' },
                { label: 'Invoice Templates', path: '/billing/templates' },
                { label: 'Settings', path: '/billing/settings' }
            ];
        }

        const mergedLinks = [...navLinks];
        standardBillingLinks.forEach(std => {
            const existingIdx = mergedLinks.findIndex(link => 
                link.label === std.label || 
                link.path === std.path || 
                (link.label === 'Refunds' && link.path === '/billing/log-out')
            );
            if (existingIdx !== -1) {
                // Correct path if it was incorrect (e.g. log-out typo)
                if (mergedLinks[existingIdx].path !== std.path) {
                    mergedLinks[existingIdx] = { ...mergedLinks[existingIdx], path: std.path };
                }
            } else {
                mergedLinks.push(std);
            }
        });
        navLinks = mergedLinks;
    }

    if (role === 'accountant') {
        navLinks = navLinks.filter(l => 
            !['patient billing', 'pending payments', 'invoices', 'payment collection', 'payment history', 'refunds', 'bed management', 'bed management desk', 'hospital operations center', 'operations center'].includes(l.label?.toLowerCase()) &&
            !l.label?.toLowerCase().includes('role') && 
            !l.path?.toLowerCase().includes('roles')
        );
    } else if (billingRoles.includes(role) || role === 'reception' || role === 'receptionist') {
        navLinks = navLinks.filter(l => 
            !['revenue reports', 'billing analytics'].includes(l.label?.toLowerCase())
        );
    }

    const userName = user.name || 'Staff';
    const roleName = user.role || 'Staff';

    const permissions = userPermissions;

    // Get time-based greeting
    const hour = new Date().getHours();
    let greeting = 'Good morning';
    if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
    else if (hour >= 17) greeting = 'Good evening';

    return (
        <div className="role-dashboard">
            <div className="dashboard-container">
                {/* Welcome Hero */}
                <div className="welcome-hero">
                    <span className="welcome-emoji">👋</span>
                    <div className="role-badge-large">{roleName}</div>
                    <h1>{greeting}, <span>{userName}</span></h1>
                    <p>Here's your workspace. Pick any section to get started.</p>
                </div>

                {/* Quick Access Cards */}
                {navLinks.length > 0 ? (
                    <>
                        <div className="section-title">⚡ Quick Access</div>
                        <div className="nav-cards-grid">
                            {navLinks.map((link, index) => (
                                <div
                                    key={index}
                                    className="nav-card"
                                    onClick={() => navigate(link.path)}
                                >
                                    <div className="nav-card-icon">
                                        {getIconForPath(link.path, link.label)}
                                    </div>
                                    <div className="nav-card-content">
                                        <h3>{link.label}</h3>
                                        <p>{getDescForLink(link.label)}</p>
                                    </div>
                                    <span className="nav-card-arrow">→</span>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <div className="empty-state">
                        <span className="empty-icon">📭</span>
                        <h3>No pages assigned yet</h3>
                        <p>Contact your superadmin to set up navigation links for your role.</p>
                    </div>
                )}

                {/* Permissions Preview */}
                {permissions.length > 0 && (
                    <div className="permissions-section">
                        <h3>🔐 Your Permissions</h3>
                        <div className="perm-tags">
                            {permissions.map((perm, i) => (
                                <span key={i} className="perm-tag">
                                    {perm.replace(/_/g, ' ')}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RoleDashboard;
