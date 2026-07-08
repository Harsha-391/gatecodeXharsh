import React, { useState, useEffect, useMemo } from 'react';
import { billingAPI } from '../../utils/api';
import './DiscountApprovals.css';

/* ──────────────────────────────────────────────────────────
   DiscountApprovals — Accountant page to approve / reject
   billing discount & adjustment requests submitted by
   cashier / billing staff.
────────────────────────────────────────────────────────── */

const TYPE_LABEL = {
    Discount: 'discount',
    Waiver: 'waiver',
    Adjustment: 'adjustment',
    'Write-off': 'write-off',
};

const fmtDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
};

const fmtCurrency = (v) =>
    new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
    }).format(v || 0);

// ────────────────────── Component ──────────────────────────
const DiscountApprovals = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('Pending');
    const [searchQ, setSearchQ] = useState('');

    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    // Action modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [modalAction, setModalAction] = useState('approve'); // 'approve' | 'reject'
    const [modalReq, setModalReq] = useState(null);
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [detailsModalReq, setDetailsModalReq] = useState(null);

    // ── fetch ──────────────────────────────────────────────
    const fetchRequests = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await billingAPI.getDiscountRequests('all');
            if (res.success) {
                setRequests(res.requests || []);
            } else {
                setError(res.message || 'Failed to fetch discount requests');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error loading discount requests');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequests();
    }, []);

    // auto-dismiss alerts
    useEffect(() => {
        if (success) {
            const t = setTimeout(() => setSuccess(''), 4000);
            return () => clearTimeout(t);
        }
    }, [success]);

    useEffect(() => {
        if (error) {
            const t = setTimeout(() => setError(''), 6000);
            return () => clearTimeout(t);
        }
    }, [error]);

    // ── stats ──────────────────────────────────────────────
    const stats = useMemo(() => {
        const count = (s) => requests.filter((r) => r.status === s).length;
        return {
            total: requests.length,
            pending: count('Pending'),
            approved: count('Approved'),
            rejected: count('Rejected'),
            applied: count('Applied'),
        };
    }, [requests]);

    // ── filtered list ──────────────────────────────────────
    const filtered = useMemo(() => {
        let list = requests;
        if (activeTab !== 'All') list = list.filter((r) => r.status === activeTab);
        if (searchQ.trim().length > 0) {
            const q = searchQ.toLowerCase();
            list = list.filter(
                (r) =>
                    (r.patientName || '').toLowerCase().includes(q) ||
                    (r.invoiceNumber || '').toLowerCase().includes(q) ||
                    (r.requestedByName || '').toLowerCase().includes(q) ||
                    (r.reason || '').toLowerCase().includes(q)
            );
        }
        return list;
    }, [requests, activeTab, searchQ]);

    // ── open modal ─────────────────────────────────────────
    const openModal = (req, action) => {
        setModalReq(req);
        setModalAction(action);
        setNotes('');
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setModalReq(null);
        setNotes('');
    };

    // ── submit action ──────────────────────────────────────
    const handleSubmitAction = async () => {
        if (!modalReq) return;
        setSubmitting(true);
        try {
            const res = await billingAPI.approveDiscountRequest(
                modalReq._id,
                modalAction === 'approve' ? 'approve' : 'reject',
                notes
            );
            if (res.success) {
                setSuccess(
                    `Discount request ${modalAction === 'approve' ? 'approved' : 'rejected'} successfully!`
                );
                closeModal();
                fetchRequests();
            } else {
                setError(res.message || 'Action failed');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Action failed. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    // ── tabs ───────────────────────────────────────────────
    const tabs = [
        { key: 'All', label: 'All', count: stats.total },
        { key: 'Pending', label: 'Pending', count: stats.pending },
        { key: 'Approved', label: 'Approved', count: stats.approved },
        { key: 'Rejected', label: 'Rejected', count: stats.rejected },
        { key: 'Applied', label: 'Applied', count: stats.applied },
    ];

    return (
        <div className="discount-approvals-page">
            {/* ── Header ──────────────────────────────────── */}
            <div className="da-page-header">
                <div className="da-page-header-text">
                    <h1>Discount Approvals</h1>
                    <p>
                        Review, approve, or reject discount &amp; adjustment requests raised by
                        billing staff
                    </p>
                </div>
                <button className="da-refresh-btn" onClick={fetchRequests}>
                    ↻ Refresh
                </button>
            </div>

            {/* ── Alerts ─────────────────────────────────── */}
            {success && (
                <div className="da-success-alert">
                    ✅ {success}
                </div>
            )}
            {error && (
                <div className="da-error-alert">
                    ⚠️ {error}
                </div>
            )}

            {/* ── Stats Grid ─────────────────────────────── */}
            <div className="da-stats-grid">
                <div className="da-stat-card total">
                    <div className="da-stat-label">Total Requests</div>
                    <div className="da-stat-value">{stats.total}</div>
                    <div className="da-stat-sub">All time</div>
                </div>
                <div className="da-stat-card pending">
                    <div className="da-stat-label">Pending Action</div>
                    <div className="da-stat-value">{stats.pending}</div>
                    <div className="da-stat-sub">Awaiting your decision</div>
                </div>
                <div className="da-stat-card approved">
                    <div className="da-stat-label">Approved</div>
                    <div className="da-stat-value">{stats.approved}</div>
                    <div className="da-stat-sub">Ready to apply</div>
                </div>
                <div className="da-stat-card rejected">
                    <div className="da-stat-label">Rejected</div>
                    <div className="da-stat-value">{stats.rejected}</div>
                    <div className="da-stat-sub">Declined by accountant</div>
                </div>
                <div className="da-stat-card applied">
                    <div className="da-stat-label">Applied</div>
                    <div className="da-stat-value">{stats.applied}</div>
                    <div className="da-stat-sub">Discount applied to invoice</div>
                </div>
            </div>

            {/* ── Filter Bar ─────────────────────────────── */}
            <div className="da-filter-bar">
                <div className="da-filter-tabs">
                    {tabs.map((t) => (
                        <button
                            key={t.key}
                            className={`da-tab-btn${activeTab === t.key ? ' active' : ''}`}
                            onClick={() => setActiveTab(t.key)}
                        >
                            {t.label}
                            <span className="da-tab-count">{t.count}</span>
                        </button>
                    ))}
                </div>

                <input
                    className="da-search-input"
                    placeholder="Search by patient, invoice, reason, or requester…"
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                />
            </div>

            {/* ── Table ──────────────────────────────────── */}
            <div className="da-table-card">
                <div className="da-table-header">
                    <h3>Discount &amp; Adjustment Requests</h3>
                    <span className="da-results-count">
                        {filtered.length} result{filtered.length !== 1 ? 's' : ''}
                    </span>
                </div>

                {loading ? (
                    <div className="da-loading">
                        <div className="da-spinner" />
                        Loading requests…
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="da-empty-state">
                        <span className="da-empty-icon">📋</span>
                        <h3>No requests found</h3>
                        <p>
                            {activeTab === 'Pending'
                                ? 'There are no pending discount requests requiring your attention.'
                                : 'No records match your current filters.'}
                        </p>
                    </div>
                ) : (
                    <div className="da-table-scroll">
                        <table className="da-table">
                            <thead>
                                <tr>
                                    <th>Patient</th>
                                    <th>Invoice #</th>
                                    <th>Type</th>
                                    <th>Discount Value</th>
                                    <th>Reason</th>
                                    <th>Requested By</th>
                                    <th>Requested On</th>
                                    <th>Status</th>
                                    <th>Approved By</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((req) => {
                                    const statusKey = (req.status || '').toLowerCase();
                                    const typeKey = TYPE_LABEL[req.discountType] || 'discount';
                                    return (
                                        <tr key={req._id}>
                                            {/* Patient */}
                                            <td onClick={() => setDetailsModalReq(req)} style={{ cursor: 'pointer' }} title="Click to view details">
                                                <span className="da-cell-main da-clickable-name">
                                                    {req.patientName || '—'}
                                                </span>
                                                <span className="da-cell-sub">
                                                    {req.patientId || ''}
                                                </span>
                                            </td>

                                            {/* Invoice */}
                                            <td>
                                                <span className="da-cell-main" style={{ fontSize: '0.82rem' }}>
                                                    {req.invoiceNumber || '—'}
                                                </span>
                                            </td>

                                            {/* Type */}
                                            <td>
                                                <span className={`da-type-badge ${typeKey}`}>
                                                    {req.discountType || 'Discount'}
                                                </span>
                                            </td>

                                            {/* Amount */}
                                            <td>
                                                {req.amount > 0 ? (
                                                    <span className="da-amount-value">
                                                        {fmtCurrency(req.amount)}
                                                    </span>
                                                ) : req.percentage > 0 ? (
                                                    <>
                                                        <span className="da-amount-value">
                                                            {req.percentage}%
                                                        </span>
                                                        <span className="da-amount-pct"> off</span>
                                                    </>
                                                ) : (
                                                    '—'
                                                )}
                                            </td>

                                            {/* Reason */}
                                            <td style={{ maxWidth: 180, wordBreak: 'break-word' }}>
                                                {req.reason || '—'}
                                            </td>

                                            {/* Requested By */}
                                            <td>
                                                <span className="da-cell-main">
                                                    {req.requestedByName || 'Billing Staff'}
                                                </span>
                                            </td>

                                            {/* Date */}
                                            <td>{fmtDate(req.createdAt)}</td>

                                            {/* Status */}
                                            <td>
                                                <span className={`da-status-badge ${statusKey}`}>
                                                    <span className="da-status-dot" />
                                                    {req.status}
                                                </span>
                                            </td>

                                            {/* Approved By */}
                                            <td>
                                                <span className="da-cell-main">
                                                    {req.approvedByName || '—'}
                                                </span>
                                                {req.actionDate && (
                                                    <span className="da-cell-sub">
                                                        {fmtDate(req.actionDate)}
                                                    </span>
                                                )}
                                            </td>

                                            {/* Actions */}
                                            <td>
                                                {req.status === 'Pending' ? (
                                                    <div className="da-actions-wrap" style={{ flexWrap: 'nowrap' }}>
                                                        <button
                                                            className="da-approve-btn"
                                                            onClick={() => openModal(req, 'approve')}
                                                        >
                                                            ✓ Approve
                                                        </button>
                                                        <button
                                                            className="da-reject-btn"
                                                            onClick={() => openModal(req, 'reject')}
                                                        >
                                                            ✗ Reject
                                                        </button>
                                                        <button
                                                            className="da-view-btn"
                                                            onClick={() => setDetailsModalReq(req)}
                                                            title="View Details"
                                                        >
                                                            👁️ View
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="da-actions-wrap" style={{ flexWrap: 'nowrap' }}>
                                                        <span className="da-settled-text">
                                                            {req.status === 'Approved' && '✅ Approved'}
                                                            {req.status === 'Rejected' && '❌ Rejected'}
                                                            {req.status === 'Applied' && '🔵 Applied'}
                                                        </span>
                                                        <button
                                                            className="da-view-btn"
                                                            onClick={() => setDetailsModalReq(req)}
                                                            title="View Details"
                                                        >
                                                            👁️ Details
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Action Modal ────────────────────────────── */}
            {modalOpen && modalReq && (
                <div className="da-modal-backdrop" onClick={(e) => e.target === e.currentTarget && closeModal()}>
                    <div className="da-modal">
                        <div className="da-modal-header">
                            <h2>
                                {modalAction === 'approve'
                                    ? '✅ Approve Discount Request'
                                    : '❌ Reject Discount Request'}
                            </h2>
                            <button className="da-modal-close" onClick={closeModal}>
                                ×
                            </button>
                        </div>

                        <div className="da-modal-body">
                            {/* Action indicator */}
                            <div
                                className={`da-modal-action-type ${modalAction}`}
                            >
                                {modalAction === 'approve'
                                    ? '✅ You are about to approve this discount request.'
                                    : '⚠️ You are about to reject this discount request.'}
                            </div>

                            {/* Request summary */}
                            <div className="da-request-info-card">
                                <div className="da-info-row">
                                    <span className="da-info-label">Patient</span>
                                    <span className="da-info-value">{modalReq.patientName || '—'}</span>
                                </div>
                                <div className="da-info-row">
                                    <span className="da-info-label">Invoice #</span>
                                    <span className="da-info-value">{modalReq.invoiceNumber || '—'}</span>
                                </div>
                                <div className="da-info-row">
                                    <span className="da-info-label">Type</span>
                                    <span className="da-info-value">{modalReq.discountType || 'Discount'}</span>
                                </div>
                                <div className="da-info-row">
                                    <span className="da-info-label">Discount Value</span>
                                    <span className="da-info-value amount">
                                        {modalReq.amount > 0
                                            ? fmtCurrency(modalReq.amount)
                                            : modalReq.percentage > 0
                                            ? `${modalReq.percentage}%`
                                            : '—'}
                                    </span>
                                </div>
                                <div className="da-info-row">
                                    <span className="da-info-label">Reason</span>
                                    <span className="da-info-value">{modalReq.reason || '—'}</span>
                                </div>
                                <div className="da-info-row">
                                    <span className="da-info-label">Requested By</span>
                                    <span className="da-info-value">
                                        {modalReq.requestedByName || 'Billing Staff'}
                                    </span>
                                </div>
                            </div>

                            {/* Notes */}
                            <div className="da-form-group">
                                <label>
                                    {modalAction === 'approve'
                                        ? 'Approval Notes (optional)'
                                        : 'Rejection Reason *'}
                                </label>
                                <textarea
                                    placeholder={
                                        modalAction === 'approve'
                                            ? 'Add any remarks or conditions for this approval…'
                                            : 'State the reason for rejecting this request…'
                                    }
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    rows={3}
                                />
                            </div>
                        </div>

                        <div className="da-modal-footer">
                            <button className="da-cancel-btn" onClick={closeModal} disabled={submitting}>
                                Cancel
                            </button>
                            {modalAction === 'approve' ? (
                                <button
                                    className="da-submit-approve-btn"
                                    onClick={handleSubmitAction}
                                    disabled={submitting}
                                >
                                    {submitting ? 'Approving…' : '✓ Confirm Approval'}
                                </button>
                            ) : (
                                <button
                                    className="da-submit-reject-btn"
                                    onClick={handleSubmitAction}
                                    disabled={submitting || (notes.trim().length === 0)}
                                >
                                    {submitting ? 'Rejecting…' : '✗ Confirm Rejection'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── View Details Modal ───────────────────────── */}
            {detailsModalReq && (
                <div className="da-modal-backdrop" onClick={(e) => e.target === e.currentTarget && setDetailsModalReq(null)}>
                    <div className="da-modal" style={{ width: '520px' }}>
                        <div className="da-modal-header" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '1.4rem' }}>📋</span>
                                <div>
                                    <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Discount Details</h2>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                                        ID: {detailsModalReq._id}
                                    </span>
                                </div>
                            </div>
                            <button className="da-modal-close" onClick={() => setDetailsModalReq(null)}>
                                ×
                            </button>
                        </div>

                        <div className="da-modal-body" style={{ padding: '24px' }}>
                            {/* Patient Badge Card */}
                            <div style={{
                                background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                                border: '1px solid #bfdbfe',
                                borderRadius: '14px',
                                padding: '16px 18px',
                                marginBottom: '20px',
                                boxShadow: '0 2px 8px rgba(59,130,246,0.06)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ fontSize: '0.72rem', color: '#1d4ed8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                                            Patient Information
                                        </div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1e3a8a' }}>
                                            {detailsModalReq.patientName}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '2px', fontWeight: 600 }}>
                                            ID/MRN: {detailsModalReq.patientId}
                                        </div>
                                    </div>
                                    <span className={`da-status-badge ${(detailsModalReq.status || '').toLowerCase()}`}>
                                        <span className="da-status-dot" />
                                        {detailsModalReq.status}
                                    </span>
                                </div>
                            </div>

                            {/* Detailed Info List */}
                            <div className="da-request-info-card" style={{ marginBottom: '0' }}>
                                <div className="da-info-row" style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                                    <span className="da-info-label">Invoice Number</span>
                                    <span className="da-info-value">{detailsModalReq.invoiceNumber || '—'}</span>
                                </div>
                                <div className="da-info-row" style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                                    <span className="da-info-label">Request Type</span>
                                    <span className={`da-type-badge ${(detailsModalReq.requestType || detailsModalReq.discountType || 'Discount').toLowerCase()}`}>
                                        {detailsModalReq.requestType || detailsModalReq.discountType || 'Discount'}
                                    </span>
                                </div>
                                <div className="da-info-row" style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                                    <span className="da-info-label">Discount Value</span>
                                    <span className="da-info-value amount" style={{ fontSize: '1.1rem', fontWeight: 800, color: '#6366f1' }}>
                                        {detailsModalReq.amount > 0
                                            ? fmtCurrency(detailsModalReq.amount)
                                            : detailsModalReq.percentage > 0
                                            ? `${detailsModalReq.percentage}% off`
                                            : '—'}
                                    </span>
                                </div>
                                {detailsModalReq.invoiceId && typeof detailsModalReq.invoiceId === 'object' && (
                                    <>
                                        <div className="da-info-row" style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                                            <span className="da-info-label">Invoice Total</span>
                                            <span className="da-info-value" style={{ color: '#0f172a', fontWeight: 700 }}>
                                                {fmtCurrency(detailsModalReq.invoiceId.grandTotal)}
                                            </span>
                                        </div>
                                        <div className="da-info-row" style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                                            <span className="da-info-label">Amount Paid</span>
                                            <span className="da-info-value" style={{ color: '#16a34a', fontWeight: 700 }}>
                                                {fmtCurrency(detailsModalReq.invoiceId.amountPaid)}
                                            </span>
                                        </div>
                                        <div className="da-info-row" style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                                            <span className="da-info-label">Outstanding Dues</span>
                                            <span className="da-info-value" style={{ color: '#dc2626', fontWeight: 700 }}>
                                                {fmtCurrency(detailsModalReq.invoiceId.outstandingAmount)}
                                            </span>
                                        </div>
                                        <div className="da-info-row" style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                                            <span className="da-info-label">Calculated Discount</span>
                                            <span className="da-info-value amount" style={{ fontWeight: 800, color: '#4f46e5' }}>
                                                {detailsModalReq.amount > 0 
                                                    ? fmtCurrency(detailsModalReq.amount)
                                                    : detailsModalReq.percentage > 0
                                                    ? fmtCurrency((detailsModalReq.invoiceId.grandTotal * detailsModalReq.percentage) / 100)
                                                    : '—'}
                                            </span>
                                        </div>
                                    </>
                                )}
                                <div className="da-info-row" style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                                    <span className="da-info-label">Reason for Request</span>
                                    <span className="da-info-value" style={{ fontWeight: 600, color: '#475569', maxWidth: '60%', wordBreak: 'break-word' }}>
                                        {detailsModalReq.reason || '—'}
                                    </span>
                                </div>
                                <div className="da-info-row" style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                                    <span className="da-info-label">Requested By</span>
                                    <span className="da-info-value">{detailsModalReq.requestedByName || 'Billing Staff'}</span>
                                </div>
                                <div className="da-info-row" style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                                    <span className="da-info-label">Requested On</span>
                                    <span className="da-info-value">{fmtDate(detailsModalReq.createdAt)}</span>
                                </div>

                                {/* Approver Details if not pending */}
                                {detailsModalReq.status !== 'Pending' && (
                                    <>
                                        <div className="da-info-row" style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                                            <span className="da-info-label">Action By</span>
                                            <span className="da-info-value">{detailsModalReq.approvedByName || 'Accountant'}</span>
                                        </div>
                                        <div className="da-info-row" style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                                            <span className="da-info-label">Action Date</span>
                                            <span className="da-info-value">{fmtDate(detailsModalReq.actionDate)}</span>
                                        </div>
                                        {detailsModalReq.approvalNotes && (
                                            <div style={{ marginTop: '12px', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', borderLeft: '3px solid #6366f1' }}>
                                                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                                                    Remarks
                                                </div>
                                                <div style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 600 }}>
                                                    {detailsModalReq.approvalNotes}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="da-modal-footer" style={{ background: '#f8fafc', padding: '14px 24px 16px' }}>
                            <button className="da-cancel-btn" onClick={() => setDetailsModalReq(null)} style={{ padding: '8px 18px' }}>
                                Close
                            </button>
                            {detailsModalReq.status === 'Pending' && (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        className="da-submit-reject-btn"
                                        onClick={() => {
                                            const req = detailsModalReq;
                                            setDetailsModalReq(null);
                                            openModal(req, 'reject');
                                        }}
                                        style={{ padding: '8px 18px' }}
                                    >
                                        ✗ Reject
                                    </button>
                                    <button
                                        className="da-submit-approve-btn"
                                        onClick={() => {
                                            const req = detailsModalReq;
                                            setDetailsModalReq(null);
                                            openModal(req, 'approve');
                                        }}
                                        style={{ padding: '8px 18px' }}
                                    >
                                        ✓ Approve
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DiscountApprovals;
