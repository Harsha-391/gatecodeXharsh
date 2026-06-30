import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { financeAPI, authAPI } from '../../utils/api';
import './AccountantDashboard.css';

const AccountantDashboard = () => {
    const navigate = useNavigate();
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

    const [kpis, setKpis] = useState(null);
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        // Validate access
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const role = user?.role ? user.role.toLowerCase() : '';
        const permissions = user?.permissions || [];
        const hasAccess = ['accountant', 'centraladmin', 'superadmin', 'hospitaladmin'].includes(role) || permissions.includes('finance_view');

        if (!hasAccess) {
            navigate('/dashboard');
        } else {
            fetchFinanceData();
        }
    }, [navigate]);

    const fetchFinanceData = async () => {
        try {
            setLoading(true);
            setError('');
            
            const [kpiRes, analyticsRes] = await Promise.all([
                financeAPI.getKPIs(),
                financeAPI.getRevenueAnalytics()
            ]);

            if (kpiRes.success) {
                setKpis(kpiRes.kpis);
            }
            if (analyticsRes.success) {
                setAnalytics(analyticsRes);
            }
        } catch (err) {
            console.error(err);
            setError('Error fetching finance dashboard statistics');
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

    const handleLogout = async () => {
        try {
            await authAPI.logout();
        } catch (err) {
            console.error('Logout error:', err);
        }
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        navigate('/login');
    };

    return (
        <div className="accountant-dashboard">
            <header className="acc-header">
                <div>
                    <h1>Finance & Accounting Hub</h1>
                    <p>Strategic oversight of hospital cashflows, revenues, and expenditures</p>
                </div>
                <div className="acc-user-info">
                    <span>👋 Welcome, {currentUser.name} (Accountant)</span>
                    <button className="logout-btn" onClick={handleLogout}>Logout</button>
                </div>
            </header>

            {error && <div className="error-message">⚠️ {error}</div>}

            {loading ? (
                <div className="loading-message">⏳ Loading secure financial data...</div>
            ) : (
                <>
                    {/* accountant kpis */}
                    {kpis && (
                        <>
                            <h2 className="section-title">📊 Strategic Accounting Metrics</h2>
                            <div className="acc-kpi-grid">
                                <div className="acc-kpi-card acc-kpi-green">
                                    <div className="acc-kpi-icon">💰</div>
                                    <div className="acc-kpi-value">{formatCurrency(kpis.todayRevenue)}</div>
                                    <div className="acc-kpi-label">Today's Revenue</div>
                                    <div className="acc-kpi-sub">Total payments collected today</div>
                                </div>
                                <div className="acc-kpi-card acc-kpi-blue">
                                    <div className="acc-kpi-icon">📅</div>
                                    <div className="acc-kpi-value">{formatCurrency(kpis.monthlyRevenue)}</div>
                                    <div className="acc-kpi-label">Monthly Revenue</div>
                                    <div className="acc-kpi-sub">Accumulated month-to-date collection</div>
                                </div>
                                <div className="acc-kpi-card acc-kpi-orange">
                                    <div className="acc-kpi-icon">🛑</div>
                                    <div className="acc-kpi-value">{formatCurrency(kpis.outstandingPayments)}</div>
                                    <div className="acc-kpi-label">Outstanding Payments</div>
                                    <div className="acc-kpi-sub">Dues waiting on invoice settlements</div>
                                </div>
                                <div className="acc-kpi-card acc-kpi-purple">
                                    <div className="acc-kpi-icon">🛡️</div>
                                    <div className="acc-kpi-value">{formatCurrency(kpis.pendingInsuranceClaims)}</div>
                                    <div className="acc-kpi-label">Pending Claims</div>
                                    <div className="acc-kpi-sub">Total amount in submitted claims</div>
                                </div>
                                <div className="acc-kpi-card acc-kpi-pink">
                                    <div className="acc-kpi-icon">💸</div>
                                    <div className="acc-kpi-value">{formatCurrency(kpis.totalExpenses)}</div>
                                    <div className="acc-kpi-label">Total Expenses</div>
                                    <div className="acc-kpi-sub">Total expenditure logged this month</div>
                                </div>
                                <div className="acc-kpi-card acc-kpi-teal">
                                    <div className="acc-kpi-icon">📈</div>
                                    <div className="acc-kpi-value">{formatCurrency(kpis.netProfit)}</div>
                                    <div className="acc-kpi-label">Net Profit</div>
                                    <div className="acc-kpi-sub">Monthly Revenue minus Expenses</div>
                                </div>
                                <div className="acc-kpi-card acc-kpi-magenta" style={{ background: 'linear-gradient(135deg, #be185d, #ec4899)' }}>
                                    <div className="acc-kpi-icon">🔄</div>
                                    <div className="acc-kpi-value">{kpis.pendingRefundApprovals}</div>
                                    <div className="acc-kpi-label">Pending Refunds</div>
                                    <div className="acc-kpi-sub">Claims awaiting manager approval</div>
                                </div>
                                <div className={`acc-kpi-card ${kpis.reconciliationStatus === 'Balanced' ? 'acc-kpi-green' : 'acc-kpi-orange'}`} style={{ background: kpis.reconciliationStatus === 'Balanced' ? 'linear-gradient(135deg, #15803d, #22c55e)' : 'linear-gradient(135deg, #b45309, #f97316)' }}>
                                    <div className="acc-kpi-icon">📝</div>
                                    <div className="acc-kpi-value" style={{ fontSize: '1.8rem', paddingTop: '8px' }}>{kpis.reconciliationStatus}</div>
                                    <div className="acc-kpi-label">Reconciliation Status</div>
                                    <div className="acc-kpi-sub">Reconciliation logs for today</div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* charts */}
                    {analytics && (
                        <div className="acc-analytics-layout">
                            <div className="analytics-box card-box">
                                <h3>📈 Monthly Revenue Trend</h3>
                                <div className="bar-chart-container">
                                    {analytics.monthlyTrend && analytics.monthlyTrend.map((m, idx) => {
                                        const max = Math.max(...analytics.monthlyTrend.map(x => x.amount)) || 1;
                                        const percentage = (m.amount / max) * 100;
                                        return (
                                            <div className="bar-chart-item" key={idx}>
                                                <div className="bar-wrapper">
                                                    <div className="bar-fill" style={{ height: `${percentage}%` }}>
                                                        <span className="bar-tooltip">{formatCurrency(m.amount)}</span>
                                                    </div>
                                                </div>
                                                <span className="bar-label">{m.label}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="analytics-box card-box">
                                <h3>🏥 Department revenue</h3>
                                <div className="department-breakdown">
                                    {Object.entries(analytics.departmentRevenue || {}).map(([dept, amount]) => {
                                        const total = Object.values(analytics.departmentRevenue).reduce((s, x) => s + x, 0) || 1;
                                        const pct = ((amount / total) * 100).toFixed(1);
                                        return (
                                            <div className="dept-breakdown-row" key={dept}>
                                                <div className="dept-info">
                                                    <span className="dept-name">{dept}</span>
                                                    <span className="dept-val">{formatCurrency(amount)} ({pct}%)</span>
                                                </div>
                                                <div className="dept-bar">
                                                    <div className="dept-bar-fill" style={{ width: `${pct}%`, background: dept === 'Consultation' ? '#3b82f6' : (dept === 'Laboratory' ? '#10b981' : (dept === 'Pharmacy' ? '#ec4899' : (dept === 'Insurance' ? '#8b5cf6' : '#f59e0b'))) }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default AccountantDashboard;
