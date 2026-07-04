import React, { useState, useEffect } from 'react';
import { financeAPI } from '../../utils/api';
import './PayrollManagement.css';

const PayrollManagement = () => {
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const currentYear = new Date().getFullYear();
    const currentMonthStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    const [activeTab, setActiveTab] = useState('run'); // 'run', 'settings'
    const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
    const [staffList, setStaffList] = useState([]);
    const [payrollRecords, setPayrollRecords] = useState([]);
    
    // KPI States
    const [kpis, setKpis] = useState({
        totalThisMonth: 0,
        pendingCount: 0,
        paidCount: 0,
        expenseYtd: 0
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
    
    const [showSlipModal, setShowSlipModal] = useState(false);
    const [slipRecord, setSlipRecord] = useState(null);

    const [showEditConfigModal, setShowEditConfigModal] = useState(false);
    const [editEmployee, setEditEmployee] = useState(null);
    const [editBasic, setEditBasic] = useState(0);
    const [editAllowances, setEditAllowances] = useState(0);
    const [editDeductions, setEditDeductions] = useState(0);
    const [editDesignation, setEditDesignation] = useState('');

    useEffect(() => {
        fetchData();
    }, [selectedMonth, activeTab]);

    const fetchData = async () => {
        try {
            setLoading(true);
            setError('');
            
            // Roles that must NEVER appear in staff payroll
            // (patients don't get salaries; doctors use Doctor Payouts)
            const NON_PAYROLL_ROLES = new Set(['patient', 'doctor']);
            const isNonPayroll = (rec) => {
                const rn = (rec.employeeId?.roleName || rec.employeeId?.role || '').toLowerCase();
                return NON_PAYROLL_ROLES.has(rn);
            };

            // Get payroll records for target month or all history depending on active tab
            let monthRecords = [];
            if (activeTab === 'history') {
                const recsRes = await financeAPI.getPayrollRecords({ status: 'Paid' });
                if (recsRes.success) {
                    monthRecords = recsRes.records.filter(r => !isNonPayroll(r));
                    setPayrollRecords(monthRecords);
                }
            } else {
                const recsRes = await financeAPI.getPayrollRecords({ month: selectedMonth });
                if (recsRes.success) {
                    // Safety filter: exclude patients & doctors (backend also enforces this)
                    monthRecords = recsRes.records.filter(r => !isNonPayroll(r));
                    setPayrollRecords(monthRecords);
                }
            }

            // Get staff list — backend excludes patients & doctors; frontend mirrors for safety
            const staffRes = await financeAPI.getStaffPayrollConfig();
            if (staffRes.success) {
                setStaffList(
                    staffRes.staff.filter(s => {
                        const rn = (s.roleName || s.role || '').toLowerCase();
                        return !NON_PAYROLL_ROLES.has(rn);
                    })
                );
            }

            // Calculate KPIs
            const totalThisMonth = monthRecords.reduce((s, r) => s + r.netSalary, 0);
            const pendingCount = monthRecords.filter(r => r.status === 'Draft').length;
            const paidCount = monthRecords.filter(r => r.status === 'Paid').length;

            // Fetch all paid records for YTD
            const ytdRes = await financeAPI.getPayrollRecords({ status: 'Paid' });
            let expenseYtd = 0;
            if (ytdRes.success) {
                expenseYtd = ytdRes.records
                    .filter(r => r.month.startsWith(String(currentYear)))
                    .reduce((s, r) => s + r.netSalary, 0);
            }

            setKpis({
                totalThisMonth,
                pendingCount,
                paidCount,
                expenseYtd
            });

        } catch (err) {
            console.error(err);
            setError('Error loading payroll context sheets.');
        } finally {
            setLoading(false);
        }
    };

    const handleGeneratePayroll = async () => {
        try {
            setLoading(true);
            setError('');
            const res = await financeAPI.generatePayroll({ month: selectedMonth });
            if (res.success) {
                setSuccessMsg(res.message);
                setTimeout(() => setSuccessMsg(''), 4000);
                fetchData();
            } else {
                setError(res.message || 'Failed to generate payroll.');
            }
        } catch (err) {
            console.error(err);
            setError('Failed to execute payroll draft generation.');
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
        if (paymentMethod !== 'Cash' && !txnRef.trim()) {
            setError('Transaction Reference / Txn ID is required.');
            return;
        }
        try {
            setLoading(true);
            setError('');
            const res = await financeAPI.payPayroll(activeRecord._id, {
                paymentMethod,
                transactionReference: txnRef,
                notes
            });
            if (res.success) {
                setShowPayModal(false);
                setSuccessMsg('Salary payout processed successfully.');
                setTimeout(() => setSuccessMsg(''), 4000);
                fetchData();
            } else {
                setError(res.message || 'Failed to process payout.');
            }
        } catch (err) {
            console.error(err);
            setError('Failed to mark payroll record as Paid.');
        } finally {
            setLoading(false);
        }
    };

    const handleReversePayment = async (record) => {
        if (!window.confirm(`Are you sure you want to reverse payment for ${record.employeeId?.name || 'this employee'}? This will also remove the posted expense.`)) {
            return;
        }
        try {
            setLoading(true);
            setError('');
            const res = await financeAPI.reversePayroll(record._id);
            if (res.success) {
                setSuccessMsg('Salary payout reversed successfully.');
                setTimeout(() => setSuccessMsg(''), 4000);
                fetchData();
            } else {
                setError(res.message || 'Failed to reverse payroll.');
            }
        } catch (err) {
            console.error(err);
            setError('Failed to reverse payroll status.');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenEditConfigModal = (emp) => {
        setEditEmployee(emp);
        setEditBasic(emp.basicSalary || 0);
        setEditAllowances(emp.allowances || 0);
        setEditDeductions(emp.deductions || 0);
        setEditDesignation(emp.designation || emp.role || '');
        setShowEditConfigModal(true);
    };

    const handleUpdateConfig = async () => {
        if (!editEmployee) return;
        try {
            setLoading(true);
            setError('');
            const res = await financeAPI.updateStaffPayrollConfig(editEmployee._id, {
                basicSalary: editBasic,
                allowances: editAllowances,
                deductions: editDeductions,
                designation: editDesignation
            });
            if (res.success) {
                setShowEditConfigModal(false);
                setSuccessMsg('Employee compensation configuration updated.');
                setTimeout(() => setSuccessMsg(''), 4000);
                fetchData();
            } else {
                setError(res.message || 'Failed to update settings.');
            }
        } catch (err) {
            console.error(err);
            setError('Failed to update compensation config.');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenSlip = (record) => {
        setSlipRecord(record);
        setShowSlipModal(true);
    };

    const handlePrintSlip = () => {
        window.print();
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0
        }).format(amount || 0);
    };

    // Returns human-readable role label.
    // Backend now resolves ObjectId roles to their name string via `roleName`.
    // Priority: roleName (from backend) → designation → 'Staff'
    const formatRole = (roleName, designation) => {
        const isObjectId = (val) => /^[a-f\d]{24}$/i.test(String(val || ''));

        if (roleName && !isObjectId(roleName)) return roleName;
        if (designation && !isObjectId(designation)) return designation;
        return 'Staff';
    };

    return (
        <div className="payroll-management-page">
            <header className="page-header">
                <div>
                    <h1>Employee Payroll Management</h1>
                    <p>Manage staff salary models, allowances, deductions, and process monthly salaries</p>
                </div>
                <div className="tab-triggers">
                    <button className={`tab-btn ${activeTab === 'run' ? 'active' : ''}`} onClick={() => setActiveTab('run')}>📊 Run Payroll</button>
                    <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>📜 Payment History</button>
                    <button className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>⚙️ Salary Settings</button>
                </div>
            </header>

            {/* Error / Success Banners */}
            {error && <div className="error-message">⚠️ {error}</div>}
            {successMsg && <div className="success-message">✅ {successMsg}</div>}

            {/* KPIs Block */}
            <div className="payroll-kpi-grid">
                <div className="payroll-kpi-card total-payroll">
                    <span className="icon">💰</span>
                    <div className="info">
                        <h3>Total Payroll ({selectedMonth})</h3>
                        <p className="value">{formatCurrency(kpis.totalThisMonth)}</p>
                    </div>
                </div>
                <div className="payroll-kpi-card pending-payments">
                    <span className="icon">⏳</span>
                    <div className="info">
                        <h3>Pending Salaries</h3>
                        <p className="value">{kpis.pendingCount}</p>
                    </div>
                </div>
                <div className="payroll-kpi-card paid-salaries">
                    <span className="icon">✅</span>
                    <div className="info">
                        <h3>Paid Salaries</h3>
                        <p className="value">{kpis.paidCount}</p>
                    </div>
                </div>
                <div className="payroll-kpi-card payroll-ytd">
                    <span className="icon">📈</span>
                    <div className="info">
                        <h3>Payroll Expense YTD ({currentYear})</h3>
                        <p className="value">{formatCurrency(kpis.expenseYtd)}</p>
                    </div>
                </div>
            </div>

            {activeTab === 'run' ? (
                <div className="payroll-run-section card-box">
                    <div className="section-header">
                        <div className="picker-block">
                            <label>Salary Month: </label>
                            <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
                        </div>
                        {payrollRecords.length === 0 && (
                            <button className="generate-btn" onClick={handleGeneratePayroll} disabled={loading}>
                                ⚡ Generate Payroll Draft ({selectedMonth})
                            </button>
                        )}
                    </div>

                    {loading ? (
                        <div className="loading-state">⏳ Fetching payroll records...</div>
                    ) : payrollRecords.length === 0 ? (
                        <div className="empty-state">
                            <p>No payroll records found for {selectedMonth}. Click the button above to generate draft salary templates for this month.</p>
                        </div>
                    ) : (
                        <div className="table-responsive">
                            <table className="payroll-table">
                                <thead>
                                    <tr>
                                        <th>Employee ID</th>
                                        <th>Employee Name</th>
                                        <th>Role / Dept</th>
                                        <th>Month</th>
                                        <th>Basic Salary</th>
                                        <th>Allowances</th>
                                        <th>Deductions</th>
                                        <th>Net Salary</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payrollRecords.map((rec) => (
                                        <tr key={rec._id}>
                                            <td className="bold">#{rec.employeeId?._id ? rec.employeeId._id.substring(rec.employeeId._id.length - 6).toUpperCase() : 'N/A'}</td>
                                            <td>{rec.employeeId?.name || 'N/A'}</td>
                                            <td>
                                                <span className="dept-badge">{formatRole(rec.employeeId?.roleName, rec.employeeId?.designation)}</span>
                                            </td>
                                            <td className="bold">{rec.month}</td>
                                            <td>{formatCurrency(rec.basicSalary)}</td>
                                            <td className="green">+{formatCurrency(rec.allowances)}</td>
                                            <td className="red">-{formatCurrency(rec.deductions)}</td>
                                            <td className="bold highlight-blue">{formatCurrency(rec.netSalary)}</td>
                                            <td>
                                                <span className={`status-badge ${rec.status.toLowerCase()}`}>{rec.status}</span>
                                            </td>
                                            <td>
                                                <div className="btn-actions">
                                                    {rec.status === 'Draft' && (
                                                        <button className="action-btn pay" onClick={() => handleOpenPayModal(rec)}>💳 Pay</button>
                                                    )}
                                                    {rec.status === 'Paid' && (
                                                        <button className="action-btn view" onClick={() => handleOpenSlip(rec)}>📄 Slip</button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ) : activeTab === 'history' ? (
                <div className="payroll-history-section card-box">
                    <h3>Employee Salary Payout History</h3>
                    {loading ? (
                        <div className="loading-state">⏳ Fetching payment history...</div>
                    ) : payrollRecords.length === 0 ? (
                        <div className="empty-state">
                            <p>No processed salary payouts found.</p>
                        </div>
                    ) : (
                        <div className="table-responsive">
                            <table className="payroll-table">
                                <thead>
                                    <tr>
                                        <th>Employee ID</th>
                                        <th>Employee Name</th>
                                        <th>Role / Dept</th>
                                        <th>Month</th>
                                        <th>Net Paid Salary</th>
                                        <th>Payment Date</th>
                                        <th>Payment Method</th>
                                        <th>Txn Reference</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payrollRecords.map((rec) => (
                                        <tr key={rec._id}>
                                            <td className="bold">#{rec.employeeId?._id ? rec.employeeId._id.substring(rec.employeeId._id.length - 6).toUpperCase() : 'N/A'}</td>
                                            <td>{rec.employeeId?.name || 'N/A'}</td>
                                            <td>
                                                <span className="dept-badge">{formatRole(rec.employeeId?.roleName, rec.employeeId?.designation)}</span>
                                            </td>
                                            <td className="bold">{rec.month}</td>
                                            <td className="bold highlight-blue">{formatCurrency(rec.netSalary)}</td>
                                            <td>{new Date(rec.paymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                                            <td className="bold">{rec.paymentMethod}</td>
                                            <td>{rec.transactionReference || '—'}</td>
                                            <td>
                                                <button className="action-btn view" onClick={() => handleOpenSlip(rec)}>📄 Slip</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ) : (
                <div className="payroll-settings-section card-box">
                    <h3>Employee Salary Configuration Templates</h3>
                    <div className="table-responsive">
                        <table className="payroll-table">
                            <thead>
                                <tr>
                                    <th>Employee ID</th>
                                    <th>Employee Name</th>
                                    <th>Role / Dept</th>
                                    <th>Designation</th>
                                    <th>Basic Salary</th>
                                    <th>Allowances</th>
                                    <th>Deductions</th>
                                    <th>Net Template Salary</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {staffList.map((emp) => (
                                    <tr key={emp._id}>
                                        <td className="bold">#{emp._id.substring(emp._id.length - 6).toUpperCase()}</td>
                                        <td>{emp.name}</td>
                                        <td><span className="role-tag">{formatRole(emp.roleName, emp.designation)}</span></td>
                                        <td className="bold">{emp.designation || 'Not Configured'}</td>
                                        <td>{formatCurrency(emp.basicSalary)}</td>
                                        <td className="green">+{formatCurrency(emp.allowances)}</td>
                                        <td className="red">-{formatCurrency(emp.deductions)}</td>
                                        <td className="bold highlight-blue">
                                            {formatCurrency((emp.basicSalary || 0) + (emp.allowances || 0) - (emp.deductions || 0))}
                                        </td>
                                        <td>
                                            <button className="action-btn edit" onClick={() => handleOpenEditConfigModal(emp)}>✏️ Edit Config</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Payment Modal */}
            {showPayModal && activeRecord && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Process Salary Payment</h3>
                        <p>Employee: <strong>{activeRecord.employeeId?.name}</strong></p>
                        <p>Month: <strong>{activeRecord.month}</strong></p>
                        <p>Net Payout Amount: <strong>{formatCurrency(activeRecord.netSalary)}</strong></p>
                        
                        <div className="form-group">
                            <label>Payment Method</label>
                            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                                <option value="Bank Transfer">Bank Transfer</option>
                                <option value="UPI">UPI</option>
                                <option value="Cash">Cash</option>
                                <option value="Cheque">Cheque</option>
                            </select>
                        </div>
                        
                        {paymentMethod !== 'Cash' && (
                            <div className="form-group">
                                <label>Transaction Reference / Txn ID <span className="red">*</span></label>
                                <input type="text" placeholder="e.g. TXN-108239" value={txnRef} onChange={(e) => setTxnRef(e.target.value)} required />
                            </div>
                        )}

                        <div className="form-group">
                            <label>Notes / Memo</label>
                            <textarea placeholder="Optional notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
                        </div>

                        <div className="modal-actions">
                            <button className="btn-cancel" onClick={() => setShowPayModal(false)}>Cancel</button>
                            <button className="btn-submit" onClick={handleProcessPayment}>Confirm Payment</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Salary Config Edit Modal */}
            {showEditConfigModal && editEmployee && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Configure Compensation Template</h3>
                        <p>Employee: <strong>{editEmployee.name}</strong></p>
                        
                        <div className="form-group">
                            <label>Designation Title</label>
                            <input type="text" value={editDesignation} onChange={(e) => setEditDesignation(e.target.value)} placeholder="e.g. Senior Nurse Manager" />
                        </div>

                        <div className="form-group">
                            <label>Basic Salary (₹)</label>
                            <input type="number" value={editBasic} onChange={(e) => setEditBasic(Number(e.target.value))} />
                        </div>

                        <div className="form-group">
                            <label>Allowances (₹)</label>
                            <input type="number" value={editAllowances} onChange={(e) => setEditAllowances(Number(e.target.value))} />
                        </div>

                        <div className="form-group">
                            <label>Deductions (₹)</label>
                            <input type="number" value={editDeductions} onChange={(e) => setEditDeductions(Number(e.target.value))} />
                        </div>

                        <div className="modal-actions">
                            <button className="btn-cancel" onClick={() => setShowEditConfigModal(false)}>Cancel</button>
                            <button className="btn-submit" onClick={handleUpdateConfig}>Save Configuration</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Salary Slip Modal */}
            {showSlipModal && slipRecord && (
                <div className="modal-overlay slip-modal">
                    <div className="modal-content slip-content">
                        <div id="slip-print-area">
                            <div className="slip-header">
                                <h2>HOSPITAL MEDICAL HMS</h2>
                                <p className="subtitle">Official Staff Salary Slip</p>
                            </div>
                            <div className="slip-info-grid">
                                <div><strong>Employee ID:</strong> #{slipRecord.employeeId?._id ? slipRecord.employeeId._id.substring(slipRecord.employeeId._id.length - 6).toUpperCase() : 'N/A'}</div>
                                <div><strong>Employee Name:</strong> {slipRecord.employeeId?.name}</div>
                                <div><strong>Designation:</strong> {formatRole(slipRecord.employeeId?.roleName, slipRecord.employeeId?.designation)}</div>
                                <div><strong>Email:</strong> {slipRecord.employeeId?.email}</div>
                                <div><strong>Pay Month:</strong> {slipRecord.month}</div>
                                <div><strong>Payment Date:</strong> {new Date(slipRecord.paymentDate).toLocaleDateString()}</div>
                                <div><strong>Payment Method:</strong> {slipRecord.paymentMethod}</div>
                                <div><strong>Txn Reference:</strong> {slipRecord.transactionReference || 'N/A'}</div>
                            </div>
                            
                            <hr className="divider" />
                            
                            <div className="slip-breakdown">
                                <div className="slip-row">
                                    <span>Basic Salary:</span>
                                    <span>{formatCurrency(slipRecord.basicSalary)}</span>
                                </div>
                                <div className="slip-row green">
                                    <span>Allowances (+):</span>
                                    <span>{formatCurrency(slipRecord.allowances)}</span>
                                </div>
                                <div className="slip-row red">
                                    <span>Deductions (-):</span>
                                    <span>{formatCurrency(slipRecord.deductions)}</span>
                                </div>
                                <hr className="divider" />
                                <div className="slip-row bold total">
                                    <span>Net Paid Salary:</span>
                                    <span>{formatCurrency(slipRecord.netSalary)}</span>
                                </div>
                            </div>
                            
                            {slipRecord.notes && (
                                <div className="slip-notes">
                                    <strong>Notes:</strong> {slipRecord.notes}
                                </div>
                            )}

                            <div className="slip-footer">
                                <p>This is a computer-generated salary slip and does not require a signature.</p>
                                <p>Generated by: {currentUser.name || 'Accountant'}</p>
                            </div>
                        </div>
                        <div className="modal-actions slip-actions">
                            <button className="btn-cancel" onClick={() => setShowSlipModal(false)}>Close</button>
                            <button className="btn-submit" onClick={handlePrintSlip}>🖨️ Print Slip / Save PDF</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PayrollManagement;
