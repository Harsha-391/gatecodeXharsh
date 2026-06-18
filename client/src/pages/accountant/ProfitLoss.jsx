import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { financeAPI } from '../../utils/api';
import './ProfitLoss.css';

const ProfitLoss = () => {
    const navigate = useNavigate();

    const [data, setData] = useState({ totalRevenue: 0, totalExpenses: 0, netProfit: 0, monthlyTrend: [], departmentProfitability: {} });
    const [timeframe, setTimeframe] = useState('half-year'); // 'weekly', 'monthly', 'half-year', 'yearly'
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

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0
        }).format(amount || 0);
    };

    return (
        <div className="profit-loss-page">
            <header className="page-header">
                <div>
                    <h1>Profit & Loss Statement</h1>
                    <p>Real-time calculation of revenue streams versus operating expenses and gross profit margins</p>
                </div>
                <div className="timeframe-selector">
                    <select 
                        value={timeframe} 
                        onChange={(e) => setTimeframe(e.target.value)}
                        style={{
                            padding: '10px 16px',
                            borderRadius: '10px',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            background: 'rgba(255, 255, 255, 0.1)',
                            color: 'white',
                            fontWeight: '600',
                            fontSize: '0.9rem',
                            outline: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="weekly" style={{ color: '#000' }}>Weekly (Last 7 Days)</option>
                        <option value="monthly" style={{ color: '#000' }}>Monthly (Last 30 Days)</option>
                        <option value="half-year" style={{ color: '#000' }}>Half-Yearly (Last 6 Months)</option>
                        <option value="yearly" style={{ color: '#000' }}>Yearly (Last 12 Months)</option>
                    </select>
                </div>
            </header>
 
            {error && <div className="error-message">⚠️ {error}</div>}
 
            {loading ? (
                <div className="loading-message">⏳ Calculating financial margins...</div>
            ) : (
                <div className="content-container">
                    {/* Visual Equation Layout */}
                    <div className="equation-container">
                        <div className="equation-card revenue">
                            <span className="label">Total Revenue</span>
                            <span className="value">{formatCurrency(data.totalRevenue)}</span>
                            <span className="sub">All collections & payments</span>
                        </div>
                        <div className="equation-operator">−</div>
                        <div className="equation-card expenses">
                            <span className="label">Total Expenses</span>
                            <span className="value">{formatCurrency(data.totalExpenses)}</span>
                            <span className="sub">Operational & payroll costs</span>
                        </div>
                        <div className="equation-operator">=</div>
                        <div className="equation-card profit">
                            <span className="label">Net Profit</span>
                            <span className="value">{formatCurrency(data.netProfit)}</span>
                            <span className="sub">Retained hospital surplus</span>
                        </div>
                    </div>
 
                    <div className="charts-grid">
                        {/* Monthly Profit Trend */}
                        <div className="trend-box card-box">
                            <h3>
                                📊 {timeframe === 'weekly' ? 'Daily Profit Trend (Last 7 Days)' : 
                                    timeframe === 'monthly' ? 'Weekly Profit Trend (Last 4 Weeks)' : 
                                    timeframe === 'half-year' ? 'Monthly Profit Trend (Last 6 Months)' : 
                                    'Monthly Profit Trend (Last 12 Months)'}
                            </h3>
                            <div className="bar-chart-container">
                                {data.monthlyTrend && data.monthlyTrend.map((m, idx) => {
                                    const maxVal = Math.max(...data.monthlyTrend.map(x => Math.abs(x.profit))) || 1;
                                    const percentage = (Math.abs(m.profit) / maxVal) * 100;
                                    const isPositive = m.profit >= 0;
                                    return (
                                        <div className="bar-chart-item" key={idx}>
                                            <div className="bar-wrapper">
                                                <div 
                                                    className={`bar-fill ${isPositive ? 'positive' : 'negative'}`} 
                                                    style={{ height: `${percentage}%` }}
                                                >
                                                    <span className="bar-tooltip">{formatCurrency(m.profit)}</span>
                                                </div>
                                            </div>
                                            <span className="bar-label">{m.label}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Departmental Profitability */}
                        <div className="dept-box card-box">
                            <h3>🏥 Department Profitability breakdown</h3>
                            <div className="dept-rows">
                                {Object.entries(data.departmentProfitability || {}).map(([dept, vals]) => {
                                    const margin = vals.revenue > 0 ? ((vals.profit / vals.revenue) * 100).toFixed(1) : 0;
                                    return (
                                        <div className="dept-profit-row" key={dept}>
                                            <div className="row-header">
                                                <span className="dept-name">{dept}</span>
                                                <span className={`dept-margin ${vals.profit >= 0 ? 'pos' : 'neg'}`}>
                                                    Margin: {margin}%
                                                </span>
                                            </div>
                                            <div className="row-details">
                                                <div className="detail-item">
                                                    <span>Rev:</span>
                                                    <span className="val-text green">{formatCurrency(vals.revenue)}</span>
                                                </div>
                                                <div className="detail-item">
                                                    <span>Exp:</span>
                                                    <span className="val-text red">{formatCurrency(vals.expenses)}</span>
                                                </div>
                                                <div className="detail-item">
                                                    <span>Profit:</span>
                                                    <span className={`val-text bold ${vals.profit >= 0 ? 'green' : 'red'}`}>
                                                        {formatCurrency(vals.profit)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProfitLoss;
