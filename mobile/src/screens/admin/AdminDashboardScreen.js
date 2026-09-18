// mobile/src/screens/admin/AdminDashboardScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
  Alert,
  Platform,
  RefreshControl,
  Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import {
  fetchAdminOverview,
  fetchHospitalsList,
  createHospitalUnit,
  fetchStaffUsers,
  createStaffUser,
  toggleUserActiveStatus,
  resetStaffPassword,
  deleteStaffUser,
  fetchRolesList,
  createCustomRole,
  fetchAuditLogs
} from '../../services/api';

const MENU_ITEMS = [
  { key: 'overview', label: 'System Overview', icon: '📊', desc: 'KPI metrics & service hubs' },
  { key: 'staff', label: 'Staff & User Accounts', icon: '👥', desc: 'Physicians, nurses & staff' },
  { key: 'units', label: 'Hospitals & Clinics', icon: '🏥', desc: 'Branches & multi-tenant nodes' },
  { key: 'roles', label: 'Roles & Permissions', icon: '🛡️', desc: 'RBAC access control' },
  { key: 'audit', label: 'Security & Audit Logs', icon: '📜', desc: 'Compliance & event logs' },
];

export default function AdminDashboardScreen({ navigation }) {
  const { user, token, logout } = useAuth();

  const [activeTab, setActiveTab] = useState('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', text: '' }

  // ── Data States ──
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalDoctors: 0,
    totalPatients: 0,
    totalRoles: 0,
    totalHospitals: 0,
    totalClinics: 0,
    totalUnits: 0
  });
  const [units, setUnits] = useState([]);
  const [staff, setStaff] = useState([]);
  const [roles, setRoles] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  // ── Filters & Search ──
  const [staffSearch, setStaffSearch] = useState('');
  const [staffRoleFilter, setStaffRoleFilter] = useState('ALL');
  const [unitTypeFilter, setUnitTypeFilter] = useState('ALL');
  const [auditCategoryFilter, setAuditCategoryFilter] = useState('ALL');

  // ── Modals State ──
  // 1. Add Unit Modal
  const [showAddUnitModal, setShowAddUnitModal] = useState(false);
  const [unitForm, setUnitForm] = useState({
    name: '',
    slug: '',
    city: '',
    state: '',
    phone: '',
    email: '',
    appointmentFee: '500'
  });
  const [savingUnit, setSavingUnit] = useState(false);

  // 2. Add Staff Modal
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [staffForm, setStaffForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    role: 'Doctor',
    department: 'General'
  });
  const [savingStaff, setSavingStaff] = useState(false);

  // 3. Reset Password Modal
  const [showResetPwModal, setShowResetPwModal] = useState(false);
  const [targetStaffUser, setTargetStaffUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // 4. Add Role Modal
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    category: 'Clinical & Medical'
  });
  const [savingRole, setSavingRole] = useState(false);

  // ── Loaders ──
  const loadOverviewData = useCallback(async () => {
    if (!token) return;
    const res = await fetchAdminOverview(token);
    if (res.success) {
      setStats(res.stats);
    }
  }, [token]);

  const loadUnitsData = useCallback(async () => {
    if (!token) return;
    const res = await fetchHospitalsList(token);
    if (res.success) {
      setUnits(res.units);
    }
  }, [token]);

  const loadStaffData = useCallback(async () => {
    if (!token) return;
    const res = await fetchStaffUsers(token);
    if (res.success) {
      setStaff(res.users);
    }
  }, [token]);

  const loadRolesData = useCallback(async () => {
    if (!token) return;
    const res = await fetchRolesList(token);
    if (res.success) {
      setRoles(res.roles);
    }
  }, [token]);

  const loadAuditData = useCallback(async () => {
    if (!token) return;
    const res = await fetchAuditLogs(token, { limit: 30 });
    if (res.success) {
      setAuditLogs(res.logs);
    }
  }, [token]);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      loadOverviewData(),
      loadUnitsData(),
      loadStaffData(),
      loadRolesData(),
      loadAuditData()
    ]);
    setLoading(false);
  }, [loadOverviewData, loadUnitsData, loadStaffData, loadRolesData, loadAuditData]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
  };

  const showNotification = (type, text) => {
    setFeedback({ type, text });
    setTimeout(() => {
      setFeedback(null);
    }, 4000);
  };

  // ── Action Handlers ──

  // Add Unit
  const handleCreateUnit = async () => {
    if (!unitForm.name.trim() || !unitForm.slug.trim()) {
      Alert.alert('Validation', 'Please provide unit name and subdomain slug.');
      return;
    }
    setSavingUnit(true);
    const payload = {
      name: unitForm.name.trim(),
      slug: unitForm.slug.trim().toLowerCase(),
      city: unitForm.city.trim(),
      state: unitForm.state.trim(),
      phone: unitForm.phone.trim(),
      email: unitForm.email.trim(),
      appointmentFee: Number(unitForm.appointmentFee) || 500
    };
    const res = await createHospitalUnit(payload, token);
    setSavingUnit(false);
    if (res.success) {
      setShowAddUnitModal(false);
      setUnitForm({ name: '', slug: '', city: '', state: '', phone: '', email: '', appointmentFee: '500' });
      showNotification('success', `Hospital Unit "${payload.name}" created successfully!`);
      loadUnitsData();
      loadOverviewData();
    } else {
      Alert.alert('Creation Failed', res.message || 'Unable to create hospital unit.');
    }
  };

  // Add Staff
  const handleCreateStaff = async () => {
    if (!staffForm.name.trim() || !staffForm.email.trim() || !staffForm.password.trim()) {
      Alert.alert('Validation', 'Name, email, and password are required.');
      return;
    }
    setSavingStaff(true);
    const payload = {
      name: staffForm.name.trim(),
      email: staffForm.email.trim().toLowerCase(),
      password: staffForm.password.trim(),
      phone: staffForm.phone.trim(),
      role: staffForm.role,
      department: staffForm.department
    };
    const res = await createStaffUser(payload, token);
    setSavingStaff(false);
    if (res.success) {
      setShowAddStaffModal(false);
      setStaffForm({ name: '', email: '', password: '', phone: '', role: 'Doctor', department: 'General' });
      showNotification('success', `Staff member ${payload.name} created!`);
      loadStaffData();
      loadOverviewData();
    } else {
      Alert.alert('Error', res.message || 'Failed to create staff member.');
    }
  };

  // Toggle User Active Status
  const handleToggleStatus = async (targetUser) => {
    const nextState = !targetUser.isActive;
    const res = await toggleUserActiveStatus(targetUser.id, nextState, token);
    if (res.success) {
      showNotification('success', `User ${targetUser.name} is now ${nextState ? 'Active' : 'Deactivated'}.`);
      setStaff(prev => prev.map(u => u.id === targetUser.id ? { ...u, isActive: nextState } : u));
    } else {
      Alert.alert('Error', res.message || 'Failed to change user status.');
    }
  };

  // Reset Password
  const handleResetPassword = async () => {
    if (!newPassword.trim() || newPassword.length < 3) {
      Alert.alert('Validation', 'New password must have at least 3 characters.');
      return;
    }
    setSavingPassword(true);
    const res = await resetStaffPassword(targetStaffUser.id, newPassword.trim(), token);
    setSavingPassword(false);
    if (res.success) {
      setShowResetPwModal(false);
      setNewPassword('');
      setTargetStaffUser(null);
      showNotification('success', `Password updated for ${targetStaffUser.name}.`);
    } else {
      Alert.alert('Error', res.message || 'Failed to reset password.');
    }
  };

  // Delete User
  const handleDeleteStaff = (targetUser) => {
    Alert.alert(
      'Delete Staff User',
      `Are you sure you want to delete ${targetUser.name}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const res = await deleteStaffUser(targetUser.id, token);
            if (res.success) {
              showNotification('success', `Staff user ${targetUser.name} removed.`);
              setStaff(prev => prev.filter(u => u.id !== targetUser.id));
              loadOverviewData();
            } else {
              Alert.alert('Error', res.message || 'Failed to delete user.');
            }
          }
        }
      ]
    );
  };

  // Add Custom Role
  const handleCreateRole = async () => {
    if (!roleForm.name.trim()) {
      Alert.alert('Validation', 'Role name is required.');
      return;
    }
    setSavingRole(true);
    const payload = {
      name: roleForm.name.trim(),
      description: roleForm.description.trim() || `${roleForm.name} operational role`,
      permissions: ['patient_view', 'appointment_manage']
    };
    const res = await createCustomRole(payload, token);
    setSavingRole(false);
    if (res.success) {
      setShowAddRoleModal(false);
      setRoleForm({ name: '', description: '', category: 'Clinical & Medical' });
      showNotification('success', `Role "${payload.name}" created!`);
      loadRolesData();
      loadOverviewData();
    } else {
      Alert.alert('Error', res.message || 'Failed to create role.');
    }
  };

  // ── Filter Computations ──
  const filteredStaff = staff.filter(item => {
    const query = staffSearch.trim().toLowerCase();
    const matchesQuery = !query ||
      item.name?.toLowerCase().includes(query) ||
      item.email?.toLowerCase().includes(query) ||
      item.phone?.includes(query);
    const roleStr = String(item.role || '').toLowerCase();
    const matchesRole = staffRoleFilter === 'ALL' || roleStr.includes(staffRoleFilter.toLowerCase());
    return matchesQuery && matchesRole;
  });

  const filteredUnits = units.filter(item => {
    if (unitTypeFilter === 'ALL') return true;
    return item.unitType === unitTypeFilter;
  });

  const filteredAuditLogs = auditLogs.filter(log => {
    if (auditCategoryFilter === 'ALL') return true;
    const action = String(log.action || '').toUpperCase();
    if (auditCategoryFilter === 'AUTH') return action.includes('LOGIN') || action.includes('LOGOUT');
    if (auditCategoryFilter === 'USER') return action.includes('USER') || action.includes('ROLE');
    if (auditCategoryFilter === 'CLINICAL') return action.includes('PATIENT') || action.includes('APPOINTMENT');
    if (auditCategoryFilter === 'BILLING') return action.includes('BILL') || action.includes('INVOICE') || action.includes('PAYMENT');
    return true;
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      
      {/* ── Top Header Bar with Bigger Height & System Admin Card ── */}
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

          {/* System Admin Card on Header */}
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
                  {user?.avatar || (user?.name || 'S').charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            <View style={styles.headerAdminInfo}>
              <View style={styles.headerAdminNameRow}>
                <Text style={styles.headerAdminName} numberOfLines={1}>
                  {user?.name || 'System Admin'}
                </Text>
                <View style={styles.headerRoleBadge}>
                  <Text style={styles.headerRoleBadgeText}>
                    {String(user?.role || 'SUPERADMIN').toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={styles.headerAdminEmail} numberOfLines={1}>
                {user?.email || 'admin@admin.com'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Fixed Refresh Button */}
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={loadAllData}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.refreshBtnText}>↻</Text>
        </TouchableOpacity>
      </View>

      {/* ── Notification Feedback Toast ── */}
      {feedback ? (
        <View style={[styles.feedbackBanner, feedback.type === 'error' ? styles.feedbackError : styles.feedbackSuccess]}>
          <Text style={styles.feedbackIcon}>{feedback.type === 'error' ? '⚠️' : '✅'}</Text>
          <Text style={styles.feedbackText}>{feedback.text}</Text>
        </View>
      ) : null}

      {/* ── Main Content Area ── */}
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0284c7']} />}
        keyboardShouldPersistTaps="handled"
      >

        {/* ════════════════════ TAB 1: OVERVIEW ════════════════════ */}
        {activeTab === 'overview' && (
          <View>
            
            {/* KPI Cards Grid */}
            <Text style={styles.sectionTitle}>Hospital Network Overview</Text>
            <Text style={styles.sectionDesc}>Real-time metrics across all hospital units & staff</Text>
            <View style={styles.kpiGrid}>
              
              <TouchableOpacity
                style={[styles.kpiCard, { borderColor: '#bae6fd' }]}
                onPress={() => {
                  setStaffRoleFilter('ALL');
                  setActiveTab('staff');
                }}
                activeOpacity={0.8}
              >
                <View style={[styles.kpiIconWrap, { backgroundColor: '#f0f9ff' }]}>
                  <Text style={styles.kpiEmoji}>👥</Text>
                </View>
                <Text style={styles.kpiValue}>{loading ? '...' : stats.totalUsers}</Text>
                <Text style={styles.kpiLabel}>Total Staff</Text>
                <Text style={styles.kpiSub}>Active users in roster</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.kpiCard, { borderColor: '#bbf7d0' }]}
                onPress={() => {
                  setStaffRoleFilter('Doctor');
                  setActiveTab('staff');
                }}
                activeOpacity={0.8}
              >
                <View style={[styles.kpiIconWrap, { backgroundColor: '#f0fdf4' }]}>
                  <Text style={styles.kpiEmoji}>🩺</Text>
                </View>
                <Text style={styles.kpiValue}>{loading ? '...' : stats.totalDoctors}</Text>
                <Text style={styles.kpiLabel}>Physicians</Text>
                <Text style={styles.kpiSub}>Registered doctors</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.kpiCard, { borderColor: '#fed7aa' }]}
                onPress={() => {
                  setUnitTypeFilter('hospital');
                  setActiveTab('units');
                }}
                activeOpacity={0.8}
              >
                <View style={[styles.kpiIconWrap, { backgroundColor: '#fff7ed' }]}>
                  <Text style={styles.kpiEmoji}>🏥</Text>
                </View>
                <Text style={styles.kpiValue}>{loading ? '...' : stats.totalHospitals}</Text>
                <Text style={styles.kpiLabel}>Hospitals</Text>
                <Text style={styles.kpiSub}>Multi-bed branches</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.kpiCard, { borderColor: '#bbf7d0' }]}
                onPress={() => {
                  setUnitTypeFilter('clinic');
                  setActiveTab('units');
                }}
                activeOpacity={0.8}
              >
                <View style={[styles.kpiIconWrap, { backgroundColor: '#f0fdf4' }]}>
                  <Text style={styles.kpiEmoji}>🩺</Text>
                </View>
                <Text style={styles.kpiValue}>{loading ? '...' : stats.totalClinics}</Text>
                <Text style={styles.kpiLabel}>Clinics</Text>
                <Text style={styles.kpiSub}>Primary care centers</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.kpiCard, { borderColor: '#e9d5ff' }]}
                onPress={() => setActiveTab('roles')}
                activeOpacity={0.8}
              >
                <View style={[styles.kpiIconWrap, { backgroundColor: '#faf5ff' }]}>
                  <Text style={styles.kpiEmoji}>🔑</Text>
                </View>
                <Text style={styles.kpiValue}>{loading ? '...' : stats.totalRoles}</Text>
                <Text style={styles.kpiLabel}>Access Roles</Text>
                <Text style={styles.kpiSub}>RBAC permission matrix</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.kpiCard, { borderColor: '#fbcfe8' }]}
                onPress={() => setActiveTab('audit')}
                activeOpacity={0.8}
              >
                <View style={[styles.kpiIconWrap, { backgroundColor: '#fdf2f8' }]}>
                  <Text style={styles.kpiEmoji}>📜</Text>
                </View>
                <Text style={styles.kpiValue}>{loading ? '...' : (auditLogs.length || 'Live')}</Text>
                <Text style={styles.kpiLabel}>Audit Events</Text>
                <Text style={styles.kpiSub}>Compliance tracking</Text>
              </TouchableOpacity>

            </View>

            {/* Department Directory / Clinical Services Card */}
            <Text style={styles.sectionTitle}>Hospital Department Services</Text>
            <Text style={styles.sectionDesc}>Integrated clinical, diagnostic, and operational units</Text>

            <View style={styles.deptCardList}>
              <View style={styles.deptCardItem}>
                <View style={[styles.deptCardIcon, { backgroundColor: '#e0f2fe' }]}>
                  <Text style={styles.deptCardEmoji}>🩺</Text>
                </View>
                <View style={styles.deptCardBody}>
                  <View style={styles.deptCardTitleRow}>
                    <Text style={styles.deptCardTitle}>Outpatient Department (OPD)</Text>
                    <View style={styles.deptStatusBadge}>
                      <Text style={styles.deptStatusText}>ACTIVE</Text>
                    </View>
                  </View>
                  <Text style={styles.deptCardDesc}>Doctor triage, appointment token queues, and e-prescriptions</Text>
                </View>
              </View>

              <View style={styles.deptCardItem}>
                <View style={[styles.deptCardIcon, { backgroundColor: '#f0fdf4' }]}>
                  <Text style={styles.deptCardEmoji}>🛏️</Text>
                </View>
                <View style={styles.deptCardBody}>
                  <View style={styles.deptCardTitleRow}>
                    <Text style={styles.deptCardTitle}>Inpatient Wards & Admissions</Text>
                    <View style={styles.deptStatusBadge}>
                      <Text style={styles.deptStatusText}>READY</Text>
                    </View>
                  </View>
                  <Text style={styles.deptCardDesc}>Bed occupancy management, ICU, general wards, and private rooms</Text>
                </View>
              </View>

              <View style={styles.deptCardItem}>
                <View style={[styles.deptCardIcon, { backgroundColor: '#fffbeb' }]}>
                  <Text style={styles.deptCardEmoji}>🧪</Text>
                </View>
                <View style={styles.deptCardBody}>
                  <View style={styles.deptCardTitleRow}>
                    <Text style={styles.deptCardTitle}>Diagnostic Pathology & Laboratory</Text>
                    <View style={styles.deptStatusBadge}>
                      <Text style={styles.deptStatusText}>ONLINE</Text>
                    </View>
                  </View>
                  <Text style={styles.deptCardDesc}>Digital requisitions, specimen processing, and verified reports</Text>
                </View>
              </View>

              <View style={styles.deptCardItem}>
                <View style={[styles.deptCardIcon, { backgroundColor: '#fdf2f8' }]}>
                  <Text style={styles.deptCardEmoji}>💊</Text>
                </View>
                <View style={styles.deptCardBody}>
                  <View style={styles.deptCardTitleRow}>
                    <Text style={styles.deptCardTitle}>Pharmacy & Drug Dispensing</Text>
                    <View style={styles.deptStatusBadge}>
                      <Text style={styles.deptStatusText}>ONLINE</Text>
                    </View>
                  </View>
                  <Text style={styles.deptCardDesc}>Formulary stock tracking, dispensing fulfillment, and purchase orders</Text>
                </View>
              </View>
            </View>

            {/* Quick Action Shortcuts */}
            <Text style={styles.sectionTitle}>Administrative Management</Text>
            <Text style={styles.sectionDesc}>Direct management actions for hospital network</Text>
            
            <TouchableOpacity
              style={styles.actionRowCard}
              onPress={() => { setActiveTab('units'); setShowAddUnitModal(true); }}
              activeOpacity={0.8}
            >
              <View style={[styles.actionRowIcon, { backgroundColor: '#e0f2fe' }]}>
                <Text style={styles.actionRowEmoji}>🏥</Text>
              </View>
              <View style={styles.actionRowContent}>
                <Text style={styles.actionRowTitle}>Provision Hospital / Clinic Unit</Text>
                <Text style={styles.actionRowSub}>Add hospital branch, assign subdomain slug & OPD fees</Text>
              </View>
              <Text style={styles.actionRowArrow}>→</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionRowCard}
              onPress={() => { setActiveTab('staff'); setShowAddStaffModal(true); }}
              activeOpacity={0.8}
            >
              <View style={[styles.actionRowIcon, { backgroundColor: '#f0fdf4' }]}>
                <Text style={styles.actionRowEmoji}>👥</Text>
              </View>
              <View style={styles.actionRowContent}>
                <Text style={styles.actionRowTitle}>Enroll Doctor or Staff Member</Text>
                <Text style={styles.actionRowSub}>Create user credentials, assign role & department</Text>
              </View>
              <Text style={styles.actionRowArrow}>→</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionRowCard}
              onPress={() => setActiveTab('roles')}
              activeOpacity={0.8}
            >
              <View style={[styles.actionRowIcon, { backgroundColor: '#faf5ff' }]}>
                <Text style={styles.actionRowEmoji}>🛡️</Text>
              </View>
              <View style={styles.actionRowContent}>
                <Text style={styles.actionRowTitle}>Role-Based Access Control (RBAC)</Text>
                <Text style={styles.actionRowSub}>Manage permissions across clinical, billing, and admin roles</Text>
              </View>
              <Text style={styles.actionRowArrow}>→</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionRowCard}
              onPress={() => setActiveTab('audit')}
              activeOpacity={0.8}
            >
              <View style={[styles.actionRowIcon, { backgroundColor: '#fff7ed' }]}>
                <Text style={styles.actionRowEmoji}>📜</Text>
              </View>
              <View style={styles.actionRowContent}>
                <Text style={styles.actionRowTitle}>System Security & Compliance Trail</Text>
                <Text style={styles.actionRowSub}>Review authentication sessions and administrative logs</Text>
              </View>
              <Text style={styles.actionRowArrow}>→</Text>
            </TouchableOpacity>

          </View>
        )}

        {/* ════════════════════ TAB 2: UNITS (HOSPITALS & CLINICS) ════════════════════ */}
        {activeTab === 'units' && (
          <View>
            <View style={styles.tabSectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Hospital & Clinic Units</Text>
                <Text style={styles.sectionDesc}>Manage hospital branches & multi-tenant nodes</Text>
              </View>
              <TouchableOpacity
                style={styles.primaryActionBtn}
                onPress={() => setShowAddUnitModal(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryActionBtnText}>+ Add Unit</Text>
              </TouchableOpacity>
            </View>

            {/* Filter Chips */}
            <View style={styles.filterChipRow}>
              {['ALL', 'hospital', 'clinic'].map(f => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterChip, unitTypeFilter === f && styles.filterChipActive]}
                  onPress={() => setUnitTypeFilter(f)}
                >
                  <Text style={[styles.filterChipText, unitTypeFilter === f && styles.filterChipTextActive]}>
                    {f === 'ALL' ? 'All Units' : f === 'hospital' ? 'Hospitals' : 'Clinics'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Units List */}
            {filteredUnits.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>🏥</Text>
                <Text style={styles.emptyTitle}>No Units Found</Text>
                <Text style={styles.emptySub}>Tap "+ Add Unit" to register a new hospital or clinic.</Text>
              </View>
            ) : (
              filteredUnits.map(unit => {
                const isHosp = unit.unitType === 'hospital';
                return (
                  <View key={unit._id} style={styles.unitCard}>
                    <View style={styles.unitHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.unitName}>{unit.name}</Text>
                        <Text style={styles.unitSubdomain}>
                          subdomain: <Text style={styles.monoText}>{unit.slug || 'default'}</Text>
                        </Text>
                      </View>
                      <View style={[styles.unitBadge, isHosp ? styles.unitBadgeHosp : styles.unitBadgeClinic]}>
                        <Text style={[styles.unitBadgeText, isHosp ? styles.unitBadgeTextHosp : styles.unitBadgeTextClinic]}>
                          {isHosp ? 'HOSPITAL' : 'CLINIC'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.unitMetaRow}>
                      <Text style={styles.unitMetaItem}>📍 {unit.city ? `${unit.city}, ${unit.state || ''}` : 'Location unconfigured'}</Text>
                      <Text style={styles.unitMetaItem}>📞 {unit.phone || 'No phone'}</Text>
                    </View>
                    <View style={styles.unitMetaRow}>
                      <Text style={styles.unitMetaItem}>✉️ {unit.email || 'No email'}</Text>
                      <Text style={styles.unitMetaItem}>💰 Fee: ₹{unit.appointmentFee || 500}</Text>
                    </View>

                    {/* Departments list */}
                    {unit.departments && unit.departments.length > 0 ? (
                      <View style={styles.deptTagRow}>
                        {unit.departments.map((dept, i) => (
                          <View key={i} style={styles.deptTag}>
                            <Text style={styles.deptTagText}>{dept}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}

                    {/* Facilities count */}
                    {unit.facilities && unit.facilities.length > 0 ? (
                      <View style={styles.facilityRow}>
                        <Text style={styles.facilityNote}>
                          Ward Beds: {unit.facilities.reduce((acc, f) => acc + (f.bedCount || 0), 0)} beds across {unit.facilities.length} facility units
                        </Text>
                      </View>
                    ) : null}

                  </View>
                );
              })
            )}

          </View>
        )}

        {/* ════════════════════ TAB 3: STAFF & USERS ════════════════════ */}
        {activeTab === 'staff' && (
          <View>
            <View style={styles.tabSectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Staff & User Accounts</Text>
                <Text style={styles.sectionDesc}>{staff.length} staff enrolled in hospital roster</Text>
              </View>
              <TouchableOpacity
                style={styles.primaryActionBtn}
                onPress={() => setShowAddStaffModal(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryActionBtnText}>+ Add Staff</Text>
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View style={styles.searchBox}>
              <Text style={styles.searchBoxIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search staff by name, email, or phone..."
                placeholderTextColor="#94a3b8"
                value={staffSearch}
                onChangeText={setStaffSearch}
              />
              {staffSearch ? (
                <TouchableOpacity onPress={() => setStaffSearch('')}>
                  <Text style={styles.clearSearchText}>✕</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Role Filter Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipRow}>
              {['ALL', 'Doctor', 'Admin', 'Reception', 'Lab', 'Pharma', 'Billing', 'Accountant'].map(role => (
                <TouchableOpacity
                  key={role}
                  style={[styles.filterChip, staffRoleFilter === role && styles.filterChipActive]}
                  onPress={() => setStaffRoleFilter(role)}
                >
                  <Text style={[styles.filterChipText, staffRoleFilter === role && styles.filterChipTextActive]}>
                    {role === 'ALL' ? 'All Roles' : role}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Staff List */}
            {filteredStaff.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>👥</Text>
                <Text style={styles.emptyTitle}>No Staff Matching</Text>
                <Text style={styles.emptySub}>Try adjusting your search criteria or role filters.</Text>
              </View>
            ) : (
              filteredStaff.map(member => {
                const initial = (member.name || 'U').charAt(0).toUpperCase();
                const roleStr = String(member.role || 'Staff');
                const isDoc = roleStr.toLowerCase().includes('doctor');
                const isAdmin = roleStr.toLowerCase().includes('admin');
                const isRecep = roleStr.toLowerCase().includes('reception');
                const isLab = roleStr.toLowerCase().includes('lab');
                const isPharma = roleStr.toLowerCase().includes('pharma');

                return (
                  <View key={member.id} style={styles.staffCard}>
                    <View style={styles.staffTopRow}>
                      <View style={styles.staffAvatar}>
                        <Text style={styles.staffAvatarText}>{initial}</Text>
                      </View>
                      <View style={styles.staffInfo}>
                        <Text style={styles.staffName}>{member.name}</Text>
                        <Text style={styles.staffEmail}>{member.email}</Text>
                        {member.phone ? <Text style={styles.staffPhone}>📞 {member.phone}</Text> : null}
                      </View>
                      <View style={styles.staffBadges}>
                        <View style={[
                          styles.roleBadge,
                          isDoc && styles.roleBadgeDoc,
                          isAdmin && styles.roleBadgeAdmin,
                          isRecep && styles.roleBadgeRecep,
                          isLab && styles.roleBadgeLab,
                          isPharma && styles.roleBadgePharma,
                        ]}>
                          <Text style={styles.roleBadgeText}>{roleStr}</Text>
                        </View>
                        <View style={[styles.activeStatusPill, member.isActive ? styles.pillActive : styles.pillInactive]}>
                          <Text style={[styles.activeStatusText, member.isActive ? styles.textActive : styles.textInactive]}>
                            {member.isActive ? 'Active' : 'Disabled'}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Department Tag if available */}
                    {member.department || (member.departments && member.departments.length > 0) ? (
                      <View style={styles.staffDeptRow}>
                        <Text style={styles.staffDeptLabel}>Dept: </Text>
                        <Text style={styles.staffDeptValue}>
                          {member.department || member.departments.join(', ')}
                        </Text>
                      </View>
                    ) : null}

                    {/* Action Buttons Row */}
                    <View style={styles.staffActionRow}>
                      <TouchableOpacity
                        style={[styles.staffActionBtn, styles.staffStatusBtn]}
                        onPress={() => handleToggleStatus(member)}
                      >
                        <Text style={styles.staffActionBtnText}>
                          {member.isActive ? 'Deactivate' : 'Activate'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.staffActionBtn, styles.staffResetBtn]}
                        onPress={() => {
                          setTargetStaffUser(member);
                          setShowResetPwModal(true);
                        }}
                      >
                        <Text style={styles.staffActionBtnText}>🔑 Reset Pw</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.staffActionBtn, styles.staffDeleteBtn]}
                        onPress={() => handleDeleteStaff(member)}
                      >
                        <Text style={styles.staffDeleteBtnText}>🗑️ Delete</Text>
                      </TouchableOpacity>
                    </View>

                  </View>
                );
              })
            )}

          </View>
        )}

        {/* ════════════════════ TAB 4: ROLES & RBAC ════════════════════ */}
        {activeTab === 'roles' && (
          <View>
            <View style={styles.tabSectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Roles & Permission Templates</Text>
                <Text style={styles.sectionDesc}>Role-based access matrix across hospital services</Text>
              </View>
              <TouchableOpacity
                style={styles.primaryActionBtn}
                onPress={() => setShowAddRoleModal(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryActionBtnText}>+ Add Role</Text>
              </TouchableOpacity>
            </View>

            {roles.map(r => {
              const perms = r.permissions || [];
              return (
                <View key={r._id || r.id} style={styles.roleCard}>
                  <View style={styles.roleCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.roleTitle}>{r.name}</Text>
                      <Text style={styles.roleDesc}>{r.description || 'System access role template'}</Text>
                    </View>
                    <View style={styles.permCountBadge}>
                      <Text style={styles.permCountText}>{perms.length} perms</Text>
                    </View>
                  </View>

                  {/* Permissions tags */}
                  <View style={styles.permTagGrid}>
                    {perms.slice(0, 8).map((p, idx) => (
                      <View key={idx} style={styles.permTag}>
                        <Text style={styles.permTagText}>{p}</Text>
                      </View>
                    ))}
                    {perms.length > 8 ? (
                      <View style={[styles.permTag, { backgroundColor: '#e2e8f0' }]}>
                        <Text style={[styles.permTagText, { color: '#475569' }]}>+{perms.length - 8} more</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}

          </View>
        )}

        {/* ════════════════════ TAB 5: AUDIT LOGS ════════════════════ */}
        {activeTab === 'audit' && (
          <View>
            <View style={styles.tabSectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Security & Activity Audit Logs</Text>
                <Text style={styles.sectionDesc}>Real-time tracking of platform events</Text>
              </View>
              <TouchableOpacity
                style={styles.secondaryActionBtn}
                onPress={loadAuditData}
                activeOpacity={0.8}
              >
                <Text style={styles.secondaryActionBtnText}>↻ Refresh</Text>
              </TouchableOpacity>
            </View>

            {/* Category Filter Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipRow}>
              {['ALL', 'AUTH', 'USER', 'CLINICAL', 'BILLING'].map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.filterChip, auditCategoryFilter === cat && styles.filterChipActive]}
                  onPress={() => setAuditCategoryFilter(cat)}
                >
                  <Text style={[styles.filterChipText, auditCategoryFilter === cat && styles.filterChipTextActive]}>
                    {cat === 'ALL' ? 'All Events' : cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {filteredAuditLogs.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>📜</Text>
                <Text style={styles.emptyTitle}>No Audit Records Logged</Text>
                <Text style={styles.emptySub}>Platform activity logs will stream in real-time as users authenticate, record visits, and generate bills.</Text>
              </View>
            ) : (
              filteredAuditLogs.map((log, idx) => {
                const isWarn = log.severity === 'warning';
                const isCrit = log.severity === 'critical';
                const dateStr = log.createdAt ? new Date(log.createdAt).toLocaleString('en-IN') : 'Recent';

                return (
                  <View key={log._id || idx} style={styles.auditLogCard}>
                    <View style={styles.auditHeaderRow}>
                      <View style={[styles.auditDot, isWarn ? styles.dotWarn : isCrit ? styles.dotCrit : styles.dotInfo]} />
                      <Text style={styles.auditAction}>{log.action || 'SYSTEM_EVENT'}</Text>
                      <Text style={styles.auditTime}>{dateStr}</Text>
                    </View>
                    <Text style={styles.auditUser}>
                      Actor: <Text style={{ fontWeight: '700' }}>{log.userName || log.userEmail || 'System'}</Text>
                    </Text>
                    {log.targetLabel || log.targetModel ? (
                      <Text style={styles.auditTarget}>Target: {log.targetLabel || log.targetModel}</Text>
                    ) : null}
                  </View>
                );
              })
            )}

          </View>
        )}

        {/* ── Sign Out Button ── */}
        <TouchableOpacity style={styles.logoutBtn} onPress={logout} activeOpacity={0.8}>
          <Text style={styles.logoutText}>Sign Out of Admin Portal</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* ════════════════════ MODAL: ADD UNIT ════════════════════ */}
      <Modal visible={showAddUnitModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Provision New Hospital / Unit</Text>
            <Text style={styles.modalDesc}>Configure tenant database & OPD subdomain</Text>

            <ScrollView style={{ maxHeight: 360 }}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Unit / Hospital Name *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g., City Care Hospital"
                  placeholderTextColor="#94a3b8"
                  value={unitForm.name}
                  onChangeText={v => setUnitForm(p => ({ ...p, name: v }))}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Subdomain Slug *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g., citycare"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  value={unitForm.slug}
                  onChangeText={v => setUnitForm(p => ({ ...p, slug: v }))}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>City & State</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="City, State"
                  placeholderTextColor="#94a3b8"
                  value={unitForm.city}
                  onChangeText={v => setUnitForm(p => ({ ...p, city: v }))}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Contact Phone</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Phone Number"
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                  value={unitForm.phone}
                  onChangeText={v => setUnitForm(p => ({ ...p, phone: v }))}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Contact Email</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="contact@hospital.com"
                  placeholderTextColor="#94a3b8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={unitForm.email}
                  onChangeText={v => setUnitForm(p => ({ ...p, email: v }))}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>OPD Consultation Fee (₹)</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="500"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  value={unitForm.appointmentFee}
                  onChangeText={v => setUnitForm(p => ({ ...p, appointmentFee: v }))}
                />
              </View>
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowAddUnitModal(false)}
                disabled={savingUnit}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleCreateUnit}
                disabled={savingUnit}
              >
                {savingUnit ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.modalSubmitBtnText}>Create Unit</Text>
                )}
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>

      {/* ════════════════════ MODAL: ADD STAFF ════════════════════ */}
      <Modal visible={showAddStaffModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enroll Doctor or Staff User</Text>
            <Text style={styles.modalDesc}>Create authenticated credentials and role mapping</Text>

            <ScrollView style={{ maxHeight: 360 }}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Full Name *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g., Dr. Ananya Sen"
                  placeholderTextColor="#94a3b8"
                  value={staffForm.name}
                  onChangeText={v => setStaffForm(p => ({ ...p, name: v }))}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Email Address *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="doctor@hospital.com"
                  placeholderTextColor="#94a3b8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={staffForm.email}
                  onChangeText={v => setStaffForm(p => ({ ...p, email: v }))}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Password *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Enter initial password"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry
                  value={staffForm.password}
                  onChangeText={v => setStaffForm(p => ({ ...p, password: v }))}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Phone Number</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="9876543210"
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                  value={staffForm.phone}
                  onChangeText={v => setStaffForm(p => ({ ...p, phone: v }))}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Assign Role</Text>
                <View style={styles.rolePickerRow}>
                  {['Doctor', 'Receptionist', 'Lab Technician', 'Pharmacist', 'Billing', 'Admin'].map(r => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.roleOptionChip, staffForm.role === r && styles.roleOptionChipActive]}
                      onPress={() => setStaffForm(p => ({ ...p, role: r }))}
                    >
                      <Text style={[styles.roleOptionText, staffForm.role === r && styles.roleOptionTextActive]}>
                        {r}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Department</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="General, Cardiology, Front Desk..."
                  placeholderTextColor="#94a3b8"
                  value={staffForm.department}
                  onChangeText={v => setStaffForm(p => ({ ...p, department: v }))}
                />
              </View>
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowAddStaffModal(false)}
                disabled={savingStaff}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleCreateStaff}
                disabled={savingStaff}
              >
                {savingStaff ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.modalSubmitBtnText}>Create Staff</Text>
                )}
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>

      {/* ════════════════════ MODAL: RESET PASSWORD ════════════════════ */}
      <Modal visible={showResetPwModal} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reset Password</Text>
            <Text style={styles.modalDesc}>
              Updating password for {targetStaffUser?.name} ({targetStaffUser?.email})
            </Text>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>New Password *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Enter new password"
                placeholderTextColor="#94a3b8"
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
              />
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setShowResetPwModal(false);
                  setNewPassword('');
                }}
                disabled={savingPassword}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleResetPassword}
                disabled={savingPassword}
              >
                {savingPassword ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.modalSubmitBtnText}>Save Password</Text>
                )}
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>

      {/* ════════════════════ MODAL: ADD ROLE ════════════════════ */}
      <Modal visible={showAddRoleModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create Access Role</Text>
            <Text style={styles.modalDesc}>Define new permission template for staff members</Text>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Role Name *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g., Nursing Supervisor"
                placeholderTextColor="#94a3b8"
                value={roleForm.name}
                onChangeText={v => setRoleForm(p => ({ ...p, name: v }))}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Description</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Role responsibility summary"
                placeholderTextColor="#94a3b8"
                value={roleForm.description}
                onChangeText={v => setRoleForm(p => ({ ...p, description: v }))}
              />
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowAddRoleModal(false)}
                disabled={savingRole}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleCreateRole}
                disabled={savingRole}
              >
                {savingRole ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.modalSubmitBtnText}>Create Role</Text>
                )}
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>

      {/* ════════════════════ SIDEBAR DRAWER MODAL ════════════════════ */}
      <Modal
        visible={isSidebarOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsSidebarOpen(false)}
      >
        <View style={styles.drawerBackdrop}>
          <TouchableOpacity
            style={styles.drawerOverlay}
            activeOpacity={1}
            onPress={() => setIsSidebarOpen(false)}
          />

          <View style={styles.drawerPanel}>
            <SafeAreaView style={{ flex: 1 }}>
              
              {/* Drawer Brand Header */}
              <View style={styles.drawerHeader}>
                <View style={styles.drawerBrandRow}>
                  <View style={styles.drawerLogoIcon}>
                    <Text style={{ fontSize: 22 }}>🏥</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.drawerBrandTitle}>Medical HMS</Text>
                    <Text style={styles.drawerBrandSub}>Enterprise Admin Portal</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.drawerCloseBtn}
                    onPress={() => setIsSidebarOpen(false)}
                  >
                    <Text style={styles.drawerCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>

                {/* Logged-in Admin Card */}
                <TouchableOpacity
                  style={styles.drawerUserCard}
                  onPress={() => {
                    setIsSidebarOpen(false);
                    navigation?.navigate('Profile');
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.drawerUserAvatar}>
                    {user?.avatar && (user.avatar.startsWith('http') || user.avatar.startsWith('data:')) ? (
                      <Image source={{ uri: user.avatar }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                    ) : (
                      <Text style={styles.drawerUserAvatarText}>
                        {user?.avatar || (user?.name || 'A').charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.drawerUserName}>{user?.name || 'System Admin'}</Text>
                    <Text style={styles.drawerUserEmail}>{user?.email || 'admin@admin.com'}</Text>
                    <View style={styles.drawerRoleBadge}>
                      <Text style={styles.drawerRoleText}>🛡️ {String(user?.role || 'SUPERADMIN').toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 16, color: '#4f46e5' }}>⚙️</Text>
                </TouchableOpacity>
              </View>

              {/* Navigation Menu Links */}
              <ScrollView
                style={styles.drawerNavScroll}
                contentContainerStyle={styles.drawerNavScrollContent}
                showsVerticalScrollIndicator={false}
                bounces={true}
              >
                <Text style={styles.drawerSectionLabel}>MAIN NAVIGATION</Text>

                {MENU_ITEMS.map(item => {
                  const isActive = activeTab === item.key;
                  let badgeCount = null;
                  if (item.key === 'staff') badgeCount = stats.totalUsers;
                  if (item.key === 'units') badgeCount = stats.totalUnits;
                  if (item.key === 'roles') badgeCount = stats.totalRoles;

                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.drawerNavItem, isActive && styles.drawerNavItemActive]}
                      onPress={() => {
                        setActiveTab(item.key);
                        setIsSidebarOpen(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.drawerNavIconWrap, isActive && styles.drawerNavIconWrapActive]}>
                        <Text style={styles.drawerNavEmoji}>{item.icon}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.drawerNavText, isActive && styles.drawerNavTextActive]}>
                          {item.label}
                        </Text>
                        <Text style={styles.drawerNavDesc}>{item.desc}</Text>
                      </View>
                      {badgeCount !== null ? (
                        <View style={[styles.drawerCountPill, isActive && styles.drawerCountPillActive]}>
                          <Text style={[styles.drawerCountText, isActive && styles.drawerCountTextActive]}>
                            {badgeCount}
                          </Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}

                <Text style={styles.drawerSectionLabel}>DIRECT ACTIONS</Text>

                <TouchableOpacity
                  style={styles.drawerActionItem}
                  onPress={() => {
                    setIsSidebarOpen(false);
                    setActiveTab('units');
                    setShowAddUnitModal(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.drawerActionIcon}>➕</Text>
                  <Text style={styles.drawerActionText}>Provision Hospital / Unit</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.drawerActionItem}
                  onPress={() => {
                    setIsSidebarOpen(false);
                    setActiveTab('staff');
                    setShowAddStaffModal(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.drawerActionIcon}>➕</Text>
                  <Text style={styles.drawerActionText}>Enroll Doctor / Staff</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.drawerActionItem}
                  onPress={() => {
                    setIsSidebarOpen(false);
                    setActiveTab('roles');
                    setShowAddRoleModal(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.drawerActionIcon}>➕</Text>
                  <Text style={styles.drawerActionText}>Create Access Role</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.drawerActionItem, { marginTop: 12, borderWidth: 1, borderColor: '#c7d2fe', backgroundColor: '#eef2ff', paddingVertical: 11 }]}
                  onPress={() => {
                    setIsSidebarOpen(false);
                    navigation?.navigate('Profile');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.drawerActionIcon}>👤</Text>
                  <Text style={[styles.drawerActionText, { color: '#4f46e5' }]}>Account Profile Settings</Text>
                </TouchableOpacity>
              </ScrollView>

              {/* Drawer Bottom Footer */}
              <View style={styles.drawerFooter}>
                <TouchableOpacity
                  style={styles.drawerLogoutBtn}
                  onPress={() => {
                    setIsSidebarOpen(false);
                    logout();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.drawerLogoutText}>🚪 Sign Out of Admin Portal</Text>
                </TouchableOpacity>
                <Text style={styles.drawerVersionText}>Medical HMS · Enterprise v2.4</Text>
              </View>

            </SafeAreaView>
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
    backgroundColor: '#faf5ff',
    borderColor: '#e9d5ff',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  headerRoleBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#7c3aed',
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
    marginRight: 12,
  },
  drawerBrandTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.3,
  },
  drawerBrandSub: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  drawerCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerCloseText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '700',
  },
  drawerUserCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  drawerUserAvatar: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  drawerUserAvatarText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  drawerUserName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  drawerUserEmail: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  drawerRoleBadge: {
    marginTop: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#faf5ff',
    borderColor: '#e9d5ff',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  drawerRoleText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7c3aed',
  },
  drawerNavScroll: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  drawerNavScrollContent: {
    paddingBottom: 80,
  },
  drawerSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 10,
  },
  drawerNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: '#ffffff',
  },
  drawerNavItemActive: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  drawerNavIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  drawerNavIconWrapActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  drawerNavEmoji: {
    fontSize: 16,
  },
  drawerNavText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  drawerNavTextActive: {
    color: '#0284c7',
  },
  drawerNavDesc: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 1,
  },
  drawerCountPill: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  drawerCountPillActive: {
    backgroundColor: '#0284c7',
  },
  drawerCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  drawerCountTextActive: {
    color: '#ffffff',
  },
  drawerActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 10,
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
    color: '#334155',
    fontWeight: '600',
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
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  drawerLogoutText: {
    color: '#e11d48',
    fontSize: 13,
    fontWeight: '800',
  },
  drawerVersionText: {
    fontSize: 10,
    color: '#94a3b8',
    textAlign: 'center',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 14,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
    marginTop: 8,
  },
  kpiCard: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  kpiIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  kpiEmoji: {
    fontSize: 18,
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  kpiLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginTop: 2,
  },
  kpiSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  deptCardList: {
    marginBottom: 20,
    gap: 10,
  },
  deptCardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  deptCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  deptCardEmoji: {
    fontSize: 18,
  },
  deptCardBody: {
    flex: 1,
  },
  deptCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  deptCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  deptStatusBadge: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  deptStatusText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#059669',
  },
  deptCardDesc: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 15,
  },
  actionRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
  },
  actionRowIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionRowEmoji: {
    fontSize: 20,
  },
  actionRowContent: {
    flex: 1,
  },
  actionRowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  actionRowSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  actionRowArrow: {
    fontSize: 16,
    color: '#94a3b8',
    fontWeight: 'bold',
  },
  tabSectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  primaryActionBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  primaryActionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryActionBtn: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  secondaryActionBtnText: {
    color: '#0284c7',
    fontSize: 13,
    fontWeight: '700',
  },
  filterChipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterChipActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0284c7',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  filterChipTextActive: {
    color: '#0284c7',
  },
  unitCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  unitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  unitName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  unitSubdomain: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  monoText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#0284c7',
    fontWeight: '700',
  },
  unitBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
  unitBadgeHosp: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  unitBadgeClinic: {
    backgroundColor: '#f0f9ff',
    borderColor: '#bae6fd',
  },
  unitBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  unitBadgeTextHosp: {
    color: '#059669',
  },
  unitBadgeTextClinic: {
    color: '#0284c7',
  },
  unitMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  unitMetaItem: {
    fontSize: 12,
    color: '#475569',
  },
  deptTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  deptTag: {
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  deptTagText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },
  facilityRow: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#f8fafc',
  },
  facilityNote: {
    fontSize: 11,
    color: '#64748b',
    fontStyle: 'italic',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  searchBoxIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
    padding: 0,
  },
  clearSearchText: {
    fontSize: 14,
    color: '#94a3b8',
    paddingHorizontal: 4,
  },
  staffCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  staffTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  staffAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  staffAvatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  staffInfo: {
    flex: 1,
  },
  staffName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  staffEmail: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  staffPhone: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
  },
  staffBadges: {
    alignItems: 'flex-end',
    gap: 4,
  },
  roleBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  roleBadgeDoc: { backgroundColor: '#e0f2fe' },
  roleBadgeAdmin: { backgroundColor: '#faf5ff' },
  roleBadgeRecep: { backgroundColor: '#f0fdf4' },
  roleBadgeLab: { backgroundColor: '#fffbeb' },
  roleBadgePharma: { backgroundColor: '#fff1f2' },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  activeStatusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pillActive: { backgroundColor: '#dcfce7' },
  pillInactive: { backgroundColor: '#fee2e2' },
  activeStatusText: { fontSize: 10, fontWeight: '700' },
  textActive: { color: '#15803d' },
  textInactive: { color: '#b91c1c' },
  staffDeptRow: {
    flexDirection: 'row',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  staffDeptLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  staffDeptValue: {
    fontSize: 11,
    color: '#0f172a',
    fontWeight: '600',
  },
  staffActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  staffActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  staffActionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  staffDeleteBtn: {
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  staffDeleteBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#dc2626',
  },
  roleCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  roleCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  roleTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  roleDesc: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  permCountBadge: {
    backgroundColor: '#e0f2fe',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  permCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0284c7',
  },
  permTagGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  permTag: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  permTagText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },
  auditLogCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
  },
  auditHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  auditDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  dotInfo: { backgroundColor: '#0284c7' },
  dotWarn: { backgroundColor: '#f59e0b' },
  dotCrit: { backgroundColor: '#ef4444' },
  auditAction: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  auditTime: {
    fontSize: 11,
    color: '#94a3b8',
  },
  auditUser: {
    fontSize: 12,
    color: '#475569',
  },
  auditTarget: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 10,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  emptySub: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  logoutBtn: {
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 30,
  },
  logoutText: {
    color: '#e11d48',
    fontSize: 14,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalDesc: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    marginBottom: 16,
  },
  formGroup: {
    marginBottom: 14,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
  },
  rolePickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  roleOptionChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  roleOptionChipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  roleOptionText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  roleOptionTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  modalCancelBtnText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
  },
  modalSubmitBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#0284c7',
  },
  modalSubmitBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
