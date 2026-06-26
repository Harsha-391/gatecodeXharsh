import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { financeAPI } from '../../utils/api';
import './TransactionLogs.css';

const TransactionLogs = () => {
    const navigate = useNavigate();

    const [data, setData] = useState({ largeTransactions: [], deletedInvoices: [], refundLogs: [], adjustments: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('large'); // 'large', 'deleted', 'refunds', 'adjustments'

    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const role = user?.role ? user.role.toLowerCase() : '';
        const permissions = user?.permissions || [];
        const hasAccess = ['accountant', 'centraladmin', 'superadmin', 'hospitaladmin'].includes(role) || permissions.includes('finance_view');

        if (!hasAccess) {
            navigate('/dashboard');
        } else {
            fetchLogs();
        }
    }, [navigate]);

    const fetchLogs = async () => {
        try {
            setLoading(true);
            setError('');
            const res = await financeAPI.getAuditSummary();
            if (res.success) {
                setData(res);
            } else {
                setError(res.message || 'Failed to load transaction audit logs');
            }
        } catch (err) {
            console.error(err);
            setError('Error loading financial audit summary');
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

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        const d = new Date(dateString);
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="transaction-logs-page">
            <header className="page-header">
                <div>
                    <h1>Financial Transaction & Audit Logs</h1>
                    <p>Internal auditor oversight of system modifications, refund disbursements, high-value payments, and deleted invoices</p>
                </div>
            </header>

            {error && <div className="error-message">⚠️ {error}</div>}

            {loading ? (
                <div className="loading-message">⏳ Retrieving financial audit trail...</div>
            ) : (
                <div className="content-container">
                    {/* Stats summary cards */}
                    <div className="audit-stats-grid">
                        <div className="stat-card large-tx" onClick={() => setActiveTab('large')}>
                            <span className="icon">💳</span>
                            <div className="info">
                                <h3>Large Transactions</h3>
                                <p className="value">{data.largeTransactions.length}</p>
                                <span className="desc">Payments &ge; ₹10,000</span>
                            </div>
                        </div>
                        <div className="stat-card cancelled-inv" onClick={() => setActiveTab('deleted')}>
                            <span className="icon">🗑️</span>
                            <div className="info">
                                <h3>Cancelled Invoices</h3>
                                <p className="value">{data.deletedInvoices.length}</p>
                                <span className="desc">Total deleted invoice bills</span>
                            </div>
                        </div>
                        <div className="stat-card refunds-log" onClick={() => setActiveTab('refunds')}>
                            <span className="icon">🔄</span>
                            <div className="info">
                                <h3>Refunds Issued</h3>
                                <p className="value">{data.refundLogs.length}</p>
                                <span className="desc">Refund approvals requested</span>
                            </div>
                        </div>
                        <div className="stat-card adjustment-history" onClick={() => setActiveTab('adjustments')}>
                            <span className="icon">⚙️</span>
                            <div className="info">
                                <h3>System Adjustments</h3>
                                <p className="value">{data.adjustments.length}</p>
                                <span className="desc">Activity modifications logged</span>
                            </div>
                        </div>
                    </div>

                    {/* Tab Navigation */}
                    <div className="tab-navigation">
                        <button 
                            className={`tab-btn ${activeTab === 'large' ? 'active' : ''}`}
                            onClick={() => setActiveTab('large')}
                        >
                            Large Transaction Monitoring
                        </button>
                        <button 
                            className={`tab-btn ${activeTab === 'deleted' ? 'active' : ''}`}
                            onClick={() => setActiveTab('deleted')}
                        >
                            Cancelled / Deleted Invoices
                        </button>
                        <button 
                            className={`tab-btn ${activeTab === 'refunds' ? 'active' : ''}`}
                            onClick={() => setActiveTab('refunds')}
                        >
                            Refund Audit Trail
                        </button>
                        <button 
                            className={`tab-btn ${activeTab === 'adjustments' ? 'active' : ''}`}
                            onClick={() => setActiveTab('adjustments')}
                        >
                            Billing Adjustments & Modifications
                        </button>
                    </div>

                    {/* Content Table wrapper */}
                    <div className="table-wrapper card-box">
                        {activeTab === 'large' && (
                            <>
                                <h3>High-Value Transactions Alert (Values &ge; ₹10,000)</h3>
                                {data.largeTransactions.length === 0 ? (
                                    <div className="empty-state">No large transactions recorded recently.</div>
                                ) : (
                                    <table className="finance-table">
                                        <thead>
                                            <tr>
                                                <th>Receipt / Invoice</th>
                                                <th>Patient Name</th>
                                                <th>Collected By</th>
                                                <th>Payment Method</th>
                                                <th>Date & Time</th>
                                                <th className="text-right">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.largeTransactions.map((tx, idx) => (
                                                <tr key={idx}>
                                                    <td>
                                                        <span className="bold block-span">{tx.receiptNumber || 'N/A'}</span>
                                                        <span className="sub-text">Invoice: {tx.invoiceNumber}</span>
                                                    </td>
                                                    <td className="bold">{tx.patientName}</td>
                                                    <td>{tx.collectedByName || 'System'}</td>
                                                    <td className="bold">{tx.method}</td>
                                                    <td>{formatDate(tx.date)}</td>
                                                    <td className="text-right bold highlight-green">{formatCurrency(tx.amount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </>
                        )}

                        {activeTab === 'deleted' && (
                            <>
                                <h3>Cancelled / Invalidated Invoices</h3>
                                {data.deletedInvoices.length === 0 ? (
                                    <div className="empty-state">No cancelled invoices found.</div>
                                ) : (
                                    <table className="finance-table">
                                        <thead>
                                            <tr>
                                                <th>Invoice Number</th>
                                                <th>Patient Name</th>
                                                <th>Reason / Items</th>
                                                <th>Cancelled Date</th>
                                                <th className="text-right">Invoice Value</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.deletedInvoices.map((inv) => (
                                                <tr key={inv._id}>
                                                    <td className="bold">{inv.invoiceNumber}</td>
                                                    <td>{inv.patientName}</td>
                                                    <td>
                                                        <span className="block-span sub-text" style={{ fontSize: '0.82rem' }}>
                                                            {inv.items.map(i => `${i.name} (${i.itemType})`).join(', ')}
                                                        </span>
                                                    </td>
                                                    <td>{formatDate(inv.updatedAt)}</td>
                                                    <td className="text-right bold highlight-red">{formatCurrency(inv.totalAmount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </>
                        )}

                        {activeTab === 'refunds' && (
                            <>
                                <h3>Refund Approvals Audit</h3>
                                {data.refundLogs.length === 0 ? (
                                    <div className="empty-state">No refund logs registered.</div>
                                ) : (
                                    <table className="finance-table">
                                        <thead>
                                            <tr>
                                                <th>Invoice Reference</th>
                                                <th>Patient Name</th>
                                                <th>Requested Date</th>
                                                <th>Status</th>
                                                <th>Approval Notes</th>
                                                <th className="text-right">Refund Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.refundLogs.map((log) => (
                                                <tr key={log._id}>
                                                    <td className="bold">{log.invoiceNumber}</td>
                                                    <td>{log.patientName}</td>
                                                    <td>{formatDate(log.createdAt)}</td>
                                                    <td>
                                                        <span className={`status-pill ${log.status.toLowerCase().replace(' ', '-')}`}>
                                                            {log.status}
                                                        </span>
                                                    </td>
                                                    <td>{log.notes || 'N/A'}</td>
                                                    <td className="text-right bold highlight-red">{formatCurrency(log.amount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </>
                        )}

                        {activeTab === 'adjustments' && (
                            <>
                                <h3>System Activity Logs</h3>
                                {data.adjustments.length === 0 ? (
                                    <div className="empty-state">No adjustments activities found.</div>
                                ) : (
                                    <table className="finance-table">
                                        <thead>
                                            <tr>
                                                <th>Log Date</th>
                                                <th>Action Executed</th>
                                                <th>Responsible Staff</th>
                                                <th>Details / Summary</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.adjustments.map((adj) => (
                                                <tr key={adj._id}>
                                                    <td>{formatDate(adj.createdAt)}</td>
                                                    <td>
                                                        <span className={`action-pill ${adj.action.toLowerCase().replace(' ', '-')}`}>
                                                            {adj.action}
                                                        </span>
                                                    </td>
                                                    <td className="bold">{adj.userName || adj.userEmail || 'System'}</td>
                                                    <td>{adj.details || 'N/A'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TransactionLogs;
