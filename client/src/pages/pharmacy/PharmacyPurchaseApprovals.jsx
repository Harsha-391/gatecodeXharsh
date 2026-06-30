import React, { useState, useEffect, useCallback } from 'react';
import { pharmacyAPI, administratorAPI } from '../../utils/api';
import { useAuth } from '../../store/hooks';
import {
    FiRefreshCw, FiSearch, FiFilter, FiXCircle,
    FiClock, FiPackage, FiChevronDown, FiCalendar, FiUser,
    FiAlertTriangle, FiTrendingUp, FiBox
} from 'react-icons/fi';
import './PharmacyPurchaseApprovals.css';

const statusConfig = {
    'Approval Pending': { cls: 'status-pending', icon: <FiClock />, label: 'Pending' },
    'Ordered':          { cls: 'status-ordered',  icon: <FiPackage />, label: 'Ordered' },
    'Rejected':         { cls: 'status-rejected', icon: <FiXCircle />, label: 'Rejected' },
};

const PharmacyPurchaseApprovals = () => {
    const { user } = useAuth();
    const role = (user?.role || '').toLowerCase();
    const isAdmin = role === 'admin' || role === 'hospitaladmin';

    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [updatingId, setUpdatingId] = useState(null);
    const [showFilterMenu, setShowFilterMenu] = useState(false);

    // KPI counts
    const [kpis, setKpis] = useState({ pending: 0, ordered: 0, rejected: 0 });

    const fetchRequests = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            // Both admin and pharmacy roles can see all requests
            const res = isAdmin
                ? await administratorAPI.getInventory()   // returns { pendingPurchaseRequests: [...] }
                : await pharmacyAPI.getPurchaseRequests(); // returns { data: [...] }

            let data = [];
            if (isAdmin && res.success) {
                // admin endpoint returns all requests inside pendingPurchaseRequests
                // but we want full list; try pharmacyAPI as well
                const pharmaRes = await pharmacyAPI.getPurchaseRequests();
                data = pharmaRes.success ? pharmaRes.data : (res.pendingPurchaseRequests || []);
            } else if (res.success) {
                data = res.data || [];
            }

            setRequests(data);
            setKpis({
                pending:  data.filter(r => r.status === 'Approval Pending').length,
                ordered:  data.filter(r => r.status === 'Ordered').length,
                rejected: data.filter(r => r.status === 'Rejected').length,
            });
        } catch (err) {
            console.error('Error fetching purchase requests:', err);
            setError('Failed to load purchase requests. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [isAdmin]);

    useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);

    const handleUpdateStatus = async (id, newStatus) => {
        setUpdatingId(id);
        try {
            const res = await administratorAPI.updatePurchaseRequestStatus(id, newStatus);
            if (res.success) {
                fetchRequests();
            }
        } catch (err) {
            console.error('Error updating status:', err);
            alert('Failed to update status. Please try again.');
        } finally {
            setUpdatingId(null);
        }
    };

    const filtered = requests.filter(r => {
        const matchesSearch =
            (r.item || '').toLowerCase().includes(search.toLowerCase()) ||
            (r.requestedBy || '').toLowerCase().includes(search.toLowerCase());
        const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const formatDate = (d) => {
        if (!d) return '—';
        const dateObj = new Date(d);
        if (isNaN(dateObj.getTime())) return '—';
        return dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const getStatusCfg = (status) => statusConfig[status] || { cls: 'status-pending', icon: <FiClock />, label: status };

    return (
        <div className="ppa-page">
            {/* ─── Header ─── */}
            <div className="ppa-header">
                <div className="ppa-header-left">
                    <div className="ppa-header-icon-wrap">
                        <FiBox />
                    </div>
                    <div>
                        <h1>Supply Purchase Approvals</h1>
                        <p>Full history of all purchase requests raised by the pharmacy team</p>
                    </div>
                </div>
                <button className="ppa-btn-refresh" onClick={fetchRequests} disabled={loading}>
                    <FiRefreshCw className={loading ? 'spin' : ''} />
                    <span>Refresh</span>
                </button>
            </div>

            {/* ─── KPI Cards ─── */}
            <div className="ppa-kpi-grid">
                <div className={`ppa-kpi-card pending ${statusFilter === 'Approval Pending' ? 'kpi-active' : ''}`}
                    onClick={() => setStatusFilter(statusFilter === 'Approval Pending' ? 'all' : 'Approval Pending')}>
                    <div className="kpi-icon"><FiAlertTriangle /></div>
                    <div className="kpi-body">
                        <span className="kpi-num">{kpis.pending}</span>
                        <span className="kpi-lbl">Pending Approval</span>
                    </div>
                </div>
                <div className={`ppa-kpi-card ordered ${statusFilter === 'Ordered' ? 'kpi-active' : ''}`}
                    onClick={() => setStatusFilter(statusFilter === 'Ordered' ? 'all' : 'Ordered')}>
                    <div className="kpi-icon"><FiPackage /></div>
                    <div className="kpi-body">
                        <span className="kpi-num">{kpis.ordered}</span>
                        <span className="kpi-lbl">Ordered</span>
                    </div>
                </div>
                <div className={`ppa-kpi-card rejected ${statusFilter === 'Rejected' ? 'kpi-active' : ''}`}
                    onClick={() => setStatusFilter(statusFilter === 'Rejected' ? 'all' : 'Rejected')}>
                    <div className="kpi-icon"><FiXCircle /></div>
                    <div className="kpi-body">
                        <span className="kpi-num">{kpis.rejected}</span>
                        <span className="kpi-lbl">Rejected</span>
                    </div>
                </div>
            </div>

            {/* ─── Controls ─── */}
            <div className="ppa-controls">
                <div className="ppa-search-box">
                    <FiSearch />
                    <input
                        type="text"
                        placeholder="Search by medicine or requester..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <div className="ppa-filter-wrap" style={{ position: 'relative' }}>
                    <button className="ppa-filter-btn" onClick={() => setShowFilterMenu(v => !v)}>
                        <FiFilter />
                        <span>{statusFilter === 'all' ? 'All Statuses' : statusFilter}</span>
                        <FiChevronDown />
                    </button>
                    {showFilterMenu && (
                        <div className="ppa-filter-dropdown">
                            {['all', 'Approval Pending', 'Ordered', 'Rejected'].map(s => (
                                <div
                                    key={s}
                                    className={`ppa-filter-option ${statusFilter === s ? 'active' : ''}`}
                                    onClick={() => { setStatusFilter(s); setShowFilterMenu(false); }}
                                >
                                    {s === 'all' ? 'All Statuses' : s}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ─── Error Banner ─── */}
            {error && (
                <div className="ppa-error-banner">
                    <FiAlertTriangle />
                    <span>{error}</span>
                </div>
            )}

            {/* ─── Content ─── */}
            {loading ? (
                <div className="ppa-loading">
                    <FiRefreshCw className="spin" />
                    <p>Loading purchase requests...</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="ppa-empty">
                    <div className="ppa-empty-icon"><FiBox /></div>
                    <h3>No requests found</h3>
                    <p>
                        {statusFilter !== 'all'
                            ? `No requests with status "${statusFilter}"`
                            : 'No purchase requests have been submitted yet.'}
                    </p>
                </div>
            ) : (
                <div className="ppa-table-card">
                    <div className="ppa-table-header">
                        <span className="ppa-table-count">
                            <FiTrendingUp /> Showing {filtered.length} of {requests.length} records
                        </span>
                    </div>
                    <div className="ppa-table-scroll">
                        <table className="ppa-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th><FiCalendar style={{ marginRight: 6 }} />Date</th>
                                    <th><FiPackage style={{ marginRight: 6 }} />Medicine / Item</th>
                                    <th>Qty</th>
                                    <th><FiUser style={{ marginRight: 6 }} />Requested By</th>
                                    <th>Status</th>
                                    {isAdmin && <th>Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((req, idx) => {
                                    const cfg = getStatusCfg(req.status);
                                    return (
                                        <tr key={req._id || idx} className="ppa-table-row">
                                            <td className="ppa-row-num">{idx + 1}</td>
                                            <td className="ppa-date">
                                                <span className="date-chip">
                                                    {formatDate(req.createdAt)}
                                                </span>
                                            </td>
                                            <td className="ppa-item-name">
                                                <div className="item-pill">
                                                    <FiBox />
                                                    <strong>{req.item}</strong>
                                                </div>
                                            </td>
                                            <td>
                                                <span className="qty-chip">{req.qty} units</span>
                                            </td>
                                            <td className="ppa-requester">
                                                <div className="requester-pill">
                                                    <FiUser />
                                                    <span>{req.requestedBy || 'Pharmacy'}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`ppa-status-badge ${cfg.cls}`}>
                                                    {cfg.icon}
                                                    <span>{req.status}</span>
                                                </span>
                                            </td>
                                            {isAdmin && (
                                                <td>
                                                    {req.status === 'Approval Pending' ? (
                                                        <div className="ppa-action-btns">
                                                            <button
                                                                className="ppa-btn-approve"
                                                                disabled={updatingId === req._id}
                                                                onClick={() => handleUpdateStatus(req._id, 'Ordered')}
                                                            >
                                                                {updatingId === req._id
                                                                    ? <FiRefreshCw className="spin" />
                                                                    : <FiCheckCircle />}
                                                                Order
                                                            </button>
                                                            <button
                                                                className="ppa-btn-reject"
                                                                disabled={updatingId === req._id}
                                                                onClick={() => handleUpdateStatus(req._id, 'Rejected')}
                                                            >
                                                                <FiXCircle />
                                                                Reject
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span className="ppa-no-action">—</span>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PharmacyPurchaseApprovals;
