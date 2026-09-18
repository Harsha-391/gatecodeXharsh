// mobile/src/navigation/RootNavigator.js
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';

// Screens
import LoginScreen from '../screens/auth/LoginScreen';
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import DoctorDashboardScreen from '../screens/doctor/DoctorDashboardScreen';
import LabDashboardScreen from '../screens/lab/LabDashboardScreen';
import PharmacyDashboardScreen from '../screens/pharmacy/PharmacyDashboardScreen';
import PatientDashboardScreen from '../screens/patient/PatientDashboardScreen';
import StaffDashboardScreen from '../screens/staff/StaffDashboardScreen';
import ProfileScreen from '../screens/common/ProfileScreen';

const Stack = createNativeStackNavigator();

function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}

function AdminNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}

function DoctorNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="DoctorDashboard" component={DoctorDashboardScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}

function LabNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="LabDashboard" component={LabDashboardScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}

function PharmacyNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="PharmacyDashboard" component={PharmacyDashboardScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}

function PatientNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="PatientDashboard" component={PatientDashboardScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}

function StaffNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="StaffDashboard" component={StaffDashboardScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}

/**
 * Root Navigator with dynamic role-based routing.
 * Routes an authenticated user to their designated panel:
 * - Admin -> AdminNavigator
 * - Doctor -> DoctorNavigator
 * - Lab -> LabNavigator
 * - Pharmacy -> PharmacyNavigator
 * - Patient -> PatientNavigator
 * - Staff/Reception -> StaffNavigator
 * If unauthenticated, displays the AuthNavigator.
 */
export default function RootNavigator() {
  const { isAuthenticated, activeRole } = useAuth();

  return (
    <NavigationContainer>
      {!isAuthenticated ? (
        <AuthNavigator />
      ) : activeRole === 'admin' ? (
        <AdminNavigator />
      ) : activeRole === 'doctor' ? (
        <DoctorNavigator />
      ) : activeRole === 'lab' ? (
        <LabNavigator />
      ) : activeRole === 'pharmacy' ? (
        <PharmacyNavigator />
      ) : activeRole === 'patient' ? (
        <PatientNavigator />
      ) : (
        <StaffNavigator />
      )}
    </NavigationContainer>
  );
}
