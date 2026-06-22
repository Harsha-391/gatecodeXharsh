import React, { useState, useEffect } from 'react';
import { billingAPI, receptionAPI, patientAPI } from '../../utils/api';
import { useAuth } from '../../store/hooks';
import {
    FiShield, FiPlus, FiSearch, FiRefreshCw, FiCheck, FiX,
    FiClock, FiAlertCircle, FiChevronDown, FiFileText
} from 'react-icons/fi';
import './InsuranceBilling.css';

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

const STATUS_CONFIG = {
    Pending:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  icon: <FiClock /> },
    Submitted: { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', icon: <FiFileText /> },
    Approved:  { color: '#10b981', bg: 'rgba(16,185,129,0.1)', icon: <FiCheck /> },
    Rejected:  { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  icon: <FiX /> },
};

const FILTER_TABS = ['All', 'Pending', 'Submitted', 'Approved', 'Rejected'];

const InsuranceBilling = () => {
    const { user } = useAuth();
    const [claims, setClaims] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState('All');
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [actionModal, setActionModal] = useState(null); // { claim, type: 'submit'|'approve'|'reject' }
    const [toast, setToast] = useState({ msg: '', type: '' });
    const [theme, setTheme] = useState(getTemplateColor);

    // Form state
    const [form, setForm] = useState({
        patientId: '', patientName: '', policyNumber: '', insuranceProvider: '',
        invoiceNumber: '', claimAmount: '', treatmentDescription: ''
    });
    const [patientSearch, setPatientSearch] = useState('');
    const [patientResults, setPatientResults] = useState([]);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        setTheme(getTemplateColor());
        fetchClaims();
    }, []);

    const fetchClaims = async () => {
        setLoading(true);
        try {
            const res = await billingAPI.getInsuranceClaims('all');
            if (res.success) setClaims(res.claims || []);
        } catch (e) {
            console.error('Failed to fetch claims:', e);
        } finally {
            setLoading(false);
        }
    };

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast({ msg: '', type: '' }), 3500);
    };

    // Patient search
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

    const handleSubmitClaim = async (e) => {
        e.preventDefault();
        if (!form.patientId) return showToast('Please select a patient', 'error');
        setSubmitting(true);
        try {
            const res = await billingAPI.createInsuranceClaim({
                ...form,
                claimAmount: parseFloat(form.claimAmount) || 0,
            });
            if (res.success) {
                showToast('Insurance claim created successfully');
                setShowModal(false);
                setForm({ patientId: '', patientName: '', policyNumber: '', insuranceProvider: '', invoiceNumber: '', claimAmount: '', treatmentDescription: '' });
                setPatientSearch('');
                fetchClaims();
            }
        } catch (e) {
            showToast(e.response?.data?.message || 'Failed to create claim', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleStatusUpdate = async (claim, newStatus, extra = {}) => {
        try {
            const res = await billingAPI.updateInsuranceClaim(claim._id, { status: newStatus, ...extra });
            if (res.success) {
                showToast(`Claim ${newStatus.toLowerCase()} successfully`);
                setActionModal(null);
                fetchClaims();
            }
        } catch (e) {
            showToast(e.response?.data?.message || 'Update failed', 'error');
        }
    };

    const filtered = claims.filter(c => {
        const matchFilter = filter === 'All' || c.status === filter;
        const matchSearch = !search || 
            c.patientName?.toLowerCase().includes(search.toLowerCase()) ||
            c.claimNumber?.toLowerCase().includes(search.toLowerCase()) ||
            c.insuranceProvider?.toLowerCase().includes(search.toLowerCase()) ||
            c.policyNumber?.toLowerCase().includes(search.toLowerCase());
        return matchFilter && matchSearch;
    });

    const counts = {
        All: claims.length,
        Pending: claims.filter(c => c.status === 'Pending').length,
        Submitted: claims.filter(c => c.status === 'Submitted').length,
        Approved: claims.filter(c => c.status === 'Approved').length,
        Rejected: claims.filter(c => c.status === 'Rejected').length,
    };

    return (
        <div className="insurance-billing-page" style={{
            '--primary-color': theme.hex,
            '--primary-color-dark': theme.hex + 'cc',
            '--primary-color-fade': theme.hex + '33',
        }}>
            {/* Toast */}
            {toast.msg && (
                <div className={`ib-toast ib-toast-${toast.type}`}>{toast.msg}</div>
            )}

            {/* Header */}
            <div className="ib-header">
                <div className="ib-header-left">
                    <div className="ib-header-icon" style={{ background: `linear-gradient(135deg, ${theme.hex}, ${theme.hex}cc)` }}><FiShield /></div>
                    <div>
                        <h1>Insurance Billing</h1>
                        <p>Manage insurance claims — track submissions, approvals & rejections</p>
                        <span className="ib-theme-pill" style={{ background: `${theme.hex}18`, color: theme.hex, border: `1px solid ${theme.hex}44`, display: 'inline-block', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', marginTop: '6px', fontWeight: 600 }}>
                            🎨 {theme.name} theme active
                        </span>
                    </div>
                </div>
                <div className="ib-header-actions">
                    <button className="ib-btn-refresh" onClick={fetchClaims} style={{ '--hover-color': theme.hex }}><FiRefreshCw /> Refresh</button>
                    <button className="ib-btn-create" onClick={() => setShowModal(true)} style={{ background: `linear-gradient(135deg, ${theme.hex}, ${theme.hex}cc)`, boxShadow: `0 4px 12px ${theme.hex}33` }}><FiPlus /> New Claim</button>
                </div>
            </div>

            {/* KPI Bar */}
            <div className="ib-kpi-row">
                {[
                    { label: 'Total Claims', val: counts.All, color: theme.hex },
                    { label: 'Pending', val: counts.Pending, color: '#f59e0b' },
                    { label: 'Submitted', val: counts.Submitted, color: '#3b82f6' },
                    { label: 'Approved', val: counts.Approved, color: '#10b981' },
                    { label: 'Rejected', val: counts.Rejected, color: '#ef4444' },
                    { label: 'Total Claimed', val: fmt(claims.reduce((s, c) => s + (c.claimAmount || 0), 0)), color: theme.hex, wide: true },
                    { label: 'Total Approved', val: fmt(claims.filter(c => c.status === 'Approved').reduce((s, c) => s + (c.approvedAmount || c.claimAmount || 0), 0)), color: '#10b981', wide: true },
                ].map((k, i) => (
                    <div key={i} className={`ib-kpi-card${k.wide ? ' ib-kpi-wide' : ''}`}>
                        <span className="ib-kpi-label">{k.label}</span>
                        <strong className="ib-kpi-val" style={{ color: k.color }}>{k.val}</strong>
                    </div>
                ))}
            </div>

            {/* Filters + Search */}
            <div className="ib-toolbar">
                <div className="ib-filter-tabs">
                    {FILTER_TABS.map(f => (
                        <button
                            key={f}
                            className={`ib-filter-tab${filter === f ? ' active' : ''}`}
                            onClick={() => setFilter(f)}
                            style={filter === f ? { background: theme.hex, borderColor: theme.hex, color: '#fff' } : {}}
                        >
                            {f} <span className="ib-tab-count">{counts[f]}</span>
                        </button>
                    ))}
                </div>
                <div className="ib-search-wrap" style={{ '--focus-color': theme.hex }}>
                    <FiSearch />
                    <input
                        placeholder="Search by patient, claim#, provider..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Claims Table */}
            <div className="ib-table-wrap">
                {loading ? (
                    <div className="ib-loading">Loading claims...</div>
                ) : filtered.length === 0 ? (
                    <div className="ib-empty">
                        <FiAlertCircle />
                        <p>No insurance claims found{filter !== 'All' ? ` with status "${filter}"` : ''}.</p>
                        <button onClick={() => setShowModal(true)} className="ib-btn-create" style={{ background: `linear-gradient(135deg, ${theme.hex}, ${theme.hex}cc)` }}>Create First Claim</button>
                    </div>
                ) : (
                    <table className="ib-table">
                        <thead>
                            <tr>
                                <th>Claim #</th>
                                <th>Patient</th>
                                <th>Insurance Provider</th>
                                <th>Policy #</th>
                                <th>Invoice #</th>
                                <th>Claim Amount</th>
                                <th>Approved Amt</th>
                                <th>Submitted On</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(claim => {
                                const cfg = STATUS_CONFIG[claim.status] || STATUS_CONFIG.Pending;
                                return (
                                    <tr key={claim._id}>
                                        <td><span className="ib-claim-num" style={{ color: theme.hex, background: `${theme.hex}14` }}>{claim.claimNumber}</span></td>
                                        <td><strong>{claim.patientName}</strong></td>
                                        <td>{claim.insuranceProvider}</td>
                                        <td><code>{claim.policyNumber}</code></td>
                                        <td>{claim.invoiceNumber || '—'}</td>
                                        <td className="ib-amount">{fmt(claim.claimAmount)}</td>
                                        <td className="ib-amount-approved">{claim.approvedAmount > 0 ? fmt(claim.approvedAmount) : '—'}</td>
                                        <td>{fmtDate(claim.submissionDate)}</td>
                                        <td>
                                            <span className="ib-status-badge" style={{ color: cfg.color, background: cfg.bg }}>
                                                {cfg.icon} {claim.status}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="ib-action-btns">
                                                {claim.status === 'Pending' && (
                                                    <button className="ib-act-btn ib-act-submit" onClick={() => handleStatusUpdate(claim, 'Submitted')}>
                                                        Submit
                                                    </button>
                                                )}
                                                {claim.status === 'Submitted' && (
                                                    <>
                                                        <button className="ib-act-btn ib-act-approve" onClick={() => setActionModal({ claim, type: 'approve' })}>
                                                            Approve
                                                        </button>
                                                        <button className="ib-act-btn ib-act-reject" onClick={() => setActionModal({ claim, type: 'reject' })}>
                                                            Reject
                                                        </button>
                                                    </>
                                                )}
                                                {(claim.status === 'Approved' || claim.status === 'Rejected') && (
                                                    <span className="ib-act-done">{fmtDate(claim.actionDate)}</span>
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

            {/* Create Claim Modal */}
            {showModal && (
                <div className="ib-modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="ib-modal" onClick={e => e.stopPropagation()}>
                        <div className="ib-modal-header">
                            <h2><FiShield /> Create Insurance Claim</h2>
                            <button onClick={() => setShowModal(false)}><FiX /></button>
                        </div>
                        <form onSubmit={handleSubmitClaim} className="ib-modal-form">
                            {/* Patient Search */}
                            <div className="ib-form-group">
                                <label>Patient *</label>
                                <div className="ib-patient-search-wrap">
                                    <input
                                        placeholder="Search patient by name or MRN..."
                                        value={patientSearch}
                                        onChange={e => handlePatientSearch(e.target.value)}
                                        autoComplete="off"
                                    />
                                    {patientResults.length > 0 && (
                                        <div className="ib-patient-dropdown">
                                            {patientResults.map(p => (
                                                <div key={p._id} className="ib-patient-option" onClick={() => selectPatient(p)}>
                                                    <strong>{p.name}</strong>
                                                    <span>{p.patientId || p.mrn} · {p.phone}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {form.patientId && <span className="ib-selected-badge">✓ {form.patientName}</span>}
                            </div>

                            <div className="ib-form-row">
                                <div className="ib-form-group">
                                    <label>Insurance Provider *</label>
                                    <input placeholder="e.g. Star Health, HDFC ERGO..." value={form.insuranceProvider}
                                        onChange={e => setForm(p => ({ ...p, insuranceProvider: e.target.value }))} required />
                                </div>
                                <div className="ib-form-group">
                                    <label>Policy Number *</label>
                                    <input placeholder="Policy / Member ID" value={form.policyNumber}
                                        onChange={e => setForm(p => ({ ...p, policyNumber: e.target.value }))} required />
                                </div>
                            </div>

                            <div className="ib-form-row">
                                <div className="ib-form-group">
                                    <label>Invoice Number</label>
                                    <input placeholder="INV-2026-XXXXX" value={form.invoiceNumber}
                                        onChange={e => setForm(p => ({ ...p, invoiceNumber: e.target.value }))} />
                                </div>
                                <div className="ib-form-group">
                                    <label>Claim Amount (₹) *</label>
                                    <input type="number" min="1" placeholder="0.00" value={form.claimAmount}
                                        onChange={e => setForm(p => ({ ...p, claimAmount: e.target.value }))} required />
                                </div>
                            </div>

                            <div className="ib-form-group">
                                <label>Treatment Description</label>
                                <textarea rows={3} placeholder="Brief description of treatment / diagnosis..."
                                    value={form.treatmentDescription}
                                    onChange={e => setForm(p => ({ ...p, treatmentDescription: e.target.value }))} />
                            </div>

                            <div className="ib-modal-footer">
                                <button type="button" className="ib-btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="ib-btn-submit" disabled={submitting} style={{ background: `linear-gradient(135deg, ${theme.hex}, ${theme.hex}cc)` }}>
                                    {submitting ? 'Creating...' : 'Create Claim'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Approve / Reject Modal */}
            {actionModal && (
                <ActionModal
                    actionModal={actionModal}
                    onClose={() => setActionModal(null)}
                    onConfirm={handleStatusUpdate}
                    theme={theme}
                />
            )}
        </div>
    );
};

const ActionModal = ({ actionModal, onClose, onConfirm, theme }) => {
    const { claim, type } = actionModal;
    const [approvedAmount, setApprovedAmount] = useState(claim.claimAmount || '');
    const [rejectionReason, setRejectionReason] = useState('');
    const isApprove = type === 'approve';

    const handleConfirm = () => {
        if (isApprove) {
            onConfirm(claim, 'Approved', { approvedAmount: parseFloat(approvedAmount) || 0 });
        } else {
            onConfirm(claim, 'Rejected', { rejectionReason });
        }
    };

    return (
        <div className="ib-modal-overlay" onClick={onClose}>
            <div className="ib-modal ib-modal-sm" onClick={e => e.stopPropagation()}>
                <div className="ib-modal-header">
                    <h2>{isApprove ? '✅ Approve Claim' : '❌ Reject Claim'}</h2>
                    <button onClick={onClose}><FiX /></button>
                </div>
                <div className="ib-modal-form">
                    <p className="ib-action-desc">Claim: <strong>{claim.claimNumber}</strong> · Patient: <strong>{claim.patientName}</strong></p>
                    <p className="ib-action-desc">Claimed Amount: <strong>{fmt(claim.claimAmount)}</strong></p>

                    {isApprove ? (
                        <div className="ib-form-group">
                            <label>Approved Amount (₹)</label>
                            <input type="number" value={approvedAmount} onChange={e => setApprovedAmount(e.target.value)} />
                        </div>
                    ) : (
                        <div className="ib-form-group">
                            <label>Rejection Reason</label>
                            <textarea rows={3} value={rejectionReason} onChange={e => setRejectionReason(e.target.value)}
                                placeholder="Reason for rejection..." />
                        </div>
                    )}

                    <div className="ib-modal-footer">
                        <button type="button" className="ib-btn-cancel" onClick={onClose}>Cancel</button>
                        <button type="button"
                            className={isApprove ? 'ib-btn-submit' : 'ib-btn-reject-confirm'}
                            style={isApprove ? { background: `linear-gradient(135deg, ${theme.hex}, ${theme.hex}cc)` } : {}}
                            onClick={handleConfirm}>
                            {isApprove ? 'Approve Claim' : 'Reject Claim'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InsuranceBilling;
