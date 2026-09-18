// mobile/src/screens/patient/PatientDashboardScreen.js
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
  fetchPatientAppointments,
  bookPatientAppointment,
  fetchPatientOrders,
  fetchDoctorsPublic
} from '../../services/api';

export default function PatientDashboardScreen({ navigation }) {
  const { user, token, logout } = useAuth();

  // ── Navigation & Drawer State ──
  const [activeTab, setActiveTab] = useState('appointments'); // 'appointments' | 'prescriptions'
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);

  // ── Data State ──
  const [appointments, setAppointments] = useState([]);
  const [orders, setOrders] = useState([]);
  const [doctors, setDoctors] = useState([]);

  // ── Filter State ──
  const [filterMode, setFilterMode] = useState('ALL'); // 'ALL' | 'UPCOMING' | 'COMPLETED'
  const [searchQuery, setSearchQuery] = useState('');

  // ── Book Modal State ──
  const [showBookModal, setShowBookModal] = useState(false);
  const [bookForm, setBookForm] = useState({
    doctorId: '',
    appointmentDate: new Date().toISOString().split('T')[0],
    appointmentTime: '10:00 AM',
    notes: ''
  });
  const [savingBook, setSavingBook] = useState(false);

  // ── Feedback Toast Helper ──
  const showNotification = (type, text) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  // ── Loaders ──
  const loadAppointmentsData = useCallback(async () => {
    if (!token) return;
    const res = await fetchPatientAppointments(token);
    if (res.success) {
      setAppointments(res.appointments);
    }
  }, [token]);

  const loadOrdersData = useCallback(async () => {
    if (!token) return;
    const res = await fetchPatientOrders(token);
    if (res.success) {
      setOrders(res.orders);
    }
  }, [token]);

  const loadDoctorsData = useCallback(async () => {
    const res = await fetchDoctorsPublic(token);
    if (res.success) {
      setDoctors(res.doctors);
    }
  }, [token]);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadAppointmentsData(), loadOrdersData(), loadDoctorsData()]);
    setLoading(false);
  }, [loadAppointmentsData, loadOrdersData, loadDoctorsData]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadAppointmentsData(), loadOrdersData(), loadDoctorsData()]);
    setRefreshing(false);
  };

  // ── Book Appointment Action ──
  const handleOpenBookModal = () => {
    setBookForm({
      doctorId: doctors[0]?._id || '',
      appointmentDate: new Date().toISOString().split('T')[0],
      appointmentTime: '10:00 AM',
      notes: ''
    });
    setShowBookModal(true);
  };

  const handleSaveBooking = async () => {
    if (!bookForm.doctorId || !bookForm.appointmentDate) {
      Alert.alert('Validation', 'Please select a doctor and date.');
      return;
    }

    setSavingBook(true);
    const res = await bookPatientAppointment({
      doctorId: bookForm.doctorId,
      appointmentDate: bookForm.appointmentDate,
      appointmentTime: bookForm.appointmentTime,
      notes: bookForm.notes
    }, token);
    setSavingBook(false);

    if (res.success) {
      setShowBookModal(false);
      showNotification('success', 'Your appointment has been requested successfully!');
      loadAppointmentsData();
      setActiveTab('appointments');
    } else {
      Alert.alert('Booking Error', res.message || 'Failed to book appointment.');
    }
  };

  // ── Compute Stats ──
  const todayStr = new Date().toISOString().split('T')[0];
  const upcomingAppts = appointments.filter(a => {
    if (!a.appointmentDate) return false;
    const d = new Date(a.appointmentDate).toISOString().split('T')[0];
    return d >= todayStr && a.status !== 'completed' && a.status !== 'cancelled';
  });
  const completedAppts = appointments.filter(a => a.status === 'completed');

  // ── Filtered Appointments ──
  const filteredAppointments = appointments.filter(item => {
    const docName = (item.doctorName || '').toLowerCase();
    const query = searchQuery.trim().toLowerCase();
    const matchesQuery = !query || docName.includes(query);
    if (!matchesQuery) return false;

    if (filterMode === 'UPCOMING') {
      const d = item.appointmentDate ? new Date(item.appointmentDate).toISOString().split('T')[0] : '';
      return d >= todayStr && item.status !== 'completed' && item.status !== 'cancelled';
    }
    if (filterMode === 'COMPLETED') return item.status === 'completed';
    return true;
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* ── TOP HEADER (Big height + Patient Profile Card + Refresh) ── */}
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
            <View style={[styles.headerAdminAvatar, { backgroundColor: '#0284c7' }]}>
              {user?.avatar && (user.avatar.startsWith('http') || user.avatar.startsWith('data:')) ? (
                <Image source={{ uri: user.avatar }} style={{ width: 40, height: 40, borderRadius: 20 }} />
              ) : (
                <Text style={styles.headerAdminAvatarText}>
                  {user?.avatar || (user?.name || 'P').charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            <View style={styles.headerAdminInfo}>
              <View style={styles.headerAdminNameRow}>
                <Text style={styles.headerAdminName} numberOfLines={1}>
                  {user?.name || 'Patient User'}
                </Text>
                <View style={[styles.headerRoleBadge, { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }]}>
                  <Text style={[styles.headerRoleBadgeText, { color: '#0284c7' }]}>PATIENT</Text>
                </View>
              </View>
              <Text style={styles.headerAdminEmail} numberOfLines={1}>
                {user?.email || `MRN: ${user?.patientId || 'P-101'}`}
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
        {/* Digital Health Identity Card */}
        <View style={styles.idCard}>
          <View style={styles.idCardTop}>
            <Text style={styles.idCardHospital}>🏥 MEDICAL HMS HEALTH PASS</Text>
            <Text style={styles.idCardChip}>EMR VERIFIED</Text>
          </View>
          <Text style={styles.idPatientName}>{user?.name || 'Patient'}</Text>
          <View style={styles.idCardBottom}>
            <View>
              <Text style={styles.idLabel}>PATIENT ID / MRN</Text>
              <Text style={styles.idValue}>{user?.patientId || 'MRN-VERIFIED'}</Text>
            </View>
            <View>
              <Text style={styles.idLabel}>COVERAGE STATUS</Text>
              <Text style={styles.idValue}>Active Outpatient</Text>
            </View>
          </View>
        </View>

        {/* KPI CARDS */}
        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Upcoming</Text>
            <Text style={[styles.kpiValue, { color: '#0284c7' }]}>{upcomingAppts.length}</Text>
            <Text style={styles.kpiSub}>Scheduled Visits</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Prescriptions</Text>
            <Text style={[styles.kpiValue, { color: '#10b981' }]}>{orders.length}</Text>
            <Text style={styles.kpiSub}>Medical Orders</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Completed</Text>
            <Text style={[styles.kpiValue, { color: '#8b5cf6' }]}>{completedAppts.length}</Text>
            <Text style={styles.kpiSub}>Past Consultations</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Total Visits</Text>
            <Text style={[styles.kpiValue, { color: '#f59e0b' }]}>{appointments.length}</Text>
            <Text style={styles.kpiSub}>Health History</Text>
          </View>
        </View>

        {/* ── TAB 1: APPOINTMENTS ── */}
        {activeTab === 'appointments' && (
          <View>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>My Consultations</Text>
                <Text style={styles.sectionSub}>Upcoming appointments & consultation history</Text>
              </View>
              <TouchableOpacity
                style={styles.addBtn}
                onPress={handleOpenBookModal}
                activeOpacity={0.8}
              >
                <Text style={styles.addBtnText}>+ Book Doctor</Text>
              </TouchableOpacity>
            </View>

            {/* Filter Chips */}
            <View style={styles.filterChipRow}>
              {['ALL', 'UPCOMING', 'COMPLETED'].map(f => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterChip, filterMode === f && styles.filterChipActive]}
                  onPress={() => setFilterMode(f)}
                >
                  <Text style={[styles.filterChipText, filterMode === f && styles.filterChipTextActive]}>
                    {f === 'ALL' ? 'All Visits' : f === 'UPCOMING' ? 'Upcoming' : 'Completed'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Appointments List */}
            {loading ? (
              <ActivityIndicator size="large" color="#0284c7" style={{ marginTop: 24 }} />
            ) : filteredAppointments.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>📅</Text>
                <Text style={styles.emptyTitle}>No appointments found</Text>
                <Text style={styles.emptySub}>Tap "+ Book Doctor" to schedule your next consultation.</Text>
              </View>
            ) : (
              filteredAppointments.map(appt => {
                const isCompleted = appt.status === 'completed';
                const tokenStr = appt.tokenNumber ? `Token #${appt.tokenNumber}` : (appt.appointmentTime || '10:00 AM');

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

                    <Text style={styles.doctorName}>Dr. {appt.doctorName || 'Assigned Physician'}</Text>
                    <Text style={styles.apptDateText}>
                      📅 {appt.appointmentDate ? new Date(appt.appointmentDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Scheduled'}
                    </Text>

                    {appt.diagnosis ? (
                      <View style={styles.diagnosisBox}>
                        <Text style={styles.diagnosisLabel}>DIAGNOSIS & FINDINGS:</Text>
                        <Text style={styles.diagnosisValue}>{appt.diagnosis}</Text>
                      </View>
                    ) : null}

                    {appt.doctorNotes ? (
                      <Text style={styles.notesText}>
                        Doctor Advice: {appt.doctorNotes}
                      </Text>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ── TAB 2: PRESCRIPTIONS ── */}
        {activeTab === 'prescriptions' && (
          <View>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>My Prescriptions & Medicines</Text>
                <Text style={styles.sectionSub}>Prescribed drugs and dispensary orders</Text>
              </View>
            </View>

            {loading ? (
              <ActivityIndicator size="large" color="#0284c7" style={{ marginTop: 24 }} />
            ) : orders.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>💊</Text>
                <Text style={styles.emptyTitle}>No prescriptions on file</Text>
                <Text style={styles.emptySub}>Prescriptions issued by your consulting doctor will be stored here.</Text>
              </View>
            ) : (
              orders.map(order => (
                <View key={order._id} style={styles.apptCard}>
                  <View style={styles.apptTopRow}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748b' }}>
                      Date: {new Date(order.createdAt).toLocaleDateString()}
                    </Text>
                    <View style={[styles.statusPill, order.orderStatus === 'Completed' ? styles.statusPillCompleted : styles.statusPillPending]}>
                      <Text style={styles.statusPillText}>
                        {order.orderStatus === 'Completed' ? 'DISPENSED' : 'PENDING'}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.doctorName}>Doctor: {order.doctorId?.name || 'Hospital Doctor'}</Text>

                  <View style={styles.medsListBox}>
                    {(order.items || []).map((item, idx) => (
                      <View key={idx} style={styles.medItemRow}>
                        <Text style={styles.medItemName}>• {item.medicineName}</Text>
                        <Text style={styles.medItemDetail}>
                          {item.dosage || '1 tab'} ({item.frequency || '1-0-1'})
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))
            )}
          </View>
        )}

      </ScrollView>

      {/* ── BOOK APPOINTMENT MODAL ── */}
      <Modal visible={showBookModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Book Consultation</Text>
                <Text style={styles.modalSub}>Schedule appointment with hospital specialist</Text>
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
                  <Text style={styles.formLabel}>Date (YYYY-MM-DD) *</Text>
                  <TextInput
                    style={styles.formInput}
                    value={bookForm.appointmentDate}
                    onChangeText={val => setBookForm(prev => ({ ...prev, appointmentDate: val }))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Preferred Time</Text>
                  <TextInput
                    style={styles.formInput}
                    value={bookForm.appointmentTime}
                    onChangeText={val => setBookForm(prev => ({ ...prev, appointmentTime: val }))}
                  />
                </View>
              </View>

              <Text style={styles.formLabel}>Reason for Consultation / Symptoms</Text>
              <TextInput
                style={[styles.formInput, { height: 75, textAlignVertical: 'top' }]}
                placeholder="Briefly describe what symptoms you are experiencing..."
                value={bookForm.notes}
                onChangeText={val => setBookForm(prev => ({ ...prev, notes: val }))}
                multiline
                placeholderTextColor="#94a3b8"
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.saveModalBtn}
                onPress={handleSaveBooking}
                disabled={savingBook}
                activeOpacity={0.8}
              >
                {savingBook ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.saveModalBtnText}>Confirm Consultation Booking</Text>
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
                <View style={[styles.drawerLogoIcon, { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }]}>
                  <Text style={{ fontSize: 20 }}>🏥</Text>
                </View>
                <View style={{ marginLeft: 10 }}>
                  <Text style={styles.drawerBrandTitle}>Medical HMS</Text>
                  <Text style={styles.drawerBrandSub}>Patient Health Portal</Text>
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
                <View style={[styles.drawerAvatar, { backgroundColor: '#0284c7' }]}>
                  {user?.avatar && (user.avatar.startsWith('http') || user.avatar.startsWith('data:')) ? (
                    <Image source={{ uri: user.avatar }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                  ) : (
                    <Text style={styles.drawerAvatarText}>
                      {user?.avatar || (user?.name || 'P').charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.drawerProfileName}>{user?.name || 'Patient'}</Text>
                  <Text style={styles.drawerProfileEmail}>{user?.email || 'patient@crm.com'}</Text>
                  <View style={[styles.drawerRoleBadge, { backgroundColor: '#f0f9ff' }]}>
                    <Text style={[styles.drawerRoleBadgeText, { color: '#0284c7' }]}>PATIENT PASS</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 16, color: '#0284c7' }}>⚙️</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.drawerNavList}
              contentContainerStyle={styles.drawerNavListContent}
              showsVerticalScrollIndicator={false}
              bounces={true}
            >
              <Text style={styles.drawerNavSectionTitle}>HEALTH SERVICES</Text>

              <TouchableOpacity
                style={[styles.drawerNavItem, activeTab === 'appointments' && styles.drawerNavItemActive]}
                onPress={() => { setActiveTab('appointments'); setIsSidebarOpen(false); }}
              >
                <Text style={styles.drawerNavIcon}>📅</Text>
                <Text style={[styles.drawerNavText, activeTab === 'appointments' && styles.drawerNavTextActive]}>
                  My Consultations
                </Text>
                <View style={styles.drawerCounterBadge}>
                  <Text style={styles.drawerCounterText}>{upcomingAppts.length}</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.drawerNavItem, activeTab === 'prescriptions' && styles.drawerNavItemActive]}
                onPress={() => { setActiveTab('prescriptions'); setIsSidebarOpen(false); }}
              >
                <Text style={styles.drawerNavIcon}>💊</Text>
                <Text style={[styles.drawerNavText, activeTab === 'prescriptions' && styles.drawerNavTextActive]}>
                  Prescriptions & Orders
                </Text>
                <View style={styles.drawerCounterBadge}>
                  <Text style={styles.drawerCounterText}>{orders.length}</Text>
                </View>
              </TouchableOpacity>

              <Text style={[styles.drawerNavSectionTitle, { marginTop: 24 }]}>DIRECT ACTIONS</Text>

              <TouchableOpacity
                style={styles.drawerActionItem}
                onPress={() => {
                  setIsSidebarOpen(false);
                  handleOpenBookModal();
                }}
              >
                <Text style={[styles.drawerActionIcon, { color: '#0284c7' }]}>➕</Text>
                <Text style={[styles.drawerActionText, { color: '#0284c7' }]}>Book Doctor Visit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.drawerActionItem, { marginTop: 10, borderWidth: 1, borderColor: '#bae6fd', backgroundColor: '#f0f9ff', paddingVertical: 11 }]}
                onPress={() => {
                  setIsSidebarOpen(false);
                  navigation?.navigate('Profile');
                }}
              >
                <Text style={styles.drawerActionIcon}>👤</Text>
                <Text style={[styles.drawerActionText, { color: '#0284c7' }]}>Account Profile Settings</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.drawerFooter}>
              <TouchableOpacity style={styles.drawerSignOutBtn} onPress={logout} activeOpacity={0.8}>
                <Text style={styles.drawerSignOutText}>🚪 Sign Out of Portal</Text>
              </TouchableOpacity>
              <Text style={styles.drawerVersionText}>Medical HMS · Patient Care v2.4</Text>
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
  idCard: {
    backgroundColor: '#0284c7',
    borderRadius: 18,
    padding: 18,
    marginBottom: 20,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  idCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  idCardHospital: {
    fontSize: 11,
    fontWeight: '800',
    color: '#e0f2fe',
    letterSpacing: 0.5,
  },
  idCardChip: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 9,
    fontWeight: '800',
    color: '#0284c7',
  },
  idPatientName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 12,
  },
  idCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
    paddingTop: 8,
  },
  idLabel: {
    fontSize: 9,
    color: '#bae6fd',
    fontWeight: '700',
  },
  idValue: {
    fontSize: 13,
    color: '#ffffff',
    fontWeight: '700',
    marginTop: 2,
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
  addBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
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
  },
  statusPillTextPending: {
    fontSize: 10,
    fontWeight: '800',
    color: '#d97706',
  },
  statusPillCompleted: {
    backgroundColor: '#ecfdf5',
  },
  statusPillTextCompleted: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  doctorName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  apptDateText: {
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
  notesText: {
    fontSize: 12,
    color: '#334155',
    marginTop: 6,
    lineHeight: 18,
  },
  medsListBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
  },
  medItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 3,
  },
  medItemName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  medItemDetail: {
    fontSize: 12,
    color: '#64748b',
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
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
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
