import React, { useState, useEffect } from 'react';
import { administratorAPI } from '../../utils/api';
import {
    FiTrendingUp, FiDollarSign, FiFileText, FiAlertCircle,
    FiActivity, FiCheckCircle, FiRefreshCw, FiPlus, FiTrash2,
    FiCalendar, FiList, FiBarChart2, FiPlusCircle, FiTag
} from 'react-icons/fi';
import './RevenueMonitoring.css';

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const RevenueMonitoring = () => {
    const [activeTab, setActiveTab] = useState('revenue');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [revenue, setRevenue] = useState(null);
    const [billing, setBilling] = useState(null);

    // Expenses States
    const [expenses, setExpenses] = useState([]);
    const [categories, setCategories] = useState([]);
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [newExpense, setNewExpense] = useState({ category: '', amount: '', date: new Date().toISOString().split('T')[0], description: '', paymentMethod: 'Cash', paymentStatus: 'Paid' });
    const [newCategory, setNewCategory] = useState({ name: '', description: '' });
    const [actionLoading, setActionLoading] = useState(false);
    const [categoryActionLoading, setCategoryActionLoading] = useState(false);
    const [expenseViewMode, setExpenseViewMode] = useState('individual'); // 'individual', 'weekly', 'monthly'

    // Profit & Loss States
    const [plData, setPlData] = useState(null);
    const [plPeriodType, setPlPeriodType] = useState('monthly');
    const [plLoading, setPlLoading] = useState(false);

    const formatCurrency = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;

    // Existing Revenue fetch
    const fetchData = async () => {
        setLoading(true);
        setError('');
        try {
            const revRes = await administratorAPI.getRevenue();
            if (revRes.success) {
                setRevenue(revRes.data);
            }

            const billRes = await administratorAPI.getBilling();
            if (billRes.success) {
                setBilling(billRes);
            }
        } catch (err) {
            console.error('Error fetching revenue metrics:', err);
            setError('Failed to fetch financial metrics.');
        } finally {
            setLoading(false);
        }
    };

    // Expenses & Categories fetch
    const fetchExpensesAndCategories = async () => {
        setLoading(true);
        setError('');
        try {
            const catRes = await administratorAPI.getExpenseCategories();
            if (catRes.success) {
                setCategories(catRes.categories);
                if (catRes.categories.length > 0 && !newExpense.category) {
                    setNewExpense(prev => ({ ...prev, category: catRes.categories[0].name }));
                }
            }

            const expRes = await administratorAPI.getExpenses();
            if (expRes.success) {
                setExpenses(expRes.expenses);
            }
        } catch (err) {
            console.error('Error fetching expenses/categories:', err);
            setError('Failed to fetch expenses and categories.');
        } finally {
            setLoading(false);
        }
    };

    // P&L fetch
    const fetchPlData = async () => {
        setPlLoading(true);
        setError('');
        try {
            const res = await administratorAPI.getProfitLoss();
            if (res.success) {
                setPlData(res.data);
            }
        } catch (err) {
            console.error('Error fetching Profit & Loss data:', err);
            setError('Failed to fetch Profit & Loss statement.');
        } finally {
            setPlLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'revenue') {
            fetchData();
        } else if (activeTab === 'expenses') {
            fetchExpensesAndCategories();
        } else if (activeTab === 'profit-loss') {
            fetchPlData();
        }
    }, [activeTab]);

    // Handle submit new category
    const handleAddCategory = async (e) => {
        e.preventDefault();
        if (!newCategory.name.trim()) return;
        setCategoryActionLoading(true);
        try {
            const res = await administratorAPI.createExpenseCategory(newCategory);
            if (res.success) {
                setCategories(prev => [...prev, res.category]);
                setNewCategory({ name: '', description: '' });
                if (!newExpense.category) {
                    setNewExpense(prev => ({ ...prev, category: res.category.name }));
                }
            }
        } catch (err) {
            console.error('Error adding category:', err);
            setError(err.response?.data?.message || 'Failed to create category.');
        } finally {
            setCategoryActionLoading(false);
        }
    };

    // Handle delete category
    const handleDeleteCategory = async (catId) => {
        if (!window.confirm("Are you sure you want to delete this category? Any future expenses will need a valid active category.")) return;
        try {
            const res = await administratorAPI.deleteExpenseCategory(catId);
            if (res.success) {
                setCategories(prev => prev.filter(c => c._id !== catId));
            }
        } catch (err) {
            console.error('Error deleting category:', err);
            setError('Failed to delete category.');
        }
    };

    // Handle submit new expense
    const handleAddExpense = async (e) => {
        e.preventDefault();
        if (!newExpense.category || !newExpense.amount) return;
        setActionLoading(true);
        try {
            const res = await administratorAPI.createExpense(newExpense);
            if (res.success) {
                setExpenses(prev => [res.expense, ...prev]);
                setNewExpense(prev => ({
                    ...prev,
                    amount: '',
                    description: '',
                    paymentMethod: 'Cash',
                    paymentStatus: 'Paid'
                }));
            }
        } catch (err) {
            console.error('Error logging expense:', err);
            setError('Failed to log expense.');
        } finally {
            setActionLoading(false);
        }
    };

    // Handle delete expense
    const handleDeleteExpense = async (expId) => {
        if (!window.confirm("Are you sure you want to delete this expense record?")) return;
        try {
            const res = await administratorAPI.deleteExpense(expId);
            if (res.success) {
                setExpenses(prev => prev.filter(e => e._id !== expId));
            }
        } catch (err) {
            console.error('Error deleting expense:', err);
            setError('Failed to delete expense.');
        }
    };

    const handleSync = () => {
        if (activeTab === 'revenue') fetchData();
        else if (activeTab === 'expenses') fetchExpensesAndCategories();
        else if (activeTab === 'profit-loss') fetchPlData();
    };

    // Render P&L comparative SVG chart
    const renderPlChart = () => {
        if (!plData || !plData[plPeriodType]) return null;
        const periodData = plData[plPeriodType];
        const trend = periodData.trend || [];

        if (trend.length === 0) {
            return <div className="empty-chart-msg">No financial history logs to display.</div>;
        }

        // Determine max value for scaling. Net profit can be negative, so we take absolute values.
        const maxVal = Math.max(
            ...trend.map(p => Math.max(Math.abs(p.revenue || 0), Math.abs(p.expense || 0), Math.abs(p.profit || 0))),
            1000
        );
        
        const svgHeight = 240;
        const svgWidth = 650;
        const chartHeight = 140;
        const yBaseline = 170; // Y coordinate for value 0
        const startX = 60;
        const spacingX = (svgWidth - 90) / trend.length;
        const maxBarWidth = 15;
        const barWidth = Math.min(maxBarWidth, Math.max(4, spacingX / 4 - 3));

        return (
            <div className="svg-container-fin">
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="revenue-svg">
                    {/* Horizontal reference lines */}
                    <line x1="40" y1={yBaseline - chartHeight} x2={svgWidth - 20} y2={yBaseline - chartHeight} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />
                    <line x1="40" y1={yBaseline - chartHeight / 2} x2={svgWidth - 20} y2={yBaseline - chartHeight / 2} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />
                    <line x1="40" y1={yBaseline} x2={svgWidth - 20} y2={yBaseline} stroke="#94a3b8" strokeWidth="1.5" />
                    
                    <text x="35" y={yBaseline - chartHeight + 4} textAnchor="end" fontSize="9" fill="#94a3b8">{formatCurrency(maxVal)}</text>
                    <text x="35" y={yBaseline - chartHeight / 2 + 4} textAnchor="end" fontSize="9" fill="#94a3b8">{formatCurrency(maxVal / 2)}</text>
                    <text x="35" y={yBaseline + 4} textAnchor="end" fontSize="9" fill="#64748b">₹0</text>

                    {trend.map((p, index) => {
                        const x = startX + index * spacingX + spacingX / 2;
                        
                        // Scaling values relative to baseline
                        const revHeight = ((p.revenue || 0) / maxVal) * chartHeight;
                        const expHeight = ((p.expense || 0) / maxVal) * chartHeight;
                        const profitVal = p.profit || 0;
                        const profitHeight = (Math.abs(profitVal) / maxVal) * chartHeight;

                        const revY = yBaseline - revHeight;
                        const expY = yBaseline - expHeight;
                        const profitY = profitVal >= 0 ? yBaseline - profitHeight : yBaseline; // draw below axis if negative

                        return (
                            <g key={p.label || index}>
                                {/* Revenue Bar - Green */}
                                <rect 
                                    x={x - barWidth * 1.5 - 2} 
                                    y={revY} 
                                    width={barWidth} 
                                    height={Math.max(revHeight, 1)} 
                                    fill="#10b981" 
                                    rx="2"
                                />
                                {/* Expense Bar - Red */}
                                <rect 
                                    x={x - barWidth / 2} 
                                    y={expY} 
                                    width={barWidth} 
                                    height={Math.max(expHeight, 1)} 
                                    fill="#ef4444" 
                                    rx="2"
                                />
                                {/* Net Profit Bar - Indigo if positive, Rose if negative */}
                                <rect 
                                    x={x + barWidth / 2 + 2} 
                                    y={profitY} 
                                    width={barWidth} 
                                    height={Math.max(profitHeight, 1)} 
                                    fill={profitVal >= 0 ? "#6366f1" : "#f43f5e"}
                                    rx="2"
                                />
                                {/* Label */}
                                <text 
                                    x={x} 
                                    y={yBaseline + 18} 
                                    textAnchor="middle" 
                                    fontSize="9" 
                                    fontWeight="600"
                                    fill="#64748b"
                                >
                                    {p.label}
                                </text>
                            </g>
                        );
                    })}
                </svg>
                <div className="chart-legend">
                    <span className="legend-item"><span className="legend-dot rev"></span> Gross Revenue</span>
                    <span className="legend-item"><span className="legend-dot exp"></span> Expenses</span>
                    <span className="legend-item"><span className="legend-dot profit-indigo"></span> Net Profit</span>
                    <span className="legend-item"><span className="legend-dot loss-rose"></span> Net Loss</span>
                </div>
            </div>
        );
    };

    // Helper functions for date groupings on the client side
    const getClientWeekKey = (d) => {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Monday adjustment
        const monday = new Date(date.setDate(diff));
        monday.setHours(0,0,0,0);
        return monday.toISOString().split('T')[0];
    };

    const getClientMonthKey = (d) => {
        const date = new Date(d);
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    };

    const formatClientPeriodLabel = (key, type) => {
        if (type === 'weekly') {
            const d = new Date(key);
            const end = new Date(d);
            end.setDate(d.getDate() + 6);
            return `${d.getDate()} ${monthNames[d.getMonth()]} - ${end.getDate()} ${monthNames[end.getMonth()]} ${end.getFullYear()}`;
        }
        if (type === 'monthly') {
            const [y, m] = key.split('-');
            return `${monthNames[parseInt(m) - 1]} ${y}`;
        }
        return key;
    };

    const getGroupedExpenses = (type) => {
        const groupMap = {};
        
        expenses.forEach(exp => {
            const date = exp.date || exp.createdAt;
            if (!date) return;
            if (exp.paymentStatus !== 'Paid') return;
            const key = type === 'weekly' ? getClientWeekKey(date) : getClientMonthKey(date);
            
            if (!groupMap[key]) {
                groupMap[key] = {
                    key,
                    label: formatClientPeriodLabel(key, type),
                    total: 0,
                    categories: {}
                };
            }
            
            groupMap[key].total += exp.amount;
            const cat = exp.category || 'Other';
            if (!groupMap[key].categories[cat]) {
                groupMap[key].categories[cat] = 0;
            }
            groupMap[key].categories[cat] += exp.amount;
        });

        return Object.keys(groupMap).sort().reverse().map(key => groupMap[key]);
    };

    const rev = revenue || { today: 0, weekly: 0, monthly: 0, yearly: 0, departments: [] };
    const billStats = billing?.stats || { totalRevenue: 0, outstandingPayments: 0, totalRefunds: 0, invoiceCounts: 0, collectionsCount: 0, pendingsCount: 0 };
    const invoices = billing?.invoices || [];

    // Filtered expenses list
    const filteredExpenses = expenses.filter(e => categoryFilter === 'all' || e.category === categoryFilter);
    const totalExpensesSum = expenses.reduce((sum, e) => sum + e.amount, 0);

    return (
        <div className="revenue-page">
            {/* Header Area */}
            <div className="rev-header">
                <div>
                    <h1>Financial Control Center</h1>
                    <p>Track collections, manage custom expense categories, and view Profit & Loss breakdowns.</p>
                </div>
                <button onClick={handleSync} className="btn-refresh-fin">
                    <FiRefreshCw /> <span>Sync Ledger</span>
                </button>
            </div>

            {error && (
                <div className="fin-banner error">
                    <FiAlertCircle /> <span>{error}</span>
                    <button className="banner-close-btn" onClick={() => setError('')}>&times;</button>
                </div>
            )}

            {/* Financial Module Tabs */}
            <div className="financial-tabs">
                <button 
                    onClick={() => setActiveTab('revenue')} 
                    className={`fin-tab-btn ${activeTab === 'revenue' ? 'active' : ''}`}
                >
                    <FiTrendingUp /> Revenue Oversight
                </button>
                <button 
                    onClick={() => setActiveTab('expenses')} 
                    className={`fin-tab-btn ${activeTab === 'expenses' ? 'active' : ''}`}
                >
                    <FiList /> Expense Tracker
                </button>
                <button 
                    onClick={() => setActiveTab('profit-loss')} 
                    className={`fin-tab-btn ${activeTab === 'profit-loss' ? 'active' : ''}`}
                >
                    <FiBarChart2 /> Profit & Loss (P&L)
                </button>
            </div>

            {/* TAB CONTENT: 1. REVENUE MONITORING */}
            {activeTab === 'revenue' && (
                <div className="tab-pane-content animate-fade">
                    <div className="fin-kpis-grid">
                        <div className="fin-card">
                            <div className="card-icon today"><FiDollarSign /></div>
                            <div className="card-info">
                                <span>Today's Billings</span>
                                <h3>{formatCurrency(rev.today)}</h3>
                            </div>
                        </div>
                        <div className="fin-card">
                            <div className="card-icon weekly"><FiTrendingUp /></div>
                            <div className="card-info">
                                <span>Weekly Billings</span>
                                <h3>{formatCurrency(rev.weekly)}</h3>
                            </div>
                        </div>
                        <div className="fin-card">
                            <div className="card-icon monthly"><FiTrendingUp /></div>
                            <div className="card-info">
                                <span>Monthly Billings</span>
                                <h3>{formatCurrency(rev.monthly)}</h3>
                            </div>
                        </div>
                        <div className="fin-card">
                            <div className="card-icon outstanding"><FiAlertCircle /></div>
                            <div className="card-info">
                                <span>Outstanding Dues</span>
                                <h3>{formatCurrency(billStats.outstandingPayments)}</h3>
                            </div>
                        </div>
                        <div className="fin-card">
                            <div className="card-icon refund"><FiActivity /></div>
                            <div className="card-info">
                                <span>Total Refund Approvals</span>
                                <h3>{formatCurrency(billStats.totalRefunds)}</h3>
                            </div>
                        </div>
                    </div>

                    <div className="revenue-charts-grid">
                        <div className="rev-chart-card">
                            <h3>📈 Revenue Stream Projection</h3>
                            <div className="svg-container-fin">
                                <svg viewBox="0 0 450 220" className="revenue-svg">
                                    <line x1="40" y1="30" x2="420" y2="30" stroke="#f1f5f9" strokeWidth="1" />
                                    <line x1="40" y1="80" x2="420" y2="80" stroke="#f1f5f9" strokeWidth="1" />
                                    <line x1="40" y1="130" x2="420" y2="130" stroke="#f1f5f9" strokeWidth="1" />
                                    <line x1="40" y1="180" x2="420" y2="180" stroke="#cbd5e1" strokeWidth="1.5" />

                                    <path d="M 60,160 L 130,135 L 200,140 L 270,110 L 340,90 L 410,50" fill="none" stroke="url(#fin-line-grad)" strokeWidth="4" strokeLinecap="round" />
                                    <path d="M 60,160 L 130,135 L 200,140 L 270,110 L 340,90 L 410,50 L 410,180 L 60,180 Z" fill="url(#fin-area-grad)" />

                                    <circle cx="60" cy="160" r="5" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
                                    <circle cx="130" cy="135" r="5" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
                                    <circle cx="200" cy="140" r="5" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
                                    <circle cx="270" cy="110" r="5" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
                                    <circle cx="340" cy="90" r="5" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
                                    <circle cx="410" cy="50" r="5" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />

                                    <text x="60" y="200" textAnchor="middle" fontSize="11" fill="#94a3b8">Jan</text>
                                    <text x="130" y="200" textAnchor="middle" fontSize="11" fill="#94a3b8">Feb</text>
                                    <text x="200" y="200" textAnchor="middle" fontSize="11" fill="#94a3b8">Mar</text>
                                    <text x="270" y="200" textAnchor="middle" fontSize="11" fill="#94a3b8">Apr</text>
                                    <text x="340" y="200" textAnchor="middle" fontSize="11" fill="#94a3b8">May</text>
                                    <text x="410" y="200" textAnchor="middle" fontSize="11" fill="#94a3b8">Jun</text>

                                    <defs>
                                        <linearGradient id="fin-line-grad" x1="0" y1="0" x2="1" y2="0">
                                            <stop offset="0%" stopColor="#10b981" />
                                            <stop offset="100%" stopColor="#059669" />
                                        </linearGradient>
                                        <linearGradient id="fin-area-grad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                                            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                                        </linearGradient>
                                    </defs>
                                </svg>
                            </div>
                        </div>

                        <div className="rev-chart-card">
                            <h3>🏢 Department Financial Share</h3>
                            <div className="dept-share-list">
                                {rev.departments && rev.departments.length > 0 ? (
                                    rev.departments.map((d) => {
                                        const total = rev.departments.reduce((sum, x) => sum + x.amount, 0) || 1;
                                        const percent = Math.round((d.amount / total) * 100);
                                        return (
                                            <div key={d.department} className="share-row">
                                                <div className="share-header">
                                                    <span className="dept-lbl">{d.department}</span>
                                                    <span className="dept-val">{formatCurrency(d.amount)} ({percent}%)</span>
                                                </div>
                                                <div className="share-bar-outer">
                                                    <div className="share-bar-inner" style={{ width: `${percent}%` }} />
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="empty-chart-msg">No departmental distribution statistics loaded.</div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="invoices-section">
                        <h2>Recent Financial Invoices Log</h2>
                        {invoices.length === 0 ? (
                            <div className="empty-invoices-msg">No invoices generated in this hospital billing session.</div>
                        ) : (
                            <div className="invoices-table-wrap">
                                <table className="invoices-table">
                                    <thead>
                                        <tr>
                                            <th>Invoice #</th>
                                            <th>Patient Details</th>
                                            <th>Date</th>
                                            <th>Gross Amount</th>
                                            <th>Amount Paid</th>
                                            <th>Outstanding Dues</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {invoices.slice(0, 15).map((inv) => (
                                            <tr key={inv._id}>
                                                <td><strong>{inv.invoiceNumber || 'INV-N/A'}</strong></td>
                                                <td>
                                                    <div className="patient-meta-lbl">
                                                        <strong>{inv.patientId?.name || 'Walk-in Patient'}</strong>
                                                        <span>{inv.patientId?.patientId || 'PT-N/A'}</span>
                                                    </div>
                                                </td>
                                                <td>{new Date(inv.invoiceDate || inv.createdAt).toLocaleDateString()}</td>
                                                <td><strong>{formatCurrency(inv.grandTotal)}</strong></td>
                                                <td className="collected-txt">{formatCurrency(inv.amountPaid)}</td>
                                                <td className={inv.outstandingAmount > 0 ? 'dues-txt alert-txt' : 'dues-txt'}>{formatCurrency(inv.outstandingAmount)}</td>
                                                <td>
                                                    <span className={`status-badge-val ${String(inv.paymentStatus).toLowerCase().replace(' ', '_')}`}>
                                                        {inv.paymentStatus}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB CONTENT: 2. EXPENSE TRACKER */}
            {activeTab === 'expenses' && (
                <div className="tab-pane-content animate-fade">
                    {/* Expense KPI summary */}
                    <div className="expense-summary-grid">
                        <div className="fin-card">
                            <div className="card-icon outstanding"><FiDollarSign /></div>
                            <div className="card-info">
                                <span>Total Registered Expenses</span>
                                <h3>{formatCurrency(totalExpensesSum)}</h3>
                            </div>
                        </div>
                        <div className="fin-card">
                            <div className="card-icon weekly"><FiTag /></div>
                            <div className="card-info">
                                <span>Custom Fields Configured</span>
                                <h3>{categories.length} categories</h3>
                            </div>
                        </div>
                    </div>

                    <div className="expense-workspace">
                        {/* Column 1: Log form */}
                        <div className="expense-form-card">
                            <h3>💸 Log Hospital Expense</h3>
                            <form onSubmit={handleAddExpense} className="exp-form">
                                <div className="form-group-fin">
                                    <label>Expense Category Field</label>
                                    <select 
                                        value={newExpense.category} 
                                        onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                                        required
                                    >
                                        <option value="" disabled>-- Select Field Category --</option>
                                        {categories.map(c => (
                                            <option key={c._id} value={c.name}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group-fin">
                                    <label>Amount (₹)</label>
                                    <input 
                                        type="number" 
                                        placeholder="Enter cost value" 
                                        value={newExpense.amount}
                                        onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                                        min="0.01" 
                                        step="0.01" 
                                        required
                                    />
                                </div>
                                <div className="form-group-fin">
                                    <label>Expenditure Date</label>
                                    <input 
                                        type="date" 
                                        value={newExpense.date}
                                        onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-row-fin">
                                    <div className="form-group-fin">
                                        <label>Payment Method</label>
                                        <select
                                            value={newExpense.paymentMethod}
                                            onChange={(e) => setNewExpense({ ...newExpense, paymentMethod: e.target.value })}
                                            required
                                        >
                                            <option value="Cash">Cash</option>
                                            <option value="Card">Card</option>
                                            <option value="UPI">UPI</option>
                                            <option value="Bank Transfer">Bank Transfer</option>
                                            <option value="Net Banking">Net Banking</option>
                                        </select>
                                    </div>
                                    <div className="form-group-fin">
                                        <label>Payment Status</label>
                                        <select
                                            value={newExpense.paymentStatus}
                                            onChange={(e) => setNewExpense({ ...newExpense, paymentStatus: e.target.value })}
                                            required
                                        >
                                            <option value="Paid">Paid</option>
                                            <option value="Pending">Pending</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group-fin">
                                    <label>Short Details / Description</label>
                                    <textarea 
                                        rows="2" 
                                        placeholder="e.g. Paid monthly electric bill, purchased 5 boxes N95 masks, etc."
                                        value={newExpense.description}
                                        onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                                    />
                                </div>
                                <button type="submit" className="btn-action-fin" disabled={actionLoading}>
                                    {actionLoading ? <FiRefreshCw className="spinning" /> : <FiPlus />} Log Expenditure
                                </button>
                            </form>
                        </div>

                        {/* Column 2: Manage Categories (Fields) */}
                        <div className="expense-fields-card">
                            <h3>🏷️ Manage Expense Category Fields</h3>
                            <p className="helper-text-fin">Define new customized expense fields dynamically depending on hospital billing requirements (e.g. Electricity, Tea, Masks, Cleaning).</p>
                            
                            <form onSubmit={handleAddCategory} className="field-add-form">
                                <input 
                                    type="text" 
                                    placeholder="Enter category name (e.g. Tea)" 
                                    value={newCategory.name}
                                    onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                                    required
                                />
                                <button type="submit" className="btn-add-field" disabled={categoryActionLoading}>
                                    {categoryActionLoading ? <FiRefreshCw className="spinning" /> : <FiPlusCircle />} Add Field
                                </button>
                            </form>

                            <div className="fields-badges-list">
                                {categories.length === 0 ? (
                                    <div className="empty-small-msg">No custom expense fields configured yet.</div>
                                ) : (
                                    categories.map(c => (
                                        <div key={c._id} className="field-badge">
                                            <span>{c.name}</span>
                                            <button 
                                                type="button" 
                                                className="btn-badge-delete"
                                                onClick={() => handleDeleteCategory(c._id)}
                                            >
                                                &times;
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Expense log list */}
                    <div className="expenses-log-section">
                        <div className="section-hdr-with-filter">
                            <h2>Registered Expense Logs</h2>
                            <div className="expense-view-toggles">
                                <button 
                                    onClick={() => setExpenseViewMode('individual')} 
                                    className={`toggle-btn-small ${expenseViewMode === 'individual' ? 'active' : ''}`}
                                >
                                    Individual Logs
                                </button>
                                <button 
                                    onClick={() => setExpenseViewMode('weekly')} 
                                    className={`toggle-btn-small ${expenseViewMode === 'weekly' ? 'active' : ''}`}
                                >
                                    Weekly Summary
                                </button>
                                <button 
                                    onClick={() => setExpenseViewMode('monthly')} 
                                    className={`toggle-btn-small ${expenseViewMode === 'monthly' ? 'active' : ''}`}
                                >
                                    Monthly Summary
                                </button>
                            </div>
                            {expenseViewMode === 'individual' && (
                                <div className="filter-wrapper-fin">
                                    <label>Filter by Field:</label>
                                    <select 
                                        value={categoryFilter} 
                                        onChange={(e) => setCategoryFilter(e.target.value)}
                                    >
                                        <option value="all">All Fields</option>
                                        {categories.map(c => (
                                            <option key={c._id} value={c.name}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>

                        {expenseViewMode !== 'individual' ? (
                            (() => {
                                const grouped = getGroupedExpenses(expenseViewMode);
                                return grouped.length === 0 ? (
                                    <div className="empty-invoices-msg">No expense summary recorded in this period range.</div>
                                ) : (
                                    <div className="invoices-table-wrap animate-fade">
                                        <table className="invoices-table">
                                            <thead>
                                                <tr>
                                                    <th>Interval Period</th>
                                                    <th>Total Paid Expenditures</th>
                                                    <th>Paid Expenditure breakdown by Category field</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {grouped.map((group) => {
                                                    const categorySpendKeys = Object.keys(group.categories);
                                                    return (
                                                        <tr key={group.key}>
                                                            <td><strong>{group.label}</strong></td>
                                                            <td className="expense-amt-txt"><strong>{formatCurrency(group.total)}</strong></td>
                                                            <td>
                                                                <div className="pl-breakdown-tags-cell">
                                                                    {categorySpendKeys.length === 0 ? (
                                                                        <span className="no-spend-tag">₹0 expenses</span>
                                                                    ) : (
                                                                        categorySpendKeys.map(cat => (
                                                                            <span key={cat} className="spend-tag">
                                                                                <strong>{cat}</strong>: {formatCurrency(group.categories[cat])}
                                                                            </span>
                                                                        ))
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                );
                            })()
                        ) : filteredExpenses.length === 0 ? (
                            <div className="empty-invoices-msg">No logged expenses found matching the filter.</div>
                        ) : (
                            <div className="invoices-table-wrap">
                                <table className="invoices-table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Category Field</th>
                                            <th>Details / Purpose</th>
                                            <th>Method</th>
                                            <th>Status</th>
                                            <th>Amount</th>
                                            <th>Logged By</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredExpenses.map((exp) => (
                                            <tr key={exp._id}>
                                                <td>{new Date(exp.date).toLocaleDateString()}</td>
                                                <td><span className="category-tag-lbl">{exp.category}</span></td>
                                                <td className="desc-cell-fin">{exp.description || <em className="muted-txt-fin">No details provided</em>}</td>
                                                <td><span className="method-tag-lbl">{exp.paymentMethod || 'Cash'}</span></td>
                                                <td>
                                                    <span className={`status-badge-val ${String(exp.paymentStatus || 'Paid').toLowerCase()}`}>
                                                        {exp.paymentStatus || 'Paid'}
                                                    </span>
                                                </td>
                                                <td className="expense-amt-txt"><strong>{formatCurrency(exp.amount)}</strong></td>
                                                <td><span className="user-logged-lbl">{exp.addedByName || 'Administrator'}</span></td>
                                                <td>
                                                    <button 
                                                        className="btn-row-delete" 
                                                        onClick={() => handleDeleteExpense(exp._id)}
                                                    >
                                                        <FiTrash2 />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB CONTENT: 3. PROFIT & LOSS */}
            {activeTab === 'profit-loss' && (
                <div className="tab-pane-content animate-fade">
                    {/* Period selection controls */}
                    <div className="pl-controls-card">
                        <div>
                            <h3>📊 Profit & Loss Aggregations</h3>
                            <p className="helper-text-fin">Select financial statement intervals to compare Gross Collections against Total Expenses.</p>
                        </div>
                        <div className="pl-period-toggles">
                            <button 
                                onClick={() => setPlPeriodType('weekly')} 
                                className={`period-toggle-btn ${plPeriodType === 'weekly' ? 'active' : ''}`}
                            >
                                Weekly
                            </button>
                            <button 
                                onClick={() => setPlPeriodType('monthly')} 
                                className={`period-toggle-btn ${plPeriodType === 'monthly' ? 'active' : ''}`}
                            >
                                Monthly
                            </button>
                            <button 
                                onClick={() => setPlPeriodType('halfYearly')} 
                                className={`period-toggle-btn ${plPeriodType === 'halfYearly' ? 'active' : ''}`}
                            >
                                Half-Yearly (6 Mo)
                            </button>
                            <button 
                                onClick={() => setPlPeriodType('yearly')} 
                                className={`period-toggle-btn ${plPeriodType === 'yearly' ? 'active' : ''}`}
                            >
                                Yearly
                            </button>
                        </div>
                    </div>

                    {plLoading ? (
                        <div className="financial-loading">
                            <FiRefreshCw className="spinner-icon spinning" />
                            <p>Aggregating profit & loss figures...</p>
                        </div>
                    ) : !plData || !plData[plPeriodType] ? (
                        <div className="empty-invoices-msg">No financial statements recorded in this period range.</div>
                    ) : (
                        (() => {
                            const periodData = plData[plPeriodType];
                            const { summary, revenueBreakdown, expenseBreakdown, statement } = periodData;
                            
                            const getHealthStatusDetails = (status) => {
                                switch (status) {
                                    case 'Healthy Profit':
                                        return { icon: '🟢', class: 'health-healthy', label: 'Healthy Profit' };
                                    case 'Low Margin':
                                        return { icon: '🟡', class: 'health-warning', label: 'Low Margin' };
                                    case 'Operating Loss':
                                        return { icon: '🔴', class: 'health-critical', label: 'Operating Loss' };
                                    default:
                                        return { icon: '⚪', class: 'health-neutral', label: status || 'Break-even' };
                                }
                            };

                            const healthDetails = getHealthStatusDetails(summary.healthStatus);

                            return (
                                <div className="pl-dashboard-container animate-fade">
                                    {/* 1. Summary Header & 6 KPIs Grid */}
                                    <div className="pl-summary-section">
                                        <div className="pl-section-header">
                                            <h3>📈 Financial Summary Cards</h3>
                                            <div className={`health-indicator-pill ${healthDetails.class}`}>
                                                <span className="health-dot">{healthDetails.icon}</span>
                                                <span className="health-label">{healthDetails.label}</span>
                                            </div>
                                        </div>
                                        <div className="pl-kpis-grid">
                                            <div className="fin-card pl-kpi-card">
                                                <div className="card-icon today"><FiDollarSign /></div>
                                                <div className="card-info">
                                                    <span>Total Revenue</span>
                                                    <h3>{formatCurrency(summary.totalRevenue)}</h3>
                                                </div>
                                            </div>
                                            <div className="fin-card pl-kpi-card">
                                                <div className="card-icon outstanding"><FiDollarSign /></div>
                                                <div className="card-info">
                                                    <span>Total Expenses</span>
                                                    <h3>{formatCurrency(summary.totalExpenses)}</h3>
                                                </div>
                                            </div>
                                            <div className={`fin-card pl-kpi-card ${summary.netProfit >= 0 ? 'profit' : 'loss'}`}>
                                                <div className={`card-icon ${summary.netProfit >= 0 ? 'today' : 'outstanding'}`}><FiActivity /></div>
                                                <div className="card-info">
                                                    <span>Net Profit / Loss</span>
                                                    <h3 className={summary.netProfit >= 0 ? 'profit-positive-txt' : 'profit-negative-txt'}>
                                                        {formatCurrency(summary.netProfit)}
                                                    </h3>
                                                </div>
                                            </div>
                                            <div className="fin-card pl-kpi-card">
                                                <div className="card-icon weekly"><FiTrendingUp /></div>
                                                <div className="card-info">
                                                    <span>Profit Margin</span>
                                                    <h3>{summary.profitMargin}%</h3>
                                                </div>
                                            </div>
                                            <div className="fin-card pl-kpi-card">
                                                <div className="card-icon refund"><FiCheckCircle /></div>
                                                <div className="card-info">
                                                    <span>Collection Efficiency</span>
                                                    <h3>{summary.collectionEfficiency}%</h3>
                                                </div>
                                            </div>
                                            <div className="fin-card pl-kpi-card">
                                                <div className="card-icon outstanding"><FiAlertCircle /></div>
                                                <div className="card-info">
                                                    <span>Outstanding Payments</span>
                                                    <h3>{formatCurrency(summary.outstandingPayments)}</h3>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 2. Chart and Breakdown Row */}
                                    <div className="pl-analytics-row">
                                        <div className="pl-chart-card">
                                            <h3>📊 Collections, Expenses & Profit Trend ({plPeriodType.toUpperCase()})</h3>
                                            {renderPlChart()}
                                        </div>
                                        <div className="pl-breakdowns-column">
                                            <div className="breakdown-card">
                                                <h3>🏢 Revenue Source Breakdown</h3>
                                                <div className="breakdown-list">
                                                    {revenueBreakdown.map((item) => (
                                                        <div key={item.source} className="share-row">
                                                            <div className="share-header">
                                                                <span className="dept-lbl">{item.source}</span>
                                                                <span className="dept-val">{formatCurrency(item.amount)} ({item.percentage}%)</span>
                                                            </div>
                                                            <div className="share-bar-outer">
                                                                <div className="share-bar-inner rev" style={{ width: `${item.percentage}%` }} />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="breakdown-card">
                                                <h3>💸 Expense Category Share</h3>
                                                <div className="breakdown-list">
                                                    {expenseBreakdown.map((item) => (
                                                        <div key={item.category} className="share-row">
                                                            <div className="share-header">
                                                                <span className="dept-lbl">{item.category}</span>
                                                                <span className="dept-val">{formatCurrency(item.amount)} ({item.percentage}%)</span>
                                                            </div>
                                                            <div className="share-bar-outer">
                                                                <div className="share-bar-inner exp" style={{ width: `${item.percentage}%` }} />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 3. Detailed Financial Statement Ledger */}
                                    <div className="pl-ledger-container">
                                        <div className="pl-ledger-card">
                                            <div className="pl-ledger-header">
                                                <h2>Detailed Profit & Loss Statement</h2>
                                                <span className="ledger-period-label">Period: {plPeriodType.toUpperCase()}</span>
                                            </div>
                                            
                                            <div className="pl-ledger-table">
                                                {/* Revenue Section */}
                                                <div className="ledger-section-title">I. REVENUE SOURCE CONTRIBUTIONS</div>
                                                <div className="ledger-row">
                                                    <span className="ledger-lbl">OPD Consultation & Service Fees</span>
                                                    <span className="ledger-val collected-txt">{formatCurrency(statement.revenue?.opd)}</span>
                                                </div>
                                                <div className="ledger-row">
                                                    <span className="ledger-lbl">IPD Admission & Bed Charges</span>
                                                    <span className="ledger-val collected-txt">{formatCurrency(statement.revenue?.ipd)}</span>
                                                </div>
                                                <div className="ledger-row">
                                                    <span className="ledger-lbl">Laboratory & Diagnostics Fees</span>
                                                    <span className="ledger-val collected-txt">{formatCurrency(statement.revenue?.laboratory)}</span>
                                                </div>
                                                <div className="ledger-row">
                                                    <span className="ledger-lbl">Pharmacy & Medication Sales</span>
                                                    <span className="ledger-val collected-txt">{formatCurrency(statement.revenue?.pharmacy)}</span>
                                                </div>
                                                <div className="ledger-row">
                                                    <span className="ledger-lbl">Other Miscellaneous Service Revenues</span>
                                                    <span className="ledger-val collected-txt">{formatCurrency(statement.revenue?.other)}</span>
                                                </div>
                                                <div className="ledger-row total-row">
                                                    <span className="ledger-lbl">GROSS REVENUE (COLLECTED)</span>
                                                    <span className="ledger-val collected-txt">{formatCurrency(statement.revenue?.total)}</span>
                                                </div>

                                                {/* Expense Section */}
                                                <div className="ledger-section-title">II. OPERATING EXPENSES (PAID OUT)</div>
                                                <div className="ledger-row">
                                                    <span className="ledger-lbl">Tea & Staff Welfare Expenses</span>
                                                    <span className="ledger-val expense-amt-txt">{formatCurrency(statement.expense?.tea)}</span>
                                                </div>
                                                <div className="ledger-row">
                                                    <span className="ledger-lbl">Electricity Utility Bills</span>
                                                    <span className="ledger-val expense-amt-txt">{formatCurrency(statement.expense?.electricity)}</span>
                                                </div>
                                                <div className="ledger-row">
                                                    <span className="ledger-lbl">Cleaning & Housekeeping Services</span>
                                                    <span className="ledger-val expense-amt-txt">{formatCurrency(statement.expense?.cleaning)}</span>
                                                </div>
                                                <div className="ledger-row">
                                                    <span className="ledger-lbl">Other Utilities (Water/Internet/Fuel)</span>
                                                    <span className="ledger-val expense-amt-txt">{formatCurrency(statement.expense?.utilities)}</span>
                                                </div>
                                                <div className="ledger-row">
                                                    <span className="ledger-lbl">Maintenance & Equipment Repairs</span>
                                                    <span className="ledger-val expense-amt-txt">{formatCurrency(statement.expense?.maintenance)}</span>
                                                </div>
                                                <div className="ledger-row">
                                                    <span className="ledger-lbl">Office Supplies & Stationery</span>
                                                    <span className="ledger-val expense-amt-txt">{formatCurrency(statement.expense?.supplies)}</span>
                                                </div>
                                                <div className="ledger-row">
                                                    <span className="ledger-lbl">Other Miscellaneous Expenditures</span>
                                                    <span className="ledger-val expense-amt-txt">{formatCurrency(statement.expense?.other)}</span>
                                                </div>
                                                <div className="ledger-row total-row">
                                                    <span className="ledger-lbl">TOTAL OPERATING EXPENSES</span>
                                                    <span className="ledger-val expense-amt-txt">{formatCurrency(statement.expense?.total)}</span>
                                                </div>

                                                {/* Final Bottom Line Summary */}
                                                <div className={`ledger-row bottom-line-row ${statement.netProfit >= 0 ? 'profit' : 'loss'}`}>
                                                    <div className="bottom-line-lbl">
                                                        <span>NET OPERATING {statement.netProfit >= 0 ? 'PROFIT' : 'LOSS'}</span>
                                                        <span className={`status-indicator ${statement.status.toLowerCase()}`}>
                                                            STATUS: {statement.status}
                                                        </span>
                                                    </div>
                                                    <span className="bottom-line-val">{formatCurrency(statement.netProfit)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()
                    )}
                </div>
            )}
        </div>
    );
};

export default RevenueMonitoring;
