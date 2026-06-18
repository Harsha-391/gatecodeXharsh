import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { financeAPI } from '../../utils/api';
import './ProfitLoss.css';

const ProfitLoss = () => {
    const navigate = useNavigate();

    const [data, setData] = useState({ totalRevenue: 0, totalExpenses: 0, netProfit: 0, monthlyTrend: [], departmentProfitability: {} });
    const [timeframe, setTimeframe] = useState('monthly'); // 'weekly', 'monthly', 'half-year', 'yearly'
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const role = user?.role ? user.role.toLowerCase() : '';
        const permissions = user?.permissions || [];
        const hasAccess = ['accountant', 'centraladmin', 'superadmin', 'hospitaladmin'].includes(role) || permissions.includes('finance_view');

        if (!hasAccess) {
            navigate('/dashboard');
        } else {
            fetchProfitLoss(timeframe);
        }
    }, [navigate, timeframe]);

    const fetchProfitLoss = async (selectedTimeframe) => {
        try {
            setLoading(true);
            setError('');
            const res = await financeAPI.getProfitLoss(selectedTimeframe);
            if (res.success) {
                setData(res);
            } else {
                setError(res.message || 'Failed to load Profit & Loss statements');
            }
        } catch (err) {
            console.error(err);
            setError('Error loading Profit & Loss ledger');
        } finally {
            setLoading(false);
        }
    };

    const fmt = (amount) => new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0
    }).format(amount || 0);

    const chartTitle = {
        weekly:     'Daily Profit Trend (Last 7 Days)',
        monthly:    'Weekly Profit Trend (Last 4 Weeks)',
        'half-year':'Monthly Profit Trend (Last 6 Months)',
        yearly:     'Monthly Profit Trend (Last 12 Months)',
    };

    const trend = data.monthlyTrend || [];
    const maxVal = Math.max(...trend.map(x => Math.abs(x.profit)), 1);
    const hasAnyTrendData = trend.some(t => t.profit !== 0);

    const deptEntries = Object.entries(data.departmentProfitability || {});
    const maxDeptRevenue = Math.max(...deptEntries.map(([, v]) => v.revenue), 1);

    const isNetPositive = (data.netProfit || 0) >= 0;

    return (
        <div className="profit-loss-page">

            {/* ── Header ── */}
            <header className="pl-header">
                <div className="pl-header-left">
                    <h1>Profit &amp; Loss Statement</h1>
                    <p>Real-time calculation of revenue streams versus operating expenses and gross profit margins</p>
                </div>
                <select
                    className="pl-timeframe-select"
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value)}
                >
                    <option value="weekly">Weekly (Last 7 Days)</option>
                    <option value="monthly">Monthly (Last 30 Days)</option>
                    <option value="half-year">Half-Yearly (Last 6 Months)</option>
                    <option value="yearly">Yearly (Last 12 Months)</option>
                </select>
            </header>

            {error && (
                <div className="pl-error">⚠️ {error}</div>
            )}

            {loading ? (
                <div className="pl-loading">
                    <div className="pl-loading-spinner" />
                    <p>Calculating financial margins...</p>
                </div>
            ) : (
                <>
                    {/* ── KPI Row ── */}
                    <div className="pl-kpi-row">
                        <div className="pl-kpi-card revenue">
                            <span className="pl-kpi-label">Total Revenue</span>
                            <span className="pl-kpi-value">{fmt(data.totalRevenue)}</span>
                            <span className="pl-kpi-sub">All collections &amp; payments</span>
                        </div>
                        <div className="pl-operator">−</div>
                        <div className="pl-kpi-card expenses">
                            <span className="pl-kpi-label">Total Expenses</span>
                            <span className="pl-kpi-value">{fmt(data.totalExpenses)}</span>
                            <span className="pl-kpi-sub">Operational &amp; payroll costs</span>
                        </div>
                        <div className="pl-operator">=</div>
                        <div className={`pl-kpi-card ${isNetPositive ? 'profit-positive' : 'profit-negative'}`}>
                            <span className="pl-kpi-label">Net Profit</span>
                            <span className="pl-kpi-value">{fmt(data.netProfit)}</span>
                            <span className="pl-kpi-sub">
                                {isNetPositive ? '🟢 Hospital surplus retained' : '🔴 Operating at a loss'}
                            </span>
                        </div>
                    </div>

                    {/* ── Charts Grid ── */}
                    <div className="pl-charts-grid">

                        {/* Bar Chart */}
                        <div className="pl-card">
                            <div className="pl-card-header">
                                <h3 className="pl-card-title">
                                    📊 {chartTitle[timeframe]}
                                </h3>
                                <span className="pl-card-badge">
                                    {trend.length} periods
                                </span>
                            </div>

                            {!hasAnyTrendData ? (
                                <div className="pl-chart-empty">
                                    <div className="pl-chart-empty-icon">📉</div>
                                    <p>No financial data recorded<br />for this period yet.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="pl-bar-chart">
                                        {trend.map((m, idx) => {
                                            const pct = (Math.abs(m.profit) / maxVal) * 100;
                                            const isPos = m.profit >= 0;
                                            const isZero = m.profit === 0;
                                            return (
                                                <div className="pl-bar-item" key={idx}>
                                                    <div className="pl-bar-track">
                                                        <div
                                                            className={`pl-bar-fill ${isZero ? 'zero' : isPos ? 'positive' : 'negative'}`}
                                                            style={{ height: isZero ? '4px' : `${pct}%` }}
                                                        >
                                                            <span className="pl-bar-value">{fmt(m.profit)}</span>
                                                        </div>
                                                    </div>
                                                    <span className="pl-bar-label">{m.label}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="pl-chart-summary">
                                        <div className="pl-summary-item">
                                            <span className="pl-summary-dot positive" />
                                            Profitable period
                                        </div>
                                        <div className="pl-summary-item">
                                            <span className="pl-summary-dot negative" />
                                            Loss period
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Department Breakdown */}
                        <div className="pl-card">
                            <div className="pl-card-header">
                                <h3 className="pl-card-title">
                                    🏥 Department Profitability
                                </h3>
                                {deptEntries.length > 0 && (
                                    <span className="pl-card-badge">{deptEntries.length} depts</span>
                                )}
                            </div>

                            {deptEntries.length === 0 ? (
                                <div className="pl-dept-empty">
                                    <p>No department data available for this period.</p>
                                </div>
                            ) : (
                                <div className="pl-dept-list">
                                    {deptEntries.map(([dept, vals]) => {
                                        const margin = vals.revenue > 0
                                            ? ((vals.profit / vals.revenue) * 100).toFixed(1)
                                            : 0;
                                        const barPct = vals.revenue > 0
                                            ? Math.min((vals.revenue / maxDeptRevenue) * 100, 100)
                                            : 0;
                                        const marginClass = vals.profit > 0 ? 'pos' : vals.profit < 0 ? 'neg' : 'zero';

                                        return (
                                            <div className="pl-dept-row" key={dept}>
                                                <div className="pl-dept-row-header">
                                                    <span className="pl-dept-name">{dept}</span>
                                                    <span className={`pl-dept-margin ${marginClass}`}>
                                                        Margin: {margin}%
                                                    </span>
                                                </div>
                                                <div className="pl-dept-stats">
                                                    <div className="pl-stat-cell">
                                                        <span className="pl-stat-label">Revenue</span>
                                                        <span className="pl-stat-value green">{fmt(vals.revenue)}</span>
                                                    </div>
                                                    <div className="pl-stat-cell">
                                                        <span className="pl-stat-label">Expenses</span>
                                                        <span className="pl-stat-value red">{fmt(vals.expenses)}</span>
                                                    </div>
                                                    <div className="pl-stat-cell">
                                                        <span className="pl-stat-label">Net Profit</span>
                                                        <span className={`pl-stat-value ${vals.profit >= 0 ? 'blue' : 'red'}`}>
                                                            {fmt(vals.profit)}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="pl-dept-bar">
                                                    <div
                                                        className={`pl-dept-bar-fill ${vals.profit < 0 ? 'negative' : ''}`}
                                                        style={{ width: `${barPct}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                    </div>
                </>
            )}
        </div>
    );
};

export default ProfitLoss;
