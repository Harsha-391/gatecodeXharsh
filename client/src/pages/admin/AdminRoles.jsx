import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../../utils/api';
import './AdminRoles.css';

const CATEGORY_META = {
    "Patient Management":        { icon: '🧑‍⚕️', color: '#6366f1', bg: '#eef2ff' },
    "Clinical & Medical":        { icon: '🩺', color: '#10b981', bg: '#ecfdf5' },
    "Operations":                { icon: '⚙️', color: '#f59e0b', bg: '#fffbeb' },
    "Finance & Accounting":      { icon: '💰', color: '#ef4444', bg: '#fef2f2' },
    "Patient Billing & Cashier": { icon: '🧾', color: '#8b5cf6', bg: '#f5f3ff' },
    "Admin":                     { icon: '🛡️', color: '#0ea5e9', bg: '#f0f9ff' },
};

const AdminRoles = () => {
    const navigate = useNavigate();
    const [roles, setRoles] = useState([]);
    const [formData, setFormData] = useState({
        name: '', description: '', permissions: [],
        dashboardPath: '/', navLinks: [{ label: '', path: '' }]
    });
    const [editingRoleId, setEditingRoleId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [showSaveSuccess, setShowSaveSuccess] = useState(false);
    const [successPopupMsg, setSuccessPopupMsg] = useState('');
    const [expandedCategories, setExpandedCategories] = useState({});

    const PERMISSIONS = [
        {
            category: "Patient Management", items: [
                { key: 'patient_create', label: 'Register New Patients' },
                { key: 'patient_search', label: 'Search Patient Database' },
                { key: 'patient_view', label: 'View Patient Profiles' },
                { key: 'patient_edit', label: 'Edit Patient Profiles' }
            ]
        },
        {
            category: "Clinical & Medical", items: [
                { key: 'visit_intake', label: 'Nurse Intake (Vitals & History)' },
                { key: 'visit_diagnose', label: 'Doctor Diagnosis & Prescription' },
                { key: 'clinical_history_view', label: 'View Medical History' }
            ]
        },
        {
            category: "Operations", items: [
                { key: 'appointment_manage', label: 'Manage Appointments' },
                { key: 'appointment_view_all', label: 'View All Appointments' },
                { key: 'lab_view', label: 'View Lab Tests' },
                { key: 'lab_manage', label: 'Manage Lab Tests' },
                { key: 'lab_reports_view', label: 'View Lab Reports' },
                { key: 'pharmacy_view', label: 'View Pharmacy' },
                { key: 'pharmacy_manage', label: 'Pharmacy & Inventory' },
                { key: 'patient_monitor', label: 'Monitor Patients & Queues' },
                { key: 'admission_manage', label: 'Manage Admissions & Beds' },
                { key: 'inventory_view', label: 'View Inventory Monitoring' },
                { key: 'resource_manage', label: 'Manage Assets & Equipment' },
                { key: 'reports_view', label: 'View Operational Reports' }
            ]
        },
        {
            category: "Finance & Accounting", items: [
                { key: 'finance_view', label: 'View Hospital Financials' },
                { key: 'finance_outstanding', label: 'Manage Outstanding Payments' },
                { key: 'finance_claims', label: 'Manage Insurance Claims' },
                { key: 'finance_reception_collections', label: 'Monitor Reception Collections' },
                { key: 'finance_expenses', label: 'Track Expenses' },
                { key: 'finance_profit_loss', label: 'View Profit & Loss Statements' },
                { key: 'finance_statements', label: 'View Financial Statements' },
                { key: 'finance_reconciliation', label: 'Perform Bank Reconciliation' },
                { key: 'finance_transactions', label: 'View Transaction Logs' },
                { key: 'finance_audit', label: 'Access Financial Audit Center' },
                { key: 'finance_payroll', label: 'Manage Staff Payroll' },
                { key: 'finance_doctor_payouts', label: 'Manage Doctor Payouts' }
            ]
        },
        {
            category: "Patient Billing & Cashier", items: [
                { key: 'billing_view', label: 'View Patient Billing Dashboard' },
                { key: 'billing_manage', label: 'Manage Billing Records' },
                { key: 'billing_collect_payment', label: 'Collect Payments / Cashier' },
                { key: 'billing_generate_invoice', label: 'Generate Bills & Invoices' },
                { key: 'billing_print_invoice', label: 'Print Invoices & Receipts' },
                { key: 'billing_refund', label: 'Process Refunds' },
                { key: 'billing_reports', label: 'View Billing Reports' },
                { key: 'billing_analytics', label: 'Access Billing Analytics' },
                { key: 'billing_insurance', label: 'Process Insurance Billing' },
                { key: 'billing_ipd_settlement', label: 'Manage IPD Bill Settlement' },
                { key: 'billing_receipt_reprint', label: 'Reprint Receipts' },
                { key: 'billing_discounts', label: 'Apply Discounts & Adjustments' }
            ]
        },
        {
            category: "Admin", items: [
                { key: 'staff_manage', label: 'Staff Roster Management (Add/Edit Staff)' },
                { key: 'doctor_manage', label: 'Doctors Feed & Slot Settings' },
                { key: 'lab_tests_manage', label: 'Lab Tests Catalog & Laboratory Management' },
                { key: 'pharmacy_admin_manage', label: 'Pharmacy Administrative Oversight & Approvals' },
                { key: 'reception_admin_manage', label: 'Reception Queues & Services Catalog' },
                { key: 'question_library_manage', label: 'Question Library & Custom Templates' },
                { key: 'admin_manage_roles', label: 'Manage Roles & Access Control' },
                { key: 'admin_view_stats', label: 'View Admin Overview Stats' },
                { key: 'audit_logs_view', label: 'View Complete System Audit Logs' }
            ]
        }
    ];

    const PERMISSION_NAV_MAP = {
        patient_create: { label: 'Patient Registration', path: '/reception/dashboard' },
        patient_search: { label: 'Patient Search', path: '/doctor/patients' },
        patient_view: { label: 'Patient Records', path: '/doctor/patients' },
        patient_edit: { label: 'Edit Patients', path: '/doctor/patients' },
        visit_intake: { label: 'Nurse Intake', path: '/doctor/patients' },
        visit_diagnose: { label: 'Consultations', path: '/doctor/patients' },
        clinical_history_view: { label: 'Medical History', path: '/doctor/patients' },
        appointment_manage: { label: 'Reception', path: '/reception/dashboard' },
        appointment_view_all: { label: 'All Appointments', path: '/reception/dashboard' },
        lab_view: { label: 'Lab Dashboard', path: '/lab/dashboard' },
        lab_manage: { label: 'Lab Tests', path: '/lab/tests' },
        lab_reports_view: { label: 'Lab Reports', path: '/lab/completed' },
        pharmacy_view: { label: 'Pharmacy', path: '/pharmacy/inventory' },
        pharmacy_manage: { label: 'Pharmacy Orders', path: '/pharmacy/orders' },
        patient_monitor: { label: 'Patient Flow', path: '/admin/patient-flow' },
        admission_manage: { label: 'Admissions', path: '/admin/admissions' },
        inventory_view: { label: 'Inventory', path: '/admin/inventory' },
        resource_manage: { label: 'Resources', path: '/admin/resources' },
        reports_view: { label: 'Reports', path: '/admin/reports' },
        admin_manage_roles: { label: 'Manage Users', path: '/admin/users' },
        admin_view_stats: { label: 'Admin Dashboard', path: '/admin' },
        finance_view: { label: 'Finance', path: '/accountant/dashboard' },
        finance_outstanding: { label: 'Outstanding Payments', path: '/accountant/outstanding' },
        finance_claims: { label: 'Insurance Claims', path: '/accountant/claims' },
        finance_reception_collections: { label: 'Reception Collections', path: '/finance/reception-collections' },
        finance_expenses: { label: 'Expenses', path: '/accountant/expenses' },
        finance_profit_loss: { label: 'Profit & Loss', path: '/accountant/profit-loss' },
        finance_statements: { label: 'Financial Statements', path: '/accountant/statements' },
        finance_reconciliation: { label: 'Reconciliation', path: '/accountant/reconciliation' },
        finance_transactions: { label: 'Transactions', path: '/accountant/transactions' },
        finance_audit: { label: 'Audit Center', path: '/accountant/audit-logs' },
        finance_payroll: { label: 'Payroll', path: '/accountant/payroll' },
        finance_doctor_payouts: { label: 'Doctor Payouts', path: '/accountant/doctor-payouts' },
        billing_view: { label: 'Patient Billing', path: '/billing/patient' },
        billing_manage: { label: 'Billing Manage', path: '/billing/patient' },
        billing_collect_payment: { label: 'Collect Payment', path: '/billing/collect' },
        billing_generate_invoice: { label: 'Invoices', path: '/billing/invoices' },
        billing_print_invoice: { label: 'Print Invoice', path: '/billing/receipt-reprint' },
        billing_refund: { label: 'Refunds', path: '/billing/refunds' },
        billing_reports: { label: 'Revenue Reports', path: '/billing/reports' },
        billing_analytics: { label: 'Billing Analytics', path: '/billing/analytics' },
        billing_insurance: { label: 'Insurance Billing', path: '/billing/insurance' },
        billing_ipd_settlement: { label: 'IPD Settlement', path: '/billing/ipd-settlement' },
        billing_receipt_reprint: { label: 'Receipt Reprint', path: '/billing/receipt-reprint' },
        billing_discounts: { label: 'Discounts', path: '/billing/discounts' }
    };

    const getAutoNavLinks = (permissions) => {
        const seen = new Set();
        const links = [];
        permissions.forEach(perm => {
            const mapping = PERMISSION_NAV_MAP[perm];
            if (mapping && !seen.has(mapping.label)) {
                seen.add(mapping.label);
                links.push({ label: mapping.label, path: mapping.path });
            }
        });
        if (permissions.includes('admin_manage_roles') && !seen.has('Manage Roles')) {
            links.push({ label: 'Manage Roles', path: '/admin/roles' });
        }
        return links;
    };

    useEffect(() => { fetchRoles(); }, []);

    const fetchRoles = async () => {
        try {
            const res = await adminAPI.getRoles();
            if (res.success) setRoles(res.data);
        } catch (err) {
            console.error("Error fetching roles", err);
        }
    };

    const handlePermissionToggle = (key) => {
        setFormData(prev => {
            const exists = prev.permissions.includes(key);
            return {
                ...prev,
                permissions: exists ? prev.permissions.filter(p => p !== key) : [...prev.permissions, key]
            };
        });
    };

    const toggleCategory = (category) => {
        setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
    };

    const toggleAllInCategory = (category, items) => {
        const keys = items.map(i => i.key);
        const allChecked = keys.every(k => formData.permissions.includes(k));
        setFormData(prev => ({
            ...prev,
            permissions: allChecked
                ? prev.permissions.filter(p => !keys.includes(p))
                : [...new Set([...prev.permissions, ...keys])]
        }));
    };

    const addNavLink = () => {
        setFormData(prev => ({ ...prev, navLinks: [...prev.navLinks, { label: '', path: '' }] }));
    };

    const updateNavLink = (index, field, value) => {
        const updated = [...formData.navLinks];
        updated[index][field] = value;
        setFormData(prev => ({ ...prev, navLinks: updated }));
    };

    const removeNavLink = (index) => {
        const updated = formData.navLinks.filter((_, i) => i !== index);
        setFormData(prev => ({ ...prev, navLinks: updated }));
    };

    const resetForm = () => {
        setFormData({ name: '', description: '', permissions: [], dashboardPath: '/', navLinks: [{ label: '', path: '' }] });
        setEditingRoleId(null);
        setMessage({ type: '', text: '' });
    };

    const handleEdit = (role) => {
        setEditingRoleId(role._id);
        setFormData({
            name: role.name,
            description: role.description || '',
            permissions: role.permissions || [],
            dashboardPath: role.dashboardPath || '/',
            navLinks: role.navLinks && role.navLinks.length > 0 ? role.navLinks : [{ label: '', path: '' }]
        });
        setMessage({ type: '', text: '' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage({ type: '', text: '' });
        const manualLinks = formData.navLinks.filter(l => l.label.trim() && l.path.trim());
        const autoLinks = getAutoNavLinks(formData.permissions);
        const combinedLinks = [...manualLinks];
        autoLinks.forEach(auto => {
            if (!combinedLinks.find(c => c.path === auto.path || c.label === auto.label)) {
                combinedLinks.push(auto);
            }
        });
        const cleanedData = { ...formData, navLinks: combinedLinks };
        try {
            if (editingRoleId) {
                await adminAPI.updateRole(editingRoleId, cleanedData);
                setSuccessPopupMsg('Role has been updated successfully.');
            } else {
                await adminAPI.createRole(cleanedData);
                setSuccessPopupMsg('Role has been created successfully.');
            }
            setShowSaveSuccess(true);
            resetForm();
            fetchRoles();
        } catch (err) {
            setMessage({ type: 'error', text: err.response?.data?.message || 'Error saving role' });
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure? This will remove the role permanently.")) return;
        try {
            await adminAPI.deleteRole(id);
            fetchRoles();
        } catch (err) {
            setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to delete role' });
        }
    };

    const totalSelected = formData.permissions.length;
    const totalPerms = PERMISSIONS.reduce((acc, c) => acc + c.items.length, 0);

    return (
        <div className="ar-page">
            {/* ── Hero Header ── */}
            <div className="ar-hero">
                <div className="ar-hero-bg" />
                <div className="ar-hero-content">
                    <div className="ar-hero-top">
                        <button className="ar-back-btn" onClick={() => {
                            const user = JSON.parse(localStorage.getItem('user') || '{}');
                            const role = (user.role || '').toLowerCase();
                            navigate(role === 'superadmin' || role === 'centraladmin' ? '/supremeadmin' : '/admin');
                        }}>
                            <span>←</span> Back to Dashboard
                        </button>
                        {(() => {
                            const user = JSON.parse(localStorage.getItem('user') || '{}');
                            const role = (user.role || '').toLowerCase();
                            if (role === 'superadmin' || role === 'centraladmin') {
                                return (
                                    <button className="ar-dyn-btn" onClick={() => navigate('/supremeadmin', { state: { openTab: 'permissions' } })}>
                                        🔐 Dynamic Permissions
                                    </button>
                                );
                            }
                            return null;
                        })()}
                    </div>
                    <div className="ar-hero-title-block">
                        <div className="ar-hero-icon">🛡️</div>
                        <div>
                            <h1 className="ar-hero-h1">Role & Permission Manager</h1>
                            <p className="ar-hero-sub">Define granular access levels for every member of your hospital staff.</p>
                        </div>
                    </div>
                    <div className="ar-hero-stats">
                        <div className="ar-stat-chip">
                            <span className="ar-stat-num">{roles.length}</span>
                            <span className="ar-stat-label">Active Roles</span>
                        </div>
                        <div className="ar-stat-chip">
                            <span className="ar-stat-num">{totalPerms}</span>
                            <span className="ar-stat-label">Permissions Available</span>
                        </div>
                        <div className="ar-stat-chip">
                            <span className="ar-stat-num">{roles.reduce((s, r) => s + (r.userCount || 0), 0)}</span>
                            <span className="ar-stat-label">Total Staff</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Main Grid ── */}
            <div className="ar-grid">

                {/* ─── LEFT: Create / Edit Form ─── */}
                <div className="ar-form-card">
                    <div className="ar-form-card-header">
                        <div className="ar-form-card-title">
                            <span className="ar-form-card-icon">{editingRoleId ? '✏️' : '✨'}</span>
                            <h2>{editingRoleId ? 'Edit Role' : 'Create New Role'}</h2>
                        </div>
                        {editingRoleId && (
                            <button onClick={resetForm} className="ar-cancel-btn">✕ Cancel</button>
                        )}
                    </div>

                    {message.text && (
                        <div className={`ar-alert ar-alert-${message.type}`}>
                            {message.type === 'success' ? '✅' : '⚠️'} {message.text}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="ar-form">
                        {/* Role Name */}
                        <div className="ar-field">
                            <label className="ar-label">
                                <span className="ar-label-icon">🏷️</span> Role Name
                            </label>
                            <input
                                type="text"
                                className="ar-input"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g. Senior Nurse, Ward Manager"
                                required
                            />
                        </div>

                        {/* Description */}
                        <div className="ar-field">
                            <label className="ar-label">
                                <span className="ar-label-icon">📝</span> Description
                            </label>
                            <input
                                type="text"
                                className="ar-input"
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                placeholder="What is this role responsible for?"
                            />
                        </div>

                        {/* Dashboard Path */}
                        <div className="ar-field">
                            <label className="ar-label">
                                <span className="ar-label-icon">🗂️</span> Default Dashboard Path
                            </label>
                            <input
                                type="text"
                                className="ar-input ar-input-mono"
                                value={formData.dashboardPath}
                                onChange={e => setFormData({ ...formData, dashboardPath: e.target.value })}
                                placeholder="/reception/dashboard"
                                required
                            />
                        </div>

                        {/* Navigation Links */}
                        <div className="ar-field">
                            <label className="ar-label">
                                <span className="ar-label-icon">🔗</span> Navigation Links
                                <span className="ar-label-hint">Sidebar tabs visible to this role</span>
                            </label>
                            <div className="ar-navlinks-wrap">
                                {formData.navLinks.map((link, index) => (
                                    <div key={index} className="ar-navlink-row">
                                        <input
                                            type="text"
                                            placeholder="Label"
                                            value={link.label}
                                            onChange={e => updateNavLink(index, 'label', e.target.value)}
                                            className="ar-input ar-navlink-input"
                                        />
                                        <input
                                            type="text"
                                            placeholder="/path"
                                            value={link.path}
                                            onChange={e => updateNavLink(index, 'path', e.target.value)}
                                            className="ar-input ar-navlink-input ar-input-mono"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeNavLink(index)}
                                            className="ar-navlink-remove"
                                            title="Remove"
                                        >✕</button>
                                    </div>
                                ))}
                                <button type="button" onClick={addNavLink} className="ar-add-link-btn">
                                    + Add Navigation Link
                                </button>
                            </div>
                        </div>

                        {/* Permissions */}
                        <div className="ar-perms-section">
                            <div className="ar-perms-header">
                                <div>
                                    <span className="ar-perms-title">⚡ Assign Permissions</span>
                                    <span className="ar-perms-count">{totalSelected} / {totalPerms} selected</span>
                                </div>
                                <div className="ar-perms-progress-bar">
                                    <div className="ar-perms-progress-fill" style={{ width: `${(totalSelected / totalPerms) * 100}%` }} />
                                </div>
                            </div>

                            <div className="ar-perms-list">
                                {PERMISSIONS.map((cat) => {
                                    const meta = CATEGORY_META[cat.category] || { icon: '•', color: '#6366f1', bg: '#eef2ff' };
                                    const checkedCount = cat.items.filter(i => formData.permissions.includes(i.key)).length;
                                    const allChecked = checkedCount === cat.items.length;
                                    const isOpen = expandedCategories[cat.category] !== false; // default open
                                    return (
                                        <div key={cat.category} className="ar-perm-group">
                                            <div
                                                className="ar-perm-group-header"
                                                style={{ borderLeftColor: meta.color }}
                                                onClick={() => toggleCategory(cat.category)}
                                            >
                                                <div className="ar-perm-group-left">
                                                    <span className="ar-perm-group-icon" style={{ background: meta.bg }}>{meta.icon}</span>
                                                    <span className="ar-perm-group-name">{cat.category}</span>
                                                    <span className="ar-perm-group-badge" style={{ background: meta.bg, color: meta.color }}>
                                                        {checkedCount}/{cat.items.length}
                                                    </span>
                                                </div>
                                                <div className="ar-perm-group-right" onClick={e => e.stopPropagation()}>
                                                    <button
                                                        type="button"
                                                        className="ar-toggle-all-btn"
                                                        style={{ color: meta.color, borderColor: meta.color }}
                                                        onClick={() => toggleAllInCategory(cat.category, cat.items)}
                                                    >
                                                        {allChecked ? 'Deselect All' : 'Select All'}
                                                    </button>
                                                    <span className="ar-chevron" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
                                                </div>
                                            </div>
                                            {isOpen && (
                                                <div className="ar-perm-items">
                                                    {cat.items.map(p => {
                                                        const checked = formData.permissions.includes(p.key);
                                                        return (
                                                            <label
                                                                key={p.key}
                                                                className={`ar-perm-item ${checked ? 'ar-perm-item--checked' : ''}`}
                                                                style={checked ? { borderColor: meta.color, background: meta.bg } : {}}
                                                            >
                                                                <div
                                                                    className={`ar-checkbox ${checked ? 'ar-checkbox--on' : ''}`}
                                                                    style={checked ? { background: meta.color, borderColor: meta.color } : {}}
                                                                >
                                                                    {checked && <span>✓</span>}
                                                                </div>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={checked}
                                                                    onChange={() => handlePermissionToggle(p.key)}
                                                                    style={{ display: 'none' }}
                                                                />
                                                                <span className="ar-perm-label">{p.label}</span>
                                                                <code className="ar-perm-key">{p.key}</code>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <button type="submit" disabled={loading} className="ar-submit-btn">
                            {loading ? (
                                <><span className="ar-spinner" /> Saving...</>
                            ) : (
                                <>{editingRoleId ? '💾 Update Role' : '✨ Create Role'}</>
                            )}
                        </button>
                    </form>
                </div>

                {/* ─── RIGHT: Active Roles List ─── */}
                <div className="ar-list-card">
                    <div className="ar-list-header">
                        <div>
                            <h2 className="ar-list-title">Active Roles</h2>
                            <p className="ar-list-sub">Click ✏️ to edit any role's permissions</p>
                        </div>
                        <span className="ar-roles-badge">{roles.length} roles</span>
                    </div>

                    <div className="ar-roles-list">
                        {roles.length === 0 && (
                            <div className="ar-empty">
                                <div className="ar-empty-icon">🔐</div>
                                <p>No roles defined yet.</p>
                                <span>Create your first role using the form.</span>
                            </div>
                        )}
                        {roles.map(role => {
                            const permCount = role.permissions?.length || 0;
                            const firstLetter = role.name?.charAt(0).toUpperCase();
                            const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9'];
                            const colorIndex = role.name?.charCodeAt(0) % colors.length;
                            const roleColor = colors[colorIndex] || '#6366f1';
                            return (
                                <div key={role._id} className="ar-role-item">
                                    <div className="ar-role-avatar" style={{ background: roleColor }}>
                                        {firstLetter}
                                    </div>
                                    <div className="ar-role-body">
                                        <div className="ar-role-top">
                                            <h3 className="ar-role-name">{role.name}</h3>
                                            <div className="ar-role-badges">
                                                <span className="ar-badge ar-badge-perm">{permCount} perms</span>
                                                {role.userCount > 0 && (
                                                    <span className="ar-badge ar-badge-users">{role.userCount} user{role.userCount !== 1 ? 's' : ''}</span>
                                                )}
                                                {role.isSystemRole && (
                                                    <span className="ar-badge ar-badge-system">System</span>
                                                )}
                                            </div>
                                        </div>
                                        <p className="ar-role-desc">{role.description || 'No description provided.'}</p>
                                        {role.dashboardPath && (
                                            <div className="ar-role-path">
                                                <span>📍</span> <code>{role.dashboardPath}</code>
                                            </div>
                                        )}
                                        <div className="ar-role-tags">
                                            {(role.permissions || []).slice(0, 4).map(p => (
                                                <span key={p} className="ar-tag">{p.replace(/_/g, ' ')}</span>
                                            ))}
                                            {(role.permissions || []).length > 4 && (
                                                <span className="ar-tag ar-tag-more">+{role.permissions.length - 4} more</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="ar-role-actions">
                                        <button onClick={() => handleEdit(role)} className="ar-btn-edit" title="Edit Role">✏️</button>
                                        {!role.isSystemRole && (
                                            <button onClick={() => handleDelete(role._id)} className="ar-btn-delete" title="Delete Role">🗑</button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* ── Success Modal ── */}
            {showSaveSuccess && (
                <div className="ar-modal-overlay" onClick={() => setShowSaveSuccess(false)}>
                    <div className="ar-modal" onClick={e => e.stopPropagation()}>
                        <div className="ar-modal-icon">✓</div>
                        <h3>Changes Saved!</h3>
                        <p>{successPopupMsg}</p>
                        <button onClick={() => setShowSaveSuccess(false)} className="ar-modal-ok">OK, Got it!</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminRoles;