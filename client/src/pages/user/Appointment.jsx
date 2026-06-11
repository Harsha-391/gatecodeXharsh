import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAppDispatch, useAuth, useAppointments, useCachedServices, useCachedDoctors } from '../../store/hooks';
import { fetchAppointments, createAppointment } from '../../store/slices/appointmentSlice';
import { fetchServices, fetchDoctors, fetchBookedSlots } from '../../store/slices/publicDataSlice';
import { useSelector } from 'react-redux';
import { receptionAPI, hospitalAPI, admissionAPI } from '../../utils/api';
import { getSubdomain } from '../../utils/subdomain';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './Appointment.css';

// Base available time slots
const timeSlots = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30'
];

const Appointment = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dispatch = useAppDispatch();
  const doctorId = searchParams.get('doctorId');
  
  // Redux state
  const { isAuthenticated, user } = useAuth();
  const { appointments, loading: appointmentsLoading } = useAppointments();
  const { services: servicesData } = useCachedServices();
  const { doctors: doctorsData } = useCachedDoctors();
  // Get bookedSlots from Redux store
  const bookedSlots = useSelector((state) => state.publicData.bookedSlots);
  
  const [filter, setFilter] = useState('all'); 
  
  // Booking form state
  const [formData, setFormData] = useState({
    appointmentDate: '',
    appointmentTime: '',
    notes: ''
  });
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  // Modal form state
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [availableDoctors, setAvailableDoctors] = useState([]);
  const [availableTimes, setAvailableTimes] = useState([]);

  // --- NEW: Details Modal State ---
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  // --------------------------------
  
  // React Hook Form
  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm({
    defaultValues: {
      serviceId: '',
      doctorId: '',
      appointmentDate: new Date().toISOString().split('T')[0],
      appointmentTime: ''
    }
  });
  
  const watchedServiceId = watch('serviceId');
  const watchedDoctorId = watch('doctorId');
  const watchedDate = watch('appointmentDate');
  const watchedTime = watch('appointmentTime');

  useEffect(() => {
    dispatch(fetchServices());
    dispatch(fetchDoctors());
  }, [dispatch]);

  // --- AUTHENTICATION CHECK PRESERVED ---
  useEffect(() => {
    if (!isAuthenticated || !user) {
      navigate('/login?redirect=/appointment' + (doctorId ? `?doctorId=${doctorId}` : ''));
      return;
    }
    
    dispatch(fetchAppointments());

    if (doctorId && doctorsData.length > 0) {
      const doctor = doctorsData.find(doc => doc._id === doctorId || doc.doctorId === doctorId);
      if (doctor) {
        setSelectedDoctor(doctor);
        const today = new Date().toISOString().split('T')[0];
        setFormData(prev => ({ ...prev, appointmentDate: today }));
      } else {
        setError('Doctor not found');
      }
    }
  }, [doctorId, navigate, doctorsData, isAuthenticated, user, dispatch]);

  // Fetch booked slots when doctor or date changes
  useEffect(() => {
    const currentDoctorId = watchedDoctorId || (selectedDoctor ? (selectedDoctor._id || selectedDoctor.doctorId) : null);
    const currentDate = watchedDate || formData.appointmentDate;

    if (currentDoctorId && currentDate) {
      dispatch(fetchBookedSlots({ doctorId: currentDoctorId, date: currentDate }));
    }
  }, [watchedDoctorId, watchedDate, selectedDoctor, formData.appointmentDate, dispatch]);

  const updateAvailableTimes = useCallback((selectedDate) => {
    if (!selectedDate) {
      setAvailableTimes([]);
      return;
    }

    let times = [...timeSlots];

    // Filter by Booked Slots
    if (bookedSlots && bookedSlots.length > 0) {
      times = times.filter(t => !bookedSlots.includes(t));
    }

    // Filter by Doctor's Schedule
    const currentDoctorId = watchedDoctorId || (selectedDoctor ? (selectedDoctor._id || selectedDoctor.doctorId) : null);
    
    if (currentDoctorId && doctorsData.length > 0) {
        const doctor = doctorsData.find(d => d._id === currentDoctorId || d.doctorId === currentDoctorId);
        
        if (doctor && doctor.availability) {
            const dateObj = new Date(selectedDate);
            const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const dayName = days[dateObj.getDay()];
            const daySchedule = doctor.availability[dayName];

            if (daySchedule && daySchedule.available === false) {
                setAvailableTimes([]); 
                return;
            }

            if (daySchedule && daySchedule.startTime && daySchedule.endTime) {
                const getMinutes = (t) => {
                    const [h, m] = t.split(':').map(Number);
                    return h * 60 + m;
                };

                const startMin = getMinutes(daySchedule.startTime);
                const endMin = getMinutes(daySchedule.endTime);

                times = times.filter(t => {
                    const tMin = getMinutes(t);
                    return tMin >= startMin && tMin < endMin;
                });
            }
        }
    }

    // Filter by Current Time (if Today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDateObj = new Date(selectedDate);
    selectedDateObj.setHours(0, 0, 0, 0);
    const now = new Date();
    
    if (selectedDateObj.getTime() === today.getTime()) {
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentTimeInMinutes = currentHour * 60 + currentMinute;

      times = times.filter(time => {
        const [hours, minutes] = time.split(':').map(Number);
        const timeInMinutes = hours * 60 + minutes;
        return timeInMinutes > (currentTimeInMinutes + 30);
      });
    }

    setAvailableTimes(times);
  }, [watchedDoctorId, doctorsData, selectedDoctor, bookedSlots]);

  useEffect(() => {
    if (watchedServiceId && doctorsData.length > 0) {
      const filtered = doctorsData.filter(doc => 
        doc.services && doc.services.some(s => s === watchedServiceId || s.id === watchedServiceId)
      );
      setAvailableDoctors(filtered.length > 0 ? filtered : doctorsData);
      setValue('doctorId', '');
      setValue('appointmentTime', '');
    } else {
      setAvailableDoctors(doctorsData);
      setValue('doctorId', '');
    }
  }, [watchedServiceId, setValue, doctorsData]);

  useEffect(() => {
    if (watchedDate) {
      updateAvailableTimes(watchedDate);
    } else {
      setAvailableTimes([]);
      setValue('appointmentTime', '');
    }
  }, [watchedDoctorId, watchedDate, updateAvailableTimes, setValue]);
  
  useEffect(() => {
      if (selectedDoctor && formData.appointmentDate) {
          updateAvailableTimes(formData.appointmentDate);
      }
  }, [selectedDoctor, formData.appointmentDate, updateAvailableTimes, bookedSlots]);

  const getMaxDate = () => {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 14);
    return maxDate.toISOString().split('T')[0];
  };

  const getMinDate = () => {
    return new Date().toISOString().split('T')[0];
  };

  const onModalFormSubmit = async (data) => {
    setError('');
    
    if (!data.appointmentTime) {
        setError('Please select a valid time slot.');
        return;
    }

    setIsSubmitting(true);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('You must be logged in to book an appointment');
        setIsSubmitting(false);
        navigate('/login?redirect=/appointment');
        return;
      }

      const selectedService = servicesData.find(s => s.id === data.serviceId || s._id === data.serviceId);
      const selectedDoc = doctorsData.find(d => 
        d._id === data.doctorId || d.doctorId === data.doctorId
      );

      if (!selectedDoc) {
        setError('Selected doctor not found');
        setIsSubmitting(false);
        return;
      }

      const appointmentData = {
        doctorId: selectedDoc._id, 
        doctorName: selectedDoc.name,
        serviceId: selectedService ? (selectedService.id || selectedService._id) : 'general',
        serviceName: selectedService ? (selectedService.title || selectedService.name) : 'General Consultation',
        appointmentDate: data.appointmentDate,
        appointmentTime: data.appointmentTime,
        amount: (selectedService && selectedService.price) ? selectedService.price : (selectedDoc.consultationFee || 500),
        notes: ''
      };

      const result = await dispatch(createAppointment(appointmentData));
      
      if (createAppointment.fulfilled.match(result)) {
        setShowBookingModal(false);
        reset();
        setAvailableDoctors([]);
        setAvailableTimes([]);
        dispatch(fetchAppointments());
      } else {
        setError(result.payload || 'Failed to book appointment.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to book appointment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredAppointments = appointments.filter(apt => {
    if (filter === 'all') return true;
    const appointmentDateTime = new Date(`${apt.appointmentDate}T${apt.appointmentTime}`);
    const now = new Date();
    if (filter === 'upcoming') return appointmentDateTime >= now;
    else if (filter === 'past') return appointmentDateTime < now;
    return true;
  });

  const sortedAppointments = [...filteredAppointments].sort((a, b) => {
    const dateA = new Date(`${a.appointmentDate}T${a.appointmentTime}`);
    const dateB = new Date(`${b.appointmentDate}T${b.appointmentTime}`);
    const now = new Date();
    if (dateA >= now && dateB < now) return -1;
    if (dateA < now && dateB >= now) return 1;
    return dateB - dateA;
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleBookingFormSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.appointmentDate || !formData.appointmentTime) {
      setError('Please select both date and time');
      return;
    }

    const selectedDate = new Date(formData.appointmentDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (selectedDate < today) {
      setError('Please select a future date');
      return;
    }

    setIsSubmitting(true);

    try {
      const selectedService = selectedDoctor.services && selectedDoctor.services[0] 
        ? servicesData.find(s => s.id === selectedDoctor.services[0])
        : null;

      const appointmentData = {
        doctorId: selectedDoctor._id, 
        doctorName: selectedDoctor.name,
        serviceId: selectedService ? selectedService.id : (selectedDoctor.services ? selectedDoctor.services[0] : ''),
        serviceName: selectedService ? selectedService.title : '',
        appointmentDate: formData.appointmentDate,
        appointmentTime: formData.appointmentTime,
        amount: selectedDoctor.consultationFee || 500,
        notes: formData.notes
      };

      const result = await dispatch(createAppointment(appointmentData));

      if (createAppointment.fulfilled.match(result)) {
        dispatch(fetchAppointments());
        setFormData({ appointmentDate: '', appointmentTime: '', notes: '' });
        navigate('/appointment', { replace: true });
        setSelectedDoctor(null);
      } else {
        setError(result.payload || 'Failed to create appointment');
      }
    } catch (err) {
      console.error('Appointment creation error:', err);
      setError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleViewDetails = (apt) => {
    // 1. Log the entire object being passed to the modal
    console.log("--- OPENING DETAILS MODAL ---");
    console.log("Appointment Object ID:", apt._id || apt.id);
    console.log("Full Object:", apt);
    
    // 2. Check for the specific fields you mentioned were missing
    console.log("Checking specific fields:");
    console.log(" - Lab Tests:", apt.labTests ? `Found (${apt.labTests.length})` : "MISSING/UNDEFINED");
    console.log(" - Diet:", apt.dietPlan ? `Found (${apt.dietPlan.length})` : "MISSING/UNDEFINED");
    console.log(" - Pharmacy:", apt.pharmacy ? `Found (${apt.pharmacy.length})` : "MISSING/UNDEFINED");
    console.log(" - Notes:", apt.notes || "MISSING/UNDEFINED");

    setSelectedAppointment(apt);
    setShowDetailsModal(true);
  };
  useEffect(() => {
  if (showDetailsModal || showBookingModal) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = 'unset';
  }
  return () => { document.body.style.overflow = 'unset'; };
}, [showDetailsModal, showBookingModal]);

  const isUpcoming = (appointmentDate, appointmentTime) => {
    const appointmentDateTime = new Date(`${appointmentDate}T${appointmentTime}`);
    return appointmentDateTime >= new Date();
  };

  if (!isAuthenticated) {
    return (
      <div className="appointment-page">
        <div className="content-wrapper">
            <div className="loading-state" style={{padding: '50px', textAlign: 'center', color: '#333'}}>
                <p>Loading your appointments...</p>
            </div>
        </div>
      </div>
    );
  }

  const role = (user?.role || '').toLowerCase();
  const isStaff = ['receptionist', 'reception', 'admin', 'hospitaladmin'].includes(role);

  if (isStaff) {
    return (
      <StaffAppointmentManager
        user={user}
        servicesData={servicesData}
        doctorsData={doctorsData}
        navigate={navigate}
      />
    );
  }

  return (
    <div className="appointment-page">
      <div className="content-wrapper">
        
        <section className="appointment-header animate-on-scroll slide-up">
          <div className="header-content">
            <span className="badge">My Appointments</span>
            <h1>Your <span className="text-gradient">Appointments</span></h1>
            <p className="header-subtext">View and manage all your appointments in one place.</p>
          </div>
          <div className="header-actions">
            <button
              onClick={() => {
                setShowBookingModal(true);
                const today = new Date().toISOString().split('T')[0];
                reset({ serviceId: '', doctorId: '', appointmentDate: today, appointmentTime: '' });
                setAvailableDoctors([]);
                setAvailableTimes([]);
                setError('');
              }}
              className="btn btn-primary btn-book-new"
            >
              <span className="btn-icon">➕</span> Book New Appointment
            </button>
          </div>
        </section>

        {doctorId && selectedDoctor && (
          <section className="booking-form-section animate-on-scroll slide-up delay-100">
            <div className="booking-form-header">
              <h2>Schedule Appointment with {selectedDoctor.name}</h2>
              <button onClick={() => { navigate('/appointment', { replace: true }); setSelectedDoctor(null); }} className="btn-close">✕</button>
            </div>
            
             <form onSubmit={handleBookingFormSubmit} className="appointment-form">
               <div className="form-group">
                 <label>Patient Name</label>
                 <input type="text" value={user?.name || ''} disabled className="form-input" style={{ backgroundColor: '#f1f5f9', color: '#475569', cursor: 'not-allowed' }} />
               </div>
               
               <div className="form-group">
                 <label htmlFor="appointmentDate">Select Date</label>
                 <input 
                   type="date" 
                   name="appointmentDate" 
                   value={formData.appointmentDate} 
                   onChange={handleInputChange} 
                   min={getMinDate()} 
                   max={getMaxDate()}
                   required 
                   className="form-input"
                 />
               </div>
               
               <div className="form-group">
                 <label htmlFor="appointmentTime">Select Time</label>
                 {availableTimes.length > 0 ? (
                   <div className="time-slots-grid">
                     {availableTimes.map(t => (
                       <button 
                         key={t} 
                         type="button" 
                         className={`time-slot-btn ${formData.appointmentTime === t ? 'selected' : ''}`} 
                         onClick={() => handleInputChange({ target: { name: 'appointmentTime', value: t } })}
                       >
                         {t}
                       </button>
                     ))}
                   </div>
                 ) : (
                   <p className="no-slots-msg">No slots available for this date.</p>
                 )}
               </div>
               
               {error && <div className="error-message">{error}</div>}
               
               <div className="form-actions">
                 <button 
                   type="submit" 
                   className="btn btn-primary" 
                   disabled={isSubmitting || !formData.appointmentTime || availableTimes.length === 0}
                 >
                   {isSubmitting ? 'Booking...' : 'Confirm Appointment'}
                 </button>
               </div>
             </form>
          </section>
        )}

        {!doctorId && (
          <section className="appointment-filters animate-on-scroll slide-up delay-100">
            <div className="filter-buttons">
              <button className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All Appointments</button>
              <button className={`filter-btn ${filter === 'upcoming' ? 'active' : ''}`} onClick={() => setFilter('upcoming')}>Upcoming</button>
              <button className={`filter-btn ${filter === 'past' ? 'active' : ''}`} onClick={() => setFilter('past')}>Past</button>
            </div>
          </section>
        )}

        {!doctorId && (
          <section className="appointments-list-section animate-on-scroll slide-up delay-200">
            {appointmentsLoading ? (
              <div className="loading-state"><div className="loading-spinner"></div><p>Loading appointments...</p></div>
            ) : sortedAppointments.length > 0 ? (
              <div className="appointments-grid">
                {sortedAppointments.map((appointment) => {
                  const upcoming = isUpcoming(appointment.appointmentDate, appointment.appointmentTime);
                  return (
                    <div key={appointment._id || appointment.id} className={`appointment-card ${upcoming ? 'upcoming' : 'past'}`}>
                      <div className="appointment-card-header">
                        <div className="appointment-status">
                          <span className={`status-badge status-${appointment.status}`}>
                            {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                          </span>
                          {upcoming && <span className="upcoming-badge">Upcoming</span>}
                        </div>
                        
                      </div>

                      <div className="appointment-card-body">
                        <div className="appointment-doctor">
                          <div className="doctor-icon">👨‍⚕️</div>
                          <div>
                            <h3>{appointment.doctorName}</h3>
                            {appointment.serviceName && <p className="service-name">{appointment.serviceName}</p>}
                          </div>
                        </div>

                        <div className="appointment-details-list">
                          <div className="detail-item">
                            <span className="detail-icon">📅</span>
                            <div><span className="detail-label">Date</span><span className="detail-value">{formatDate(appointment.appointmentDate)}</span></div>
                          </div>
                          <div className="detail-item">
                            <span className="detail-icon">🕐</span>
                            <div><span className="detail-label">Time</span><span className="detail-value">{appointment.appointmentTime}</span></div>
                          </div>
                        </div>

                        <div style={{marginTop: '1rem', borderTop: '1px solid #eee', paddingTop: '1rem'}}>
                            <button 
                                onClick={() => handleViewDetails(appointment)}
                                className="btn btn-secondary" 
                                style={{width: '100%', textAlign: 'center', display: 'block'}}
                            >
                                📄 View Details
                            </button>
                        </div>

                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="no-appointments">
                <div className="empty-state">
                  <div className="empty-icon">📅</div>
                  <h3>No Appointments Found</h3>
                  <button onClick={() => navigate('/services')} className="btn btn-primary">Book New Appointment</button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      {showBookingModal && (
        <div className="booking-modal-overlay" onClick={() => setShowBookingModal(false)}>
          <div className="booking-modal-content" onClick={(e) => e.stopPropagation()}>
             <div className="booking-modal-header"><h2>Book New Appointment</h2><button className="close-button" onClick={()=>setShowBookingModal(false)}>×</button></div>
             <form onSubmit={handleSubmit(onModalFormSubmit)} className="booking-form">
               <div className="form-group"><label>Patient Name</label><input type="text" value={user?.name || ''} disabled className="form-input" style={{ backgroundColor: '#f1f5f9', color: '#475569', cursor: 'not-allowed', width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box' }} /></div>
               <div className="form-group"><label>Service *</label><select {...register('serviceId', {required:true})} className="form-select"><option value="">Select Service</option>{servicesData.map(s=><option key={s.id || s._id} value={s.id || s._id}>{s.title || s.name}</option>)}</select></div>
               <div className="form-group"><label>Doctor *</label><select {...register('doctorId', {required:true})} className="form-select"><option value="">Select Doctor</option>{availableDoctors.map(d=><option key={d._id} value={d._id}>{d.name}</option>)}</select></div>
               <div className="form-group"><label>Date *</label><input type="date" {...register('appointmentDate', {required:true})} min={getMinDate()} max={getMaxDate()} className="form-input"/></div>
               
               <div className="form-group"><label>Time *</label>
               {availableTimes.length > 0 ? (
                   <select {...register('appointmentTime', {required:true})} className="form-select">
                     <option value="">Select Time</option>
                     {availableTimes.map(t=><option key={t} value={t}>{t}</option>)}
                   </select>
               ) : (
                   <p className="text-danger">No slots available for this date.</p>
               )}
               </div>
               
               {error && <div className="error-message" style={{marginBottom: '1rem'}}>{error}</div>}
               
               <div className="form-actions">
                   <button 
                    type="submit" 
                    className="btn btn-primary" 
                    disabled={isSubmitting || availableTimes.length === 0 || !watchedTime}
                   >
                       {isSubmitting ? 'Booking...' : 'Confirm'}
                   </button>
               </div>
             </form>
          </div>
        </div>
      )}

      {/* --- DETAILS MODAL WITH UPDATES --- */}
      {showDetailsModal && selectedAppointment && (
        <div className="details-modal-overlay" onClick={() => setShowDetailsModal(false)}>
            <div className="details-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="details-header">
                    <h2>Appointment Details</h2>
                    <button className="close-details-btn" onClick={() => setShowDetailsModal(false)}>×</button>
                </div>
                
                <div className="details-body">
                    <div className="details-info-grid">
                        <div><strong>Doctor:</strong> {selectedAppointment.doctorName}</div>
                        <div><strong>Date:</strong> {formatDate(selectedAppointment.appointmentDate)}</div>
                        <div><strong>Time:</strong> {selectedAppointment.appointmentTime}</div>
                        <div><strong>Status:</strong> <span className={`status-text ${selectedAppointment.status}`}>{selectedAppointment.status}</span></div>
                    </div>

                    <hr />

                    {/* IVF Labs */}
                    <div className="detail-section">
                        <h4>🧬 Lab Tests Prescribed</h4>
                        {selectedAppointment.labTests && selectedAppointment.labTests.length > 0 ? (
                            <div className="tags-container">
                                {selectedAppointment.labTests.map((lab, i) => (
                                    <span key={i} className="detail-tag lab-tag">{lab}</span>
                                ))}
                            </div>
                        ) : (
                            <p style={{fontStyle:'italic', color:'#888'}}>No lab tests found.</p>
                        )}
                    </div>

                    {/* IVF Diet - UPDATED: Changed from .diet to .dietPlan */}
                    <div className="detail-section">
                        <h4>🥗 Dietary Recommendations</h4>
                        {selectedAppointment.dietPlan && selectedAppointment.dietPlan.length > 0 ? (
                            <ul className="detail-list">
                                {selectedAppointment.dietPlan.map((item, i) => (
                                    <li key={i}>{item}</li>
                                ))}
                            </ul>
                        ) : (
                            <p style={{fontStyle:'italic', color:'#888'}}>No diet plan found.</p>
                        )}
                    </div>

                    {/* Pharmacy Table - UPDATED: Changed .name to .medicineName */}
                    <div className="detail-section">
                        <h4>💊 Medications</h4>
                        {selectedAppointment.pharmacy && selectedAppointment.pharmacy.length > 0 ? (
                            <table className="med-table">
                                <thead>
                                    <tr>
                                        <th>Medicine</th>
                                        <th>Frequency</th>
                                        <th>Duration</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedAppointment.pharmacy.map((med, i) => (
                                        <tr key={i}>
                                            <td>{med.medicineName}</td>
                                            <td>{med.frequency || '-'}</td>
                                            <td>{med.duration || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <p style={{fontStyle:'italic', color:'#888'}}>No medications prescribed.</p>
                        )}
                    </div>

                    {/* Notes */}
                    <div className="detail-section">
                         <h4>📝 Doctor's Notes</h4>
                         {selectedAppointment.notes ? (
                             <p className="notes-text">{selectedAppointment.notes}</p>
                         ) : (
                             <p style={{fontStyle:'italic', color:'#888'}}>No notes provided.</p>
                         )}
                    </div>

                    {/* Documents / Files */}
                    <div className="detail-section">
                        <h4>📂 Documents & Prescriptions</h4>
                        {(!selectedAppointment.prescriptions || selectedAppointment.prescriptions.length === 0) && !selectedAppointment.prescription ? (
                            <p className="no-data">No documents uploaded.</p>
                        ) : (
                            <div className="files-list">
                                {/* Support for both old single file and new multi-file structure */}
                                {selectedAppointment.prescription && (!selectedAppointment.prescriptions || selectedAppointment.prescriptions.length === 0) && (
                                    <a href={selectedAppointment.prescription} target="_blank" rel="noopener noreferrer" className="file-link">
                                        📄 View Prescription
                                    </a>
                                )}
                                {selectedAppointment.prescriptions?.map((file, i) => (
                                    <a key={i} href={file.url} target="_blank" rel="noopener noreferrer" className="file-link">
                                        📄 {file.name || `Document ${i+1}`}
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* --- DEBUG MODE: RAW DATA DUMP --- */}
                    <div style={{ marginTop: '20px', padding: '10px', background: '#333', color: '#fff', borderRadius: '5px', fontSize: '0.8rem' }}>
                        <details>
                            <summary style={{cursor: 'pointer', color: '#4da3ff'}}>🛠️ CLICK HERE TO DEBUG MISSING DATA</summary>
                            <p style={{marginTop:'5px', color: '#aaa'}}>If your data appears here but not above, the field names in your database (MongoDB) do not match the frontend code.</p>
                            <pre style={{ overflowX: 'auto', background: '#000', padding: '10px', marginTop: '5px' }}>
                                {JSON.stringify(selectedAppointment, null, 2)}
                            </pre>
                        </details>
                    </div>

                </div>
            </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// STAFF APPOINTMENT BOOKING & QUEUE MANAGER
// ==========================================
const StaffAppointmentManager = ({ user, servicesData, doctorsData, navigate }) => {
  const [activeTab, setActiveTab] = useState('list'); // 'list' or 'book'
  const [parentAppointmentId, setParentAppointmentId] = useState(null);

  // Appointment List State
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleScheduleFollowUp = (appt) => {
    const patient = appt.userId || {
      name: appt.patientName || '',
      phone: appt.patientPhone || '',
      email: appt.patientEmail || '',
      _id: appt.userId || appt.patientId
    };
    setSelectedPatient(patient);
    
    const doctorId = appt.doctorId?._id || appt.doctorId;
    const serviceId = appt.serviceId || '';
    const defaultFee = appt.amount || '';
    
    setBookingForm({
      serviceId: serviceId,
      doctorId: doctorId,
      appointmentDate: new Date().toISOString().split('T')[0],
      appointmentTime: '',
      amount: defaultFee,
      paymentMethod: 'Cash',
      paymentStatus: 'Paid',
      notes: 'Report Review Follow-up'
    });
    
    setParentAppointmentId(appt._id);
    setActiveTab('book');
  };

  // Hospital, Admissions & Hospitalize states
  const [hospitalContext, setHospitalContext] = useState(null);
  const [admissions, setAdmissions] = useState([]);
  const [hospitalizeModal, setHospitalizeModal] = useState({ open: false, appointment: null });
  const [hospitalizeForm, setHospitalizeForm] = useState({ ward: '', bedNumber: '', admissionDate: new Date().toISOString().split('T')[0], notes: '', facilityDays: {} });
  const [hospitalizingSaving, setHospitalizingSaving] = useState(false);

  const fetchHospital = async () => {
    try {
      const sub = getSubdomain();
      const res = await hospitalAPI.resolveHospital(sub);
      if (res.success) setHospitalContext(res.hospital);
    } catch (err) { console.error('Error fetching hospital context:', err); }
  };

  const fetchAdmissions = async () => {
    try {
      const res = await admissionAPI.getActiveAdmissions();
      if (res.success) setAdmissions(res.admissions || []);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    fetchHospital();
    fetchAdmissions();
  }, []);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState(() => {
    const d = new Date();
    const offset = d.getTimezoneOffset();
    const localDate = new Date(d.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  });
  const [doctorFilter, setDoctorFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Booking Form State
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientResults, setPatientResults] = useState([]);
  const [patientSearchLoading, setPatientSearchLoading] = useState(false);
  const [showWalkInForm, setShowWalkInForm] = useState(false);
  
  const [walkInForm, setWalkInForm] = useState({
    name: '',
    email: '',
    phone: ''
  });
  const [registering, setRegistering] = useState(false);
  const [quickReportFile, setQuickReportFile] = useState(null);
  const [quickReportName, setQuickReportName] = useState('');

  const [bookingForm, setBookingForm] = useState({
    serviceId: '',
    doctorId: '',
    appointmentDate: new Date().toISOString().split('T')[0],
    appointmentTime: '',
    amount: '',
    paymentMethod: 'Cash',
    paymentStatus: 'Paid',
    notes: ''
  });

  const [bookedSlots, setBookedSlots] = useState([]);
  const [availableTimes, setAvailableTimes] = useState([]);

  // Modals
  const [rescheduleModal, setRescheduleModal] = useState({ open: false, appointment: null });
  const [rescheduleForm, setRescheduleForm] = useState({ date: '', time: '' });
  const [rescheduleBookedSlots, setRescheduleBookedSlots] = useState([]);
  const [rescheduleAvailableTimes, setRescheduleAvailableTimes] = useState([]);
  const [collectPaymentModal, setCollectPaymentModal] = useState({ open: false, appointment: null });
  const [collectPaymentForm, setCollectPaymentForm] = useState({ method: 'Cash', amount: '' });

  // Load appointments
  const fetchAllAppointments = async () => {
    setLoading(true);
    try {
      const res = await receptionAPI.getAllAppointments('', false, true);
      if (res.success) {
        setAppointments(res.appointments || []);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to fetch appointments queue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllAppointments();
  }, []);

  // Search Patient
  useEffect(() => {
    if (patientSearch.trim().length < 2) {
      setPatientResults([]);
      return;
    }
    const delayDebounce = setTimeout(async () => {
      setPatientSearchLoading(true);
      try {
        const res = await receptionAPI.searchPatients(patientSearch);
        if (res.success) {
          setPatientResults(res.patients || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setPatientSearchLoading(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [patientSearch]);

  // Load booked slots when doctor or date changes in booking form
  useEffect(() => {
    const fetchSlots = async () => {
      if (bookingForm.doctorId && bookingForm.appointmentDate) {
        try {
          const res = await receptionAPI.getBookedSlots(bookingForm.doctorId, bookingForm.appointmentDate);
          if (res.success) {
            setBookedSlots(res.bookedSlots || []);
          }
        } catch (err) {
          console.error(err);
        }
      }
    };
    fetchSlots();
  }, [bookingForm.doctorId, bookingForm.appointmentDate]);

  // Load booked slots when rescheduling doctor/date changes
  useEffect(() => {
    const fetchSlots = async () => {
      if (rescheduleModal.appointment && rescheduleForm.date) {
        try {
          const res = await receptionAPI.getBookedSlots(rescheduleModal.appointment.doctorId?._id, rescheduleForm.date);
          if (res.success) {
            setRescheduleBookedSlots(res.bookedSlots || []);
          }
        } catch (err) {
          console.error(err);
        }
      }
    };
    fetchSlots();
  }, [rescheduleModal.appointment, rescheduleForm.date]);

  // Available times logic for Booking
  useEffect(() => {
    const baseTimes = [
      '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
      '12:00', '12:30', '14:00', '14:30', '15:00', '15:30',
      '16:00', '16:30', '17:00', '17:30'
    ];
    let times = baseTimes.filter(t => !bookedSlots.includes(t));

    // Filter out past times if the date is today
    if (bookingForm.appointmentDate) {
      const selectedDateObj = new Date(bookingForm.appointmentDate);
      selectedDateObj.setHours(0,0,0,0);
      const today = new Date();
      today.setHours(0,0,0,0);
      
      if (selectedDateObj.getTime() === today.getTime()) {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTimeInMinutes = currentHour * 60 + currentMinute;
        
        times = times.filter(time => {
          const [hours, minutes] = time.split(':').map(Number);
          const timeInMinutes = hours * 60 + minutes;
          // Slot must be after the current time
          return timeInMinutes >= currentTimeInMinutes;
        });
      }
    }

    if (bookingForm.doctorId && doctorsData.length > 0) {
      const doctor = doctorsData.find(d => d._id === bookingForm.doctorId);
      if (doctor && doctor.availability) {
        const dateObj = new Date(bookingForm.appointmentDate);
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = days[dateObj.getDay()];
        const schedule = doctor.availability[dayName];
        if (schedule && schedule.available === false) {
          setAvailableTimes([]);
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
    setAvailableTimes(times);
  }, [bookingForm.appointmentDate, bookingForm.doctorId, bookedSlots, doctorsData]);

  // Available times logic for Rescheduling
  useEffect(() => {
    if (!rescheduleForm.date || !rescheduleModal.appointment) return;
    const baseTimes = [
      '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
      '12:00', '12:30', '14:00', '14:30', '15:00', '15:30',
      '16:00', '16:30', '17:00', '17:30'
    ];
    let times = baseTimes.filter(t => !rescheduleBookedSlots.includes(t));

    // Filter out past times if the date is today
    if (rescheduleForm.date) {
      const selectedDateObj = new Date(rescheduleForm.date);
      selectedDateObj.setHours(0,0,0,0);
      const today = new Date();
      today.setHours(0,0,0,0);
      
      if (selectedDateObj.getTime() === today.getTime()) {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTimeInMinutes = currentHour * 60 + currentMinute;
        
        times = times.filter(time => {
          const [hours, minutes] = time.split(':').map(Number);
          const timeInMinutes = hours * 60 + minutes;
          return timeInMinutes >= currentTimeInMinutes;
        });
      }
    }

    const doctorId = rescheduleModal.appointment.doctorId?._id;
    if (doctorId && doctorsData.length > 0) {
      const doctor = doctorsData.find(d => d._id === doctorId);
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
  }, [rescheduleForm.date, rescheduleBookedSlots, rescheduleModal.appointment, doctorsData]);

  const handleServiceChange = (serviceId) => {
    const selectedService = servicesData.find(s => s._id === serviceId || s.id === serviceId);
    let amount = selectedService?.price || 0;
    setBookingForm(prev => {
      // If a doctor is already selected, keep the doctor's fee, otherwise use service fee
      const doc = prev.doctorId ? doctorsData.find(d => d._id === prev.doctorId) : null;
      const finalAmount = doc ? (doc.consultationFee || 0) : amount;
      return {
        ...prev,
        serviceId,
        amount: finalAmount
      };
    });
  };

  const handleDoctorChange = (doctorId) => {
    const doc = doctorsData.find(d => d._id === doctorId);
    let fee = doc?.consultationFee || 0; // fallback to 0 instead of empty string
    setBookingForm(prev => ({
      ...prev,
      doctorId,
      amount: fee
    }));
  };

  const handleQuickRegister = async (e) => {
    e.preventDefault();
    if (!walkInForm.name || !walkInForm.phone) {
      alert('Name and Phone number are required.');
      return;
    }
    setRegistering(true);
    try {
      const res = await receptionAPI.registerPatient({ ...walkInForm, autoCreateAppointment: false });
      if (res.success) {
        // Upload past report if selected
        if (quickReportFile) {
          try {
            await receptionAPI.uploadPastReport(res.user._id, quickReportFile, quickReportName);
          } catch (uploadErr) {
            console.error("Failed to upload past report for walk-in", uploadErr);
          }
        }
        setSelectedPatient(res.user);
        setShowWalkInForm(false);
        setWalkInForm({ name: '', email: '', phone: '' });
        setQuickReportFile(null);
        setQuickReportName('');
        setPatientSearch('');
      } else {
        alert(res.message || 'Failed to register patient.');
      }
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Error registering walk-in patient.');
    } finally {
      setRegistering(false);
    }
  };

  const handleBookAppointment = async (e) => {
    e.preventDefault();
    if (!selectedPatient) {
      alert('Please select or register a patient first.');
      return;
    }
    if (!bookingForm.doctorId || !bookingForm.appointmentDate || !bookingForm.appointmentTime) {
      alert('Doctor, Date, and Time Slot are required.');
      return;
    }

    try {
      const payload = {
        patientId: selectedPatient._id,
        doctorId: bookingForm.doctorId,
        date: bookingForm.appointmentDate,
        time: bookingForm.appointmentTime,
        notes: bookingForm.notes || 'Walk-in booking',
        paymentMethod: bookingForm.paymentMethod,
        paymentStatus: bookingForm.paymentStatus,
        amount: bookingForm.amount,
        parentAppointmentId: parentAppointmentId
      };

      const res = await receptionAPI.bookAppointment(payload);
      if (res.success) {
        alert('Appointment booked successfully!');
        setSelectedPatient(null);
        setParentAppointmentId(null);
        setBookingForm({
          serviceId: '',
          doctorId: '',
          appointmentDate: new Date().toISOString().split('T')[0],
          appointmentTime: '',
          amount: '',
          paymentMethod: 'Cash',
          paymentStatus: 'Paid',
          notes: ''
        });
        fetchAllAppointments();
        setActiveTab('list');
      } else {
        alert(res.message || 'Booking failed.');
      }
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Error booking appointment.');
    }
  };

  const handleCheckIn = async (appt) => {
    if (window.confirm(`Check in ${appt.userId?.name || 'patient'} for their visit?`)) {
      try {
        const res = await receptionAPI.checkIn({
          patientId: appt.userId?._id,
          appointmentId: appt._id
        });
        if (res.success) {
          alert('Patient checked in successfully! Directed to doctor queue.');
          fetchAllAppointments();
        } else {
          alert(res.message || 'Check-in failed.');
        }
      } catch (err) {
        console.error(err);
        alert('Error during patient check-in.');
      }
    }
  };

  const handleCancelAppt = async (id) => {
    if (window.confirm('Are you sure you want to cancel this appointment?')) {
      try {
        const res = await receptionAPI.cancelAppointment(id);
        if (res.success) {
          alert('Appointment cancelled successfully.');
          fetchAllAppointments();
        } else {
          alert(res.message || 'Cancellation failed.');
        }
      } catch (err) {
        console.error(err);
        alert('Error cancelling appointment.');
      }
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
        fetchAllAppointments();
      } else {
        alert(res.message || 'Reschedule failed.');
      }
    } catch (err) {
      console.error(err);
      alert('Error rescheduling appointment.');
    }
  };

  const submitCollectPayment = async (e) => {
    e.preventDefault();
    try {
      const res = await receptionAPI.confirmPayment(
        collectPaymentModal.appointment._id,
        collectPaymentForm.method,
        collectPaymentForm.amount
      );
      if (res.success) {
        alert('Payment marked as paid successfully!');
        setCollectPaymentModal({ open: false, appointment: null });
        fetchAllAppointments();
      } else {
        alert(res.message || 'Payment update failed.');
      }
    } catch (err) {
      console.error(err);
      alert('Error updating payment status.');
    }
  };

  const openHospitalizeModal = (apt) => {
    setHospitalizeForm({
      ward: '',
      bedNumber: '',
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
        admissionDate: hospitalizeForm.admissionDate,
        notes: hospitalizeForm.notes,
        selectedFacilities,
      });
      setHospitalizeModal({ open: false, appointment: null });
      fetchAdmissions();
      fetchAllAppointments();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to admit patient');
    } finally {
      setHospitalizingSaving(false);
    }
  };

  const generateReceiptPDF = (apt, paymentMethodOverride) => {
    const doc = new jsPDF();
    const hName = hospitalContext?.name || 'HOSPITAL';
    const hAddr = [hospitalContext?.address, hospitalContext?.city, hospitalContext?.state].filter(Boolean).join(', ');
    const hPhone = hospitalContext?.phone || '';
    const hEmail = hospitalContext?.email || '';
    const issuedBy = user?.name || 'Reception Staff';
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
        ['Service', apt.serviceName || 'Walk-in Visit'],
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

  const filteredAppointments = appointments.filter(appt => {
    const patientName = (appt.userId?.name || '').toLowerCase();
    const patientPhone = (appt.userId?.phone || '').toLowerCase();
    const patientId = (appt.patientId || '').toLowerCase();
    const doctorName = (appt.doctorName || '').toLowerCase();
    const sf = searchQuery.toLowerCase();
    
    if (searchQuery && 
        !patientName.includes(sf) && 
        !patientPhone.includes(sf) && 
        !patientId.includes(sf) && 
        !doctorName.includes(sf)) {
      return false;
    }

    if (statusFilter === 'report_follow_up') {
      if (!appt.requestReportFollowUp || appt.followUpScheduled) {
        return false;
      }
    } else {
      if (dateFilter && appt.appointmentDate?.split('T')[0] !== dateFilter) {
        return false;
      }

      if (statusFilter !== 'all' && appt.status !== statusFilter) {
        return false;
      }
    }

    if (doctorFilter && appt.doctorId?._id !== doctorFilter) {
      return false;
    }

    return true;
  });

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      
      {/* HEADER SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0A2647', margin: 0 }}>Appointments Center</h1>
          <p style={{ fontSize: '0.9rem', color: '#64748B', margin: '4px 0 0' }}>Book and manage patient appointments for the hospital.</p>
        </div>
        
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', background: '#E2E8F0', padding: '4px', borderRadius: '10px', gap: '4px' }}>
          <button 
            onClick={() => setActiveTab('list')}
            style={{ 
              padding: '10px 20px', 
              fontSize: '0.9rem', 
              fontWeight: 600, 
              border: 'none', 
              borderRadius: '8px', 
              cursor: 'pointer',
              background: activeTab === 'list' ? '#0A2647' : 'transparent',
              color: activeTab === 'list' ? '#fff' : '#475569',
              transition: 'all 0.2s'
            }}
          >
            📋 Appointment Queue
          </button>
          <button 
            onClick={() => navigate('/reception/dashboard', { state: { openIntake: true } })}
            style={{ 
              padding: '10px 20px', 
              fontSize: '0.9rem', 
              fontWeight: 600, 
              border: 'none', 
              borderRadius: '8px', 
              cursor: 'pointer',
              background: activeTab === 'book' ? '#0A2647' : 'transparent',
              color: activeTab === 'book' ? '#fff' : '#475569',
              transition: 'all 0.2s'
            }}
          >
            ➕ Book Appointment
          </button>
        </div>
      </div>

      {activeTab === 'list' && (
        // ==========================================
        // VIEW QUEUE TAB
        // ==========================================
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          
          {/* Filters Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>Search Patient / Doctor</label>
              <input 
                type="text" 
                placeholder="Name, Phone, MRN..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #CBD5E1', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', margin: 0 }}>Appointment Date</label>
                {dateFilter && (
                  <button 
                    onClick={() => setDateFilter('')}
                    style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                  >
                    Clear Filter
                  </button>
                )}
              </div>
              <input 
                type="date" 
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #CBD5E1', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>Filter by Doctor</label>
              <select 
                value={doctorFilter}
                onChange={e => setDoctorFilter(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #CBD5E1', borderRadius: '8px', fontSize: '0.9rem', outline: 'none', background: '#fff' }}
              >
                <option value="">All Doctors</option>
                {doctorsData.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>Status</label>
              <select 
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #CBD5E1', borderRadius: '8px', fontSize: '0.9rem', outline: 'none', background: '#fff' }}
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="report_follow_up">Report Follow-ups 📝</option>
              </select>
            </div>
          </div>

          {/* Queue Table */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
              <div className="loading-spinner" style={{ margin: '0 auto 12px' }}></div>
              <p>Loading appointments queue...</p>
            </div>
          ) : filteredAppointments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: '#F8FAFC', borderRadius: '12px', color: '#64748B' }}>
              <span style={{ fontSize: '3rem' }}>📅</span>
              <h3 style={{ margin: '16px 0 8px', color: '#0A2647' }}>No Appointments Found</h3>
              <p style={{ margin: 0 }}>Try clearing your search query or filters.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                    <th style={{ padding: '14px 16px', fontWeight: 700, color: '#475569', fontSize: '0.85rem' }}>Token / Time</th>
                    <th style={{ padding: '14px 16px', fontWeight: 700, color: '#475569', fontSize: '0.85rem' }}>Patient Details</th>
                    <th style={{ padding: '14px 16px', fontWeight: 700, color: '#475569', fontSize: '0.85rem' }}>Doctor / Service</th>
                    <th style={{ padding: '14px 16px', fontWeight: 700, color: '#475569', fontSize: '0.85rem' }}>Billing</th>
                    <th style={{ padding: '14px 16px', fontWeight: 700, color: '#475569', fontSize: '0.85rem' }}>Status</th>
                    <th style={{ padding: '14px 16px', fontWeight: 700, color: '#475569', fontSize: '0.85rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAppointments.map(appt => {
                    const isPaid = (appt.paymentStatus || '').toLowerCase() === 'paid';
                    const isCancelled = appt.status === 'cancelled';
                    const isCompleted = appt.status === 'completed';
                    const isCurrentlyAdmitted = admissions.some(adm => (adm.appointmentId?._id || adm.appointmentId) === appt._id && (adm.status === 'Admitted' || adm.status === 'Pending Allocation'));
                    
                    return (
                      <tr key={appt._id} style={{ borderBottom: '1px solid #F1F5F9', transition: 'all 0.2s' }}>
                        <td style={{ padding: '16px' }}>
                          <div style={{ fontWeight: 700, color: '#0A2647' }}>
                            {appt.tokenNumber ? `Token #${appt.tokenNumber}` : appt.appointmentTime || '--:--'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px' }}>
                            {new Date(appt.appointmentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                        </td>
                        <td style={{ padding: '16px' }}>
                          <div style={{ fontWeight: 700, color: '#1E293B' }}>{appt.userId?.name || 'Walk-in'}</div>
                          <div style={{ fontSize: '0.8rem', color: '#64748B', display: 'flex', gap: '8px', marginTop: '2px' }}>
                            <span>MRN: {appt.patientId || appt.userId?.patientId || '-'}</span>
                            <span>•</span>
                            <span>📞 {appt.userId?.phone || appt.phone || '-'}</span>
                          </div>
                        </td>
                        <td style={{ padding: '16px' }}>
                          <div style={{ fontWeight: 600, color: '#0A2647' }}>{appt.doctorName}</div>
                          <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '2px' }}>{appt.serviceName || 'Consultation'}</div>
                        </td>
                        <td style={{ padding: '16px' }}>
                          <div style={{ fontWeight: 700, color: '#1E293B' }}>₹{appt.amount || 0}</div>
                          <div style={{ marginTop: '4px' }}>
                            <span style={{ 
                              padding: '2px 8px', 
                              borderRadius: '4px', 
                              fontSize: '0.7rem', 
                              fontWeight: 700,
                              background: isPaid ? '#ECFDF5' : '#FEF2F2',
                              color: isPaid ? '#059669' : '#DC2626'
                            }}>
                              {isPaid ? 'PAID' : 'PENDING'}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '16px' }}>
                          <span style={{ 
                            padding: '4px 10px', 
                            borderRadius: '20px', 
                            fontSize: '0.75rem', 
                            fontWeight: 700,
                            background: 
                              appt.status === 'confirmed' ? '#ECFDF5' : 
                              appt.status === 'pending' ? '#FFFBEB' : 
                              appt.status === 'completed' ? '#EFF6FF' : '#FEF2F2',
                            color: 
                              appt.status === 'confirmed' ? '#059669' : 
                              appt.status === 'pending' ? '#D97706' : 
                              appt.status === 'completed' ? '#1D4ED8' : '#DC2626'
                          }}>
                            {appt.status?.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center', whiteSpace: 'nowrap' }}>
                            {statusFilter === 'report_follow_up' ? (
                              <button 
                                onClick={() => handleScheduleFollowUp(appt)}
                                style={{ 
                                  padding: '8px 14px', 
                                  fontSize: '0.78rem', 
                                  fontWeight: 700, 
                                  background: '#8b5cf6', 
                                  color: '#fff', 
                                  border: 'none', 
                                  borderRadius: '6px', 
                                  cursor: 'pointer',
                                  boxShadow: '0 2px 4px rgba(139, 92, 246, 0.2)'
                                }}
                              >
                                📅 Schedule Follow-up
                              </button>
                            ) : (
                              <>
                                {appt.requestReportFollowUp && !appt.followUpScheduled && (
                                  <button 
                                    onClick={() => handleScheduleFollowUp(appt)}
                                    style={{ 
                                      padding: '6px 10px', 
                                      fontSize: '0.75rem', 
                                      fontWeight: 700, 
                                      background: '#8b5cf6', 
                                      color: '#fff', 
                                      border: 'none', 
                                      borderRadius: '6px', 
                                      cursor: 'pointer',
                                      boxShadow: '0 2px 4px rgba(139, 92, 246, 0.1)'
                                    }}
                                  >
                                    📅 Schedule Follow-up
                                  </button>
                                )}
                                <button 
                                  onClick={() => {
                                    const pid = appt.userId?._id || appt.userId || appt.patientId;
                                    if (pid) navigate(`/patient/${pid}`);
                                  }}
                                  style={{ 
                                    padding: '6px 10px', 
                                    fontSize: '0.75rem', 
                                    fontWeight: 600, 
                                    background: 'rgba(59, 130, 246, 0.1)', 
                                    color: '#3b82f6', 
                                    border: '1px solid #3b82f6', 
                                    borderRadius: '6px', 
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                >
                                  👁 Profile
                                </button>
                                {appt.checkedIn ? (
                                  <span style={{
                                    padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700,
                                    background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0'
                                  }}>
                                    ✓ Checked In
                                  </span>
                                ) : (
                                  !isCancelled && !isCompleted && (
                                    <button 
                                      onClick={() => handleCheckIn(appt)}
                                      style={{ padding: '6px 10px', fontSize: '0.75rem', fontWeight: 600, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: '6px', cursor: 'pointer' }}
                                      title="Check in patient for vitals/intake queue"
                                    >
                                      Check In
                                    </button>
                                  )
                                )}
                                {!appt.checkedIn && !isCancelled && !isCompleted && (
                                  <button 
                                    onClick={() => {
                                      setRescheduleForm({ date: appt.appointmentDate?.split('T')[0], time: appt.appointmentTime });
                                      setRescheduleModal({ open: true, appointment: appt });
                                    }}
                                    style={{ padding: '6px 10px', fontSize: '0.75rem', fontWeight: 600, background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A', borderRadius: '6px', cursor: 'pointer' }}
                                  >
                                    Reschedule
                                  </button>
                                )}
                                {!isPaid && !isCancelled && (
                                  <button 
                                    onClick={() => {
                                      setCollectPaymentForm({ amount: appt.amount, method: 'Cash' });
                                      setCollectPaymentModal({ open: true, appointment: appt });
                                    }}
                                    style={{ padding: '6px 10px', fontSize: '0.75rem', fontWeight: 600, background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0', borderRadius: '6px', cursor: 'pointer' }}
                                  >
                                    Mark Paid
                                  </button>
                                )}
                                {isPaid && (
                                  <button 
                                    onClick={() => generateReceiptPDF(appt)}
                                    style={{ padding: '6px 10px', fontSize: '0.75rem', fontWeight: 600, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: '6px', cursor: 'pointer' }}
                                  >
                                    Receipt
                                  </button>
                                )}
                                {((!isCancelled && !isCompleted && !isCurrentlyAdmitted) || (appt.recommendAdmission && !isCurrentlyAdmitted)) && (
                                  <button 
                                    onClick={() => openHospitalizeModal(appt)}
                                    style={{ padding: '6px 10px', fontSize: '0.75rem', fontWeight: 600, background: '#E0F2FE', color: '#0369A1', border: '1px solid #BAE6FD', borderRadius: '6px', cursor: 'pointer' }}
                                  >
                                    Admit
                                  </button>
                                )}
                                {!isCancelled && !isCompleted && (
                                  <button 
                                    onClick={() => handleCancelAppt(appt._id)}
                                    style={{ padding: '6px 10px', fontSize: '0.75rem', fontWeight: 600, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: '6px', cursor: 'pointer' }}
                                  >
                                    Cancel
                                  </button>
                                )}
                                {(isCancelled || isCompleted) && !isPaid && (
                                  <span style={{ fontSize: '0.8rem', color: '#94A3B8', fontStyle: 'italic' }}>No actions</span>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {/* ==========================================
          RESCHEDULE MODAL
          ========================================== */}
      {rescheduleModal.open && rescheduleModal.appointment && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(10, 38, 71, 0.45)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: '480px', borderRadius: '16px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0A2647', fontWeight: 700 }}>Reschedule Appointment</h3>
              <button 
                onClick={() => setRescheduleModal({ open: false, appointment: null })}
                style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#94A3B8' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={submitReschedule}>
              <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.9rem', color: '#334155' }}>
                <strong>Patient:</strong> {rescheduleModal.appointment.userId?.name} <br />
                <strong>Doctor:</strong> {rescheduleModal.appointment.doctorName}
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>New Appointment Date</label>
                <input 
                  type="date"
                  required
                  value={rescheduleForm.date}
                  onChange={e => setRescheduleForm({ ...rescheduleForm, date: e.target.value, time: '' })}
                  min={new Date().toISOString().split('T')[0]}
                  style={{ width: '100%', padding: '12px', border: '1.5px solid #CBD5E1', borderRadius: '8px', fontSize: '0.95rem' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>Select Available Slot</label>
                {rescheduleForm.date ? (
                  rescheduleAvailableTimes.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(75px, 1fr))', gap: '8px' }}>
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
                              border: isSelected ? 'none' : '1px solid #CBD5E1',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              background: isSelected ? '#D97706' : '#fff',
                              color: isSelected ? '#fff' : '#1E293B',
                              transition: 'all 0.2s'
                            }}
                          >
                            {slot}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p style={{ color: '#EF4444', fontSize: '0.9rem', margin: 0 }}>No slots available on this date.</p>
                  )
                ) : (
                  <p style={{ color: '#64748B', fontSize: '0.9rem', margin: 0, fontStyle: 'italic' }}>Please select a date first.</p>
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button 
                  type="submit"
                  disabled={!rescheduleForm.date || !rescheduleForm.time}
                  style={{ flex: 1, padding: '12px', background: '#D97706', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Confirm Reschedule
                </button>
                <button 
                  type="button" 
                  onClick={() => setRescheduleModal({ open: false, appointment: null })}
                  style={{ padding: '12px 20px', background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          COLLECT PAYMENT MODAL
          ========================================== */}
      {collectPaymentModal.open && collectPaymentModal.appointment && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(10, 38, 71, 0.45)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: '420px', borderRadius: '16px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0A2647', fontWeight: 700 }}>Record Fee Payment</h3>
              <button 
                onClick={() => setCollectPaymentModal({ open: false, appointment: null })}
                style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#94A3B8' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={submitCollectPayment}>
              <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.9rem', color: '#334155' }}>
                <strong>Patient:</strong> {collectPaymentModal.appointment.userId?.name} <br />
                <strong>Service Charge:</strong> ₹{collectPaymentModal.appointment.amount || 0}
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>Amount to Pay (₹)</label>
                <input 
                  type="number"
                  required
                  value={collectPaymentForm.amount}
                  onChange={e => setCollectPaymentForm({ ...collectPaymentForm, amount: e.target.value })}
                  style={{ width: '100%', padding: '12px', border: '1.5px solid #CBD5E1', borderRadius: '8px', fontSize: '0.95rem' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>Payment Method</label>
                <select 
                  value={collectPaymentForm.method}
                  onChange={e => setCollectPaymentForm({ ...collectPaymentForm, method: e.target.value })}
                  style={{ width: '100%', padding: '12px', border: '1.5px solid #CBD5E1', borderRadius: '8px', fontSize: '0.95rem', background: '#fff' }}
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI / QR Code</option>
                  <option value="Card">Card</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button 
                  type="submit"
                  style={{ flex: 1, padding: '12px', background: '#059669', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Collect Payment
                </button>
                <button 
                  type="button" 
                  onClick={() => setCollectPaymentModal({ open: false, appointment: null })}
                  style={{ padding: '12px 20px', background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </form>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Ward / Room</label>
                <input
                  type="text"
                  placeholder="e.g. General Ward, ICU"
                  value={hospitalizeForm.ward}
                  onChange={e => setHospitalizeForm(p => ({ ...p, ward: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Bed Number</label>
                <input
                  type="text"
                  placeholder="e.g. B-12"
                  value={hospitalizeForm.bedNumber}
                  onChange={e => setHospitalizeForm(p => ({ ...p, bedNumber: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                />
              </div>
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

    </div>
  );
};

export default Appointment;