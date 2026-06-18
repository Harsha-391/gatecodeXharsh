import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { financeAPI } from '../../utils/api';
import './FinancialStatements.css';

const FinancialStatements = () => {
    const navigate = useNavigate();
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

    const [activeReport, setActiveReport] = useState(''); // 'daily_rev', 'monthly_rev', 'dept_rev', 'pl_statement', 'expenses', 'outstanding', 'claims'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [previewData, setPreviewData] = useState(null);

    const reportOptions = [
        { id: 'daily_rev', name: 'Daily Revenue Report', desc: 'Detailed breakdown of day-by-day invoice collections.', icon: '📅' },
        { id: 'monthly_rev', name: 'Monthly Revenue Report', desc: 'Summary of monthly cash inflows for general ledger.', icon: '📈' },
        { id: 'dept_rev', name: 'Department Revenue Report', desc: 'Revenue split by consultation, lab, pharma, admission.', icon: '🏥' },
        { id: 'pl_statement', name: 'Profit & Loss Statement', desc: 'Revenues vs expenses and net margin calculation.', icon: '⚖️' },
        { id: 'expenses', name: 'Expense Report', desc: 'Itemized expenditure tracking with vendor details.', icon: '💸' },
        { id: 'outstanding', name: 'Outstanding Payments Report', desc: 'Summary of active credits and aged overdue bills.', icon: '🛑' },
        { id: 'claims', name: 'Insurance Claims Report', desc: 'Submitted, pending, approved, and rejected insurance claims.', icon: '🛡️' },
        { id: 'payroll_report', name: 'Payroll Report', desc: 'Summary of all employee salaries paid historically.', icon: '💼' },
        { id: 'salary_expense', name: 'Salary Expense Report', desc: 'Monthly trends in employee salary payouts.', icon: '📊' },
        { id: 'doctor_payout_report', name: 'Doctor Payout Report', desc: 'Consolidated report of doctor payouts and commissions.', icon: '⚕️' },
        { id: 'dept_payroll', name: 'Department Payroll Report', desc: 'Staff payroll expense breakdown by departments/roles.', icon: '🏢' }
    ];

    const fetchReportData = async (reportId) => {
        try {
            setLoading(true);
            setError('');
            setPreviewData(null);
            setActiveReport(reportId);

            let res;
            if (reportId === 'daily_rev' || reportId === 'monthly_rev' || reportId === 'dept_rev') {
                res = await financeAPI.getRevenueAnalytics();
            } else if (reportId === 'pl_statement') {
                res = await financeAPI.getProfitLoss();
            } else if (reportId === 'expenses') {
                res = await financeAPI.getExpenses('all');
            } else if (reportId === 'outstanding') {
                res = await financeAPI.getOutstandingPayments();
            } else if (reportId === 'claims') {
                res = await financeAPI.getInsuranceClaims();
            } else if (reportId === 'payroll_report' || reportId === 'salary_expense' || reportId === 'dept_payroll') {
                res = await financeAPI.getPayrollRecords({ status: 'Paid' });
            } else if (reportId === 'doctor_payout_report') {
                res = await financeAPI.getDoctorPayoutRecords({ status: 'Paid' });
            }

            if (res && res.success) {
                setPreviewData(res);
            } else {
                setError('Failed to fetch report data.');
            }
        } catch (err) {
            console.error(err);
            setError('Error compiling report details.');
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

    const exportToExcel = () => {
        if (!previewData) return;

        let csvContent = 'data:text/csv;charset=utf-8,';
        let fileName = `${activeReport}_statement.csv`;

        if (activeReport === 'daily_rev') {
            csvContent += 'Date,Total Revenue Collected\n';
            (previewData.dailyTrend || []).forEach(row => {
                csvContent += `"${row.label}","${row.amount}"\n`;
            });
        } else if (activeReport === 'monthly_rev') {
            csvContent += 'Month,Total Revenue Collected\n';
            (previewData.monthlyTrend || []).forEach(row => {
                csvContent += `"${row.label}","${row.amount}"\n`;
            });
        } else if (activeReport === 'dept_rev') {
            csvContent += 'Department,Revenue Amount\n';
            Object.entries(previewData.departmentRevenue || {}).forEach(([dept, amount]) => {
                csvContent += `"${dept}","${amount}"\n`;
            });
        } else if (activeReport === 'pl_statement') {
            csvContent += 'P&L Parameter,Value Amount\n';
            csvContent += `"Total Revenue","${previewData.totalRevenue}"\n`;
            csvContent += `"Total Expenses","${previewData.totalExpenses}"\n`;
            csvContent += `"Net Profit","${previewData.netProfit}"\n`;
        } else if (activeReport === 'expenses') {
            csvContent += 'Date,Category,Recipient/Vendor,Description,Payment Method,Status,Amount\n';
            (previewData.expenses || []).forEach(row => {
                csvContent += `"${new Date(row.date).toLocaleDateString()}","${row.category}","${row.recipientName || ''}","${row.description || ''}","${row.paymentMethod}","${row.paymentStatus}","${row.amount}"\n`;
            });
        } else if (activeReport === 'outstanding') {
            csvContent += 'Outstanding Category,Count,Total Balance\n';
            csvContent += `"OPD Outstanding","${previewData.pendingOPD.length}","${previewData.pendingOPD.reduce((s, x) => s + x.outstandingAmount, 0)}"\n`;
            csvContent += `"IPD Outstanding","${previewData.pendingIPD.length}","${previewData.pendingIPD.reduce((s, x) => s + x.outstandingAmount, 0)}"\n`;
            csvContent += `"Overdue Accounts","${previewData.overdueAccounts.length}","${previewData.overdueAccounts.reduce((s, x) => s + x.outstandingAmount, 0)}"\n`;
        } else if (activeReport === 'claims') {
            csvContent += 'Insurer,Claim ID,Invoice,Patient Name,Amount,Status\n';
            (previewData.claims || []).forEach(c => {
                csvContent += `"${c.insuranceProvider}","${c.claimNumber}","${c.invoiceNumber}","${c.patientName}","${c.claimAmount}","${c.status}"\n`;
            });
        } else if (activeReport === 'payroll_report') {
            csvContent += 'Month,Employee Name,Role/Designation,Basic Salary,Allowances,Deductions,Net Salary,Payment Date,Payment Method,Reference\n';
            (previewData.records || []).forEach(row => {
                csvContent += `"${row.month}","${row.employeeId?.name || ''}","${row.employeeId?.designation || row.employeeId?.role || ''}","${row.basicSalary}","${row.allowances}","${row.deductions}","${row.netSalary}","${row.paymentDate ? new Date(row.paymentDate).toLocaleDateString() : ''}","${row.paymentMethod || ''}","${row.transactionReference || ''}"\n`;
            });
        } else if (activeReport === 'salary_expense') {
            const monthlySalary = {};
            (previewData.records || []).forEach(row => {
                if (!monthlySalary[row.month]) {
                    monthlySalary[row.month] = { basic: 0, allowances: 0, deductions: 0, net: 0 };
                }
                monthlySalary[row.month].basic += row.basicSalary;
                monthlySalary[row.month].allowances += row.allowances;
                monthlySalary[row.month].deductions += row.deductions;
                monthlySalary[row.month].net += row.netSalary;
            });
            csvContent += 'Month,Total Basic Salary,Total Allowances,Total Deductions,Total Net Paid\n';
            Object.entries(monthlySalary).forEach(([m, val]) => {
                csvContent += `"${m}","${val.basic}","${val.allowances}","${val.deductions}","${val.net}"\n`;
            });
        } else if (activeReport === 'doctor_payout_report') {
            csvContent += 'Month,Doctor Name,Specialty,Payout Model,Patients Seen,Revenue Generated,Commission %,Commission Amount,Fixed Salary,Total Paid,Payment Date,Payment Method,Reference\n';
            (previewData.records || []).forEach(row => {
                csvContent += `"${row.month}","${row.doctorId?.name || ''}","${row.doctorId?.specialty || ''}","${row.doctorId?.payoutModel || ''}","${row.patientsSeen}","${row.revenueGenerated}","${row.commissionPercent}","${row.commissionAmount}","${row.fixedSalary}","${row.totalPayable}","${row.paymentDate ? new Date(row.paymentDate).toLocaleDateString() : ''}","${row.paymentMethod || ''}","${row.transactionReference || ''}"\n`;
            });
        } else if (activeReport === 'dept_payroll') {
            const deptSalaries = {};
            (previewData.records || []).forEach(row => {
                const dept = row.employeeId?.designation || row.employeeId?.role || 'Staff';
                if (!deptSalaries[dept]) {
                    deptSalaries[dept] = { count: 0, basic: 0, allowances: 0, deductions: 0, net: 0 };
                }
                deptSalaries[dept].count += 1;
                deptSalaries[dept].basic += row.basicSalary;
                deptSalaries[dept].allowances += row.allowances;
                deptSalaries[dept].deductions += row.deductions;
                deptSalaries[dept].net += row.netSalary;
            });
            csvContent += 'Department/Role,Employee Count,Total Basic Salary,Total Allowances,Total Deductions,Total Net Paid\n';
            Object.entries(deptSalaries).forEach(([dept, val]) => {
                csvContent += `"${dept}","${val.count}","${val.basic}","${val.allowances}","${val.deductions}","${val.net}"\n`;
            });
        }

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="financial-statements-page">
            <header className="page-header">
                <div>
                    <h1>Financial Statements & Reports</h1>
                    <p>Compile official hospital financial balance logs, margins, and collection reports</p>
                </div>
            </header>

            {error && <div className="error-message">⚠️ {error}</div>}

            <div className="statements-layout">
                {/* Options List */}
                <div className="options-panel">
                    <h3>Select Report Statement</h3>
                    <div className="options-grid">
                        {reportOptions.map(opt => (
                            <div 
                                key={opt.id} 
                                className={`option-card ${activeReport === opt.id ? 'active' : ''}`}
                                onClick={() => fetchReportData(opt.id)}
                            >
                                <span className="option-icon">{opt.icon}</span>
                                <div className="option-info">
                                    <h4>{opt.name}</h4>
                                    <p>{opt.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Report Preview */}
                <div className="preview-panel card-box">
                    <div className="preview-actions">
                        <h3>Statement Preview</h3>
                        {previewData && (
                            <div className="action-buttons">
                                <button className="print-btn" onClick={handlePrint}>🖨️ Save PDF / Print</button>
                                <button className="excel-btn" onClick={exportToExcel}>📊 Export Excel (CSV)</button>
                            </div>
                        )}
                    </div>

                    {!activeReport && (
                        <div className="empty-preview">
                            <span className="info-icon">💡</span>
                            <p>Choose a financial statement from the left panel to compile and preview the ledger.</p>
                        </div>
                    )}

                    {loading && <div className="loading-message">⏳ Processing ledgers and compiling statement...</div>}

                    {previewData && !loading && (
                        <div className="printable-statement" id="statement-print-area">
                            <div className="statement-header">
                                <h2>HOSPITAL CLINICAL HMS</h2>
                                <p className="subtitle">Official Account Ledger Statement</p>
                                <div className="details-grid">
                                    <div><strong>Report:</strong> {reportOptions.find(o => o.id === activeReport)?.name}</div>
                                    <div><strong>Generated By:</strong> {currentUser.name || 'Accountant'}</div>
                                    <div><strong>Date Created:</strong> {new Date().toLocaleDateString('en-IN')}</div>
                                    <div><strong>Scope:</strong> Complete Tenant Accounts</div>
                                </div>
                            </div>

                            {activeReport === 'daily_rev' && (
                                <table className="statement-table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th className="text-right">Collection Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(previewData.dailyTrend || []).map((row, idx) => (
                                            <tr key={idx}>
                                                <td>{row.label}</td>
                                                <td className="text-right bold green">{formatCurrency(row.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}

                            {activeReport === 'monthly_rev' && (
                                <table className="statement-table">
                                    <thead>
                                        <tr>
                                            <th>Calendar Month</th>
                                            <th className="text-right">Collection Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(previewData.monthlyTrend || []).map((row, idx) => (
                                            <tr key={idx}>
                                                <td>{row.label}</td>
                                                <td className="text-right bold green">{formatCurrency(row.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}

                            {activeReport === 'dept_rev' && (
                                <table className="statement-table">
                                    <thead>
                                        <tr>
                                            <th>Service Department</th>
                                            <th className="text-right">Revenue Share</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.entries(previewData.departmentRevenue || {}).map(([dept, val]) => (
                                            <tr key={dept}>
                                                <td>{dept}</td>
                                                <td className="text-right bold green">{formatCurrency(val)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}

                            {activeReport === 'pl_statement' && (
                                <div className="pl-print-block">
                                    <div className="pl-row header-pl">
                                        <span>Operating Category</span>
                                        <span>Ledger Balances</span>
                                    </div>
                                    <div className="pl-row">
                                        <span>Operating Revenue (Collections)</span>
                                        <span className="green bold">+{formatCurrency(previewData.totalRevenue)}</span>
                                    </div>
                                    <div className="pl-row">
                                        <span>Operating Expenditures (Outflows)</span>
                                        <span className="red bold">−{formatCurrency(previewData.totalExpenses)}</span>
                                    </div>
                                    <div className="pl-row footer-pl">
                                        <span>Net Surplus / Deficit (Net Profit)</span>
                                        <span className={previewData.netProfit >= 0 ? 'green' : 'red'}>
                                            {formatCurrency(previewData.netProfit)}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {activeReport === 'expenses' && (
                                <table className="statement-table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Category</th>
                                            <th>Recipient</th>
                                            <th className="text-right">Disbursed Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(previewData.expenses || []).map((exp) => (
                                            <tr key={exp._id}>
                                                <td>{new Date(exp.date).toLocaleDateString('en-IN')}</td>
                                                <td>{exp.category}</td>
                                                <td>{exp.recipientName || 'General'}</td>
                                                <td className="text-right bold red">{formatCurrency(exp.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}

                            {activeReport === 'outstanding' && (
                                <table className="statement-table">
                                    <thead>
                                        <tr>
                                            <th>Aging Accounts Group</th>
                                            <th>Active Bills</th>
                                            <th className="text-right">Total Outstanding Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td>Outpatient Department (OPD)</td>
                                            <td>{previewData.pendingOPD.length} Bills</td>
                                            <td className="text-right bold red">
                                                {formatCurrency(previewData.pendingOPD.reduce((s, x) => s + x.outstandingAmount, 0))}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>Inpatient Department (IPD)</td>
                                            <td>{previewData.pendingIPD.length} Bills</td>
                                            <td className="text-right bold red">
                                                {formatCurrency(previewData.pendingIPD.reduce((s, x) => s + x.outstandingAmount, 0))}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>Overdue Balance Accounts (&gt;30 Days)</td>
                                            <td>{previewData.overdueAccounts.length} Bills</td>
                                            <td className="text-right bold red">
                                                {formatCurrency(previewData.overdueAccounts.reduce((s, x) => s + x.outstandingAmount, 0))}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            )}

                            {activeReport === 'claims' && (
                                <table className="statement-table">
                                    <thead>
                                        <tr>
                                            <th>Claim Number</th>
                                            <th>Patient Name</th>
                                            <th>Insurer Name</th>
                                            <th>Status</th>
                                            <th className="text-right">Amount Requested</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(previewData.claims || []).map((c) => (
                                            <tr key={c._id}>
                                                <td>{c.claimNumber}</td>
                                                <td>{c.patientName}</td>
                                                <td>{c.insuranceProvider}</td>
                                                <td className="bold">{c.status}</td>
                                                <td className="text-right bold">{formatCurrency(c.claimAmount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}

                            {activeReport === 'payroll_report' && (
                                <table className="statement-table">
                                    <thead>
                                        <tr>
                                            <th>Month</th>
                                            <th>Employee Name</th>
                                            <th>Designation</th>
                                            <th>Basic Salary</th>
                                            <th>Allowances</th>
                                            <th>Deductions</th>
                                            <th className="text-right">Net Paid</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(previewData.records || []).map((row) => (
                                            <tr key={row._id}>
                                                <td>{row.month}</td>
                                                <td className="bold">{row.employeeId?.name || 'N/A'}</td>
                                                <td>{row.employeeId?.designation || row.employeeId?.role || 'Staff'}</td>
                                                <td>{formatCurrency(row.basicSalary)}</td>
                                                <td className="green">+{formatCurrency(row.allowances)}</td>
                                                <td className="red">-{formatCurrency(row.deductions)}</td>
                                                <td className="text-right bold highlight-green" style={{ color: '#059669' }}>{formatCurrency(row.netSalary)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}

                            {activeReport === 'salary_expense' && (
                                <table className="statement-table">
                                    <thead>
                                        <tr>
                                            <th>Month</th>
                                            <th>Basic Salaries</th>
                                            <th>Allowances</th>
                                            <th>Deductions</th>
                                            <th className="text-right">Total Net Paid</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(() => {
                                            const monthlySalary = {};
                                            (previewData.records || []).forEach(row => {
                                                if (!monthlySalary[row.month]) {
                                                    monthlySalary[row.month] = { basic: 0, allowances: 0, deductions: 0, net: 0 };
                                                }
                                                monthlySalary[row.month].basic += row.basicSalary;
                                                monthlySalary[row.month].allowances += row.allowances;
                                                monthlySalary[row.month].deductions += row.deductions;
                                                monthlySalary[row.month].net += row.netSalary;
                                            });
                                            return Object.entries(monthlySalary).map(([m, val]) => (
                                                <tr key={m}>
                                                    <td className="bold">{m}</td>
                                                    <td>{formatCurrency(val.basic)}</td>
                                                    <td className="green">+{formatCurrency(val.allowances)}</td>
                                                    <td className="red">-{formatCurrency(val.deductions)}</td>
                                                    <td className="text-right bold highlight-green" style={{ color: '#059669' }}>{formatCurrency(val.net)}</td>
                                                </tr>
                                            ));
                                        })()}
                                    </tbody>
                                </table>
                            )}

                            {activeReport === 'doctor_payout_report' && (
                                <table className="statement-table">
                                    <thead>
                                        <tr>
                                            <th>Month</th>
                                            <th>Doctor Name</th>
                                            <th>Model</th>
                                            <th>Revenue</th>
                                            <th>Commission</th>
                                            <th>Fixed Salary</th>
                                            <th className="text-right">Total Paid</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(previewData.records || []).map((row) => (
                                            <tr key={row._id}>
                                                <td>{row.month}</td>
                                                <td className="bold">{row.doctorId?.name || 'N/A'}</td>
                                                <td>{row.doctorId?.payoutModel || 'Fixed'}</td>
                                                <td>{formatCurrency(row.revenueGenerated)}</td>
                                                <td className="green">+{formatCurrency(row.commissionAmount)}</td>
                                                <td>{formatCurrency(row.fixedSalary)}</td>
                                                <td className="text-right bold highlight-pink" style={{ color: '#db2777' }}>{formatCurrency(row.totalPayable)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}

                            {activeReport === 'dept_payroll' && (
                                <table className="statement-table">
                                    <thead>
                                        <tr>
                                            <th>Department / Designation</th>
                                            <th>Employee Count</th>
                                            <th>Basic Salaries</th>
                                            <th>Allowances</th>
                                            <th>Deductions</th>
                                            <th className="text-right">Total Net Paid</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(() => {
                                            const deptSalaries = {};
                                            (previewData.records || []).forEach(row => {
                                                const dept = row.employeeId?.designation || row.employeeId?.role || 'Staff';
                                                if (!deptSalaries[dept]) {
                                                    deptSalaries[dept] = { count: 0, basic: 0, allowances: 0, deductions: 0, net: 0 };
                                                }
                                                deptSalaries[dept].count += 1;
                                                deptSalaries[dept].basic += row.basicSalary;
                                                deptSalaries[dept].allowances += row.allowances;
                                                deptSalaries[dept].deductions += row.deductions;
                                                deptSalaries[dept].net += row.netSalary;
                                            });
                                            return Object.entries(deptSalaries).map(([dept, val]) => (
                                                <tr key={dept}>
                                                    <td className="bold">{dept}</td>
                                                    <td>{val.count} Staff</td>
                                                    <td>{formatCurrency(val.basic)}</td>
                                                    <td className="green">+{formatCurrency(val.allowances)}</td>
                                                    <td className="red">-{formatCurrency(val.deductions)}</td>
                                                    <td className="text-right bold highlight-green" style={{ color: '#059669' }}>{formatCurrency(val.net)}</td>
                                                </tr>
                                            ));
                                        })()}
                                    </tbody>
                                </table>
                            )}

                            <div className="statement-footer">
                                <p>End of Official Financial Report. Confidential Document.</p>
                                <p>© Clinical HMS Accounting System. Generated securely.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FinancialStatements;
