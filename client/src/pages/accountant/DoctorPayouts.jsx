import React, { useState, useEffect } from 'react';
import { financeAPI } from '../../utils/api';
import './DoctorPayouts.css';

const DoctorPayouts = () => {
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const currentMonthStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    const [activeTab, setActiveTab] = useState('process'); // 'process', 'configs'
    const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
    const [doctorsList, setDoctorsList] = useState([]);
    const [payoutRecords, setPayoutRecords] = useState([]);
    
    // KPI States
    const [kpis, setKpis] = useState({
        totalThisMonth: 0,
        pendingCount: 0,
        paidCount: 0,
        topEarningDoctor: 'N/A'
    });

    // Loading & Error
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // Modal States
    const [showPayModal, setShowPayModal] = useState(false);
    const [activeRecord, setActiveRecord] = useState(null);
    const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
    const [txnRef, setTxnRef] = useState('');
    const [notes, setNotes] = useState('');

    const [showEditConfigModal, setShowEditConfigModal] = useState(false);
    const [editDoctor, setEditDoctor] = useState(null);
    const [editPayoutModel, setEditPayoutModel] = useState('Fixed');
    const [editCommissionPercent, setEditCommissionPercent] = useState(0);
    const [editFixedSalary, setEditFixedSalary] = useState(0);

    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [historyDoctor, setHistoryDoctor] = useState(null);
    const [doctorHistory, setDoctorHistory] = useState([]);

    useEffect(() => {
        fetchData();
    }, [selectedMonth]);

    const fetchData = async () => {
        try {
            setLoading(true);
            setError('');
            
            // Get payouts records for target month
            const recsRes = await financeAPI.getDoctorPayoutRecords({ month: selectedMonth });
            let monthRecords = [];
            if (recsRes.success) {
                monthRecords = recsRes.records;
                setPayoutRecords(monthRecords);
            }

            // Get doctors configuration list
            const docsRes = await financeAPI.getDoctorPayoutConfig();
            if (docsRes.success) {
                setDoctorsList(docsRes.doctors);
            }

            // Calculate KPIs
            const totalThisMonth = monthRecords.reduce((s, r) => s + r.totalPayable, 0);
            const pendingCount = monthRecords.filter(r => r.status !== 'Paid').length;
            const paidCount = monthRecords.filter(r => r.status === 'Paid').length;

            // Find top earning doctor for the month
            let topDoc = 'N/A';
            if (monthRecords.length > 0) {
                const maxPayoutRecord = monthRecords.reduce((max, r) => r.totalPayable > max.totalPayable ? r : max, monthRecords[0]);
                if (maxPayoutRecord && maxPayoutRecord.totalPayable > 0) {
                    topDoc = `${maxPayoutRecord.doctorId?.name || 'N/A'} (${formatCurrency(maxPayoutRecord.totalPayable)})`;
                }
            }

            setKpis({
                totalThisMonth,
                pendingCount,
                paidCount,
                topEarningDoctor: topDoc
            });

        } catch (err) {
            console.error(err);
            setError('Error loading doctor payouts context.');
        } finally {
            setLoading(false);
        }
    };

    const handleCalculatePayouts = async () => {
        try {
            setLoading(true);
            setError('');
            const res = await financeAPI.calculateDoctorPayouts({ month: selectedMonth });
            if (res.success) {
                setSuccessMsg(res.message);
                setTimeout(() => setSuccessMsg(''), 4000);
                fetchData();
            } else {
                setError(res.message || 'Failed to calculate payouts.');
            }
        } catch (err) {
            console.error(err);
            setError('Failed to calculate doctor payout models.');
        } finally {
            setLoading(false);
        }
    };

    const handleApprovePayout = async (record) => {
        try {
            setLoading(true);
            setError('');
            const res = await financeAPI.approveDoctorPayout(record._id);
            if (res.success) {
                setSuccessMsg('Doctor payout approved successfully.');
                setTimeout(() => setSuccessMsg(''), 4000);
                fetchData();
            } else {
                setError(res.message || 'Failed to approve payout.');
            }
        } catch (err) {
            console.error(err);
            setError('Failed to approve payout.');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenPayModal = (record) => {
        setActiveRecord(record);
        setPaymentMethod('Bank Transfer');
        setTxnRef('');
        setNotes('');
        setShowPayModal(true);
    };

    const handleProcessPayment = async () => {
        if (!activeRecord) return;
        try {
            setLoading(true);
            setError('');
            const res = await financeAPI.payDoctorPayout(activeRecord._id, {
                paymentMethod,
                transactionReference: txnRef,
                notes
            });
            if (res.success) {
                setShowPayModal(false);
                setSuccessMsg('Doctor payout processed successfully.');
                setTimeout(() => setSuccessMsg(''), 4000);
                fetchData();
            } else {
                setError(res.message || 'Failed to record payout.');
            }
        } catch (err) {
            console.error(err);
            setError('Failed to process doctor payout.');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenEditConfigModal = (doc) => {
        setEditDoctor(doc);
        setEditPayoutModel(doc.payoutModel || 'Fixed');
        setEditCommissionPercent(doc.commissionPercent || 0);
        setEditFixedSalary(doc.fixedSalary || 0);
        setShowEditConfigModal(true);
    };

    const handleUpdateConfig = async () => {
        if (!editDoctor) return;
        try {
            setLoading(true);
            setError('');
            const res = await financeAPI.updateDoctorPayoutConfig(editDoctor._id, {
                payoutModel: editPayoutModel,
                commissionPercent: editCommissionPercent,
                fixedSalary: editFixedSalary
            });
            if (res.success) {
                setShowEditConfigModal(false);
                setSuccessMsg('Doctor payout configuration updated.');
                setTimeout(() => setSuccessMsg(''), 4000);
                fetchData();
            } else {
                setError(res.message || 'Failed to save configuration.');
            }
        } catch (err) {
            console.error(err);
            setError('Failed to update doctor payout configuration.');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenHistory = async (record) => {
        try {
            setLoading(true);
            setError('');
            setHistoryDoctor(record.doctorId);
            const res = await financeAPI.getDoctorPayoutRecords();
            if (res.success) {
                const history = res.records.filter(r => r.doctorId?._id === record.doctorId?._id && r.status === 'Paid');
                setDoctorHistory(history);
                setShowHistoryModal(true);
            }
        } catch (err) {
            console.error(err);
            setError('Failed to load doctor payment history.');
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0
        }).format(amount || 0);
    };

    return (
        <div className="doctor-payouts-page">
            <header className="page-header">
                <div>
                    <h1>Doctor Payouts Management</h1>
                    <p>Track doctor patients seen, consultations revenue, commission shares, and fixed/hybrid payouts</p>
                </div>
                <div className="tab-triggers">
                    <button className={`tab-btn ${activeTab === 'process' ? 'active' : ''}`} onClick={() => setActiveTab('process')}>📋 Process Payouts</button>
                    <button className={`tab-btn ${activeTab === 'configs' ? 'active' : ''}`} onClick={() => setActiveTab('configs')}>⚙️ Payout Configurations</button>
                </div>
            </header>

            {/* Notifications */}
            {error && <div className="error-message">⚠️ {error}</div>}
            {successMsg && <div className="success-message">✅ {successMsg}</div>}

            {/* KPIs Block */}
            <div className="payout-kpi-grid">
                <div className="payout-kpi-card total-payouts">
                    <span className="icon">💳</span>
                    <div className="info">
                        <h3>Total Payouts ({selectedMonth})</h3>
                        <p className="value">{formatCurrency(kpis.totalThisMonth)}</p>
                    </div>
                </div>
                <div className="payout-kpi-card pending-payouts">
                    <span className="icon">⏳</span>
                    <div className="info">
                        <h3>Pending Payouts</h3>
                        <p className="value">{kpis.pendingCount}</p>
                    </div>
                </div>
                <div className="payout-kpi-card paid-payouts">
                    <span className="icon">✅</span>
                    <div className="info">
                        <h3>Paid Payouts</h3>
                        <p className="value">{kpis.paidCount}</p>
                    </div>
                </div>
                <div className="payout-kpi-card top-earning">
                    <span className="icon">👑</span>
                    <div className="info">
                        <h3>Top Earning Doctor</h3>
                        <p className="value" style={{ fontSize: kpis.topEarningDoctor !== 'N/A' ? '1.15rem' : '1.5rem', fontWeight: 800 }}>
                            {kpis.topEarningDoctor}
                        </p>
                    </div>
                </div>
            </div>

            {activeTab === 'process' ? (
                <div className="payouts-process-section card-box">
                    <div className="section-header">
                        <div className="picker-block">
                            <label>Calculation Month: </label>
                            <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
                        </div>
                        <button className="calculate-btn" onClick={handleCalculatePayouts} disabled={loading}>
                            ⚡ Recalculate Commissions ({selectedMonth})
                        </button>
                    </div>

                    {loading ? (
                        <div className="loading-state">⏳ Calculating doctor payout models...</div>
                    ) : payoutRecords.length === 0 ? (
                        <div className="empty-state">
                            <p>No payout records calculated for {selectedMonth}. Click the button above to calculate consultation commissions and basic salaries for doctors.</p>
                        </div>
                    ) : (
                        <div className="table-responsive">
                            <table className="payouts-table">
                                <thead>
                                    <tr>
                                        <th>Doctor Name</th>
                                        <th>Dept / Specialty</th>
                                        <th>Patients Seen</th>
                                        <th>Revenue Generated</th>
                                        <th>Payout Model</th>
                                        <th>Commission %</th>
                                        <th>Commission Amt</th>
                                        <th>Fixed Salary</th>
                                        <th>Total Payable</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payoutRecords.map((rec) => (
                                        <tr key={rec._id}>
                                            <td className="bold">{rec.doctorId?.name || 'N/A'}</td>
                                            <td><span className="specialty-badge">{rec.doctorId?.specialty || 'General'}</span></td>
                                            <td className="bold text-center">{rec.patientsSeen}</td>
                                            <td className="bold highlight-blue">{formatCurrency(rec.revenueGenerated)}</td>
                                            <td className="italic">{rec.doctorId?.payoutModel || 'Fixed'}</td>
                                            <td className="text-center">{rec.commissionPercent}%</td>
                                            <td className="green">{formatCurrency(rec.commissionAmount)}</td>
                                            <td>{formatCurrency(rec.fixedSalary)}</td>
                                            <td className="bold highlight-pink">{formatCurrency(rec.totalPayable)}</td>
                                            <td>
                                                <span className={`status-badge ${rec.status.toLowerCase()}`}>{rec.status}</span>
                                            </td>
                                            <td>
                                                <div className="btn-actions">
                                                    {rec.status === 'Draft' && (
                                                        <button className="action-btn approve" onClick={() => handleApprovePayout(rec)}>👍 Approve</button>
                                                    )}
                                                    {rec.status === 'Approved' && (
                                                        <button className="action-btn pay" onClick={() => handleOpenPayModal(rec)}>💳 Pay</button>
                                                    )}
                                                    {rec.status === 'Paid' && (
                                                        <span className="paid-check">✔️ Settled</span>
                                                    )}
                                                    <button className="action-btn view" onClick={() => handleOpenHistory(rec)}>📜 History</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ) : (
                <div className="payouts-configs-section card-box">
                    <h3>Doctor Compensation Settings Templates</h3>
                    <div className="table-responsive">
                        <table className="payouts-table">
                            <thead>
                                <tr>
                                    <th>Doctor Name</th>
                                    <th>Specialty</th>
                                    <th>Joining Date</th>
                                    <th>Payout Model</th>
                                    <th>Commission Percent (%)</th>
                                    <th>Fixed Monthly Salary</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {doctorsList.map((doc) => (
                                    <tr key={doc._id}>
                                        <td className="bold">{doc.name}</td>
                                        <td><span className="specialty-badge">{doc.specialty || 'General'}</span></td>
                                        <td>{doc.joiningDate ? new Date(doc.joiningDate).toLocaleDateString() : 'N/A'}</td>
                                        <td className="bold highlight-blue">{doc.payoutModel || 'Fixed'}</td>
                                        <td className="text-center">{doc.commissionPercent || 0}%</td>
                                        <td>{formatCurrency(doc.fixedSalary)}</td>
                                        <td>
                                            <button className="action-btn edit" onClick={() => handleOpenEditConfigModal(doc)}>✏️ Edit Config</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Payout Processing Modal */}
            {showPayModal && activeRecord && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Mark Doctor Payout as Paid</h3>
                        <p>Doctor: <strong>{activeRecord.doctorId?.name}</strong></p>
                        <p>Month: <strong>{activeRecord.month}</strong></p>
                        <p>Net Payout Value: <strong>{formatCurrency(activeRecord.totalPayable)}</strong></p>

                        <div className="form-group">
                            <label>Payment Method</label>
                            <select value={paymentMethod} onChange={(e) => {
                                const method = e.target.value;
                                setPaymentMethod(method);
                                if (method !== 'UPI' && method !== 'Bank Transfer') {
                                    setTxnRef('');
                                }
                            }}>
                                <option value="Bank Transfer">Bank Transfer</option>
                                <option value="UPI">UPI</option>
                                <option value="Cash">Cash</option>
                                <option value="Cheque">Cheque</option>
                            </select>
                        </div>
                        
                        {(paymentMethod === 'UPI' || paymentMethod === 'Bank Transfer') && (
                            <div className="form-group">
                                <label>Transaction Reference / Txn ID</label>
                                <input type="text" placeholder="e.g. UPI-9210831" value={txnRef} onChange={(e) => setTxnRef(e.target.value)} />
                            </div>
                        )}

                        <div className="form-group">
                            <label>Notes / Memo</label>
                            <textarea placeholder="e.g. Monthly salary and consult commissions" value={notes} onChange={(e) => setNotes(e.target.value)} />
                        </div>

                        <div className="modal-actions">
                            <button className="btn-cancel" onClick={() => setShowPayModal(false)}>Cancel</button>
                            <button className="btn-submit" onClick={handleProcessPayment}>Confirm Payment</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Doctor Config Edit Modal */}
            {showEditConfigModal && editDoctor && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Configure Doctor Payout settings</h3>
                        <p>Doctor: <strong>{editDoctor.name}</strong></p>
                        
                        <div className="form-group">
                            <label>Payout Compensation Model</label>
                            <select value={editPayoutModel} onChange={(e) => setEditPayoutModel(e.target.value)}>
                                <option value="Fixed">Fixed Salary Only</option>
                                <option value="Commission">Commission Based Only</option>
                                <option value="Hybrid">Hybrid (Fixed + Commission)</option>
                            </select>
                        </div>

                        {(editPayoutModel === 'Commission' || editPayoutModel === 'Hybrid') && (
                            <div className="form-group">
                                <label>Commission Percent (%)</label>
                                <input type="number" min="0" max="100" value={editCommissionPercent} onChange={(e) => setEditCommissionPercent(Number(e.target.value))} />
                            </div>
                        )}

                        {(editPayoutModel === 'Fixed' || editPayoutModel === 'Hybrid') && (
                            <div className="form-group">
                                <label>Fixed Monthly Salary (₹)</label>
                                <input type="number" min="0" value={editFixedSalary} onChange={(e) => setEditFixedSalary(Number(e.target.value))} />
                            </div>
                        )}

                        <div className="modal-actions">
                            <button className="btn-cancel" onClick={() => setShowEditConfigModal(false)}>Cancel</button>
                            <button className="btn-submit" onClick={handleUpdateConfig}>Save Configuration</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Payout History Modal */}
            {showHistoryModal && historyDoctor && (
                <div className="modal-overlay history-modal">
                    <div className="modal-content history-content">
                        <h3>Payment History: {historyDoctor.name}</h3>
                        <p>Specialty: <strong>{historyDoctor.specialty}</strong></p>
                        
                        <div className="table-responsive">
                            {doctorHistory.length === 0 ? (
                                <p className="empty-state">No historical payments recorded for this doctor.</p>
                            ) : (
                                <table className="history-table">
                                    <thead>
                                        <tr>
                                            <th>Month</th>
                                            <th>Patients Seen</th>
                                            <th>Revenue</th>
                                            <th>Commission</th>
                                            <th>Fixed Salary</th>
                                            <th>Net Paid</th>
                                            <th>Payment Date</th>
                                            <th>Method</th>
                                            <th>Reference</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {doctorHistory.map((row) => (
                                            <tr key={row._id}>
                                                <td className="bold">{row.month}</td>
                                                <td>{row.patientsSeen}</td>
                                                <td>{formatCurrency(row.revenueGenerated)}</td>
                                                <td className="green">{formatCurrency(row.commissionAmount)}</td>
                                                <td>{formatCurrency(row.fixedSalary)}</td>
                                                <td className="bold highlight-pink">{formatCurrency(row.totalPayable)}</td>
                                                <td>{new Date(row.paymentDate).toLocaleDateString()}</td>
                                                <td>{row.paymentMethod}</td>
                                                <td className="bold">#{row.transactionReference || 'N/A'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                        
                        <div className="modal-actions">
                            <button className="btn-cancel" onClick={() => setShowHistoryModal(false)}>Close History</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DoctorPayouts;
