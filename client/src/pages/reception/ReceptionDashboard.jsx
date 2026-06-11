import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { receptionAPI, publicAPI, hospitalAPI, uploadAPI, admissionAPI } from '../../utils/api';
import socket from '../../utils/socket';
import { useAuth } from '../../store/hooks';
import { getSubdomain } from '../../utils/subdomain';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './ReceptionDashboard.css';

// Standard ward → bed mapping for dropdown selection
const FALLBACK_WARD_BED_MAP = {
    'General Ward':    ['G-01','G-02','G-03','G-04','G-05','G-06','G-07','G-08'],
    'ICU':             ['ICU-1','ICU-2','ICU-3','ICU-4','ICU-5','ICU-6'],
    'NICU':            ['NICU-1','NICU-2','NICU-3','NICU-4'],
    'CCU':             ['CCU-1','CCU-2','CCU-3','CCU-4'],
    'Paediatric Ward': ['P-01','P-02','P-03','P-04','P-05'],
    'Maternity Ward':  ['M-01','M-02','M-03','M-04','M-05','M-06'],
    'Orthopaedic Ward':['O-01','O-02','O-03','O-04','O-05'],
    'Surgical Ward':   ['S-01','S-02','S-03','S-04','S-05','S-06'],
    'Emergency Ward':  ['ER-1','ER-2','ER-3','ER-4'],
    'Private Room':    ['PR-101','PR-102','PR-103','PR-104','PR-105','PR-106','PR-107','PR-108'],
};

const timeSlots = [
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '14:00', '14:30', '15:00', '15:30',
    '16:00', '16:30', '17:00', '17:30'
];

const ReceptionDashboard = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const { user: currentUser } = useAuth();
    const [appointments, setAppointments] = useState([]);
    const [doctorsList, setDoctorsList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState(
        location.state?.openIntake ? 'intake' :
        searchParams.get('view') === 'collection' ? 'transactions' :
        'dashboard'
    );
    const [selectedPatientId, setSelectedPatientId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [profilePatient, setProfilePatient] = useState(null);
    const [profileAppointments, setProfileAppointments] = useState([]);
    const [transactions, setTransactions] = useState([]);

    // Patient name autocomplete in intake form
    const [nameSuggestions, setNameSuggestions] = useState([]);
    const [showNameSuggestions, setShowNameSuggestions] = useState(false);
    const nameSearchTimerRef = useRef(null);

    // Token mode — next token preview
    const [nextToken, setNextToken] = useState(null);

    // Payment confirm modal
    const [paymentModal, setPaymentModal] = useState({ open: false, appointment: null, method: 'Cash' });
    const [confirmingPayment, setConfirmingPayment] = useState(false);

    const [hospitalizeModal, setHospitalizeModal] = useState({ open: false, appointment: null });
    const [hospitalizeForm, setHospitalizeForm] = useState({ ward: '', bedNumber: '', privateRoom: false, admissionDate: new Date().toISOString().split('T')[0], notes: '', facilityDays: {} });
    const [hospitalizingSaving, setHospitalizingSaving] = useState(false);

    // Admitted Patients Section
    const [admissions, setAdmissions] = useState([]);
    const [admissionsLoading, setAdmissionsLoading] = useState(false);
    const [dischargeModal, setDischargeModal] = useState({ open: false, admission: null });
    const [dischargeForm, setDischargeForm] = useState({ dischargeDate: new Date().toISOString().split('T')[0], notes: '' });
    const [dischargingSaving, setDischargingSaving] = useState(false);
    const [admissionSearchQuery, setAdmissionSearchQuery] = useState('');
    const [admissionStatusTab, setAdmissionStatusTab] = useState('active');
    // Edit ward/bed modal
    const [editAdmissionModal, setEditAdmissionModal] = useState({ open: false, admission: null });
    const [editAdmissionForm, setEditAdmissionForm] = useState({ ward: '', bedNumber: '', privateRoom: false, notes: '', admissionDate: '', dailyWardCharge: '' });
    const [editAdmissionSaving, setEditAdmissionSaving] = useState(false);
    // Payment collect modal (before discharge)
    const [collectPaymentModal, setCollectPaymentModal] = useState({ open: false, admission: null, method: 'Cash' });
    const [collectingPayment, setCollectingPayment] = useState(false);

    // Availability
    const [availabilityCheck, setAvailabilityCheck] = useState({
        doctorId: '', date: new Date().toISOString().split('T')[0], bookedSlots: []
    });

    // Rescheduling states
    const [rescheduleModal, setRescheduleModal] = useState({ open: false, appointment: null });
    const [rescheduleForm, setRescheduleForm] = useState({ date: '', time: '' });
    const [rescheduleBookedSlots, setRescheduleBookedSlots] = useState([]);
    const [rescheduleAvailableTimes, setRescheduleAvailableTimes] = useState([]);
    const [parentAppointmentId, setParentAppointmentId] = useState(null);

    // SIMPLIFIED INTAKE STATE (Removed medical history)
    const [intakeForm, setIntakeForm] = useState({
        // Identity
        title: 'Mrs.', firstName: '', middleName: '', lastName: '',
        dob: '', age: '', gender: 'Female', mobile: '', email: '',
        address: '', aadhaar: '', isAadhaarVerified: false,

        // Partner
        partnerTitle: 'Mr.', partnerFirstName: '', partnerLastName: '', partnerMobile: '',

        // Vitals / Payment (Reception Duties)
        height: '', weight: '', bmi: '', bloodGroup: '',
        consultationFee: '',

        // Assignment
        department: '', doctor: '', visitDate: new Date().toISOString().split('T')[0], visitTime: '',
        referralType: '', reasonForVisit: '', paymentMethod: 'Cash'
    });

    const [paymentScreenshot, setPaymentScreenshot] = useState(null);
    const [selectedPastReports, setSelectedPastReports] = useState([]);
    const [newReportName, setNewReportName] = useState('');
    const [newReportFile, setNewReportFile] = useState(null);

    const handleAddPastReportToList = () => {
        if (!newReportFile) {
            alert("Please select a report file first.");
            return;
        }
        const nameToUse = newReportName.trim() || newReportFile.name;
        setSelectedPastReports(prev => [...prev, { file: newReportFile, name: nameToUse }]);
        setNewReportFile(null);
        setNewReportName('');
        const fileEl = document.getElementById('past-report-file-picker');
        if (fileEl) fileEl.value = '';
    };

    const handleRemovePastReportFromList = (idxToRemove) => {
        setSelectedPastReports(prev => prev.filter((_, idx) => idx !== idxToRemove));
    };

    const [verifyingAadhaar, setVerifyingAadhaar] = useState(false);
    const [otpSent, setOtpSent] = useState(false);
    const [aadhaarOtp, setAadhaarOtp] = useState('');
    const [hospitalContext, setHospitalContext] = useState(null);

    const WARD_BED_MAP = useMemo(() => {
        if (!hospitalContext?.facilities || hospitalContext.facilities.length === 0) return FALLBACK_WARD_BED_MAP;
        const map = {};
        hospitalContext.facilities.forEach(fac => {
            const count = fac.bedCount || 0;
            if (count > 0) {
                const prefix = fac.name.substring(0, 3).toUpperCase();
                map[fac.name] = Array.from({ length: count }, (_, i) => `${prefix}-${i + 1}`);
            } else {
                map[fac.name] = [];
            }
        });
        return map;
    }, [hospitalContext]);
    const [statusFilter, setStatusFilter] = useState('all');
    const getLocalDateString = (d = new Date()) => {
        const offset = d.getTimezoneOffset();
        const localDate = new Date(d.getTime() - (offset * 60 * 1000));
        return localDate.toISOString().split('T')[0];
    };
    const todayStr = getLocalDateString();

    const [selectedQueueDate, setSelectedQueueDate] = useState(todayStr);
    const [dateTab, setDateTab] = useState('today'); // 'today', 'tomorrow', 'future', 'custom'
    const [completedAppointments, setCompletedAppointments] = useState([]);

    // Compute dynamic stats from appointments for the selected queue date/tab range
    const todayAppointments = appointments;
    const totalToday = todayAppointments.length;
    const pendingToday = todayAppointments.filter(a => a.status === 'pending').length;
    const confirmedToday = todayAppointments.filter(a => a.status === 'confirmed').length;
    const completedToday = todayAppointments.filter(a => a.status === 'completed').length;
    const cancelledToday = todayAppointments.filter(a => a.status === 'cancelled').length;
    const revenueToday = todayAppointments
        .filter(a => a.status === 'completed' || (a.paymentStatus || '').toLowerCase() === 'paid')
        .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
    const totalUniquePatients = new Set(appointments.map(a => a.userId?._id || a.patientId).filter(Boolean)).size;

    const filteredAppointments = (statusFilter === 'all' || statusFilter === 'report_follow_up')
        ? appointments
        : appointments.filter(a => a.status === statusFilter);

    const greeting = () => {
        const h = new Date().getHours();
        if (h < 12) return 'Good Morning';
        if (h < 17) return 'Good Afternoon';
        return 'Good Evening';
    };

    const fetchAppointments = async (dateVal, futureVal, tomorrowVal, isReportFollowUp) => {
        setLoading(true);
        try {
            const isFollowUp = isReportFollowUp !== undefined ? isReportFollowUp : statusFilter === 'report_follow_up';
            let response;
            if (isFollowUp) {
                response = await receptionAPI.getAllAppointments('', false, false, false, true);
            } else {
                const isFuture = futureVal !== undefined ? futureVal : dateTab === 'future';
                const isTomorrow = tomorrowVal !== undefined ? tomorrowVal : dateTab === 'tomorrow';
                const targetDate = (isFuture || isTomorrow) ? '' : (dateVal || selectedQueueDate);
                response = await receptionAPI.getAllAppointments(targetDate, isFuture, false, isTomorrow);
            }
            if (response.success) setAppointments(response.appointments);
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    useEffect(() => {
        if (location.state?.openIntake) {
            setViewMode('intake');
            // Clear the state so refreshing doesn't keep opening it
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, navigate]);

    useEffect(() => {
        const viewParam = searchParams.get('view');
        if (viewParam === 'collection') {
            setViewMode('transactions');
        } else if (!viewParam && location.pathname === '/reception/dashboard') {
            // Sidebar "Reception Dashboard" click navigates here without params — reset if on collection view
            setViewMode(prev => (prev === 'transactions' ? 'dashboard' : prev));
        }
    }, [searchParams, location.pathname]);

    useEffect(() => {
        const fetchHospital = async () => {
            try {
                const sub = getSubdomain();
                const res = await hospitalAPI.resolveHospital(sub);
                if (res.success) setHospitalContext(res.hospital);
            } catch (err) { console.error('Error fetching hospital context:', err); }
        };
        fetchHospital();
        fetchAppointments(selectedQueueDate, dateTab === 'future', dateTab === 'tomorrow');
        fetchDoctors();
        fetchAdmissions();
        fetchTransactions();
    }, []);

    // Listen to real-time socket notifications to refresh queues instantly
    useEffect(() => {
        const handleNewNotification = (notif) => {
            if (notif.referenceType === 'ClinicalVisit' || notif.message?.includes('admission') || notif.message?.includes('admit')) {
                fetchAppointments(selectedQueueDate, dateTab === 'future', dateTab === 'tomorrow');
                fetchAdmissions();
                fetchTransactions();
                if (statusFilter === 'completed') {
                    fetchCompletedPatients();
                }
            }
        };

        // Immediately upsert the new admission into state so the card appears instantly,
        // then also trigger a background re-fetch for full consistency
        const handleAdmissionCreated = (newAdm) => {
            if (newAdm && newAdm._id) {
                setAdmissions(prev => {
                    const exists = prev.some(a => a._id === newAdm._id);
                    if (exists) {
                        return prev.map(a => a._id === newAdm._id ? { ...a, ...newAdm } : a);
                    }
                    return [newAdm, ...prev];
                });
            }
            // Background re-fetch to ensure data is fully in sync
            fetchAdmissions();
            fetchAppointments(selectedQueueDate, dateTab === 'future', dateTab === 'tomorrow');
            fetchTransactions();
            if (statusFilter === 'completed') fetchCompletedPatients();
        };

        const handleAdmissionUpdated = (updatedAdm) => {
            if (updatedAdm && updatedAdm._id) {
                setAdmissions(prev => prev.map(a => a._id === updatedAdm._id ? { ...a, ...updatedAdm } : a));
            }
            fetchAdmissions();
            fetchAppointments(selectedQueueDate, dateTab === 'future', dateTab === 'tomorrow');
            fetchTransactions();
            if (statusFilter === 'completed') fetchCompletedPatients();
        };

        const handleAdmissionDischarged = (dischargedAdm) => {
            if (dischargedAdm && dischargedAdm._id) {
                setAdmissions(prev => prev.map(a => a._id === dischargedAdm._id ? { ...a, ...dischargedAdm } : a));
            }
            fetchAdmissions();
            fetchAppointments(selectedQueueDate, dateTab === 'future', dateTab === 'tomorrow');
            fetchTransactions();
            if (statusFilter === 'completed') fetchCompletedPatients();
        };

        const handleLiveRefresh = () => {
            fetchAppointments(selectedQueueDate, dateTab === 'future', dateTab === 'tomorrow');
            fetchAdmissions();
            fetchTransactions();
            if (statusFilter === 'completed') fetchCompletedPatients();
        };

        socket.on('new_notification', handleNewNotification);
        socket.on('admission_created', handleAdmissionCreated);
        socket.on('admission_updated', handleAdmissionUpdated);
        socket.on('admission_discharged', handleAdmissionDischarged);
        socket.on('invoice_generated', handleLiveRefresh);
        socket.on('payment_received', handleLiveRefresh);
        socket.on('invoice_paid', handleLiveRefresh);
        socket.on('refund_processed', handleLiveRefresh);
        socket.on('appointment_created', handleLiveRefresh);
        socket.on('appointment_updated', handleLiveRefresh);
        socket.on('patient_status_changed', handleLiveRefresh);

        return () => {
            socket.off('new_notification', handleNewNotification);
            socket.off('admission_created', handleAdmissionCreated);
            socket.off('admission_updated', handleAdmissionUpdated);
            socket.off('admission_discharged', handleAdmissionDischarged);
            socket.off('invoice_generated', handleLiveRefresh);
            socket.off('payment_received', handleLiveRefresh);
            socket.off('invoice_paid', handleLiveRefresh);
            socket.off('refund_processed', handleLiveRefresh);
            socket.off('appointment_created', handleLiveRefresh);
            socket.off('appointment_updated', handleLiveRefresh);
            socket.off('patient_status_changed', handleLiveRefresh);
        };
    }, [selectedQueueDate, dateTab, statusFilter]);


    useEffect(() => {
        if (statusFilter === 'completed') {
            fetchCompletedPatients();
        } else if (statusFilter === 'report_follow_up') {
            fetchAppointments(undefined, undefined, undefined, true);
        } else {
            fetchAppointments(selectedQueueDate, dateTab === 'future', dateTab === 'tomorrow', false);
        }
    }, [statusFilter]);

    useEffect(() => {
        if (availabilityCheck.doctorId && availabilityCheck.date) {
            fetchBookedSlots(availabilityCheck.doctorId, availabilityCheck.date);
        }
    }, [availabilityCheck.doctorId, availabilityCheck.date]);

    // Load booked slots when rescheduling doctor/date changes
    useEffect(() => {
        const fetchSlots = async () => {
            if (rescheduleModal.appointment && rescheduleForm.date) {
                try {
                    const hospitalId = hospitalContext?._id || '';
                    const res = await receptionAPI.getBookedSlots(rescheduleModal.appointment.doctorId?._id || rescheduleModal.appointment.doctorId, rescheduleForm.date, hospitalId);
                    if (res.success) {
                        setRescheduleBookedSlots(res.bookedSlots || []);
                    }
                } catch (err) {
                    console.error(err);
                }
            }
        };
        fetchSlots();
    }, [rescheduleModal.appointment, rescheduleForm.date, hospitalContext]);

    // Available times logic for Rescheduling
    useEffect(() => {
        if (!rescheduleForm.date || !rescheduleModal.appointment) return;
        const baseTimes = [
            '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
            '12:00', '12:30', '14:00', '14:30', '15:00', '15:30',
            '16:00', '16:30', '17:00', '17:30'
        ];
        let times = baseTimes.filter(t => !rescheduleBookedSlots.includes(t));

        const doctorId = rescheduleModal.appointment.doctorId?._id || rescheduleModal.appointment.doctorId;
        if (doctorId && doctorsList.length > 0) {
            const doctor = doctorsList.find(d => d._id === doctorId);
            if (doctor && doctor.availability) {
                const dateObj = new Date(rescheduleForm.date);
                const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                const dayName = days[dateObj.getDay()];
                const schedule = doctor.availability[dayName];
                if (schedule && schedule.available === false) {
                    setRescheduleAvailableTimes([]);
                    return;
                }
                if (schedule && schedule.startTime && schedule.endTime) {
                    const getMin = (t) => {
                        const [h, m] = t.split(':').map(Number);
                        return h * 60 + m;
                    };
                    const start = getMin(schedule.startTime);
                    const end = getMin(schedule.endTime);
                    times = times.filter(t => {
                        const m = getMin(t);
                        return m >= start && m < end;
                    });
                }
            }
        }
        setRescheduleAvailableTimes(times);
    }, [rescheduleForm.date, rescheduleBookedSlots, rescheduleModal.appointment, doctorsList]);

    // Sync Form with Widget
    useEffect(() => {
        if (intakeForm.doctor && intakeForm.visitDate) {
            if (intakeForm.doctor !== availabilityCheck.doctorId || intakeForm.visitDate !== availabilityCheck.date) {
                setAvailabilityCheck(prev => ({
                    ...prev, doctorId: intakeForm.doctor, date: intakeForm.visitDate
                }));
            }
        }
    }, [intakeForm.doctor, intakeForm.visitDate]);

    // Fetch next token number when doctor + date selected and hospital is in token mode
    useEffect(() => {
        const isTokenMode = hospitalContext?.appointmentMode === 'token';
        if (!isTokenMode || !intakeForm.doctor || !intakeForm.visitDate || !hospitalContext?._id) {
            setNextToken(null);
            return;
        }
        hospitalAPI.getNextToken(hospitalContext._id, intakeForm.doctor, intakeForm.visitDate)
            .then(res => { if (res.success) setNextToken(res.nextToken); })
            .catch(() => setNextToken(null));
    }, [intakeForm.doctor, intakeForm.visitDate, hospitalContext]);

    // Auto-refresh interval removed in favor of real-time socket events

    const fetchTransactions = async () => {
        try {
            const res = await receptionAPI.getTransactions();
            if (res.success) setTransactions(res.transactions);
        } catch (err) { console.error(err); }
    };

    const fetchAdmissions = async () => {
        setAdmissionsLoading(true);
        try {
            const res = await admissionAPI.getActiveAdmissions();
            if (res.success) setAdmissions(res.admissions || []);
        } catch (err) { console.error('Error fetching admissions:', err); }
        finally { setAdmissionsLoading(false); }
    };

    const fetchCompletedPatients = async () => {
        setLoading(true);
        try {
            const res = await receptionAPI.getAllAppointments('', false, true);
            if (res.success) {
                const completed = (res.appointments || []).filter(a => a.status === 'completed');
                setCompletedAppointments(completed);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchDoctors = async () => {
        try {
            const response = await publicAPI.getDoctors();
            if (response.success && Array.isArray(response.doctors)) setDoctorsList(response.doctors);
        } catch (err) { console.error(err); }
    };

    const fetchBookedSlots = async (doctorId, date) => {
        try {
            const hospitalId = hospitalContext?._id || '';
            const response = await receptionAPI.getBookedSlots(doctorId, date, hospitalId);
            if (response.success) setAvailabilityCheck(prev => ({ ...prev, bookedSlots: response.bookedSlots || [] }));
        } catch (err) { console.error(err); }
    };

    // todayStr is defined at the component top

    const isSlotInPast = (time) => {
        if (intakeForm.visitDate !== todayStr) return false;
        const now = new Date();
        const [h, m] = time.split(':').map(Number);
        const slotTime = new Date();
        slotTime.setHours(h, m, 0, 0);
        return slotTime <= now;
    };

    const handleSlotClick = (time) => {
        if (availabilityCheck.bookedSlots.includes(time)) return;
        handleNewWalkIn();
        setIntakeForm(prev => ({
            ...prev, doctor: availabilityCheck.doctorId, visitDate: availabilityCheck.date, visitTime: time
        }));
    };

    const handleNewWalkIn = () => {
        setSelectedPatientId(null);
        setOtpSent(false);
        setAadhaarOtp('');
        setVerifyingAadhaar(false);
        setParentAppointmentId(null);
        setIntakeForm({
            title: 'Mrs.', firstName: '', middleName: '', lastName: '',
            dob: '', age: '', gender: 'Female', mobile: '', email: '',
            address: '', aadhaar: '', isAadhaarVerified: false,
            partnerTitle: 'Mr.', partnerFirstName: '', partnerLastName: '', partnerMobile: '',
            height: '', weight: '', bmi: '', bloodGroup: '',
            paymentStatus: 'Pending', consultationFee: hospitalContext?.appointmentFee ?? '500',
            department: '', doctor: '', visitDate: new Date().toISOString().split('T')[0], visitTime: '',
            referralType: '', reasonForVisit: '', paymentMethod: 'Cash'
        });
        setViewMode('intake');
    };

    const handleEditPatient = (patient) => {
        setSelectedPatientId(patient._id);
        setOtpSent(false);
        setAadhaarOtp('');
        setVerifyingAadhaar(false);
        setParentAppointmentId(null);
        const p = patient.fertilityProfile || {};
        const getVal = (val) => val || '';

        setIntakeForm(prev => ({
            ...prev,
            firstName: getVal(patient.name).split(' ')[0],
            lastName: getVal(patient.name).split(' ').slice(1).join(' '),
            mobile: getVal(patient.phone),
            email: getVal(patient.email),
            aadhaar: p.aadhaar || '',
            isAadhaarVerified: p.aadhaar ? true : false,
            ...p,
            consultationFee: hospitalContext?.appointmentFee ?? '500',
            department: '', doctor: '', visitDate: new Date().toISOString().split('T')[0], visitTime: ''
        }));
        setViewMode('intake');
    };

    const handleScheduleFollowUp = (apt) => {
        const patient = apt.userId || {
            name: apt.patientName || '',
            phone: apt.patientPhone || '',
            email: apt.patientEmail || '',
            gender: apt.patientGender || 'Male',
            dob: apt.patientDob || '',
            _id: apt.userId || apt.patientId
        };
        setSelectedPatientId(patient._id);
        setOtpSent(false);
        setAadhaarOtp('');
        setVerifyingAadhaar(false);
        const p = patient.fertilityProfile || {};
        const getVal = (val) => val || '';

        const doctorId = apt.doctorId?._id || apt.doctorId;
        const doctor = doctorsList.find(d => d._id === doctorId);
        const dept = doctor ? (doctor.departments?.[0] || doctor.specialty || doctor.specialization || '') : '';

        setIntakeForm(prev => ({
            ...prev,
            firstName: getVal(patient.name).split(' ')[0],
            lastName: getVal(patient.name).split(' ').slice(1).join(' '),
            mobile: getVal(patient.phone),
            email: getVal(patient.email),
            gender: getVal(patient.gender || 'Female'),
            dob: getVal(patient.dob ? new Date(patient.dob).toISOString().split('T')[0] : ''),
            aadhaar: p.aadhaar || '',
            isAadhaarVerified: p.aadhaar ? true : false,
            ...p,
            consultationFee: hospitalContext?.appointmentFee ?? '500',
            department: dept,
            doctor: doctorId,
            visitDate: new Date().toISOString().split('T')[0],
            visitTime: '',
            reasonForVisit: 'Report Review Follow-up',
            paymentMethod: 'Cash'
        }));
        setParentAppointmentId(apt._id);
        setViewMode('intake');
    };

    const handleViewProfile = (patient) => {
        navigate(`/patient/${patient._id}`);
    };

    const openHospitalizeModal = (apt) => {
        setHospitalizeForm({
            ward: '',
            bedNumber: '',
            privateRoom: false,
            admissionDate: new Date().toISOString().split('T')[0],
            notes: apt.recommendAdmissionNotes ? `Doctor Recommendation: ${apt.recommendAdmissionNotes}` : '',
            facilityDays: {}
        });
        setHospitalizeModal({ open: true, appointment: apt });
    };

    const handleHospitalize = async () => {
        const { appointment } = hospitalizeModal;
        const facilities = hospitalContext?.facilities || [];
        const selectedFacilities = facilities
            .filter(f => hospitalizeForm.facilityDays[f.name] > 0)
            .map(f => ({
                facilityName: f.name,
                pricePerDay: f.pricePerDay,
                days: Number(hospitalizeForm.facilityDays[f.name]),
                totalAmount: f.pricePerDay * Number(hospitalizeForm.facilityDays[f.name]),
            }));

        setHospitalizingSaving(true);
        try {
            // Derive patient name + phone from the appointment's populated userId
            const patientUser = appointment.userId || appointment.patientData || {};
            const patientName = patientUser.name ||
                [patientUser.firstName, patientUser.lastName].filter(Boolean).join(' ') ||
                appointment.patientName || '';
            const patientPhone = patientUser.phone || appointment.patientPhone || '';

            await admissionAPI.createAdmission({
                patientId: appointment.userId?._id || appointment.patientId,
                patientName,
                patientPhone,
                appointmentId: appointment._id,
                ward: hospitalizeForm.ward,
                bedNumber: hospitalizeForm.bedNumber,
                privateRoom: hospitalizeForm.privateRoom || false,
                admissionDate: hospitalizeForm.admissionDate,
                notes: hospitalizeForm.notes,
                selectedFacilities,
                dailyWardCharge: hospitalizeForm.dailyWardCharge || 0,
            });
            setHospitalizeModal({ open: false, appointment: null });
            // Refresh admissions list and switch to admitted view
            await fetchAdmissions();
            setViewMode('admitted');
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to admit patient');
        } finally {
            setHospitalizingSaving(false);
        }
    };

    const handleDischarge = async () => {
        const { admission } = dischargeModal;
        if (!admission) return;
        setDischargingSaving(true);
        try {
            await admissionAPI.dischargePatient(admission._id, {
                dischargeDate: dischargeForm.dischargeDate,
                notes: dischargeForm.notes,
            });
            setDischargeModal({ open: false, admission: null });
            setDischargeForm({ dischargeDate: new Date().toISOString().split('T')[0], notes: '' });
            await fetchAdmissions();
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to discharge patient');
        } finally {
            setDischargingSaving(false);
        }
    };

    const handleMarkAdmissionPaid = async (admissionId) => {
        try {
            await admissionAPI.markAdmissionPaid(admissionId);
            await fetchAdmissions();
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to mark as paid');
        }
    };

    const handleUpdateAdmission = async () => {
        const { admission } = editAdmissionModal;
        if (!admission) return;
        setEditAdmissionSaving(true);
        try {
            await admissionAPI.updateAdmission(admission._id, {
                ward: editAdmissionForm.ward,
                bedNumber: editAdmissionForm.bedNumber,
                privateRoom: editAdmissionForm.privateRoom || false,
                notes: editAdmissionForm.notes,
                admissionDate: editAdmissionForm.admissionDate,
                dailyWardCharge: editAdmissionForm.dailyWardCharge,
            });
            setEditAdmissionModal({ open: false, admission: null });
            await fetchAdmissions();
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Failed to update admission. Please try again.';
            alert(msg);
            console.error('[updateAdmission]', err);
        } finally {
            setEditAdmissionSaving(false);
        }
    };

    const handleCollectAdmissionPayment = async () => {
        const { admission } = collectPaymentModal;
        if (!admission) return;
        setCollectingPayment(true);
        try {
            await admissionAPI.markAdmissionPaid(admission._id);
            setCollectPaymentModal({ open: false, admission: null, method: 'Cash' });
            await fetchAdmissions();
            // Open discharge modal right after payment
            setDischargeForm({ dischargeDate: new Date().toISOString().split('T')[0], notes: '' });
            setDischargeModal({ open: true, admission: { ...admission, paymentStatus: 'Paid' } });
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to collect payment');
        } finally {
            setCollectingPayment(false);
        }
    };

    const generateAdmissionSlipPDF = (adm) => {
        const doc = new jsPDF();
        const hName = hospitalContext?.name || 'HOSPITAL';
        const hAddr = [hospitalContext?.address, hospitalContext?.city, hospitalContext?.state].filter(Boolean).join(', ');
        let y = 18;
        doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
        doc.text(hName, 105, y, { align: 'center' }); y += 7;
        if (hAddr) { doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100); doc.text(hAddr, 105, y, { align: 'center' }); y += 5; }
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(13, 148, 136);
        doc.text('ADMISSION SLIP', 105, y, { align: 'center' }); y += 5;
        doc.setDrawColor(13, 148, 136); doc.setLineWidth(0.5); doc.line(14, y, 196, y); y += 8;
        doc.setTextColor(0); doc.setFont('helvetica', 'normal');
        const admDate = new Date(adm.admissionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        autoTable(doc, {
            startY: y,
            body: [
                ['Patient Name', adm.patientId?.name || 'N/A'],
                ['Patient ID', adm.patientId?.patientId || 'N/A'],
                ['Phone', adm.patientId?.phone || '-'],
                ['Ward / Room', adm.ward || '-'],
                ['Bed Number', adm.bedNumber || '-'],
                ['Admission Date', admDate],
                ['Total Amount', `Rs. ${Number(adm.totalAmount || 0).toLocaleString('en-IN')}`],
                ['Payment Status', adm.paymentStatus || 'Pending'],
                ['Notes', adm.notes || '-'],
            ],
            theme: 'grid',
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52 } },
            bodyStyles: { fontSize: 10 },
            alternateRowStyles: { fillColor: [240, 253, 250] },
        });
        if (adm.selectedFacilities?.length > 0) {
            y = doc.lastAutoTable.finalY + 6;
            doc.setFontSize(11); doc.setFont('helvetica', 'bold');
            doc.text('Facility Charges', 14, y); y += 4;
            autoTable(doc, {
                startY: y,
                head: [['Facility', 'Per Day', 'Days', 'Total']],
                body: adm.selectedFacilities.map(f => [f.facilityName, `Rs.${f.pricePerDay}`, f.days, `Rs.${f.totalAmount}`]),
                theme: 'striped',
                headStyles: { fillColor: [13, 148, 136] },
                bodyStyles: { fontSize: 9 },
            });
        }
        y = doc.lastAutoTable.finalY + 8;
        doc.setFontSize(8); doc.setTextColor(120);
        doc.text(`Issued: ${new Date().toLocaleString('en-IN')}`, 14, y);
        doc.save(`AdmissionSlip_${adm.patientId?.patientId || adm._id}.pdf`);
    };

    const handleCancelAppointment = async (appointmentId) => {
        if (!window.confirm('Cancel this appointment?')) return;
        try {
            const res = await receptionAPI.cancelAppointment(appointmentId);
            if (res.success) fetchAppointments();
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to cancel appointment.');
        }
    };

    const handleCheckIn = async (apt) => {
        const patientUserId = apt.userId?._id || apt.userId;
        if (!patientUserId) {
            alert('Cannot check in: patient has no registered user account.');
            return;
        }
        try {
            await receptionAPI.checkIn({
                appointmentId: apt._id,
                patientId: patientUserId
            });
            fetchAppointments();
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to check in patient.');
        }
    };

    // ─── RECEIPT PDF GENERATOR ────────────────────────────────────────────────
    const generateReceiptPDF = (apt, paymentMethodOverride) => {
        const doc = new jsPDF();
        const hName = hospitalContext?.name || 'HOSPITAL';
        const hAddr = [hospitalContext?.address, hospitalContext?.city, hospitalContext?.state].filter(Boolean).join(', ');
        const hPhone = hospitalContext?.phone || '';
        const hEmail = hospitalContext?.email || '';
        const issuedBy = currentUser?.name || 'Reception Staff';
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

        const isToken = apt.tokenNumber != null;
        const dateDisplay = new Date(apt.appointmentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

        autoTable(doc, {
            startY: y,
            body: [
                ['Patient Name', apt.userId?.name || 'Walk-in'],
                ['MRN / ID', apt.userId?.patientId || apt.patientId || 'N/A'],
                ['Phone', apt.userId?.phone || '-'],
                ['Doctor', `Dr. ${apt.doctorName || '-'}`],
                isToken
                    ? ['Date / Token', `${dateDisplay}  —  Token #${apt.tokenNumber}`]
                    : ['Date & Time', `${dateDisplay} @ ${apt.appointmentTime || '-'}`],
                ['Service', apt.serviceName || 'Consultation'],
                ['Consultation Fee', `Rs. ${Number(apt.amount || 0).toLocaleString('en-IN')}`],
                ['Payment Method', paymentMethodOverride || apt.paymentMethod || 'Cash'],
                ['Payment Status', 'PAID ✓'],
            ],
            theme: 'grid',
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52 } },
            bodyStyles: { fontSize: 10 },
            alternateRowStyles: { fillColor: [245, 249, 255] },
        });

        y = doc.lastAutoTable.finalY + 10;
        doc.setDrawColor(200); doc.line(14, y, 196, y); y += 6;
        doc.setFontSize(8); doc.setTextColor(120);
        doc.text(`Issued by: ${issuedBy}`, 14, y);
        doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 196, y, { align: 'right' });
        y += 5;
        doc.text(`Thank you for choosing ${hName}`, 105, y, { align: 'center' });
        const pid = apt.userId?.patientId || apt.patientId || 'Patient';
        if (window.confirm("Do you want to download the Receipt PDF?")) {
            doc.save(`Receipt_${pid}.pdf`);
        }
    };

    const handleConfirmPayment = async () => {
        setConfirmingPayment(true);
        const { appointment, method } = paymentModal;
        try {
            await receptionAPI.confirmPayment(appointment._id, method, appointment.amount);
            generateReceiptPDF({ ...appointment, paymentMethod: method, paymentStatus: 'Paid' }, method);
            setPaymentModal({ open: false, appointment: null, method: 'Cash' });
            fetchAppointments();
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to confirm payment.');
        } finally {
            setConfirmingPayment(false);
        }
    };

    const submitReschedule = async (e) => {
        e.preventDefault();
        if (!rescheduleForm.date || !rescheduleForm.time) {
            alert('Please select both date and time.');
            return;
        }
        try {
            const res = await receptionAPI.rescheduleAppointment(
                rescheduleModal.appointment._id,
                rescheduleForm.date,
                rescheduleForm.time
            );
            if (res.success) {
                alert('Appointment rescheduled successfully.');
                setRescheduleModal({ open: false, appointment: null });
                fetchAppointments();
            } else {
                alert(res.message || 'Reschedule failed.');
            }
        } catch (err) {
            console.error(err);
            alert('Error rescheduling appointment.');
        }
    };

    const handleSearch = async (e) => {
        const query = e.target.value;
        setSearchQuery(query);
        if (query.length > 2) {
            try {
                const res = await receptionAPI.searchPatients(query);
                if (res.success) setSearchResults(res.patients);
            } catch (err) { console.error(err); }
        } else {
            setSearchResults([]);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;

        if (name === 'mobile' || name === 'partnerMobile') {
            const digitValue = value.replace(/\D/g, '').slice(0, 10);
            setIntakeForm(prev => ({ ...prev, [name]: digitValue }));
            return;
        }

        if (name === 'department' && hospitalContext) {
            const defaultFee = hospitalContext.departmentFees?.[value] ?? hospitalContext.appointmentFee ?? 500;
            setIntakeForm(prev => ({
                ...prev, [name]: value, consultationFee: defaultFee, doctor: '', visitTime: ''
            }));
            setAvailabilityCheck(prev => ({ ...prev, doctorId: '', bookedSlots: [] }));
            return;
        }

        if (name === 'visitDate') {
            // Prevent past dates
            if (value < todayStr) return;
            // Reset time slot when date changes (past slot may no longer be valid)
            setIntakeForm(prev => ({ ...prev, visitDate: value, visitTime: '' }));
            return;
        }

        // BMI Calculation
        if (name === 'height' || name === 'weight') {
            const h = name === 'height' ? value : intakeForm.height;
            const w = name === 'weight' ? value : intakeForm.weight;
            if (h && w) {
                const hM = h / 100;
                const bmi = (w / (hM * hM)).toFixed(2);
                setIntakeForm(prev => ({ ...prev, [name]: value, bmi }));
                return;
            }
        }

        // Patient name autocomplete — search on firstName typing
        if (name === 'firstName') {
            setIntakeForm(prev => ({ ...prev, [name]: value }));
            if (nameSearchTimerRef.current) clearTimeout(nameSearchTimerRef.current);
            if (value.trim().length >= 2) {
                nameSearchTimerRef.current = setTimeout(async () => {
                    try {
                        const res = await receptionAPI.searchPatients(value.trim());
                        if (res.success && res.patients?.length > 0) {
                            setNameSuggestions(res.patients);
                            setShowNameSuggestions(true);
                        } else {
                            setNameSuggestions([]);
                            setShowNameSuggestions(false);
                        }
                    } catch { setNameSuggestions([]); setShowNameSuggestions(false); }
                }, 300);
            } else {
                setNameSuggestions([]);
                setShowNameSuggestions(false);
            }
            return;
        }

        setIntakeForm(prev => ({ ...prev, [name]: value }));
    };

    // Fill intake form from an existing patient suggestion
    const handleSelectPatientSuggestion = (patient) => {
        const fp = patient.fertilityProfile || {};
        const nameParts = (patient.name || '').split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        setSelectedPatientId(patient._id);
        setIntakeForm(prev => ({
            ...prev,
            firstName,
            lastName,
            mobile: patient.phone || fp.mobile || '',
            email: patient.email || '',
            age: fp.age || '',
            gender: fp.gender || prev.gender,
            address: fp.address || patient.address || '',
            aadhaar: fp.aadhaar || '',
            isAadhaarVerified: !!fp.aadhaar,
            height: fp.height || '',
            weight: fp.weight || '',
            bmi: fp.bmi || '',
            bloodGroup: fp.bloodGroup || '',
            partnerFirstName: fp.partnerFirstName || '',
            partnerLastName: fp.partnerLastName || '',
            partnerMobile: fp.partnerMobile || '',
            consultationFee: hospitalContext?.appointmentFee ?? prev.consultationFee,
        }));
        setNameSuggestions([]);
        setShowNameSuggestions(false);
    };

    const handleSendOTP = async () => {
        if (!intakeForm.aadhaar || intakeForm.aadhaar.length !== 12) {
            alert("Please enter a valid 12-digit Aadhaar number.");
            return;
        }
        setVerifyingAadhaar(true);
        try {
            const res = await receptionAPI.sendAadhaarOTP(intakeForm.aadhaar);
            if (res.success) {
                setOtpSent(true);
                alert(res.message); // "OTP Sent (Use 123456)"
            }
        } catch (err) {
            alert(err.response?.data?.message || "Failed to send OTP");
            setOtpSent(false);
        } finally {
            setVerifyingAadhaar(false);
        }
    };

    const handleVerifyOTP = async () => {
        if (!aadhaarOtp) return alert("Please enter the OTP sent to mobile.");

        setVerifyingAadhaar(true);
        try {
            const res = await receptionAPI.verifyAadhaarOTP(intakeForm.aadhaar, aadhaarOtp);
            if (res.success && res.data) {
                const kyc = res.data;
                alert(`✅ Verification Successful: ${kyc.fullName}`);

                // Auto-populate
                setIntakeForm(prev => ({
                    ...prev,
                    isAadhaarVerified: true,
                    firstName: kyc.fullName.split(' ')[0],
                    lastName: kyc.fullName.split(' ').slice(1).join(' '),
                    dob: kyc.dob,
                    gender: kyc.gender,
                    address: kyc.address
                }));
                // Reset OTP UI
                setOtpSent(false);
                setAadhaarOtp('');
            }
        } catch (err) {
            alert(err.response?.data?.message || "Invalid OTP");
        } finally {
            setVerifyingAadhaar(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);

        if (!intakeForm.firstName || !intakeForm.mobile) {
            alert("Name and Mobile are required.");
            setSaving(false); return;
        }

        if (intakeForm.doctor && intakeForm.visitTime && intakeForm.paymentMethod !== 'Cash' && !paymentScreenshot) {
            alert(`Please upload a payment screenshot/proof for ${intakeForm.paymentMethod} payment before booking.`);
            setSaving(false); return;
        }

        try {
            let userId = selectedPatientId;

            // 1. Register/Find User
            const regRes = await receptionAPI.registerPatient({
                name: `${intakeForm.firstName} ${intakeForm.lastName}`.trim(),
                email: intakeForm.email,
                phone: intakeForm.mobile,
                autoCreateAppointment: !(intakeForm.doctor && intakeForm.visitDate)
            });

            if (regRes.success && regRes.user) {
                userId = regRes.user._id;
            } else {
                throw new Error(regRes.message || "Registration failed.");
            }

            // 2. Update Profile (Vitals + Basic Info + Aadhaar)
            await receptionAPI.updateIntake(userId, intakeForm);

            // 2.5 Upload any previous hospital reports if present
            const reportsToUpload = [...selectedPastReports];
            if (newReportFile) {
                const nameToUse = newReportName.trim() || newReportFile.name;
                reportsToUpload.push({ file: newReportFile, name: nameToUse });
            }

            if (reportsToUpload.length > 0) {
                for (const report of reportsToUpload) {
                    try {
                        await receptionAPI.uploadPastReport(userId, report.file, report.name);
                    } catch (uploadErr) {
                        console.error("Failed to upload past report", report.name, uploadErr);
                    }
                }
                setSelectedPastReports([]);
                setNewReportFile(null);
                setNewReportName('');
                const fileEl = document.getElementById('past-report-file-picker');
                if (fileEl) fileEl.value = '';
            }

            // 3. Book Appointment (optional when editing existing patient)
            const isTokenMode = hospitalContext?.appointmentMode === 'token';
            if (intakeForm.doctor && intakeForm.visitDate && (intakeForm.visitTime || isTokenMode)) {
                // Upload payment screenshot if non-cash and screenshot provided
                let screenshotNote = '';
                if (intakeForm.paymentMethod !== 'Cash' && paymentScreenshot) {
                    try {
                        const fd = new FormData();
                        fd.append('images', paymentScreenshot);
                        const upRes = await uploadAPI.uploadImages(fd);
                        if (upRes.success && upRes.files?.length > 0) {
                            screenshotNote = ` | Screenshot: ${upRes.files[0].url}`;
                        }
                    } catch { /* non-fatal */ }
                }

                const bookingRes = await receptionAPI.bookAppointment({
                    patientId: userId,
                    doctorId: intakeForm.doctor,
                    date: intakeForm.visitDate,
                    time: isTokenMode ? undefined : intakeForm.visitTime,
                    notes: `Walk-in. Vitals: ${intakeForm.height}cm/${intakeForm.weight}kg. Reason: ${intakeForm.reasonForVisit}${screenshotNote}`,
                    paymentMethod: intakeForm.paymentMethod,
                    paymentStatus: 'Paid',
                    amount: intakeForm.consultationFee,
                    parentAppointmentId: parentAppointmentId
                });

                if (bookingRes.success) {
                    setParentAppointmentId(null);
                    // --- Dynamic Receipt PDF (generate BEFORE alert so it isn't blocked) ---
                    const doc = new jsPDF();
                    const hName = hospitalContext?.name || 'HOSPITAL';
                    const hAddr = [hospitalContext?.address, hospitalContext?.city, hospitalContext?.state].filter(Boolean).join(', ');
                    const hPhone = hospitalContext?.phone || '';
                    const hEmail = hospitalContext?.email || '';
                    const issuedBy = currentUser?.name || 'Reception Staff';
                    const selectedDoc = doctorsList.find(d => d._id === intakeForm.doctor);
                    let y = 18;

                    // Hospital header
                    doc.setFontSize(18); doc.setFont('helvetica', 'bold');
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
                    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(41, 128, 185);
                    doc.text('Registration Slip / Receipt', 105, y, { align: 'center' }); y += 5;
                    doc.setDrawColor(41, 128, 185); doc.setLineWidth(0.5);
                    doc.line(14, y, 196, y); y += 8;
                    doc.setTextColor(0); doc.setFont('helvetica', 'normal');

                    autoTable(doc, {
                        startY: y,
                        body: [
                            ['Patient Name', `${intakeForm.firstName} ${intakeForm.lastName}`],
                            ['MRN / ID', regRes.user?.patientId || bookingRes.appointment?.patientId || 'N/A'],
                            ['Phone', intakeForm.mobile || '-'],
                            ['Aadhaar Verified', intakeForm.isAadhaarVerified ? 'YES - Verified' : 'NO'],
                            ['Department', intakeForm.department || '-'],
                            ['Doctor', `Dr. ${selectedDoc?.name || '-'}`],
                            isTokenMode
                                ? ['Date / Token', `${intakeForm.visitDate}  —  Token #${bookingRes.appointment?.tokenNumber || '?'}`]
                                : ['Date & Time', `${intakeForm.visitDate} @ ${intakeForm.visitTime}`],
                            ['Consultation Fee', `Rs. ${Number(intakeForm.consultationFee || 0).toLocaleString('en-IN')}`],
                            ['Payment Method', intakeForm.paymentMethod || 'Cash'],
                            ['Payment Status', 'PAID'],
                        ],
                        theme: 'grid',
                        headStyles: { fillColor: [41, 128, 185] },
                        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52 } },
                        bodyStyles: { fontSize: 10 },
                        alternateRowStyles: { fillColor: [245, 249, 255] },
                    });

                    y = doc.lastAutoTable.finalY + 10;
                    doc.setDrawColor(200); doc.line(14, y, 196, y); y += 6;
                    doc.setFontSize(8); doc.setTextColor(120);
                    doc.text(`Issued by: ${issuedBy}`, 14, y);
                    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 196, y, { align: 'right' });
                    y += 5;
                    doc.text('Thank you for choosing ' + hName, 105, y, { align: 'center' });
                    const receiptPatientId = regRes.user?.patientId || bookingRes.appointment?.patientId || 'Patient';
                    if (window.confirm("Do you want to download the Receipt PDF?")) {
                        doc.save(`Receipt_${receiptPatientId}.pdf`);
                    }

                    const tokenMsg = bookingRes.appointment?.tokenNumber
                        ? ` Token #${bookingRes.appointment.tokenNumber} assigned.` : '';
                    alert(`Patient Registered & Assigned to Doctor!${tokenMsg}`);

                    const targetDate = intakeForm.visitDate || new Date().toISOString().split('T')[0];
                    const tomVal = new Date(); tomVal.setDate(tomVal.getDate() + 1);
                    const tomStrVal = tomVal.toISOString().split('T')[0];

                    setDateTab(targetDate === todayStr ? 'today' : targetDate === tomStrVal ? 'tomorrow' : 'custom');
                    setSelectedQueueDate(targetDate);
                    setPaymentScreenshot(null);
                    fetchAppointments(targetDate, false);
                    setViewMode('dashboard');
                } else {
                    alert("Booking Failed: " + bookingRes.message);
                }
            } else if (selectedPatientId) {
                // Editing existing patient — profile saved, no appointment needed
                alert("✅ Patient details updated successfully!");
                setViewMode('dashboard');
            } else {
                alert("Please select a Doctor and Time Slot to complete the registration.");
            }
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'An unexpected error occurred.';
            alert("❌ Error: " + msg);
        } finally {
            setSaving(false);
        }
    };

    if (viewMode === 'intake') {
        return (
            <div className="intake-full-page">
                <div className="context-bar">
                    <h3>{selectedPatientId ? 'Edit Patient Details' : 'New Registration'}</h3>
                    <button className="btn-cancel" onClick={() => { setViewMode('dashboard'); setParentAppointmentId(null); }}>Close ✖</button>
                </div>
                <div className="intake-container">
                    <form onSubmit={handleSave}>
                        <div className="form-section">
                            <h4>1. Patient Identity & KYC</h4>

                            {/* AADHAAR VERIFICATION ROW */}
                            <div className="form-row" style={{ alignItems: 'flex-end', backgroundColor: '#f0fdf4', padding: '15px', borderRadius: '8px', border: '1px dashed #22c55e', gap: '15px' }}>
                                {/* AADHAAR INPUT */}
                                <div className="field" style={{ flex: 2 }}>
                                    <label>Aadhaar Number {intakeForm.isAadhaarVerified && '✅ Verified'}</label>
                                    <input
                                        name="aadhaar"
                                        maxLength="12"
                                        placeholder="Enter 12-digit Aadhaar"
                                        value={intakeForm.aadhaar}
                                        onChange={handleInputChange}
                                        disabled={intakeForm.isAadhaarVerified || otpSent}
                                        style={{
                                            borderColor: intakeForm.isAadhaarVerified ? 'green' : '#ccc',
                                            backgroundColor: intakeForm.isAadhaarVerified ? '#e6fffa' : 'white',
                                            fontWeight: 'bold'
                                        }}
                                    />
                                </div>

                                {/* OTP INPUT (Conditional) */}
                                {otpSent && !intakeForm.isAadhaarVerified && (
                                    <div className="field verified-anim" style={{ flex: 1 }}>
                                        <label>Enter OTP</label>
                                        <input
                                            type="text"
                                            maxLength="6"
                                            placeholder="Ex: 123456"
                                            value={aadhaarOtp}
                                            onChange={(e) => setAadhaarOtp(e.target.value)}
                                            style={{ borderColor: '#2563eb' }}
                                        />
                                    </div>
                                )}

                                {/* ACTION BUTTONS */}
                                <div className="field" style={{ flex: 1 }}>
                                    {!intakeForm.isAadhaarVerified ? (
                                        !otpSent ? (
                                            <button
                                                type="button"
                                                onClick={handleSendOTP}
                                                className="btn-save"
                                                style={{ width: '100%', backgroundColor: '#2563eb' }}
                                                disabled={verifyingAadhaar || !intakeForm.aadhaar}
                                            >
                                                {verifyingAadhaar ? 'Sending...' : 'Send OTP'}
                                            </button>
                                        ) : (
                                            <div style={{ display: 'flex', gap: '5px' }}>
                                                <button
                                                    type="button"
                                                    onClick={handleVerifyOTP}
                                                    className="btn-save"
                                                    style={{ flex: 2, backgroundColor: '#059669' }}
                                                    disabled={verifyingAadhaar}
                                                >
                                                    {verifyingAadhaar ? '...' : 'Verify OTP'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { setOtpSent(false); setAadhaarOtp(''); }}
                                                    className="btn-cancel"
                                                    style={{ flex: 1, padding: '0 5px', fontSize: '0.8rem', height: '100%' }}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        )
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setIntakeForm({ ...intakeForm, isAadhaarVerified: false, aadhaar: '' })}
                                            className="btn-cancel"
                                            style={{ width: '100%' }}
                                        >
                                            Reset / Clear
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="form-row" style={{ marginTop: '10px' }}>
                                <div className="field" style={{ position: 'relative' }}>
                                    <label>First Name</label>
                                    <input
                                        name="firstName"
                                        value={intakeForm.firstName}
                                        onChange={handleInputChange}
                                        onBlur={() => setTimeout(() => setShowNameSuggestions(false), 180)}
                                        autoComplete="off"
                                        placeholder="Type to search existing patients..."
                                    />
                                    {showNameSuggestions && nameSuggestions.length > 0 && (
                                        <div style={{
                                            position: 'absolute', top: '100%', left: 0, right: 0,
                                            background: '#fff', border: '1.5px solid #6366f1',
                                            borderRadius: '10px', boxShadow: '0 8px 24px rgba(99,102,241,0.15)',
                                            zIndex: 9999, maxHeight: '220px', overflowY: 'auto',
                                            marginTop: '4px'
                                        }}>
                                            <div style={{ padding: '8px 14px 4px', fontSize: '0.72rem', color: '#6366f1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #e0e7ff' }}>
                                                🔍 Existing Patients
                                            </div>
                                            {nameSuggestions.map((p, idx) => (
                                                <div
                                                    key={p._id || idx}
                                                    onMouseDown={() => handleSelectPatientSuggestion(p)}
                                                    style={{
                                                        padding: '10px 14px', cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', gap: '10px',
                                                        borderBottom: idx < nameSuggestions.length - 1 ? '1px solid #f1f5f9' : 'none',
                                                        transition: 'background 0.15s'
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                                                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                                >
                                                    <div style={{
                                                        width: '34px', height: '34px', borderRadius: '50%',
                                                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        color: '#fff', fontWeight: 800, fontSize: '0.9rem', flexShrink: 0
                                                    }}>
                                                        {(p.name || 'P')[0].toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>{p.name}</div>
                                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                            📱 {p.phone || '-'} &nbsp;•&nbsp; MRN: {p.patientId || 'N/A'}
                                                        </div>
                                                    </div>
                                                    <div style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#6366f1', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                        ✓ Select
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="field"><label>Last Name</label><input name="lastName" value={intakeForm.lastName} onChange={handleInputChange} /></div>
                                <div className="field"><label>Mobile</label><input type="tel" name="mobile" value={intakeForm.mobile} onChange={handleInputChange} maxLength={10} /></div>
                                <div className="field"><label>Age</label><input name="age" value={intakeForm.age} onChange={handleInputChange} /></div>
                            </div>
                            <div className="form-row">
                                <div className="field"><label>Partner Name</label><input name="partnerFirstName" value={intakeForm.partnerFirstName} onChange={handleInputChange} /></div>
                                <div className="field"><label>Partner Mobile</label><input type="tel" name="partnerMobile" value={intakeForm.partnerMobile} onChange={handleInputChange} maxLength={10} /></div>
                            </div>
                        </div>

                        <div className="form-section">
                            <h4>2. Vitals & Payment</h4>
                            <div className="form-row">
                                <div className="field"><label>Height (cm)</label><input name="height" value={intakeForm.height} onChange={handleInputChange} /></div>
                                <div className="field"><label>Weight (kg)</label><input name="weight" value={intakeForm.weight} onChange={handleInputChange} /></div>
                                <div className="field"><label>BMI</label><input name="bmi" value={intakeForm.bmi} readOnly /></div>
                                <div className="field"><label>Consultation Fee</label><input name="consultationFee" value={intakeForm.consultationFee} readOnly style={{ backgroundColor: '#f1f5f9', color: '#475569', cursor: 'not-allowed' }} /></div>
                            </div>
                            <div className="form-row">
                                <div className="field">
                                    <label>Payment Method</label>
                                    <select name="paymentMethod" value={intakeForm.paymentMethod} onChange={handleInputChange}>
                                        <option value="Cash">Cash</option>
                                        <option value="UPI">UPI</option>
                                        <option value="Card">Card</option>
                                        <option value="Cheque">Cheque</option>
                                        <option value="NEFT/RTGS">NEFT / RTGS</option>
                                    </select>
                                </div>
                                <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', marginTop: '22px' }}>
                                    <span style={{ fontSize: '18px' }}>✅</span>
                                    <span style={{ fontWeight: 600, color: '#15803d', fontSize: '14px' }}>Payment Confirmed — Paid</span>
                                </div>
                            </div>
                            {intakeForm.paymentMethod !== 'Cash' && (
                                <div className="form-row" style={{ marginTop: '6px' }}>
                                    <div className="field" style={{ flex: 1 }}>
                                        <label>Payment Screenshot / Proof <span style={{ color: '#ef4444', fontSize: '12px' }}>*Required for {intakeForm.paymentMethod}</span></label>
                                        <input
                                            type="file"
                                            accept="image/*,application/pdf"
                                            onChange={e => setPaymentScreenshot(e.target.files[0])}
                                            style={{ padding: '8px', border: '2px dashed #6366f1', borderRadius: '8px', background: '#f5f3ff', width: '100%' }}
                                        />
                                        {paymentScreenshot && (
                                            <span style={{ fontSize: '12px', color: '#059669', marginTop: '4px', display: 'block' }}>
                                                ✅ {paymentScreenshot.name}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="form-section" style={{ backgroundColor: '#e3f2fd' }}>
                            <h4>3. Assign to Doctor/Counselor</h4>
                            <div className="form-row">
                                <div className="field">
                                    <label>Department / Clinic</label>
                                    <select
                                        name="department"
                                        value={intakeForm.department}
                                        onChange={handleInputChange}
                                        disabled={!!parentAppointmentId}
                                        style={parentAppointmentId ? { backgroundColor: '#f1f5f9', cursor: 'not-allowed' } : {}}
                                    >
                                        <option value="">-- Choose Clinic --</option>
                                        {[...new Set([
                                            ...(hospitalContext?.departments || []),
                                            ...doctorsList.flatMap(d => [
                                                ...(d.departments || []),
                                                d.specialty,
                                                d.specialization
                                            ])
                                        ])].map(dept => dept?.trim()).filter(Boolean).sort().map(dept => (
                                            <option key={dept} value={dept}>{dept}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="field">
                                    <label>Select Specialist</label>
                                    <select
                                        name="doctor"
                                        value={intakeForm.doctor}
                                        onChange={handleInputChange}
                                        disabled={!intakeForm.department || !!parentAppointmentId}
                                        style={(!intakeForm.department || parentAppointmentId) ? { backgroundColor: '#f1f5f9', cursor: 'not-allowed' } : {}}
                                    >
                                        {!intakeForm.department ? (
                                            <option value="">-- Select Department First --</option>
                                        ) : (
                                            <>
                                                <option value="">-- Choose Specialist --</option>
                                                {doctorsList.filter(doc => {
                                                    const depts = [
                                                        ...(doc.departments || []),
                                                        doc.specialty,
                                                        doc.specialization
                                                    ].map(d => d?.trim()).filter(Boolean);
                                                    return depts.includes(intakeForm.department);
                                                }).map(doc => {
                                                    const allDepts = [...new Set([
                                                        ...(doc.departments || []),
                                                        doc.specialty,
                                                        doc.specialization
                                                    ])].map(d => d?.trim()).filter(Boolean);
                                                    return (
                                                        <option key={doc._id} value={doc._id}>
                                                            {doc.name} {allDepts.length > 0 ? `(${allDepts.join(', ')})` : ''}
                                                        </option>
                                                    );
                                                })}
                                            </>
                                        )}
                                    </select>
                                </div>
                                <div className="field">
                                    <label>Date</label>
                                    <input type="date" name="visitDate" value={intakeForm.visitDate} min={todayStr} onChange={handleInputChange} disabled={!intakeForm.doctor} style={!intakeForm.doctor ? { backgroundColor: '#f1f5f9', cursor: 'not-allowed' } : {}} />
                                </div>
                            </div>
                            {intakeForm.doctor && (
                                hospitalContext?.appointmentMode === 'token' ? (
                                    /* Token mode: show next token number */
                                    <div style={{ margin: '14px 0', padding: '18px 24px', background: 'linear-gradient(135deg, #fef3c7, #fde68a)', borderRadius: '12px', border: '2px solid #f59e0b', display: 'flex', alignItems: 'center', gap: '18px' }}>
                                        <span style={{ fontSize: '2.5rem' }}>🎟️</span>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#78350f', marginBottom: '2px' }}>Token Queue Mode Active</div>
                                            {nextToken !== null ? (
                                                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#92400e' }}>
                                                    Next Token: <span style={{ fontSize: '2rem', color: '#d97706' }}>#{nextToken}</span>
                                                </div>
                                            ) : (
                                                <div style={{ color: '#92400e', fontSize: '0.9rem' }}>Select doctor and date to see next token</div>
                                            )}
                                            <div style={{ fontSize: '0.8rem', color: '#92400e', marginTop: '4px', opacity: 0.8 }}>Tokens reset daily at midnight</div>
                                        </div>
                                    </div>
                                ) : (
                                    /* Slot mode: existing time slot grid */
                                    <div className="slot-grid">
                                        {timeSlots.map(time => {
                                            const isBooked = availabilityCheck.bookedSlots.includes(time);
                                            const isPast = isSlotInPast(time);
                                            const isDisabled = isBooked || isPast;
                                            return (
                                                <button
                                                    key={time} type="button"
                                                    className={`slot-btn ${isBooked ? 'booked' : ''} ${isPast ? 'booked' : ''} ${intakeForm.visitTime === time ? 'selected' : ''}`}
                                                    onClick={() => !isDisabled && setIntakeForm({ ...intakeForm, visitTime: time })}
                                                    disabled={isDisabled}
                                                >
                                                    {time}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )
                            )}
                        </div>

                        <div className="form-section" style={{ backgroundColor: '#faf5ff', border: '1px solid #e9d5ff' }}>
                            <h4 style={{ color: '#6b21a8' }}>4. Previous Hospital Reports</h4>
                            
                            {/* Selected files preview */}
                            {selectedPastReports.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', background: '#fdf4ff', padding: '12px', borderRadius: '8px', border: '1px solid #f3e8ff' }}>
                                    <div style={{ fontSize: '0.8rem', color: '#6b21a8', fontWeight: 'bold' }}>Files Queued to Upload:</div>
                                    {selectedPastReports.map((report, idx) => (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: 'white', borderRadius: '6px', border: '1px solid #e9d5ff', fontSize: '13px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span>📄</span>
                                                <strong style={{ color: '#1e293b' }}>{report.name}</strong>
                                                <span style={{ color: '#64748b', fontSize: '11px' }}>({report.file.name})</span>
                                            </div>
                                            <button type="button" onClick={() => handleRemovePastReportFromList(idx)} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '18px', cursor: 'pointer', padding: 0 }}>
                                                🗑️
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* File selector input */}
                            <div className="form-row" style={{ alignItems: 'flex-end', gap: '15px' }}>
                                <div className="field" style={{ flex: 2 }}>
                                    <label>Choose Medical Report (Image / PDF)</label>
                                    <input
                                        type="file"
                                        id="past-report-file-picker"
                                        accept="image/*,application/pdf"
                                        onChange={e => setNewReportFile(e.target.files[0])}
                                        style={{ padding: '8px', border: '1.5px dashed #a855f7', borderRadius: '8px', background: '#fdf4ff', width: '100%' }}
                                    />
                                </div>
                                <div className="field" style={{ flex: 2 }}>
                                    <label>Report Friendly Name</label>
                                    <input
                                        type="text"
                                        placeholder="Ex: Previous MRI, Lab Report etc."
                                        value={newReportName}
                                        onChange={e => setNewReportName(e.target.value)}
                                        style={{ border: '1.5px solid #d8b4fe' }}
                                    />
                                </div>
                                <div className="field" style={{ flex: 1 }}>
                                    <button
                                        type="button"
                                        onClick={handleAddPastReportToList}
                                        className="btn-save"
                                        style={{ width: '100%', backgroundColor: '#8b5cf6', color: 'white', border: 'none', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                                    >
                                        ➕ Add Report
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="form-footer">
                            <button type="submit" className="btn-save" disabled={saving}>
                                {saving
                                    ? 'Saving...'
                                    : (() => {
                                        const isTokenMode = hospitalContext?.appointmentMode === 'token';
                                        const canBook = intakeForm.doctor && intakeForm.visitDate && (intakeForm.visitTime || isTokenMode);
                                        if (selectedPatientId) return canBook ? (isTokenMode ? 'Save & Issue Token + Receipt' : 'Save & Generate Receipt') : 'Save Patient Details';
                                        return canBook ? (isTokenMode ? 'Register & Issue Token + Receipt' : 'Register & Generate Receipt') : 'Save Patient Details';
                                    })()
                                }
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    // PROFILE VIEW MODE
    if (viewMode === 'profile' && profilePatient) {
        const fp = profilePatient.fertilityProfile || {};
        return (
            <div className="reception-dashboard" style={{ maxWidth: '900px', margin: '0 auto' }}>
                <div className="dashboard-header">
                    <button onClick={() => setViewMode('dashboard')} style={{ padding: '8px 20px', background: '#f1f5f9', border: '2px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem' }}>← Back to Dashboard</button>
                    <button className="btn-save" onClick={() => handleEditPatient(profilePatient)} style={{ padding: '10px 24px', fontSize: '1rem' }}>📋 Book Appointment</button>
                    <button className="btn-cancel" onClick={() => navigate(`/billing/patient?search=${encodeURIComponent(profilePatient.patientId || profilePatient.name)}`)} style={{ padding: '10px 24px', fontSize: '1rem', background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid #10b981', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>🧾 View Billing</button>
                </div>

                {/* Patient Identity Card */}
                <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', borderRadius: '18px', padding: '28px', color: 'white', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '18px', marginBottom: '18px' }}>
                        <div style={{ width: '64px', height: '64px', borderRadius: '18px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', fontWeight: '800' }}>
                            {(profilePatient.name || 'P')[0].toUpperCase()}
                        </div>
                        <div>
                            <h2 style={{ margin: '0 0 4px', fontSize: '1.5rem', fontWeight: '800' }}>{profilePatient.name}</h2>
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                <span style={{ padding: '3px 10px', borderRadius: '6px', background: 'rgba(59,130,246,0.2)', color: '#93c5fd', fontSize: '0.8rem', fontWeight: '600' }}>MRN: {profilePatient.patientId || 'N/A'}</span>
                                <span style={{ padding: '3px 10px', borderRadius: '6px', background: 'rgba(16,185,129,0.2)', color: '#6ee7b7', fontSize: '0.8rem', fontWeight: '600' }}>📱 {profilePatient.phone || '-'}</span>
                                {fp.bloodGroup && <span style={{ padding: '3px 10px', borderRadius: '6px', background: 'rgba(239,68,68,0.2)', color: '#fca5a5', fontSize: '0.8rem', fontWeight: '600' }}>🩸 {fp.bloodGroup}</span>}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Vitals & Demographics */}
                <div style={{ background: 'white', borderRadius: '16px', padding: '24px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: '#1e40af' }}>📋 Demographics & Vitals</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
                        {[
                            ['Age', fp.age || '-'],
                            ['Gender', fp.gender || '-'],
                            ['Height', `${fp.height || '-'} cm`],
                            ['Weight', `${fp.weight || '-'} kg`],
                            ['BMI', fp.bmi || '-'],
                            ['Blood Group', fp.bloodGroup || '-'],
                            ['Email', profilePatient.email || '-'],
                            ['Address', fp.address || profilePatient.address || '-'],
                        ].map(([label, val], i) => (
                            <div key={i} style={{ background: '#f8fafc', borderRadius: '10px', padding: '12px' }}>
                                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '700', marginBottom: '4px' }}>{label}</div>
                                <div style={{ fontSize: '0.92rem', fontWeight: '600', color: '#1e293b' }}>{val}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Spouse Info */}
                {(fp.partnerFirstName || fp.husbandAge) && (
                    <div style={{ background: '#f0fdf4', borderRadius: '16px', padding: '24px', marginBottom: '20px', border: '1px solid #bbf7d0' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: '#166534' }}>👫 Spouse / Partner Details</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
                            {[
                                ['Name', `${fp.partnerTitle || ''} ${fp.partnerFirstName || ''} ${fp.partnerLastName || ''}`.trim() || '-'],
                                ['Age', fp.partnerAge || fp.husbandAge || '-'],
                                ['Phone', fp.partnerMobile || '-'],
                                ['Blood Group', fp.partnerBloodGroup || '-'],
                            ].map(([label, val], i) => (
                                <div key={i} style={{ background: 'rgba(255,255,255,0.7)', borderRadius: '10px', padding: '12px' }}>
                                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#166534', fontWeight: '700', marginBottom: '4px' }}>{label}</div>
                                    <div style={{ fontSize: '0.92rem', fontWeight: '600', color: '#1e293b' }}>{val}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Fertility / Clinical profile */}
                {(fp.chiefComplaint || fp.medicalHistory) && (
                    <div style={{ background: 'white', borderRadius: '16px', padding: '24px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: '#1e40af' }}>🏥 Clinical Summary</h3>
                        {fp.chiefComplaint && <div style={{ marginBottom: '12px' }}><strong>Chief Complaint:</strong> {fp.chiefComplaint}</div>}
                        {fp.medicalHistory && <div style={{ marginBottom: '12px' }}><strong>Medical History:</strong> {fp.medicalHistory}</div>}
                        {fp.surgicalHistory && <div style={{ marginBottom: '12px' }}><strong>Surgical History:</strong> {fp.surgicalHistory}</div>}
                        {fp.reasonForVisit && <div><strong>Reason for Visit:</strong> {fp.reasonForVisit}</div>}
                    </div>
                )}

                {/* Appointment History */}
                <div style={{ background: 'white', borderRadius: '16px', padding: '24px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: '#1e40af' }}>📅 Appointment History ({profileAppointments.length})</h3>
                    {profileAppointments.length === 0 ? (
                        <p style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}>No appointment history found.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {profileAppointments.map(apt => (
                                <div key={apt._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                    <div>
                                        <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>{new Date(apt.appointmentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{apt.appointmentTime} • {apt.serviceName || 'Consultation'}</div>
                                    </div>
                                    <span style={{
                                        padding: '4px 12px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: '700', textTransform: 'capitalize',
                                        background: apt.status === 'confirmed' ? '#dcfce7' : apt.status === 'completed' ? '#dbeafe' : '#fef3c7',
                                        color: apt.status === 'confirmed' ? '#166534' : apt.status === 'completed' ? '#1e40af' : '#92400e'
                                    }}>{apt.status}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (viewMode === 'transactions') {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const todayTransactions = transactions.filter(t => new Date(t.createdAt) >= todayStart);
        const todayPaid = todayTransactions.filter(t => (t.paymentStatus || '').toLowerCase() === 'paid');
        const todayTotal = todayPaid.reduce((sum, t) => sum + (t.amount || 0), 0);
        const todayCash = todayPaid.filter(t => (t.paymentMethod || 'Cash').toLowerCase() === 'cash').reduce((sum, t) => sum + (t.amount || 0), 0);
        const todayUPI = todayPaid.filter(t => ['upi', 'upi / qr', 'qr'].includes((t.paymentMethod || '').toLowerCase())).reduce((sum, t) => sum + (t.amount || 0), 0);
        const todayCard = todayPaid.filter(t => (t.paymentMethod || '').toLowerCase() === 'card').reduce((sum, t) => sum + (t.amount || 0), 0);
        const todayPending = todayTransactions.filter(t => (t.paymentStatus || '').toLowerCase() !== 'paid').length;

        const totalCollected = transactions.filter(t => (t.paymentStatus || '').toLowerCase() === 'paid').reduce((sum, t) => sum + (t.amount || 0), 0);

        return (
            <div className="reception-dashboard" style={{ maxWidth: '1100px', margin: '0 auto' }}>
                <div className="dashboard-header">
                    <button onClick={() => setViewMode('dashboard')} style={{ padding: '8px 20px', background: '#f1f5f9', border: '2px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>← Back to Dashboard</button>
                    <h2>💰 My Daily Collection Summary</h2>
                </div>

                {/* Today's Collection Stats */}
                <div style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)', borderRadius: '16px', padding: '24px', marginBottom: '20px', color: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, opacity: 0.85 }}>Today's Collection</h3>
                            <div style={{ fontSize: '2.4rem', fontWeight: 900, marginTop: '4px' }}>₹{todayTotal.toLocaleString('en-IN')}</div>
                            <div style={{ fontSize: '0.85rem', opacity: 0.8, marginTop: '4px' }}>{todayPaid.length} paid transaction(s) today</div>
                        </div>
                        <div style={{ textAlign: 'right', opacity: 0.85 }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>⏳ Pending Today</div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fde68a' }}>{todayPending}</div>
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                        {[
                            { label: '💵 Cash', amount: todayCash, color: '#d1fae5', textColor: '#065f46' },
                            { label: '📱 UPI / QR', amount: todayUPI, color: '#ede9fe', textColor: '#4c1d95' },
                            { label: '💳 Card', amount: todayCard, color: '#fef3c7', textColor: '#92400e' },
                        ].map(({ label, amount, color, textColor }) => (
                            <div key={label} style={{ background: 'rgba(255,255,255,0.18)', borderRadius: '12px', padding: '14px 16px', backdropFilter: 'blur(4px)' }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 700, opacity: 0.9 }}>{label}</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 900, marginTop: '4px' }}>₹{amount.toLocaleString('en-IN')}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* All-time summary */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                    <div style={{ background: '#fff', borderRadius: '12px', padding: '18px 22px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total All-Time Collected</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#0ea5e9', marginTop: '6px' }}>₹{totalCollected.toLocaleString('en-IN')}</div>
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>{transactions.filter(t => (t.paymentStatus || '').toLowerCase() === 'paid').length} total paid transactions</div>
                    </div>
                    <div style={{ background: '#fff', borderRadius: '12px', padding: '18px 22px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending Payments</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#f59e0b', marginTop: '6px' }}>{transactions.filter(t => (t.paymentStatus || '').toLowerCase() !== 'paid').length}</div>
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>appointments awaiting payment</div>
                    </div>
                </div>

                <div className="card" style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#1e293b' }}>All Transaction History</h3>
                        <span style={{ fontSize: '0.8rem', color: '#64748b', background: '#f1f5f9', padding: '4px 10px', borderRadius: '20px' }}>{transactions.length} record(s)</span>
                    </div>
                    <table className="reception-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Patient</th>
                                <th>Doctor</th>
                                <th>Method</th>
                                <th>Status</th>
                                <th>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.length === 0 ? (
                                <tr><td colSpan="6" style={{ textAlign: 'center', color: '#888' }}>No transactions found.</td></tr>
                            ) : (
                                transactions.map(t => (
                                    <tr key={t._id}>
                                        <td>{new Date(t.createdAt).toLocaleDateString()}</td>
                                        <td>{t.userId?.name || 'Walk-in'}</td>
                                        <td>{t.doctorName || '-'}</td>
                                        <td>{t.paymentMethod || 'Cash'}</td>
                                        <td>
                                            <span style={{
                                                padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold',
                                                background: (t.paymentStatus || '').toLowerCase() === 'paid' ? '#dcfce7' : '#fef3c7',
                                                color: (t.paymentStatus || '').toLowerCase() === 'paid' ? '#166534' : '#92400e'
                                            }}>
                                                {t.paymentStatus || 'Pending'}
                                            </span>
                                        </td>
                                        <td style={{ fontWeight: 'bold', color: '#16a34a' }}>₹{t.amount}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    // ─── ADMITTED PATIENTS VIEW ────────────────────────────────────────────────
    if (viewMode === 'admitted') {
        const filteredAdmissions = admissions.filter(adm => {
            const q = admissionSearchQuery.toLowerCase().trim();
            if (!q) return true;
            return (
                (adm.patientId?.name || '').toLowerCase().includes(q) ||
                (adm.patientId?.patientId || '').toLowerCase().includes(q) ||
                (adm.ward || '').toLowerCase().includes(q) ||
                (adm.bedNumber || '').toLowerCase().includes(q)
            );
        });

        const activeCount = admissions.filter(a => a.status === 'Admitted' || a.status === 'Pending Allocation').length;
        const pendingPayment = admissions.filter(a => a.paymentStatus === 'Pending' && (a.status === 'Admitted' || a.status === 'Pending Allocation')).length;
        const totalRevenue = admissions.reduce((sum, a) => sum + (a.totalAmount || 0), 0);

        return (
            <div className="reception-dashboard" style={{ maxWidth: '1300px', margin: '0 auto' }}>
                {/* Header */}
                <div style={{
                    background: 'linear-gradient(135deg, #0f172a, #1e293b)',
                    borderRadius: '16px', padding: '20px 28px', marginBottom: '20px',
                    color: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px'
                }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>🏥 Admitted Patients</h1>
                        <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>
                            {hospitalContext?.name || 'Hospital'} • Inpatient Ward Management
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button onClick={() => fetchAdmissions()}
                            style={{ padding: '10px 18px', fontSize: '0.85rem', background: 'rgba(255,255,255,0.1)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '10px', cursor: 'pointer', fontWeight: 600 }}>
                            🔄 Refresh
                        </button>
                        <button onClick={() => setViewMode('dashboard')}
                            style={{ padding: '10px 20px', fontSize: '0.9rem', background: 'rgba(255,255,255,0.08)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', cursor: 'pointer', fontWeight: 600 }}>
                            ← Dashboard
                        </button>
                    </div>
                </div>

                {/* Stats Row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                    {[
                        { label: 'Currently Admitted', value: activeCount, icon: '🛏️', color: '#0d9488', bg: '#f0fdfa' },
                        { label: 'Pending Payment', value: pendingPayment, icon: '💳', color: '#d97706', bg: '#fffbeb' },
                        { label: 'Total Revenue', value: `₹${totalRevenue.toLocaleString('en-IN')}`, icon: '💰', color: '#7c3aed', bg: '#f5f3ff' },
                        { label: 'Total Admissions', value: admissions.length, icon: '📋', color: '#3b82f6', bg: '#eff6ff' },
                    ].map((s, i) => (
                        <div key={i} style={{ background: s.bg, borderRadius: '12px', padding: '16px', border: `1px solid ${s.color}20`, textAlign: 'center' }}>
                            <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>{s.icon}</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
                        </div>
                    ))}
                </div>

                {/* Search + Filter Bar */}
                <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '14px 20px', marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                        type="text"
                        placeholder="🔍  Search by patient name, ID, ward or bed..."
                        value={admissionSearchQuery}
                        onChange={e => setAdmissionSearchQuery(e.target.value)}
                        style={{ flex: 1, minWidth: '220px', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.9rem', outline: 'none' }}
                    />
                    <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px', gap: '2px' }}>
                        {[{ id: 'active', label: '🟢 Active' }, { id: 'all', label: '📋 All' }].map(t => (
                            <button key={t.id} onClick={() => setAdmissionStatusTab(t.id)}
                                style={{
                                    padding: '7px 16px', borderRadius: '6px', border: 'none', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer',
                                    background: admissionStatusTab === t.id ? '#fff' : 'transparent',
                                    color: admissionStatusTab === t.id ? '#0d9488' : '#64748b',
                                    boxShadow: admissionStatusTab === t.id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none'
                                }}>
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>
                {admissionsLoading ? (
                    <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>⏳</div>
                        <div style={{ fontWeight: 600 }}>Loading admissions...</div>
                    </div>
                ) : filteredAdmissions.filter(a => admissionStatusTab === 'all' || a.status === 'Admitted' || a.status === 'Pending Allocation').length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🛏️</div>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '6px' }}>No admitted patients</div>
                        <div style={{ fontSize: '0.85rem' }}>Patients admitted via the Appointment Queue will appear here.</div>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(390px, 1fr))', gap: '16px' }}>
                        {filteredAdmissions
                            .filter(a => admissionStatusTab === 'all' || a.status === 'Admitted' || a.status === 'Pending Allocation')
                            .map(adm => {
                                const admDate = new Date(adm.admissionDate);
                                const today = new Date();
                                const daysAdmitted = Math.max(0, Math.floor((today - admDate) / (1000 * 60 * 60 * 24)));
                                const isActive = adm.status === 'Admitted';
                                const isPendingAllocation = adm.status === 'Pending Allocation';
                                const isManageable = isActive || isPendingAllocation;
                                const isPaid = adm.paymentStatus === 'Paid';
                                const priority = adm.priority || 'Normal';
                                const priorityColors = {
                                    Critical: { border: '#ef4444', bg: '#fef2f2', text: '#991b1b' },
                                    Urgent: { border: '#f97316', bg: '#fff7ed', text: '#9a3412' },
                                    Normal: { border: '#10b981', bg: '#f0fdf4', text: '#166534' }
                                };
                                const prioStyle = priorityColors[priority] || priorityColors.Normal;

                                // Resolve patient name — prioritize stored name, then populate, then fallback
                                const patientName = adm.patientName ||
                                    adm.patientId?.name ||
                                    [adm.patientId?.firstName, adm.patientId?.lastName].filter(Boolean).join(' ') ||
                                    'Unknown Patient';
                                const patientPhone = adm.patientPhone || adm.patientId?.phone || '-';
                                const patientUID = adm.patientId?.patientId || adm.patientId?.mrn || 'N/A';

                                return (
                                    <div key={adm._id} style={{
                                        background: '#fff',
                                        borderRadius: '14px',
                                        border: isPendingAllocation
                                            ? `2.5px solid ${prioStyle.border}`
                                            : `2px solid ${isActive ? (isPaid ? '#0d948840' : '#f59e0b40') : '#94a3b840'}`,
                                        overflow: 'hidden',
                                        boxShadow: (isActive || isPendingAllocation) ? '0 4px 20px rgba(13,148,136,0.1)' : '0 2px 8px rgba(0,0,0,0.04)',
                                        transition: 'transform 0.2s, box-shadow 0.2s',
                                    }}
                                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 32px rgba(0,0,0,0.13)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = (isActive || isPendingAllocation) ? '0 4px 20px rgba(13,148,136,0.1)' : '0 2px 8px rgba(0,0,0,0.04)'; }}
                                    >
                                        {/* Card Header */}
                                        <div style={{
                                            background: isPendingAllocation
                                                ? `linear-gradient(135deg, ${prioStyle.border}, ${prioStyle.border}dd)`
                                                : isActive
                                                    ? 'linear-gradient(135deg, #0d9488, #0891b2)'
                                                    : 'linear-gradient(135deg, #64748b, #475569)',
                                            padding: '16px 18px',
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.01em' }}>
                                                        👤 {patientName}
                                                    </div>
                                                    <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.78rem', marginTop: '3px' }}>
                                                        🪪 ID: {patientUID} &nbsp;•&nbsp; 📱 {patientPhone}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0, marginLeft: '8px' }}>
                                                    <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 700, background: (isActive || isPendingAllocation) ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.15)', color: '#fff' }}>
                                                        {adm.status}
                                                    </span>
                                                    <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 700, background: isPaid ? '#dcfce7' : '#fef3c7', color: isPaid ? '#166534' : '#92400e' }}>
                                                        {isPaid ? '✓ Paid' : '⏳ Due'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Card Body */}
                                        <div style={{ padding: '16px 18px' }}>
                                            {isPendingAllocation && (
                                                <div style={{
                                                    background: prioStyle.bg,
                                                    color: prioStyle.text,
                                                    border: `1px solid ${prioStyle.border}40`,
                                                    padding: '10px 12px',
                                                    borderRadius: '8px',
                                                    fontSize: '0.82rem',
                                                    fontWeight: 700,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    marginBottom: '14px'
                                                }}>
                                                    ⚠️ Ward & Bed Allocation Required
                                                </div>
                                            )}

                                            {/* Ward / Bed / Days tiles */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                                                <div style={{ background: '#f0fdfa', borderRadius: '10px', padding: '10px 8px', textAlign: 'center', border: '1px solid #99f6e4' }}>
                                                    <div style={{ fontSize: '1.1rem' }}>🏥</div>
                                                    <div style={{ fontSize: '0.65rem', color: '#0f766e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ward</div>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#134e4a', marginTop: '2px' }}>{adm.ward || <span style={{ color: '#94a3b8' }}>—</span>}</div>
                                                </div>
                                                <div style={{ background: '#eff6ff', borderRadius: '10px', padding: '10px 8px', textAlign: 'center', border: '1px solid #bfdbfe' }}>
                                                    <div style={{ fontSize: '1.1rem' }}>{(adm.privateRoom || adm.ward === 'Private Room') ? '🏨' : '🛏️'}</div>
                                                    <div style={{ fontSize: '0.65rem', color: '#1d4ed8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                        {(adm.privateRoom || adm.ward === 'Private Room') ? 'Pvt Room' : 'Bed No.'}
                                                    </div>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e3a8a', marginTop: '2px' }}>{adm.bedNumber || <span style={{ color: '#94a3b8' }}>—</span>}</div>
                                                </div>
                                                <div style={{ background: daysAdmitted > 7 ? '#fff1f2' : '#fef3c7', borderRadius: '10px', padding: '10px 8px', textAlign: 'center', border: `1px solid ${daysAdmitted > 7 ? '#fda4af' : '#fde68a'}` }}>
                                                    <div style={{ fontSize: '1.1rem' }}>📆</div>
                                                    <div style={{ fontSize: '0.65rem', color: daysAdmitted > 7 ? '#be123c' : '#92400e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Days In</div>
                                                    <div style={{ fontSize: '1rem', fontWeight: 800, color: daysAdmitted > 7 ? '#be123c' : '#78350f', marginTop: '2px' }}>{daysAdmitted}d</div>
                                                </div>
                                            </div>

                                            {/* Department + Priority */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px', padding: '8px 10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.8rem' }}>
                                                <div>
                                                    🏢 <strong>Dept:</strong> {adm.requestedDepartment || 'General'}
                                                </div>
                                                <div>
                                                    ⚡ <strong>Priority:</strong> <span style={{ fontWeight: 800, color: isPendingAllocation ? prioStyle.border : '#475569' }}>{priority}</span>
                                                </div>
                                            </div>

                                            {/* Admission + Bill row */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#f8fafc', borderRadius: '8px', marginBottom: '10px', border: '1px solid #e2e8f0' }}>
                                                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                                    📅 <strong>{admDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                                                </span>
                                                {Number(adm.totalAmount) > 0 ? (
                                                    <span style={{ fontSize: '0.82rem', color: isPaid ? '#166534' : '#92400e', fontWeight: 700 }}>
                                                        💰 ₹{Number(adm.totalAmount).toLocaleString('en-IN')} {isPaid ? '✓' : '(Due)'}
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: '0.82rem', color: '#1e293b', fontWeight: 700 }}>
                                                        💰 ₹{Number((hospitalContext?.facilities?.find(f => f.name.toLowerCase() === (adm.ward || '').toLowerCase())?.pricePerDay || adm.dailyWardCharge || 0) * Math.max(1, Math.floor((new Date() - new Date(adm.admissionDate)) / (1000 * 60 * 60 * 24)))).toLocaleString('en-IN')} {isPaid ? '✓' : '(Due)'}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Facility Charges */}
                                            {adm.selectedFacilities?.length > 0 && (
                                                <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px', border: '1px solid #e2e8f0' }}>
                                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>Facility Charges</div>
                                                    {adm.selectedFacilities.map((f, i) => (
                                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '3px 0', borderBottom: i < adm.selectedFacilities.length - 1 ? '1px dashed #e2e8f0' : 'none' }}>
                                                            <span style={{ color: '#475569' }}>{f.facilityName} <span style={{ color: '#94a3b8' }}>× {f.days}d</span></span>
                                                            <span style={{ fontWeight: 700, color: '#1e293b' }}>₹{Number(f.totalAmount || 0).toLocaleString('en-IN')}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Notes */}
                                            {adm.notes && (
                                                <div style={{ background: '#fefce8', borderRadius: '8px', padding: '8px 10px', marginBottom: '10px', border: '1px solid #fef08a', fontSize: '0.8rem', color: '#713f12' }}>
                                                    📝 <strong>Notes:</strong> {adm.notes}
                                                </div>
                                            )}

                                            {/* Action Buttons */}
                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                                                {/* Print Slip */}
                                                <button 
                                                    onClick={() => {
                                                        if (!isPaid) {
                                                            alert("Please collect payment before printing the admission slip.");
                                                            return;
                                                        }
                                                        generateAdmissionSlipPDF(adm);
                                                    }}
                                                    style={{ flex: 1, minWidth: '80px', padding: '9px 4px', fontSize: '0.72rem', background: isPaid ? '#f0fdfa' : '#f1f5f9', color: isPaid ? '#0f766e' : '#94a3b8', border: `1.5px solid ${isPaid ? '#99f6e4' : '#e2e8f0'}`, borderRadius: '8px', cursor: isPaid ? 'pointer' : 'not-allowed', fontWeight: 700 }}>
                                                    🖨️ Slip
                                                </button>
                                                {/* Edit Ward/Bed — only for active or pending */}
                                                {isManageable && (
                                                    <button onClick={() => {
                                                        const rawDate = adm.admissionDate
                                                            ? new Date(adm.admissionDate).toISOString().split('T')[0]
                                                            : new Date().toISOString().split('T')[0];
                                                        setEditAdmissionForm({ ward: adm.ward || '', bedNumber: adm.bedNumber || '', privateRoom: adm.privateRoom || adm.ward === 'Private Room', notes: adm.notes || '', admissionDate: rawDate, dailyWardCharge: adm.dailyWardCharge || '' });
                                                        setEditAdmissionModal({ open: true, admission: adm });
                                                    }}
                                                        style={{ flex: 1, minWidth: '80px', padding: '9px 4px', fontSize: '0.72rem', background: '#eff6ff', color: '#1d4ed8', border: '1.5px solid #bfdbfe', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>
                                                        ✏️ {isPendingAllocation ? '📍 Allocate' : '✏️ Edit'}
                                                    </button>
                                                )}
                                                {/* Pay — only if pending and active */}
                                                {!isPaid && isActive && (
                                                    <button onClick={() => setCollectPaymentModal({ open: true, admission: adm, method: 'Cash' })}
                                                        style={{ flex: 1, minWidth: '80px', padding: '9px 4px', fontSize: '0.72rem', background: '#fffbeb', color: '#b45309', border: '1.5px solid #fde68a', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>
                                                        💳 Collect
                                                    </button>
                                                )}
                                                {/* Discharge — active patients */}
                                                {isActive && (
                                                    <button onClick={() => {
                                                        setDischargeForm({ dischargeDate: new Date().toISOString().split('T')[0], notes: '', overrideDues: false });
                                                        setDischargeModal({ open: true, admission: adm });
                                                    }}
                                                        style={{
                                                            flex: 1, minWidth: '80px', padding: '9px 4px', fontSize: '0.72rem',
                                                            background: '#fff1f2',
                                                            color: '#be123c',
                                                            border: '1.5px solid #fda4af',
                                                            borderRadius: '8px', cursor: 'pointer', fontWeight: 700
                                                        }}>
                                                        🚪 Discharge
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                )}

                {/* ── EDIT ADMISSION MODAL (ward / bed / notes) ── */}
                {editAdmissionModal.open && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(4px)' }}>
                        <div style={{ background: '#fff', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '440px', boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#1e293b' }}>
                                        {!editAdmissionModal.admission?.ward || !editAdmissionModal.admission?.bedNumber ? '📍 Ward & Bed Allocation' : '🔄 Ward & Bed Transfer'}
                                    </h2>
                                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                                        {editAdmissionModal.admission?.patientName ||
                                            editAdmissionModal.admission?.patientId?.name ||
                                            [editAdmissionModal.admission?.patientId?.firstName, editAdmissionModal.admission?.patientId?.lastName].filter(Boolean).join(' ') ||
                                            'Patient'}
                                    </p>
                                </div>
                                <button onClick={() => setEditAdmissionModal({ open: false, admission: null })}
                                    style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>🏥 Ward / Room</label>
                                    <select
                                        value={editAdmissionForm.ward}
                                        onChange={e => {
                                            const w = e.target.value;
                                            const facMatch = hospitalContext?.facilities?.find(f => f.name.toLowerCase() === w.toLowerCase());
                                            const defaultPrice = facMatch ? facMatch.pricePerDay : 0;
                                            setEditAdmissionForm(p => ({ ...p, ward: w, bedNumber: '', privateRoom: w === 'Private Room', dailyWardCharge: defaultPrice }));
                                        }}
                                        style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box', background: '#fff', cursor: 'pointer' }}
                                    >
                                        <option value="">— Select Ward —</option>
                                        {Object.keys(WARD_BED_MAP).map(w => (
                                            <option key={w} value={w}>{w}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>🛏️ Bed Number</label>
                                    <select
                                        value={editAdmissionForm.bedNumber}
                                        onChange={e => setEditAdmissionForm(p => ({ ...p, bedNumber: e.target.value }))}
                                        disabled={!editAdmissionForm.ward}
                                        style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box', background: editAdmissionForm.ward ? '#fff' : '#f8fafc', cursor: editAdmissionForm.ward ? 'pointer' : 'not-allowed', color: editAdmissionForm.ward ? '#1e293b' : '#94a3b8' }}
                                    >
                                        <option value="">{editAdmissionForm.ward ? '— Select Bed —' : '— Select Ward First —'}</option>
                                        {(WARD_BED_MAP[editAdmissionForm.ward] || []).map(b => (
                                            <option key={b} value={b}>{b}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Private Room Checkbox */}
                            <div style={{ marginBottom: '14px', padding: '12px 16px', background: editAdmissionForm.privateRoom ? 'linear-gradient(135deg, #eff6ff, #f0fdf4)' : '#f8fafc', borderRadius: '10px', border: `1.5px solid ${editAdmissionForm.privateRoom ? '#3b82f6' : '#e2e8f0'}`, transition: 'all 0.2s ease' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
                                    <input
                                        type="checkbox"
                                        checked={editAdmissionForm.privateRoom}
                                        onChange={e => setEditAdmissionForm(p => ({
                                            ...p,
                                            privateRoom: e.target.checked,
                                            ward: e.target.checked ? 'Private Room' : (p.ward === 'Private Room' ? '' : p.ward),
                                            bedNumber: e.target.checked ? '' : (p.ward === 'Private Room' ? '' : p.bedNumber)
                                        }))}
                                        style={{ width: '18px', height: '18px', accentColor: '#3b82f6', cursor: 'pointer', flexShrink: 0 }}
                                    />
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: editAdmissionForm.privateRoom ? '#1d4ed8' : '#374151' }}>🏨 Private / Personal Room</div>
                                        <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>Allocate an exclusive private room for this patient</div>
                                    </div>
                                    {editAdmissionForm.privateRoom && (
                                        <span style={{ marginLeft: 'auto', padding: '3px 10px', background: '#dbeafe', color: '#1d4ed8', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>✓ Selected</span>
                                    )}
                                </label>
                            </div>

                            <div style={{ marginBottom: '14px' }}>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>📅 Admission Date</label>
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                        <input type="date"
                                            value={editAdmissionForm.admissionDate}
                                        max={new Date().toISOString().split('T')[0]}
                                        onChange={e => setEditAdmissionForm(p => ({ ...p, admissionDate: e.target.value }))}
                                        style={{ flex: 1, padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box' }}
                                    />
                                    {editAdmissionForm.admissionDate && (() => {
                                        const d = Math.max(0, Math.floor((new Date() - new Date(editAdmissionForm.admissionDate)) / (1000 * 60 * 60 * 24)));
                                        return (
                                            <div style={{
                                                minWidth: '72px', padding: '10px 12px', borderRadius: '8px', textAlign: 'center',
                                                background: d > 7 ? '#fff1f2' : '#fef3c7',
                                                border: `1.5px solid ${d > 7 ? '#fda4af' : '#fde68a'}`,
                                                color: d > 7 ? '#be123c' : '#92400e', fontWeight: 800, fontSize: '0.9rem'
                                            }}>
                                                📆 {d}d
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>📝 Notes</label>
                                <textarea rows={3} placeholder="Update clinical notes..."
                                    value={editAdmissionForm.notes}
                                    onChange={e => setEditAdmissionForm(p => ({ ...p, notes: e.target.value }))}
                                    style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button onClick={handleUpdateAdmission} disabled={editAdmissionSaving}
                                    style={{ flex: 1, padding: '12px', background: 'linear-gradient(135deg, #0d9488, #0891b2)', color: '#fff', border: 'none', borderRadius: '9px', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}>
                                    {editAdmissionSaving ? 'Saving...' : (!editAdmissionModal.admission?.ward || !editAdmissionModal.admission?.bedNumber ? '💾 Confirm Allocation' : '🔄 Confirm Transfer')}
                                </button>
                                <button onClick={() => setEditAdmissionModal({ open: false, admission: null })}
                                    style={{ padding: '12px 20px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '9px', cursor: 'pointer', fontWeight: 600 }}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── COLLECT PAYMENT MODAL (required before discharge) ── */}
                {collectPaymentModal.open && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(4px)' }}>
                        <div style={{ background: '#fff', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '460px', boxShadow: '0 24px 60px rgba(0,0,0,0.22)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>💳 Collect Payment</h2>
                                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                                        Settle dues before discharging the patient
                                    </p>
                                </div>
                                <button onClick={() => setCollectPaymentModal({ open: false, admission: null, method: 'Cash' })}
                                    style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                            </div>

                            {/* Patient + Bill Summary */}
                            <div style={{ background: 'linear-gradient(135deg, #fef3c7, #fde68a)', borderRadius: '12px', padding: '16px', marginBottom: '18px', border: '1px solid #f59e0b' }}>
                                <div style={{ fontWeight: 800, fontSize: '1rem', color: '#78350f', marginBottom: '6px' }}>
                                    👤 {collectPaymentModal.admission?.patientName ||
                                        collectPaymentModal.admission?.patientId?.name ||
                                        [collectPaymentModal.admission?.patientId?.firstName, collectPaymentModal.admission?.patientId?.lastName].filter(Boolean).join(' ') ||
                                        'Patient'}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.85rem', color: '#92400e' }}>
                                        🛏️ {collectPaymentModal.admission?.ward || 'Ward'} — Bed {collectPaymentModal.admission?.bedNumber || '—'}
                                    </span>
                                    <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#b45309' }}>
                                        ₹{Number(collectPaymentModal.admission?.totalAmount || 0).toLocaleString('en-IN')}
                                    </span>
                                </div>
                                {collectPaymentModal.admission?.selectedFacilities?.length > 0 && (
                                    <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #fde68a' }}>
                                        {collectPaymentModal.admission.selectedFacilities.map((f, i) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#92400e' }}>
                                                <span>{f.facilityName} × {f.days}d</span>
                                                <span>₹{Number(f.totalAmount || 0).toLocaleString('en-IN')}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div style={{ marginBottom: '18px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Payment Method</label>
                                <select value={collectPaymentModal.method}
                                    onChange={e => setCollectPaymentModal(p => ({ ...p, method: e.target.value }))}
                                    style={{ width: '100%', padding: '11px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem' }}>
                                    <option>Cash</option>
                                    <option>UPI</option>
                                    <option>Card</option>
                                    <option>Cheque</option>
                                    <option>NEFT/RTGS</option>
                                </select>
                            </div>

                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button onClick={handleCollectAdmissionPayment} disabled={collectingPayment}
                                    style={{ flex: 1, padding: '12px', background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff', border: 'none', borderRadius: '9px', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}>
                                    {collectingPayment ? 'Processing...' : '✓ Confirm & Proceed to Discharge'}
                                </button>
                                <button onClick={() => setCollectPaymentModal({ open: false, admission: null, method: 'Cash' })}
                                    style={{ padding: '12px 20px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '9px', cursor: 'pointer', fontWeight: 600 }}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── DISCHARGE MODAL ── */}
                {dischargeModal.open && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(4px)' }}>
                        <div style={{ background: '#fff', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '480px', boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>🚪 Discharge Patient</h2>
                                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                                        {dischargeModal.admission?.patientId?.name ||
                                            [dischargeModal.admission?.patientId?.firstName, dischargeModal.admission?.patientId?.lastName].filter(Boolean).join(' ') ||
                                            'Patient'}
                                        {' '}— Bed {dischargeModal.admission?.bedNumber || '—'}, {dischargeModal.admission?.ward || 'Ward'}
                                    </p>
                                </div>
                                <button onClick={() => setDischargeModal({ open: false, admission: null })}
                                    style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>✕</button>
                            </div>

                            {/* Summary */}
                            <div style={{ background: '#f0fdf4', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px', border: '1px solid #bbf7d0' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    {[
                                        ['Patient', dischargeModal.admission?.patientId?.name || [dischargeModal.admission?.patientId?.firstName, dischargeModal.admission?.patientId?.lastName].filter(Boolean).join(' ') || '—'],
                                        ['Ward / Bed', `${dischargeModal.admission?.ward || '—'} / ${dischargeModal.admission?.bedNumber || '—'}`],
                                        ['Admitted', new Date(dischargeModal.admission?.admissionDate).toLocaleDateString('en-IN')],
                                        ['Total Bill', `₹${Number(dischargeModal.admission?.totalAmount > 0 ? dischargeModal.admission.totalAmount : ((hospitalContext?.facilities?.find(f => f.name.toLowerCase() === (dischargeModal.admission?.ward || '').toLowerCase())?.pricePerDay || dischargeModal.admission?.dailyWardCharge || 0) * Math.max(1, Math.floor((new Date() - new Date(dischargeModal.admission?.admissionDate)) / (1000 * 60 * 60 * 24))))).toLocaleString('en-IN')}`],
                                    ].map(([l, v], i) => (
                                        <div key={i} style={{ fontSize: '0.82rem' }}>
                                            <span style={{ color: '#94a3b8', fontWeight: 600 }}>{l}: </span>
                                            <span style={{ fontWeight: 700, color: '#1e293b' }}>{v}</span>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ marginTop: '10px', padding: '6px 10px', background: '#dcfce7', borderRadius: '8px', fontSize: '0.82rem', color: '#166534', fontWeight: 700 }}>
                                    ✅ Payment Confirmed — Ready for Discharge
                                </div>
                            </div>

                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Discharge Date</label>
                                <input type="date"
                                    value={dischargeForm.dischargeDate}
                                    onChange={e => setDischargeForm(p => ({ ...p, dischargeDate: e.target.value }))}
                                    style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Discharge Notes <span style={{ fontWeight: 400, color: '#94a3b8' }}>(Optional)</span></label>
                                <textarea rows={3}
                                    placeholder="e.g. Patient recovered well. Follow-up in 2 weeks..."
                                    value={dischargeForm.notes}
                                    onChange={e => setDischargeForm(p => ({ ...p, notes: e.target.value }))}
                                    style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button onClick={handleDischarge} disabled={dischargingSaving}
                                    style={{ flex: 1, padding: '12px', background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: '#fff', border: 'none', borderRadius: '9px', fontWeight: 700, fontSize: '0.95rem', cursor: dischargingSaving ? 'not-allowed' : 'pointer' }}>
                                    {dischargingSaving ? 'Processing...' : '🚪 Confirm Discharge'}
                                </button>
                                <button onClick={() => setDischargeModal({ open: false, admission: null })}
                                    style={{ padding: '12px 18px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '9px', cursor: 'pointer', fontWeight: 600 }}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }


    const pendingAllocationCount = admissions.filter(a => a.status === 'Pending Allocation').length;

    return (
        <>
            <div className="reception-dashboard">
                {/* DYNAMIC HEADER */}
                <div className="dashboard-header" style={{
                    background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                    borderRadius: '16px', padding: '20px 28px',
                    marginBottom: '20px', color: '#f8fafc',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    flexWrap: 'wrap', gap: '12px'
                }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>
                            {greeting()}, {currentUser?.name || 'Reception'} 👋
                        </h1>
                        <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>
                            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                            • {hospitalContext?.name || 'Hospital'}
                            {hospitalContext?.appointmentMode === 'token' && ' 🎟️ Token Mode'}
                            <span style={{ marginLeft: '8px', opacity: 0.6, fontSize: '0.75rem' }}>Auto-refreshes every 30s</span>
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button className="btn-cancel" onClick={() => setViewMode('transactions')}
                            style={{ padding: '10px 20px', fontSize: '0.9rem', background: 'rgba(255,255,255,0.08)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', cursor: 'pointer', fontWeight: 600 }}>
                            💰 My Collection
                        </button>
                        <button className="btn-cancel" onClick={() => {
                            if (profilePatient) {
                                navigate(`/billing/patient?search=${encodeURIComponent(profilePatient.patientId || profilePatient.name)}`);
                            } else if (searchQuery) {
                                navigate(`/billing/patient?search=${encodeURIComponent(searchQuery)}`);
                            } else {
                                navigate('/billing/patient');
                            }
                        }}
                            style={{ padding: '10px 20px', fontSize: '0.9rem', background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '10px', cursor: 'pointer', fontWeight: 600 }}>
                            🧾 Billing
                        </button>
                        <button onClick={() => { fetchAdmissions(); setViewMode('admitted'); }}
                            style={{
                                position: 'relative',
                                padding: '10px 20px',
                                fontSize: '0.9rem',
                                background: 'rgba(251,191,36,0.15)',
                                color: '#fbbf24',
                                border: '1px solid rgba(251,191,36,0.3)',
                                borderRadius: '10px',
                                cursor: 'pointer',
                                fontWeight: 600,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            🏥 Admitted Patients
                            {pendingAllocationCount > 0 && (
                                <span style={{
                                    background: '#ef4444',
                                    color: '#fff',
                                    borderRadius: '10px',
                                    padding: '2px 8px',
                                    fontSize: '0.75rem',
                                    fontWeight: 800,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    {pendingAllocationCount}
                                </span>
                            )}
                        </button>
                        <button onClick={handleNewWalkIn}
                            style={{ padding: '10px 24px', fontSize: '0.9rem', background: 'linear-gradient(135deg, #06b6d4, #0d9488)', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, boxShadow: '0 4px 16px rgba(13,148,136,0.3)' }}>
                            + New Registration
                        </button>
                    </div>
                </div>

                {/* DYNAMIC STATS BANNER */}
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: '12px', marginBottom: '20px'
                }}>
                    {[
                        { label: 'Total Today', value: totalToday, icon: '📋', color: '#3b82f6', bg: '#eff6ff' },
                        { label: 'Pending', value: pendingToday, icon: '⏳', color: '#d97706', bg: '#fffbeb' },
                        { label: 'Confirmed', value: confirmedToday, icon: '✅', color: '#059669', bg: '#f0fdf4' },
                        { label: 'Completed', value: completedToday, icon: '✔️', color: '#1d4ed8', bg: '#eff6ff' },
                        { label: 'Cancelled', value: cancelledToday, icon: '❌', color: '#dc2626', bg: '#fef2f2' },
                        { label: 'Revenue', value: `₹${revenueToday.toLocaleString('en-IN')}`, icon: '💰', color: '#7c3aed', bg: '#f5f3ff' },
                        { label: 'Unique Patients', value: totalUniquePatients, icon: '👥', color: '#0891b2', bg: '#ecfeff' },
                    ].map((s, i) => (
                        <div key={i} style={{
                            background: s.bg, borderRadius: '12px', padding: '16px',
                            border: `1px solid ${s.color}20`, textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>{s.icon}</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
                        </div>
                    ))}
                </div>

                {/* NEW REPORTING & OVERVIEW DASHBOARD WIDGETS */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '20px', marginBottom: '20px' }}>

                    {/* LEFT COLUMN: LIVE WARD OCCUPANCY & APPOINTMENT LOAD */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                        {/* WARD OCCUPANCY CARD */}
                        {(() => {
                            const occupiedBeds = admissions.filter(a => a.status === 'Admitted').length;
                            const pendingBeds = admissions.filter(a => a.status === 'Pending Allocation').length;
                            const totalBeds = 50; // Standard hospital capacity limit
                            const availableBeds = Math.max(0, totalBeds - occupiedBeds);
                            const occupancyRate = Math.round((occupiedBeds / totalBeds) * 100);

                            return (
                                <div style={{
                                    background: '#fff', borderRadius: '16px', padding: '24px',
                                    border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            🏥 Live Ward Occupancy
                                        </h3>
                                        <span style={{
                                            background: '#f0fdf4', color: '#166534', padding: '4px 10px',
                                            borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700
                                        }}>
                                            Active
                                        </span>
                                    </div>

                                    {/* Progress Visual */}
                                    <div style={{ marginBottom: '20px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#64748b', marginBottom: '6px' }}>
                                            <span>Capacity Occupancy</span>
                                            <span style={{ fontWeight: 700, color: '#0d9488' }}>{occupancyRate}% ({occupiedBeds}/{totalBeds})</span>
                                        </div>
                                        <div style={{ width: '100%', height: '10px', background: '#f1f5f9', borderRadius: '6px', overflow: 'hidden' }}>
                                            <div style={{ width: `${occupancyRate}%`, height: '100%', background: 'linear-gradient(90deg, #0d9488, #14b8a6)', borderRadius: '6px' }}></div>
                                        </div>
                                    </div>

                                    {/* Bed Info Breakdown */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                                        <div style={{ background: '#f0fdfa', borderRadius: '12px', padding: '12px', textAlign: 'center', border: '1px solid #ccfbf1' }}>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f766e' }}>{occupiedBeds}</div>
                                            <div style={{ fontSize: '0.72rem', color: '#0d9488', fontWeight: 600 }}>Occupied</div>
                                        </div>
                                        <div style={{ background: '#fffbeb', borderRadius: '12px', padding: '12px', textAlign: 'center', border: '1px solid #fef3c7' }}>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#b45309' }}>{pendingBeds}</div>
                                            <div style={{ fontSize: '0.72rem', color: '#d97706', fontWeight: 600 }}>Pending Alloc.</div>
                                        </div>
                                        <div style={{ background: '#eff6ff', borderRadius: '12px', padding: '12px', textAlign: 'center', border: '1px solid #dbeafe' }}>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1d4ed8' }}>{availableBeds}</div>
                                            <div style={{ fontSize: '0.72rem', color: '#1e40af', fontWeight: 600 }}>Available Beds</div>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => { fetchAdmissions(); setViewMode('admitted'); }}
                                        style={{
                                            width: '100%', padding: '12px', background: '#f1f5f9', color: '#475569',
                                            border: '1px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer',
                                            fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center',
                                            justifyContent: 'center', gap: '6px', transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9'; }}
                                    >
                                        🛌 Manage Ward & Allocations
                                    </button>
                                </div>
                            );
                        })()}

                        {/* DOCTOR SCHEDULING LOAD WIDGET */}
                        <div style={{
                            background: '#fff', borderRadius: '16px', padding: '24px',
                            border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
                        }}>
                            <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>
                                👨‍⚕️ Today's Appointment Distribution
                            </h3>

                            {(() => {
                                // Count appointments per doctor for today
                                const docCounts = {};
                                appointments.forEach(a => {
                                    const name = a.doctorName || 'General Practice';
                                    docCounts[name] = (docCounts[name] || 0) + 1;
                                });

                                const docData = Object.entries(docCounts)
                                    .map(([name, count]) => ({ name, count }))
                                    .sort((a, b) => b.count - a.count)
                                    .slice(0, 4);

                                if (docData.length === 0) {
                                    return (
                                        <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8' }}>
                                            <span style={{ fontSize: '1.8rem' }}>📅</span>
                                            <p style={{ margin: '6px 0 0', fontSize: '0.85rem' }}>No appointments booked for today yet.</p>
                                        </div>
                                    );
                                }

                                const maxCount = Math.max(...docData.map(d => d.count));

                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        {docData.map((d, index) => {
                                            const percentage = Math.max(5, Math.round((d.count / maxCount) * 100));
                                            const colors = ['#3b82f6', '#0d9488', '#8b5cf6', '#f59e0b'];
                                            const color = colors[index % colors.length];

                                            return (
                                                <div key={d.name}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                                                        <span style={{ fontWeight: 600, color: '#475569' }}>Dr. {d.name}</span>
                                                        <span style={{ fontWeight: 700, color: '#1e293b' }}>{d.count} patients</span>
                                                    </div>
                                                    <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                                                        <div style={{ width: `${percentage}%`, height: '100%', background: color, borderRadius: '4px' }}></div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>

                    </div>

                    {/* RIGHT COLUMN: RECENT OPERATIONS & BILLING LOG */}
                    <div style={{
                        background: '#fff', borderRadius: '16px', padding: '24px',
                        border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                        display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                    }}>
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    💰 Recent Transactions
                                </h3>
                                <button
                                    onClick={() => setViewMode('transactions')}
                                    style={{
                                        background: 'none', border: 'none', color: '#3b82f6', fontSize: '0.82rem',
                                        fontWeight: 700, cursor: 'pointer', padding: 0
                                    }}
                                >
                                    View All →
                                </button>
                            </div>

                            {/* Today's Collection Summary (mini) */}
                            {(() => {
                                const todayS = new Date(); todayS.setHours(0, 0, 0, 0);
                                const todayPaidTxns = transactions.filter(t => new Date(t.createdAt) >= todayS && (t.paymentStatus || '').toLowerCase() === 'paid');
                                const todayTotalMini = todayPaidTxns.reduce((s, t) => s + (t.amount || 0), 0);
                                return todayTotalMini > 0 ? (
                                    <div style={{ padding: '10px 14px', background: 'linear-gradient(90deg, #d1fae5, #a7f3d0)', borderRadius: '10px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#065f46' }}>✅ Today's Collection</span>
                                        <span style={{ fontSize: '1rem', fontWeight: 900, color: '#065f46' }}>₹{todayTotalMini.toLocaleString('en-IN')}</span>
                                    </div>
                                ) : null;
                            })()}

                            {/* Transactions List */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {transactions.slice(0, 4).length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                                        <span style={{ fontSize: '2rem' }}>🧾</span>
                                        <p style={{ margin: '8px 0 0', fontSize: '0.88rem' }}>No recent transactions recorded today.</p>
                                    </div>
                                ) : (
                                    transactions.slice(0, 4).map(t => {
                                        const isPaid = (t.paymentStatus || '').toLowerCase() === 'paid';
                                        return (
                                            <div key={t._id} style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                padding: '12px 14px', background: '#f8fafc', borderRadius: '12px',
                                                border: '1px solid #f1f5f9', transition: 'transform 0.15s'
                                            }}
                                                onMouseEnter={e => { e.currentTarget.style.transform = 'translateX(2px)'; }}
                                                onMouseLeave={e => { e.currentTarget.style.transform = 'translateX(0)'; }}
                                            >
                                                <div>
                                                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>
                                                        {t.userId?.name || 'Walk-in Patient'}
                                                    </div>
                                                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                                                        Dr. {t.doctorName || '-'} • <span style={{ fontWeight: 600 }}>{t.paymentMethod || 'Cash'}</span>
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#16a34a' }}>
                                                        ₹{t.amount}
                                                    </div>
                                                    <span style={{
                                                        display: 'inline-block', padding: '2px 8px', borderRadius: '12px',
                                                        fontSize: '0.7rem', fontWeight: 700, marginTop: '4px',
                                                        background: isPaid ? '#dcfce7' : '#fee2e2',
                                                        color: isPaid ? '#15803d' : '#991b1b'
                                                    }}>
                                                        {isPaid ? 'Paid' : 'Pending'}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* Quick System Action Alerts */}
                        <div style={{
                            marginTop: '20px',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            background: '#eff6ff', padding: '12px 16px', borderRadius: '12px', border: '1px solid #bfdbfe'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '1.2rem' }}>ℹ️</span>
                                <span style={{ fontSize: '0.82rem', color: '#1e40af', fontWeight: 600 }}>
                                    System Auto-refresh is enabled. Live connection active.
                                </span>
                            </div>
                            <span style={{
                                width: '8px', height: '8px', background: '#10b981',
                                borderRadius: '50%', display: 'inline-block', boxShadow: '0 0 8px #10b981'
                            }}></span>
                        </div>

                    </div>

                </div>

                {/* SEARCH + QUICK BOOK ROW */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                    {/* SEARCH SECTION */}
                    <div className="search-section card" style={{ padding: '16px', position: 'relative', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <h4 style={{ margin: '0 0 8px', fontSize: '0.82rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>🔍 Find Patient</h4>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="text"
                                placeholder="Search by Name, Mobile or MRN..."
                                value={searchQuery}
                                onChange={handleSearch}
                                style={{ flex: 1, padding: '10px 14px', fontSize: '0.9rem', borderRadius: '8px', border: '1.5px solid #e2e8f0', outline: 'none' }}
                            />
                        </div>
                        {searchResults.length > 0 && (
                            <div className="search-results-dropdown" style={{
                                position: 'absolute', top: '76px', left: '16px', right: '16px',
                                background: 'white', border: '1px solid #e2e8f0', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                zIndex: 1000, maxHeight: '280px', overflowY: 'auto', borderRadius: '10px'
                            }}>
                                {searchResults.map(p => (
                                    <div key={p._id} style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#1e293b' }}>{p.name} <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>({p.patientId || 'N/A'})</span></div>
                                            <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>📱 {p.phone}</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <button onClick={() => handleViewProfile(p)}
                                                style={{ padding: '5px 12px', fontSize: '0.8rem', background: '#f0f4ff', color: '#3b82f6', border: '1.5px solid #3b82f6', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                                                View
                                            </button>
                                            <button onClick={() => handleEditPatient(p)}
                                                style={{ padding: '5px 12px', fontSize: '0.8rem', background: '#0d9488', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                                                Book
                                            </button>
                                            <button onClick={() => navigate(`/billing/patient?search=${encodeURIComponent(p.patientId || p.name)}`)}
                                                style={{ padding: '5px 12px', fontSize: '0.8rem', background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid #10b981', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                                                🧾 Billing
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* AVAILABILITY WIDGET */}
                    <div className="availability-widget card" style={{ padding: '16px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <h4 style={{ margin: '0 0 8px', fontSize: '0.82rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>📅 Quick Availability</h4>
                        <div className="widget-controls" style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                            <select className="avail-select" onChange={(e) => setAvailabilityCheck({ ...availabilityCheck, doctorId: e.target.value })}
                                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.85rem' }}>
                                <option value="">Select Doctor</option>
                                {doctorsList.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                            </select>
                            <input type="date" value={availabilityCheck.date} onChange={(e) => setAvailabilityCheck({ ...availabilityCheck, date: e.target.value })}
                                style={{ padding: '10px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.85rem' }} />
                        </div>
                        {availabilityCheck.doctorId && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {timeSlots.map(t => {
                                    const isBooked = availabilityCheck.bookedSlots.includes(t);
                                    const isPast = availabilityCheck.date === todayStr && (() => {
                                        const [h, m] = t.split(':').map(Number);
                                        const now = new Date();
                                        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m) <= now;
                                    })();
                                    return (
                                        <button key={t} type="button"
                                            onClick={() => !isBooked && !isPast && handleSlotClick(t)}
                                            disabled={isBooked || isPast}
                                            style={{
                                                padding: '6px 10px', fontSize: '0.78rem', borderRadius: '6px', border: '1px solid #e2e8f0',
                                                background: isBooked ? '#fee2e2' : isPast ? '#f1f5f9' : '#fff',
                                                color: isBooked ? '#dc2626' : isPast ? '#94a3b8' : '#1e293b',
                                                cursor: isBooked || isPast ? 'not-allowed' : 'pointer', fontWeight: 600,
                                                opacity: isBooked || isPast ? 0.6 : 1
                                            }}
                                        >
                                            {t}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* TODAY'S QUEUE WITH STATUS FILTER */}
                <div className="appointments-list" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '16px 20px', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '10px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#1e293b', fontWeight: 700 }}>
                                {statusFilter === 'report_follow_up' ? "Pending Report Follow-ups 📝" : dateTab === 'today' ? "Today's Queue" : dateTab === 'tomorrow' ? "Tomorrow's Schedule" : dateTab === 'future' ? "Future Schedule" : "Patient Queue"}
                            </h3>
                            
                            {/* Date Range Tabs Selector */}
                            {statusFilter !== 'report_follow_up' && (
                                <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px', gap: '2px' }}>
                                    {[
                                        { id: 'today', label: 'Today' },
                                        { id: 'tomorrow', label: 'Tomorrow' },
                                        { id: 'future', label: 'Future' }
                                    ].map(t => (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => {
                                                setDateTab(t.id);
                                                if (t.id === 'today') {
                                                    setSelectedQueueDate(todayStr);
                                                    fetchAppointments(todayStr, false, false);
                                                } else if (t.id === 'tomorrow') {
                                                    const tom = new Date(); tom.setDate(tom.getDate() + 1);
                                                    const tomStr = getLocalDateString(tom);
                                                    setSelectedQueueDate(tomStr);
                                                    fetchAppointments(tomStr, false, true);
                                                } else {
                                                    setSelectedQueueDate('');
                                                    fetchAppointments('', true, false);
                                                }
                                            }}
                                            style={{
                                                padding: '4px 10px',
                                                borderRadius: '6px',
                                                border: 'none',
                                                fontSize: '0.78rem',
                                                fontWeight: '700',
                                                cursor: 'pointer',
                                                background: dateTab === t.id ? '#fff' : 'transparent',
                                                color: dateTab === t.id ? '#1e293b' : '#64748b',
                                                boxShadow: dateTab === t.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {dateTab !== 'future' && statusFilter !== 'report_follow_up' && (
                                <input
                                    type="date"
                                    value={selectedQueueDate}
                                    onChange={(e) => {
                                        const newDate = e.target.value;
                                        setSelectedQueueDate(newDate);
                                        const tom = new Date(); tom.setDate(tom.getDate() + 1);
                                        const tomStr = tom.toISOString().split('T')[0];
                                        setDateTab(newDate === todayStr ? 'today' : newDate === tomStr ? 'tomorrow' : 'custom');
                                        fetchAppointments(newDate, false);
                                    }}
                                    style={{
                                        padding: '5px 10px',
                                        borderRadius: '8px',
                                        border: '1.5px solid #e2e8f0',
                                        fontSize: '0.8rem',
                                        color: '#475569',
                                        fontWeight: '600',
                                        outline: 'none',
                                        cursor: 'pointer',
                                        background: '#f8fafc'
                                    }}
                                />
                            )}

                            <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 10px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 600 }}>
                                {filteredAppointments.length} patients
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {[
                                { key: 'all', label: 'All', color: '#3b82f6' },
                                { key: 'pending', label: 'Pending', color: '#d97706' },
                                { key: 'confirmed', label: 'Confirmed', color: '#059669' },
                                { key: 'completed', label: 'Completed', color: '#1d4ed8' },
                                { key: 'cancelled', label: 'Cancelled', color: '#dc2626' },
                                { key: 'report_follow_up', label: 'Report Follow-ups 📝', color: '#8b5cf6' },
                            ].map(f => (
                                <button key={f.key}
                                    onClick={() => {
                                        setStatusFilter(f.key);
                                        if (f.key === 'report_follow_up') {
                                            fetchAppointments(undefined, undefined, undefined, true);
                                        } else {
                                            fetchAppointments(selectedQueueDate, dateTab === 'future', dateTab === 'tomorrow', false);
                                        }
                                    }}
                                    style={{
                                        padding: '6px 14px', borderRadius: '8px', border: '1.5px solid',
                                        borderColor: statusFilter === f.key ? f.color : '#e2e8f0',
                                        background: statusFilter === f.key ? `${f.color}10` : '#fff',
                                        color: statusFilter === f.key ? f.color : '#64748b',
                                        cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem',
                                        transition: 'all 0.15s'
                                    }}>
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {statusFilter === 'completed' && (
                        <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0' }}>
                            <input
                                type="text"
                                placeholder="Search completed patients by name or ID..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.9rem', outline: 'none' }}
                            />
                        </div>
                    )}

                    <div className="table-responsive">
                        {statusFilter === 'completed' ? (
                            <>
                            <table className="reception-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc' }}>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>Patient Name</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>UHID (ID)</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>Doctor Name</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>Completion Date</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>Completion Time</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>Consultation Status</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {completedAppointments.filter(a => {
                                        const q = searchQuery.toLowerCase().trim();
                                        if (!q) return true;
                                        return (a.userId?.name || '').toLowerCase().includes(q) || (a.userId?.patientId || a.patientId || '').toLowerCase().includes(q);
                                    }).length === 0 ? (
                                            <tr><td colSpan="7" style={{ textAlign: 'center', color: '#888', padding: '30px' }}>No completed consultations found.</td></tr>
                                        ) : (
                                            completedAppointments.filter(a => {
                                                const q = searchQuery.toLowerCase().trim();
                                                if (!q) return true;
                                                return (a.userId?.name || '').toLowerCase().includes(q) || (a.userId?.patientId || a.patientId || '').toLowerCase().includes(q);
                                            }).map((a, idx) => {
                                                const compDate = a.completedAt ? new Date(a.completedAt) : new Date(a.updatedAt);
                                                const isCurrentlyAdmitted = admissions.some(adm => (adm.appointmentId?._id || adm.appointmentId) === a._id && (adm.status === 'Admitted' || adm.status === 'Pending Allocation'));
                                                return (
                                                    <tr key={a._id || idx}
                                                        style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}
                                                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                        <td style={{ padding: '12px 16px', fontWeight: 'bold', color: '#1e293b' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <span>{a.userId?.name || 'Walk-in Patient'}</span>
                                                                {a.recommendAdmission && !isCurrentlyAdmitted && (
                                                                    <span style={{
                                                                        background: '#fee2e2',
                                                                        color: '#b91c1c',
                                                                        fontSize: '10px',
                                                                        fontWeight: 800,
                                                                        padding: '2px 8px',
                                                                        borderRadius: '12px',
                                                                        border: '1px solid #fca5a5',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '3px',
                                                                        animation: 'pulse 2s infinite'
                                                                    }} title={`Recommended by Doctor. Notes: ${a.recommendAdmissionNotes || 'None'}`}>
                                                                        🚨 Admit Recommended
                                                                    </span>
                                                                )}
                                                                {isCurrentlyAdmitted && (
                                                                    <span style={{
                                                                        background: '#e0f2fe',
                                                                        color: '#0369a1',
                                                                        fontSize: '10px',
                                                                        fontWeight: 800,
                                                                        padding: '2px 8px',
                                                                        borderRadius: '12px',
                                                                        border: '1px solid #bae6fd',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '3px'
                                                                    }}>
                                                                        🏥 Admitted
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '12px 16px' }}>
                                                            {a.userId?.patientId || a.patientId || 'N/A'}
                                                        </td>
                                                        <td style={{ padding: '12px 16px', color: '#0d9488', fontWeight: 600 }}>
                                                            Dr. {a.doctorName || 'General'}
                                                        </td>
                                                        <td style={{ padding: '12px 16px' }}>
                                                            {compDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                        </td>
                                                        <td style={{ padding: '12px 16px' }}>
                                                            {compDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                                        </td>
                                                        <td style={{ padding: '12px 16px' }}>
                                                            <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold', background: '#dbeafe', color: '#1e40af' }}>
                                                                {a.status || 'completed'}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '12px 16px' }}>
                                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                                {a.requestReportFollowUp && !a.followUpScheduled && (
                                                                    <button onClick={() => handleScheduleFollowUp(a)}
                                                                        style={{ padding: '5px 10px', fontSize: '0.72rem', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                                                                        📅 Schedule Follow-up
                                                                    </button>
                                                                )}
                                                                {a.recommendAdmission && !isCurrentlyAdmitted && (
                                                                    <button onClick={() => openHospitalizeModal(a)}
                                                                        style={{ padding: '5px 10px', fontSize: '0.72rem', background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                                                                        🏥 Admit
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                </tbody>
                                </table>
                            </>
                        ) : (
                            <table className="reception-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc' }}>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>#</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>Patient</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>Doctor</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>{hospitalContext?.appointmentMode === 'token' ? 'Token' : 'Time'}</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>Payment</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>Status</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>Actions</th>
                                    </tr>
                                </thead>
                            <tbody>
                                {filteredAppointments.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                                            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>{statusFilter === 'all' ? '📭' : '🔍'}</div>
                                            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                                                {statusFilter === 'all' ? 'No appointments today' : statusFilter === 'report_follow_up' ? 'No report follow-ups pending' : `No ${statusFilter} appointments`}
                                            </div>
                                            <div style={{ fontSize: '0.82rem', marginTop: '4px' }}>
                                                {statusFilter === 'all' ? 'New registrations will appear here.' : 'No appointments match this status filter.'}
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredAppointments.map((apt, idx) => {
                                        const payStatus = (apt.paymentStatus || '').toLowerCase();
                                        const isCurrentlyAdmitted = admissions.some(adm => (adm.appointmentId?._id || adm.appointmentId) === apt._id && (adm.status === 'Admitted' || adm.status === 'Pending Allocation'));
                                        return (
                                            <tr key={apt._id}
                                                style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                <td style={{ padding: '12px 16px', color: '#94a3b8', fontWeight: 600, fontSize: '0.82rem' }}>{idx + 1}</td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>{apt.userId?.name || apt.patientName || 'Walk-in'}</div>
                                                        {apt.recommendAdmission && !isCurrentlyAdmitted && (
                                                            <span style={{
                                                                background: '#fee2e2',
                                                                color: '#b91c1c',
                                                                fontSize: '10px',
                                                                fontWeight: 800,
                                                                padding: '2px 8px',
                                                                borderRadius: '12px',
                                                                border: '1px solid #fca5a5',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '3px',
                                                                animation: 'pulse 2s infinite'
                                                            }} title={`Recommended by Doctor. Notes: ${apt.recommendAdmissionNotes || 'None'}`}>
                                                                🚨 Admit Recommended
                                                            </span>
                                                        )}
                                                        {isCurrentlyAdmitted && (
                                                            <span style={{
                                                                background: '#e0f2fe',
                                                                color: '#0369a1',
                                                                fontSize: '10px',
                                                                fontWeight: 800,
                                                                padding: '2px 8px',
                                                                borderRadius: '12px',
                                                                border: '1px solid #bae6fd',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '3px'
                                                            }}>
                                                                🏥 Admitted
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>📱 {apt.userId?.phone || apt.patientPhone || '-'} {apt.userId?.patientId || apt.patientId ? `| ${apt.userId?.patientId || apt.patientId}` : ''}</div>
                                                </td>
                                                <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#475569', fontWeight: 500 }}>
                                                    <span style={{ color: '#0d9488', fontWeight: 600 }}>Dr.</span> {apt.doctorName || 'N/A'}
                                                    {apt.serviceName && <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{apt.serviceName}</div>}
                                                </td>
                                                <td style={{ padding: '12px 16px', fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>
                                                    {apt.tokenNumber != null
                                                        ? <span style={{ color: '#d97706' }}>#{apt.tokenNumber}</span>
                                                        : apt.appointmentTime?.startsWith('token-')
                                                            ? <span style={{ color: '#d97706' }}>#{apt.appointmentTime.replace('token-', '')}</span>
                                                            : apt.appointmentTime || '-'}
                                                </td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    <span style={{
                                                        padding: '3px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700,
                                                        background: payStatus === 'paid' ? '#dcfce7' : '#fef3c7',
                                                        color: payStatus === 'paid' ? '#166534' : '#92400e'
                                                    }}>
                                                        {payStatus === 'paid' ? 'Paid' : apt.paymentStatus || 'Pending'}
                                                        {apt.amount > 0 && ` • ₹${Number(apt.amount).toLocaleString('en-IN')}`}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    <span style={{
                                                        padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'capitalize',
                                                        background: apt.status === 'confirmed' ? '#dcfce7' : apt.status === 'completed' ? '#dbeafe' : apt.status === 'cancelled' ? '#fee2e2' : '#fef3c7',
                                                        color: apt.status === 'confirmed' ? '#166534' : apt.status === 'completed' ? '#1e40af' : apt.status === 'cancelled' ? '#991b1b' : '#92400e'
                                                    }}>{apt.status}</span>
                                                </td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                        {statusFilter === 'report_follow_up' ? (
                                                            <button onClick={() => handleScheduleFollowUp(apt)}
                                                                style={{ padding: '5px 10px', fontSize: '0.72rem', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                                                                📅 Schedule Follow-up
                                                            </button>
                                                        ) : (
                                                            <>
                                                                {apt.requestReportFollowUp && !apt.followUpScheduled && (
                                                                    <button onClick={() => handleScheduleFollowUp(apt)}
                                                                        style={{ padding: '5px 10px', fontSize: '0.72rem', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                                                                        📅 Schedule Follow-up
                                                                    </button>
                                                                )}
                                                                {apt.status === 'pending' && (apt.userId?._id || apt.userId) && (
                                                                    <button onClick={() => handleCheckIn(apt)}
                                                                        style={{ padding: '5px 10px', fontSize: '0.72rem', background: '#0d9488', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                                                                        Check In
                                                                    </button>
                                                                )}
                                                                {payStatus !== 'paid' && apt.status !== 'cancelled' && (
                                                                    <button onClick={() => setPaymentModal({ open: true, appointment: apt, method: apt.paymentMethod || 'Cash' })}
                                                                        style={{ padding: '5px 10px', fontSize: '0.72rem', background: '#dcfce7', color: '#166534', border: '1px solid #86efac', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                                                                        💰 Pay
                                                                    </button>
                                                                )}
                                                                {payStatus === 'paid' && (
                                                                    <button onClick={() => generateReceiptPDF(apt)}
                                                                        style={{ padding: '5px 10px', fontSize: '0.72rem', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                                                                        🧾 Receipt
                                                                    </button>
                                                                )}
                                                                {((apt.status !== 'cancelled' && apt.status !== 'completed' && !isCurrentlyAdmitted) || (apt.recommendAdmission && !isCurrentlyAdmitted)) && (
                                                                    <>
                                                                        <button onClick={() => openHospitalizeModal(apt)}
                                                                            style={{ padding: '5px 10px', fontSize: '0.72rem', background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                                                                            🏥 Admit
                                                                        </button>
                                                                        {apt.status !== 'completed' && (
                                                                            <button onClick={() => handleCancelAppointment(apt._id)}
                                                                                style={{ padding: '5px 10px', fontSize: '0.72rem', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                                                                                ✕ Cancel
                                                                            </button>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>

            {/* Payment Confirmation Modal */}
            {paymentModal.open && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div style={{ background: '#fff', borderRadius: '14px', padding: '28px', width: '100%', maxWidth: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>💰 Confirm Payment</h2>
                                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.88rem' }}>
                                    {paymentModal.appointment?.userId?.name} — Rs. {Number(paymentModal.appointment?.amount || 0).toLocaleString('en-IN')}
                                </p>
                            </div>
                            <button onClick={() => setPaymentModal({ open: false, appointment: null, method: 'Cash' })} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                        </div>
                        <div style={{ marginBottom: '18px' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '7px' }}>Payment Method</label>
                            <select
                                value={paymentModal.method}
                                onChange={e => setPaymentModal(p => ({ ...p, method: e.target.value }))}
                                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem' }}
                            >
                                <option value="Cash">Cash</option>
                                <option value="UPI">UPI</option>
                                <option value="Card">Card</option>
                                <option value="Cheque">Cheque</option>
                                <option value="NEFT/RTGS">NEFT / RTGS</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                                onClick={handleConfirmPayment}
                                disabled={confirmingPayment}
                                style={{ flex: 1, padding: '11px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}
                            >
                                {confirmingPayment ? 'Confirming...' : '✓ Confirm & Print Receipt'}
                            </button>
                            <button
                                onClick={() => setPaymentModal({ open: false, appointment: null, method: 'Cash' })}
                                style={{ padding: '11px 18px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem' }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Hospitalize Modal */}
            {hospitalizeModal.open && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div style={{ background: '#fff', borderRadius: '14px', padding: '28px', width: '100%', maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Hospitalize Patient</h2>
                                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                                    {hospitalizeModal.appointment?.userId?.name} — {hospitalizeModal.appointment?.doctorName}
                                </p>
                            </div>
                            <button onClick={() => setHospitalizeModal({ open: false, appointment: null })} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                        </div>

                        {/* Bed & Ward */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '12px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>🏥 Ward / Room</label>
                                <select
                                    value={hospitalizeForm.ward}
                                    onChange={e => {
                                        const w = e.target.value;
                                        const facMatch = hospitalContext?.facilities?.find(f => f.name.toLowerCase() === w.toLowerCase());
                                        const defaultPrice = facMatch ? facMatch.pricePerDay : 0;
                                        setHospitalizeForm(p => ({ ...p, ward: w, bedNumber: '', privateRoom: w === 'Private Room', dailyWardCharge: defaultPrice }));
                                    }}
                                    style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box', background: '#fff', cursor: 'pointer' }}
                                >
                                    <option value="">— Select Ward —</option>
                                    {Object.keys(WARD_BED_MAP).map(w => (
                                        <option key={w} value={w}>{w}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>🛏️ Bed Number</label>
                                <select
                                    value={hospitalizeForm.bedNumber}
                                    onChange={e => setHospitalizeForm(p => ({ ...p, bedNumber: e.target.value }))}
                                    disabled={!hospitalizeForm.ward}
                                    style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box', background: hospitalizeForm.ward ? '#fff' : '#f8fafc', cursor: hospitalizeForm.ward ? 'pointer' : 'not-allowed', color: hospitalizeForm.ward ? '#1e293b' : '#94a3b8' }}
                                >
                                    <option value="">{hospitalizeForm.ward ? '— Select Bed —' : '— Select Ward First —'}</option>
                                    {(WARD_BED_MAP[hospitalizeForm.ward] || []).map(b => (
                                        <option key={b} value={b}>{b}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Private Room Checkbox */}
                        <div style={{ marginBottom: '16px', padding: '12px 16px', background: hospitalizeForm.privateRoom ? 'linear-gradient(135deg, #eff6ff, #f0fdf4)' : '#f8fafc', borderRadius: '10px', border: `1.5px solid ${hospitalizeForm.privateRoom ? '#3b82f6' : '#e2e8f0'}`, transition: 'all 0.2s ease' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
                                <input
                                    type="checkbox"
                                    checked={hospitalizeForm.privateRoom}
                                    onChange={e => setHospitalizeForm(p => ({
                                        ...p,
                                        privateRoom: e.target.checked,
                                        ward: e.target.checked ? 'Private Room' : (p.ward === 'Private Room' ? '' : p.ward),
                                        bedNumber: e.target.checked ? '' : (p.ward === 'Private Room' ? '' : p.bedNumber)
                                    }))}
                                    style={{ width: '18px', height: '18px', accentColor: '#3b82f6', cursor: 'pointer', flexShrink: 0 }}
                                />
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: hospitalizeForm.privateRoom ? '#1d4ed8' : '#374151' }}>🏨 Private / Personal Room</div>
                                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>Patient will be allocated an exclusive private room with premium amenities</div>
                                </div>
                                {hospitalizeForm.privateRoom && (
                                    <span style={{ marginLeft: 'auto', padding: '3px 10px', background: '#dbeafe', color: '#1d4ed8', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>✓ Selected</span>
                                )}
                            </label>
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Admission Date</label>
                            <input
                                type="date"
                                value={hospitalizeForm.admissionDate}
                                onChange={e => setHospitalizeForm(p => ({ ...p, admissionDate: e.target.value }))}
                                style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem' }}
                            />
                        </div>

                        {/* Facilities */}
                        {(hospitalContext?.facilities?.length > 0) ? (
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '10px' }}>
                                    Select Facilities &amp; Days
                                </label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {hospitalContext.facilities.map(f => (
                                        <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{f.name}</div>
                                                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>₹{f.pricePerDay}/day</div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <label style={{ fontSize: '0.82rem', color: '#475569' }}>Days:</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    placeholder="0"
                                                    value={hospitalizeForm.facilityDays[f.name] || ''}
                                                    onChange={e => setHospitalizeForm(p => ({ ...p, facilityDays: { ...p.facilityDays, [f.name]: e.target.value } }))}
                                                    style={{ width: '70px', padding: '6px 10px', border: '1.5px solid #e2e8f0', borderRadius: '7px', fontSize: '0.9rem', textAlign: 'center' }}
                                                />
                                            </div>
                                            {hospitalizeForm.facilityDays[f.name] > 0 && (
                                                <div style={{ fontWeight: 700, color: '#1d4ed8', fontSize: '0.9rem', minWidth: '70px', textAlign: 'right' }}>
                                                    ₹{(f.pricePerDay * Number(hospitalizeForm.facilityDays[f.name])).toLocaleString('en-IN')}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                {/* Total */}
                                {Object.values(hospitalizeForm.facilityDays).some(d => d > 0) && (
                                    <div style={{ marginTop: '12px', padding: '10px 14px', background: '#eff6ff', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                                        <span>Total Facility Cost:</span>
                                        <span style={{ color: '#1d4ed8' }}>
                                            ₹{(hospitalContext.facilities.reduce((sum, f) => sum + (f.pricePerDay * (Number(hospitalizeForm.facilityDays[f.name]) || 0)), 0)).toLocaleString('en-IN')}
                                        </span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ padding: '12px 14px', background: '#fef9c3', borderRadius: '8px', fontSize: '0.88rem', color: '#92400e', marginBottom: '16px' }}>
                                No facilities configured. Hospital admin can add facilities from the Hospital Admin Dashboard.
                            </div>
                        )}

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Notes (optional)</label>
                            <textarea
                                placeholder="Any notes for admission..."
                                value={hospitalizeForm.notes}
                                onChange={e => setHospitalizeForm(p => ({ ...p, notes: e.target.value }))}
                                rows={2}
                                style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box' }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setHospitalizeModal({ open: false, appointment: null })} style={{ padding: '10px 20px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, color: '#475569' }}>
                                Cancel
                            </button>
                            <button
                                onClick={handleHospitalize}
                                disabled={hospitalizingSaving}
                                style={{ padding: '10px 24px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem', opacity: hospitalizingSaving ? 0.6 : 1 }}
                            >
                                {hospitalizingSaving ? 'Admitting...' : 'Admit Patient'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reschedule Modal */}
            {rescheduleModal.open && rescheduleModal.appointment && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div style={{ background: '#fff', borderRadius: '14px', padding: '28px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>📅 Reschedule Appointment</h2>
                                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.88rem' }}>
                                    {rescheduleModal.appointment.userId?.name} — Dr. {rescheduleModal.appointment.doctorName}
                                </p>
                            </div>
                            <button onClick={() => setRescheduleModal({ open: false, appointment: null })} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                        </div>

                        <form onSubmit={submitReschedule}>
                            <div style={{ marginBottom: '18px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '7px' }}>New Appointment Date</label>
                                <input
                                    type="date"
                                    required
                                    value={rescheduleForm.date}
                                    onChange={e => setRescheduleForm({ ...rescheduleForm, date: e.target.value, time: '' })}
                                    min={new Date().toISOString().split('T')[0]}
                                    style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                                />
                            </div>

                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Select Available Slot</label>
                                {rescheduleForm.date ? (
                                    rescheduleAvailableTimes.length > 0 ? (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '8px' }}>
                                            {rescheduleAvailableTimes.map(slot => {
                                                const isSelected = rescheduleForm.time === slot;
                                                return (
                                                    <button
                                                        key={slot}
                                                        type="button"
                                                        onClick={() => setRescheduleForm({ ...rescheduleForm, time: slot })}
                                                        style={{
                                                            padding: '10px 4px',
                                                            fontSize: '0.85rem',
                                                            fontWeight: 700,
                                                            border: isSelected ? 'none' : '1px solid #e2e8f0',
                                                            borderRadius: '6px',
                                                            cursor: 'pointer',
                                                            background: isSelected ? '#d97706' : '#fff',
                                                            color: isSelected ? '#fff' : '#1e293b',
                                                            transition: 'all 0.15s'
                                                        }}
                                                    >
                                                        {slot}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <p style={{ color: '#ef4444', fontSize: '0.88rem', margin: 0 }}>No slots available on this date.</p>
                                    )
                                ) : (
                                    <p style={{ color: '#64748b', fontSize: '0.88rem', margin: 0, fontStyle: 'italic' }}>Please select a date first.</p>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '24px' }}>
                                <button
                                    type="button"
                                    onClick={() => setRescheduleModal({ open: false, appointment: null })}
                                    style={{ padding: '10px 20px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, color: '#475569' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={!rescheduleForm.date || !rescheduleForm.time}
                                    style={{ padding: '10px 24px', background: '#d97706', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem', opacity: (!rescheduleForm.date || !rescheduleForm.time) ? 0.6 : 1 }}
                                >
                                    Confirm Reschedule
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
};

export default ReceptionDashboard;