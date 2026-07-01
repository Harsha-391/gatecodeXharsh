import React, { useState, useEffect } from 'react';
import { billingAPI } from '../../utils/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { loadActiveTemplate } from '../../utils/documentTemplateHelper';
import {
    FiPrinter, FiSearch, FiDownload, FiMail, FiFileText,
    FiAlertCircle, FiRefreshCw, FiFilter
} from 'react-icons/fi';
import './ReceiptReprint.css';

const TEMPLATE_COLORS = {
    'Classic Navy': '#0a2647',
    'Teal Grace':   '#14b8a6',
    'Sleek Dark':   '#0f172a',
};

const getTemplateColor = () => {
    const t = localStorage.getItem('billing_invoice_template') || 'Classic Navy';
    return { name: t, hex: TEMPLATE_COLORS[t] || '#0a2647' };
};

const fmt = (n) => 'INR ' + Number(n || 0).toLocaleString('en-IN');
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const SEARCH_TYPES = [
    { label: 'Invoice #',   field: 'invoiceNumber' },
    { label: 'Receipt #',   field: 'receiptNumber' },
    { label: 'MRN / PID',   field: 'mrn' },
    { label: 'Mobile',      field: 'mobile' },
    { label: 'Patient Name', field: 'name' },
];

const ReceiptReprint = () => {
    const [allInvoices, setAllInvoices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchType, setSearchType] = useState('invoiceNumber');
    const [searchQ, setSearchQ] = useState('');
    const [results, setResults] = useState(null); // null = not searched yet
    const [toast, setToast] = useState({ msg: '', type: '' });
    const [theme, setTheme] = useState(getTemplateColor);

    useEffect(() => {
        setTheme(getTemplateColor());
        loadInvoices();
    }, []);

    const loadInvoices = async () => {
        setLoading(true);
        try {
            const res = await billingAPI.getInvoices();
            if (res.success) setAllInvoices(res.invoices || []);
        } catch (e) {
            console.error('Failed to load invoices:', e);
        } finally {
            setLoading(false);
        }
    };

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast({ msg: '', type: '' }), 3000);
    };

    const handleSearch = (e) => {
        e.preventDefault();
        const q = searchQ.trim().toLowerCase();
        if (!q) { setResults([]); return; }

        // Flatten invoices + receipts for search
        const matched = [];
        allInvoices.forEach(inv => {
            // Build receipt rows from payments
            const receipts = (inv.payments || []).map(p => ({
                invoiceNumber: inv.invoiceNumber,
                invoiceId: inv._id,
                patientName: inv.patientName,
                patientMrn: inv.patientId,
                receiptNumber: p.receiptNumber,
                amount: p.amount,
                method: p.method,
                reference: p.reference,
                date: p.date,
                collectedByName: p.collectedByName,
                invoice: inv,
                payment: p,
            }));

            receipts.forEach(r => {
                let match = false;
                if (searchType === 'invoiceNumber' && r.invoiceNumber?.toLowerCase().includes(q)) match = true;
                if (searchType === 'receiptNumber' && r.receiptNumber?.toLowerCase().includes(q)) match = true;
                if (searchType === 'mrn' && (String(r.patientMrn || '').toLowerCase().includes(q))) match = true;
                if (searchType === 'mobile') match = false; // mobile not in invoice — handled below
                if (searchType === 'name' && r.patientName?.toLowerCase().includes(q)) match = true;
                if (match) matched.push(r);
            });

            // If invoice itself has no payments but matches invoice#
            if (searchType === 'invoiceNumber' && inv.invoiceNumber?.toLowerCase().includes(q) && receipts.length === 0) {
                matched.push({
                    invoiceNumber: inv.invoiceNumber,
                    invoiceId: inv._id,
                    patientName: inv.patientName,
                    receiptNumber: '—',
                    amount: inv.grandTotal,
                    method: '—',
                    date: inv.invoiceDate,
                    invoice: inv,
                    payment: null,
                });
            }
        });

        setResults(matched);
    };

    // Convert hex to RGB array for jsPDF
    const hexToRgb = (hex) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return [r, g, b];
    };

    const downloadReceiptPDF = async (row) => {
        const { invoice, payment } = row;
        const doc = new jsPDF();
        
        let template = null;
        let bgBase64 = null;
        try {
            const tempResult = await loadActiveTemplate('billing_payment');
            template = tempResult.template;
            bgBase64 = tempResult.bgBase64;
        } catch (err) {
            console.error('Error loading active receipt template:', err);
        }

        const pageW = 210;
        const pageH = 297;
        let y = template ? (template.headerHeight || 50) : 48;
        const leftM = template ? (template.leftMargin || 15) : 14;
        const rightM = template ? (template.rightMargin || 15) : 14;
        const printW = pageW - leftM - rightM;

        if (bgBase64) {
            doc.addImage(bgBase64, 'PNG', 0, 0, pageW, pageH);
        }

        const pc = hexToRgb(theme.hex);

        if (!template) {
            doc.setFillColor(...pc);
            doc.rect(0, 0, pageW, 40, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(20);
            doc.text('PAYMENT RECEIPT', 14, 22);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.text(`Receipt No: ${row.receiptNumber}`, pageW - 14, 16, { align: 'right' });
            doc.text(`Invoice: ${invoice.invoiceNumber}`, pageW - 14, 24, { align: 'right' });
            y = 52;
        } else {
            doc.setTextColor(...pc);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(16);
            doc.text('PAYMENT RECEIPT', leftM, y);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.text(`Receipt No: ${row.receiptNumber}`, pageW - rightM, y, { align: 'right' });
            doc.text(`Invoice: ${invoice.invoiceNumber}`, pageW - rightM, y + 6, { align: 'right' });
            y += 14;
        }

        doc.setTextColor(15, 23, 42);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('PATIENT', leftM, y);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        doc.text(`${invoice.patientName}`, leftM, y + 8);
        doc.text(`Date: ${fmtDateTime(payment?.date || invoice.invoiceDate)}`, leftM, y + 16);

        if (payment) {
            y += 28;
            autoTable(doc, {
                startY: y,
                head: [['Description', 'Method', 'Reference', 'Amount']],
                body: [[
                    `Settlement on ${invoice.invoiceNumber}`,
                    payment.method,
                    payment.reference || 'N/A',
                    fmt(payment.amount)
                ]],
                headStyles: { fillColor: pc },
                bodyStyles: { fontSize: 9 },
                margin: { left: leftM, right: rightM },
            });
            y = doc.lastAutoTable.finalY + 12;
        }

        autoTable(doc, {
            startY: y,
            body: [
                ['Invoice Total', fmt(invoice.grandTotal)],
                ['Amount Paid', fmt(invoice.amountPaid)],
                ['Outstanding', fmt(invoice.outstandingAmount)],
                ['Status', invoice.paymentStatus],
            ],
            bodyStyles: { fontSize: 9 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: printW - 40 }, 1: { halign: 'right', fontStyle: 'bold' } },
            margin: { left: leftM, right: rightM },
        });

        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text('This is a system-generated receipt.', leftM, 285);

        doc.save(`Receipt-${row.receiptNumber || invoice.invoiceNumber}.pdf`);
        showToast('Receipt downloaded successfully');
    };

    const handleEmailReceipt = (row) => {
        showToast(`Email feature: receipt would be sent to patient's registered email`, 'info');
    };

    return (
        <div className="receipt-reprint-page">
            {toast.msg && (
                <div className={`rr-toast rr-toast-${toast.type}`}>{toast.msg}</div>
            )}

            {/* Header */}
            <div className="rr-header">
                <div className="rr-header-left">
                    <div className="rr-header-icon" style={{ background: `linear-gradient(135deg, ${theme.hex}, ${theme.hex}cc)` }}><FiPrinter /></div>
                    <div>
                        <h1>Receipt Reprint</h1>
                        <p>Search and reprint payment receipts by invoice, receipt number, MRN, or patient details</p>
                        <span className="rr-theme-pill" style={{ background: `${theme.hex}18`, color: theme.hex, border: `1px solid ${theme.hex}44` }}>
                            🎨 {theme.name} theme active
                        </span>
                    </div>
                </div>
                <button className="rr-btn-refresh" onClick={loadInvoices} disabled={loading} style={{ '--hover-color': theme.hex }}>
                    <FiRefreshCw /> Refresh
                </button>
            </div>

            {/* Search Panel */}
            <div className="rr-search-panel">
                <div className="rr-search-type-tabs">
                    {SEARCH_TYPES.map(st => (
                        <button
                            key={st.field}
                            className={`rr-type-tab${searchType === st.field ? ' active' : ''}`}
                            style={searchType === st.field ? { background: theme.hex, borderColor: theme.hex, color: '#fff' } : {}}
                            onClick={() => { setSearchType(st.field); setResults(null); setSearchQ(''); }}
                        >
                            {st.label}
                        </button>
                    ))}
                </div>
                <form onSubmit={handleSearch} className="rr-search-form">
                    <div className="rr-search-input" style={{ '--focus-color': theme.hex }}>
                        <FiSearch />
                        <input
                            key={searchType}
                            value={searchQ}
                            onChange={e => setSearchQ(e.target.value)}
                            placeholder={`Enter ${SEARCH_TYPES.find(s => s.field === searchType)?.label}...`}
                            autoFocus
                        />
                    </div>
                    <button type="submit" className="rr-search-btn" style={{ background: `linear-gradient(135deg, ${theme.hex}, ${theme.hex}cc)` }}>Search Receipts</button>
                </form>
            </div>

            {/* Stats */}
            <div className="rr-stats-row">
                {[
                    { label: 'Total Invoices', val: allInvoices.length },
                    { label: 'Total Receipts', val: allInvoices.reduce((s, inv) => s + (inv.payments?.length || 0), 0) },
                    { label: 'Total Collected', val: fmt(allInvoices.reduce((s, inv) => s + (inv.amountPaid || 0), 0)), wide: true },
                ].map((s, i) => (
                    <div key={i} className={`rr-stat-card${s.wide ? ' rr-stat-wide' : ''}`}>
                        <span className="rr-stat-label">{s.label}</span>
                        <strong style={{ color: theme.hex }}>{s.val}</strong>
                    </div>
                ))}
            </div>

            {/* Results */}
            <div className="rr-results-area">
                {loading ? (
                    <div className="rr-loading">Loading invoices...</div>
                ) : results === null ? (
                    <div className="rr-prompt">
                        <FiPrinter />
                        <p>Enter search criteria above to find receipts.</p>
                        <span>You can search by Invoice #, Receipt #, MRN, Mobile, or Patient Name.</span>
                    </div>
                ) : results.length === 0 ? (
                    <div className="rr-empty">
                        <FiAlertCircle />
                        <p>No receipts found for "<strong>{searchQ}</strong>"</p>
                        <span>Try a different search term or search type.</span>
                    </div>
                ) : (
                    <>
                        <div className="rr-results-header">
                            <span>{results.length} receipt{results.length !== 1 ? 's' : ''} found</span>
                        </div>
                        <div className="rr-results-list">
                            {results.map((row, idx) => (
                                <div key={idx} className="rr-receipt-card">
                                    <div className="rr-receipt-left">
                                        <div className="rr-receipt-nums">
                                            <span className="rr-receipt-num" style={{ color: theme.hex, background: `${theme.hex}14` }}>
                                                <FiFileText /> {row.receiptNumber !== '—' ? row.receiptNumber : row.invoiceNumber}
                                            </span>
                                            {row.receiptNumber !== '—' && (
                                                <span className="rr-invoice-ref">Invoice: {row.invoiceNumber}</span>
                                            )}
                                        </div>
                                        <div className="rr-receipt-patient">
                                            <strong>{row.patientName}</strong>
                                            <span>{fmtDateTime(row.date)}</span>
                                        </div>
                                        {row.payment && (
                                            <div className="rr-receipt-meta">
                                                <span className="rr-method-badge">{row.method}</span>
                                                {row.reference && <span className="rr-ref">Ref: {row.reference}</span>}
                                                {row.collectedByName && <span className="rr-by">By: {row.collectedByName}</span>}
                                            </div>
                                        )}
                                    </div>
                                    <div className="rr-receipt-right">
                                        <strong className="rr-amount">{fmt(row.amount)}</strong>
                                        <div className="rr-action-btns">
                                            <button className="rr-act-btn rr-act-download" onClick={() => downloadReceiptPDF(row)}>
                                                <FiDownload /> Download PDF
                                            </button>
                                            <button className="rr-act-btn rr-act-print" onClick={() => downloadReceiptPDF(row)}>
                                                <FiPrinter /> Print
                                            </button>
                                            <button className="rr-act-btn rr-act-email" onClick={() => handleEmailReceipt(row)}>
                                                <FiMail /> Email
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default ReceiptReprint;
