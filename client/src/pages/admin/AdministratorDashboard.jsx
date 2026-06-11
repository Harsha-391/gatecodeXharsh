import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { administratorAPI, adminEntitiesAPI } from '../../utils/api';
import socket from '../../utils/socket';
import {
    FiUsers, FiCalendar, FiActivity, FiPackage,
    FiTrendingUp, FiCheckCircle, FiAlertCircle,
    FiPlusSquare, FiDatabase, FiGrid, FiFileText, FiRefreshCw
} from 'react-icons/fi';
import '../administrator/AdministratorDashboard.css';
import './AdministratorDashboard.css';

const AdministratorDashboard = () => {
    const navigate = useNavigate();
    
    // States
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [stats, setStats] = useState(null);
    const [plData, setPlData] = useState(null);
    const [doctorsCount, setDoctorsCount] = useState(0);
    const [activeStaffCount, setActiveStaffCount] = useState(0);
    const [lowStockCount, setLowStockCount] = useState(0);
    const [liveFeed, setLiveFeed] = useState([
        { id: 'init-1', type: 'info', text: 'Hospital Operations Command dashboard initialized.', time: new Date() }
    ]);
    const [isSocketConnected, setIsSocketConnected] = useState(false);
    const [systemHealth, setSystemHealth] = useState(null);

    const formatCurrency = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;

    const fetchData = async () => {
        setLoading(true);
        setError('');
        try {
            // Fetch stats
            const statsRes = await administratorAPI.getStats();
            if (statsRes.success) {
                setStats(statsRes.data);
            }

            // Fetch P&L data
            const plRes = await administratorAPI.getProfitLoss();
            if (plRes.success) {
                setPlData(plRes.data);
            }

            // Fetch doctors to get actual count
            const docsRes = await adminEntitiesAPI.getDoctors();
            if (docsRes.success) {
                setDoctorsCount(docsRes.data?.length || 0);
            }

            // Fetch staff to get actual count
            const staffRes = await administratorAPI.getStaff();
            if (staffRes.success) {
                const activeStaff = (staffRes.data || []).filter(s => s.isActive !== false);
                setActiveStaffCount(activeStaff.length);
            }

            // Fetch pharmacy inventory to count low stock items
            const invRes = await administratorAPI.getInventory();
            if (invRes.success && invRes.lowStock) {
                setLowStockCount(invRes.lowStock.length);
            }

            // Fetch System Health Command stats
            try {
                const healthRes = await administratorAPI.getSystemHealth();
                if (healthRes.success) {
                    setSystemHealth(healthRes.data);
                }
            } catch (healthErr) {
                console.warn('System health load failed', healthErr);
            }
        } catch (err) {
            console.error('Error fetching admin dashboard stats:', err);
            setError('Failed to load dashboard metrics. Please reload.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();

        // Socket setup for real-time dashboard activity feed
        if (socket) {
            setIsSocketConnected(socket.connected);
            
            const handleConnect = () => setIsSocketConnected(true);
            const handleDisconnect = () => setIsSocketConnected(false);
            
            const handleEvent = (eventText, eventType = 'info') => {
                setLiveFeed(prev => [
                    {
                        id: `live-${Date.now()}-${Math.random()}`,
                        type: eventType,
                        text: eventText,
                        time: new Date()
                    },
                    ...prev.slice(0, 19) // Keep last 20 events
                ]);
            };

            socket.on('connect', handleConnect);
            socket.on('disconnect', handleDisconnect);

            // Listen to typical hospital events
            socket.on('admission_created', (data) => {
                handleEvent(`New Patient Admission registered: ${data.patientName || 'N/A'} (Ward: ${data.ward || 'General'})`, 'warning');
                fetchData();
            });
            socket.on('bed_assigned', (data) => {
                handleEvent(`Bed Assigned: Bed ${data.bedNumber} assigned to Patient.`, 'info');
                fetchData();
            });
            socket.on('billing_completed', (data) => {
                handleEvent(`Billing Completed: Payment of ₹${data.amount || 0} received for Invoice #${data.invoiceNumber || 'N/A'}`, 'success');
                fetchData();
            });
            socket.on('appointment_created', (data) => {
                handleEvent(`Appointment Scheduled: Patient with Dr. ${data.doctorName || 'Staff'}`, 'info');
                fetchData();
            });

            return () => {
                socket.off('connect', handleConnect);
                socket.off('disconnect', handleDisconnect);
                socket.off('admission_created');
                socket.off('bed_assigned');
                socket.off('billing_completed');
                socket.off('appointment_created');
            };
        }
    }, []);

    if (loading) {
        return (
            <div className="admin-loading-screen">
                <FiRefreshCw className="spinner-icon spinning" />
                <p>Synchronizing enterprise metrics...</p>
            </div>
        );
    }

    // Default stats if backend database is partially seeded
    const s = stats || {
        totalPatients: 0,
        admissionsToday: 0,
        availableBeds: 50,
        occupiedBeds: 0,
        revenueToday: 0,
        pendingLabTests: 0,
        pendingBilling: 0,
        alerts: []
    };

    return (
        <div className="admin-dashboard-container">
            {/* Upper Header Row */}
            <div className="admin-header-row">
                <div>
                    <h1 className="admin-title">Hospital Command Dashboard</h1>
                    <p className="admin-subtitle">Real-time overview of clinical, operational, and financial indicators.</p>
                </div>
                <button className="btn-refresh-dashboard" onClick={fetchData} title="Refresh Data">
                    <FiRefreshCw /> <span>Sync Now</span>
                </button>
            </div>

            {error && (
                <div className="admin-alert-banner error">
                    <FiAlertCircle /> <span>{error}</span>
                </div>
            )}

            {/* KPI Cards Grid */}
            <div className="kpis-grid-10">
                <div className="kpi-card teal">
                    <div className="kpi-icon"><FiUsers /></div>
                    <div className="kpi-info">
                        <h3>{s.totalPatients || 0}</h3>
                        <span>Total Patients</span>
                    </div>
                </div>
                <div className="kpi-card indigo">
                    <div className="kpi-icon"><FiPlusSquare /></div>
                    <div className="kpi-info">
                        <h3>{s.admissionsToday || 0}</h3>
                        <span>Today's Admissions</span>
                    </div>
                </div>
                <div className="kpi-card emerald">
                    <div className="kpi-icon"><FiDatabase /></div>
                    <div className="kpi-info">
                        <h3>{s.availableBeds || 0}</h3>
                        <span>Available Beds</span>
                    </div>
                </div>
                <div className="kpi-card rose">
                    <div className="kpi-icon"><FiDatabase /></div>
                    <div className="kpi-info">
                        <h3>{s.occupiedBeds || 0}</h3>
                        <span>Occupied Beds</span>
                    </div>
                </div>
                <div className="kpi-card sky">
                    <div className="kpi-icon"><FiActivity /></div>
                    <div className="kpi-info">
                        <h3>{doctorsCount}</h3>
                        <span>Total Doctors</span>
                    </div>
                </div>
                <div className="kpi-card violet">
                    <div className="kpi-icon"><FiUsers /></div>
                    <div className="kpi-info">
                        <h3>{activeStaffCount}</h3>
                        <span>Active Staff</span>
                    </div>
                </div>
                <div className="kpi-card amber">
                    <div className="kpi-icon"><FiTrendingUp /></div>
                    <div className="kpi-info">
                        <h3>{formatCurrency(s.revenueToday)}</h3>
                        <span>Revenue Today</span>
                    </div>
                </div>
                <div className="kpi-card orange">
                    <div className="kpi-icon"><FiFileText /></div>
                    <div className="kpi-info">
                        <h3>{s.pendingLabTests || 0}</h3>
                        <span>Pending Lab Reports</span>
                    </div>
                </div>
                <div className="kpi-card danger">
                    <div className="kpi-icon"><FiPackage /></div>
                    <div className="kpi-info">
                        <h3>{lowStockCount}</h3>
                        <span>Low Stock Medicines</span>
                    </div>
                </div>
                <div className="kpi-card warning">
                    <div className="kpi-icon"><FiFileText /></div>
                    <div className="kpi-info">
                        <h3>{s.pendingBilling || 0}</h3>
                        <span>Pending Bills</span>
                    </div>
                </div>
                <div className="kpi-card danger">
                    <div className="kpi-icon"><FiTrendingUp /></div>
                    <div className="kpi-info">
                        <h3>{formatCurrency(plData?.monthly?.summary?.totalExpenses)}</h3>
                        <span>Monthly Expenses</span>
                    </div>
                </div>
                <div className={`kpi-card ${(plData?.monthly?.summary?.netProfit || 0) >= 0 ? 'emerald' : 'rose'}`}>
                    <div className="kpi-icon"><FiTrendingUp /></div>
                    <div className="kpi-info">
                        <h3>{formatCurrency(plData?.monthly?.summary?.netProfit)}</h3>
                        <span>Monthly Net Profit/Loss</span>
                    </div>
                </div>
            </div>

            {/* Quick Actions Panel */}
            <div className="quick-actions-bar">
                <h4>Quick Operational Actions</h4>
                <div className="actions-buttons">
                    <button onClick={() => navigate('/administrator/doctors')} className="action-btn">
                        <FiPlusSquare /> Manage Doctors
                    </button>
                    <button onClick={() => navigate('/administrator/beds')} className="action-btn">
                        <FiDatabase /> Bed Allocation
                    </button>
                    <button onClick={() => navigate('/administrator/pharmacy')} className="action-btn">
                        <FiPackage /> Pharmacy Catalog
                    </button>
                    <button onClick={() => navigate('/administrator/lab')} className="action-btn">
                        <FiGrid /> Lab Request Queue
                    </button>
                </div>
            </div>

            {/* Graphics and Charts Rows */}
            <div className="dashboard-charts-grid">
                {/* 1. Patient Growth & Revenue Trend */}
                <div className="chart-card-full">
                    <div className="chart-header">
                        <h3>📈 Patient Enrollment & Revenue Trends</h3>
                        <span className="badge-period">Year-to-Date</span>
                    </div>
                    <div className="double-charts-container">
                        {/* SVG Bar Chart for Patient Growth */}
                        <div className="svg-chart-wrapper">
                            <h5>New Patient Registrations</h5>
                            <svg viewBox="0 0 400 220" className="dashboard-svg-chart">
                                {/* Grid Lines */}
                                <line x1="40" y1="30" x2="380" y2="30" stroke="#f1f5f9" strokeWidth="1" />
                                <line x1="40" y1="80" x2="380" y2="80" stroke="#f1f5f9" strokeWidth="1" />
                                <line x1="40" y1="130" x2="380" y2="130" stroke="#f1f5f9" strokeWidth="1" />
                                <line x1="40" y1="180" x2="380" y2="180" stroke="#cbd5e1" strokeWidth="1.5" />
                                
                                {/* Bars representing months (Jan - Jun) */}
                                <rect x="65" y="100" width="30" height="80" rx="4" fill="url(#blue-grad)" />
                                <rect x="115" y="80" width="30" height="100" rx="4" fill="url(#blue-grad)" />
                                <rect x="165" y="65" width="30" height="115" rx="4" fill="url(#blue-grad)" />
                                <rect x="215" y="50" width="30" height="130" rx="4" fill="url(#blue-grad)" />
                                <rect x="265" y="40" width="30" height="140" rx="4" fill="url(#blue-grad)" />
                                <rect x="315" y="25" width="30" height="155" rx="4" fill="url(#blue-grad)" />

                                {/* Bar Values */}
                                <text x="80" y="90" textAnchor="middle" fontSize="10" fill="#475569" fontWeight="600">120</text>
                                <text x="130" y="70" textAnchor="middle" fontSize="10" fill="#475569" fontWeight="600">150</text>
                                <text x="180" y="55" textAnchor="middle" fontSize="10" fill="#475569" fontWeight="600">180</text>
                                <text x="230" y="40" textAnchor="middle" fontSize="10" fill="#475569" fontWeight="600">220</text>
                                <text x="280" y="30" textAnchor="middle" fontSize="10" fill="#475569" fontWeight="600">260</text>
                                <text x="330" y="15" textAnchor="middle" fontSize="10" fill="#475569" fontWeight="600">310</text>

                                {/* Labels */}
                                <text x="80" y="200" textAnchor="middle" fontSize="11" fill="#94a3b8">Jan</text>
                                <text x="130" y="200" textAnchor="middle" fontSize="11" fill="#94a3b8">Feb</text>
                                <text x="180" y="200" textAnchor="middle" fontSize="11" fill="#94a3b8">Mar</text>
                                <text x="230" y="200" textAnchor="middle" fontSize="11" fill="#94a3b8">Apr</text>
                                <text x="280" y="200" textAnchor="middle" fontSize="11" fill="#94a3b8">May</text>
                                <text x="330" y="200" textAnchor="middle" fontSize="11" fill="#94a3b8">Jun</text>

                                <defs>
                                    <linearGradient id="blue-grad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#3b82f6" />
                                        <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.8" />
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>

                        {/* SVG Area Line Chart for Revenue Trend */}
                        <div className="svg-chart-wrapper">
                            <h5>Monthly Billing Operations (₹ Thousands)</h5>
                            <svg viewBox="0 0 400 220" className="dashboard-svg-chart">
                                {/* Grid Lines */}
                                <line x1="40" y1="30" x2="380" y2="30" stroke="#f1f5f9" strokeWidth="1" />
                                <line x1="40" y1="80" x2="380" y2="80" stroke="#f1f5f9" strokeWidth="1" />
                                <line x1="40" y1="130" x2="380" y2="130" stroke="#f1f5f9" strokeWidth="1" />
                                <line x1="40" y1="180" x2="380" y2="180" stroke="#cbd5e1" strokeWidth="1.5" />

                                {/* Area Fill */}
                                <path d="M 80,150 L 130,135 L 180,120 L 230,95 L 280,75 L 330,50 L 330,180 L 80,180 Z" fill="url(#teal-grad-area)" />
                                
                                {/* Line Path */}
                                <path d="M 80,150 L 130,135 L 180,120 L 230,95 L 280,75 L 330,50" fill="none" stroke="#0d9488" strokeWidth="3.5" strokeLinecap="round" />

                                {/* Data Nodes */}
                                <circle cx="80" cy="150" r="5" fill="#0d9488" stroke="#ffffff" strokeWidth="1.5" />
                                <circle cx="130" cy="135" r="5" fill="#0d9488" stroke="#ffffff" strokeWidth="1.5" />
                                <circle cx="180" cy="120" r="5" fill="#0d9488" stroke="#ffffff" strokeWidth="1.5" />
                                <circle cx="230" cy="95" r="5" fill="#0d9488" stroke="#ffffff" strokeWidth="1.5" />
                                <circle cx="280" cy="75" r="5" fill="#0d9488" stroke="#ffffff" strokeWidth="1.5" />
                                <circle cx="330" cy="50" r="5" fill="#0d9488" stroke="#ffffff" strokeWidth="1.5" />

                                {/* Node Labels */}
                                <text x="80" y="138" textAnchor="middle" fontSize="10" fill="#0d9488" fontWeight="700">₹50K</text>
                                <text x="130" y="123" textAnchor="middle" fontSize="10" fill="#0d9488" fontWeight="700">₹62K</text>
                                <text x="180" y="108" textAnchor="middle" fontSize="10" fill="#0d9488" fontWeight="700">₹75K</text>
                                <text x="230" y="83" textAnchor="middle" fontSize="10" fill="#0d9488" fontWeight="700">₹90K</text>
                                <text x="280" y="63" textAnchor="middle" fontSize="10" fill="#0d9488" fontWeight="700">₹110K</text>
                                <text x="330" y="38" textAnchor="middle" fontSize="10" fill="#0d9488" fontWeight="700">₹130K</text>

                                {/* Month Labels */}
                                <text x="80" y="200" textAnchor="middle" fontSize="11" fill="#94a3b8">Jan</text>
                                <text x="130" y="200" textAnchor="middle" fontSize="11" fill="#94a3b8">Feb</text>
                                <text x="180" y="200" textAnchor="middle" fontSize="11" fill="#94a3b8">Mar</text>
                                <text x="230" y="200" textAnchor="middle" fontSize="11" fill="#94a3b8">Apr</text>
                                <text x="280" y="200" textAnchor="middle" fontSize="11" fill="#94a3b8">May</text>
                                <text x="330" y="200" textAnchor="middle" fontSize="11" fill="#94a3b8">Jun</text>

                                <defs>
                                    <linearGradient id="teal-grad-area" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#0d9488" stopOpacity="0.4" />
                                        <stop offset="100%" stopColor="#0d9488" stopOpacity="0.0" />
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>
                    </div>
                </div>

                {/* 2. Bed Occupancy & Department Utilization & Doctor Workload */}
                <div className="split-charts-row">
                    {/* Bed Occupancy (Pie Representation) */}
                    <div className="chart-card-half">
                        <h3>🛏️ Bed Occupancy Ratio</h3>
                        <div className="donut-chart-box">
                            <svg width="160" height="160" viewBox="0 0 36 36" className="donut-chart">
                                <circle cx="18" cy="18" r="15.915" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                                <circle cx="18" cy="18" r="15.915" fill="none" stroke="#10b981" strokeWidth="3.2"
                                    strokeDasharray={`${Math.round(((s.occupiedBeds || 0) / 50) * 100)} ${100 - Math.round(((s.occupiedBeds || 0) / 50) * 100)}`}
                                    strokeDashoffset="25" />
                                <text x="18" y="17.5" textAnchor="middle" fontSize="6.5" fontWeight="800" fill="#1e293b" dy=".3em">
                                    {Math.round(((s.occupiedBeds || 0) / 50) * 100)}%
                                </text>
                                <text x="18" y="26" textAnchor="middle" fontSize="3" fontWeight="600" fill="#64748b">
                                    Occupied
                                </text>
                            </svg>
                            <div className="donut-labels">
                                <div className="label-item"><span className="color-dot green"></span><span>Occupied: {s.occupiedBeds} Beds</span></div>
                                <div className="label-item"><span className="color-dot slate"></span><span>Available: {s.availableBeds} Beds</span></div>
                            </div>
                        </div>
                    </div>

                    {/* Department Utilization */}
                    <div className="chart-card-half">
                        <h3>🏢 Department Utilization</h3>
                        <div className="dept-bars-container">
                            {s.departmentPerformance && s.departmentPerformance.length > 0 ? (
                                s.departmentPerformance.slice(0, 4).map((dept) => {
                                    const maxVal = Math.max(...s.departmentPerformance.map(d => d.appointments || 1));
                                    const barWidth = Math.min(100, Math.round((dept.appointments / maxVal) * 100));
                                    return (
                                        <div key={dept.name} className="dept-progress-row">
                                            <div className="dept-meta">
                                                <span className="dept-name-lbl">{dept.name}</span>
                                                <span className="dept-count-lbl">{dept.appointments} cases</span>
                                            </div>
                                            <div className="dept-progress-outer">
                                                <div className="dept-progress-inner" style={{ width: `${barWidth}%` }} />
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="no-data-msg">No clinical utilization data loaded.</div>
                            )}
                        </div>
                    </div>

                    {/* Doctor Workload Leaderboard */}
                    <div className="chart-card-half">
                        <h3>👨‍⚕️ Doctor Workload</h3>
                        <div className="doctors-workload-list">
                            <div className="workload-item">
                                <span className="doc-rank">1</span>
                                <div className="doc-desc">
                                    <strong>Dr. Rajesh Kumar</strong>
                                    <span>Cardiology consults</span>
                                </div>
                                <span className="doc-score-badge">Active</span>
                            </div>
                            <div className="workload-item">
                                <span className="doc-rank">2</span>
                                <div className="doc-desc">
                                    <strong>Dr. Anita Desai</strong>
                                    <span>Pediatrics consults</span>
                                </div>
                                <span className="doc-score-badge">Active</span>
                            </div>
                            <div className="workload-item">
                                <span className="doc-rank">3</span>
                                <div className="doc-desc">
                                    <strong>Dr. Sunita Mehta</strong>
                                    <span>Gynecology consults</span>
                                </div>
                                <span className="doc-score-badge">Active</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* System Health Command Center */}
            {systemHealth && (
                <div className="system-health-command-center" style={{ marginBottom: '24px' }}>
                    <div className="chart-card-full" style={{ padding: '24px' }}>
                        <div className="chart-header" style={{ marginBottom: '20px' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                🖥️ Host Server & Cluster Health Command Center
                            </h3>
                            <span className="badge-period" style={{ background: '#0ea5e9', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', color: '#fff' }}>SaaS Operational Node</span>
                        </div>
                        <div className="system-health-metrics-grid" style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                            gap: '20px'
                        }}>
                            <div className="health-card" style={{ background: '#0f172a', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                                <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' }}>CPU Load</div>
                                <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#38bdf8', marginTop: '8px' }}>{systemHealth.cpuUsage}%</div>
                                <div style={{ background: '#1e293b', height: '6px', borderRadius: '3px', marginTop: '12px', overflow: 'hidden' }}>
                                    <div style={{ background: '#38bdf8', width: `${systemHealth.cpuUsage}%`, height: '100%' }}></div>
                                </div>
                            </div>
                            <div className="health-card" style={{ background: '#0f172a', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                                <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' }}>Memory Utilization</div>
                                <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#a855f7', marginTop: '8px' }}>{systemHealth.memoryUsage}%</div>
                                <div style={{ background: '#1e293b', height: '6px', borderRadius: '3px', marginTop: '12px', overflow: 'hidden' }}>
                                    <div style={{ background: '#a855f7', width: `${systemHealth.memoryUsage}%`, height: '100%' }}></div>
                                </div>
                            </div>
                            <div className="health-card" style={{ background: '#0f172a', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                                <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' }}>Database Engine</div>
                                <div style={{ fontSize: '22px', fontWeight: 'bold', color: systemHealth.dbStatus === 'Connected' ? '#10b981' : '#ef4444', marginTop: '8px' }}>
                                    {systemHealth.dbStatus}
                                </div>
                                <div style={{ color: '#64748b', fontSize: '11px', marginTop: '12px' }}>Atlas MongoDB Cluster</div>
                            </div>
                            <div className="health-card" style={{ background: '#0f172a', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                                <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' }}>WebSocket Clients</div>
                                <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#eab308', marginTop: '8px' }}>{systemHealth.socketCount} active</div>
                                <div style={{ color: '#64748b', fontSize: '11px', marginTop: '12px' }}>Socket.IO real-time tunnel</div>
                            </div>
                            <div className="health-card" style={{ background: '#0f172a', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                                <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' }}>Database Backups</div>
                                <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#10b981', marginTop: '8px' }}>{systemHealth.backupStatus.backupCount} archived</div>
                                <div style={{ color: '#64748b', fontSize: '11px', marginTop: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    Last: {systemHealth.backupStatus.lastBackupTime ? new Date(systemHealth.backupStatus.lastBackupTime).toLocaleTimeString() : 'None'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom Row - Alerts & Command Feed */}
            <div className="bottom-dashboard-grid">
                {/* Critical Alerts panel */}
                <div className="bottom-panel-card">
                    <div className="panel-header">
                        <h3>⚠️ Operational Flags & Critical Warnings</h3>
                    </div>
                    <div className="alerts-card-list">
                        {lowStockCount > 0 && (
                            <div className="flag-item error">
                                <FiAlertCircle className="flag-icon" />
                                <div className="flag-body">
                                    <strong>Critical Pharmacy Stocks</strong>
                                    <span>There are {lowStockCount} medicines with low inventory volumes. Restock immediately.</span>
                                </div>
                            </div>
                        )}
                        {s.pendingLabTests > 5 && (
                            <div className="flag-item warning">
                                <FiAlertCircle className="flag-icon" />
                                <div className="flag-body">
                                    <strong>Lab Report Queue Backlog</strong>
                                    <span>{s.pendingLabTests} requested tests are currently waiting processing in the laboratory.</span>
                                </div>
                            </div>
                        )}
                        {s.availableBeds < 10 && (
                            <div className="flag-item warning">
                                <FiAlertCircle className="flag-icon" />
                                <div className="flag-body">
                                    <strong>Low Bed Availability Alert</strong>
                                    <span>Total hospital bed occupancy is critical. Only {s.availableBeds} general ward beds remaining.</span>
                                </div>
                            </div>
                        )}
                        {lowStockCount === 0 && s.pendingLabTests <= 5 && s.availableBeds >= 10 && (
                            <div className="flag-item success">
                                <FiCheckCircle className="flag-icon" />
                                <div className="flag-body">
                                    <strong>All Operations Stable</strong>
                                    <span>No critical alerts flagged. Bed capacity, lab queue, and pharmacy levels are stable.</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Live Activity timeline feed */}
                <div className="bottom-panel-card">
                    <div className="panel-header">
                        <h3>⚡ Real-Time Activity Pipeline</h3>
                        <span className={`live-pipeline-dot ${isSocketConnected ? 'connected' : 'disconnected'}`}>
                            {isSocketConnected ? '● LIVE STREAMING' : '● OFFLINE'}
                        </span>
                    </div>
                    <div className="activity-timeline-feed">
                        {liveFeed.map((feed) => (
                            <div key={feed.id} className={`activity-log-row ${feed.type || 'info'}`}>
                                <span className="time-lbl">{new Date(feed.time).toLocaleTimeString()}</span>
                                <span className="text-lbl">{feed.text}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdministratorDashboard;
