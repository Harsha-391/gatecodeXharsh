import React, { useState, useEffect } from 'react';
import { administratorAPI } from '../../utils/api';
import {
    FiClipboard, FiSearch, FiClock, FiUser, FiActivity,
    FiShield, FiTrendingUp, FiAlertCircle, FiRefreshCw
} from 'react-icons/fi';
import './AuditLogs.css';

const AuditLogs = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [actionFilter, setActionFilter] = useState('All');

    const fetchLogs = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await administratorAPI.getAuditLogs();
            if (res.success) {
                setLogs(res.logs || []);
            }
        } catch (err) {
            console.error('Error fetching audit logs:', err);
            setError('Failed to fetch audit logs from server.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    // Filter logs based on search term and category
    const getFilteredLogs = () => {
        return logs.filter(log => {
            const description = (log.description || '').toLowerCase();
            const action = (log.action || '').toLowerCase();
            const user = (log.performedBy || log.userId?.name || '').toLowerCase();
            const matchesSearch = description.includes(searchTerm.toLowerCase()) || 
                                  action.includes(searchTerm.toLowerCase()) ||
                                  user.includes(searchTerm.toLowerCase());

            if (!matchesSearch) return false;

            if (actionFilter !== 'All') {
                const actLower = actionFilter.toLowerCase();
                if (actLower === 'login') {
                    return action.includes('login') && !action.includes('fail');
                }
                if (actLower === 'failed_login') {
                    return action.includes('login_failed') || action.includes('fail');
                }
                if (actLower === 'billing') {
                    return action.includes('bill') || action.includes('invoice') || action.includes('payment') || action.includes('refund');
                }
                if (actLower === 'rbac') {
                    return action.includes('role') || action.includes('permission');
                }
                if (actLower === 'records') {
                    return action.includes('patient') || action.includes('record') || action.includes('clinical') || action.includes('visit');
                }
                if (actLower === 'admin') {
                    return action.includes('admin') || action.includes('create') || action.includes('update') || action.includes('delete');
                }
            }
            return true;
        });
    };

    const getActionIcon = (action) => {
        const act = String(action).toLowerCase();
        if (act.includes('login_failed') || act.includes('fail')) {
            return <div className="log-icon danger"><FiAlertCircle /></div>;
        }
        if (act.includes('login')) {
            return <div className="log-icon success"><FiUser /></div>;
        }
        if (act.includes('role') || act.includes('permission')) {
            return <div className="log-icon info"><FiShield /></div>;
        }
        if (act.includes('bill') || act.includes('invoice') || act.includes('payment') || act.includes('refund')) {
            return <div className="log-icon warning"><FiTrendingUp /></div>;
        }
        if (act.includes('patient') || act.includes('record') || act.includes('clinical')) {
            return <div className="log-icon primary"><FiActivity /></div>;
        }
        return <div className="log-icon default"><FiClipboard /></div>;
    };

    const filteredLogs = getFilteredLogs();

    return (
        <div className="audit-logs-page">
            <div className="audit-header-row">
                <div>
                    <h1>System Audit Logs</h1>
                    <p>Track administrator actions, user authentication events, record modifications, and billing logs.</p>
                </div>
                <button onClick={fetchLogs} className="btn-refresh" title="Reload Logs">
                    <FiRefreshCw /> <span>Reload Logs</span>
                </button>
            </div>

            {error && (
                <div className="audit-banner error">
                    <FiAlertCircle /> <span>{error}</span>
                </div>
            )}

            <div className="audit-content-card animate-fade">
                {/* Search and Filters */}
                <div className="audit-filter-bar">
                    <div className="search-box">
                        <FiSearch className="search-icon" />
                        <input
                            type="text"
                            placeholder="Search description, actions, or users..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="filters-radios">
                        <button className={`filter-opt ${actionFilter === 'All' ? 'active' : ''}`} onClick={() => setActionFilter('All')}>All Events</button>
                        <button className={`filter-opt ${actionFilter === 'login' ? 'active' : ''}`} onClick={() => setActionFilter('login')}>Logins</button>
                        <button className={`filter-opt ${actionFilter === 'failed_login' ? 'active' : ''}`} onClick={() => setActionFilter('failed_login')}>Failed Logins</button>
                        <button className={`filter-opt ${actionFilter === 'records' ? 'active' : ''}`} onClick={() => setActionFilter('records')}>Patient Records</button>
                        <button className={`filter-opt ${actionFilter === 'billing' ? 'active' : ''}`} onClick={() => setActionFilter('billing')}>Billing</button>
                        <button className={`filter-opt ${actionFilter === 'rbac' ? 'active' : ''}`} onClick={() => setActionFilter('rbac')}>RBAC</button>
                    </div>
                </div>

                {loading ? (
                    <div className="audit-loading">Fetching audit timeline...</div>
                ) : filteredLogs.length === 0 ? (
                    <div className="audit-empty">No system audit records found.</div>
                ) : (
                    <div className="audit-timeline-container">
                        {filteredLogs.map((log) => (
                            <div key={log._id} className="audit-timeline-item">
                                <div className="icon-column-audit">
                                    {getActionIcon(log.action)}
                                    <div className="timeline-line"></div>
                                </div>
                                <div className="details-column-audit">
                                    <div className="title-row">
                                        <span className="action-tag">{log.action || 'OPERATION'}</span>
                                        <span className="timestamp-tag">
                                            <FiClock /> {new Date(log.createdAt).toLocaleString()}
                                        </span>
                                    </div>
                                    <p className="description-txt">{log.description || 'No additional details provided.'}</p>
                                    <div className="meta-footer">
                                        <span className="meta-item">
                                            <FiUser /> User: <strong>{log.performedBy || log.userId?.name || 'System Operator'}</strong>
                                        </span>
                                        {log.ipAddress && (
                                            <span className="meta-item ip">
                                                IP: <strong>{log.ipAddress}</strong>
                                            </span>
                                        )}
                                        {log.userAgent && (
                                            <span className="meta-item agent" title={log.userAgent}>
                                                Client: <strong>{log.userAgent.split(' ')[0]}</strong>
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AuditLogs;
