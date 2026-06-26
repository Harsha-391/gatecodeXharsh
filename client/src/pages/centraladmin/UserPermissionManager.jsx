import React, { useState, useEffect, useMemo } from 'react';
import { adminAPI } from '../../utils/api';

// ─── Permission Registry (matches server KNOWN_PERMISSIONS) ───────────────────
const PERMISSION_GROUPS = [
    {
        group: 'Patient Management',
        color: '#6366f1',
        icon: '🧑‍⚕️',
        items: [
            { key: 'patient_create', label: 'Register New Patients' },
            { key: 'patient_search', label: 'Search Patient Database' },
            { key: 'patient_view', label: 'View Patient Profiles' },
            { key: 'patient_edit', label: 'Edit Patient Profiles' }
        ]
    },
    {
        group: 'Clinical & Medical',
        color: '#10b981',
        icon: '🩺',
        items: [
            { key: 'visit_intake', label: 'Nurse Intake (Vitals & History)' },
            { key: 'visit_diagnose', label: 'Doctor Diagnosis & Prescription' },
            { key: 'clinical_history_view', label: 'View Medical History' }
        ]
    },
    {
        group: 'Operations',
        color: '#f59e0b',
        icon: '⚙️',
        items: [
            { key: 'appointment_manage', label: 'Manage Appointments' },
            { key: 'appointment_view_all', label: 'View All Appointments' },
            { key: 'lab_view', label: 'View Lab Tests' },
            { key: 'lab_manage', label: 'Manage Lab Tests' },
            { key: 'lab_reports_view', label: 'View Lab Reports Only' },
            { key: 'pharmacy_view', label: 'View Pharmacy' },
            { key: 'pharmacy_manage', label: 'Pharmacy & Inventory' },
            { key: 'inventory_view', label: 'View Inventory Monitoring' }
        ]
    },
    {
        group: 'Finance & Billing',
        color: '#ef4444',
        icon: '💰',
        items: [
            { key: 'finance_view', label: 'View Hospital Financials' },
            { key: 'billing_view', label: 'View Patient Billing' },
            { key: 'billing_manage', label: 'Manage Patient Billing (Cashier)' },
            { key: 'billing_insurance', label: 'Insurance Billing' },
            { key: 'billing_ipd_settlement', label: 'IPD Settlement' },
            { key: 'billing_receipt_reprint', label: 'Receipt Reprint' },
            { key: 'billing_discounts', label: 'Discounts & Adjustments' },
            { key: 'billing_collect_payment', label: 'Collect Payments' },
            { key: 'billing_generate_invoice', label: 'Generate Invoices' },
            { key: 'billing_print_invoice', label: 'Print Invoices & Receipts' },
            { key: 'billing_refund', label: 'Process Refunds & Cancellations' },
            { key: 'billing_reports', label: 'View Billing Reports' },
            { key: 'billing_analytics', label: 'View Billing Analytics Dashboard' },
            { key: 'finance_outstanding', label: 'Outstanding Payments Monitoring' },
            { key: 'finance_claims', label: 'Insurance Claims Monitoring' },
            { key: 'finance_reception_collections', label: 'Reception Collections Monitoring' },
            { key: 'finance_expenses', label: 'Expenses Management' },
            { key: 'finance_profit_loss', label: 'Profit & Loss Reports' },
            { key: 'finance_statements', label: 'Financial Statements' },
            { key: 'finance_reconciliation', label: 'Bank/Cash Reconciliation' },
            { key: 'finance_transactions', label: 'Transaction Logs' },
            { key: 'finance_audit', label: 'Financial Audit Logs' },
            { key: 'finance_payroll', label: 'Payroll Management' },
            { key: 'finance_doctor_payouts', label: 'Doctor Payouts' }
        ]
    },
    {
        group: 'Accountant',
        color: '#8b5cf6',
        icon: '💼',
        items: [
            { key: 'accountant_view', label: 'View Accountant Dashboard' },
            { key: 'accountant_manage', label: 'Configure Accountant Dashboard' },
            { key: 'staff_manage', label: 'Manage Staff Roster' },
            { key: 'department_manage', label: 'Manage Departments' },
            { key: 'patient_monitor', label: 'Monitor Patients & Queues' },
            { key: 'admission_manage', label: 'Manage Admissions & Beds' },
            { key: 'resource_manage', label: 'Manage Assets & Equipment' },
            { key: 'reports_view', label: 'Generate Reports' },
            { key: 'analytics_view', label: 'Analytics Oversight' },
            { key: 'operations_manage', label: 'Operations Feed Access' },
            { key: 'admin_manage_roles', label: 'Manage Roles & Permissions' },
            { key: 'admin_view_stats', label: 'View Admin Stats' }
        ]
    }
];

const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap(g => g.items.map(i => i.key));

// ─── UserPermissionManager Component ─────────────────────────────────────────
const UserPermissionManager = ({ hospitals = [] }) => {
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

    useEffect(() => {
        loadAllStaff();
    }, []);

    useEffect(() => {
        if (hospitals && hospitals.length === 1) {
            setHospitalFilter(hospitals[0]._id);
        }
    }, [hospitals]);

    const loadAllStaff = async () => {
        setLoading(true);
        try {
            const res = await adminAPI.getUsers();
            if (res.success) {
                // Exclude system admin roles
                const staff = (res.users || []).filter(u => {
                    const role = (u.role || '').toLowerCase();
                    return !['centraladmin', 'superadmin', 'hospitaladmin', 'patient'].includes(role);
                });
                setAllStaff(staff);
            }
        } catch (err) {
            console.error('Failed to load staff:', err);
        } finally {
            setLoading(false);
        }
    };

    const openUser = (user) => {
        setSelectedUser(user);
        setCustomPerms(user.customPermissions || []);
        setDeniedPerms(user.deniedPermissions || []);
        setMessage({ type: '', text: '' });
    };

    const closeUser = () => {
        setSelectedUser(null);
        setCustomPerms([]);
        setDeniedPerms([]);
        setMessage({ type: '', text: '' });
    };

    const togglePerm = (key) => {
        const isRolePerm = (selectedUser?.permissions || []).includes(key);
        if (isRolePerm) {
            setDeniedPerms(prev =>
                prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
            );
        } else {
            setCustomPerms(prev =>
                prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
            );
        }
    };

    const handleSave = async () => {
        if (!selectedUser) return;
        setSaving(true);
        setMessage({ type: '', text: '' });
        try {
            const res = await adminAPI.updateUserPermissions(selectedUser.id, customPerms, deniedPerms);
            if (res.success) {
                setMessage({ type: 'success', text: `✅ Permissions saved for ${selectedUser.name}` });
                setShowSaveSuccess(true);
                // Refresh staff list to reflect changes
                await loadAllStaff();
                // Update the selected user view
                setSelectedUser(prev => ({
                    ...prev,
                    customPermissions: customPerms,
                    deniedPermissions: deniedPerms,
                    effectivePermissions: Array.from(new Set([...(prev.permissions || []), ...customPerms].filter(p => !deniedPerms.includes(p))))
                }));
            } else {
                setMessage({ type: 'error', text: res.message || 'Failed to save permissions' });
            }
        } catch (err) {
            setMessage({ type: 'error', text: err?.response?.data?.message || err.message });
        } finally {
            setSaving(false);
        }
    };

    const clearAllCustom = () => {
        if (!selectedUser) return;
        setCustomPerms([]);
        setDeniedPerms([]);
    };

    const grantAll = () => {
        if (!selectedUser) return;
        const rolePerms = selectedUser.permissions || [];
        setDeniedPerms([]);
        setCustomPerms(ALL_PERMISSIONS.filter(p => !rolePerms.includes(p)));
    };

    // Filtered staff list
    const filteredStaff = useMemo(() => {
        return allStaff.filter(u => {
            const matchSearch = !searchQuery ||
                u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (u.role || '').toLowerCase().includes(searchQuery.toLowerCase());
            const matchHospital = !hospitalFilter || String(u.hospitalId) === hospitalFilter;
            const matchRole = !roleFilter || (u.role || '').toLowerCase().includes(roleFilter.toLowerCase());
            return matchSearch && matchHospital && matchRole;
        });
    }, [allStaff, searchQuery, hospitalFilter, roleFilter]);

    // Unique roles in staff list
    const uniqueRoles = useMemo(() => {
        return Array.from(new Set(allStaff.map(u => u.role).filter(Boolean)));
    }, [allStaff]);

    const getHospitalName = (hid) => hospitals.find(h => h._id === hid)?.name || 'Unknown';

    const getEffectivePermCount = (user) => {
        const rolePerms = user.permissions || [];
        const customPerms = user.customPermissions || [];
        const deniedPerms = user.deniedPermissions || [];
        return new Set([...rolePerms, ...customPerms].filter(p => !deniedPerms.includes(p))).size;
    };

    // ─── Permission Panel (right panel when user selected) ──────────────────
    if (selectedUser) {
        const rolePerms = selectedUser.permissions || [];
        const effectivePerms = Array.from(new Set([...rolePerms, ...customPerms].filter(p => !deniedPerms.includes(p))));

        return (
            <div style={{ display: 'flex', gap: '0', height: '100%', minHeight: '70vh' }}>
                {/* Left — User Info Panel */}
                <div style={{
                    width: '280px', flexShrink: 0,
                    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                    borderRadius: '16px 0 0 16px', padding: '28px 24px',
                    color: 'white', display: 'flex', flexDirection: 'column', gap: '20px'
                }}>
                    <button onClick={closeUser} style={{
                        background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
                        color: '#94a3b8', borderRadius: '8px', padding: '8px 14px',
                        cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px',
                        width: 'fit-content'
                    }}>← Back to Staff List</button>

                    {/* Avatar */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', textAlign: 'center' }}>
                        <div style={{
                            width: '72px', height: '72px', borderRadius: '50%',
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '28px', fontWeight: 800, color: 'white',
                            boxShadow: '0 0 0 4px rgba(99,102,241,0.3)'
                        }}>
                            {selectedUser.name?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{selectedUser.name}</div>
                            <div style={{ color: '#94a3b8', fontSize: '12px' }}>{selectedUser.email}</div>
                            <div style={{
                                marginTop: '8px', background: 'rgba(99,102,241,0.2)',
                                color: '#a5b4fc', borderRadius: '20px', padding: '4px 12px',
                                fontSize: '11px', fontWeight: 600, display: 'inline-block'
                            }}>{selectedUser.role}</div>
                        </div>
                    </div>

                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Permission Summary</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                <span style={{ color: '#94a3b8' }}>Role permissions</span>
                                <span style={{ fontWeight: 700, color: '#10b981' }}>{rolePerms.length}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                <span style={{ color: '#94a3b8' }}>Custom grants</span>
                                <span style={{ fontWeight: 700, color: '#f59e0b' }}>{customPerms.length}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                <span style={{ color: '#94a3b8' }}>Explicitly revoked</span>
                                <span style={{ fontWeight: 700, color: '#ef4444' }}>{deniedPerms.length}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                                <span style={{ color: '#e2e8f0', fontWeight: 600 }}>Total effective</span>
                                <span style={{ fontWeight: 700, color: '#6366f1' }}>{effectivePerms.length}</span>
                            </div>
                        </div>
                    </div>

                    {/* Hospital Info */}
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                        <div style={{ color: '#475569', marginBottom: '4px', fontWeight: 600 }}>Hospital</div>
                        <div style={{ color: '#94a3b8' }}>{getHospitalName(selectedUser.hospitalId) || 'N/A'}</div>
                    </div>

                    {/* Legend */}
                    <div style={{ marginTop: 'auto', fontSize: '11px', color: '#475569' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#10b981' }}></div>
                            <span>From role (active)</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#f59e0b' }}></div>
                            <span>Custom grant (active)</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                            <div style={{ width: '10px', height: '10px', borderRadius: '2px', border: '1px solid #ef4444', background: 'transparent' }}></div>
                            <span>Explicitly revoked</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#334155', border: '1px solid #475569' }}></div>
                            <span>Not granted</span>
                        </div>
                    </div>
                </div>

                {/* Right — Permission Grid */}
                <div style={{
                    flex: 1, background: '#f8fafc', borderRadius: '0 16px 16px 0',
                    padding: '28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px'
                }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
                                🔐 Permission Configuration
                            </h3>
                            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                                Grant or revoke permissions beyond the <strong>{selectedUser.role}</strong> role. Backend enforced.
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={clearAllCustom} style={{
                                padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0',
                                background: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#64748b'
                            }}>Clear Custom</button>
                            <button onClick={grantAll} style={{
                                padding: '8px 16px', borderRadius: '8px', border: 'none',
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', cursor: 'pointer',
                                fontSize: '13px', fontWeight: 600, color: 'white'
                            }}>Grant All</button>
                        </div>
                    </div>

                    {/* Save Message */}
                    {message.text && (
                        <div style={{
                            padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                            background: message.type === 'success' ? '#dcfce7' : '#fee2e2',
                            color: message.type === 'success' ? '#166534' : '#991b1b',
                            border: `1px solid ${message.type === 'success' ? '#bbf7d0' : '#fecaca'}`
                        }}>
                            {message.text}
                        </div>
                    )}

                    {/* Permission Groups */}
                    {PERMISSION_GROUPS.map(group => (
                        <div key={group.group} style={{
                            background: 'white', borderRadius: '12px',
                            border: '1px solid #e2e8f0', overflow: 'hidden'
                        }}>
                            <div style={{
                                padding: '14px 18px', borderBottom: '1px solid #f1f5f9',
                                display: 'flex', alignItems: 'center', gap: '10px',
                                background: `${group.color}08`
                            }}>
                                <span style={{ fontSize: '18px' }}>{group.icon}</span>
                                <span style={{ fontWeight: 700, fontSize: '14px', color: '#1e293b' }}>{group.group}</span>
                                <span style={{
                                    marginLeft: 'auto', fontSize: '11px', fontWeight: 600,
                                    color: group.color, background: `${group.color}15`,
                                    padding: '2px 10px', borderRadius: '20px'
                                }}>
                                    {group.items.filter(i => effectivePerms.includes(i.key)).length}/{group.items.length} granted
                                </span>
                            </div>
                            <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {group.items.map(item => {
                                    const fromRole = rolePerms.includes(item.key);
                                    const isCustom = customPerms.includes(item.key);
                                    const isDenied = deniedPerms.includes(item.key);
                                    const isGranted = (fromRole || isCustom) && !isDenied;

                                    return (
                                        <label key={item.key} style={{
                                            display: 'flex', alignItems: 'center', gap: '12px',
                                            padding: '10px 14px', borderRadius: '8px', cursor: 'pointer',
                                            background: (isGranted && fromRole) ? '#f0fdf4' : (isGranted && isCustom) ? '#fffbeb' : isDenied ? '#fef2f2' : '#f8fafc',
                                            border: `1px solid ${(isGranted && fromRole) ? '#bbf7d0' : (isGranted && isCustom) ? '#fde68a' : isDenied ? '#fecaca' : '#e2e8f0'}`,
                                            transition: 'all 0.15s ease', userSelect: 'none',
                                            opacity: (isGranted && fromRole) ? 0.95 : 1
                                        }}>
                                            {/* Custom checkbox */}
                                            <div
                                                onClick={() => togglePerm(item.key)}
                                                style={{
                                                    width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0,
                                                    border: `2px solid ${
                                                        isGranted 
                                                            ? (fromRole ? '#10b981' : '#f59e0b') 
                                                            : (isDenied ? '#ef4444' : '#cbd5e1')
                                                    }`,
                                                    background: isGranted 
                                                        ? (fromRole ? '#10b981' : '#f59e0b') 
                                                        : 'transparent',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    cursor: 'pointer', transition: 'all 0.15s'
                                                }}
                                            >
                                                {isGranted && <span style={{ color: 'white', fontSize: '11px', fontWeight: 700 }}>✓</span>}
                                            </div>

                                            <span style={{ flex: 1, fontSize: '13px', fontWeight: 500, color: '#334155' }}>
                                                {item.label}
                                            </span>

                                            {fromRole && !isDenied && (
                                                <span style={{
                                                    fontSize: '10px', fontWeight: 700, color: '#10b981',
                                                    background: '#dcfce7', padding: '2px 8px', borderRadius: '20px'
                                                }}>ROLE</span>
                                            )}
                                            {isDenied && (
                                                <span style={{
                                                    fontSize: '10px', fontWeight: 700, color: '#ef4444',
                                                    background: '#fee2e2', padding: '2px 8px', borderRadius: '20px'
                                                }}>REVOKED</span>
                                            )}
                                            {isCustom && (
                                                <span style={{
                                                    fontSize: '10px', fontWeight: 700, color: '#d97706',
                                                    background: '#fef3c7', padding: '2px 8px', borderRadius: '20px'
                                                }}>CUSTOM</span>
                                            )}

                                            <code style={{
                                                fontSize: '10px', color: '#94a3b8',
                                                background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px',
                                                fontFamily: 'monospace'
                                            }}>{item.key}</code>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {/* Save Button */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '8px' }}>
                        <button onClick={closeUser} style={{
                            padding: '12px 24px', borderRadius: '10px', border: '1px solid #e2e8f0',
                            background: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#64748b'
                        }}>Cancel</button>
                        <button onClick={handleSave} disabled={saving} style={{
                            padding: '12px 28px', borderRadius: '10px', border: 'none',
                            background: saving ? '#94a3b8' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                            cursor: saving ? 'not-allowed' : 'pointer', fontSize: '14px',
                            fontWeight: 700, color: 'white',
                            boxShadow: '0 4px 12px rgba(99,102,241,0.35)'
                        }}>
                            {saving ? 'Saving...' : '💾 Save Permissions'}
                        </button>
                    </div>
                </div>

                {/* Save Success Popup Modal */}
                {showSaveSuccess && (
                    <div style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.65)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9999,
                        animation: 'fadeIn 0.25s ease-out'
                    }}>
                        <style>{`
                            @keyframes fadeIn {
                                from { opacity: 0; }
                                to { opacity: 1; }
                            }
                            @keyframes scaleUp {
                                from { transform: scale(0.92); opacity: 0; }
                                to { transform: scale(1); opacity: 1; }
                            }
                            @keyframes pulseSuccess {
                                0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
                                70% { transform: scale(1.04); box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
                                100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
                            }
                        `}</style>
                        <div style={{
                            background: 'white',
                            borderRadius: '24px',
                            padding: '36px 32px',
                            width: '90%',
                            maxWidth: '400px',
                            textAlign: 'center',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            border: '1px solid rgba(226, 232, 240, 0.8)',
                            animation: 'scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
                        }}>
                            <div style={{
                                width: '72px',
                                height: '72px',
                                borderRadius: '50%',
                                background: '#dcfce7',
                                color: '#15803d',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '36px',
                                margin: '0 auto 20px',
                                boxShadow: '0 0 0 8px #f0fdf4',
                                animation: 'pulseSuccess 2s infinite'
                            }}>
                                ✓
                            </div>
                            
                            <h3 style={{
                                margin: '0 0 8px',
                                fontSize: '20px',
                                fontWeight: 850,
                                color: '#1e293b'
                            }}>
                                Changes Saved!
                            </h3>
                            
                            <p style={{
                                margin: '0 0 24px',
                                fontSize: '14px',
                                color: '#64748b',
                                lineHeight: 1.5
                            }}>
                                Permissions have been updated successfully for <strong>{selectedUser?.name}</strong>.
                            </p>
                            
                            <button 
                                onClick={() => setShowSaveSuccess(false)}
                                style={{
                                    width: '100%',
                                    padding: '12px 24px',
                                    borderRadius: '12px',
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #10b981, #059669)',
                                    color: 'white',
                                    fontWeight: 700,
                                    fontSize: '14px',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.opacity = '0.9';
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.opacity = '1';
                                    e.currentTarget.style.transform = 'none';
                                }}
                            >
                                OK
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ─── Staff List View ────────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header */}
            <div style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                borderRadius: '16px', padding: '24px 28px', color: 'white'
            }}>
                <h2 style={{ margin: 0, fontWeight: 800, fontSize: '1.3rem' }}>🔐 Dynamic Permission Assignment</h2>
                <p style={{ margin: '6px 0 0', opacity: 0.85, fontSize: '14px' }}>
                    Grant individual staff members additional permissions beyond their role — one account, multiple capabilities.
                </p>
                <div style={{ display: 'flex', gap: '20px', marginTop: '16px' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '24px', fontWeight: 800 }}>{allStaff.length}</div>
                        <div style={{ fontSize: '11px', opacity: 0.7 }}>Total Staff</div>
                    </div>
                    <div style={{ width: '1px', background: 'rgba(255,255,255,0.2)' }} />
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '24px', fontWeight: 800 }}>
                            {allStaff.filter(u => (u.customPermissions || []).length > 0).length}
                        </div>
                        <div style={{ fontSize: '11px', opacity: 0.7 }}>Custom Grants Active</div>
                    </div>
                    <div style={{ width: '1px', background: 'rgba(255,255,255,0.2)' }} />
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '24px', fontWeight: 800 }}>{PERMISSION_GROUPS.reduce((acc, g) => acc + g.items.length, 0)}</div>
                        <div style={{ fontSize: '11px', opacity: 0.7 }}>Available Permissions</div>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <input
                    type="text"
                    placeholder="🔍 Search staff by name, email or role..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{
                        flex: 1, minWidth: '240px', padding: '10px 14px', borderRadius: '10px',
                        border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none',
                        background: 'white'
                    }}
                />
                {hospitals.length > 0 && (
                    hospitals.length > 1 ? (
                        <select
                            value={hospitalFilter}
                            onChange={e => setHospitalFilter(e.target.value)}
                            style={{
                                padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0',
                                fontSize: '13px', background: 'white', color: '#374151', cursor: 'pointer'
                            }}
                        >
                            <option value="">All Hospitals</option>
                            {hospitals.map(h => <option key={h._id} value={h._id}>{h.name}</option>)}
                        </select>
                    ) : (
                        <div style={{
                            padding: '10px 16px', borderRadius: '10px', border: '1px solid #e2e8f0',
                            fontSize: '13px', background: '#f8fafc', color: '#475569', fontWeight: 600,
                            display: 'flex', alignItems: 'center', gap: '6px'
                        }}>
                            🏥 {hospitals[0].name}
                        </div>
                    )
                )}
                <select
                    value={roleFilter}
                    onChange={e => setRoleFilter(e.target.value)}
                    style={{
                        padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0',
                        fontSize: '13px', background: 'white', color: '#374151', cursor: 'pointer'
                    }}
                >
                    <option value="">All Roles</option>
                    {uniqueRoles.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
            </div>

            {/* Staff Grid */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
                    <div>Loading staff members...</div>
                </div>
            ) : filteredStaff.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>👥</div>
                    <div style={{ fontWeight: 600 }}>No staff members found</div>
                    <div style={{ fontSize: '13px', marginTop: '4px' }}>Try adjusting your filters</div>
                </div>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: '16px'
                }}>
                    {filteredStaff.map(user => {
                        const customCount = (user.customPermissions || []).length;
                        const roleCount = (user.permissions || []).length;
                        const effectiveCount = getEffectivePermCount(user);
                        const hasCustom = customCount > 0;

                        return (
                            <div key={user.id} style={{
                                background: 'white', borderRadius: '14px',
                                border: hasCustom ? '2px solid #fde68a' : '1px solid #e2e8f0',
                                padding: '20px', cursor: 'pointer',
                                transition: 'all 0.2s ease', position: 'relative',
                                boxShadow: hasCustom ? '0 4px 16px rgba(245,158,11,0.1)' : '0 2px 8px rgba(0,0,0,0.04)'
                            }}
                                onClick={() => openUser(user)}
                                onMouseEnter={e => {
                                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)';
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.boxShadow = hasCustom ? '0 4px 16px rgba(245,158,11,0.1)' : '0 2px 8px rgba(0,0,0,0.04)';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                }}
                            >
                                {hasCustom && (
                                    <div style={{
                                        position: 'absolute', top: '12px', right: '12px',
                                        background: '#fef3c7', color: '#d97706', borderRadius: '6px',
                                        padding: '2px 8px', fontSize: '10px', fontWeight: 700
                                    }}>CUSTOM</div>
                                )}

                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
                                    <div style={{
                                        width: '46px', height: '46px', borderRadius: '12px',
                                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '20px', fontWeight: 800, color: 'white', flexShrink: 0
                                    }}>
                                        {user.name?.charAt(0).toUpperCase()}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, fontSize: '15px', color: '#1e293b' }}>{user.name}</div>
                                        <div style={{ fontSize: '12px', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
                                        <div style={{
                                            marginTop: '4px', display: 'inline-block',
                                            background: '#f0f9ff', color: '#0ea5e9',
                                            borderRadius: '20px', padding: '2px 10px', fontSize: '11px', fontWeight: 600
                                        }}>{user.role}</div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <div style={{
                                        flex: 1, background: '#f0fdf4', borderRadius: '8px',
                                        padding: '8px 10px', textAlign: 'center'
                                    }}>
                                        <div style={{ fontSize: '18px', fontWeight: 800, color: '#10b981' }}>{roleCount}</div>
                                        <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: 600 }}>Role Perms</div>
                                    </div>
                                    <div style={{
                                        flex: 1, background: customCount > 0 ? '#fffbeb' : '#f8fafc', borderRadius: '8px',
                                        padding: '8px 10px', textAlign: 'center'
                                    }}>
                                        <div style={{ fontSize: '18px', fontWeight: 800, color: customCount > 0 ? '#f59e0b' : '#94a3b8' }}>{customCount}</div>
                                        <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: 600 }}>Custom</div>
                                    </div>
                                    <div style={{
                                        flex: 1, background: '#f0f9ff', borderRadius: '8px',
                                        padding: '8px 10px', textAlign: 'center'
                                    }}>
                                        <div style={{ fontSize: '18px', fontWeight: 800, color: '#6366f1' }}>{effectiveCount}</div>
                                        <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: 600 }}>Effective</div>
                                    </div>
                                </div>

                                {hasCustom && (
                                    <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                        {(user.customPermissions || []).slice(0, 3).map(p => (
                                            <span key={p} style={{
                                                background: '#fef3c7', color: '#92400e',
                                                borderRadius: '4px', padding: '2px 8px', fontSize: '10px', fontWeight: 600
                                            }}>{p.replace(/_/g, ' ')}</span>
                                        ))}
                                        {(user.customPermissions || []).length > 3 && (
                                            <span style={{
                                                background: '#f3f4f6', color: '#6b7280',
                                                borderRadius: '4px', padding: '2px 8px', fontSize: '10px', fontWeight: 600
                                            }}>+{user.customPermissions.length - 3} more</span>
                                        )}
                                    </div>
                                )}

                                <div style={{
                                    marginTop: '14px', textAlign: 'right',
                                    fontSize: '12px', color: '#6366f1', fontWeight: 600
                                }}>
                                    Configure Permissions →
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default UserPermissionManager;
