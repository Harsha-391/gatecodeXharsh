import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../store/hooks';
import { administratorAPI } from '../../utils/api';
import {
    FiClipboard, FiSearch, FiClock, FiUser, FiActivity,
    FiShield, FiTrendingUp, FiAlertCircle, FiRefreshCw,
    FiDownload, FiFilter, FiCheckCircle, FiXCircle,
    FiChevronLeft, FiChevronRight, FiDatabase, FiLock,
    FiCalendar, FiEye, FiTrash2, FiSettings, FiEdit
} from 'react-icons/fi';
import './AuditLogs.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ACTION_GROUPS = {
    'All Events': null,
    'Authentication': ['STAFF_LOGIN', 'STAFF_LOGOUT', 'PATIENT_LOGIN', 'LOGIN', 'LOGOUT', 'FAILED_LOGIN', 'PASSWORD_RESET', 'ACCESS_DENIED'],
    'Failed Access': ['FAILED_ACCESS', 'FAILED_LOGIN', 'ACCESS_DENIED'],
    'Patient Records': ['VIEW_PATIENT', 'CREATE_PATIENT', 'UPDATE_PATIENT', 'DELETE_PATIENT', 'PATIENT_ACCESS'],
    'Appointments': ['VIEW_APPOINTMENT', 'CREATE_APPOINTMENT', 'UPDATE_APPOINTMENT', 'CANCEL_APPOINTMENT', 'COMPLETE_APPOINTMENT'],
    'Clinical / Lab': ['VIEW_PRESCRIPTION', 'CREATE_PRESCRIPTION', 'UPDATE_PRESCRIPTION'],
    'Billing': ['VIEW_BILL', 'CREATE_BILL', 'UPDATE_BILL', 'CONFIRM_PAYMENT'],
    'RBAC / Users': ['USER_CREATE', 'USER_UPDATE', 'USER_DELETE', 'ROLE_CHANGE', 'PERMISSION_CHANGE', 'PASSWORD_RESET'],
    'Exports': ['DATA_EXPORT', 'EXPORT_DATA', 'EXPORT'],
    'Settings': ['SETTINGS_UPDATE', 'HOSPITAL_UPDATE'],
};

const SEVERITY_COLORS = { info: '#3b82f6', warning: '#f59e0b', critical: '#ef4444' };
const SEVERITY_LABELS = { info: 'Info', warning: 'Warning', critical: 'Critical' };

const getActionIcon = (action = '', success = true) => {
    const a = action.toLowerCase();
    if (!success || a.includes('fail') || a.includes('failed')) return <FiAlertCircle />;
    if (a.includes('login') || a.includes('logout')) return <FiUser />;
    if (a.includes('role') || a.includes('permission')) return <FiShield />;
    if (a.includes('delete') || a.includes('erase')) return <FiTrash2 />;
    if (a.includes('bill') || a.includes('invoice') || a.includes('payment')) return <FiTrendingUp />;
    if (a.includes('patient') || a.includes('prescription') || a.includes('clinical')) return <FiActivity />;
    if (a.includes('export') || a.includes('download')) return <FiDownload />;
    if (a.includes('settings') || a.includes('hospital') || a.includes('update')) return <FiSettings />;
    if (a.includes('create') || a.includes('user')) return <FiEdit />;
    if (a.includes('view') || a.includes('access')) return <FiEye />;
    return <FiClipboard />;
};

const getActionClass = (action = '', success = true) => {
    if (!success) return 'log-icon danger';
    const a = action.toLowerCase();
    if (a.includes('fail')) return 'log-icon danger';
    if (a.includes('delete') || a.includes('erase')) return 'log-icon danger';
    if (a.includes('login')) return 'log-icon success';
    if (a.includes('role') || a.includes('permission') || a.includes('password')) return 'log-icon critical';
    if (a.includes('bill') || a.includes('payment')) return 'log-icon warning';
    if (a.includes('patient') || a.includes('clinical')) return 'log-icon primary';
    if (a.includes('export')) return 'log-icon warning';
    return 'log-icon default';
};

const formatUser = (log) => {
    if (log.userName && log.userName !== 'System' && log.userName !== 'Unknown') return log.userName;
    if (log.userEmail) return log.userEmail;
    return 'System';
};

const formatTarget = (log) => {
    if (log.targetLabel) return log.targetLabel;
    if (log.targetModel && log.targetId) return `${log.targetModel} (${String(log.targetId).slice(-6)})`;
    if (log.targetModel) return log.targetModel;
    return null;
};

const formatReason = (log) => {
    if (log.reason) return log.reason;
    if (!log.success) return 'Action failed';
    return null;
};

// ─── CSV Export ───────────────────────────────────────────────────────────────

const exportToCSV = (logs, stats) => {
    const headers = [
        'Timestamp', 'Action', 'Severity', 'User Name', 'User Email', 'Role',
        'IP Address', 'Target', 'Success', 'Reason', 'Request Method', 'Request Path',
        'Data Category', 'Session ID'
    ];
    const rows = logs.map(log => [
        new Date(log.createdAt).toISOString(),
        log.action || '',
        log.severity || 'info',
        log.userName || 'System',
        log.userEmail || '',
        log.role || '',
        log.ip || '',
        formatTarget(log) || '',
        log.success ? 'Yes' : 'No',
        log.reason || '',
        log.requestMethod || '',
        log.requestPath || '',
        (log.dataCategory === 'Administrative' ? '' : (log.dataCategory || '')),
        log.sessionId || '',
    ]);
    const csvContent = [headers, ...rows]
        .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit_log_export_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
};

// ─── Component ────────────────────────────────────────────────────────────────

const AuditLogs = () => {
    const today = new Date().toLocaleDateString('en-CA');
    const { user } = useAuth();
    // ── State ─────────────────────────────────────────────────────────────────
    const [logs, setLogs] = useState([]);
    const [stats, setStats] = useState({ todayTotal: 0, todayFailed: 0, patientAccess: 0, exports: 0, updates: 0, authSuccessfulLogins: 0, authFailedLogins: 0, authLogouts: 0 });
    const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [exporting, setExporting] = useState(false);
    const [selectedLog, setSelectedLog] = useState(null);
    const [sessionDuration, setSessionDuration] = useState(null);
    const [loadingDuration, setLoadingDuration] = useState(false);

    // ── Filters ───────────────────────────────────────────────────────────────
    const [search, setSearch]         = useState('');
    const [actionGroup, setActionGroup] = useState('All Events');
    const [successFilter, setSuccessFilter] = useState('');   // '', 'true', 'false'
    const [severityFilter, setSeverityFilter] = useState(''); // '', 'info', 'warning', 'critical'
    const [dateFrom, setDateFrom]     = useState('');
    const [dateTo, setDateTo]         = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    const debounceRef = useRef(null);

    // ── Fetch ─────────────────────────────────────────────────────────────────
    const buildParams = useCallback((page = 1) => {
        const params = { page, limit: pagination.limit };
        if (search.trim())        params.search = search.trim();
        if (successFilter !== '') params.success = successFilter;
        if (severityFilter)       params.severity = severityFilter;
        if (dateFrom)             params.dateFrom = dateFrom;
        if (dateTo)               params.dateTo = dateTo;

        // Resolve action group → specific action values
        if (actionGroup !== 'All Events') {
            const actions = ACTION_GROUPS[actionGroup];
            if (actions) {
                params.action = actions.join(',');
            }
        }

        return params;
    }, [search, actionGroup, successFilter, severityFilter, dateFrom, dateTo, pagination.limit]);

    const fetchLogs = useCallback(async (page = 1) => {
        setLoading(true);
        setError('');
        try {
            const params = buildParams(page);
            const res = await administratorAPI.getAuditLogs(params);
            if (res.success) {
                setLogs(res.logs || []);
                setStats(res.stats || { todayTotal: 0, todayFailed: 0, patientAccess: 0, exports: 0, updates: 0, authSuccessfulLogins: 0, authFailedLogins: 0, authLogouts: 0 });
                setPagination(res.pagination || { page, limit: 50, total: 0, pages: 1 });
                setCurrentPage(page);
            }
        } catch (err) {
            console.error('Error fetching audit logs:', err);
            setError('Failed to fetch audit logs from server.');
        } finally {
            setLoading(false);
        }
    }, [buildParams]);

    const formatDuration = (minutes) => {
        if (minutes === null || minutes === undefined) return 'N/A';
        if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (mins === 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
        return `${hours} hour${hours !== 1 ? 's' : ''} ${mins} minute${mins !== 1 ? 's' : ''}`;
    };

    const handleRowClick = async (log) => {
        setSelectedLog(log);
        setSessionDuration(null);
        if (log.sessionId) {
            setLoadingDuration(true);
            try {
                const res = await administratorAPI.getAuditLogSessionDuration(log.sessionId);
                if (res.success && res.loginTime) {
                    setSessionDuration(res);
                }
            } catch (err) {
                console.error('Failed to fetch session duration:', err);
            } finally {
                setLoadingDuration(false);
            }
        }
    };

    // Debounced search
    useEffect(() => {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => fetchLogs(1), 400);
        return () => clearTimeout(debounceRef.current);
    }, [search, actionGroup, successFilter, severityFilter, dateFrom, dateTo]);

    // ── Export ────────────────────────────────────────────────────────────────
    const handleExport = async () => {
        setExporting(true);
        try {
            // Fetch ALL matching logs for export (up to 5000)
            const params = buildParams(1);
            params.limit = 5000;
            params.export = 'true';
            const res = await administratorAPI.getAuditLogs(params);
            if (res.success) {
                exportToCSV(res.logs || [], res.stats);
            }
        } catch (err) {
            setError('Failed to export audit logs.');
        } finally {
            setExporting(false);
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="audit-logs-page">
            {/* ── Header ───────────────────────────────────────────────────── */}
            <div className="audit-header-row">
                <div>
                    <h1>System Audit Logs</h1>
                    <p>
                        Track all system actions — authentication, patient access, RBAC changes, billing, and exports.
                        <span className="audit-compliance-badge">DPDP Act · CERT-IN Compliant</span>
                    </p>
                </div>
                <div className="audit-header-actions">
                    <button onClick={() => fetchLogs(currentPage)} className="btn-refresh" title="Reload">
                        <FiRefreshCw /> Reload
                    </button>
                    <button onClick={handleExport} className="btn-export" disabled={exporting} title="Export CSV">
                        <FiDownload /> {exporting ? 'Exporting…' : 'Export CSV'}
                    </button>
                </div>
            </div>

            {/* ── Error Banner ─────────────────────────────────────────────── */}
            {error && (
                <div className="audit-banner error">
                    <FiAlertCircle /> <span>{error}</span>
                </div>
            )}

            {/* ── Summary Cards ─────────────────────────────────────────────── */}
            <div className="audit-stats-row">
                <div className="audit-stat-card">
                    <div className="stat-icon blue"><FiDatabase /></div>
                    <div><span className="stat-value">{stats.todayTotal}</span><span className="stat-label">Today's Events</span></div>
                </div>
                <div className="audit-stat-card danger">
                    <div className="stat-icon red"><FiAlertCircle /></div>
                    <div><span className="stat-value">{stats.todayFailed}</span><span className="stat-label">Failed Actions</span></div>
                </div>
                <div className="audit-stat-card">
                    <div className="stat-icon green"><FiActivity /></div>
                    <div><span className="stat-value">{stats.patientAccess}</span><span className="stat-label">Patient Accesses</span></div>
                </div>
                <div className="audit-stat-card warning">
                    <div className="stat-icon orange"><FiDownload /></div>
                    <div><span className="stat-value">{stats.exports}</span><span className="stat-label">Data Exports</span></div>
                </div>
                <div className="audit-stat-card">
                    <div className="stat-icon purple"><FiEdit /></div>
                    <div><span className="stat-value">{stats.updates}</span><span className="stat-label">Updates</span></div>
                </div>
                <div className="audit-stat-card auth-breakdown-card">
                    <div className="stat-icon lock-yellow"><FiLock /></div>
                    <div className="auth-card-content">
                        <span className="stat-label-main">Authentication Today</span>
                        <div className="auth-breakdown-list">
                            <span className="auth-breakdown-item success">
                                🟢 Logins: <strong>{stats.authSuccessfulLogins || 0}</strong>
                            </span>
                            <span className="auth-breakdown-item danger">
                                🔴 Failed: <strong>{stats.authFailedLogins || 0}</strong>
                            </span>
                            <span className="auth-breakdown-item warning">
                                🟠 Logouts: <strong>{stats.authLogouts || 0}</strong>
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Filters ──────────────────────────────────────────────────── */}
            <div className="audit-content-card">
                <div className="audit-filter-section">
                    {/* Search */}
                    <div className="audit-filter-row">
                        <div className="search-box">
                            <FiSearch className="search-icon" />
                            <input
                                id="audit-search"
                                type="text"
                                placeholder="Search by user, email, target, or reason…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>

                        {/* Success / Failure */}
                        <div className="filter-group">
                            <label><FiFilter /> Status</label>
                            <select id="audit-success-filter" value={successFilter} onChange={e => setSuccessFilter(e.target.value)}>
                                <option value="">All</option>
                                <option value="true">✅ Success</option>
                                <option value="false">❌ Failed</option>
                            </select>
                        </div>

                        {/* Severity */}
                        <div className="filter-group">
                            <label><FiShield /> Severity</label>
                            <select id="audit-severity-filter" value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}>
                                <option value="">All</option>
                                <option value="info">ℹ️ Info</option>
                                <option value="warning">⚠️ Warning</option>
                                <option value="critical">🔴 Critical</option>
                            </select>
                        </div>
                    </div>

                    {/* Date range */}
                    <div className="audit-filter-row">
                        <div className="filter-group date-group">
                            <label><FiCalendar /> From</label>
                            <input 
                                id="audit-date-from" 
                                type="date" 
                                value={dateFrom} 
                                max={today}
                                onChange={e => {
                                    const val = e.target.value;
                                    setDateFrom(val > today ? today : val);
                                }} 
                            />
                        </div>
                        <div className="filter-group date-group">
                            <label><FiCalendar /> To</label>
                            <input 
                                id="audit-date-to" 
                                type="date" 
                                value={dateTo} 
                                max={today}
                                onChange={e => {
                                    const val = e.target.value;
                                    setDateTo(val > today ? today : val);
                                }} 
                            />
                        </div>
                        {(dateFrom || dateTo || search || successFilter || severityFilter || actionGroup !== 'All Events') && (
                            <button className="btn-clear-filters" onClick={() => {
                                setSearch(''); setSuccessFilter(''); setSeverityFilter('');
                                setDateFrom(''); setDateTo(''); setActionGroup('All Events');
                            }}>
                                ✕ Clear Filters
                            </button>
                        )}
                    </div>

                    {/* Category buttons */}
                    <div className="audit-filter-pills">
                        {Object.keys(ACTION_GROUPS).map(grp => (
                            <button
                                key={grp}
                                className={`filter-opt ${actionGroup === grp ? 'active' : ''}`}
                                onClick={() => setActionGroup(grp)}
                            >
                                {grp}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Pagination info ──────────────────────────────────────── */}
                {!loading && (
                    <div className="audit-pagination-info">
                        Showing {((currentPage - 1) * pagination.limit) + 1}–{Math.min(currentPage * pagination.limit, pagination.total)} of <strong>{pagination.total}</strong> events
                    </div>
                )}

                {/* ── Timeline ─────────────────────────────────────────────── */}
                {loading ? (
                    <div className="audit-loading">
                        <span className="audit-spinner" /> Fetching audit timeline…
                    </div>
                ) : logs.length === 0 ? (
                    <div className="audit-empty">
                        <FiDatabase size={32} />
                        <p>No audit records match the current filters.</p>
                    </div>
                ) : (
                    <div className="audit-timeline-container">
                        {logs.map((log) => (
                            <div key={log._id} className={`audit-timeline-item clickable-timeline-item ${!log.success ? 'failed' : ''}`} onClick={() => handleRowClick(log)}>
                                <div className="icon-column-audit">
                                    <div className={getActionClass(log.action, log.success)}>
                                        {getActionIcon(log.action, log.success)}
                                    </div>
                                    <div className="timeline-line" />
                                </div>
                                <div className="details-column-audit">
                                    <div className="title-row">
                                        <span className={`action-tag ${log.severity || 'info'}`}>{log.action || 'OPERATION'}</span>
                                        {log.severity && log.severity !== 'info' && (
                                            <span className={`severity-badge ${log.severity}`}>
                                                {log.severity === 'critical' ? '🔴' : '⚠️'} {SEVERITY_LABELS[log.severity]}
                                            </span>
                                        )}
                                        {log.success
                                            ? <span className="outcome-badge success"><FiCheckCircle /> Success</span>
                                            : <span className="outcome-badge failure"><FiXCircle /> Failed</span>
                                        }
                                        <span className="timestamp-tag">
                                            <FiClock /> {new Date(log.createdAt).toLocaleString()}
                                        </span>
                                    </div>

                                    <div className="meta-footer">
                                        <span className="meta-item">
                                            <FiUser /> <strong>{formatUser(log)}</strong>
                                            {log.role && <em className="meta-role"> ({log.role})</em>}
                                        </span>

                                        {log.ip && (
                                            <span className="meta-item ip">
                                                IP: <strong>{log.ip}</strong>
                                            </span>
                                        )}

                                        {formatTarget(log) && (
                                            <span className="meta-item target">
                                                <FiDatabase /> Target: <strong>{formatTarget(log)}</strong>
                                            </span>
                                        )}

                                        {log.dataCategory && log.dataCategory !== 'Administrative' && (
                                            <span className="meta-item category">
                                                <FiLock /> {log.dataCategory}
                                            </span>
                                        )}

                                        {log.requestMethod && log.requestPath && (
                                            <span className="meta-item path">
                                                <code>{log.requestMethod} {log.requestPath.length > 60 ? log.requestPath.slice(0, 60) + '…' : log.requestPath}</code>
                                            </span>
                                        )}

                                        {log.userAgent && (
                                            <span className="meta-item agent" title={log.userAgent}>
                                                Client: <strong>{log.userAgent.split(' ')[0]}</strong>
                                            </span>
                                        )}
                                    </div>

                                    {formatReason(log) && (
                                        <div className="audit-reason">
                                            <FiAlertCircle /> {formatReason(log)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Pagination Controls ───────────────────────────────────── */}
                {pagination.pages > 1 && (
                    <div className="audit-pagination">
                        <button
                            className="pagination-btn"
                            disabled={currentPage === 1}
                            onClick={() => fetchLogs(currentPage - 1)}
                        >
                            <FiChevronLeft /> Prev
                        </button>
                        <span className="pagination-current">
                            Page {currentPage} of {pagination.pages}
                        </span>
                        <button
                            className="pagination-btn"
                            disabled={currentPage >= pagination.pages}
                            onClick={() => fetchLogs(currentPage + 1)}
                        >
                            Next <FiChevronRight />
                        </button>
                    </div>
                )}
            </div>

            {selectedLog && (
                <div className="audit-modal-overlay" onClick={() => setSelectedLog(null)}>
                    <div className="audit-modal-card" onClick={e => e.stopPropagation()}>
                        <div className="audit-modal-header">
                            <h3>🔍 Audit Log Detail</h3>
                            <button className="audit-modal-close" onClick={() => setSelectedLog(null)}>✕</button>
                        </div>
                        <div className="audit-modal-body">
                            <div className="audit-detail-grid">
                                <div className="detail-row">
                                    <span className="detail-label">Action</span>
                                    <span className={`detail-val action-badge ${selectedLog.severity || 'info'}`}>{selectedLog.action}</span>
                                </div>
                                <div className="detail-row">
                                    <span className="detail-label">Severity</span>
                                    <span className={`detail-val severity-tag ${selectedLog.severity || 'info'}`}>{selectedLog.severity?.toUpperCase()}</span>
                                </div>
                                <div className="detail-row">
                                    <span className="detail-label">Outcome</span>
                                    <span className={`detail-val outcome-badge-modal ${selectedLog.success ? 'success' : 'failure'}`}>
                                        {selectedLog.success ? '✅ Success' : '❌ Failed'}
                                    </span>
                                </div>
                                <div className="detail-row">
                                    <span className="detail-label">Timestamp</span>
                                    <span className="detail-val">{new Date(selectedLog.createdAt).toLocaleString()}</span>
                                </div>
                                <div className="detail-row">
                                    <span className="detail-label">Performed By</span>
                                    <span className="detail-val">
                                        <strong>{formatUser(selectedLog)}</strong>
                                        {selectedLog.role && <span className="detail-role"> ({selectedLog.role})</span>}
                                    </span>
                                </div>
                                {selectedLog.userEmail && (
                                    <div className="detail-row">
                                        <span className="detail-label">Email</span>
                                        <span className="detail-val">{selectedLog.userEmail}</span>
                                    </div>
                                )}
                                {selectedLog.ip && (
                                    <div className="detail-row">
                                        <span className="detail-label">IP Address</span>
                                        <span className="detail-val"><code>{selectedLog.ip}</code></span>
                                    </div>
                                )}
                                {selectedLog.dataCategory && (
                                    <div className="detail-row">
                                        <span className="detail-label">Data Category</span>
                                        <span className="detail-val">{selectedLog.dataCategory}</span>
                                    </div>
                                )}
                                {selectedLog.requestMethod && (
                                    <div className="detail-row">
                                        <span className="detail-label">HTTP Request</span>
                                        <span className="detail-val"><code>{selectedLog.requestMethod} {selectedLog.requestPath}</code></span>
                                    </div>
                                )}
                                {selectedLog.sessionId && (
                                    <div className="detail-row">
                                        <span className="detail-label">Session ID</span>
                                        <span className="detail-val"><code>{selectedLog.sessionId}</code></span>
                                    </div>
                                )}
                                {formatTarget(selectedLog) && (
                                    <div className="detail-row">
                                        <span className="detail-label">Target Entity</span>
                                        <span className="detail-val">{formatTarget(selectedLog)}</span>
                                    </div>
                                )}
                                {selectedLog.userAgent && (
                                    <div className="detail-row full-width">
                                        <span className="detail-label">Client User Agent</span>
                                        <span className="detail-val agent-string">{selectedLog.userAgent}</span>
                                    </div>
                                )}
                                {formatReason(selectedLog) && (
                                    <div className="detail-row full-width reason-row">
                                        <span className="detail-label">Failure Reason</span>
                                        <span className="detail-val text-danger">{formatReason(selectedLog)}</span>
                                    </div>
                                )}
                            </div>

                            {/* Session Duration Section */}
                            {selectedLog.sessionId && (
                                <div className="audit-duration-section">
                                    <h4>⏱️ Session Duration Analysis</h4>
                                    {loadingDuration ? (
                                        <div className="duration-loading">
                                            <span className="audit-spinner-small" /> Calculating session duration lazily...
                                        </div>
                                    ) : sessionDuration ? (
                                        <div className="duration-result-grid">
                                            <div className="duration-result-item">
                                                <span className="result-label">Login Time</span>
                                                <span className="result-val">{new Date(sessionDuration.loginTime).toLocaleString()}</span>
                                            </div>
                                            <div className="duration-result-item">
                                                <span className="result-label">Logout Time</span>
                                                <span className="result-val">
                                                    {sessionDuration.logoutTime 
                                                        ? new Date(sessionDuration.logoutTime).toLocaleString() 
                                                        : 'Still Active / Session Interrupted'}
                                                </span>
                                            </div>
                                            <div className="duration-result-item highlight">
                                                <span className="result-label">Duration</span>
                                                <span className="result-val duration-badge">
                                                    {formatDuration(sessionDuration.durationMinutes)}
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="duration-empty">
                                            Could not calculate duration (corresponding login or logout log is missing).
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="audit-modal-footer">
                            <button className="btn-close-modal" onClick={() => setSelectedLog(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AuditLogs;
