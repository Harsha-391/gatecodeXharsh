import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { financeAPI } from '../../utils/api';
import './Reconciliation.css';

const Reconciliation = () => {
    const navigate = useNavigate();
    const today = new Date().toLocaleDateString('en-CA');


    const [targetDate, setTargetDate] = useState(new Date().toISOString().split('T')[0]);
    const [expected, setExpected] = useState({ cash: 0, upi: 0, card: 0, bank: 0, total: 0 });
    const [existingRecord, setExistingRecord] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    // Inputs for actual collection
    const [actual, setActual] = useState({
        cash: '',
        upi: '',
        card: '',
        bank: ''
    });
    const [notes, setNotes] = useState('');

    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const role = user?.role ? user.role.toLowerCase() : '';
        const permissions = user?.permissions || [];
        const hasAccess = ['accountant', 'centraladmin', 'superadmin', 'hospitaladmin'].includes(role) || permissions.includes('finance_view');

        if (!hasAccess) {
            navigate('/dashboard');
        } else {
            fetchReconciliation();
        }
    }, [navigate, targetDate]);

    const fetchReconciliation = async () => {
        try {
            setLoading(true);
            setError('');
            setSuccessMessage('');
            const res = await financeAPI.getReconciliation(targetDate);
            if (res.success) {
                setExpected(res.expected || { cash: 0, upi: 0, card: 0, bank: 0, total: 0 });
                setExistingRecord(res.record);
                if (res.record) {
                    setActual({
                        cash: res.record.cashActual || 0,
                        upi: res.record.upiActual || 0,
                        card: res.record.cardActual || 0,
                        bank: res.record.bankActual || 0
                    });
                    setNotes(res.record.notes || '');
                } else {
                    setActual({ cash: '', upi: '', card: '', bank: '' });
                    setNotes('');
                }
            } else {
                setError(res.message || 'Failed to load reconciliation info');
            }
        } catch (err) {
            console.error(err);
            setError('Error loading reconciliation logs');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitReconciliation = async (e) => {
        e.preventDefault();
        try {
            setError('');
            setSuccessMessage('');
            const payload = {
                date: targetDate,
                cashActual: Number(actual.cash || 0),
                upiActual: Number(actual.upi || 0),
                cardActual: Number(actual.card || 0),
                bankActual: Number(actual.bank || 0),
                notes
            };
            const res = await financeAPI.submitReconciliation(payload);
            if (res.success) {
                setSuccessMessage('Reconciliation log saved successfully!');
                fetchReconciliation();
            } else {
                setError(res.message || 'Failed to submit reconciliation log');
            }
        } catch (err) {
            console.error(err);
            setError('Error recording reconciliation values');
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0
        }).format(amount || 0);
    };

    // Computations
    const cashDiff = (expected.cash) - Number(actual.cash || 0);
    const upiDiff = (expected.upi) - Number(actual.upi || 0);
    const cardDiff = (expected.card) - Number(actual.card || 0);
    const bankDiff = (expected.bank) - Number(actual.bank || 0);

    const totalActual = Number(actual.cash || 0) + Number(actual.upi || 0) + Number(actual.card || 0) + Number(actual.bank || 0);
    const totalDiff = expected.total - totalActual;

    const isBalanced = totalDiff === 0 && cashDiff === 0 && upiDiff === 0 && cardDiff === 0 && bankDiff === 0;

    return (
        <div className="reconciliation-page">
            <header className="page-header">
                <div>
                    <h1>Payment Reconciliation</h1>
                    <p>Audit system invoice collections against bank deposits and physical drawer cash counts</p>
                </div>
            </header>

            {error && <div className="error-message">⚠️ {error}</div>}
            {successMessage && <div className="success-message">🎉 {successMessage}</div>}

            <div className="reconciliation-layout">
                {/* Inputs & Form */}
                <div className="form-panel card-box">
                    <div className="panel-header">
                        <h3>Reconciliation Form</h3>
                        <div className="date-picker-group">
                            <label>Target Date:</label>
                            <input 
                                type="date" 
                                value={targetDate} 
                                max={today}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setTargetDate(val > today ? today : val);
                                }}
                                className="recon-date-picker"
                            />
                        </div>
                    </div>

                    {loading ? (
                        <div className="loading-message">⏳ Verifying ledger collection data...</div>
                    ) : (
                        <form onSubmit={handleSubmitReconciliation}>
                            {existingRecord && (
                                <div className="reconciled-badge">
                                    <span>✅ Already Reconciled on this date by {existingRecord.reconciledByName} ({existingRecord.status})</span>
                                </div>
                            )}

                            <div className="recon-grid">
                                <div className="recon-header-row">
                                    <span>Method</span>
                                    <span>Expected</span>
                                    <span>Actual Counted *</span>
                                    <span>Difference</span>
                                </div>

                                {/* Cash */}
                                <div className="recon-row">
                                    <span className="method-label">💵 Cash</span>
                                    <span className="expected-val">{formatCurrency(expected.cash)}</span>
                                    <input 
                                        type="number" 
                                        required 
                                        placeholder="0"
                                        value={actual.cash}
                                        onChange={(e) => setActual({...actual, cash: e.target.value})}
                                    />
                                    <span className={`diff-val ${cashDiff === 0 ? 'balanced' : 'discrepancy'}`}>
                                        {cashDiff === 0 ? 'Balanced' : formatCurrency(cashDiff)}
                                    </span>
                                </div>

                                {/* UPI */}
                                <div className="recon-row">
                                    <span className="method-label">📱 UPI</span>
                                    <span className="expected-val">{formatCurrency(expected.upi)}</span>
                                    <input 
                                        type="number" 
                                        required 
                                        placeholder="0"
                                        value={actual.upi}
                                        onChange={(e) => setActual({...actual, upi: e.target.value})}
                                    />
                                    <span className={`diff-val ${upiDiff === 0 ? 'balanced' : 'discrepancy'}`}>
                                        {upiDiff === 0 ? 'Balanced' : formatCurrency(upiDiff)}
                                    </span>
                                </div>

                                {/* Card */}
                                <div className="recon-row">
                                    <span className="method-label">💳 Card</span>
                                    <span className="expected-val">{formatCurrency(expected.card)}</span>
                                    <input 
                                        type="number" 
                                        required 
                                        placeholder="0"
                                        value={actual.card}
                                        onChange={(e) => setActual({...actual, card: e.target.value})}
                                    />
                                    <span className={`diff-val ${cardDiff === 0 ? 'balanced' : 'discrepancy'}`}>
                                        {cardDiff === 0 ? 'Balanced' : formatCurrency(cardDiff)}
                                    </span>
                                </div>

                                {/* Bank */}
                                <div className="recon-row">
                                    <span className="method-label">🏦 Bank Transfer</span>
                                    <span className="expected-val">{formatCurrency(expected.bank)}</span>
                                    <input 
                                        type="number" 
                                        required 
                                        placeholder="0"
                                        value={actual.bank}
                                        onChange={(e) => setActual({...actual, bank: e.target.value})}
                                    />
                                    <span className={`diff-val ${bankDiff === 0 ? 'balanced' : 'discrepancy'}`}>
                                        {bankDiff === 0 ? 'Balanced' : formatCurrency(bankDiff)}
                                    </span>
                                </div>

                                {/* Totals */}
                                <div className="recon-totals-row">
                                    <span className="bold">Total Collections</span>
                                    <span className="bold">{formatCurrency(expected.total)}</span>
                                    <span className="bold">{formatCurrency(totalActual)}</span>
                                    <span className={`bold ${totalDiff === 0 ? 'balanced' : 'discrepancy'}`}>
                                        {totalDiff === 0 ? 'Balanced' : formatCurrency(totalDiff)}
                                    </span>
                                </div>
                            </div>

                            <div className="form-group notes-field">
                                <label>Reconciliation Audit Notes / Discrepancy Reasons</label>
                                <textarea 
                                    placeholder="Provide explanations if any difference occurs"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                />
                            </div>

                            <button type="submit" className="primary-action-btn submit-recon-btn">
                                Save Reconciliation Log
                            </button>
                        </form>
                    )}
                </div>

                {/* Info Card / Instructions */}
                <div className="info-panel card-box">
                    <h3>💡 Reconciliation Instructions</h3>
                    <p>Reconciliation compares the total payments processed by clinical staff inside the application against your physical cash/bank bank records.</p>
                    <ul>
                        <li>Select the target audit date using the date picker.</li>
                        <li>Audit the daily drawer cash, credit card transaction terminal printouts, UPI settlement screen logs, and hospital bank statements.</li>
                        <li>Key in the actual counted sums for each category.</li>
                        <li>Verify that the status is "Balanced". If a discrepancy exists, input justification notes for subsequent auditor reviews.</li>
                    </ul>
                    <div className={`recon-summary-status ${isBalanced ? 'balanced' : 'discrepancy'}`}>
                        <div className="status-label">Overall Status</div>
                        <div className="status-value">{isBalanced ? 'BALANCED' : 'DISCREPANCY'}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Reconciliation;
