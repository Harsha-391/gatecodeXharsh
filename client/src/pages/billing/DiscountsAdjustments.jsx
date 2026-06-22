import React, { useState, useEffect } from 'react';
import { billingAPI, receptionAPI, patientAPI } from '../../utils/api';
import { useAuth } from '../../store/hooks';
import {
    FiTag, FiPlus, FiSearch, FiRefreshCw, FiCheck, FiX,
    FiClock, FiAlertCircle, FiCheckCircle
} from 'react-icons/fi';
import './DiscountsAdjustments.css';

const TEMPLATE_COLORS = {
    'Classic Navy': '#0a2647',
    'Teal Grace':   '#14b8a6',
    'Sleek Dark':   '#0f172a',
};

const getTemplateColor = () => {
    const t = localStorage.getItem('billing_invoice_template') || 'Classic Navy';
    return { name: t, hex: TEMPLATE_COLORS[t] || '#0a2647' };
};

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_CFG = {
    Pending:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  icon: <FiClock /> },
    Approved: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', icon: <FiCheck /> },
    Rejected: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  icon: <FiX /> },
    Applied:  { color: '#6366f1', bg: 'rgba(99,102,241,0.1)', icon: <FiCheckCircle /> },
};

const FILTER_TABS = ['All', 'Pending', 'Approved', 'Applied', 'Rejected'];
const REQUEST_TYPES = ['Discount', 'Waiver', 'Adjustment'];
const TYPE_COLORS = {
    Discount:   { color: '#6366f1', bg: 'rgba(99,102,241,0.1)' },
    Waiver:     { color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
    Adjustment: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
};

const DiscountsAdjustments = () => {
    const { user } = useAuth();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState('All');
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [approveModal, setApproveModal] = useState(null); // { req, action: 'approve'|'reject' }
    const [toast, setToast] = useState({ msg: '', type: '' });
    const [theme, setTheme] = useState(getTemplateColor);

    // Form
    const [form, setForm] = useState({
        patientId: '', patientName: '', invoiceId: '', invoiceNumber: '',
        requestType: 'Discount', amountType: 'fixed', amount: '', percentage: '', reason: ''
    });
    const [patientSearch, setPatientSearch] = useState('');
    const [patientResults, setPatientResults] = useState([]);
    const [submitting, setSubmitting] = useState(false);

    const isAccountant = ['accountant', 'admin', 'hospitaladmin', 'administrator'].includes((user?.role || '').toLowerCase());

    useEffect(() => {
        setTheme(getTemplateColor());
        fetchRequests();
    }, []);

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const res = await billingAPI.getDiscountRequests('all');
            if (res.success) setRequests(res.requests || []);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast({ msg: '', type: '' }), 3500);
    };

    const handlePatientSearch = async (val) => {
        setPatientSearch(val);
        if (val.length < 2) { setPatientResults([]); return; }
        try {
            const res = await patientAPI.search(val);
            if (res.success) setPatientResults(res.data || []);
        } catch (e) { setPatientResults([]); }
    };

    const selectPatient = (p) => {
        setForm(prev => ({ ...prev, patientId: p._id, patientName: p.name }));
        setPatientSearch(p.name);
        setPatientResults([]);
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!form.patientId) return showToast('Please select a patient', 'error');
        if (!form.reason.trim()) return showToast('Please provide a reason', 'error');
        const amount = form.amountType === 'fixed' ? parseFloat(form.amount) || 0 : 0;
        const percentage = form.amountType === 'percent' ? parseFloat(form.percentage) || 0 : 0;
        if (!amount && !percentage) return showToast('Enter either a fixed amount or percentage', 'error');

        setSubmitting(true);
        try {
            const res = await billingAPI.createDiscountRequest({
                patientId: form.patientId,
                patientName: form.patientName,
                invoiceId: form.invoiceId || undefined,
                invoiceNumber: form.invoiceNumber,
                requestType: form.requestType,
                amount,
                percentage,
                reason: form.reason,
            });
            if (res.success) {
                showToast('Discount request submitted for approval');
                setShowModal(false);
                setForm({ patientId: '', patientName: '', invoiceId: '', invoiceNumber: '', requestType: 'Discount', amountType: 'fixed', amount: '', percentage: '', reason: '' });
                setPatientSearch('');
                fetchRequests();
            }
        } catch (e) {
            showToast(e.response?.data?.message || 'Failed to submit request', 'error');
        } finally {
            setSubmitting(false); }
    };

    const handleApprove = async (req, action, notes = '') => {
        try {
            const res = await billingAPI.approveDiscountRequest(req._id, action, notes);
            if (res.success) {
                showToast(`Request ${action === 'approve' ? 'approved' : 'rejected'} successfully`);
                setApproveModal(null);
                fetchRequests();
            }
        } catch (e) {
            showToast(e.response?.data?.message || 'Action failed', 'error');
        }
    };

    const handleApply = async (req) => {
        if (!window.confirm(`Apply this ${req.requestType} to Invoice ${req.invoiceNumber || '(linked)'}?\nThis will reduce the invoice total.`)) return;
        try {
            const res = await billingAPI.applyDiscountRequest(req._id);
            if (res.success) {
                showToast('Discount applied to invoice successfully');
                fetchRequests();
            }
        } catch (e) {
            showToast(e.response?.data?.message || 'Apply failed', 'error');
        }
    };

    const filtered = requests.filter(r => {
        const mf = filter === 'All' || r.status === filter;
        const ms = !search ||
            r.patientName?.toLowerCase().includes(search.toLowerCase()) ||
            r.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
            r.requestType?.toLowerCase().includes(search.toLowerCase());
        return mf && ms;
    });

    const counts = {
        All: requests.length,
        Pending: requests.filter(r => r.status === 'Pending').length,
        Approved: requests.filter(r => r.status === 'Approved').length,
        Applied: requests.filter(r => r.status === 'Applied').length,
        Rejected: requests.filter(r => r.status === 'Rejected').length,
    };

    return (
        <div className="discounts-page" style={{
            '--primary-color': theme.hex,
            '--primary-color-dark': theme.hex + 'cc',
            '--primary-color-fade': theme.hex + '33',
        }}>
            {toast.msg && (
                <div className={`da-toast da-toast-${toast.type}`}>{toast.msg}</div>
            )}

            {/* Header */}
            <div className="da-header">
                <div className="da-header-left">
                    <div className="da-header-icon" style={{ background: `linear-gradient(135deg, ${theme.hex}, ${theme.hex}cc)` }}><FiTag /></div>
                    <div>
                        <h1>Discounts & Adjustments</h1>
                        <p>Request, approve, and apply billing discounts, waivers, and adjustments</p>
                        <span className="da-theme-pill" style={{ background: `${theme.hex}18`, color: theme.hex, border: `1px solid ${theme.hex}44`, display: 'inline-block', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', marginTop: '6px', fontWeight: 600 }}>
                            🎨 {theme.name} theme active
                        </span>
                    </div>
                </div>
                <div className="da-header-actions">
                    <button className="da-btn-refresh" onClick={fetchRequests} style={{ '--hover-color': theme.hex }}><FiRefreshCw /> Refresh</button>
                    <button className="da-btn-create" onClick={() => setShowModal(true)} style={{ background: `linear-gradient(135deg, ${theme.hex}, ${theme.hex}cc)`, boxShadow: `0 4px 12px ${theme.hex}33` }}><FiPlus /> New Request</button>
                </div>
            </div>

            {/* Info Banner */}
            {!isAccountant && (
                <div className="da-info-banner">
                    <FiAlertCircle />
                    <span>Requests you create will be sent for Accountant/Admin approval. You can apply approved discounts to invoices.</span>
                </div>
            )}
            {isAccountant && (
                <div className="da-info-banner da-info-accountant">
                    <FiCheckCircle />
                    <span>As Accountant, you can approve or reject pending discount requests from Billing staff.</span>
                </div>
            )}

            {/* KPI Row */}
            <div className="da-kpi-row">
                {[
                    { label: 'Total Requests', val: counts.All, color: theme.hex },
                    { label: 'Pending', val: counts.Pending, color: '#f59e0b' },
                    { label: 'Approved', val: counts.Approved, color: '#10b981' },
                    { label: 'Applied', val: counts.Applied, color: theme.hex },
                    { label: 'Rejected', val: counts.Rejected, color: '#ef4444' },
                ].map((k, i) => (
                    <div key={i} className="da-kpi-card">
                        <span className="da-kpi-label">{k.label}</span>
                        <strong style={{ color: k.color }}>{k.val}</strong>
                    </div>
                ))}
            </div>

            {/* Toolbar */}
            <div className="da-toolbar">
                <div className="da-filter-tabs">
                    {FILTER_TABS.map(f => (
                        <button
                            key={f}
                            className={`da-filter-tab${filter === f ? ' active' : ''}`}
                            onClick={() => setFilter(f)}
                            style={filter === f ? { background: theme.hex, borderColor: theme.hex, color: '#fff' } : {}}
                        >
                            {f} <span className="da-tab-count">{counts[f]}</span>
                        </button>
                    ))}
                </div>
                <div className="da-search-wrap" style={{ '--focus-color': theme.hex }}>
                    <FiSearch />
                    <input placeholder="Search by patient, invoice, or type..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
            </div>

            {/* Table */}
            <div className="da-table-wrap">
                {loading ? (
                    <div className="da-loading">Loading requests...</div>
                ) : filtered.length === 0 ? (
                    <div className="da-empty">
                        <FiTag />
                        <p>No discount requests found.</p>
                        <button className="da-btn-create" onClick={() => setShowModal(true)} style={{ background: `linear-gradient(135deg, ${theme.hex}, ${theme.hex}cc)` }}>Create First Request</button>
                    </div>
                ) : (
                    <table className="da-table">
                        <thead>
                            <tr>
                                <th>Patient</th>
                                <th>Type</th>
                                <th>Invoice #</th>
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
                            {filtered.map(req => {
                                const sc = STATUS_CFG[req.status] || STATUS_CFG.Pending;
                                const tc = TYPE_COLORS[req.requestType] || TYPE_COLORS.Discount;
                                const discountLabel = req.amount > 0
                                    ? fmt(req.amount)
                                    : req.percentage > 0 ? `${req.percentage}%` : '—';
                                return (
                                    <tr key={req._id}>
                                        <td><strong>{req.patientName}</strong></td>
                                        <td>
                                            <span className="da-type-badge" style={{ color: tc.color, background: tc.bg }}>
                                                {req.requestType}
                                            </span>
                                        </td>
                                        <td>{req.invoiceNumber || '—'}</td>
                                        <td className="da-discount-val">{discountLabel}</td>
                                        <td className="da-reason-cell">{req.reason}</td>
                                        <td>{req.requestedByName || '—'}</td>
                                        <td>{fmtDate(req.createdAt)}</td>
                                        <td>
                                            <span className="da-status-badge" style={{ color: sc.color, background: sc.bg }}>
                                                {sc.icon} {req.status}
                                            </span>
                                        </td>
                                        <td>{req.approvedByName || '—'}</td>
                                        <td>
                                            <div className="da-actions">
                                                {/* Accountant can approve/reject pending */}
                                                {isAccountant && req.status === 'Pending' && (
                                                    <>
                                                        <button className="da-act-btn da-act-approve" onClick={() => setApproveModal({ req, action: 'approve' })}>
                                                            <FiCheck /> Approve
                                                        </button>
                                                        <button className="da-act-btn da-act-reject" onClick={() => setApproveModal({ req, action: 'reject' })}>
                                                            <FiX /> Reject
                                                        </button>
                                                    </>
                                                )}
                                                {/* Billing can apply approved */}
                                                {req.status === 'Approved' && req.invoiceId && (
                                                    <button className="da-act-btn da-act-apply" onClick={() => handleApply(req)} style={{ color: theme.hex, background: `${theme.hex}1a`, border: `1px solid ${theme.hex}44` }}>
                                                        Apply to Invoice
                                                    </button>
                                                )}
                                                {req.status === 'Applied' && (
                                                    <span className="da-act-applied" style={{ color: theme.hex }}>✓ Applied {fmtDate(req.appliedDate)}</span>
                                                )}
                                                {req.status === 'Rejected' && (
                                                    <span className="da-act-rejected" title={req.approvalNotes}>Rejected</span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Create Request Modal */}
            {showModal && (
                <div className="da-modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="da-modal" onClick={e => e.stopPropagation()}>
                        <div className="da-modal-header">
                            <h2><FiTag /> New Discount / Waiver Request</h2>
                            <button onClick={() => setShowModal(false)}><FiX /></button>
                        </div>
                        <form onSubmit={handleCreate} className="da-modal-form">
                            {/* Patient Search */}
                            <div className="da-form-group">
                                <label>Patient *</label>
                                <div className="da-patient-wrap">
                                    <input
                                        placeholder="Search patient by name or MRN..."
                                        value={patientSearch}
                                        onChange={e => handlePatientSearch(e.target.value)}
                                        autoComplete="off"
                                    />
                                    {patientResults.length > 0 && (
                                        <div className="da-patient-dropdown">
                                            {patientResults.map(p => (
                                                <div key={p._id} className="da-patient-option" onClick={() => selectPatient(p)}>
                                                    <strong>{p.name}</strong>
                                                    <span>{p.patientId} · {p.phone}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {form.patientId && <span className="da-selected-badge">✓ {form.patientName}</span>}
                            </div>

                            <div className="da-form-row">
                                <div className="da-form-group">
                                    <label>Request Type *</label>
                                    <select value={form.requestType} onChange={e => setForm(p => ({ ...p, requestType: e.target.value }))}>
                                        {REQUEST_TYPES.map(t => <option key={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div className="da-form-group">
                                    <label>Invoice Number (optional)</label>
                                    <input placeholder="INV-2026-XXXXX" value={form.invoiceNumber}
                                        onChange={e => setForm(p => ({ ...p, invoiceNumber: e.target.value }))} />
                                </div>
                            </div>

                            <div className="da-form-group">
                                <label>Discount Value *</label>
                                <div className="da-amount-type-selector">
                                    <label
                                        className={`da-amt-opt${form.amountType === 'fixed' ? ' da-amt-active' : ''}`}
                                        style={form.amountType === 'fixed' ? { borderColor: theme.hex, background: `${theme.hex}10`, color: theme.hex } : {}}
                                    >
                                        <input type="radio" name="amountType" value="fixed" checked={form.amountType === 'fixed'}
                                            onChange={() => setForm(p => ({ ...p, amountType: 'fixed' }))} />
                                        Fixed Amount (₹)
                                    </label>
                                    <label
                                        className={`da-amt-opt${form.amountType === 'percent' ? ' da-amt-active' : ''}`}
                                        style={form.amountType === 'percent' ? { borderColor: theme.hex, background: `${theme.hex}10`, color: theme.hex } : {}}
                                    >
                                        <input type="radio" name="amountType" value="percent" checked={form.amountType === 'percent'}
                                            onChange={() => setForm(p => ({ ...p, amountType: 'percent' }))} />
                                        Percentage (%)
                                    </label>
                                </div>
                                {form.amountType === 'fixed' ? (
                                    <input type="number" min="1" placeholder="e.g. 500" value={form.amount}
                                        onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
                                ) : (
                                    <input type="number" min="1" max="100" placeholder="e.g. 10" value={form.percentage}
                                        onChange={e => setForm(p => ({ ...p, percentage: e.target.value }))} />
                                )}
                            </div>

                            <div className="da-form-group">
                                <label>Reason for Request *</label>
                                <textarea rows={3} value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
                                    placeholder="Explain why this discount/waiver is needed..." required />
                            </div>

                            <div className="da-modal-footer">
                                <button type="button" className="da-btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="da-btn-submit" disabled={submitting} style={{ background: `linear-gradient(135deg, ${theme.hex}, ${theme.hex}cc)` }}>
                                    {submitting ? 'Submitting...' : 'Submit Request'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Approve/Reject Modal */}
            {approveModal && (
                <ApproveModal
                    data={approveModal}
                    onClose={() => setApproveModal(null)}
                    onConfirm={handleApprove}
                    theme={theme}
                />
            )}
        </div>
    );
};

const ApproveModal = ({ data, onClose, onConfirm, theme }) => {
    const { req, action } = data;
    const [notes, setNotes] = useState('');
    const isApprove = action === 'approve';
    return (
        <div className="da-modal-overlay" onClick={onClose}>
            <div className="da-modal da-modal-sm" onClick={e => e.stopPropagation()}>
                <div className="da-modal-header">
                    <h2>{isApprove ? '✅ Approve Request' : '❌ Reject Request'}</h2>
                    <button onClick={onClose}><FiX /></button>
                </div>
                <div className="da-modal-form">
                    <div className="da-approve-info">
                        <p>Patient: <strong>{req.patientName}</strong></p>
                        <p>Type: <strong>{req.requestType}</strong> · Value: <strong>
                            {req.amount > 0 ? fmt(req.amount) : `${req.percentage}%`}
                        </strong></p>
                        <p>Reason: <em>{req.reason}</em></p>
                    </div>
                    <div className="da-form-group">
                        <label>{isApprove ? 'Approval Notes (optional)' : 'Rejection Reason'}</label>
                        <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
                            placeholder={isApprove ? 'Any notes...' : 'Why is this being rejected?'} />
                    </div>
                    <div className="da-modal-footer">
                        <button className="da-btn-cancel" onClick={onClose}>Cancel</button>
                        <button
                            className={isApprove ? 'da-btn-submit' : 'da-btn-reject-final'}
                            style={isApprove ? { background: `linear-gradient(135deg, ${theme.hex}, ${theme.hex}cc)` } : {}}
                            onClick={() => onConfirm(req, action, notes)}>
                            {isApprove ? 'Approve Request' : 'Reject Request'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DiscountsAdjustments;
