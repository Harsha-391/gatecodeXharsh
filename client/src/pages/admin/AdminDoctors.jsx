//
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAuth, useAdminEntities } from '../../store/hooks';
import { fetchAdminDoctors, createDoctor, updateDoctor, deleteDoctor } from '../../store/slices/adminEntitiesSlice';
import '../administration/SuperAdmin.css';

const AdminDoctors = () => {
    const navigate = useNavigate();
    const dispatch = useAppDispatch();
    const { user } = useAuth();
    const { doctors: doctorsState } = useAdminEntities();

    const doctors = doctorsState.data;
    const loadingData = doctorsState.loading;
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [editingDoctor, setEditingDoctor] = useState(null);
    const [showForm, setShowForm] = useState(false);

    // Pay Salary States
    const [paySalaryModal, setPaySalaryModal] = useState(null); // { doctor }
    const [salaryAmount, setSalaryAmount] = useState('50000');
    const [salaryDescription, setSalaryDescription] = useState('');
    const [submittingSalary, setSubmittingSalary] = useState(false);
    const [salaryError, setSalaryError] = useState('');
    const [salarySuccess, setSalarySuccess] = useState('');
    const [salaryHistory, setSalaryHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const [salaryHistoryModal, setSalaryHistoryModal] = useState(null); // { doctor }

    // Default Availability Structure
    const defaultAvailability = {
        monday: { available: false, startTime: '09:00', endTime: '17:00' },
        tuesday: { available: false, startTime: '09:00', endTime: '17:00' },
        wednesday: { available: false, startTime: '09:00', endTime: '17:00' },
        thursday: { available: false, startTime: '09:00', endTime: '17:00' },
        friday: { available: false, startTime: '09:00', endTime: '17:00' },
        saturday: { available: false, startTime: '09:00', endTime: '17:00' },
        sunday: { available: false, startTime: '09:00', endTime: '17:00' }
    };

    const initialFormState = {
        name: '',
        email: '',
        phone: '',
        password: '',
        specialty: '',
        experience: '',
        education: '',
        services: [],
        availability: defaultAvailability,
        successRate: '90%',
        patientsCount: '100+',
        image: '👨‍⚕️',
        bio: '',
        consultationFee: 0,

        // Personal details
        firstName: '',
        middleName: '',
        lastName: '',
        dob: '',
        gender: 'Male',
        bloodGroup: 'O+',
        nationalId: '',
        personalEmail: '',
        medicalLicense: '',
        specialization: '',
        qualification: [],
        experienceYears: 0,
        joiningDate: '',
        employmentType: 'Full-time',
        status: 'Active',
        currentAddress: '',
        emergencyContact: {
            name: '',
            relationship: '',
            phone: ''
        }
    };

    const [formData, setFormData] = useState(initialFormState);

    // Modal State Hooks for Personal Info
    const [showInfoModal, setShowInfoModal] = useState(false);
    const [infoDoctor, setInfoDoctor] = useState(null);
    const [infoFormData, setInfoFormData] = useState(null);
    const [infoLoading, setInfoLoading] = useState(false);
    const [infoError, setInfoError] = useState('');
    const [infoSuccess, setInfoSuccess] = useState('');
    const [isInfoEditMode, setIsInfoEditMode] = useState(false);

    const availableServices = [
        { id: 'ivf', name: 'In Vitro Fertilization (IVF)' },
        { id: 'iui', name: 'Intrauterine Insemination (IUI)' },
        { id: 'icsi', name: 'Intracytoplasmic Sperm Injection' },
        { id: 'egg-freezing', name: 'Egg Freezing & Preservation' },
        { id: 'genetic-testing', name: 'Genetic Testing & Screening' },
        { id: 'donor-program', name: 'Egg & Sperm Donor Program' },
        { id: 'male-fertility', name: 'Male Fertility Treatment' },
        { id: 'surrogacy', name: 'Surrogacy Services' },
        { id: 'fertility-surgery', name: 'Fertility Surgery' }
    ];

    const availableQualifications = ['MBBS', 'MD', 'MS', 'DGO', 'DM', 'MCh', 'FRCS', 'PhD'];

    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    const isHospitalAdmin = ['admin', 'hospitaladmin'].includes((user?.role || '').toLowerCase());
    const canManage = ['admin', 'hospitaladmin', 'administrator', 'superadmin', 'centraladmin'].includes((user?.role || '').toLowerCase()) && (user?.role || '').toLowerCase() !== 'accountant';

    useEffect(() => {
        const role = (user?.role || '').toLowerCase();
        if (!user || !['admin', 'hospitaladmin', 'administrator', 'accountant'].includes(role)) {
            navigate('/');
            return;
        }
        dispatch(fetchAdminDoctors());
    }, [navigate, user, dispatch]);

    useEffect(() => {
        if (doctorsState.error) setError(doctorsState.error);
    }, [doctorsState.error]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        let val = value;
        if (name === 'phone') {
            val = val.replace(/\D/g, '').slice(0, 10);
        }
        setFormData({ ...formData, [name]: val });
        setError('');
        setSuccess('');
    };

    // Modal Handlers
    const handleOpenInfoModal = (doctor) => {
        setInfoDoctor(doctor);
        setInfoError('');
        setInfoSuccess('');
        setIsInfoEditMode(false);

        let fName = doctor.firstName || '';
        let mName = doctor.middleName || '';
        let lName = doctor.lastName || '';
        if (!fName && (doctor.name || doctor.userId?.name)) {
            const full = doctor.name || doctor.userId?.name || '';
            const parts = full.split(' ');
            if (parts.length === 1) {
                fName = parts[0];
            } else if (parts.length === 2) {
                fName = parts[0];
                lName = parts[1];
            } else if (parts.length > 2) {
                fName = parts[0];
                mName = parts.slice(1, -1).join(' ');
                lName = parts[parts.length - 1];
            }
        }

        const formatDateForInput = (dateStr) => {
            if (!dateStr) return '';
            try {
                const d = new Date(dateStr);
                if (isNaN(d.getTime())) return '';
                return d.toISOString().split('T')[0];
            } catch (e) {
                return '';
            }
        };

        let qual = doctor.qualification || [];
        if (typeof qual === 'string') {
            qual = qual.split(',').map(q => q.trim()).filter(Boolean);
        } else if (!qual && doctor.education) {
            qual = doctor.education.split(',').map(q => q.trim()).filter(Boolean);
        }

        setInfoFormData({
            firstName: fName,
            middleName: mName,
            lastName: lName,
            dob: formatDateForInput(doctor.dob),
            gender: doctor.gender || 'Male',
            nationalId: doctor.nationalId || '',
            medicalLicense: doctor.medicalLicense || '',
            specialization: doctor.specialization || doctor.specialty || '',
            qualification: qual,
            experienceYears: doctor.experienceYears !== undefined ? doctor.experienceYears : (parseInt(doctor.experience, 10) || 0),
            personalEmail: doctor.personalEmail || '',
            phone: doctor.phone || '',
            currentAddress: doctor.currentAddress || '',
            emergencyContact: {
                name: doctor.emergencyContact?.name || '',
                relationship: doctor.emergencyContact?.relationship || '',
                phone: doctor.emergencyContact?.phone || ''
            },
            bloodGroup: doctor.bloodGroup || 'O+',
            joiningDate: formatDateForInput(doctor.joiningDate),
            employmentType: doctor.employmentType || 'Full-time',
            status: doctor.status || 'Active',
            image: doctor.image || '👨‍⚕️',
            consultationFee: doctor.consultationFee !== undefined ? doctor.consultationFee : 0
        });
        setShowInfoModal(true);
    };

    const handleInfoChange = (e) => {
        const { name, value } = e.target;
        let val = value;
        if (name === 'experienceYears') {
            val = Number(val);
        }
        if (name === 'phone') {
            val = val.replace(/\D/g, '').slice(0, 10);
        }
        setInfoFormData(prev => ({ ...prev, [name]: val }));
    };

    const handleInfoEmergencyContactChange = (e) => {
        const { name, value } = e.target;
        let val = value;
        if (name === 'phone') {
            val = val.replace(/\D/g, '').slice(0, 10);
        }
        setInfoFormData(prev => ({
            ...prev,
            emergencyContact: {
                ...prev.emergencyContact,
                [name]: val
            }
        }));
    };

    const handleInfoQualificationChange = (e) => {
        const selectedQuals = Array.from(e.target.selectedOptions, option => option.value);
        setInfoFormData(prev => ({ ...prev, qualification: selectedQuals }));
    };

    const handleInfoPhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setInfoError('Please upload an image file');
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            setInfoFormData(prev => ({ ...prev, image: reader.result }));
        };
        reader.readAsDataURL(file);

        const uploadData = new FormData();
        uploadData.append('images', file);

        try {
            const { uploadAPI } = await import('../../utils/api');
            const res = await uploadAPI.uploadImages(uploadData);
            if (res && res.success && res.files && res.files[0]) {
                setInfoFormData(prev => ({ ...prev, image: res.files[0].url }));
            }
        } catch (uploadErr) {
            console.warn('Image upload failed, using local base64 preview.', uploadErr);
        }
    };

    const handleSavePersonalInfo = async (e) => {
        e.preventDefault();
        setInfoError('');
        setInfoSuccess('');
        setInfoLoading(true);

        // Validations
        if (infoFormData.phone && !/^\d{10}$/.test(infoFormData.phone)) {
            setInfoError('Phone number must be exactly 10 digits');
            setInfoLoading(false);
            return;
        }
        if (infoFormData.emergencyContact?.phone && !/^\d{10}$/.test(infoFormData.emergencyContact.phone)) {
            setInfoError('Emergency contact phone number must be exactly 10 digits');
            setInfoLoading(false);
            return;
        }
        if (infoFormData.personalEmail && !/\S+@\S+\.\S+/.test(infoFormData.personalEmail)) {
            setInfoError('Invalid personal email address');
            setInfoLoading(false);
            return;
        }
        if (infoFormData.experienceYears < 0 || infoFormData.experienceYears > 50) {
            setInfoError('Experience years must be between 0 and 50');
            setInfoLoading(false);
            return;
        }

        const computedName = [infoFormData.firstName, infoFormData.middleName, infoFormData.lastName].filter(Boolean).join(' ');
        if (!computedName) {
            setInfoError('First and Last names are required');
            setInfoLoading(false);
            return;
        }

        const updateData = {
            ...infoFormData,
            name: computedName,
            specialty: infoFormData.specialization || '',
            experience: `${infoFormData.experienceYears} Years`,
            education: infoFormData.qualification ? infoFormData.qualification.join(', ') : ''
        };

        try {
            const result = await dispatch(updateDoctor({ id: infoDoctor._id, doctorData: updateData }));
            if (updateDoctor.fulfilled.match(result)) {
                setInfoSuccess('Personal details updated successfully');
                
                // Immediately update local modal state with response so they are instantly visible in the read-only dashboard
                const updatedDoctor = result.payload;
                setInfoDoctor(updatedDoctor);
                
                let fName = updatedDoctor.firstName || '';
                let mName = updatedDoctor.middleName || '';
                let lName = updatedDoctor.lastName || '';
                if (!fName && updatedDoctor.name) {
                    const parts = updatedDoctor.name.split(' ');
                    if (parts.length === 1) {
                        fName = parts[0];
                    } else if (parts.length === 2) {
                        fName = parts[0];
                        lName = parts[1];
                    } else if (parts.length > 2) {
                        fName = parts[0];
                        mName = parts.slice(1, -1).join(' ');
                        lName = parts[parts.length - 1];
                    }
                }

                const formatDateForInput = (dateStr) => {
                    if (!dateStr) return '';
                    try {
                        const d = new Date(dateStr);
                        if (isNaN(d.getTime())) return '';
                        return d.toISOString().split('T')[0];
                    } catch (e) {
                        return '';
                    }
                };

                let qual = updatedDoctor.qualification || [];
                if (typeof qual === 'string') {
                    qual = qual.split(',').map(q => q.trim()).filter(Boolean);
                } else if (!qual && updatedDoctor.education) {
                    qual = updatedDoctor.education.split(',').map(q => q.trim()).filter(Boolean);
                }

                setInfoFormData({
                    firstName: fName,
                    middleName: mName,
                    lastName: lName,
                    dob: formatDateForInput(updatedDoctor.dob),
                    gender: updatedDoctor.gender || 'Male',
                    nationalId: updatedDoctor.nationalId || '',
                    medicalLicense: updatedDoctor.medicalLicense || '',
                    specialization: updatedDoctor.specialization || updatedDoctor.specialty || '',
                    qualification: qual,
                    experienceYears: updatedDoctor.experienceYears !== undefined ? updatedDoctor.experienceYears : (parseInt(updatedDoctor.experience, 10) || 0),
                    personalEmail: updatedDoctor.personalEmail || '',
                    phone: updatedDoctor.phone || '',
                    currentAddress: updatedDoctor.currentAddress || '',
                    emergencyContact: {
                        name: updatedDoctor.emergencyContact?.name || '',
                        relationship: updatedDoctor.emergencyContact?.relationship || '',
                        phone: updatedDoctor.emergencyContact?.phone || ''
                    },
                    bloodGroup: updatedDoctor.bloodGroup || 'O+',
                    joiningDate: formatDateForInput(updatedDoctor.joiningDate),
                    employmentType: updatedDoctor.employmentType || 'Full-time',
                    status: updatedDoctor.status || 'Active',
                    image: updatedDoctor.image || '👨‍⚕️',
                    consultationFee: updatedDoctor.consultationFee !== undefined ? updatedDoctor.consultationFee : 0
                });

                // Immediately switch back to View Mode showing the updated info
                setIsInfoEditMode(false);

                setTimeout(() => {
                    setInfoSuccess('');
                    // Also dispatch list refresh in main grid
                    dispatch(fetchAdminDoctors());
                }, 1500);
            } else {
                setInfoError(result.payload || 'Failed to update personal details');
            }
        } catch (err) {
            setInfoError(err.message || 'Error updating personal details');
        } finally {
            setInfoLoading(false);
        }
    };

    const handleEmergencyContactChange = (e) => {
        const { name, value } = e.target;
        let val = value;
        if (name === 'phone') {
            val = val.replace(/\D/g, '').slice(0, 10);
        }
        setFormData(prev => ({
            ...prev,
            emergencyContact: {
                ...prev.emergencyContact,
                [name]: val
            }
        }));
    };

    const handleQualificationChange = (e) => {
        const selectedQuals = Array.from(e.target.selectedOptions, option => option.value);
        setFormData(prev => ({ ...prev, qualification: selectedQuals }));
    };

    const handlePhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setError('Please upload an image file');
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            setFormData(prev => ({ ...prev, image: reader.result }));
        };
        reader.readAsDataURL(file);

        const uploadData = new FormData();
        uploadData.append('images', file);

        try {
            const { uploadAPI } = await import('../../utils/api');
            const res = await uploadAPI.uploadImages(uploadData);
            if (res && res.success && res.files && res.files[0]) {
                setFormData(prev => ({ ...prev, image: res.files[0].url }));
            }
        } catch (uploadErr) {
            console.warn('Image upload failed, using local base64 preview.', uploadErr);
        }
    };

    const handleServiceChange = (e) => {
        const selectedServices = Array.from(e.target.selectedOptions, option => option.value);
        setFormData({ ...formData, services: selectedServices });
    };

    const handleAvailabilityChange = (day, field, value) => {
        setFormData(prev => ({
            ...prev,
            availability: {
                ...prev.availability,
                [day]: {
                    ...prev.availability[day],
                    [field]: field === 'available' ? value : value
                }
            }
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        const computedName = formData.name || [formData.firstName, formData.middleName, formData.lastName].filter(Boolean).join(' ');
        if (!computedName || !formData.email) {
            setError('Name and email are required');
            setLoading(false);
            return;
        }

        // Phone Validation (exactly 10 digits if provided)
        if (formData.phone && !/^\d{10}$/.test(formData.phone)) {
            setError('Phone number must be exactly 10 digits');
            setLoading(false);
            return;
        }
        if (formData.emergencyContact?.phone && !/^\d{10}$/.test(formData.emergencyContact.phone)) {
            setError('Emergency contact phone number must be exactly 10 digits');
            setLoading(false);
            return;
        }
        if (formData.personalEmail && !/\S+@\S+\.\S+/.test(formData.personalEmail)) {
            setError('Invalid personal email address');
            setLoading(false);
            return;
        }
        if (formData.experienceYears !== undefined && (formData.experienceYears < 0 || formData.experienceYears > 50)) {
            setError('Experience years must be between 0 and 50');
            setLoading(false);
            return;
        }

        const doctorData = {
            ...formData,
            name: computedName,
            specialty: formData.specialization || formData.specialty || '',
            experience: formData.experienceYears !== undefined ? `${formData.experienceYears} Years` : (formData.experience || ''),
            education: formData.qualification && formData.qualification.length > 0 ? formData.qualification.join(', ') : (formData.education || ''),
            consultationFee: formData.consultationFee ? Number(formData.consultationFee) : 0
        };

        try {
            if (editingDoctor) {
                const result = await dispatch(updateDoctor({ id: editingDoctor._id, doctorData: doctorData }));
                if (updateDoctor.fulfilled.match(result)) {
                    setSuccess('Doctor updated successfully');
                    resetForm();
                    dispatch(fetchAdminDoctors()); // Refresh list
                } else {
                    setError(result.payload || 'Failed to update doctor');
                }
            } else {
                if (!formData.password || formData.password.length < 6) {
                    setError('Password is required and must be at least 6 characters');
                    setLoading(false);
                    return;
                }
                if (!formData.services || formData.services.length === 0) {
                    setError('Please select at least one service');
                    setLoading(false);
                    return;
                }

                const result = await dispatch(createDoctor(doctorData));
                if (createDoctor.fulfilled.match(result)) {
                    setSuccess('Doctor created successfully.');
                    resetForm();
                    dispatch(fetchAdminDoctors()); // Refresh list
                } else {
                    setError(result.payload || 'Failed to create doctor');
                }
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error saving doctor');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (doctor) => {
        setEditingDoctor(doctor);

        // Merge existing availability with default structure
        const mergedAvailability = { ...defaultAvailability };
        if (doctor.availability) {
            Object.keys(doctor.availability).forEach(day => {
                if (mergedAvailability[day]) {
                    mergedAvailability[day] = { ...mergedAvailability[day], ...doctor.availability[day] };
                }
            });
        }

        let fName = doctor.firstName || '';
        let mName = doctor.middleName || '';
        let lName = doctor.lastName || '';
        if (!fName && (doctor.name || doctor.userId?.name)) {
            const full = doctor.name || doctor.userId?.name || '';
            const parts = full.split(' ');
            if (parts.length === 1) {
                fName = parts[0];
            } else if (parts.length === 2) {
                fName = parts[0];
                lName = parts[1];
            } else if (parts.length > 2) {
                fName = parts[0];
                mName = parts.slice(1, -1).join(' ');
                lName = parts[parts.length - 1];
            }
        }

        const formatDateForInput = (dateStr) => {
            if (!dateStr) return '';
            try {
                const d = new Date(dateStr);
                if (isNaN(d.getTime())) return '';
                return d.toISOString().split('T')[0];
            } catch (e) {
                return '';
            }
        };

        let qual = doctor.qualification || [];
        if (typeof qual === 'string') {
            qual = qual.split(',').map(q => q.trim()).filter(Boolean);
        } else if (!qual && doctor.education) {
            qual = doctor.education.split(',').map(q => q.trim()).filter(Boolean);
        }

        setFormData({
            name: doctor.name || doctor.userId?.name || '',
            email: doctor.email,
            phone: doctor.phone || '',
            password: '', // Password not shown
            specialty: doctor.specialty || '',
            experience: doctor.experience || '',
            education: doctor.education || '',
            services: doctor.services || [],
            availability: mergedAvailability,
            successRate: doctor.successRate || '90%',
            patientsCount: doctor.patientsCount || '100+',
            image: doctor.image || '👨‍⚕️',
            bio: doctor.bio || '',
            consultationFee: doctor.consultationFee || 0,
            
            // New fields
            firstName: fName,
            middleName: mName,
            lastName: lName,
            dob: formatDateForInput(doctor.dob),
            gender: doctor.gender || 'Male',
            nationalId: doctor.nationalId || '',
            medicalLicense: doctor.medicalLicense || '',
            specialization: doctor.specialization || doctor.specialty || '',
            qualification: qual,
            experienceYears: doctor.experienceYears !== undefined ? doctor.experienceYears : (parseInt(doctor.experience, 10) || 0),
            personalEmail: doctor.personalEmail || '',
            currentAddress: doctor.currentAddress || '',
            emergencyContact: {
                name: doctor.emergencyContact?.name || '',
                relationship: doctor.emergencyContact?.relationship || '',
                phone: doctor.emergencyContact?.phone || ''
            },
            bloodGroup: doctor.bloodGroup || 'O+',
            joiningDate: formatDateForInput(doctor.joiningDate),
            employmentType: doctor.employmentType || 'Full-time',
            status: doctor.status || 'Active'
        });
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this doctor?')) {
            await dispatch(deleteDoctor(id));
            setSuccess('Doctor deleted successfully');
            dispatch(fetchAdminDoctors()); // Refresh list
        }
    };

    const resetForm = () => {
        setFormData(initialFormState);
        setEditingDoctor(null);
        setShowForm(false);
    };

    const fetchSalaryHistory = async (doctor) => {
        setLoadingHistory(true);
        setHistoryError('');
        setSalaryHistory([]);
        try {
            const { administratorAPI } = await import('../../utils/api');
            const res = await administratorAPI.getExpenses();
            if (res.success && res.expenses) {
                const doctorUserId = doctor.userId?._id || doctor.userId || doctor._id;
                const doctorName = doctor.name || doctor.userId?.name || '';
                const filtered = res.expenses.filter(e => {
                    if (e.category !== 'Salaries') return false;
                    const matchId = e.recipientId && doctorUserId && String(e.recipientId) === String(doctorUserId);
                    const matchName = e.recipientName && doctorName && e.recipientName.toLowerCase().trim() === doctorName.toLowerCase().trim();
                    const matchDesc = e.description && doctorName && e.description.toLowerCase().includes(doctorName.toLowerCase());
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

    const handleOpenPaySalaryModal = (doctor) => {
        setPaySalaryModal(doctor);
        setSalaryAmount('50000');
        setSalaryDescription(`Salary payment for Dr. ${doctor.name || doctor.userId?.name || ''} (${doctor.specialty || 'Doctor'})`);
        setSalaryError('');
        setSalarySuccess('');
    };

    const handleOpenSalaryHistoryModal = (doctor) => {
        setSalaryHistoryModal(doctor);
        fetchSalaryHistory(doctor);
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
            const doctorUserId = paySalaryModal.userId?._id || paySalaryModal.userId || paySalaryModal._id;
            const doctorName = paySalaryModal.name || paySalaryModal.userId?.name || '';
            const { administratorAPI } = await import('../../utils/api');
            const res = await administratorAPI.createExpense({
                category: 'Salaries',
                amount: Number(salaryAmount),
                date: new Date().toISOString().split('T')[0],
                description: salaryDescription,
                paymentMethod: 'Bank Transfer',
                paymentStatus: 'Paid',
                recipientId: doctorUserId,
                recipientName: doctorName
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

    return (
        <div className="superadmin-page">
            <div className="superadmin-container">
                <div className="admin-header">
                    <div>
                        <button
                            onClick={() => navigate(isHospitalAdmin ? '/hospitaladmin' : '/admin')}
                            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '14px', padding: '0 0 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                            ← Back to {isHospitalAdmin ? 'Hospital Admin' : 'Dashboard'}
                        </button>
                        <h1>Manage Doctors</h1>
                        <p>Add and manage doctor profiles for the user platform.</p>
                    </div>
                    {canManage && (
                        <button onClick={() => { resetForm(); setShowForm(true); }} className="btn btn-primary">
                            + Add Doctor
                        </button>
                    )}
                </div>

                {error && <div className="error-message">{error}</div>}
                {success && <div className="success-message">{success}</div>}

                {showForm && (
                    <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, overflowY: 'auto', padding: '20px' }}>
                        <div className="modal-content" style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', width: '100%', maxWidth: '850px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
                            
                            {/* Modal Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                                <div>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                                        ➕ {editingDoctor ? `Edit: ${editingDoctor.name || editingDoctor.userId?.name}` : 'Add New Doctor'}
                                    </h3>
                                    <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 0 0' }}>
                                        {editingDoctor ? 'Update account and personal details' : 'Create a new doctor account with detailed personal profile'}
                                    </p>
                                </div>
                                <button type="button" onClick={resetForm} style={{ background: 'none', border: 'none', fontSize: '24px', color: '#64748b', cursor: 'pointer', outline: 'none' }}>
                                    &times;
                                </button>
                            </div>

                            {/* Modal Body */}
                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', padding: '24px', margin: 0 }}>
                                {error && <div className="error-message" style={{ marginBottom: '16px' }}>{error}</div>}
                                {success && <div className="success-message" style={{ marginBottom: '16px' }}>{success}</div>}

                                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    
                                    {/* SECTION 1: ACCOUNT & PERSONAL DETAILS */}
                                    <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                        <h4 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: '#334155', fontWeight: '600', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                                            👤 Account & Personal Details
                                        </h4>
                                        
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>First Name *</label>
                                                <input type="text" name="firstName" value={formData.firstName} onChange={handleChange} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Middle Name</label>
                                                <input type="text" name="middleName" value={formData.middleName} onChange={handleChange} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Last Name *</label>
                                                <input type="text" name="lastName" value={formData.lastName} onChange={handleChange} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginTop: '14px' }}>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Email *</label>
                                                <input type="email" name="email" value={formData.email} onChange={handleChange} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Password *</label>
                                                <input type="password" name="password" value={formData.password} onChange={handleChange} placeholder={editingDoctor ? "Leave blank to keep same" : "Min 6 characters"} required={!editingDoctor} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '14px' }}>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Date of Birth *</label>
                                                <input type="date" name="dob" value={formData.dob} onChange={handleChange} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Gender *</label>
                                                <select name="gender" value={formData.gender} onChange={handleChange} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#fff' }}>
                                                    <option value="Male">Male</option>
                                                    <option value="Female">Female</option>
                                                    <option value="Other">Other</option>
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Blood Group *</label>
                                                <select name="bloodGroup" value={formData.bloodGroup} onChange={handleChange} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#fff' }}>
                                                    {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(bg => (
                                                        <option key={bg} value={bg}>{bg}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '14px' }}>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Primary Phone *</label>
                                                <input type="tel" name="phone" value={formData.phone} onChange={handleChange} required placeholder="Enter 10 digits" maxLength={10} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>National ID / Aadhaar *</label>
                                                <input type="text" name="nationalId" value={formData.nationalId} onChange={handleChange} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Personal Email *</label>
                                                <input type="email" name="personalEmail" value={formData.personalEmail} onChange={handleChange} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                        </div>

                                        <div style={{ marginTop: '14px' }}>
                                            <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Profile Photo</label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: '#ffffff', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                                <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #bfdbfe', overflow: 'hidden' }}>
                                                    {formData.image && (formData.image.startsWith('http') || formData.image.startsWith('data:')) ? (
                                                        <img src={formData.image} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    ) : (
                                                        <span style={{ fontSize: '20px' }}>{formData.image || '👨‍⚕️'}</span>
                                                    )}
                                                </div>
                                                <div>
                                                    <input type="file" id="form-photo" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} />
                                                    <label htmlFor="form-photo" style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#f8fafc', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'inline-block' }}>
                                                        📷 Upload Photo
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* SECTION 2: PROFESSIONAL & EMPLOYMENT DETAILS */}
                                    <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                        <h4 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: '#334155', fontWeight: '600', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                                            💼 Professional & Credentials
                                        </h4>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Medical License / Reg Number *</label>
                                                <input type="text" name="medicalLicense" value={formData.medicalLicense} onChange={handleChange} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Specialization *</label>
                                                <input type="text" name="specialization" value={formData.specialization} onChange={handleChange} required placeholder="e.g. Cardiologist" style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginTop: '14px' }}>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Experience (Years) *</label>
                                                <input type="number" name="experienceYears" value={formData.experienceYears} onChange={handleChange} min={0} max={50} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Consultation Fee *</label>
                                                <input type="number" name="consultationFee" value={formData.consultationFee} onChange={handleChange} min={0} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginTop: '14px' }}>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Joining Date *</label>
                                                <input type="date" name="joiningDate" value={formData.joiningDate} onChange={handleChange} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Employment Type *</label>
                                                <select name="employmentType" value={formData.employmentType} onChange={handleChange} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#fff' }}>
                                                    <option value="Full-time">Full-time</option>
                                                    <option value="Part-time">Part-time</option>
                                                    <option value="Visiting Consultant">Visiting Consultant</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', gap: '16px', marginTop: '14px' }}>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Qualifications *</label>
                                                <select name="qualification" multiple value={formData.qualification} onChange={handleQualificationChange} required style={{ width: '100%', height: '90px', padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}>
                                                    {availableQualifications.map(q => (
                                                        <option key={q} value={q}>{q}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="form-group" style={{ marginTop: '14px' }}>
                                            <label htmlFor="services" style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Services (Hold Ctrl/Cmd to select multiple) *</label>
                                            <select name="services" multiple value={formData.services} onChange={handleServiceChange} required style={{ width: '100%', height: '110px', padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}>
                                                {availableServices.map(service => (
                                                    <option key={service.id} value={service.id}>{service.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {/* SECTION 3: ADDRESS & EMERGENCY CONTACT */}
                                    <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                        <h4 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: '#334155', fontWeight: '600', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                                            📞 Address & Emergency Contact
                                        </h4>

                                        <div className="form-group">
                                            <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Current Address *</label>
                                            <textarea name="currentAddress" value={formData.currentAddress} onChange={handleChange} rows="2" placeholder="Street, City, State, Postal Code" required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                        </div>

                                        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px', marginTop: '14px' }}>
                                            <h5 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#475569', fontWeight: '600' }}>Emergency Contact</h5>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                                                <div className="form-group">
                                                    <label style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', display: 'block' }}>Contact Name *</label>
                                                    <input type="text" name="name" value={formData.emergencyContact.name} onChange={handleEmergencyContactChange} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                                </div>
                                                <div className="form-group">
                                                    <label style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', display: 'block' }}>Relationship *</label>
                                                    <input type="text" name="relationship" value={formData.emergencyContact.relationship} onChange={handleEmergencyContactChange} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                                </div>
                                                <div className="form-group">
                                                    <label style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', display: 'block' }}>Phone Number *</label>
                                                    <input type="tel" name="phone" value={formData.emergencyContact.phone} onChange={handleEmergencyContactChange} required maxLength={10} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* SECTION 4: TIMINGS */}
                                    <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                        <h4 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: '#334155', fontWeight: '600', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                                            📅 Weekly Availability & Timings
                                        </h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                                            {days.map(day => (
                                                <div key={day} style={{ padding: '10px', background: '#ffffff', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                                                        <input
                                                            type="checkbox"
                                                            id={`check-main-${day}`}
                                                            checked={formData.availability[day]?.available || false}
                                                            onChange={(e) => handleAvailabilityChange(day, 'available', e.target.checked)}
                                                            style={{ marginRight: '10px', width: '16px', height: '16px' }}
                                                        />
                                                        <label htmlFor={`check-main-${day}`} style={{ fontWeight: '700', cursor: 'pointer', margin: 0, textTransform: 'capitalize', fontSize: '13px', color: '#334155' }}>
                                                            {day}
                                                        </label>
                                                    </div>

                                                    {formData.availability[day]?.available && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '26px', marginTop: '6px' }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                <small style={{ fontSize: '10px', color: '#64748b' }}>Start</small>
                                                                <input
                                                                    type="time"
                                                                    value={formData.availability[day].startTime}
                                                                    onChange={(e) => handleAvailabilityChange(day, 'startTime', e.target.value)}
                                                                    style={{ padding: '4px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                                                                />
                                                            </div>
                                                            <span style={{ fontSize: '11px', alignSelf: 'flex-end', marginBottom: '4px' }}>to</span>
                                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                <small style={{ fontSize: '10px', color: '#64748b' }}>End</small>
                                                                <input
                                                                    type="time"
                                                                    value={formData.availability[day].endTime}
                                                                    onChange={(e) => handleAvailabilityChange(day, 'endTime', e.target.value)}
                                                                    style={{ padding: '4px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* SECTION 5: BIO */}
                                    <div className="form-group">
                                        <label htmlFor="bio" style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Doctor Bio</label>
                                        <textarea name="bio" value={formData.bio} onChange={handleChange} rows="3" placeholder="Doctor's professional bio summary..." style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                    </div>

                                    {/* Action Buttons */}
                                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                        <button type="button" onClick={resetForm} className="btn btn-secondary">
                                            Cancel
                                        </button>
                                        <button type="submit" className="btn btn-primary" disabled={loading} style={{ padding: '10px 24px', fontSize: '14px', fontWeight: '600' }}>
                                            {loading ? 'Saving...' : editingDoctor ? 'Update Profile' : 'Create Doctor'}
                                        </button>
                                    </div>
                                </form>
                            </div>

                        </div>
                    </div>
                )}

                {/* Department Breakdown */}
                {doctors.length > 0 && (() => {
                    const deptMap = {};
                    doctors.forEach(doc => {
                        const depts = doc.departments?.length ? doc.departments : [doc.specialty || 'Unassigned'];
                        depts.forEach(dept => {
                            deptMap[dept] = (deptMap[dept] || 0) + 1;
                        });
                    });
                    return (
                        <div className="admin-card" style={{ marginBottom: '20px' }}>
                            <h2 style={{ marginBottom: '14px' }}>Doctors by Department</h2>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                {Object.entries(deptMap).sort((a, b) => b[1] - a[1]).map(([dept, count]) => (
                                    <div key={dept} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '120px' }}>
                                        <span style={{ fontSize: '1.4rem', fontWeight: '800', color: '#1d4ed8' }}>{count}</span>
                                        <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: '600', textAlign: 'center', marginTop: '2px' }}>{dept}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })()}

                {/* Doctor List */}
                <div className="users-table">
                    <h2>All Doctors</h2>
                    {loadingData ? (
                        <div className="loading-message">Loading doctors...</div>
                    ) : doctors.length === 0 ? (
                        <div className="empty-message">No doctors found.</div>
                    ) : (
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Specialty</th>
                                    <th>Departments</th>
                                    <th>Services</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {doctors.map((doctor) => (
                                    <tr key={doctor._id}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span>{doctor.image}</span>
                                                {/* FALLBACK: If doctor.name is empty, use userId.name */}
                                                <strong>{doctor.name || doctor.userId?.name || 'Unknown Name'}</strong>
                                            </div>
                                        </td>
                                        <td>{doctor.email}</td>
                                        <td>{doctor.specialty || '-'}</td>
                                        <td>
                                            {doctor.departments?.length
                                                ? doctor.departments.map((d, i) => (
                                                    <span key={i} style={{ display: 'inline-block', background: '#eff6ff', color: '#1d4ed8', borderRadius: '4px', padding: '2px 7px', fontSize: '11px', fontWeight: '600', marginRight: '4px', marginBottom: '2px' }}>{d}</span>
                                                ))
                                                : doctor.specialty ? (
                                                    <span style={{ display: 'inline-block', background: '#eff6ff', color: '#1d4ed8', borderRadius: '4px', padding: '2px 7px', fontSize: '11px', fontWeight: '600', marginRight: '4px', marginBottom: '2px' }}>{doctor.specialty}</span>
                                                ) : <span style={{ color: '#94a3b8' }}>—</span>}
                                        </td>
                                        <td>{doctor.services?.length || 0}</td>
                                        <td>
                                            <div className="action-buttons" style={{ display: 'flex', gap: '8px' }}>
                                                <button
                                                    onClick={() => handleOpenInfoModal(doctor)}
                                                    className="btn-edit"
                                                    style={{ backgroundColor: '#1976d2', color: 'white' }}
                                                >
                                                    ℹ️ Personal Info
                                                </button>
                                                {canManage && (
                                                    <button onClick={() => handleDelete(doctor._id)} className="btn-delete">Delete</button>
                                                )}
                                                {user?.role?.toLowerCase() === 'accountant' && (
                                                    <>
                                                        <button 
                                                            onClick={() => handleOpenPaySalaryModal(doctor)} 
                                                            className="btn-edit" 
                                                            style={{ backgroundColor: '#10b981', color: 'white' }}
                                                        >
                                                            💵 Pay Salary
                                                        </button>
                                                        <button 
                                                            onClick={() => handleOpenSalaryHistoryModal(doctor)} 
                                                            className="btn-edit" 
                                                            style={{ backgroundColor: '#4f46e5', color: 'white' }}
                                                        >
                                                            📜 History
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* DEDICATED PERSONAL INFO MODAL OVERLAY */}
            {showInfoModal && infoFormData && (
                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, overflowY: 'auto', padding: '20px' }}>
                    <div className="modal-content" style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', width: '100%', maxWidth: '850px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
                        
                        {/* Modal Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                            <div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                                    ℹ️ Personal Info & Credentials {!isInfoEditMode ? '(View Profile)' : '(Edit Profile)'}
                                </h3>
                                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 0 0' }}>
                                    {!isInfoEditMode ? 'View detailed doctor information' : 'Modify detailed doctor information'} for {infoDoctor.name || infoDoctor.userId?.name}
                                </p>
                            </div>
                            <button type="button" onClick={() => setShowInfoModal(false)} style={{ background: 'none', border: 'none', fontSize: '24px', color: '#64748b', cursor: 'pointer', outline: 'none' }}>
                                &times;
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', padding: '24px', margin: 0 }}>
                            {infoError && <div className="error-message" style={{ marginBottom: '16px' }}>{infoError}</div>}
                            {infoSuccess && <div className="success-message" style={{ marginBottom: '16px' }}>{infoSuccess}</div>}

                            {!isInfoEditMode ? (
                                /* ==================== READ-ONLY VIEW PROFILE ==================== */
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    
                                    {/* Profile Summary Card */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                        <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #bfdbfe', overflow: 'hidden', flexShrink: 0 }}>
                                            {infoFormData.image && (infoFormData.image.startsWith('http') || infoFormData.image.startsWith('data:')) ? (
                                                <img src={infoFormData.image} alt="Doctor profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <span style={{ fontSize: '32px' }}>{infoFormData.image || '👨‍⚕️'}</span>
                                            )}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <h4 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: '#0f172a' }}>
                                                {[infoFormData.firstName, infoFormData.middleName, infoFormData.lastName].filter(Boolean).join(' ')}
                                            </h4>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px', alignItems: 'center' }}>
                                                <span style={{ background: '#eff6ff', color: '#1d4ed8', fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '20px', border: '1px solid #bfdbfe' }}>
                                                    {infoFormData.specialization || 'General Physician'}
                                                </span>
                                                <span style={{ 
                                                    background: infoFormData.status === 'Active' ? '#dcfce7' : infoFormData.status === 'On leave' ? '#fef3c7' : '#fee2e2', 
                                                    color: infoFormData.status === 'Active' ? '#15803d' : infoFormData.status === 'On leave' ? '#b45309' : '#b91c1c', 
                                                    fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '20px' 
                                                }}>
                                                    ● {infoFormData.status}
                                                </span>
                                                <span style={{ background: '#f1f5f9', color: '#475569', fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '20px' }}>
                                                    💼 {infoFormData.employmentType}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Details Grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                                        
                                        {/* Column 1: Personal Details */}
                                        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                                            <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: '700', color: '#334155', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                                                👤 Personal Details
                                            </h4>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                                    <span style={{ color: '#64748b' }}>Date of Birth:</span>
                                                    <strong style={{ color: '#0f172a' }}>{infoFormData.dob ? new Date(infoFormData.dob).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</strong>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                                    <span style={{ color: '#64748b' }}>Gender:</span>
                                                    <strong style={{ color: '#0f172a' }}>{infoFormData.gender}</strong>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                                    <span style={{ color: '#64748b' }}>Blood Group:</span>
                                                    <span style={{ background: '#fee2e2', color: '#b91c1c', fontSize: '11px', fontWeight: '800', padding: '1px 6px', borderRadius: '4px' }}>
                                                        🩸 {infoFormData.bloodGroup}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                                    <span style={{ color: '#64748b' }}>National ID / Aadhaar:</span>
                                                    <strong style={{ color: '#0f172a' }}>{infoFormData.nationalId || '—'}</strong>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                                    <span style={{ color: '#64748b' }}>Phone Number:</span>
                                                    <strong style={{ color: '#0f172a' }}>{infoFormData.phone || '—'}</strong>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', overflow: 'hidden' }}>
                                                    <span style={{ color: '#64748b', flexShrink: 0 }}>Personal Email:</span>
                                                    <strong style={{ color: '#0f172a', wordBreak: 'break-all', textAlign: 'right', paddingLeft: '8px' }}>{infoFormData.personalEmail || '—'}</strong>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Column 2: Credentials & Qualifications */}
                                        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                                            <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: '700', color: '#334155', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                                                💼 Professional & Credentials
                                            </h4>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                                    <span style={{ color: '#64748b' }}>Medical License:</span>
                                                    <strong style={{ color: '#0f172a', fontFamily: 'monospace' }}>{infoFormData.medicalLicense || '—'}</strong>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                                    <span style={{ color: '#64748b' }}>Experience:</span>
                                                    <strong style={{ color: '#0f172a' }}>{infoFormData.experienceYears} Years</strong>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                                    <span style={{ color: '#64748b' }}>Consultation Fee:</span>
                                                    <strong style={{ color: '#16a34a', fontWeight: '700' }}>{infoFormData.consultationFee ? `₹${infoFormData.consultationFee}` : 'Free'}</strong>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                                    <span style={{ color: '#64748b' }}>Joining Date:</span>
                                                    <strong style={{ color: '#0f172a' }}>{infoFormData.joiningDate ? new Date(infoFormData.joiningDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</strong>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
                                                    <span style={{ color: '#64748b' }}>Qualifications:</span>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                                                        {infoFormData.qualification && infoFormData.qualification.length > 0 ? (
                                                            infoFormData.qualification.map(q => (
                                                                <span key={q} style={{ background: '#f1f5f9', color: '#334155', fontSize: '11px', fontWeight: '600', padding: '1px 6px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>{q}</span>
                                                            ))
                                                        ) : (
                                                            <strong style={{ color: '#0f172a' }}>—</strong>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                    </div>

                                    {/* Address & Emergency Details */}
                                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                                        <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: '700', color: '#334155', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                                            📞 Address & Emergency Contact
                                        </h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <span style={{ color: '#64748b', fontSize: '12px', fontWeight: '600' }}>Current Address:</span>
                                                <p style={{ margin: 0, fontSize: '13px', color: '#334155', lineHeight: '1.4' }}>
                                                    {infoFormData.currentAddress || '—'}
                                                </p>
                                            </div>
                                            <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                <span style={{ color: '#64748b', fontSize: '11px', fontWeight: '700', display: 'block', marginBottom: '6px' }}>🚨 EMERGENCY CONTACT</span>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <span style={{ color: '#64748b' }}>Name:</span>
                                                        <strong style={{ color: '#0f172a' }}>{infoFormData.emergencyContact?.name || '—'}</strong>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <span style={{ color: '#64748b' }}>Relationship:</span>
                                                        <strong style={{ color: '#0f172a' }}>{infoFormData.emergencyContact?.relationship || '—'}</strong>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <span style={{ color: '#64748b' }}>Phone:</span>
                                                        <strong style={{ color: '#0f172a' }}>{infoFormData.emergencyContact?.phone || '—'}</strong>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* View Mode Footer Actions */}
                                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                                        <button type="button" onClick={() => setShowInfoModal(false)} className="btn btn-secondary">
                                            Close
                                        </button>
                                        {canManage && (
                                            <button type="button" onClick={() => setIsInfoEditMode(true)} className="btn btn-primary" style={{ backgroundColor: '#10b981', borderColor: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                ✏️ Edit Information
                                            </button>
                                        )}
                                    </div>

                                </div>
                            ) : (
                                /* ==================== EDIT MODE FORM ==================== */
                                <form onSubmit={handleSavePersonalInfo} style={{ display: 'flex', flexDirection: 'column', gap: '0px', margin: 0 }}>
                                    
                                    {/* SECTION 1: PERSONAL DETAILS */}
                                    <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '10px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                                        <h4 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: '#334155', fontWeight: '600', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                                            👤 Personal Details
                                        </h4>
                                        
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>First Name *</label>
                                                <input type="text" name="firstName" value={infoFormData.firstName} onChange={handleInfoChange} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Middle Name</label>
                                                <input type="text" name="middleName" value={infoFormData.middleName} onChange={handleInfoChange} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Last Name *</label>
                                                <input type="text" name="lastName" value={infoFormData.lastName} onChange={handleInfoChange} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '14px' }}>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Date of Birth *</label>
                                                <input type="date" name="dob" value={infoFormData.dob} onChange={handleInfoChange} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Gender *</label>
                                                <select name="gender" value={infoFormData.gender} onChange={handleInfoChange} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#fff' }}>
                                                    <option value="Male">Male</option>
                                                    <option value="Female">Female</option>
                                                    <option value="Other">Other</option>
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Blood Group *</label>
                                                <select name="bloodGroup" value={infoFormData.bloodGroup} onChange={handleInfoChange} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#fff' }}>
                                                    {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(bg => (
                                                        <option key={bg} value={bg}>{bg}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '14px' }}>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>National ID / Aadhaar / Passport *</label>
                                                <input type="text" name="nationalId" value={infoFormData.nationalId} onChange={handleInfoChange} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Phone Number *</label>
                                                <input type="tel" name="phone" value={infoFormData.phone} onChange={handleInfoChange} required placeholder="Enter 10 digits" maxLength={10} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Personal Email *</label>
                                                <input type="email" name="personalEmail" value={infoFormData.personalEmail} onChange={handleInfoChange} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                        </div>

                                        <div style={{ marginTop: '14px' }}>
                                            <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Profile Photo</label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: '#ffffff', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                                <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #bfdbfe', overflow: 'hidden' }}>
                                                    {infoFormData.image && (infoFormData.image.startsWith('http') || infoFormData.image.startsWith('data:')) ? (
                                                        <img src={infoFormData.image} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    ) : (
                                                        <span style={{ fontSize: '20px' }}>{infoFormData.image || '👨‍⚕️'}</span>
                                                    )}
                                                </div>
                                                <div>
                                                    <input type="file" id="modal-photo" accept="image/*" onChange={handleInfoPhotoUpload} style={{ display: 'none' }} />
                                                    <label htmlFor="modal-photo" style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#f8fafc', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'inline-block' }}>
                                                        📷 Change Photo
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* SECTION 2: PROFESSIONAL & EMPLOYMENT */}
                                    <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '10px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                                        <h4 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: '#334155', fontWeight: '600', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                                            💼 Professional & Employment Details
                                        </h4>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Medical License / Reg Number *</label>
                                                <input type="text" name="medicalLicense" value={infoFormData.medicalLicense} onChange={handleInfoChange} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Specialization *</label>
                                                <input type="text" name="specialization" value={infoFormData.specialization} onChange={handleInfoChange} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginTop: '14px' }}>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Experience (Years) *</label>
                                                <input type="number" name="experienceYears" value={infoFormData.experienceYears} onChange={handleInfoChange} min={0} max={50} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Consultation Fee *</label>
                                                <input type="number" name="consultationFee" value={infoFormData.consultationFee} onChange={handleInfoChange} min={0} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginTop: '14px' }}>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Joining Date *</label>
                                                <input type="date" name="joiningDate" value={infoFormData.joiningDate} onChange={handleInfoChange} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                            </div>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Employment Type *</label>
                                                <select name="employmentType" value={infoFormData.employmentType} onChange={handleInfoChange} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#fff' }}>
                                                    <option value="Full-time">Full-time</option>
                                                    <option value="Part-time">Part-time</option>
                                                    <option value="Visiting Consultant">Visiting Consultant</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', gap: '16px', marginTop: '14px' }}>
                                            <div className="form-group">
                                                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Qualifications *</label>
                                                <select name="qualification" multiple value={infoFormData.qualification} onChange={handleInfoQualificationChange} required style={{ width: '100%', height: '90px', padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}>
                                                    {availableQualifications.map(q => (
                                                        <option key={q} value={q}>{q}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* SECTION 3: CONTACT & EMERGENCY DETAILS */}
                                    <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '10px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                                        <h4 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: '#334155', fontWeight: '600', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                                            📞 Address & Emergency Contact
                                        </h4>

                                        <div className="form-group">
                                            <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', display: 'block' }}>Current Address *</label>
                                            <textarea name="currentAddress" value={infoFormData.currentAddress} onChange={handleInfoChange} rows="2" placeholder="Street, City, State, Postal Code" required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                        </div>

                                        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px', marginTop: '14px' }}>
                                            <h5 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#475569', fontWeight: '600' }}>Emergency Contact</h5>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                                                <div className="form-group">
                                                    <label style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', display: 'block' }}>Contact Name *</label>
                                                    <input type="text" name="name" value={infoFormData.emergencyContact.name} onChange={handleInfoEmergencyContactChange} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                                </div>
                                                <div className="form-group">
                                                    <label style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', display: 'block' }}>Relationship *</label>
                                                    <input type="text" name="relationship" value={infoFormData.emergencyContact.relationship} onChange={handleInfoEmergencyContactChange} required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                                </div>
                                                <div className="form-group">
                                                    <label style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', display: 'block' }}>Phone Number *</label>
                                                    <input type="tel" name="phone" value={infoFormData.emergencyContact.phone} onChange={handleInfoEmergencyContactChange} required maxLength={10} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Modal Actions */}
                                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                        <button type="button" onClick={() => setIsInfoEditMode(false)} className="btn btn-secondary">
                                            Cancel
                                        </button>
                                        <button type="submit" className="btn btn-primary" disabled={infoLoading}>
                                            {infoLoading ? 'Saving...' : 'Save Changes'}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            )}

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
                                <input type="text" readOnly value={paySalaryModal.name || paySalaryModal.userId?.name || ''} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#64748b', fontSize: '14px' }} />
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
                                <button type="button" onClick={() => setPaySalaryModal(null)} className="btn btn-secondary">Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={submittingSalary} style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}>
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
                                📋 Salary Payment History - Dr. {salaryHistoryModal.name || salaryHistoryModal.userId?.name || ''}
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
                            <button type="button" onClick={() => setSalaryHistoryModal(null)} className="btn btn-secondary">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDoctors;