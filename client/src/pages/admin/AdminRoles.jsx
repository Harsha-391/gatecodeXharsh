import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../../utils/api';
import './AdminRoles.css';

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

    // Organized Permissions List
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
                { key: 'pharmacy_view', label: 'View Pharmacy' },
                { key: 'pharmacy_manage', label: 'Pharmacy & Inventory' }
            ]
        },
        {
            category: "Finance & Accounting", items: [
                { key: 'finance_view', label: 'View Hospital Financials' },
                { key: 'billing_view', label: 'View Patient Billing' },
                { key: 'billing_manage', label: 'Manage Patient Billing (Cashier)' }
            ]
        },
        {
            category: "Admin", items: [
                { key: 'admin_manage_roles', label: 'Manage Roles' },
                { key: 'admin_view_stats', label: 'View Admin Stats' }
            ]
        }
    ];

    // ─── Permission → Nav Link Auto-Mapping ───
    // Each permission gets its own unique nav label so users can see all their
    // available features in the navbar. De-duplicated by label (not path).
    const PERMISSION_NAV_MAP = {
        // Patient Management
        patient_create: { label: 'Patient Registration', path: '/reception/dashboard' },
        patient_search: { label: 'Patient Search', path: '/doctor/patients' },
        patient_view: { label: 'Patient Records', path: '/doctor/patients' },
        patient_edit: { label: 'Edit Patients', path: '/doctor/patients' },
        // Clinical & Medical
        visit_intake: { label: 'Nurse Intake', path: '/doctor/patients' },
        visit_diagnose: { label: 'Consultations', path: '/doctor/patients' },
        clinical_history_view: { label: 'Medical History', path: '/doctor/patients' },
        // Operations
        appointment_manage: { label: 'Reception', path: '/reception/dashboard' },
        appointment_view_all: { label: 'All Appointments', path: '/reception/dashboard' },
        lab_view: { label: 'Lab Dashboard', path: '/lab/dashboard' },
        lab_manage: { label: 'Lab Tests', path: '/lab/tests' },
        pharmacy_view: { label: 'Pharmacy', path: '/pharmacy/inventory' },
        pharmacy_manage: { label: 'Pharmacy Orders', path: '/pharmacy/orders' },
        // Admin
        admin_manage_roles: { label: 'Manage Users', path: '/admin/users' },
        admin_view_stats: { label: 'Admin Dashboard', path: '/admin' },
        finance_view: { label: 'Finance & Accounting', path: '/accountant/dashboard' },
        // Cashier 
        billing_view: { label: 'Patient Billing', path: '/cashier/billing' },
        billing_manage: { label: 'Patient Billing', path: '/cashier/billing' }
    };

    // Compute nav links from current permissions (one link per permission, de-duped by label)
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
        // Also add Roles link if admin_manage_roles is present
        if (permissions.includes('admin_manage_roles') && !seen.has('Manage Roles')) {
            links.push({ label: 'Manage Roles', path: '/admin/roles' });
        }
        return links;
    };

    useEffect(() => {
        fetchRoles();
    }, []);

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

    // --- MANUAL NAV LINKS ---
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
        setFormData({
            name: '', description: '', permissions: [],
            dashboardPath: '/', navLinks: [{ label: '', path: '' }]
        });
        setEditingRoleId(null);
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

        // Merge manual and auto links
        const combinedLinks = [...manualLinks];
        autoLinks.forEach(auto => {
            if (!combinedLinks.find(c => c.path === auto.path || c.label === auto.label)) {
                combinedLinks.push(auto);
            }
        });

        const cleanedData = {
            ...formData,
            navLinks: combinedLinks
        };

        try {
            if (editingRoleId) {
                await adminAPI.updateRole(editingRoleId, cleanedData);
                setMessage({ type: 'success', text: 'Role updated successfully!' });
                setSuccessPopupMsg('Role has been updated successfully.');
                setShowSaveSuccess(true);
            } else {
                await adminAPI.createRole(cleanedData);
                setMessage({ type: 'success', text: 'Role created successfully!' });
                setSuccessPopupMsg('Role has been created successfully.');
                setShowSaveSuccess(true);
            }
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
            setMessage({ type: 'success', text: 'Role deleted successfully!' });
        } catch (err) {
            setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to delete role' });
        }
    };

    return (
        <div className="roles-page-container">
            <header className="roles-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
                    <button
                        onClick={() => {
                            const user = JSON.parse(localStorage.getItem('user') || '{}');
                            const role = (user.role || '').toLowerCase();
                            if (role === 'superadmin' || role === 'centraladmin') {
                                navigate('/supremeadmin');
                            } else {
                                navigate('/admin');
                            }
                        }}
                        style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        ← Back to Dashboard
                    </button>
                    {(() => {
                        const user = JSON.parse(localStorage.getItem('user') || '{}');
                        const role = (user.role || '').toLowerCase();
                        if (role === 'superadmin' || role === 'centraladmin') {
                            return (
                                <button
                                    onClick={() => navigate('/supremeadmin', { state: { openTab: 'permissions' } })}
                                    style={{
                                        background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '10px',
                                        padding: '8px 16px',
                                        fontSize: '13px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        boxShadow: '0 4px 10px rgba(99, 102, 241, 0.2)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
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
                                    🔐 Go to Dynamic Permissions
                                </button>
                            );
                        }
                        return null;
                    })()}
                </div>
                <h1>Role & Permission Manager</h1>
                <p>Define custom access levels for your hospital staff.</p>
            </header>

            <div className="roles-grid">
                {/* --- LEFT COLUMN: CREATE/EDIT FORM --- */}
                <div className="role-card create-card">
                    <div className="card-header">
                        <h2>{editingRoleId ? 'Edit Role' : 'Create New Role'}</h2>
                        {editingRoleId && (
                            <button onClick={resetForm} className="btn-cancel" style={{ marginLeft: 'auto' }}>
                                Cancel Edit
                            </button>
                        )}
                    </div>

                    {message.text && (
                        <div className={`status-message ${message.type}`}>
                            {message.type === 'success' ? '✔' : '⚠'} {message.text}
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>Role Name</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g. Senior Nurse"
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Description</label>
                            <input
                                type="text"
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                placeholder="What is this role for?"
                            />
                        </div>
                        <div className="form-group">
                            <label>Default Dashboard Path</label>
                            <input
                                type="text"
                                value={formData.dashboardPath}
                                onChange={e => setFormData({ ...formData, dashboardPath: e.target.value })}
                                placeholder="e.g. /reception/dashboard"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>Navigation Links</label>
                            <small style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '10px' }}>
                                The tabs user will see in their sidebar menu.
                            </small>
                            {formData.navLinks.map((link, index) => (
                                <div key={index} className="nav-link-row">
                                    <input
                                        type="text"
                                        placeholder="Label (e.g. Patients)"
                                        value={link.label}
                                        onChange={e => updateNavLink(index, 'label', e.target.value)}
                                        className="nav-input"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Path (e.g. /patients)"
                                        value={link.path}
                                        onChange={e => updateNavLink(index, 'path', e.target.value)}
                                        className="nav-input"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeNavLink(index)}
                                        className="btn-remove-nav"
                                        title="Remove Link"
                                    >✖</button>
                                </div>
                            ))}
                            <button type="button" onClick={addNavLink} className="btn-add-nav">+ Add Link</button>
                        </div>

                        <div className="permissions-section">
                            <label className="section-label">Assign Permissions</label>
                            <div className="permissions-list">
                                {PERMISSIONS.map((category) => (
                                    <div key={category.category} className="perm-category">
                                        <h4 className="category-title">{category.category}</h4>
                                        {category.items.map(p => (
                                            <label key={p.key} className="perm-item">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.permissions.includes(p.key)}
                                                    onChange={() => handlePermissionToggle(p.key)}
                                                />
                                                <span className="perm-text">{p.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <button type="submit" disabled={loading} className="btn-create">
                            {loading ? 'Saving...' : editingRoleId ? 'Update Role' : 'Create Role'}
                        </button>
                    </form>
                </div>

                {/* --- RIGHT COLUMN: EXISTING ROLES --- */}
                <div className="role-card list-card">
                    <div className="card-header">
                        <h2>Active Roles</h2>
                        <span className="role-count">{roles.length} roles found</span>
                    </div>

                    <div className="roles-list">
                        {roles.length === 0 && <div className="empty-state">No roles defined yet. Create one!</div>}

                        {roles.map(role => (
                            <div key={role._id} className="role-item">
                                <div className="role-info">
                                    <div className="role-title-row">
                                        <h3>{role.name}</h3>
                                        <span className="perm-badge">{role.permissions?.length || 0} perms</span>
                                        {role.userCount > 0 && (
                                            <span className="perm-badge" style={{ background: '#1890ff20', color: '#1890ff' }}>
                                                {role.userCount} user{role.userCount !== 1 ? 's' : ''}
                                            </span>
                                        )}
                                        {role.isSystemRole && (
                                            <span className="perm-badge" style={{ background: '#faad1420', color: '#faad14' }}>
                                                System
                                            </span>
                                        )}
                                    </div>
                                    <p className="role-desc">{role.description || "No description provided."}</p>
                                    {role.dashboardPath && (
                                        <p className="role-desc" style={{ fontSize: '11px', color: '#888' }}>
                                            Dashboard: {role.dashboardPath}
                                        </p>
                                    )}

                                    <div className="role-tags">
                                        {(role.permissions || []).slice(0, 3).map(p => (
                                            <span key={p} className="tag">{p.replace(/_/g, ' ')}</span>
                                        ))}
                                        {(role.permissions || []).length > 3 && <span className="tag more">+{role.permissions.length - 3} more</span>}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button onClick={() => handleEdit(role)} className="btn-icon-delete" title="Edit Role"
                                        style={{ background: '#1890ff20', color: '#1890ff' }}>
                                        ✏️
                                    </button>
                                    {!role.isSystemRole && (
                                        <button onClick={() => handleDelete(role._id)} className="btn-icon-delete" title="Delete Role">
                                            🗑
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
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
                            {successPopupMsg}
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
};

export default AdminRoles;