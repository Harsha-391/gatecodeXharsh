import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doctorAPI } from '../../utils/api';
import socket from '../../utils/socket';
import './DoctorDashboard.css';

const DoctorDashboard = () => {
    const navigate = useNavigate();
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [user] = useState(JSON.parse(localStorage.getItem('user') || '{}'));
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [dateTab, setDateTab] = useState('today'); // 'today', 'tomorrow', 'future'

    const isClinicDoctor = user?.clinicType === 'clinic';

    const getLocalDateString = (d = new Date()) => {
        const offset = d.getTimezoneOffset();
        const localDate = new Date(d.getTime() - (offset * 60 * 1000));
        return localDate.toISOString().split('T')[0];
    };
    const todayStr = getLocalDateString();

    const fetchDashboardData = async (activeTab = dateTab) => {
        try {
            setLoading(true);
            setError('');

            const dateVal = activeTab === 'today' ? todayStr : '';
            const tomorrowVal = activeTab === 'tomorrow';
            const futureVal = activeTab === 'future';

            const aptRes = await doctorAPI.getAppointments(dateVal, tomorrowVal, futureVal);
            if (aptRes.success) {
                const apts = aptRes.appointments || [];
                setAppointments(apts);
            } else {
                setError(aptRes.message || 'Failed to load appointments');
            }
        } catch (err) {
            const msg = err?.response?.data?.message || err.message || 'Network error';
            setError(msg);
            console.error('DoctorDashboard error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isClinicDoctor) {
            navigate('/hospitaladmin', { replace: true });
            return;
        }
        fetchDashboardData();

        const handleLiveRefresh = () => {
            fetchDashboardData(dateTab);
        };

        socket.on('appointment_created', handleLiveRefresh);
        socket.on('appointment_updated', handleLiveRefresh);
        socket.on('patient_status_changed', handleLiveRefresh);

        return () => {
            socket.off('appointment_created', handleLiveRefresh);
            socket.off('appointment_updated', handleLiveRefresh);
            socket.off('patient_status_changed', handleLiveRefresh);
        };
    }, [dateTab, isClinicDoctor, navigate]);

    const tabApts = appointments;

    const activeStats = {
        total: tabApts.length,
        pending: tabApts.filter(a => a.status === 'pending' || a.status === 'confirmed').length,
        completed: tabApts.filter(a => a.status === 'completed').length,
        cancelled: tabApts.filter(a => a.status === 'cancelled').length,
        revenue: tabApts.filter(a => a.status === 'completed').reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
    };

    const q = searchQuery.toLowerCase().trim();
    const filtered = tabApts.filter(a => {
        if (statusFilter !== 'all' && a.status !== statusFilter) return false;
        if (q) {
            const u = a.userId || {};
            if (!(u.name || '').toLowerCase().includes(q) &&
                !(u.phone || '').toLowerCase().includes(q) &&
                !(u.patientId || '').toLowerCase().includes(q) &&
                !(a.serviceName || '').toLowerCase().includes(q)) return false;
        }
        return true;
    });

    const handlePatientClick = (appointmentId) => {
        navigate(`/doctor/patient/${appointmentId}`);
    };

    if (loading) return <div className="loading-screen">Loading Dashboard...</div>;
    if (error) return (
        <div className="doctor-dashboard-container">
            <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '10px', padding: '20px', margin: '20px', color: '#dc2626' }}>
                <strong>Error loading dashboard:</strong> {error}
                <button onClick={fetchDashboardData} style={{ marginLeft: '12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer' }}>Retry</button>
            </div>
        </div>
    );

    return (
        <div className="doctor-dashboard-container" style={{ padding: '24px' }}>
            <div className="doctor-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Dr. {user.name}</h1>
                    <p className="subtitle" style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.88rem' }}>
                        Dashboard & Patient Management • Auto-refreshes every 30s
                    </p>
                </div>
                <div className="header-actions" style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn-secondary" onClick={fetchDashboardData} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                        ↻ Refresh
                    </button>
                    <button className="btn-secondary" onClick={() => navigate('/doctor/patients')} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #0d9488', background: '#0d9488', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                        👥 All Patients
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                <div className="stat-card blue" style={{ background: '#eff6ff', borderRadius: '12px', padding: '18px', textAlign: 'center', border: '1px solid #bfdbfe' }}>
                    <h3 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#2563eb' }}>{activeStats.total}</h3>
                    <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                        {dateTab === 'today' ? "Today's Appointments" : dateTab === 'tomorrow' ? "Tomorrow's Appointments" : "Future Appointments"}
                    </p>
                </div>
                <div className="stat-card orange" style={{ background: '#fffbeb', borderRadius: '12px', padding: '18px', textAlign: 'center', border: '1px solid #fde68a' }}>
                    <h3 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#d97706' }}>{activeStats.pending}</h3>
                    <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Pending / Upcoming</p>
                </div>
                <div className="stat-card green" style={{ background: '#f0fdf4', borderRadius: '12px', padding: '18px', textAlign: 'center', border: '1px solid #bbf7d0' }}>
                    <h3 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#16a34a' }}>{activeStats.completed}</h3>
                    <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Completed</p>
                </div>
                <div className="stat-card red" style={{ background: '#fef2f2', borderRadius: '12px', padding: '18px', textAlign: 'center', border: '1px solid #fecaca' }}>
                    <h3 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#dc2626' }}>{activeStats.cancelled}</h3>
                    <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Cancelled</p>
                </div>
                <div className="stat-card purple" style={{ background: '#f5f3ff', borderRadius: '12px', padding: '18px', textAlign: 'center', border: '1px solid #ddd6fe' }}>
                    <h3 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#7c3aed' }}>₹{activeStats.revenue.toLocaleString('en-IN')}</h3>
                    <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                        {dateTab === 'today' ? "Today's Revenue" : dateTab === 'tomorrow' ? "Tomorrow's Revenue" : "Future Revenue"}
                    </p>
                </div>
            </div>

            {/* Search + Filter */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                    type="text"
                    placeholder="Search patient name, phone, MRN, or service..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{ flex: 1, minWidth: '200px', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.9rem', outline: 'none' }}
                />
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {['all', 'pending', 'confirmed', 'completed', 'cancelled'].map(s => (
                        <button key={s} onClick={() => setStatusFilter(s)}
                            style={{
                                padding: '6px 14px', borderRadius: '8px', border: '1.5px solid', cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem',
                                borderColor: statusFilter === s ? '#0d9488' : '#e2e8f0',
                                background: statusFilter === s ? '#f0fdf4' : '#fff',
                                color: statusFilter === s ? '#0d9488' : '#64748b'
                            }}>
                            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Appointments Table */}
            <div className="appointments-section" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#1e293b' }}>
                            {dateTab === 'today' ? "Today's Appointments" : dateTab === 'tomorrow' ? "Tomorrow's Appointments" : "Future Appointments"}
                        </h2>
                        
                        {/* Date Range Tabs Selector */}
                        <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px', gap: '2px' }}>
                            {[
                                { id: 'today', label: 'Today' },
                                { id: 'tomorrow', label: 'Tomorrow' },
                                { id: 'future', label: 'Future' }
                            ].map(t => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => {
                                        setDateTab(t.id);
                                        fetchDashboardData(t.id);
                                    }}
                                    style={{
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        fontSize: '0.78rem',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        background: dateTab === t.id ? '#fff' : 'transparent',
                                        color: dateTab === t.id ? '#1e293b' : '#64748b',
                                        boxShadow: dateTab === t.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 10px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 600 }}>{filtered.length} of {tabApts.length}</span>
                </div>
                {filtered.length === 0 ? (
                    <div className="empty-state" style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>{searchQuery || statusFilter !== 'all' ? '🔍' : '📭'}</div>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: '1rem' }}>
                            {searchQuery ? 'No appointments match your search' : statusFilter !== 'all' ? `No ${statusFilter} appointments` : 'No appointments found.'}
                        </p>
                        <p style={{ fontSize: '13px', color: '#64748b', marginTop: '8px' }}>
                            {searchQuery || statusFilter !== 'all' ? 'Try a different search term or filter.' : 'Your appointments will appear here once booked by reception.'}
                        </p>
                    </div>
                ) : (
                    <table className="doctor-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>Date / Time</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>Patient</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>Service</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>Status</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(apt => (
                                <tr key={apt._id} style={{ borderBottom: '1px solid #f1f5f9' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <td style={{ padding: '12px 16px' }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#1e293b' }}>
                                            {new Date(apt.appointmentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{apt.appointmentTime || '-'}</div>
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>{apt.userId?.name || 'Walk-in Patient'}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                            {apt.userId?.phone ? `📱 ${apt.userId.phone}` : ''}
                                            {apt.userId?.patientId ? ` | ${apt.userId.patientId}` : apt.patientId ? ` | ${apt.patientId}` : ''}
                                        </div>
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#475569' }}>{apt.serviceName || 'Consultation'}</td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <span style={{
                                            padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'capitalize',
                                            background: apt.status === 'confirmed' ? '#dcfce7' : apt.status === 'completed' ? '#dbeafe' : apt.status === 'cancelled' ? '#fee2e2' : '#fef3c7',
                                            color: apt.status === 'confirmed' ? '#166534' : apt.status === 'completed' ? '#1e40af' : apt.status === 'cancelled' ? '#991b1b' : '#92400e'
                                        }}>{apt.status}</span>
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <button className="btn-view" onClick={() => handlePatientClick(apt._id)}
                                            style={{ padding: '7px 16px', borderRadius: '8px', border: '1.5px solid #0d9488', background: 'transparent', color: '#0d9488', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}>
                                            View Details →
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default DoctorDashboard;
