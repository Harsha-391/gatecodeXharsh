import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { financeAPI } from '../../utils/api';
import './FinancialAuditCenter.css';

const FinancialAuditCenter = () => {
    const navigate = useNavigate();
    const { section } = useParams();
    const today = new Date().toLocaleDateString('en-CA');

    // Mapping params/routes to tabs
    const activeTab = section || 'overview';

    const [kpis, setKpis] = useState({
        totalAuditEvents: 0,
        refundAuditsToday: 0,
        highRiskTransactions: 0,
        deletedRecords: 0,
        failedReconciliations: 0,
        insuranceClaimChanges: 0
    });

    const [logs, setLogs] = useState([]);
    const [recentLogs, setRecentLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showScrollBtns, setShowScrollBtns] = useState(false);

    const tabsRef = useRef(null);

    const checkOverflow = () => {
        if (tabsRef.current) {
            const { scrollWidth, clientWidth } = tabsRef.current;
            const isWindowSmall = window.innerWidth < 1200;
            setShowScrollBtns(scrollWidth > clientWidth || isWindowSmall);
        }
    };

    useEffect(() => {
        if (!tabsRef.current) return;

        const observer = new ResizeObserver(() => {
            checkOverflow();
        });
        observer.observe(tabsRef.current);

        window.addEventListener('resize', checkOverflow);

        // Initial check and safety timeout check
        checkOverflow();
        const timer = setTimeout(checkOverflow, 150);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', checkOverflow);
            clearTimeout(timer);
        };
    }, [logs, recentLogs]);

    const scrollTabs = (direction) => {
        if (tabsRef.current) {
            const scrollAmount = 200;
            tabsRef.current.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth'
            });
        }
    };

    // Filters state
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [amountMin, setAmountMin] = useState('');
    const [amountMax, setAmountMax] = useState('');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [patientName, setPatientName] = useState('');
    const [invoiceNumber, setInvoiceNumber] = useState('');

    // Load user context for security check
    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const role = user?.role ? user.role.toLowerCase() : '';
        const permissions = user?.permissions || [];
        const hasAccess = ['accountant', 'centraladmin', 'superadmin', 'hospitaladmin'].includes(role) || permissions.includes('finance_view');

        if (!hasAccess) {
            navigate('/dashboard');
        } else {
            fetchOverviewData();
        }
    }, [navigate]);

    // Fetch filtered datasets whenever active section or search/filters change
    useEffect(() => {
        if (activeTab !== 'overview') {
            fetchFilteredLogs();
        } else {
            fetchOverviewData();
        }
    }, [activeTab, startDate, endDate, amountMin, amountMax, search, statusFilter, patientName, invoiceNumber]);

    const fetchOverviewData = async () => {
        try {
            setLoading(true);
            setError('');
            const res = await financeAPI.getFinancialAuditLogs({ section: 'overview' });
            if (res.success) {
                setKpis(res.kpis);
                setRecentLogs(res.recentLogs || []);
            } else {
                setError(res.message || 'Failed to retrieve overview audit stats');
            }
        } catch (err) {
            console.error(err);
            setError('Error loading general audit configurations');
        } finally {
            setLoading(false);
        }
    };

    const fetchFilteredLogs = async () => {
        try {
            setLoading(true);
            setError('');
            const params = {
                section: activeTab,
                startDate,
                endDate,
                amountMin,
                amountMax,
                search,
                status: statusFilter,
                patientName,
                invoiceNumber
            };
            const res = await financeAPI.getFinancialAuditLogs(params);
            if (res.success) {
                setLogs(res.logs || []);
            } else {
                setError(res.message || 'Failed to retrieve audit log data');
            }
        } catch (err) {
            console.error(err);
            setError('Error loading audit category log sheets');
        } finally {
            setLoading(false);
        }
    };

    const resetFilters = () => {
        setStartDate('');
        setEndDate('');
        setAmountMin('');
        setAmountMax('');
        setSearch('');
        setStatusFilter('');
        setPatientName('');
        setInvoiceNumber('');
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
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    // Client-side dynamic CSV export
    const handleExportCSV = async () => {
        if (!logs || logs.length === 0) return;
        try {
            // Build CSV content
            const headers = Object.keys(logs[0]).join(',');
            const rows = logs.map(row => 
                Object.values(row).map(val => 
                    typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val
                ).join(',')
            );
            const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join('\n');
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `financial_audit_${activeTab}_${Date.now()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Log activity to backend
            await financeAPI.logUserActivity('Export Excel', `Exported ${activeTab} audit logs list to Excel/CSV format`);
        } catch (err) {
            console.error("Export failed:", err);
        }
    };

    // Client-side PDF trigger
    const handleExportPDF = async () => {
        try {
            window.print();
            // Log activity to backend
            await financeAPI.logUserActivity('Download PDF', `Triggered PDF export of ${activeTab} compliance sheets`);
        } catch (err) {
            console.error("PDF export tracking failed:", err);
        }
    };

    const tabConfig = [
        { key: 'overview', label: 'Overview', route: '/accountant/audit-logs/overview' },
        { key: 'invoices', label: 'Invoice Audit', route: '/accountant/audit-logs/invoices' },
        { key: 'payments', label: 'Payment Audit', route: '/accountant/audit-logs/payments' },
        { key: 'refunds', label: 'Refund Audit', route: '/accountant/audit-logs/refunds' },
        { key: 'expenses', label: 'Expense Audit', route: '/accountant/audit-logs/expenses' },
        { key: 'insurance', label: 'Insurance Audit', route: '/accountant/audit-logs/insurance' },
        { key: 'reconciliation', label: 'Reconciliation Audit', route: '/accountant/audit-logs/reconciliation' },
        { key: 'deleted', label: 'Deleted Records', route: '/accountant/audit-logs/deleted' },
        { key: 'high-risk', label: 'High Risk Transactions', route: '/accountant/audit-logs/high-risk' },
        { key: 'user-activity', label: 'User Activity', route: '/accountant/audit-logs/user-activity' }
    ];

    const getActionBadgeClass = (action = '') => {
        const act = action.toLowerCase();
        if (act.includes('created') || act.includes('generated') || act.includes('collected')) return 'created';
        if (act.includes('updated') || act.includes('modified') || act.includes('edited')) return 'updated';
        if (act.includes('cancelled') || act.includes('discrepancy')) return 'cancelled';
        if (act.includes('deleted') || act.includes('voided')) return 'deleted';
        return 'risk';
    };

    return (
        <div className="financial-audit-page">
            <header className="page-header">
                <div>
                    <h1>Financial Audit & Compliance Center</h1>
                    <p>ERP Oversight panel for tracing transactions, soft-deletions, invoice lifecycles, and risk profiles</p>
                </div>
            </header>

            {/* KPIs Block */}
            <div className="audit-kpi-grid">
                <div className="audit-kpi-card total-events" onClick={() => navigate('/accountant/audit-logs/overview')}>
                    <span className="icon">📊</span>
                    <div className="info">
                        <h3>Total Audit Events</h3>
                        <p className="value">{kpis.totalAuditEvents}</p>
                    </div>
                </div>
                <div className="audit-kpi-card refund-audits" onClick={() => navigate('/accountant/audit-logs/refunds')}>
                    <span className="icon">🔄</span>
                    <div className="info">
                        <h3>Refund Audits Today</h3>
                        <p className="value">{kpis.refundAuditsToday}</p>
                    </div>
                </div>
                <div className="audit-kpi-card high-risk" onClick={() => navigate('/accountant/audit-logs/high-risk')}>
                    <span className="icon">⚠️</span>
                    <div className="info">
                        <h3>High Risk Flags</h3>
                        <p className="value">{kpis.highRiskTransactions}</p>
                    </div>
                </div>
                <div className="audit-kpi-card deleted" onClick={() => navigate('/accountant/audit-logs/deleted')}>
                    <span className="icon">🗑️</span>
                    <div className="info">
                        <h3>Deleted Records</h3>
                        <p className="value">{kpis.deletedRecords}</p>
                    </div>
                </div>
                <div className="audit-kpi-card failed-recon" onClick={() => navigate('/accountant/audit-logs/reconciliation')}>
                    <span className="icon">⚖️</span>
                    <div className="info">
                        <h3>Recon Discrepancies</h3>
                        <p className="value">{kpis.failedReconciliations}</p>
                    </div>
                </div>
                <div className="audit-kpi-card claims" onClick={() => navigate('/accountant/audit-logs/insurance')}>
                    <span className="icon">🏥</span>
                    <div className="info">
                        <h3>Insurer Changes Today</h3>
                        <p className="value">{kpis.insuranceClaimChanges}</p>
                    </div>
                </div>
            </div>

            {/* Filters panel (hidden for Overview tab) */}
            {activeTab !== 'overview' && (
                <div className="audit-filters-card">
                    <div className="filters-header">
                        <h2>Compliance Range Filters</h2>
                        <div className="export-actions">
                            <button className="export-btn pdf" onClick={handleExportPDF}>🖨️ PDF Print</button>
                            <button className="export-btn csv" onClick={handleExportCSV}>📊 Export CSV</button>
                        </div>
                    </div>
                    <div className="filters-grid">
                        <div className="filter-item">
                            <label>Date Range (From)</label>
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
                            <label>Date Range (To)</label>
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
                        <div className="filter-item">
                            <label>Amount Min (₹)</label>
                            <input type="number" placeholder="Min" value={amountMin} onChange={(e) => setAmountMin(e.target.value)} />
                        </div>
                        <div className="filter-item">
                            <label>Amount Max (₹)</label>
                            <input type="number" placeholder="Max" value={amountMax} onChange={(e) => setAmountMax(e.target.value)} />
                        </div>
                        {['invoices', 'payments', 'refunds'].includes(activeTab) && (
                            <>
                                <div className="filter-item">
                                    <label>Patient Name</label>
                                    <input type="text" placeholder="Filter patient" value={patientName} onChange={(e) => setPatientName(e.target.value)} />
                                </div>
                                <div className="filter-item">
                                    <label>Invoice Number</label>
                                    <input type="text" placeholder="e.g. INV-1002" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
                                </div>
                            </>
                        )}
                        {['invoices', 'refunds', 'insurance', 'reconciliation'].includes(activeTab) && (
                            <div className="filter-item">
                                <label>Status</label>
                                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                                    <option value="">All Statuses</option>
                                    {activeTab === 'invoices' && (
                                        <>
                                            <option value="Paid">Paid</option>
                                            <option value="Partially Paid">Partially Paid</option>
                                            <option value="Pending">Pending</option>
                                            <option value="Cancelled">Cancelled</option>
                                        </>
                                    )}
                                    {activeTab === 'refunds' && (
                                        <>
                                            <option value="Refund Pending">Refund Pending</option>
                                            <option value="Refund Approved">Refund Approved</option>
                                            <option value="Refund Rejected">Refund Rejected</option>
                                        </>
                                    )}
                                    {activeTab === 'insurance' && (
                                        <>
                                            <option value="Submitted">Submitted</option>
                                            <option value="Pending">Pending</option>
                                            <option value="Approved">Approved</option>
                                            <option value="Rejected">Rejected</option>
                                        </>
                                    )}
                                    {activeTab === 'reconciliation' && (
                                        <>
                                            <option value="Balanced">Balanced</option>
                                            <option value="Discrepancy">Discrepancy</option>
                                        </>
                                    )}
                                </select>
                            </div>
                        )}
                        <div className="filter-item">
                            <label>Global Search</label>
                            <input type="text" placeholder="Search keywords..." value={search} onChange={(e) => setSearch(e.target.value)} />
                        </div>
                    </div>
                    <div className="filters-actions">
                        <button className="reset-filter-btn" onClick={resetFilters}>Reset Filters</button>
                    </div>
                </div>
            )}

            {/* Section tabs */}
            <div className="audit-tabs-wrapper">
                {showScrollBtns && (
                    <div className="scroll-btn-container left">
                        <button className="scroll-btn" onClick={() => scrollTabs('left')} title="Scroll Left">
                            ⟨
                        </button>
                    </div>
                )}
                <div className="audit-tabs" ref={tabsRef}>
                    {tabConfig.map(tab => (
                        <button
                            key={tab.key}
                            className={`audit-tab-btn ${activeTab === tab.key ? 'active' : ''}`}
                            onClick={() => navigate(tab.route)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                {showScrollBtns && (
                    <div className="scroll-btn-container right">
                        <button className="scroll-btn" onClick={() => scrollTabs('right')} title="Scroll Right">
                            ⟩
                        </button>
                    </div>
                )}
            </div>

            {/* Loaders & content wrapper */}
            {error && <div className="error-message">⚠️ {error}</div>}

            {loading ? (
                <div className="loading-message">⏳ Processing compliance logs...</div>
            ) : (
                <div className="audit-table-card">
                    {activeTab === 'overview' && (
                        <div>
                            <h3>Recent Financial Operations Alert</h3>
                            {recentLogs.length === 0 ? (
                                <div className="empty-state">No recent activities found.</div>
                            ) : (
                                <table className="finance-table">
                                    <thead>
                                        <tr>
                                            <th>Timestamp</th>
                                            <th>Responsible Staff</th>
                                            <th>Logged Action</th>
                                            <th>Patient Context</th>
                                            <th>Operation Description</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentLogs.map((log) => (
                                            <tr key={log._id}>
                                                <td>{formatDate(log.createdAt)}</td>
                                                <td className="bold">{log.performedByName}</td>
                                                <td>
                                                    <span className={`action-badge ${getActionBadgeClass(log.action)}`}>
                                                        {log.action}
                                                    </span>
                                                </td>
                                                <td className="bold">{log.patientName}</td>
                                                <td>{log.details || 'N/A'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {activeTab === 'invoices' && (
                        <div>
                            <h3>Logged Invoices Activity Logs</h3>
                            {logs.length === 0 ? (
                                <div className="empty-state">No invoice entries match filters.</div>
                            ) : (
                                <table className="finance-table">
                                    <thead>
                                        <tr>
                                            <th>Invoice Number</th>
                                            <th>Patient</th>
                                            <th>User</th>
                                            <th>Timestamp</th>
                                            <th>Action Type</th>
                                            <th className="text-right">Total Value</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((log, idx) => (
                                            <tr key={idx}>
                                                <td className="bold">{log.invoiceNumber}</td>
                                                <td>{log.patientName}</td>
                                                <td>{log.user}</td>
                                                <td>{formatDate(log.timestamp)}</td>
                                                <td>
                                                    <span className={`action-badge ${getActionBadgeClass(log.action)}`}>
                                                        {log.action}
                                                    </span>
                                                </td>
                                                <td className="text-right bold">{formatCurrency(log.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {activeTab === 'payments' && (
                        <div>
                            <h3>Received Payments Audit Logs</h3>
                            {logs.length === 0 ? (
                                <div className="empty-state">No payment items match filters.</div>
                            ) : (
                                <table className="finance-table">
                                    <thead>
                                        <tr>
                                            <th>Invoice Reference</th>
                                            <th>Patient Name</th>
                                            <th>Payment Method</th>
                                            <th>User</th>
                                            <th>Collected Time</th>
                                            <th className="text-right">Amount Received</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((log, idx) => (
                                            <tr key={idx}>
                                                <td className="bold">{log.invoiceNumber}</td>
                                                <td>{log.patientName}</td>
                                                <td className="bold">{log.paymentMethod}</td>
                                                <td>{log.user}</td>
                                                <td>{formatDate(log.timestamp)}</td>
                                                <td className="text-right bold highlight-green" style={{ color: '#059669' }}>
                                                    {formatCurrency(log.amount)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {activeTab === 'refunds' && (
                        <div>
                            <h3>Refund Workflow Audit Logs</h3>
                            {logs.length === 0 ? (
                                <div className="empty-state">No refund records match filters.</div>
                            ) : (
                                <table className="finance-table">
                                    <thead>
                                        <tr>
                                            <th>Invoice Reference</th>
                                            <th>Patient Name</th>
                                            <th>Requested By</th>
                                            <th>Approved By</th>
                                            <th>Reason</th>
                                            <th>Lifecycle Status</th>
                                            <th className="text-right">Refund Value</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((log, idx) => (
                                            <tr key={idx}>
                                                <td className="bold">{log.invoiceNumber}</td>
                                                <td>{log.patientName}</td>
                                                <td>{log.requestedBy}</td>
                                                <td>{log.approvedBy}</td>
                                                <td>{log.reason || 'N/A'}</td>
                                                <td>
                                                    <span className={`action-badge ${getActionBadgeClass(log.status)}`}>
                                                        {log.status}
                                                    </span>
                                                </td>
                                                <td className="text-right bold highlight-red" style={{ color: '#dc2626' }}>
                                                    {formatCurrency(log.amount)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {activeTab === 'expenses' && (
                        <div>
                            <h3>Outflow Expenses Logs</h3>
                            {logs.length === 0 ? (
                                <div className="empty-state">No expenses match filters.</div>
                            ) : (
                                <table className="finance-table">
                                    <thead>
                                        <tr>
                                            <th>Category</th>
                                            <th>Responsible Staff</th>
                                            <th>Date</th>
                                            <th>Description</th>
                                            <th className="text-right">Outflow Value</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((log, idx) => (
                                            <tr key={idx}>
                                                <td className="bold">{log.category}</td>
                                                <td>{log.user}</td>
                                                <td>{formatDate(log.timestamp)}</td>
                                                <td>{log.notes || 'N/A'}</td>
                                                <td className="text-right bold highlight-red" style={{ color: '#dc2626' }}>
                                                    {formatCurrency(log.amount)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {activeTab === 'insurance' && (
                        <div>
                            <h3>Insurance Claim Pre-Auth Logs</h3>
                            {logs.length === 0 ? (
                                <div className="empty-state">No claim logs match filters.</div>
                            ) : (
                                <table className="finance-table">
                                    <thead>
                                        <tr>
                                            <th>Claim Number</th>
                                            <th>Beneficiary Patient</th>
                                            <th>Created Date</th>
                                            <th>Claim Status</th>
                                            <th className="text-right">Submitted Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((log, idx) => (
                                            <tr key={idx}>
                                                <td className="bold">{log.claimNumber}</td>
                                                <td>{log.user}</td>
                                                <td>{formatDate(log.timestamp)}</td>
                                                <td>
                                                    <span className={`action-badge ${getActionBadgeClass(log.status)}`}>
                                                        {log.status}
                                                    </span>
                                                </td>
                                                <td className="text-right bold">{formatCurrency(log.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {activeTab === 'reconciliation' && (
                        <div>
                            <h3>Drawer Reconciliation Sheets Audit</h3>
                            {logs.length === 0 ? (
                                <div className="empty-state">No reconciliations match filters.</div>
                            ) : (
                                <table className="finance-table">
                                    <thead>
                                        <tr>
                                            <th>Audit Date</th>
                                            <th>Expected Amount</th>
                                            <th>Actual Count</th>
                                            <th>Discrepancy (Diff)</th>
                                            <th>Reconciled By</th>
                                            <th>Audit Result</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((log, idx) => (
                                            <tr key={idx}>
                                                <td className="bold">{new Date(log.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                                                <td>{formatCurrency(log.expectedAmount)}</td>
                                                <td>{formatCurrency(log.actualAmount)}</td>
                                                <td className={`bold ${log.difference !== 0 ? 'highlight-red' : ''}`} style={{ color: log.difference !== 0 ? '#dc2626' : 'inherit' }}>
                                                    {formatCurrency(log.difference)}
                                                </td>
                                                <td>{log.verifiedBy}</td>
                                                <td>
                                                    <span className={`action-badge ${getActionBadgeClass(log.status)}`}>
                                                        {log.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {activeTab === 'deleted' && (
                        <div>
                            <h3>Archived Deleted Financial Documents</h3>
                            {logs.length === 0 ? (
                                <div className="empty-state">No deleted documents cataloged.</div>
                            ) : (
                                <table className="finance-table">
                                    <thead>
                                        <tr>
                                            <th>Record Type</th>
                                            <th>Original Document ID</th>
                                            <th>Deleted By</th>
                                            <th>Deletion Time</th>
                                            <th>Reason Details</th>
                                            <th className="text-right">Original Value</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((log, idx) => (
                                            <tr key={idx}>
                                                <td>
                                                    <span className="action-badge deleted">{log.recordType}</span>
                                                </td>
                                                <td className="bold">{log.originalId}</td>
                                                <td>{log.deletedBy}</td>
                                                <td>{formatDate(log.deletedAt)}</td>
                                                <td>{log.reason || 'N/A'}</td>
                                                <td className="text-right bold">{formatCurrency(log.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {activeTab === 'high-risk' && (
                        <div>
                            <h3>System-Flagged High Risk Transactions</h3>
                            {logs.length === 0 ? (
                                <div className="empty-state">No high-risk triggers detected.</div>
                            ) : (
                                <table className="finance-table">
                                    <thead>
                                        <tr>
                                            <th>Security Alert Type</th>
                                            <th>Triggered Time</th>
                                            <th>Responsible Staff</th>
                                            <th className="text-right">Transaction Value</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((log, idx) => (
                                            <tr key={idx}>
                                                <td className="bold highlight-red" style={{ color: '#dc2626' }}>
                                                    🚨 {log.alertType}
                                                </td>
                                                <td>{formatDate(log.date)}</td>
                                                <td>{log.user}</td>
                                                <td className="text-right bold highlight-red" style={{ color: '#dc2626' }}>
                                                    {formatCurrency(log.amount)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {activeTab === 'user-activity' && (
                        <div>
                            <h3>Compliance User Activity Logs</h3>
                            {logs.length === 0 ? (
                                <div className="empty-state">No user activity matches filters.</div>
                            ) : (
                                <table className="finance-table">
                                    <thead>
                                        <tr>
                                            <th>Timestamp</th>
                                            <th>Accountant User</th>
                                            <th>compliance Activity Type</th>
                                            <th>IP Address</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((log, idx) => (
                                            <tr key={idx}>
                                                <td>{formatDate(log.timestamp)}</td>
                                                <td className="bold">{log.user}</td>
                                                <td>
                                                    <span className="action-badge risk">{log.activity}</span>
                                                </td>
                                                <td>{log.ipAddress}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default FinancialAuditCenter;
