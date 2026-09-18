// mobile/src/screens/doctor/DoctorDashboardScreen.js
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
  fetchDoctorAppointments,
  updateDoctorPrescription,
  fetchDoctorPatients,
  startDoctorSession
} from '../../services/api';

export default function DoctorDashboardScreen({ navigation }) {
  const { user, token, logout } = useAuth();

  // ── Navigation & Drawer State ──
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'patients'
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);

  // ── Data State ──
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);

  // ── Filter State ──
  const [queueFilter, setQueueFilter] = useState('ALL'); // 'ALL' | 'PENDING' | 'COMPLETED'
  const [searchQuery, setSearchQuery] = useState('');

  // ── Consultation Modal State ──
  const [showConsultModal, setShowConsultModal] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState(null);
  const [diagnosis, setDiagnosis] = useState('');
  const [doctorNotes, setDoctorNotes] = useState('');
  const [labTests, setLabTests] = useState('');
  const [dietPlan, setDietPlan] = useState('');
  const [medicines, setMedicines] = useState([
    { medicineName: '', dosage: '1 tablet', frequency: '1-0-1', duration: '5 days' }
  ]);
  const [markCompleted, setMarkCompleted] = useState(true);
  const [savingConsult, setSavingConsult] = useState(false);

  // ── Feedback Toast Helper ──
  const showNotification = (type, text) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  // ── Load Appointments ──
  const loadAppointmentsData = useCallback(async () => {
    if (!token) return;
    const res = await fetchDoctorAppointments(token, { all: 'true' });
    if (res.success) {
      setAppointments(res.appointments);
    }
  }, [token]);

  // ── Load Patients ──
  const loadPatientsData = useCallback(async () => {
    if (!token) return;
    const res = await fetchDoctorPatients(token);
    if (res.success) {
      setPatients(res.patients);
    }
  }, [token]);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadAppointmentsData(), loadPatientsData()]);
    setLoading(false);
  }, [loadAppointmentsData, loadPatientsData]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadAppointmentsData(), loadPatientsData()]);
    setRefreshing(false);
  };

  // ── Open Consultation Modal ──
  const handleOpenConsult = (appt) => {
    setSelectedAppt(appt);
    setDiagnosis(appt.diagnosis || '');
    setDoctorNotes(appt.doctorNotes || '');
    setLabTests(Array.isArray(appt.labTests) ? appt.labTests.join(', ') : (appt.labTests || ''));
    setDietPlan(Array.isArray(appt.dietPlan) ? appt.dietPlan.join(', ') : (appt.dietPlan || ''));
    
    if (appt.pharmacy && appt.pharmacy.length > 0) {
      setMedicines(appt.pharmacy.map(p => ({
        medicineName: p.medicineName || p.name || '',
        dosage: p.dosage || '1 tablet',
        frequency: p.frequency || '1-0-1',
        duration: p.duration || '5 days'
      })));
    } else {
      setMedicines([{ medicineName: '', dosage: '1 tablet', frequency: '1-0-1', duration: '5 days' }]);
    }
    setMarkCompleted(appt.status !== 'completed');
    setShowConsultModal(true);
  };

  // ── Add/Remove Medicine Row ──
  const handleAddMedicineRow = () => {
    setMedicines(prev => [...prev, { medicineName: '', dosage: '1 tablet', frequency: '1-0-1', duration: '5 days' }]);
  };

  const handleRemoveMedicineRow = (index) => {
    if (medicines.length === 1) return;
    setMedicines(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateMedicine = (index, field, value) => {
    setMedicines(prev => {
      const updated = [...prev];
      updated[index][field] = value;
      return updated;
    });
  };

  // ── Submit Consultation / Prescription ──
  const handleSaveConsultation = async () => {
    if (!diagnosis.trim()) {
      Alert.alert('Validation', 'Please enter a clinical diagnosis or observation.');
      return;
    }

    setSavingConsult(true);
    const validMedicines = medicines.filter(m => m.medicineName && m.medicineName.trim());
    const labTestArray = labTests.split(',').map(s => s.trim()).filter(Boolean);

    const payload = {
      diagnosis: diagnosis.trim(),
      notes: doctorNotes.trim(),
      labTests: labTestArray,
      dietPlan: dietPlan.trim() ? [dietPlan.trim()] : [],
      pharmacy: validMedicines,
      status: markCompleted ? 'completed' : selectedAppt.status
    };

    const res = await updateDoctorPrescription(selectedAppt._id, payload, token);
    setSavingConsult(false);

    if (res.success) {
      setShowConsultModal(false);
      showNotification('success', `Consultation recorded for ${selectedAppt.patientName || selectedAppt.userId?.name || 'patient'}.`);
      loadAppointmentsData();
    } else {
      Alert.alert('Error', res.message || 'Failed to save consultation.');
    }
  };

  // ── Start Fast Session from Patient List ──
  const handleStartSession = async (patient) => {
    Alert.alert(
      'Start Consultation Session',
      `Initiate immediate consultation visit for ${patient.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start',
          onPress: async () => {
            const res = await startDoctorSession(patient._id, token);
            if (res.success && res.appointment) {
              showNotification('success', `Session started for ${patient.name}`);
              await loadAppointmentsData();
              handleOpenConsult(res.appointment);
            } else {
              Alert.alert('Error', res.message || 'Failed to initiate session.');
            }
          }
        }
      ]
    );
  };

  // ── Compute Stats & Counts ──
  const todayStr = new Date().toISOString().split('T')[0];
  const todayAppointments = appointments.filter(a => {
    if (!a.appointmentDate) return false;
    return new Date(a.appointmentDate).toISOString().split('T')[0] === todayStr;
  });
  const pendingCount = appointments.filter(a => a.status !== 'completed' && a.status !== 'cancelled').length;
  const completedCount = appointments.filter(a => a.status === 'completed').length;
  const totalPatients = patients.length;

  // ── Filtered Appointments ──
  const filteredAppointments = appointments.filter(item => {
    const pName = (item.patientName || item.userId?.name || '').toLowerCase();
    const pId = (item.patientId || item.userId?.patientId || '').toLowerCase();
    const tokenStr = String(item.tokenNumber || '').toLowerCase();
    const query = searchQuery.trim().toLowerCase();

    const matchesQuery = !query || pName.includes(query) || pId.includes(query) || tokenStr.includes(query);
    if (!matchesQuery) return false;

    if (queueFilter === 'PENDING') return item.status !== 'completed' && item.status !== 'cancelled';
    if (queueFilter === 'COMPLETED') return item.status === 'completed';
    return true;
  });

  // ── Filtered Patients ──
  const filteredPatients = patients.filter(item => {
    const pName = (item.name || '').toLowerCase();
    const pId = (item.patientId || '').toLowerCase();
    const phone = (item.phone || '');
    const query = searchQuery.trim().toLowerCase();
    return !query || pName.includes(query) || pId.includes(query) || phone.includes(query);
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* ── TOP HEADER (Big height + Doctor Profile Card + Refresh) ── */}
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
            <View style={styles.headerAdminAvatar}>
              {user?.avatar && (user.avatar.startsWith('http') || user.avatar.startsWith('data:')) ? (
                <Image source={{ uri: user.avatar }} style={{ width: 40, height: 40, borderRadius: 20 }} />
              ) : (
                <Text style={styles.headerAdminAvatarText}>
                  {user?.avatar || (user?.name || 'D').charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            <View style={styles.headerAdminInfo}>
              <View style={styles.headerAdminNameRow}>
                <Text style={styles.headerAdminName} numberOfLines={1}>
                  Dr. {user?.name || 'Physician'}
                </Text>
                <View style={styles.headerRoleBadge}>
                  <Text style={styles.headerRoleBadgeText}>DOCTOR</Text>
                </View>
              </View>
              <Text style={styles.headerAdminEmail} numberOfLines={1}>
                {user?.email || 'doctor@crm.com'}
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0284c7']} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* KPI CARDS */}
        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>In Queue</Text>
            <Text style={[styles.kpiValue, { color: '#0284c7' }]}>{pendingCount}</Text>
            <Text style={styles.kpiSub}>Awaiting visit</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Today's OPD</Text>
            <Text style={[styles.kpiValue, { color: '#10b981' }]}>{todayAppointments.length}</Text>
            <Text style={styles.kpiSub}>Scheduled</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Completed</Text>
            <Text style={[styles.kpiValue, { color: '#8b5cf6' }]}>{completedCount}</Text>
            <Text style={styles.kpiSub}>Consulted</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>My Patients</Text>
            <Text style={[styles.kpiValue, { color: '#f59e0b' }]}>{totalPatients}</Text>
            <Text style={styles.kpiSub}>Registered</Text>
          </View>
        </View>

        {/* ── TAB 1: CONSULTATION QUEUE ── */}
        {activeTab === 'queue' && (
          <View>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>Consultation Queue</Text>
                <Text style={styles.sectionSub}>Triage, electronic diagnosis & e-prescriptions</Text>
              </View>
            </View>

            {/* Filter Chips */}
            <View style={styles.filterChipRow}>
              {['ALL', 'PENDING', 'COMPLETED'].map(f => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterChip, queueFilter === f && styles.filterChipActive]}
                  onPress={() => setQueueFilter(f)}
                >
                  <Text style={[styles.filterChipText, queueFilter === f && styles.filterChipTextActive]}>
                    {f === 'ALL' ? 'All Records' : f === 'PENDING' ? 'Waiting / Active' : 'Completed'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Search Input */}
            <View style={styles.searchBox}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search by patient name, MRN, or token..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor="#94a3b8"
              />
            </View>

            {/* Appointment Cards List */}
            {loading ? (
              <ActivityIndicator size="large" color="#0284c7" style={{ marginTop: 24 }} />
            ) : filteredAppointments.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>🩺</Text>
                <Text style={styles.emptyTitle}>No appointments in queue</Text>
                <Text style={styles.emptySub}>All scheduled patient appointments will show here.</Text>
              </View>
            ) : (
              filteredAppointments.map(appt => {
                const isCompleted = appt.status === 'completed';
                const pName = appt.patientName || appt.userId?.name || 'Patient';
                const pId = appt.patientId || appt.userId?.patientId || 'MRN-PENDING';
                const tokenStr = appt.tokenNumber ? `Token #${appt.tokenNumber}` : (appt.appointmentTime || 'Scheduled');

                return (
                  <View key={appt._id} style={styles.apptCard}>
                    <View style={styles.apptTopRow}>
                      <View style={styles.tokenBadge}>
                        <Text style={styles.tokenBadgeText}>{tokenStr}</Text>
                      </View>
                      <View style={[styles.statusPill, isCompleted ? styles.statusPillCompleted : styles.statusPillPending]}>
                        <Text style={[styles.statusPillText, isCompleted ? styles.statusPillTextCompleted : styles.statusPillTextPending]}>
                          {String(appt.status || 'PENDING').toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.patientCardName}>{pName}</Text>
                    <Text style={styles.patientCardSub}>ID: {pId} • Phone: {appt.patientPhone || appt.userId?.phone || 'N/A'}</Text>

                    {appt.diagnosis ? (
                      <View style={styles.diagnosisBox}>
                        <Text style={styles.diagnosisLabel}>DIAGNOSIS:</Text>
                        <Text style={styles.diagnosisValue}>{appt.diagnosis}</Text>
                      </View>
                    ) : null}

                    {appt.pharmacy && appt.pharmacy.length > 0 ? (
                      <Text style={styles.rxSummaryText}>
                        💊 {appt.pharmacy.length} Prescribed Medicine(s)
                      </Text>
                    ) : null}

                    <View style={styles.cardActionRow}>
                      <TouchableOpacity
                        style={[styles.primaryActionBtn, isCompleted && styles.viewRxBtn]}
                        onPress={() => handleOpenConsult(appt)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.primaryActionBtnText, isCompleted && styles.viewRxBtnText]}>
                          {isCompleted ? 'View / Edit Prescription' : '🩺 Consult & Prescribe'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ── TAB 2: MY PATIENTS ── */}
        {activeTab === 'patients' && (
          <View>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>My Patient Directory</Text>
                <Text style={styles.sectionSub}>Unique patient files and medical timeline</Text>
              </View>
            </View>

            {/* Search Input */}
            <View style={styles.searchBox}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search patient directory..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor="#94a3b8"
              />
            </View>

            {loading ? (
              <ActivityIndicator size="large" color="#0284c7" style={{ marginTop: 24 }} />
            ) : filteredPatients.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>👥</Text>
                <Text style={styles.emptyTitle}>No patients found</Text>
                <Text style={styles.emptySub}>Patients who consult with you will automatically appear here.</Text>
              </View>
            ) : (
              filteredPatients.map(patient => (
                <View key={patient._id} style={styles.apptCard}>
                  <View style={styles.patientRow}>
                    <View style={styles.patientAvatar}>
                      <Text style={styles.patientAvatarText}>{(patient.name || 'P').charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.patientCardName}>{patient.name}</Text>
                      <Text style={styles.patientCardSub}>MRN: {patient.patientId || 'MRN-NEW'}</Text>
                      <Text style={styles.patientCardSub}>Phone: {patient.phone || 'N/A'}</Text>
                      {patient.lastVisit ? (
                        <Text style={styles.lastVisitText}>
                          Last Visit: {new Date(patient.lastVisit).toLocaleDateString()}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.cardActionRow}>
                    <TouchableOpacity
                      style={styles.primaryActionBtn}
                      onPress={() => handleStartSession(patient)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.primaryActionBtnText}>➕ Start Consultation Visit</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

      </ScrollView>

      {/* ── CONSULTATION & PRESCRIPTION MODAL ── */}
      <Modal visible={showConsultModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Clinical Consultation</Text>
                <Text style={styles.modalSub}>
                  {selectedAppt?.patientName || selectedAppt?.userId?.name || 'Patient'} • {selectedAppt?.patientId || 'MRN'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowConsultModal(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              {/* Diagnosis Input */}
              <Text style={styles.formLabel}>Clinical Diagnosis *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. Acute Pharyngitis, Type 2 Diabetes..."
                value={diagnosis}
                onChangeText={setDiagnosis}
                placeholderTextColor="#94a3b8"
              />

              {/* Doctor Clinical Notes */}
              <Text style={styles.formLabel}>Clinical Notes & Symptoms</Text>
              <TextInput
                style={[styles.formInput, { height: 75, textAlignVertical: 'top' }]}
                placeholder="Chief complaints, examination findings..."
                value={doctorNotes}
                onChangeText={setDoctorNotes}
                multiline
                placeholderTextColor="#94a3b8"
              />

              {/* Diagnostic Lab Tests */}
              <Text style={styles.formLabel}>Diagnostic Lab Requisitions</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. Complete Blood Count (CBC), Fasting Glucose..."
                value={labTests}
                onChangeText={setLabTests}
                placeholderTextColor="#94a3b8"
              />

              {/* Medicines Prescription */}
              <View style={styles.medsHeaderRow}>
                <Text style={styles.formLabel}>Prescribed Medication (Rx)</Text>
                <TouchableOpacity onPress={handleAddMedicineRow}>
                  <Text style={styles.addMedText}>+ Add Medicine</Text>
                </TouchableOpacity>
              </View>

              {medicines.map((med, idx) => (
                <View key={idx} style={styles.medRowBox}>
                  <View style={styles.medRowTop}>
                    <Text style={styles.medNum}>#{idx + 1}</Text>
                    {medicines.length > 1 ? (
                      <TouchableOpacity onPress={() => handleRemoveMedicineRow(idx)}>
                        <Text style={styles.removeMedText}>Remove</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <TextInput
                    style={[styles.formInput, { marginBottom: 6 }]}
                    placeholder="Medicine Name (e.g. Paracetamol 650mg)"
                    value={med.medicineName}
                    onChangeText={val => handleUpdateMedicine(idx, 'medicineName', val)}
                    placeholderTextColor="#94a3b8"
                  />
                  <View style={styles.medDetailsGrid}>
                    <TextInput
                      style={[styles.formInput, { flex: 1 }]}
                      placeholder="Dosage (1 tab)"
                      value={med.dosage}
                      onChangeText={val => handleUpdateMedicine(idx, 'dosage', val)}
                      placeholderTextColor="#94a3b8"
                    />
                    <TextInput
                      style={[styles.formInput, { flex: 1 }]}
                      placeholder="Frequency (1-0-1)"
                      value={med.frequency}
                      onChangeText={val => handleUpdateMedicine(idx, 'frequency', val)}
                      placeholderTextColor="#94a3b8"
                    />
                    <TextInput
                      style={[styles.formInput, { flex: 1 }]}
                      placeholder="Duration (5 days)"
                      value={med.duration}
                      onChangeText={val => handleUpdateMedicine(idx, 'duration', val)}
                      placeholderTextColor="#94a3b8"
                    />
                  </View>
                </View>
              ))}

              {/* Diet / Lifestyle Advice */}
              <Text style={styles.formLabel}>Diet & Lifestyle Advice</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. Low sodium diet, hydrate well, rest 48h..."
                value={dietPlan}
                onChangeText={setDietPlan}
                placeholderTextColor="#94a3b8"
              />

              {/* Complete Visit Toggle */}
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setMarkCompleted(prev => !prev)}
                activeOpacity={0.8}
              >
                <View style={[styles.checkboxBox, markCompleted && styles.checkboxBoxActive]}>
                  {markCompleted ? <Text style={styles.checkboxCheck}>✓</Text> : null}
                </View>
                <Text style={styles.checkboxLabel}>Mark Consultation Completed</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.saveModalBtn}
                onPress={handleSaveConsultation}
                disabled={savingConsult}
                activeOpacity={0.8}
              >
                {savingConsult ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.saveModalBtnText}>Save & Finalize Consultation</Text>
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
                <View style={styles.drawerLogoIcon}>
                  <Text style={{ fontSize: 20 }}>🩺</Text>
                </View>
                <View style={{ marginLeft: 10 }}>
                  <Text style={styles.drawerBrandTitle}>Medical HMS</Text>
                  <Text style={styles.drawerBrandSub}>Doctor Clinical Portal</Text>
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
                <View style={styles.drawerAvatar}>
                  {user?.avatar && (user.avatar.startsWith('http') || user.avatar.startsWith('data:')) ? (
                    <Image source={{ uri: user.avatar }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                  ) : (
                    <Text style={styles.drawerAvatarText}>
                      {user?.avatar || (user?.name || 'D').charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.drawerProfileName}>Dr. {user?.name || 'Physician'}</Text>
                  <Text style={styles.drawerProfileEmail}>{user?.email || 'doctor@crm.com'}</Text>
                  <View style={styles.drawerRoleBadge}>
                    <Text style={styles.drawerRoleBadgeText}>DOCTOR / CLINICIAN</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 16, color: '#2563eb' }}>⚙️</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.drawerNavList}
              contentContainerStyle={styles.drawerNavListContent}
              showsVerticalScrollIndicator={false}
              bounces={true}
            >
              <Text style={styles.drawerNavSectionTitle}>CLINICAL WORKSPACE</Text>

              <TouchableOpacity
                style={[styles.drawerNavItem, activeTab === 'queue' && styles.drawerNavItemActive]}
                onPress={() => { setActiveTab('queue'); setIsSidebarOpen(false); }}
              >
                <Text style={styles.drawerNavIcon}>📋</Text>
                <Text style={[styles.drawerNavText, activeTab === 'queue' && styles.drawerNavTextActive]}>
                  Consultation Queue
                </Text>
                <View style={styles.drawerCounterBadge}>
                  <Text style={styles.drawerCounterText}>{pendingCount}</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.drawerNavItem, activeTab === 'patients' && styles.drawerNavItemActive]}
                onPress={() => { setActiveTab('patients'); setIsSidebarOpen(false); }}
              >
                <Text style={styles.drawerNavIcon}>👥</Text>
                <Text style={[styles.drawerNavText, activeTab === 'patients' && styles.drawerNavTextActive]}>
                  My Patients
                </Text>
                <View style={styles.drawerCounterBadge}>
                  <Text style={styles.drawerCounterText}>{totalPatients}</Text>
                </View>
              </TouchableOpacity>

              <Text style={[styles.drawerNavSectionTitle, { marginTop: 24 }]}>DIRECT ACTIONS</Text>

              <TouchableOpacity
                style={styles.drawerActionItem}
                onPress={() => {
                  setIsSidebarOpen(false);
                  setActiveTab('patients');
                }}
              >
                <Text style={styles.drawerActionIcon}>➕</Text>
                <Text style={styles.drawerActionText}>Start Consultation Session</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.drawerActionItem, { marginTop: 10, borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff', paddingVertical: 11 }]}
                onPress={() => {
                  setIsSidebarOpen(false);
                  navigation?.navigate('Profile');
                }}
              >
                <Text style={styles.drawerActionIcon}>👤</Text>
                <Text style={[styles.drawerActionText, { color: '#2563eb' }]}>Account Profile Settings</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.drawerFooter}>
              <TouchableOpacity style={styles.drawerSignOutBtn} onPress={logout} activeOpacity={0.8}>
                <Text style={styles.drawerSignOutText}>🚪 Sign Out of Portal</Text>
              </TouchableOpacity>
              <Text style={styles.drawerVersionText}>Medical HMS · Clinical v2.4</Text>
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
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    shadowColor: '#0284c7',
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
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  headerRoleBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#1d4ed8',
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
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  refreshBtnText: {
    fontSize: 20,
    color: '#0284c7',
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
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  kpiCard: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  kpiValue: {
    fontSize: 24,
    fontWeight: '800',
    marginVertical: 4,
  },
  kpiSub: {
    fontSize: 11,
    color: '#94a3b8',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  sectionSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  filterChipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterChipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
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
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  tokenBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0284c7',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillPending: {
    backgroundColor: '#fffbeb',
    borderColor: '#fef3c7',
    borderWidth: 1,
  },
  statusPillTextPending: {
    fontSize: 10,
    fontWeight: '800',
    color: '#d97706',
  },
  statusPillCompleted: {
    backgroundColor: '#ecfdf5',
    borderColor: '#bbf7d0',
    borderWidth: 1,
  },
  statusPillTextCompleted: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  patientCardName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  patientCardSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  diagnosisBox: {
    backgroundColor: '#f8fafc',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  diagnosisLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748b',
  },
  diagnosisValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 2,
  },
  rxSummaryText: {
    fontSize: 12,
    color: '#0284c7',
    fontWeight: '600',
    marginTop: 6,
  },
  cardActionRow: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
  },
  primaryActionBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  primaryActionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  viewRxBtn: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
    borderWidth: 1,
  },
  viewRxBtnText: {
    color: '#15803d',
  },
  patientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  patientAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  patientAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0284c7',
  },
  lastVisitText: {
    fontSize: 11,
    color: '#10b981',
    fontWeight: '600',
    marginTop: 2,
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
    maxHeight: '90%',
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
  medsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  addMedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284c7',
  },
  medRowBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  medRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  medNum: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
  },
  removeMedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ef4444',
  },
  medDetailsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxBoxActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  checkboxCheck: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  modalFooter: {
    paddingHorizontal: 18,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  saveModalBtn: {
    backgroundColor: '#0284c7',
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
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
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
    backgroundColor: '#0284c7',
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
    backgroundColor: '#eff6ff',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  drawerRoleBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#1d4ed8',
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
    letterSpacing: 0.8,
    marginBottom: 10,
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
    backgroundColor: '#f0f9ff',
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
    color: '#0284c7',
    fontWeight: '800',
  },
  drawerCounterBadge: {
    backgroundColor: '#e0f2fe',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  drawerCounterText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0369a1',
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
    color: '#0284c7',
  },
  drawerActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0284c7',
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
