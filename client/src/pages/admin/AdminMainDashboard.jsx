import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI, receptionAPI } from '../../utils/api';
import socket from '../../utils/socket';
import './AdminMainDashboard.css';

const AdminMainDashboard = () => {
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    const [stats, setStats] = useState({
        totalUsers: 0,
        totalRoles: 0,
        totalDoctors: 0,
        totalPatients: 0,
        todayAppointments: 0,
        pendingPayments: 0,
        todayRevenue: 0,
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchStats();

        socket.on('appointment_created', fetchStats);
        socket.on('appointment_updated', fetchStats);
        socket.on('patient_status_changed', fetchStats);
        socket.on('admission_created', fetchStats);
        socket.on('admission_updated', fetchStats);
        socket.on('admission_discharged', fetchStats);
        socket.on('invoice_generated', fetchStats);
        socket.on('payment_received', fetchStats);
        socket.on('invoice_paid', fetchStats);
        socket.on('refund_processed', fetchStats);

        return () => {
            socket.off('appointment_created', fetchStats);
            socket.off('appointment_updated', fetchStats);
            socket.off('patient_status_changed', fetchStats);
            socket.off('admission_created', fetchStats);
            socket.off('admission_updated', fetchStats);
            socket.off('admission_discharged', fetchStats);
            socket.off('invoice_generated', fetchStats);
            socket.off('payment_received', fetchStats);
            socket.off('invoice_paid', fetchStats);
            socket.off('refund_processed', fetchStats);
        };
    }, []);

    const fetchStats = async () => {
        try {
            setLoading(true);
            const [usersRes, rolesRes, aptRes] = await Promise.all([
                adminAPI.getUsers().catch(() => ({ success: false, users: [] })),
                adminAPI.getRoles().catch(() => ({ success: false, data: [] })),
                receptionAPI.getAllAppointments().catch(() => ({ success: false, appointments: [] }))
            ]);
            const users = usersRes.success ? usersRes.users : [];
            const roles = rolesRes.success ? rolesRes.data : [];
            const todayStr = new Date().toISOString().split('T')[0];
            const todayApts = (aptRes.success ? aptRes.appointments : []).filter(a =>
                a.appointmentDate && String(a.appointmentDate).startsWith(todayStr)
            );
            setStats({
                totalUsers: users.length,
                totalRoles: roles.length,
                totalDoctors: users.filter(u => (u.role || '').toLowerCase().includes('doctor')).length,
                totalPatients: users.filter(u => (u.role || '').toLowerCase() === 'patient').length,
                todayAppointments: todayApts.length,
                pendingPayments: todayApts.filter(a => (a.paymentStatus || '').toLowerCase() !== 'paid').length,
                todayRevenue: todayApts.filter(a => a.status === 'completed' || (a.paymentStatus || '').toLowerCase() === 'paid')
                    .reduce((sum, a) => sum + (Number(a.amount) || 0), 0),
            });
        } catch (err) {
            console.error('Error fetching stats:', err);
        } finally {
            setLoading(false);
        }
    };

    const hour = new Date().getHours();
    let greeting = 'Good morning';
    let greetingEmoji = '☀️';
    if (hour >= 12 && hour < 17) { greeting = 'Good afternoon'; greetingEmoji = '🌤️'; }
    else if (hour >= 17) { greeting = 'Good evening'; greetingEmoji = '🌙'; }

    const dateString = new Date().toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });


    const statCards = [
        { icon: '👥', label: 'Total Users',   value: stats.totalUsers,   accent: '#14b8a6', bg: 'rgba(20,184,166,0.1)' },
        { icon: '🔑', label: 'Active Roles',  value: stats.totalRoles,   accent: '#6366f1', bg: 'rgba(99,102,241,0.1)' },
        { icon: '👨‍⚕️', label: 'Doctors',      value: stats.totalDoctors, accent: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
        { icon: '🩺', label: 'Patients',      value: stats.totalPatients,accent: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
        { icon: '📅', label: "Today's Appts", value: stats.todayAppointments, accent: '#0d9488', bg: 'rgba(13,148,136,0.1)' },
        { icon: '⏳', label: 'Pending Payments', value: stats.pendingPayments, accent: '#d97706', bg: 'rgba(217,119,6,0.1)' },
        { icon: '💰', label: "Today's Revenue", value: `₹${stats.todayRevenue.toLocaleString('en-IN')}`, accent: '#7c3aed', bg: 'rgba(124,58,237,0.1)' },
    ];

    const quickActions = [
        { icon: '👥', label: 'Manage Users',           desc: 'View all staff & patients, edit roles, create accounts',        path: '/admin/users',            bg: 'rgba(20,184,166,0.12)'  },
        { icon: '🔑', label: 'Roles & Permissions',    desc: 'Create custom roles and assign granular permissions',            path: '/admin/roles',            bg: 'rgba(99,102,241,0.12)'  },
        { icon: '🔐', label: 'Dynamic Permissions',    desc: 'Grant or revoke individual permissions per staff member',        path: '/admin/permissions',      bg: 'rgba(124,58,237,0.15)'  },
        { icon: '👨‍⚕️', label: 'Doctors',               desc: 'Manage doctor profiles, specializations & schedules',           path: '/admin/doctors',          bg: 'rgba(59,130,246,0.12)'  },
        { icon: '🧪', label: 'Labs',                   desc: 'Configure lab departments and lab workflows',                    path: '/admin/labs',             bg: 'rgba(245,158,11,0.12)'  },
        { icon: '📋', label: 'Lab Tests Catalog',      desc: 'Manage predefined lab tests for prescription',                   path: '/admin/lab-tests',        bg: 'rgba(236,72,153,0.12)'  },
        { icon: '📦', label: 'Tests & Packages',       desc: 'Create test packages and manage individual tests',               path: '/admin/test-packages',    bg: 'rgba(124,58,237,0.12)'  },
        { icon: '💊', label: 'Pharmacy',               desc: 'Manage pharmacy inventory and suppliers',                        path: '/admin/pharmacy',         bg: 'rgba(239,68,68,0.12)'   },
        { icon: '💉', label: 'Medicine Catalog',       desc: 'Manage global catalog of available medicines',                   path: '/admin/medicines',        bg: 'rgba(239,68,68,0.1)'    },
        { icon: '🏥', label: 'Reception',              desc: 'Set up reception desk and appointment workflows',                path: '/admin/reception',        bg: 'rgba(16,185,129,0.12)'  },
        { icon: '🛠️', label: 'Services',               desc: 'Hospital services, pricing, and categories',                     path: '/admin/services',         bg: 'rgba(245,158,11,0.12)'  },
        { icon: '🛏️', label: 'Wards & Facilities',     desc: 'Configure hospital wards (ICU, OT, deluxe, wards, etc.)',       path: '/admin/facilities',       bg: 'rgba(59,130,246,0.12)'  },
        { icon: '👤', label: 'Create Staff Account',   desc: 'Add a new staff member with login credentials',                  path: '/admin/users',            bg: 'rgba(94,234,212,0.15)'  },
        { icon: '❓', label: 'Question Library',       desc: 'Configure forms and assessment libraries for doctors',           path: '/admin/question-library', bg: 'rgba(167,139,250,0.15)' },
    ];

    return (
        <div className="admin-main-dashboard">
            <div className="dash-container">

                {/* Header (Greeting only, actions moved to TopBar) */}
                <div className="dash-header" style={{ marginBottom: '20px', borderBottom: 'none', paddingBottom: 0 }}>
                    <div className="dash-header-left">
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>
                            {greetingEmoji} {greeting},{' '}
                            <span style={{ color: 'var(--brand-600)' }}>{user.name || 'Admin'}</span>
                        </h1>
                        <p style={{ color: '#64748b', fontSize: '0.9rem' }}>{dateString} · Here's a snapshot of your hospital.</p>
                    </div>
                </div>

                {/* Stats */}
                <div className="stats-grid">
                    {statCards.map((stat, idx) => (
                        <div key={idx} className="stat-card">
                            <div className="stat-card-top">
                                <div className="stat-icon" style={{ background: stat.bg }}>
                                    {stat.icon}
                                </div>

                            </div>
                            <p className="stat-value">
                                {loading
                                    ? <span className="loading-pulse" />
                                    : stat.value
                                }
                            </p>
                            <p className="stat-label">{stat.label}</p>
                            <div className="stat-accent" style={{ background: stat.accent }} />
                        </div>
                    ))}
                </div>

                {/* Quick Actions */}
                <div className="section-label">⚡ Quick Actions</div>
                <div className="actions-grid">
                    {quickActions.map((action, idx) => (
                        <div key={idx} className="action-card" onClick={() => navigate(action.path)}>
                            <div className="action-icon" style={{ background: action.bg }}>
                                {action.icon}
                            </div>
                            <div className="action-content">
                                <h3>{action.label}</h3>
                                <p>{action.desc}</p>
                            </div>
                            <span className="action-card-arrow">→</span>
                        </div>
                    ))}
                </div>

            </div>
        </div>
    );
};

export default AdminMainDashboard;
