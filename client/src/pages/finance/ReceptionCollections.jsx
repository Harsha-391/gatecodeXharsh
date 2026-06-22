import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { financeAPI } from '../../utils/api';
import { 
    FiTrendingUp, FiDollarSign, FiCalendar, FiUser, 
    FiClock, FiFileText, FiDownload, FiSearch, 
    FiInfo, FiCheckCircle, FiAlertCircle, FiX, 
    FiCreditCard, FiFilter, FiUserCheck, FiArrowRight 
} from 'react-icons/fi';
import './ReceptionCollections.css';

const ReceptionCollections = () => {
    const navigate = useNavigate();
    const today = new Date().toLocaleDateString('en-CA');

    // Auth & Role context
    const [user, setUser] = useState(null);
    const [role, setRole] = useState('');
    const [isReceptionist, setIsReceptionist] = useState(false);

    // Filters
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedReceptionist, setSelectedReceptionist] = useState('');
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');

    // Dashboard State
    const [kpis, setKpis] = useState({
        totalCollection: 0,
        cashCollection: 0,
        upiCollection: 0,
        cardCollection: 0,
        bankCollection: 0,
        activeCounters: 0
    });
    const [counterSummary, setCounterSummary] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [receptionistsList, setReceptionistsList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Reconciliation state (Accountant only)
    const [reconcileDate, setReconcileDate] = useState(new Date().toISOString().split('T')[0]);
    const [reconcileExpected, setReconcileExpected] = useState({ cash: 0, upi: 0, card: 0, bank: 0, total: 0 });
    const [reconcileActual, setReconcileActual] = useState({ cash: '', upi: '', card: '', bank: '' });
    const [reconcileNotes, setReconcileNotes] = useState('');
    const [reconcileRecord, setReconcileRecord] = useState(null);
    const [reconcileLoading, setReconcileLoading] = useState(false);
    const [reconcileSuccess, setReconcileSuccess] = useState('');
    const [reconcileError, setReconcileError] = useState('');

    // Drill down transaction modal (Accountant/Admin)
    const [isDrillDownOpen, setIsDrillDownOpen] = useState(false);
    const [drillDownStaffName, setDrillDownStaffName] = useState('');
    const [drillDownStaffId, setDrillDownStaffId] = useState('');

    // Tabs for Accountant: 'overview' | 'reconciliation'
    const [activeTab, setActiveTab] = useState('overview');

    useEffect(() => {
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        if (!storedUser || !storedUser.role) {
            navigate('/login');
            return;
        }
        setUser(storedUser);
        const userRole = typeof storedUser.role === 'string' ? storedUser.role.toLowerCase() : '';
        setRole(userRole);
        
        const receptionistRole = ['receptionist', 'reception'].includes(userRole);
        setIsReceptionist(receptionistRole);
    }, [navigate]);

    // Initial Load & refetch when filters change
    useEffect(() => {
        if (role) {
            fetchDashboardData();
        }
    }, [role, startDate, endDate, selectedReceptionist, selectedPaymentMethod]);

    // Refetch reconciliation when reconcile target date changes
    useEffect(() => {
        if (role && !isReceptionist && activeTab === 'reconciliation') {
            fetchReconciliationData();
        }
    }, [role, isReceptionist, activeTab, reconcileDate]);

    const fetchDashboardData = async () => {
        try {
            setLoading(true);
            setError('');

            if (isReceptionist) {
                // Receptionists can only load their own transactions
                const params = {
                    startDate,
                    endDate,
                    paymentMethod: selectedPaymentMethod || undefined
                };
                const res = await financeAPI.getReceptionTransactions(params);
                if (res.success) {
                    const txs = res.transactions || [];
                    setTransactions(txs);
                    
                    // Aggregate KPIs locally for receptionist security
                    let total = 0;
                    let cash = 0;
                    let upi = 0;
                    let card = 0;
                    let bank = 0;

                    txs.forEach(t => {
                        total += t.amount || 0;
                        if (t.paymentMethod === 'Cash') cash += t.amount || 0;
                        else if (t.paymentMethod === 'UPI') upi += t.amount || 0;
                        else if (t.paymentMethod === 'Card') card += t.amount || 0;
                        else if (t.paymentMethod === 'Bank Transfer') bank += t.amount || 0;
                    });

                    setKpis({
                        totalCollection: total,
                        cashCollection: cash,
                        upiCollection: upi,
                        cardCollection: card,
                        bankCollection: bank,
                        activeCounters: 1
                    });
                } else {
                    setError(res.message || 'Failed to fetch personal collection logs');
                }
            } else {
                // Accountant/Admin has full access
                const summaryRes = await financeAPI.getReceptionCollections(startDate, endDate);
                const txsRes = await financeAPI.getReceptionTransactions({
                    startDate,
                    endDate,
                    receptionistId: selectedReceptionist || undefined,
                    paymentMethod: selectedPaymentMethod || undefined
                });

                if (summaryRes.success && txsRes.success) {
                    setKpis(summaryRes.kpis || {
                        totalCollection: 0,
                        cashCollection: 0,
                        upiCollection: 0,
                        cardCollection: 0,
                        bankCollection: 0,
                        activeCounters: 0
                    });
                    setCounterSummary(summaryRes.counterWiseSummary || []);
                    setTransactions(txsRes.transactions || []);
                    setReceptionistsList(summaryRes.receptionists || []);
                } else {
                    setError(summaryRes.message || txsRes.message || 'Failed to retrieve counter data');
                }
            }
        } catch (err) {
            console.error('Error fetching reception tracking:', err);
            setError('Error connecting to finance servers. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const fetchReconciliationData = async () => {
        try {
            setReconcileLoading(true);
            setReconcileError('');
            setReconcileSuccess('');

            const res = await financeAPI.getReceptionReconciliation(reconcileDate);
            if (res.success) {
                setReconcileExpected(res.expected || { cash: 0, upi: 0, card: 0, bank: 0, total: 0 });
                setReconcileRecord(res.record);
                if (res.record) {
                    setReconcileActual({
                        cash: res.record.cashActual ?? '',
                        upi: res.record.upiActual ?? '',
                        card: res.record.cardActual ?? '',
                        bank: res.record.bankActual ?? ''
                    });
                    setReconcileNotes(res.record.notes || '');
                } else {
                    setReconcileActual({ cash: '', upi: '', card: '', bank: '' });
                    setReconcileNotes('');
                }
            } else {
                setReconcileError(res.message || 'Failed to fetch reconciliation expectation models');
            }
        } catch (err) {
            console.error('Reconciliation fetch error:', err);
            setReconcileError('Error fetching reconciliation log sheet');
        } finally {
            setReconcileLoading(false);
        }
    };

    const handleSubmitReconciliation = async (e) => {
        e.preventDefault();
        try {
            setReconcileLoading(true);
            setReconcileError('');
            setReconcileSuccess('');

            const payload = {
                date: reconcileDate,
                cashActual: Number(reconcileActual.cash || 0),
                upiActual: Number(reconcileActual.upi || 0),
                cardActual: Number(reconcileActual.card || 0),
                bankActual: Number(reconcileActual.bank || 0),
                notes: reconcileNotes
            };

            const res = await financeAPI.submitReceptionReconciliation(payload);
            if (res.success) {
                setReconcileSuccess('Daily Counter Reconciliation saved successfully!');
                fetchReconciliationData();
            } else {
                setReconcileError(res.message || 'Failed to register reconciliation');
            }
        } catch (err) {
            console.error('Reconciliation submit error:', err);
            setReconcileError('Server connection error during reconciliation submission');
        } finally {
            setReconcileLoading(false);
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0
        }).format(amount || 0);
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const formatDateTime = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const triggerDrillDown = (receptionistId, receptionistName) => {
        setDrillDownStaffId(receptionistId);
        setDrillDownStaffName(receptionistName);
        setIsDrillDownOpen(true);
    };

    // CSV Exporters
    const handleExportCounterSummary = () => {
        if (counterSummary.length === 0) return;
        
        const headers = ["Receptionist", "Counter", "Transactions", "Cash", "UPI", "Card", "Bank Transfer", "Total Collection"];
        const rows = counterSummary.map(c => [
            c.receptionistName,
            c.counterName,
            c.transactionsCount,
            c.cash,
            c.upi,
            c.card,
            c.bankTransfer,
            c.total
        ]);

        const csvContent = [headers, ...rows];
        exportToCSV(csvContent, `Counter_Collections_Summary_${startDate}_to_${endDate}.csv`);
    };

    const handleExportTransactions = () => {
        if (transactions.length === 0) return;
        
        const headers = ["Timestamp", "Patient ID", "Patient Name", "Phone", "Invoice / Appt ID", "Type", "Payment Method", "Amount", "Collected By", "Counter"];
        const rows = transactions.map(t => [
            formatDateTime(t.collectionTimestamp),
            t.patientIdStr || '',
            t.patientName,
            t.patientPhone || '',
            t.invoiceNumber || t.appointmentId || '',
            t.collectionType,
            t.paymentMethod,
            t.amount,
            t.collectedByName,
            t.counterName
        ]);

        const csvContent = [headers, ...rows];
        exportToCSV(csvContent, `Reception_Payment_Transactions_${startDate}_to_${endDate}.csv`);
    };

    const exportToCSV = (data, filename) => {
        const csvContent = "data:text/csv;charset=utf-8," 
            + data.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Filtered transaction list inside modal/drawer
    const drillDownTransactions = transactions.filter(t => t.collectedByUserId === drillDownStaffId);

    // Calculations for reconciliation difference
    const diffCash = reconcileExpected.cash - Number(reconcileActual.cash || 0);
    const diffUpi = reconcileExpected.upi - Number(reconcileActual.upi || 0);
    const diffCard = reconcileExpected.card - Number(reconcileActual.card || 0);
    const diffBank = reconcileExpected.bank - Number(reconcileActual.bank || 0);
    const reconcileTotalActual = Number(reconcileActual.cash || 0) + Number(reconcileActual.upi || 0) + Number(reconcileActual.card || 0) + Number(reconcileActual.bank || 0);
    const diffTotal = reconcileExpected.total - reconcileTotalActual;

    return (
        <div className="reception-collections-page">
            <header className="page-header">
                <div>
                    <h1>{isReceptionist ? "My Daily Collection" : "Reception Counter Collections"}</h1>
                    <p>{isReceptionist 
                        ? "Real-time log of payments you have received at your assigned counter today"
                        : "Track payments collected at reception counters, audit summaries, and perform daily reconciliation"
                    }</p>
                </div>
                {!isReceptionist && (
                    <div className="header-actions">
                        <button 
                            className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
                            onClick={() => setActiveTab('overview')}
                        >
                            Overview & Counters
                        </button>
                        <button 
                            className={`tab-btn ${activeTab === 'reconciliation' ? 'active' : ''}`}
                            onClick={() => setActiveTab('reconciliation')}
                        >
                            Daily Reconciliation
                        </button>
                    </div>
                )}
            </header>

            {error && <div className="error-message">⚠️ {error}</div>}

            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
                <>
                    {/* KPI Widgets */}
                    <div className="kpi-grid">
                        <div className="kpi-card total">
                            <div className="kpi-icon"><FiDollarSign /></div>
                            <div className="kpi-details">
                                <h3>Total Collected</h3>
                                <p className="value">{formatCurrency(kpis.totalCollection)}</p>
                            </div>
                        </div>
                        <div className="kpi-card cash">
                            <div className="kpi-icon"><FiDollarSign /></div>
                            <div className="kpi-details">
                                <h3>Cash Collection</h3>
                                <p className="value">{formatCurrency(kpis.cashCollection)}</p>
                            </div>
                        </div>
                        <div className="kpi-card upi">
                            <div className="kpi-icon"><FiCreditCard /></div>
                            <div className="kpi-details">
                                <h3>UPI / Online</h3>
                                <p className="value">{formatCurrency(kpis.upiCollection)}</p>
                            </div>
                        </div>
                        <div className="kpi-card card">
                            <div className="kpi-icon"><FiCreditCard /></div>
                            <div className="kpi-details">
                                <h3>Card Payments</h3>
                                <p className="value">{formatCurrency(kpis.cardCollection)}</p>
                            </div>
                        </div>
                        {!isReceptionist && (
                            <div className="kpi-card bank">
                                <div className="kpi-icon"><FiUserCheck /></div>
                                <div className="kpi-details">
                                    <h3>Active Counters</h3>
                                    <p className="value">{kpis.activeCounters}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Filter toolbar */}
                    <div className="toolbar card-box">
                        <div className="filter-group">
                            <div className="filter-item">
                                <label><FiCalendar /> Start Date:</label>
                                <input 
                                    type="date" 
                                    value={startDate} 
                                    max={today}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setStartDate(val > today ? today : val);
                                    }} 
                                />
                            </div>
                            <div className="filter-item">
                                <label><FiCalendar /> End Date:</label>
                                <input 
                                    type="date" 
                                    value={endDate} 
                                    max={today}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setEndDate(val > today ? today : val);
                                    }} 
                                />
                            </div>
                            {!isReceptionist && (
                                <div className="filter-item">
                                    <label><FiUser /> Receptionist:</label>
                                    <select 
                                        value={selectedReceptionist} 
                                        onChange={(e) => setSelectedReceptionist(e.target.value)}
                                    >
                                        <option value="">All Receptionists</option>
                                        {receptionistsList.map(item => (
                                            <option key={item._id} value={item._id}>{item.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div className="filter-item">
                                <label><FiFilter /> Method:</label>
                                <select 
                                    value={selectedPaymentMethod} 
                                    onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                                >
                                    <option value="">All Payment Methods</option>
                                    <option value="Cash">Cash</option>
                                    <option value="UPI">UPI</option>
                                    <option value="Card">Card</option>
                                    <option value="Bank Transfer">Bank Transfer</option>
                                </select>
                            </div>
                        </div>

                        <div className="export-actions">
                            {!isReceptionist && counterSummary.length > 0 && (
                                <button className="action-btn outline" onClick={handleExportCounterSummary}>
                                    <FiDownload /> Export Summary
                                </button>
                            )}
                            {transactions.length > 0 && (
                                <button className="action-btn outline" onClick={handleExportTransactions}>
                                    <FiDownload /> Export Transactions
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Counter-wise summary section (Accountant only) */}
                    {!isReceptionist && (
                        <div className="section-container card-box">
                            <div className="section-header">
                                <h2>Counter-Wise Daily Collection Summary</h2>
                                <span className="subtitle">Breakdown of collections across all active reception counters</span>
                            </div>
                            {loading ? (
                                <div className="loading-state">⏳ Loading summaries...</div>
                            ) : counterSummary.length === 0 ? (
                                <div className="empty-state">No payment collections found in the selected date range.</div>
                            ) : (
                                <div className="table-wrapper">
                                    <table className="finance-table">
                                        <thead>
                                            <tr>
                                                <th>Receptionist</th>
                                                <th>Counter Name</th>
                                                <th>Total Payments</th>
                                                <th>Cash</th>
                                                <th>UPI</th>
                                                <th>Card</th>
                                                <th>Bank Transfer</th>
                                                <th>Total Collection</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {counterSummary.map((item, idx) => (
                                                <tr key={idx}>
                                                    <td className="bold">{item.receptionistName}</td>
                                                    <td>
                                                        <span className="counter-tag">{item.counterName || "Counter 1"}</span>
                                                    </td>
                                                    <td>{item.transactionsCount}</td>
                                                    <td>{formatCurrency(item.cash)}</td>
                                                    <td>{formatCurrency(item.upi)}</td>
                                                    <td>{formatCurrency(item.card)}</td>
                                                    <td>{formatCurrency(item.bankTransfer)}</td>
                                                    <td className="bold highlight-currency">{formatCurrency(item.total)}</td>
                                                    <td>
                                                        <button 
                                                            className="table-action-btn"
                                                            onClick={() => triggerDrillDown(item.receptionistId, item.receptionistName)}
                                                        >
                                                            View Logs <FiArrowRight />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Transaction logs list */}
                    <div className="section-container card-box">
                        <div className="section-header">
                            <h2>{isReceptionist ? "My Transaction Logs" : "Detailed Transaction History"}</h2>
                            <span className="subtitle">Audit list of individual payment logs matching the active filters</span>
                        </div>
                        {loading ? (
                            <div className="loading-state">⏳ Loading logs...</div>
                        ) : transactions.length === 0 ? (
                            <div className="empty-state">No transactions matched your filter parameters.</div>
                        ) : (
                            <div className="table-wrapper">
                                <table className="finance-table">
                                    <thead>
                                        <tr>
                                            <th>Timestamp</th>
                                            <th>Patient ID</th>
                                            <th>Patient Name</th>
                                            <th>Collection Type</th>
                                            <th>Payment Method</th>
                                            <th>Amount</th>
                                            {!isReceptionist && <th>Collected By</th>}
                                            {!isReceptionist && <th>Counter</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {transactions.map((t, idx) => (
                                            <tr key={idx}>
                                                <td className="time-col">{formatDateTime(t.collectionTimestamp)}</td>
                                                <td>{t.patientIdStr || "-"}</td>
                                                <td className="bold">{t.patientName}</td>
                                                <td>
                                                    <span className="type-tag">{t.collectionType}</span>
                                                </td>
                                                <td>
                                                    <span className={`method-tag ${t.paymentMethod?.toLowerCase()}`}>
                                                        {t.paymentMethod}
                                                    </span>
                                                </td>
                                                <td className="bold price-text">{formatCurrency(t.amount)}</td>
                                                {!isReceptionist && <td>{t.collectedByName}</td>}
                                                {!isReceptionist && <td>{t.counterName}</td>}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* RECONCILIATION TAB */}
            {!isReceptionist && activeTab === 'reconciliation' && (
                <div className="reconciliation-layout">
                    <div className="form-panel card-box">
                        <div className="panel-header">
                            <h3>Verify & Reconcile Ledger</h3>
                            <div className="reconcile-date-picker-wrapper">
                                <label><FiCalendar /> Audit Date:</label>
                                <input 
                                    type="date" 
                                    value={reconcileDate}
                                    max={today}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setReconcileDate(val > today ? today : val);
                                    }}
                                    className="recon-date-picker"
                                />
                            </div>
                        </div>

                        {reconcileLoading ? (
                            <div className="loading-state">⏳ Loading ledger audit...</div>
                        ) : (
                            <form onSubmit={handleSubmitReconciliation}>
                                {reconcileSuccess && <div className="success-message">🎉 {reconcileSuccess}</div>}
                                {reconcileError && <div className="error-message">⚠️ {reconcileError}</div>}

                                {reconcileRecord && (
                                    <div className="reconciled-badge">
                                        <span>✅ Reconciled on {formatDate(reconcileDate)} by {reconcileRecord.reconciledByName} (Status: {reconcileRecord.status})</span>
                                    </div>
                                )}

                                <div className="recon-grid">
                                    <div className="recon-header-row">
                                        <span>Payment Mode</span>
                                        <span>Expected (System)</span>
                                        <span>Actual Collected *</span>
                                        <span>Ledger Discrepancy</span>
                                    </div>

                                    {/* Cash */}
                                    <div className="recon-row">
                                        <span className="bold">💵 Cash</span>
                                        <span className="expected-val">{formatCurrency(reconcileExpected.cash)}</span>
                                        <input 
                                            type="number" 
                                            required 
                                            placeholder="0"
                                            value={reconcileActual.cash}
                                            onChange={(e) => setReconcileActual({ ...reconcileActual, cash: e.target.value })}
                                        />
                                        <span className={`diff-val ${diffCash === 0 ? 'balanced' : 'discrepancy'}`}>
                                            {diffCash === 0 ? "Balanced" : formatCurrency(diffCash)}
                                        </span>
                                    </div>

                                    {/* UPI */}
                                    <div className="recon-row">
                                        <span className="bold">📱 UPI / Online</span>
                                        <span className="expected-val">{formatCurrency(reconcileExpected.upi)}</span>
                                        <input 
                                            type="number" 
                                            required 
                                            placeholder="0"
                                            value={reconcileActual.upi}
                                            onChange={(e) => setReconcileActual({ ...reconcileActual, upi: e.target.value })}
                                        />
                                        <span className={`diff-val ${diffUpi === 0 ? 'balanced' : 'discrepancy'}`}>
                                            {diffUpi === 0 ? "Balanced" : formatCurrency(diffUpi)}
                                        </span>
                                    </div>

                                    {/* Card */}
                                    <div className="recon-row">
                                        <span className="bold">💳 Card</span>
                                        <span className="expected-val">{formatCurrency(reconcileExpected.card)}</span>
                                        <input 
                                            type="number" 
                                            required 
                                            placeholder="0"
                                            value={reconcileActual.card}
                                            onChange={(e) => setReconcileActual({ ...reconcileActual, card: e.target.value })}
                                        />
                                        <span className={`diff-val ${diffCard === 0 ? 'balanced' : 'discrepancy'}`}>
                                            {diffCard === 0 ? "Balanced" : formatCurrency(diffCard)}
                                        </span>
                                    </div>

                                    {/* Bank Transfer */}
                                    <div className="recon-row">
                                        <span className="bold">🏦 Bank Transfer</span>
                                        <span className="expected-val">{formatCurrency(reconcileExpected.bank)}</span>
                                        <input 
                                            type="number" 
                                            required 
                                            placeholder="0"
                                            value={reconcileActual.bank}
                                            onChange={(e) => setReconcileActual({ ...reconcileActual, bank: e.target.value })}
                                        />
                                        <span className={`diff-val ${diffBank === 0 ? 'balanced' : 'discrepancy'}`}>
                                            {diffBank === 0 ? "Balanced" : formatCurrency(diffBank)}
                                        </span>
                                    </div>

                                    {/* Totals */}
                                    <div className="recon-totals-row">
                                        <span className="bold">Total Collections</span>
                                        <span className="bold">{formatCurrency(reconcileExpected.total)}</span>
                                        <span className="bold">{formatCurrency(reconcileTotalActual)}</span>
                                        <span className={`bold ${diffTotal === 0 ? 'balanced' : 'discrepancy'}`}>
                                            {diffTotal === 0 ? "Balanced" : formatCurrency(diffTotal)}
                                        </span>
                                    </div>
                                </div>

                                <div className="form-group notes-field">
                                    <label>Reconciliation Notes & Discrepancy Audits</label>
                                    <textarea 
                                        placeholder="Record details of any discrepancies, bank deposit slip numbers, or daily audit details"
                                        value={reconcileNotes}
                                        onChange={(e) => setReconcileNotes(e.target.value)}
                                    />
                                </div>

                                <button type="submit" className="primary-action-btn submit-recon-btn">
                                    Submit Reconciliation Audit Log
                                </button>
                            </form>
                        )}
                    </div>

                    <div className="info-panel card-box">
                        <h3>💡 Counter Reconciliation Instructions</h3>
                        <p>Verify that actual physical cash collections and banking settlement printouts match the logged transactions generated at the reception desk counters.</p>
                        <ul>
                            <li>Select the target date for reconciliation.</li>
                            <li>Collect physical collections from all counters. Count the cash and match online settlements with the aggregator apps.</li>
                            <li>Key in the actual counted sums for each category on the form.</li>
                            <li>The status will verify as <strong>BALANCED</strong> when system expected aggregates equal physical deposits.</li>
                            <li>For any discrepancies (overages or shortages), you must supply audit reasons in the Notes field for superadmin reviews.</li>
                        </ul>
                        <div className={`recon-summary-status ${diffTotal === 0 ? 'balanced' : 'discrepancy'}`}>
                            <div className="status-label">Ledger Consistency Status</div>
                            <div className="status-value">{diffTotal === 0 ? 'BALANCED' : 'DISCREPANCY'}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Drill Down Transaction Details Drawer/Modal */}
            {isDrillDownOpen && (
                <div className="modal-overlay">
                    <div className="modal-content drilldown-modal">
                        <div className="modal-header">
                            <div>
                                <h3>Transactions: {drillDownStaffName}</h3>
                                <p className="subtitle">Collections logs for {formatDate(startDate)} {startDate !== endDate ? ` to ${formatDate(endDate)}` : ''}</p>
                            </div>
                            <button className="close-btn" onClick={() => setIsDrillDownOpen(false)}>
                                <FiX />
                            </button>
                        </div>

                        {drillDownTransactions.length === 0 ? (
                            <div className="empty-state">No transaction logs recorded for this receptionist.</div>
                        ) : (
                            <div className="table-wrapper modal-table-wrapper">
                                <table className="finance-table">
                                    <thead>
                                        <tr>
                                            <th>Timestamp</th>
                                            <th>Patient Name</th>
                                            <th>Type</th>
                                            <th>Method</th>
                                            <th>Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {drillDownTransactions.map((t, idx) => (
                                            <tr key={idx}>
                                                <td className="time-col">{formatDateTime(t.collectionTimestamp)}</td>
                                                <td className="bold">{t.patientName}</td>
                                                <td><span className="type-tag">{t.collectionType}</span></td>
                                                <td>
                                                    <span className={`method-tag ${t.paymentMethod?.toLowerCase()}`}>
                                                        {t.paymentMethod}
                                                    </span>
                                                </td>
                                                <td className="bold price-text">{formatCurrency(t.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="modal-actions">
                            <button className="btn-cancel" onClick={() => setIsDrillDownOpen(false)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReceptionCollections;
