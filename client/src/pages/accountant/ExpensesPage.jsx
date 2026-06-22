import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { financeAPI } from '../../utils/api';
import './ExpensesPage.css';

const ExpensesPage = () => {
    const navigate = useNavigate();
    const today = new Date().toLocaleDateString('en-CA');

    const [expenses, setExpenses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    // Categories State
    const [categories, setCategories] = useState([]);
    const [showAddCategory, setShowAddCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [categorySubmitting, setCategorySubmitting] = useState(false);
    const [categoryError, setCategoryError] = useState('');

    // Filters
    const [datePreset, setDatePreset] = useState('month'); // 'today', 'week', 'month', 'custom', 'all'
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Log Expense Form Modal
    const [showLogModal, setShowLogModal] = useState(false);
    const [newExpense, setNewExpense] = useState({
        category: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        description: '',
        paymentMethod: 'Cash',
        paymentStatus: 'Paid',
        recipientName: ''
    });

    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const role = user?.role ? user.role.toLowerCase() : '';
        const permissions = user?.permissions || [];
        const hasAccess = ['accountant', 'centraladmin', 'superadmin', 'hospitaladmin'].includes(role) || permissions.includes('finance_view');

        if (!hasAccess) {
            navigate('/dashboard');
        } else {
            fetchExpenses();
        }
    }, [navigate, datePreset, startDate, endDate]);

    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const role = user?.role ? user.role.toLowerCase() : '';
        const permissions = user?.permissions || [];
        const hasAccess = ['accountant', 'centraladmin', 'superadmin', 'hospitaladmin'].includes(role) || permissions.includes('finance_view');

        if (hasAccess) {
            fetchCategories();
        }
    }, []);

    const fetchCategories = async () => {
        try {
            const res = await financeAPI.getExpenseCategories();
            if (res.success) {
                setCategories(res.categories || []);
                if (res.categories && res.categories.length > 0) {
                    setNewExpense(prev => ({
                        ...prev,
                        category: prev.category && res.categories.some(c => c.name === prev.category) ? prev.category : res.categories[0].name
                    }));
                }
            }
        } catch (err) {
            console.error('Failed to load categories', err);
        }
    };

    const handleCreateCategory = async () => {
        if (!newCategoryName.trim()) {
            setCategoryError('Category name is required');
            return;
        }
        try {
            setCategorySubmitting(true);
            setCategoryError('');
            const res = await financeAPI.createExpenseCategory({ name: newCategoryName.trim() });
            if (res.success) {
                const updatedCategories = [...categories, res.category];
                setCategories(updatedCategories);
                setNewExpense(prev => ({
                    ...prev,
                    category: res.category.name
                }));
                setNewCategoryName('');
                setShowAddCategory(false);
            } else {
                setCategoryError(res.message || 'Failed to add category');
            }
        } catch (err) {
            console.error(err);
            setCategoryError(err.response?.data?.message || 'Error creating category');
        } finally {
            setCategorySubmitting(false);
        }
    };

    const fetchExpenses = async () => {
        try {
            setLoading(true);
            setError('');
            // If custom range, only fetch if both dates are set
            if (datePreset === 'custom' && (!startDate || !endDate)) {
                return;
            }
            const res = await financeAPI.getExpenses(datePreset, startDate, endDate);
            if (res.success) {
                setExpenses(res.expenses || []);
            } else {
                setError(res.message || 'Failed to load expenses');
            }
        } catch (err) {
            console.error(err);
            setError('Error loading expense logs');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateExpense = async (e) => {
        e.preventDefault();
        try {
            setError('');
            setSuccessMessage('');
            const res = await financeAPI.createExpense(newExpense);
            if (res.success) {
                setSuccessMessage('Expense recorded successfully!');
                setShowLogModal(false);
                setNewExpense({
                    category: categories.length > 0 ? categories[0].name : '',
                    amount: '',
                    date: new Date().toISOString().split('T')[0],
                    description: '',
                    paymentMethod: 'Cash',
                    paymentStatus: 'Paid',
                    recipientName: ''
                });
                fetchExpenses();
            } else {
                setError(res.message || 'Failed to record expense');
            }
        } catch (err) {
            console.error(err);
            setError('Error saving expense details');
        }
    };

    const handleDeleteExpense = async (id) => {
        if (!window.confirm('Are you sure you want to delete this expense record?')) return;
        try {
            setError('');
            setSuccessMessage('');
            const res = await financeAPI.deleteExpense(id);
            if (res.success) {
                setSuccessMessage('Expense record deleted successfully.');
                fetchExpenses();
            } else {
                setError(res.message || 'Failed to delete expense');
            }
        } catch (err) {
            console.error(err);
            setError('Error deleting expense record');
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

    const totalExpenseAmount = expenses.reduce((s, x) => s + (x.amount || 0), 0);

    return (
        <div className="expenses-page">
            <header className="page-header">
                <div>
                    <h1>Expense Management</h1>
                    <p>Track operating costs, vendor disbursements, facility utilities, and procurement expenditures</p>
                </div>
                <button className="primary-action-btn" onClick={() => setShowLogModal(true)}>
                    + Record Expense
                </button>
            </header>

            {error && <div className="error-message">⚠️ {error}</div>}
            {successMessage && <div className="success-message">🎉 {successMessage}</div>}

            {/* Filter and Summary Bar */}
            <div className="expense-toolbar card-box">
                <div className="filter-controls">
                    <div className="control-group">
                        <label>Date Filter:</label>
                        <select 
                            value={datePreset} 
                            onChange={(e) => setDatePreset(e.target.value)}
                            className="filter-select"
                        >
                            <option value="today">Today</option>
                            <option value="week">This Week</option>
                            <option value="month">This Month</option>
                            <option value="custom">Custom Range</option>
                            <option value="all">All Records</option>
                        </select>
                    </div>

                    {datePreset === 'custom' && (
                        <div className="control-group date-inputs">
                            <input 
                                type="date" 
                                value={startDate} 
                                max={today}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setStartDate(val > today ? today : val);
                                }}
                                className="filter-date"
                            />
                            <span>to</span>
                            <input 
                                type="date" 
                                value={endDate} 
                                max={today}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setEndDate(val > today ? today : val);
                                }}
                                className="filter-date"
                            />
                        </div>
                    )}
                </div>

                <div className="expense-summary">
                    <span className="summary-label">Total Outflow ({expenses.length} logs):</span>
                    <span className="summary-val">{formatCurrency(totalExpenseAmount)}</span>
                </div>
            </div>

            {/* Expense Records Table */}
            {loading ? (
                <div className="loading-message">⏳ Retrieving expense logs...</div>
            ) : (
                <div className="table-wrapper card-box">
                    <h3>Logged Expenditures</h3>
                    {expenses.length === 0 ? (
                        <div className="empty-state">No expense entries found for the selected range.</div>
                    ) : (
                        <table className="finance-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Category</th>
                                    <th>Recipient / Vendor</th>
                                    <th>Description</th>
                                    <th>Payment Detail</th>
                                    <th>Amount</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {expenses.map((exp) => (
                                    <tr key={exp._id}>
                                        <td>{formatDate(exp.date)}</td>
                                        <td>
                                            <span className={`category-pill ${exp.category.toLowerCase().replace(/[^a-z]/g, '')}`}>
                                                {exp.category}
                                            </span>
                                        </td>
                                        <td className="bold">{exp.recipientName || 'Unspecified'}</td>
                                        <td>{exp.description || 'N/A'}</td>
                                        <td>
                                            <span className="block-span bold">{exp.paymentMethod}</span>
                                            <span className="sub-text">{exp.paymentStatus}</span>
                                        </td>
                                        <td className="bold highlight-red">{formatCurrency(exp.amount)}</td>
                                        <td>
                                            <button 
                                                className="delete-action-btn"
                                                onClick={() => handleDeleteExpense(exp._id)}
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Log Expense Form Modal */}
            {showLogModal && (
                <div className="modal-backdrop">
                    <div className="modal-container">
                        <div className="modal-header">
                            <h2>Record New Expense</h2>
                            <button className="close-btn" onClick={() => setShowLogModal(false)}>×</button>
                        </div>
                        <form onSubmit={handleCreateExpense}>
                            <div className="form-grid">
                                <div className="form-group">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                        <label style={{ margin: 0 }}>Expense Category *</label>
                                        <button 
                                            type="button" 
                                            onClick={() => {
                                                setShowAddCategory(!showAddCategory);
                                                setCategoryError('');
                                                setNewCategoryName('');
                                            }}
                                            style={{ 
                                                background: 'none', 
                                                border: 'none', 
                                                color: '#ec4899', 
                                                cursor: 'pointer', 
                                                fontSize: '0.8rem', 
                                                fontWeight: '600',
                                                padding: 0
                                            }}
                                        >
                                            {showAddCategory ? 'Cancel' : '+ Add Custom'}
                                        </button>
                                    </div>
                                    {!showAddCategory ? (
                                        <select 
                                            value={newExpense.category}
                                            onChange={(e) => setNewExpense({...newExpense, category: e.target.value})}
                                        >
                                            {categories.map((cat) => (
                                                <option key={cat._id} value={cat.name}>
                                                    {cat.name}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <input 
                                                type="text" 
                                                placeholder="Category name"
                                                value={newCategoryName}
                                                onChange={(e) => setNewCategoryName(e.target.value)}
                                                style={{ flex: 1 }}
                                                autoFocus
                                            />
                                            <button 
                                                type="button" 
                                                onClick={handleCreateCategory}
                                                disabled={categorySubmitting}
                                                className="primary-btn"
                                                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                                            >
                                                {categorySubmitting ? 'Saving...' : 'Save'}
                                            </button>
                                        </div>
                                    )}
                                    {categoryError && (
                                        <span style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '4px' }}>
                                            ⚠️ {categoryError}
                                        </span>
                                    )}
                                </div>
                                <div className="form-group">
                                    <label>Expense Date *</label>
                                    <input 
                                        type="date" 
                                        required 
                                        value={newExpense.date}
                                        max={today}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setNewExpense({...newExpense, date: val > today ? today : val});
                                        }}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Recipient / Vendor Name *</label>
                                    <input 
                                        type="text" 
                                        required 
                                        placeholder="e.g. Acme Pharma / City Power"
                                        value={newExpense.recipientName}
                                        onChange={(e) => setNewExpense({...newExpense, recipientName: e.target.value})}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Amount (INR) *</label>
                                    <input 
                                        type="number" 
                                        required 
                                        placeholder="Enter amount"
                                        value={newExpense.amount}
                                        onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Payment Method</label>
                                    <select 
                                        value={newExpense.paymentMethod}
                                        onChange={(e) => setNewExpense({...newExpense, paymentMethod: e.target.value})}
                                    >
                                        <option value="Cash">Cash</option>
                                        <option value="UPI">UPI</option>
                                        <option value="Card">Card</option>
                                        <option value="Bank Transfer">Bank Transfer</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Payment Status</label>
                                    <select 
                                        value={newExpense.paymentStatus}
                                        onChange={(e) => setNewExpense({...newExpense, paymentStatus: e.target.value})}
                                    >
                                        <option value="Paid">Paid</option>
                                        <option value="Pending">Pending</option>
                                    </select>
                                </div>
                                <div className="form-group full-width">
                                    <label>Expense Description / Justification</label>
                                    <textarea 
                                        placeholder="Provide explanation of expense"
                                        value={newExpense.description}
                                        onChange={(e) => setNewExpense({...newExpense, description: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="secondary-btn" onClick={() => setShowLogModal(false)}>Cancel</button>
                                <button type="submit" className="primary-btn">Record Outflow</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ExpensesPage;
