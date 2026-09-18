// mobile/src/screens/common/ProfileScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Image,
  StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, normalizeRole } from '../../context/AuthContext';
import {
  fetchUserProfileApi,
  updateUserProfileApi,
  changeUserPasswordApi
} from '../../services/api';

const AVATAR_PRESETS = [
  '🔬', '🧪', '👨‍⚕️', '👩‍⚕️', '🩺', '💊', '💉', '🧑‍🔬',
  '🧑‍⚕️', '🧑‍💼', '🏥', '📋', '🧬', '🩸', '🛡️', '👤'
];

export default function ProfileScreen({ navigation }) {
  const { user, token, logout, updateUser } = useAuth();

  // ── Form State ──
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    avatar: user?.avatar || ''
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // ── Password Visibility Toggles ──
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // ── UI / Loading State ──
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');

  // Sync initial user data
  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        avatar: user.avatar || ''
      });
    }
  }, [user]);

  // Fetch full profile from backend on mount
  useEffect(() => {
    let isMounted = true;
    async function loadLatestProfile() {
      if (!token) return;
      const res = await fetchUserProfileApi(token);
      if (res.success && res.user && isMounted) {
        setFormData({
          name: res.user.name || '',
          email: res.user.email || '',
          phone: res.user.phone || '',
          avatar: res.user.avatar || ''
        });
        updateUser(res.user);
      }
    }
    loadLatestProfile();
    return () => { isMounted = false; };
  }, [token]);

  // Clear notifications on input
  const handleInputChange = (field, val) => {
    if (field === 'phone') {
      val = val.replace(/\D/g, '').slice(0, 10);
    }
    setFormData(prev => ({ ...prev, [field]: val }));
    setSuccessMsg('');
    setErrorMsg('');
  };

  const handlePasswordChange = (field, val) => {
    setPasswordData(prev => ({ ...prev, [field]: val }));
    setSuccessMsg('');
    setErrorMsg('');
  };

  // ── Save Personal Details ──
  const handleSaveProfile = async () => {
    if (!formData.name.trim()) {
      setErrorMsg('Display name is required.');
      return;
    }
    if (!formData.email.trim()) {
      setErrorMsg('Email address is required.');
      return;
    }

    setSavingProfile(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await updateUserProfileApi(token, formData);
      if (res.success) {
        updateUser(res.user || formData);
        setSuccessMsg('Profile updated successfully. Changes are now visible across all panels.');
      } else {
        setErrorMsg(res.message || 'Failed to update profile.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Network error updating profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  // ── Update Password ──
  const handleUpdatePassword = async () => {
    setErrorMsg('');
    setSuccessMsg('');

    if (!passwordData.currentPassword) {
      setErrorMsg('Please enter your current password.');
      return;
    }
    if (!passwordData.newPassword) {
      setErrorMsg('Please enter a new password.');
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setErrorMsg('New passwords do not match.');
      return;
    }
    if (passwordData.newPassword.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }
    if (!/[a-zA-Z]/.test(passwordData.newPassword)) {
      setErrorMsg('Password must contain at least one letter.');
      return;
    }
    if (!/[0-9]/.test(passwordData.newPassword)) {
      setErrorMsg('Password must contain at least one number.');
      return;
    }

    setSavingPassword(true);
    try {
      const res = await changeUserPasswordApi(
        token,
        passwordData.currentPassword,
        passwordData.newPassword
      );
      if (res.success) {
        setSuccessMsg('Password changed successfully.');
        setPasswordData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
      } else {
        setErrorMsg(res.message || 'Failed to change password. Please check your current password.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Network error changing password.');
    } finally {
      setSavingPassword(false);
    }
  };

  // ── Avatar Helpers ──
  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  const handleSelectAvatarPreset = async (emoji) => {
    setFormData(prev => ({ ...prev, avatar: emoji }));
    setShowAvatarPicker(false);
    // Auto-save avatar to DB
    const res = await updateUserProfileApi(token, { ...formData, avatar: emoji });
    if (res.success) {
      updateUser({ avatar: emoji });
      setSuccessMsg('Avatar icon updated and saved.');
    }
  };

  const handleSaveCustomAvatarUrl = async () => {
    if (!customAvatarUrl.trim()) return;
    const url = customAvatarUrl.trim();
    setFormData(prev => ({ ...prev, avatar: url }));
    setShowAvatarPicker(false);
    setCustomAvatarUrl('');
    const res = await updateUserProfileApi(token, { ...formData, avatar: url });
    if (res.success) {
      updateUser({ avatar: url });
      setSuccessMsg('Profile photo updated and saved.');
    }
  };

  // Compute display role
  const rawRole = String(user?.role || '').toLowerCase();
  const normalizedRole = normalizeRole(user?.role, user);
  
  let roleDisplayName = 'USER';
  let themeColor = '#0d9488'; // teal default for lab
  let controlScope = (user?.role || 'Staff').toUpperCase();

  if (normalizedRole === 'lab') {
    roleDisplayName = 'LAB TECHNICIAN';
    themeColor = '#0d9488';
    controlScope = 'LAB TECHNICIAN';
  } else if (normalizedRole === 'doctor') {
    roleDisplayName = 'DOCTOR';
    themeColor = '#2563eb';
    controlScope = 'PHYSICIAN / DOCTOR';
  } else if (normalizedRole === 'admin') {
    roleDisplayName = 'SYSTEM ADMIN';
    themeColor = '#4f46e5';
    controlScope = 'GLOBAL OVERLORD';
  } else if (normalizedRole === 'pharmacy') {
    roleDisplayName = 'PHARMACIST';
    themeColor = '#0891b2';
    controlScope = 'PHARMACY DISPENSARY';
  } else if (normalizedRole === 'staff') {
    roleDisplayName = 'FRONT DESK';
    themeColor = '#059669';
    controlScope = 'RECEPTION & REGISTRATION';
  } else if (normalizedRole === 'patient') {
    roleDisplayName = 'PATIENT';
    themeColor = '#0284c7';
    controlScope = 'PATIENT ACCESS';
  }

  const sessionLifetime = ['patient', 'billing'].includes(rawRole) ? '8 HOURS' : '45 MINUTES';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

      {/* ── TOP HEADER / NAV BAR ── */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (navigation?.canGoBack && navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate(`${normalizedRole.charAt(0).toUpperCase() + normalizedRole.slice(1)}Dashboard`);
            }
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.backBtnArrow}>←</Text>
          <Text style={styles.backBtnText}>Dashboard</Text>
        </TouchableOpacity>

        <View style={styles.topBarRight}>
          <View style={[styles.rolePillTop, { backgroundColor: `${themeColor}15`, borderColor: `${themeColor}40` }]}>
            <Text style={[styles.rolePillTopText, { color: themeColor }]}>
              {roleDisplayName} PROFILE
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* ── SCREEN TITLE HEADER ── */}
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>👤 Account Profile Settings</Text>
          <Text style={styles.pageSubtitle}>
            Manage your account credentials, avatar, and active control session
          </Text>
        </View>

        {/* ── ALERTS ── */}
        {successMsg ? (
          <View style={styles.successAlert}>
            <Text style={styles.alertIcon}>✅</Text>
            <Text style={styles.successAlertText}>{successMsg}</Text>
          </View>
        ) : null}

        {errorMsg ? (
          <View style={styles.errorAlert}>
            <Text style={styles.alertIcon}>⚠️</Text>
            <Text style={styles.errorAlertText}>{errorMsg}</Text>
          </View>
        ) : null}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── CARD 1: PROFILE SUMMARY & IDENTITY ──────────────────────────── */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <View style={styles.card}>
          <View style={styles.identityRow}>
            {/* Avatar Circle */}
            <View style={styles.avatarSection}>
              <View style={[styles.avatarCircle, { backgroundColor: themeColor }]}>
                {formData.avatar && (formData.avatar.startsWith('http') || formData.avatar.startsWith('data:')) ? (
                  <Image source={{ uri: formData.avatar }} style={styles.avatarImg} />
                ) : (
                  <Text style={styles.avatarText}>
                    {formData.avatar ? formData.avatar : getInitials(formData.name)}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.changePhotoBtn}
                onPress={() => setShowAvatarPicker(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.changePhotoBtnText}>📷 Change Photo</Text>
              </TouchableOpacity>
            </View>

            {/* Meta Info */}
            <View style={styles.identityMeta}>
              <Text style={styles.userName}>{formData.name || 'User Profile'}</Text>
              <Text style={styles.userEmail}>{formData.email || 'user@crm.com'}</Text>

              <View style={[styles.roleBadge, { backgroundColor: `${themeColor}18`, borderColor: `${themeColor}50` }]}>
                <Text style={[styles.roleBadgeText, { color: themeColor }]}>
                  {roleDisplayName}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.terminateBtn}
                onPress={logout}
                activeOpacity={0.8}
              >
                <Text style={styles.terminateBtnText}>🚪 Terminate Session</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── CARD 2: SECURITY & ACCESS LEVEL ─────────────────────────────── */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>🔒 Security & Access Level</Text>
          </View>

          <View style={styles.securityGrid}>
            <View style={styles.securityItem}>
              <Text style={styles.securityLabel}>Control Scope</Text>
              <Text style={[styles.securityValue, { color: themeColor }]}>
                {controlScope}
              </Text>
            </View>

            <View style={styles.securityDivider} />

            <View style={styles.securityItem}>
              <Text style={styles.securityLabel}>MFA Authentication</Text>
              <View style={styles.mfaBadge}>
                <View style={styles.greenDot} />
                <Text style={styles.mfaText}>ACTIVE</Text>
              </View>
            </View>

            <View style={styles.securityDivider} />

            <View style={styles.securityItem}>
              <Text style={styles.securityLabel}>Session Lifetime</Text>
              <Text style={styles.securityValueDark}>{sessionLifetime}</Text>
            </View>
          </View>
        </View>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── CARD 3: PERSONAL DETAILS ────────────────────────────────────── */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>📋 Personal Details</Text>
          </View>

          {/* Field: Display Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Display Name *</Text>
            <View style={styles.inputWrapper}>
              <Text style={styles.inputIcon}>👤</Text>
              <TextInput
                style={styles.textInput}
                value={formData.name}
                onChangeText={(v) => handleInputChange('name', v)}
                placeholder="Enter full name"
                placeholderTextColor="#94a3b8"
              />
            </View>
          </View>

          {/* Field: Email Address */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email Address *</Text>
            <View style={styles.inputWrapper}>
              <Text style={styles.inputIcon}>✉️</Text>
              <TextInput
                style={styles.textInput}
                value={formData.email}
                onChangeText={(v) => handleInputChange('email', v)}
                placeholder="Enter email address"
                placeholderTextColor="#94a3b8"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* Field: Phone Number */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Phone Number</Text>
            <View style={styles.inputWrapper}>
              <Text style={styles.inputIcon}>📞</Text>
              <TextInput
                style={styles.textInput}
                value={formData.phone}
                onChangeText={(v) => handleInputChange('phone', v)}
                placeholder="10-digit phone number"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
                maxLength={10}
              />
            </View>
          </View>

          {/* Field: Access Domain */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Access Domain</Text>
            <View style={[styles.inputWrapper, styles.inputDisabled]}>
              <Text style={styles.inputIcon}>🌐</Text>
              <TextInput
                style={[styles.textInput, styles.textInputDisabled]}
                value="localhost:5173"
                editable={false}
              />
              <Text style={styles.disabledLock}>🔒</Text>
            </View>
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: themeColor }]}
            onPress={handleSaveProfile}
            disabled={savingProfile}
            activeOpacity={0.8}
          >
            {savingProfile ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.actionBtnText}>💾 Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── CARD 4: UPDATE SECRET CREDENTIALS ────────────────────────────── */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>🔑 Update Secret Credentials</Text>
          </View>

          {/* Current Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Current Password *</Text>
            <View style={styles.inputWrapper}>
              <Text style={styles.inputIcon}>🔒</Text>
              <TextInput
                style={styles.textInput}
                value={passwordData.currentPassword}
                onChangeText={(v) => handlePasswordChange('currentPassword', v)}
                placeholder="••••••••"
                placeholderTextColor="#94a3b8"
                secureTextEntry={!showCurrentPw}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowCurrentPw(!showCurrentPw)}
              >
                <Text style={styles.eyeIcon}>{showCurrentPw ? '👁️' : '👁️‍🗨️'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* New Secret Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>New Secret Password *</Text>
            <View style={styles.inputWrapper}>
              <Text style={styles.inputIcon}>🔑</Text>
              <TextInput
                style={styles.textInput}
                value={passwordData.newPassword}
                onChangeText={(v) => handlePasswordChange('newPassword', v)}
                placeholder="••••••••"
                placeholderTextColor="#94a3b8"
                secureTextEntry={!showNewPw}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowNewPw(!showNewPw)}
              >
                <Text style={styles.eyeIcon}>{showNewPw ? '👁️' : '👁️‍🗨️'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.inputHelperText}>
              Must be at least 8 characters, with at least 1 letter and 1 number.
            </Text>
          </View>

          {/* Confirm New Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Confirm New Password *</Text>
            <View style={styles.inputWrapper}>
              <Text style={styles.inputIcon}>🔑</Text>
              <TextInput
                style={styles.textInput}
                value={passwordData.confirmPassword}
                onChangeText={(v) => handlePasswordChange('confirmPassword', v)}
                placeholder="••••••••"
                placeholderTextColor="#94a3b8"
                secureTextEntry={!showConfirmPw}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowConfirmPw(!showConfirmPw)}
              >
                <Text style={styles.eyeIcon}>{showConfirmPw ? '👁️' : '👁️‍🗨️'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Update Password Button */}
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: themeColor }]}
            onPress={handleUpdatePassword}
            disabled={savingPassword}
            activeOpacity={0.8}
          >
            {savingPassword ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.actionBtnText}>🔑 Update Password</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── AVATAR / PHOTO PICKER MODAL ── */}
      <Modal visible={showAvatarPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Avatar / Photo</Text>
              <TouchableOpacity onPress={() => setShowAvatarPicker(false)}>
                <Text style={styles.modalCloseBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>Choose a clinical avatar emoji:</Text>
            <View style={styles.avatarGrid}>
              {AVATAR_PRESETS.map((emoji, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.avatarPresetBtn}
                  onPress={() => handleSelectAvatarPreset(emoji)}
                >
                  <Text style={styles.avatarPresetEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.modalSub, { marginTop: 16 }]}>Or enter photo image URL:</Text>
            <View style={styles.urlInputRow}>
              <TextInput
                style={styles.urlInput}
                placeholder="https://example.com/photo.jpg"
                placeholderTextColor="#94a3b8"
                value={customAvatarUrl}
                onChangeText={setCustomAvatarUrl}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={[styles.urlSaveBtn, { backgroundColor: themeColor }]}
                onPress={handleSaveCustomAvatarUrl}
              >
                <Text style={styles.urlSaveBtnText}>Set</Text>
              </TouchableOpacity>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  backBtnArrow: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginRight: 6,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rolePillTop: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  rolePillTopText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  contentScroll: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  pageHeader: {
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  },
  successAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  successAlertText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#166534',
    marginLeft: 8,
  },
  errorAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  errorAlertText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#991b1b',
    marginLeft: 8,
  },
  alertIcon: {
    fontSize: 16,
  },

  // ── Card Styles ──
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderRow: {
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },

  // ── Card 1: Identity ──
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarSection: {
    alignItems: 'center',
    marginRight: 16,
  },
  avatarCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  avatarImg: {
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
  },
  changePhotoBtn: {
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  changePhotoBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  identityMeta: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 8,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 10,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  terminateBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  terminateBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b91c1c',
  },

  // ── Card 2: Security & Access Level ──
  securityGrid: {
    gap: 10,
  },
  securityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  securityLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  securityValue: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  securityValueDark: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  securityDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
  },
  mfaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#f0fdf4',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16a34a',
    marginRight: 6,
  },
  mfaText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#16a34a',
  },

  // ── Card 3 & 4: Forms ──
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
  },
  inputDisabled: {
    backgroundColor: '#f1f5f9',
    borderColor: '#e2e8f0',
  },
  inputIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
    paddingVertical: 0,
  },
  textInputDisabled: {
    color: '#94a3b8',
    fontWeight: '500',
  },
  disabledLock: {
    fontSize: 12,
  },
  inputHelperText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
  },
  eyeBtn: {
    padding: 6,
  },
  eyeIcon: {
    fontSize: 14,
  },
  actionBtn: {
    height: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
  },

  // ── Avatar Picker Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalCloseBtn: {
    fontSize: 18,
    fontWeight: '700',
    color: '#64748b',
    padding: 4,
  },
  modalSub: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 10,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  avatarPresetBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  avatarPresetEmoji: {
    fontSize: 24,
  },
  urlInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  urlInput: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  urlSaveBtn: {
    paddingHorizontal: 16,
    height: 42,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  urlSaveBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
});
