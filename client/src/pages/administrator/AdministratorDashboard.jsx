import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { administratorAPI } from '../../utils/api';
import socket from '../../utils/socket';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import {
    FiHome, FiUsers, FiCalendar, FiActivity, FiPackage,
    FiSettings, FiLogOut, FiPieChart, FiClipboard,
    FiFileText, FiPlusSquare, FiDatabase, FiGrid, FiShield,
    FiClock, FiTrendingUp, FiCheckCircle, FiAlertCircle,
    FiPrinter, FiDownload, FiSearch, FiRefreshCw, FiRepeat, FiCheck
} from 'react-icons/fi';
import './AdministratorDashboard.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ─────────────────────────────────────────────────────────────────────────────
// DEPARTMENT FINANCIAL REPORTING MODULE
// ─────────────────────────────────────────────────────────────────────────────
const DeptReportModule = ({ userRole, formatCurrency, administratorAPI, jsPDF }) => {
    const [deptList, setDeptList] = useState([]);
    const [selectedDept, setSelectedDept] = useState('');
    const [datePreset, setDatePreset] = useState('monthly');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Load department list on mount
    useEffect(() => {
        administratorAPI.getDepartmentReport('', '', '').then(res => {
            if (res.success) setDeptList(res.departments || []);
        }).catch(() => { });
    }, []);

    const getDateRange = (preset) => {
        const now = new Date();
        let start, end = new Date(now);
        end.setHours(23, 59, 59, 999);
        switch (preset) {
            case 'daily': start = new Date(now); start.setHours(0, 0, 0, 0); break;
            case 'weekly': start = new Date(now); start.setDate(now.getDate() - 6); start.setHours(0, 0, 0, 0); break;
            case 'monthly': start = new Date(now.getFullYear(), now.getMonth(), 1); break;
            case 'quarterly': start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1); break;
            case 'yearly': start = new Date(now.getFullYear(), 0, 1); break;
            default: start = new Date(now.getFullYear(), 0, 1);
        }
        return { start: start.toISOString(), end: end.toISOString() };
    };

    const fetchReport = async (dept = selectedDept, preset = datePreset) => {
        if (!dept) return;
        setLoading(true); setError('');
        try {
            let start, end;
            if (preset === 'custom') {
                start = customStart ? new Date(customStart).toISOString() : '';
                end = customEnd ? new Date(customEnd + 'T23:59:59').toISOString() : '';
            } else {
                ({ start, end } = getDateRange(preset));
            }
            const res = await administratorAPI.getDepartmentReport(dept, start, end);
            if (res.success) {
                setReport(res.report);
                if (res.departments && res.departments.length > 0) setDeptList(res.departments);
            } else { setError(res.message || 'Failed to load report'); }
        } catch (err) {
            setError(err.response?.data?.message || 'Error generating report');
        } finally { setLoading(false); }
    };

    const handleDeptChange = (dept) => { setSelectedDept(dept); fetchReport(dept, datePreset); };
    const handlePresetChange = (p) => { setDatePreset(p); if (p !== 'custom') fetchReport(selectedDept, p); };

    // Export PDF
    const exportPDF = () => {
        if (!report) return;
        const doc = new jsPDF();
        const hospitalName = JSON.parse(localStorage.getItem('user') || '{}').hospitalName || 'Hospital';
        const now = new Date();
        doc.setFontSize(18); doc.setTextColor(30, 64, 175);
        doc.text(`${report.department} Department Report`, 14, 20);
        doc.setFontSize(10); doc.setTextColor(100);
        doc.text(`Hospital: ${hospitalName}`, 14, 28);
        doc.text(`Generated: ${now.toLocaleString('en-IN')}`, 14, 34);
        doc.text(`Period: ${new Date(report.period?.startDate).toLocaleDateString('en-IN')} – ${new Date(report.period?.endDate).toLocaleDateString('en-IN')}`, 14, 40);

        doc.autoTable({
            startY: 48, head: [['Metric', 'Value']],
            body: [
                ['Department Head', report.summary?.deptHead || 'N/A'],
                ['Total Doctors', report.summary?.totalDoctors ?? 0],
                ['Total Staff', report.summary?.totalStaff ?? 0],
                ['Total Patients', report.summary?.totalPatients ?? 0],
                ['Total Appointments', report.summary?.totalAppointments ?? 0],
                ['Total Admissions', report.summary?.totalAdmissions ?? 0],
                ['Total Discharges', report.summary?.totalDischarges ?? 0],
            ],
            headStyles: { fillColor: [30, 64, 175] }, theme: 'striped'
        });

        doc.autoTable({
            startY: doc.lastAutoTable.finalY + 10,
            head: [['Revenue Category', 'Amount (₹)']],
            body: [
                ['Consultation Revenue', (report.revenue?.breakdown?.consultation || 0).toLocaleString('en-IN')],
                ['Procedure Revenue', (report.revenue?.breakdown?.procedure || 0).toLocaleString('en-IN')],
                ['Admission Revenue', (report.revenue?.breakdown?.admission || 0).toLocaleString('en-IN')],
                ['Bed/ICU Charges', (report.revenue?.breakdown?.bedCharges || 0).toLocaleString('en-IN')],
                ['Lab Revenue', (report.revenue?.breakdown?.labRevenue || 0).toLocaleString('en-IN')],
                ['Pharmacy Revenue', (report.revenue?.breakdown?.pharmacyRevenue || 0).toLocaleString('en-IN')],
                ['Service Revenue', (report.revenue?.breakdown?.serviceRevenue || 0).toLocaleString('en-IN')],
                ['Other Charges', (report.revenue?.breakdown?.otherCharges || 0).toLocaleString('en-IN')],
                ['TOTAL REVENUE', (report.revenue?.total || 0).toLocaleString('en-IN')],
            ],
            headStyles: { fillColor: [5, 150, 105] }, theme: 'striped'
        });

        doc.autoTable({
            startY: doc.lastAutoTable.finalY + 10,
            head: [['P&L', 'Amount (₹)']],
            body: [
                ['Total Revenue', (report.profitLoss?.revenue || 0).toLocaleString('en-IN')],
                ['Total Expenses', (report.profitLoss?.expenses || 0).toLocaleString('en-IN')],
                ['Net Profit/Loss', (report.profitLoss?.netProfit || 0).toLocaleString('en-IN')],
                ['Profit Margin', `${report.profitLoss?.profitMargin ?? 0}%`],
            ],
            headStyles: { fillColor: [124, 58, 237] }, theme: 'striped'
        });

        doc.save(`${report.department}_report_${now.toISOString().slice(0, 10)}.pdf`);
    };

    // Export Excel (CSV)
    const exportExcel = () => {
        if (!report) return;
        const rows = [
            ['Department Report', report.department],
            ['Period', `${new Date(report.period?.startDate).toLocaleDateString('en-IN')} - ${new Date(report.period?.endDate).toLocaleDateString('en-IN')}`],
            ['Generated', new Date().toLocaleString('en-IN')], [''],
            ['SUMMARY'], ['Dept Head', report.summary?.deptHead || 'N/A'],
            ['Total Doctors', report.summary?.totalDoctors], ['Total Staff', report.summary?.totalStaff],
            ['Total Patients', report.summary?.totalPatients], ['Total Appointments', report.summary?.totalAppointments],
            ['Total Admissions', report.summary?.totalAdmissions], ['Total Discharges', report.summary?.totalDischarges],
            [''], ['REVENUE BREAKDOWN'],
            ['Consultation Revenue', report.revenue?.breakdown?.consultation || 0],
            ['Procedure Revenue', report.revenue?.breakdown?.procedure || 0],
            ['Admission Revenue', report.revenue?.breakdown?.admission || 0],
            ['Bed/ICU Charges', report.revenue?.breakdown?.bedCharges || 0],
            ['Lab Revenue', report.revenue?.breakdown?.labRevenue || 0],
            ['Pharmacy Revenue', report.revenue?.breakdown?.pharmacyRevenue || 0],
            ['Other Charges', report.revenue?.breakdown?.otherCharges || 0],
            ['TOTAL REVENUE', report.revenue?.total || 0],
            [''], ['EXPENSES BREAKDOWN'],
            ['Medical Supplies', report.expenses?.breakdown?.medicalSupplies || 0],
            ['Equipment', report.expenses?.breakdown?.equipment || 0],
            ['Utilities', report.expenses?.breakdown?.utilities || 0],
            ['Staff Expenses', report.expenses?.breakdown?.staffExpenses || 0],
            ['Operational', report.expenses?.breakdown?.operational || 0],
            ['Other', report.expenses?.breakdown?.other || 0],
            ['TOTAL EXPENSES', report.expenses?.total || 0],
            [''], ['PROFIT & LOSS'],
            ['Net Profit/Loss', report.profitLoss?.netProfit || 0],
            ['Profit Margin %', report.profitLoss?.profitMargin || 0],
        ];
        const csv = rows.map(r => r.map(c => `"${c ?? ''}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `${report.department}_report_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click(); URL.revokeObjectURL(url);
    };

    const handlePrint = () => window.print();

    const fmtCur = formatCurrency;
    const r = report;

    const PRESET_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly', custom: 'Custom' };

    const chartMax = r ? Math.max(...(r.trend || []).map(t => Math.max(t.revenue, t.expenses, 1))) : 1;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header Controls */}
            <div className="admin-card" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#1e3a8a' }}>🏥 Department Financial Reporting</h2>
                        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748b' }}>Select a department and time period to generate financial and operational reports.</p>
                    </div>
                    {r && (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button onClick={exportPDF} style={{ padding: '8px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                📄 Export PDF
                            </button>
                            <button onClick={exportExcel} style={{ padding: '8px 14px', background: '#059669', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                📊 Export Excel
                            </button>
                            <button onClick={handlePrint} style={{ padding: '8px 14px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                🖨️ Print
                            </button>
                        </div>
                    )}
                </div>

                {/* Department Selector */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
                    <div style={{ flex: '1', minWidth: '200px' }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>DEPARTMENT</label>
                        <select
                            value={selectedDept}
                            onChange={e => handleDeptChange(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', color: '#1e293b', background: '#f8fafc', outline: 'none', cursor: 'pointer' }}
                        >
                            <option value="">— Select Department —</option>
                            {deptList.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: '2', minWidth: '300px' }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>DATE RANGE</label>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {Object.entries(PRESET_LABELS).map(([key, label]) => (
                                <button key={key} onClick={() => handlePresetChange(key)}
                                    style={{ padding: '8px 12px', borderRadius: '8px', border: '2px solid', borderColor: datePreset === key ? '#4f46e5' : '#e2e8f0', background: datePreset === key ? '#4f46e5' : '#fff', color: datePreset === key ? '#fff' : '#374151', fontWeight: 600, fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Custom date row */}
                {datePreset === 'custom' && (
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap' }}>
                        <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                            style={{ padding: '8px 12px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '13px' }} />
                        <span style={{ color: '#94a3b8' }}>to</span>
                        <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                            style={{ padding: '8px 12px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '13px' }} />
                        <button onClick={() => fetchReport(selectedDept, 'custom')} disabled={!selectedDept}
                            style={{ padding: '8px 16px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
                            Generate Report
                        </button>
                    </div>
                )}
            </div>

            {/* Errors */}
            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 16px', color: '#dc2626', fontSize: '14px' }}>⚠️ {error}</div>}

            {/* Loading */}
            {loading && (
                <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
                    <div style={{ fontSize: '40px', marginBottom: '12px' }}>⏳</div>
                    <div style={{ fontWeight: 600 }}>Generating Department Report...</div>
                </div>
            )}

            {/* No dept selected */}
            {!loading && !r && !error && (
                <div style={{ textAlign: 'center', padding: '80px 20px', color: '#94a3b8' }}>
                    <div style={{ fontSize: '64px', marginBottom: '16px' }}>🏥</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#64748b', marginBottom: '8px' }}>Select a Department</div>
                    <div style={{ fontSize: '14px' }}>Choose a department and date range above to generate the financial report.</div>
                </div>
            )}

            {/* REPORT CONTENT */}
            {!loading && r && (
                <>
                    {/* Period Banner */}
                    <div style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #4f46e5 100%)', borderRadius: '12px', padding: '20px 24px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                            <div style={{ fontSize: '22px', fontWeight: 800 }}>{r.department} Department</div>
                            <div style={{ fontSize: '13px', opacity: 0.85, marginTop: '4px' }}>
                                Period: {new Date(r.period?.startDate).toLocaleDateString('en-IN')} – {new Date(r.period?.endDate).toLocaleDateString('en-IN')}
                                {r.summary?.deptHead && ` · Head: ${r.summary.deptHead}`}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                            {[
                                { label: 'Doctors', val: r.summary?.totalDoctors ?? 0, icon: '👨‍⚕️' },
                                { label: 'Staff', val: r.summary?.totalStaff ?? 0, icon: '👥' },
                                { label: 'Patients', val: r.summary?.totalPatients ?? 0, icon: '🧑‍🤝‍🧑' },
                            ].map(item => (
                                <div key={item.label} style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '22px', fontWeight: 800 }}>{item.icon} {item.val}</div>
                                    <div style={{ fontSize: '11px', opacity: 0.75 }}>{item.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Summary KPIs */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                        {[
                            { label: 'Total Revenue', val: fmtCur(r.revenue?.total), color: '#059669', bg: '#f0fdf4', icon: '💰' },
                            { label: 'Total Expenses', val: fmtCur(r.expenses?.total), color: '#dc2626', bg: '#fef2f2', icon: '📉' },
                            { label: 'Net Profit/Loss', val: fmtCur(r.profitLoss?.netProfit), color: (r.profitLoss?.netProfit ?? 0) >= 0 ? '#059669' : '#dc2626', bg: (r.profitLoss?.netProfit ?? 0) >= 0 ? '#f0fdf4' : '#fef2f2', icon: '📈' },
                            { label: 'Profit Margin', val: `${r.profitLoss?.profitMargin ?? 0}%`, color: '#7c3aed', bg: '#f5f3ff', icon: '📊' },
                            { label: 'Appointments', val: r.summary?.totalAppointments ?? 0, color: '#0369a1', bg: '#f0f9ff', icon: '📅' },
                            { label: 'Admissions', val: r.summary?.totalAdmissions ?? 0, color: '#c2410c', bg: '#fff7ed', icon: '🛏️' },
                        ].map(kpi => (
                            <div key={kpi.label} style={{ background: kpi.bg, borderRadius: '12px', padding: '16px', border: `1px solid ${kpi.color}22` }}>
                                <div style={{ fontSize: '24px', marginBottom: '8px' }}>{kpi.icon}</div>
                                <div style={{ fontSize: '20px', fontWeight: 800, color: kpi.color }}>{kpi.val}</div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{kpi.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Revenue & Expenses breakdown + P&L */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                        {/* Revenue Breakdown */}
                        <div className="admin-card" style={{ padding: '20px' }}>
                            <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700, color: '#059669' }}>💰 Revenue Breakdown</h3>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ background: '#f0fdf4' }}>
                                        <th style={{ padding: '8px 10px', textAlign: 'left', color: '#374151', fontWeight: 600 }}>Category</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'right', color: '#374151', fontWeight: 600 }}>Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        ['Consultation Revenue', r.revenue?.breakdown?.consultation],
                                        ['Procedure Revenue', r.revenue?.breakdown?.procedure],
                                        ['Admission Revenue', r.revenue?.breakdown?.admission],
                                        ['Bed / ICU Charges', r.revenue?.breakdown?.bedCharges],
                                        ['Lab Revenue', r.revenue?.breakdown?.labRevenue],
                                        ['Pharmacy Revenue', r.revenue?.breakdown?.pharmacyRevenue],
                                        ['Service Revenue', r.revenue?.breakdown?.serviceRevenue],
                                        ['Other Charges', r.revenue?.breakdown?.otherCharges],
                                    ].map(([label, amt]) => (
                                        <tr key={label} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '8px 10px', color: '#374151' }}>{label}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#059669', fontWeight: 600 }}>{fmtCur(amt || 0)}</td>
                                        </tr>
                                    ))}
                                    <tr style={{ background: '#f0fdf4', borderTop: '2px solid #059669' }}>
                                        <td style={{ padding: '10px', fontWeight: 800, color: '#059669' }}>TOTAL REVENUE</td>
                                        <td style={{ padding: '10px', textAlign: 'right', fontWeight: 800, color: '#059669' }}>{fmtCur(r.revenue?.total)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Expense Breakdown */}
                        <div className="admin-card" style={{ padding: '20px' }}>
                            <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700, color: '#dc2626' }}>📉 Expense Breakdown</h3>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ background: '#fef2f2' }}>
                                        <th style={{ padding: '8px 10px', textAlign: 'left', color: '#374151', fontWeight: 600 }}>Category</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'right', color: '#374151', fontWeight: 600 }}>Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        ['Medical Supplies', r.expenses?.breakdown?.medicalSupplies],
                                        ['Equipment / Maintenance', r.expenses?.breakdown?.equipment],
                                        ['Utilities', r.expenses?.breakdown?.utilities],
                                        ['Staff Expenses', r.expenses?.breakdown?.staffExpenses],
                                        ['Operational Costs', r.expenses?.breakdown?.operational],
                                        ['Other', r.expenses?.breakdown?.other],
                                    ].map(([label, amt]) => (
                                        <tr key={label} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '8px 10px', color: '#374151' }}>{label}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>{fmtCur(amt || 0)}</td>
                                        </tr>
                                    ))}
                                    <tr style={{ background: '#fef2f2', borderTop: '2px solid #dc2626' }}>
                                        <td style={{ padding: '10px', fontWeight: 800, color: '#dc2626' }}>TOTAL EXPENSES</td>
                                        <td style={{ padding: '10px', textAlign: 'right', fontWeight: 800, color: '#dc2626' }}>{fmtCur(r.expenses?.total)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* P&L Card */}
                        <div className="admin-card" style={{ padding: '20px' }}>
                            <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700, color: '#7c3aed' }}>📊 Profit & Loss</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {[
                                    { label: 'Total Revenue', val: fmtCur(r.profitLoss?.revenue), color: '#059669', bg: '#f0fdf4' },
                                    { label: 'Total Expenses', val: fmtCur(r.profitLoss?.expenses), color: '#dc2626', bg: '#fef2f2' },
                                    { label: 'Net Profit / Loss', val: fmtCur(r.profitLoss?.netProfit), color: (r.profitLoss?.netProfit ?? 0) >= 0 ? '#059669' : '#dc2626', bg: (r.profitLoss?.netProfit ?? 0) >= 0 ? '#f0fdf4' : '#fef2f2' },
                                    { label: 'Profit Margin', val: `${r.profitLoss?.profitMargin ?? 0}%`, color: '#7c3aed', bg: '#f5f3ff' },
                                ].map(row => (
                                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: row.bg, borderRadius: '8px' }}>
                                        <span style={{ fontWeight: 600, color: '#374151', fontSize: '13px' }}>{row.label}</span>
                                        <span style={{ fontWeight: 800, color: row.color, fontSize: '15px' }}>{row.val}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Operational Metrics */}
                    <div className="admin-card" style={{ padding: '20px' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700, color: '#0369a1' }}>⚙️ Operational Metrics</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                            {[
                                { label: 'Patients Treated', val: r.operational?.totalPatients ?? 0, icon: '🧑‍🤝‍🧑', color: '#0369a1' },
                                { label: 'Total Appointments', val: r.operational?.totalAppointments ?? 0, icon: '📅', color: '#0369a1' },
                                { label: 'Admissions', val: r.operational?.totalAdmissions ?? 0, icon: '🛏️', color: '#c2410c' },
                                { label: 'Discharges', val: r.operational?.totalDischarges ?? 0, icon: '✅', color: '#059669' },
                                { label: 'Avg. Length of Stay', val: `${r.operational?.avgLOS ?? 0} days`, icon: '⏱️', color: '#7c3aed' },
                                { label: 'Bed Occupancy Rate', val: `${r.operational?.bedOccupancyRate ?? 0}%`, icon: '🏥', color: r.operational?.bedOccupancyRate > 80 ? '#dc2626' : '#059669' },
                            ].map(m => (
                                <div key={m.label} style={{ background: '#f8fafc', borderRadius: '10px', padding: '14px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: '24px' }}>{m.icon}</div>
                                    <div style={{ fontSize: '22px', fontWeight: 800, color: m.color, marginTop: '6px' }}>{m.val}</div>
                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{m.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 6-Month Trend Chart */}
                    {r.trend && r.trend.length > 0 && (
                        <div className="admin-card" style={{ padding: '20px' }}>
                            <h3 style={{ margin: '0 0 20px', fontSize: '1rem', fontWeight: 700, color: '#1e3a8a' }}>📈 6-Month Financial Trend</h3>
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '180px', padding: '0 8px' }}>
                                {r.trend.map((t, i) => (
                                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end' }}>
                                        <div style={{ width: '100%', display: 'flex', gap: '3px', alignItems: 'flex-end', justifyContent: 'center', flex: 1 }}>
                                            <div title={`Revenue: ${fmtCur(t.revenue)}`}
                                                style={{ width: '38%', height: `${Math.max(4, Math.round((t.revenue / chartMax) * 150))}px`, background: 'linear-gradient(to top, #059669, #34d399)', borderRadius: '4px 4px 0 0', transition: 'height 0.4s', minHeight: '4px' }} />
                                            <div title={`Expenses: ${fmtCur(t.expenses)}`}
                                                style={{ width: '38%', height: `${Math.max(4, Math.round((t.expenses / chartMax) * 150))}px`, background: 'linear-gradient(to top, #dc2626, #f87171)', borderRadius: '4px 4px 0 0', transition: 'height 0.4s', minHeight: '4px' }} />
                                        </div>
                                        <div style={{ fontSize: '10px', color: '#94a3b8', textAlign: 'center', marginTop: '4px' }}>{t.label}</div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '12px', fontSize: '12px' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '12px', height: '12px', background: '#059669', borderRadius: '2px', display: 'inline-block' }} /> Revenue</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '12px', height: '12px', background: '#dc2626', borderRadius: '2px', display: 'inline-block' }} /> Expenses</span>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};


const AdministratorDashboard = ({ tab = 'dashboard' }) => {
    const navigate = useNavigate();
    const location = useLocation();

    // UI states
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Core data states
    const [stats, setStats] = useState(null);
    const [patientFlow, setPatientFlow] = useState(null);
    const [staffList, setStaffList] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [admissionsData, setAdmissionsData] = useState(null);
    const [beds, setBeds] = useState([]);
    const [bedsStats, setBedsStats] = useState(null);
    const [bedHistory, setBedHistory] = useState([]);
    const [appointments, setAppointments] = useState([]);
    const [billingData, setBillingData] = useState(null);
    const [revenueData, setRevenueData] = useState(null);
    const [resources, setResources] = useState([]);
    const [maintenanceAlerts, setMaintenanceAlerts] = useState([]);
    const [inventoryData, setInventoryData] = useState(null);
    const [auditLogs, setAuditLogs] = useState([]);
    const [analyticsData, setAnalyticsData] = useState(null);

    // Real-Time feed log
    const [liveFeed, setLiveFeed] = useState([
        { id: 'initial-1', type: 'info', text: 'Operational Command Center live and connected.', time: new Date() }
    ]);
    const [isSocketConnected, setIsSocketConnected] = useState(false);

    // Search and filter states
    const [staffSearch, setStaffSearch] = useState('');
    const [staffRoleFilter, setStaffRoleFilter] = useState('');
    const [bedWardFilter, setBedWardFilter] = useState('All');
    const [selectedBedForTransfer, setSelectedBedForTransfer] = useState(null);
    const [apptSearch, setApptSearch] = useState('');
    const [auditSearch, setAuditSearch] = useState('');
    const [billingSearch, setBillingSearch] = useState('');

    // Modal / Forms
    const [transferModal, setTransferModal] = useState(null); // stores { patientName, bedNumber, admissionId, currentWard }
    const [targetWard, setTargetWard] = useState('General Ward');
    const [targetBed, setTargetBed] = useState('');
    const [savingTransfer, setSavingTransfer] = useState(false);

    // Reports generator form state
    const [reportCategory, setReportCategory] = useState('patients');
    const [exportFormat, setExportFormat] = useState('pdf');
    const [generatingReport, setGeneratingReport] = useState(false);

    // Pay Salary States
    const [paySalaryModal, setPaySalaryModal] = useState(null); // { staff }
    const [salaryAmount, setSalaryAmount] = useState('40000');
    const [salaryDescription, setSalaryDescription] = useState('');
    const [submittingSalary, setSubmittingSalary] = useState(false);
    const [salaryError, setSalaryError] = useState('');
    const [salarySuccess, setSalarySuccess] = useState('');
    const [salaryHistory, setSalaryHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const [salaryHistoryModal, setSalaryHistoryModal] = useState(null); // { staff }

    // Load user data from localStorage
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const userRole = (currentUser?.role || '').toLowerCase();
    const hospitalId = currentUser.hospitalId;

    // Fetch tab specific data
    const fetchTabData = async () => {
        setLoading(true);
        setError('');
        try {
            if (tab === 'dashboard') {
                const res = await administratorAPI.getStats();
                if (res.success) {
                    setStats(res.data);
                }
            } else if (tab === 'patient-flow') {
                const res = await administratorAPI.getPatientFlow();
                if (res.success) setPatientFlow(res.counts);
            } else if (tab === 'staff') {
                const res = await administratorAPI.getStaff();
                if (res.success) setStaffList(res.staff || []);
            } else if (tab === 'departments') {
                const res = await administratorAPI.getDepartments();
                if (res.success) setDepartments(res.departments || []);
            } else if (tab === 'admissions') {
                const res = await administratorAPI.getAdmissions();
                if (res.success) setAdmissionsData(res);
            } else if (tab === 'beds') {
                const res = await administratorAPI.getBeds();
                if (res.success) {
                    setBeds(res.beds || []);
                    setBedsStats(res.stats);
                    setBedHistory(res.bedHistory || []);
                }
            } else if (tab === 'appointments') {
                // We'll reuse the stats / appointments endpoints or get via reports helper
                const res = await administratorAPI.getReports();
                if (res.success) setAppointments(res.data.appointmentReports || []);
            } else if (tab === 'billing') {
                const res = await administratorAPI.getBilling();
                if (res.success) setBillingData(res);
            } else if (tab === 'revenue') {
                const res = await administratorAPI.getRevenue();
                if (res.success) setRevenueData(res.data);
            } else if (tab === 'resources') {
                const res = await administratorAPI.getResources();
                if (res.success) {
                    setResources(res.resources || []);
                    setMaintenanceAlerts(res.maintenanceAlerts || []);
                }
            } else if (tab === 'inventory') {
                const res = await administratorAPI.getInventory();
                if (res.success) setInventoryData(res);
            } else if (tab === 'analytics') {
                const res = await administratorAPI.getAnalytics();
                if (res.success) setAnalyticsData(res);
            } else if (tab === 'audit-logs') {
                const res = await administratorAPI.getAuditLogs();
                if (res.success) setAuditLogs(res.logs || []);
            } else if (tab === 'operations') {
                const res = await administratorAPI.getStats();
                if (res.success) setStats(res.data);
            }
        } catch (err) {
            console.error(`Failed to load data for tab ${tab}:`, err);
            setError(err.response?.data?.message || 'Error loading dashboard data. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Load active tab data
    useEffect(() => {
        if (userRole === 'accountant' && (tab === 'beds' || tab === 'operations')) {
            navigate('/administrator/dashboard', { replace: true });
            return;
        }
        fetchTabData();
    }, [tab]);

    // Setup Socket.io Real-Time connection
    useEffect(() => {
        if (!socket.connected) {
            socket.connect();
        }
        setIsSocketConnected(socket.connected);

        const handleConnect = () => {
            setIsSocketConnected(true);
            setLiveFeed(prev => [{ id: `socket-${Date.now()}`, type: 'success', text: 'Real-time pipeline connected.', time: new Date() }, ...prev]);
        };

        const handleDisconnect = () => {
            setIsSocketConnected(false);
            setLiveFeed(prev => [{ id: `socket-${Date.now()}`, type: 'warning', text: 'Real-time pipeline disconnected.', time: new Date() }, ...prev]);
        };

        // General operational events
        const handleAdmissionCreated = (data) => {
            setLiveFeed(prev => [{ id: `evt-${Date.now()}`, type: 'info', text: `Patient admission requested: ${data.patientName || 'Anonymous'}.`, time: new Date() }, ...prev]);
            // Increment local state counters if in dashboard
            if (tab === 'dashboard' || tab === 'operations') {
                fetchTabData(); // reload stats dynamically
            }
        };

        const handleBedAssigned = (data) => {
            setLiveFeed(prev => [{ id: `evt-${Date.now()}`, type: 'success', text: `Bed ${data.bedNumber} assigned to ${data.patientName || 'Patient'}.`, time: new Date() }, ...prev]);
            if (tab === 'beds' || tab === 'dashboard') fetchTabData();
        };

        const handleBillingCompleted = (data) => {
            setLiveFeed(prev => [{ id: `evt-${Date.now()}`, type: 'success', text: `Invoice paid: ${data.invoiceNumber || 'INV-xxx'} (Amount: ₹${data.amountPaid || 0}).`, time: new Date() }, ...prev]);
            if (tab === 'revenue' || tab === 'dashboard' || tab === 'billing') fetchTabData();
        };

        const handleAppointmentCreated = (data) => {
            setLiveFeed(prev => [{ id: `evt-${Date.now()}`, type: 'info', text: `New OPD appointment scheduled with Dr. ${data.doctorName || 'Doctor'}.`, time: new Date() }, ...prev]);
            if (tab === 'dashboard' || tab === 'appointments') fetchTabData();
        };

        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('admission_created', handleAdmissionCreated);
        socket.on('bed_assigned', handleBedAssigned);
        socket.on('billing_completed', handleBillingCompleted);
        socket.on('appointment_created', handleAppointmentCreated);

        return () => {
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
            socket.off('admission_created', handleAdmissionCreated);
            socket.off('bed_assigned', handleBedAssigned);
            socket.off('billing_completed', handleBillingCompleted);
            socket.off('appointment_created', handleAppointmentCreated);
        };
    }, [tab]);

    const formatCurrency = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;

    // Bed Transfer trigger
    const handleOpenTransfer = (bed) => {
        if (bed.status !== 'Occupied') return;
        setTransferModal({
            patientName: bed.patientName,
            bedNumber: bed.bedNumber,
            admissionId: bed.admissionId,
            currentWard: bed.ward
        });
        setTargetWard(bed.ward);
        setTargetBed('');
    };

    const handleSaveTransfer = async (e) => {
        e.preventDefault();
        if (!targetBed) return;
        setSavingTransfer(true);
        setError(''); setSuccess('');
        try {
            const res = await administratorAPI.transferBed({
                admissionId: transferModal.admissionId,
                targetBedNumber: targetBed,
                targetWard: targetWard
            });
            if (res.success) {
                setSuccess(res.message || 'Bed transfer executed successfully!');
                setTransferModal(null);
                fetchTabData(); // refresh bed lists
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Bed transfer failed.');
        } finally {
            setSavingTransfer(false);
        }
    };

    // Reports Exporter Handler
    const handleGenerateReport = async (e) => {
        e.preventDefault();
        setGeneratingReport(true);
        setError(''); setSuccess('');
        try {
            const res = await administratorAPI.getReports();
            if (!res.success) throw new Error('Could not retrieve reports data.');

            const dataMap = {
                patients: res.data.patientReports || [],
                appointments: res.data.appointmentReports || [],
                admissions: res.data.admissionReports || [],
                revenue: res.data.revenueReports || []
            };

            const selectedData = dataMap[reportCategory];
            if (!selectedData || selectedData.length === 0) {
                setError('No records found to export for the chosen category.');
                setGeneratingReport(false);
                return;
            }

            if (exportFormat === 'csv') {
                exportToCSV(selectedData, reportCategory);
            } else if (exportFormat === 'excel') {
                exportToExcel(selectedData, reportCategory);
            } else {
                exportToPDF(selectedData, reportCategory);
            }
            setSuccess(`Report exported successfully in ${exportFormat.toUpperCase()} format.`);
        } catch (err) {
            setError(err.message || 'Failed to export report.');
        } finally {
            setGeneratingReport(false);
        }
    };

    const fetchSalaryHistory = async (staff) => {
        setLoadingHistory(true);
        setHistoryError('');
        setSalaryHistory([]);
        try {
            const res = await administratorAPI.getExpenses();
            if (res.success && res.expenses) {
                const staffId = staff._id || staff.id;
                const staffName = staff.name || '';
                const filtered = res.expenses.filter(e => {
                    if (e.category !== 'Salaries') return false;
                    const matchId = e.recipientId && staffId && String(e.recipientId) === String(staffId);
                    const matchName = e.recipientName && staffName && e.recipientName.toLowerCase().trim() === staffName.toLowerCase().trim();
                    const matchDesc = e.description && staffName && e.description.toLowerCase().includes(staffName.toLowerCase());
                    return matchId || matchName || matchDesc;
                });
                setSalaryHistory(filtered);
            } else {
                setHistoryError('Failed to load salary history.');
            }
        } catch (err) {
            setHistoryError('Error loading salary history.');
        } finally {
            setLoadingHistory(false);
        }
    };

    // Pay Salary Handlers
    const handleOpenPaySalaryModal = (staff) => {
        setPaySalaryModal(staff);
        setSalaryAmount('40000');
        setSalaryDescription(`Salary payment for ${staff.name} (${staff.role || 'Staff'})`);
        setSalaryError('');
        setSalarySuccess('');
    };

    const handleOpenSalaryHistoryModal = (staff) => {
        setSalaryHistoryModal(staff);
        fetchSalaryHistory(staff);
    };

    const handleSubmitPaySalary = async (e) => {
        e.preventDefault();
        if (!salaryAmount || Number(salaryAmount) <= 0) {
            setSalaryError('Please enter a valid amount');
            return;
        }
        setSubmittingSalary(true);
        setSalaryError('');
        setSalarySuccess('');
        try {
            const staffId = paySalaryModal._id || paySalaryModal.id;
            const staffName = paySalaryModal.name || '';
            const res = await administratorAPI.createExpense({
                category: 'Salaries',
                amount: Number(salaryAmount),
                date: new Date().toISOString().split('T')[0],
                description: salaryDescription,
                paymentMethod: 'Bank Transfer',
                paymentStatus: 'Paid',
                recipientId: staffId,
                recipientName: staffName
            });
            if (res.success) {
                setSalarySuccess('Salary paid and logged as an expense successfully!');
                setTimeout(() => {
                    setPaySalaryModal(null);
                }, 1500);
            } else {
                setSalaryError(res.message || 'Failed to log salary payment.');
            }
        } catch (err) {
            setSalaryError(err.response?.data?.message || 'Error executing salary payment.');
        } finally {
            setSubmittingSalary(false);
        }
    };

    const exportToCSV = (data, category) => {
        const headers = Object.keys(data[0]);
        const csvRows = [headers.join(',')];
        for (const row of data) {
            const values = headers.map(header => {
                const escaped = ('' + (row[header] ?? '')).replace(/"/g, '\\"');
                return `"${escaped}"`;
            });
            csvRows.push(values.join(','));
        }
        const csvString = csvRows.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `hms_report_${category}_${new Date().toISOString().slice(0, 10)}.csv`);
        link.click();
    };

    const exportToExcel = (data, category) => {
        // Simple XML/CSV fallback for spreadsheet download
        exportToCSV(data, category);
    };

    const exportToPDF = (data, category) => {
        const doc = new jsPDF();
        doc.setFontSize(16);
        doc.setTextColor(10, 38, 71); // Deep navy blue
        doc.text(`HMS ${category.toUpperCase()} REPORT`, 14, 15);
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 20);
        doc.text(`Hospital Context: Admit Hospital`, 14, 25);

        const headers = Object.keys(data[0]).map(h => h.toUpperCase());
        const rows = data.map(item => Object.values(item).map(val => String(val ?? '—')));

        doc.autoTable({
            head: [headers],
            body: rows,
            startY: 32,
            theme: 'grid',
            headStyles: { fillColor: [20, 184, 166], textColor: [255, 255, 255] }, // Teal accent
            styles: { fontSize: 8 }
        });
        doc.save(`hms_report_${category}_${new Date().toISOString().slice(0, 10)}.pdf`);
    };

    return (
        <div className="administrator-dashboard-wrapper">
            {error && <div className="alert-box error">⚠️ {error}</div>}
            {success && <div className="alert-box success">✅ {success}</div>}

            {loading ? (
                <div style={{ padding: '48px 24px', textAlign: 'center', color: '#94a3b8', fontSize: '14px', fontWeight: 500 }}>
                    Loading...
                </div>
            ) : (
                <div className="tab-pane-content">
                    {/* ==================== 1. DASHBOARD HOME ==================== */}
                    {tab === 'dashboard' && stats && (
                        <div className="dashboard-grid">
                            <div className="kpis-container">
                                <div className="kpi-card-mini cyan">
                                    <div className="kpi-icon-wrap"><FiUsers /></div>
                                    <div className="kpi-vals">
                                        <h3>{stats.patientsToday || 0}</h3>
                                        <span>Patients Today</span>
                                    </div>
                                </div>
                                <div className="kpi-card-mini purple">
                                    <div className="kpi-icon-wrap"><FiCalendar /></div>
                                    <div className="kpi-vals">
                                        <h3>{stats.currentOPD || 0} / {stats.currentIPD || 0}</h3>
                                        <span>OPD vs IPD Cases</span>
                                    </div>
                                </div>
                                <div className="kpi-card-mini green">
                                    <div className="kpi-icon-wrap"><FiDatabase /></div>
                                    <div className="kpi-vals">
                                        <h3>{stats.availableBeds || 0}</h3>
                                        <span>Available Beds</span>
                                    </div>
                                </div>
                                <div className="kpi-card-mini orange">
                                    <div className="kpi-icon-wrap"><FiTrendingUp /></div>
                                    <div className="kpi-vals">
                                        <h3>{formatCurrency(stats.revenueMonth)}</h3>
                                        <span>Monthly Collections</span>
                                    </div>
                                </div>
                            </div>

                            <div className="main-charts-row">
                                <div className="chart-card flex-1">
                                    <h3>🏢 Department Performance</h3>
                                    <div className="dept-bars">
                                        {stats.departmentPerformance?.map(d => {
                                            const maxRevenue = Math.max(...stats.departmentPerformance.map(x => x.revenue || 1));
                                            const percent = Math.min(100, Math.round(((d.revenue || 0) / maxRevenue) * 100));
                                            return (
                                                <div key={d.name} className="dept-bar-row">
                                                    <span className="dept-label">{d.name}</span>
                                                    <div className="progress-outer">
                                                        <div className="progress-inner" style={{ width: `${percent || 8}%` }} />
                                                    </div>
                                                    <span className="dept-value">{formatCurrency(d.revenue)}</span>
                                                </div>
                                            );
                                        })}
                                        {(!stats.departmentPerformance || stats.departmentPerformance.length === 0) && (
                                            <p className="no-data-msg">No department performance data available.</p>
                                        )}
                                    </div>
                                </div>

                                <div className="alerts-card">
                                    <h3>⚠️ Operational Flags</h3>
                                    <div className="alerts-list">
                                        {stats.alerts?.map((al, idx) => (
                                            <div key={idx} className={`alert-item ${al.type}`}>
                                                <FiAlertCircle />
                                                <span>{al.text}</span>
                                            </div>
                                        ))}
                                        {(!stats.alerts || stats.alerts.length === 0) && (
                                            <div className="alert-item success">
                                                <FiCheckCircle />
                                                <span>All operations running smoothly. No flags.</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="live-ticker-card">
                                <div className="ticker-header">
                                    <h3>⚡ Operational Command Feed</h3>
                                    <span className={`connection-badge ${isSocketConnected ? 'online' : 'offline'}`}>
                                        {isSocketConnected ? '● REAL-TIME PIPELINE LIVE' : '● PIPELINE DISCONNECTED'}
                                    </span>
                                </div>
                                <div className="ticker-timeline">
                                    {liveFeed.map(evt => (
                                        <div key={evt.id} className={`ticker-event ${evt.type || 'info'}`}>
                                            <FiClock className="evt-icon" />
                                            <span className="evt-text">{evt.text}</span>
                                            <span className="evt-time">{new Date(evt.time).toLocaleTimeString()}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ==================== 2. OPERATIONS CENTER ==================== */}
                    {tab === 'operations' && stats && (
                        <div className="operations-center-dashboard">
                            <div className="ops-metrics-grid">
                                <div className="ops-metric-box">
                                    <h4>Bed Occupancy Rate</h4>
                                    <div className="circular-progress-wrap">
                                        <div className="metric-score">
                                            {Math.round(((stats.occupiedBeds || 0) / (stats.totalBeds || 50)) * 100)}%
                                        </div>
                                        <span>{stats.occupiedBeds || 0} occupied / {stats.totalBeds || 50} total</span>
                                    </div>
                                </div>
                                <div className="ops-metric-box">
                                    <h4>Pending Queues</h4>
                                    <div className="metric-vals-list">
                                        <div><span>OPD Consultation load</span><strong>{stats.pendingConsultations || 0} patients</strong></div>
                                        <div><span>Lab testing queue</span><strong>{stats.pendingLabTests || 0} testings</strong></div>
                                        <div><span>Pharmacy dispensing load</span><strong>{stats.pendingPharmacy || 0} orders</strong></div>
                                    </div>
                                </div>
                                <div className="ops-metric-box">
                                    <h4>Financial Oversights</h4>
                                    <div className="metric-vals-list">
                                        <div><span>Today's collected revenue</span><strong>{formatCurrency(stats.revenueToday)}</strong></div>
                                        <div><span>Pending billing collections</span><strong>{stats.pendingBilling || 0} invoices</strong></div>
                                    </div>
                                </div>
                            </div>

                            <div className="live-timeline-logs admin-card">
                                <h3>📜 Live Pipeline Logs</h3>
                                <div className="logs-scroller">
                                    {liveFeed.map(log => (
                                        <div key={log.id} className="log-line">
                                            <span className="log-time">[{new Date(log.time).toLocaleTimeString()}]</span>
                                            <span className={`log-tag ${log.type}`}>SYSTEM</span>
                                            <span className="log-msg">{log.text}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ==================== 3. PATIENT FLOW ==================== */}
                    {tab === 'patient-flow' && patientFlow && (
                        <div className="patient-flow-view admin-card">
                            <h2>Funnel Stage Path Analysis</h2>
                            <p style={{ color: '#888', marginBottom: '24px' }}>Real-time analysis of the active patient queues at each stage of the hospital care flow.</p>

                            <div className="funnel-stepper">
                                {[
                                    { key: 'registration', label: '1. Registration', val: patientFlow.registration, color: '#0ea5e9' },
                                    { key: 'waiting', label: '2. Waiting OPD Queue', val: patientFlow.waiting, color: '#f59e0b' },
                                    { key: 'consultation', label: '3. Consultation Room', val: patientFlow.consultation, color: '#a855f7' },
                                    { key: 'lab', label: '4. Lab Diagnostics', val: patientFlow.lab, color: '#ec4899' },
                                    { key: 'pharmacy', label: '5. Pharmacy Dispenser', val: patientFlow.pharmacy, color: '#14b8a6' },
                                    { key: 'billing', label: '6. Billing Clearance', val: patientFlow.billing, color: '#3b82f6' },
                                    { key: 'admission', label: '7. Admitted IPD', val: patientFlow.admission, color: '#ef4444' },
                                    { key: 'discharge', label: '8. Discharged', val: patientFlow.discharge, color: '#10b981' },
                                ].map((stage, idx) => (
                                    <div key={stage.key} className="funnel-stage-card" style={{ borderColor: stage.color }}>
                                        <div className="stage-header" style={{ background: stage.color }}>{stage.label}</div>
                                        <div className="stage-body">
                                            <h4>{stage.val || 0}</h4>
                                            <span>Active Patients</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ==================== 4. STAFF MANAGEMENT ==================== */}
                    {tab === 'staff' && (
                        <div className="staff-management-view">
                            <div className="filters-bar admin-card">
                                <h3> Roster Filters</h3>
                                <div className="filter-inputs">
                                    <input
                                        type="text"
                                        placeholder="Search by staff name or email..."
                                        value={staffSearch}
                                        onChange={e => setStaffSearch(e.target.value)}
                                        className="search-input"
                                    />
                                    <select
                                        value={staffRoleFilter}
                                        onChange={e => setStaffRoleFilter(e.target.value)}
                                        className="select-input"
                                    >
                                        <option value="">All Roles</option>
                                        <option value="Doctor">Doctors</option>
                                        <option value="Nurse">Nurses</option>
                                        <option value="Pharmacist">Pharmacists</option>
                                        <option value="Lab Technician">Lab Techs</option>
                                        <option value="Receptionist">Receptionists</option>
                                    </select>
                                </div>
                            </div>

                            <div className="admin-card">
                                <h3>👥 Roster and Active Workloads</h3>
                                <div className="users-table">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Staff Member</th>
                                                <th>Role</th>
                                                <th>Department</th>
                                                <th>Phone</th>
                                                <th>Roster Status</th>
                                                {userRole === 'accountant' && <th>Actions</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {staffList
                                                .filter(s => !staffSearch || s.name.toLowerCase().includes(staffSearch.toLowerCase()) || s.email.toLowerCase().includes(staffSearch.toLowerCase()))
                                                .filter(s => !staffRoleFilter || String(s.role).toLowerCase().includes(staffRoleFilter.toLowerCase()))
                                                .map(s => (
                                                    <tr key={s.id}>
                                                        <td><strong>{s.name}</strong></td>
                                                        <td><span className="role-badge">{s.role}</span></td>
                                                        <td>
                                                            {s.departments && s.departments.length > 0
                                                                ? s.departments.map(d => (
                                                                    <span key={d} className="dept-tag">{d}</span>
                                                                ))
                                                                : <span className="dept-tag">General</span>
                                                            }
                                                        </td>
                                                        <td>{s.phone || '—'}</td>
                                                        <td>
                                                            <span className={`status-badge ${s.isActive ? 'status-active' : 'status-inactive'}`}>
                                                                {s.isActive ? 'On Duty' : 'Inactive'}
                                                            </span>
                                                        </td>
                                                        {userRole === 'accountant' && (
                                                            <td>
                                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                                    <button
                                                                        onClick={() => handleOpenPaySalaryModal(s)}
                                                                        className="btn-pay-salary"
                                                                        style={{
                                                                            backgroundColor: '#10b981',
                                                                            color: 'white',
                                                                            border: 'none',
                                                                            padding: '6px 12px',
                                                                            borderRadius: '6px',
                                                                            cursor: 'pointer',
                                                                            fontWeight: '600',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '4px',
                                                                            fontSize: '12px'
                                                                        }}
                                                                    >
                                                                        💵 Pay Salary
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleOpenSalaryHistoryModal(s)}
                                                                        className="btn-pay-salary"
                                                                        style={{
                                                                            backgroundColor: '#4f46e5',
                                                                            color: 'white',
                                                                            border: 'none',
                                                                            padding: '6px 12px',
                                                                            borderRadius: '6px',
                                                                            cursor: 'pointer',
                                                                            fontWeight: '600',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '4px',
                                                                            fontSize: '12px'
                                                                        }}
                                                                    >
                                                                        📜 History
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        )}
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* PAY SALARY MODAL */}
                            {paySalaryModal && (
                                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '20px' }}>
                                    <div className="modal-content" style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', width: '100%', maxWidth: '500px', padding: '24px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', marginBottom: '16px' }}>
                                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '700', color: '#0f172a' }}>💵 Pay Salary</h3>
                                            <button type="button" onClick={() => setPaySalaryModal(null)} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#64748b', cursor: 'pointer' }}>&times;</button>
                                        </div>
                                        {salaryError && <div className="error-message" style={{ marginBottom: '14px', color: '#b91c1c', background: '#fee2e2', padding: '8px 12px', borderRadius: '6px', fontSize: '13px' }}>{salaryError}</div>}
                                        {salarySuccess && <div className="success-message" style={{ marginBottom: '14px', color: '#15803d', background: '#dcfce7', padding: '8px 12px', borderRadius: '6px', fontSize: '13px' }}>{salarySuccess}</div>}
                                        <form onSubmit={handleSubmitPaySalary} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            <div>
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '6px' }}>Recipient Name</label>
                                                <input type="text" readOnly value={paySalaryModal.name || ''} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#64748b', fontSize: '14px' }} />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '6px' }}>Amount (₹) *</label>
                                                <input type="number" required value={salaryAmount} onChange={e => setSalaryAmount(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '6px' }}>Description *</label>
                                                <textarea required rows="2" value={salaryDescription} onChange={e => setSalaryDescription(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                                                <button type="button" onClick={() => setPaySalaryModal(null)} className="btn-cancel" style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Cancel</button>
                                                <button type="submit" className="submit-button" disabled={submittingSalary} style={{ backgroundColor: '#10b981', borderColor: '#10b981', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
                                                    {submittingSalary ? 'Processing...' : 'Pay Salary'}
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            )}

                            {/* SALARY HISTORY MODAL */}
                            {salaryHistoryModal && (
                                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '20px' }}>
                                    <div className="modal-content" style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', width: '100%', maxWidth: '600px', padding: '24px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', marginBottom: '16px' }}>
                                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '700', color: '#0f172a' }}>
                                                📋 Salary Payment History - {salaryHistoryModal.name || ''}
                                            </h3>
                                            <button type="button" onClick={() => setSalaryHistoryModal(null)} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#64748b', cursor: 'pointer' }}>&times;</button>
                                        </div>

                                        {loadingHistory ? (
                                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px 0' }}>
                                                <div className="spinner" style={{ border: '2px solid #f3f3f3', borderTop: '2px solid #10b981', borderRadius: '50%', width: '24px', height: '24px', animation: 'spin 1s linear infinite' }}></div>
                                                <span style={{ marginLeft: '10px', fontSize: '14px', color: '#64748b' }}>Loading history...</span>
                                            </div>
                                        ) : historyError ? (
                                            <div style={{ fontSize: '13px', color: '#b91c1c', background: '#fee2e2', padding: '8px 12px', borderRadius: '6px' }}>
                                                {historyError}
                                            </div>
                                        ) : salaryHistory.length === 0 ? (
                                            <div style={{ textAlign: 'center', padding: '24px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                                                <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>No previous salary records found.</p>
                                            </div>
                                        ) : (
                                            <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                                    <thead>
                                                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                            <th style={{ padding: '10px 14px', fontWeight: '600', color: '#475569' }}>Date</th>
                                                            <th style={{ padding: '10px 14px', fontWeight: '600', color: '#475569' }}>Amount</th>
                                                            <th style={{ padding: '10px 14px', fontWeight: '600', color: '#475569' }}>Payment Method</th>
                                                            <th style={{ padding: '10px 14px', fontWeight: '600', color: '#475569' }}>Status</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {salaryHistory.map((history) => (
                                                            <tr key={history._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                <td style={{ padding: '10px 14px', color: '#334155' }}>
                                                                    {new Date(history.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                                </td>
                                                                <td style={{ padding: '10px 14px', fontWeight: '600', color: '#0f172a' }}>
                                                                    ₹{history.amount.toLocaleString('en-IN')}
                                                                </td>
                                                                <td style={{ padding: '10px 14px', color: '#64748b' }}>
                                                                    {history.paymentMethod || 'Bank Transfer'}
                                                                </td>
                                                                <td style={{ padding: '10px 14px' }}>
                                                                    <span style={{
                                                                        display: 'inline-block',
                                                                        padding: '2px 8px',
                                                                        borderRadius: '4px',
                                                                        fontSize: '11px',
                                                                        fontWeight: '600',
                                                                        backgroundColor: history.paymentStatus === 'Paid' ? '#dcfce7' : '#fef9c3',
                                                                        color: history.paymentStatus === 'Paid' ? '#15803d' : '#854d0e'
                                                                    }}>
                                                                        {history.paymentStatus || 'Paid'}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                                            <button type="button" onClick={() => setSalaryHistoryModal(null)} className="btn-cancel" style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Close</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ==================== 5. DEPARTMENTS — FINANCIAL REPORTING ==================== */}
                    {tab === 'departments' && (
                        <DeptReportModule
                            userRole={userRole}
                            formatCurrency={formatCurrency}
                            administratorAPI={administratorAPI}
                            jsPDF={jsPDF}
                            departments={departments}
                            setDepartments={setDepartments}
                        />
                    )}

                    {/* ==================== 6. ADMISSIONS ==================== */}
                    {tab === 'admissions' && admissionsData && (
                        <div className="admissions-view">
                            <div className="admissions-grid-blocks">
                                <div className="admin-card">
                                    <h3>🚨 Critical Priority Patients ({admissionsData.criticalPatients?.length || 0})</h3>
                                    <div className="users-table">
                                        <table>
                                            <thead>
                                                <tr><th>Patient</th><th>Admission Date</th><th>Ward Allocation</th><th>Bed</th></tr>
                                            </thead>
                                            <tbody>
                                                {admissionsData.criticalPatients?.map(p => (
                                                    <tr key={p._id}>
                                                        <td><strong className="critical-text">{p.patientName}</strong></td>
                                                        <td>{new Date(p.admissionDate).toLocaleDateString('en-IN')}</td>
                                                        <td>{p.ward}</td>
                                                        <td style={{ fontWeight: 700 }}>{p.bedNumber}</td>
                                                    </tr>
                                                ))}
                                                {(!admissionsData.criticalPatients || admissionsData.criticalPatients.length === 0) && (
                                                    <tr><td colSpan="4" className="empty-table-msg">No critical patients admitted.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="admin-card">
                                    <h3>⏳ Pending Ward/Bed Allocations ({admissionsData.pendingAllocations?.length || 0})</h3>
                                    <div className="users-table">
                                        <table>
                                            <thead>
                                                <tr><th>Patient</th><th>Requested Date</th><th>Doctor Recommended</th><th>Priority</th></tr>
                                            </thead>
                                            <tbody>
                                                {admissionsData.pendingAllocations?.map(p => (
                                                    <tr key={p._id}>
                                                        <td><strong>{p.patientName}</strong></td>
                                                        <td>{new Date(p.createdAt).toLocaleDateString('en-IN')}</td>
                                                        <td>{p.doctorName || 'Recommended Doctor'}</td>
                                                        <td>
                                                            <span className={`status-badge ${p.priority === 'Critical' ? 'status-inactive' : 'status-pending'}`}>
                                                                {p.priority}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {(!admissionsData.pendingAllocations || admissionsData.pendingAllocations.length === 0) && (
                                                    <tr><td colSpan="4" className="empty-table-msg">No pending bed allocations.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ==================== 7. BED MANAGEMENT ==================== */}
                    {tab === 'beds' && bedsStats && (
                        <div className="beds-management-view">
                            <div className="beds-stats-row admin-card">
                                <div className="bed-stat-mini"><span>Total Capacity</span><strong>{bedsStats.total}</strong></div>
                                <div className="bed-stat-mini available"><span>Available</span><strong>{bedsStats.available}</strong></div>
                                <div className="bed-stat-mini occupied"><span>Occupied</span><strong>{bedsStats.occupied}</strong></div>
                                <div className="bed-stat-mini icu"><span>ICU Occupancy</span><strong>{bedsStats.icuOccupied} / 10</strong></div>
                                <div className="bed-stat-mini" style={{ borderLeft: '3px solid #8b5cf6', background: '#f5f3ff' }}><span style={{ color: '#7c3aed' }}>Private Rooms</span><strong style={{ color: '#7c3aed' }}>{beds.filter(b => b.ward === 'Private Room').length}</strong></div>
                            </div>

                            <div className="beds-grid-row">
                                <div className="beds-grid-card admin-card">
                                    <div className="card-header-flex">
                                        <h3>🛏️ Hospital Ward Layout</h3>
                                        <div className="filter-inputs">
                                            <select value={bedWardFilter} onChange={e => setBedWardFilter(e.target.value)} className="select-input">
                                                <option value="All">All Wards</option>
                                                <option value="General Ward">General Ward</option>
                                                <option value="ICU">ICU Ward</option>
                                                <option value="Private Room">Private Room</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="beds-grid">
                                        {beds
                                            .filter(b => bedWardFilter === 'All' || b.ward === bedWardFilter)
                                            .map(b => (
                                                <div
                                                    key={b.bedNumber}
                                                    className={`bed-slot ${b.status} ${b.ward === 'ICU' ? 'icu-slot' : ''} ${b.ward === 'Private Room' ? 'private-slot' : ''}`}
                                                    onClick={() => handleOpenTransfer(b)}
                                                >
                                                    <span className="bed-num">{b.bedNumber}</span>
                                                    <span className="bed-ward">
                                                        {b.ward === 'ICU' ? 'ICU' : b.ward === 'Private Room' ? 'PR' : 'GW'}
                                                    </span>
                                                    {b.status === 'Occupied' && (
                                                        <div className="bed-occupant-tooltip">
                                                            <strong>{b.patientName}</strong>
                                                            <span>Click to reassign/transfer</span>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                    </div>
                                </div>

                                <div className="bed-log-card admin-card">
                                    <h3>📜 Reassignments &amp; Audit Logs</h3>
                                    <div className="timeline">
                                        {bedHistory.map((bh, idx) => (
                                            <div key={idx} className="timeline-node">
                                                <div className="node-indicator" />
                                                <div className="node-content">
                                                    <strong>{bh.patientName} ({bh.bedNumber})</strong>
                                                    <span>{bh.action} · {new Date(bh.date).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Bed Transfer Modal */}
                            {transferModal && (
                                <div className="modal-overlay">
                                    <div className="modal-content">
                                        <h3>🔀 Execute Patient Bed Reassignment</h3>
                                        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
                                            Reassign patient <strong>{transferModal.patientName}</strong> from bed <strong>{transferModal.bedNumber}</strong>.
                                        </p>
                                        <form onSubmit={handleSaveTransfer}>
                                            <div className="form-group" style={{ marginBottom: '12px' }}>
                                                <label className="staff-label">Target Ward *</label>
                                                <select
                                                    value={targetWard}
                                                    onChange={e => { setTargetWard(e.target.value); setTargetBed(''); }}
                                                    className="staff-input"
                                                >
                                                    <option value="General Ward">General Ward</option>
                                                    <option value="ICU">ICU Ward</option>
                                                    <option value="Private Room">Private Room</option>
                                                </select>
                                            </div>
                                            <div className="form-group" style={{ marginBottom: '20px' }}>
                                                <label className="staff-label">Select Available Bed *</label>
                                                <select
                                                    value={targetBed}
                                                    onChange={e => setTargetBed(e.target.value)}
                                                    className="staff-input"
                                                    required
                                                >
                                                    <option value="">-- Choose Bed --</option>
                                                    {beds
                                                        .filter(b => b.ward === targetWard && b.status === 'Available')
                                                        .map(b => (
                                                            <option key={b.bedNumber} value={b.bedNumber}>{b.bedNumber}</option>
                                                        ))}
                                                </select>
                                            </div>
                                            <div className="modal-buttons" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                                <button type="submit" className="submit-button" disabled={savingTransfer}>
                                                    {savingTransfer ? 'Processing...' : 'Transfer Patient'}
                                                </button>
                                                <button type="button" className="btn-cancel" onClick={() => setTransferModal(null)}>Cancel</button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ==================== 8. APPOINTMENTS ==================== */}
                    {tab === 'appointments' && (
                        <div className="appointments-view admin-card">
                            <div className="card-header-flex">
                                <h3>🗓️ Doctor Consultations Log</h3>
                                <input
                                    type="text"
                                    placeholder="Search by doctor or department..."
                                    value={apptSearch}
                                    onChange={e => setApptSearch(e.target.value)}
                                    className="search-input"
                                />
                            </div>
                            <div className="users-table">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Patient Name</th>
                                            <th>Department/Service</th>
                                            <th>Assigned Doctor</th>
                                            <th>Schedule Time</th>
                                            <th>Payment Status</th>
                                            <th>Queue Status</th>
                                            <th>Fee Charged</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {appointments
                                            .filter(a => !apptSearch || a.doctorName.toLowerCase().includes(apptSearch.toLowerCase()) || a.serviceName.toLowerCase().includes(apptSearch.toLowerCase()))
                                            .map((a, idx) => (
                                                <tr key={idx}>
                                                    <td><strong>{a.patientName}</strong></td>
                                                    <td>{a.serviceName}</td>
                                                    <td>Dr. {a.doctorName}</td>
                                                    <td>{new Date(a.appointmentDate).toLocaleDateString('en-IN')} at {a.appointmentTime}</td>
                                                    <td>
                                                        <span style={{
                                                            color: a.paymentStatus === 'paid' || a.paymentStatus === 'Paid' ? '#16a34a' : '#dc2626',
                                                            fontWeight: 700
                                                        }}>{a.paymentStatus}</span>
                                                    </td>
                                                    <td><span className={`status-badge status-${String(a.status).toLowerCase()}`}>{a.status}</span></td>
                                                    <td style={{ fontWeight: 700 }}>{formatCurrency(a.amount)}</td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* ==================== 9. BILLING OVERSIGHT ==================== */}
                    {tab === 'billing' && billingData && (
                        <div className="billing-oversight-view">
                            <div className="beds-stats-row admin-card">
                                <div className="bed-stat-mini"><span>Total Payments Collected</span><strong>{formatCurrency(billingData.stats.totalRevenue)}</strong></div>
                                <div className="bed-stat-mini outstanding"><span>Outstanding Dues</span><strong>{formatCurrency(billingData.stats.outstandingPayments)}</strong></div>
                                <div className="bed-stat-mini refunds"><span>Total Refund Approvals</span><strong>{formatCurrency(billingData.stats.totalRefunds)}</strong></div>
                                <div className="bed-stat-mini collections"><span>Total Paid Invoices</span><strong>{billingData.stats.collectionsCount} / {billingData.stats.invoiceCounts}</strong></div>
                            </div>

                            <div className="admin-card">
                                <div className="card-header-flex">
                                    <h3>🧾 Patient Invoice Directory</h3>
                                    <input
                                        type="text"
                                        placeholder="Search by patient name..."
                                        value={billingSearch}
                                        onChange={e => setBillingSearch(e.target.value)}
                                        className="search-input"
                                    />
                                </div>
                                <div className="users-table">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Invoice No.</th>
                                                <th>Patient Name</th>
                                                <th>Invoice Date</th>
                                                <th>Grand Total</th>
                                                <th>Amount Settled</th>
                                                <th>Dues Remaining</th>
                                                <th>Payment Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {billingData.invoices
                                                ?.filter(inv => !billingSearch || inv.patientName?.toLowerCase().includes(billingSearch.toLowerCase()))
                                                .map(inv => (
                                                    <tr key={inv._id}>
                                                        <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{inv.invoiceNumber}</td>
                                                        <td><strong>{inv.patientName}</strong></td>
                                                        <td>{new Date(inv.invoiceDate).toLocaleDateString('en-IN')}</td>
                                                        <td style={{ fontWeight: 600 }}>{formatCurrency(inv.grandTotal)}</td>
                                                        <td style={{ color: '#16a34a', fontWeight: 600 }}>{formatCurrency(inv.amountPaid)}</td>
                                                        <td style={{ color: '#dc2626', fontWeight: 600 }}>{formatCurrency(inv.outstandingAmount)}</td>
                                                        <td>
                                                            <span className={`status-badge ${inv.paymentStatus === 'Paid' ? 'status-active' : inv.paymentStatus === 'Partially Paid' ? 'status-pending' : 'status-inactive'}`}>
                                                                {inv.paymentStatus}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ==================== 10. REVENUE MONITORING ==================== */}
                    {tab === 'revenue' && revenueData && (
                        <div className="revenue-monitoring-view">
                            <div className="beds-stats-row admin-card">
                                <div className="bed-stat-mini"><span>Daily Billing</span><strong>{formatCurrency(revenueData.today)}</strong></div>
                                <div className="bed-stat-mini collections"><span>Weekly Billing</span><strong>{formatCurrency(revenueData.weekly)}</strong></div>
                                <div className="bed-stat-mini"><span>Monthly Billing</span><strong>{formatCurrency(revenueData.monthly)}</strong></div>
                                <div className="bed-stat-mini icu"><span>Yearly Total</span><strong>{formatCurrency(revenueData.yearly)}</strong></div>
                            </div>

                            <div className="admin-card">
                                <h3>📊 Revenue Stream Analysis</h3>
                                <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap', marginTop: '20px' }}>
                                    <div className="flex-1" style={{ minWidth: '300px' }}>
                                        <h4>Stream Aggregations (SVG Trend)</h4>
                                        <div className="svg-chart-container" style={{ padding: '20px 0' }}>
                                            <svg viewBox="0 0 500 200" style={{ width: '100%', height: '180px', overflow: 'visible' }}>
                                                {/* Grid lines */}
                                                <line x1="0" y1="180" x2="500" y2="180" stroke="#e2e8f0" strokeWidth="2" />
                                                <line x1="0" y1="120" x2="500" y2="120" stroke="#f1f5f9" strokeWidth="1" />
                                                <line x1="0" y1="60" x2="500" y2="60" stroke="#f1f5f9" strokeWidth="1" />

                                                {/* Revenue trend line */}
                                                <polyline
                                                    fill="none"
                                                    stroke="#14b8a6"
                                                    strokeWidth="4"
                                                    points="40,160 140,100 240,120 340,60 440,30"
                                                />
                                                {/* Dots on line */}
                                                <circle cx="40" cy="160" r="5" fill="#14b8a6" />
                                                <circle cx="140" cy="100" r="5" fill="#14b8a6" />
                                                <circle cx="240" cy="120" r="5" fill="#14b8a6" />
                                                <circle cx="340" cy="60" r="5" fill="#14b8a6" />
                                                <circle cx="440" cy="30" r="5" fill="#14b8a6" />

                                                {/* Labels */}
                                                <text x="40" y="195" textAnchor="middle" fontSize="10" fill="#94a3b8">Daily</text>
                                                <text x="140" y="195" textAnchor="middle" fontSize="10" fill="#94a3b8">Weekly</text>
                                                <text x="240" y="195" textAnchor="middle" fontSize="10" fill="#94a3b8">Monthly</text>
                                                <text x="340" y="195" textAnchor="middle" fontSize="10" fill="#94a3b8">Quarterly</text>
                                                <text x="440" y="195" textAnchor="middle" fontSize="10" fill="#94a3b8">Yearly</text>
                                            </svg>
                                        </div>
                                    </div>

                                    <div style={{ minWidth: '320px', flex: '0 0 350px' }}>
                                        <h4>Revenue Share by Department</h4>
                                        <div className="dept-bars" style={{ marginTop: '20px' }}>
                                            {revenueData.departments?.map(d => {
                                                const totalRevenue = revenueData.departments.reduce((sum, x) => sum + x.amount, 0) || 1;
                                                const pct = Math.round((d.amount / totalRevenue) * 100);
                                                return (
                                                    <div key={d.department} className="dept-bar-row">
                                                        <span className="dept-label" style={{ width: '130px' }}>{d.department}</span>
                                                        <div className="progress-outer">
                                                            <div className="progress-inner" style={{ width: `${pct}%` }} />
                                                        </div>
                                                        <span className="dept-value" style={{ width: '60px', textAlign: 'right' }}>{pct}%</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ==================== 11. RESOURCE MANAGEMENT ==================== */}
                    {tab === 'resources' && (
                        <div className="resource-management-view">
                            <div className="resources-cols">
                                <div className="admin-card flex-1">
                                    <h3>🛠️ Asset Utilization</h3>
                                    <div className="resource-progress-list">
                                        {resources.map(res => (
                                            <div key={res.name} className="resource-bar-row">
                                                <div className="resource-labels-row">
                                                    <strong>{res.name} ({res.type})</strong>
                                                    <span>{res.utilization}% utilized ({res.occupied} / {res.total})</span>
                                                </div>
                                                <div className="progress-outer">
                                                    <div
                                                        className={`progress-inner ${res.utilization > 80 ? 'critical-bar' : ''}`}
                                                        style={{ width: `${res.utilization}%` }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="admin-card flex-1">
                                    <h3>⚙️ Asset Maintenance Schedule</h3>
                                    <div className="maintenance-list">
                                        {maintenanceAlerts.map((ma, idx) => (
                                            <div key={idx} className="maintenance-row">
                                                <div>
                                                    <strong>{ma.resource}</strong>
                                                    <span>Action: {ma.type}</span>
                                                </div>
                                                <span className={`status-badge ${ma.status === 'Completed' ? 'status-active' : 'status-pending'}`}>
                                                    {ma.status}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ==================== 12. INVENTORY MONITORING ==================== */}
                    {tab === 'inventory' && inventoryData && (
                        <div className="inventory-view admin-card">
                            <h2>Medicine Catalog Stock Levels</h2>
                            <p style={{ color: '#888', marginBottom: '24px' }}>Auditing expiring batches and items running low on stock to manage purchase triggers.</p>

                            <div className="inventory-grids-split">
                                <div className="inv-split-section">
                                    <h3 style={{ color: '#dc2626' }}>🚨 Low Stock Alert</h3>
                                    <div className="users-table">
                                        <table>
                                            <thead>
                                                <tr><th>Medicine</th><th>Current Stock</th><th>Salt Composition</th></tr>
                                            </thead>
                                            <tbody>
                                                {inventoryData.lowStock?.map(item => (
                                                    <tr key={item._id}>
                                                        <td><strong style={{ color: '#b91c1c' }}>{item.name}</strong></td>
                                                        <td style={{ fontWeight: 700 }}>{item.stock} units</td>
                                                        <td>{item.salt}</td>
                                                    </tr>
                                                ))}
                                                {(!inventoryData.lowStock || inventoryData.lowStock.length === 0) && (
                                                    <tr><td colSpan="3" className="empty-table-msg">No low stock items.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="inv-split-section">
                                    <h3 style={{ color: '#7c3aed' }}>⏳ Expiring Batches</h3>
                                    <div className="users-table">
                                        <table>
                                            <thead>
                                                <tr><th>Medicine</th><th>Batch Code</th><th>Expiry Date</th></tr>
                                            </thead>
                                            <tbody>
                                                {inventoryData.expiring?.map(item => (
                                                    <tr key={item._id}>
                                                        <td><strong>{item.name}</strong></td>
                                                        <td><code>{item.batch}</code></td>
                                                        <td style={{ color: '#7c3aed', fontWeight: 600 }}>{new Date(item.expiryDate).toLocaleDateString()}</td>
                                                    </tr>
                                                ))}
                                                {(!inventoryData.expiring || inventoryData.expiring.length === 0) && (
                                                    <tr><td colSpan="3" className="empty-table-msg">No expiring batches.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ==================== 13. REPORTS ==================== */}
                    {tab === 'reports' && (
                        <div className="reports-view-card admin-card">
                            <h2>📥 Custom Reports Export Engine</h2>
                            <p style={{ color: '#888', marginBottom: '24px' }}>Download clinical and financial logs. All data queries are scoped automatically to your active hospital context.</p>

                            <form onSubmit={handleGenerateReport} className="report-config-form">
                                <div className="form-group" style={{ marginBottom: '16px' }}>
                                    <label className="staff-label">Select Report Data Category *</label>
                                    <select
                                        value={reportCategory}
                                        onChange={e => setReportCategory(e.target.value)}
                                        className="staff-input"
                                    >
                                        <option value="patients">Hospital Admitted Patients List</option>
                                        <option value="appointments">Doctor Appointment Calendars</option>
                                        <option value="admissions">IPD Ward Admissions logs</option>
                                        <option value="revenue">Invoices &amp; Revenue Operations log</option>
                                    </select>
                                </div>

                                <div className="form-group" style={{ marginBottom: '24px' }}>
                                    <label className="staff-label">Format Preference *</label>
                                    <div style={{ display: 'flex', gap: '20px', marginTop: '6px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                            <input type="radio" name="format" value="pdf" checked={exportFormat === 'pdf'} onChange={e => setExportFormat(e.target.value)} />
                                            <span>PDF Document (.pdf)</span>
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                            <input type="radio" name="format" value="csv" checked={exportFormat === 'csv'} onChange={e => setExportFormat(e.target.value)} />
                                            <span>Spreadsheet Log (.csv)</span>
                                        </label>
                                    </div>
                                </div>

                                <button type="submit" className="submit-button" disabled={generatingReport}>
                                    <FiPrinter style={{ marginRight: '8px' }} />
                                    {generatingReport ? 'Formatting File...' : 'Generate & Download Report'}
                                </button>
                            </form>
                        </div>
                    )}

                    {/* ==================== 14. ANALYTICS ==================== */}
                    {tab === 'analytics' && analyticsData && (
                        <div className="analytics-view-dashboard">
                            <div className="admin-card">
                                <h3>📈 Patient Registrations Trend (OPD Growth)</h3>
                                <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-end', height: '160px', padding: '10px 0' }}>
                                    {analyticsData.patientGrowth?.map(p => {
                                        const maxCount = Math.max(...analyticsData.patientGrowth.map(x => x.count || 1));
                                        const height = Math.max(10, Math.round((p.count / maxCount) * 120));
                                        return (
                                            <div key={p.date} className="rev-bar-col">
                                                <span className="rev-amount">{p.count} pts</span>
                                                <div className="rev-bar" style={{ height: `${height}px`, background: 'linear-gradient(to top, #0ea5e9, #6366f1)' }} />
                                                <span className="rev-month">{p.date}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="admin-card" style={{ marginTop: '20px' }}>
                                <h3>👨‍⚕️ Clinical Practitioner Workloads</h3>
                                <div className="users-table">
                                    <table>
                                        <thead>
                                            <tr><th>Practitioner Name</th><th>Clinical Consultations Completed</th><th>Fulfillment Rating</th><th>Active Load Indicator</th></tr>
                                        </thead>
                                        <tbody>
                                            {analyticsData.doctorPerformance?.map((doc, idx) => (
                                                <tr key={idx}>
                                                    <td><strong>Dr. {doc.name}</strong></td>
                                                    <td>{doc.completedConsultations} consultations</td>
                                                    <td style={{ color: '#16a34a', fontWeight: 700 }}>{doc.rating} ★</td>
                                                    <td>
                                                        <div className="progress-outer" style={{ width: '150px' }}>
                                                            <div className="progress-inner" style={{ width: `${doc.workloadPercentage || 60}%` }} />
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

                    {/* ==================== 15. AUDIT LOGS ==================== */}
                    {tab === 'audit-logs' && (
                        <div className="audit-logs-view admin-card">
                            <div className="card-header-flex">
                                <h3>📑 Hospital Audit Trail Logs</h3>
                                <input
                                    type="text"
                                    placeholder="Search logs by action or details..."
                                    value={auditSearch}
                                    onChange={e => setAuditSearch(e.target.value)}
                                    className="search-input"
                                />
                            </div>
                            <div className="logs-scroller" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                                {auditLogs
                                    .filter(log => !auditSearch || String(log.action).toLowerCase().includes(auditSearch.toLowerCase()) || String(log.details).toLowerCase().includes(auditSearch.toLowerCase()))
                                    .map(log => (
                                        <div key={log._id} className="log-line">
                                            <span className="log-time">[{new Date(log.createdAt).toLocaleString()}]</span>
                                            <span className="log-tag outline">ACTION: {log.action}</span>
                                            <span className="log-msg">IP: {log.ipAddress || 'Internal'} · details: {log.details}</span>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}

                    {/* ==================== 16. SETTINGS ==================== */}
                    {tab === 'settings' && (
                        <div className="settings-view-card admin-card">
                            <h2>⚙️ Hospital Administration Configuration</h2>
                            <p style={{ color: '#888', marginBottom: '24px' }}>Edit general operational preferences and automated alert boundaries.</p>

                            <form onSubmit={e => { e.preventDefault(); setSuccess('Configurations updated successfully.'); }} className="report-config-form">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="staff-label">Hospital Registered Name</label>
                                        <input type="text" className="staff-input" defaultValue="Admit Hospital" readOnly />
                                    </div>
                                    <div className="form-group">
                                        <label className="staff-label">OPD Time-slot interval (Mins)</label>
                                        <select className="staff-input">
                                            <option>15 minutes</option>
                                            <option>20 minutes</option>
                                            <option>30 minutes</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="form-row" style={{ marginTop: '16px' }}>
                                    <div className="form-group">
                                        <label className="staff-label">Critical Ward Bed Warning threshold</label>
                                        <input type="number" className="staff-input" defaultValue={5} />
                                        <small style={{ color: '#888' }}>Warns system administrators when beds fall below this number.</small>
                                    </div>
                                    <div className="form-group">
                                        <label className="staff-label">Dispenser Alert threshold</label>
                                        <input type="number" className="staff-input" defaultValue={50} />
                                        <small style={{ color: '#888' }}>Alerts on medicine batches running below this quantity.</small>
                                    </div>
                                </div>

                                <button type="submit" className="submit-button" style={{ marginTop: '24px' }}>
                                    Save System Configurations
                                </button>
                            </form>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default AdministratorDashboard;
