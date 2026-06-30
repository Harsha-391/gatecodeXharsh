import React, { useState, useEffect, useMemo } from 'react';
import { administratorAPI } from '../../utils/api';
import {
    FiFileText, FiRefreshCw, FiDownload, FiInfo, FiAlertTriangle,
    FiChevronLeft, FiChevronRight, FiFilter, FiCalendar, FiSearch,
    FiUsers, FiActivity, FiHome, FiPackage, FiClipboard, FiGrid,
    FiShield, FiDollarSign, FiTrendingUp, FiBarChart2
} from 'react-icons/fi';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import './Reports.css';

const PAGE_SIZE = 25;

const TABS = [
    { id: 'patients',     label: 'Patients Registry',        icon: <FiUsers /> },
    { id: 'appointments', label: 'Appointments',              icon: <FiCalendar /> },
    { id: 'admissions',   label: 'Admissions & IPD',          icon: <FiHome /> },
    { id: 'lab',          label: 'Laboratory',                icon: <FiActivity /> },
    { id: 'pharmacy',     label: 'Pharmacy',                  icon: <FiPackage /> },
    { id: 'doctors',      label: 'Doctor Master',             icon: <FiClipboard /> },
    { id: 'revenue',      label: 'Billing & Invoices',        icon: <FiFileText /> },
    { id: 'insurance',    label: 'Insurance Claims',          icon: <FiShield /> },
    { id: 'financial',    label: 'Financial Summary',         icon: <FiDollarSign /> },
    { id: 'beds',         label: 'Bed Occupancy',             icon: <FiGrid /> },
    { id: 'services',     label: 'Services',                  icon: <FiBarChart2 /> },
    { id: 'audit',        label: 'Audit Summary',             icon: <FiTrendingUp /> },
];

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';
const badge = (val, map = {}) => {
    const lower = String(val || '').toLowerCase().replace(/\s+/g, '');
    const cls = map[lower] || lower;
    return <span className={`badge-rep ${cls}`}>{val || '—'}</span>;
};

const Reports = () => {
    const today = new Date().toLocaleDateString('en-CA');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('patients');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // All datasets
    const [data, setData] = useState({
        patientReports: [], appointmentReports: [], admissionReports: [],
        labReports: [], pharmacyReports: [], doctorReports: [],
        revenueReports: [], insuranceClaims: [], financialSummary: null,
        bedOccupancy: null, servicesReport: [], auditSummary: [], auditByAction: {}
    });

    const fetchData = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await administratorAPI.getReports(startDate || null, endDate || null);
            if (res.success && res.data) {
                setData({
                    patientReports:     res.data.patientReports || [],
                    appointmentReports: res.data.appointmentReports || [],
                    admissionReports:   res.data.admissionReports || [],
                    labReports:         res.data.labReports || [],
                    pharmacyReports:    res.data.pharmacyReports || [],
                    doctorReports:      res.data.doctorReports || [],
                    revenueReports:     res.data.revenueReports || [],
                    insuranceClaims:    res.data.insuranceClaims || [],
                    financialSummary:   res.data.financialSummary || null,
                    bedOccupancy:       res.data.bedOccupancy || null,
                    servicesReport:     res.data.servicesReport || [],
                    auditSummary:       res.data.auditSummary || [],
                    auditByAction:      res.data.auditByAction || {},
                });
            } else {
                setError(res.message || 'Failed to load reports.');
            }
        } catch (err) {
            setError('Error loading reports. Check network or server.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []); // eslint-disable-line

    // ── Filtered data per tab ──
    const tabData = useMemo(() => {
        const q = search.toLowerCase().trim();
        const filterArr = (arr, keys) => !q ? arr : arr.filter(r => keys.some(k => {
            const val = String(r[k] || '').toLowerCase();
            return val.includes(q);
        }));

        switch (activeTab) {
            case 'patients':     return filterArr(data.patientReports,     ['name','email','phone','patientId','city','gender','bloodGroup']);
            case 'appointments': return filterArr(data.appointmentReports, ['doctorName','serviceName','status','paymentStatus']);
            case 'admissions':   return filterArr(data.admissionReports,   ['patientName','ward','bedNumber','status','paymentStatus','priority']);
            case 'lab':          return filterArr(data.labReports,         ['patientId','testStatus','reportStatus','paymentStatus','sampleType','status']);
            case 'pharmacy':     return filterArr(data.pharmacyReports,    ['patientId','paymentStatus','orderStatus']);
            case 'doctors':      return filterArr(data.doctorReports,      ['name','specialization','specialty','status','employmentType','medicalLicense']);
            case 'revenue':      return filterArr(data.revenueReports,     ['invoiceNumber','patientName','paymentStatus']);
            case 'insurance':    return filterArr(data.insuranceClaims,    ['claimNumber','patientName','insuranceProvider','policyNumber','status']);
            case 'services':     return filterArr(data.servicesReport,     ['title','category','serviceType','department','billingType']);
            case 'audit':        return filterArr(data.auditSummary,       ['action','userEmail','userRole','severity','status']);
            case 'beds':         return filterArr(data.bedOccupancy?.currentPatients || [], ['patientName','ward','bedNumber','priority']);
            case 'financial':    return [];
            default:             return [];
        }
    }, [activeTab, search, data]);

    // Paginated slice
    const totalPages = Math.max(1, Math.ceil(tabData.length / PAGE_SIZE));
    const paginated = useMemo(() => tabData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [tabData, page]);

    const resetPage = () => setPage(1);

    // ── Export helpers ──
    const buildExportRows = () => {
        switch (activeTab) {
            case 'patients':
                return {
                    headers: ['Patient ID', 'Name', 'Phone', 'Gender / DOB', 'Assigned Doctor', 'Registration Date'],
                    rows: tabData.map(p => [
                        p.patientId || '—',
                        p.name || '',
                        p.phone || '',
                        `${p.gender || '—'} · ${fmtDate(p.dob)}`,
                        p.doctorName || '—',
                        fmtDate(p.createdAt)
                    ])
                };
            case 'appointments':
                return {
                    headers: ['Doctor','Service','Date','Time','Fee','Status','Payment'],
                    rows: tabData.map(a => [a.doctorName||'',a.serviceName||'',fmtDate(a.appointmentDate),a.appointmentTime||'',a.amount||0,a.status||'',a.paymentStatus||''])
                };
            case 'admissions':
                return {
                    headers: ['Patient','Ward','Bed','Priority','Admitted','Discharged','Cost','Status','Payment'],
                    rows: tabData.map(a => [a.patientName||'',a.ward||'',a.bedNumber||'',a.priority||'',fmtDate(a.admissionDate),a.dischargeDate?fmtDate(a.dischargeDate):'Active',a.totalAmount||0,a.status||'',a.paymentStatus||''])
                };
            case 'lab':
                return {
                    headers: ['Patient ID','Tests','Status','Report','Payment','Mode','Amount','Sample','Collected At'],
                    rows: tabData.map(l => [l.patientId||'',Array.isArray(l.testNames)?l.testNames.join(', '):l.testNames||'',l.testStatus||'',l.reportStatus||'',l.paymentStatus||'',l.paymentMode||'',l.amount||0,l.sampleType||'',fmtDate(l.sampleCollectedAt)])
                };
            case 'pharmacy':
                return {
                    headers: ['Patient ID','Items','Total Amount','Payment Status','Order Status','Date'],
                    rows: tabData.map(p => [p.patientId||'',Array.isArray(p.items)?p.items.map(i=>i.medicineName).join(', '):'',p.totalAmount||0,p.paymentStatus||'',p.orderStatus||'',fmtDate(p.createdAt)])
                };
            case 'doctors':
                return {
                    headers: ['Doctor ID','Name','Department','Specialization','Qualification','License No.','Joining Date','Status','Employment Type'],
                    rows: tabData.map(d => [d.doctorId||'—',d.name||'',Array.isArray(d.departments)?d.departments.join(', '):d.specialty||'',d.specialization||d.specialty||'',Array.isArray(d.qualification)?d.qualification.join(', '):'',d.medicalLicense||'—',fmtDate(d.joiningDate),d.status||'',d.employmentType||''])
                };
            case 'revenue':
                return {
                    headers: ['Invoice #','Date','Patient','Total','Paid','Outstanding','Status'],
                    rows: tabData.map(r => [r.invoiceNumber||'',fmtDate(r.invoiceDate),r.patientName||'',r.grandTotal||0,r.amountPaid||0,r.outstandingAmount||0,r.paymentStatus||''])
                };
            case 'insurance':
                return {
                    headers: ['Claim #','Patient','Policy No.','Provider','Invoice','Claim Amt','Approved Amt','Status','Submitted'],
                    rows: tabData.map(c => [c.claimNumber||'',c.patientName||'',c.policyNumber||'',c.insuranceProvider||'',c.invoiceNumber||'',c.claimAmount||0,c.approvedAmount||0,c.status||'',fmtDate(c.submissionDate)])
                };
            case 'services':
                return {
                    headers: ['Service','Category','Type','Department','Price','GST','Billing','Duration','Active','Visibility'],
                    rows: tabData.map(s => [s.title||'',s.category||'',s.serviceType||'',s.department||'',s.price||0,`${s.gst||0}%`,s.billingType||'',s.duration||'',s.active?'Yes':'No',s.visibility||''])
                };
            case 'audit':
                return {
                    headers: ['Action','User Email','Role','IP','Severity','Status','Timestamp'],
                    rows: tabData.map(a => [a.action||'',a.userEmail||'',a.userRole||'',a.ipAddress||'',a.severity||'',a.status||'',fmtDate(a.timestamp)])
                };
            case 'beds':
                return {
                    headers: ['Patient','Ward','Bed No.','Admitted','Priority'],
                    rows: tabData.map(b => [b.patientName||'',b.ward||'',b.bedNumber||'',fmtDate(b.admissionDate),b.priority||''])
                };
            default:
                return { headers: [], rows: [] };
        }
    };

    const handleExportCSV = () => {
        const { headers, rows } = buildExportRows();
        if (!rows.length) return;
        const escape = v => `"${String(v ?? '').replace(/"/g,'""')}"`;
        const csv = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${activeTab}_report_${Date.now()}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    const handleExportXLSX = () => {
        const { headers, rows } = buildExportRows();
        if (!rows.length && activeTab !== 'financial' && activeTab !== 'beds') return;
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, activeTab.charAt(0).toUpperCase() + activeTab.slice(1));
        XLSX.writeFile(wb, `${activeTab}_report_${Date.now()}.xlsx`);
    };

    const handleExportPDF = () => {
        const { headers, rows } = buildExportRows();
        if (!rows.length && activeTab !== 'financial' && activeTab !== 'beds') return;
        const doc = new jsPDF({ orientation: rows[0]?.length > 6 ? 'landscape' : 'portrait' });
        const tab = TABS.find(t => t.id === activeTab);
        const title = `Hospital Admin — ${tab?.label || activeTab}`;
        doc.setFontSize(16); doc.setTextColor(30, 41, 59);
        doc.text(title, 14, 18);
        doc.setFontSize(9); doc.setTextColor(100, 116, 139);
        doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 14, 25);
        if (activeTab === 'financial' && data.financialSummary) {
            const fs = data.financialSummary;
            const sumRows = [
                ['Total Billed', fmt(fs.totalBilled)],
                ['Total Collected', fmt(fs.totalRevenue)],
                ['Outstanding', fmt(fs.totalOutstanding)],
                ['Paid Invoices', fs.paidInvoices],
                ['Pending Invoices', fs.pendingInvoices],
                ['Total Invoices', fs.totalInvoices],
            ];
            autoTable(doc, { startY: 30, head: [['Metric','Value']], body: sumRows, theme:'striped', headStyles:{ fillColor:[30,132,127] } });
        } else if (activeTab === 'beds' && data.bedOccupancy) {
            const bo = data.bedOccupancy;
            const sumRows = [
                ['Total Beds', bo.totalBeds],['ICU Total', bo.icuTotal],['Ward Total', bo.wardTotal],
                ['Occupied', bo.occupied],['Available', bo.available],['Occupancy Rate', `${bo.occupancyRate}%`],
                ['ICU Occupied', bo.icuOccupied],['Ward Occupied', bo.wardOccupied],
            ];
            autoTable(doc, { startY: 30, head: [['Metric','Value']], body: sumRows, theme:'striped', headStyles:{ fillColor:[30,132,127] } });
            if (rows.length) {
                autoTable(doc, { startY: doc.lastAutoTable.finalY + 10, head: [headers], body: rows, theme:'striped', headStyles:{ fillColor:[30,132,127] } });
            }
        } else {
            autoTable(doc, { startY: 30, head: [headers], body: rows, theme:'striped', headStyles:{ fillColor:[30,132,127] }, styles:{ fontSize:8 } });
        }
        doc.save(`${activeTab}_report_${Date.now()}.pdf`);
    };

    // ── Render helpers ──
    const renderPaginator = () => (
        <div className="rep-paginator">
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}><FiChevronLeft /></button>
            <span>Page {page} of {totalPages} · {tabData.length} records</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}><FiChevronRight /></button>
        </div>
    );

    const renderTable = () => {
        if (activeTab === 'financial') return renderFinancialSummary();
        if (activeTab === 'beds') return renderBedOccupancy();
        if (!paginated.length) return <div className="rep-empty">No records found{search ? ` matching "${search}"` : ''}.</div>;

        switch (activeTab) {
            case 'patients': return (
                <><table className="rep-table"><thead><tr><th>Patient ID</th><th>Name</th><th>Phone</th><th>Gender / DOB</th><th>Assigned Doctor</th><th>Registration Date</th></tr></thead>
                <tbody>{paginated.map((p,i)=><tr key={i}><td><strong>{p.patientId||'—'}</strong></td><td><strong>{p.name}</strong></td><td>{p.phone||'—'}</td><td>{p.gender} · <span style={{color:'#64748b'}}>{fmtDate(p.dob)}</span></td><td><strong>{p.doctorName||'—'}</strong></td><td>{fmtDate(p.createdAt)}</td></tr>)}</tbody>
                </table>{renderPaginator()}</>
            );
            case 'appointments': return (
                <><table className="rep-table"><thead><tr><th>Doctor</th><th>Service</th><th>Date</th><th>Time</th><th>Fee</th><th>Status</th><th>Payment</th></tr></thead>
                <tbody>{paginated.map((a,i)=><tr key={i}><td><strong>{a.doctorName||'—'}</strong></td><td>{a.serviceName}</td><td>{fmtDate(a.appointmentDate)}</td><td>{a.appointmentTime||'—'}</td><td><strong>{fmt(a.amount)}</strong></td><td>{badge(a.status)}</td><td>{badge(a.paymentStatus,{paid:'paid',pending:'pending',unpaid:'pending'})}</td></tr>)}</tbody>
                </table>{renderPaginator()}</>
            );
            case 'admissions': return (
                <><table className="rep-table"><thead><tr><th>Patient</th><th>Ward / Bed</th><th>Priority</th><th>Admitted</th><th>Discharged</th><th>Cost</th><th>Status</th><th>Payment</th></tr></thead>
                <tbody>{paginated.map((a,i)=><tr key={i}><td><strong>{a.patientName}</strong></td><td>{a.ward} · <span style={{color:'#475569',fontWeight:600}}>{a.bedNumber}</span></td><td>{a.priority||'—'}</td><td>{fmtDate(a.admissionDate)}</td><td>{a.dischargeDate?fmtDate(a.dischargeDate):<span style={{color:'#059669',fontWeight:'bold'}}>Active</span>}</td><td><strong>{fmt(a.totalAmount)}</strong></td><td>{badge(a.status)}</td><td>{badge(a.paymentStatus)}</td></tr>)}</tbody>
                </table>{renderPaginator()}</>
            );
            case 'lab': return (
                <><table className="rep-table"><thead><tr><th>Patient ID</th><th>Tests</th><th>Test Status</th><th>Report</th><th>Payment</th><th>Mode</th><th>Amount</th><th>Sample</th><th>Date</th></tr></thead>
                <tbody>{paginated.map((l,i)=><tr key={i}><td><strong>{l.patientId||'—'}</strong></td><td><small>{Array.isArray(l.testNames)?l.testNames.join(', '):l.testNames||'—'}</small></td><td>{badge(l.testStatus)}</td><td>{badge(l.reportStatus)}</td><td>{badge(l.paymentStatus)}</td><td>{l.paymentMode||'—'}</td><td><strong>{fmt(l.amount)}</strong></td><td>{l.sampleType||'—'}</td><td>{fmtDate(l.createdAt)}</td></tr>)}</tbody>
                </table>{renderPaginator()}</>
            );
            case 'pharmacy': return (
                <><table className="rep-table"><thead><tr><th>Patient ID</th><th>Medicines</th><th>Total</th><th>Payment</th><th>Status</th><th>Date</th></tr></thead>
                <tbody>{paginated.map((p,i)=><tr key={i}><td><strong>{p.patientId||'—'}</strong></td><td><small>{Array.isArray(p.items)?p.items.map(m=>m.medicineName).filter(Boolean).join(', '):''||'—'}</small></td><td><strong>{fmt(p.totalAmount)}</strong></td><td>{badge(p.paymentStatus)}</td><td>{badge(p.orderStatus)}</td><td>{fmtDate(p.createdAt)}</td></tr>)}</tbody>
                </table>{renderPaginator()}</>
            );
            case 'doctors': return (
                <><table className="rep-table"><thead><tr><th>Doctor ID</th><th>Name</th><th>Department</th><th>Specialization</th><th>Qualification</th><th>License No.</th><th>Joining Date</th><th>Employment</th><th>Status</th></tr></thead>
                <tbody>{paginated.map((d,i)=><tr key={i}><td><strong>{d.doctorId||'—'}</strong></td><td><strong>{d.name}</strong></td><td>{Array.isArray(d.departments)&&d.departments.length?d.departments.join(', '):d.specialty||'—'}</td><td>{d.specialization||d.specialty||'—'}</td><td><small>{Array.isArray(d.qualification)?d.qualification.join(', '):d.qualification||'—'}</small></td><td>{d.medicalLicense||'—'}</td><td>{fmtDate(d.joiningDate)}</td><td><span className="tag-blue">{d.employmentType||'—'}</span></td><td>{badge(d.status,{active:'paid',inactive:'pending','onleave':'pending'})}</td></tr>)}</tbody>
                </table>{renderPaginator()}</>
            );
            case 'revenue': return (
                <><table className="rep-table"><thead><tr><th>Invoice #</th><th>Date</th><th>Patient</th><th>Total</th><th>Paid</th><th>Outstanding</th><th>Status</th></tr></thead>
                <tbody>{paginated.map((r,i)=><tr key={i}><td><strong>{r.invoiceNumber}</strong></td><td>{fmtDate(r.invoiceDate)}</td><td><strong>{r.patientName}</strong></td><td><strong>{fmt(r.grandTotal)}</strong></td><td style={{color:'#059669',fontWeight:600}}>{fmt(r.amountPaid)}</td><td style={{color:'#dc2626',fontWeight:600}}>{fmt(r.outstandingAmount)}</td><td>{badge(r.paymentStatus)}</td></tr>)}</tbody>
                </table>{renderPaginator()}</>
            );
            case 'insurance': return (
                <><table className="rep-table"><thead><tr><th>Claim #</th><th>Patient</th><th>Provider</th><th>Policy No.</th><th>Claim Amt</th><th>Approved</th><th>Status</th><th>Submitted</th></tr></thead>
                <tbody>{paginated.map((c,i)=><tr key={i}><td><strong>{c.claimNumber||'—'}</strong></td><td><strong>{c.patientName}</strong></td><td>{c.insuranceProvider}</td><td>{c.policyNumber}</td><td><strong>{fmt(c.claimAmount)}</strong></td><td style={{color:'#059669',fontWeight:600}}>{fmt(c.approvedAmount)}</td><td>{badge(c.status)}</td><td>{fmtDate(c.submissionDate)}</td></tr>)}</tbody>
                </table>{renderPaginator()}</>
            );
            case 'services': return (
                <><table className="rep-table"><thead><tr><th>Service</th><th>Category</th><th>Type</th><th>Department</th><th>Price</th><th>GST</th><th>Billing</th><th>Active</th></tr></thead>
                <tbody>{paginated.map((s,i)=><tr key={i}><td><strong>{s.title}</strong></td><td>{s.category||'—'}</td><td><span className="tag-blue">{s.serviceType||'—'}</span></td><td>{s.department||'—'}</td><td><strong>{fmt(s.price)}</strong></td><td>{s.gst||0}%</td><td>{s.billingType||'—'}</td><td>{badge(s.active?'Active':'Inactive',{active:'paid',inactive:'pending'})}</td></tr>)}</tbody>
                </table>{renderPaginator()}</>
            );
            case 'audit': return (
                <><table className="rep-table"><thead><tr><th>Action</th><th>User Email</th><th>Role</th><th>IP</th><th>Severity</th><th>Status</th><th>Timestamp</th></tr></thead>
                <tbody>{paginated.map((a,i)=><tr key={i}><td><code>{a.action||'—'}</code></td><td>{a.userEmail||'—'}</td><td><span className="tag-blue">{a.userRole||'—'}</span></td><td>{a.ipAddress||'—'}</td><td>{badge(a.severity,{critical:'pending',warning:'warning',info:'paid',low:'paid'})}</td><td>{badge(a.status)}</td><td>{a.timestamp?new Date(a.timestamp).toLocaleString('en-IN'):'—'}</td></tr>)}</tbody>
                </table>{renderPaginator()}</>
            );
            default: return <div className="rep-empty">No data available.</div>;
        }
    };

    const renderFinancialSummary = () => {
        const fs = data.financialSummary;
        if (!fs) return <div className="rep-empty">Financial summary not available.</div>;
        return (
            <div className="rep-financial">
                <div className="rep-fin-cards">
                    <div className="rep-fin-card teal"><div className="rep-fin-label">Total Billed</div><div className="rep-fin-val">{fmt(fs.totalBilled)}</div></div>
                    <div className="rep-fin-card green"><div className="rep-fin-label">Collected</div><div className="rep-fin-val">{fmt(fs.totalRevenue)}</div></div>
                    <div className="rep-fin-card red"><div className="rep-fin-label">Outstanding</div><div className="rep-fin-val">{fmt(fs.totalOutstanding)}</div></div>
                    <div className="rep-fin-card blue"><div className="rep-fin-label">Total Invoices</div><div className="rep-fin-val">{fs.totalInvoices}</div></div>
                    <div className="rep-fin-card green"><div className="rep-fin-label">Paid</div><div className="rep-fin-val">{fs.paidInvoices}</div></div>
                    <div className="rep-fin-card orange"><div className="rep-fin-label">Pending</div><div className="rep-fin-val">{fs.pendingInvoices}</div></div>
                </div>
                <div className="rep-fin-tables">
                    <div>
                        <h4>Department Revenue Breakdown</h4>
                        <table className="rep-table"><thead><tr><th>Department</th><th>Revenue</th></tr></thead>
                        <tbody>{Object.entries(fs.departmentBreakdown||{}).map(([dept,amt],i)=><tr key={i}><td>{dept}</td><td><strong>{fmt(amt)}</strong></td></tr>)}</tbody></table>
                    </div>
                    <div>
                        <h4>Monthly Revenue (Last 6 Months)</h4>
                        <table className="rep-table"><thead><tr><th>Month</th><th>Revenue</th></tr></thead>
                        <tbody>{(fs.monthlyBreakdown||[]).map((m,i)=><tr key={i}><td>{m.month}</td><td><strong>{fmt(m.revenue)}</strong></td></tr>)}</tbody></table>
                    </div>
                </div>
            </div>
        );
    };

    const renderBedOccupancy = () => {
        const bo = data.bedOccupancy;
        if (!bo) return <div className="rep-empty">Bed occupancy data not available.</div>;
        return (
            <div className="rep-bed">
                <div className="rep-fin-cards">
                    <div className="rep-fin-card blue"><div className="rep-fin-label">Total Beds</div><div className="rep-fin-val">{bo.totalBeds}</div></div>
                    <div className="rep-fin-card red"><div className="rep-fin-label">Occupied</div><div className="rep-fin-val">{bo.occupied}</div></div>
                    <div className="rep-fin-card green"><div className="rep-fin-label">Available</div><div className="rep-fin-val">{bo.available}</div></div>
                    <div className="rep-fin-card teal"><div className="rep-fin-label">Occupancy Rate</div><div className="rep-fin-val">{bo.occupancyRate}%</div></div>
                    <div className="rep-fin-card orange"><div className="rep-fin-label">ICU Occupied</div><div className="rep-fin-val">{bo.icuOccupied} / {bo.icuTotal}</div></div>
                    <div className="rep-fin-card blue"><div className="rep-fin-label">Ward Occupied</div><div className="rep-fin-val">{bo.wardOccupied} / {bo.wardTotal}</div></div>
                </div>
                <h4>Currently Admitted Patients</h4>
                {paginated.length > 0 ? <>
                    <table className="rep-table"><thead><tr><th>Patient</th><th>Ward</th><th>Bed No.</th><th>Admitted</th><th>Priority</th></tr></thead>
                    <tbody>{paginated.map((b,i)=><tr key={i}><td><strong>{b.patientName}</strong></td><td>{b.ward}</td><td><strong>{b.bedNumber}</strong></td><td>{fmtDate(b.admissionDate)}</td><td>{badge(b.priority,{critical:'pending',high:'pending',medium:'warning',low:'paid'})}</td></tr>)}</tbody></table>
                    {renderPaginator()}
                </> : <div className="rep-empty">No patients currently admitted.</div>}
            </div>
        );
    };

    return (
        <div className="reports-page">
            {/* Header */}
            <div className="rep-header">
                <div>
                    <h1>Hospital Admin — Reports Center</h1>
                    <p>12 operational report modules with CSV, Excel, and PDF export. Strict admin-only access.</p>
                </div>
                <div className="rep-header-actions">
                    <div className="rep-date-range">
                        <FiCalendar style={{color:'#94a3b8'}} />
                        <input 
                            type="date" 
                            value={startDate} 
                            max={today}
                            onChange={e=>{
                                const val = e.target.value;
                                setStartDate(val > today ? today : val);
                                resetPage();
                            }} 
                            placeholder="From" 
                        />
                        <span style={{color:'#64748b'}}>to</span>
                        <input 
                            type="date" 
                            value={endDate} 
                            max={today}
                            onChange={e=>{
                                const val = e.target.value;
                                setEndDate(val > today ? today : val);
                                resetPage();
                            }} 
                            placeholder="To" 
                        />
                        {(startDate||endDate) && <button className="btn-clear-dates" onClick={()=>{setStartDate('');setEndDate('');resetPage();}}>✕ Clear</button>}
                    </div>
                    <button onClick={fetchData} className="btn-refresh-rep" disabled={loading}>
                        <FiRefreshCw className={loading ? 'spinning' : ''} /><span>Refresh</span>
                    </button>
                </div>
            </div>

            {error && <div className="res-banner error"><FiAlertTriangle /><span>{error}</span></div>}

            {loading ? (
                <div className="rep-loading">
                    <FiRefreshCw className="spinning" style={{fontSize:'2.5rem',display:'block',margin:'0 auto 16px'}} />
                    <p>Loading all report modules from database...</p>
                </div>
            ) : (
                <div className="reports-card">
                    {/* Tab strip */}
                    <div className="rep-tab-strip">
                        {TABS.map(t => (
                            <button key={t.id} className={`rep-tab-btn ${activeTab===t.id?'active':''}`}
                                onClick={()=>{setActiveTab(t.id);setSearch('');resetPage();}}>
                                {t.icon}<span>{t.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Controls bar */}
                    <div className="rep-controls">
                        <div className="rep-search-wrap">
                            <FiSearch />
                            <input type="text" placeholder={`Search ${TABS.find(t=>t.id===activeTab)?.label}...`}
                                value={search} onChange={e=>{setSearch(e.target.value);resetPage();}} />
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.82rem',color:'#64748b'}}>
                            <FiInfo />
                            <span>{['financial','beds'].includes(activeTab) ? 'Summary view — use exports for full data' : `${tabData.length} records`}</span>
                        </div>
                        <div className="rep-exports">
                            <button onClick={handleExportCSV} className="btn-export-csv" title="Export CSV">
                                <FiDownload /><span>CSV</span>
                            </button>
                            <button onClick={handleExportXLSX} className="btn-export-xlsx" title="Export Excel">
                                <FiDownload /><span>Excel</span>
                            </button>
                            <button onClick={handleExportPDF} className="btn-export-pdf" title="Export PDF">
                                <FiFileText /><span>PDF</span>
                            </button>
                        </div>
                    </div>

                    {/* Table area */}
                    <div className="rep-table-wrap">
                        {renderTable()}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Reports;
