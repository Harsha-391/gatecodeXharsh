import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { financeAPI } from '../../utils/api';
import './OutstandingPayments.css';

const OutstandingPayments = () => {
    const navigate = useNavigate();
    
    const [data, setData] = useState({ pendingOPD: [], pendingIPD: [], overdueAccounts: [], creditPatients: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('opd'); // 'opd', 'ipd', 'credit', 'overdue'

    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const role = user?.role ? user.role.toLowerCase() : '';
        const permissions = user?.permissions || [];
        const hasAccess = ['accountant', 'centraladmin', 'superadmin', 'hospitaladmin'].includes(role) || permissions.includes('finance_view');

        if (!hasAccess) {
            navigate('/dashboard');
        } else {
            fetchOutstanding();
        }
    }, [navigate]);

    const fetchOutstanding = async () => {
        try {
            setLoading(true);
            setError('');
            const res = await financeAPI.getOutstandingPayments();
            if (res.success) {
                setData(res);
            } else {
                setError(res.message || 'Failed to load outstanding payments');
            }
        } catch (err) {
            console.error(err);
            setError('Error fetching outstanding payment records');
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
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    return (
        <div className="outstanding-payments-page">
            <header className="page-header">
                <div>
                    <h1>Outstanding Payments</h1>
                    <p>Read-only monitoring of pending outpatient, inpatient, credit, and overdue patient accounts</p>
                </div>
                <div className="header-badge warning">
                    <span>⚠️ Read-Only Mode</span>
                </div>
            </header>

            {error && <div className="error-message">⚠️ {error}</div>}

            {loading ? (
                <div className="loading-message">⏳ Loading outstanding accounts ledger...</div>
            ) : (
                <div className="content-container">
                    <div className="stats-summary-grid">
                        <div className="summary-card opd">
                            <h3>OPD Outstanding</h3>
                            <p className="value">{formatCurrency(data.pendingOPD.reduce((s, x) => s + (x.outstandingAmount || 0), 0))}</p>
                            <span className="count">{data.pendingOPD.length} Bills Pending</span>
                        </div>
                        <div className="summary-card ipd">
                            <h3>IPD Outstanding</h3>
                            <p className="value">{formatCurrency(data.pendingIPD.reduce((s, x) => s + (x.outstandingAmount || 0), 0))}</p>
                            <span className="count">{data.pendingIPD.length} Bills Pending</span>
                        </div>
                        <div className="summary-card overdue">
                            <h3>Overdue (&gt;30 Days)</h3>
                            <p className="value">{formatCurrency(data.overdueAccounts.reduce((s, x) => s + (x.outstandingAmount || 0), 0))}</p>
                            <span className="count">{data.overdueAccounts.length} Overdue Accounts</span>
                        </div>
                        <div className="summary-card credit">
                            <h3>Total Outstanding</h3>
                            <p className="value">
                                {formatCurrency(
                                    [...data.pendingOPD, ...data.pendingIPD].reduce((acc, curr) => acc + (curr.outstandingAmount || 0), 0)
                                )}
                            </p>
                            <span className="count">Active Balance Sheet Dues</span>
                        </div>
                    </div>

                    <div className="tab-navigation">
                        <button 
                            className={`tab-btn ${activeTab === 'opd' ? 'active' : ''}`}
                            onClick={() => setActiveTab('opd')}
                        >
                            Outpatient (OPD) Dues ({data.pendingOPD.length})
                        </button>
                        <button 
                            className={`tab-btn ${activeTab === 'ipd' ? 'active' : ''}`}
                            onClick={() => setActiveTab('ipd')}
                        >
                            Inpatient (IPD) Dues ({data.pendingIPD.length})
                        </button>
                        <button 
                            className={`tab-btn ${activeTab === 'credit' ? 'active' : ''}`}
                            onClick={() => setActiveTab('credit')}
                        >
                            Credit Patients ({data.creditPatients.length})
                        </button>
                        <button 
                            className={`tab-btn ${activeTab === 'overdue' ? 'active' : ''}`}
                            onClick={() => setActiveTab('overdue')}
                        >
                            Overdue Accounts ({data.overdueAccounts.length})
                        </button>
                    </div>

                    <div className="table-wrapper card-box">
                        {activeTab === 'opd' && (
                            <>
                                <h3>Pending OPD Invoices</h3>
                                {data.pendingOPD.length === 0 ? (
                                    <div className="empty-state">No pending OPD invoices found.</div>
                                ) : (
                                    <table className="finance-table">
                                        <thead>
                                            <tr>
                                                <th>Invoice No.</th>
                                                <th>Patient Name</th>
                                                <th>Invoice Date</th>
                                                <th>Total Amount</th>
                                                <th>Outstanding Amount</th>
                                                <th>Payment Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.pendingOPD.map((inv) => (
                                                <tr key={inv._id}>
                                                    <td className="bold">{inv.invoiceNumber}</td>
                                                    <td>{inv.patientName}</td>
                                                    <td>{formatDate(inv.createdAt)}</td>
                                                    <td>{formatCurrency(inv.totalAmount)}</td>
                                                    <td className="highlight-red">{formatCurrency(inv.outstandingAmount)}</td>
                                                    <td>
                                                        <span className={`badge ${inv.paymentStatus.toLowerCase().replace(' ', '-')}`}>
                                                            {inv.paymentStatus}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </>
                        )}

                        {activeTab === 'ipd' && (
                            <>
                                <h3>Pending IPD Invoices</h3>
                                {data.pendingIPD.length === 0 ? (
                                    <div className="empty-state">No pending IPD invoices found.</div>
                                ) : (
                                    <table className="finance-table">
                                        <thead>
                                            <tr>
                                                <th>Invoice No.</th>
                                                <th>Patient Name</th>
                                                <th>Invoice Date</th>
                                                <th>Total Amount</th>
                                                <th>Outstanding Amount</th>
                                                <th>Payment Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.pendingIPD.map((inv) => (
                                                <tr key={inv._id}>
                                                    <td className="bold">{inv.invoiceNumber}</td>
                                                    <td>{inv.patientName}</td>
                                                    <td>{formatDate(inv.createdAt)}</td>
                                                    <td>{formatCurrency(inv.totalAmount)}</td>
                                                    <td className="highlight-red">{formatCurrency(inv.outstandingAmount)}</td>
                                                    <td>
                                                        <span className={`badge ${inv.paymentStatus.toLowerCase().replace(' ', '-')}`}>
                                                            {inv.paymentStatus}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </>
                        )}

                        {activeTab === 'credit' && (
                            <>
                                <h3>Patient Credit Aging & Summaries</h3>
                                {data.creditPatients.length === 0 ? (
                                    <div className="empty-state">No credit patient accounts found.</div>
                                ) : (
                                    <table className="finance-table">
                                        <thead>
                                            <tr>
                                                <th>Patient Name</th>
                                                <th>Pending Invoices Count</th>
                                                <th>Total Outstanding Credit</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.creditPatients.map((patient, idx) => (
                                                <tr key={idx}>
                                                    <td className="bold">{patient.patientName}</td>
                                                    <td>{patient.invoicesCount}</td>
                                                    <td className="highlight-red bold">{formatCurrency(patient.outstandingAmount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </>
                        )}

                        {activeTab === 'overdue' && (
                            <>
                                <h3>Overdue Accounts (&gt;30 Days Aging)</h3>
                                {data.overdueAccounts.length === 0 ? (
                                    <div className="empty-state">No overdue invoices older than 30 days.</div>
                                ) : (
                                    <table className="finance-table">
                                        <thead>
                                            <tr>
                                                <th>Invoice No.</th>
                                                <th>Patient Name</th>
                                                <th>Invoice Date</th>
                                                <th>Overdue Days</th>
                                                <th>Total Amount</th>
                                                <th>Outstanding Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.overdueAccounts.map((inv) => {
                                                const ageDays = Math.floor((new Date() - new Date(inv.createdAt)) / (1000 * 60 * 60 * 24));
                                                return (
                                                    <tr key={inv._id}>
                                                        <td className="bold">{inv.invoiceNumber}</td>
                                                        <td>{inv.patientName}</td>
                                                        <td>{formatDate(inv.createdAt)}</td>
                                                        <td className="bold text-red">{ageDays} Days</td>
                                                        <td>{formatCurrency(inv.totalAmount)}</td>
                                                        <td className="highlight-red bold">{formatCurrency(inv.outstandingAmount)}</td>
                                                    </tr>
                                                );
                                            })}
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

export default OutstandingPayments;
