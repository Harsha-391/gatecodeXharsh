import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { financeAPI } from '../../utils/api';
import './InsuranceClaims.css';

const InsuranceClaims = () => {
    const navigate = useNavigate();

    const [claims, setClaims] = useState([]);
    const [stats, setStats] = useState({ claimsSubmitted: 0, claimsPending: 0, claimsApproved: 0, claimsRejected: 0, totalClaimAmountPending: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    // Modals & Action States
    const [showSubmitModal, setShowSubmitModal] = useState(false);
    const [selectedClaim, setSelectedClaim] = useState(null); // for editing/status update
    const [showStatusModal, setShowStatusModal] = useState(false);

    // Form states
    const [newClaim, setNewClaim] = useState({
        patientId: '',
        patientName: '',
        policyNumber: '',
        insuranceProvider: '',
        claimNumber: '',
        invoiceNumber: '',
        claimAmount: '',
        treatmentDescription: ''
    });

    const [statusUpdate, setStatusUpdate] = useState({
        status: 'Approved',
        approvedAmount: '',
        rejectionReason: ''
    });

    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const role = user?.role ? user.role.toLowerCase() : '';
        const permissions = user?.permissions || [];
        const hasAccess = ['accountant', 'centraladmin', 'superadmin', 'hospitaladmin'].includes(role) || permissions.includes('finance_view');

        if (!hasAccess) {
            navigate('/dashboard');
        } else {
            fetchClaims();
        }
    }, [navigate]);

    const fetchClaims = async () => {
        try {
            setLoading(true);
            setError('');
            const res = await financeAPI.getInsuranceClaims();
            if (res.success) {
                setClaims(res.claims || []);
                setStats(res.stats || { claimsSubmitted: 0, claimsPending: 0, claimsApproved: 0, claimsRejected: 0, totalClaimAmountPending: 0 });
            } else {
                setError(res.message || 'Failed to load claims');
            }
        } catch (err) {
            console.error(err);
            setError('Error loading insurance claims registry');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateClaim = async (e) => {
        e.preventDefault();
        try {
            setError('');
            setSuccessMessage('');
            const res = await financeAPI.createInsuranceClaim(newClaim);
            if (res.success) {
                setSuccessMessage('Insurance claim submitted successfully!');
                setShowSubmitModal(false);
                setNewClaim({
                    patientId: '',
                    patientName: '',
                    policyNumber: '',
                    insuranceProvider: '',
                    claimNumber: '',
                    invoiceNumber: '',
                    claimAmount: '',
                    treatmentDescription: ''
                });
                fetchClaims();
            } else {
                setError(res.message || 'Failed to create insurance claim');
            }
        } catch (err) {
            console.error(err);
            setError('Error sending claim registration');
        }
    };

    const handleUpdateStatus = async (e) => {
        e.preventDefault();
        try {
            setError('');
            setSuccessMessage('');
            const payload = {
                status: statusUpdate.status,
                approvedAmount: statusUpdate.status === 'Approved' ? Number(statusUpdate.approvedAmount) : 0,
                rejectionReason: statusUpdate.status === 'Rejected' ? statusUpdate.rejectionReason : ''
            };
            const res = await financeAPI.updateInsuranceClaim(selectedClaim._id, payload);
            if (res.success) {
                setSuccessMessage('Claim status updated successfully!');
                setShowStatusModal(false);
                setSelectedClaim(null);
                setStatusUpdate({ status: 'Approved', approvedAmount: '', rejectionReason: '' });
                fetchClaims();
            } else {
                setError(res.message || 'Failed to update claim');
            }
        } catch (err) {
            console.error(err);
            setError('Error modifying claim status');
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0
        }).format(amount || 0);
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        const d = new Date(dateString);
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    return (
        <div className="insurance-claims-page">
            <header className="page-header">
                <div>
                    <h1>Insurance Claims Registry</h1>
                    <p>Track, submit, and reconcile patient third-party insurance payouts and approvals</p>
                </div>
                <button className="primary-action-btn" onClick={() => setShowSubmitModal(true)}>
                    + Submit New Claim
                </button>
            </header>

            {error && <div className="error-message">⚠️ {error}</div>}
            {successMessage && <div className="success-message">🎉 {successMessage}</div>}

            {/* KPI Section */}
            <div className="claims-stats-grid">
                <div className="stat-card submitted">
                    <div className="stat-title">Claims Submitted</div>
                    <div className="stat-value">{stats.claimsSubmitted}</div>
                    <div className="stat-desc">Awaiting provider processing</div>
                </div>
                <div className="stat-card pending">
                    <div className="stat-title">Claims Pending Info</div>
                    <div className="stat-value">{stats.claimsPending}</div>
                    <div className="stat-desc">Provider requests for details</div>
                </div>
                <div className="stat-card approved">
                    <div className="stat-title">Claims Approved</div>
                    <div className="stat-value">{stats.claimsApproved}</div>
                    <div className="stat-desc">Settlements cleared by insurer</div>
                </div>
                <div className="stat-card rejected">
                    <div className="stat-title">Claims Rejected</div>
                    <div className="stat-value">{stats.claimsRejected}</div>
                    <div className="stat-desc">Disallowed or appeals pending</div>
                </div>
                <div className="stat-card total-pending">
                    <div className="stat-title">Total Claims Value Outstanding</div>
                    <div className="stat-value highlight-purple">{formatCurrency(stats.totalClaimAmountPending)}</div>
                    <div className="stat-desc">Dues stuck in insurance channels</div>
                </div>
            </div>

            {/* Main Claims Table */}
            {loading ? (
                <div className="loading-message">⏳ Loading claims ledger...</div>
            ) : (
                <div className="table-wrapper card-box">
                    <h3>Registered Insurance Claims</h3>
                    {claims.length === 0 ? (
                        <div className="empty-state">No insurance claims registered yet.</div>
                    ) : (
                        <table className="finance-table">
                            <thead>
                                <tr>
                                    <th>Claim Reference</th>
                                    <th>Patient Details</th>
                                    <th>Provider & Policy</th>
                                    <th>Claim Amount</th>
                                    <th>Approved Amount</th>
                                    <th>Submission Date</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {claims.map((claim) => (
                                    <tr key={claim._id}>
                                        <td>
                                            <span className="bold block-span">{claim.claimNumber}</span>
                                            <span className="sub-text">Invoice: {claim.invoiceNumber}</span>
                                        </td>
                                        <td>
                                            <span className="bold block-span">{claim.patientName}</span>
                                            <span className="sub-text">ID: {claim.patientId}</span>
                                        </td>
                                        <td>
                                            <span className="block-span">{claim.insuranceProvider}</span>
                                            <span className="sub-text">Policy: {claim.policyNumber}</span>
                                        </td>
                                        <td className="bold">{formatCurrency(claim.claimAmount)}</td>
                                        <td>
                                            {claim.status === 'Approved' ? (
                                                <span className="text-green bold">{formatCurrency(claim.approvedAmount)}</span>
                                            ) : (
                                                <span className="text-gray">—</span>
                                            )}
                                        </td>
                                        <td>{formatDate(claim.createdAt)}</td>
                                        <td>
                                            <span className={`status-pill ${claim.status.toLowerCase()}`}>
                                                {claim.status}
                                            </span>
                                            {claim.status === 'Rejected' && claim.rejectionReason && (
                                                <span className="rejection-reason" title={claim.rejectionReason}>
                                                    ⓘ Reason
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            <button 
                                                className="edit-status-btn"
                                                onClick={() => {
                                                    setSelectedClaim(claim);
                                                    setStatusUpdate({
                                                        status: claim.status === 'Submitted' || claim.status === 'Pending' ? 'Approved' : claim.status,
                                                        approvedAmount: claim.approvedAmount || '',
                                                        rejectionReason: claim.rejectionReason || ''
                                                    });
                                                    setShowStatusModal(true);
                                                }}
                                            >
                                                Update Status
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Modal for Submitting New Claim */}
            {showSubmitModal && (
                <div className="modal-backdrop">
                    <div className="modal-container">
                        <div className="modal-header">
                            <h2>Submit Insurance Claim</h2>
                            <button className="close-btn" onClick={() => setShowSubmitModal(false)}>×</button>
                        </div>
                        <form onSubmit={handleCreateClaim}>
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>Patient ID *</label>
                                    <input 
                                        type="text" 
                                        required 
                                        placeholder="e.g. PT-2026-8801"
                                        value={newClaim.patientId}
                                        onChange={(e) => setNewClaim({...newClaim, patientId: e.target.value})}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Patient Name *</label>
                                    <input 
                                        type="text" 
                                        required 
                                        placeholder="Full Name"
                                        value={newClaim.patientName}
                                        onChange={(e) => setNewClaim({...newClaim, patientName: e.target.value})}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Insurance Provider *</label>
                                    <input 
                                        type="text" 
                                        required 
                                        placeholder="Insurer Name"
                                        value={newClaim.insuranceProvider}
                                        onChange={(e) => setNewClaim({...newClaim, insuranceProvider: e.target.value})}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Policy Number *</label>
                                    <input 
                                        type="text" 
                                        required 
                                        placeholder="Policy ID"
                                        value={newClaim.policyNumber}
                                        onChange={(e) => setNewClaim({...newClaim, policyNumber: e.target.value})}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Claim Reference Number *</label>
                                    <input 
                                        type="text" 
                                        required 
                                        placeholder="Pre-auth / Claim ID"
                                        value={newClaim.claimNumber}
                                        onChange={(e) => setNewClaim({...newClaim, claimNumber: e.target.value})}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Associated Invoice Number *</label>
                                    <input 
                                        type="text" 
                                        required 
                                        placeholder="e.g. INV-171829"
                                        value={newClaim.invoiceNumber}
                                        onChange={(e) => setNewClaim({...newClaim, invoiceNumber: e.target.value})}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Claim Amount (INR) *</label>
                                    <input 
                                        type="number" 
                                        required 
                                        placeholder="Amount"
                                        value={newClaim.claimAmount}
                                        onChange={(e) => setNewClaim({...newClaim, claimAmount: e.target.value})}
                                    />
                                </div>
                                <div className="form-group full-width">
                                    <label>Treatment / Medical Diagnosis Notes</label>
                                    <textarea 
                                        placeholder="Brief details of service rendered"
                                        value={newClaim.treatmentDescription}
                                        onChange={(e) => setNewClaim({...newClaim, treatmentDescription: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="secondary-btn" onClick={() => setShowSubmitModal(false)}>Cancel</button>
                                <button type="submit" className="primary-btn">Submit Claim Record</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal for Updating Status */}
            {showStatusModal && selectedClaim && (
                <div className="modal-backdrop">
                    <div className="modal-container small">
                        <div className="modal-header">
                            <h2>Update Claim Status</h2>
                            <button className="close-btn" onClick={() => { setShowStatusModal(false); setSelectedClaim(null); }}>×</button>
                        </div>
                        <form onSubmit={handleUpdateStatus}>
                            <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '16px' }}>
                                Updating claim <strong style={{ color: '#1e293b' }}>{selectedClaim.claimNumber}</strong> for patient {selectedClaim.patientName}.
                            </p>
                            <div className="form-group">
                                <label>Claim Status</label>
                                <select 
                                    value={statusUpdate.status} 
                                    onChange={(e) => setStatusUpdate({...statusUpdate, status: e.target.value})}
                                >
                                    <option value="Submitted">Submitted</option>
                                    <option value="Pending">Pending Info</option>
                                    <option value="Approved">Approved</option>
                                    <option value="Rejected">Rejected</option>
                                </select>
                            </div>

                            {statusUpdate.status === 'Approved' && (
                                <div className="form-group">
                                    <label>Approved Settlement Amount (INR) *</label>
                                    <input 
                                        type="number" 
                                        required 
                                        placeholder="Cleared amount"
                                        value={statusUpdate.approvedAmount}
                                        onChange={(e) => setStatusUpdate({...statusUpdate, approvedAmount: e.target.value})}
                                    />
                                </div>
                            )}

                            {statusUpdate.status === 'Rejected' && (
                                <div className="form-group">
                                    <label>Insurer Rejection Reason *</label>
                                    <textarea 
                                        required 
                                        placeholder="Reason for claim rejection"
                                        value={statusUpdate.rejectionReason}
                                        onChange={(e) => setStatusUpdate({...statusUpdate, rejectionReason: e.target.value})}
                                    />
                                </div>
                            )}

                            <div className="modal-footer">
                                <button type="button" className="secondary-btn" onClick={() => { setShowStatusModal(false); setSelectedClaim(null); }}>Cancel</button>
                                <button type="submit" className="primary-btn">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InsuranceClaims;
