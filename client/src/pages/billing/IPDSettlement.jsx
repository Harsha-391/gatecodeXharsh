import React, { useState, useEffect } from 'react';
import { billingAPI, admissionAPI, receptionAPI } from '../../utils/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    FiHome, FiSearch, FiFileText, FiDollarSign, FiAlertCircle,
    FiCheckCircle, FiPrinter, FiX, FiActivity
} from 'react-icons/fi';
import './IPDSettlement.css';

const TEMPLATE_COLORS = {
    'Classic Navy': '#0a2647',
    'Teal Grace':   '#14b8a6',
    'Sleek Dark':   '#0f172a',
};

const getTemplateColor = () => {
    const t = localStorage.getItem('billing_invoice_template') || 'Classic Navy';
    return { name: t, hex: TEMPLATE_COLORS[t] || '#0a2647' };
};

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const IPDSettlement = () => {
    const [searchQ, setSearchQ] = useState('');
    const [patient, setPatient] = useState(null);
    const [billing, setBilling] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [theme, setTheme] = useState(getTemplateColor);

    useEffect(() => {
        setTheme(getTemplateColor());
    }, []);

    // Payment collection
    const [payModal, setPayModal] = useState(false);
    const [payAmount, setPayAmount] = useState(0);
    const [payMethod, setPayMethod] = useState('Cash');
    const [payRef, setPayRef] = useState('');
    const [activeInvoice, setActiveInvoice] = useState(null);
    const [paying, setPaying] = useState(false);

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchQ.trim()) return;
        setLoading(true);
        setError('');
        setPatient(null);
        setBilling(null);
        try {
            const res = await billingAPI.getPatientBills(searchQ.trim());
            if (res.success) {
                // Only show patients with admissions
                const hasAdmissions = (res.billing?.admissions || []).length > 0;
                if (!hasAdmissions) {
                    setError('No IPD admission records found for this patient.');
                } else {
                    setPatient(res.patient);
                    setBilling(res.billing);
                }
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Patient not found');
        } finally {
            setLoading(false);
        }
    };

    // Calculate totals
    const calcAdmissionCharges = () => {
        if (!billing) return 0;
        return (billing.admissions || []).reduce((s, a) => s + (a.totalAmount || 0), 0);
    };
    const calcLabCharges = () => {
        if (!billing) return 0;
        return (billing.labReports || []).reduce((s, l) => s + (l.amount || 0), 0);
    };
    const calcPharmacyCharges = () => {
        if (!billing) return 0;
        return (billing.pharmacyOrders || []).reduce((s, p) => s + (p.totalAmount || 0), 0);
    };
    const calcDoctorCharges = () => {
        if (!billing) return 0;
        return (billing.appointments || []).reduce((s, a) => s + (a.amount || 0), 0);
    };
    const calcFacilityCharges = () => {
        if (!billing) return 0;
        return (billing.facilityCharges || []).reduce((s, f) => s + (f.totalAmount || 0), 0);
    };
    const calcTotalPaid = () => {
        if (!billing) return 0;
        return (billing.invoices || []).reduce((s, inv) => s + (inv.amountPaid || 0), 0);
    };
    const calcGrandTotal = () =>
        calcAdmissionCharges() + calcLabCharges() + calcPharmacyCharges() + calcDoctorCharges() + calcFacilityCharges();
    const calcBalance = () => Math.max(0, calcGrandTotal() - calcTotalPaid());

    const openPayModal = (invoice) => {
        setActiveInvoice(invoice);
        setPayAmount(invoice.outstandingAmount || 0);
        setPayMethod('Cash');
        setPayRef('');
        setPayModal(true);
    };

    const handleCollect = async (e) => {
        e.preventDefault();
        if (payAmount <= 0 || !activeInvoice) return;
        setPaying(true);
        try {
            const res = await billingAPI.collectInvoicePayment(activeInvoice._id, {
                amount: payAmount,
                method: payMethod,
                reference: payRef
            });
            if (res.success) {
                setSuccess(`Payment of ${fmt(payAmount)} collected successfully.`);
                setPayModal(false);
                const reload = await billingAPI.getPatientBills(patient.mrn || patient.patientId);
                if (reload.success) setBilling(reload.billing);
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Payment failed');
        } finally {
            setPaying(false);
        }
    };

    const hexToRgb = (hex) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return [r, g, b];
    };

    const generateSettlementPDF = () => {
        if (!patient || !billing) return;
        const doc = new jsPDF();
        const pc = hexToRgb(theme.hex);
        const pw = doc.internal.pageSize.getWidth();

        doc.setFillColor(...pc);
        doc.rect(0, 0, pw, 42, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('IPD FINAL SETTLEMENT', 14, 20);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Generated: ${fmtDateTime(new Date())}`, 14, 30);
        doc.text('SETTLEMENT INVOICE', pw - 14, 20, { align: 'right' });

        // Patient Info
        let y = 52;
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('PATIENT INFORMATION', 14, y);
        y += 6;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        doc.text(`Name: ${patient.name}   |   MRN: ${patient.mrn || patient.patientId}   |   Phone: ${patient.phone || '—'}`, 14, y);
        y += 14;

        // Admissions table
        const admissions = billing.admissions || [];
        if (admissions.length > 0) {
            doc.setTextColor(...pc);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.text('IPD ADMISSION CHARGES', 14, y); y += 4;
            autoTable(doc, {
                startY: y,
                head: [['Admission Date', 'Ward', 'Bed', 'Duration', 'Status', 'Amount']],
                body: admissions.map(a => [
                    fmtDate(a.admissionDate), a.ward || '—', a.bedNumber || '—',
                    a.daysStayed ? `${a.daysStayed} days` : '—',
                    a.status, fmt(a.totalAmount || 0)
                ]),
                headStyles: { fillColor: pc, fontSize: 8 },
                bodyStyles: { fontSize: 8 },
                margin: { left: 14, right: 14 },
            });
            y = doc.lastAutoTable.finalY + 6;
        }

        // Summary table
        doc.setTextColor(...pc);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('FINANCIAL SUMMARY', 14, y); y += 4;
        autoTable(doc, {
            startY: y,
            body: [
                ['Admission / Room Charges', fmt(calcAdmissionCharges())],
                ['Doctor Consultation Charges', fmt(calcDoctorCharges())],
                ['Laboratory Charges', fmt(calcLabCharges())],
                ['Pharmacy Charges', fmt(calcPharmacyCharges())],
                ['Facility Charges', fmt(calcFacilityCharges())],
                ['GRAND TOTAL', fmt(calcGrandTotal())],
                ['Amount Paid', fmt(calcTotalPaid())],
                ['BALANCE DUE', fmt(calcBalance())],
            ],
            headStyles: { fillColor: pc },
            bodyStyles: { fontSize: 9 },
            columnStyles: {
                0: { fontStyle: 'bold', cellWidth: 120 },
                1: { halign: 'right', fontStyle: 'bold' }
            },
            margin: { left: 14, right: 14 },
            didParseCell: (data) => {
                if (data.row.index === 5 || data.row.index === 7) {
                    data.cell.styles.fillColor = data.row.index === 7 ? [254, 226, 226] : [220, 252, 231];
                    data.cell.styles.textColor = data.row.index === 7 ? [153, 27, 27] : [21, 128, 61];
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        });

        doc.save(`Settlement-${patient.patientId || patient.name?.replace(/ /g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`);
    };

    return (
        <div className="ipd-settlement-page" style={{
            '--primary-color': theme.hex,
            '--primary-color-dark': theme.hex + 'cc',
            '--primary-color-fade': theme.hex + '33',
        }}>
            {/* Toast */}
            {(success || error) && (
                <div className={`ipd-toast ipd-toast-${success ? 'success' : 'error'}`} onClick={() => { setSuccess(''); setError(''); }}>
                    {success || error}
                </div>
            )}

            {/* Header */}
            <div className="ipd-header">
                <div className="ipd-header-left">
                    <div className="ipd-header-icon" style={{ background: `linear-gradient(135deg, ${theme.hex}, ${theme.hex}cc)` }}><FiHome /></div>
                    <div>
                        <h1>IPD Final Settlement</h1>
                        <p>Generate final bills and collect remaining dues for admitted patients</p>
                        <span className="ipd-theme-pill" style={{ background: `${theme.hex}18`, color: theme.hex, border: `1px solid ${theme.hex}44`, display: 'inline-block', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', marginTop: '6px', fontWeight: 600 }}>
                            🎨 {theme.name} theme active
                        </span>
                    </div>
                </div>
            </div>

            {/* Search */}
            <div className="ipd-search-card">
                <form onSubmit={handleSearch} className="ipd-search-form">
                    <div className="ipd-search-input-wrap" style={{ '--focus-color': theme.hex }}>
                        <FiSearch />
                        <input
                            value={searchQ}
                            onChange={e => setSearchQ(e.target.value)}
                            placeholder="Search admitted patient by MRN, name, phone, or invoice number..."
                        />
                    </div>
                    <button type="submit" disabled={loading} className="ipd-search-btn" style={{ background: `linear-gradient(135deg, ${theme.hex}, ${theme.hex}cc)`, boxShadow: `0 4px 12px ${theme.hex}33` }}>
                        {loading ? 'Searching...' : 'Find Patient'}
                    </button>
                </form>
                {error && !patient && (
                    <div className="ipd-search-error"><FiAlertCircle /> {error}</div>
                )}
            </div>

            {/* Settlement View */}
            {patient && billing && (
                <div className="ipd-content">
                    {/* Patient Identity Card */}
                    <div className="ipd-patient-card">
                        <div className="ipd-avatar" style={{ background: `linear-gradient(135deg, ${theme.hex}, ${theme.hex}cc)` }}>{patient.name?.charAt(0).toUpperCase()}</div>
                        <div className="ipd-patient-info">
                            <h2>{patient.name}</h2>
                            <div className="ipd-patient-meta">
                                <span>MRN: <strong>{patient.mrn || patient.patientId}</strong></span>
                                <span>Phone: <strong>{patient.phone || '—'}</strong></span>
                                <span>Gender: <strong>{patient.gender || '—'}</strong></span>
                                <span>Blood: <strong>{patient.bloodGroup || '—'}</strong></span>
                            </div>
                        </div>
                        <div className="ipd-patient-actions">
                            <button className="ipd-btn-pdf" onClick={generateSettlementPDF} style={{ '--hover-bg': `${theme.hex}33` }}>
                                <FiPrinter /> Generate Settlement PDF
                            </button>
                        </div>
                    </div>

                    {/* Charge Breakdown */}
                    <div className="ipd-charges-grid">
                        {[
                            { label: 'Admission / Room', amount: calcAdmissionCharges(), icon: <FiHome />, color: theme.hex },
                            { label: 'Doctor Charges', amount: calcDoctorCharges(), icon: <FiActivity />, color: '#8b5cf6' },
                            { label: 'Laboratory', amount: calcLabCharges(), icon: <FiFileText />, color: '#14b8a6' },
                            { label: 'Pharmacy', amount: calcPharmacyCharges(), icon: <FiFileText />, color: '#10b981' },
                            { label: 'Facility', amount: calcFacilityCharges(), icon: <FiHome />, color: '#f59e0b' },
                        ].map((ch, i) => (
                            <div key={i} className="ipd-charge-card" style={{ borderTopColor: ch.color }}>
                                <div className="ipd-charge-icon" style={{ color: ch.color }}>{ch.icon}</div>
                                <span className="ipd-charge-label">{ch.label}</span>
                                <strong className="ipd-charge-amt">{fmt(ch.amount)}</strong>
                            </div>
                        ))}
                    </div>

                    {/* Financial Summary */}
                    <div className="ipd-summary-card">
                        <h3>Financial Summary</h3>
                        <div className="ipd-summary-rows">
                            <div className="ipd-summary-row">
                                <span>Grand Total</span>
                                <strong>{fmt(calcGrandTotal())}</strong>
                            </div>
                            <div className="ipd-summary-row ipd-paid-row">
                                <span><FiCheckCircle /> Amount Paid</span>
                                <strong style={{ color: '#10b981' }}>{fmt(calcTotalPaid())}</strong>
                            </div>
                            <div className="ipd-summary-row ipd-balance-row">
                                <span><FiDollarSign /> Balance Due</span>
                                <strong style={{ color: calcBalance() > 0 ? '#ef4444' : '#10b981' }}>
                                    {fmt(calcBalance())}
                                </strong>
                            </div>
                        </div>
                    </div>

                    {/* Invoices */}
                    <div className="ipd-invoices-section">
                        <h3>Invoices & Payments</h3>
                        {(billing.invoices || []).length === 0 ? (
                            <div className="ipd-no-invoices">No invoices generated yet. Go to Patient Billing to create invoices.</div>
                        ) : (
                            <div className="ipd-invoice-list">
                                {(billing.invoices || []).map(inv => (
                                    <div key={inv._id} className="ipd-invoice-row">
                                        <div className="ipd-inv-info">
                                            <strong className="ipd-inv-num" style={{ color: theme.hex }}>{inv.invoiceNumber}</strong>
                                            <span>{fmtDate(inv.invoiceDate)}</span>
                                        </div>
                                        <div className="ipd-inv-amounts">
                                            <span>Total: <strong>{fmt(inv.grandTotal)}</strong></span>
                                            <span>Paid: <strong style={{ color: '#10b981' }}>{fmt(inv.amountPaid)}</strong></span>
                                            <span>Due: <strong style={{ color: inv.outstandingAmount > 0 ? '#ef4444' : '#10b981' }}>{fmt(inv.outstandingAmount)}</strong></span>
                                        </div>
                                        <div className="ipd-inv-status-badge" data-status={inv.paymentStatus}>
                                            {inv.paymentStatus}
                                        </div>
                                        {inv.outstandingAmount > 0 && inv.paymentStatus !== 'Cancelled' && (
                                            <button className="ipd-collect-btn" onClick={() => openPayModal(inv)} style={{ background: `linear-gradient(135deg, ${theme.hex}, ${theme.hex}cc)` }}>
                                                <FiDollarSign /> Collect Payment
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Admission Details */}
                    <div className="ipd-admissions-section">
                        <h3>Admission Records</h3>
                        <div className="ipd-adm-table-wrap">
                            <table className="ipd-adm-table">
                                <thead>
                                    <tr>
                                        <th>Admit Date</th>
                                        <th>Ward</th>
                                        <th>Bed</th>
                                        <th>Status</th>
                                        <th>Payment</th>
                                        <th>Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(billing.admissions || []).map(a => (
                                        <tr key={a._id}>
                                            <td>{fmtDate(a.admissionDate)}</td>
                                            <td>{a.ward || '—'}</td>
                                            <td>{a.bedNumber || '—'}</td>
                                            <td><span className={`ipd-status-pill ipd-status-${(a.status||'').toLowerCase()}`}>{a.status}</span></td>
                                            <td><span className={`ipd-status-pill ipd-pay-${(a.paymentStatus||'pending').toLowerCase()}`}>{a.paymentStatus || 'Pending'}</span></td>
                                            <td><strong>{fmt(a.totalAmount || 0)}</strong></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Payment Collection Modal */}
            {payModal && activeInvoice && (
                <div className="ipd-modal-overlay" onClick={() => setPayModal(false)}>
                    <div className="ipd-modal" onClick={e => e.stopPropagation()}>
                        <div className="ipd-modal-header">
                            <h2><FiDollarSign /> Collect Remaining Payment</h2>
                            <button onClick={() => setPayModal(false)}><FiX /></button>
                        </div>
                        <form onSubmit={handleCollect} className="ipd-modal-form">
                            <div className="ipd-modal-invoice-info">
                                <span>Invoice: <strong>{activeInvoice.invoiceNumber}</strong></span>
                                <span>Outstanding: <strong style={{ color: '#ef4444' }}>{fmt(activeInvoice.outstandingAmount)}</strong></span>
                            </div>
                            <div className="ipd-form-group">
                                <label>Amount to Collect (₹)</label>
                                <input type="number" value={payAmount} onChange={e => setPayAmount(parseFloat(e.target.value) || 0)} min="1" required />
                            </div>
                            <div className="ipd-form-group">
                                <label>Payment Method</label>
                                <select value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                                    {['Cash', 'UPI', 'Card', 'Bank Transfer', 'Insurance', 'Cheque'].map(m => (
                                        <option key={m}>{m}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="ipd-form-group">
                                <label>Reference / Transaction ID</label>
                                <input value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="Optional reference number" />
                            </div>
                            <div className="ipd-modal-footer">
                                <button type="button" className="ipd-btn-cancel" onClick={() => setPayModal(false)}>Cancel</button>
                                <button type="submit" className="ipd-btn-collect" disabled={paying} style={{ background: `linear-gradient(135deg, ${theme.hex}, ${theme.hex}cc)` }}>
                                    {paying ? 'Processing...' : `Collect ${fmt(payAmount)}`}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default IPDSettlement;
