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
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const role = (user.role || '').toLowerCase();
        if (role === 'clinicadmin' || (role === 'hospitaladmin' && user.clinicType === 'clinic')) {
            navigate('/hospitaladmin', { replace: true });
        }
    }, [user, navigate]);

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
            const res = await adminAPI.getDashboardStats();
            if (res.success && res.stats) {
                setStats(res.stats);
            }
        } catch (err) {
            console.error('Error fetching stats:', err);
        } finally {
            setLoading(false);
        }
    };

    const hour = currentTime.getHours();
    let greeting = 'Good Morning';
    let greetingEmoji = '☀️';
    let heroBg = 'linear-gradient(135deg, #1e847f 0%, #0ea5e9 60%, #6366f1 100%)';
    if (hour >= 12 && hour < 17) {
        greeting = 'Good Afternoon';
        greetingEmoji = '🌤️';
        heroBg = 'linear-gradient(135deg, #f59e0b 0%, #ef4444 40%, #ec4899 100%)';
    } else if (hour >= 17) {
        greeting = 'Good Evening';
        greetingEmoji = '🌙';
        heroBg = 'linear-gradient(135deg, #1e293b 0%, #334155 40%, #6366f1 100%)';
    }

    const dateString = currentTime.toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    const timeString = currentTime.toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: true
    });

    const firstName = (user.name || 'Admin').split(' ')[0];

    const statCards = [
        {
            icon: '👥',
            label: 'Total Users',
            value: stats.totalUsers,
            accent: '#14b8a6',
            accentLight: 'rgba(20,184,166,0.12)',
            gradStart: '#14b8a6',
            gradEnd: '#0ea5e9',
            path: '/admin/users',
            desc: 'Active staff accounts'
        },
        {
            icon: '🔑',
            label: 'Active Roles',
            value: stats.totalRoles,
            accent: '#6366f1',
            accentLight: 'rgba(99,102,241,0.12)',
            gradStart: '#6366f1',
            gradEnd: '#8b5cf6',
            path: '/admin/roles',
            desc: 'Permission roles'
        },
        {
            icon: '🩺',
            label: 'Doctors',
            value: stats.totalDoctors,
            accent: '#3b82f6',
            accentLight: 'rgba(59,130,246,0.12)',
            gradStart: '#3b82f6',
            gradEnd: '#06b6d4',
            path: '/admin/doctors',
            desc: 'Registered physicians'
        },
        {
            icon: '🧑‍🤝‍🧑',
            label: 'Patients',
            value: stats.totalPatients,
            accent: '#f59e0b',
            accentLight: 'rgba(245,158,11,0.12)',
            gradStart: '#f59e0b',
            gradEnd: '#fb923c',
            path: '/admin/users',
            desc: 'Registered patients'
        },
        {
            icon: '📅',
            label: "Today's Appointments",
            value: stats.todayAppointments,
            accent: '#10b981',
            accentLight: 'rgba(16,185,129,0.12)',
            gradStart: '#10b981',
            gradEnd: '#14b8a6',
            path: '/admin/admissions',
            desc: 'Scheduled for today'
        },
        {
            icon: '⏳',
            label: 'Pending Payments',
            value: stats.pendingPayments,
            accent: '#f97316',
            accentLight: 'rgba(249,115,22,0.12)',
            gradStart: '#f97316',
            gradEnd: '#fbbf24',
            path: '/admin/billing',
            desc: 'Awaiting settlement'
        },
        {
            icon: '💰',
            label: "Today's Revenue",
            value: `₹${stats.todayRevenue.toLocaleString('en-IN')}`,
            accent: '#7c3aed',
            accentLight: 'rgba(124,58,237,0.12)',
            gradStart: '#7c3aed',
            gradEnd: '#a855f7',
            path: '',
            desc: 'Collected today'
        },
    ];

    const quickLinks = [
        { icon: '👥', label: 'Manage Users', path: '/admin/users', color: '#14b8a6' },
        { icon: '🩺', label: 'Doctors', path: '/admin/doctors', color: '#3b82f6' },
        { icon: '🧪', label: 'Labs', path: '/admin/labs', color: '#f59e0b' },
        { icon: '💊', label: 'Pharmacy', path: '/admin/pharmacy', color: '#ef4444' },
        { icon: '🏥', label: 'Admissions', path: '/admin/admissions', color: '#06b6d4' },
        { icon: '📊', label: 'Reports', path: '/admin/reports', color: '#8b5cf6' },
    ];

    return (
        <div className="amd-root">

            {/* ── Hero Banner ── */}
            <div className="amd-hero" style={{ background: heroBg }}>
                <div className="amd-hero-noise" />
                <div className="amd-hero-content">
                    <div className="amd-hero-left">
                        <div className="amd-greeting-pill">{greetingEmoji} {greeting}</div>
                        <h1 className="amd-hero-name">{firstName}</h1>
                        <p className="amd-hero-sub">
                            {dateString} &nbsp;·&nbsp; {timeString}
                        </p>
                        <p className="amd-hero-tagline">Here's what's happening at your hospital today.</p>
                    </div>
                    <div className="amd-hero-right">
                        <div className="amd-hero-badge">
                            <span className="amd-badge-dot" />
                            System Live
                        </div>
                        <div className="amd-hero-stat-mini">
                            <span className="amd-hstat-num">{loading ? '—' : stats.totalUsers}</span>
                            <span className="amd-hstat-label">Staff Online</span>
                        </div>
                    </div>
                </div>
                {/* decorative circles */}
                <div className="amd-hero-circle amd-hero-circle--1" />
                <div className="amd-hero-circle amd-hero-circle--2" />
            </div>

            {/* ── Main Body ── */}
            <div className="amd-body">

                {/* Stats Grid */}
                <div className="amd-section-header">
                    <span className="amd-section-title">Hospital Overview</span>
                    <button className="amd-refresh-btn" onClick={fetchStats} title="Refresh stats">
                        ↻ Refresh
                    </button>
                </div>

                <div className="amd-stats-grid">
                    {statCards.map((card, idx) => {
                        const isClickable = !!card.path;
                        return (
                            <div
                                key={idx}
                                className={`amd-stat-card ${!isClickable ? 'non-clickable' : ''}`}
                                onClick={() => isClickable && navigate(card.path)}
                                style={{ '--card-accent': card.accent, '--card-light': card.accentLight }}
                            >
                                <div className="amd-stat-top">
                                    <div className="amd-stat-icon-wrap" style={{ background: card.accentLight }}>
                                        <span className="amd-stat-emoji">{card.icon}</span>
                                    </div>
                                    {isClickable && <div className="amd-stat-arrow">→</div>}
                                </div>
                                <div className="amd-stat-value">
                                    {loading
                                        ? <span className="amd-skeleton" />
                                        : card.value
                                    }
                                </div>
                                <div className="amd-stat-label">{card.label}</div>
                                <div className="amd-stat-desc">{card.desc}</div>
                                <div
                                    className="amd-stat-bar"
                                    style={{ background: `linear-gradient(90deg, ${card.gradStart}, ${card.gradEnd})` }}
                                />
                            </div>
                        );
                    })}
                </div>

                {/* Quick Access Links */}
                <div className="amd-section-header" style={{ marginTop: '12px' }}>
                    <span className="amd-section-title">Quick Access</span>
                </div>
                <div className="amd-quick-grid">
                    {quickLinks.map((link, idx) => (
                        <button
                            key={idx}
                            className="amd-quick-btn"
                            onClick={() => navigate(link.path)}
                            style={{ '--qbtn-color': link.color }}
                        >
                            <span className="amd-quick-icon" style={{ background: `${link.color}18` }}>{link.icon}</span>
                            <span className="amd-quick-label">{link.label}</span>
                            <span className="amd-quick-chevron">›</span>
                        </button>
                    ))}
                </div>

            </div>
        </div>
    );
};

export default AdminMainDashboard;
