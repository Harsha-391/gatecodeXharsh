import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../store/hooks';
import { administratorAPI, hospitalAPI } from '../../utils/api';
import {
    FiPlusSquare, FiSearch, FiCalendar, FiRefreshCw,
    FiCheckCircle, FiTrendingUp, FiAlertCircle, FiDatabase,
    FiGrid, FiActivity, FiArrowRight, FiX, FiUsers
} from 'react-icons/fi';
import './AdmissionsOversight.css';

const WARD_OPTIONS = ['General', 'ICU', 'OT', 'Deluxe Room', 'Private Room'];
const STATUS_OPTIONS = [
    { value: 'Admitted', label: 'Admitted' },
    { value: 'Observation', label: 'Observation' },
    { value: 'Pending Transfer', label: 'Pending Transfer' },
    { value: 'Transferred', label: 'Transferred' },
    { value: 'Pending Discharge', label: 'Pending Discharge' },
    { value: 'Discharged', label: 'Discharged' }
];

const AdmissionsOversight = () => {
    const { user } = useAuth();
    const userRole = (user?.role || '').toLowerCase();
    const isCentralAdmin = userRole === 'centraladmin' || userRole === 'superadmin';

    // Tabs state: 'overview' | 'occupancy' | 'analytics' | 'transfers'
    const [activeTab, setActiveTab] = useState('overview');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Multi-tenant hospital select state (for Central Admin only)
    const [hospitals, setHospitals] = useState([]);
    const [selectedHospitalId, setSelectedHospitalId] = useState('');

    // Shared reference lists
    const [departmentsList, setDepartmentsList] = useState([]);

    // Tab 1: Overview & Monitoring Table
    const [stats, setStats] = useState({
        totalActiveAdmissions: 0,
        todayAdmissions: 0,
        todayDischarges: 0,
        pendingDischarges: 0,
        pendingTransfers: 0,
        occupiedBeds: 0,
        availableBeds: 0,
        occupancyRate: 0
    });
    const [admissions, setAdmissions] = useState([]);
    const [filters, setFilters] = useState({
        search: '',
        status: '',
        department: '',
        ward: '',
        dateFrom: '',
        dateTo: '',
        doctor: ''
    });

    // Tab 2: Bed Capacity Monitor
    const [occupancyReport, setOccupancyReport] = useState(null);
    const [activeAdmissionsForBeds, setActiveAdmissionsForBeds] = useState([]);

    // Tab 3: Department Analytics
    const [analytics, setAnalytics] = useState([]);

    // Tab 4: Transfer & Discharge Monitoring
    const [transferLogs, setTransferLogs] = useState([]);
    const [dischargeLists, setDischargeLists] = useState({
        todayDischarges: [],
        upcomingDischarges: [],
        delayedDischarges: []
    });

    // Fetch hospitals if Central Admin
    useEffect(() => {
        if (isCentralAdmin) {
            fetchHospitals();
        }
    }, [isCentralAdmin]);

    const fetchHospitals = async () => {
        try {
            const res = await hospitalAPI.getHospitals();
            if (res.success) {
                setHospitals(res.hospitals || []);
            }
        } catch (err) {
            console.error('Failed to load hospitals for Central Admin:', err);
        }
    };

    // Load static departments list
    const fetchDepartments = useCallback(async () => {
        try {
            const res = await administratorAPI.getDepartments();
            if (res.success && res.departments) {
                setDepartmentsList(res.departments.map(d => d.name || d));
            }
        } catch (err) {
            console.error('Failed to load departments:', err);
        }
    }, []);

    useEffect(() => {
        fetchDepartments();
    }, [fetchDepartments]);

    // Main fetch controller based on activeTab and filters
    const fetchData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            // Apply multi-tenant query filter for central admins
            const hospitalParam = isCentralAdmin && selectedHospitalId ? { hospitalId: selectedHospitalId } : {};

            if (activeTab === 'overview') {
                const queryParams = {
                    ...hospitalParam,
                    search: filters.search,
                    status: filters.status,
                    department: filters.department,
                    ward: filters.ward,
                    dateFrom: filters.dateFrom,
                    dateTo: filters.dateTo,
                    doctor: filters.doctor
                };

                const res = await administratorAPI.getAdmissionsOversightDashboard(queryParams);
                if (res.success) {
                    if (res.stats) setStats(res.stats);
                    setAdmissions(res.admissions || []);
                }
            } else if (activeTab === 'occupancy') {
                // Fetch occupancy summary data
                const res = await administratorAPI.getAdmissionsOversightOccupancy();
                if (res.success) {
                    setOccupancyReport(res.occupancy);
                }
                // Also load all current active admissions to map bed visualization details
                const dashboardRes = await administratorAPI.getAdmissionsOversightDashboard({
                    ...hospitalParam,
                    status: '' // fetch all statuses except Discharged
                });
                if (dashboardRes.success) {
                    const activeOnly = (dashboardRes.admissions || []).filter(a => a.status !== 'Discharged');
                    setActiveAdmissionsForBeds(activeOnly);
                }
            } else if (activeTab === 'analytics') {
                const res = await administratorAPI.getAdmissionsOversightAnalytics();
                if (res.success) {
                    setAnalytics(res.analytics || []);
                }
            } else if (activeTab === 'transfers') {
                const res = await administratorAPI.getAdmissionsOversightTransfers();
                if (res.success) {
                    setTransferLogs(res.transfers || []);
                    if (res.discharges) {
                        setDischargeLists(res.discharges);
                    }
                }
            }
        } catch (err) {
            console.error('Error fetching admissions oversight data:', err);
            setError(err.response?.data?.message || 'Failed to load admissions data. Access may be restricted.');
        } finally {
            setLoading(false);
        }
    }, [activeTab, filters, isCentralAdmin, selectedHospitalId]);

    // Trigger fetch on tab change, filter changes, or hospital selection change
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const handleClearFilters = () => {
        setFilters({
            search: '',
            status: '',
            department: '',
            ward: '',
            dateFrom: '',
            dateTo: '',
            doctor: ''
        });
    };

    // Helper: Map bed grids for ICU, General Ward, and custom facilities
    const renderBedGrid = (wardName, totalCount, prefixSymbol, startBedNum) => {
        const beds = [];

        for (let i = 0; i < totalCount; i++) {
            const bedNum = `${prefixSymbol}${startBedNum + i}`;
            // Find active admission currently in this bed
            const currentAdmitted = activeAdmissionsForBeds.find(a => 
                String(a.bedNumber).toUpperCase() === bedNum.toUpperCase() &&
                String(a.ward).toLowerCase() === wardName.toLowerCase()
            );

            beds.push(
                <div 
                    key={bedNum} 
                    className={`bed-cell-monitor ${currentAdmitted ? 'occupied' : 'available'}`}
                    title={currentAdmitted ? `Patient: ${currentAdmitted.patientId?.name || currentAdmitted.patientName || 'N/A'}\nUHID: ${currentAdmitted.patientId?.patientId || 'N/A'}\nDoctor: ${currentAdmitted.appointmentId?.doctorName || 'N/A'}\nAdmitted: ${new Date(currentAdmitted.admissionDate).toLocaleDateString('en-IN')}` : `Bed ${bedNum} is Available`}
                >
                    <span className="bed-cell-num">{bedNum}</span>
                    <span className="bed-cell-label">{currentAdmitted ? 'Occupied' : 'Free'}</span>
                </div>
            );
        }
        return <div className="beds-layout-grid">{beds}</div>;
    };

    return (
        <div className="admissions-oversight-page">
            <div className="oversight-header-row">
                <div className="oversight-header-left">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="oversight-header-badge">Oversight Command</span>
                        {isCentralAdmin && (
                            <span style={{ fontSize: '0.75rem', background: '#3b82f630', color: '#60a5fa', padding: '3px 8px', borderRadius: '4px', fontWeight: 600 }}>
                                Multi-Tenant Enabled
                            </span>
                        )}
                    </div>
                    <h1>Admissions Oversight Dashboard</h1>
                    <p style={{ color: '#94a3b8' }}>
                        Real-time visibility, operational monitoring, and analytics of hospital admissions.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {isCentralAdmin && hospitals.length > 0 && (
                        <div className="filter-input-wrap" style={{ marginRight: '10px' }}>
                            <select 
                                value={selectedHospitalId} 
                                onChange={(e) => setSelectedHospitalId(e.target.value)}
                                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'white', borderRadius: '8px', padding: '8px 12px' }}
                            >
                                <option value="">-- All Hospitals --</option>
                                {hospitals.map(h => (
                                    <option key={h._id} value={h._id}>{h.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <button className="btn-refresh-oversight" onClick={fetchData} disabled={loading}>
                        <FiRefreshCw className={loading ? 'spinning' : ''} /> Refresh Data
                    </button>
                </div>
            </div>

            {error && (
                <div className="audit-banner error" style={{ marginBottom: '20px' }}>
                    <FiAlertCircle /> <span>{error}</span>
                </div>
            )}

            {/* ── Summary Stats Row ── */}
            <div className="oversight-stats-grid">
                <div className="oversight-stat-card">
                    <div className="oversight-stat-icon primary"><FiUsers /></div>
                    <div className="oversight-stat-info">
                        <span className="oversight-stat-value">{stats.totalActiveAdmissions}</span>
                        <span className="oversight-stat-label">Active Admissions</span>
                    </div>
                </div>
                <div className="oversight-stat-card">
                    <div className="oversight-stat-icon success"><FiCheckCircle /></div>
                    <div className="oversight-stat-info">
                        <span className="oversight-stat-value">{stats.todayAdmissions}</span>
                        <span className="oversight-stat-label">Today's Admissions</span>
                    </div>
                </div>
                <div className="oversight-stat-card">
                    <div className="oversight-stat-icon teal"><FiTrendingUp /></div>
                    <div className="oversight-stat-info">
                        <span className="oversight-stat-value">{stats.todayDischarges}</span>
                        <span className="oversight-stat-label">Today's Discharges</span>
                    </div>
                </div>
                <div className="oversight-stat-card">
                    <div className="oversight-stat-icon pink"><FiAlertCircle /></div>
                    <div className="oversight-stat-info">
                        <span className="oversight-stat-value">{stats.pendingDischarges}</span>
                        <span className="oversight-stat-label">Pending Discharges</span>
                    </div>
                </div>
                <div className="oversight-stat-card">
                    <div className="oversight-stat-icon warning"><FiActivity /></div>
                    <div className="oversight-stat-info">
                        <span className="oversight-stat-value">{stats.pendingTransfers}</span>
                        <span className="oversight-stat-label">Pending Transfers</span>
                    </div>
                </div>
                <div className="oversight-stat-card">
                    <div className="oversight-stat-icon danger"><FiDatabase /></div>
                    <div className="oversight-stat-info">
                        <span className="oversight-stat-value">{stats.occupiedBeds}</span>
                        <span className="oversight-stat-label">Occupied Beds</span>
                    </div>
                </div>
                <div className="oversight-stat-card">
                    <div className="oversight-stat-icon blue"><FiGrid /></div>
                    <div className="oversight-stat-info">
                        <span className="oversight-stat-value">{stats.availableBeds}</span>
                        <span className="oversight-stat-label">Available Beds</span>
                    </div>
                </div>
                <div className="oversight-stat-card">
                    <div className="oversight-stat-icon primary"><FiActivity /></div>
                    <div className="oversight-stat-info">
                        <span className="oversight-stat-value">{stats.occupancyRate}%</span>
                        <span className="oversight-stat-label">Occupancy Rate</span>
                    </div>
                </div>
            </div>

            {/* ── Navigation Tabs ── */}
            <div className="oversight-tabs-row">
                <button className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
                    <FiGrid /> Admissions Monitor
                </button>
                <button className={`tab-btn ${activeTab === 'occupancy' ? 'active' : ''}`} onClick={() => setActiveTab('occupancy')}>
                    <FiDatabase /> Bed Capacity & Wards
                </button>
                <button className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>
                    <FiTrendingUp /> Department Analytics
                </button>
                <button className={`tab-btn ${activeTab === 'transfers' ? 'active' : ''}`} onClick={() => setActiveTab('transfers')}>
                    <FiActivity /> Transfers & Discharges
                </button>
            </div>

            {/* ── Glass Container Viewport ── */}
            <div className="oversight-glass-container">
                {loading && (
                    <div className="loading-box-oversight">
                        <span className="spinner-oversight" />
                        <span>Fetching oversight data logs...</span>
                    </div>
                )}

                {!loading && activeTab === 'overview' && (
                    <div className="admissions-monitoring-tab">
                        {/* Filters Panel */}
                        <div className="oversight-filters-card">
                            <div className="search-filter-row">
                                <div className="search-box-wrap">
                                    <FiSearch className="search-icon" />
                                    <input 
                                        type="text" 
                                        placeholder="Search by Patient Name or UHID..." 
                                        value={filters.search} 
                                        onChange={(e) => handleFilterChange('search', e.target.value)} 
                                    />
                                </div>
                                {(filters.search || filters.status || filters.department || filters.ward || filters.dateFrom || filters.dateTo || filters.doctor) && (
                                    <button className="btn-clear-oversight-filters" onClick={handleClearFilters}>
                                        <FiX /> Clear Filters
                                    </button>
                                )}
                            </div>

                            <div className="filters-grid">
                                <div className="filter-input-wrap">
                                    <label>Status</label>
                                    <select value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)}>
                                        <option value="">All Statuses</option>
                                        {STATUS_OPTIONS.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="filter-input-wrap">
                                    <label>Department</label>
                                    <select value={filters.department} onChange={(e) => handleFilterChange('department', e.target.value)}>
                                        <option value="">All Departments</option>
                                        {departmentsList.map(dept => (
                                            <option key={dept} value={dept}>{dept}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="filter-input-wrap">
                                    <label>Ward</label>
                                    <select value={filters.ward} onChange={(e) => handleFilterChange('ward', e.target.value)}>
                                        <option value="">All Wards</option>
                                        {occupancyReport && occupancyReport.facilities && occupancyReport.facilities.length > 0 ? (
                                            occupancyReport.facilities.map(f => (
                                                <option key={f.name} value={f.name}>{f.name}</option>
                                            ))
                                        ) : (
                                            WARD_OPTIONS.map(ward => (
                                                <option key={ward} value={ward}>{ward}</option>
                                            ))
                                        )}
                                    </select>
                                </div>

                                <div className="filter-input-wrap">
                                    <label>Doctor Name</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. Dr. Roy" 
                                        value={filters.doctor} 
                                        onChange={(e) => handleFilterChange('doctor', e.target.value)} 
                                        style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', color: '#cbd5e1', padding: '8px 10px', fontSize: '0.85rem' }}
                                    />
                                </div>

                                <div className="filter-input-wrap">
                                    <label>From Date</label>
                                    <input type="date" value={filters.dateFrom} onChange={(e) => handleFilterChange('dateFrom', e.target.value)} />
                                </div>

                                <div className="filter-input-wrap">
                                    <label>To Date</label>
                                    <input type="date" value={filters.dateTo} onChange={(e) => handleFilterChange('dateTo', e.target.value)} />
                                </div>
                            </div>
                        </div>

                        {/* Admissions Table */}
                        <div className="oversight-table-wrap">
                            <table className="oversight-table">
                                <thead>
                                    <tr>
                                        <th>Admission ID</th>
                                        <th>Patient Name</th>
                                        <th>UHID</th>
                                        <th>Department</th>
                                        <th>Assigned Doctor</th>
                                        <th>Ward</th>
                                        <th>Bed</th>
                                        <th>Admission Date</th>
                                        <th>Status</th>
                                        <th>Admitted By</th>
                                        <th>Last Updated</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {admissions.map(adm => {
                                        const statusClass = (adm.status || '').toLowerCase().replace(' ', '-');
                                        return (
                                            <tr key={adm._id}>
                                                <td style={{ fontSize: '0.8rem', opacity: 0.85 }}>{String(adm._id).slice(-8).toUpperCase()}</td>
                                                <td className="cell-patient-name">{adm.patientId?.name || adm.patientName}</td>
                                                <td><span className="cell-uhid">{adm.patientId?.patientId || 'N/A'}</span></td>
                                                <td>{adm.requestedDepartment || 'General'}</td>
                                                <td>Dr. {adm.appointmentId?.doctorName || adm.doctorName || 'Assigned'}</td>
                                                <td>{adm.ward || 'N/A'}</td>
                                                <td className="cell-bed">{adm.bedNumber || 'N/A'}</td>
                                                <td>{new Date(adm.admissionDate).toLocaleDateString('en-IN')}</td>
                                                <td>
                                                    <span className={`badge-oversight ${statusClass}`}>
                                                        {adm.status}
                                                    </span>
                                                </td>
                                                <td>{adm.admittedBy?.name || 'System'}</td>
                                                <td style={{ fontSize: '0.8rem', opacity: 0.75 }}>{new Date(adm.updatedAt || adm.createdAt).toLocaleString('en-IN')}</td>
                                            </tr>
                                        );
                                    })}
                                    {admissions.length === 0 && (
                                        <tr>
                                            <td colSpan="11" className="empty-data-oversight">
                                                <FiUsers style={{ fontSize: '2rem', opacity: 0.3 }} />
                                                <p>No active admissions found matching the query filters.</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {!loading && activeTab === 'occupancy' && occupancyReport && (
                    <div className="bed-occupancy-container">
                        <div className="bed-summary-grid">
                            <div className="bed-summary-card">
                                <h3>⚡ General Ward Utilization</h3>
                                <div className="progress-bar-container">
                                    <div 
                                        className="progress-bar-fill ward" 
                                        style={{ width: `${occupancyReport.wardOccupancyRate}%` }} 
                                    />
                                </div>
                                <div className="bed-details-labels">
                                    <span>Occupied: <strong>{occupancyReport.wardOccupied} / {occupancyReport.wardTotal}</strong></span>
                                    <span>Rate: <strong>{occupancyReport.wardOccupancyRate}%</strong></span>
                                </div>
                            </div>

                            <div className="bed-summary-card">
                                <h3>🚨 ICU Utilization</h3>
                                <div className="progress-bar-container">
                                    <div 
                                        className="progress-bar-fill icu" 
                                        style={{ width: `${occupancyReport.icuOccupancyRate}%` }} 
                                    />
                                </div>
                                <div className="bed-details-labels">
                                    <span>Occupied: <strong>{occupancyReport.icuOccupied} / {occupancyReport.icuTotal}</strong></span>
                                    <span>Rate: <strong>{occupancyReport.icuOccupancyRate}%</strong></span>
                                </div>
                            </div>

                            <div className="bed-summary-card">
                                <h3>🛏️ Total Bed Capacity</h3>
                                <div className="progress-bar-container" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                    <div 
                                        className="progress-bar-fill" 
                                        style={{ width: `${occupancyReport.icuOccupancyRate + occupancyReport.wardOccupancyRate / 2}%`, background: 'linear-gradient(90deg, #14b8a6, #3b82f6)' }} 
                                    />
                                </div>
                                <div className="bed-details-labels">
                                    <span>Available: <strong>{occupancyReport.availableBeds} / {occupancyReport.totalBeds}</strong></span>
                                    <span>Occupancy: <strong>{Math.round((occupancyReport.occupiedBeds / occupancyReport.totalBeds) * 100)}%</strong></span>
                                </div>
                            </div>
                        </div>

                        {/* Bed Layout Visualizer */}
                        {occupancyReport.facilities && occupancyReport.facilities.length > 0 ? (
                            occupancyReport.facilities.map(fac => {
                                const count = fac.bedCount || 0;
                                if (count <= 0) return null;
                                
                                const isICU = fac.name.toUpperCase().includes('ICU');
                                const prefix = isICU ? 'ICU-' : `${fac.name.substring(0, 3).toUpperCase()}-`;
                                
                                return (
                                    <div key={fac.name} className="ward-visualization-section">
                                        <h3>
                                            {isICU ? '🚨' : '🛏️'} {fac.name} Beds (Total: {count} Beds)
                                        </h3>
                                        {renderBedGrid(fac.name, count, prefix, 1)}
                                    </div>
                                );
                            })
                        ) : (
                            <>
                                <div className="ward-visualization-section">
                                    <h3>🚨 ICU Beds (Total: 10 Beds)</h3>
                                    {renderBedGrid('ICU', 10, 'ICU-', 201)}
                                </div>

                                <div className="ward-visualization-section">
                                    <h3>🛏️ General Ward Beds (Total: 40 Beds)</h3>
                                    {renderBedGrid('General', 40, 'GW-', 101)}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {!loading && activeTab === 'analytics' && (
                    <div className="department-analytics-tab">
                        <h3 style={{ marginBottom: '16px', fontSize: '1.1rem', color: '#e2e8f0' }}>🏢 Department Admissions & bed metrics</h3>
                        <div className="oversight-table-wrap">
                            <table className="oversight-table">
                                <thead>
                                    <tr>
                                        <th>Department Name</th>
                                        <th>Active Admissions</th>
                                        <th>Monthly Admissions (Last 30d)</th>
                                        <th>Monthly Discharges (Last 30d)</th>
                                        <th>Average Length of Stay</th>
                                        <th>Bed Utilization (%)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {analytics.map(dept => (
                                        <tr key={dept.departmentName}>
                                            <td className="cell-patient-name">{dept.departmentName}</td>
                                            <td style={{ fontWeight: 700 }}>{dept.activeAdmissions}</td>
                                            <td>{dept.monthlyAdmissions}</td>
                                            <td>{dept.monthlyDischarges}</td>
                                            <td>{dept.averageLengthOfStay} days</td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <div className="progress-bar-container" style={{ width: '80px', height: '6px', margin: 0 }}>
                                                        <div 
                                                            className="progress-bar-fill" 
                                                            style={{ width: `${dept.bedUtilization}%`, background: dept.bedUtilization > 80 ? '#f43f5e' : '#38bdf8' }} 
                                                        />
                                                    </div>
                                                    <span>{dept.bedUtilization}%</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {analytics.length === 0 && (
                                        <tr>
                                            <td colSpan="6" className="empty-data-oversight">
                                                <FiTrendingUp style={{ fontSize: '2rem', opacity: 0.3 }} />
                                                <p>No department analytics available for this hospital.</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {!loading && activeTab === 'transfers' && (
                    <div className="transfers-discharges-layout">
                        {/* Transfers list */}
                        <div className="transfers-monitoring-block">
                            <h3 style={{ marginBottom: '16px', fontSize: '1.1rem', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FiActivity /> Patient Transfer Log (Read-only)
                            </h3>
                            <div className="oversight-table-wrap">
                                <table className="oversight-table">
                                    <thead>
                                        <tr>
                                            <th>Patient</th>
                                            <th>From Department</th>
                                            <th>To Department</th>
                                            <th>From Bed</th>
                                            <th>To Bed</th>
                                            <th>Transfer Date</th>
                                            <th>Performed By</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {transferLogs.map(t => (
                                            <tr key={t._id}>
                                                <td className="cell-patient-name">{t.patientId?.name || 'Patient'}</td>
                                                <td>{t.fromDepartment || 'N/A'}</td>
                                                <td><span style={{ color: '#60a5fa', fontWeight: 600 }}>{t.toDepartment}</span></td>
                                                <td className="cell-bed">{t.fromBed || 'N/A'}</td>
                                                <td className="cell-bed" style={{ color: '#4ade80' }}>{t.toBed}</td>
                                                <td>{new Date(t.transferDate || t.createdAt).toLocaleDateString('en-IN')}</td>
                                                <td>{t.performedBy?.name || 'System'}</td>
                                            </tr>
                                        ))}
                                        {transferLogs.length === 0 && (
                                            <tr>
                                                <td colSpan="7" className="empty-data-oversight">
                                                    <FiActivity style={{ fontSize: '2rem', opacity: 0.3 }} />
                                                    <p>No bed transfer records logged in database.</p>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Discharges categorization */}
                        <div className="discharge-categories-wrap">
                            <h3 style={{ marginBottom: '16px', fontSize: '1.1rem', color: '#e2e8f0' }}>
                                🚪 Discharge Activity Monitor
                            </h3>

                            {/* Today's Discharges */}
                            <div className="discharge-category-block">
                                <h4 className="today"><FiCheckCircle /> Today's Discharges ({dischargeLists.todayDischarges?.length || 0})</h4>
                                {dischargeLists.todayDischarges?.map(d => (
                                    <div key={d._id} className="discharge-patient-item">
                                        <div>
                                            <span style={{ fontWeight: 600 }}>{d.patientId?.name || d.patientName}</span>
                                            <div className="discharge-patient-meta">UHID: {d.patientId?.patientId || 'N/A'} · Dept: {d.requestedDepartment}</div>
                                        </div>
                                        <div style={{ color: '#4ade80', fontSize: '0.8rem', fontWeight: 600 }}>
                                            Discharged
                                        </div>
                                    </div>
                                ))}
                                {(!dischargeLists.todayDischarges || dischargeLists.todayDischarges.length === 0) && (
                                    <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>No discharges completed today.</p>
                                )}
                            </div>

                            {/* Upcoming Planned Discharges */}
                            <div className="discharge-category-block">
                                <h4 className="upcoming"><FiCalendar /> Upcoming Planned Discharges ({dischargeLists.upcomingDischarges?.length || 0})</h4>
                                {dischargeLists.upcomingDischarges?.map(d => (
                                    <div key={d._id} className="discharge-patient-item">
                                        <div>
                                            <span style={{ fontWeight: 600 }}>{d.patientId?.name || d.patientName}</span>
                                            <div className="discharge-patient-meta">UHID: {d.patientId?.patientId || 'N/A'} · Bed: {d.bedNumber}</div>
                                        </div>
                                        <div style={{ color: '#60a5fa', fontSize: '0.8rem', fontWeight: 600 }}>
                                            {d.dischargeDate ? new Date(d.dischargeDate).toLocaleDateString('en-IN') : 'Scheduled'}
                                        </div>
                                    </div>
                                ))}
                                {(!dischargeLists.upcomingDischarges || dischargeLists.upcomingDischarges.length === 0) && (
                                    <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>No planned discharges upcoming.</p>
                                )}
                            </div>

                            {/* Delayed Discharges */}
                            <div className="discharge-category-block">
                                <h4 className="delayed"><FiAlertCircle /> Delayed Discharges ({dischargeLists.delayedDischarges?.length || 0})</h4>
                                {dischargeLists.delayedDischarges?.map(d => (
                                    <div key={d._id} className="discharge-patient-item">
                                        <div>
                                            <span style={{ fontWeight: 600 }}>{d.patientId?.name || d.patientName}</span>
                                            <div className="discharge-patient-meta">UHID: {d.patientId?.patientId || 'N/A'} · Status: {d.status}</div>
                                        </div>
                                        <div style={{ color: '#f87171', fontSize: '0.8rem', fontWeight: 600 }}>
                                            Pending Clearance
                                        </div>
                                    </div>
                                ))}
                                {(!dischargeLists.delayedDischarges || dischargeLists.delayedDischarges.length === 0) && (
                                    <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>No delayed or overdue discharges.</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdmissionsOversight;
