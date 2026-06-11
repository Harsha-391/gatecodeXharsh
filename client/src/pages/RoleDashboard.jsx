import React from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
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
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    // Hospital Admin (role='admin') goes directly to the full AdminMainDashboard
    const role = (user.role || '').toLowerCase();
    if (role === 'admin' || role === 'hospitaladmin') {
        return <Navigate to="/admin" replace />;
    }

    // Receptionist goes directly to the Reception Dashboard (skip welcome screen)
    const rawNavLinks = user.navLinks || [];
    const hasReceptionLink = rawNavLinks.some(l => String(l.path || '').includes('reception/dashboard'));
    if (role === 'reception' || role === 'receptionist' || role === 'receptiondeskmanager' || hasReceptionLink) {
        return <Navigate to="/reception/dashboard" replace />;
    }

    // Process and self-heal navLinks for billing roles to guarantee Refunds link works
    let navLinks = [...rawNavLinks];
    const billingRoles = ['cashier', 'billing', 'billing executive', 'billing manager', 'senior billing officer'];
    const isBillingRole = billingRoles.includes(role) || user.permissions?.includes('billing_view');

    if (isBillingRole) {
        let standardBillingLinks = [];
        if (role === 'accountant') {
            standardBillingLinks = [
                { label: 'Dashboard', path: '/billing/dashboard' },
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
                { label: 'Payment Collection', path: '/billing/collect' },
                { label: 'Payment History', path: '/billing/history' },
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

    const permissions = user.permissions || [];

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
