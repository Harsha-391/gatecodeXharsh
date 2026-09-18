// mobile/src/screens/pharmacy/PharmacyDashboardScreen.js
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
  fetchPharmacyOrders,
  completePharmacyOrder,
  fetchPharmacyInventory,
  addPharmacyMedicine,
  updatePharmacyInventoryItem
} from '../../services/api';

export default function PharmacyDashboardScreen({ navigation }) {
  const { user, token, logout } = useAuth();

  // ── Navigation & Drawer State ──
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'inventory'
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);

  // ── Data State ──
  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);

  // ── Filter State ──
  const [orderFilter, setOrderFilter] = useState('ALL'); // 'ALL' | 'PENDING' | 'COMPLETED'
  const [searchQuery, setSearchQuery] = useState('');

  // ── Modals State ──
  // 1. Dispense Order Modal
  const [showDispenseModal, setShowDispenseModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [purchasedIndices, setPurchasedIndices] = useState([]);
  const [itemQuantities, setItemQuantities] = useState({});
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [savingDispense, setSavingDispense] = useState(false);

  // 2. Add Medicine Modal
  const [showAddMedModal, setShowAddMedModal] = useState(false);
  const [medForm, setMedForm] = useState({
    name: '',
    category: 'Tablets',
    quantity: '100',
    unitCost: '15',
    sellingPrice: '25',
    batchNumber: 'B-2026',
    expiryDate: '2027-12-31'
  });
  const [savingMed, setSavingMed] = useState(false);

  // ── Feedback Toast Helper ──
  const showNotification = (type, text) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  // ── Loaders ──
  const loadOrdersData = useCallback(async () => {
    if (!token) return;
    const res = await fetchPharmacyOrders(token);
    if (res.success) {
      setOrders(res.orders);
    }
  }, [token]);

  const loadInventoryData = useCallback(async () => {
    if (!token) return;
    const res = await fetchPharmacyInventory(token);
    if (res.success) {
      setInventory(res.inventory);
    }
  }, [token]);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadOrdersData(), loadInventoryData()]);
    setLoading(false);
  }, [loadOrdersData, loadInventoryData]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadOrdersData(), loadInventoryData()]);
    setRefreshing(false);
  };

  // ── Open Dispense Modal ──
  const handleOpenDispense = (order) => {
    setSelectedOrder(order);
    const indices = (order.items || []).map((_, i) => i);
    setPurchasedIndices(indices);
    const qtyMap = {};
    (order.items || []).forEach((item, i) => {
      qtyMap[i] = String(item.quantity || 1);
    });
    setItemQuantities(qtyMap);
    setPaymentMethod('Cash');
    setShowDispenseModal(true);
  };

  // ── Toggle Item Purchase in Dispense ──
  const toggleItemPurchase = (index) => {
    setPurchasedIndices(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  // ── Submit Dispense & Billing ──
  const handleSaveDispense = async () => {
    if (purchasedIndices.length === 0) {
      Alert.alert('Validation', 'Please select at least one medicine to dispense.');
      return;
    }
    setSavingDispense(true);
    const res = await completePharmacyOrder(
      selectedOrder._id,
      {
        purchasedIndices,
        itemQuantities,
        paymentMethod
      },
      token
    );
    setSavingDispense(false);

    if (res.success) {
      setShowDispenseModal(false);
      showNotification('success', `Prescription dispensed for ${selectedOrder.userId?.name || selectedOrder.patientId}.`);
      loadOrdersData();
      loadInventoryData();
    } else {
      Alert.alert('Error', res.message || 'Failed to complete order dispensing.');
    }
  };

  // ── Add Medicine Stock ──
  const handleAddMedicine = async () => {
    if (!medForm.name.trim()) {
      Alert.alert('Validation', 'Medicine name is required.');
      return;
    }
    setSavingMed(true);
    const res = await addPharmacyMedicine({
      name: medForm.name.trim(),
      category: medForm.category,
      quantity: Number(medForm.quantity) || 0,
      unitCost: Number(medForm.unitCost) || 0,
      sellingPrice: Number(medForm.sellingPrice) || 0,
      batchNumber: medForm.batchNumber,
      expiryDate: medForm.expiryDate
    }, token);
    setSavingMed(false);

    if (res.success) {
      setShowAddMedModal(false);
      setMedForm({ name: '', category: 'Tablets', quantity: '100', unitCost: '15', sellingPrice: '25', batchNumber: 'B-2026', expiryDate: '2027-12-31' });
      showNotification('success', `Added "${res.data?.name || medForm.name}" to inventory.`);
      loadInventoryData();
    } else {
      Alert.alert('Error', res.message || 'Failed to add medicine.');
    }
  };

  // ── Stock Adjust Quick Action ──
  const handleQuickAddStock = (item) => {
    Alert.prompt
      ? Alert.prompt(
          'Add Stock Units',
          `Enter number of units to add to "${item.name}":`,
          async (text) => {
            const added = Number(text);
            if (!isNaN(added) && added > 0) {
              const res = await updatePharmacyInventoryItem(item._id, { quantity: (item.quantity || 0) + added }, token);
              if (res.success) {
                showNotification('success', `Added ${added} units to ${item.name}.`);
                loadInventoryData();
              }
            }
          },
          'plain-text',
          '50'
        )
      : Alert.alert(
          'Quick Stock Restock',
          `Add 50 units to "${item.name}"?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Add +50 Units',
              onPress: async () => {
                const res = await updatePharmacyInventoryItem(item._id, { quantity: (item.quantity || 0) + 50 }, token);
                if (res.success) {
                  showNotification('success', `Stock updated for ${item.name}.`);
                  loadInventoryData();
                }
              }
            }
          ]
        );
  };

  // ── Compute Stats ──
  const pendingOrdersCount = orders.filter(o => o.orderStatus !== 'Completed').length;
  const completedOrdersCount = orders.filter(o => o.orderStatus === 'Completed').length;
  const lowStockCount = inventory.filter(i => (i.quantity || 0) <= 20).length;
  const totalStockItems = inventory.length;

  // ── Filtered Orders ──
  const filteredOrders = orders.filter(item => {
    const pName = (item.userId?.name || '').toLowerCase();
    const pId = (item.patientId || '').toLowerCase();
    const docName = (item.doctorId?.name || '').toLowerCase();
    const query = searchQuery.trim().toLowerCase();

    const matchesQuery = !query || pName.includes(query) || pId.includes(query) || docName.includes(query);
    if (!matchesQuery) return false;

    if (orderFilter === 'PENDING') return item.orderStatus !== 'Completed';
    if (orderFilter === 'COMPLETED') return item.orderStatus === 'Completed';
    return true;
  });

  // ── Filtered Inventory ──
  const filteredInventory = inventory.filter(item => {
    const name = (item.name || '').toLowerCase();
    const cat = (item.category || '').toLowerCase();
    const query = searchQuery.trim().toLowerCase();
    return !query || name.includes(query) || cat.includes(query);
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* ── TOP HEADER (Big height + Pharmacy Profile Card + Refresh) ── */}
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
            <View style={[styles.headerAdminAvatar, { backgroundColor: '#7c3aed' }]}>
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
                  {user?.name || 'Pharmacist'}
                </Text>
                <View style={[styles.headerRoleBadge, { backgroundColor: '#f5f3ff', borderColor: '#ddd6fe' }]}>
                  <Text style={[styles.headerRoleBadgeText, { color: '#7c3aed' }]}>PHARMACY</Text>
                </View>
              </View>
              <Text style={styles.headerAdminEmail} numberOfLines={1}>
                {user?.email || 'pharma@crm.com'}
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#7c3aed']} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* KPI CARDS */}
        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Pending Orders</Text>
            <Text style={[styles.kpiValue, { color: '#d97706' }]}>{pendingOrdersCount}</Text>
            <Text style={styles.kpiSub}>To Dispense</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Dispensed</Text>
            <Text style={[styles.kpiValue, { color: '#10b981' }]}>{completedOrdersCount}</Text>
            <Text style={styles.kpiSub}>Completed</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Medicine Stock</Text>
            <Text style={[styles.kpiValue, { color: '#0284c7' }]}>{totalStockItems}</Text>
            <Text style={styles.kpiSub}>Catalog Items</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Low Stock Alert</Text>
            <Text style={[styles.kpiValue, { color: lowStockCount > 0 ? '#ef4444' : '#10b981' }]}>{lowStockCount}</Text>
            <Text style={styles.kpiSub}>≤ 20 units</Text>
          </View>
        </View>

        {/* ── TAB 1: PRESCRIPTION ORDERS ── */}
        {activeTab === 'orders' && (
          <View>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>Prescription Orders</Text>
                <Text style={styles.sectionSub}>Doctor prescriptions awaiting fulfillment</Text>
              </View>
            </View>

            {/* Filter Chips */}
            <View style={styles.filterChipRow}>
              {['ALL', 'PENDING', 'COMPLETED'].map(f => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterChip, orderFilter === f && styles.filterChipActive]}
                  onPress={() => setOrderFilter(f)}
                >
                  <Text style={[styles.filterChipText, orderFilter === f && styles.filterChipTextActive]}>
                    {f === 'ALL' ? 'All Orders' : f === 'PENDING' ? 'Pending Dispense' : 'Dispensed'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Search Input */}
            <View style={styles.searchBox}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search by patient, MRN, or doctor..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor="#94a3b8"
              />
            </View>

            {/* Orders List */}
            {loading ? (
              <ActivityIndicator size="large" color="#7c3aed" style={{ marginTop: 24 }} />
            ) : filteredOrders.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>💊</Text>
                <Text style={styles.emptyTitle}>No prescription orders found</Text>
                <Text style={styles.emptySub}>Prescriptions issued by doctors will show here.</Text>
              </View>
            ) : (
              filteredOrders.map(order => {
                const isCompleted = order.orderStatus === 'Completed';
                const pName = order.userId?.name || order.patientId || 'Patient';
                const pId = order.patientId || order.userId?.patientId || 'MRN-PENDING';
                const itemsCount = (order.items || []).length;

                return (
                  <View key={order._id} style={styles.orderCard}>
                    <View style={styles.orderTopRow}>
                      <View style={styles.orderIdBadge}>
                        <Text style={styles.orderIdBadgeText}>{pId}</Text>
                      </View>
                      <View style={[styles.statusPill, isCompleted ? styles.statusPillCompleted : styles.statusPillPending]}>
                        <Text style={[styles.statusPillText, isCompleted ? styles.statusPillTextCompleted : styles.statusPillTextPending]}>
                          {isCompleted ? 'DISPENSED' : 'PENDING DISPENSE'}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.patientName}>{pName}</Text>
                    <Text style={styles.doctorSub}>Prescribed by: {order.doctorId?.name || 'Hospital Doctor'}</Text>

                    {/* Prescribed Items Preview */}
                    <View style={styles.itemsPreviewBox}>
                      {(order.items || []).slice(0, 3).map((item, idx) => (
                        <View key={idx} style={styles.itemPreviewRow}>
                          <Text style={styles.itemPreviewName}>• {item.medicineName}</Text>
                          <Text style={styles.itemPreviewDetail}>
                            {item.quantity ? `Qty: ${item.quantity}` : (item.dosage || '1 tab')}
                          </Text>
                        </View>
                      ))}
                      {itemsCount > 3 ? (
                        <Text style={styles.moreItemsText}>+ {itemsCount - 3} more prescribed items</Text>
                      ) : null}
                    </View>

                    <View style={styles.cardActionRow}>
                      <TouchableOpacity
                        style={[styles.primaryActionBtn, isCompleted && styles.viewDispensedBtn]}
                        onPress={() => handleOpenDispense(order)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.primaryActionBtnText, isCompleted && styles.viewDispensedBtnText]}>
                          {isCompleted ? 'View Dispensed Bill' : '💊 Dispense & Bill Order'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ── TAB 2: INVENTORY STOCK ── */}
        {activeTab === 'inventory' && (
          <View>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>Medicine Inventory</Text>
                <Text style={styles.sectionSub}>Drug stock levels, batch codes & pricing</Text>
              </View>
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => setShowAddMedModal(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.addBtnText}>+ Add Medicine</Text>
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View style={styles.searchBox}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search drug catalog or category..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor="#94a3b8"
              />
            </View>

            {loading ? (
              <ActivityIndicator size="large" color="#7c3aed" style={{ marginTop: 24 }} />
            ) : filteredInventory.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>📦</Text>
                <Text style={styles.emptyTitle}>No medicine items found</Text>
                <Text style={styles.emptySub}>Tap "+ Add Medicine" to add drugs to inventory.</Text>
              </View>
            ) : (
              filteredInventory.map(item => {
                const isLow = (item.quantity || 0) <= 20;

                return (
                  <View key={item._id} style={styles.orderCard}>
                    <View style={styles.orderTopRow}>
                      <View style={styles.categoryBadge}>
                        <Text style={styles.categoryBadgeText}>{item.category || 'Medication'}</Text>
                      </View>
                      <View style={[styles.stockPill, isLow ? styles.stockPillLow : styles.stockPillNormal]}>
                        <Text style={[styles.stockPillText, isLow ? styles.stockPillTextLow : styles.stockPillTextNormal]}>
                          {isLow ? `LOW: ${item.quantity || 0} in stock` : `${item.quantity || 0} in stock`}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.patientName}>{item.name}</Text>
                    <Text style={styles.doctorSub}>
                      Price: ₹{item.sellingPrice || 0} • Batch: {item.batchNumber || 'B-STD'} • Exp: {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : 'N/A'}
                    </Text>

                    <View style={styles.cardActionRow}>
                      <TouchableOpacity
                        style={styles.restockBtn}
                        onPress={() => handleQuickAddStock(item)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.restockBtnText}>+ Restock Units</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

      </ScrollView>

      {/* ── 1. DISPENSE ORDER MODAL ── */}
      <Modal visible={showDispenseModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Dispense Prescription</Text>
                <Text style={styles.modalSub}>
                  {selectedOrder?.userId?.name || selectedOrder?.patientId} • {selectedOrder?.patientId}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowDispenseModal(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.formLabel}>Prescribed Medication Checklist</Text>
              <Text style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
                Select items in stock to dispense and verify quantities:
              </Text>

              {(selectedOrder?.items || []).map((item, idx) => {
                const isSelected = purchasedIndices.includes(idx);
                const unitCost = item.unitPrice || 25;
                const qty = Number(itemQuantities[idx] || item.quantity || 1);
                const totalItemPrice = unitCost * qty;

                return (
                  <View key={idx} style={[styles.dispenseItemBox, isSelected && styles.dispenseItemBoxActive]}>
                    <TouchableOpacity
                      style={styles.dispenseItemTop}
                      onPress={() => toggleItemPurchase(idx)}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.checkboxBox, isSelected && styles.checkboxBoxActive]}>
                        {isSelected ? <Text style={styles.checkboxCheck}>✓</Text> : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.dispenseItemName}>{item.medicineName}</Text>
                        <Text style={styles.dispenseItemSub}>
                          {item.dosage || '1 tab'} • {item.frequency || '1-0-1'} • {item.duration || '5 days'}
                        </Text>
                      </View>
                      <Text style={styles.dispenseItemPrice}>₹{totalItemPrice}</Text>
                    </TouchableOpacity>

                    {isSelected ? (
                      <View style={styles.dispenseQtyRow}>
                        <Text style={styles.dispenseQtyLabel}>Quantity to dispense:</Text>
                        <TextInput
                          style={styles.dispenseQtyInput}
                          keyboardType="numeric"
                          value={itemQuantities[idx] || '1'}
                          onChangeText={val => setItemQuantities(prev => ({ ...prev, [idx]: val }))}
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })}

              <Text style={[styles.formLabel, { marginTop: 14 }]}>Payment Collection Method</Text>
              <View style={styles.paymentMethodRow}>
                {['Cash', 'UPI / QR', 'Debit/Card'].map(pm => (
                  <TouchableOpacity
                    key={pm}
                    style={[styles.pmChoice, paymentMethod === pm && styles.pmChoiceActive]}
                    onPress={() => setPaymentMethod(pm)}
                  >
                    <Text style={[styles.pmChoiceText, paymentMethod === pm && styles.pmChoiceTextActive]}>
                      {pm}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.saveModalBtn, { backgroundColor: '#7c3aed' }]}
                onPress={handleSaveDispense}
                disabled={savingDispense}
                activeOpacity={0.8}
              >
                {savingDispense ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.saveModalBtnText}>Confirm Dispensing & Issue Receipt</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 2. ADD MEDICINE MODAL ── */}
      <Modal visible={showAddMedModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Add Medicine to Stock</Text>
                <Text style={styles.modalSub}>Dispensary pharmacy inventory</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAddMedModal(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.formLabel}>Brand / Drug Name *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. Paracetamol 650mg, Amoxicillin 500mg"
                value={medForm.name}
                onChangeText={val => setMedForm(prev => ({ ...prev, name: val }))}
                placeholderTextColor="#94a3b8"
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Category</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Tablets / Syrup / Injection"
                    value={medForm.category}
                    onChangeText={val => setMedForm(prev => ({ ...prev, category: val }))}
                    placeholderTextColor="#94a3b8"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Stock Units *</Text>
                  <TextInput
                    style={styles.formInput}
                    keyboardType="numeric"
                    placeholder="100"
                    value={medForm.quantity}
                    onChangeText={val => setMedForm(prev => ({ ...prev, quantity: val }))}
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Selling Price (₹)</Text>
                  <TextInput
                    style={styles.formInput}
                    keyboardType="numeric"
                    placeholder="25"
                    value={medForm.sellingPrice}
                    onChangeText={val => setMedForm(prev => ({ ...prev, sellingPrice: val }))}
                    placeholderTextColor="#94a3b8"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Batch Code</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="B-2026-X"
                    value={medForm.batchNumber}
                    onChangeText={val => setMedForm(prev => ({ ...prev, batchNumber: val }))}
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.saveModalBtn, { backgroundColor: '#7c3aed' }]}
                onPress={handleAddMedicine}
                disabled={savingMed}
                activeOpacity={0.8}
              >
                {savingMed ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.saveModalBtnText}>Save Medicine to Stock</Text>
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
                <View style={[styles.drawerLogoIcon, { backgroundColor: '#f5f3ff', borderColor: '#ddd6fe' }]}>
                  <Text style={{ fontSize: 20 }}>💊</Text>
                </View>
                <View style={{ marginLeft: 10 }}>
                  <Text style={styles.drawerBrandTitle}>Medical HMS</Text>
                  <Text style={styles.drawerBrandSub}>Pharmacy & Dispensary</Text>
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
                <View style={[styles.drawerAvatar, { backgroundColor: '#7c3aed' }]}>
                  {user?.avatar && (user.avatar.startsWith('http') || user.avatar.startsWith('data:')) ? (
                    <Image source={{ uri: user.avatar }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                  ) : (
                    <Text style={styles.drawerAvatarText}>
                      {user?.avatar || (user?.name || 'P').charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.drawerProfileName}>{user?.name || 'Pharmacist'}</Text>
                  <Text style={styles.drawerProfileEmail}>{user?.email || 'pharma@crm.com'}</Text>
                  <View style={[styles.drawerRoleBadge, { backgroundColor: '#f5f3ff' }]}>
                    <Text style={[styles.drawerRoleBadgeText, { color: '#7c3aed' }]}>PHARMACIST</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 16, color: '#7c3aed' }}>⚙️</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.drawerNavList}
              contentContainerStyle={styles.drawerNavListContent}
              showsVerticalScrollIndicator={false}
              bounces={true}
            >
              <Text style={styles.drawerNavSectionTitle}>PHARMACY WORKSPACE</Text>

              <TouchableOpacity
                style={[styles.drawerNavItem, activeTab === 'orders' && styles.drawerNavItemActive]}
                onPress={() => { setActiveTab('orders'); setIsSidebarOpen(false); }}
              >
                <Text style={styles.drawerNavIcon}>📋</Text>
                <Text style={[styles.drawerNavText, activeTab === 'orders' && styles.drawerNavTextActive]}>
                  Prescription Orders
                </Text>
                <View style={styles.drawerCounterBadge}>
                  <Text style={styles.drawerCounterText}>{pendingOrdersCount}</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.drawerNavItem, activeTab === 'inventory' && styles.drawerNavItemActive]}
                onPress={() => { setActiveTab('inventory'); setIsSidebarOpen(false); }}
              >
                <Text style={styles.drawerNavIcon}>📦</Text>
                <Text style={[styles.drawerNavText, activeTab === 'inventory' && styles.drawerNavTextActive]}>
                  Medicine Inventory
                </Text>
                <View style={styles.drawerCounterBadge}>
                  <Text style={styles.drawerCounterText}>{totalStockItems}</Text>
                </View>
              </TouchableOpacity>

              <Text style={[styles.drawerNavSectionTitle, { marginTop: 24 }]}>DIRECT ACTIONS</Text>

              <TouchableOpacity
                style={styles.drawerActionItem}
                onPress={() => {
                  setIsSidebarOpen(false);
                  setShowAddMedModal(true);
                }}
              >
                <Text style={[styles.drawerActionIcon, { color: '#7c3aed' }]}>➕</Text>
                <Text style={[styles.drawerActionText, { color: '#7c3aed' }]}>Add Medicine Stock</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.drawerActionItem, { marginTop: 10, borderWidth: 1, borderColor: '#ddd6fe', backgroundColor: '#f5f3ff', paddingVertical: 11 }]}
                onPress={() => {
                  setIsSidebarOpen(false);
                  navigation?.navigate('Profile');
                }}
              >
                <Text style={styles.drawerActionIcon}>👤</Text>
                <Text style={[styles.drawerActionText, { color: '#7c3aed' }]}>Account Profile Settings</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.drawerFooter}>
              <TouchableOpacity style={styles.drawerSignOutBtn} onPress={logout} activeOpacity={0.8}>
                <Text style={styles.drawerSignOutText}>🚪 Sign Out of Portal</Text>
              </TouchableOpacity>
              <Text style={styles.drawerVersionText}>Medical HMS · Pharmacy v2.4</Text>
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
    shadowColor: '#7c3aed',
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
    backgroundColor: '#f5f3ff',
    borderWidth: 1,
    borderColor: '#ddd6fe',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  refreshBtnText: {
    fontSize: 20,
    color: '#7c3aed',
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
    backgroundColor: '#7c3aed',
    borderColor: '#7c3aed',
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
  orderCard: {
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
  orderTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  orderIdBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  orderIdBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  categoryBadge: {
    backgroundColor: '#f5f3ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#7c3aed',
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
  stockPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  stockPillNormal: {
    backgroundColor: '#ecfdf5',
  },
  stockPillTextNormal: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  stockPillLow: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  stockPillTextLow: {
    fontSize: 10,
    fontWeight: '800',
    color: '#dc2626',
  },
  patientName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  doctorSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  itemsPreviewBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
  },
  itemPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  itemPreviewName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  itemPreviewDetail: {
    fontSize: 11,
    color: '#64748b',
  },
  moreItemsText: {
    fontSize: 11,
    color: '#7c3aed',
    fontWeight: '700',
    marginTop: 4,
  },
  cardActionRow: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
  },
  primaryActionBtn: {
    backgroundColor: '#7c3aed',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  primaryActionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  viewDispensedBtn: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  viewDispensedBtnText: {
    color: '#059669',
  },
  restockBtn: {
    backgroundColor: '#f5f3ff',
    borderWidth: 1,
    borderColor: '#ddd6fe',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  restockBtnText: {
    color: '#7c3aed',
    fontSize: 12,
    fontWeight: '700',
  },
  addBtn: {
    backgroundColor: '#7c3aed',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
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
  dispenseItemBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dispenseItemBoxActive: {
    backgroundColor: '#f5f3ff',
    borderColor: '#ddd6fe',
  },
  dispenseItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
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
    backgroundColor: '#7c3aed',
    borderColor: '#7c3aed',
  },
  checkboxCheck: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  dispenseItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  dispenseItemSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  dispenseItemPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: '#7c3aed',
  },
  dispenseQtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  dispenseQtyLabel: {
    fontSize: 11,
    color: '#64748b',
    flex: 1,
  },
  dispenseQtyInput: {
    width: 60,
    height: 32,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    textAlign: 'center',
    fontSize: 12,
    color: '#0f172a',
  },
  paymentMethodRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  pmChoice: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  pmChoiceActive: {
    backgroundColor: '#7c3aed',
    borderColor: '#7c3aed',
  },
  pmChoiceText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  pmChoiceTextActive: {
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
    backgroundColor: '#f5f3ff',
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
    color: '#7c3aed',
    fontWeight: '800',
  },
  drawerCounterBadge: {
    backgroundColor: '#ede9fe',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  drawerCounterText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6d28d9',
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
