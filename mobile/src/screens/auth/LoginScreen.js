// mobile/src/screens/auth/LoginScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { checkBackendHealth } from '../../services/api';
import { DEFAULT_LAN_API_URL } from '../../config/env';

const CLOUD_TUNNEL_PRESET = 'https://busy-foxes-march.loca.lt';

export default function LoginScreen() {
  const { login, loading, authError, clearError, serverUrl, updateServerUrl } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [clientError, setClientError] = useState('');

  // Server URL Configuration state
  const [showSettings, setShowSettings] = useState(false);
  const [inputUrl, setInputUrl] = useState(serverUrl || DEFAULT_LAN_API_URL);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [serverOnline, setServerOnline] = useState(null);

  // Sync inputUrl with active serverUrl
  useEffect(() => {
    if (serverUrl) {
      setInputUrl(serverUrl);
    }
  }, [serverUrl]);

  // Initial silent ping to display live server status
  useEffect(() => {
    let isMounted = true;
    checkBackendHealth(serverUrl).then(res => {
      if (isMounted) {
        setServerOnline(res.success);
      }
    });
    return () => { isMounted = false; };
  }, [serverUrl]);

  // If a network connection error occurs, automatically expand the server settings panel
  useEffect(() => {
    if (authError && (authError.includes('Unable to connect') || authError.includes('timed out'))) {
      setShowSettings(true);
    }
  }, [authError]);

  const handleLogin = async () => {
    setClientError('');
    if (!email.trim() || !password) {
      setClientError('Please enter both email address and password.');
      return;
    }
    await login(email, password, serverUrl);
  };

  const applyCredentials = (accEmail, accPassword) => {
    setEmail(accEmail);
    setPassword(accPassword);
    setClientError('');
    clearError();
  };

  const handleTestConnection = async () => {
    if (!inputUrl.trim()) return;
    setTesting(true);
    setTestResult(null);
    const result = await checkBackendHealth(inputUrl.trim());
    setTesting(false);
    setTestResult(result);
    if (result.success) {
      setServerOnline(true);
    } else {
      setServerOnline(false);
    }
  };

  const handleSaveUrl = async () => {
    if (!inputUrl.trim()) return;
    const clean = inputUrl.trim().replace(/\/$/, '');
    await updateServerUrl(clean);
    setTestResult({ success: true, message: `Active server updated to ${clean}` });
    clearError();
    // Verify health
    handleTestConnection();
  };

  const displayedError = clientError || authError;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardContainer}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          
          {/* Header & Logo */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Text style={styles.iconText}>🏥</Text>
            </View>
            <Text style={styles.appTitle}>Medical HMS</Text>
            <Text style={styles.appSubtitle}>Enterprise Hospital Management System</Text>
          </View>

          {/* Login Form Card */}
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Sign In to Your Account</Text>
            <Text style={styles.formDesc}>
              Select your role or enter credentials to open your portal
            </Text>

            {/* Action Error Alert */}
            {displayedError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorIcon}>⚠️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.errorText}>{displayedError}</Text>
                  {!showSettings && (
                    <TouchableOpacity
                      style={styles.errorActionBtn}
                      onPress={() => setShowSettings(true)}
                    >
                      <Text style={styles.errorActionBtnText}>⚙️ Configure Server Connection</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ) : null}

            {/* Email Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="name@hospital.com"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={(val) => {
                  setEmail(val);
                  if (clientError) setClientError('');
                  if (authError) clearError();
                }}
              />
            </View>

            {/* Password Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter password"
                placeholderTextColor="#94a3b8"
                secureTextEntry
                value={password}
                onChangeText={(val) => {
                  setPassword(val);
                  if (clientError) setClientError('');
                  if (authError) clearError();
                }}
              />
            </View>

            {/* Sign In Button */}
            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.loginBtnText}>Sign In & Open Panel</Text>
              )}
            </TouchableOpacity>

            {/* Quick-Fill Role Selector */}
            <View style={styles.quickFillSection}>
              <Text style={styles.quickFillLabel}>Quick Sign In Roles:</Text>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, styles.chipDoctor]}
                  onPress={() => applyCredentials('rajesh@crm.com', '123')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.chipTextDoctor}>🩺 Doctor</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.chip, styles.chipLab]}
                  onPress={() => applyCredentials('lab@crm.com', '123')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.chipTextLab}>🔬 Lab Tech</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.chip, styles.chipPharmacy]}
                  onPress={() => applyCredentials('pharmacy@crm.com', '123')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.chipTextPharmacy}>💊 Pharmacy</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.chip, styles.chipStaff]}
                  onPress={() => applyCredentials('reception@crm.com', '123')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.chipTextStaff}>📋 Staff / Front Desk</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.chip, styles.chipPatient]}
                  onPress={() => applyCredentials('patient@crm.com', '123')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.chipTextPatient}>👤 Patient</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.chip, styles.chipAdmin]}
                  onPress={() => applyCredentials('admin@admin.com', 'admin')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.chipTextAdmin}>🛡️ Admin</Text>
                </TouchableOpacity>
              </View>
            </View>

          </View>

          {/* Server Connection Status & Config Banner */}
          <View style={styles.serverSection}>
            <View style={styles.serverBar}>
              <View style={styles.serverBarLeft}>
                <View style={[
                  styles.statusDot,
                  serverOnline === true && styles.statusDotGreen,
                  serverOnline === false && styles.statusDotRed,
                  serverOnline === null && styles.statusDotGray
                ]} />
                <View style={styles.serverTextCol}>
                  <Text style={styles.serverLabel}>BACKEND SERVER</Text>
                  <Text style={styles.serverUrlText} numberOfLines={1}>{serverUrl}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.configToggleBtn}
                onPress={() => setShowSettings(!showSettings)}
                activeOpacity={0.7}
              >
                <Text style={styles.configToggleText}>{showSettings ? '▲ Close' : '⚙️ Network'}</Text>
              </TouchableOpacity>
            </View>

            {/* Expandable Settings Card */}
            {showSettings && (
              <View style={styles.settingsCard}>
                <Text style={styles.settingsTitle}>Server Connection Settings</Text>
                <Text style={styles.settingsSubtitle}>
                  Connect your phone to the same Wi-Fi as your computer, or use the Cloud Tunnel URL if using 4G Mobile Data.
                </Text>

                <View style={styles.urlInputRow}>
                  <TextInput
                    style={styles.urlInput}
                    value={inputUrl}
                    onChangeText={setInputUrl}
                    placeholder="http://192.168.1.28:3000"
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                {/* Quick Presets */}
                <View style={styles.presetContainer}>
                  <Text style={styles.presetLabel}>Quick Presets:</Text>
                  <View style={styles.presetRow}>
                    <TouchableOpacity
                      style={styles.presetBtn}
                      onPress={() => setInputUrl(DEFAULT_LAN_API_URL)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.presetBtnText}>🏠 Local Wi-Fi (192.168.1.28)</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.presetBtn, styles.presetBtnTunnel]}
                      onPress={() => setInputUrl(CLOUD_TUNNEL_PRESET)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.presetBtnTextTunnel}>🌐 Cloud Tunnel (4G/Remote)</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Action Buttons */}
                <View style={styles.settingsActionRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.testBtn]}
                    onPress={handleTestConnection}
                    disabled={testing}
                    activeOpacity={0.7}
                  >
                    {testing ? (
                      <ActivityIndicator size="small" color="#0284c7" />
                    ) : (
                      <Text style={styles.testBtnText}>⚡ Test Connection</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.saveBtn]}
                    onPress={handleSaveUrl}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.saveBtnText}>💾 Apply Server</Text>
                  </TouchableOpacity>
                </View>

                {/* Test Feedback Box */}
                {testResult && (
                  <View style={[
                    styles.resultBox,
                    testResult.success ? styles.resultBoxSuccess : styles.resultBoxError
                  ]}>
                    <Text style={[
                      styles.resultText,
                      testResult.success ? styles.resultTextSuccess : styles.resultTextError
                    ]}>
                      {testResult.success
                        ? `✅ Connected! Latency: ${testResult.latencyMs || 25}ms (DB: ${testResult.database || 'CONNECTED'})`
                        : `❌ Unreachable: ${testResult.error || 'Connection failed'}. Check Wi-Fi or tunnel.`}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  iconText: {
    fontSize: 32,
  },
  appTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  appSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
    fontWeight: '500',
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 3,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  formDesc: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 18,
    lineHeight: 18,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  errorIcon: {
    fontSize: 16,
    marginTop: 1,
  },
  errorText: {
    fontSize: 13,
    color: '#dc2626',
    fontWeight: '600',
    lineHeight: 18,
  },
  errorActionBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#fee2e2',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  errorActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b91c1c',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
  },
  loginBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  loginBtnDisabled: {
    backgroundColor: '#94a3b8',
    shadowOpacity: 0,
    elevation: 0,
  },
  loginBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  quickFillSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  quickFillLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipDoctor: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  chipTextDoctor: {
    color: '#16a34a',
    fontSize: 12,
    fontWeight: '700',
  },
  chipLab: {
    backgroundColor: '#f0fdfa',
    borderColor: '#99f6e4',
  },
  chipTextLab: {
    color: '#0d9488',
    fontSize: 12,
    fontWeight: '700',
  },
  chipPharmacy: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  chipTextPharmacy: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '700',
  },
  chipStaff: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  chipTextStaff: {
    color: '#15803d',
    fontSize: 12,
    fontWeight: '700',
  },
  chipPatient: {
    backgroundColor: '#fefce8',
    borderColor: '#fef08a',
  },
  chipTextPatient: {
    color: '#ca8a04',
    fontSize: 12,
    fontWeight: '700',
  },
  chipAdmin: {
    backgroundColor: '#faf5ff',
    borderColor: '#e9d5ff',
  },
  chipTextAdmin: {
    color: '#9333ea',
    fontSize: 12,
    fontWeight: '700',
  },
  // Server Section Styles
  serverSection: {
    marginTop: 16,
  },
  serverBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  serverBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
    marginRight: 10,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusDotGreen: {
    backgroundColor: '#22c55e',
  },
  statusDotRed: {
    backgroundColor: '#ef4444',
  },
  statusDotGray: {
    backgroundColor: '#94a3b8',
  },
  serverTextCol: {
    flex: 1,
  },
  serverLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.5,
  },
  serverUrlText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  configToggleBtn: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  configToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  settingsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  settingsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  settingsSubtitle: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 16,
    marginBottom: 12,
  },
  urlInputRow: {
    marginBottom: 10,
  },
  urlInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0f172a',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  presetContainer: {
    marginBottom: 12,
  },
  presetLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 6,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetBtn: {
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  presetBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  presetBtnTunnel: {
    backgroundColor: '#f0f9ff',
    borderColor: '#bae6fd',
  },
  presetBtnTextTunnel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0284c7',
  },
  settingsActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testBtn: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  testBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0284c7',
  },
  saveBtn: {
    backgroundColor: '#0284c7',
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  resultBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  resultBoxSuccess: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  resultBoxError: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  resultText: {
    fontSize: 12,
    fontWeight: '600',
  },
  resultTextSuccess: {
    color: '#15803d',
  },
  resultTextError: {
    color: '#b91c1c',
  },
});
