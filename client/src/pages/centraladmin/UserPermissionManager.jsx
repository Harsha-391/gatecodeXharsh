import React, { useState, useEffect, useMemo } from 'react';
import { adminAPI } from '../../utils/api';

// Each workspace tab maps to a sidebar section.
// Toggle cards to grant/revoke specific sidebar pages.
const WORKSPACE_PERMISSIONS = [
    {
        id: 'billing', name: 'Billing Workspace', icon: '💳',
        color: '#dc2626', bg: '#fff1f2', border: '#fecaca',
        description: 'Grant access to individual Billing Operations Center pages',
        items: [
            { key: 'billing_view', label: 'Billing Dashboard', emoji: '🏠', description: 'Unlocks the main billing dashboard.', unlocks: ['Billing Dashboard'] },
            { key: 'billing_patient', label: 'Patient Billing', emoji: '🧑‍⚕️', description: 'Access patient billing and billing entries page.', unlocks: ['Patient Billing Page'] },
            { key: 'billing_pending', label: 'Pending Payments', emoji: '⏳', description: 'View and collect pending patient payments.', unlocks: ['Pending Payments Page'] },
            { key: 'billing_invoices', label: 'Invoices', emoji: '📄', description: 'View and manage all patient invoices.', unlocks: ['Invoices Page'] },
            { key: 'billing_refund', label: 'Process Refunds', emoji: '↩️', description: 'Submit and manage patient refund requests.', unlocks: ['Refunds Page'] },
            { key: 'finance_reception_collections', label: 'Reception Collections', emoji: '🏪', description: 'Monitor daily collections at the reception desk.', unlocks: ['Reception Collections Page'] },
            { key: 'billing_insurance', label: 'Insurance Billing', emoji: '🛡️', description: 'Handle insurance claim submissions.', unlocks: ['Insurance Billing Page'] },
            { key: 'billing_ipd_settlement', label: 'IPD Settlement', emoji: '🛏️', description: 'Process billing for inpatient (admitted) patients.', unlocks: ['IPD Settlement Page'] },
            { key: 'billing_receipt_reprint', label: 'Receipt Reprint', emoji: '🔄', description: 'Reprint previously issued payment receipts.', unlocks: ['Receipt Reprint Page'] },
            { key: 'billing_discounts', label: 'Discounts & Adjustments', emoji: '🏷️', description: 'Apply discounts and adjustments to patient bills.', unlocks: ['Discounts & Adjustments Page'] },
            { key: 'billing_templates', label: 'Invoice Templates', emoji: '📋', description: 'Configure templates for invoice printouts.', unlocks: ['Invoice Templates Page'] },
            { key: 'billing_settings', label: 'Billing Settings', emoji: '⚙️', description: 'Configure billing parameters and options.', unlocks: ['Settings Page'] },
            { key: 'billing_manage', label: 'Cashier Controls Override', emoji: '🛠️', description: 'Master cashier override and config permissions.', unlocks: ['Full Override'] }
        ],
    },
    {
        id: 'accountant', name: 'Accountant Workspace', icon: '📊',
        color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe',
        description: 'Grant access to individual Financial Management Center pages',
        items: [
            { key: 'accountant_view', label: 'Accountant Dashboard', emoji: '🏠', description: 'Main accountant overview and dashboard.', unlocks: ['Accountant Dashboard'] },
            { key: 'billing_reports', label: 'Revenue Reports', emoji: '📊', description: 'View detailed billing revenue reports.', unlocks: ['Revenue Reports Page'] },
            { key: 'billing_analytics', label: 'Billing Analytics', emoji: '📈', description: 'View billing analytics and financial trends.', unlocks: ['Billing Analytics Dashboard'] },
            { key: 'finance_view', label: 'Discount Approvals', emoji: '💼', description: 'Approve or reject patient billing discount requests.', unlocks: ['Discount Approvals Page'] },
            { key: 'finance_outstanding', label: 'Outstanding Payments', emoji: '⏰', description: 'Monitor and manage overdue payment accounts.', unlocks: ['Outstanding Payments Page'] },
            { key: 'finance_claims', label: 'Insurance Claims Monitor', emoji: '📋', description: 'Track and manage insurance claim submissions.', unlocks: ['Insurance Claims Page'] },
            { key: 'finance_expenses', label: 'Expenses Management', emoji: '💸', description: 'Log, track and categorize hospital expenses.', unlocks: ['Expenses Page'] },
            { key: 'finance_profit_loss', label: 'Profit & Loss Reports', emoji: '📉', description: 'View P&L statements and financial analysis.', unlocks: ['Profit & Loss Page'] },
            { key: 'finance_statements', label: 'Financial Statements', emoji: '📃', description: 'View balance sheets and income statements.', unlocks: ['Financial Statements Page'] },
            { key: 'finance_reconciliation', label: 'Bank/Cash Reconciliation', emoji: '⚖️', description: 'Reconcile bank and cash account transactions.', unlocks: ['Reconciliation Page'] },
            { key: 'finance_payroll', label: 'Payroll Management', emoji: '👥', description: 'Process and manage hospital staff payroll.', unlocks: ['Payroll Management Page'] },
            { key: 'finance_doctor_payouts', label: 'Doctor Payouts', emoji: '👨‍⚕️', description: 'Process and track doctor earnings and payouts.', unlocks: ['Doctor Payouts Page'] },
            { key: 'finance_audit', label: 'Financial Audit Logs', emoji: '🔍', description: 'View the financial audit trail and compliance records.', unlocks: ['Financial Audit Logs Page'] },
            { key: 'finance_transactions', label: 'Transaction Logs', emoji: '📒', description: 'View complete transaction history and records.', unlocks: ['Transaction Logs Page'] },
        ],
    },
    {
        id: 'patient', name: 'Patient Management', icon: '🧑‍⚕️',
        color: '#4f46e5', bg: '#eef2ff', border: '#c7d2fe',
        description: 'Patient record access and registration permissions',
        items: [
            { key: 'patient_create', label: 'Register New Patients', emoji: '➕', description: 'Create new patient registrations and profiles.', unlocks: ['Patient Registration Form'] },
            { key: 'patient_search', label: 'Search Patient Database', emoji: '🔍', description: 'Search and find patients across the hospital.', unlocks: ['Patient Search'] },
            { key: 'patient_view', label: 'View Patient Profiles', emoji: '👁️', description: 'Read-only access to patient records.', unlocks: ['Patient Profile View'] },
            { key: 'patient_edit', label: 'Edit Patient Profiles', emoji: '✏️', description: 'Modify patient records and contact details.', unlocks: ['Patient Edit Controls'] },
            { key: 'patient_monitor', label: 'Patient Flow Monitor', emoji: '🔄', description: 'Monitor patient queues and flow across departments.', unlocks: ['Patient Flow Page'] },
        ],
    },
    {
        id: 'clinical', name: 'Clinical & Medical', icon: '🩺',
        color: '#059669', bg: '#f0fdf4', border: '#a7f3d0',
        description: 'Clinical workflow, diagnosis and medical record access',
        items: [
            { key: 'visit_intake', label: 'Nurse Intake', emoji: '💉', description: 'Record patient vitals, symptoms and history.', unlocks: ['Nurse Intake Form'] },
            { key: 'visit_diagnose', label: 'Doctor Diagnosis & Prescription', emoji: '🩺', description: 'Write diagnoses, prescriptions and clinical notes.', unlocks: ['My Patients (Doctor) Sidebar', 'Patient Diagnosis Form'] },
            { key: 'clinical_history_view', label: 'View Medical History', emoji: '📂', description: 'Read-only access to patient clinical history.', unlocks: ['Medical History View'] },
        ],
    },
    {
        id: 'operations', name: 'Operations & Services', icon: '⚙️',
        color: '#d97706', bg: '#fffbeb', border: '#fde68a',
        description: 'Lab, pharmacy, appointments and hospital operations',
        items: [
            { key: 'appointment_manage', label: 'Appointments Management', emoji: '📅', description: 'Book, manage and track patient appointments.', unlocks: ['Reception Dashboard', 'Appointments/Booking Page'] },
            { key: 'appointment_view_all', label: 'View All Appointments', emoji: '📋', description: 'View all hospital appointments.', unlocks: ['Full Appointment List'] },
            { key: 'lab_view', label: 'Lab Dashboard Access', emoji: '🧪', description: 'Full lab workspace - orders, samples, processing and reports.', unlocks: ['Lab Dashboard', 'Lab Orders', 'Sample Collection', 'Test Processing', 'Lab Reports'] },
            { key: 'lab_manage', label: 'Lab Management Controls', emoji: '⚗️', description: 'Advanced lab management and test configuration.', unlocks: ['Lab Management Controls'] },
            { key: 'lab_reports_view', label: 'View Lab Reports Only', emoji: '📄', description: 'Read-only access to completed lab reports.', unlocks: ['Lab Reports Page'] },
            { key: 'pharmacy_view', label: 'Pharmacy Dashboard Access', emoji: '💊', description: 'View pharmacy inventory, orders and purchase approvals.', unlocks: ['Pharma Inventory', 'Pharmacy Orders', 'Purchase Approvals Sidebar'] },
            { key: 'pharmacy_manage', label: 'Pharmacy Management', emoji: '🏥', description: 'Full pharmacy control, stock management and ordering.', unlocks: ['Pharmacy Management Controls'] },
            { key: 'inventory_view', label: 'Inventory Monitoring', emoji: '📦', description: 'Monitor hospital inventory stock levels.', unlocks: ['Inventory Monitoring Page'] },
            { key: 'admission_manage', label: 'Admissions Management', emoji: '🛏️', description: 'Manage bed admissions and patient discharge.', unlocks: ['Admissions Page'] },
            { key: 'resource_manage', label: 'Resource Management', emoji: '🔧', description: 'Manage hospital equipment, assets and resources.', unlocks: ['Resource Management Page'] },
            { key: 'operations_manage', label: 'Hospital Operations Feed', emoji: '📡', description: 'Access to hospital operations live monitoring feed.', unlocks: ['Operations Center'] },
        ],
    },
    {
        id: 'admin', name: 'Admin & Reporting', icon: '🔑',
        color: '#475569', bg: '#f8fafc', border: '#cbd5e1',
        description: 'Administrative controls, reporting and system management',
        items: [
            { key: 'staff_manage', label: 'Staff Roster Management', emoji: '👥', description: 'Manage staff accounts, roles and profiles.', unlocks: ['Staff Management'] },
            { key: 'doctor_manage', label: 'Doctors Feed Management', emoji: '👨‍⚕️', description: 'Configure and manage doctors, slot timings and active status.', unlocks: ['Doctors Feed Page'] },
            { key: 'department_manage', label: 'Department Management', emoji: '🏢', description: 'Configure and manage hospital departments.', unlocks: ['Department Settings'] },
            { key: 'lab_tests_manage', label: 'Lab Tests Catalog & Management', emoji: '🧪', description: 'Manage lab configurations, test packages and lab reports catalog.', unlocks: ['Lab Tests Catalog', 'Laboratory Management', 'Tests & Packages'] },
            { key: 'pharmacy_admin_manage', label: 'Pharmacy Admin Management', emoji: '💊', description: 'Oversight of pharmacy status, inventory levels, and medicine purchase approvals.', unlocks: ['Pharmacy Page', 'Pharmacy Management Page', 'Purchase Approvals Page'] },
            { key: 'reception_admin_manage', label: 'Reception & Services Management', emoji: '🏪', description: 'Oversight of reception queues, token settings, and hospital services catalog.', unlocks: ['Reception Feed Page', 'Hospital Services Catalog'] },
            { key: 'question_library_manage', label: 'Question Library', emoji: '📝', description: 'Configure clinical question libraries and department questionnaire mappings.', unlocks: ['Question Library Page'] },
            { key: 'document_templates_manage', label: 'Document Templates', emoji: '📄', description: 'Upload, manage, and calibrate prescription and billing document templates.', unlocks: ['Document Templates Page'] },
            { key: 'reports_view', label: 'Generate Reports', emoji: '📊', description: 'Generate and export hospital operational reports.', unlocks: ['Reports Page'] },
            { key: 'analytics_view', label: 'Analytics Oversight', emoji: '📈', description: 'View hospital analytics and performance metrics.', unlocks: ['Analytics Dashboard'] },
            { key: 'admin_view_stats', label: 'View Admin Statistics', emoji: '🔢', description: 'View admin-level hospital statistics.', unlocks: ['Admin Stats Dashboard'] },
            { key: 'admin_manage_roles', label: 'Manage Roles & Permissions', emoji: '🔑', description: 'Create, edit and assign roles to hospital staff.', unlocks: ['Roles & Permissions Page', 'Dynamic Permissions Page'] },
            { key: 'audit_logs_view', label: 'View System Audit Logs', emoji: '🔍', description: 'Track and review complete activity audit logs across all users.', unlocks: ['Audit Logs Page'] },
        ],
    },
];

const UserPermissionManager = ({ hospitals = [] }) => {
    const loggedInUser = JSON.parse(localStorage.getItem('user') || '{}');
    const isCentral = ['superadmin', 'centraladmin'].includes((loggedInUser.role || '').toLowerCase());

    // Helper to get normalized display role name
    const getDisplayRole = (userObj) => {
        if (!userObj) return 'No Role';
        const roleName = userObj.roleName || userObj.role;
        if (!roleName) return 'No Role';
        const lowerRole = String(roleName).toLowerCase();
        if (lowerRole === 'hospitaladmin' || lowerRole === 'clinicadmin' || lowerRole === 'admin') {
            const hosp = hospitals.find(h => String(h._id) === String(userObj.hospitalId));
            if ((hosp && hosp.clinicType === 'clinic') || lowerRole === 'clinicadmin') {
                return 'Clinic Admin';
            }
            return 'Hospital Admin';
        }
        return roleName;
    };

    const [allStaff, setAllStaff] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState(null);
    const [customPerms, setCustomPerms] = useState([]);
    const [deniedPerms, setDeniedPerms] = useState([]);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [showSaveSuccess, setShowSaveSuccess] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [hospitalFilter, setHospitalFilter] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [activeWorkspace, setActiveWorkspace] = useState('billing');

    useEffect(() => { loadAllStaff(); }, []);
    useEffect(() => {
        if (hospitals && hospitals.length === 1) setHospitalFilter(hospitals[0]._id);
    }, [hospitals]);

    const loadAllStaff = async (showLoading = true) => {
        if (showLoading) setLoading(true);
        try {
            const res = await adminAPI.getUsers();
            if (res.success) {
                const staff = (res.users || []).filter(u => {
                    const role = (u.role || '').toLowerCase();
                    if (isCentral) {
                        return ['hospitaladmin', 'clinicadmin', 'admin'].includes(role);
                    } else {
                        return !['centraladmin', 'superadmin', 'hospitaladmin', 'clinicadmin', 'admin', 'patient'].includes(role);
                    }
                });
                setAllStaff(staff);
            }
        } catch (err) { console.error(err); }
        finally { if (showLoading) setLoading(false); }
    };

    const openUser = (user) => {
        setSelectedUser(user);
        setCustomPerms(user.customPermissions || []);
        setDeniedPerms(user.deniedPermissions || []);
        setMessage({ type: '', text: '' });
        setActiveWorkspace('billing');
        window.scrollTo(0, 0);
    };
    const closeUser = () => { setSelectedUser(null); setCustomPerms([]); setDeniedPerms([]); setMessage({ type: '', text: '' }); };

    const togglePerm = (key) => {
        const isRolePerm = (selectedUser?.permissions || []).includes(key);
        if (isRolePerm) {
            setDeniedPerms(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]);
        } else {
            setCustomPerms(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]);
        }
    };

    const handleSave = async () => {
        if (!selectedUser) return;
        setSaving(true); setMessage({ type: '', text: '' });
        try {
            const res = await adminAPI.updateUserPermissions(selectedUser.id || selectedUser._id, customPerms, deniedPerms);
            if (res.success) {
                setMessage({ type: 'success', text: 'Permissions saved for ' + selectedUser.name });
                
                // Update local staff list immediately to prevent any state mismatch or lag
                const updatedUserId = selectedUser.id || selectedUser._id;
                setAllStaff(prevStaff => prevStaff.map(u => {
                    if (String(u.id || u._id) === String(updatedUserId)) {
                        const rp = u.permissions || [];
                        const effective = Array.from(new Set([...rp, ...customPerms].filter(p => !deniedPerms.includes(p))));
                        return {
                            ...u,
                            customPermissions: customPerms,
                            deniedPermissions: deniedPerms,
                            effectivePermissions: effective
                        };
                    }
                    return u;
                }));

                setSelectedUser(prev => ({
                    ...prev,
                    customPermissions: customPerms,
                    deniedPermissions: deniedPerms,
                    effectivePermissions: Array.from(new Set([...(prev.permissions || []), ...customPerms].filter(p => !deniedPerms.includes(p))))
                }));
                setShowSaveSuccess(true);
                
                // Refresh list in background silently
                loadAllStaff(false);
            } else { setMessage({ type: 'error', text: res.message || 'Failed to save' }); }
        } catch (err) { setMessage({ type: 'error', text: err?.response?.data?.message || err.message }); }
        finally { setSaving(false); }
    };

    const clearAllCustom = () => { setCustomPerms([]); setDeniedPerms([]); };

    const grantAllInWorkspace = () => {
        const ws = WORKSPACE_PERMISSIONS.find(w => w.id === activeWorkspace); if (!ws) return;
        const rp = selectedUser?.permissions || [];
        const keys = ws.items.map(i => i.key);
        setCustomPerms(prev => Array.from(new Set([...prev, ...keys.filter(k => !rp.includes(k))])));
        setDeniedPerms(prev => prev.filter(p => !keys.includes(p)));
    };

    const revokeAllInWorkspace = () => {
        const ws = WORKSPACE_PERMISSIONS.find(w => w.id === activeWorkspace); if (!ws) return;
        const keys = ws.items.map(i => i.key);
        setCustomPerms(prev => prev.filter(p => !keys.includes(p)));
    };

    const getPermStatus = (key) => {
        const isRolePerm = (selectedUser?.permissions || []).includes(key);
        const isDenied = deniedPerms.includes(key);
        const isCustomGranted = customPerms.includes(key);
        if (isDenied) return 'denied';
        if (isRolePerm) return 'role';
        if (isCustomGranted) return 'custom';
        return 'none';
    };

    const getOriginalPermStatus = (key) => {
        const isRolePerm = (selectedUser?.permissions || []).includes(key);
        const isDenied = (selectedUser?.deniedPermissions || []).includes(key);
        const isCustomGranted = (selectedUser?.customPermissions || []).includes(key);
        if (isDenied) return 'denied';
        if (isRolePerm) return 'role';
        if (isCustomGranted) return 'custom';
        return 'none';
    };

    const filteredStaff = useMemo(() => allStaff.filter(u => {
        const s = searchQuery.toLowerCase();
        const displayRole = getDisplayRole(u);
        const matchSearch = !s || (u.name || '').toLowerCase().includes(s) || (u.email || '').toLowerCase().includes(s) || displayRole.toLowerCase().includes(s);
        const matchHospital = !hospitalFilter || String(u.hospitalId) === String(hospitalFilter);
        const matchRole = !roleFilter || displayRole.toLowerCase() === roleFilter.toLowerCase();
        return matchSearch && matchHospital && matchRole;
    }), [allStaff, searchQuery, hospitalFilter, roleFilter, hospitals]);

    const uniqueRoles = useMemo(() => {
        const rolesSet = new Set(allStaff.map(u => getDisplayRole(u)).filter(Boolean));
        return Array.from(rolesSet).sort();
    }, [allStaff, hospitals]);
    const getEffectivePermCount = (user) => {
        const rp = user.permissions || []; const cp = user.customPermissions || []; const dp = user.deniedPermissions || [];
        return new Set([...rp, ...cp].filter(p => !dp.includes(p))).size;
    };

    if (selectedUser) {
        const rolePerms = selectedUser.permissions || [];
        const effectivePerms = Array.from(new Set([...rolePerms, ...customPerms].filter(p => !deniedPerms.includes(p))));
        const currentWs = WORKSPACE_PERMISSIONS.find(w => w.id === activeWorkspace);
        const wsGranted = currentWs?.items.filter(i => effectivePerms.includes(i.key)).length || 0;
        return (
            <div style={{ display: 'flex', minHeight: '75vh', borderRadius: '16px', overflow: 'hidden', border: '1.5px solid #e2e8f0', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
                {/* Left: User Info Panel */}
                <div style={{ width: '250px', flexShrink: 0, background: 'linear-gradient(160deg,#1e293b,#0f172a)', padding: '20px 18px', color: 'white', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <button onClick={closeUser} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#94a3b8', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, alignSelf: 'flex-start' }}>← Staff List</button>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ width: '64px', height: '64px', borderRadius: '50%', margin: '0 auto 10px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', fontWeight: 800, boxShadow: '0 0 0 3px rgba(99,102,241,0.35)' }}>
                            {(selectedUser.name || 'U').charAt(0).toUpperCase()}
                        </div>
                        <h3 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 700 }}>{selectedUser.name}</h3>
                        <p style={{ margin: '0 0 6px', fontSize: '11px', color: '#94a3b8', wordBreak: 'break-all' }}>{selectedUser.email}</p>
                        <span style={{ display: 'inline-block', background: '#3b82f6', color: 'white', borderRadius: '10px', padding: '2px 10px', fontSize: '11px', fontWeight: 700 }}>{getDisplayRole(selectedUser)}</span>
                    </div>
                    <div style={{ padding: '12px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '9px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Permission Summary</div>
                        {[['Role permissions', rolePerms.length, 'white'], ['Custom grants', '+' + customPerms.length, '#34d399'], ...(deniedPerms.length > 0 ? [['Revoked', '-' + deniedPerms.length, '#f87171']] : [])].map(([label, val, color]) => (
                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '11px', color: '#94a3b8' }}>{label}</span>
                                <span style={{ fontSize: '13px', fontWeight: 700, color }}>{val}</span>
                            </div>
                        ))}
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '7px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Effective total</span>
                            <span style={{ fontSize: '18px', fontWeight: 800, color: '#22c55e' }}>{effectivePerms.length}</span>
                        </div>
                    </div>
                    {message.text && (<div style={{ padding: '8px 10px', borderRadius: '8px', fontSize: '11px', lineHeight: '1.4', background: message.type === 'success' ? '#dcfce7' : '#fee2e2', color: message.type === 'success' ? '#15803d' : '#dc2626', border: `1px solid ${message.type === 'success' ? '#bbf7d0' : '#fca5a5'}` }}>{message.text}</div>)}
                    <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <button onClick={handleSave} disabled={saving} style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: 'white', border: 'none', borderRadius: '10px', padding: '11px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '14px', opacity: saving ? 0.75 : 1 }}>
                            {saving ? 'Saving...' : '✓ Save Permissions'}
                        </button>
                        <button onClick={clearAllCustom} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: '8px', padding: '8px', cursor: 'pointer', fontSize: '11px' }}>Reset All Custom</button>
                    </div>
                </div>
                {/* Right: Permission Panel */}
                <div style={{ flex: 1, overflow: 'auto', background: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
                    {/* Workspace Tabs */}
                    <div style={{ padding: '14px 18px', background: 'white', borderBottom: '1.5px solid #e2e8f0', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginRight: '2px' }}>Workspace:</span>
                        {WORKSPACE_PERMISSIONS.map(ws => {
                            const granted = ws.items.filter(i => effectivePerms.includes(i.key)).length;
                            const isActive = activeWorkspace === ws.id;
                            return (
                                <button key={ws.id} onClick={() => setActiveWorkspace(ws.id)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '20px', border: `2px solid ${ws.color}`, background: isActive ? ws.color : 'white', color: isActive ? 'white' : ws.color, cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}>
                                    <span>{ws.icon}</span><span>{ws.name}</span>
                                    {granted > 0 && <span style={{ background: isActive ? 'rgba(255,255,255,0.3)' : ws.color, color: 'white', borderRadius: '10px', padding: '0 7px', fontSize: '11px', fontWeight: 800 }}>{granted}</span>}
                                </button>
                            );
                        })}
                    </div>
                    {/* Workspace Header */}
                    <div style={{ padding: '14px 18px', background: currentWs?.bg || '#fff', borderBottom: `2px solid ${currentWs?.border || '#e2e8f0'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                            <h3 style={{ margin: 0, color: currentWs?.color, fontWeight: 800, fontSize: '17px' }}>{currentWs?.icon} {currentWs?.name}</h3>
                            <p style={{ margin: '3px 0 0', color: '#64748b', fontSize: '12px' }}>{currentWs?.description} - click a card to toggle</p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <div style={{ textAlign: 'right' }}><div style={{ fontSize: '20px', fontWeight: 800, color: currentWs?.color }}>{wsGranted}/{currentWs?.items.length}</div><div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase' }}>granted</div></div>
                            <button onClick={grantAllInWorkspace} style={{ background: currentWs?.color, color: 'white', border: 'none', borderRadius: '8px', padding: '7px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>Grant All</button>
                            <button onClick={revokeAllInWorkspace} style={{ background: 'white', color: '#64748b', border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Remove All</button>
                        </div>
                    </div>
                    {/* Permission Cards */}
                    <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(268px,1fr))', gap: '12px' }}>
                        {currentWs?.items.map(item => {
                            const status = getPermStatus(item.key);
                            const originalStatus = getOriginalPermStatus(item.key);
                            const isDirty = status !== originalStatus;
                            const isGranted = status === 'role' || status === 'custom';
                            const isRole = status === 'role'; const isCustom = status === 'custom'; const isDenied = status === 'denied';
                            const cardBg = isGranted ? currentWs.bg : isDenied ? '#fff1f2' : 'white';
                            const borderColor = isGranted ? currentWs.color : isDenied ? '#fca5a5' : '#e2e8f0';
                            const nameColor = isGranted ? currentWs.color : isDenied ? '#b91c1c' : '#1e293b';
                            return (
                                <div key={item.key} onClick={() => togglePerm(item.key)} style={{ background: cardBg, border: `2px solid ${borderColor}`, borderRadius: '12px', padding: '14px', cursor: 'pointer', position: 'relative', userSelect: 'none', transition: 'box-shadow 0.15s' }} onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.1)'} onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                                    {isDirty ? (
                                        <span style={{ position: 'absolute', top: '9px', right: '9px', background: '#f59e0b', color: 'white', borderRadius: '5px', padding: '2px 6px', fontSize: '9px', fontWeight: 800 }}>
                                            {isCustom ? 'UNSAVED CUSTOM' : isDenied ? 'UNSAVED REVOKE' : 'UNSAVED REMOVE'}
                                        </span>
                                    ) : (
                                        <>
                                            {isRole && <span style={{ position: 'absolute', top: '9px', right: '9px', background: '#6366f1', color: 'white', borderRadius: '5px', padding: '2px 6px', fontSize: '9px', fontWeight: 800 }}>ROLE</span>}
                                            {isCustom && <span style={{ position: 'absolute', top: '9px', right: '9px', background: '#22c55e', color: 'white', borderRadius: '5px', padding: '2px 6px', fontSize: '9px', fontWeight: 800 }}>CUSTOM</span>}
                                            {isDenied && <span style={{ position: 'absolute', top: '9px', right: '9px', background: '#ef4444', color: 'white', borderRadius: '5px', padding: '2px 6px', fontSize: '9px', fontWeight: 800 }}>REVOKED</span>}
                                        </>
                                    )}
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0, marginTop: '2px', border: `2px solid ${isGranted ? currentWs.color : isDenied ? '#ef4444' : '#cbd5e1'}`, background: isGranted ? currentWs.color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px' }}>
                                            {isGranted && <span style={{ color: 'white', lineHeight: 1 }}>✓</span>}
                                            {isDenied && <span style={{ color: '#ef4444', lineHeight: 1 }}>✕</span>}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0, paddingRight: (isRole || isCustom || isDenied) ? '55px' : '0' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                                                <span style={{ fontSize: '17px' }}>{item.emoji}</span>
                                                <span style={{ fontWeight: 700, fontSize: '13px', color: nameColor }}>{item.label}</span>
                                            </div>
                                            <p style={{ margin: 0, fontSize: '11px', color: '#64748b', lineHeight: '1.45' }}>{item.description}</p>
                                        </div>
                                    </div>
                                    {item.unlocks?.length > 0 && (
                                        <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: `1px solid ${isGranted ? currentWs.color + '28' : '#f1f5f9'}` }}>
                                            <span style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Adds to sidebar:</span>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '5px' }}>
                                                {item.unlocks.map(link => (
                                                    <span key={link} style={{ background: isGranted ? currentWs.color + '18' : '#f1f5f9', color: isGranted ? currentWs.color : '#64748b', border: `1px solid ${isGranted ? currentWs.color + '30' : '#e2e8f0'}`, borderRadius: '4px', padding: '2px 7px', fontSize: '10px', fontWeight: 600 }}>{link}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {item.note && (<div style={{ marginTop: '8px', padding: '5px 8px', background: '#fffbeb', borderRadius: '5px', fontSize: '11px', color: '#92400e', border: '1px solid #fde68a' }}>⚠️ {item.note}</div>)}
                                    <div style={{ marginTop: '8px', fontSize: '9px', color: '#94a3b8', fontFamily: 'monospace' }}>{item.key}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                {/* ── Success Modal overlay inside detail view ── */}
                {showSaveSuccess && (
                    <div style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15, 23, 42, 0.65)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9999
                    }} onClick={() => setShowSaveSuccess(false)}>
                        <div style={{
                            background: 'white',
                            borderRadius: '24px',
                            padding: '40px 36px',
                            width: '90%',
                            maxWidth: '380px',
                            textAlign: 'center',
                            boxShadow: '0 32px 64px rgba(0,0,0,0.25)',
                            margin: 'auto',
                            boxSizing: 'border-box'
                        }} onClick={e => e.stopPropagation()}>
                            <div style={{
                                width: '76px',
                                height: '76px',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                color: 'white',
                                fontSize: '36px',
                                fontWeight: 900,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 20px',
                                boxShadow: '0 0 0 10px #ecfdf5, 0 8px 24px rgba(16, 185, 129, 0.35)'
                            }}>✓</div>
                            <h3 style={{ fontSize: '22px', fontWeight: 900, color: '#1e293b', margin: '0 0 10px', fontFamily: 'sans-serif' }}>Changes Saved!</h3>
                            <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 28px', lineHeight: '1.5', fontFamily: 'sans-serif' }}>
                                Permissions for <strong>{selectedUser?.name}</strong> have been updated successfully.
                            </p>
                            <button onClick={() => setShowSaveSuccess(false)} style={{
                                width: '100%',
                                padding: '13px',
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '12px',
                                fontSize: '15px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                                transition: 'all 0.2s',
                                fontFamily: 'sans-serif'
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 8px 20px rgba(16, 185, 129, 0.45)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.transform = 'none';
                                e.currentTarget.style.boxShadow = '0 4px 14px rgba(16, 185, 129, 0.35)';
                            }}
                            >OK, Got it!</button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Staff list
    return (
        <div>
            <div style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius: '12px', padding: '16px 20px', marginBottom: '18px', color: 'white' }}>
                <h3 style={{ margin: '0 0 5px', fontWeight: 800, fontSize: '16px' }}>Dynamic Permission Manager</h3>
                <p style={{ margin: 0, fontSize: '13px', opacity: 0.85 }}>Grant staff access to specific pages from any workspace without changing their role. For example, give a pharmacist access to selected Billing pages only.</p>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input type="text" placeholder="Search by name, email or role..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ flex: 1, minWidth: '200px', padding: '9px 14px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '13px', outline: 'none', background: 'white' }} />
                {hospitals.length > 1 && (<select value={hospitalFilter} onChange={e => setHospitalFilter(e.target.value)} style={{ padding: '9px 14px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '13px', outline: 'none', background: 'white' }}><option value="">All Hospitals</option>{hospitals.map(h => <option key={h._id} value={h._id}>{h.name}</option>)}</select>)}
                {uniqueRoles.length > 0 && (<select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ padding: '9px 14px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '13px', outline: 'none', background: 'white' }}><option value="">All Roles</option>{uniqueRoles.map(r => <option key={r} value={r}>{r}</option>)}</select>)}
                <span style={{ fontSize: '12px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{filteredStaff.length} member{filteredStaff.length !== 1 ? 's' : ''}</span>
            </div>
            {loading ? (<div style={{ textAlign: 'center', padding: '50px', color: '#94a3b8' }}>Loading staff...</div>) :
             filteredStaff.length === 0 ? (<div style={{ textAlign: 'center', padding: '50px', color: '#94a3b8' }}>No staff found.</div>) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '14px' }}>
                    {filteredStaff.map(user => {
                        const rp = user.permissions || [];
                        const customCount = (user.customPermissions || []).length;
                        const effectiveCount = getEffectivePermCount(user);
                        const hasCustom = customCount > 0 || (user.deniedPermissions || []).length > 0;
                        const initials = (user.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                        return (
                            <div key={user.id || user._id} onClick={() => openUser(user)} style={{ background: 'white', border: `2px solid ${hasCustom ? '#f59e0b' : '#e2e8f0'}`, borderRadius: '14px', padding: '16px 18px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: hasCustom ? '0 2px 10px rgba(245,158,11,0.1)' : '0 1px 4px rgba(0,0,0,0.04)' }} onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }} onMouseLeave={e => { e.currentTarget.style.boxShadow = hasCustom ? '0 2px 10px rgba(245,158,11,0.1)' : '0 1px 4px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'none'; }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                                    <div style={{ width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: '16px' }}>{initials}</div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, fontSize: '14px', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
                                        <div style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
                                        <span style={{ display: 'inline-block', background: '#eff6ff', color: '#3b82f6', borderRadius: '8px', padding: '1px 8px', fontSize: '10px', fontWeight: 700, marginTop: '2px' }}>{getDisplayRole(user)}</span>
                                    </div>
                                    {hasCustom && <span style={{ background: '#fef3c7', color: '#d97706', borderRadius: '8px', padding: '2px 8px', fontSize: '10px', fontWeight: 800, flexShrink: 0 }}>CUSTOM</span>}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                                    {[['Role', rp.length, '#6366f1', '#eef2ff'], ['Custom', customCount, '#22c55e', '#f0fdf4'], ['Effective', effectiveCount, '#0284c7', '#f0f9ff']].map(([label, val, color, bg]) => (
                                        <div key={label} style={{ flex: 1, padding: '7px 6px', background: bg, borderRadius: '8px', textAlign: 'center' }}>
                                            <div style={{ fontSize: '16px', fontWeight: 800, color }}>{val}</div>
                                            <div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase' }}>{label}</div>
                                        </div>
                                    ))}
                                </div>
                                {(user.effectivePermissions || user.permissions || []).length > 0 && (
                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                        {(user.effectivePermissions || user.permissions || []).slice(0, 4).map(p => (<span key={p} style={{ background: '#f1f5f9', color: '#64748b', borderRadius: '4px', padding: '2px 6px', fontSize: '10px' }}>{p.replace(/_/g, ' ')}</span>))}
                                        {(user.effectivePermissions || user.permissions || []).length > 4 && (<span style={{ background: '#f1f5f9', color: '#94a3b8', borderRadius: '4px', padding: '2px 6px', fontSize: '10px' }}>+{(user.effectivePermissions || user.permissions || []).length - 4} more</span>)}
                                    </div>
                                )}
                                <div style={{ textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#6366f1' }}>Configure Permissions →</div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default UserPermissionManager;
