import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useAppDispatch } from '../../store/hooks';
import { logout } from '../../store/slices/authSlice';
import { useBranding } from '../../context/BrandingContext';
import {
    FiHome, FiUsers, FiCalendar, FiActivity, FiPackage,
    FiSettings, FiLogOut, FiPieChart, FiClipboard,
    FiFileText, FiPlusSquare, FiDatabase, FiGrid, FiShield,
    FiChevronDown, FiChevronRight, FiAlertCircle, FiUser, FiX
} from 'react-icons/fi';
import './DashboardLayout.css';

const DashboardSidebar = ({ isOpen, setOpen }) => {
    const { user } = useAuth();
    const { branding, hospitalName } = useBranding();
    const role = (user?.role || '').toLowerCase();
    const location = useLocation();

    // Custom active check: for links with search params (e.g. ?view=collection),
    // match both pathname AND the specific search param.
    // For plain links on the same path, ensure the conflicting param is NOT present.
    const isLinkActive = (itemPath) => {
        const [itemPathname, itemSearch] = itemPath.split('?');
        const currentPathname = location.pathname;
        const currentSearch = location.search;

        if (itemPathname !== currentPathname) return false;

        if (itemSearch) {
            // Item has query params → current URL must also have them
            const itemParams = new URLSearchParams(itemSearch);
            const currentParams = new URLSearchParams(currentSearch);
            for (const [key, val] of itemParams.entries()) {
                if (currentParams.get(key) !== val) return false;
            }
            return true;
        } else {
            // Item has NO query params → current URL must also have no conflicting params
            // that another sibling link might use (view=collection)
            const currentParams = new URLSearchParams(currentSearch);
            if (currentParams.get('view') === 'collection') return false;
            return true;
        }
    };

    // Toggle states for Collapsible sidebar groups
    const [openGroups, setOpenGroups] = useState({
        'Hospital Operations': true,
        'Human Resources': true,
        'Clinical Services': true,
        'Financial Management': true,
        'Resources': true,
        'Insights': true,
        'Administration': true
    });

    const toggleGroup = (groupName) => {
        setOpenGroups(prev => ({
            ...prev,
            [groupName]: !prev[groupName]
        }));
    };
    
    // Categorized Menus
    const getMenu = () => {
        let baseMenu = [];

        if (role === 'centraladmin' || role === 'superadmin') {
            baseMenu = [
                { label: 'System Overview', path: '/supremeadmin', icon: <FiPieChart /> },
                { label: 'Question Library', path: '/admin/question-library', icon: <FiFileText /> },
                { label: 'Role & Permissions', path: '/admin/roles', icon: <FiShield /> },
                { label: 'Manage Hospital Admins', path: '/admin/users', icon: <FiUsers /> },
            ];
        } else if (role === 'hospitaladmin') {
            const u = JSON.parse(localStorage.getItem('user') || '{}');
            if (u.clinicType === 'clinic') {
                // Simple clinic — single hub page with built-in role switcher
                baseMenu = [
                    { label: 'Clinic Hub', path: '/hospitaladmin', icon: <FiHome /> },
                ];
            } else {
                baseMenu = [
                    { label: 'Hospital Overview', path: '/hospitaladmin', icon: <FiPieChart /> },
                    { label: 'Clinical Questions', path: '/hospitaladmin/question-library', icon: <FiFileText /> },
                    { label: 'Staff Management', path: '/admin/users', icon: <FiUsers /> },
                    { label: 'Doctors Feed', path: '/admin/doctors', icon: <FiActivity /> },
                    { label: 'Pharma Inventory', path: '/pharmacy/inventory', icon: <FiPackage /> },
                    { label: 'Hospital Operations Center', path: '/administrator/operations', icon: <FiActivity /> },
                ];
            }
        } else if (role === 'doctor') {
            baseMenu = [
                { label: 'My Patients', path: '/doctor/dashboard', icon: <FiUsers /> },
            ];
        } else if (role === 'reception' || role === 'receptionist') {
            baseMenu = [
                { label: 'Reception Dashboard', path: '/reception/dashboard', icon: <FiHome /> },
                { label: 'Appointments/Booking', path: '/appointment', icon: <FiPlusSquare /> },
                { label: 'My Daily Collection', path: '/reception/dashboard?view=collection', icon: <FiPieChart /> },
                { label: 'Patient Billing', path: '/billing/patient', icon: <FiUsers /> },
                { label: 'Invoices', path: '/billing/invoices', icon: <FiFileText /> },
                { label: 'Refunds', path: '/billing/refunds', icon: <FiLogOut /> },
            ];
        } else if (role === 'lab' || role === 'lab technician') {
            baseMenu = [
                { label: 'Dashboard', path: '/lab/dashboard', icon: <FiGrid /> },
                { label: 'Lab Orders', path: '/lab/orders', icon: <FiClipboard /> },
                { label: 'Sample Collection', path: '/lab/sample-collection', icon: <FiPlusSquare /> },
                { label: 'Test Processing', path: '/lab/processing', icon: <FiActivity /> },
                { label: 'Reports', path: '/lab/completed', icon: <FiFileText /> },
            ];
        } else if (role === 'pharmacy' || role === 'pharmacist') {
            baseMenu = [
                { label: 'Inventory', path: '/pharmacy/inventory', icon: <FiPackage /> },
                { label: 'Pharmacy Orders', path: '/pharmacy/orders', icon: <FiClipboard /> },
            ];
        } else if (['cashier', 'billing', 'billing executive', 'billing manager', 'senior billing officer'].includes(role)) {
            baseMenu = [
                { label: 'Billing Dashboard', path: '/billing/dashboard', icon: <FiPieChart /> },
                { label: 'Patient Billing', path: '/billing/patient', icon: <FiUsers /> },
                { label: 'Pending Payments', path: '/billing/pending', icon: <FiClipboard /> },
                { label: 'Invoices', path: '/billing/invoices', icon: <FiFileText /> },
                { label: 'Payment Collection', path: '/billing/collect', icon: <FiPlusSquare /> },
                { label: 'Payment History', path: '/billing/history', icon: <FiDatabase /> },
                { label: 'Refunds', path: '/billing/refunds', icon: <FiLogOut /> },
                { label: 'Invoice Templates', path: '/billing/templates', icon: <FiClipboard /> },
                { label: 'Settings', path: '/billing/settings', icon: <FiSettings /> },
            ];
        } else if (role === 'nurse') {
            baseMenu = [
                { label: 'Patient Queue', path: '/doctor/patients', icon: <FiUsers /> },
                { label: 'Appointments', path: '/appointment', icon: <FiCalendar /> },
            ];
        } else if (role === 'administrator' || role === 'accountant') {
            return [
                {
                    category: '',
                    items: [
                        { label: 'Dashboard', path: '/administrator/dashboard', icon: <FiHome /> }
                    ]
                },
                {
                    category: 'Hospital Operations',
                    items: [
                        { label: 'Patient Flow', path: '/administrator/patient-flow', icon: <FiUsers /> },
                        { label: 'Admissions', path: '/administrator/admissions', icon: <FiPlusSquare /> },
                        ...(role !== 'accountant' ? [{ label: 'Bed Management', path: '/administrator/beds', icon: <FiDatabase /> }] : []),
                        { label: 'Appointments', path: '/administrator/appointments', icon: <FiCalendar /> },
                        ...(role !== 'accountant' ? [{ label: 'Hospital Operations Center', path: '/administrator/operations', icon: <FiActivity /> }] : [])
                    ]
                },
                {
                    category: 'Human Resources',
                    items: [
                        { label: 'Staff Management', path: '/administrator/staff', icon: <FiUsers /> },
                        { label: 'Doctor Management', path: '/administrator/doctors', icon: <FiActivity /> },
                        { label: 'Departments', path: '/administrator/departments', icon: <FiGrid /> },
                        ...(role !== 'accountant' ? [{ label: 'Roles & Permissions', path: '/administrator/roles', icon: <FiShield /> }] : [])
                    ]
                },
                {
                    category: 'Clinical Services',
                    items: [
                        { label: 'Laboratory Management', path: '/administrator/lab', icon: <FiGrid /> },
                        { label: 'Pharmacy Management', path: '/administrator/pharmacy', icon: <FiPackage /> }
                    ]
                },
                {
                    category: 'Financial Management',
                    items: [
                        { label: 'Billing Oversight', path: '/administrator/billing', icon: <FiFileText /> },
                        { label: 'Revenue Monitoring', path: '/administrator/revenue', icon: <FiPieChart /> },
                        { label: 'Revenue Reports', path: '/billing/reports', icon: <FiGrid /> },
                        { label: 'Billing Analytics', path: '/billing/analytics', icon: <FiPieChart /> }
                    ]
                },
                {
                    category: 'Resources',
                    items: [
                        { label: 'Inventory Monitoring', path: '/administrator/inventory', icon: <FiPackage /> },
                        { label: 'Resource Management', path: '/administrator/resources', icon: <FiSettings /> }
                    ]
                },
                {
                    category: 'Insights',
                    items: [
                        { label: 'Reports', path: '/administrator/reports', icon: <FiFileText /> },
                        { label: 'Analytics', path: '/administrator/analytics', icon: <FiPieChart /> },
                        { label: 'Audit Logs', path: '/administrator/audit-logs', icon: <FiClipboard /> }
                    ]
                },
                {
                    category: 'Administration',
                    items: [
                        { label: 'Notifications', path: '/administrator/notifications', icon: <FiAlertCircle /> },
                        { label: 'Settings', path: '/administrator/settings', icon: <FiSettings /> },
                        { label: 'Profile Settings', path: '/administrator/profile-settings', icon: <FiUser /> }
                    ]
                }
            ];
        } else {
            baseMenu = [
                { label: 'My Dashboard', path: '/my-dashboard', icon: <FiHome /> },
            ];
        }

        // Dynamically append permission-based links for non-administrator/accountant roles
        const userPermissions = user?.effectivePermissions || user?.permissions || [];
        const extraItems = [];

        if (userPermissions.includes('billing_view') || userPermissions.includes('billing_manage')) {
            if (role === 'accountant') {
                extraItems.push(
                    { label: 'Billing Dashboard', path: '/billing/dashboard', icon: <FiPieChart /> },
                    { label: 'Revenue Reports', path: '/billing/reports', icon: <FiGrid /> },
                    { label: 'Billing Analytics', path: '/billing/analytics', icon: <FiPieChart /> },
                    { label: 'Invoice Templates', path: '/billing/templates', icon: <FiClipboard /> },
                    { label: 'Settings', path: '/billing/settings', icon: <FiSettings /> }
                );
            } else {
                extraItems.push(
                    { label: 'Billing Dashboard', path: '/billing/dashboard', icon: <FiPieChart /> },
                    { label: 'Patient Billing', path: '/billing/patient', icon: <FiUsers /> },
                    { label: 'Pending Payments', path: '/billing/pending', icon: <FiClipboard /> },
                    { label: 'Invoices', path: '/billing/invoices', icon: <FiFileText /> },
                    { label: 'Payment Collection', path: '/billing/collect', icon: <FiPlusSquare /> },
                    { label: 'Payment History', path: '/billing/history', icon: <FiDatabase /> },
                    { label: 'Refunds', path: '/billing/refunds', icon: <FiLogOut /> },
                    { label: 'Invoice Templates', path: '/billing/templates', icon: <FiClipboard /> },
                    { label: 'Settings', path: '/billing/settings', icon: <FiSettings /> }
                );
            }
        }

        if (userPermissions.includes('lab_view') || userPermissions.includes('lab_manage')) {
            extraItems.push(
                { label: 'Lab Dashboard', path: '/lab/dashboard', icon: <FiGrid /> },
                { label: 'Lab Orders', path: '/lab/orders', icon: <FiClipboard /> },
                { label: 'Sample Collection', path: '/lab/sample-collection', icon: <FiPlusSquare /> },
                { label: 'Test Processing', path: '/lab/processing', icon: <FiActivity /> },
                { label: 'Lab Reports', path: '/lab/completed', icon: <FiFileText /> }
            );
        }

        if (userPermissions.includes('pharmacy_view') || userPermissions.includes('pharmacy_manage')) {
            extraItems.push(
                { label: 'Pharma Inventory', path: '/pharmacy/inventory', icon: <FiPackage /> },
                { label: 'Pharmacy Orders', path: '/pharmacy/orders', icon: <FiClipboard /> }
            );
        }

        if (userPermissions.includes('appointment_manage') || userPermissions.includes('appointment_view_all') || userPermissions.includes('patient_create')) {
            extraItems.push(
                { label: 'Reception Dashboard', path: '/reception/dashboard', icon: <FiHome /> },
                { label: 'Appointments/Booking', path: '/appointment', icon: <FiPlusSquare /> }
            );
        }

        if (userPermissions.includes('visit_diagnose')) {
            extraItems.push(
                { label: 'My Patients', path: '/doctor/dashboard', icon: <FiUsers /> }
            );
        }

        // De-duplicate extra items by path or label, and add them to baseMenu
        extraItems.forEach(item => {
            const hasPath = baseMenu.some(b => b.path === item.path);
            const hasLabel = baseMenu.some(b => b.label === item.label);
            if (!hasPath && !hasLabel) {
                baseMenu.push(item);
            }
        });

        // Filter out Payment History for reception roles to prevent it from appearing anywhere in their sidebar
        if (role === 'reception' || role === 'receptionist') {
            baseMenu = baseMenu.filter(item => item.path !== '/billing/history');
        }

        return baseMenu;
    };

    const menuItems = getMenu();

    return (
        <aside className={`erp-sidebar ${isOpen ? 'open' : 'collapsed'}`}>
            <div className="sidebar-brand">
                {branding.logoUrl ? (
                    <img
                        src={branding.logoUrl}
                        alt={hospitalName}
                        style={{ height: '32px', maxWidth: '120px', objectFit: 'contain', borderRadius: '4px' }}
                    />
                ) : (
                    <>
                        <div className="brand-dot" />
                        <span>{hospitalName !== 'Medical HMS' ? hospitalName : 'Medical HMS'}</span>
                    </>
                )}
            </div>
            
            <nav className="sidebar-nav">
                {role === 'administrator' || role === 'accountant' ? (
                    menuItems.map((group, gIdx) => {
                        const hasHeader = !!group.category;
                        const isExpanded = openGroups[group.category] ?? true;

                        return (
                            <div key={gIdx} className={`sidebar-group-wrap ${hasHeader ? 'has-header' : 'no-header'}`}>
                                {hasHeader && isOpen && (
                                    <div 
                                        className="sidebar-category-header" 
                                        onClick={() => toggleGroup(group.category)}
                                        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                    >
                                        <span>{group.category}</span>
                                        <span className="caret-icon">
                                            {isExpanded ? <FiChevronDown size={12} /> : <FiChevronRight size={12} />}
                                        </span>
                                    </div>
                                )}
                                {(!hasHeader || !isOpen || isExpanded) && (
                                    <div className="sidebar-group-links">
                                        {group.items.map((item, idx) => (
                                            <NavLink 
                                                key={idx} 
                                                to={item.path} 
                                                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                                                title={!isOpen ? item.label : undefined}
                                            >
                                                <span className="sidebar-link-icon">{item.icon}</span>
                                                <span className="sidebar-link-text">{item.label}</span>
                                            </NavLink>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })
                ) : (
                    menuItems.map((item, idx) => (
                        <NavLink
                            key={idx}
                            to={item.path}
                            className={() => `sidebar-link ${isLinkActive(item.path) ? 'active' : ''}`}
                        >
                            <span className="sidebar-link-icon">{item.icon}</span>
                            <span className="sidebar-link-text">{item.label}</span>
                        </NavLink>
                    ))
                )}
            </nav>

            <div className="sidebar-footer">
                <NavLink 
                    to="/profile"
                    className={({ isActive }) => `sidebar-link settings-item ${isActive ? 'active' : ''}`}
                >
                    <span className="sidebar-link-icon"><FiSettings /></span>
                    <span className="sidebar-link-text">Profile Settings</span>
                </NavLink>
            </div>
        </aside>
    );
};

const TopBar = ({ toggleSidebar, sidebarOpen }) => {
    const { user } = useAuth();
    const { branding, hospitalName } = useBranding();
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogout = () => {
        dispatch(logout());
        navigate('/login');
    };

    // Helper to get initials
    const getInitials = (name) => {
        return (name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    };

    return (
        <header className="erp-topbar">
            <div className="topbar-left">
                <button className="sidebar-toggle" onClick={toggleSidebar}>
                    <div className={`hamburger ${sidebarOpen ? 'active' : ''}`}>
                        <span />
                        <span />
                        <span />
                    </div>
                </button>
                {branding.logoUrl && (
                    <img
                        src={branding.logoUrl}
                        alt={hospitalName}
                        style={{ height: '28px', maxWidth: '100px', objectFit: 'contain', borderRadius: '3px', marginRight: '8px' }}
                    />
                )}
                <div className="breadcrumb-wrap">
                    <span className="curr-page-name">
                        {location.pathname.split('/').pop().replace(/-/g, ' ') || 'Dashboard'}
                    </span>
                    <span className="path-slash">/</span>
                    <span className="path-user-role">{user?.role}</span>
                </div>
            </div>

            <div className="topbar-right">
                <div className="user-profile-widget">
                    <div className="profile-text-info">
                        <span className="user-disp-name">{user?.role === 'doctor' ? 'DR. ' : ''}{user?.name || 'User'}</span>
                        <span className="user-disp-role">{user?.email}</span>
                    </div>
                    <div className="profile-avatar-wrap">
                        <div className="profile-avatar" style={{ overflow: 'hidden', padding: 0 }}>
                            {user?.avatar
                                ? <img src={user.avatar} alt={user.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                                : getInitials(user?.name)
                            }
                        </div>
                        <div className="online-indicator" />
                        
                        <div className="profile-dropdown-content">
                            <div className="p-header">
                                <strong>{user?.name}</strong>
                                <span>{user?.email}</span>
                                <span className="p-role-badge">{user?.role}</span>
                            </div>
                             <div className="p-body">
                                 <Link to="/profile" className="p-item" style={{ textDecoration: 'none', color: 'inherit' }}><FiUsers size={14} /> My Profile</Link>
                                 <Link to="/profile" className="p-item" style={{ textDecoration: 'none', color: 'inherit' }}><FiSettings size={14} /> Account Settings</Link>
                             </div>
                            <div className="p-footer">
                                <button onClick={handleLogout} className="btn-p-logout">
                                    <FiLogOut size={14} /> Logout Session
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
};

/* ── Welcome Card (Centered Overlay) ─────────────────────────── */
const WelcomeCard = () => {
    const { user } = useAuth();
    const [visible, setVisible] = useState(false);
    const [exiting, setExiting] = useState(false);
    const timerRef = useRef(null);

    const getRoleIcon = (role = '') => {
        const r = role.toLowerCase();
        if (r === 'doctor') return '🩺';
        if (r === 'nurse') return '💉';
        if (r === 'reception' || r === 'receptionist') return '📋';
        if (r === 'lab' || r === 'lab technician') return '🧪';
        if (r === 'pharmacy' || r === 'pharmacist') return '💊';
        if (r === 'cashier' || r.includes('billing')) return '💳';
        if (r === 'administrator' || r === 'accountant') return '🏥';
        if (r === 'hospitaladmin') return '🏨';
        return '👤';
    };

    const getGreeting = () => {
        const h = new Date().getHours();
        if (h < 12) return { text: 'Good Morning', emoji: '☀️' };
        if (h < 17) return { text: 'Good Afternoon', emoji: '🌤️' };
        return { text: 'Good Evening', emoji: '🌙' };
    };

    const getRoleMessage = (role = '') => {
        const r = role.toLowerCase();
        if (r === 'doctor') return 'Your patients are ready. Let\'s make today count.';
        if (r === 'nurse') return 'Your care makes all the difference today.';
        if (r === 'reception' || r === 'receptionist') return 'Ready to be the first friendly face patients see!';
        if (r === 'lab' || r === 'lab technician') return 'Accuracy and precision — you\'ve got this.';
        if (r === 'pharmacy' || r === 'pharmacist') return 'Keeping medications safe and patients healthy.';
        if (r === 'cashier' || r.includes('billing')) return 'Keeping the finances in perfect order.';
        if (r === 'administrator' || r === 'accountant') return 'Operations running smoothly starts with you.';
        if (r === 'hospitaladmin') return 'Your hospital depends on your leadership today.';
        return 'Have a focused and productive shift today.';
    };

    const getInitials = (name = '') =>
        name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) || 'U';

    const handleDismiss = () => {
        setExiting(true);
        clearTimeout(timerRef.current);
        setTimeout(() => {
            setVisible(false);
            setExiting(false);
        }, 380);
    };

    useEffect(() => {
        // Only show if the user just logged in (flag set by authSlice login actions)
        // and the card hasn't been shown yet this session
        if (!user) return;
        if (!sessionStorage.getItem('just_logged_in')) return;
        if (sessionStorage.getItem('welcome_shown')) return;

        // Mark as shown so it won't appear again on page navigation
        sessionStorage.setItem('welcome_shown', '1');
        sessionStorage.removeItem('just_logged_in');
        setVisible(true);

        timerRef.current = setTimeout(() => {
            setExiting(true);
            setTimeout(() => {
                setVisible(false);
                setExiting(false);
            }, 380);
        }, 7000);

        return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!visible || !user) return null;

    const greeting = getGreeting();
    const firstName = (user.name || 'there').split(' ')[0];

    return (
        <div className={`wc-overlay ${exiting ? 'wc-overlay--out' : 'wc-overlay--in'}`} onClick={handleDismiss}>
            <div className={`wc-card ${exiting ? 'wc-card--out' : 'wc-card--in'}`} onClick={e => e.stopPropagation()}>

                {/* Top accent bar */}
                <div className="wc-accent-bar" />

                {/* Header */}
                <div className="wc-header">
                    <div className="wc-avatar">
                        {user.avatar
                            ? <img src={user.avatar} alt={user.name} />
                            : getInitials(user.name)
                        }
                    </div>
                    <div className="wc-header-text">
                        <span className="wc-role-badge">
                            {getRoleIcon(user.role)} {user.role}
                        </span>
                        <h2 className="wc-name">{user.name || 'Welcome Back'}</h2>
                        <p className="wc-email">{user.email}</p>
                    </div>
                </div>

                {/* Divider */}
                <div className="wc-divider" />

                {/* Greeting body */}
                <div className="wc-body">
                    <p className="wc-greeting">{greeting.emoji} {greeting.text}!</p>
                    <p className="wc-message">{getRoleMessage(user.role)}</p>
                </div>

                {/* Footer */}
                <div className="wc-footer">
                    <button className="wc-btn-start" onClick={handleDismiss}>
                        Start My Day →
                    </button>
                    <p className="wc-auto-close">Closes automatically in a few seconds</p>
                </div>

                {/* Progress bar */}
                <div className="wc-progress-bar" />

            </div>
        </div>
    );
};

const DashboardLayout = ({ children }) => {
    const [sidebarOpen, setSidebarOpen] = useState(true);

    return (
        <div className="erp-layout">
            <DashboardSidebar isOpen={sidebarOpen} />
            <div className={`erp-main-area ${sidebarOpen ? 'shifted' : 'full'}`}>
                <TopBar sidebarOpen={sidebarOpen} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
                <main className="erp-page-content">
                    {children}
                </main>
            </div>
            <WelcomeCard />
        </div>
    );
};

export default DashboardLayout;

