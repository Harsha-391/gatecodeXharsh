// mobile/src/screens/lab/LabDashboardScreen.js
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
  fetchLabStats,
  fetchLabRequests,
  collectLabSample,
  updateLabStatus,
  createManualLabTest,
  cancelLabRequest,
  fetchDoctorsPublic
} from '../../services/api';

export default function LabDashboardScreen({ navigation }) {
  const { user, token, logout } = useAuth();

  // ── Navigation & Drawer State ──
  // 'dashboard' | 'orders' | 'sample-collection' | 'processing' | 'reports'
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);

  // ── Scope State ('mine' | 'all') ──
  const [scope, setScope] = useState('mine');
  const [canViewAll, setCanViewAll] = useState(false);

  // ── Data State ──
  const [stats, setStats] = useState({});
  const [requests, setRequests] = useState([]);
  const [doctorsList, setDoctorsList] = useState([]);

  // ── Filter State ──
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // ── Modals State ──
  // 1. Collect Sample Modal
  const [showCollectModal, setShowCollectModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [sampleType, setSampleType] = useState('Blood (EDTA)');
  const [collectionNotes, setCollectionNotes] = useState('');
  const [tubeBarcode, setTubeBarcode] = useState('');
  const [savingCollection, setSavingCollection] = useState(false);

  // 2. Status Advance / Result Modal
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [targetStatus, setTargetStatus] = useState('In Testing');
  const [statusNotes, setStatusNotes] = useState('');
  const [resultValues, setResultValues] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  // 3. New Walk-in Test Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    patientId: '',
    testNames: 'Complete Blood Count (CBC)',
    amount: '450',
    paymentStatus: 'PAID',
    paymentMode: 'Cash',
    notes: '',
    doctorId: ''
  });
  const [savingCreate, setSavingCreate] = useState(false);

  // ── Feedback Toast Helper ──
  const showNotification = (type, text) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  // ── Loaders ──
  const loadStatsData = useCallback(async (currentScope = scope) => {
    if (!token) return;
    const res = await fetchLabStats(token, currentScope);
    if (res.success) {
      setStats(res.stats || {});
      if (res.canViewAll !== undefined) setCanViewAll(res.canViewAll);
    }
  }, [token, scope]);

  const loadRequestsData = useCallback(async (currentScope = scope) => {
    if (!token) return;
    const res = await fetchLabRequests(token, { scope: currentScope });
    if (res.success) {
      setRequests(res.requests || []);
      if (res.canViewAll !== undefined) setCanViewAll(res.canViewAll);
    }
  }, [token, scope]);

  const loadDoctorsData = useCallback(async () => {
    if (!token) return;
    const res = await fetchDoctorsPublic(token);
    if (res.success && Array.isArray(res.doctors)) {
      setDoctorsList(res.doctors);
    }
  }, [token]);

  const loadAllData = useCallback(async (activeScope = scope) => {
    setLoading(true);
    await Promise.all([
      loadStatsData(activeScope),
      loadRequestsData(activeScope),
      loadDoctorsData()
    ]);
    setLoading(false);
  }, [loadStatsData, loadRequestsData, loadDoctorsData, scope]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAllData(scope);
    setRefreshing(false);
  };

  const handleScopeChange = (newScope) => {
    setScope(newScope);
    loadAllData(newScope);
  };

  // ── Collect Sample Action ──
  const handleOpenCollect = (report) => {
    setSelectedReport(report);
    setSampleType('Blood (EDTA)');
    setCollectionNotes('');
    setTubeBarcode(`TUBE-${Math.floor(100000 + Math.random() * 900000)}`);
    setShowCollectModal(true);
  };

  const handleSaveCollection = async () => {
    if (!sampleType) {
      Alert.alert('Validation', 'Please select a specimen type.');
      return;
    }
    setSavingCollection(true);
    const payload = {
      sampleType,
      collectionNotes: [tubeBarcode ? `Barcode: ${tubeBarcode}` : '', collectionNotes].filter(Boolean).join(' | '),
      collectionTime: new Date()
    };
    const res = await collectLabSample(selectedReport._id, payload, token);
    setSavingCollection(false);

    if (res.success) {
      setShowCollectModal(false);
      showNotification('success', `Sample collected for ${selectedReport.userId?.name || selectedReport.patientId}.`);
      loadAllData(scope);
    } else {
      Alert.alert('Error', res.message || 'Failed to record sample collection.');
    }
  };

  // ── Update Status Action ──
  const handleOpenStatus = (report, nextStatus) => {
    setSelectedReport(report);
    setTargetStatus(nextStatus);
    setStatusNotes('');
    setResultValues('');
    setShowStatusModal(true);
  };

  const handleSaveStatus = async () => {
    setSavingStatus(true);
    const combinedNotes = [resultValues ? `Findings: ${resultValues}` : '', statusNotes].filter(Boolean).join(' | ');
    const res = await updateLabStatus(selectedReport._id, targetStatus, combinedNotes, token);
    setSavingStatus(false);

    if (res.success) {
      setShowStatusModal(false);
      showNotification('success', `Test status advanced to "${targetStatus}".`);
      loadAllData(scope);
    } else {
      Alert.alert('Error', res.message || 'Failed to update test status.');
    }
  };

  // ── Cancel Test Action ──
  const handleCancelTest = (report) => {
    Alert.alert(
      'Cancel Lab Order',
      `Are you sure you want to cancel the test requisition for ${report.userId?.name || report.patientId}?`,
      [
        { text: 'Keep Active', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            const res = await cancelLabRequest(report._id, token);
            if (res.success) {
              showNotification('success', 'Lab test requisition cancelled.');
              loadAllData(scope);
            } else {
              Alert.alert('Error', res.message || 'Cancellation failed.');
            }
          }
        }
      ]
    );
  };

  // ── Create Walk-in Test Action ──
  const handleCreateWalkInTest = async () => {
    if (!createForm.patientId.trim() || !createForm.testNames.trim()) {
      Alert.alert('Validation', 'Patient ID/Name and Test names are required.');
      return;
    }

    setSavingCreate(true);
    const testsArray = createForm.testNames.split(',').map(t => t.trim()).filter(Boolean);
    const res = await createManualLabTest({
      patientId: createForm.patientId.trim(),
      testNames: JSON.stringify(testsArray),
      amount: createForm.amount || 0,
      paymentStatus: createForm.paymentStatus,
      paymentMode: createForm.paymentMode,
      notes: createForm.notes,
      doctorId: createForm.doctorId || (doctorsList[0]?._id || undefined)
    }, token);
    setSavingCreate(false);

    if (res.success) {
      setShowCreateModal(false);
      setCreateForm({
        patientId: '',
        testNames: 'Complete Blood Count (CBC)',
        amount: '450',
        paymentStatus: 'PAID',
        paymentMode: 'Cash',
        notes: '',
        doctorId: ''
      });
      showNotification('success', 'Walk-in lab test requisition registered!');
      loadAllData(scope);
      setActiveTab('orders');
    } else {
      Alert.alert('Error', res.message || 'Failed to create walk-in lab test.');
    }
  };

  // ── Filter Requests ──
  const getTabFilteredRequests = () => {
    if (activeTab === 'sample-collection') {
      return requests.filter(r => (r.status || 'Pending') === 'Pending');
    }
    if (activeTab === 'processing') {
      return requests.filter(r => r.status === 'Sample Collected' || r.status === 'In Testing');
    }
    if (activeTab === 'reports') {
      return requests.filter(r => r.status === 'Report Ready' || r.status === 'Completed');
    }
    // For 'orders' or 'dashboard'
    return requests;
  };

  const filteredRequests = getTabFilteredRequests().filter(item => {
    const pName = (item.userId?.name || item.patientId || '').toLowerCase();
    const pId = (item.patientId || item.userId?.patientId || '').toLowerCase();
    const testsStr = Array.isArray(item.testNames) ? item.testNames.join(' ').toLowerCase() : String(item.testNames || '').toLowerCase();
    const docName = (item.doctorId?.name || '').toLowerCase();
    const q = searchQuery.trim().toLowerCase();

    const matchesQuery = !q || pName.includes(q) || pId.includes(q) || testsStr.includes(q) || docName.includes(q);
    if (!matchesQuery) return false;

    if (activeTab === 'orders') {
      if (statusFilter === 'PENDING') return (item.status || 'Pending') === 'Pending';
      if (statusFilter === 'SAMPLE COLLECTED') return item.status === 'Sample Collected';
      if (statusFilter === 'IN TESTING') return item.status === 'In Testing';
      if (statusFilter === 'REPORT READY') return item.status === 'Report Ready';
      if (statusFilter === 'COMPLETED') return item.status === 'Completed';
      if (statusFilter === 'CANCELLED') return item.status === 'Cancelled';
    }

    return true;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'Pending': return { bg: '#fffbeb', border: '#fde68a', text: '#d97706', emoji: '🟡' };
      case 'Sample Collected': return { bg: '#eff6ff', border: '#bfdbfe', text: '#2563eb', emoji: '🧪' };
      case 'In Testing': return { bg: '#f5f3ff', border: '#ddd6fe', text: '#7c3aed', emoji: '🔬' };
      case 'Report Ready': return { bg: '#ecfeff', border: '#a5f3fc', text: '#0e7490', emoji: '📄' };
      case 'Completed': return { bg: '#f0fdf4', border: '#bbf7d0', text: '#16a34a', emoji: '✅' };
      case 'Cancelled': return { bg: '#fef2f2', border: '#fecaca', text: '#dc2626', emoji: '🔴' };
      default: return { bg: '#f8fafc', border: '#e2e8f0', text: '#64748b', emoji: '📋' };
    }
  };

  const renderOrderCard = (report) => {
    const currentStatus = report.status || 'Pending';
    const sColor = getStatusColor(currentStatus);
    const pName = report.userId?.name || report.patientId || 'Walk-in Patient';
    const pId = report.patientId || report.userId?.patientId || 'MRN-PENDING';
    const tests = Array.isArray(report.testNames) ? report.testNames : [report.testNames || 'General Diagnostic'];
    const docName = report.doctorId?.name ? `Dr. ${report.doctorId.name}` : 'Hospital Doctor';

    return (
      <View key={report._id} style={styles.orderCard}>
        {/* Card Header Row */}
        <View style={styles.orderHeaderRow}>
          <View style={styles.patientInfoGroup}>
            <View style={styles.patientAvatar}>
              <Text style={styles.patientAvatarText}>{pName.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.patientMeta}>
              <Text style={styles.patientNameText} numberOfLines={1}>{pName}</Text>
              <Text style={styles.patientIdText}>MRN: {pId}</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: sColor.bg, borderColor: sColor.border }]}>
            <Text style={[styles.statusBadgeText, { color: sColor.text }]}>
              {sColor.emoji} {currentStatus}
            </Text>
          </View>
        </View>

        {/* Doctor & Date Row */}
        <View style={styles.metaInfoRow}>
          <Text style={styles.metaDoctorText}>👨‍⚕️ {docName}</Text>
          {report.createdAt ? (
            <Text style={styles.metaDateText}>
              🕒 {new Date(report.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </Text>
          ) : null}
        </View>

        {/* Test Name Chips */}
        <View style={styles.testsChipContainer}>
          {tests.map((t, idx) => (
            <View key={idx} style={styles.testChip}>
              <Text style={styles.testChipText}>🔬 {t}</Text>
            </View>
          ))}
        </View>

        {/* Specimen / Notes Row */}
        {report.sampleType || report.notes ? (
          <View style={styles.specimenNotesRow}>
            {report.sampleType ? (
              <Text style={styles.specimenText}>🧪 Specimen: <Text style={styles.bold}>{report.sampleType}</Text></Text>
            ) : null}
            {report.notes ? (
              <Text style={styles.notesText} numberOfLines={2}>📝 {report.notes}</Text>
            ) : null}
          </View>
        ) : null}

        {/* Fee & Payment Status */}
        <View style={styles.priceRow}>
          <Text style={styles.feeLabel}>Fee: <Text style={styles.feeValue}>₹{report.amount || 500}</Text></Text>
          <View style={[styles.paymentBadge, { backgroundColor: report.paymentStatus === 'PAID' ? '#f0fdf4' : '#fffbeb' }]}>
            <Text style={[styles.paymentBadgeText, { color: report.paymentStatus === 'PAID' ? '#16a34a' : '#d97706' }]}>
              {report.paymentStatus === 'PAID' ? '● Paid' : '○ Payment Pending'}
            </Text>
          </View>
        </View>

        {/* Dynamic Action Buttons depending on Lifecycle */}
        <View style={styles.cardActionsRow}>
          {currentStatus === 'Pending' ? (
            <>
              <TouchableOpacity
                style={[styles.btnAction, styles.btnCollect]}
                onPress={() => handleOpenCollect(report)}
                activeOpacity={0.8}
              >
                <Text style={styles.btnActionTextWhite}>🧪 Collect Sample</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnAction, styles.btnCancel]}
                onPress={() => handleCancelTest(report)}
                activeOpacity={0.8}
              >
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : currentStatus === 'Sample Collected' ? (
            <TouchableOpacity
              style={[styles.btnAction, styles.btnTesting]}
              onPress={() => handleOpenStatus(report, 'In Testing')}
              activeOpacity={0.8}
            >
              <Text style={styles.btnActionTextWhite}>🔬 Start Testing</Text>
            </TouchableOpacity>
          ) : currentStatus === 'In Testing' ? (
            <TouchableOpacity
              style={[styles.btnAction, styles.btnReady]}
              onPress={() => handleOpenStatus(report, 'Report Ready')}
              activeOpacity={0.8}
            >
              <Text style={styles.btnActionTextWhite}>📄 Enter Results & Complete</Text>
            </TouchableOpacity>
          ) : currentStatus === 'Report Ready' ? (
            <TouchableOpacity
              style={[styles.btnAction, styles.btnCompleted]}
              onPress={() => handleOpenStatus(report, 'Completed')}
              activeOpacity={0.8}
            >
              <Text style={styles.btnActionTextWhite}>✅ Sign Off & Deliver</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.completedFlag}>
              <Text style={styles.completedFlagText}>✅ Test Completed & Uploaded</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* ── TOP HEADER (74px minHeight + Lab Profile Card + Refresh) ── */}
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
            <View style={[styles.headerAdminAvatar, { backgroundColor: '#0d9488' }]}>
              {user?.avatar && (user.avatar.startsWith('http') || user.avatar.startsWith('data:')) ? (
                <Image source={{ uri: user.avatar }} style={{ width: 40, height: 40, borderRadius: 20 }} />
              ) : (
                <Text style={styles.headerAdminAvatarText}>
                  {user?.avatar || (user?.name || 'L').charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            <View style={styles.headerAdminInfo}>
              <View style={styles.headerAdminNameRow}>
                <Text style={styles.headerAdminName} numberOfLines={1}>
                  {user?.name || 'lead lab'}
                </Text>
                <View style={[styles.headerRoleBadge, { backgroundColor: '#f0fdfa', borderColor: '#99f6e4' }]}>
                  <Text style={[styles.headerRoleBadgeText, { color: '#0d9488' }]}>LAB TECHNICIAN</Text>
                </View>
              </View>
              <Text style={styles.headerAdminEmail} numberOfLines={1}>
                {user?.email || 'lab@crm.com'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => loadAllData(scope)}
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

      {/* ── MAIN CONTENT SCROLLER ── */}
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0d9488']} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── DASHBOARD-ONLY OVERVIEW (Hero Banner, 6 KPI Cards, 4 Quick Navigation Buttons) ── */}
        {activeTab === 'dashboard' ? (
          <>
            {/* ── HERO BANNER (Exact Webapp Match) ── */}
            <View style={styles.heroBanner}>
              <View style={styles.heroHeaderRow}>
                <View style={styles.heroTitleGroup}>
                  <Text style={styles.heroTitle}>🔬 {stats.labName || user?.name || 'lead lab'} Dashboard</Text>
                  <Text style={styles.heroSubtitle}>
                    {scope === 'mine' ? '👤 My Workspace — showing only your assigned tests' : '🏥 All Tests — hospital-wide view'}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.heroActionBtn}
                  onPress={() => setShowCreateModal(true)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.heroActionBtnText}>+ Register Walk-in Test</Text>
                </TouchableOpacity>
              </View>

              {/* Scope Toggle (if user has permission) */}
              {canViewAll ? (
                <View style={styles.scopeToggleRow}>
                  <TouchableOpacity
                    style={[styles.scopeBtn, scope === 'mine' && styles.scopeBtnActive]}
                    onPress={() => handleScopeChange('mine')}
                  >
                    <Text style={[styles.scopeBtnText, scope === 'mine' && styles.scopeBtnTextActive]}>👤 My Tests</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.scopeBtn, scope === 'all' && styles.scopeBtnActive]}
                    onPress={() => handleScopeChange('all')}
                  >
                    <Text style={[styles.scopeBtnText, scope === 'all' && styles.scopeBtnTextActive]}>🏥 All Tests</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            {/* ── 6 KPI STATS IN 3 CLEAN ROWS (No Wrapping Glitches) ── */}
            <View style={styles.statsRow}>
              {/* 1. Total Orders */}
              <TouchableOpacity
                style={[styles.statCard, { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}
                onPress={() => { setActiveTab('orders'); setStatusFilter('ALL'); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.statNumber, { color: '#475569' }]}>{stats.totalOrders ?? stats.total ?? requests.length}</Text>
                <Text style={styles.statLabel}>TOTAL ORDERS</Text>
              </TouchableOpacity>

              {/* 2. Pending Samples */}
              <TouchableOpacity
                style={[styles.statCard, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}
                onPress={() => { setActiveTab('sample-collection'); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.statNumber, { color: '#d97706' }]}>{stats.pendingSamples ?? stats.pending ?? 0}</Text>
                <Text style={styles.statLabel}>🟡 PENDING SAMPLES</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.statsRow}>
              {/* 3. Collected Samples */}
              <TouchableOpacity
                style={[styles.statCard, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}
                onPress={() => { setActiveTab('processing'); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.statNumber, { color: '#2563eb' }]}>{stats.collectedSamples ?? 0}</Text>
                <Text style={styles.statLabel}>🧪 COLLECTED SAMPLES</Text>
              </TouchableOpacity>

              {/* 4. In Testing */}
              <TouchableOpacity
                style={[styles.statCard, { backgroundColor: '#f5f3ff', borderColor: '#ddd6fe' }]}
                onPress={() => { setActiveTab('processing'); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.statNumber, { color: '#7c3aed' }]}>{stats.inTesting ?? 0}</Text>
                <Text style={styles.statLabel}>🔬 IN TESTING</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.statsRow}>
              {/* 5. Reports Ready */}
              <TouchableOpacity
                style={[styles.statCard, { backgroundColor: '#ecfeff', borderColor: '#a5f3fc' }]}
                onPress={() => { setActiveTab('reports'); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.statNumber, { color: '#0e7490' }]}>{stats.reportsReady ?? stats.completed ?? 0}</Text>
                <Text style={styles.statLabel}>📄 REPORTS READY</Text>
              </TouchableOpacity>

              {/* 6. Est Revenue */}
              <View style={[styles.statCard, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
                <Text style={[styles.statNumber, { color: '#16a34a' }]}>₹{stats.revenue ?? 0}</Text>
                <Text style={styles.statLabel}>EST. REVENUE</Text>
              </View>
            </View>

            {/* ── 4 QUICK ACTION NAVIGATION BUTTONS IN 2 ROWS ── */}
            <View style={styles.quickNavRow}>
              <TouchableOpacity
                style={[styles.quickNavBtn, { backgroundColor: '#2563eb' }]}
                onPress={() => { setActiveTab('orders'); setStatusFilter('ALL'); }}
                activeOpacity={0.8}
              >
                <Text style={styles.quickNavBtnText}>📋 View Lab Orders</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickNavBtn, { backgroundColor: '#0d9488' }]}
                onPress={() => setActiveTab('sample-collection')}
                activeOpacity={0.8}
              >
                <Text style={styles.quickNavBtnText}>🧪 Sample Collection</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.quickNavRow}>
              <TouchableOpacity
                style={[styles.quickNavBtn, { backgroundColor: '#7c3aed' }]}
                onPress={() => setActiveTab('processing')}
                activeOpacity={0.8}
              >
                <Text style={styles.quickNavBtnText}>🔬 Test Processing</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickNavBtnOutline, { borderColor: '#0d9488' }]}
                onPress={() => setActiveTab('reports')}
                activeOpacity={0.8}
              >
                <Text style={[styles.quickNavBtnOutlineText, { color: '#0d9488' }]}>🗄️ Past Reports Archive</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          /* ── DEDICATED TAB TOP NAVIGATION / ACTIONS BAR (For non-dashboard tabs) ── */
          <View style={styles.tabTopBarContainer}>
            <View style={styles.tabTopBar}>
              <TouchableOpacity
                style={styles.tabBackToDashboardBtn}
                onPress={() => setActiveTab('dashboard')}
                activeOpacity={0.7}
              >
                <Text style={styles.tabBackToDashboardText}>← Back to Dashboard</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.tabRegisterBtn}
                onPress={() => setShowCreateModal(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.tabRegisterBtnText}>+ Walk-in Test</Text>
              </TouchableOpacity>
            </View>

            {/* Scope Toggle for Non-Dashboard Tabs (if user can view all) */}
            {canViewAll ? (
              <View style={[styles.scopeToggleRow, { marginTop: 4, marginBottom: 8 }]}>
                <TouchableOpacity
                  style={[styles.scopeBtn, scope === 'mine' && styles.scopeBtnActive]}
                  onPress={() => handleScopeChange('mine')}
                >
                  <Text style={[styles.scopeBtnText, scope === 'mine' && styles.scopeBtnTextActive]}>👤 My Tests</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.scopeBtn, scope === 'all' && styles.scopeBtnActive]}
                  onPress={() => handleScopeChange('all')}
                >
                  <Text style={[styles.scopeBtnText, scope === 'all' && styles.scopeBtnTextActive]}>🏥 All Tests</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        )}

        {/* ── SECTION HEADING & TABS ── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            {activeTab === 'dashboard' ? '📋 Recent Lab Orders' :
             activeTab === 'orders' ? '📋 Laboratory Orders Registry' :
             activeTab === 'sample-collection' ? '🧪 Specimen Collection Queue' :
             activeTab === 'processing' ? '🔬 Diagnostic Test Processing' :
             '🗄️ Completed Reports Archive'}
          </Text>
          <Text style={styles.sectionSub}>
            {activeTab === 'dashboard' ? 'Overview of assigned pathology and diagnostic requisitions' :
             activeTab === 'orders' ? 'Search and manage all hospital laboratory test requisitions' :
             activeTab === 'sample-collection' ? 'Pending patient specimens awaiting phlebotomy & collection' :
             activeTab === 'processing' ? 'Specimens in laboratory testing, biochemistry & analysis' :
             'Final signed test reports ready for doctor review and delivery'}
          </Text>
        </View>

        {/* Status Filter Chips (For Orders Tab) */}
        {activeTab === 'orders' ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            {['ALL', 'PENDING', 'SAMPLE COLLECTED', 'IN TESTING', 'REPORT READY', 'COMPLETED', 'CANCELLED'].map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.filterChip, statusFilter === f && styles.filterChipActive]}
                onPress={() => setStatusFilter(f)}
              >
                <Text style={[styles.filterChipText, statusFilter === f && styles.filterChipTextActive]}>
                  {f === 'ALL' ? 'All Orders' : f}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}

        {/* Search Box */}
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by patient name, MRN, doctor, or test names..."
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

        {/* ── ORDERS LISTING ── */}
        {loading ? (
          <ActivityIndicator size="large" color="#0d9488" style={{ marginVertical: 32 }} />
        ) : filteredRequests.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🧪</Text>
            <Text style={styles.emptyTitle}>No lab orders found</Text>
            <Text style={styles.emptySub}>
              {activeTab === 'sample-collection'
                ? 'No pending samples awaiting collection.'
                : activeTab === 'processing'
                ? 'No tests currently in specimen processing.'
                : 'No diagnostic requisitions match your criteria.'}
            </Text>
            <TouchableOpacity
              style={styles.emptyActionBtn}
              onPress={() => setShowCreateModal(true)}
            >
              <Text style={styles.emptyActionBtnText}>+ Register Walk-in Test</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {filteredRequests.map(report => renderOrderCard(report))}
            {activeTab === 'dashboard' && filteredRequests.length > 0 && (
              <TouchableOpacity
                style={styles.viewAllOrdersFullBtn}
                onPress={() => { setActiveTab('orders'); setStatusFilter('ALL'); }}
                activeOpacity={0.8}
              >
                <Text style={styles.viewAllOrdersFullBtnText}>View All Laboratory Orders Registry ({requests.length}) →</Text>
              </TouchableOpacity>
            )}
          </>
        )}

      </ScrollView>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── SIDEBAR DRAWER (Exact Webapp Navigation Structure) ─────────────── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Modal
        visible={isSidebarOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsSidebarOpen(false)}
      >
        <View style={styles.drawerBackdrop}>
          <TouchableOpacity
            style={styles.drawerOverlay}
            activeOpacity={1}
            onPress={() => setIsSidebarOpen(false)}
          />
          <View style={styles.drawerPanel}>
            {/* Drawer Header */}
            <View style={styles.drawerHeader}>
              <View style={styles.drawerBrandRow}>
                <View style={styles.drawerLogoCircle}>
                  <Text style={styles.drawerLogoEmoji}>🔬</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.drawerBrandTitle}>Medical HMS</Text>
                  <Text style={styles.drawerBrandSub}>Laboratory & Pathology</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setIsSidebarOpen(false)}
                  style={styles.drawerCloseBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.drawerCloseIcon}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Profile Summary in Drawer */}
              <TouchableOpacity
                style={styles.drawerProfileBox}
                onPress={() => {
                  setIsSidebarOpen(false);
                  navigation?.navigate('Profile');
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.drawerProfileAvatar, { backgroundColor: '#0d9488' }]}>
                  {user?.avatar && (user.avatar.startsWith('http') || user.avatar.startsWith('data:')) ? (
                    <Image source={{ uri: user.avatar }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                  ) : (
                    <Text style={styles.drawerProfileAvatarText}>
                      {user?.avatar || (user?.name || 'L').charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={styles.drawerProfileInfo}>
                  <Text style={styles.drawerProfileName}>{user?.name || 'lead lab'}</Text>
                  <Text style={styles.drawerProfileEmail}>{user?.email || 'lab@crm.com'}</Text>
                  <View style={[styles.drawerRoleBadge, { backgroundColor: '#f0fdfa', borderColor: '#99f6e4' }]}>
                    <Text style={[styles.drawerRoleBadgeText, { color: '#0d9488' }]}>LAB TECHNICIAN</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 16, color: '#0d9488' }}>⚙️</Text>
              </TouchableOpacity>
            </View>

            {/* Navigation Items (Exact Webapp Match) */}
            <ScrollView
              style={styles.drawerNavScroll}
              contentContainerStyle={styles.drawerNavScrollContent}
              showsVerticalScrollIndicator={false}
              bounces={true}
            >
              <Text style={styles.drawerSectionHeading}>LABORATORY WORKSPACE</Text>

              {/* 1. Dashboard */}
              <TouchableOpacity
                style={[styles.drawerNavItem, activeTab === 'dashboard' && styles.drawerNavItemActive]}
                onPress={() => { setActiveTab('dashboard'); setIsSidebarOpen(false); }}
              >
                <Text style={styles.drawerNavIcon}>🎛️</Text>
                <Text style={[styles.drawerNavLabel, activeTab === 'dashboard' && styles.drawerNavLabelActive]}>
                  Dashboard
                </Text>
              </TouchableOpacity>

              {/* 2. Lab Orders */}
              <TouchableOpacity
                style={[styles.drawerNavItem, activeTab === 'orders' && styles.drawerNavItemActive]}
                onPress={() => { setActiveTab('orders'); setStatusFilter('ALL'); setIsSidebarOpen(false); }}
              >
                <Text style={styles.drawerNavIcon}>📋</Text>
                <Text style={[styles.drawerNavLabel, activeTab === 'orders' && styles.drawerNavLabelActive]}>
                  Lab Orders
                </Text>
                <View style={styles.drawerCountBadge}>
                  <Text style={styles.drawerCountText}>{stats.totalOrders ?? stats.total ?? requests.length}</Text>
                </View>
              </TouchableOpacity>

              {/* 3. Sample Collection */}
              <TouchableOpacity
                style={[styles.drawerNavItem, activeTab === 'sample-collection' && styles.drawerNavItemActive]}
                onPress={() => { setActiveTab('sample-collection'); setIsSidebarOpen(false); }}
              >
                <Text style={styles.drawerNavIcon}>🧪</Text>
                <Text style={[styles.drawerNavLabel, activeTab === 'sample-collection' && styles.drawerNavLabelActive]}>
                  Sample Collection
                </Text>
                <View style={[styles.drawerCountBadge, { backgroundColor: '#fffbeb' }]}>
                  <Text style={[styles.drawerCountText, { color: '#d97706' }]}>{stats.pendingSamples ?? 0}</Text>
                </View>
              </TouchableOpacity>

              {/* 4. Test Processing */}
              <TouchableOpacity
                style={[styles.drawerNavItem, activeTab === 'processing' && styles.drawerNavItemActive]}
                onPress={() => { setActiveTab('processing'); setIsSidebarOpen(false); }}
              >
                <Text style={styles.drawerNavIcon}>🔬</Text>
                <Text style={[styles.drawerNavLabel, activeTab === 'processing' && styles.drawerNavLabelActive]}>
                  Test Processing
                </Text>
                <View style={[styles.drawerCountBadge, { backgroundColor: '#f5f3ff' }]}>
                  <Text style={[styles.drawerCountText, { color: '#7c3aed' }]}>{stats.inTesting ?? 0}</Text>
                </View>
              </TouchableOpacity>

              {/* 5. Reports Archive */}
              <TouchableOpacity
                style={[styles.drawerNavItem, activeTab === 'reports' && styles.drawerNavItemActive]}
                onPress={() => { setActiveTab('reports'); setIsSidebarOpen(false); }}
              >
                <Text style={styles.drawerNavIcon}>📄</Text>
                <Text style={[styles.drawerNavLabel, activeTab === 'reports' && styles.drawerNavLabelActive]}>
                  Reports Archive
                </Text>
                <View style={[styles.drawerCountBadge, { backgroundColor: '#ecfeff' }]}>
                  <Text style={[styles.drawerCountText, { color: '#0e7490' }]}>{stats.reportsReady ?? 0}</Text>
                </View>
              </TouchableOpacity>

              <Text style={[styles.drawerSectionHeading, { marginTop: 22 }]}>DIRECT ACTIONS</Text>

              <TouchableOpacity
                style={styles.drawerDirectActionBtn}
                onPress={() => { setIsSidebarOpen(false); setShowCreateModal(true); }}
              >
                <Text style={styles.drawerDirectActionIcon}>➕</Text>
                <Text style={styles.drawerDirectActionLabel}>Register Walk-in Test</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.drawerDirectActionBtn, { marginTop: 10, borderWidth: 1, borderColor: '#99f6e4', backgroundColor: '#f0fdfa', paddingVertical: 11 }]}
                onPress={() => {
                  setIsSidebarOpen(false);
                  navigation?.navigate('Profile');
                }}
              >
                <Text style={styles.drawerDirectActionIcon}>👤</Text>
                <Text style={[styles.drawerDirectActionLabel, { color: '#0d9488' }]}>Account Profile Settings</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Logout Button */}
            <View style={styles.drawerFooter}>
              <TouchableOpacity
                style={styles.drawerLogoutBtn}
                onPress={() => { setIsSidebarOpen(false); logout(); }}
                activeOpacity={0.8}
              >
                <Text style={styles.drawerLogoutText}>🚪 Sign Out of Portal</Text>
              </TouchableOpacity>
              <Text style={styles.drawerVersionText}>Medical HMS · Lab Tech v2.5</Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL 1: SPECIMEN COLLECTION ───────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Modal visible={showCollectModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🧪 Collect Specimen</Text>
              <TouchableOpacity onPress={() => setShowCollectModal(false)}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.modalSub}>
                Patient: <Text style={styles.bold}>{selectedReport?.userId?.name || selectedReport?.patientId}</Text>
              </Text>
              <Text style={styles.modalSub}>
                Tests: <Text style={styles.bold}>{Array.isArray(selectedReport?.testNames) ? selectedReport.testNames.join(', ') : selectedReport?.testNames}</Text>
              </Text>

              <Text style={styles.inputLabel}>Specimen Type *</Text>
              <View style={styles.specimenGrid}>
                {[
                  'Blood (EDTA)',
                  'Serum',
                  'Plasma',
                  'Urine (Routine)',
                  'Throat Swab',
                  'Biopsy Tissue',
                  'Sputum',
                  'Stool Specimen'
                ].map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.specimenChip, sampleType === type && styles.specimenChipActive]}
                    onPress={() => setSampleType(type)}
                  >
                    <Text style={[styles.specimenChipText, sampleType === type && styles.specimenChipTextActive]}>
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Tube Barcode / Sample ID</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. TUBE-982314"
                value={tubeBarcode}
                onChangeText={setTubeBarcode}
              />

              <Text style={styles.inputLabel}>Collection Notes</Text>
              <TextInput
                style={[styles.input, { height: 65 }]}
                placeholder="e.g. Fasting sample collected, patient comfortable"
                multiline
                value={collectionNotes}
                onChangeText={setCollectionNotes}
              />

              <TouchableOpacity
                style={[styles.submitBtn, savingCollection && styles.btnDisabled]}
                onPress={handleSaveCollection}
                disabled={savingCollection}
              >
                {savingCollection ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Confirm Sample Collection</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL 2: STATUS ADVANCE / RESULT ENTRY ─────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Modal visible={showStatusModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🔬 {targetStatus === 'In Testing' ? 'Start Laboratory Testing' : 'Enter Test Results'}</Text>
              <TouchableOpacity onPress={() => setShowStatusModal(false)}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.modalSub}>
                Patient: <Text style={styles.bold}>{selectedReport?.userId?.name || selectedReport?.patientId}</Text>
              </Text>
              <Text style={styles.modalSub}>
                Tests: <Text style={styles.bold}>{Array.isArray(selectedReport?.testNames) ? selectedReport.testNames.join(', ') : selectedReport?.testNames}</Text>
              </Text>

              {targetStatus === 'Report Ready' ? (
                <>
                  <Text style={styles.inputLabel}>Diagnostic Findings / Observed Values</Text>
                  <TextInput
                    style={[styles.input, { height: 75 }]}
                    placeholder="e.g. Hemoglobin: 14.2 g/dL, WBC: 7,200 /mcL, Platelets: 240,000"
                    multiline
                    value={resultValues}
                    onChangeText={setResultValues}
                  />
                </>
              ) : null}

              <Text style={styles.inputLabel}>Technician / Pathologist Remarks</Text>
              <TextInput
                style={[styles.input, { height: 65 }]}
                placeholder="e.g. Sample verified on automated analyzer. Values normal."
                multiline
                value={statusNotes}
                onChangeText={setStatusNotes}
              />

              <TouchableOpacity
                style={[styles.submitBtn, savingStatus && styles.btnDisabled]}
                onPress={handleSaveStatus}
                disabled={savingStatus}
              >
                {savingStatus ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Confirm Status Change</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL 3: REGISTER WALK-IN TEST (Exact Webapp Match) ────────────── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Modal visible={showCreateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🔬 Walk-in Lab Test Registration</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Patient Name or ID *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter Patient Name or ID (e.g. John Doe / P-101)"
                value={createForm.patientId}
                onChangeText={val => setCreateForm({ ...createForm, patientId: val })}
              />

              <Text style={styles.inputLabel}>Test Names (comma separated) *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. CBC, Lipid Profile, Thyroid"
                value={createForm.testNames}
                onChangeText={val => setCreateForm({ ...createForm, testNames: val })}
              />

              <Text style={styles.inputLabel}>Assign / Send to Doctor (Optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {doctorsList.map(doc => {
                  const isSelected = createForm.doctorId === (doc.userId?._id || doc.userId || doc._id);
                  return (
                    <TouchableOpacity
                      key={doc._id}
                      style={[styles.doctorSelectChip, isSelected && styles.doctorSelectChipActive]}
                      onPress={() => setCreateForm({ ...createForm, doctorId: doc.userId?._id || doc.userId || doc._id })}
                    >
                      <Text style={[styles.doctorSelectChipText, isSelected && styles.doctorSelectChipTextActive]}>
                        Dr. {doc.name} {doc.specialty ? `(${doc.specialty})` : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.formRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.inputLabel}>Amount (₹)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    placeholder="450"
                    value={createForm.amount}
                    onChangeText={val => setCreateForm({ ...createForm, amount: val })}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.inputLabel}>Payment Mode</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                    {['Cash', 'UPI', 'Card'].map(m => (
                      <TouchableOpacity
                        key={m}
                        style={[styles.payChip, createForm.paymentMode === m && styles.payChipActive]}
                        onPress={() => setCreateForm({ ...createForm, paymentMode: m })}
                      >
                        <Text style={[styles.payChipText, createForm.paymentMode === m && styles.payChipTextActive]}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              <Text style={styles.inputLabel}>Payment Status</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                {['PAID', 'PENDING'].map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.payStatusBtn, createForm.paymentStatus === s && styles.payStatusBtnActive]}
                    onPress={() => setCreateForm({ ...createForm, paymentStatus: s })}
                  >
                    <Text style={[styles.payStatusBtnText, createForm.paymentStatus === s && styles.payStatusBtnTextActive]}>
                      {s === 'PAID' ? '● Paid in Full' : '○ Pay Later'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Clinical Notes / Symptoms</Text>
              <TextInput
                style={[styles.input, { height: 60 }]}
                placeholder="e.g. Routine full body checkup, walk-in request"
                multiline
                value={createForm.notes}
                onChangeText={val => setCreateForm({ ...createForm, notes: val })}
              />

              <TouchableOpacity
                style={[styles.submitBtn, savingCreate && styles.btnDisabled]}
                onPress={handleCreateWalkInTest}
                disabled={savingCreate}
              >
                {savingCreate ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Register Test & Issue Requisition</Text>}
              </TouchableOpacity>
            </ScrollView>
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

  // ── TOP HEADER ──
  topHeader: {
    minHeight: 74,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 2,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  hamburgerBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  hamburgerLine: {
    width: 20,
    height: 2.5,
    backgroundColor: '#334155',
    marginVertical: 2,
    borderRadius: 2,
  },
  headerAdminCard: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerAdminAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
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
    flexWrap: 'wrap',
    gap: 6,
  },
  headerAdminName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    maxWidth: 130,
  },
  headerRoleBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  headerRoleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerAdminEmail: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1,
  },
  refreshBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshBtnText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0d9488',
  },

  // ── FEEDBACK BANNER ──
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  feedbackSuccess: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  feedbackError: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
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

  // ── SCROLLABLE CONTENT ──
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },

  // ── HERO BANNER ──
  heroBanner: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  heroTitleGroup: {
    flex: 1,
    minWidth: 200,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  heroSubtitle: {
    fontSize: 12.5,
    color: '#64748b',
    marginTop: 4,
    fontWeight: '500',
  },
  heroActionBtn: {
    backgroundColor: '#0d9488',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: '#0d9488',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  heroActionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  scopeToggleRow: {
    flexDirection: 'row',
    marginTop: 14,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#0d9488',
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  scopeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
  },
  scopeBtnActive: {
    backgroundColor: '#0d9488',
  },
  scopeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0d9488',
  },
  scopeBtnTextActive: {
    color: '#ffffff',
  },

  // ── STATS ROWS (Explicit 2-Column Rows) ──
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  statCard: {
    width: '48.5%',
    paddingVertical: 16,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statNumber: {
    fontSize: 26,
    fontWeight: '900',
  },
  statLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 4,
    letterSpacing: 0.3,
    textAlign: 'center',
  },

  // ── QUICK ACTIONS (Explicit 2-Column Rows) ──
  quickNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  quickNavBtn: {
    width: '48.5%',
    paddingVertical: 13,
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
  quickNavBtnOutline: {
    width: '48.5%',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    backgroundColor: '#ffffff',
  },
  quickNavBtnOutlineText: {
    fontSize: 12.5,
    fontWeight: '700',
    textAlign: 'center',
  },

  // ── NON-DASHBOARD TAB TOP BAR ──
  tabTopBarContainer: {
    marginBottom: 4,
  },
  tabTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tabBackToDashboardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f0fdfa',
    borderWidth: 1,
    borderColor: '#99f6e4',
  },
  tabBackToDashboardText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0d9488',
  },
  tabRegisterBtn: {
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: 8,
    backgroundColor: '#0d9488',
  },
  tabRegisterBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  viewAllOrdersFullBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#0d9488',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 20,
    shadowColor: '#0d9488',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  viewAllOrdersFullBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0d9488',
  },

  // ── SECTION HEADER ──
  sectionHeaderRow: {
    marginTop: 10,
    marginBottom: 12,
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

  // ── FILTER SCROLLER ──
  filterScroll: {
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#0d9488',
    borderColor: '#0d9488',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#ffffff',
  },

  // ── SEARCH BOX ──
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 16,
  },
  searchIcon: {
    fontSize: 15,
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
  },

  // ── EMPTY STATE ──
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 8,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 16,
    maxWidth: 280,
  },
  emptyActionBtn: {
    backgroundColor: '#0d9488',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  emptyActionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },

  // ── ORDER CARD ──
  orderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  orderHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  patientInfoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  patientAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  patientAvatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0d9488',
  },
  patientMeta: {
    flex: 1,
  },
  patientNameText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  patientIdText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  metaInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  metaDoctorText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  metaDateText: {
    fontSize: 11.5,
    color: '#64748b',
  },
  testsChipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  testChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  testChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  specimenNotesRow: {
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    gap: 4,
  },
  specimenText: {
    fontSize: 12,
    color: '#334155',
  },
  notesText: {
    fontSize: 12,
    color: '#64748b',
  },
  bold: {
    fontWeight: '700',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    marginBottom: 12,
  },
  feeLabel: {
    fontSize: 13,
    color: '#64748b',
  },
  feeValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  paymentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  paymentBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  btnAction: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCollect: {
    backgroundColor: '#0d9488',
  },
  btnTesting: {
    backgroundColor: '#7c3aed',
  },
  btnReady: {
    backgroundColor: '#0284c7',
  },
  btnCompleted: {
    backgroundColor: '#16a34a',
  },
  btnCancel: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fca5a5',
    flex: 0.4,
  },
  btnActionTextWhite: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '700',
  },
  btnCancelText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '700',
  },
  completedFlag: {
    flex: 1,
    backgroundColor: '#f0fdf4',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  completedFlagText: {
    color: '#16a34a',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── SIDEBAR DRAWER ──
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
    flexDirection: 'column',
  },
  drawerHeader: {
    padding: 16,
    paddingTop: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  drawerBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  drawerLogoCircle: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#f0fdfa',
    borderWidth: 1,
    borderColor: '#99f6e4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  drawerLogoEmoji: {
    fontSize: 22,
  },
  drawerBrandTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  drawerBrandSub: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 1,
  },
  drawerCloseBtn: {
    padding: 6,
  },
  drawerCloseIcon: {
    fontSize: 18,
    color: '#94a3b8',
    fontWeight: '700',
  },
  drawerProfileBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 14,
  },
  drawerProfileAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  drawerProfileAvatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  drawerProfileInfo: {
    flex: 1,
  },
  drawerProfileName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  drawerProfileEmail: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 4,
  },
  drawerRoleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  drawerRoleBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  drawerNavScroll: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  drawerNavScrollContent: {
    paddingBottom: 80,
  },
  drawerSectionHeading: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.8,
    marginBottom: 8,
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
    backgroundColor: '#f0fdfa',
  },
  drawerNavIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  drawerNavLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
  },
  drawerNavLabelActive: {
    color: '#0d9488',
    fontWeight: '800',
  },
  drawerCountBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  drawerCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  drawerDirectActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#f0fdfa',
    borderWidth: 1,
    borderColor: '#99f6e4',
  },
  drawerDirectActionIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  drawerDirectActionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0d9488',
  },
  drawerFooter: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'android' ? 36 : 20,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  drawerLogoutBtn: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  drawerLogoutText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '700',
  },
  drawerVersionText: {
    fontSize: 10.5,
    color: '#94a3b8',
    textAlign: 'center',
  },

  // ── MODALS COMMON ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalCloseIcon: {
    fontSize: 20,
    color: '#94a3b8',
    fontWeight: '700',
  },
  modalBody: {
    marginTop: 14,
  },
  modalSub: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 4,
  },
  inputLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0f172a',
  },
  specimenGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  specimenChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  specimenChipActive: {
    backgroundColor: '#f0fdfa',
    borderColor: '#0d9488',
  },
  specimenChipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  specimenChipTextActive: {
    color: '#0d9488',
    fontWeight: '800',
  },
  submitBtn: {
    backgroundColor: '#0d9488',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  doctorSelectChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginRight: 8,
  },
  doctorSelectChipActive: {
    backgroundColor: '#f0fdfa',
    borderColor: '#0d9488',
  },
  doctorSelectChipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  doctorSelectChipTextActive: {
    color: '#0d9488',
    fontWeight: '800',
  },
  formRow: {
    flexDirection: 'row',
  },
  payChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
  },
  payChipActive: {
    backgroundColor: '#f0fdfa',
    borderColor: '#0d9488',
  },
  payChipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '700',
  },
  payChipTextActive: {
    color: '#0d9488',
  },
  payStatusBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
  },
  payStatusBtnActive: {
    backgroundColor: '#f0fdfa',
    borderColor: '#0d9488',
  },
  payStatusBtnText: {
    fontSize: 12.5,
    color: '#475569',
    fontWeight: '700',
  },
  payStatusBtnTextActive: {
    color: '#0d9488',
  },
});
