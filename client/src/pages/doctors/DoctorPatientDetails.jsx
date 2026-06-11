import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doctorAPI, labTestAPI, questionLibraryAPI, hospitalAPI } from '../../utils/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './DoctorPatientDetails.css';
import DynamicQuestionForm from '../../components/DynamicQuestionForm';
import { useAuth } from '../../store/hooks';

// ─── Reports & Files Tab ──────────────────────────────────────────────────────
const ReportsFilesTab = ({ appointment, labReports = [], onRecommendAdmission, onCancelRecommendAdmission }) => {
    const [clinicReports, setClinicReports] = useState([]);
    const [loading, setLoading] = useState(false);
    const [admissionNotes, setAdmissionNotes] = useState('');
    const [admissionPriority, setAdmissionPriority] = useState('Normal');
    const [admissionDept, setAdmissionDept] = useState(appointment?.department || '');

    const handleRecommendAdmission = () => {
        if (!admissionNotes.trim()) {
            alert("Please enter admission notes first.");
            return;
        }
        onRecommendAdmission(admissionNotes, admissionPriority, admissionDept);
    };

    useEffect(() => {
        const clinicPatientId = appointment?.clinicPatientId?._id || appointment?.clinicPatientId;
        if (clinicPatientId) {
            setLoading(true);
            doctorAPI.getClinicPatientReports(clinicPatientId)
                .then(r => { if (r.success) setClinicReports(r.reports || []); })
                .catch(() => {})
                .finally(() => setLoading(false));
        }
    }, [appointment?._id]); // eslint-disable-line

    const BASE = import.meta.env.VITE_API_URL || 'https://hms-h939.onrender.com';
    const prescriptions = appointment?.prescriptions || [];
    const allFiles = [
        ...prescriptions.map(p => ({ ...p, source: 'appointment' })),
        ...clinicReports.map(r => ({
            name: r.name,
            url: r.url || r.fileUrl || (r.filename ? `${BASE}/uploads/patient-reports/${encodeURIComponent(r.filename)}` : null),
            uploadedAt: r.uploadedAt,
            mimetype: r.mimetype,
            source: 'clinic-patient',
        })),
        ...(appointment?.userId?.pastReports || []).map(r => ({
            name: r.name,
            url: r.url || r.fileUrl || (r.filename ? `${BASE}/uploads/patient-reports/${encodeURIComponent(r.filename)}` : null),
            uploadedAt: r.uploadedAt,
            mimetype: r.mimetype,
            source: 'past-report',
        })),
    ];

    const isPDF = (mimetype) => mimetype === 'application/pdf' || (typeof mimetype === 'string' && mimetype.endsWith('pdf'));

    return (
        <div>
            <h3 style={{ marginBottom: '16px', color: '#1e293b' }}>📁 Reports & Files</h3>
            {loading && <p style={{ color: '#94a3b8', fontSize: '13px' }}>Loading reports…</p>}
            {!loading && allFiles.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', border: '1px dashed #e2e8f0', borderRadius: '10px' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📂</div>
                    <p>No uploaded reports or files for this visit.</p>
                    <p style={{ fontSize: '12px' }}>Lab reports are uploaded by the lab department. Prescriptions are attached when saving the session.</p>
                </div>
            )}
            {allFiles.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {allFiles.map((f, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                            <div style={{ fontSize: '1.4rem' }}>{isPDF(f.mimetype) ? '📄' : '🖼️'}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {f.name || 'Unnamed file'}
                                </div>
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                    {f.type === 'lab_report'
                                        ? '🔬 Lab Report'
                                        : f.source === 'clinic-patient'
                                        ? '📋 Patient Report'
                                        : f.source === 'past-report'
                                        ? '📋 Previous Hospital Report'
                                        : '📝 Prescription'}
                                    {f.uploadedAt && ` · ${new Date(f.uploadedAt).toLocaleDateString('en-IN')}`}
                                </div>
                            </div>
                            {f.url ? (
                                <a href={f.url} target="_blank" rel="noreferrer"
                                    style={{ background: '#3b82f6', color: '#fff', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                                    {isPDF(f.mimetype) ? 'Open PDF' : 'View'}
                                </a>
                            ) : (
                                <span style={{ color: '#94a3b8', fontSize: '12px' }}>No URL</span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* LAB REPORTS & HISTORY SECTION */}
            <h3 style={{ marginTop: '28px', marginBottom: '16px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🔬</span> Lab Reports & History
            </h3>
            {labReports.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', border: '1px dashed #e2e8f0', borderRadius: '10px' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🔬</div>
                    <p>No lab reports or test history found for this patient.</p>
                    <p style={{ fontSize: '12px' }}>Uploaded lab results will appear here instantly once uploaded by the lab technician.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {labReports.map((r, i) => {
                        const fileUrl = r.reportFile?.url;
                        const uploadDate = r.reportFile?.uploadedAt || r.createdAt;
                        return (
                            <div key={r._id || i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ fontSize: '1.6rem' }}>🧪</div>
                                    <div>
                                        <div style={{ fontWeight: 700, color: '#166534', fontSize: '14px' }}>
                                            {r.testNames?.join(', ') || 'Lab Test / Report'}
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#15803d', marginTop: '2px' }}>
                                            Status: <span style={{ fontWeight: 'bold', textTransform: 'capitalize' }}>{String(r.reportStatus || r.testStatus).toLowerCase()}</span>
                                            {uploadDate && ` · Uploaded: ${new Date(uploadDate).toLocaleDateString('en-IN')}`}
                                            {` · Uploaded By: ${r.labId?.name || 'Laboratory'}`}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    {fileUrl ? (
                                        <>
                                            <a href={fileUrl} target="_blank" rel="noreferrer"
                                                style={{ background: '#059669', color: '#fff', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                👁️ View Report
                                            </a>
                                            <a href={fileUrl} download target="_blank" rel="noreferrer"
                                                style={{ background: '#10b981', color: '#fff', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                📥 Download
                                            </a>
                                        </>
                                    ) : (
                                        <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 600, background: '#f1f5f9', padding: '4px 10px', borderRadius: '4px' }}>
                                            ⏳ Processing
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            {/* Admission Recommendation Box */}
            <div style={{ marginTop: '30px', padding: '20px', background: '#fee2e2', border: '1px solid #fda4af', borderRadius: '12px' }}>
                <h4 style={{ margin: '0 0 8px 0', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 800 }}>
                    🚨 Admit Patient
                </h4>
                <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#7f1d1d' }}>
                    Recommend this patient for immediate hospital admission. A notification will be sent to the Reception desk to handle ward and bed allocation.
                </p>
                {appointment?.recommendAdmission ? (
                    <div style={{ padding: '10px 12px', background: '#fff', borderRadius: '8px', border: '1px solid #fecaca', fontSize: '13px', color: '#991b1b', fontWeight: 600 }}>
                        ✓ Admission Recommended on {new Date(appointment.updatedAt || appointment.completedAt || new Date()).toLocaleDateString('en-IN')}
                        <div style={{ marginTop: '4px', fontSize: '12px', color: '#7f1d1d' }}>
                            <strong>Dept:</strong> {appointment.recommendAdmissionDept || appointment.department || 'Not Specified'} &nbsp;•&nbsp; <strong>Priority:</strong> {appointment.recommendAdmissionPriority || 'Normal'}
                        </div>
                        {appointment.recommendAdmissionNotes && (
                            <div style={{ marginTop: '6px', fontWeight: 400, color: '#7f1d1d', borderTop: '1px dashed #fee2e2', paddingTop: '6px' }}>
                                <strong>Notes:</strong> {appointment.recommendAdmissionNotes}
                            </div>
                        )}
                        {appointment.admissionStatus === 'Admitted' ? (
                            <div style={{ marginTop: '10px', padding: '8px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', color: '#166534', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <div>🔒 Allocated &amp; Admitted</div>
                                <div style={{ fontSize: '11px', fontWeight: 'normal' }}>
                                    Ward: <strong style={{ textTransform: 'uppercase' }}>{appointment.admissionWard}</strong> &nbsp;•&nbsp; Bed: <strong style={{ textTransform: 'uppercase' }}>{appointment.admissionBed}</strong>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={onCancelRecommendAdmission}
                                style={{ marginTop: '10px', background: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', transition: 'background 0.2s' }}
                                onMouseEnter={e => e.target.style.background = '#dc2626'}
                                onMouseLeave={e => e.target.style.background = '#ef4444'}
                            >
                                ✕ Cancel Admission Request
                            </button>
                        )}
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#7f1d1d', marginBottom: '4px' }}>Priority</label>
                                <select 
                                    value={admissionPriority}
                                    onChange={(e) => setAdmissionPriority(e.target.value)}
                                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #fca5a5', borderRadius: '6px', fontSize: '12px' }}
                                >
                                    <option value="Normal">Normal</option>
                                    <option value="Urgent">Urgent</option>
                                    <option value="Critical">Critical</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#7f1d1d', marginBottom: '4px' }}>Requested Department</label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. Cardiology"
                                    value={admissionDept}
                                    onChange={(e) => setAdmissionDept(e.target.value)}
                                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #fca5a5', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}
                                />
                            </div>
                        </div>
                        <textarea
                            placeholder="Specify reason for admission, ward preference, or other instructions for the receptionist..."
                            value={admissionNotes}
                            onChange={(e) => setAdmissionNotes(e.target.value)}
                            style={{ width: '100%', height: '70px', padding: '8px 12px', border: '1px solid #fca5a5', borderRadius: '8px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }}
                        />
                        <button
                            onClick={handleRecommendAdmission}
                            style={{ alignSelf: 'flex-start', background: '#dc2626', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'background 0.2s' }}
                            onMouseEnter={e => e.target.style.background = '#b91c1c'}
                            onMouseLeave={e => e.target.style.background = '#dc2626'}
                        >
                            🚨 Send Admission Request to Reception
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

const DoctorPatientDetails = () => {
    const { appointmentId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    
    // Check if the current user is a Junior Doctor
    const roleName = user?._roleData?.name?.toLowerCase() || (typeof user?.role === 'string' ? user.role.toLowerCase() : '');
    const isJrDoctor = roleName.includes('jr') && roleName.includes('doctor');

    const [appointment, setAppointment] = useState(null);
    const [history, setHistory] = useState([]);
    const [labReports, setLabReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [catalogTests, setCatalogTests] = useState([]);
    const [catalogMedicines, setCatalogMedicines] = useState([]);
    // Medicines are now loaded from the backend catalog (persisted to DB)
    const [dynamicLibrary, setDynamicLibrary] = useState(null);
    const [hospitalDepartments, setHospitalDepartments] = useState([]);
    const [isLocked, setIsLocked] = useState(false);
    const [hospitalContext, setHospitalContext] = useState(null);

    // Modal States
    const [showPrescribeModal, setShowPrescribeModal] = useState(false);

    // Tab State for Left Panel
    const [activeTab, setActiveTab] = useState('overview');

    // Time Machine Feature State
    const [viewingPastSession, setViewingPastSession] = useState(null);

    // Doctor's Session Notepad (Right Panel)
    const [sessionData, setSessionData] = useState({
        diagnosis: '', notes: '', medicines: [], labTests: '', recommendAdmission: false, recommendAdmissionNotes: ''
    });

    // Patient Intake Profile (Left Panel - Editable by Doctor)
    const [intakeData, setIntakeData] = useState({});
    const [requestReportFollowUp, setRequestReportFollowUp] = useState(false);

    // Tab Scrolling Reference
    const tabsRef = useRef(null);

    const handleTabsWheel = (e) => {
        if (tabsRef.current) {
            // Only convert pure vertical scrolling to horizontal scrolling (mouse wheels)
            // Allow native 2-finger horizontal trackpad scrolling to pass through naturally
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                e.preventDefault();
                tabsRef.current.scrollBy({ left: e.deltaY, behavior: 'auto' });
            }
        }
    };

    const scrollTabs = (dir) => {
        if (tabsRef.current) {
            tabsRef.current.scrollBy({ left: dir === 'left' ? -300 : 300, behavior: 'smooth' });
        }
    };

    // Add non-passive event listener for proper wheel interception without console errors
    useEffect(() => {
        const el = tabsRef.current;
        if (el) {
            el.addEventListener('wheel', handleTabsWheel, { passive: false });
        }
        return () => {
            if (el) el.removeEventListener('wheel', handleTabsWheel);
        };
    }, []);

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                const res = await doctorAPI.getAppointmentDetails(appointmentId);
                if (res.success) {
                    setAppointment(res.appointment);
                    setIntakeData(res.appointment.userId?.fertilityProfile || {});
                    setRequestReportFollowUp(res.appointment.requestReportFollowUp || false);
                    
                    // Lock the consultation session if the appointment is completed or cancelled
                    setIsLocked(res.appointment.status === 'completed' || res.appointment.status === 'cancelled');

                    if (res.appointment.userId?._id) {
                        const histRes = await doctorAPI.getPatientHistory(res.appointment.userId._id);
                        if (histRes.success) setHistory(histRes.history || histRes.data || []);

                        const profileRes = await doctorAPI.getFullPatientProfile(res.appointment.userId._id);
                        if (profileRes.success) {
                            setLabReports(profileRes.labReports || []);
                        }
                    }

                    setSessionData({
                        diagnosis: res.appointment.diagnosis || '',
                        notes: res.appointment.doctorNotes || '',
                        medicines: (res.appointment.pharmacy || []).map(p => ({
                            medicineName: p.medicineName || '',
                            saltName: p.saltName || '',
                            dose: p.frequency || '',
                            days: p.duration || ''
                        })),
                        labTests: (res.appointment.labTests || []).join(', '),
                        recommendAdmission: res.appointment.recommendAdmission || false,
                        recommendAdmissionNotes: res.appointment.recommendAdmissionNotes || ''
                    });
                    
                    if (res.departments) {
                        setHospitalDepartments(res.departments);
                    }
                }
            } catch (err) { console.error(err); }

            try {
                const testRes = await labTestAPI.getLabTests();
                if (testRes.success) {
                    setCatalogTests(testRes.data || []);
                }
            } catch (err) { console.error("Error fetching lab test catalog", err); }

            try {
                const medRes = await doctorAPI.getMedicines();
                if (medRes.success) {
                    setCatalogMedicines(medRes.medicines || []);
                }
            } catch (err) { console.error("Error fetching pharmacy inventory", err); }

            try {
                const libRes = await questionLibraryAPI.getLibrary();
                if (libRes.success && libRes.data && libRes.data.data) {
                    setDynamicLibrary(libRes.data.data);
                }
            } catch (err) { console.error("Error fetching dynamic question library", err); }

            finally { setLoading(false); }
        };
        fetchDetails();

        // Fetch hospital context for PDF branding
        const fetchHospital = async () => {
            try {
                const res = await hospitalAPI.getMyHospital();
                if (res.success) setHospitalContext(res.hospital);
            } catch (err) { /* ignore */ }
        };
        fetchHospital();
    }, [appointmentId]);

    const handleIntakeChange = (e) => {
        const { name, value } = e.target;
        // Handle BMI calculation
        if (name === 'height' || name === 'weight') {
            const h = name === 'height' ? value : intakeData.height;
            const w = name === 'weight' ? value : intakeData.weight;
            if (h && w) {
                const hM = parseFloat(h) / 100;
                const bmi = (parseFloat(w) / (hM * hM)).toFixed(2);
                setIntakeData(prev => ({ ...prev, [name]: value, bmi }));
                return;
            }
        }
        setIntakeData(prev => ({ ...prev, [name]: value }));
    };



    const handleSessionChange = (e) => {
        if (isLocked) return;
        setSessionData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSaveProfile = async () => {
        if (!appointment?.userId?._id) return;
        setSaving(true);
        try {
            await doctorAPI.updatePatientProfile(appointment.userId._id, intakeData);
            alert("✅ Patient profile saved successfully!");
        } catch (err) {
            alert("Error saving profile: " + err.message);
        } finally { setSaving(false); }
    };

    const handleSaveAndMerge = async () => {
        if (!window.confirm("Save all changes and finish session?")) return;
        setSaving(true);
        try {
            // 1. Save Profile
            if (appointment.userId?._id) {
                await doctorAPI.updatePatientProfile(appointment.userId._id, intakeData);
            }

            // 2. Save Session
            const payload = {
                status: 'completed',
                diagnosis: sessionData.diagnosis,
                notes: sessionData.notes,
                requestReportFollowUp: requestReportFollowUp,
                labTests: sessionData.labTests.split(/(?:,\s*)+(?![^(]*\))/).map(s => s.trim()).filter(Boolean),
                pharmacy: (sessionData.medicines || []).filter(m => m.medicineName?.trim()).map(m => ({
                    medicineName: m.medicineName?.trim() || '',
                    saltName: m.saltName?.trim() || '',
                    frequency: m.dose?.trim() || '',
                    duration: m.days?.trim() || ''
                }))
            };
            await doctorAPI.updateSession(appointmentId, payload);



            // 4. Generate Prescription PDF automatically
            generatePrescriptionPDF();

            alert("✅ Session saved & prescription generated!");
            navigate('/doctor/patients');
        } catch (err) {
            alert("Error: " + err.message);
        } finally { setSaving(false); }
    };

    const generateCumulativePDF = (intake, pastHistory, currentData) => {
        const doc = new jsPDF();
        let y = 20;

        doc.setFontSize(22);
        doc.setTextColor(41, 128, 185);
        doc.text(hospitalContext?.name || "HOSPITAL", 105, y, { align: 'center' });
        y += 10;
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(hospitalContext?.tagline || "Excellence in Healthcare", 105, y, { align: 'center' });
        y += 15;

        doc.setLineWidth(0.5);
        doc.setDrawColor(200);
        doc.line(10, y, 200, y);
        y += 10;

        doc.setFontSize(18);
        doc.setTextColor(0);
        doc.text("CLINICAL RECORD / PRESCRIPTION", 105, y, { align: 'center' }); y += 15;

        doc.setFillColor(240, 240, 240); doc.rect(14, y, 182, 42, 'F');
        doc.setFontSize(11);

        const cardX = 20;
        let cardY = y + 8;

        doc.setFont("helvetica", "bold");
        doc.text(`Patient Name:`, cardX, cardY);
        doc.setFont("helvetica", "normal");
        doc.text(`${intake.firstName || appointment.userId?.name || ''} ${intake.lastName || ''}`, cardX + 30, cardY);

        doc.setFont("helvetica", "bold");
        doc.text(`MRN / ID:`, cardX + 100, cardY);
        doc.setFont("helvetica", "normal");
        doc.text(`${appointment.userId?.patientId || 'N/A'}`, cardX + 130, cardY);

        cardY += 8;
        doc.setFont("helvetica", "bold");
        doc.text(`Age / Gender:`, cardX, cardY);
        doc.setFont("helvetica", "normal");
        doc.text(`${intake.age || '-'} / ${intake.gender || '-'}`, cardX + 30, cardY);

        doc.setFont("helvetica", "bold");
        doc.text(`Date:`, cardX + 100, cardY);
        doc.setFont("helvetica", "normal");
        doc.text(`${new Date().toLocaleDateString()}`, cardX + 130, cardY);

        cardY += 8;
        doc.setFont("helvetica", "bold");
        doc.text(`Contact:`, cardX, cardY);
        doc.setFont("helvetica", "normal");
        doc.text(`${appointment.userId?.phone || '-'}`, cardX + 30, cardY);

        // Doctor Name
        doc.setFont("helvetica", "bold");
        doc.text(`Doctor:`, cardX + 100, cardY);
        doc.setFont("helvetica", "normal");
        doc.text(`Dr. ${appointment.doctorName || user?.name || '-'}`, cardX + 130, cardY);

        y += 50;

        // Iterate over dynamic intake data
        const dynamicEntries = Object.entries(intake).filter(([key, val]) => 
            key !== '_id' && key !== 'createdAt' && key !== 'updatedAt' && key !== '__v' 
            && typeof val !== 'object' && val !== ''
        ).map(([key, val]) => [key, String(val)]);

        if (dynamicEntries.length > 0) {
            autoTable(doc, {
                startY: y,
                head: [['Clinical Questionnaire', 'Response']],
                body: dynamicEntries,
                theme: 'grid',
                headStyles: { fillColor: [41, 128, 185], textColor: 255 },
                columnStyles: { 0: { fontStyle: 'bold', width: 80 } }
            });
            y = doc.lastAutoTable.finalY + 10;
        }

        if (pastHistory.length > 0) {
            doc.setFillColor(220, 240, 255); doc.rect(14, y, 180, 8, 'F');
            doc.text("PAST SESSIONS", 16, y + 6); y += 12;
            const rows = pastHistory.filter(h => h.status === 'completed' && h._id !== appointmentId).map(h => [
                new Date(h.appointmentDate).toLocaleDateString(), h.diagnosis || '-', h.doctorNotes || '-'
            ]);
            if (rows.length > 0) {
                autoTable(doc, { startY: y, head: [['Date', 'Diagnosis', 'Notes']], body: rows });
                y = doc.lastAutoTable.finalY + 10;
            }
        }

        if (y > 250) { doc.addPage(); y = 20; }
        doc.setFillColor(200, 255, 200); doc.rect(14, y, 180, 8, 'F');
        doc.text(`CURRENT SESSION: ${new Date().toLocaleDateString()}`, 16, y + 6); y += 12;

        doc.setFontSize(10);
        doc.text(`Diagnosis: ${currentData.diagnosis}`, 16, y); y += 10;
        doc.text("Notes:", 16, y); y += 6;
        const notes = doc.splitTextToSize(currentData.notes, 170);
        doc.text(notes, 16, y); y += (notes.length * 5) + 10;

        // Medicines
        if (y > 250) { doc.addPage(); y = 20; }
        doc.setFontSize(11); doc.setFont("helvetica", "bold");
        doc.text("Prescription / Medicines:", 16, y); y += 8;
        doc.setFont("helvetica", "normal"); doc.setFontSize(10);
        const rxItems = (currentData.pharmacy || []);
        if (rxItems.length > 0) {
            autoTable(doc, {
                startY: y,
                head: [['#', 'Medicine Name', 'Salt / Generic', 'Dose / Frequency', 'Days']],
                body: rxItems.map((p, i) => [i + 1, p.medicineName, p.saltName || '-', p.frequency || '-', p.duration || '-']),
                theme: 'striped',
                headStyles: { fillColor: [76, 175, 80], textColor: 255 },
                columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 55 }, 2: { cellWidth: 45 }, 3: { cellWidth: 40 }, 4: { cellWidth: 20 } },
            });
            y = doc.lastAutoTable.finalY + 10;
        } else {
            doc.text('No medicines prescribed.', 16, y); y += 8;
        }

        // Lab Tests
        if (y > 250) { doc.addPage(); y = 20; }
        doc.setFontSize(11); doc.setFont("helvetica", "bold");
        doc.text("Lab Tests Ordered:", 16, y); y += 8;
        doc.setFont("helvetica", "normal"); doc.setFontSize(10);
        const labItems = (currentData.labTests || []);
        if (labItems.length > 0) {
            autoTable(doc, {
                startY: y,
                head: [['#', 'Test Name']],
                body: labItems.map((t, i) => [i + 1, t]),
                theme: 'striped',
                headStyles: { fillColor: [33, 150, 243], textColor: 255 },
            });
            y = doc.lastAutoTable.finalY + 10;
        } else {
            doc.text('No lab tests ordered.', 16, y); y += 8;
        }

        // Footer
        if (y > 260) { doc.addPage(); y = 20; }
        doc.setDrawColor(200); doc.line(14, y, 196, y); y += 10;
        doc.setFontSize(9); doc.setTextColor(120);
        doc.text(`Doctor: Dr. ${appointment.doctorName || user?.name || 'N/A'}`, 16, y);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 130, y);

        if (window.confirm("Do you want to download the Cumulative Patient Record PDF?")) {
            doc.save("Patient_Record.pdf");
        }
    };

    // ─── STANDALONE PRESCRIPTION PDF ─────────────────────────────────────────
    const generatePrescriptionPDF = () => {
        const pt = appointment?.userId || {};
        const doc = new jsPDF();
        const hName = hospitalContext?.name || 'HOSPITAL';
        const hAddr = [hospitalContext?.address, hospitalContext?.city, hospitalContext?.state].filter(Boolean).join(', ');
        const hPhone = hospitalContext?.phone || '';
        const profile = pt.fertilityProfile || intakeData;
        let y = 18;

        // Header
        doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
        doc.text(hName, 105, y, { align: 'center' }); y += 7;
        if (hAddr) {
            doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
            doc.text(hAddr, 105, y, { align: 'center' }); y += 5;
        }
        if (hPhone) { doc.text(`Ph: ${hPhone}`, 105, y, { align: 'center' }); y += 5; }
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(76, 175, 80);
        doc.text('PRESCRIPTION SLIP', 105, y, { align: 'center' }); y += 5;
        doc.setDrawColor(76, 175, 80); doc.setLineWidth(0.5);
        doc.line(14, y, 196, y); y += 8;
        doc.setTextColor(0); doc.setFont('helvetica', 'normal');

        // Patient Info
        autoTable(doc, {
            startY: y,
            body: [
                ['Patient', pt.name || '-', 'MRN', pt.patientId || 'N/A'],
                ['Age / Gender', `${profile?.age || '-'} / ${profile?.gender || '-'}`, 'Phone', pt.phone || '-'],
                ['Doctor', `Dr. ${appointment?.doctorName || user?.name || '-'}`, 'Date', new Date().toLocaleDateString('en-IN')],
                ['Diagnosis', appointment?.diagnosis || sessionData.diagnosis || '-', '', ''],
            ],
            theme: 'grid',
            columnStyles: {
                0: { fontStyle: 'bold', cellWidth: 38 },
                2: { fontStyle: 'bold', cellWidth: 28 },
            },
            bodyStyles: { fontSize: 10 },
        });
        y = doc.lastAutoTable.finalY + 10;

        // Medicines
        const rxItems = sessionData.medicines?.length > 0
            ? sessionData.medicines.filter(m => m.medicineName?.trim())
            : (appointment?.pharmacy || []).map(p => ({ medicineName: p.medicineName, saltName: p.saltName || '', dose: p.frequency || '', days: p.duration || '' }));

        doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(33, 37, 41);
        doc.text('Medicines Prescribed', 14, y); y += 6;
        if (rxItems.length > 0) {
            autoTable(doc, {
                startY: y,
                head: [['#', 'Medicine Name', 'Salt / Generic', 'Dose / Frequency', 'Days']],
                body: rxItems.map((m, i) => [i + 1, m.medicineName || '-', m.saltName || '-', m.dose || '-', m.days || '-']),
                theme: 'striped',
                headStyles: { fillColor: [76, 175, 80], textColor: 255 },
                bodyStyles: { fontSize: 10 },
                columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 55 }, 2: { cellWidth: 50 }, 3: { cellWidth: 40 }, 4: { cellWidth: 20 } },
            });
            y = doc.lastAutoTable.finalY + 10;
        } else {
            doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(100);
            doc.text('No medicines prescribed.', 16, y); y += 8;
        }

        // Lab Tests
        const labItems = sessionData.labTests
            ? sessionData.labTests.split(/(?:,\s*)+(?![^(]*\))/).map(t => t.trim()).filter(Boolean)
            : (appointment?.labTests || []);

        doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(33, 37, 41);
        doc.text('Lab Tests Ordered', 14, y); y += 6;
        if (labItems.length > 0) {
            autoTable(doc, {
                startY: y,
                head: [['#', 'Test Name']],
                body: labItems.map((t, i) => [i + 1, t]),
                theme: 'striped',
                headStyles: { fillColor: [33, 150, 243], textColor: 255 },
                bodyStyles: { fontSize: 10 },
            });
            y = doc.lastAutoTable.finalY + 10;
        } else {
            doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(100);
            doc.text('No lab tests ordered.', 16, y); y += 8;
        }

        // Notes
        if (sessionData.notes || appointment?.doctorNotes) {
            const notesText = sessionData.notes || appointment?.doctorNotes || '';
            if (y > 250) { doc.addPage(); y = 20; }
            doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(33, 37, 41);
            doc.text('Clinical Notes', 14, y); y += 6;
            doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60);
            const wrapped = doc.splitTextToSize(notesText, 170);
            doc.text(wrapped, 16, y); y += wrapped.length * 5 + 8;
        }

        // Footer
        if (y > 260) { doc.addPage(); y = 20; }
        doc.setDrawColor(200); doc.line(14, y, 196, y); y += 6;
        doc.setFontSize(9); doc.setTextColor(120);
        doc.text(`Doctor: Dr. ${appointment?.doctorName || user?.name || 'N/A'}`, 14, y);
        doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 196, y, { align: 'right' });
        y += 5;
        doc.setFontSize(8);
        doc.text('This prescription is valid for 30 days from the date of issue.', 105, y, { align: 'center' });

        if (window.confirm("Do you want to download the Prescription PDF?")) {
            doc.save(`Prescription_${pt.patientId || 'Patient'}_${new Date().toISOString().split('T')[0]}.pdf`);
        }
    };

    // ─── CONSULTATION RECEIPT PDF ─────────────────────────────────────────────
    const generateReceiptPDF = () => {
        const pt = appointment?.userId || {};
        const doc = new jsPDF();
        const hName = hospitalContext?.name || 'HOSPITAL';
        const hAddr = [hospitalContext?.address, hospitalContext?.city, hospitalContext?.state].filter(Boolean).join(', ');
        const hPhone = hospitalContext?.phone || '';
        const hEmail = hospitalContext?.email || '';
        let y = 18;

        doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
        doc.text(hName, 105, y, { align: 'center' }); y += 7;
        if (hAddr) {
            doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
            doc.text(hAddr, 105, y, { align: 'center' }); y += 5;
        }
        if (hPhone || hEmail) {
            const contact = [hPhone && `Ph: ${hPhone}`, hEmail && `Email: ${hEmail}`].filter(Boolean).join('  |  ');
            doc.setFontSize(9); doc.setTextColor(100);
            doc.text(contact, 105, y, { align: 'center' }); y += 5;
        }
        doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(41, 128, 185);
        doc.text('Consultation Receipt', 105, y, { align: 'center' }); y += 5;
        doc.setDrawColor(41, 128, 185); doc.setLineWidth(0.5);
        doc.line(14, y, 196, y); y += 8;
        doc.setTextColor(0); doc.setFont('helvetica', 'normal');

        const dateDisplay = new Date(appointment?.appointmentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

        autoTable(doc, {
            startY: y,
            body: [
                ['Patient Name', pt.name || '-'],
                ['MRN / ID', pt.patientId || 'N/A'],
                ['Phone', pt.phone || '-'],
                ['Doctor', `Dr. ${appointment?.doctorName || user?.name || '-'}`],
                ['Date & Time', `${dateDisplay} @ ${appointment?.appointmentTime || '-'}`],
                ['Service', appointment?.serviceName || 'Consultation'],
                ['Consultation Fee', `Rs. ${Number(appointment?.amount || 0).toLocaleString('en-IN')}`],
                ['Payment Method', appointment?.paymentMethod || 'Cash'],
                ['Payment Status', (appointment?.paymentStatus || 'Paid').toUpperCase() + ' \u2713'],
            ],
            theme: 'grid',
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52 } },
            bodyStyles: { fontSize: 10 },
            alternateRowStyles: { fillColor: [245, 249, 255] },
        });

        y = doc.lastAutoTable.finalY + 10;
        doc.setDrawColor(200); doc.line(14, y, 196, y); y += 6;
        doc.setFontSize(8); doc.setTextColor(120);
        doc.text(`Doctor: Dr. ${appointment?.doctorName || user?.name || 'N/A'}`, 14, y);
        doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 196, y, { align: 'right' });
        y += 5;
        doc.text(`Thank you for choosing ${hName}`, 105, y, { align: 'center' });

        if (window.confirm("Do you want to download the Receipt PDF?")) {
            doc.save(`Receipt_${pt.patientId || 'Patient'}.pdf`);
        }
    };

    if (loading) {
        return (
            <div className="dpd-loading">
                <div className="dpd-spinner"></div>
                <p>Loading patient data...</p>
            </div>
        );
    }

    if (!appointment) {
        return (
            <div className="dpd-loading">
                <p>❌ Appointment not found.</p>
                <button onClick={() => navigate('/doctor/patients')} className="dpd-back-btn">← Back to Dashboard</button>
            </div>
        );
    }

    const calculateAge = (dobString) => {
        if (!dobString) return '';
        try {
            const dobDate = new Date(dobString);
            if (isNaN(dobDate.getTime())) return '';
            const diffMs = Date.now() - dobDate.getTime();
            const ageDate = new Date(diffMs); 
            return Math.abs(ageDate.getUTCFullYear() - 1970);
        } catch (e) {
            return '';
        }
    };

    const patient = appointment.userId || {};
    const profile = patient.fertilityProfile || intakeData;

    const effectiveAge = profile.age || intakeData.age || (patient.dob ? calculateAge(patient.dob) : '');
    const effectiveGender = profile.gender || intakeData.gender || patient.gender || '';
    const effectiveBloodGroup = profile.bloodGroup || intakeData.bloodGroup || patient.bloodGroup || '';
    const effectiveAddress = patient.address || profile.address || intakeData.address || patient.city || '';

    const effectiveHeight = profile.height || intakeData.height || appointment.vitals?.height || '';
    const effectiveWeight = profile.weight || intakeData.weight || appointment.vitals?.weight || '';
    const effectiveBMI = profile.bmi || intakeData.bmi || appointment.vitals?.bmi || '';

    const effectiveChiefComplaint = profile.chiefComplaint || intakeData.chiefComplaint || appointment.symptoms || '';
    const effectiveReasonForVisit = profile.reasonForVisit || intakeData.reasonForVisit || appointment.notes || '';

    const tabs = [
        { id: 'overview', label: 'Overview', icon: '📋' },
        { id: 'history', label: 'Past Visits', icon: '📜' },
        { id: 'reports', label: 'Reports & Files', icon: '📁' },
    ];

    // Dynamic Form Tabs Injection
    let dynamicTabs = [];
    if (dynamicLibrary) {
        let allowedDepts = hospitalDepartments.length > 0 ? hospitalDepartments : Object.keys(dynamicLibrary);
        
        allowedDepts.forEach(dept => {
            if (dynamicLibrary[dept] && typeof dynamicLibrary[dept] === 'object' && !Array.isArray(dynamicLibrary[dept])) {
                Object.keys(dynamicLibrary[dept]).forEach((catKey, i) => {
                    dynamicTabs.push({ 
                        id: `dyn_${dept.replace(/\s/g, '')}_${i}`, 
                        label: `${dept} - ${catKey}`, 
                        icon: '📋', 
                        data: dynamicLibrary[dept][catKey] 
                    });
                });
            }
        });
    }

    const allTabs = [...tabs, ...dynamicTabs];

    return (
        <div className="dpd-container" style={isJrDoctor ? { gridTemplateColumns: '1fr' } : {}}>
            {/* LEFT PANEL */}
            <div className="dpd-left">
                {/* Patient Header Card */}
                <div className="dpd-patient-header">
                    <button className="dpd-back-link" onClick={() => navigate('/doctor/patients')}>
                        ← Back
                    </button>
                    <div className="dpd-patient-identity">
                        <div className="dpd-patient-avatar">
                            {(patient.name || 'P')[0].toUpperCase()}
                        </div>
                        <div className="dpd-patient-meta">
                            <h2>{patient.name || 'Unknown Patient'}</h2>
                            <div className="dpd-patient-tags">
                                <span className="dpd-tag tag-mrn">MRN: {patient.patientId || 'N/A'}</span>
                                <span className="dpd-tag tag-phone">📱 {patient.phone || '-'}</span>
                                {effectiveAge && <span className="dpd-tag tag-age">Age: {effectiveAge}</span>}
                                {effectiveGender && <span className="dpd-tag tag-gender">{effectiveGender}</span>}
                                {effectiveBloodGroup && <span className="dpd-tag tag-blood">🩸 {effectiveBloodGroup}</span>}
                            </div>
                        </div>
                    </div>
                    <div className="dpd-appt-info">
                        <div className="dpd-appt-item">
                            <span className="dpd-appt-label">Date</span>
                            <span className="dpd-appt-value">{new Date(appointment.appointmentDate).toLocaleDateString('en-IN')}</span>
                        </div>
                        <div className="dpd-appt-item">
                            <span className="dpd-appt-label">Time</span>
                            <span className="dpd-appt-value">{appointment.appointmentTime}</span>
                        </div>
                        <div className="dpd-appt-item">
                            <span className="dpd-appt-label">Status</span>
                            <span className={`dpd-appt-status status-${appointment.status}`}>
                                {appointment.status} {isLocked && '🔒 Locked'}
                            </span>
                        </div>
                        <div className="dpd-appt-item">
                            <span className="dpd-appt-label">Service</span>
                            <span className="dpd-appt-value">{appointment.serviceName || 'Consultation'}</span>
                        </div>
                    </div>
                </div>

                {/* Tabs Navigation */}
                <div className="dpd-tabs-container">
                    <button className="dpd-tab-scroll-btn" onClick={() => scrollTabs('left')} title="Scroll Left">‹</button>
                    <div className="dpd-tabs-nav" ref={tabsRef}>
                        {allTabs.map(tab => (
                            <button
                                key={tab.id}
                                className={`dpd-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                <span className="dpd-tab-icon">{tab.icon}</span>
                                <span className="dpd-tab-label">{tab.label}</span>
                            </button>
                        ))}
                    </div>
                    <button className="dpd-tab-scroll-btn" onClick={() => scrollTabs('right')} title="Scroll Right">›</button>
                </div>

                {/* Tab Content */}
                <div className="dpd-tab-content">
                    {/* OVERVIEW */}
                    {activeTab === 'overview' && (
                        <div className="dpd-tab-panel">
                            <h3 className="dpd-panel-title">📋 Patient Overview</h3>
                            <div className="dpd-overview-grid">
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Full Name</span>
                                    <span className="dpd-ov-value">{patient.name || '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Phone</span>
                                    <span className="dpd-ov-value">{patient.phone || '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Email</span>
                                    <span className="dpd-ov-value">{patient.email || '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Age</span>
                                    <span className="dpd-ov-value">{effectiveAge || '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Gender</span>
                                    <span className="dpd-ov-value">{effectiveGender || '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Blood Group</span>
                                    <span className="dpd-ov-value">{effectiveBloodGroup || '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Height</span>
                                    <span className="dpd-ov-value">{effectiveHeight ? `${effectiveHeight} cm` : '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Weight</span>
                                    <span className="dpd-ov-value">{effectiveWeight ? `${effectiveWeight} kg` : '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">BMI</span>
                                    <span className="dpd-ov-value">{effectiveBMI || '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Address</span>
                                    <span className="dpd-ov-value">{effectiveAddress || '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Chief Complaint</span>
                                    <span className="dpd-ov-value">{effectiveChiefComplaint || '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Reason for Visit</span>
                                    <span className="dpd-ov-value">{effectiveReasonForVisit || '-'}</span>
                                </div>
                            </div>

                            {/* Partner Quick Info */}
                            {(profile.partnerFirstName || intakeData.partnerFirstName) && (
                                <div className="dpd-partner-quick">
                                    <h4>👫 Spouse/Partner Info</h4>
                                    <div className="dpd-overview-grid">
                                        <div className="dpd-ov-card">
                                            <span className="dpd-ov-label">Partner Name</span>
                                            <span className="dpd-ov-value">{profile.partnerFirstName || intakeData.partnerFirstName || '-'} {profile.partnerLastName || intakeData.partnerLastName || ''}</span>
                                        </div>
                                        <div className="dpd-ov-card">
                                            <span className="dpd-ov-label">Partner Phone</span>
                                            <span className="dpd-ov-value">{profile.partnerMobile || intakeData.partnerMobile || '-'}</span>
                                        </div>
                                        <div className="dpd-ov-card">
                                            <span className="dpd-ov-label">Partner Age</span>
                                            <span className="dpd-ov-value">{profile.partnerAge || intakeData.partnerAge || profile.husbandAge || intakeData.husbandAge || '-'}</span>
                                        </div>
                                        <div className="dpd-ov-card">
                                            <span className="dpd-ov-label">Partner Blood Group</span>
                                            <span className="dpd-ov-value">{profile.partnerBloodGroup || intakeData.partnerBloodGroup || '-'}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* PAST VISITS HISTORY */}
                    {activeTab === 'history' && (
                        <div className="dpd-tab-panel">
                            <h3 className="dpd-panel-title">📜 Previous Consultations ({history.length})</h3>
                            {history.length === 0 ? (
                                <div className="dpd-empty-hist">
                                    <p>No previous visits recorded.</p>
                                </div>
                            ) : (
                                <div className="dpd-history-list">
                                    {history.map(h => (
                                        <div
                                            key={h._id}
                                            className={`dpd-history-card ${h._id === appointmentId ? 'current' : ''} ${viewingPastSession && viewingPastSession._id === h._id ? 'viewing-active' : ''}`}
                                            onClick={() => {
                                                if (h._id === appointmentId) setViewingPastSession(null);
                                                else setViewingPastSession(viewingPastSession && viewingPastSession._id === h._id ? null : h);
                                            }}
                                            style={{ cursor: 'pointer', transition: 'all 0.2s', border: viewingPastSession && viewingPastSession._id === h._id ? '2px solid #3b82f6' : '' }}
                                        >
                                            {viewingPastSession && viewingPastSession._id === h._id && (
                                                <div style={{ background: '#3b82f6', color: '#fff', padding: '2px 8px', fontSize: '11px', borderRadius: '4px', display: 'inline-block', marginBottom: '8px', fontWeight: 'bold' }}>
                                                    👁️ Viewing Right Now
                                                </div>
                                            )}
                                            <div className="dpd-hist-top">
                                                <span className="dpd-hist-date">
                                                    {new Date(h.visitDate || h.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </span>
                                                <span className={`dpd-hist-status status-${h.status}`}>{h.status}</span>
                                            </div>
                                            {/* Diagnosis */}
                                            <div className="dpd-hist-diagnosis">
                                                <strong>Diagnosis:</strong>{' '}
                                                {h.diagnosis || (h.doctorConsultation?.diagnosis?.length > 0
                                                    ? h.doctorConsultation.diagnosis.join(', ')
                                                    : null) || 'No diagnosis recorded'}
                                            </div>
                                            {/* Notes */}
                                            {(h.doctorNotes || h.notes || h.doctorConsultation?.clinicalNotes) && (
                                                <div className="dpd-hist-notes">
                                                    <strong>Notes:</strong> {h.doctorNotes || h.notes || h.doctorConsultation?.clinicalNotes}
                                                </div>
                                            )}
                                            {/* Prescription / Medicines */}
                                            {(h.pharmacy?.length > 0 || h.doctorConsultation?.prescription?.length > 0) && (
                                                <div className="dpd-hist-notes">
                                                    <strong>💊 Medicines:</strong>{' '}
                                                    {h.pharmacy?.length > 0 
                                                        ? h.pharmacy.map(p => `${p.medicineName} (${p.frequency || ''}, ${p.duration || ''})`).join(' · ')
                                                        : h.doctorConsultation.prescription.map(p => `${p.medicine} (${p.dosage}, ${p.duration})`).join(' · ')
                                                    }
                                                </div>
                                            )}
                                            {/* Lab Tests */}
                                            {(h.labTests?.length > 0 || h.doctorConsultation?.labTests?.length > 0) && (
                                                <div className="dpd-hist-notes">
                                                    <strong>🧪 Lab Tests:</strong>{' '}
                                                    {h.labTests?.length > 0
                                                        ? h.labTests.join(', ')
                                                        : h.doctorConsultation.labTests.join(', ')
                                                    }
                                                </div>
                                            )}
                                            {h._id === appointmentId && <span className="dpd-current-badge">📌 Current Session</span>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* REPORTS & FILES TAB */}
                    {activeTab === 'reports' && (
                        <ReportsFilesTab
                            appointment={appointment}
                            labReports={labReports}
                            onRecommendAdmission={async (notes, priority, requestedDepartment) => {
                                try {
                                    const res = await doctorAPI.recommendAdmission(appointmentId, notes, priority, requestedDepartment);
                                    if (res.success) {
                                        setAppointment(prev => ({
                                            ...prev,
                                            recommendAdmission: true,
                                            recommendAdmissionNotes: notes,
                                            recommendAdmissionPriority: priority,
                                            recommendAdmissionDept: requestedDepartment,
                                            admissionStatus: 'Pending Allocation'
                                        }));
                                        alert("🚨 Admission request sent to Reception successfully!");
                                    }
                                } catch (err) {
                                    alert("Failed to send admission request: " + err.message);
                                }
                            }}
                            onCancelRecommendAdmission={async () => {
                                if (window.confirm("Are you sure you want to cancel the admission request?")) {
                                    try {
                                        const res = await doctorAPI.cancelRecommendAdmission(appointmentId);
                                        if (res.success) {
                                            setAppointment(prev => ({
                                                ...prev,
                                                recommendAdmission: false,
                                                recommendAdmissionNotes: '',
                                                recommendAdmissionPriority: 'Normal',
                                                recommendAdmissionDept: '',
                                                admissionStatus: null,
                                                admissionWard: '',
                                                admissionBed: ''
                                            }));
                                            alert("✕ Admission request cancelled successfully!");
                                        }
                                    } catch (err) {
                                        alert("Failed to cancel admission request: " + (err.response?.data?.message || err.message));
                                    }
                                }
                            }}
                        />
                    )}

                    {/* DYNAMIC FORMS RENDERER */}
                    {dynamicTabs.map(dTab => (
                        activeTab === dTab.id && (
                            <div key={dTab.id} style={{ display: 'block' }}>
                                <DynamicQuestionForm
                                    categoryName={dTab.label}
                                    questions={dTab.data}
                                    intakeData={intakeData}
                                    setIntakeData={setIntakeData}
                                    readOnly={isLocked}
                                />
                                {!isLocked && (
                                    <button className="dpd-save-section" onClick={handleSaveProfile} disabled={saving} style={{ marginTop: '20px' }}>
                                        {saving ? 'Saving...' : `💾 Save ${dTab.label} Data`}
                                    </button>
                                )}
                            </div>
                        )
                    ))}
                </div>
            </div>

            {/* RIGHT PANEL - SESSION NOTEPAD */}
            {!isJrDoctor && (
                <div className={`dpd-right ${viewingPastSession ? 'time-machine-active' : ''}`} style={viewingPastSession ? { background: '#f8fafc', borderLeft: '4px solid #3b82f6' } : {}}>
                    {viewingPastSession ? (
                    <>
                        <div className="dpd-right-header" style={{ background: '#eff6ff', borderBottom: '1px solid #bfdbfe' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <h2 style={{ color: '#1e3a8a' }}>🕰️ Past Session</h2>
                                    <span style={{ fontSize: '12px', background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>Read-only</span>
                                </div>
                                <p className="dpd-right-subtitle" style={{ color: '#3b82f6', fontWeight: 600 }}>
                                    Viewing notes from {new Date(viewingPastSession.appointmentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </p>
                            </div>
                            <button
                                onClick={() => setViewingPastSession(null)}
                                style={{ padding: '6px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                ✕ Exit Time Machine
                            </button>
                        </div>

                        <div className="dpd-right-content">
                            <div className="dpd-session-field">
                                <label>🔍 Diagnosis at the time</label>
                                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.7)', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#334155' }}>
                                    {viewingPastSession.diagnosis || <em style={{ color: '#94a3b8' }}>No diagnosis recorded</em>}
                                </div>
                            </div>

                            <div className="dpd-session-field">
                                <label>📋 Clinical Notes</label>
                                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.7)', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#334155', minHeight: '80px', whiteSpace: 'pre-wrap' }}>
                                    {viewingPastSession.doctorNotes || <em style={{ color: '#94a3b8' }}>No notes recorded</em>}
                                </div>
                            </div>

                            <div className="dpd-session-field">
                                <label>💊 Prescription Given</label>
                                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.7)', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#334155', minHeight: '60px' }}>
                                    {viewingPastSession.pharmacy?.length > 0 ? (
                                        <ul style={{ margin: 0, paddingLeft: '20px' }}>
                                            {viewingPastSession.pharmacy.map((p, i) => (
                                                <li key={i}>
                                                    <strong>{p.medicineName}</strong> {p.saltName && `(${p.saltName})`} — {p.frequency || p.dose || ''} for {p.duration || p.days || ''}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : <em style={{ color: '#94a3b8' }}>No prescription recorded</em>}
                                </div>
                            </div>

                            <div className="dpd-session-field">
                                <label>🧪 Lab Tests Ordered</label>
                                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.7)', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#334155' }}>
                                    {(viewingPastSession.labTests || []).length > 0
                                        ? (viewingPastSession.labTests || []).join(', ')
                                        : <em style={{ color: '#94a3b8' }}>No lab tests ordered</em>}
                                </div>
                            </div>
                        </div>

                        <div className="dpd-right-footer" style={{ background: '#f1f5f9' }}>
                            <button
                                onClick={() => {
                                    setSessionData({
                                        diagnosis: viewingPastSession.diagnosis || '',
                                        notes: viewingPastSession.doctorNotes || '',
                                        medicines: (viewingPastSession.pharmacy || []).map(p => ({
                                            medicineName: p.medicineName || '',
                                            saltName: p.saltName || '',
                                            dose: p.frequency || p.dose || '',
                                            days: p.duration || p.days || ''
                                        })),
                                        labTests: (viewingPastSession.labTests || []).join(', ')
                                    });
                                    setViewingPastSession(null);
                                    alert("Historical data copied into your Current Session editor!");
                                }}
                                style={{ padding: '10px 18px', background: 'transparent', color: '#3b82f6', border: '1px solid #3b82f6', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                📋 Copy to Current Session
                            </button>
                            <button className="dpd-btn-finish" onClick={() => setViewingPastSession(null)} style={{ background: '#64748b' }}>
                                Return to Current Editing
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="dpd-right-header">
                            <div>
                                <h2>📝 Current Session</h2>
                                <p className="dpd-right-subtitle">Record diagnosis, notes & prescription</p>
                            </div>
                            <span className={`dpd-session-status status-${appointment.status}`}>
                                {appointment.status}
                            </span>
                        </div>

                        {isLocked && (
                            <div style={{ padding: '15px', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '20px' }}>⚠️</span>
                                <div style={{ fontSize: '13px', color: '#92400e' }}>
                                    <b>Session Locked.</b> This clinical record has been marked as complete and is now immutable. 
                                    Contact administrator for any corrections.
                                </div>
                            </div>
                        )}

                        <div className="dpd-right-content">
                            <div className="dpd-session-field">
                                <label>🔍 Diagnosis</label>
                                <input
                                    name="diagnosis"
                                    value={sessionData.diagnosis}
                                    onChange={handleSessionChange}
                                    placeholder="Enter diagnosis..."
                                    className="dpd-diag-input"
                                    disabled={isLocked}
                                />
                            </div>

                            <div className="dpd-session-field dpd-notes-field">
                                <label>📋 Clinical Notes</label>
                                <textarea
                                    name="notes"
                                    value={sessionData.notes}
                                    onChange={handleSessionChange}
                                    placeholder="Write detailed clinical notes, observations, examination findings..."
                                    className="dpd-notes-textarea"
                                    disabled={isLocked}
                                />
                            </div>

                            {/* Inline Medicines & Lab Tests Section */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', borderTop: '1px solid #e2e8f0', paddingTop: '20px', marginTop: '10px' }}>
                                {/* Medicines Subsection */}
                                <div>
                                    <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span>💊</span> Prescribe Medicines
                                    </h3>

                                    {/* Read-Only State */}
                                    {isLocked ? (
                                        <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                            {appointment.pharmacy && appointment.pharmacy.length > 0 ? (
                                                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem', color: '#334155' }}>
                                                    {appointment.pharmacy.map((med, idx) => (
                                                        <li key={idx} style={{ marginBottom: '6px' }}>
                                                            <strong>{med.medicineName}</strong> {med.saltName && `(${med.saltName})`} — {med.frequency} for {med.duration}
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <span style={{ fontSize: '0.9rem', color: '#64748b', fontStyle: 'italic' }}>No medicines prescribed.</span>
                                            )}
                                        </div>
                                    ) : (
                                        <>
                                            {/* Quick-add catalog */}
                                            {catalogMedicines.length > 0 && (
                                                <div style={{ marginBottom: '14px' }}>
                                                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Quick-add from inventory:</div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                        {/* Pharmacy inventory items */}
                                                        {catalogMedicines.map(med => {
                                                            const isIncluded = sessionData.medicines.some(m => m.medicineName === med.name);
                                                            return (
                                                                <button
                                                                    key={med._id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        if (isIncluded) {
                                                                            setSessionData(prev => ({ ...prev, medicines: prev.medicines.filter(m => m.medicineName !== med.name) }));
                                                                        } else {
                                                                            setSessionData(prev => ({ ...prev, medicines: [...prev.medicines, { medicineName: med.name, saltName: med.genericName || '', dose: '1 OD', days: '5' }] }));
                                                                        }
                                                                    }}
                                                                    style={{ padding: '5px 12px', fontSize: '11px', border: `1px solid ${isIncluded ? '#3b82f6' : '#cbd5e1'}`, borderRadius: '20px', background: isIncluded ? '#eff6ff' : '#ffffff', color: isIncluded ? '#1d4ed8' : '#475569', cursor: 'pointer', fontWeight: isIncluded ? '700' : '400', transition: 'all 0.15s' }}
                                                                >
                                                                    {isIncluded ? '✓ ' : '+ '}{med.name}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Medicines Form Table */}
                                            <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                                    <thead>
                                                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                            <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#475569', width: '35%' }}>Name</th>
                                                            <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#475569', width: '25%' }}>Salt</th>
                                                            <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#475569', width: '22%' }}>Frequency</th>
                                                            <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#475569', width: '13%' }}>Days</th>
                                                            <th style={{ padding: '10px', textAlign: 'center', fontWeight: '700', color: '#475569', width: '5%' }}></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {sessionData.medicines.map((med, idx) => (
                                                            <tr key={idx} style={{ background: idx % 2 === 0 ? '#ffffff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                                                                <td style={{ padding: '6px' }}>
                                                                    <input
                                                                        value={med.medicineName}
                                                                        onChange={e => setSessionData(prev => { const m = [...prev.medicines]; m[idx] = { ...m[idx], medicineName: e.target.value }; return { ...prev, medicines: m }; })}
                                                                        placeholder="e.g. Paracetamol"
                                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 8px', fontSize: '12px', boxSizing: 'border-box' }}
                                                                    />
                                                                </td>
                                                                <td style={{ padding: '6px' }}>
                                                                    <input
                                                                        value={med.saltName}
                                                                        onChange={e => setSessionData(prev => { const m = [...prev.medicines]; m[idx] = { ...m[idx], saltName: e.target.value }; return { ...prev, medicines: m }; })}
                                                                        placeholder="Generic salt"
                                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 8px', fontSize: '12px', boxSizing: 'border-box' }}
                                                                    />
                                                                </td>
                                                                <td style={{ padding: '6px' }}>
                                                                    <input
                                                                        value={med.dose}
                                                                        onChange={e => setSessionData(prev => { const m = [...prev.medicines]; m[idx] = { ...m[idx], dose: e.target.value }; return { ...prev, medicines: m }; })}
                                                                        placeholder="1-0-1"
                                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 8px', fontSize: '12px', boxSizing: 'border-box' }}
                                                                    />
                                                                </td>
                                                                <td style={{ padding: '6px' }}>
                                                                    <input
                                                                        value={med.days}
                                                                        onChange={e => setSessionData(prev => { const m = [...prev.medicines]; m[idx] = { ...m[idx], days: e.target.value }; return { ...prev, medicines: m }; })}
                                                                        placeholder="5"
                                                                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 8px', fontSize: '12px', boxSizing: 'border-box' }}
                                                                    />
                                                                </td>
                                                                <td style={{ padding: '6px', textAlign: 'center' }}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setSessionData(prev => ({ ...prev, medicines: prev.medicines.filter((_, i) => i !== idx) }))}
                                                                        style={{ background: '#fee2e2', border: 'none', borderRadius: '4px', color: '#dc2626', width: '24px', height: '24px', cursor: 'pointer', fontSize: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                                    >×</button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                        {sessionData.medicines.length === 0 && (
                                                            <tr>
                                                                <td colSpan={5} style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                                                                    No medicines added yet.
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setSessionData(prev => ({ ...prev, medicines: [...prev.medicines, { medicineName: '', saltName: '', dose: '', days: '' }] }))}
                                                style={{ marginTop: '8px', padding: '6px 14px', fontSize: '12px', background: '#f0fdf4', border: '1px dashed #86efac', borderRadius: '6px', color: '#16a34a', cursor: 'pointer', fontWeight: '600' }}
                                            >
                                                + Add Medicine
                                            </button>
                                        </>
                                    )}
                                </div>

                                <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '0' }} />

                                {/* Lab Tests Subsection */}
                                <div>
                                    <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span>🧪</span> Order Lab Tests
                                    </h3>

                                    {/* Read-Only State */}
                                    {isLocked ? (
                                        <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.9rem', color: '#334155' }}>
                                            {appointment.labTests && appointment.labTests.length > 0 ? (
                                                <span>Ordered tests: {appointment.labTests.join(', ')}</span>
                                            ) : (
                                                <span style={{ fontStyle: 'italic', color: '#64748b' }}>No lab tests ordered.</span>
                                            )}
                                        </div>
                                    ) : (
                                        <>
                                            {/* Catalog Select checkboxes */}
                                            {catalogTests.length > 0 && (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px', marginBottom: '14px' }}>
                                                    {catalogTests.filter(t => t.isActive).map(test => {
                                                        const isChecked = sessionData.labTests.split(/(?:,\s*)+(?![^(]*\))/).map(s => s.trim()).includes(test.name);
                                                        return (
                                                            <label key={test._id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12px', cursor: 'pointer', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', background: isChecked ? '#eff6ff' : '#fafafa', borderColor: isChecked ? '#93c5fd' : '#e2e8f0', transition: 'all 0.15s' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked}
                                                                    onChange={(e) => {
                                                                        let currentTests = sessionData.labTests ? sessionData.labTests.split(/(?:,\s*)+(?![^(]*\))/).map(s => s.trim()).filter(Boolean) : [];
                                                                        if (e.target.checked) {
                                                                            currentTests.push(test.name);
                                                                        } else {
                                                                            currentTests = currentTests.filter(t => t !== test.name);
                                                                        }
                                                                        setSessionData(prev => ({ ...prev, labTests: currentTests.join(', ') }));
                                                                    }}
                                                                    style={{ marginTop: '2px', cursor: 'pointer', width: '14px', height: '14px' }}
                                                                />
                                                                <div>
                                                                    <div style={{ fontWeight: '700', color: '#334155' }}>{test.name}</div>
                                                                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '1px' }}>{test.category}</div>
                                                                </div>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Selected Tests List (comma separated):</label>
                                            <input
                                                name="labTests"
                                                value={sessionData.labTests}
                                                onChange={handleSessionChange}
                                                placeholder="CBC, Lipid Profile, LFT..."
                                                className="dpd-diag-input"
                                                style={{ width: '100%', boxSizing: 'border-box' }}
                                            />
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="dpd-reschedule-option" style={{ 
                            padding: '16px 20px', 
                            borderTop: '1px solid #e2e8f0', 
                            background: requestReportFollowUp ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' : '#f8fafc',
                            borderLeft: requestReportFollowUp ? '4px solid #22c55e' : '4px solid transparent',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px'
                        }}>
                            <label style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '10px', 
                                cursor: 'pointer',
                                width: '100%',
                                userSelect: 'none'
                            }}>
                                <input
                                    type="checkbox"
                                    checked={requestReportFollowUp}
                                    disabled={isLocked}
                                    onChange={(e) => setRequestReportFollowUp(e.target.checked)}
                                    style={{ 
                                        width: '18px', 
                                        height: '18px', 
                                        cursor: 'pointer',
                                        accentColor: '#16a34a',
                                        transition: 'transform 0.15s ease'
                                    }}
                                    className="dpd-reschedule-checkbox"
                                />
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ 
                                        fontSize: '14px', 
                                        fontWeight: '700', 
                                        color: requestReportFollowUp ? '#15803d' : '#1e293b',
                                        transition: 'color 0.3s ease'
                                    }}>
                                        📅 Reschedule for Report Review
                                    </span>
                                    <span style={{ 
                                        fontSize: '11px', 
                                        color: requestReportFollowUp ? '#166534' : '#64748b',
                                        marginTop: '2px'
                                    }}>
                                        Flag this patient to be rescheduled by the receptionist once reports are generated.
                                    </span>
                                </div>
                            </label>
                        </div>


                        <div className="dpd-right-footer">
                            {!isLocked ? (
                                <>
                                    <button className="dpd-btn-save-draft" onClick={handleSaveProfile} disabled={saving}>
                                        💾 Save Profile
                                    </button>
                                    <button className="dpd-btn-finish" onClick={handleSaveAndMerge} disabled={saving}>
                                        {saving ? '⏳ Saving...' : '✅ Save & Generate Prescription'}
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        className="dpd-btn-save-draft"
                                        onClick={generatePrescriptionPDF}
                                    >
                                        📄 Reprint Prescription
                                    </button>
                                    <button className="dpd-btn-finish" onClick={() => navigate('/doctor/patients')} style={{ background: '#64748b' }}>
                                        ← Back to Queue
                                    </button>
                                </>
                            )}
                        </div>
                    </>
                )}
            </div>
            )}
        </div>
    );
};

export default DoctorPatientDetails;