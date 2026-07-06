import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { clinicAPI, uploadAPI, documentTemplatesAPI } from '../../utils/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './ClinicDashboard.css';

// ─── PDF HELPERS ──────────────────────────────────────────────────────────────
const getClinicInfo = () => {
    try {
        const h = JSON.parse(localStorage.getItem('hospitalContext') || 'null');
        const u = JSON.parse(localStorage.getItem('user') || '{}');
        return { hName: h?.name || u?.hospitalName || 'Clinic', hAddr: [h?.address, h?.city, h?.state].filter(Boolean).join(', '), hPhone: h?.phone || '', issuedBy: u?.name || 'Staff' };
    } catch { return { hName: 'Clinic', hAddr: '', hPhone: '', issuedBy: 'Staff' }; }
};

const pdfHeader = (doc, title, color = [41, 128, 185]) => {
    const { hName, hAddr, hPhone } = getClinicInfo();
    let y = 18;
    doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
    doc.text(hName, 105, y, { align: 'center' }); y += 7;
    if (hAddr) { doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100); doc.text(hAddr, 105, y, { align: 'center' }); y += 5; }
    if (hPhone) { doc.text(`Ph: ${hPhone}`, 105, y, { align: 'center' }); y += 5; }
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(...color);
    doc.text(title, 105, y, { align: 'center' }); y += 5;
    doc.setDrawColor(...color); doc.setLineWidth(0.5); doc.line(14, y, 196, y); y += 8;
    doc.setTextColor(0); doc.setFont('helvetica', 'normal');
    return y;
};

const generateRegistrationSlipPDF = (patient) => {
    const doc = new jsPDF();
    let y = pdfHeader(doc, 'Patient Registration Slip', [16, 163, 74]);
    autoTable(doc, {
        startY: y,
        body: [
            ['Patient Name', patient.name || '-'],
            ['Patient ID', patient.patientUid || patient._id || 'N/A'],
            ['Phone', patient.phone || '-'],
            ['Gender', patient.gender || '-'],
            ['Age', patient.age ? `${patient.age} Years` : '-'],
            ['Blood Group', patient.bloodGroup || '-'],
            ['Address', patient.address || '-'],
            ['Registered On', new Date().toLocaleString('en-IN')],
        ],
        theme: 'grid',
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52 } },
        bodyStyles: { fontSize: 10 },
        alternateRowStyles: { fillColor: [245, 249, 255] },
    });
    y = doc.lastAutoTable.finalY + 8;
    const { issuedBy, hName } = getClinicInfo();
    doc.setFontSize(8); doc.setTextColor(120);
    doc.text(`Issued by: ${issuedBy}  |  Generated: ${new Date().toLocaleString('en-IN')}`, 105, y, { align: 'center' }); y += 5;
    doc.text(`Welcome to ${hName}`, 105, y, { align: 'center' });
    if (window.confirm("Do you want to download the Registration Slip PDF?")) {
        doc.save(`Registration_${patient.patientUid || patient._id}.pdf`);
    }
};

const loadTemplateAndBg = async (type) => {
    try {
        const token = localStorage.getItem('token');
        if (!token) return { template: null, bgBase64: null };
        const res = await documentTemplatesAPI.getActive(type);
        if (res.success && res.template) {
            const template = res.template;
            if (template.bgBase64) {
                return { template, bgBase64: template.bgBase64 };
            }
            let bgBase64 = null;
            if (template.url && !template.url.endsWith('.pdf')) {
                try {
                    const resp = await fetch(template.url);
                    const blob = await resp.blob();
                    bgBase64 = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.readAsDataURL(blob);
                        reader.onloadend = () => resolve(reader.result);
                    });
                } catch (fetchErr) {
                    console.error('[loadTemplateAndBg] Error converting template to base64:', fetchErr);
                }
            }
            return { template, bgBase64 };
        }
    } catch (err) {
        console.error(`[loadTemplateAndBg] Failed to load template for ${type}:`, err);
    }
    return { template: null, bgBase64: null };
};

const generateTokenReceiptPDF = async (patient, appointment) => {
    const doc = new jsPDF();
    const { template, bgBase64 } = await loadTemplateAndBg('billing_payment');

    const pageW = 210;
    const pageH = 297;

    if (bgBase64) {
        doc.addImage(bgBase64, 'PNG', 0, 0, pageW, pageH);
    }

    let y = 18;
    const leftM = template ? (template.leftMargin || 15) : 14;
    const rightM = template ? (template.rightMargin || 15) : 14;

    if (template) {
        y = template.headerHeight || 50;
    } else {
        y = pdfHeader(doc, 'Consultation Token Receipt', [41, 128, 185]);
    }

    autoTable(doc, {
        startY: y,
        margin: { left: leftM, right: rightM },
        body: [
            ['Patient Name', patient.name || '-'],
            ['Patient ID', patient.patientUid || '-'],
            ['Phone', patient.phone || '-'],
            ['Token #', String(appointment.tokenNumber || '-')],
            ['Service', appointment.serviceName || 'General Consultation'],
            ['Date', new Date(appointment.appointmentDate || Date.now()).toLocaleDateString('en-IN')],
            ['Consultation Fee', `Rs. ${Number(appointment.amount || 0).toLocaleString('en-IN')}`],
            ['Payment Status', 'PAID \u2713'],
        ],
        theme: 'grid',
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52 } },
        bodyStyles: { fontSize: 10 },
        alternateRowStyles: { fillColor: [245, 249, 255] },
    });

    y = doc.lastAutoTable.finalY + 8;
    const footerH = template ? (template.footerHeight || 30) : 20;
    y = Math.max(y, 297 - footerH - 15);

    const { issuedBy, hName } = getClinicInfo();
    doc.setFontSize(8); doc.setTextColor(120);
    doc.text(`Issued by: ${issuedBy}  |  ${new Date().toLocaleString('en-IN')}`, 105, y, { align: 'center' }); y += 5;
    doc.text(`Thank you for choosing ${hName}`, 105, y, { align: 'center' });

    if (window.confirm("Do you want to download the Token Receipt PDF?")) {
        doc.save(`Receipt_Token${appointment.tokenNumber}_${patient.patientUid || patient._id}.pdf`);
    }
};

const generatePrescriptionSlipPDF = async (consulting, rx, vitalsData) => {
    const pt = consulting.clinicPatientId || {};
    const doc = new jsPDF();
    const { template, bgBase64 } = await loadTemplateAndBg('doctor_prescription');

    const pageW = 210;
    const pageH = 297;

    if (bgBase64) {
        doc.addImage(bgBase64, 'PNG', 0, 0, pageW, pageH);
    }

    let y = 18;
    const leftM = template ? (template.leftMargin || 15) : 14;
    const rightM = template ? (template.rightMargin || 15) : 14;

    if (template) {
        y = template.headerHeight || 50;
    } else {
        y = pdfHeader(doc, 'Prescription Slip', [76, 175, 80]);
    }

    autoTable(doc, {
        startY: y,
        margin: { left: leftM, right: rightM },
        body: [
            ['Patient', pt.name || '-', 'ID', pt.patientUid || '-'],
            ['Gender', pt.gender || '-', 'Blood Grp', pt.bloodGroup || '-'],
            ['Token #', String(consulting.tokenNumber || '-'), 'Date', new Date().toLocaleDateString('en-IN')],
            ['Diagnosis', rx.diagnosis || '-', '', ''],
        ],
        theme: 'grid',
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30 }, 2: { fontStyle: 'bold', cellWidth: 24 } },
        bodyStyles: { fontSize: 10 },
    });
    y = doc.lastAutoTable.finalY + 8;

    // Vitals (only if any field is filled)
    const v = vitalsData || {};
    const hasVitals = Object.values(v).some(val => val);
    if (hasVitals) {
        if (y > 270) {
            doc.addPage();
            y = template ? (template.headerHeight || 50) : 20;
            if (bgBase64) doc.addImage(bgBase64, 'PNG', 0, 0, pageW, pageH);
        }
        doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(33, 37, 41);
        doc.text('Vitals', leftM, y); y += 5;
        const vitalsRow = [
            v.weight ? `Wt: ${v.weight} kg` : '',
            v.height ? `Ht: ${v.height} cm` : '',
            v.bmi ? `BMI: ${v.bmi}` : '',
            v.bp ? `BP: ${v.bp} mmHg` : '',
            v.temperature ? `Temp: ${v.temperature}°F` : '',
            v.pulse ? `Pulse: ${v.pulse} bpm` : '',
            v.spo2 ? `SpO₂: ${v.spo2}%` : '',
            v.rr ? `RR: ${v.rr}/min` : '',
        ].filter(Boolean);
        autoTable(doc, {
            startY: y,
            margin: { left: leftM, right: rightM },
            body: [vitalsRow],
            theme: 'grid',
            bodyStyles: { fontSize: 9, cellPadding: 3 },
            headStyles: { fillColor: [14, 165, 233], textColor: 255 },
        });
        y = doc.lastAutoTable.finalY + 8;
    }

    // Medicines
    if (y > 260) {
        doc.addPage();
        y = template ? (template.headerHeight || 50) : 20;
        if (bgBase64) doc.addImage(bgBase64, 'PNG', 0, 0, pageW, pageH);
    }
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(33, 37, 41);
    doc.text('Medicines Prescribed', leftM, y); y += 6;
    if (rx.medicines.length > 0) {
        autoTable(doc, {
            startY: y,
            margin: { left: leftM, right: rightM },
            head: [['#', 'Medicine Name', 'Salt / Generic', 'Dose / Frequency', 'Days']],
            body: rx.medicines.map((m, i) => [i + 1, m.name || m.medicineName || '-', m.saltName || '-', m.dose || m.dosage || m.frequency || '-', m.days || m.duration || '-']),
            theme: 'striped',
            headStyles: { fillColor: [76, 175, 80], textColor: 255 },
            bodyStyles: { fontSize: 10 },
            columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 55 }, 2: { cellWidth: 50 }, 3: { cellWidth: 40 }, 4: { cellWidth: 20 } },
        });
        y = doc.lastAutoTable.finalY + 10;
    } else {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(100);
        doc.text('No medicines prescribed.', leftM + 2, y); y += 8;
    }

    // Lab Tests
    if (y > 260) {
        doc.addPage();
        y = template ? (template.headerHeight || 50) : 20;
        if (bgBase64) doc.addImage(bgBase64, 'PNG', 0, 0, pageW, pageH);
    }
    const labArr = typeof rx.labTests === 'string' ? rx.labTests.split(/(?:,\s*)+(?![^(]*\))/).map(t => t.trim()).filter(Boolean) : (rx.labTests || []);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(33, 37, 41);
    doc.text('Lab Tests Ordered', leftM, y); y += 6;
    if (labArr.length > 0) {
        autoTable(doc, {
            startY: y,
            margin: { left: leftM, right: rightM },
            head: [['#', 'Test Name']],
            body: labArr.map((t, i) => [i + 1, t]),
            theme: 'striped',
            headStyles: { fillColor: [33, 150, 243], textColor: 255 },
            bodyStyles: { fontSize: 10 },
        });
        y = doc.lastAutoTable.finalY + 10;
    } else {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(100);
        doc.text('No lab tests ordered.', leftM + 2, y); y += 8;
    }

    // Notes
    if (rx.notes) {
        if (y > 250) {
            doc.addPage();
            y = template ? (template.headerHeight || 50) : 20;
            if (bgBase64) doc.addImage(bgBase64, 'PNG', 0, 0, pageW, pageH);
        }
        doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(33, 37, 41);
        doc.text('Doctor Notes', leftM, y); y += 6;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60);
        const wrapped = doc.splitTextToSize(rx.notes, 210 - leftM - rightM);
        doc.text(wrapped, leftM + 2, y); y += wrapped.length * 5 + 6;
    }

    const footerH = template ? (template.footerHeight || 30) : 20;
    if (y > (297 - footerH - 10)) {
        doc.addPage();
        y = template ? (template.headerHeight || 50) : 20;
        if (bgBase64) doc.addImage(bgBase64, 'PNG', 0, 0, pageW, pageH);
    }
    y = Math.max(y, 297 - footerH - 15);

    doc.setDrawColor(200); doc.line(leftM, y, 210 - rightM, y); y += 6;
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 210 - rightM, y, { align: 'right' });
    y += 5; doc.setFontSize(8);
    doc.text('This prescription is valid for 30 days from the date of issue.', 105, y, { align: 'center' });
    if (window.confirm("Do you want to download the Prescription Slip PDF?")) {
        doc.save(`Prescription_${pt.patientUid || pt._id}_Token${consulting.tokenNumber}.pdf`);
    }
};

const generateConsolidatedBillPDF = async (patient, patientBills) => {
    const doc = new jsPDF();
    const { template, bgBase64 } = await loadTemplateAndBg('billing_payment');

    const pageW = 210;
    const pageH = 297;

    const pdfFmt = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN')}`;

    const drawBg = () => {
        if (bgBase64) {
            doc.addImage(bgBase64, 'PNG', 0, 0, pageW, pageH);
        }
    };

    drawBg();

    let y = 18;
    const leftM = template ? (template.leftMargin || 15) : 14;
    const rightM = template ? (template.rightMargin || 15) : 14;
    const printW = pageW - leftM - rightM;

    if (template) {
        y = template.headerHeight || 50;
    } else {
        y = pdfHeader(doc, 'Consolidated Patient Bill', [14, 165, 233]);
    }

    // Header text title
    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
    doc.text('CONSOLIDATED PATIENT BILL', leftM, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100);
    doc.text(`Date Generated: ${new Date().toLocaleString('en-IN')}`, pageW - rightM, y, { align: 'right' });
    y += 8;

    // Patient info block
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(leftM, y, printW, 25, 3, 3, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(leftM, y, printW, 25, 3, 3, 'S');

    doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(`Patient: ${patient.name}`, leftM + 6, y + 7);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(100);
    doc.text(`Patient ID: ${patient.patientUid || '-'}`, leftM + 6, y + 13);
    doc.text(`Phone: ${patient.phone || '-'}`, leftM + 6, y + 19);

    doc.text(`Gender: ${patient.gender || '-'}`, pageW - rightM - 60, y + 7);
    doc.text(`Age: ${patient.age || '-'} Yrs`, pageW - rightM - 60, y + 13);
    doc.text(`Blood Group: ${patient.bloodGroup || '-'}`, pageW - rightM - 60, y + 19);
    y += 33;

    let grandTotal = 0;
    let paidTotal = 0;
    let hasDrawnSection = false;

    // Helper: draw section bar
    const drawSectionHeader = (title, color) => {
        doc.setFillColor(...color);
        doc.rect(leftM, y, printW, 7, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text(title, leftM + 4, y + 5);
        y += 8;
    };

    // Helper to check page bounds for tables
    const checkPageBounds = () => {
        const maxContentY = pageH - (template ? (template.footerHeight || 30) : 35);
        if (y > maxContentY) {
            doc.addPage();
            drawBg();
            y = template ? (template.headerHeight || 50) : 20;
        }
    };

    // 1. Consultations
    const appts = patientBills.appointments || [];
    if (appts.length > 0) {
        checkPageBounds();
        drawSectionHeader('CONSULTATIONS & OPD VISITS', [14, 165, 233]);
        hasDrawnSection = true;

        const rows = appts.map(a => {
            const amt = Number(a.amount || 0);
            grandTotal += amt;
            if (a.paymentStatus === 'paid') paidTotal += amt;
            return [
                fmtDate(a.appointmentDate),
                a.serviceName || 'General Consultation',
                a.paymentStatus === 'paid' ? 'Paid' : 'Unpaid',
                pdfFmt(amt)
            ];
        });

        autoTable(doc, {
            startY: y,
            margin: { left: leftM, right: rightM },
            head: [[
                { content: 'Visit Date', halign: 'left' },
                { content: 'Particulars', halign: 'left' },
                { content: 'Status', halign: 'left' },
                { content: 'Amount', halign: 'right' }
            ]],
            body: rows,
            theme: 'striped',
            headStyles: { fillColor: [224, 242, 254], textColor: [14, 165, 233], fontSize: 8 },
            bodyStyles: { fontSize: 8 },
            columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } }
        });
        y = doc.lastAutoTable.finalY + 6;
    }

    // 2. Pharmacy
    const pharms = patientBills.pharmacy || [];
    if (pharms.length > 0) {
        if (hasDrawnSection) {
            doc.addPage();
            drawBg();
            y = template ? (template.headerHeight || 50) : 20;
            hasDrawnSection = false;
        }
        checkPageBounds();
        drawSectionHeader('PHARMACY — DISPENSED MEDICINES', [16, 185, 129]);
        hasDrawnSection = true;

        const rows = pharms.map(o => {
            const amt = Number(o.totalAmount || 0);
            grandTotal += amt;
            if (o.paymentStatus === 'Paid') paidTotal += amt;
            const meds = o.items.map(item => `${item.medicineName} (x${item.quantity})`).join(', ');
            return [
                new Date(o.updatedAt || o.createdAt).toLocaleDateString('en-IN'),
                meds,
                o.paymentStatus === 'Paid' ? 'Paid' : 'Unpaid',
                pdfFmt(amt)
            ];
        });

        autoTable(doc, {
            startY: y,
            margin: { left: leftM, right: rightM },
            head: [[
                { content: 'Date', halign: 'left' },
                { content: 'Medicines', halign: 'left' },
                { content: 'Status', halign: 'left' },
                { content: 'Amount', halign: 'right' }
            ]],
            body: rows,
            theme: 'striped',
            headStyles: { fillColor: [209, 250, 229], textColor: [16, 185, 129], fontSize: 8 },
            bodyStyles: { fontSize: 8 },
            columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } }
        });
        y = doc.lastAutoTable.finalY + 6;
    }

    // 3. Treatment Plans
    const plans = patientBills.plans || [];
    if (plans.length > 0) {
        if (hasDrawnSection) {
            doc.addPage();
            drawBg();
            y = template ? (template.headerHeight || 50) : 20;
            hasDrawnSection = false;
        }
        checkPageBounds();
        drawSectionHeader('ACTIVE & COMPLETED TREATMENT PLANS', [245, 158, 11]);
        hasDrawnSection = true;

        const rows = plans.map(p => {
            const amt = Number(p.totalAmount || 0);
            const paid = Number(p.totalPaid || 0);
            grandTotal += amt;
            paidTotal += paid;
            return [
                p.title,
                `${p.visits.length} visits total`,
                p.status === 'completed' ? 'Completed' : `Active (${pdfFmt(paid)} paid)`,
                pdfFmt(amt)
            ];
        });

        autoTable(doc, {
            startY: y,
            margin: { left: leftM, right: rightM },
            head: [[
                { content: 'Plan Title', halign: 'left' },
                { content: 'Visits Duration', halign: 'left' },
                { content: 'Plan Status', halign: 'left' },
                { content: 'Total Cost', halign: 'right' }
            ]],
            body: rows,
            theme: 'striped',
            headStyles: { fillColor: [254, 243, 199], textColor: [245, 158, 11], fontSize: 8 },
            bodyStyles: { fontSize: 8 },
            columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } }
        });
        y = doc.lastAutoTable.finalY + 6;
    }

    const pendingTotal = grandTotal - paidTotal;

    // Draw totals summary
    const maxContentY = pageH - (template ? (template.footerHeight || 30) : 35);
    if (y > maxContentY - 35) {
        doc.addPage();
        drawBg();
        y = template ? (template.headerHeight || 50) : 20;
    }

    doc.setFillColor(248, 250, 252);
    doc.roundedRect(pageW - rightM - 75, y, 75, 30, 2, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(pageW - rightM - 75, y, 75, 30, 2, 2, 'S');

    doc.setTextColor(71, 85, 105); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text('Total Charges:', pageW - rightM - 70, y + 7);
    doc.text('Paid So Far:', pageW - rightM - 70, y + 14);

    doc.setFont('helvetica', 'bold');
    doc.text(pdfFmt(grandTotal), pageW - rightM - 5, y + 7, { align: 'right' });
    doc.setTextColor(22, 163, 74);
    doc.text(pdfFmt(paidTotal), pageW - rightM - 5, y + 14, { align: 'right' });

    doc.line(pageW - rightM - 70, y + 18, pageW - rightM - 5, y + 18);

    doc.setTextColor(220, 38, 38);
    doc.text('Outstanding:', pageW - rightM - 70, y + 24);
    doc.text(pdfFmt(pendingTotal), pageW - rightM - 5, y + 24, { align: 'right' });

    // Footer spacing check
    const footerH = template ? (template.footerHeight || 30) : 20;
    y = Math.max(y + 35, 297 - footerH - 15);

    doc.setDrawColor(200); doc.line(leftM, y, 210 - rightM, y); y += 6;
    const { issuedBy, hName } = getClinicInfo();
    doc.setFontSize(8); doc.setTextColor(120); doc.setFont('helvetica', 'normal');
    doc.text(`Issued by: ${issuedBy}  |  ${new Date().toLocaleString('en-IN')}`, 105, y, { align: 'center' }); y += 5;
    doc.text(`Thank you for choosing ${hName}`, 105, y, { align: 'center' });

    if (window.confirm("Do you want to download the Consolidated Bill PDF?")) {
        doc.save(`Consolidated_Bill_${patient.patientUid || patient.name}.pdf`);
    }
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';
const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
const todayStr = () => new Date().toISOString().split('T')[0];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ─────────────────────────────────────────────
// Role Modes
// ─────────────────────────────────────────────
const MODES = [
    { id: 'overview', icon: '📊', label: 'Overview', color: '#6366f1', bg: '#eef2ff' },
    { id: 'patients', icon: '👤', label: 'Patients', color: '#0ea5e9', bg: '#f0f9ff' },
    { id: 'doctor', icon: '🩺', label: 'Doctor', color: '#8b5cf6', bg: '#f5f3ff' },
    { id: 'reception', icon: '📋', label: 'Reception', color: '#10b981', bg: '#f0fdf4' },
    { id: 'pharmacy', icon: '💊', label: 'Pharmacy', color: '#f97316', bg: '#fff7ed' },
    { id: 'billing', icon: '💰', label: 'Billing', color: '#f59e0b', bg: '#fffbeb' },
    { id: 'plans', icon: '📅', label: 'Treatment Plans', color: '#0891b2', bg: '#ecfeff' },
    { id: 'templates', icon: '🖼️', label: 'Templates', color: '#7c3aed', bg: '#f5f3ff' },
];

// ─────────────────────────────────────────────
// Root Component
// ─────────────────────────────────────────────
const ClinicDashboard = () => {
    const navigate = useNavigate();
    const today = new Date().toLocaleDateString('en-CA');
    const [mode, setMode] = useState('overview');
    const [preselectedPatient, setPreselectedPatient] = useState(null);
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

    useEffect(() => {
        if (currentUser?.role?.toLowerCase() !== 'hospitaladmin') navigate('/login');
    }, []);

    const goToReception = (patient) => {
        setPreselectedPatient(patient);
        setMode('reception');
    };

    return (
        <div className="clinic-dashboard">
            {/* Role Switcher */}
            <div className="clinic-role-switcher">
                <div className="switcher-label">Mode:</div>
                {MODES.map(m => (
                    <button key={m.id}
                        className={`switcher-btn ${mode === m.id ? 'active' : ''}`}
                        style={mode === m.id ? { background: m.color, color: '#fff', borderColor: m.color } : {}}
                        onClick={() => {
                            if (m.id === 'templates') {
                                navigate('/hospitaladmin/document-templates');
                            } else {
                                setMode(m.id);
                            }
                        }}>
                        <span>{m.icon}</span> {m.label}
                    </button>
                ))}
                <div className="switcher-user">
                    <div className="switcher-avatar">{currentUser?.name?.charAt(0)?.toUpperCase()}</div>
                    <span>{currentUser?.name}</span>
                </div>
            </div>

            <div className="clinic-mode-content">
                {mode === 'overview' && <OverviewMode />}
                {mode === 'patients' && <PatientsMode onBookToken={goToReception} />}
                {mode === 'doctor' && <DoctorMode />}
                {mode === 'reception' && <ReceptionMode preselectedPatient={preselectedPatient} clearPreselected={() => setPreselectedPatient(null)} />}
                {mode === 'pharmacy' && <PharmacyMode />}
                {mode === 'billing' && <BillingMode />}
                {mode === 'plans' && <TreatmentPlanMode />}
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════
// OVERVIEW MODE
// ═══════════════════════════════════════════════════
const OverviewMode = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [config, setConfig] = useState({ defaultFee: 0, defaultServiceName: 'General Consultation', appointmentMode: 'token' });
    const [cfgSaving, setCfgSaving] = useState(false);
    const [cfgMsg, setCfgMsg] = useState('');

    useEffect(() => {
        clinicAPI.getStats()
            .then(r => { if (r.success) setStats(r.stats); })
            .catch(console.error)
            .finally(() => setLoading(false));
        clinicAPI.getConfig().then(r => {
            if (r.success) setConfig({ defaultFee: r.defaultFee ?? 0, defaultServiceName: r.defaultServiceName || 'General Consultation', appointmentMode: r.appointmentMode || 'token' });
        }).catch(() => { });
    }, []);

    const saveConfig = async (e) => {
        e.preventDefault();
        setCfgSaving(true);
        try {
            const r = await clinicAPI.updateConfig(config);
            setCfgMsg(r.success ? '✓ Saved' : (r.message || 'Error'));
        } catch { setCfgMsg('Error saving'); }
        finally { setCfgSaving(false); setTimeout(() => setCfgMsg(''), 3000); }
    };

    if (loading) return <Spinner text="Loading overview..." />;

    const kpis = [
        { label: 'Total Patients', value: stats?.totalPatients ?? 0, sub: `+${stats?.todayPatients ?? 0} today`, icon: '👤', color: '#0ea5e9' },
        { label: "Today's Visits", value: stats?.todayAppointments ?? 0, sub: `${stats?.completedAppointments ?? 0} completed`, icon: '🎟️', color: '#8b5cf6' },
        { label: "Today's Collection", value: fmt(stats?.todayRevenue), sub: 'all paid upfront', icon: '💰', color: '#10b981' },
        { label: 'Total Collection', value: fmt(stats?.totalRevenue), sub: fmt(stats?.monthRevenue) + ' this month', icon: '💵', color: '#f59e0b' },
        { label: 'This Month', value: fmt(stats?.monthRevenue), icon: '📅', color: '#6366f1' },
        { label: 'Treatment Plans', value: fmt(stats?.treatmentPlanRevenue), sub: stats?.treatmentPlanPending ? fmt(stats.treatmentPlanPending) + ' outstanding' : 'No outstanding', icon: '📋', color: '#0891b2' },
    ];

    return (
        <div>
            {/* KPI Row */}
            <div className="clinic-kpi-grid">
                {kpis.map((k, i) => (
                    <div key={i} className="clinic-kpi-card" style={{ borderTop: `4px solid ${k.color}` }}>
                        <div style={{ fontSize: '28px' }}>{k.icon}</div>
                        <div style={{ fontSize: '22px', fontWeight: 800, color: k.color }}>{k.value}</div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{k.label}</div>
                        {k.sub && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{k.sub}</div>}
                    </div>
                ))}
            </div>

            {/* Monthly Revenue Chart */}
            {stats?.monthlyTrend?.length > 0 && (
                <div className="clinic-card" style={{ marginBottom: '16px' }}>
                    <h3 style={{ marginBottom: '16px' }}>📈 Monthly Revenue</h3>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '100px' }}>
                        {stats.monthlyTrend.map((m, i) => {
                            const max = Math.max(...stats.monthlyTrend.map(x => x.revenue));
                            const pct = max > 0 ? (m.revenue / max) * 100 : 0;
                            return (
                                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                    <div style={{ fontSize: '10px', color: '#64748b' }}>{fmt(m.revenue)}</div>
                                    <div style={{ width: '100%', height: `${pct}%`, minHeight: '4px', background: '#6366f1', borderRadius: '4px 4px 0 0', transition: 'height 0.3s' }} />
                                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>{MONTHS[(m._id.month - 1)]}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Recent Appointments */}
            {stats?.recentAppointments?.length > 0 && (
                <div className="clinic-card" style={{ marginBottom: '16px' }}>
                    <h3 style={{ marginBottom: '12px' }}>📋 Recent Appointments</h3>
                    <table className="clinic-table">
                        <thead><tr><th>Token</th><th>Patient</th><th>Date</th><th>Status</th><th>Fee</th><th>Method</th></tr></thead>
                        <tbody>
                            {stats.recentAppointments.map(a => (
                                <tr key={a._id}>
                                    <td><strong style={{ color: '#6366f1' }}>#{a.tokenNumber || '—'}</strong></td>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{a.clinicPatientId?.name || '—'}</div>
                                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{a.clinicPatientId?.patientUid || a.patientId}</div>
                                    </td>
                                    <td style={{ fontSize: '12px' }}>{fmtDate(a.appointmentDate)}</td>
                                    <td><StatusBadge status={a.status} /></td>
                                    <td><strong style={{ color: '#16a34a' }}>{fmt(a.amount)}</strong></td>
                                    <td><span style={{ fontSize: '11px', color: '#64748b' }}>{a.paymentMethod || 'Cash'}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Low Stock Alert */}
            {stats?.lowStockItems?.length > 0 && (
                <div className="clinic-card" style={{ border: '1px solid #fecaca' }}>
                    <h3 style={{ color: '#dc2626', marginBottom: '12px' }}>⚠️ Low Stock Alert</h3>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {stats.lowStockItems.map(item => (
                            <div key={item._id} style={{ background: '#fee2e2', borderRadius: '6px', padding: '6px 12px', fontSize: '13px' }}>
                                <strong>{item.name}</strong> — only <strong style={{ color: '#dc2626' }}>{item.stock}</strong> {item.unit} left
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Clinic Settings */}
            <div className="clinic-card" style={{ marginTop: '16px' }}>
                <h3 style={{ marginBottom: '14px' }}>⚙️ Clinic Settings</h3>
                <form onSubmit={saveConfig} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: '1', minWidth: '140px' }}>
                        <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Default Service Name</label>
                        <input className="clinic-input" value={config.defaultServiceName}
                            onChange={e => setConfig(c => ({ ...c, defaultServiceName: e.target.value }))}
                            placeholder="General Consultation" maxLength={100} />
                    </div>
                    <div style={{ flex: '0 0 120px' }}>
                        <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Default Fee (₹)</label>
                        <input className="clinic-input" type="number" min="0" value={config.defaultFee}
                            onChange={e => setConfig(c => ({ ...c, defaultFee: e.target.value }))} />
                    </div>
                    <div style={{ flex: '0 0 160px' }}>
                        <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Appointment Mode</label>
                        <select className="clinic-input" value={config.appointmentMode}
                            onChange={e => setConfig(c => ({ ...c, appointmentMode: e.target.value }))}>
                            <option value="token">Token (walk-in queue)</option>
                            <option value="slot">Time Slot</option>
                        </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button type="submit" className="clinic-btn-primary" disabled={cfgSaving} style={{ padding: '8px 18px' }}>
                            {cfgSaving ? 'Saving…' : 'Save Settings'}
                        </button>
                        {cfgMsg && <span style={{ fontSize: '13px', color: cfgMsg.startsWith('✓') ? '#16a34a' : '#dc2626' }}>{cfgMsg}</span>}
                    </div>
                </form>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════
// REPORT VIEWER — inline PDF/image panel
// ═══════════════════════════════════════════════════
const getBaseURL = () => {
    if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
    if (typeof window !== 'undefined') {
        const hn = window.location.hostname;
        if (hn === 'localhost' || hn.endsWith('.localhost')) return '';
    }
    return 'https://gatecodexharsh-1.onrender.com';
};
const baseURL = getBaseURL();
const reportURL = (filename) => `${baseURL}/uploads/patient-reports/${encodeURIComponent(filename)}`;

const ReportViewerModal = ({ report, onClose }) => {
    const url = reportURL(report.filename);
    const isPDF = report.mimetype === 'application/pdf';
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9000, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1e293b', padding: '10px 20px', color: '#fff' }}>
                <span style={{ fontWeight: 700, fontSize: '14px' }}>📄 {report.name}</span>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <a href={url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: '12px', color: '#7dd3fc', textDecoration: 'none' }}>Open in new tab ↗</a>
                    <button onClick={onClose}
                        style={{ background: '#ef4444', border: 'none', color: '#fff', borderRadius: '6px', padding: '4px 12px', cursor: 'pointer', fontWeight: 700 }}>✕ Close</button>
                </div>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
                {isPDF ? (
                    <iframe src={url} title={report.name} style={{ width: '100%', height: '100%', border: 'none' }} />
                ) : (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', overflow: 'auto' }}>
                        <img src={url} alt={report.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── Compact report panel used inside DoctorMode ─────────────────────────────
const PatientReportPanel = ({ patientId, patientName }) => {
    const [reports, setReports] = useState([]);
    const [viewReport, setViewReport] = useState(null);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!patientId) return;
        clinicAPI.getPatientHistory(patientId)
            .then(r => { if (r.success) setReports(r.patient?.reports || []); })
            .catch(() => { });
    }, [patientId]);

    if (!patientId) return null;

    return (
        <>
            {viewReport && <ReportViewerModal report={viewReport} onClose={() => setViewReport(null)} />}
            <div style={{ marginBottom: '20px', border: '1px solid #e0e7ff', borderRadius: '10px', overflow: 'hidden' }}>
                <button
                    onClick={() => setOpen(o => !o)}
                    style={{ width: '100%', background: '#eef2ff', border: 'none', padding: '10px 16px', textAlign: 'left', cursor: 'pointer', fontWeight: 600, fontSize: '13px', color: '#4338ca', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>📄 Previous Reports ({reports.length})</span>
                    <span>{open ? '▲' : '▼'}</span>
                </button>
                {open && (
                    <div style={{ background: '#f8faff', padding: '12px 16px' }}>
                        {reports.length === 0 ? (
                            <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>No reports uploaded for {patientName || 'this patient'}.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {reports.map(r => (
                                    <div key={r._id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#fff', border: '1px solid #e0e7ff', borderRadius: '8px', padding: '8px 12px' }}>
                                        <span style={{ fontSize: '20px' }}>{r.mimetype === 'application/pdf' ? '📄' : '🖼️'}</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: '13px', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>{r.uploadedAt ? new Date(r.uploadedAt).toLocaleDateString('en-IN') : ''}</div>
                                        </div>
                                        <button
                                            onClick={() => setViewReport(r)}
                                            style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 12px', fontSize: '12px', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>
                                            View
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
};

// ═══════════════════════════════════════════════════
// PATIENTS MODE
// ═══════════════════════════════════════════════════
const PatientsMode = ({ onBookToken }) => {
    const [tab, setTab] = useState('list');
    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [searching, setSearching] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [patientHistory, setPatientHistory] = useState(null);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [form, setForm] = useState({ name: '', phone: '', email: '', age: '', gender: 'Male', address: '', bloodGroup: '', allergies: '', chronicConditions: '', relatives: [] });
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState({ type: '', text: '' });
    const [justRegistered, setJustRegistered] = useState(null);
    const [regReportFile, setRegReportFile] = useState(null);
    const [regReportName, setRegReportName] = useState('');
    // Reports state
    const [patientReports, setPatientReports] = useState([]);
    const [viewReport, setViewReport] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [reportName, setReportName] = useState('');
    const fileInputRef = useRef(null);
    const today = new Date().toISOString().split('T')[0];

    const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg({ type: '', text: '' }), 6000); };

    const [appointments, setAppointments] = useState([]);

    useEffect(() => {
        setLoading(true);
        const todayStr = new Date().toLocaleDateString('en-CA'); // 'YYYY-MM-DD'
        Promise.all([
            clinicAPI.getPatients(),
            clinicAPI.getAppointments(todayStr)
        ]).then(([pr, ar]) => {
            if (pr.success) setPatients(pr.patients);
            if (ar.success) setAppointments(ar.appointments);
        })
            .catch(e => flash('error', e.response?.data?.message || e.message))
            .finally(() => setLoading(false));
    }, []);

    const handleSearch = async () => {
        if (!search.trim()) {
            setSearching(true);
            clinicAPI.getPatients().then(r => { if (r.success) setPatients(r.patients); }).finally(() => setSearching(false));
            return;
        }
        setSearching(true);
        clinicAPI.getPatients(search).then(r => { if (r.success) setPatients(r.patients); }).finally(() => setSearching(false));
    };

    const openHistory = async (p) => {
        setSelectedPatient(p);
        setLoadingHistory(true);
        setPatientHistory(null);
        setPatientReports([]);
        clinicAPI.getPatientHistory(p._id)
            .then(r => {
                if (r.success) {
                    setPatientHistory(r);
                    setPatientReports(r.patient?.reports || []);
                }
            })
            .catch(console.error)
            .finally(() => setLoadingHistory(false));
    };

    const handleUploadReport = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !selectedPatient) return;
        setUploading(true);
        try {
            const name = reportName.trim() || file.name;
            const r = await clinicAPI.uploadPatientReport(selectedPatient._id, file, name);
            if (r.success) {
                setPatientReports(prev => [...prev, r.report]);
                setReportName('');
                if (fileInputRef.current) fileInputRef.current.value = '';
                flash('success', 'Report uploaded successfully');
            } else flash('error', r.message);
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
        finally { setUploading(false); }
    };

    const handleDeleteReport = async (reportId) => {
        if (!selectedPatient) return;
        if (!window.confirm('Delete this report?')) return;
        try {
            const r = await clinicAPI.deletePatientReport(selectedPatient._id, reportId);
            if (r.success) setPatientReports(prev => prev.filter(rp => rp._id !== reportId));
            else flash('error', r.message);
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const r = await clinicAPI.registerPatient(form);
            if (r.success) {
                if (regReportFile) {
                    try {
                        const rName = regReportName.trim() || regReportFile.name;
                        await clinicAPI.uploadPatientReport(r.patient._id, regReportFile, rName);
                    } catch (uploadErr) {
                        console.error("Failed to upload report on patient registration", uploadErr);
                    }
                }
                if (!r.existing) setPatients(prev => [r.patient, ...prev]);
                setJustRegistered(r.patient);
                setForm({ name: '', phone: '', email: '', age: '', gender: 'Male', address: '', bloodGroup: '', allergies: '', chronicConditions: '', relatives: [] });
                setRegReportFile(null);
                setRegReportName('');
                try { generateRegistrationSlipPDF(r.patient); } catch (pdfErr) { console.error('PDF generation error:', pdfErr); }
            } else flash('error', r.message);
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    // Map patientId → today's active/completed/pending appointment
    const todayApptMap = {};
    appointments.forEach(a => {
        const pid = a.clinicPatientId?._id || a.clinicPatientId;
        if (pid && ['confirmed', 'pending', 'completed'].includes(a.status)) {
            todayApptMap[pid.toString()] = a;
        }
    });

    // Patient detail view
    if (selectedPatient) {
        return (
            <div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button className="clinic-back-btn" style={{ margin: 0 }} onClick={() => { setSelectedPatient(null); setPatientHistory(null); }}>← Back to Patients</button>
                    {todayApptMap[selectedPatient._id] ? (
                        <span style={{
                            background: todayApptMap[selectedPatient._id].status === 'completed' ? '#dcfce7' : '#e0e7ff',
                            color: todayApptMap[selectedPatient._id].status === 'completed' ? '#15803d' : '#4f46e5',
                            padding: '6px 14px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 700
                        }}>
                            {todayApptMap[selectedPatient._id].status === 'completed'
                                ? '✅ Done Today'
                                : `🎟️ Token #${todayApptMap[selectedPatient._id].tokenNumber} Assigned`}
                        </span>
                    ) : (
                        <button className="clinic-btn-primary" style={{ fontSize: '12px', padding: '6px 14px' }} onClick={() => onBookToken(selectedPatient)}>
                            🎟️ Assign Today's Token
                        </button>
                    )}
                </div>
                <div className="clinic-card" style={{ marginTop: '12px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div className="clinic-avatar-lg">{selectedPatient.name?.charAt(0)?.toUpperCase()}</div>
                        <div>
                            <h2 style={{ margin: 0 }}>{selectedPatient.name}</h2>
                            <div style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>
                                <span style={{ background: '#eef2ff', color: '#6366f1', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, fontSize: '12px', marginRight: '8px' }}>{selectedPatient.patientUid}</span>
                                {selectedPatient.phone && `📞 ${selectedPatient.phone}`}
                                {selectedPatient.gender && ` · ${selectedPatient.gender}`}
                                {selectedPatient.age && ` · Age: ${selectedPatient.age} Yrs`}
                            </div>
                            {selectedPatient.address && <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>📍 {selectedPatient.address}</div>}
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '6px', fontSize: '12px' }}>
                                {selectedPatient.bloodGroup && <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>🩸 {selectedPatient.bloodGroup}</span>}
                                {selectedPatient.allergies && <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '4px' }}>⚠️ Allergies: {selectedPatient.allergies}</span>}
                                {selectedPatient.chronicConditions && <span style={{ background: '#f0f9ff', color: '#0369a1', padding: '2px 8px', borderRadius: '4px' }}>🏥 {selectedPatient.chronicConditions}</span>}
                            </div>
                        </div>
                        <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#94a3b8' }}>
                            Registered: {fmtDate(selectedPatient.createdAt)}
                        </div>
                    </div>

                    {/* Relatives */}
                    {selectedPatient.relatives?.length > 0 && (
                        <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #f1f5f9' }}>
                            <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '8px' }}>👨‍👩‍👧 Emergency Contacts</div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {selectedPatient.relatives.map((rel, i) => (
                                    <div key={i} style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '8px 14px', fontSize: '12px' }}>
                                        <div style={{ fontWeight: '700', color: '#0f172a' }}>{rel.name}</div>
                                        {rel.relation && <div style={{ color: '#0369a1', fontSize: '11px' }}>{rel.relation}</div>}
                                        {rel.phone && <div style={{ color: '#475569', marginTop: '2px' }}>📞 {rel.phone}</div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Medical Reports ────────────────────────────────────────── */}
                {viewReport && <ReportViewerModal report={viewReport} onClose={() => setViewReport(null)} />}
                <div className="clinic-card" style={{ marginTop: '12px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                        <h3 style={{ margin: 0 }}>📄 Medical Reports ({patientReports.length})</h3>
                    </div>
                    {/* Upload area */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', padding: '12px' }}>
                        <input
                            className="clinic-input"
                            style={{ flex: 1, minWidth: '140px' }}
                            placeholder="Report name (optional)"
                            value={reportName}
                            onChange={e => setReportName(e.target.value)}
                        />
                        <label style={{ cursor: 'pointer', background: uploading ? '#e2e8f0' : '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontWeight: 600, fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                            {uploading ? 'Uploading...' : '⬆ Upload PDF / Image'}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,image/jpeg,image/png,image/webp"
                                style={{ display: 'none' }}
                                disabled={uploading}
                                onChange={handleUploadReport}
                            />
                        </label>
                        <div style={{ width: '100%', fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Supports PDF, JPG, PNG · max 20 MB</div>
                    </div>
                    {/* Report list */}
                    {patientReports.length === 0 ? (
                        <p style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '12px 0' }}>No reports uploaded yet.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {patientReports.map(r => (
                                <div key={r._id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#fff', border: '1px solid #e0e7ff', borderRadius: '8px', padding: '10px 14px' }}>
                                    <span style={{ fontSize: '22px' }}>{r.mimetype === 'application/pdf' ? '📄' : '🖼️'}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                                            {r.mimetype === 'application/pdf' ? 'PDF Document' : 'Image'} · {r.uploadedAt ? new Date(r.uploadedAt).toLocaleDateString('en-IN') : ''}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            onClick={() => setViewReport(r)}
                                            style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 14px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>
                                            View
                                        </button>
                                        <button
                                            onClick={() => handleDeleteReport(r._id)}
                                            style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {loadingHistory ? <Spinner text="Loading history..." /> : patientHistory ? (
                    <div className="clinic-card">
                        <h3 style={{ marginBottom: '16px' }}>📋 Visit History ({patientHistory.appointments?.length || 0} visits)</h3>
                        {patientHistory.appointments?.length === 0 ? (
                            <p style={{ color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>No visits yet.</p>
                        ) : (
                            <table className="clinic-table">
                                <thead><tr><th>Date</th><th>Token</th><th>Diagnosis</th><th>Medicines</th><th>Status</th><th>Fee</th></tr></thead>
                                <tbody>
                                    {patientHistory.appointments.map(a => (
                                        <tr key={a._id}>
                                            <td style={{ fontSize: '12px' }}>{fmtDate(a.appointmentDate)}<br /><span style={{ color: '#94a3b8' }}>{fmtTime(a.appointmentDate)}</span></td>
                                            <td><strong style={{ color: '#6366f1' }}>#{a.tokenNumber || '—'}</strong></td>
                                            <td style={{ maxWidth: '160px', fontSize: '12px' }}>{a.diagnosis || '—'}</td>
                                            <td style={{ fontSize: '11px', color: '#64748b' }}>
                                                {(a.pharmacy || []).slice(0, 2).map((m, i) => <div key={i}>{m.medicineName || m.name}</div>)}
                                                {(a.pharmacy || []).length > 2 && <div>+{a.pharmacy.length - 2} more</div>}
                                            </td>
                                            <td><StatusBadge status={a.status} /></td>
                                            <td><strong style={{ color: '#16a34a' }}>{fmt(a.amount)}</strong></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                ) : null}
            </div>
        );
    }

    return (
        <div>
            <div className="clinic-sub-tabs">
                {[{ id: 'list', label: `👥 All Patients (${patients.length})` }, { id: 'register', label: '+ Register New' }].map(t => (
                    <button key={t.id} className={`clinic-sub-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
                ))}
            </div>

            {msg.text && <div className={`clinic-msg clinic-msg-${msg.type}`}>{msg.text}</div>}

            {tab === 'list' && (
                <div className="clinic-card">
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                        <input className="clinic-input" style={{ flex: 1 }} placeholder="Search by name, phone or patient ID..."
                            value={search} onChange={e => setSearch(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSearch()} />
                        <button className="clinic-btn-secondary" onClick={handleSearch} disabled={searching}>
                            {searching ? '...' : '🔍 Search'}
                        </button>
                    </div>

                    {loading ? <Spinner /> : patients.length === 0 ? (
                        <Empty text="No patients yet. Register your first patient." />
                    ) : (
                        <table className="clinic-table">
                            <thead><tr><th>Patient ID</th><th>Name</th><th>Phone</th><th>Gender</th><th>Registered</th><th></th></tr></thead>
                            <tbody>
                                {patients.map(p => (
                                    <tr key={p._id} style={{ cursor: 'pointer' }} onClick={() => openHistory(p)}>
                                        <td><span style={{ background: '#eef2ff', color: '#6366f1', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, fontSize: '12px' }}>{p.patientUid}</span></td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div className="clinic-avatar-sm">{p.name?.charAt(0)?.toUpperCase()}</div>
                                                <strong>{p.name}</strong>
                                            </div>
                                        </td>
                                        <td>{p.phone}</td>
                                        <td>{p.gender || '—'}</td>
                                        <td style={{ fontSize: '12px', color: '#94a3b8' }}>{fmtDate(p.createdAt)}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                {todayApptMap[p._id] ? (
                                                    <span style={{
                                                        background: todayApptMap[p._id].status === 'completed' ? '#dcfce7' : '#e0e7ff',
                                                        color: todayApptMap[p._id].status === 'completed' ? '#15803d' : '#4f46e5',
                                                        padding: '4px 10px',
                                                        borderRadius: '6px',
                                                        fontSize: '11px',
                                                        fontWeight: 700
                                                    }}>
                                                        {todayApptMap[p._id].status === 'completed'
                                                            ? '✅ Done'
                                                            : `🎟️ Token #${todayApptMap[p._id].tokenNumber}`}
                                                    </span>
                                                ) : (
                                                    <button className="clinic-btn-primary" style={{ fontSize: '11px', padding: '4px 8px' }}
                                                        onClick={(e) => { e.stopPropagation(); onBookToken(p); }}>
                                                        🎟️ Assign Token
                                                    </button>
                                                )}
                                                <button className="clinic-btn-secondary" style={{ fontSize: '11px', padding: '4px 8px' }}
                                                    onClick={(e) => { e.stopPropagation(); openHistory(p); }}>
                                                    Profile →
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {tab === 'register' && (
                <div className="clinic-card">
                    {justRegistered ? (
                        /* ── Success state ── */
                        <div style={{ textAlign: 'center', padding: '24px 0' }}>
                            <div style={{ fontSize: '48px', marginBottom: '8px' }}>✅</div>
                            <h3 style={{ margin: '0 0 4px' }}>Patient Registered!</h3>
                            <p style={{ color: '#64748b', margin: '0 0 20px' }}>
                                <strong>{justRegistered.name}</strong> · <span style={{ background: '#eef2ff', color: '#6366f1', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, fontSize: '13px' }}>{justRegistered.patientUid}</span> · {justRegistered.phone}
                            </p>
                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                <button className="clinic-btn-primary" style={{ fontSize: '15px', padding: '10px 24px' }}
                                    onClick={() => { onBookToken(justRegistered); }}>
                                    🎟️ Book Token Now
                                </button>
                                <button className="clinic-btn-secondary" onClick={() => { setJustRegistered(null); }}>
                                    + Register Another
                                </button>
                                <button className="clinic-btn-secondary" onClick={() => { setJustRegistered(null); setTab('list'); }}>
                                    View All Patients
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <h3 style={{ marginBottom: '16px' }}>👤 Register New Patient</h3>
                            <form onSubmit={handleRegister} className="clinic-form-grid">
                                <div className="clinic-form-group">
                                    <label>Full Name *</label>
                                    <input className="clinic-input" placeholder="Patient's full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                                </div>
                                <div className="clinic-form-group">
                                    <label>Phone *</label>
                                    <input className="clinic-input" type="tel" placeholder="10-digit mobile number" maxLength={10}
                                        value={form.phone}
                                        onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                                        pattern="[0-9]{10}" title="Enter a valid 10-digit mobile number" required />
                                </div>
                                <div className="clinic-form-group">
                                    <label>Email</label>
                                    <input className="clinic-input" type="email" placeholder="Optional" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                                </div>
                                <div className="clinic-form-group">
                                    <label>Age (Years)</label>
                                    <input className="clinic-input" type="number" min="0" max="120" placeholder="Patient's age" value={form.age} onChange={e => setForm(f => ({ ...f, age: e.target.value }))} />
                                </div>
                                <div className="clinic-form-group">
                                    <label>Gender</label>
                                    <select className="clinic-input" value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
                                        <option>Male</option><option>Female</option><option>Other</option>
                                    </select>
                                </div>
                                <div className="clinic-form-group">
                                    <label>Blood Group</label>
                                    <select className="clinic-input" value={form.bloodGroup} onChange={e => setForm(f => ({ ...f, bloodGroup: e.target.value }))}>
                                        <option value=''>Unknown</option>
                                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(g => <option key={g}>{g}</option>)}
                                    </select>
                                </div>
                                <div className="clinic-form-group" style={{ gridColumn: '1/-1' }}>
                                    <label>Address</label>
                                    <input className="clinic-input" placeholder="Optional" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                                </div>
                                <div className="clinic-form-group" style={{ gridColumn: '1/-1' }}>
                                    <label>Known Allergies</label>
                                    <input className="clinic-input" placeholder="e.g. Penicillin, Dust (optional)" value={form.allergies} onChange={e => setForm(f => ({ ...f, allergies: e.target.value }))} />
                                </div>
                                <div className="clinic-form-group" style={{ gridColumn: '1/-1' }}>
                                    <label>Chronic Conditions</label>
                                    <input className="clinic-input" placeholder="e.g. Diabetes, Hypertension (optional)" value={form.chronicConditions} onChange={e => setForm(f => ({ ...f, chronicConditions: e.target.value }))} />
                                </div>

                                {/* Relatives / Emergency Contacts */}
                                <div style={{ gridColumn: '1/-1', marginTop: '4px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <label style={{ fontWeight: '700', fontSize: '13px', color: '#374151' }}>👨‍👩‍👧 Relatives / Emergency Contacts</label>
                                        <button type="button"
                                            onClick={() => setForm(f => ({ ...f, relatives: [...f.relatives, { name: '', relation: '', phone: '' }] }))}
                                            style={{ fontSize: '12px', padding: '4px 12px', background: '#f0fdf4', border: '1px dashed #86efac', borderRadius: '6px', color: '#16a34a', cursor: 'pointer', fontWeight: '600' }}>
                                            + Add Contact
                                        </button>
                                    </div>
                                    {form.relatives.length === 0 ? (
                                        <div style={{ fontSize: '12px', color: '#94a3b8', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #e2e8f0' }}>
                                            No contacts added. Click "+ Add Contact" to add a relative or emergency contact.
                                        </div>
                                    ) : (
                                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                                <thead>
                                                    <tr style={{ background: '#f1f5f9' }}>
                                                        <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0' }}>Name</th>
                                                        <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0' }}>Relation</th>
                                                        <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0' }}>Phone</th>
                                                        <th style={{ padding: '7px 10px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', width: '40px' }}></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {form.relatives.map((rel, idx) => (
                                                        <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                                            <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                                                <input value={rel.name} onChange={e => setForm(f => { const r = [...f.relatives]; r[idx] = { ...r[idx], name: e.target.value }; return { ...f, relatives: r }; })}
                                                                    placeholder="e.g. Ramesh Kumar"
                                                                    style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '5px 7px', fontSize: '12px', boxSizing: 'border-box' }} />
                                                            </td>
                                                            <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                                                <select value={rel.relation} onChange={e => setForm(f => { const r = [...f.relatives]; r[idx] = { ...r[idx], relation: e.target.value }; return { ...f, relatives: r }; })}
                                                                    style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '5px 7px', fontSize: '12px', boxSizing: 'border-box', background: '#fff' }}>
                                                                    <option value=''>Select...</option>
                                                                    {['Father', 'Mother', 'Spouse', 'Son', 'Daughter', 'Brother', 'Sister', 'Guardian', 'Friend', 'Other'].map(r => <option key={r}>{r}</option>)}
                                                                </select>
                                                            </td>
                                                            <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                                                <input value={rel.phone} onChange={e => setForm(f => { const r = [...f.relatives]; r[idx] = { ...r[idx], phone: e.target.value.replace(/\D/g, '').slice(0, 10) }; return { ...f, relatives: r }; })}
                                                                    placeholder="10-digit number" maxLength={10} type="tel"
                                                                    style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '5px 7px', fontSize: '12px', boxSizing: 'border-box' }} />
                                                            </td>
                                                            <td style={{ padding: '5px 8px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                                                                <button type="button" onClick={() => setForm(f => ({ ...f, relatives: f.relatives.filter((_, i) => i !== idx) }))}
                                                                    style={{ background: '#fee2e2', border: 'none', borderRadius: '4px', color: '#dc2626', width: '24px', height: '24px', cursor: 'pointer', fontSize: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>

                                <div className="clinic-form-group" style={{ gridColumn: '1/-1', borderTop: '1px solid #e2e8f0', paddingTop: '16px', marginTop: '10px' }}>
                                    <label style={{ fontWeight: '700', fontSize: '13px', color: '#6366f1' }}>📋 Previous Hospital Report (Optional)</label>
                                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '8px' }}>
                                        <div style={{ flex: 1, minWidth: '200px' }}>
                                            <input type="file" accept=".pdf,image/*" onChange={e => setRegReportFile(e.target.files[0])} style={{ padding: '6px', fontSize: '13px', width: '100%', border: '1px dashed #6366f1', borderRadius: '6px', background: '#f5f3ff', boxSizing: 'border-box' }} />
                                        </div>
                                        {regReportFile && (
                                            <div style={{ flex: 1, minWidth: '150px' }}>
                                                <input className="clinic-input" placeholder="Friendly name for report (e.g. Previous MRI)" value={regReportName} onChange={e => setRegReportName(e.target.value)} />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div style={{ gridColumn: '1/-1', display: 'flex', gap: '8px' }}>
                                    <button type="submit" className="clinic-btn-primary" disabled={saving}>
                                        {saving ? 'Registering...' : '✅ Register Patient'}
                                    </button>
                                    <button type="button" className="clinic-btn-secondary" onClick={() => setTab('list')}>
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════
// RECEPTION MODE
// ═══════════════════════════════════════════════════
// ── Inline booking form (supports token and slot modes) ────────────────────
const BookTokenForm = ({ patient, onBook, onCancel, flash, mode = 'token', defaultFee = 0, defaultServiceName = 'General Consultation' }) => {
    const isSlotMode = mode === 'slot';
    const [form, setForm] = useState({ amount: defaultFee > 0 ? String(defaultFee) : '', serviceName: defaultServiceName, notes: '', appointmentTime: '', paymentMethod: 'Cash', upiScreenshot: null, cardRef: '', transactionId: '', doctorId: '' });
    const [booking, setBooking] = useState(false);
    const [doctors, setDoctors] = useState([]);
    const [doctorsLoading, setDoctorsLoading] = useState(true);

    useEffect(() => {
        clinicAPI.getDoctors()
            .then(r => {
                if (r.success && r.doctors) {
                    setDoctors(r.doctors);
                    if (r.doctors.length > 0) {
                        setForm(f => ({ ...f, doctorId: r.doctors[0]._id }));
                    }
                }
            })
            .catch(console.error)
            .finally(() => setDoctorsLoading(false));
    }, []);

    const fee = Number(form.amount) || 0;
    const isUpi = form.paymentMethod === 'UPI';
    const isCard = form.paymentMethod === 'Card';
    // Payment method is required when fee > 0. If UPI, screenshot is required.
    const canSubmit = !booking && (fee === 0 || form.paymentMethod) && (!isUpi || form.upiScreenshot) && (!isSlotMode || form.appointmentTime);

    const submit = async (e) => {
        e.preventDefault();
        if (isSlotMode && !form.appointmentTime) { flash('error', 'Please select an appointment time'); return; }
        if (fee > 0 && !form.paymentMethod) { flash('error', 'Select a payment method to collect the fee'); return; }
        if (fee > 0 && isUpi && !form.upiScreenshot) { flash('error', 'UPI Screenshot is required'); return; }
        if (fee > 0 && isUpi && form.transactionId && (form.transactionId.length < 12 || form.transactionId.length > 18)) {
            flash('error', 'Transaction ID must be between 12 and 18 characters');
            return;
        }
        setBooking(true);
        try {
            // Upload UPI screenshot
            let upiScreenshotUrl = null;
            if (isUpi && form.upiScreenshot) {
                const fd = new FormData();
                fd.append('images', form.upiScreenshot);
                try {
                    const ur = await uploadAPI.uploadImages(fd);
                    if (ur.success && ur.urls?.length) upiScreenshotUrl = ur.urls[0];
                } catch (_) {
                    flash('error', 'Failed to upload UPI screenshot. Please try again.');
                    setBooking(false);
                    return;
                }
            }

            const refNumber = isUpi ? form.transactionId : form.cardRef;

            const payload = {
                patientId: patient._id,
                amount: fee,
                serviceName: form.serviceName,
                notes: form.notes,
                paymentMethod: fee > 0 ? form.paymentMethod : 'Free',
                doctorId: form.doctorId,
                ...(refNumber && { cardRef: refNumber }),
                ...(upiScreenshotUrl && { upiScreenshotUrl }),
            };
            if (isSlotMode) payload.appointmentTime = form.appointmentTime;

            const r = await clinicAPI.bookAppointment(payload);
            if (r.success) {
                if (isSlotMode) {
                    flash('success', `✅ Payment collected. Appointment at ${form.appointmentTime} confirmed for ${patient.name}`);
                } else {
                    flash('success', `✅ Payment collected. Token #${r.appointment.tokenNumber} assigned to ${patient.name}`);
                    try { await generateTokenReceiptPDF(patient, r.appointment); } catch (pdfErr) { console.error('PDF generation error:', pdfErr); }
                }
                onBook();
            } else flash('error', r.message);
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
        finally { setBooking(false); }
    };

    // Generate 30-minute time slots 07:00–20:00
    const timeSlots = [];
    for (let h = 7; h <= 20; h++) {
        timeSlots.push(`${String(h).padStart(2, '0')}:00`);
        if (h < 20) timeSlots.push(`${String(h).padStart(2, '0')}:30`);
    }

    const borderColor = isSlotMode ? '#bfdbfe' : '#bbf7d0';
    const bgColor = isSlotMode ? '#eff6ff' : '#f0fdf4';

    return (
        <form onSubmit={submit} style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: '10px', padding: '14px 16px', marginTop: '8px' }}>
            {/* Payment notice */}
            <div style={{ fontSize: '12px', color: '#0369a1', background: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: '6px', padding: '6px 10px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>💰</span>
                <span><strong>Payment is collected upfront.</strong> Token / appointment is confirmed only after fee is paid.</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '2', minWidth: '150px' }}>
                    <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>Service</label>
                    <input className="clinic-input" placeholder="General Consultation" value={form.serviceName}
                        onChange={e => setForm(f => ({ ...f, serviceName: e.target.value }))} />
                </div>                {isSlotMode && (
                    <div style={{ flex: '1', minWidth: '120px' }}>
                        <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>Time Slot *</label>
                        <select className="clinic-input" value={form.appointmentTime} onChange={e => setForm(f => ({ ...f, appointmentTime: e.target.value }))} required>
                            <option value="">Select time…</option>
                            {timeSlots.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                )}

                <div style={{ flex: '1', minWidth: '90px' }}>
                    <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>Fee (₹) *</label>
                    <input className="clinic-input" type="number" min="0" placeholder="0" value={form.amount}
                        onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                </div>

                <div style={{ flex: '1', minWidth: '100px' }}>
                    <label style={{ fontSize: '11px', color: fee > 0 ? '#dc2626' : '#64748b', display: 'block', marginBottom: '3px', fontWeight: fee > 0 ? 700 : 400 }}>
                        Payment Method {fee > 0 ? '*' : ''}
                    </label>
                    <select className="clinic-input" value={form.paymentMethod}
                        onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value, upiScreenshot: null, cardRef: '', transactionId: '' }))}
                        style={{ borderColor: fee > 0 && !form.paymentMethod ? '#dc2626' : '' }}>
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="Card">Card</option>
                    </select>
                </div>

                {/* UPI screenshot upload */}
                {fee > 0 && isUpi && (
                    <>
                        <div style={{ flex: '2', minWidth: '160px' }}>
                            <label style={{ fontSize: '11px', color: '#dc2626', display: 'block', marginBottom: '3px', fontWeight: 'bold' }}>UPI Screenshot *</label>
                            <input type="file" accept="image/*" className="clinic-input" style={{ padding: '4px 6px' }}
                                onChange={e => setForm(f => ({ ...f, upiScreenshot: e.target.files[0] || null }))} required />
                            {form.upiScreenshot && <span style={{ fontSize: '11px', color: '#16a34a' }}>✓ {form.upiScreenshot.name}</span>}
                        </div>
                        <div style={{ flex: '1.5', minWidth: '140px' }}>
                            <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>Transaction ID (optional)</label>
                            <input className="clinic-input" placeholder="12 to 18 digits" minLength={12} maxLength={18} pattern="[a-zA-Z0-9]{12,18}" title="Transaction ID must be between 12 and 18 alphanumeric characters" value={form.transactionId}
                                onChange={e => setForm(f => ({ ...f, transactionId: e.target.value.replace(/[^a-zA-Z0-9]/g, '') }))} />
                        </div>
                    </>
                )}

                {/* Card reference number */}
                {fee > 0 && isCard && (
                    <div style={{ flex: '1', minWidth: '130px' }}>
                        <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>Card Last 4 / Reference</label>
                        <input className="clinic-input" placeholder="e.g. 4242" maxLength={20} value={form.cardRef}
                            onChange={e => setForm(f => ({ ...f, cardRef: e.target.value }))} />
                    </div>
                )}

                <div style={{ flex: '2', minWidth: '140px' }}>
                    <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>Complaint (optional)</label>
                    <input className="clinic-input" placeholder="Reason for visit..." value={form.notes}
                        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                    <button type="submit" className="clinic-btn-primary" disabled={!canSubmit}
                        style={{ whiteSpace: 'nowrap', padding: '8px 16px', opacity: canSubmit ? 1 : 0.6 }}>
                        {booking ? '...' : isSlotMode
                            ? `💰 Pay${fee > 0 ? ` ₹${fee}` : ''} & Book Slot`
                            : `💰 Pay${fee > 0 ? ` ₹${fee}` : ''} & Assign Token`}
                    </button>
                    <button type="button" className="clinic-btn-secondary" onClick={onCancel} style={{ padding: '8px 12px' }}>✕</button>
                </div>
            </div>
        </form>
    );
};

const ReceptionMode = ({ preselectedPatient, clearPreselected }) => {
    const [appointments, setAppointments] = useState([]);
    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [searching, setSearching] = useState(false);
    const [assigningFor, setAssigningFor] = useState(preselectedPatient?._id || null);
    const [msg, setMsg] = useState({ type: '', text: '' });
    // Clinic appointment mode and defaults (fetched from config)
    const [appointmentMode, setAppointmentMode] = useState('token');
    const [defaultFee, setDefaultFee] = useState(0);
    const [defaultServiceName, setDefaultServiceName] = useState('General Consultation');
    // Quick register state
    const [showQuickReg, setShowQuickReg] = useState(false);
    const [qrForm, setQrForm] = useState({ name: '', phone: '', gender: 'Male' });
    const [qrSaving, setQrSaving] = useState(false);
    const [qrReportFile, setQrReportFile] = useState(null);
    const [qrReportName, setQrReportName] = useState('');

    const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg({ type: '', text: '' }), 4000); };
    const today = todayStr();
    const isSlotMode = appointmentMode === 'slot';

    const loadAll = useCallback(() => {
        setLoading(true);
        Promise.all([
            clinicAPI.getPatients(search),
            clinicAPI.getAppointments(today),
        ]).then(([pr, ar]) => {
            if (pr.success) setPatients(pr.patients);
            if (ar.success) setAppointments(ar.appointments);
        }).catch(console.error).finally(() => setLoading(false));
    }, [today]); // eslint-disable-line

    useEffect(() => {
        clinicAPI.getConfig().then(r => {
            if (r.success) {
                setAppointmentMode(r.appointmentMode || 'token');
                setDefaultFee(r.defaultFee ?? 0);
                setDefaultServiceName(r.defaultServiceName || 'General Consultation');
            }
        }).catch(() => { });
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    useEffect(() => {
        if (preselectedPatient) setAssigningFor(preselectedPatient._id);
    }, [preselectedPatient]);

    const handleSearch = () => {
        setSearching(true);
        clinicAPI.getPatients(search)
            .then(r => { if (r.success) setPatients(r.patients); })
            .finally(() => setSearching(false));
    };

    const handleQuickRegister = async (e) => {
        e.preventDefault();
        setQrSaving(true);
        try {
            const r = await clinicAPI.registerPatient(qrForm);
            if (r.success) {
                if (qrReportFile) {
                    try {
                        const rName = qrReportName.trim() || qrReportFile.name;
                        await clinicAPI.uploadPatientReport(r.patient._id, qrReportFile, rName);
                    } catch (uploadErr) {
                        console.error("Failed to upload report on quick patient registration", uploadErr);
                    }
                }
                setPatients(prev => r.existing ? prev : [r.patient, ...prev]);
                setAssigningFor(r.patient._id);
                setShowQuickReg(false);
                setQrForm({ name: '', phone: '', gender: 'Male' });
                setQrReportFile(null);
                setQrReportName('');
                if (clearPreselected) clearPreselected();
                flash('success', `${r.existing ? 'Found' : 'Registered'}: ${r.patient.patientUid} — ${isSlotMode ? 'book an appointment below.' : 'assign a token below.'}`);
            } else flash('error', r.message);
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
        finally { setQrSaving(false); }
    };

    const cancelAppt = async (id) => {
        if (!window.confirm(isSlotMode ? 'Cancel this appointment?' : 'Cancel this token?')) return;
        try {
            await clinicAPI.cancelAppointment(id);
            setAppointments(prev => prev.map(a => a._id === id ? { ...a, status: 'cancelled' } : a));
        } catch (e) { flash('error', e.message); }
    };

    // Map clinicPatientId._id → today's appointment (any status)
    const todayApptMap = {};
    appointments.forEach(a => {
        const pid = a.clinicPatientId?._id || a.clinicPatientId;
        if (pid) todayApptMap[pid.toString()] = a;
    });

    const activeTokens = appointments.filter(a => a.status === 'confirmed' || a.status === 'pending');
    const doneToday = appointments.filter(a => a.status === 'completed');

    // Filter displayList:
    // If there is an active search query, show all matched search results.
    // Otherwise, only show patients that have a token today or are currently being assigned (preselected/newly registered).
    const isSearchingActive = search.trim().length > 0;
    const displayList = patients.filter(p => {
        if (isSearchingActive) return true;
        if (todayApptMap[p._id]) return true;
        if (assigningFor === p._id) return true;
        return false;
    });

    // Sort: patients with today's active token first, sorted serial-wise by token number or appointment time
    displayList.sort((a, b) => {
        const apptA = todayApptMap[a._id];
        const apptB = todayApptMap[b._id];
        const statusA = apptA ? apptA.status : '';
        const statusB = apptB ? apptB.status : '';
        const activeA = ['confirmed', 'pending'].includes(statusA) ? 1 : 0;
        const activeB = ['confirmed', 'pending'].includes(statusB) ? 1 : 0;

        if (activeA !== activeB) {
            return activeB - activeA; // Active first
        }

        if (activeA) {
            if (isSlotMode) {
                const timeA = apptA?.appointmentTime || '';
                const timeB = apptB?.appointmentTime || '';
                return timeA.localeCompare(timeB);
            } else {
                const tokA = apptA?.tokenNumber || 0;
                const tokB = apptB?.tokenNumber || 0;
                return tokA - tokB;
            }
        }
        return 0;
    });

    return (
        <div>
            {msg.text && <div className={`clinic-msg clinic-msg-${msg.type}`}>{msg.text}</div>}

            {/* ── Header + search ── */}
            <div className="clinic-card" style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                        <h3 style={{ margin: 0 }}>📋 Reception — {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</h3>
                        <p style={{ color: '#64748b', fontSize: '12px', margin: '3px 0 0' }}>
                            {activeTokens.length} {isSlotMode ? 'scheduled' : 'in queue'} · {doneToday.length} done today · {patients.length} total patients
                            <span style={{ marginLeft: '8px', background: isSlotMode ? '#dbeafe' : '#fef3c7', color: isSlotMode ? '#1d4ed8' : '#92400e', padding: '1px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>
                                {isSlotMode ? '🕐 Time Slots' : '🎟️ Tokens'}
                            </span>
                        </p>
                    </div>
                    <button className="clinic-btn-secondary" style={{ fontSize: '12px' }} onClick={loadAll}>↻ Refresh</button>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <input className="clinic-input" style={{ flex: 1 }} placeholder="Search patient by name, phone or ID..."
                        value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
                    <button className="clinic-btn-secondary" onClick={handleSearch} disabled={searching}>{searching ? '...' : '🔍'}</button>
                    <button className="clinic-btn-primary" onClick={() => { setShowQuickReg(!showQuickReg); }}
                        style={{ whiteSpace: 'nowrap', padding: '8px 14px', fontSize: '13px' }}>
                        + New Patient
                    </button>
                </div>

                {/* Quick register inline */}
                {showQuickReg && (
                    <div style={{ marginTop: '12px', border: '1px solid #c7d2fe', borderRadius: '10px', padding: '14px 16px', background: '#fafbff' }}>
                        <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '10px', color: '#6366f1' }}>Quick Register New Patient</div>
                        <form onSubmit={handleQuickRegister} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <div style={{ flex: '2', minWidth: '140px' }}>
                                <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>Full Name *</label>
                                <input className="clinic-input" placeholder="Patient name" value={qrForm.name}
                                    onChange={e => setQrForm(f => ({ ...f, name: e.target.value }))} required />
                            </div>
                            <div style={{ flex: '1', minWidth: '130px' }}>
                                <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>Phone (10 digits) *</label>
                                <input className="clinic-input" type="tel" placeholder="10-digit number" maxLength={10}
                                    value={qrForm.phone}
                                    onChange={e => setQrForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                                    pattern="[0-9]{10}" required />
                            </div>
                            <div style={{ flex: '1', minWidth: '100px' }}>
                                <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>Gender</label>
                                <select className="clinic-input" value={qrForm.gender} onChange={e => setQrForm(f => ({ ...f, gender: e.target.value }))}>
                                    <option>Male</option><option>Female</option><option>Other</option>
                                </select>
                            </div>
                            <div style={{ flex: '2', minWidth: '160px' }}>
                                <label style={{ fontSize: '11px', color: '#6366f1', display: 'block', marginBottom: '3px', fontWeight: 'bold' }}>📋 Past Report (Optional)</label>
                                <input type="file" accept=".pdf,image/*" onChange={e => setQrReportFile(e.target.files[0])} style={{ padding: '5px', fontSize: '11px', width: '100%', border: '1px dashed #6366f1', borderRadius: '6px', background: '#f5f3ff', boxSizing: 'border-box' }} />
                            </div>
                            {qrReportFile && (
                                <div style={{ flex: '1', minWidth: '120px' }}>
                                    <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>Report Friendly Name</label>
                                    <input className="clinic-input" placeholder="Ex: MRI, ECG" value={qrReportName} onChange={e => setQrReportName(e.target.value)} style={{ padding: '6px' }} />
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button type="submit" className="clinic-btn-primary" disabled={qrSaving} style={{ whiteSpace: 'nowrap' }}>
                                    {qrSaving ? '...' : isSlotMode ? '✅ Register & Book' : '✅ Register & Assign Token'}
                                </button>
                                <button type="button" className="clinic-btn-secondary" onClick={() => setShowQuickReg(false)}>Cancel</button>
                            </div>
                        </form>
                    </div>
                )}
            </div>

            {/* ── Patient list with inline token assignment ── */}
            {loading ? <Spinner /> : displayList.length === 0 ? (
                <Empty text={search ? "No matches found." : "No patients in today's queue. Search for an existing patient or click '+ New Patient'."} />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {displayList.map(p => {
                        const appt = todayApptMap[p._id];
                        const hasToken = appt && (appt.status === 'confirmed' || appt.status === 'pending');
                        const isDone = appt && appt.status === 'completed';
                        const isExpanding = assigningFor === p._id;

                        return (
                            <div key={p._id} style={{
                                border: hasToken ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                                borderRadius: '10px',
                                padding: '12px 16px',
                                background: hasToken ? '#f0fdf4' : isDone ? '#f8fafc' : '#fff',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div className="clinic-avatar-sm" style={{ flexShrink: 0 }}>{p.name?.charAt(0)?.toUpperCase()}</div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, fontSize: '14px' }}>{p.name}</div>
                                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                                            <span style={{ background: '#eef2ff', color: '#6366f1', padding: '1px 6px', borderRadius: '4px', fontWeight: 700, fontSize: '11px', marginRight: '6px' }}>{p.patientUid}</span>
                                            {p.phone}
                                            {p.gender && ` · ${p.gender}`}
                                            {p.bloodGroup && <span style={{ marginLeft: '6px', background: '#fee2e2', color: '#dc2626', padding: '1px 5px', borderRadius: '3px', fontSize: '11px', fontWeight: 600 }}>🩸 {p.bloodGroup}</span>}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                                        {hasToken && (
                                            <>
                                                {isSlotMode ? (
                                                    <span style={{ background: '#3b82f6', color: '#fff', fontWeight: 800, padding: '4px 12px', borderRadius: '6px', fontSize: '13px' }}>
                                                        🕐 {appt.appointmentTime}
                                                    </span>
                                                ) : (
                                                    <span style={{ background: '#6366f1', color: '#fff', fontWeight: 800, padding: '4px 12px', borderRadius: '6px', fontSize: '14px' }}>
                                                        #{appt.tokenNumber}
                                                    </span>
                                                )}
                                                <StatusBadge status={appt.status} />
                                                <button className="clinic-btn-remove" onClick={() => cancelAppt(appt._id)}>✕</button>
                                            </>
                                        )}
                                        {isDone && <span style={{ background: '#dcfce7', color: '#16a34a', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>✅ Done</span>}
                                        {!hasToken && !isDone && (
                                            <button className="clinic-btn-primary" style={{ fontSize: '12px', padding: '6px 14px', whiteSpace: 'nowrap' }}
                                                onClick={() => setAssigningFor(isExpanding ? null : p._id)}>
                                                {isExpanding ? '✕ Cancel' : isSlotMode ? '🕐 Book Slot' : '🎟️ Assign Token'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {isExpanding && !hasToken && (
                                    <BookTokenForm
                                        patient={p}
                                        mode={appointmentMode}
                                        flash={flash}
                                        defaultFee={defaultFee}
                                        defaultServiceName={defaultServiceName}
                                        onBook={() => { setAssigningFor(null); if (clearPreselected) clearPreselected(); loadAll(); }}
                                        onCancel={() => { setAssigningFor(null); if (clearPreselected) clearPreselected(); }}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════
// MEDICINE TABLE — prescription editor with per-row autocomplete
// ═══════════════════════════════════════════════════
const MedicineTable = ({ rx, setRx, inventory }) => {
    // Track which row has an open suggestion dropdown, and the live search per row
    const [activeRow, setActiveRow] = useState(null); // index of focused row
    const [rowSearch, setRowSearch] = useState({}); // { [idx]: searchString }

    const getSuggestions = (idx) => {
        const q = (rowSearch[idx] ?? (rx.medicines[idx]?.name || rx.medicines[idx]?.medicineName) ?? '').trim().toLowerCase();
        if (!q || q.length < 1) return [];
        return inventory.filter(inv => inv.name.toLowerCase().includes(q)).slice(0, 8);
    };

    const selectSuggestion = (idx, med) => {
        setRx(r => {
            const ms = [...r.medicines];
            ms[idx] = { ...ms[idx], name: med.name, medicineName: med.name };
            return { ...r, medicines: ms };
        });
        setRowSearch(prev => ({ ...prev, [idx]: med.name }));
        setActiveRow(null);
    };

    const handleNameChange = (idx, value) => {
        setRowSearch(prev => ({ ...prev, [idx]: value }));
        setRx(r => { const ms = [...r.medicines]; ms[idx] = { ...ms[idx], name: value }; return { ...r, medicines: ms }; });
        setActiveRow(idx);
    };

    const handleNameBlur = (idx) => {
        // Small delay so click on suggestion registers first
        setTimeout(() => setActiveRow(prev => prev === idx ? null : prev), 150);
    };

    const inputStyle = { width: '100%', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '5px 7px', fontSize: '12px', boxSizing: 'border-box' };

    return (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'visible' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e2e8f0', width: '32%' }}>Medicine Name</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e2e8f0', width: '23%' }}>Salt / Generic</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e2e8f0', width: '25%' }}>Dose / Frequency</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e2e8f0', width: '12%' }}>Days</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e2e8f0', width: '8%' }}></th>
                    </tr>
                </thead>
                <tbody>
                    {rx.medicines.map((m, idx) => {
                        const displayVal = rowSearch[idx] !== undefined ? rowSearch[idx] : (m.name || m.medicineName || '');
                        const suggestions = getSuggestions(idx);
                        const showDropdown = activeRow === idx && suggestions.length > 0;
                        return (
                            <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                {/* Medicine Name with autocomplete dropdown */}
                                <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', position: 'relative', overflow: 'visible' }}>
                                    <input
                                        value={displayVal}
                                        onChange={e => handleNameChange(idx, e.target.value)}
                                        onFocus={() => { setActiveRow(idx); }}
                                        onBlur={() => handleNameBlur(idx)}
                                        placeholder="Type to search medicine…"
                                        style={{ ...inputStyle, borderColor: showDropdown ? '#6366f1' : '#e2e8f0' }}
                                        autoComplete="off"
                                    />
                                    {showDropdown && (
                                        <div style={{
                                            position: 'absolute', top: '100%', left: '8px', right: '8px', zIndex: 999,
                                            background: '#fff', border: '1px solid #6366f1', borderRadius: '6px',
                                            boxShadow: '0 4px 16px rgba(99,102,241,0.15)', overflow: 'hidden',
                                        }}>
                                            {suggestions.map((med, si) => (
                                                <div
                                                    key={med._id}
                                                    onMouseDown={() => selectSuggestion(idx, med)}
                                                    style={{
                                                        padding: '8px 12px', cursor: 'pointer', fontSize: '13px',
                                                        borderBottom: si < suggestions.length - 1 ? '1px solid #f1f5f9' : 'none',
                                                        background: 'transparent',
                                                        display: 'flex', alignItems: 'center', gap: '8px',
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <span style={{ color: '#6366f1', fontSize: '14px' }}>💊</span>
                                                    <div>
                                                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{med.name}</div>
                                                        {med.category && <div style={{ fontSize: '11px', color: '#94a3b8' }}>{med.category} · {med.unit || ''}</div>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </td>
                                <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                    <input
                                        value={m.saltName || ''}
                                        onChange={e => setRx(r => { const ms = [...r.medicines]; ms[idx] = { ...ms[idx], saltName: e.target.value }; return { ...r, medicines: ms }; })}
                                        placeholder="e.g. Paracetamol"
                                        style={inputStyle}
                                    />
                                </td>
                                <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                    <input
                                        value={m.dose || m.dosage || ''}
                                        onChange={e => setRx(r => { const ms = [...r.medicines]; ms[idx] = { ...ms[idx], dose: e.target.value }; return { ...r, medicines: ms }; })}
                                        placeholder="e.g. 1 OD / 1 BD"
                                        style={inputStyle}
                                    />
                                </td>
                                <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                    <input
                                        value={m.days || m.duration || ''}
                                        onChange={e => setRx(r => { const ms = [...r.medicines]; ms[idx] = { ...ms[idx], days: e.target.value }; return { ...r, medicines: ms }; })}
                                        placeholder="e.g. 5"
                                        style={inputStyle}
                                    />
                                </td>
                                <td style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setRx(r => ({ ...r, medicines: r.medicines.filter((_, i) => i !== idx) }));
                                            setRowSearch(prev => {
                                                const next = { ...prev };
                                                delete next[idx];
                                                return next;
                                            });
                                        }}
                                        style={{ background: '#fee2e2', border: 'none', borderRadius: '4px', color: '#dc2626', width: '24px', height: '24px', cursor: 'pointer', fontSize: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                    >×</button>
                                </td>
                            </tr>
                        );
                    })}
                    {rx.medicines.length === 0 && (
                        <tr>
                            <td colSpan={5} style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                                No medicines added. Click "+ Add Row" to start prescribing.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

// ═══════════════════════════════════════════════════
// DOCTOR MODE
// ═══════════════════════════════════════════════════
const DoctorMode = () => {
    const [tab, setTab] = useState('staff'); // 'staff' | 'queue'
    const [staff, setStaff] = useState([]);
    const [staffLoading, setStaffLoading] = useState(true);
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [consulting, setConsulting] = useState(null);
    const [rx, setRx] = useState({ diagnosis: '', notes: '', labTests: '', medicines: [] });
    const [vitals, setVitals] = useState({ weight: '', height: '', bmi: '', bp: '', temperature: '', pulse: '', spo2: '', rr: '' });
    const [showVitals, setShowVitals] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState({ type: '', text: '' });
    const [inventory, setInventory] = useState([]);
    const [analytics, setAnalytics] = useState(null);
    const [patientHistory, setPatientHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

    // Dynamic Staff Add/Delete States
    const [showStaffForm, setShowStaffForm] = useState(false);
    const [staffForm, setStaffForm] = useState({ name: '', email: '', password: '', phone: '', role: 'doctor' });
    const [savingStaff, setSavingStaff] = useState(false);

    const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg({ type: '', text: '' }), 4000); };

    const loadToday = () => {
        setLoading(true);
        clinicAPI.getAppointments(todayStr())
            .then(r => { if (r.success) setAppointments(r.appointments); })
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    const loadStaff = () => {
        setStaffLoading(true);
        clinicAPI.getStaff()
            .then(r => { if (r.success) setStaff(r.staff || []); })
            .catch(console.error)
            .finally(() => setStaffLoading(false));
    };

    const handleCreateStaff = async (e) => {
        e.preventDefault();
        setSavingStaff(true);
        try {
            const res = await clinicAPI.createStaff(staffForm);
            if (res.success) {
                flash('success', res.message || 'Staff member added successfully!');
                setShowStaffForm(false);
                setStaffForm({ name: '', email: '', password: '', phone: '', role: 'doctor' });
                loadStaff();
            } else {
                flash('error', res.message || 'Failed to add staff');
            }
        } catch (err) {
            flash('error', err.response?.data?.message || err.message);
        } finally {
            setSavingStaff(false);
        }
    };

    const handleDeleteStaff = async (id) => {
        if (!window.confirm('Are you sure you want to remove this staff member? This cannot be undone.')) return;
        try {
            const res = await clinicAPI.deleteStaff(id);
            if (res.success) {
                flash('success', 'Staff member removed successfully!');
                loadStaff();
            } else {
                flash('error', res.message || 'Failed to remove staff');
            }
        } catch (err) {
            flash('error', err.response?.data?.message || err.message);
        }
    };

    useEffect(() => {
        loadStaff();
        loadToday();
        clinicAPI.getInventory().then(r => { if (r.success) setInventory(r.inventory || []); }).catch(() => { });
        clinicAPI.getStats().then(r => { if (r.success) setAnalytics(r.stats); }).catch(() => { });
    }, []);

    const openConsult = (appt) => {
        setConsulting(appt);
        setShowHistory(false);
        setPatientHistory([]);
        setShowVitals(true);
        setRx({
            diagnosis: appt.diagnosis || '',
            notes: appt.doctorNotes || '',
            labTests: (appt.labTests || []).join(', '),
            medicines: appt.pharmacy || [],
        });
        setVitals({
            weight: appt.vitals?.weight || '',
            height: appt.vitals?.height || '',
            bmi: appt.vitals?.bmi || '',
            bp: appt.vitals?.bp || '',
            temperature: appt.vitals?.temperature || '',
            pulse: appt.vitals?.pulse || '',
            spo2: appt.vitals?.spo2 || '',
            rr: appt.vitals?.rr || '',
        });
        if (appt.clinicPatientId?._id) {
            setHistoryLoading(true);
            clinicAPI.getPatientHistory(appt.clinicPatientId._id)
                .then(r => { if (r.success) setPatientHistory(r.appointments || []); })
                .catch(() => { })
                .finally(() => setHistoryLoading(false));
        }
    };


    const handleVitalChange = (field, value) => {
        setVitals(prev => {
            const updated = { ...prev, [field]: value };
            if ((field === 'weight' || field === 'height') && updated.weight && updated.height) {
                const hM = parseFloat(updated.height) / 100;
                if (hM > 0) updated.bmi = (parseFloat(updated.weight) / (hM * hM)).toFixed(1);
            }
            return updated;
        });
    };

    const saveConsult = async () => {
        setSaving(true);
        try {
            const labArr = rx.labTests.split(/(?:,\s*)+(?![^(]*\))/).map(t => t.trim()).filter(Boolean);
            const r = await clinicAPI.completeAppointment(consulting._id, {
                diagnosis: rx.diagnosis,
                notes: rx.notes,
                vitals,
                medicines: rx.medicines.filter(m => (m.name || m.medicineName)?.trim()).map(m => ({
                    name: (m.name || m.medicineName || '').trim(),
                    saltName: (m.saltName || '').trim(),
                    dose: (m.dose || m.dosage || '').trim(),
                    days: (m.days || m.duration || '').trim(),
                    medicineName: (m.name || m.medicineName || '').trim(),
                    frequency: (m.dose || m.dosage || '').trim(),
                    duration: (m.days || m.duration || '').trim(),
                })),
                labTests: labArr,
            });
            if (r.success) {
                flash('success', 'Consultation saved. Prescription generated.');
                setConsulting(null);
                loadToday();
                try { await generatePrescriptionSlipPDF(consulting, rx, vitals); } catch (pdfErr) { console.error('PDF generation error:', pdfErr); }
            } else flash('error', r.message);
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    const pending = appointments.filter(a => a.status === 'confirmed' || a.status === 'pending');
    const done = appointments.filter(a => a.status === 'completed');
    const pastVisits = patientHistory.filter(h => h._id !== consulting?._id && h.status === 'completed');

    if (consulting) return (
        <div>
            <button className="clinic-back-btn" onClick={() => setConsulting(null)}>← Back to Queue</button>
            {msg.text && <div className={`clinic-msg clinic-msg-${msg.type}`} style={{ marginTop: '10px' }}>{msg.text}</div>}
            <div className="clinic-card" style={{ marginTop: '12px' }}>
                {/* Patient header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
                    <div className="clinic-avatar-lg">{(consulting.clinicPatientId?.name || '?').charAt(0)}</div>
                    <div>
                        <h3 style={{ margin: 0 }}>{consulting.clinicPatientId?.name || 'Patient'}</h3>
                        <div style={{ fontSize: '13px', color: '#64748b' }}>
                            {consulting.clinicPatientId?.patientUid || consulting.patientId} · Token #{consulting.tokenNumber} · {consulting.serviceName || 'General'}
                            {consulting.clinicPatientId?.gender && ` · ${consulting.clinicPatientId.gender}`}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px', fontSize: '12px' }}>
                            {consulting.clinicPatientId?.bloodGroup && <span style={{ background: '#fee2e2', color: '#dc2626', padding: '1px 7px', borderRadius: '4px', fontWeight: 600 }}>🩸 {consulting.clinicPatientId.bloodGroup}</span>}
                            {consulting.clinicPatientId?.allergies && <span style={{ background: '#fef3c7', color: '#92400e', padding: '1px 7px', borderRadius: '4px' }}>⚠️ {consulting.clinicPatientId.allergies}</span>}
                        </div>
                        {consulting.notes && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Chief complaint: {consulting.notes}</div>}
                        {consulting.clinicPatientId?.relatives?.length > 0 && (
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                                {consulting.clinicPatientId.relatives.map((rel, i) => (
                                    <span key={i} style={{ fontSize: '11px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '4px', padding: '1px 8px', color: '#0369a1' }}>
                                        👤 {rel.name}{rel.relation ? ` (${rel.relation})` : ''}{rel.phone ? ` · ${rel.phone}` : ''}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Past Visits */}
                {historyLoading ? (
                    <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px' }}>Loading visit history...</div>
                ) : pastVisits.length > 0 && (
                    <div style={{ marginBottom: '20px', border: '1px solid #e0e7ff', borderRadius: '10px', overflow: 'hidden' }}>
                        <button
                            onClick={() => setShowHistory(h => !h)}
                            style={{ width: '100%', background: '#eef2ff', border: 'none', padding: '10px 16px', textAlign: 'left', cursor: 'pointer', fontWeight: 600, fontSize: '13px', color: '#4338ca', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>📋 Past Visits ({pastVisits.length})</span>
                            <span>{showHistory ? '▲' : '▼'}</span>
                        </button>
                        {showHistory && (
                            <div style={{ background: '#f8faff', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {pastVisits.map(v => (
                                    <div key={v._id} style={{ borderLeft: '3px solid #a5b4fc', paddingLeft: '12px' }}>
                                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#6366f1' }}>{fmtDate(v.appointmentDate || v.createdAt)}</div>
                                        {v.vitals && Object.values(v.vitals).some(x => x) && (
                                            <div style={{ fontSize: '11px', color: '#0369a1', marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                {v.vitals.weight && <span>Wt: <b>{v.vitals.weight}kg</b></span>}
                                                {v.vitals.bp && <span>BP: <b>{v.vitals.bp}</b></span>}
                                                {v.vitals.temperature && <span>Temp: <b>{v.vitals.temperature}°F</b></span>}
                                                {v.vitals.pulse && <span>Pulse: <b>{v.vitals.pulse}bpm</b></span>}
                                                {v.vitals.spo2 && <span>SpO₂: <b>{v.vitals.spo2}%</b></span>}
                                            </div>
                                        )}
                                        {v.diagnosis && <div style={{ fontSize: '13px', color: '#1e293b', marginTop: '2px' }}><strong>Dx:</strong> {v.diagnosis}</div>}
                                        {v.doctorNotes && <div style={{ fontSize: '12px', color: '#475569' }}><strong>Notes:</strong> {v.doctorNotes}</div>}
                                        {(v.pharmacy || []).length > 0 && (
                                            <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                                                <strong>Rx:</strong> {v.pharmacy.map(m => m.medicineName || m.name).join(', ')}
                                            </div>
                                        )}
                                        {(v.labTests || []).length > 0 && (
                                            <div style={{ fontSize: '12px', color: '#475569' }}><strong>Labs:</strong> {v.labTests.join(', ')}</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Patient Reports — inline viewer for doctor */}
                <PatientReportPanel
                    patientId={consulting.clinicPatientId?._id}
                    patientName={consulting.clinicPatientId?.name}
                />

                {/* Vitals Panel */}
                <div style={{ marginBottom: '20px', border: '1px solid #e0f2fe', borderRadius: '10px', overflow: 'hidden' }}>
                    <button
                        type="button"
                        onClick={() => setShowVitals(v => !v)}
                        style={{ width: '100%', background: '#f0f9ff', border: 'none', padding: '10px 16px', textAlign: 'left', cursor: 'pointer', fontWeight: 700, fontSize: '13px', color: '#0369a1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>🩺 Patient Vitals {Object.values(vitals).some(v => v) ? '✓' : ''}</span>
                        <span>{showVitals ? '▲' : '▼'}</span>
                    </button>
                    {showVitals && (
                        <div style={{ padding: '16px', background: '#fff' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
                                {/* Weight */}
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '4px' }}>⚖️ Weight (kg)</label>
                                    <input className="clinic-input" type="number" placeholder="e.g. 65" value={vitals.weight}
                                        onChange={e => handleVitalChange('weight', e.target.value)} style={{ padding: '7px 10px' }} />
                                </div>
                                {/* Height */}
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '4px' }}>📏 Height (cm)</label>
                                    <input className="clinic-input" type="number" placeholder="e.g. 170" value={vitals.height}
                                        onChange={e => handleVitalChange('height', e.target.value)} style={{ padding: '7px 10px' }} />
                                </div>
                                {/* BMI — auto computed */}
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '4px' }}>🔢 BMI (auto)</label>
                                    <input className="clinic-input" readOnly value={vitals.bmi}
                                        placeholder="Auto-calculated"
                                        style={{ padding: '7px 10px', background: vitals.bmi ? (parseFloat(vitals.bmi) < 18.5 ? '#fef9c3' : parseFloat(vitals.bmi) < 25 ? '#f0fdf4' : parseFloat(vitals.bmi) < 30 ? '#fff7ed' : '#fef2f2') : '#f8fafc', fontWeight: vitals.bmi ? '700' : '400', color: vitals.bmi ? '#0f172a' : '#94a3b8' }} />
                                    {vitals.bmi && (
                                        <div style={{ fontSize: '10px', marginTop: '2px', color: parseFloat(vitals.bmi) < 18.5 ? '#b45309' : parseFloat(vitals.bmi) < 25 ? '#16a34a' : parseFloat(vitals.bmi) < 30 ? '#ea580c' : '#dc2626', fontWeight: '600' }}>
                                            {parseFloat(vitals.bmi) < 18.5 ? 'Underweight' : parseFloat(vitals.bmi) < 25 ? 'Normal' : parseFloat(vitals.bmi) < 30 ? 'Overweight' : 'Obese'}
                                        </div>
                                    )}
                                </div>
                                {/* BP */}
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '4px' }}>💓 BP (mmHg)</label>
                                    <input className="clinic-input" placeholder="e.g. 120/80" value={vitals.bp}
                                        onChange={e => handleVitalChange('bp', e.target.value)} style={{ padding: '7px 10px' }} />
                                </div>
                                {/* Temperature */}
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '4px' }}>🌡️ Temp (°F)</label>
                                    <input className="clinic-input" type="number" step="0.1" placeholder="e.g. 98.6" value={vitals.temperature}
                                        onChange={e => handleVitalChange('temperature', e.target.value)} style={{ padding: '7px 10px' }} />
                                </div>
                                {/* Pulse */}
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '4px' }}>🫀 Pulse (bpm)</label>
                                    <input className="clinic-input" type="number" placeholder="e.g. 72" value={vitals.pulse}
                                        onChange={e => handleVitalChange('pulse', e.target.value)} style={{ padding: '7px 10px' }} />
                                </div>
                                {/* SpO2 */}
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '4px' }}>🫁 SpO₂ (%)</label>
                                    <input className="clinic-input" type="number" placeholder="e.g. 98" value={vitals.spo2}
                                        onChange={e => handleVitalChange('spo2', e.target.value)} style={{ padding: '7px 10px' }} />
                                </div>
                                {/* Respiratory Rate */}
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', display: 'block', marginBottom: '4px' }}>🌬️ Resp. Rate (/min)</label>
                                    <input className="clinic-input" type="number" placeholder="e.g. 16" value={vitals.rr}
                                        onChange={e => handleVitalChange('rr', e.target.value)} style={{ padding: '7px 10px' }} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="clinic-form-grid">
                    <div className="clinic-form-group" style={{ gridColumn: '1/-1' }}>
                        <label>Diagnosis / Chief Complaint</label>
                        <textarea className="clinic-input" rows={2} value={rx.diagnosis}
                            onChange={e => setRx(r => ({ ...r, diagnosis: e.target.value }))}
                            placeholder="e.g. Viral fever, URTI..." />
                    </div>
                    <div className="clinic-form-group" style={{ gridColumn: '1/-1' }}>
                        <label>Doctor Notes / Advice</label>
                        <textarea className="clinic-input" rows={2} value={rx.notes}
                            onChange={e => setRx(r => ({ ...r, notes: e.target.value }))}
                            placeholder="Clinical observations, advice..." />
                    </div>
                    <div className="clinic-form-group" style={{ gridColumn: '1/-1' }}>
                        <label>Lab Tests (comma separated)</label>
                        <input className="clinic-input" value={rx.labTests}
                            onChange={e => setRx(r => ({ ...r, labTests: e.target.value }))}
                            placeholder="CBC, Blood Sugar, Urine Routine" />
                    </div>
                </div>

                {/* Prescription — inline Excel-like table with medicine autocomplete */}
                <div style={{ marginTop: '20px' }}>
                    <h4 style={{ marginBottom: '10px', color: '#1e293b' }}>💊 Prescription</h4>

                    {/* Inline table */}
                    <MedicineTable rx={rx} setRx={setRx} inventory={inventory} />

                    <button
                        type="button"
                        onClick={() => setRx(r => ({ ...r, medicines: [...r.medicines, { name: '', saltName: '', dose: '', days: '' }] }))}
                        style={{ marginTop: '8px', padding: '6px 14px', fontSize: '12px', background: '#f0fdf4', border: '1px dashed #86efac', borderRadius: '6px', color: '#16a34a', cursor: 'pointer', fontWeight: '600' }}
                    >
                        + Add Row
                    </button>
                </div>

                <button className="clinic-btn-primary" style={{ marginTop: '24px', width: '100%', padding: '12px' }} disabled={saving} onClick={saveConsult}>
                    {saving ? 'Saving...' : '✅ Save & Generate Prescription'}
                </button>
            </div>
        </div>
    );

    return (
        <div>
            {msg.text && <div className={`clinic-msg clinic-msg-${msg.type}`}>{msg.text}</div>}

            {/* Tab switcher */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {[{ id: 'staff', label: '👥 Doctor & Staff List' }, { id: 'queue', label: '🩺 Today\'s Queue' }].map(t => (
                    <button key={t.id} className={tab === t.id ? 'clinic-btn-primary' : 'clinic-btn-secondary'}
                        style={{ padding: '8px 18px', fontSize: '13px' }} onClick={() => setTab(t.id)}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Staff List tab */}
            {tab === 'staff' && (
                <div className="clinic-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ margin: 0 }}>👥 Clinic Staff</h3>
                        <button className="clinic-btn-primary" style={{ padding: '6px 14px', fontSize: '13px' }}
                            onClick={() => setShowStaffForm(!showStaffForm)}>
                            {showStaffForm ? 'Cancel' : '+ Add Staff'}
                        </button>
                    </div>

                    {showStaffForm && (
                        <form onSubmit={handleCreateStaff} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                            <h4 style={{ margin: '0 0 12px', color: '#1e293b' }}>Add Staff Login Account</h4>
                            <div className="clinic-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                                <div className="clinic-form-group">
                                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px', display: 'block' }}>Full Name *</label>
                                    <input type="text" className="clinic-input" placeholder="Staff Name" value={staffForm.name}
                                        onChange={e => setStaffForm({ ...staffForm, name: e.target.value })} required />
                                </div>
                                <div className="clinic-form-group">
                                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px', display: 'block' }}>Email *</label>
                                    <input type="email" className="clinic-input" placeholder="staff@clinic.com" value={staffForm.email}
                                        onChange={e => setStaffForm({ ...staffForm, email: e.target.value })} required />
                                </div>
                                <div className="clinic-form-group">
                                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px', display: 'block' }}>Password *</label>
                                    <input type="password" className="clinic-input" placeholder="Password" value={staffForm.password}
                                        onChange={e => setStaffForm({ ...staffForm, password: e.target.value })} required />
                                </div>
                                <div className="clinic-form-group">
                                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px', display: 'block' }}>Phone</label>
                                    <input type="text" className="clinic-input" placeholder="10-digit Phone" maxLength={10} value={staffForm.phone}
                                        onChange={e => setStaffForm({ ...staffForm, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div className="clinic-form-group" style={{ margin: 0, minWidth: '150px' }}>
                                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px', display: 'block' }}>Role *</label>
                                    <select className="clinic-input" value={staffForm.role}
                                        onChange={e => setStaffForm({ ...staffForm, role: e.target.value })}>
                                        <option value="doctor">🩺 Doctor</option>
                                        <option value="receptionist">📋 Receptionist</option>
                                    </select>
                                </div>
                                <button type="submit" className="clinic-btn-primary" disabled={savingStaff} style={{ padding: '8px 20px', alignSelf: 'flex-end' }}>
                                    {savingStaff ? 'Saving...' : '✅ Save Staff'}
                                </button>
                            </div>
                        </form>
                    )}

                    {staffLoading ? <Spinner /> : staff.length === 0 ? (
                        <Empty text="No staff members found for this clinic." />
                    ) : (
                        <table className="clinic-table">
                            <thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Phone</th><th>Joined</th><th style={{ width: '80px', textAlign: 'center' }}>Action</th></tr></thead>
                            <tbody>
                                {staff.map(s => (
                                    <tr key={s._id}>
                                        <td><strong>{s.name}</strong></td>
                                        <td><span style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '4px', padding: '2px 8px', fontSize: '12px', textTransform: 'capitalize' }}>{s.roleName}</span></td>
                                        <td style={{ fontSize: '13px', color: '#64748b' }}>{s.email || '—'}</td>
                                        <td style={{ fontSize: '13px', color: '#64748b' }}>{s.phone || '—'}</td>
                                        <td style={{ fontSize: '12px', color: '#94a3b8' }}>{s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-IN') : '—'}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            <button onClick={() => handleDeleteStaff(s._id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>Remove</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Queue tab */}
            {tab === 'queue' && <>
                {/* Monthly Analytics */}
                {analytics && (
                    <div className="clinic-card" style={{ marginBottom: '16px' }}>
                        <h3 style={{ margin: '0 0 14px', fontSize: '15px' }}>📊 Clinic Performance — {new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
                            {[
                                { label: 'Seen Today', value: analytics.todayAppointments ?? '—', color: '#6366f1' },
                                { label: 'This Month Revenue', value: `₹${(analytics.monthRevenue || 0).toLocaleString('en-IN')}`, color: '#16a34a' },
                                { label: 'Total Patients', value: analytics.totalPatients ?? '—', color: '#0891b2' },
                                { label: 'Completed All Time', value: analytics.completedAppointments ?? '—', color: '#7c3aed' },
                            ].map(s => (
                                <div key={s.label} style={{ background: '#f8fafc', borderRadius: '10px', padding: '14px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: '22px', fontWeight: 800, color: s.color }}>{s.value}</div>
                                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{s.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="clinic-card" style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div>
                            <h3 style={{ margin: 0 }}>🩺 Today's Patients — {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
                            <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>
                                {pending.length} waiting · {done.length} seen today
                            </p>
                        </div>
                        <button className="clinic-btn-secondary" style={{ fontSize: '12px' }} onClick={loadToday}>↻ Refresh</button>
                    </div>

                    {loading ? <Spinner /> : pending.length === 0 ? (
                        <Empty text="No patients in queue. Book tokens from Reception mode." />
                    ) : (
                        <div className="clinic-token-queue">
                            {pending.map(a => (
                                <div key={a._id} className="clinic-token-card">
                                    <div className="token-number">#{a.tokenNumber}</div>
                                    <div className="token-info">
                                        <div style={{ fontWeight: 700, fontSize: '15px' }}>{a.clinicPatientId?.name || '—'}</div>
                                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                                            {a.clinicPatientId?.patientUid || a.patientId} · {a.serviceName || 'General'}
                                            {a.notes && ` · "${a.notes}"`}
                                        </div>
                                    </div>
                                    <button className="clinic-btn-primary" style={{ marginLeft: 'auto', padding: '8px 18px' }} onClick={() => openConsult(a)}>
                                        Start →
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {done.length > 0 && (
                    <div className="clinic-card">
                        <h3 style={{ marginBottom: '12px' }}>✅ Seen Today ({done.length})</h3>
                        <table className="clinic-table">
                            <thead><tr><th>Token</th><th>Patient</th><th>Diagnosis</th><th>Medicines</th></tr></thead>
                            <tbody>
                                {done.map(a => (
                                    <tr key={a._id}>
                                        <td><strong style={{ color: '#6366f1' }}>#{a.tokenNumber}</strong></td>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{a.clinicPatientId?.name || '—'}</div>
                                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>{a.clinicPatientId?.patientUid || a.patientId}</div>
                                        </td>
                                        <td style={{ fontSize: '12px', maxWidth: '140px' }}>{a.diagnosis || '—'}</td>
                                        <td style={{ fontSize: '11px', color: '#64748b' }}>
                                            {(a.pharmacy || []).map((m, i) => <div key={i}>{m.medicineName || m.name}</div>)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </>}
        </div>
    );
};

// ═══════════════════════════════════════════════════
// PHARMACY MODE
// ═══════════════════════════════════════════════════
// Medicine Registry — simple name list for autocomplete in prescriptions.
// No ordering, billing, or stock management. Just a saved medicine list.
const PharmacyMode = () => {
    const [tab, setTab] = useState('orders'); // default to prescription queue
    const [inventory, setInventory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [addForm, setAddForm] = useState({ name: '', category: 'General', unit: 'Tablets', stock: 0, buyingPrice: 0, price: 0 });
    const [adding, setAdding] = useState(false);
    const [search, setSearch] = useState('');
    const [historySearch, setHistorySearch] = useState('');
    const [msg, setMsg] = useState({ type: '', text: '' });

    // Prescription Queue States
    const [orders, setOrders] = useState([]);
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [dispensingId, setDispensingId] = useState(null);
    const [selectedPaymentMethods, setSelectedPaymentMethods] = useState({});
    const [transactionIds, setTransactionIds] = useState({});

    // Inline Editing States
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({ stock: 0, buyingPrice: 0, price: 0 });
    const [savingEdit, setSavingEdit] = useState(false);

    const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg({ type: '', text: '' }), 3000); };

    const setPaymentMethodForOrder = (orderId, method) => {
        setSelectedPaymentMethods(prev => ({ ...prev, [orderId]: method }));
    };
    const setTxIdForOrder = (orderId, val) => {
        setTransactionIds(prev => ({ ...prev, [orderId]: val }));
    };

    const getMedicinePriceInfo = (item) => {
        const unitPrice = item.unitPrice || inventory.find(inv => inv.name.toLowerCase() === item.medicineName.toLowerCase())?.sellingPrice || 0;
        const qty = item.quantity || 10;
        const totalPrice = unitPrice * qty;
        return { unitPrice, totalPrice };
    };

    const loadInventory = () => {
        setLoading(true);
        clinicAPI.getInventory()
            .then(r => { if (r.success) setInventory(r.inventory || []); })
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    const loadOrders = () => {
        setOrdersLoading(true);
        clinicAPI.getPharmacyOrders()
            .then(r => { if (r.success) setOrders(r.orders || []); })
            .catch(console.error)
            .finally(() => setOrdersLoading(false));
    };

    useEffect(() => {
        loadInventory();
        loadOrders();
    }, []);

    const handleDispense = async (orderId, paymentStatus = 'Pending') => {
        setDispensingId(orderId);
        try {
            const r = await clinicAPI.dispenseOrder(orderId, { paymentStatus });
            if (r.success) {
                flash('success', r.message || 'Medicines dispensed successfully!');
                loadOrders();
                loadInventory();
            }
        } catch (e) {
            flash('error', e.response?.data?.message || e.message);
        } finally {
            setDispensingId(null);
        }
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        setAdding(true);
        try {
            const r = await clinicAPI.addInventory({
                name: addForm.name,
                category: addForm.category,
                unit: addForm.unit,
                stock: Number(addForm.stock) || 0,
                buyingPrice: Number(addForm.buyingPrice) || 0,
                sellingPrice: Number(addForm.price) || 0
            });
            if (r.success) {
                setInventory(prev => [...prev, r.item].sort((a, b) => a.name.localeCompare(b.name)));
                setAddForm({ name: '', category: 'General', unit: 'Tablets', stock: 0, buyingPrice: 0, price: 0 });
                setTab('list');
                flash('success', `"${r.item.name}" added to medicine list.`);
            }
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
        finally { setAdding(false); }
    };

    const handleSaveEdit = async (id) => {
        setSavingEdit(true);
        try {
            const r = await clinicAPI.updateInventory(id, {
                stock: Number(editForm.stock) || 0,
                buyingPrice: Number(editForm.buyingPrice) || 0,
                sellingPrice: Number(editForm.price) || 0
            });
            if (r.success) {
                setInventory(prev => prev.map(item => item._id === id ? r.item : item));
                setEditingId(null);
                flash('success', 'Medicine details updated.');
            }
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
        finally { setSavingEdit(false); }
    };

    const filtered = search.trim()
        ? inventory.filter(m => m.name.toLowerCase().includes(search.trim().toLowerCase()) || (m.category || '').toLowerCase().includes(search.trim().toLowerCase()))
        : inventory;

    const CATEGORIES = ['General', 'Antibiotic', 'Analgesic', 'Antacid', 'Vitamin', 'Antifungal', 'Antihistamine', 'Other'];
    const UNITS = ['Tablets', 'Capsules', 'Syrup (ml)', 'Injection', 'Cream/Ointment', 'Drops', 'Other'];

    return (
        <div>
            {/* Info Banner */}
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>💡</span>
                <span>This is your <strong>pharmacy workspace</strong> — dispense prescribed medicines to patients and manage medicine stock list.</span>
            </div>

            <div className="clinic-sub-tabs">
                {[
                    { id: 'orders', label: `📦 Prescription Queue (${orders.filter(o => o.orderStatus !== 'Completed').length})` },
                    { id: 'list', label: `📋 Inventory (${inventory.length})` }
                ].map(t => (
                    <button key={t.id} className={`clinic-sub-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
                ))}
            </div>

            {msg.text && <div className={`clinic-msg clinic-msg-${msg.type}`}>{msg.text}</div>}

            {loading ? <Spinner /> : (
                <>
                    {tab === 'orders' && (
                        <div className="clinic-card">
                            <h3 style={{ marginBottom: '14px' }}>📦 Prescription Queue</h3>
                            {ordersLoading ? <Spinner /> : orders.filter(o => o.orderStatus !== 'Completed').length === 0 ? (
                                <Empty text="No active prescriptions in queue." />
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {orders.filter(o => o.orderStatus !== 'Completed').map(order => {
                                        const isCompleted = order.orderStatus === 'Completed';
                                        return (
                                            <div key={order._id} style={{
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '8px',
                                                padding: '16px',
                                                background: isCompleted ? '#f8fafc' : '#fff',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'stretch',
                                                flexWrap: 'wrap',
                                                gap: '16px'
                                            }}>
                                                <div style={{ flex: '2', minWidth: '280px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                                        <strong style={{ fontSize: '15px', color: '#1e293b' }}>Patient UID: {order.patientId}</strong>
                                                        <span style={{
                                                            fontSize: '11px',
                                                            fontWeight: 600,
                                                            padding: '2px 8px',
                                                            borderRadius: '12px',
                                                            background: isCompleted ? '#dcfce7' : '#fef9c3',
                                                            color: isCompleted ? '#16a34a' : '#a16207'
                                                        }}>
                                                            {order.orderStatus === 'Completed' ? `Dispensed (${order.paymentStatus})` : order.orderStatus}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '10px' }}>
                                                        Prescribed: {new Date(order.createdAt).toLocaleString('en-IN')}
                                                    </div>
                                                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px', minWidth: '320px', marginTop: '10px' }}>
                                                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px' }}>Prescribed Medicines:</span>
                                                        <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: '13px', color: '#334155' }}>
                                                            {order.items.map((item, idx) => {
                                                                const { unitPrice, totalPrice } = getMedicinePriceInfo(item);
                                                                return (
                                                                    <li key={idx} style={{ marginBottom: '6px', display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
                                                                        <span>
                                                                            <strong>{item.medicineName}</strong> {item.frequency ? `(${item.frequency})` : ''}
                                                                            <span style={{ color: '#64748b', fontSize: '11px', marginLeft: '6px' }}>x{item.quantity || 10}</span>
                                                                        </span>
                                                                        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                                                                            ₹{unitPrice} × {item.quantity || 10} = ₹{totalPrice}
                                                                        </span>
                                                                    </li>
                                                                );
                                                            })}
                                                        </ul>
                                                        <div style={{ borderTop: '2px dashed #cbd5e1', marginTop: '10px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <strong style={{ fontSize: '13px', color: '#1e293b' }}>Total Amount to Pay:</strong>
                                                            <strong style={{ fontSize: '15px', color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: '4px' }}>
                                                                ₹{order.items.reduce((sum, item) => sum + getMedicinePriceInfo(item).totalPrice, 0)}
                                                            </strong>
                                                        </div>
                                                    </div>
                                                </div>
                                                {isCompleted ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', minWidth: '240px', borderLeft: '1px solid #cbd5e1', paddingLeft: '16px', flex: '1' }}>
                                                        <span style={{
                                                            background: '#dcfce7',
                                                            color: '#16a34a',
                                                            border: '1px solid #bbf7d0',
                                                            padding: '8px 16px',
                                                            borderRadius: '6px',
                                                            fontWeight: 700,
                                                            fontSize: '13px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '6px'
                                                        }}>
                                                            ✅ Medicine Dispatched
                                                        </span>
                                                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
                                                            Saved in history
                                                        </span>
                                                    </div>
                                                ) : (() => {
                                                    const orderTotal = order.items.reduce((sum, item) => sum + getMedicinePriceInfo(item).totalPrice, 0);
                                                    const currentMethod = selectedPaymentMethods[order._id] || 'Cash';
                                                    const currentTxId = transactionIds[order._id] || '';
                                                    return (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '240px', borderLeft: '1px solid #cbd5e1', paddingLeft: '16px', flex: '1', justifyContent: 'center' }}>
                                                            {orderTotal > 0 ? (
                                                                <>
                                                                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>💳 Payment Method:</div>
                                                                    <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
                                                                        {['Cash', 'UPI', 'Card'].map(m => (
                                                                            <button
                                                                                key={m}
                                                                                type="button"
                                                                                onClick={() => setPaymentMethodForOrder(order._id, m)}
                                                                                style={{
                                                                                    flex: 1,
                                                                                    padding: '6px',
                                                                                    fontSize: '11px',
                                                                                    fontWeight: 600,
                                                                                    border: 'none',
                                                                                    borderRadius: '6px',
                                                                                    cursor: 'pointer',
                                                                                    background: currentMethod === m ? '#fff' : 'transparent',
                                                                                    color: currentMethod === m ? '#6366f1' : '#475569',
                                                                                    boxShadow: currentMethod === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                                                                    transition: 'all 0.2s'
                                                                                }}
                                                                            >
                                                                                {m}
                                                                            </button>
                                                                        ))}
                                                                    </div>

                                                                    {currentMethod === 'UPI' && (
                                                                        <div>
                                                                            <input
                                                                                className="clinic-input"
                                                                                style={{ fontSize: '11px', padding: '6px', marginTop: '4px' }}
                                                                                placeholder="Transaction ID (12-18 digits)"
                                                                                maxLength={18}
                                                                                value={currentTxId}
                                                                                onChange={e => setTxIdForOrder(order._id, e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                                                                            />
                                                                        </div>
                                                                    )}

                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                                                                        <button
                                                                            type="button"
                                                                            className="clinic-btn-primary"
                                                                            disabled={dispensingId === order._id}
                                                                            style={{
                                                                                background: '#16a34a',
                                                                                borderColor: '#16a34a',
                                                                                fontSize: '12px',
                                                                                padding: '8px 12px',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'center',
                                                                                gap: '6px'
                                                                            }}
                                                                            onClick={() => {
                                                                                if (currentMethod === 'UPI' && currentTxId && (currentTxId.length < 12 || currentTxId.length > 18)) {
                                                                                    flash('error', 'Transaction ID must be between 12 and 18 characters');
                                                                                    return;
                                                                                }
                                                                                handleDispense(order._id, 'Paid');
                                                                            }}
                                                                        >
                                                                            💵 Collect ₹{orderTotal} & Dispense
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            className="clinic-btn-secondary"
                                                                            disabled={dispensingId === order._id}
                                                                            style={{
                                                                                fontSize: '12px',
                                                                                padding: '8px 12px',
                                                                                border: '1px solid #cbd5e1',
                                                                                color: '#d97706',
                                                                                background: '#fffbeb',
                                                                                fontWeight: 600
                                                                            }}
                                                                            onClick={() => handleDispense(order._id, 'Pending')}
                                                                        >
                                                                            ⏳ Keep Payment Pending
                                                                        </button>
                                                                    </div>
                                                                </>
                                                            ) : (
                                                                <button
                                                                    className="clinic-btn-primary"
                                                                    style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%' }}
                                                                    disabled={dispensingId === order._id}
                                                                    onClick={() => handleDispense(order._id, 'Paid')}
                                                                >
                                                                    {dispensingId === order._id ? 'Dispensing...' : '💊 Dispense (Free)'}
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}


                    {tab === 'list' && (
                        <div className="clinic-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                <h3 style={{ margin: 0 }}>📋 Inventory</h3>
                            </div>
                            {inventory.length > 0 && (
                                <input
                                    className="clinic-input"
                                    placeholder="Search by name or category…"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    style={{ marginBottom: '12px', maxWidth: '320px' }}
                                />
                            )}
                            {filtered.length === 0 ? (
                                <Empty text={inventory.length === 0 ? 'No medicines added yet. Click "+ Add Medicine" to get started.' : 'No matches found.'} />
                            ) : (
                                <table className="clinic-table">
                                    <thead>
                                        <tr><th>#</th><th>Medicine Name</th><th>Category</th><th>Unit / Form</th><th>Buying Price (₹)</th><th>Selling Price (₹)</th><th>Stock</th><th style={{ width: '130px', textAlign: 'center' }}>Action</th></tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map((m, i) => {
                                            const isEditing = editingId === m._id;
                                            return (
                                                <tr key={m._id}>
                                                    <td style={{ color: '#94a3b8', fontSize: '12px', width: '40px' }}>{i + 1}</td>
                                                    <td><strong style={{ color: '#1e293b' }}>{m.name}</strong></td>
                                                    <td>
                                                        <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>
                                                            {m.category || 'General'}
                                                        </span>
                                                    </td>
                                                    <td style={{ fontSize: '12px', color: '#64748b' }}>{m.unit || '—'}</td>
                                                    <td>
                                                        {isEditing ? (
                                                            <input type="number" className="clinic-input" style={{ width: '80px', padding: '4px' }} value={editForm.buyingPrice}
                                                                onChange={e => setEditForm({ ...editForm, buyingPrice: e.target.value })} />
                                                        ) : (
                                                            `₹${m.buyingPrice || 0}`
                                                        )}
                                                    </td>
                                                    <td>
                                                        {isEditing ? (
                                                            <input type="number" className="clinic-input" style={{ width: '80px', padding: '4px' }} value={editForm.price}
                                                                onChange={e => setEditForm({ ...editForm, price: e.target.value })} />
                                                        ) : (
                                                            `₹${m.sellingPrice || 0}`
                                                        )}
                                                    </td>
                                                    <td>
                                                        {isEditing ? (
                                                            <input type="number" className="clinic-input" style={{ width: '80px', padding: '4px' }} value={editForm.stock}
                                                                onChange={e => setEditForm({ ...editForm, stock: e.target.value })} />
                                                        ) : (
                                                            <span style={
                                                                m.stock <= 0 ? { background: '#fee2e2', color: '#dc2626', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 } :
                                                                    m.stock < 50 ? { background: '#fef3c7', color: '#d97706', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 } :
                                                                        { color: '#16a34a', fontWeight: 600 }
                                                            }>
                                                                {m.stock ?? 0} {m.unit || 'Tablets'}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        {isEditing ? (
                                                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                                                <button className="clinic-btn-primary" style={{ padding: '3px 8px', fontSize: '11px' }} disabled={savingEdit} onClick={() => handleSaveEdit(m._id)}>
                                                                    {savingEdit ? '...' : 'Save'}
                                                                </button>
                                                                <button className="clinic-btn-secondary" style={{ padding: '3px 8px', fontSize: '11px' }} onClick={() => setEditingId(null)}>
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button className="clinic-btn-secondary" style={{ padding: '3px 8px', fontSize: '11px' }}
                                                                onClick={() => {
                                                                    setEditingId(m._id);
                                                                    setEditForm({ stock: m.stock || 0, buyingPrice: m.buyingPrice || 0, price: m.sellingPrice || 0 });
                                                                }}>
                                                                Edit Stock
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {tab === 'add' && (
                        <div className="clinic-card">
                            <h3 style={{ marginBottom: '4px' }}>+ Add Medicine to List</h3>
                            <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 18px' }}>
                                Add medicines your clinic commonly prescribes. Once added, doctors can search and select them instantly while writing prescriptions.
                            </p>
                            <form onSubmit={handleAdd} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', maxWidth: '640px' }}>
                                <div className="clinic-form-group" style={{ gridColumn: '1 / -1' }}>
                                    <label>Medicine Name *</label>
                                    <input
                                        className="clinic-input"
                                        placeholder="e.g. Paracetamol 500mg"
                                        value={addForm.name}
                                        onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                                        required
                                        autoFocus
                                    />
                                    <small style={{ color: '#94a3b8', fontSize: '11px', marginTop: '3px', display: 'block' }}>
                                        Be specific — include strength if relevant (e.g. "Amoxicillin 250mg")
                                    </small>
                                </div>
                                <div className="clinic-form-group">
                                    <label>Category</label>
                                    <select className="clinic-input" value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))}>
                                        {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="clinic-form-group">
                                    <label>Unit / Form</label>
                                    <select className="clinic-input" value={addForm.unit} onChange={e => setAddForm(f => ({ ...f, unit: e.target.value }))}>
                                        {UNITS.map(u => <option key={u}>{u}</option>)}
                                    </select>
                                </div>
                                <div className="clinic-form-group">
                                    <label>Initial Stock Level *</label>
                                    <input
                                        type="number"
                                        className="clinic-input"
                                        placeholder="e.g. 100"
                                        value={addForm.stock}
                                        onChange={e => setAddForm(f => ({ ...f, stock: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="clinic-form-group">
                                    <label>Buying Price (₹) *</label>
                                    <input
                                        type="number"
                                        className="clinic-input"
                                        placeholder="e.g. 10"
                                        value={addForm.buyingPrice}
                                        onChange={e => setAddForm(f => ({ ...f, buyingPrice: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="clinic-form-group">
                                    <label>Selling Price (₹) *</label>
                                    <input
                                        type="number"
                                        className="clinic-input"
                                        placeholder="e.g. 15"
                                        value={addForm.price}
                                        onChange={e => setAddForm(f => ({ ...f, price: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <button type="submit" className="clinic-btn-primary" disabled={adding}>
                                        {adding ? 'Adding…' : '+ Add to List'}
                                    </button>
                                    <button type="button" className="clinic-btn-secondary" onClick={() => { setTab('list'); setAddForm({ name: '', category: 'General', unit: 'Tablets', stock: 0, buyingPrice: 0, price: 0 }); }}>
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════
// TREATMENT PLAN MODE
// ═══════════════════════════════════════════════════
const TreatmentPlanMode = () => {
    const [view, setView] = useState('list');
    const [plans, setPlans] = useState([]);
    const [todayDue, setTodayDue] = useState([]);
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState({ type: '', text: '' });

    const [patients, setPatients] = useState([]);
    const [patSearch, setPatSearch] = useState('');
    const [form, setForm] = useState({
        clinicPatientId: '', title: '', description: '',
        totalAmount: '', totalDurationDays: '', startDate: '', intervalDays: '', numberOfVisits: '',
    });
    const [visits, setVisits] = useState([]);

    const [payModal, setPayModal] = useState(null);
    const [payInput, setPayInput] = useState({ amountPaid: '', paymentMethod: 'Cash', notes: '' });

    const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg({ type: '', text: '' }), 5000); };

    const copyFirstDateToAll = () => {
        if (visits.length > 0) {
            const firstDate = visits[0].scheduledDate;
            setVisits(prev => prev.map(v => ({ ...v, scheduledDate: firstDate })));
        }
    };

    const copyFirstTimeToAll = () => {
        if (visits.length > 0) {
            const firstTime = visits[0].scheduledTime;
            setVisits(prev => prev.map(v => ({ ...v, scheduledTime: firstTime })));
        }
    };

    const loadAll = () => {
        setLoading(true);
        Promise.all([clinicAPI.getTreatmentPlans(), clinicAPI.getTodayDuePlans()])
            .then(([plansR, dueR]) => {
                if (plansR.success) setPlans(plansR.plans);
                if (dueR.success) setTodayDue(dueR.plans);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => { loadAll(); }, []);

    useEffect(() => {
        const n = parseInt(form.numberOfVisits);
        const interval = parseInt(form.intervalDays);
        const start = form.startDate;
        if (!n || !start) return;
        const base = new Date(start);
        setVisits(Array.from({ length: n }, (_, i) => {
            const d = new Date(base);
            d.setDate(d.getDate() + (interval || 0) * i);
            return { visitNumber: i + 1, scheduledDate: d.toISOString().split('T')[0], scheduledTime: '', procedure: '' };
        }));
    }, [form.numberOfVisits, form.intervalDays, form.startDate]);

    const loadPatients = async (search) => {
        try { const r = await clinicAPI.getPatients(search); if (r.success) setPatients(r.patients || []); } catch { }
    };

    const handleCreateSubmit = async () => {
        if (!form.clinicPatientId || !form.title || !form.totalAmount || visits.length === 0)
            return flash('error', 'Patient, title, total amount and at least one visit are required.');
        if (visits.some(v => !v.scheduledDate)) return flash('error', 'All visits must have a scheduled date.');
        setSaving(true);
        try {
            const r = await clinicAPI.createTreatmentPlan({ ...form, visits });
            if (r.success) {
                flash('success', 'Treatment plan created.');
                setPlans(prev => [r.plan, ...prev]);
                setView('list');
                setForm({ clinicPatientId: '', title: '', description: '', totalAmount: '', totalDurationDays: '', startDate: '', intervalDays: '', numberOfVisits: '' });
                setVisits([]);
                setPatSearch('');
            } else flash('error', r.message);
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    const openDetail = async (plan) => {
        try {
            const r = await clinicAPI.getTreatmentPlan(plan._id);
            if (r.success) { setSelectedPlan(r.plan); setView('detail'); }
        } catch { setSelectedPlan(plan); setView('detail'); }
    };

    const handlePay = async () => {
        if (!payModal) return;
        const paid = Number(payInput.amountPaid) || 0;
        if (paid <= 0) return flash('error', 'Enter a valid amount.');
        setSaving(true);
        try {
            const r = await clinicAPI.payVisit(payModal.planId, payModal.visit._id, {
                amountPaid: paid, paymentMethod: payInput.paymentMethod, notes: payInput.notes,
            });
            if (r.success) {
                setSelectedPlan(r.plan);
                setPlans(prev => prev.map(p => p._id === r.plan._id ? r.plan : p));
                setPayModal(null);
                flash('success', `₹${paid.toLocaleString('en-IN')} recorded. Remaining balance: ₹${r.plan.pendingBalance.toLocaleString('en-IN')}`);
            } else flash('error', r.message);
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    const handleComplete = async (planId, visitId) => {
        const plan = selectedPlan;
        const remainingScheduled = plan.visits.filter(v => v.status === 'scheduled' && v._id !== visitId);
        const isLast = remainingScheduled.length === 0;
        if (isLast && plan.pendingBalance > 0) {
            return flash('error', `❌ Cannot close treatment — ₹${plan.pendingBalance.toLocaleString('en-IN')} is still unpaid. Collect full payment before closing the last visit.`);
        }
        if (!window.confirm('Mark this visit as completed?')) return;
        try {
            const r = await clinicAPI.completeVisit(planId, visitId, {});
            if (r.success) {
                setSelectedPlan(r.plan);
                setPlans(prev => prev.map(p => p._id === r.plan._id ? r.plan : p));
                flash('success', r.plan.status === 'completed' ? '🎉 Treatment plan completed!' : 'Visit marked completed.');
            } else flash('error', r.message);
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
    };

    const handleMiss = async (planId, visitId) => {
        if (!window.confirm('Mark this visit as missed?')) return;
        try {
            const r = await clinicAPI.missVisit(planId, visitId);
            if (r.success) {
                setSelectedPlan(r.plan);
                setPlans(prev => prev.map(p => p._id === r.plan._id ? r.plan : p));
                flash('success', 'Visit marked as missed.');
            }
        } catch (e) { flash('error', e.message); }
    };

    const handleCancel = async (planId) => {
        if (!window.confirm('Cancel this treatment plan?')) return;
        try {
            const r = await clinicAPI.cancelTreatmentPlan(planId);
            if (r.success) {
                setPlans(prev => prev.map(p => p._id === planId ? { ...p, status: 'cancelled' } : p));
                if (selectedPlan?._id === planId) setSelectedPlan(prev => ({ ...prev, status: 'cancelled' }));
                flash('success', 'Plan cancelled.');
            }
        } catch (e) { flash('error', e.message); }
    };

    const planStatusColor = { active: '#0891b2', completed: '#16a34a', cancelled: '#dc2626' };
    const visitStatusColor = { scheduled: '#6366f1', completed: '#16a34a', missed: '#dc2626' };

    // ── LIST VIEW ──
    if (view === 'list') return (
        <div>
            {todayDue.length > 0 && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '14px 18px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontWeight: '800', color: '#92400e', fontSize: '14px' }}>🔔 Today's Visits Due</div>
                    {todayDue.map(plan => plan.visits.filter(v => {
                        const d = new Date(v.scheduledDate);
                        return d.toDateString() === new Date().toDateString() && v.status === 'scheduled';
                    }).map(v => (
                        <div key={v._id} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#78350f' }}>
                            <span style={{ fontWeight: '700' }}>📋 {plan.clinicPatientId?.name}</span>
                            <span>— Visit {v.visitNumber} · "{plan.title}"</span>
                            {v.scheduledTime && <span style={{ background: '#fef3c7', padding: '1px 8px', borderRadius: '4px', fontWeight: '700' }}>🕐 {v.scheduledTime}</span>}
                            {plan.pendingBalance > 0 && <span style={{ color: '#dc2626', fontWeight: '700' }}>₹{plan.pendingBalance.toLocaleString('en-IN')} pending</span>}
                            <button onClick={() => openDetail(plan)} style={{ marginLeft: 'auto', fontSize: '11px', padding: '3px 10px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: '700' }}>View Plan</button>
                        </div>
                    )))}
                </div>
            )}

            {msg.text && <div className={`clinic-msg clinic-msg-${msg.type}`}>{msg.text}</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, color: '#0f172a' }}>📅 Treatment Plans</h3>
                <button className="clinic-btn-primary" onClick={() => { setView('create'); setPatients([]); setPatSearch(''); }}>+ New Plan</button>
            </div>

            {loading ? <Spinner /> : plans.length === 0 ? <Empty text="No treatment plans yet." /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {plans.map(plan => {
                        const nextVisit = plan.visits.find(v => v.status === 'scheduled');
                        const pct = plan.totalAmount > 0 ? Math.min(100, Math.round((plan.totalPaid / plan.totalAmount) * 100)) : 0;
                        return (
                            <div key={plan._id} className="clinic-card" style={{ padding: '16px', cursor: 'pointer', borderLeft: `4px solid ${planStatusColor[plan.status] || '#94a3b8'}` }} onClick={() => openDetail(plan)}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                                    <div>
                                        <div style={{ fontWeight: '800', fontSize: '15px', color: '#0f172a' }}>{plan.title}</div>
                                        <div style={{ fontSize: '13px', color: '#475569', marginTop: '2px' }}>👤 {plan.clinicPatientId?.name || '—'} · {plan.clinicPatientId?.patientUid || ''}</div>
                                        {plan.description && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{plan.description}</div>}
                                    </div>
                                    <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px', background: planStatusColor[plan.status] + '20', color: planStatusColor[plan.status], textTransform: 'uppercase' }}>{plan.status}</span>
                                </div>
                                {/* Payment progress bar */}
                                <div style={{ marginTop: '10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>
                                        <span>Paid: <b style={{ color: '#16a34a' }}>₹{plan.totalPaid.toLocaleString('en-IN')}</b> of <b>₹{plan.totalAmount.toLocaleString('en-IN')}</b></span>
                                        <span style={{ color: plan.pendingBalance > 0 ? '#dc2626' : '#16a34a', fontWeight: '700' }}>
                                            {plan.pendingBalance > 0 ? `₹${plan.pendingBalance.toLocaleString('en-IN')} due` : '✓ Fully Paid'}
                                        </span>
                                    </div>
                                    <div style={{ background: '#e2e8f0', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#16a34a' : '#0891b2', borderRadius: '4px', transition: 'width 0.3s' }} />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '16px', marginTop: '8px', flexWrap: 'wrap', fontSize: '12px', color: '#475569' }}>
                                    <span>📋 <b>{plan.visits.filter(v => v.status === 'completed').length}</b>/{plan.visits.length} visits done</span>
                                    {nextVisit && <span style={{ color: '#0891b2' }}>📅 Next: <b>{new Date(nextVisit.scheduledDate).toLocaleDateString('en-IN')}</b>{nextVisit.scheduledTime ? ' · ' + nextVisit.scheduledTime : ''}</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );

    // ── CREATE VIEW ──
    if (view === 'create') return (
        <div>
            <button className="clinic-back-btn" onClick={() => setView('list')}>← Back to Plans</button>
            {msg.text && <div className={`clinic-msg clinic-msg-${msg.type}`} style={{ marginTop: '10px' }}>{msg.text}</div>}
            <div className="clinic-card" style={{ marginTop: '12px' }}>
                <h3 style={{ margin: '0 0 20px', color: '#0f172a' }}>📅 New Treatment Plan</h3>

                {/* Patient Search */}
                <div className="clinic-form-group" style={{ marginBottom: '14px' }}>
                    <label>Patient *</label>
                    <input className="clinic-input" placeholder="Search by name or ID..."
                        value={patSearch}
                        onChange={e => {
                            const val = e.target.value;
                            setPatSearch(val);
                            if (val.trim()) {
                                loadPatients(val);
                            } else {
                                setPatients([]);
                            }
                        }} />
                    {patSearch.trim() && patients.length > 0 && !form.clinicPatientId && (
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', maxHeight: '160px', overflowY: 'auto', marginTop: '4px' }}>
                            {patients.map(p => (
                                <div key={p._id} onClick={() => { setForm(f => ({ ...f, clinicPatientId: p._id })); setPatSearch(`${p.name} (${p.patientUid || p.phone})`); setPatients([]); }}
                                    style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                    <b>{p.name}</b> · {p.patientUid || ''} · {p.phone || ''}
                                </div>
                            ))}
                        </div>
                    )}
                    {form.clinicPatientId && <div style={{ fontSize: '12px', color: '#16a34a', marginTop: '4px' }}>✓ Patient selected. <span style={{ cursor: 'pointer', color: '#dc2626' }} onClick={() => { setForm(f => ({ ...f, clinicPatientId: '' })); setPatSearch(''); }}>Clear</span></div>}
                </div>

                <div className="clinic-form-grid">
                    <div className="clinic-form-group" style={{ gridColumn: '1/-1' }}>
                        <label>Plan Title *</label>
                        <input className="clinic-input" placeholder="e.g. Root Canal, Orthodontic Course..." value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                    </div>
                    <div className="clinic-form-group" style={{ gridColumn: '1/-1' }}>
                        <label>Description / Notes</label>
                        <textarea className="clinic-input" rows={2} placeholder="Brief description..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                    </div>
                    {/* Total Amount — single field for the whole treatment */}
                    <div className="clinic-form-group">
                        <label>💰 Total Treatment Amount (₹) *</label>
                        <input className="clinic-input" type="number" min="1" placeholder="e.g. 5000" value={form.totalAmount} onChange={e => setForm(f => ({ ...f, totalAmount: e.target.value }))} />
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>Patient can pay any amount at any visit. Case closes only when fully paid.</div>
                    </div>
                    <div className="clinic-form-group">
                        <label>Total Duration (days)</label>
                        <input className="clinic-input" type="number" placeholder="e.g. 15" value={form.totalDurationDays} onChange={e => setForm(f => ({ ...f, totalDurationDays: e.target.value }))} />
                    </div>
                    <div className="clinic-form-group">
                        <label>Start Date *</label>
                        <input className="clinic-input" type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
                    </div>
                    <div className="clinic-form-group">
                        <label>Number of Visits *</label>
                        <input className="clinic-input" type="number" min="1" placeholder="e.g. 5" value={form.numberOfVisits} onChange={e => setForm(f => ({ ...f, numberOfVisits: e.target.value }))} />
                    </div>
                    <div className="clinic-form-group">
                        <label>Interval Between Visits (days)</label>
                        <input className="clinic-input" type="number" min="0" placeholder="e.g. 3" value={form.intervalDays} onChange={e => setForm(f => ({ ...f, intervalDays: e.target.value }))} />
                    </div>
                </div>

                {visits.length > 0 && (
                    <div style={{ marginTop: '20px' }}>
                        <h4 style={{ margin: '0 0 10px', color: '#0f172a' }}>Visit Schedule</h4>
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ background: '#f1f5f9' }}>
                                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0', width: '6%' }}>#</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0', width: '22%' }}>
                                            Date
                                        </th>
                                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0', width: '18%' }}>
                                            Time
                                            {visits.length > 1 && (
                                                <button type="button" onClick={copyFirstTimeToAll} style={{ marginLeft: '6px', fontSize: '10px', background: '#cbd5e1', border: 'none', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', color: '#1e293b' }}>
                                                    Copy 1st
                                                </button>
                                            )}
                                        </th>
                                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0' }}>Procedure / Notes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visits.map((v, idx) => (
                                        <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                            <td style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', fontWeight: '700', color: '#6366f1', width: '6%' }}>{v.visitNumber}</td>
                                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', width: '22%' }}>
                                                <input type="date" value={v.scheduledDate}
                                                    onChange={e => setVisits(p => { const a = [...p]; a[idx] = { ...a[idx], scheduledDate: e.target.value }; return a; })}
                                                    style={{ border: '1px solid #e2e8f0', borderRadius: '5px', padding: '4px 6px', fontSize: '12px', width: '100%', boxSizing: 'border-box' }} />
                                            </td>
                                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', width: '18%' }}>
                                                <input type="time" value={v.scheduledTime}
                                                    onChange={e => setVisits(p => { const a = [...p]; a[idx] = { ...a[idx], scheduledTime: e.target.value }; return a; })}
                                                    style={{ border: '1px solid #e2e8f0', borderRadius: '5px', padding: '4px 6px', fontSize: '12px', width: '100%', boxSizing: 'border-box' }} />
                                            </td>
                                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                                <input value={v.procedure}
                                                    onChange={e => setVisits(p => { const a = [...p]; a[idx] = { ...a[idx], procedure: e.target.value }; return a; })}
                                                    placeholder="e.g. Canal cleaning, X-ray..."
                                                    style={{ border: '1px solid #e2e8f0', borderRadius: '5px', padding: '4px 6px', fontSize: '12px', width: '100%', boxSizing: 'border-box' }} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                    <button className="clinic-btn-secondary" onClick={() => setView('list')}>Cancel</button>
                    <button className="clinic-btn-primary" style={{ flex: 1 }} disabled={saving} onClick={handleCreateSubmit}>
                        {saving ? 'Creating...' : '✅ Create Treatment Plan'}
                    </button>
                </div>
            </div>
        </div>
    );

    // ── DETAIL VIEW ──
    if (view === 'detail' && selectedPlan) {
        const isLastScheduled = (visitId) => selectedPlan.visits.filter(v => v.status === 'scheduled' && v._id !== visitId).length === 0;
        return (
            <div>
                <button className="clinic-back-btn" onClick={() => setView('list')}>← Back to Plans</button>
                {msg.text && <div className={`clinic-msg clinic-msg-${msg.type}`} style={{ marginTop: '10px' }}>{msg.text}</div>}

                <div className="clinic-card" style={{ marginTop: '12px' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
                        <div>
                            <h3 style={{ margin: '0 0 4px', color: '#0f172a' }}>{selectedPlan.title}</h3>
                            <div style={{ fontSize: '13px', color: '#64748b' }}>👤 {selectedPlan.clinicPatientId?.name} · {selectedPlan.clinicPatientId?.patientUid || ''} · {selectedPlan.clinicPatientId?.phone || ''}</div>
                            {selectedPlan.description && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>{selectedPlan.description}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: '700', padding: '4px 12px', borderRadius: '20px', background: (planStatusColor[selectedPlan.status] || '#94a3b8') + '20', color: planStatusColor[selectedPlan.status] || '#94a3b8', textTransform: 'uppercase' }}>{selectedPlan.status}</span>
                            {selectedPlan.status === 'active' && <button onClick={() => handleCancel(selectedPlan._id)} style={{ fontSize: '11px', padding: '4px 12px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '700' }}>Cancel Plan</button>}
                        </div>
                    </div>

                    {/* Financial Summary */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                        {[
                            { label: 'Total Amount', value: '₹' + selectedPlan.totalAmount.toLocaleString('en-IN'), color: '#6366f1' },
                            { label: 'Total Paid', value: '₹' + selectedPlan.totalPaid.toLocaleString('en-IN'), color: '#16a34a' },
                            { label: 'Balance Due', value: selectedPlan.pendingBalance > 0 ? '₹' + selectedPlan.pendingBalance.toLocaleString('en-IN') : '✓ Cleared', color: selectedPlan.pendingBalance > 0 ? '#dc2626' : '#16a34a' },
                            { label: 'Visits Done', value: `${selectedPlan.visits.filter(v => v.status === 'completed').length} / ${selectedPlan.visits.length}`, color: '#0891b2' },
                        ].map((s, i) => (
                            <div key={i} style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px', borderTop: `3px solid ${s.color}` }}>
                                <div style={{ fontSize: '18px', fontWeight: '800', color: s.color }}>{s.value}</div>
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{s.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Progress bar */}
                    {selectedPlan.totalAmount > 0 && (
                        <div style={{ marginBottom: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>
                                <span>Payment Progress</span>
                                <span>{Math.min(100, Math.round((selectedPlan.totalPaid / selectedPlan.totalAmount) * 100))}%</span>
                            </div>
                            <div style={{ background: '#e2e8f0', borderRadius: '6px', height: '8px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${Math.min(100, Math.round((selectedPlan.totalPaid / selectedPlan.totalAmount) * 100))}%`, background: selectedPlan.pendingBalance === 0 ? '#16a34a' : '#0891b2', borderRadius: '6px', transition: 'width 0.3s' }} />
                            </div>
                        </div>
                    )}

                    {/* Warning if last visit and balance pending */}
                    {selectedPlan.status === 'active' && selectedPlan.pendingBalance > 0 && selectedPlan.visits.filter(v => v.status === 'scheduled').length === 1 && (
                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: '#dc2626' }}>
                            ⚠️ <b>Last visit remaining.</b> Patient must pay ₹{selectedPlan.pendingBalance.toLocaleString('en-IN')} before this visit can be closed.
                        </div>
                    )}

                    {/* Visits Table */}
                    <h4 style={{ margin: '0 0 12px', color: '#0f172a' }}>Visit Schedule</h4>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: '#f1f5f9' }}>
                                    {['#', 'Date & Time', 'Procedure', 'Paid This Visit', 'Status', 'Actions'].map(h => (
                                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', fontSize: '12px' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {selectedPlan.visits.map((v, idx) => (
                                    <tr key={v._id} style={{ background: v.status === 'completed' ? '#f0fdf4' : v.status === 'missed' ? '#fff1f2' : idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', fontWeight: '700', color: '#6366f1' }}>{v.visitNumber}</td>
                                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap', fontSize: '12px' }}>
                                            <div style={{ fontWeight: '600' }}>{new Date(v.scheduledDate).toLocaleDateString('en-IN')}</div>
                                            {v.scheduledTime && <div style={{ color: '#64748b', fontSize: '11px' }}>🕐 {v.scheduledTime}</div>}
                                        </td>
                                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', maxWidth: '140px' }}>
                                            <div>{v.procedure || '—'}</div>
                                            {v.notes && <div style={{ color: '#94a3b8', fontSize: '11px' }}>{v.notes}</div>}
                                        </td>
                                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', fontWeight: '600' }}>
                                            {v.amountPaid > 0
                                                ? <span style={{ color: '#16a34a' }}>₹{v.amountPaid.toLocaleString('en-IN')}{v.paymentMethod ? ` · ${v.paymentMethod}` : ''}</span>
                                                : <span style={{ color: '#94a3b8', fontSize: '11px' }}>—</span>}
                                        </td>
                                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
                                            <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px', background: (visitStatusColor[v.status] || '#94a3b8') + '20', color: visitStatusColor[v.status] || '#94a3b8', textTransform: 'uppercase' }}>{v.status}</span>
                                        </td>
                                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
                                            {v.status === 'scheduled' && selectedPlan.status === 'active' && (
                                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                    <button
                                                        onClick={() => { setPayModal({ visit: v, planId: selectedPlan._id }); setPayInput({ amountPaid: '', paymentMethod: 'Cash', notes: '' }); }}
                                                        style={{ fontSize: '11px', padding: '3px 8px', background: '#dcfce7', color: '#16a34a', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '700' }}>
                                                        💵 Pay
                                                    </button>
                                                    <button
                                                        onClick={() => handleComplete(selectedPlan._id, v._id)}
                                                        disabled={isLastScheduled(v._id) && selectedPlan.pendingBalance > 0}
                                                        title={isLastScheduled(v._id) && selectedPlan.pendingBalance > 0 ? `Collect ₹${selectedPlan.pendingBalance.toLocaleString('en-IN')} first` : ''}
                                                        style={{ fontSize: '11px', padding: '3px 8px', background: isLastScheduled(v._id) && selectedPlan.pendingBalance > 0 ? '#f1f5f9' : '#dbeafe', color: isLastScheduled(v._id) && selectedPlan.pendingBalance > 0 ? '#94a3b8' : '#1d4ed8', border: 'none', borderRadius: '4px', cursor: isLastScheduled(v._id) && selectedPlan.pendingBalance > 0 ? 'not-allowed' : 'pointer', fontWeight: '700' }}>
                                                        ✓ Done
                                                    </button>
                                                    <button
                                                        onClick={() => handleMiss(selectedPlan._id, v._id)}
                                                        style={{ fontSize: '11px', padding: '3px 8px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '700' }}>
                                                        ✗ Missed
                                                    </button>
                                                </div>
                                            )}
                                            {v.status === 'completed' && <span style={{ fontSize: '11px', color: '#94a3b8' }}>{v.completedAt ? new Date(v.completedAt).toLocaleDateString('en-IN') : '—'}</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Payment Modal */}
                {payModal && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ background: '#fff', borderRadius: '14px', padding: '28px', width: '420px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
                            <h3 style={{ margin: '0 0 16px', color: '#0f172a' }}>💵 Record Payment — Visit {payModal.visit.visitNumber}</h3>
                            {/* Overall plan balance */}
                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Total Treatment</span><b>₹{selectedPlan.totalAmount.toLocaleString('en-IN')}</b>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                                    <span>Paid so far</span><b style={{ color: '#16a34a' }}>₹{selectedPlan.totalPaid.toLocaleString('en-IN')}</b>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontWeight: '800', color: '#dc2626', fontSize: '14px' }}>
                                    <span>Outstanding Balance</span><span>₹{selectedPlan.pendingBalance.toLocaleString('en-IN')}</span>
                                </div>
                            </div>
                            <div className="clinic-form-group" style={{ marginBottom: '12px' }}>
                                <label>Amount Paying Now (₹) *</label>
                                <input className="clinic-input" type="number" min="1" placeholder={`Up to ₹${selectedPlan.pendingBalance.toLocaleString('en-IN')}`}
                                    value={payInput.amountPaid}
                                    onChange={e => setPayInput(p => ({ ...p, amountPaid: e.target.value }))} />
                                {payInput.amountPaid > 0 && (
                                    <div style={{ fontSize: '12px', marginTop: '4px', color: Number(payInput.amountPaid) >= selectedPlan.pendingBalance ? '#16a34a' : '#f97316', fontWeight: '600' }}>
                                        {Number(payInput.amountPaid) >= selectedPlan.pendingBalance
                                            ? '✓ This will clear the full outstanding balance.'
                                            : `After payment: ₹${Math.max(0, selectedPlan.pendingBalance - Number(payInput.amountPaid)).toLocaleString('en-IN')} still pending.`}
                                    </div>
                                )}
                            </div>
                            <div className="clinic-form-group" style={{ marginBottom: '12px' }}>
                                <label>Payment Method</label>
                                <select className="clinic-input" value={payInput.paymentMethod} onChange={e => setPayInput(p => ({ ...p, paymentMethod: e.target.value }))}>
                                    <option>Cash</option><option>UPI</option><option>Card</option><option>NEFT</option>
                                </select>
                            </div>
                            <div className="clinic-form-group" style={{ marginBottom: '16px' }}>
                                <label>Notes (optional)</label>
                                <input className="clinic-input" placeholder="e.g. Advance, partial..." value={payInput.notes} onChange={e => setPayInput(p => ({ ...p, notes: e.target.value }))} />
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button className="clinic-btn-secondary" style={{ flex: 1 }} onClick={() => setPayModal(null)}>Cancel</button>
                                <button className="clinic-btn-primary" style={{ flex: 1 }} disabled={saving} onClick={handlePay}>
                                    {saving ? 'Saving...' : '✅ Confirm Payment'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return null;
};

// ═══════════════════════════════════════════════════
// BILLING MODE — Collection history and summary
// ═══════════════════════════════════════════════════
const BillingMode = () => {
    const [appointments, setAppointments] = useState([]);
    const [allAppointments, setAllAppointments] = useState([]);
    const [allRawAppointments, setAllRawAppointments] = useState([]);
    const [pharmacyOrders, setPharmacyOrders] = useState([]);
    const [allRawPharmacyOrders, setAllRawPharmacyOrders] = useState([]);
    const [treatmentPlans, setTreatmentPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [patSearch, setPatSearch] = useState('');
    const [billTab, setBillTab] = useState('consultation');

    // Patient bill selection states
    const [selectedBillPatient, setSelectedBillPatient] = useState(null);
    const [billSearch, setBillSearch] = useState('');
    const [billPatients, setBillPatients] = useState([]);
    const [searchingBillPat, setSearchingBillPat] = useState(false);

    // Payment recording states
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [payModal, setPayModal] = useState(null);
    const [payInput, setPayInput] = useState({ amountPaid: '', paymentMethod: 'Cash', notes: '' });
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState({ type: '', text: '' });

    const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg({ type: '', text: '' }), 5000); };

    const loadAll = () => {
        setLoading(true);
        Promise.all([
            clinicAPI.getAppointments(),
            clinicAPI.getStats(),
            clinicAPI.getPharmacyOrders(),
            clinicAPI.getTreatmentPlans(),
        ]).then(([apptR, statsR, pharmacyR, plansR]) => {
            if (apptR.success) {
                setAllRawAppointments(apptR.appointments || []);
                const paid = apptR.appointments.filter(a => a.paymentStatus === 'paid');
                setAllAppointments(paid);
                setAppointments(paid);
            }
            if (statsR.success) setStats(statsR.stats);
            if (pharmacyR.success) {
                setAllRawPharmacyOrders(pharmacyR.orders || []);
                const paidOrders = (pharmacyR.orders || []).filter(o => o.paymentStatus === 'Paid');
                setPharmacyOrders(paidOrders);
            }
            if (plansR.success) {
                setTreatmentPlans(plansR.plans || []);
            }
        }).catch(console.error).finally(() => setLoading(false));
    };

    useEffect(() => {
        loadAll();
    }, []);

    // Search patient logic for consolidated billing
    useEffect(() => {
        if (!billSearch.trim()) { setBillPatients([]); return; }
        setSearchingBillPat(true);
        const delay = setTimeout(() => {
            clinicAPI.getPatients(billSearch)
                .then(r => { if (r.success) setBillPatients(r.patients || []); })
                .catch(console.error)
                .finally(() => setSearchingBillPat(false));
        }, 300);
        return () => clearTimeout(delay);
    }, [billSearch]);

    const filterByPatient = () => {
        if (!patSearch.trim()) { setAppointments(allAppointments); return; }
        const q = patSearch.trim().toLowerCase();
        setAppointments(allAppointments.filter(a =>
            (a.clinicPatientId?.name || '').toLowerCase().includes(q) ||
            (a.clinicPatientId?.patientUid || a.patientId || '').toLowerCase().includes(q)
        ));
    };

    const handlePay = async () => {
        if (!payModal) return;
        const paid = Number(payInput.amountPaid) || 0;
        if (paid <= 0) return flash('error', 'Enter a valid amount.');
        setSaving(true);
        try {
            const r = await clinicAPI.payVisit(payModal.planId, payModal.visit._id, {
                amountPaid: paid, paymentMethod: payInput.paymentMethod, notes: payInput.notes,
            });
            if (r.success) {
                setTreatmentPlans(prev => prev.map(p => p._id === r.plan._id ? r.plan : p));
                if (selectedPlan && selectedPlan._id === r.plan._id) {
                    setSelectedPlan(r.plan);
                }
                setPayModal(null);
                flash('success', `₹${paid.toLocaleString('en-IN')} recorded for Treatment Plan.`);
                clinicAPI.getStats().then(statsR => {
                    if (statsR.success) setStats(statsR.stats);
                });
            } else flash('error', r.message);
        } catch (e) { flash('error', e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    const pharmacyTotalRevenue = pharmacyOrders.reduce((s, o) => s + (o.totalAmount || 0), 0);

    const filteredPharmacy = pharmacyOrders.filter(o =>
        !patSearch.trim() ||
        (o.patientId || '').toLowerCase().includes(patSearch.trim().toLowerCase())
    );

    const filteredPlans = treatmentPlans.filter(p =>
        !patSearch.trim() ||
        (p.clinicPatientId?.name || '').toLowerCase().includes(patSearch.trim().toLowerCase()) ||
        (p.clinicPatientId?.patientUid || '').toLowerCase().includes(patSearch.trim().toLowerCase()) ||
        (p.title || '').toLowerCase().includes(patSearch.trim().toLowerCase())
    );

    // Get consolidated bill details for the selected patient
    const getPatientBillingSummary = (patient) => {
        if (!patient) return null;

        const patAppts = allRawAppointments.filter(a =>
            a.clinicPatientId?._id === patient._id ||
            a.patientId === patient.patientUid
        );

        const patPharmacy = allRawPharmacyOrders.filter(o =>
            o.patientId === patient.patientUid ||
            (o.patientId && patient.patientUid && String(o.patientId).toLowerCase() === String(patient.patientUid).toLowerCase())
        );

        const patPlans = treatmentPlans.filter(p =>
            p.clinicPatientId?._id === patient._id ||
            p.clinicPatientId?.patientUid === patient.patientUid
        );

        return { appointments: patAppts, pharmacy: patPharmacy, plans: patPlans };
    };

    const patientBillData = selectedBillPatient ? getPatientBillingSummary(selectedBillPatient) : null;

    // Calculate totals for consolidated billing
    const getConsolidatedTotals = () => {
        if (!patientBillData) return { grandTotal: 0, paidTotal: 0, outstanding: 0 };
        let grandTotal = 0;
        let paidTotal = 0;

        patientBillData.appointments.forEach(a => {
            const amt = Number(a.amount || 0);
            grandTotal += amt;
            if (a.paymentStatus === 'paid') paidTotal += amt;
        });

        patientBillData.pharmacy.forEach(o => {
            const amt = Number(o.totalAmount || 0);
            grandTotal += amt;
            if (o.paymentStatus === 'Paid') paidTotal += amt;
        });

        patientBillData.plans.forEach(p => {
            grandTotal += Number(p.totalAmount || 0);
            paidTotal += Number(p.totalPaid || 0);
        });

        return { grandTotal, paidTotal, outstanding: grandTotal - paidTotal };
    };

    const billTotals = getConsolidatedTotals();

    // Trigger PDF generation
    const printConsolidatedBill = async () => {
        if (!selectedBillPatient || !patientBillData) return;
        try {
            await generateConsolidatedBillPDF(selectedBillPatient, patientBillData);
        } catch (err) {
            console.error('Failed to generate PDF:', err);
            flash('error', 'Error generating PDF. Please try again.');
        }
    };

    const isLastScheduled = (visitId) => {
        if (!selectedPlan) return false;
        const index = selectedPlan.visits.findIndex(v => v._id === visitId);
        return index === selectedPlan.visits.length - 1;
    };

    const handleComplete = async (planId, visitId) => {
        if (!window.confirm('Mark this visit as completed?')) return;
        try {
            const r = await clinicAPI.completeVisit(planId, visitId);
            if (r.success) {
                setTreatmentPlans(prev => prev.map(p => p._id === r.plan._id ? r.plan : p));
                if (selectedPlan && selectedPlan._id === r.plan._id) setSelectedPlan(r.plan);
                flash('success', 'Visit marked as completed successfully!');
            }
        } catch (e) { flash('error', e.message); }
    };

    const handleMiss = async (planId, visitId) => {
        if (!window.confirm('Mark this visit as missed?')) return;
        try {
            const r = await clinicAPI.missVisit(planId, visitId);
            if (r.success) {
                setTreatmentPlans(prev => prev.map(p => p._id === r.plan._id ? r.plan : p));
                if (selectedPlan && selectedPlan._id === r.plan._id) setSelectedPlan(r.plan);
                flash('success', 'Visit marked as missed.');
            }
        } catch (e) { flash('error', e.message); }
    };

    const visitStatusColor = {
        scheduled: '#3b82f6',
        completed: '#10b981',
        missed: '#ef4444'
    };

    return (
        <div>
            {msg.text && <div className={`clinic-msg clinic-msg-${msg.type}`} style={{ marginBottom: '15px' }}>{msg.text}</div>}

            {/* Collection Summary Strip */}
            {stats && (
                <div className="clinic-kpi-grid" style={{ marginBottom: '20px' }}>
                    {[
                        { label: 'Total Collection', value: fmt(stats.totalRevenue + pharmacyTotalRevenue), icon: '💰', color: '#f59e0b' },
                        { label: "Today's Collection", value: fmt(stats.todayRevenue + (pharmacyOrders.filter(o => new Date(o.updatedAt || o.createdAt).toDateString() === new Date().toDateString()).reduce((s, o) => s + (o.totalAmount || 0), 0))), icon: '📅', color: '#10b981' },
                        { label: 'Pharmacy Revenue', value: fmt(pharmacyTotalRevenue), icon: '💊', color: '#ec4899' },
                        { label: 'Treatment Plans', value: fmt(stats.treatmentPlanRevenue), sub: stats.treatmentPlanPending ? `${fmt(stats.treatmentPlanPending)} outstanding` : 'No outstanding', icon: '📋', color: '#0ea5e9' },
                    ].map((k, i) => (
                        <div key={i} className="clinic-kpi-card" style={{ borderTop: `4px solid ${k.color}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ fontSize: '24px' }}>{k.icon}</div>
                                {k.sub && <div style={{ fontSize: '10px', background: '#fee2e2', color: '#dc2626', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>{k.sub}</div>}
                            </div>
                            <div style={{ fontSize: '20px', fontWeight: 800, color: k.color, marginTop: '8px' }}>{k.value}</div>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>{k.label}</div>
                        </div>
                    ))}
                </div>
            )}

            <div className="clinic-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                    <h3 style={{ margin: 0 }}>🧾 Collection Records</h3>
                    <div className="clinic-sub-tabs" style={{ margin: 0, padding: 0 }}>
                        <button className={`clinic-sub-tab ${billTab === 'consultation' ? 'active' : ''}`} style={{ fontSize: '12px', padding: '4px 12px' }} onClick={() => setBillTab('consultation')}>🩺 Consultation</button>
                        <button className={`clinic-sub-tab ${billTab === 'pharmacy' ? 'active' : ''}`} style={{ fontSize: '12px', padding: '4px 12px' }} onClick={() => setBillTab('pharmacy')}>💊 Pharmacy ({pharmacyOrders.length})</button>
                        <button className={`clinic-sub-tab ${billTab === 'treatment' ? 'active' : ''}`} style={{ fontSize: '12px', padding: '4px 12px' }} onClick={() => setBillTab('treatment')}>📋 Treatment Plans ({treatmentPlans.length})</button>
                        <button className={`clinic-sub-tab ${billTab === 'generate_bill' ? 'active' : ''}`} style={{ fontSize: '12px', padding: '4px 12px' }} onClick={() => setBillTab('generate_bill')}>🧾 Generate Bill</button>
                    </div>
                </div>

                {billTab !== 'generate_bill' && (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                        <input className="clinic-input" style={{ flex: 1 }} placeholder="Search records…"
                            value={patSearch} onChange={e => setPatSearch(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && (billTab === 'consultation' ? filterByPatient() : null)} />
                        {billTab === 'consultation' && (
                            <>
                                <button className="clinic-btn-secondary" onClick={filterByPatient}>Search</button>
                                {patSearch && <button className="clinic-btn-secondary" onClick={() => { setPatSearch(''); setAppointments(allAppointments); }}>✕ Clear</button>}
                            </>
                        )}
                    </div>
                )}

                {loading ? <Spinner /> : billTab === 'consultation' ? (
                    appointments.length === 0 ? (
                        <Empty text="No consultation collection records yet." />
                    ) : (
                        <table className="clinic-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Token / Slot</th>
                                    <th>Patient</th>
                                    <th>Service</th>
                                    <th>Fee</th>
                                    <th>Method</th>
                                    <th>Visit Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {appointments.map(a => (
                                    <tr key={a._id}>
                                        <td style={{ fontSize: '12px' }}>{fmtDate(a.appointmentDate)}</td>
                                        <td>
                                            {a.tokenNumber
                                                ? <strong style={{ color: '#6366f1' }}>#{a.tokenNumber}</strong>
                                                : <span style={{ color: '#3b82f6', fontWeight: 600 }}>🕐 {a.appointmentTime}</span>}
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{a.clinicPatientId?.name || '—'}</div>
                                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>{a.clinicPatientId?.patientUid || a.patientId}</div>
                                        </td>
                                        <td style={{ fontSize: '12px', color: '#64748b' }}>{a.serviceName || 'General'}</td>
                                        <td><strong style={{ color: '#16a34a' }}>{fmt(a.amount)}</strong></td>
                                        <td>
                                            <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 600 }}>
                                                {a.paymentMethod || 'Cash'}
                                            </span>
                                        </td>
                                        <td><StatusBadge status={a.status} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )
                ) : billTab === 'pharmacy' ? (
                    filteredPharmacy.length === 0 ? (
                        <Empty text="No pharmacy collection records found." />
                    ) : (
                        <table className="clinic-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Patient UID</th>
                                    <th>Medicines</th>
                                    <th>Amount Paid</th>
                                    <th>Payment Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPharmacy.map(o => (
                                    <tr key={o._id}>
                                        <td style={{ fontSize: '12px' }}>{new Date(o.updatedAt || o.createdAt).toLocaleDateString('en-IN')}</td>
                                        <td>
                                            <strong style={{ color: '#1e293b' }}>{o.patientId}</strong>
                                        </td>
                                        <td style={{ fontSize: '12px', color: '#64748b' }}>
                                            {o.items.map(item => `${item.medicineName} (x${item.quantity})`).join(', ')}
                                        </td>
                                        <td><strong style={{ color: '#16a34a' }}>{fmt(o.totalAmount)}</strong></td>
                                        <td>
                                            <span style={{ background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 700 }}>
                                                Paid
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )
                ) : billTab === 'treatment' ? (
                    filteredPlans.length === 0 ? (
                        <Empty text="No treatment plans found." />
                    ) : (
                        <table className="clinic-table">
                            <thead>
                                <tr>
                                    <th>Patient</th>
                                    <th>Plan Title</th>
                                    <th>Total Cost</th>
                                    <th>Paid So Far</th>
                                    <th>Pending</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPlans.map(plan => (
                                    <tr key={plan._id}>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{plan.clinicPatientId?.name || '—'}</div>
                                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>{plan.clinicPatientId?.patientUid || '—'}</div>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{plan.title}</div>
                                            <div style={{ fontSize: '11px', color: '#64748b' }}>{plan.visits.length} visits total</div>
                                        </td>
                                        <td><strong style={{ color: '#1e293b' }}>{fmt(plan.totalAmount)}</strong></td>
                                        <td><strong style={{ color: '#16a34a' }}>{fmt(plan.totalPaid)}</strong></td>
                                        <td>
                                            {plan.pendingBalance > 0 ? (
                                                <strong style={{ color: '#dc2626' }}>{fmt(plan.pendingBalance)}</strong>
                                            ) : (
                                                <span style={{ color: '#16a34a', fontWeight: 'bold' }}>✓ Paid</span>
                                            )}
                                        </td>
                                        <td>
                                            <span style={{
                                                padding: '3px 8px',
                                                borderRadius: '4px',
                                                fontSize: '11px',
                                                fontWeight: 700,
                                                textTransform: 'uppercase',
                                                background: plan.status === 'completed' ? '#dcfce7' : '#dbeafe',
                                                color: plan.status === 'completed' ? '#16a34a' : '#1d4ed8'
                                            }}>
                                                {plan.status}
                                            </span>
                                        </td>
                                        <td>
                                            <button className="clinic-btn-secondary" style={{ fontSize: '11px', padding: '4px 10px' }} onClick={() => setSelectedPlan(plan)}>
                                                ⚙️ Manage / Pay
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )
                ) : (
                    /* Consolidated Patient Billing Tab */
                    <div>
                        {/* Patient Searcher */}
                        <div style={{ position: 'relative', marginBottom: '20px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>Select Patient for Billing</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    className="clinic-input"
                                    style={{ flex: 1 }}
                                    placeholder="Type patient name or ID to lookup..."
                                    value={billSearch}
                                    onChange={e => setBillSearch(e.target.value)}
                                />
                                {selectedBillPatient && (
                                    <button className="clinic-btn-secondary" onClick={() => { setSelectedBillPatient(null); setBillSearch(''); }}>✕ Clear Patient</button>
                                )}
                            </div>

                            {searchingBillPat && <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>Searching patients...</div>}

                            {billPatients.length > 0 && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 10px 20px rgba(0,0,0,0.1)', zIndex: 99, maxHeight: '200px', overflowY: 'auto', marginTop: '4px' }}>
                                    {billPatients.map(p => (
                                        <div
                                            key={p._id}
                                            onClick={() => { setSelectedBillPatient(p); setBillPatients([]); setBillSearch(''); }}
                                            style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                            onMouseEnter={e => e.target.style.background = '#f8fafc'}
                                            onMouseLeave={e => e.target.style.background = '#fff'}
                                        >
                                            <div>
                                                <strong>{p.name}</strong>
                                                <div style={{ fontSize: '11px', color: '#94a3b8' }}>ID: {p.patientUid || p._id}</div>
                                            </div>
                                            <span style={{ fontSize: '11px', background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>{p.gender} · {p.age} Yrs</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {selectedBillPatient ? (
                            <div>
                                {/* Selected Patient Briefing */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
                                    <div>
                                        <h4 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>🏥 {selectedBillPatient.name}</h4>
                                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                                            Patient UID: <strong>{selectedBillPatient.patientUid}</strong> | Contact: {selectedBillPatient.phone || 'N/A'}
                                        </p>
                                    </div>
                                    <button className="clinic-btn-primary" onClick={printConsolidatedBill}>
                                        🖨️ Print Consolidated Bill
                                    </button>
                                </div>

                                {/* Financial Metrics Grid */}
                                <div className="clinic-kpi-grid" style={{ marginBottom: '20px', gridTemplateColumns: 'repeat(3, 1fr)' }}>
                                    <div className="clinic-kpi-card" style={{ borderTop: '4px solid #0ea5e9' }}>
                                        <div style={{ fontSize: '11px', color: '#64748b' }}>TOTAL CHARGES INCURRED</div>
                                        <div style={{ fontSize: '22px', fontWeight: 800, color: '#0ea5e9', marginTop: '6px' }}>{fmt(billTotals.grandTotal)}</div>
                                    </div>
                                    <div className="clinic-kpi-card" style={{ borderTop: '4px solid #10b981' }}>
                                        <div style={{ fontSize: '11px', color: '#64748b' }}>TOTAL PAYMENTS MADE</div>
                                        <div style={{ fontSize: '22px', fontWeight: 800, color: '#10b981', marginTop: '6px' }}>{fmt(billTotals.paidTotal)}</div>
                                    </div>
                                    <div className="clinic-kpi-card" style={{ borderTop: '4px solid #ef4444' }}>
                                        <div style={{ fontSize: '11px', color: '#64748b' }}>OUTSTANDING BALANCE</div>
                                        <div style={{ fontSize: '22px', fontWeight: 800, color: '#ef4444', marginTop: '6px' }}>{fmt(billTotals.outstanding)}</div>
                                    </div>
                                </div>

                                {/* Breakdowns */}
                                <h4 style={{ color: '#0f172a', margin: '0 0 10px' }}>🩺 Consultation Visits</h4>
                                {patientBillData.appointments.length === 0 ? (
                                    <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 20px 4px' }}>No consultation records for this patient.</p>
                                ) : (
                                    <table className="clinic-table" style={{ marginBottom: '20px' }}>
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Service</th>
                                                <th>Fee</th>
                                                <th>Payment Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {patientBillData.appointments.map(a => (
                                                <tr key={a._id}>
                                                    <td>{fmtDate(a.appointmentDate)}</td>
                                                    <td>{a.serviceName || 'General Consultation'}</td>
                                                    <td><strong>{fmt(a.amount)}</strong></td>
                                                    <td>
                                                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: a.paymentStatus === 'paid' ? '#dcfce7' : '#fee2e2', color: a.paymentStatus === 'paid' ? '#16a34a' : '#dc2626' }}>
                                                            {a.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}

                                <h4 style={{ color: '#0f172a', margin: '0 0 10px' }}>💊 Pharmacy Purchases</h4>
                                {patientBillData.pharmacy.length === 0 ? (
                                    <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 20px 4px' }}>No pharmacy purchase records for this patient.</p>
                                ) : (
                                    <table className="clinic-table" style={{ marginBottom: '20px' }}>
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Medicines</th>
                                                <th>Amount</th>
                                                <th>Payment Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {patientBillData.pharmacy.map(o => (
                                                <tr key={o._id}>
                                                    <td>{new Date(o.updatedAt || o.createdAt).toLocaleDateString('en-IN')}</td>
                                                    <td style={{ fontSize: '12px' }}>{o.items.map(item => `${item.medicineName} (x${item.quantity})`).join(', ')}</td>
                                                    <td><strong>{fmt(o.totalAmount)}</strong></td>
                                                    <td>
                                                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: o.paymentStatus === 'Paid' ? '#dcfce7' : '#fee2e2', color: o.paymentStatus === 'Paid' ? '#16a34a' : '#dc2626' }}>
                                                            {o.paymentStatus === 'Paid' ? 'Paid' : 'Unpaid'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}

                                <h4 style={{ color: '#0f172a', margin: '0 0 10px' }}>📋 Treatment Plans</h4>
                                {patientBillData.plans.length === 0 ? (
                                    <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 20px 4px' }}>No treatment plans active or completed for this patient.</p>
                                ) : (
                                    <table className="clinic-table" style={{ marginBottom: '20px' }}>
                                        <thead>
                                            <tr>
                                                <th>Plan Title</th>
                                                <th>Total Cost</th>
                                                <th>Paid So Far</th>
                                                <th>Pending</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {patientBillData.plans.map(p => (
                                                <tr key={p._id}>
                                                    <td><strong>{p.title}</strong> ({p.visits.length} visits)</td>
                                                    <td>{fmt(p.totalAmount)}</td>
                                                    <td style={{ color: '#16a34a', fontWeight: 'bold' }}>{fmt(p.totalPaid)}</td>
                                                    <td style={{ color: p.pendingBalance > 0 ? '#dc2626' : '#16a34a', fontWeight: 'bold' }}>{fmt(p.pendingBalance)}</td>
                                                    <td>
                                                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: p.status === 'completed' ? '#dcfce7' : '#dbeafe', color: p.status === 'completed' ? '#16a34a' : '#1d4ed8' }}>
                                                            {p.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        ) : (
                            <Empty text="Search and select a patient above to view their consolidated ledger statement and print a unified bill." />
                        )}
                    </div>
                )}
            </div>

            {/* Treatment Plan Detail View modal */}
            {selectedPlan && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', borderRadius: '14px', padding: '24px', width: '700px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                            <div>
                                <h3 style={{ margin: 0, color: '#0f172a' }}>📋 {selectedPlan.title}</h3>
                                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                                    Patient: <strong>{selectedPlan.clinicPatientId?.name}</strong> ({selectedPlan.clinicPatientId?.patientUid})
                                </div>
                            </div>
                            <button className="clinic-btn-secondary" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => setSelectedPlan(null)}>✕ Close</button>
                        </div>

                        <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px', marginBottom: '16px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', fontSize: '13px' }}>
                            <div>
                                <span style={{ color: '#64748b', display: 'block' }}>Total Plan Amount</span>
                                <strong style={{ fontSize: '15px', color: '#1e293b' }}>{fmt(selectedPlan.totalAmount)}</strong>
                            </div>
                            <div>
                                <span style={{ color: '#64748b', display: 'block' }}>Total Paid</span>
                                <strong style={{ fontSize: '15px', color: '#16a34a' }}>{fmt(selectedPlan.totalPaid)}</strong>
                            </div>
                            <div>
                                <span style={{ color: '#64748b', display: 'block' }}>Outstanding Balance</span>
                                <strong style={{ fontSize: '15px', color: '#dc2626' }}>{fmt(selectedPlan.pendingBalance)}</strong>
                            </div>
                        </div>

                        <h4 style={{ margin: '0 0 10px', color: '#0f172a' }}>Visits & Payments</h4>
                        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                                <thead>
                                    <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                        <th style={{ padding: '8px', textAlign: 'left' }}>#</th>
                                        <th style={{ padding: '8px', textAlign: 'left' }}>Date & Time</th>
                                        <th style={{ padding: '8px', textAlign: 'left' }}>Procedure</th>
                                        <th style={{ padding: '8px', textAlign: 'left' }}>Amount Paid</th>
                                        <th style={{ padding: '8px', textAlign: 'left' }}>Status</th>
                                        <th style={{ padding: '8px', textAlign: 'left' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedPlan.visits.map((v, idx) => (
                                        <tr key={v._id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                            <td style={{ padding: '8px', fontWeight: 'bold', color: '#6366f1' }}>{v.visitNumber}</td>
                                            <td style={{ padding: '8px' }}>
                                                <div>{new Date(v.scheduledDate).toLocaleDateString('en-IN')}</div>
                                                {v.scheduledTime && <div style={{ fontSize: '10px', color: '#64748b' }}>🕐 {v.scheduledTime}</div>}
                                            </td>
                                            <td style={{ padding: '8px' }}>
                                                <div>{v.procedure || '—'}</div>
                                                {v.notes && <div style={{ color: '#94a3b8', fontSize: '11px' }}>{v.notes}</div>}
                                            </td>
                                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', fontWeight: '600' }}>
                                                {v.amountPaid > 0
                                                    ? <span style={{ color: '#16a34a' }}>₹{v.amountPaid.toLocaleString('en-IN')}{v.paymentMethod ? ` · ${v.paymentMethod}` : ''}</span>
                                                    : <span style={{ color: '#94a3b8', fontSize: '11px' }}>—</span>}
                                            </td>
                                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
                                                <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px', background: (visitStatusColor[v.status] || '#94a3b8') + '20', color: visitStatusColor[v.status] || '#94a3b8', textTransform: 'uppercase' }}>{v.status}</span>
                                            </td>
                                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
                                                {v.status === 'scheduled' && selectedPlan.status === 'active' && (
                                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                        <button
                                                            onClick={() => { setPayModal({ visit: v, planId: selectedPlan._id }); setPayInput({ amountPaid: '', paymentMethod: 'Cash', notes: '' }); }}
                                                            style={{ fontSize: '11px', padding: '3px 8px', background: '#dcfce7', color: '#16a34a', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '700' }}>
                                                            💵 Pay
                                                        </button>
                                                        <button
                                                            onClick={() => handleComplete(selectedPlan._id, v._id)}
                                                            disabled={isLastScheduled(v._id) && selectedPlan.pendingBalance > 0}
                                                            title={isLastScheduled(v._id) && selectedPlan.pendingBalance > 0 ? `Collect ₹${selectedPlan.pendingBalance.toLocaleString('en-IN')} first` : ''}
                                                            style={{ fontSize: '11px', padding: '3px 8px', background: isLastScheduled(v._id) && selectedPlan.pendingBalance > 0 ? '#f1f5f9' : '#dbeafe', color: isLastScheduled(v._id) && selectedPlan.pendingBalance > 0 ? '#94a3b8' : '#1d4ed8', border: 'none', borderRadius: '4px', cursor: isLastScheduled(v._id) && selectedPlan.pendingBalance > 0 ? 'not-allowed' : 'pointer', fontWeight: '700' }}>
                                                            ✓ Done
                                                        </button>
                                                        <button
                                                            onClick={() => handleMiss(selectedPlan._id, v._id)}
                                                            style={{ fontSize: '11px', padding: '3px 8px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '700' }}>
                                                            ✗ Missed
                                                        </button>
                                                    </div>
                                                )}
                                                {v.status === 'completed' && <span style={{ fontSize: '11px', color: '#94a3b8' }}>{v.completedAt ? new Date(v.completedAt).toLocaleDateString('en-IN') : '—'}</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Visit payment modal */}
            {payModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', borderRadius: '14px', padding: '28px', width: '420px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
                        <h3 style={{ margin: '0 0 16px', color: '#0f172a' }}>💵 Record Payment — Visit {payModal.visit.visitNumber}</h3>
                        {/* Overall plan balance */}
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Total Treatment</span><b>₹{selectedPlan.totalAmount.toLocaleString('en-IN')}</b>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                                <span>Paid so far</span><b style={{ color: '#16a34a' }}>₹{selectedPlan.totalPaid.toLocaleString('en-IN')}</b>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontWeight: '800', color: '#dc2626', fontSize: '14px' }}>
                                <span>Outstanding Balance</span><span>₹{selectedPlan.pendingBalance.toLocaleString('en-IN')}</span>
                            </div>
                        </div>
                        <div className="clinic-form-group" style={{ marginBottom: '12px' }}>
                            <label>Amount Paying Now (₹) *</label>
                            <input className="clinic-input" type="number" min="1" placeholder={`Up to ₹${selectedPlan.pendingBalance.toLocaleString('en-IN')}`}
                                value={payInput.amountPaid}
                                onChange={e => setPayInput(p => ({ ...p, amountPaid: e.target.value }))} />
                            {payInput.amountPaid > 0 && (
                                <div style={{ fontSize: '12px', marginTop: '4px', color: Number(payInput.amountPaid) >= selectedPlan.pendingBalance ? '#16a34a' : '#f97316', fontWeight: '600' }}>
                                    {Number(payInput.amountPaid) >= selectedPlan.pendingBalance
                                        ? '✓ This will clear the full outstanding balance.'
                                        : `After payment: ₹${Math.max(0, selectedPlan.pendingBalance - Number(payInput.amountPaid)).toLocaleString('en-IN')} still pending.`}
                                </div>
                            )}
                        </div>
                        <div className="clinic-form-group" style={{ marginBottom: '12px' }}>
                            <label>Payment Method</label>
                            <select className="clinic-input" value={payInput.paymentMethod} onChange={e => setPayInput(p => ({ ...p, paymentMethod: e.target.value }))}>
                                <option>Cash</option>
                                <option>UPI</option>
                                <option>Card</option>
                                <option>NEFT</option>
                            </select>
                        </div>
                        <div className="clinic-form-group" style={{ marginBottom: '16px' }}>
                            <label>Notes (optional)</label>
                            <input className="clinic-input" placeholder="e.g. Advance payment..." value={payInput.notes} onChange={e => setPayInput(p => ({ ...p, notes: e.target.value }))} />
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button className="clinic-btn-secondary" style={{ flex: 1 }} onClick={() => setPayModal(null)}>Cancel</button>
                            <button className="clinic-btn-primary" style={{ flex: 1 }} disabled={saving} onClick={handlePay}>
                                {saving ? 'Saving...' : '✅ Save Payment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────
// Small shared components
// ─────────────────────────────────────────────
const Spinner = ({ text = 'Loading...' }) => (
    <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '14px' }}>{text}</div>
);

const Empty = ({ text }) => (
    <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: '14px' }}>{text}</div>
);

const StatusBadge = ({ status }) => {
    const map = {
        pending: { bg: '#fef9c3', color: '#854d0e' },
        confirmed: { bg: '#dbeafe', color: '#1d4ed8' },
        completed: { bg: '#dcfce7', color: '#16a34a' },
        cancelled: { bg: '#fee2e2', color: '#dc2626' },
    };
    const s = map[status] || { bg: '#f1f5f9', color: '#64748b' };
    return <span style={{ ...s, padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>{status}</span>;
};

const PayBadge = ({ status }) => {
    const color = status === 'paid' ? '#16a34a' : status === 'refunded' ? '#0ea5e9' : '#dc2626';
    return <span style={{ color, fontWeight: 700, fontSize: '12px' }}>{status}</span>;
};

export default ClinicDashboard;
