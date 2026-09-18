// mobile/src/screens/staff/StaffDashboardScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Image,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import {
  fetchReceptionAppointments,
  registerWalkInPatient,
  searchPatientsReception,
  bookAppointmentReception,
  checkInPatientReception,
  rescheduleAppointmentReception,
  cancelAppointmentReception,
  confirmPaymentReception,
  fetchDoctorsPublic
} from '../../services/api';

export default function StaffDashboardScreen({ navigation }) {
  const { user, token, logout } = useAuth();

  // ── Navigation & Drawer State ──
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'directory'
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);

  // ── Data State ──
  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // ── Filter State ──
  const [filterMode, setFilterMode] = useState('TODAY'); // 'TODAY' | 'ALL' | 'PENDING' | 'COMPLETED'
  const [searchQuery, setSearchQuery] = useState('');

  // ── Modals State ──
  // 1. Walk-in Registration Modal
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [regForm, setRegForm] = useState({
    name: '',
    phone: '',
    email: '',
    gender: 'Female',
    doctorId: ''
  });
  const [savingReg, setSavingReg] = useState(false);

  // 2. Book / Schedule Appointment Modal
  const [showBookModal, setShowBookModal] = useState(false);
  const [bookForm, setBookForm] = useState({
    patientId: '',
    patientName: '',
    doctorId: '',
    date: new Date().toISOString().split('T')[0],
    time: '10:30 AM',
    amount: '500',
    paymentMethod: 'Cash'
  });
  const [savingBook, setSavingBook] = useState(false);

  // 3. Reschedule Modal
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [targetAppt, setTargetAppt] = useState(null);
  const [reschedDate, setReschedDate] = useState(new Date().toISOString().split('T')[0]);
  const [reschedTime, setReschedTime] = useState('11:00 AM');
  const [savingResched, setSavingResched] = useState(false);

  // ── Feedback Toast Helper ──
  const showNotification = (type, text) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  // ── Load Appointments ──
  const loadAppointmentsData = useCallback(async () => {
    if (!token) return;
    const res = await fetchReceptionAppointments(token, { all: 'true' });
    if (res.success) {
      setAppointments(res.appointments);
    }
  }, [token]);

  // ── Load Doctors ──
  const loadDoctorsData = useCallback(async () => {
    const res = await fetchDoctorsPublic(token);
    if (res.success) {
      setDoctors(res.doctors);
    }
  }, [token]);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadAppointmentsData(), loadDoctorsData()]);
    setLoading(false);
  }, [loadAppointmentsData, loadDoctorsData]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadAppointmentsData(), loadDoctorsData()]);
    setRefreshing(false);
  };

  // ── Search Patients ──
  const handleSearchDirectory = async (query) => {
    setSearchQuery(query);
    if (!query || query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const res = await searchPatientsReception(query.trim(), token);
    setSearching(false);
    if (res.success) {
      setSearchResults(res.patients);
    }
  };

  // ── Check-in Action ──
  const handleCheckIn = async (appt) => {
    const pId = appt.userId?._id || appt.userId;
    const res = await checkInPatientReception(
      { patientId: pId, appointmentId: appt._id },
      token
    );
    if (res.success) {
      showNotification('success', `Checked in ${appt.patientName || 'patient'} to waiting room.`);
      loadAppointmentsData();
    } else {
      Alert.alert('Error', res.message || 'Failed to check in patient.');
    }
  };

  // ── Confirm Payment ──
  const handleConfirmPayment = async (appt) => {
    const res = await confirmPaymentReception(appt._id, { paymentMethod: 'Cash' }, token);
    if (res.success) {
      showNotification('success', `Payment marked as Paid for ${appt.patientName}.`);
      loadAppointmentsData();
    } else {
      Alert.alert('Error', res.message || 'Failed to confirm payment.');
    }
  };

  // ── Cancel Appointment ──
  const handleCancelAppt = (appt) => {
    Alert.alert(
      'Cancel Appointment',
      `Cancel appointment for ${appt.patientName}?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            const res = await cancelAppointmentReception(appt._id, token);
            if (res.success) {
              showNotification('success', 'Appointment cancelled.');
              loadAppointmentsData();
            } else {
              Alert.alert('Error', res.message || 'Failed to cancel appointment.');
            }
          }
        }
      ]
    );
  };

  // ── Reschedule Appointment ──
  const handleOpenReschedule = (appt) => {
    setTargetAppt(appt);
    setReschedDate(new Date().toISOString().split('T')[0]);
    setReschedTime('11:30 AM');
    setShowRescheduleModal(true);
  };

  const handleSaveReschedule = async () => {
    setSavingResched(true);
    const res = await rescheduleAppointmentReception(
      targetAppt._id,
      { date: reschedDate, time: reschedTime },
      token
    );
    setSavingResched(false);

    if (res.success) {
      setShowRescheduleModal(false);
      showNotification('success', `Appointment rescheduled to ${reschedDate} at ${reschedTime}.`);
      loadAppointmentsData();
    } else {
      Alert.alert('Error', res.message || 'Failed to reschedule.');
    }
  };

  // ── Register Walk-in Patient ──
  const handleRegisterWalkIn = async () => {
    if (!regForm.name.trim() || !regForm.phone.trim()) {
      Alert.alert('Validation', 'Patient Name and Phone number are required.');
      return;
    }

    setSavingReg(true);
    const res = await registerWalkInPatient({
      name: regForm.name.trim(),
      phone: regForm.phone.trim(),
      email: regForm.email.trim() || undefined,
      gender: regForm.gender,
      doctorId: regForm.doctorId || (doctors[0]?._id || undefined)
    }, token);
    setSavingReg(false);

    if (res.success) {
      setShowRegisterModal(false);
      setRegForm({ name: '', phone: '', email: '', gender: 'Female', doctorId: '' });
      showNotification('success', `Registered walk-in patient ${res.user?.name || ''}!`);
      loadAppointmentsData();
    } else {
      Alert.alert('Error', res.message || 'Registration failed.');
    }
  };

  // ── Book Appointment for Patient ──
  const handleOpenBookForPatient = (patient) => {
    setBookForm({
      patientId: patient._id,
      patientName: patient.name,
      doctorId: doctors[0]?._id || '',
      date: new Date().toISOString().split('T')[0],
      time: '11:00 AM',
      amount: '500',
      paymentMethod: 'Cash'
    });
    setShowBookModal(true);
  };

  const handleSaveBooking = async () => {
    if (!bookForm.patientId || !bookForm.doctorId || !bookForm.date) {
      Alert.alert('Validation', 'Patient, Doctor, and Appointment date are required.');
      return;
    }

    setSavingBook(true);
    const res = await bookAppointmentReception(bookForm, token);
    setSavingBook(false);

    if (res.success) {
      setShowBookModal(false);
      showNotification('success', `Appointment booked for ${bookForm.patientName}! Token/Slot confirmed.`);
      loadAppointmentsData();
      setActiveTab('queue');
    } else {
      Alert.alert('Error', res.message || 'Booking failed.');
    }
  };

  // ── Compute Stats ──
  const todayStr = new Date().toISOString().split('T')[0];
  const todayAppts = appointments.filter(a => {
    if (!a.appointmentDate) return false;
    return new Date(a.appointmentDate).toISOString().split('T')[0] === todayStr;
  });
  const checkedInCount = appointments.filter(a => a.checkedIn || a.visitStatus === 'check_in').length;
  const pendingCount = appointments.filter(a => a.status === 'pending' || a.status === 'confirmed').length;
  const totalCount = appointments.length;

  // ── Filtered Appointments ──
  const filteredAppointments = appointments.filter(item => {
    const pName = (item.patientName || item.userId?.name || '').toLowerCase();
    const pId = (item.patientId || item.userId?.patientId || '').toLowerCase();
    const phone = (item.patientPhone || item.userId?.phone || '');
    const doc = (item.doctorName || item.doctorId?.name || '').toLowerCase();
    const query = searchQuery.trim().toLowerCase();

    const matchesQuery = !query || pName.includes(query) || pId.includes(query) || phone.includes(query) || doc.includes(query);
    if (!matchesQuery) return false;

    if (filterMode === 'TODAY') {
      if (!item.appointmentDate) return false;
      return new Date(item.appointmentDate).toISOString().split('T')[0] === todayStr;
    }
    if (filterMode === 'PENDING') return item.status === 'pending' || item.status === 'confirmed';
    if (filterMode === 'COMPLETED') return item.status === 'completed';
    return true;
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* ── TOP HEADER (Big height + Front Desk Profile Card + Refresh) ── */}
      <View style={styles.topHeader}>
        <View style={styles.headerLeftGroup}>
          <TouchableOpacity
            style={styles.hamburgerBtn}
            onPress={() => setIsSidebarOpen(true)}
            activeOpacity={0.7}
          >
            <View style={styles.hamburgerLine} />
            <View style={styles.hamburgerLine} />
            <View style={styles.hamburgerLine} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerAdminCard}
            onPress={() => navigation?.navigate('Profile')}
            activeOpacity={0.7}
          >
            <View style={[styles.headerAdminAvatar, { backgroundColor: '#059669' }]}>
              {user?.avatar && (user.avatar.startsWith('http') || user.avatar.startsWith('data:')) ? (
                <Image source={{ uri: user.avatar }} style={{ width: 40, height: 40, borderRadius: 20 }} />
              ) : (
                <Text style={styles.headerAdminAvatarText}>
                  {user?.avatar || (user?.name || 'R').charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            <View style={styles.headerAdminInfo}>
              <View style={styles.headerAdminNameRow}>
                <Text style={styles.headerAdminName} numberOfLines={1}>
                  {user?.name || 'Front Desk Staff'}
                </Text>
                <View style={[styles.headerRoleBadge, { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }]}>
                  <Text style={[styles.headerRoleBadgeText, { color: '#059669' }]}>FRONT DESK</Text>
                </View>
              </View>
              <Text style={styles.headerAdminEmail} numberOfLines={1}>
                {user?.email || 'reception@crm.com'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={loadAllData}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.refreshBtnText}>↻</Text>
        </TouchableOpacity>
      </View>

      {/* ── NOTIFICATION TOAST ── */}
      {feedback ? (
        <View style={[styles.feedbackBanner, feedback.type === 'error' ? styles.feedbackError : styles.feedbackSuccess]}>
          <Text style={styles.feedbackIcon}>{feedback.type === 'error' ? '⚠️' : '✅'}</Text>
          <Text style={styles.feedbackText}>{feedback.text}</Text>
        </View>
      ) : null}

      {/* ── MAIN SCROLLABLE BODY ── */}
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#059669']} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── HERO BANNER (Exact Webapp Front Desk Match) ── */}
        <View style={styles.heroBanner}>
          <View style={styles.heroHeaderRow}>
            <View style={styles.heroTitleGroup}>
              <Text style={styles.heroTitle}>📋 Front Desk Intake</Text>
              <Text style={styles.heroSubtitle}>
                Waiting room queue, token issuance & slot booking
              </Text>
            </View>

            <TouchableOpacity
              style={styles.heroActionBtn}
              onPress={() => setShowRegisterModal(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.heroActionBtnText}>+ Walk-in Intake</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 4 KPI STATS IN 2 CLEAN ROWS (No Wrapping Glitches) ── */}
        <View style={styles.statsRow}>
          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }]}
            onPress={() => { setActiveTab('queue'); setFilterMode('TODAY'); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.statNumber, { color: '#0284c7' }]}>{todayAppts.length}</Text>
            <Text style={styles.statLabel}>TODAY'S QUEUE</Text>
            <Text style={styles.statSubText}>Scheduled OPD</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }]}
            onPress={() => { setActiveTab('queue'); setFilterMode('PENDING'); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.statNumber, { color: '#059669' }]}>{checkedInCount}</Text>
            <Text style={styles.statLabel}>CHECKED IN</Text>
            <Text style={styles.statSubText}>In Waiting Room</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}
            onPress={() => { setActiveTab('queue'); setFilterMode('PENDING'); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.statNumber, { color: '#d97706' }]}>{pendingCount}</Text>
            <Text style={styles.statLabel}>PENDING VISITS</Text>
            <Text style={styles.statSubText}>Active Tokens</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}
            onPress={() => { setActiveTab('queue'); setFilterMode('ALL'); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.statNumber, { color: '#475569' }]}>{totalCount}</Text>
            <Text style={styles.statLabel}>TOTAL RECORDS</Text>
            <Text style={styles.statSubText}>All Bookings</Text>
          </TouchableOpacity>
        </View>

        {/* ── 2 QUICK ACTION NAVIGATION BUTTONS ── */}
        <View style={styles.quickNavRow}>
          <TouchableOpacity
            style={[
              styles.quickNavBtn,
              activeTab === 'queue'
                ? { backgroundColor: '#059669' }
                : { backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#059669' }
            ]}
            onPress={() => setActiveTab('queue')}
            activeOpacity={0.8}
          >
            <Text style={[styles.quickNavBtnText, activeTab !== 'queue' && { color: '#059669' }]}>
              🎫 Front Desk Queue
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.quickNavBtn,
              activeTab === 'directory'
                ? { backgroundColor: '#059669' }
                : { backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#059669' }
            ]}
            onPress={() => setActiveTab('directory')}
            activeOpacity={0.8}
          >
            <Text style={[styles.quickNavBtnText, activeTab !== 'directory' && { color: '#059669' }]}>
              👥 Patient Directory
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── TAB 1: QUEUE & APPOINTMENTS ── */}
        {activeTab === 'queue' && (
          <View>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWrap}>
                <Text style={styles.sectionTitle}>
                  {filterMode === 'TODAY' ? "Today's Patient Queue" :
                   filterMode === 'ALL' ? "All Registered Bookings" :
                   filterMode === 'PENDING' ? "Waiting Room Queue" :
                   "Completed Consultations"}
                </Text>
                <Text style={styles.sectionSub}>
                  {filterMode === 'PENDING' ? "Arrived patients awaiting doctor consultation" :
                   "Waiting room intake, token issuance & slot booking"}
                </Text>
              </View>
            </View>

            {/* Filter Chips in smooth horizontal scroller */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroll}
              contentContainerStyle={styles.filterScrollContent}
            >
              {['TODAY', 'ALL', 'PENDING', 'COMPLETED'].map(f => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterChip, filterMode === f && styles.filterChipActive]}
                  onPress={() => setFilterMode(f)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.filterChipText, filterMode === f && styles.filterChipTextActive]}>
                    {f === 'TODAY' ? "📅 Today's OPD" : f === 'ALL' ? "📋 All Dates" : f === 'PENDING' ? "⏳ Waiting Room" : "✅ Completed"}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Search Input */}
            <View style={styles.searchBox}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search patient, MRN, phone, or doctor..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor="#94a3b8"
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.clearSearchText}>✕</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Appointments List */}
            {loading ? (
              <ActivityIndicator size="large" color="#059669" style={{ marginTop: 24 }} />
            ) : filteredAppointments.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>📋</Text>
                <Text style={styles.emptyTitle}>No appointments found</Text>
                <Text style={styles.emptySub}>Tap "+ Walk-in Intake" to register new arriving patients.</Text>
              </View>
            ) : (
              filteredAppointments.map(appt => {
                const isCheckedIn = appt.checkedIn || appt.visitStatus === 'check_in';
                const pName = appt.patientName || appt.userId?.name || 'Patient';
                const pId = appt.patientId || appt.userId?.patientId || 'MRN-PENDING';
                const tokenStr = appt.tokenNumber ? `Token #${appt.tokenNumber}` : (appt.appointmentTime || '10:00 AM');
                const isPaid = ['paid', 'Paid'].includes(appt.paymentStatus);

                return (
                  <View key={appt._id} style={styles.apptCard}>
                    <View style={styles.apptTopRow}>
                      <View style={styles.tokenBadge}>
                        <Text style={styles.tokenBadgeText}>{tokenStr}</Text>
                      </View>
                      <View style={[styles.statusPill, isCheckedIn ? styles.statusPillCheckIn : styles.statusPillPending]}>
                        <Text style={[styles.statusPillText, isCheckedIn ? styles.statusPillTextCheckIn : styles.statusPillTextPending]}>
                          {isCheckedIn ? 'WAITING ROOM' : String(appt.status || 'CONFIRMED').toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.patientName}>{pName}</Text>
                    <Text style={styles.patientSub}>
                      MRN: {pId} • Phone: {appt.patientPhone || appt.userId?.phone || 'N/A'}
                    </Text>
                    <Text style={styles.doctorSub}>
                      Doctor: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{appt.doctorName || appt.doctorId?.name || 'Pending Assignment'}</Text>
                    </Text>

                    <View style={styles.feeRow}>
                      <Text style={styles.feeText}>Fee: ₹{appt.amount || 500}</Text>
                      <View style={[styles.payBadge, isPaid ? styles.payBadgePaid : styles.payBadgePending]}>
                        <Text style={[styles.payBadgeText, isPaid ? styles.payBadgeTextPaid : styles.payBadgeTextPending]}>
                          {isPaid ? 'PAID' : 'PAYMENT PENDING'}
                        </Text>
                      </View>
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.cardActionRow}>
                      {!isCheckedIn ? (
                        <TouchableOpacity
                          style={[styles.primaryActionBtn, { backgroundColor: '#059669' }]}
                          onPress={() => handleCheckIn(appt)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.primaryActionBtnText}>🎫 Check In to Queue</Text>
                        </TouchableOpacity>
                      ) : null}

                      <View style={styles.secondaryActionRow}>
                        {!isPaid ? (
                          <TouchableOpacity
                            style={styles.secondaryBtn}
                            onPress={() => handleConfirmPayment(appt)}
                          >
                            <Text style={styles.secondaryBtnText}>💰 Collect Payment</Text>
                          </TouchableOpacity>
                        ) : null}

                        <TouchableOpacity
                          style={styles.secondaryBtn}
                          onPress={() => handleOpenReschedule(appt)}
                        >
                          <Text style={styles.secondaryBtnText}>📅 Reschedule</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.secondaryBtn, { borderColor: '#fecaca' }]}
                          onPress={() => handleCancelAppt(appt)}
                        >
                          <Text style={[styles.secondaryBtnText, { color: '#ef4444' }]}>✕ Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ── TAB 2: PATIENT SEARCH & DIRECTORY ── */}
        {activeTab === 'directory' && (
          <View>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWrap}>
                <Text style={styles.sectionTitle}>Patient Master Directory</Text>
                <Text style={styles.sectionSub}>Lookup registered files & book return visits</Text>
              </View>
            </View>

            {/* Search Input */}
            <View style={styles.searchBox}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Type name, phone number or MRN (min 2 chars)..."
                value={searchQuery}
                onChangeText={handleSearchDirectory}
                placeholderTextColor="#94a3b8"
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.clearSearchText}>✕</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {searching ? (
              <ActivityIndicator size="small" color="#059669" style={{ marginTop: 12 }} />
            ) : searchResults.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>👥</Text>
                <Text style={styles.emptyTitle}>Search Patient Files</Text>
                <Text style={styles.emptySub}>Enter patient name or mobile number above to search existing records.</Text>
              </View>
            ) : (
              searchResults.map(p => (
                <View key={p._id} style={styles.apptCard}>
                  <Text style={styles.patientName}>{p.name}</Text>
                  <Text style={styles.patientSub}>MRN: {p.patientId || 'MRN-RECORD'}</Text>
                  <Text style={styles.patientSub}>Phone: {p.phone} • Gender: {p.gender || 'Female'}</Text>
                  {p.doctorName ? (
                    <Text style={styles.doctorSub}>Assigned Doctor: Dr. {p.doctorName}</Text>
                  ) : null}

                  <View style={styles.cardActionRow}>
                    <TouchableOpacity
                      style={[styles.primaryActionBtn, { backgroundColor: '#0284c7' }]}
                      onPress={() => handleOpenBookForPatient(p)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.primaryActionBtnText}>📅 Book Doctor Appointment</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

      </ScrollView>

      {/* ── 1. WALK-IN REGISTRATION MODAL ── */}
      <Modal visible={showRegisterModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Walk-in Patient Intake</Text>
                <Text style={styles.modalSub}>Fast patient registration & appointment creation</Text>
              </View>
              <TouchableOpacity onPress={() => setShowRegisterModal(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.formLabel}>Full Name *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. Ramesh Sharma"
                value={regForm.name}
                onChangeText={val => setRegForm(prev => ({ ...prev, name: val }))}
                placeholderTextColor="#94a3b8"
              />

              <Text style={styles.formLabel}>Mobile Number *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. 9876543210"
                keyboardType="phone-pad"
                value={regForm.phone}
                onChangeText={val => setRegForm(prev => ({ ...prev, phone: val }))}
                placeholderTextColor="#94a3b8"
              />

              <Text style={styles.formLabel}>Email (Optional)</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. patient@example.com"
                keyboardType="email-address"
                value={regForm.email}
                onChangeText={val => setRegForm(prev => ({ ...prev, email: val }))}
                placeholderTextColor="#94a3b8"
              />

              <Text style={styles.formLabel}>Gender</Text>
              <View style={styles.genderRow}>
                {['Female', 'Male', 'Other'].map(g => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.genderChoice, regForm.gender === g && styles.genderChoiceActive]}
                    onPress={() => setRegForm(prev => ({ ...prev, gender: g }))}
                  >
                    <Text style={[styles.genderChoiceText, regForm.gender === g && styles.genderChoiceTextActive]}>
                      {g}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.formLabel}>Assign Consulting Doctor</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                {doctors.map(d => (
                  <TouchableOpacity
                    key={d._id}
                    style={[styles.docChip, regForm.doctorId === d._id && styles.docChipActive]}
                    onPress={() => setRegForm(prev => ({ ...prev, doctorId: d._id }))}
                  >
                    <Text style={[styles.docChipText, regForm.doctorId === d._id && styles.docChipTextActive]}>
                      Dr. {d.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.saveModalBtn, { backgroundColor: '#059669' }]}
                onPress={handleRegisterWalkIn}
                disabled={savingReg}
                activeOpacity={0.8}
              >
                {savingReg ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.saveModalBtnText}>Register Patient & Issue Token</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 2. BOOK APPOINTMENT MODAL ── */}
      <Modal visible={showBookModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Book Doctor Appointment</Text>
                <Text style={styles.modalSub}>{bookForm.patientName}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowBookModal(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.formLabel}>Select Doctor *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                {doctors.map(d => (
                  <TouchableOpacity
                    key={d._id}
                    style={[styles.docChip, bookForm.doctorId === d._id && styles.docChipActive]}
                    onPress={() => setBookForm(prev => ({ ...prev, doctorId: d._id }))}
                  >
                    <Text style={[styles.docChipText, bookForm.doctorId === d._id && styles.docChipTextActive]}>
                      Dr. {d.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Date (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={bookForm.date}
                    onChangeText={val => setBookForm(prev => ({ ...prev, date: val }))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Slot / Time</Text>
                  <TextInput
                    style={styles.formInput}
                    value={bookForm.time}
                    onChangeText={val => setBookForm(prev => ({ ...prev, time: val }))}
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Consultation Fee (₹)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={bookForm.amount}
                    keyboardType="numeric"
                    onChangeText={val => setBookForm(prev => ({ ...prev, amount: val }))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Payment Mode</Text>
                  <TextInput
                    style={styles.formInput}
                    value={bookForm.paymentMethod}
                    onChangeText={val => setBookForm(prev => ({ ...prev, paymentMethod: val }))}
                  />
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.saveModalBtn, { backgroundColor: '#0284c7' }]}
                onPress={handleSaveBooking}
                disabled={savingBook}
                activeOpacity={0.8}
              >
                {savingBook ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.saveModalBtnText}>Confirm Slot & Book Visit</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 3. RESCHEDULE MODAL ── */}
      <Modal visible={showRescheduleModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Reschedule Appointment</Text>
                <Text style={styles.modalSub}>{targetAppt?.patientName}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowRescheduleModal(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.formLabel}>New Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.formInput}
                value={reschedDate}
                onChangeText={setReschedDate}
              />

              <Text style={styles.formLabel}>New Time / Slot</Text>
              <TextInput
                style={styles.formInput}
                value={reschedTime}
                onChangeText={setReschedTime}
              />
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.saveModalBtn, { backgroundColor: '#059669' }]}
                onPress={handleSaveReschedule}
                disabled={savingResched}
                activeOpacity={0.8}
              >
                {savingResched ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.saveModalBtnText}>Confirm Reschedule</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── SLIDE-OVER SIDEBAR DRAWER ── */}
      <Modal visible={isSidebarOpen} animationType="fade" transparent>
        <View style={styles.drawerBackdrop}>
          <TouchableOpacity
            style={styles.drawerOverlay}
            activeOpacity={1}
            onPress={() => setIsSidebarOpen(false)}
          />
          <View style={styles.drawerPanel}>
            <View style={styles.drawerHeader}>
              <View style={styles.drawerBrandRow}>
                <View style={[styles.drawerLogoIcon, { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }]}>
                  <Text style={{ fontSize: 20 }}>📋</Text>
                </View>
                <View style={{ marginLeft: 10 }}>
                  <Text style={styles.drawerBrandTitle}>Medical HMS</Text>
                  <Text style={styles.drawerBrandSub}>Front Desk & Intake</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.drawerProfileCard}
                onPress={() => {
                  setIsSidebarOpen(false);
                  navigation?.navigate('Profile');
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.drawerAvatar, { backgroundColor: '#059669' }]}>
                  {user?.avatar && (user.avatar.startsWith('http') || user.avatar.startsWith('data:')) ? (
                    <Image source={{ uri: user.avatar }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                  ) : (
                    <Text style={styles.drawerAvatarText}>
                      {user?.avatar || (user?.name || 'R').charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.drawerProfileName}>{user?.name || 'Front Desk Staff'}</Text>
                  <Text style={styles.drawerProfileEmail}>{user?.email || 'reception@crm.com'}</Text>
                  <View style={[styles.drawerRoleBadge, { backgroundColor: '#ecfdf5' }]}>
                    <Text style={[styles.drawerRoleBadgeText, { color: '#059669' }]}>RECEPTION & INTAKE</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 16, color: '#059669' }}>⚙️</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.drawerNavList}
              contentContainerStyle={styles.drawerNavListContent}
              showsVerticalScrollIndicator={false}
              bounces={true}
            >
              <Text style={styles.drawerNavSectionTitle}>FRONT DESK WORKSPACE</Text>

              <TouchableOpacity
                style={[styles.drawerNavItem, activeTab === 'queue' && styles.drawerNavItemActive]}
                onPress={() => { setActiveTab('queue'); setIsSidebarOpen(false); }}
              >
                <Text style={styles.drawerNavIcon}>🎫</Text>
                <Text style={[styles.drawerNavText, activeTab === 'queue' && styles.drawerNavTextActive]}>
                  Queue & Appointments
                </Text>
                <View style={styles.drawerCounterBadge}>
                  <Text style={styles.drawerCounterText}>{todayAppts.length}</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.drawerNavItem, activeTab === 'directory' && styles.drawerNavItemActive]}
                onPress={() => { setActiveTab('directory'); setIsSidebarOpen(false); }}
              >
                <Text style={styles.drawerNavIcon}>🔍</Text>
                <Text style={[styles.drawerNavText, activeTab === 'directory' && styles.drawerNavTextActive]}>
                  Patient Directory
                </Text>
              </TouchableOpacity>

              <Text style={[styles.drawerNavSectionTitle, { marginTop: 24 }]}>DIRECT ACTIONS</Text>

              <TouchableOpacity
                style={styles.drawerActionItem}
                onPress={() => {
                  setIsSidebarOpen(false);
                  setShowRegisterModal(true);
                }}
              >
                <Text style={[styles.drawerActionIcon, { color: '#059669' }]}>➕</Text>
                <Text style={[styles.drawerActionText, { color: '#059669' }]}>Register Walk-in Patient</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.drawerActionItem, { marginTop: 10, borderWidth: 1, borderColor: '#a7f3d0', backgroundColor: '#ecfdf5', paddingVertical: 11 }]}
                onPress={() => {
                  setIsSidebarOpen(false);
                  navigation?.navigate('Profile');
                }}
              >
                <Text style={styles.drawerActionIcon}>👤</Text>
                <Text style={[styles.drawerActionText, { color: '#059669' }]}>Account Profile Settings</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.drawerFooter}>
              <TouchableOpacity style={styles.drawerSignOutBtn} onPress={logout} activeOpacity={0.8}>
                <Text style={styles.drawerSignOutText}>🚪 Sign Out of Portal</Text>
              </TouchableOpacity>
              <Text style={styles.drawerVersionText}>Medical HMS · Front Desk v2.4</Text>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 74,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  hamburgerBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  hamburgerLine: {
    width: 20,
    height: 2.5,
    backgroundColor: '#0f172a',
    borderRadius: 2,
    marginVertical: 2,
  },
  headerAdminCard: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerAdminAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  headerAdminAvatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  headerAdminInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  headerAdminNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  headerAdminName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.3,
  },
  headerRoleBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  headerRoleBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  headerAdminEmail: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  refreshBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  refreshBtnText: {
    fontSize: 20,
    color: '#059669',
    fontWeight: 'bold',
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
  },
  feedbackSuccess: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
    borderWidth: 1,
  },
  feedbackError: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
  },
  feedbackIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  feedbackText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  // ── HERO BANNER ──
  heroBanner: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  heroTitleGroup: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 3,
    fontWeight: '500',
  },
  heroActionBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 10,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  heroActionBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── 4 KPI STATS (Explicit 2-Column Rows) ──
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  statCard: {
    width: '48.5%',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 4,
    letterSpacing: 0.3,
  },
  statSubText: {
    fontSize: 10.5,
    color: '#94a3b8',
    marginTop: 2,
  },

  // ── QUICK NAV BUTTONS ──
  quickNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  quickNavBtn: {
    width: '48.5%',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  quickNavBtnText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '700',
    textAlign: 'center',
  },

  // ── SECTION HEADER ──
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 2,
  },
  sectionTitleWrap: {
    flex: 1,
    paddingRight: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  sectionSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  addBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    flexShrink: 0,
  },
  addBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '700',
  },

  // ── FILTER SCROLLER ──
  filterScroll: {
    marginBottom: 12,
  },
  filterScrollContent: {
    paddingRight: 16,
  },
  filterChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  filterChipTextActive: {
    color: '#ffffff',
  },

  // ── SEARCH BOX ──
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 14,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
  },
  clearSearchText: {
    fontSize: 14,
    color: '#94a3b8',
    paddingHorizontal: 6,
    fontWeight: 'bold',
  },
  apptCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  apptTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tokenBadge: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  tokenBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillPending: {
    backgroundColor: '#fffbeb',
  },
  statusPillTextPending: {
    fontSize: 10,
    fontWeight: '800',
    color: '#d97706',
  },
  statusPillCheckIn: {
    backgroundColor: '#eff6ff',
  },
  statusPillTextCheckIn: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0284c7',
  },
  patientName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  patientSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  doctorSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  feeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  feeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  payBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  payBadgePaid: {
    backgroundColor: '#ecfdf5',
  },
  payBadgeTextPaid: {
    fontSize: 9,
    fontWeight: '800',
    color: '#059669',
  },
  payBadgePending: {
    backgroundColor: '#fef2f2',
  },
  payBadgeTextPending: {
    fontSize: 9,
    fontWeight: '800',
    color: '#dc2626',
  },
  cardActionRow: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
  },
  primaryActionBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  primaryActionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  genderRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  genderChoice: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  genderChoiceActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  genderChoiceText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  genderChoiceTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  docChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginRight: 8,
  },
  docChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  docChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  docChipTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 10,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  emptySub: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalCloseText: {
    fontSize: 18,
    color: '#64748b',
    fontWeight: '700',
  },
  modalBody: {
    padding: 18,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  formInput: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0f172a',
    marginBottom: 14,
  },
  modalFooter: {
    paddingHorizontal: 18,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  saveModalBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveModalBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  drawerBackdrop: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  drawerOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  drawerPanel: {
    width: '84%',
    maxWidth: 330,
    height: '100%',
    backgroundColor: '#ffffff',
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 16,
  },
  drawerHeader: {
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  drawerBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  drawerLogoIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerBrandTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  drawerBrandSub: {
    fontSize: 11,
    color: '#64748b',
  },
  drawerProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  drawerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
  },
  drawerProfileName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  drawerProfileEmail: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  drawerRoleBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  drawerRoleBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  drawerNavList: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  drawerNavListContent: {
    paddingBottom: 80,
  },
  drawerNavSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 6,
  },
  drawerNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  drawerNavItemActive: {
    backgroundColor: '#ecfdf5',
  },
  drawerNavIcon: {
    fontSize: 16,
    marginRight: 12,
  },
  drawerNavText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
  },
  drawerNavTextActive: {
    color: '#059669',
    fontWeight: '800',
  },
  drawerCounterBadge: {
    backgroundColor: '#d1fae5',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  drawerCounterText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  drawerActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  drawerActionIcon: {
    fontSize: 14,
    marginRight: 10,
  },
  drawerActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  drawerFooter: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'android' ? 36 : 20,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  drawerSignOutBtn: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  drawerSignOutText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '700',
  },
  drawerVersionText: {
    textAlign: 'center',
    fontSize: 10,
    color: '#94a3b8',
  },
});
