import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { billingAPI, admissionAPI, receptionAPI } from '../../utils/api';
import { useAuth } from '../../store/hooks';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    FiHome, FiUsers, FiClipboard, FiFileText, FiPlusSquare,
    FiDatabase, FiLogOut, FiGrid, FiPieChart, FiSettings, FiSearch, FiPrinter
} from 'react-icons/fi';
import './BillingDashboard.css';


const getAdmAmt = (a) => {
    if (!a) return 0;
    if (a.totalAmount > 0) return a.totalAmount;
    const days = Math.max(1, Math.floor((new Date() - new Date(a.admissionDate)) / (1000 * 60 * 60 * 24)));
    return (a.dailyWardCharge || 0) * days;
};

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const BillingDashboard = ({ tab }) => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const activeTab = tab || searchParams.get('tab') || 'dashboard';
    
    const { user } = useAuth();
    const userRole = (user?.role || '').toLowerCase();
    const isReceptionist = userRole === 'receptionist' || userRole === 'reception';
    const isBillingUser = ['cashier', 'billing', 'billing executive', 'billing manager', 'senior billing officer'].includes(userRole);
    const isAccountant = userRole === 'accountant';

    useEffect(() => {
        if (isReceptionist && ['dashboard', 'reports', 'analytics', 'templates', 'settings', 'history'].includes(activeTab)) {
            navigate('/billing/patient', { replace: true });
        } else if (isBillingUser && ['reports', 'analytics'].includes(activeTab)) {
            navigate('/billing/dashboard', { replace: true });
        } else if (isAccountant && ['patient', 'pending', 'invoices', 'collect', 'history', 'refunds'].includes(activeTab)) {
            navigate('/billing/dashboard', { replace: true });
        }
    }, [activeTab, isReceptionist, isBillingUser, isAccountant, navigate]);

    // Global States
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Patient Billing States
    const [searchQuery, setSearchQuery] = useState('');
    const [patient, setPatient] = useState(null);
    const [billing, setBilling] = useState(null);
    const [selectedItems, setSelectedItems] = useState({ appointments: [], labReports: [], pharmacyOrders: [], facilityCharges: [], admissions: [] });
    const [paymentMode, setPaymentMode] = useState('Cash');
    const [payReference, setPayReference] = useState('');
    const [payModal, setPayModal] = useState(false);
    const [payAmount, setPayAmount] = useState(0);
    const [activeInvoice, setActiveInvoice] = useState(null);
    const [paying, setPaying] = useState(false);
    const [generatingInvoice, setGeneratingInvoice] = useState(false);

    // Invoices list state
    const [invoices, setInvoices] = useState([]);
    const [invoiceSearch, setInvoiceSearch] = useState('');

    // Refunds state
    const [refunds, setRefunds] = useState([]);
    const [refundModal, setRefundModal] = useState(false);
    const [refundForm, setRefundForm] = useState({ 
        type: 'Manual Refund', 
        amount: 0, 
        reason: '', 
        itemId: '', 
        invoiceNumber: '',
        patientId: '',
        patientName: '',
        patientPhone: ''
    });
    const [submittingRefund, setSubmittingRefund] = useState(false);

    // Patient selection in modal
    const [modalSearchQuery, setModalSearchQuery] = useState('');
    const [modalSearchResults, setModalSearchResults] = useState([]);
    const [selectedModalPatient, setSelectedModalPatient] = useState(null);

    useEffect(() => {
        if (refundModal) {
            // ONLY pre-populate the patient if we are on the 'patient' tab (viewing a specific patient's profile)
            if (activeTab === 'patient' && patient) {
                setSelectedModalPatient(patient);
                setRefundForm({
                    patientId: patient._id,
                    patientName: patient.name,
                    patientPhone: patient.phone || '',
                    type: 'Manual Refund',
                    amount: 0,
                    reason: '',
                    itemId: '',
                    invoiceNumber: ''
                });
            } else {
                setSelectedModalPatient(null);
                setModalSearchQuery('');
                setModalSearchResults([]);
                setRefundForm({
                    patientId: '',
                    patientName: '',
                    patientPhone: '',
                    type: 'Manual Refund',
                    amount: 0,
                    reason: '',
                    itemId: '',
                    invoiceNumber: ''
                });
            }
        }
    }, [refundModal, patient, activeTab]);

    // Reports state
    const [reports, setReports] = useState({ type: 'daily', records: [] });
    const [generatingReport, setGeneratingReport] = useState(false);

    // Activity log state
    const [activityLogs, setActivityLogs] = useState([]);

    // Settings state
    const [settings, setSettings] = useState({
        invoicePrefix: 'INV',
        receiptPrefix: 'REC',
        taxRate: 5,
        hospitalName: 'Admit Hospital',
        hospitalAddress: '12-B, Nehru Place, New Delhi',
        hospitalPhone: '+91 99999 88888',
        currency: 'INR'
    });

    // Templates state
    const [activeTemplate, setActiveTemplate] = useState('Classic Navy');

    useEffect(() => {
        fetchAnalytics();
        if (['invoices', 'history', 'pending', 'reports'].includes(activeTab)) {
            fetchInvoices();
        }
        if (activeTab === 'refunds') fetchRefunds();
        if (activeTab === 'settings') loadSettings();
        if (activeTab === 'history' || activeTab === 'dashboard') fetchLogs();
        
        // Clear active patient profile context if we navigate away from patient tab
        if (activeTab !== 'patient') {
            setPatient(null);
            setBilling(null);
        }
    }, [activeTab]);

    // When invoices load for the reports tab, generate the report
    useEffect(() => {
        if (activeTab === 'reports' && invoices.length > 0) {
            triggerReport('daily');
        }
    }, [invoices, activeTab]);

    // Automatically trigger lookup if search query passed via search parameter
    useEffect(() => {
        const queryParam = searchParams.get('search') || searchParams.get('mrn') || searchParams.get('patientId') || searchParams.get('q');
        if (queryParam && activeTab === 'patient') {
            setSearchQuery(queryParam);
            performPatientLookup(queryParam);
        }
    }, [searchParams, activeTab]);

    const fetchAnalytics = async () => {
        try {
            setLoading(true);
            const res = await billingAPI.getBillingAnalytics();
            if (res.success) {
                setAnalytics(res.analytics);
            }
        } catch (err) {
            console.error('Error fetching analytics:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchInvoices = async () => {
        try {
            const res = await billingAPI.getInvoices();
            if (res.success) {
                setInvoices(res.invoices);
            }
        } catch (err) {
            console.error('Error fetching invoices:', err);
        }
    };

    const fetchRefunds = async () => {
        try {
            const res = await billingAPI.getRefunds();
            if (res.success) {
                setRefunds(res.refunds);
            }
        } catch (err) {
            console.error('Error fetching refunds:', err);
        }
    };

    const fetchLogs = async () => {
        try {
            const res = await billingAPI.getActivityLogs();
            if (res.success) {
                setActivityLogs(res.logs);
            }
        } catch (err) {
            console.error('Error fetching logs:', err);
        }
    };

    const loadSettings = () => {
        const stored = localStorage.getItem('billing_settings');
        if (stored) {
            setSettings(JSON.parse(stored));
        }
    };

    const saveSettings = (e) => {
        e.preventDefault();
        localStorage.setItem('billing_settings', JSON.stringify(settings));
        setSuccess('Billing configurations saved successfully.');
    };

    // Patient Lookup & Billing Summary
    async function performPatientLookup(queryStr) {
        if (!queryStr || !queryStr.trim()) return;
        setLoading(true);
        setError('');
        setSuccess('');
        setPatient(null);
        setBilling(null);
        setSelectedItems({ appointments: [], labReports: [], pharmacyOrders: [], facilityCharges: [], admissions: [] });
        try {
            const res = await billingAPI.getPatientBills(queryStr.trim());
            if (res.success) {
                setPatient(res.patient);
                setBilling(res.billing);
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Patient not found');
        } finally {
            setLoading(false);
        }
    }

    const handlePatientSearch = async (e) => {
        e.preventDefault();
        performPatientLookup(searchQuery);
    };

    const toggleItem = (category, id) => {
        setSelectedItems(prev => {
            const list = prev[category];
            const exists = list.includes(id);
            return {
                ...prev,
                [category]: exists ? list.filter(x => x !== id) : [...list, id]
            };
        });
    };

    const getSelectedTotal = () => {
        if (!billing) return 0;
        let total = 0;
        billing.appointments.filter(a => selectedItems.appointments.includes(a._id)).forEach(a => total += (a.amount || 0));
        billing.labReports.filter(l => selectedItems.labReports.includes(l._id)).forEach(l => total += (l.amount || l.price || 0));
        billing.pharmacyOrders.filter(p => selectedItems.pharmacyOrders.includes(p._id)).forEach(p => total += (p.totalAmount || 0));
        billing.facilityCharges.filter(f => selectedItems.facilityCharges.includes(f._id)).forEach(f => total += (f.totalAmount || 0));
        billing.admissions.filter(a => selectedItems.admissions.includes(a._id)).forEach(a => total += getAdmAmt(a));
        return total;
    };

    const getPatientOutstanding = () => {
        if (!billing) return 0;
        let total = 0;
        billing.appointments.filter(a => a.paymentStatus !== 'Paid').forEach(a => total += (a.amount || 0));
        billing.labReports.filter(l => l.paymentStatus !== 'PAID').forEach(l => total += (l.amount || l.price || 0));
        billing.pharmacyOrders.filter(p => p.paymentStatus !== 'Paid').forEach(p => total += (p.totalAmount || 0));
        billing.facilityCharges.filter(f => f.paymentStatus !== 'Paid').forEach(f => total += (f.totalAmount || 0));
        billing.admissions.filter(a => a.paymentStatus !== 'Paid').forEach(a => total += getAdmAmt(a));
        return total;
    };

    // Generate Invoice
    const handleGenerateInvoice = async () => {
        if (!patient || !billing) return;
        const total = getSelectedTotal();
        if (total === 0) {
            alert('Please select at least one pending charge to invoice.');
            return;
        }

        setGeneratingInvoice(true);
        setError('');
        setSuccess('');

        // Prepare flat items
        const itemsList = [];
        billing.appointments.filter(a => selectedItems.appointments.includes(a._id)).forEach(a => {
            const isPrepaid = a.paymentStatus === 'Paid';
            itemsList.push({
                itemType: 'Consultation',
                itemId: a._id,
                name: `Consultation - ${a.doctorName || a.serviceName || 'OPD'}`,
                quantity: 1,
                unitPrice: a.amount || 0,
                prePaid: isPrepaid
            });
        });
        billing.labReports.filter(l => selectedItems.labReports.includes(l._id)).forEach(l => {
            itemsList.push({
                itemType: 'Laboratory',
                itemId: l._id,
                name: `Laboratory: ${l.testNames?.join(', ') || 'Diagnostics'}`,
                quantity: 1,
                unitPrice: l.amount || l.price || 0
            });
        });
        billing.pharmacyOrders.filter(p => selectedItems.pharmacyOrders.includes(p._id)).forEach(p => {
            itemsList.push({
                itemType: 'Pharmacy',
                itemId: p._id,
                name: `Pharmacy Dispensed Medicines`,
                quantity: 1,
                unitPrice: p.totalAmount || 0
            });
        });
        billing.facilityCharges.filter(f => selectedItems.facilityCharges.includes(f._id)).forEach(f => {
            itemsList.push({
                itemType: 'Facility',
                itemId: f._id,
                name: `Facility Usage: ${f.facilityName} (${f.daysUsed} days)`,
                quantity: 1,
                unitPrice: f.totalAmount || 0
            });
        });
        billing.admissions.filter(a => selectedItems.admissions.includes(a._id)).forEach(a => {
            itemsList.push({
                itemType: 'Admission',
                itemId: a._id,
                name: `Admission - Ward: ${a.ward || 'General'} Bed: ${a.bedNumber || 'N/A'}`,
                quantity: 1,
                unitPrice: getAdmAmt(a)
            });
        });

        try {
            const res = await billingAPI.generateInvoice({
                patientId: patient._id,
                items: itemsList
            });
            if (res.success) {
                setSuccess(`Invoice ${res.invoice.invoiceNumber} generated successfully!`);
                // Reload patient bills
                const reloadRes = await billingAPI.getPatientBills(patient.mrn || patient.patientId);
                if (reloadRes.success) setBilling(reloadRes.billing);
                setSelectedItems({ appointments: [], labReports: [], pharmacyOrders: [], facilityCharges: [], admissions: [] });
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to generate invoice.');
        } finally {
            setGeneratingInvoice(false);
        }
    };

    // Process Payment
    const openPaymentModal = (invoice) => {
        setActiveInvoice(invoice);
        setPayAmount(invoice.outstandingAmount);
        setPaymentMode('Cash');
        setPayReference('');
        setPayModal(true);
    };

    const handleCollectPayment = async (e) => {
        e.preventDefault();
        if (!activeInvoice) return;
        if (payAmount <= 0) return alert('Enter a valid amount.');

        setPaying(true);
        try {
            const res = await billingAPI.collectInvoicePayment(activeInvoice._id, {
                amount: payAmount,
                method: paymentMode,
                reference: payReference
            });
            if (res.success) {
                setSuccess(`Collected payment of ${fmt(payAmount)} on Invoice ${activeInvoice.invoiceNumber}`);
                setPayModal(false);
                // Reload billing
                const reloadRes = await billingAPI.getPatientBills(patient.mrn || patient.patientId);
                if (reloadRes.success) setBilling(reloadRes.billing);
                fetchAnalytics();
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Payment processing failed');
        } finally {
            setPaying(false);
        }
    };

    // Cancel Invoice
    const handleCancelInvoice = async (invoiceId) => {
        if (!window.confirm('Are you sure you want to cancel this invoice?')) return;
        try {
            const res = await billingAPI.cancelInvoice(invoiceId);
            if (res.success) {
                setSuccess('Invoice cancelled successfully.');
                fetchInvoices();
                if (patient) {
                    const reloadRes = await billingAPI.getPatientBills(patient.mrn || patient.patientId);
                    if (reloadRes.success) setBilling(reloadRes.billing);
                }
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to cancel invoice.');
        }
    };

    // Discharge With Outstanding Check
    const handleDischargePatient = async (admissionId) => {
        setError('');
        setSuccess('');
        try {
            // First attempt to discharge normally
            const res = await admissionAPI.dischargePatient(admissionId, { overrideDues: false });
            if (res.success) {
                setSuccess('Patient discharged successfully.');
                const reloadRes = await billingAPI.getPatientBills(patient.mrn || patient.patientId);
                if (reloadRes.success) setBilling(reloadRes.billing);
            }
        } catch (err) {
            const data = err.response?.data;
            if (data && data.hasDues) {
                const override = window.confirm(
                    `Discharge blocked: Patient has pending hospital dues.\n\n` +
                    `${data.duesBreakdown?.join('\n')}\n\n` +
                    `Do you want to apply an authorized billing override to proceed with discharge?`
                );
                if (override) {
                    try {
                        const overrideRes = await admissionAPI.dischargePatient(admissionId, { overrideDues: true });
                        if (overrideRes.success) {
                            setSuccess('Patient discharged via authorized billing override.');
                            const reloadRes = await billingAPI.getPatientBills(patient.mrn || patient.patientId);
                            if (reloadRes.success) setBilling(reloadRes.billing);
                            fetchLogs();
                        }
                    } catch (overrideErr) {
                        alert(overrideErr.response?.data?.message || 'Override discharge failed');
                    }
                }
            } else {
                alert(err.response?.data?.message || 'Discharge failed');
            }
        }
    };

    // Refund Logic
    const handleRequestRefund = async (e) => {
        e.preventDefault();
        if (refundForm.amount <= 0 || !refundForm.reason) {
            return alert('Please enter a valid amount and reason.');
        }

        const targetPatientId = refundForm.patientId || patient?._id;
        const targetPatientName = refundForm.patientName || patient?.name;

        if (!targetPatientId) {
            alert('Please search and select a patient profile first before requesting a refund.');
            return;
        }

        setSubmittingRefund(true);
        try {
            const res = await billingAPI.requestRefund({
                patientId: targetPatientId,
                patientName: targetPatientName,
                refundType: refundForm.type,
                amount: refundForm.amount,
                reason: refundForm.reason,
                invoiceNumber: refundForm.invoiceNumber,
                itemId: refundForm.itemId || undefined
            });
            if (res.success) {
                setSuccess('Refund request submitted successfully.');
                setRefundModal(false);
                setRefundForm({
                    patientId: '',
                    patientName: '',
                    patientPhone: '',
                    type: 'Manual Refund',
                    amount: 0,
                    reason: '',
                    itemId: '',
                    invoiceNumber: ''
                });
                fetchRefunds();
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Refund request failed.');
        } finally {
            setSubmittingRefund(false);
        }
    };

    const handleApproveRefund = async (refundId) => {
        const notes = prompt('Enter refund processing notes / reference:');
        if (notes === null) return;
        try {
            const res = await billingAPI.approveRefund(refundId, notes);
            if (res.success) {
                setSuccess('Refund processed successfully.');
                fetchRefunds();
                fetchAnalytics();
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Refund approval failed.');
        }
    };

    // Reports Logic
    const triggerReport = (type) => {
        setGeneratingReport(true);
        // Compile reports from current invoices and analytics
        setTimeout(() => {
            const filteredInvoices = invoices.filter(inv => inv.paymentStatus !== 'Cancelled');
            const items = [];
            filteredInvoices.forEach(inv => {
                inv.payments.forEach(p => {
                    items.push({
                        date: p.date,
                        ref: p.receiptNumber,
                        patient: inv.patientName,
                        amount: p.amount,
                        method: p.method,
                        type: 'Receipt Collection'
                    });
                });
            });
            setReports({ type, records: items });
            setGeneratingReport(false);
        }, 300);
    };

    // PDF Exports
    const exportInvoicePDF = (invoice) => {
        const doc = new jsPDF();

        // Template Colors
        let primaryColor = [10, 38, 71]; // Navy
        if (activeTemplate === 'Teal Grace') primaryColor = [20, 184, 166];
        if (activeTemplate === 'Sleek Dark') primaryColor = [15, 23, 42];

        // Header branding
        doc.setFillColor(...primaryColor);
        doc.rect(0, 0, 210, 40, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.text(settings.hospitalName, 14, 25);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(settings.hospitalAddress, 14, 32);

        doc.setFontSize(20);
        doc.text('INVOICE', 160, 25);

        // Invoice Metadata
        doc.setTextColor(...primaryColor);
        doc.setFontSize(10);
        doc.text(`Invoice No: ${invoice.invoiceNumber}`, 14, 55);
        doc.text(`Date: ${fmtDate(invoice.invoiceDate)}`, 14, 62);
        doc.text(`Billing Staff: ${invoice.generatedByName || 'HMS Desk'}`, 14, 69);

        doc.text('PATIENT DETAILS', 120, 55);
        doc.setFont('helvetica', 'bold');
        doc.text(invoice.patientName, 120, 62);
        doc.setFont('helvetica', 'normal');
        doc.text(`Patient ID: ${patient?.patientId || 'Walk-in'}`, 120, 69);
        doc.text(`Phone: ${patient?.phone || '—'}`, 120, 76);

        // Table
        const columns = ['Item Description', 'Qty', 'Unit Price', 'Total'];
        const rows = invoice.items.map(item => [
            item.name,
            item.quantity,
            fmt(item.unitPrice),
            fmt(item.totalAmount)
        ]);

        autoTable(doc, {
            startY: 85,
            head: [columns],
            body: rows,
            headStyles: { fillColor: primaryColor },
            theme: 'striped'
        });

        // Totals
        const finalY = doc.lastAutoTable.finalY + 10;
        doc.text(`Grand Total:`, 140, finalY);
        doc.text(`${fmt(invoice.grandTotal)}`, 180, finalY);
        doc.text(`Amount Paid:`, 140, finalY + 7);
        doc.text(`${fmt(invoice.amountPaid)}`, 180, finalY + 7);
        doc.setFont('helvetica', 'bold');
        doc.text(`Outstanding:`, 140, finalY + 14);
        doc.text(`${fmt(invoice.outstandingAmount)}`, 180, finalY + 14);

        doc.setFontSize(12);
        doc.text(`STATUS: ${invoice.paymentStatus.toUpperCase()}`, 14, finalY + 10);

        doc.save(`${invoice.invoiceNumber}.pdf`);
    };

    const exportReceiptPDF = (invoice, payment) => {
        const doc = new jsPDF();

        let primaryColor = [10, 38, 71];
        if (activeTemplate === 'Teal Grace') primaryColor = [20, 184, 166];
        if (activeTemplate === 'Sleek Dark') primaryColor = [15, 23, 42];

        doc.setFillColor(...primaryColor);
        doc.rect(0, 0, 210, 35, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('PAYMENT RECEIPT', 14, 22);

        doc.setTextColor(...primaryColor);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(`Receipt Number: ${payment.receiptNumber}`, 14, 50);
        doc.text(`Invoice Number: ${invoice.invoiceNumber}`, 14, 57);
        doc.text(`Date & Time: ${fmtDateTime(payment.date)}`, 14, 64);
        doc.text(`Collected By: ${payment.collectedByName || 'HMS Staff'}`, 14, 71);

        doc.text('PATIENT INFORMATION', 120, 50);
        doc.setFont('helvetica', 'bold');
        doc.text(invoice.patientName, 120, 57);
        doc.setFont('helvetica', 'normal');
        doc.text(`Phone: ${patient?.phone || '—'}`, 120, 64);

        autoTable(doc, {
            startY: 80,
            head: [['Description', 'Payment Method', 'Reference', 'Amount Received']],
            body: [[
                `Part-settlement on invoice ${invoice.invoiceNumber}`,
                payment.method,
                payment.reference || 'N/A',
                fmt(payment.amount)
            ]],
            headStyles: { fillColor: primaryColor }
        });

        doc.save(`${payment.receiptNumber}.pdf`);
    };

    const printCompleteBill = () => {
        if (!patient || !billing) return;
        const doc = new jsPDF();
        let primaryColor = [10, 38, 71];
        if (activeTemplate === 'Teal Grace') primaryColor = [20, 184, 166];
        if (activeTemplate === 'Sleek Dark') primaryColor = [15, 23, 42];

        const pageWidth = doc.internal.pageSize.getWidth();
        const S = settings;

        // ── HEADER BANNER ──────────────────────────────────────────
        doc.setFillColor(...primaryColor);
        doc.rect(0, 0, pageWidth, 44, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.text(S.hospitalName, 14, 20);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(S.hospitalAddress, 14, 28);
        doc.text(`Ph: ${S.hospitalPhone}`, 14, 35);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('COMPLETE PATIENT BILL', pageWidth - 14, 22, { align: 'right' });
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Generated: ${fmtDateTime(new Date())}`, pageWidth - 14, 31, { align: 'right' });

        // ── PATIENT INFO BOX ───────────────────────────────────────
        let y = 52;
        doc.setFillColor(244, 246, 248);
        doc.roundedRect(10, y, pageWidth - 20, 34, 3, 3, 'F');
        doc.setDrawColor(...primaryColor);
        doc.roundedRect(10, y, pageWidth - 20, 34, 3, 3, 'S');

        doc.setTextColor(...primaryColor);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('PATIENT INFORMATION', 16, y + 9);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(15, 23, 42);
        doc.text(patient.name || '—', 16, y + 19);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        doc.text(`Patient ID: ${patient.patientId || patient.mrn || 'Walk-in'}`, 16, y + 27);
        doc.text(`DOB: ${fmtDate(patient.dob)}  |  Gender: ${patient.gender || '—'}`, 80, y + 19);
        doc.text(`Mobile: ${patient.phone || '—'}`, 80, y + 27);
        doc.text(`Blood Group: ${patient.bloodGroup || '—'}  |  Email: ${patient.email || '—'}`, 140, y + 19);
        doc.text(`MRN: ${patient.mrn || patient.patientId || '—'}`, 140, y + 27);

        y += 42;

        // ── DEPARTMENT-WISE CHARGE BREAKDOWN ───────────────────────
        doc.setTextColor(...primaryColor);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('DEPARTMENT-WISE CHARGE BREAKDOWN', 14, y);
        y += 4;

        // Helper: draw a section header bar
        const drawSectionBar = (label, color) => {
            doc.setFillColor(...color);
            doc.rect(10, y, pageWidth - 20, 7, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.text(label, 14, y + 5);
            y += 8;
        };

        let grandTotal = 0;
        let totalPaid = 0;
        let totalOutstanding = 0;

        // 1. Consultations
        const appts = billing.appointments || [];
        if (appts.length > 0) {
            drawSectionBar('🩺  CONSULTATIONS & OPD', [91, 33, 182]);
            const rows = appts.map(a => {
                const isPaid = a.paymentStatus === 'Paid';
                grandTotal += (a.amount || 0);
                if (isPaid) totalPaid += (a.amount || 0); else totalOutstanding += (a.amount || 0);
                return [
                    fmtDate(a.appointmentDate),
                    `Dr. ${a.doctorName || '—'}`,
                    a.department || 'General OPD',
                    'Consultation Fee',
                    isPaid ? 'PAID' : 'PENDING',
                    fmt(a.amount || 0)
                ];
            });
            autoTable(doc, {
                startY: y, head: [['Date', 'Doctor', 'Dept', 'Description', 'Status', 'Amount']],
                body: rows,
                headStyles: { fillColor: [237, 233, 254], textColor: [91, 33, 182], fontStyle: 'bold', fontSize: 7.5 },
                bodyStyles: { fontSize: 8, textColor: [30, 27, 75] },
                alternateRowStyles: { fillColor: [250, 249, 255] },
                columnStyles: { 4: { fontStyle: 'bold' }, 5: { fontStyle: 'bold', halign: 'right' } },
                margin: { left: 10, right: 10 }, tableWidth: pageWidth - 20
            });
            y = doc.lastAutoTable.finalY + 4;
        }

        // 2. Laboratory
        const labs = billing.labReports || [];
        if (labs.length > 0) {
            drawSectionBar('🧪  LABORATORY DIAGNOSTICS', [15, 118, 110]);
            const rows = [];
            labs.forEach(l => {
                const isPaid = l.paymentStatus === 'PAID';
                grandTotal += (l.amount || 0);
                if (isPaid) totalPaid += (l.amount || 0); else totalOutstanding += (l.amount || 0);
                (l.testNames || []).forEach((test, idx) => {
                    rows.push([fmtDate(l.createdAt), test, l.status || 'Pending', idx === 0 ? fmt(l.amount || 0) : '']);
                });
            });
            autoTable(doc, {
                startY: y, head: [['Order Date', 'Test Name', 'Status', 'Charges']],
                body: rows,
                headStyles: { fillColor: [204, 251, 241], textColor: [15, 118, 110], fontStyle: 'bold', fontSize: 7.5 },
                bodyStyles: { fontSize: 8, textColor: [15, 23, 42] },
                alternateRowStyles: { fillColor: [240, 253, 250] },
                columnStyles: { 3: { fontStyle: 'bold', halign: 'right' } },
                margin: { left: 10, right: 10 }, tableWidth: pageWidth - 20
            });
            y = doc.lastAutoTable.finalY + 4;
        }

        // 3. Pharmacy
        const pharms = billing.pharmacyOrders || [];
        if (pharms.length > 0) {
            drawSectionBar('💊  PHARMACY — DISPENSED MEDICINES', [21, 128, 61]);
            const rows = [];
            pharms.forEach(p => {
                const isPaid = p.paymentStatus === 'Paid';
                grandTotal += (p.totalAmount || 0);
                if (isPaid) totalPaid += (p.totalAmount || 0); else totalOutstanding += (p.totalAmount || 0);
                (p.items || []).forEach((med, idx) => {
                    rows.push([
                        idx === 0 ? fmtDate(p.createdAt) : '',
                        med.name || med.medicineName || '—',
                        `×${med.qty || 1}`,
                        fmt(med.price || 0),
                        fmt((med.qty || 1) * (med.price || 0)),
                        idx === 0 ? (isPaid ? 'PAID' : 'PENDING') : ''
                    ]);
                });
                if ((p.items || []).length > 1) rows.push(['', 'Order Total', '', '', fmt(p.totalAmount), '']);
            });
            autoTable(doc, {
                startY: y, head: [['Date', 'Medicine Name', 'Qty', 'Unit Price', 'Subtotal', 'Status']],
                body: rows,
                headStyles: { fillColor: [220, 252, 231], textColor: [21, 128, 61], fontStyle: 'bold', fontSize: 7.5 },
                bodyStyles: { fontSize: 8, textColor: [15, 23, 42] },
                alternateRowStyles: { fillColor: [240, 253, 244] },
                columnStyles: { 5: { fontStyle: 'bold' }, 4: { halign: 'right' }, 3: { halign: 'right' } },
                margin: { left: 10, right: 10 }, tableWidth: pageWidth - 20
            });
            y = doc.lastAutoTable.finalY + 4;
        }

        // 4. Facility Charges
        const facs = billing.facilityCharges || [];
        if (facs.length > 0) {
            drawSectionBar('🏨  FACILITY & ROOM CHARGES', [146, 64, 14]);
            const rows = facs.map(f => {
                const isPaid = f.paymentStatus === 'Paid';
                grandTotal += (f.totalAmount || 0);
                if (isPaid) totalPaid += (f.totalAmount || 0); else totalOutstanding += (f.totalAmount || 0);
                return [f.facilityName, `${f.daysUsed} day(s)`, fmt(f.pricePerDay || 0) + '/day', isPaid ? 'PAID' : 'PENDING', fmt(f.totalAmount || 0)];
            });
            autoTable(doc, {
                startY: y, head: [['Facility / Service', 'Duration', 'Rate', 'Status', 'Total']],
                body: rows,
                headStyles: { fillColor: [254, 243, 199], textColor: [146, 64, 14], fontStyle: 'bold', fontSize: 7.5 },
                bodyStyles: { fontSize: 8, textColor: [15, 23, 42] },
                alternateRowStyles: { fillColor: [255, 251, 235] },
                columnStyles: { 3: { fontStyle: 'bold' }, 4: { halign: 'right', fontStyle: 'bold' } },
                margin: { left: 10, right: 10 }, tableWidth: pageWidth - 20
            });
            y = doc.lastAutoTable.finalY + 4;
        }

        // 5. IPD Admissions
        const admissions = (billing.admissions || []).filter(a => a.status === 'Admitted' || a.status === 'Discharged');
        if (admissions.length > 0) {
            drawSectionBar('🏥  IPD HOSPITALIZATION', [153, 27, 27]);
            const rows = admissions.map(a => {
                const isPaid = a.paymentStatus === 'Paid';
                grandTotal += (a.totalAmount || 0);
                if (isPaid) totalPaid += (a.totalAmount || 0); else totalOutstanding += (a.totalAmount || 0);
                return [fmtDate(a.admissionDate), a.ward || '—', a.bedNumber || '—', a.status, isPaid ? 'PAID' : 'PENDING', fmt(a.totalAmount || 0)];
            });
            autoTable(doc, {
                startY: y, head: [['Admit Date', 'Ward', 'Bed', 'Status', 'Payment', 'Total']],
                body: rows,
                headStyles: { fillColor: [254, 226, 226], textColor: [153, 27, 27], fontStyle: 'bold', fontSize: 7.5 },
                bodyStyles: { fontSize: 8, textColor: [15, 23, 42] },
                alternateRowStyles: { fillColor: [255, 245, 245] },
                columnStyles: { 4: { fontStyle: 'bold' }, 5: { halign: 'right', fontStyle: 'bold' } },
                margin: { left: 10, right: 10 }, tableWidth: pageWidth - 20
            });
            y = doc.lastAutoTable.finalY + 4;
        }

        // ── INVOICES & PAYMENT RECEIPTS ───────────────────────────
        const allInvoices = billing.invoices || [];
        if (allInvoices.length > 0) {
            // Check if new page needed
            if (y > 220) { doc.addPage(); y = 20; }

            doc.setTextColor(...primaryColor);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.text('INVOICE & PAYMENT RECEIPT HISTORY', 14, y);
            y += 4;

            const invRows = allInvoices.map(inv => [
                inv.invoiceNumber,
                fmtDate(inv.invoiceDate),
                fmt(inv.grandTotal),
                fmt(inv.amountPaid),
                fmt(inv.outstandingAmount),
                inv.paymentStatus
            ]);
            autoTable(doc, {
                startY: y, head: [['Invoice No', 'Date', 'Grand Total', 'Amount Paid', 'Outstanding', 'Status']],
                body: invRows,
                headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 7.5 },
                bodyStyles: { fontSize: 8 },
                columnStyles: { 5: { fontStyle: 'bold' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right', textColor: [220, 38, 38] } },
                margin: { left: 10, right: 10 }, tableWidth: pageWidth - 20
            });
            y = doc.lastAutoTable.finalY + 4;

            // Receipts
            const allReceipts = [];
            allInvoices.forEach(inv => {
                (inv.payments || []).forEach(p => {
                    allReceipts.push([p.receiptNumber, inv.invoiceNumber, fmtDateTime(p.date), p.method, p.reference || '—', fmt(p.amount)]);
                });
            });
            if (allReceipts.length > 0) {
                if (y > 220) { doc.addPage(); y = 20; }
                doc.setTextColor(...primaryColor);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.text('PAYMENT RECEIPTS', 14, y + 5);
                y += 7;
                autoTable(doc, {
                    startY: y, head: [['Receipt No', 'Invoice Ref', 'Date & Time', 'Method', 'Reference', 'Amount Collected']],
                    body: allReceipts,
                    headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 7.5 },
                    bodyStyles: { fontSize: 8 },
                    columnStyles: { 5: { halign: 'right', fontStyle: 'bold', textColor: [21, 128, 61] } },
                    margin: { left: 10, right: 10 }, tableWidth: pageWidth - 20
                });
                y = doc.lastAutoTable.finalY + 6;
            }
        }

        // ── GRAND TOTAL SUMMARY BOX ────────────────────────────────
        if (y > 230) { doc.addPage(); y = 20; }
        doc.setFillColor(...primaryColor);
        doc.rect(10, y, pageWidth - 20, 36, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('FINANCIAL SUMMARY', 16, y + 9);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Total Charges Incurred:`, 16, y + 19);
        doc.text(`Total Amount Paid:`, 80, y + 19);
        doc.text(`Balance Outstanding:`, 145, y + 19);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text(fmt(grandTotal), 16, y + 29);
        doc.setTextColor(134, 239, 172);
        doc.text(fmt(totalPaid), 80, y + 29);
        doc.setTextColor(252, 165, 165);
        doc.text(fmt(totalOutstanding), 145, y + 29);

        // ── FOOTER ─────────────────────────────────────────────────
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(148, 163, 184);
            doc.text(`${S.hospitalName} — This is a system-generated bill. Not a legal tax invoice unless stamped.`, 14, 290);
            doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, 290, { align: 'right' });
        }

        doc.save(`Complete-Bill-${patient.patientId || patient.name?.replace(/ /g,'-')}-${new Date().toISOString().slice(0,10)}.pdf`);
    };

    return (
        <div className="billing-dashboard-workspace">
            {/* Horizontal Header */}
            <div className="billing-workspace-header">
                <div>
                    <h1 className="workspace-title">Billing Operations Center</h1>
                    <p className="workspace-subtitle">Institute Unified Financial Console</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    {success && <div className="toast toast-success">{success}</div>}
                    {error && <div className="toast toast-danger">{error}</div>}
                </div>
            </div>

            <div className="billing-grid-container">
                {/* 1. Overview Dashboard */}
                {activeTab === 'dashboard' && (
                    <div className="tab-pane-view">
                        <div className="billing-stats-grid">
                            <div className="stat-card neon-card">
                                <span className="stat-label">Today's Revenue</span>
                                <h3 className="stat-val">{fmt(analytics?.todayRevenue)}</h3>
                            </div>
                            <div className="stat-card">
                                <span className="stat-label">Monthly Revenue</span>
                                <h3 className="stat-val text-teal">{fmt(analytics?.monthlyRevenue)}</h3>
                            </div>
                            <div className="stat-card">
                                <span className="stat-label">Outstanding Dues</span>
                                <h3 className="stat-val text-rose">{fmt(analytics?.outstandingDues)}</h3>
                            </div>
                            <div className="stat-card">
                                <span className="stat-label">Total Collections</span>
                                <h3 className="stat-val">{fmt(analytics?.totalCollections)}</h3>
                            </div>
                        </div>

                        <div className="billing-stats-grid" style={{ marginTop: '20px' }}>
                            <div className="stat-card mini-card">
                                <span className="stat-label">Lab Revenue</span>
                                <h4>{fmt(analytics?.labRevenue)}</h4>
                            </div>
                            <div className="stat-card mini-card">
                                <span className="stat-label">Pharmacy Revenue</span>
                                <h4>{fmt(analytics?.pharmacyRevenue)}</h4>
                            </div>
                            <div className="stat-card mini-card">
                                <span className="stat-label">Admission Revenue</span>
                                <h4>{fmt(analytics?.admissionRevenue)}</h4>
                            </div>
                        </div>

                        {/* Payment Breakdown Cards */}
                        <div className="billing-section-box" style={{ marginTop: '24px' }}>
                            <h3>Payment Method Collection Summary</h3>
                            <div className="collection-methods-wrap">
                                <div className="c-method-card">
                                    <span>Cash</span>
                                    <h2>{fmt(analytics?.cashCollections)}</h2>
                                </div>
                                <div className="c-method-card">
                                    <span>UPI / QR</span>
                                    <h2>{fmt(analytics?.upiCollections)}</h2>
                                </div>
                                <div className="c-method-card">
                                    <span>Card</span>
                                    <h2>{fmt(analytics?.cardCollections)}</h2>
                                </div>
                                <div className="c-method-card">
                                    <span>Bank Transfer</span>
                                    <h2>{fmt(analytics?.bankCollections)}</h2>
                                </div>
                            </div>
                        </div>

                        {/* Recent Activity Log */}
                        <div className="billing-section-box" style={{ marginTop: '24px' }}>
                            <h3>Recent Billing Activities</h3>
                            <div className="activity-timeline">
                                {activityLogs.slice(0, 5).map(log => (
                                    <div key={log._id} className="timeline-item">
                                        <div className="time-badge">{fmtDateTime(log.createdAt)}</div>
                                        <div className="timeline-content">
                                            <strong>{log.action}</strong> - {log.details}
                                            <span className="by-user">by {log.performedByName}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. Patient Billing Tab */}
                {activeTab === 'patient' && (
                    <div className="tab-pane-view">
                        <div className="patient-search-block">
                            <form onSubmit={handlePatientSearch} className="search-form-wrap">
                                <input
                                    type="text"
                                    placeholder="Search patient by MRN, Name, Phone or Invoice ID..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="p-search-input"
                                />
                                <button type="submit" className="p-search-btn"><FiSearch /> Search Profile</button>
                            </form>
                        </div>

                        {patient && billing && (
                            <div className="patient-billing-profile-grid" style={{ marginTop: '20px' }}>
                                {/* Patient Card */}
                                <div className="p-card-left">
                                    <div className="p-avatar-box">
                                        <div className="p-avatar-char">{patient.name?.charAt(0).toUpperCase()}</div>
                                        <h2>{patient.name}</h2>
                                        <p>MRN: {patient.mrn}</p>
                                    </div>
                                    <div className="p-details-list">
                                        <div className="p-detail-row"><span>Mobile</span><strong>{patient.phone}</strong></div>
                                        <div className="p-detail-row"><span>Gender</span><strong>{patient.gender || '—'}</strong></div>
                                        <div className="p-detail-row"><span>DOB</span><strong>{fmtDate(patient.dob)}</strong></div>
                                    </div>
                                </div>

                                {/* Billing Details Right */}
                                <div className="p-billing-right">
                                    {/* Uninvoiced Pending Charges */}
                                    <div className="billing-section-box">
                                        <div className="section-head-actions">
                                            <h3>Pending Un-invoiced Charges</h3>
                                            <button className="btn-save" onClick={handleGenerateInvoice} disabled={generatingInvoice}>
                                                {generatingInvoice ? 'Processing...' : '🧾 Generate Consolidated Invoice'}
                                            </button>
                                        </div>

                                        {/* 1. OPD / Consultation Charges */}
                                        {billing.appointments?.filter(a => a.paymentStatus !== 'Paid').length > 0 && (
                                            <div className="charge-category dept-consultation">
                                                <div className="dept-header">
                                                    <span className="dept-badge dept-badge-consultation">🩺 Consultation / OPD</span>
                                                    <span className="dept-pending-count">{billing.appointments.filter(a => a.paymentStatus !== 'Paid').length} pending</span>
                                                </div>
                                                {billing.appointments.filter(a => a.paymentStatus !== 'Paid').map(a => (
                                                    <div key={a._id} className="charge-item-card">
                                                        <div className="charge-item-select-row">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedItems.appointments.includes(a._id)}
                                                                onChange={() => toggleItem('appointments', a._id)}
                                                                id={`appt-${a._id}`}
                                                            />
                                                            <label htmlFor={`appt-${a._id}`} className="charge-item-main-label">
                                                                <div className="charge-item-title">
                                                                    <span className="item-dept-icon">👨‍⚕️</span>
                                                                    <strong>Doctor Consultation</strong>
                                                                    <span className={`item-status-pill pill-${(a.paymentStatus||'pending').toLowerCase()}`}>{a.paymentStatus || 'Pending'}</span>
                                                                </div>
                                                                <div className="charge-item-details-grid">
                                                                    <div className="cid-row"><span className="cid-label">Doctor</span><span className="cid-val">{a.doctorName || '—'}</span></div>
                                                                    <div className="cid-row"><span className="cid-label">Department</span><span className="cid-val">{a.department || a.serviceName || 'General OPD'}</span></div>
                                                                    <div className="cid-row"><span className="cid-label">Date</span><span className="cid-val">{fmtDate(a.appointmentDate)}</span></div>
                                                                    <div className="cid-row"><span className="cid-label">Token</span><span className="cid-val">#{a.tokenNumber || '—'}</span></div>
                                                                </div>
                                                            </label>
                                                            <div className="charge-item-amount">
                                                                <span className="amount-label">Consultation Fee</span>
                                                                <strong className="amount-val">{fmt(a.amount || a.fee)}</strong>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Paid Consultations */}
                                        {billing.appointments?.filter(a => a.paymentStatus === 'Paid').length > 0 && (
                                            <div className="charge-category dept-consultation paid-section">
                                                <div className="dept-header">
                                                    <span className="dept-badge dept-badge-paid">✅ Consultation / OPD — Paid</span>
                                                </div>
                                                {billing.appointments.filter(a => a.paymentStatus === 'Paid').map(a => (
                                                    <div key={a._id} className="charge-item-card paid-card">
                                                        <div className="charge-item-select-row">
                                                            <div className="charge-item-main-label">
                                                                <div className="charge-item-title">
                                                                    <span className="item-dept-icon">👨‍⚕️</span>
                                                                    <strong>Doctor Consultation</strong>
                                                                    <span className="badge-prepaid">Paid During Registration ✓</span>
                                                                </div>
                                                                <div className="charge-item-details-grid">
                                                                    <div className="cid-row"><span className="cid-label">Doctor</span><span className="cid-val">{a.doctorName || '—'}</span></div>
                                                                    <div className="cid-row"><span className="cid-label">Date</span><span className="cid-val">{fmtDate(a.appointmentDate)}</span></div>
                                                                </div>
                                                            </div>
                                                            <div className="charge-item-amount paid-amount">
                                                                <strong>{fmt(a.amount || a.fee)}</strong>
                                                                <span style={{fontSize:'11px',color:'#16a34a'}}>PAID</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* 2. Laboratory Charges */}
                                        {billing.labReports?.length > 0 && (
                                            <div className="charge-category dept-lab">
                                                <div className="dept-header">
                                                    <span className="dept-badge dept-badge-lab">🧪 Laboratory Diagnostics</span>
                                                    <span className="dept-pending-count">{billing.labReports.length} order(s) pending</span>
                                                </div>
                                                {billing.labReports.map(l => (
                                                    <div key={l._id} className="charge-item-card">
                                                        <div className="charge-item-select-row">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedItems.labReports.includes(l._id)}
                                                                onChange={() => toggleItem('labReports', l._id)}
                                                                id={`lab-${l._id}`}
                                                            />
                                                            <label htmlFor={`lab-${l._id}`} className="charge-item-main-label">
                                                                <div className="charge-item-title">
                                                                    <span className="item-dept-icon">🧬</span>
                                                                    <strong>Lab Test Order</strong>
                                                                    <span className={`item-status-pill pill-${(l.paymentStatus||'pending').toLowerCase()}`}>{l.paymentStatus || 'Pending'}</span>
                                                                </div>
                                                                {/* Itemized Test Breakdown */}
                                                                <div className="itemized-breakdown">
                                                                    <div className="breakdown-header-row">
                                                                        <span>Test Name</span><span>Status</span>
                                                                    </div>
                                                                    {(l.testNames || []).map((test, idx) => (
                                                                        <div key={idx} className="breakdown-item-row">
                                                                            <span className="breakdown-item-name">
                                                                                <span className="dot-indicator dot-lab"></span>
                                                                                {test}
                                                                            </span>
                                                                            <span className="breakdown-item-status">{l.status || 'Pending'}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                                <div className="charge-item-details-grid" style={{marginTop:'8px'}}>
                                                                    <div className="cid-row"><span className="cid-label">Order Date</span><span className="cid-val">{fmtDate(l.createdAt)}</span></div>
                                                                    <div className="cid-row"><span className="cid-label">Sample</span><span className="cid-val">{l.sampleType || 'Not collected yet'}</span></div>
                                                                    <div className="cid-row"><span className="cid-label">Total Tests</span><span className="cid-val">{(l.testNames||[]).length} test(s)</span></div>
                                                                </div>
                                                            </label>
                                                            <div className="charge-item-amount">
                                                                <span className="amount-label">Lab Charges</span>
                                                                <strong className="amount-val">{fmt(l.amount || 0)}</strong>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* 3. Pharmacy Charges */}
                                        {billing.pharmacyOrders?.length > 0 && (
                                            <div className="charge-category dept-pharmacy">
                                                <div className="dept-header">
                                                    <span className="dept-badge dept-badge-pharmacy">💊 Pharmacy — Dispensed Medicines</span>
                                                    <span className="dept-pending-count">{billing.pharmacyOrders.length} order(s) pending</span>
                                                </div>
                                                {billing.pharmacyOrders.map(p => (
                                                    <div key={p._id} className="charge-item-card">
                                                        <div className="charge-item-select-row">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedItems.pharmacyOrders.includes(p._id)}
                                                                onChange={() => toggleItem('pharmacyOrders', p._id)}
                                                                id={`pharm-${p._id}`}
                                                            />
                                                            <label htmlFor={`pharm-${p._id}`} className="charge-item-main-label">
                                                                <div className="charge-item-title">
                                                                    <span className="item-dept-icon">🏥</span>
                                                                    <strong>Pharmacy Dispensing Order</strong>
                                                                    <span className={`item-status-pill pill-${(p.paymentStatus||'pending').toLowerCase()}`}>{p.paymentStatus || 'Pending'}</span>
                                                                </div>
                                                                {/* Itemized Medicine Breakdown */}
                                                                <div className="itemized-breakdown">
                                                                    <div className="breakdown-header-row">
                                                                        <span>Medicine Name</span><span>Qty</span><span>Unit Price</span><span>Subtotal</span>
                                                                    </div>
                                                                    {(p.items || []).map((med, idx) => (
                                                                        <div key={idx} className="breakdown-item-row breakdown-item-row-4col">
                                                                            <span className="breakdown-item-name">
                                                                                <span className="dot-indicator dot-pharmacy"></span>
                                                                                {med.name || med.medicineName || 'Unknown Medicine'}
                                                                            </span>
                                                                            <span className="breakdown-qty">×{med.qty || med.quantity || 1}</span>
                                                                            <span className="breakdown-price">{fmt(med.price || 0)}</span>
                                                                            <span className="breakdown-subtotal">{fmt((med.qty || med.quantity || 1) * (med.price || 0))}</span>
                                                                        </div>
                                                                    ))}
                                                                    <div className="breakdown-total-row">
                                                                        <span>Order Total</span>
                                                                        <strong>{fmt(p.totalAmount)}</strong>
                                                                    </div>
                                                                </div>
                                                                <div className="charge-item-details-grid" style={{marginTop:'8px'}}>
                                                                    <div className="cid-row"><span className="cid-label">Dispensed On</span><span className="cid-val">{fmtDate(p.createdAt)}</span></div>
                                                                    <div className="cid-row"><span className="cid-label">Items Count</span><span className="cid-val">{(p.items||[]).length} medicine(s)</span></div>
                                                                </div>
                                                            </label>
                                                            <div className="charge-item-amount">
                                                                <span className="amount-label">Pharmacy Total</span>
                                                                <strong className="amount-val">{fmt(p.totalAmount)}</strong>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* 4. Facility Charges */}
                                        {billing.facilityCharges?.length > 0 && (
                                            <div className="charge-category dept-facility">
                                                <div className="dept-header">
                                                    <span className="dept-badge dept-badge-facility">🏨 Facility & Room Charges</span>
                                                    <span className="dept-pending-count">{billing.facilityCharges.length} charge(s) pending</span>
                                                </div>
                                                {billing.facilityCharges.map(f => (
                                                    <div key={f._id} className="charge-item-card">
                                                        <div className="charge-item-select-row">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedItems.facilityCharges.includes(f._id)}
                                                                onChange={() => toggleItem('facilityCharges', f._id)}
                                                                id={`fac-${f._id}`}
                                                            />
                                                            <label htmlFor={`fac-${f._id}`} className="charge-item-main-label">
                                                                <div className="charge-item-title">
                                                                    <span className="item-dept-icon">🛏️</span>
                                                                    <strong>{f.facilityName}</strong>
                                                                    <span className={`item-status-pill pill-${(f.paymentStatus||'pending').toLowerCase()}`}>{f.paymentStatus || 'Pending'}</span>
                                                                </div>
                                                                <div className="itemized-breakdown">
                                                                    <div className="breakdown-item-row breakdown-item-row-4col">
                                                                        <span className="breakdown-item-name">
                                                                            <span className="dot-indicator dot-facility"></span>
                                                                            {f.facilityName}
                                                                        </span>
                                                                        <span className="breakdown-qty">{f.daysUsed} day(s)</span>
                                                                        <span className="breakdown-price">{fmt(f.pricePerDay)}/day</span>
                                                                        <span className="breakdown-subtotal">{fmt(f.totalAmount)}</span>
                                                                    </div>
                                                                    <div className="breakdown-total-row">
                                                                        <span>Facility Total</span>
                                                                        <strong>{fmt(f.totalAmount)}</strong>
                                                                    </div>
                                                                </div>
                                                                <div className="charge-item-details-grid" style={{marginTop:'8px'}}>
                                                                    <div className="cid-row"><span className="cid-label">Days Used</span><span className="cid-val">{f.daysUsed} day(s)</span></div>
                                                                    <div className="cid-row"><span className="cid-label">Rate/Day</span><span className="cid-val">{fmt(f.pricePerDay)}</span></div>
                                                                </div>
                                                            </label>
                                                            <div className="charge-item-amount">
                                                                <span className="amount-label">Facility Total</span>
                                                                <strong className="amount-val">{fmt(f.totalAmount)}</strong>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* 5. IPD Admissions */}
                                        {billing.admissions?.filter(a => a.status === 'Admitted').length > 0 && (
                                            <div className="charge-category dept-admission">
                                                <div className="dept-header">
                                                    <span className="dept-badge dept-badge-admission">🏥 IPD Hospitalization (Active)</span>
                                                    <span className="dept-pending-count">{billing.admissions.filter(a=>a.status==='Admitted').length} active</span>
                                                </div>
                                                {billing.admissions.filter(a => a.status === 'Admitted').map(a => (
                                                    <div key={a._id} className="charge-item-card admission-card-active">
                                                        <div className="admission-ipd-header">
                                                            <div className="admission-ipd-info">
                                                                <span className="item-dept-icon">🛏️</span>
                                                                <div>
                                                                    <strong>Ward: {a.ward}</strong>  —  Bed: <strong>{a.bedNumber}</strong>
                                                                    <div style={{fontSize:'12px',color:'#64748b',marginTop:'2px'}}>Admitted: {fmtDate(a.admissionDate)}  |  Dept: {a.requestedDepartment || '—'}  |  Priority: <span style={{color: a.priority==='Urgent'?'#dc2626':a.priority==='Critical'?'#7c3aed':'#16a34a', fontWeight:'600'}}>{a.priority}</span></div>
                                                                </div>
                                                            </div>
                                                            <button className="btn-discharge-red" onClick={() => handleDischargePatient(a._id)}>Discharge Patient</button>
                                                        </div>
                                                        {/* Facility breakdown inside admission */}
                                                        {a.selectedFacilities?.length > 0 && (
                                                            <div className="itemized-breakdown" style={{margin:'10px 0 4px 0'}}>
                                                                <div className="breakdown-header-row">
                                                                    <span>Facility / Service</span><span>Days</span><span>Rate/Day</span><span>Amount</span>
                                                                </div>
                                                                {a.selectedFacilities.map((fac, idx) => (
                                                                    <div key={idx} className="breakdown-item-row breakdown-item-row-4col">
                                                                        <span className="breakdown-item-name"><span className="dot-indicator dot-admission"></span>{fac.facilityName}</span>
                                                                        <span className="breakdown-qty">{fac.days} day(s)</span>
                                                                        <span className="breakdown-price">{fmt(fac.pricePerDay)}</span>
                                                                        <span className="breakdown-subtotal">{fmt(fac.totalAmount)}</span>
                                                                    </div>
                                                                ))}
                                                                <div className="breakdown-total-row">
                                                                    <span>Admission Total</span>
                                                                    <strong>{fmt(getAdmAmt(a))}</strong>
                                                                </div>
                                                            </div>
                                                        )}
                                                        <label className="charge-item-select-row" style={{marginTop:'8px', background:'#f0fdf4', borderRadius:'8px', padding:'10px 12px'}}>
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedItems.admissions.includes(a._id)}
                                                                onChange={() => toggleItem('admissions', a._id)}
                                                                disabled={a.paymentStatus === 'Paid'}
                                                            />
                                                            <span style={{flex:1, fontSize:'13px', fontWeight:'500'}}>Include Consolidated Admission Fees in Invoice</span>
                                                            <strong className="amount-val">{fmt(getAdmAmt(a))}</strong>
                                                        </label>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* No charges notice */}
                                        {billing.appointments?.filter(a=>a.paymentStatus!=='Paid').length === 0 &&
                                         !billing.labReports?.length &&
                                         !billing.pharmacyOrders?.length &&
                                         !billing.facilityCharges?.length &&
                                         !billing.admissions?.filter(a=>a.status==='Admitted').length && (
                                            <div className="no-charges-notice">
                                                <span>✅</span>
                                                <p>No pending un-invoiced charges for this patient.</p>
                                            </div>
                                        )}

                                    </div>

                                    {/* Consolidated Invoices List */}
                                    <div className="billing-section-box" style={{ marginTop: '20px' }}>
                                        <h3>Consolidated Invoices</h3>
                                        {billing.invoices?.length === 0 ? (
                                            <p className="no-records-text">No invoices generated for this patient yet.</p>
                                        ) : (
                                            <div className="invoices-list-scroll">
                                                {billing.invoices?.map(inv => (
                                                    <div key={inv._id} className="invoice-box-item">
                                                        <div className="invoice-box-left">
                                                            <strong>{inv.invoiceNumber}</strong>
                                                            <span>Date: {fmtDate(inv.invoiceDate)}</span>
                                                            <span className={`status-badge-inline status-${inv.paymentStatus.toLowerCase().replace(' ', '-')}`}>{inv.paymentStatus}</span>
                                                        </div>
                                                        <div className="invoice-box-right">
                                                            <div className="totals-text">
                                                                <div>Total: {fmt(inv.grandTotal)}</div>
                                                                <div>Dues: {fmt(inv.outstandingAmount)}</div>
                                                            </div>
                                                            <div className="invoice-actions-wrap">
                                                                {inv.paymentStatus !== 'Paid' && inv.paymentStatus !== 'Cancelled' && (
                                                                    <button className="btn-collect" onClick={() => openPaymentModal(inv)}>Collect Payment</button>
                                                                )}
                                                                <button className="btn-print" onClick={() => exportInvoicePDF(inv)}><FiPrinter /> PDF</button>
                                                                {inv.paymentStatus !== 'Paid' && inv.paymentStatus !== 'Cancelled' && (
                                                                    <button className="btn-cancel-text" onClick={() => handleCancelInvoice(inv._id)}>Cancel</button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    </div>

                                    {/* ── COMPLETE BILLING SUMMARY PANEL ── */}
                                    <div className="billing-section-box" style={{ marginTop: '20px' }}>
                                        <div className="section-head-actions">
                                            <div>
                                                <h3 style={{ margin: 0 }}>Complete Billing Summary</h3>
                                                <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0 0' }}>Full financial overview — all charges across every department (paid + outstanding)</p>
                                            </div>
                                            <button
                                                className="btn-print-complete"
                                                onClick={printCompleteBill}
                                            >
                                                🖨️ Print Complete Bill
                                            </button>
                                        </div>

                                        {/* Department Summary Rows */}
                                        <div className="complete-bill-dept-grid">
                                            {/* Consultations */}
                                            {(billing.appointments || []).length > 0 && (() => {
                                                const total = (billing.appointments || []).reduce((s, a) => s + (a.amount || 0), 0);
                                                const paid  = (billing.appointments || []).filter(a => a.paymentStatus === 'Paid').reduce((s, a) => s + (a.amount || 0), 0);
                                                return (
                                                    <div className="cbill-dept-row cbill-consultation">
                                                        <div className="cbill-dept-icon">🩺</div>
                                                        <div className="cbill-dept-info">
                                                            <strong>Consultations & OPD</strong>
                                                            <span>{(billing.appointments || []).length} consultation(s)</span>
                                                            <div className="cbill-items-mini">
                                                                {(billing.appointments || []).map(a => (
                                                                    <div key={a._id} className="cbill-mini-row">
                                                                        <span>Dr. {a.doctorName} — {fmtDate(a.appointmentDate)}</span>
                                                                        <span className={a.paymentStatus === 'Paid' ? 'cbill-status-paid' : 'cbill-status-due'}>{a.paymentStatus === 'Paid' ? '✓ Paid' : '● Due'}</span>
                                                                        <span>{fmt(a.amount || 0)}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        <div className="cbill-dept-amounts">
                                                            <div className="cbill-amount-row"><span>Total</span><strong>{fmt(total)}</strong></div>
                                                            <div className="cbill-amount-row paid"><span>Paid</span><strong>{fmt(paid)}</strong></div>
                                                            <div className="cbill-amount-row due"><span>Due</span><strong>{fmt(total - paid)}</strong></div>
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            {/* Laboratory */}
                                            {(billing.labReports || []).length > 0 && (() => {
                                                const total = (billing.labReports || []).reduce((s, l) => s + (l.amount || 0), 0);
                                                const paid  = (billing.labReports || []).filter(l => l.paymentStatus === 'PAID').reduce((s, l) => s + (l.amount || 0), 0);
                                                return (
                                                    <div className="cbill-dept-row cbill-lab">
                                                        <div className="cbill-dept-icon">🧪</div>
                                                        <div className="cbill-dept-info">
                                                            <strong>Laboratory Diagnostics</strong>
                                                            <span>{(billing.labReports || []).length} lab order(s)</span>
                                                            <div className="cbill-items-mini">
                                                                {(billing.labReports || []).map(l => (
                                                                    <div key={l._id} className="cbill-mini-row">
                                                                        <span>Tests: {(l.testNames || []).join(', ')}</span>
                                                                        <span className={l.paymentStatus === 'PAID' ? 'cbill-status-paid' : 'cbill-status-due'}>{l.paymentStatus === 'PAID' ? '✓ Paid' : '● Due'}</span>
                                                                        <span>{fmt(l.amount || 0)}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        <div className="cbill-dept-amounts">
                                                            <div className="cbill-amount-row"><span>Total</span><strong>{fmt(total)}</strong></div>
                                                            <div className="cbill-amount-row paid"><span>Paid</span><strong>{fmt(paid)}</strong></div>
                                                            <div className="cbill-amount-row due"><span>Due</span><strong>{fmt(total - paid)}</strong></div>
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            {/* Pharmacy */}
                                            {(billing.pharmacyOrders || []).length > 0 && (() => {
                                                const total = (billing.pharmacyOrders || []).reduce((s, p) => s + (p.totalAmount || 0), 0);
                                                const paid  = (billing.pharmacyOrders || []).filter(p => p.paymentStatus === 'Paid').reduce((s, p) => s + (p.totalAmount || 0), 0);
                                                return (
                                                    <div className="cbill-dept-row cbill-pharmacy">
                                                        <div className="cbill-dept-icon">💊</div>
                                                        <div className="cbill-dept-info">
                                                            <strong>Pharmacy — Dispensed Medicines</strong>
                                                            <span>{(billing.pharmacyOrders || []).reduce((s, p) => s + (p.items || []).length, 0)} medicine item(s) across {(billing.pharmacyOrders || []).length} order(s)</span>
                                                            <div className="cbill-items-mini">
                                                                {(billing.pharmacyOrders || []).map(p => (
                                                                    <React.Fragment key={p._id}>
                                                                        {(p.items || []).map((med, idx) => (
                                                                            <div key={idx} className="cbill-mini-row">
                                                                                <span>💊 {med.name || '—'} ×{med.qty || 1}</span>
                                                                                <span className="cbill-status-due">{idx === 0 && (p.paymentStatus !== 'Paid' ? '● Due' : '✓ Paid')}</span>
                                                                                <span>{fmt((med.qty || 1) * (med.price || 0))}</span>
                                                                            </div>
                                                                        ))}
                                                                    </React.Fragment>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        <div className="cbill-dept-amounts">
                                                            <div className="cbill-amount-row"><span>Total</span><strong>{fmt(total)}</strong></div>
                                                            <div className="cbill-amount-row paid"><span>Paid</span><strong>{fmt(paid)}</strong></div>
                                                            <div className="cbill-amount-row due"><span>Due</span><strong>{fmt(total - paid)}</strong></div>
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            {/* Facility */}
                                            {(billing.facilityCharges || []).length > 0 && (() => {
                                                const total = (billing.facilityCharges || []).reduce((s, f) => s + (f.totalAmount || 0), 0);
                                                const paid  = (billing.facilityCharges || []).filter(f => f.paymentStatus === 'Paid').reduce((s, f) => s + (f.totalAmount || 0), 0);
                                                return (
                                                    <div className="cbill-dept-row cbill-facility">
                                                        <div className="cbill-dept-icon">🏨</div>
                                                        <div className="cbill-dept-info">
                                                            <strong>Facility & Room Charges</strong>
                                                            <span>{(billing.facilityCharges || []).length} facility charge(s)</span>
                                                            <div className="cbill-items-mini">
                                                                {(billing.facilityCharges || []).map(f => (
                                                                    <div key={f._id} className="cbill-mini-row">
                                                                        <span>{f.facilityName} — {f.daysUsed} day(s)</span>
                                                                        <span className={f.paymentStatus === 'Paid' ? 'cbill-status-paid' : 'cbill-status-due'}>{f.paymentStatus === 'Paid' ? '✓ Paid' : '● Due'}</span>
                                                                        <span>{fmt(f.totalAmount || 0)}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        <div className="cbill-dept-amounts">
                                                            <div className="cbill-amount-row"><span>Total</span><strong>{fmt(total)}</strong></div>
                                                            <div className="cbill-amount-row paid"><span>Paid</span><strong>{fmt(paid)}</strong></div>
                                                            <div className="cbill-amount-row due"><span>Due</span><strong>{fmt(total - paid)}</strong></div>
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            {/* IPD */}
                                            {(billing.admissions || []).length > 0 && (() => {
                                                const total = (billing.admissions || []).reduce((s, a) => s + getAdmAmt(a), 0);
                                                const paid  = (billing.admissions || []).filter(a => a.paymentStatus === 'Paid').reduce((s, a) => s + getAdmAmt(a), 0);
                                                return (
                                                    <div className="cbill-dept-row cbill-admission">
                                                        <div className="cbill-dept-icon">🏥</div>
                                                        <div className="cbill-dept-info">
                                                            <strong>IPD Hospitalization</strong>
                                                            <span>{(billing.admissions || []).length} admission(s)</span>
                                                            <div className="cbill-items-mini">
                                                                {(billing.admissions || []).map(a => (
                                                                    <div key={a._id} className="cbill-mini-row">
                                                                        <span>Ward: {a.ward} — Bed: {a.bedNumber} ({a.status})</span>
                                                                        <span className={a.paymentStatus === 'Paid' ? 'cbill-status-paid' : 'cbill-status-due'}>{a.paymentStatus === 'Paid' ? '✓ Paid' : '● Due'}</span>
                                                                        <span>{fmt(getAdmAmt(a))}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        <div className="cbill-dept-amounts">
                                                            <div className="cbill-amount-row"><span>Total</span><strong>{fmt(total)}</strong></div>
                                                            <div className="cbill-amount-row paid"><span>Paid</span><strong>{fmt(paid)}</strong></div>
                                                            <div className="cbill-amount-row due"><span>Due</span><strong>{fmt(total - paid)}</strong></div>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        {/* Grand Total Footer */}
                                        {(() => {
                                            const grandTot = [
                                                ...(billing.appointments || []).map(a => a.amount || 0),
                                                ...(billing.labReports || []).map(l => l.amount || 0),
                                                ...(billing.pharmacyOrders || []).map(p => p.totalAmount || 0),
                                                ...(billing.facilityCharges || []).map(f => f.totalAmount || 0),
                                                ...(billing.admissions || []).map(a => getAdmAmt(a))
                                            ].reduce((s, v) => s + v, 0);

                                            const paidTot = [
                                                ...(billing.appointments || []).filter(a => a.paymentStatus === 'Paid').map(a => a.amount || 0),
                                                ...(billing.labReports || []).filter(l => l.paymentStatus === 'PAID').map(l => l.amount || 0),
                                                ...(billing.pharmacyOrders || []).filter(p => p.paymentStatus === 'Paid').map(p => p.totalAmount || 0),
                                                ...(billing.facilityCharges || []).filter(f => f.paymentStatus === 'Paid').map(f => f.totalAmount || 0),
                                                ...(billing.admissions || []).filter(a => a.paymentStatus === 'Paid').map(a => getAdmAmt(a))
                                            ].reduce((s, v) => s + v, 0);

                                            const dueTot = grandTot - paidTot;

                                            // Also add invoice paid amounts
                                            const invPaid = (billing.invoices || []).reduce((s, inv) => s + (inv.amountPaid || 0), 0);
                                            const invDue  = (billing.invoices || []).reduce((s, inv) => s + (inv.outstandingAmount || 0), 0);

                                            return (
                                                <div className="cbill-grand-total-bar">
                                                    <div className="cbill-gt-col">
                                                        <span>Total Charges Incurred</span>
                                                        <strong className="cbill-gt-total">{fmt(grandTot)}</strong>
                                                    </div>
                                                    <div className="cbill-gt-divider" />
                                                    <div className="cbill-gt-col">
                                                        <span>Invoiced & Paid</span>
                                                        <strong className="cbill-gt-paid">{fmt(invPaid)}</strong>
                                                    </div>
                                                    <div className="cbill-gt-divider" />
                                                    <div className="cbill-gt-col">
                                                        <span>Pending / Outstanding</span>
                                                        <strong className="cbill-gt-due">{fmt(invDue > 0 ? invDue : dueTot)}</strong>
                                                    </div>
                                                    <div className="cbill-gt-divider" />
                                                    <div className="cbill-gt-col">
                                                        <span>Un-invoiced Charges</span>
                                                        <strong style={{ fontSize: '1rem', color: '#d97706' }}>{fmt(dueTot)}</strong>
                                                    </div>
                                                    <button className="btn-print-complete" onClick={printCompleteBill} style={{ marginLeft: 'auto' }}>
                                                        🖨️ Print / Download PDF
                                                    </button>
                                                </div>
                                            );
                                        })()}
                                    </div>

                                </div>
                        )}
                    </div>
                )}

                {/* 3. Pending Payments */}
                {activeTab === 'pending' && (
                    <div className="tab-pane-view">
                        <div className="billing-section-box">
                            <h3>Patients with Outstanding Balances</h3>
                            <div className="table-responsive">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Invoice No</th>
                                            <th>Patient Name</th>
                                            <th>Date</th>
                                            <th>Grand Total</th>
                                            <th>Outstanding Dues</th>
                                            <th>Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {invoices.filter(inv => inv.paymentStatus !== 'Paid' && inv.paymentStatus !== 'Cancelled').map(inv => (
                                            <tr key={inv._id}>
                                                <td>{inv.invoiceNumber}</td>
                                                <td>{inv.patientName}</td>
                                                <td>{fmtDate(inv.invoiceDate)}</td>
                                                <td>{fmt(inv.grandTotal)}</td>
                                                <td>{fmt(inv.outstandingAmount)}</td>
                                                <td><span className={`badge-${inv.paymentStatus.toLowerCase().replace(' ', '-')}`}>{inv.paymentStatus}</span></td>
                                                <td>
                                                    <button className="btn-collect" onClick={() => {
                                                        setSearchQuery(inv.invoiceNumber);
                                                        setSearchQuery(inv.patientName);
                                                        navigate(`/billing/patient?tab=patient`);
                                                    }}>Settle</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* 4. Invoices */}
                {activeTab === 'invoices' && (
                    <div className="tab-pane-view">
                        <div className="patient-search-block">
                            <input
                                type="text"
                                placeholder="Search Invoices by number or patient name..."
                                value={invoiceSearch}
                                onChange={e => setInvoiceSearch(e.target.value)}
                                className="p-search-input"
                            />
                        </div>
                        <div className="billing-section-box" style={{ marginTop: '20px' }}>
                            <h3>Invoices Repository</h3>
                            <div className="table-responsive">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Invoice No</th>
                                            <th>Patient Name</th>
                                            <th>Date</th>
                                            <th>Grand Total</th>
                                            <th>Dues</th>
                                            <th>Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {invoices.filter(inv => {
                                            const q = invoiceSearch.toLowerCase();
                                            return inv.invoiceNumber.toLowerCase().includes(q) ||
                                                inv.patientName.toLowerCase().includes(q);
                                        }).map(inv => (
                                            <tr key={inv._id}>
                                                <td>{inv.invoiceNumber}</td>
                                                <td>{inv.patientName}</td>
                                                <td>{fmtDate(inv.invoiceDate)}</td>
                                                <td>{fmt(inv.grandTotal)}</td>
                                                <td>{fmt(inv.outstandingAmount)}</td>
                                                <td><span className={`badge-${inv.paymentStatus.toLowerCase().replace(' ', '-')}`}>{inv.paymentStatus}</span></td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button className="btn-print" onClick={() => exportInvoicePDF(inv)}><FiPrinter /> Export</button>
                                                        {inv.paymentStatus !== 'Paid' && inv.paymentStatus !== 'Cancelled' && (
                                                            <button className="btn-cancel" style={{ background: '#f87171' }} onClick={() => handleCancelInvoice(inv._id)}>Cancel</button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* 5. Payment Collection */}
                {activeTab === 'collect' && (
                    <div className="tab-pane-view">
                        <div className="patient-search-block">
                            <h3>Direct Dues Collection Desk</h3>
                            <p style={{ color: '#64748b' }}>Please search the patient profile inside <strong>Patient Billing</strong> to consolidately collect dues and allocate payments.</p>
                            <button className="p-search-btn" onClick={() => navigate('/billing/patient')} style={{ marginTop: '12px' }}>Go to Patient Billing</button>
                        </div>
                    </div>
                )}

                {/* 6. Payment History / Receipt Logs */}
                {activeTab === 'history' && (() => {
                    const todayStart = new Date();
                    todayStart.setHours(0, 0, 0, 0);

                    const userPayments = invoices.flatMap(inv => 
                        (inv.payments || []).map(p => ({ inv, p }))
                    ).filter(({ p }) => {
                        if (isReceptionist) {
                            const collectedById = typeof p.collectedBy === 'object' ? p.collectedBy?._id : p.collectedBy;
                            return String(collectedById) === String(user?._id);
                        }
                        return true;
                    });

                    const todayUserPayments = userPayments.filter(({ p }) => new Date(p.date) >= todayStart);

                    const totalTransactions = todayUserPayments.length;
                    const totalCollection = todayUserPayments.reduce((sum, { p }) => sum + p.amount, 0);
                    const cashCollection = todayUserPayments.filter(({ p }) => p.method === 'Cash').reduce((sum, { p }) => sum + p.amount, 0);
                    const upiCollection = todayUserPayments.filter(({ p }) => p.method === 'UPI' || p.method === 'UPI / QR').reduce((sum, { p }) => sum + p.amount, 0);
                    const cardCollection = todayUserPayments.filter(({ p }) => p.method === 'Card').reduce((sum, { p }) => sum + p.amount, 0);

                    const uniqueInvoiceIds = Array.from(new Set(todayUserPayments.map(({ inv }) => inv._id?.toString())));
                    const uniqueInvoices = uniqueInvoiceIds.map(id => invoices.find(inv => inv._id?.toString() === id)).filter(Boolean);
                    const pendingAmount = uniqueInvoices.reduce((sum, inv) => sum + (inv.outstandingAmount || 0), 0);

                    return (
                        <div className="tab-pane-view">
                            {/* Daily Collection Summary Widget */}
                            <div className="billing-section-box" style={{ marginBottom: '24px' }}>
                                <h3>Daily Collection Summary (Today)</h3>
                                <div className="billing-stats-grid" style={{ marginTop: '12px' }}>
                                    <div className="stat-card">
                                        <span className="stat-label">Total Transactions</span>
                                        <h3 className="stat-val text-teal">{totalTransactions}</h3>
                                    </div>
                                    <div className="stat-card">
                                        <span className="stat-label">Total Collection</span>
                                        <h3 className="stat-val">{fmt(totalCollection)}</h3>
                                    </div>
                                    <div className="stat-card">
                                        <span className="stat-label">Cash Collection</span>
                                        <h3 className="stat-val text-indigo">{fmt(cashCollection)}</h3>
                                    </div>
                                    <div className="stat-card">
                                        <span className="stat-label">UPI Collection</span>
                                        <h3 className="stat-val text-purple">{fmt(upiCollection)}</h3>
                                    </div>
                                    <div className="stat-card">
                                        <span className="stat-label">Card Collection</span>
                                        <h3 className="stat-val text-cyan">{fmt(cardCollection)}</h3>
                                    </div>
                                    <div className="stat-card">
                                        <span className="stat-label">Pending Invoice Amount</span>
                                        <h3 className="stat-val text-rose">{fmt(pendingAmount)}</h3>
                                    </div>
                                </div>
                            </div>

                            <div className="billing-section-box">
                                <h3>{isReceptionist ? 'My Issued Payment Receipts' : 'Issued Payment Receipts'}</h3>
                                <div className="table-responsive">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Receipt No</th>
                                                <th>Invoice No</th>
                                                <th>Patient Name</th>
                                                <th>Amount Collected</th>
                                                <th>Payment Method</th>
                                                <th>Date Collected</th>
                                                <th>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {userPayments.length === 0 ? (
                                                <tr>
                                                    <td colSpan="7" style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>
                                                        No payment receipts found.
                                                    </td>
                                                </tr>
                                            ) : (
                                                userPayments.map(({ inv, p }) => (
                                                    <tr key={p.receiptNumber}>
                                                        <td>{p.receiptNumber}</td>
                                                        <td>{inv.invoiceNumber}</td>
                                                        <td>{inv.patientName}</td>
                                                        <td style={{ fontWeight: 'bold' }}>{fmt(p.amount)}</td>
                                                        <td>{p.method}</td>
                                                        <td>{fmtDateTime(p.date)}</td>
                                                        <td>
                                                            <button className="btn-print" onClick={() => exportReceiptPDF(inv, p)}><FiPrinter /> Print Receipt</button>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* 7. Refunds */}
                {activeTab === 'refunds' && (
                    <div className="tab-pane-view">
                        <div className="section-head-actions">
                            <h3>Refund Management Desk</h3>
                            <button className="btn-save" onClick={() => setRefundModal(true)}>+ Request Manual Refund</button>
                        </div>

                        <div className="billing-section-box" style={{ marginTop: '20px' }}>
                            <h3>Refund Log History</h3>
                            <div className="table-responsive">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Patient Name</th>
                                            <th>Invoice Ref</th>
                                            <th>Refund Type</th>
                                            <th>Amount</th>
                                            <th>Status</th>
                                            <th>Requested By</th>
                                            <th>Date</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {refunds.map(ref => (
                                            <tr key={ref._id}>
                                                <td>{ref.patientName}</td>
                                                <td>{ref.invoiceNumber || '—'}</td>
                                                <td>{ref.refundType}</td>
                                                <td style={{ color: '#dc2626', fontWeight: 'bold' }}>-{fmt(ref.amount)}</td>
                                                <td><span className={`badge-refund status-${ref.status.toLowerCase().replace(' ', '-')}`}>{ref.status}</span></td>
                                                <td>{ref.requestedByName}</td>
                                                <td>{fmtDate(ref.createdAt)}</td>
                                                <td>
                                                    {ref.status === 'Refund Pending' && !isReceptionist && (
                                                        <button className="btn-collect" onClick={() => handleApproveRefund(ref._id)}>Approve & Settle</button>
                                                    )}
                                                    {ref.status === 'Refunded' && (
                                                        <span style={{ color: '#16a34a', fontSize: '12px' }}>Processed ✓</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* 8. Revenue Reports */}
                {activeTab === 'reports' && (
                    <div className="tab-pane-view">
                        <div className="reports-filter-block">
                            <h3>Generate Department Reports</h3>
                            <div className="report-buttons" style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                                <button className={`report-btn ${reports.type === 'daily' ? 'active' : ''}`} onClick={() => triggerReport('daily')}>Daily Revenue</button>
                                <button className={`report-btn ${reports.type === 'weekly' ? 'active' : ''}`} onClick={() => triggerReport('weekly')}>Weekly Revenue</button>
                                <button className={`report-btn ${reports.type === 'monthly' ? 'active' : ''}`} onClick={() => triggerReport('monthly')}>Monthly Revenue</button>
                                <button className={`report-btn ${reports.type === 'yearly' ? 'active' : ''}`} onClick={() => triggerReport('yearly')}>Yearly Revenue</button>
                            </div>
                        </div>

                        <div className="billing-section-box" style={{ marginTop: '20px' }}>
                            <h3>Report Output: {reports.type?.toUpperCase()} Summary</h3>
                            {generatingReport ? (
                                <p>Generating Report...</p>
                            ) : (
                                <div className="table-responsive">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Transaction Date</th>
                                                <th>Reference Receipt</th>
                                                <th>Patient Name</th>
                                                <th>Type</th>
                                                <th>Payment Method</th>
                                                <th>Total Collected</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {reports.records.map((rec, i) => (
                                                <tr key={i}>
                                                    <td>{fmtDateTime(rec.date)}</td>
                                                    <td>{rec.ref}</td>
                                                    <td>{rec.patient}</td>
                                                    <td>{rec.type}</td>
                                                    <td>{rec.method}</td>
                                                    <td style={{ fontWeight: 'bold', color: '#16a34a' }}>{fmt(rec.amount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 9. Billing Analytics */}
                {activeTab === 'analytics' && (
                    <div className="tab-pane-view">
                        <div className="billing-stats-grid">
                            <div className="stat-card">
                                <span className="stat-label">Total Outstanding Dues</span>
                                <h3 className="stat-val text-rose">{fmt(analytics?.outstandingDues)}</h3>
                            </div>
                            <div className="stat-card">
                                <span className="stat-label">Paid Invoices</span>
                                <h3 className="stat-val">{analytics?.paidInvoices}</h3>
                            </div>
                            <div className="stat-card">
                                <span className="stat-label">Partial Payments</span>
                                <h3 className="stat-val text-teal">{analytics?.partialPayments}</h3>
                            </div>
                        </div>

                        <div className="billing-section-box" style={{ marginTop: '24px' }}>
                            <h3>Revenue Streams Contribution Analysis</h3>
                            <div className="collection-methods-wrap">
                                <div className="c-method-card" style={{ borderLeftColor: '#6366f1' }}>
                                    <span>Laboratory</span>
                                    <h2>{fmt(analytics?.labRevenue)}</h2>
                                </div>
                                <div className="c-method-card" style={{ borderLeftColor: '#10b981' }}>
                                    <span>Pharmacy</span>
                                    <h2>{fmt(analytics?.pharmacyRevenue)}</h2>
                                </div>
                                <div className="c-method-card" style={{ borderLeftColor: '#f59e0b' }}>
                                    <span>IPD Admissions</span>
                                    <h2>{fmt(analytics?.admissionRevenue)}</h2>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 10. Invoice Templates */}
                {activeTab === 'templates' && (
                    <div className="tab-pane-view">
                        <div className="billing-section-box">
                            <h3>Choose Invoice Theme / Template</h3>
                            <p style={{ color: '#64748b', marginBottom: '16px' }}>Select the theme layout to apply on pdf generated invoices.</p>
                            <div className="template-themes-grid">
                                {['Classic Navy', 'Teal Grace', 'Sleek Dark'].map(theme => (
                                    <div
                                        key={theme}
                                        onClick={() => {
                                            setActiveTemplate(theme);
                                            setSuccess(`Invoice layout theme switched to ${theme}`);
                                        }}
                                        className={`theme-card ${activeTemplate === theme ? 'active' : ''}`}
                                    >
                                        <div className="theme-preview" style={{
                                            background: theme === 'Classic Navy' ? '#0a2647' : (theme === 'Teal Grace' ? '#14b8a6' : '#0f172a')
                                        }}></div>
                                        <span>{theme}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* 11. Settings */}
                {activeTab === 'settings' && (
                    <div className="tab-pane-view">
                        <div className="billing-section-box" style={{ maxWidth: '600px' }}>
                            <h3>Billing Configuration & Parameters</h3>
                            <form onSubmit={saveSettings} style={{ marginTop: '16px' }} className="settings-form">
                                <div className="form-group" style={{ marginBottom: '16px' }}>
                                    <label>Invoice Prefix</label>
                                    <input
                                        type="text"
                                        value={settings.invoicePrefix}
                                        onChange={e => setSettings({ ...settings, invoicePrefix: e.target.value })}
                                        className="staff-input"
                                    />
                                </div>
                                <div className="form-group" style={{ marginBottom: '16px' }}>
                                    <label>Receipt Prefix</label>
                                    <input
                                        type="text"
                                        value={settings.receiptPrefix}
                                        onChange={e => setSettings({ ...settings, receiptPrefix: e.target.value })}
                                        className="staff-input"
                                    />
                                </div>
                                <div className="form-group" style={{ marginBottom: '16px' }}>
                                    <label>Tax Rate (GST / VAT %)</label>
                                    <input
                                        type="number"
                                        value={settings.taxRate}
                                        onChange={e => setSettings({ ...settings, taxRate: Number(e.target.value) })}
                                        className="staff-input"
                                    />
                                </div>
                                <button type="submit" className="p-search-btn">Save Configuration</button>
                            </form>
                        </div>
                    </div>
                )}
            </div>

            {/* Collect Payment Modal Dialog */}
            {payModal && activeInvoice && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '450px' }}>
                        <h3>Collect Dues on Invoice {activeInvoice.invoiceNumber}</h3>
                        <form onSubmit={handleCollectPayment}>
                            <div className="form-group" style={{ marginBottom: '16px' }}>
                                <label className="staff-label">Outstanding Amount: {fmt(activeInvoice.outstandingAmount)}</label>
                            </div>
                            <div className="form-group" style={{ marginBottom: '16px' }}>
                                <label className="staff-label">Payment Amount (INR)</label>
                                <input
                                    type="number"
                                    min="1"
                                    max={activeInvoice.outstandingAmount}
                                    value={payAmount}
                                    onChange={e => setPayAmount(Number(e.target.value))}
                                    required
                                    className="staff-input"
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: '16px' }}>
                                <label className="staff-label">Payment Mode</label>
                                <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} className="staff-input">
                                    <option value="Cash">Cash</option>
                                    <option value="Card">Card</option>
                                    <option value="UPI">UPI / QR</option>
                                    <option value="Bank Transfer">Bank Transfer</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ marginBottom: '20px' }}>
                                <label className="staff-label">Transaction Reference (Optional)</label>
                                <input
                                    type="text"
                                    placeholder="UPI Txn ID or Card Auth Code"
                                    value={payReference}
                                    onChange={e => setPayReference(e.target.value)}
                                    className="staff-input"
                                />
                            </div>
                            <div className="modal-buttons">
                                <button type="submit" className="btn-save" disabled={paying}>
                                    {paying ? 'Processing...' : 'Settle Payment'}
                                </button>
                                <button type="button" className="btn-cancel" onClick={() => setPayModal(false)}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Request Refund Modal Dialog */}
            {refundModal && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '450px' }}>
                        <h3>Request Billing Refund</h3>
                        <form onSubmit={handleRequestRefund}>
                            {!selectedModalPatient ? (
                                <div className="form-group" style={{ marginBottom: '16px', position: 'relative' }}>
                                    <label className="staff-label">Search Patient (Name or Phone) <span style={{ color: '#ef4444' }}>*</span></label>
                                    <input
                                        type="text"
                                        placeholder="Type name or phone number..."
                                        value={modalSearchQuery}
                                        onChange={async (e) => {
                                            const val = e.target.value;
                                            setModalSearchQuery(val);
                                            if (val.length > 2) {
                                                try {
                                                    const res = await receptionAPI.searchPatients(val);
                                                    if (res.success) setModalSearchResults(res.patients || []);
                                                } catch (err) {
                                                    console.error('Error searching patients:', err);
                                                }
                                            } else {
                                                setModalSearchResults([]);
                                            }
                                        }}
                                        className="staff-input"
                                        required
                                    />
                                    {modalSearchResults.length > 0 && (
                                        <div style={{
                                            position: 'absolute',
                                            top: '100%',
                                            left: 0,
                                            right: 0,
                                            backgroundColor: '#fff',
                                            border: '1.5px solid #6366f1',
                                            borderRadius: '10px',
                                            boxShadow: '0 8px 24px rgba(99,102,241,0.18)',
                                            zIndex: 99999,
                                            maxHeight: '220px',
                                            overflowY: 'auto',
                                            marginTop: '4px'
                                        }}>
                                            <div style={{ padding: '7px 12px 4px', fontSize: '0.7rem', color: '#6366f1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #e0e7ff' }}>
                                                🔍 {modalSearchResults.length} patient{modalSearchResults.length !== 1 ? 's' : ''} found
                                            </div>
                                            {modalSearchResults.map((pat, idx) => (
                                                <div
                                                    key={pat._id}
                                                    onClick={() => {
                                                        setSelectedModalPatient(pat);
                                                        setModalSearchQuery('');
                                                        setModalSearchResults([]);
                                                        setRefundForm(prev => ({
                                                            ...prev,
                                                            patientId: pat._id,
                                                            patientName: pat.name,
                                                            patientPhone: pat.phone || ''
                                                        }));
                                                    }}
                                                    style={{
                                                        padding: '10px 12px',
                                                        cursor: 'pointer',
                                                        borderBottom: idx < modalSearchResults.length - 1 ? '1px solid #f1f5f9' : 'none',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '10px',
                                                        transition: 'background 0.15s'
                                                    }}
                                                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#eff6ff'; }}
                                                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}
                                                >
                                                    <div style={{
                                                        width: '32px', height: '32px', borderRadius: '50%',
                                                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        color: '#fff', fontWeight: 800, fontSize: '0.85rem', flexShrink: 0
                                                    }}>
                                                        {(pat.name || 'P')[0].toUpperCase()}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pat.name}</div>
                                                        <div style={{ fontSize: '0.73rem', color: '#64748b' }}>
                                                            📱 {pat.phone || '—'} &nbsp;•&nbsp; MRN: {pat.patientId || 'N/A'}
                                                        </div>
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: '#6366f1', fontWeight: 700, whiteSpace: 'nowrap' }}>✓ Select</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                </div>
                            ) : (
                                <div className="form-group" style={{ marginBottom: '16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                        <label className="staff-label" style={{ marginBottom: 0 }}>Selected Patient</label>
                                        {!patient && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSelectedModalPatient(null);
                                                    setRefundForm(p => ({ ...p, patientId: '', patientName: '', patientPhone: '' }));
                                                }}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: '#ef4444',
                                                    fontSize: '11px',
                                                    fontWeight: '600',
                                                    cursor: 'pointer',
                                                    padding: 0
                                                }}
                                            >
                                                Change Patient
                                            </button>
                                        )}
                                    </div>
                                    <div style={{
                                        padding: '10px 12px',
                                        backgroundColor: '#f8fafc',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <div>
                                            <strong style={{ display: 'block', fontSize: '14px', color: '#1e293b' }}>{selectedModalPatient.name}</strong>
                                            <span style={{ fontSize: '12px', color: '#64748b' }}>Phone: {selectedModalPatient.phone || '—'}</span>
                                        </div>
                                        <span style={{
                                            fontSize: '11px',
                                            padding: '2px 8px',
                                            backgroundColor: '#e0f2fe',
                                            color: '#0369a1',
                                            borderRadius: '12px',
                                            fontWeight: '600'
                                        }}>
                                            MRN: {selectedModalPatient.mrn || selectedModalPatient.patientId || 'N/A'}
                                        </span>
                                    </div>
                                </div>
                            )}

                            <div className="form-group" style={{ marginBottom: '16px' }}>
                                <label className="staff-label">Refund Category</label>
                                <select
                                    value={refundForm.type}
                                    onChange={e => setRefundForm({ ...refundForm, type: e.target.value })}
                                    className="staff-input"
                                >
                                    <option value="Cancelled Lab Test">Cancelled Lab Test</option>
                                    <option value="Returned Medicine">Returned Medicine</option>
                                    <option value="Duplicate Payment">Duplicate Payment</option>
                                    <option value="Manual Refund">Manual Refund</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ marginBottom: '16px' }}>
                                <label className="staff-label">Linked Invoice Prefix/No (Optional)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. INV-2026-000001"
                                    value={refundForm.invoiceNumber}
                                    onChange={e => setRefundForm({ ...refundForm, invoiceNumber: e.target.value })}
                                    className="staff-input"
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: '16px' }}>
                                <label className="staff-label">Refund Amount (INR)</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={refundForm.amount}
                                    onChange={e => setRefundForm({ ...refundForm, amount: Number(e.target.value) })}
                                    required
                                    className="staff-input"
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: '20px' }}>
                                <label className="staff-label">Reason for Refund</label>
                                <textarea
                                    rows="3"
                                    placeholder="Explain reason for refund..."
                                    value={refundForm.reason}
                                    onChange={e => setRefundForm({ ...refundForm, reason: e.target.value })}
                                    required
                                    className="staff-input"
                                    style={{ padding: '8px' }}
                                />
                            </div>
                            <div className="modal-buttons">
                                <button type="submit" className="btn-save" disabled={submittingRefund}>
                                    {submittingRefund ? 'Submitting...' : 'Submit Request'}
                                </button>
                                <button type="button" className="btn-cancel" onClick={() => setRefundModal(false)}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BillingDashboard;
