import React, { useState, useEffect } from 'react';
import { pharmacyAPI, pharmacyOrderAPI } from '../../utils/api';
import {
    FiPackage, FiList, FiAlertTriangle, FiShoppingBag,
    FiPlusSquare, FiEdit2, FiTrash2, FiActivity, FiCheckCircle, FiClock
} from 'react-icons/fi';
import './PharmacyManagement.css';

const PharmacyManagement = () => {
    const [activeTab, setActiveTab] = useState('inventory');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Inventory States
    const [inventory, setInventory] = useState([]);
    const [invSearch, setInvSearch] = useState('');
    const [invFilter, setInvFilter] = useState('all');
    const [showInvForm, setShowInvForm] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [invFormData, setInvFormData] = useState({
        name: '',
        salt: '',
        category: 'General',
        stock: '',
        unit: 'Tablets',
        buyingPrice: '',
        sellingPrice: '',
        vendor: '',
        batchNumber: '',
        expiryDate: '',
        purchaseDate: ''
    });

    // Orders/Dispensing States
    const [orders, setOrders] = useState([]);
    const [orderFilter, setOrderFilter] = useState('all');

    const formatCurrency = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;

    useEffect(() => {
        if (activeTab === 'inventory' || activeTab === 'expiry') {
            fetchInventory();
        } else if (activeTab === 'dispensing') {
            fetchOrders();
        }
    }, [activeTab]);

    // --- FETCH INVENTORY ---
    const fetchInventory = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await pharmacyAPI.getInventory();
            if (res.success) {
                setInventory(res.data || []);
            }
        } catch (err) {
            setError('Failed to fetch inventory.');
        } finally {
            setLoading(false);
        }
    };

    // --- FETCH ORDERS ---
    const fetchOrders = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await pharmacyOrderAPI.getOrders();
            if (res.success) {
                setOrders(res.data || []);
            }
        } catch (err) {
            setError('Failed to fetch dispensing orders.');
        } finally {
            setLoading(false);
        }
    };

    // --- SUBMIT INVENTORY ITEM ---
    const handleInvSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        const payload = {
            ...invFormData,
            stock: Number(invFormData.stock) || 0,
            buyingPrice: Number(invFormData.buyingPrice) || 0,
            sellingPrice: Number(invFormData.sellingPrice) || 0,
            expiryDate: invFormData.expiryDate ? new Date(invFormData.expiryDate) : null,
            purchaseDate: invFormData.purchaseDate ? new Date(invFormData.purchaseDate) : new Date()
        };

        try {
            if (editingItem) {
                const res = await pharmacyAPI.updateMedicine(editingItem._id, payload);
                if (res.success) {
                    setSuccess('Medicine details updated successfully.');
                    resetInvForm();
                    fetchInventory();
                }
            } else {
                const res = await pharmacyAPI.addMedicine(payload);
                if (res.success) {
                    setSuccess('New medicine added to inventory.');
                    resetInvForm();
                    fetchInventory();
                }
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error saving medicine.');
        } finally {
            setLoading(false);
        }
    };

    const handleInvDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this item?')) return;
        try {
            const res = await pharmacyAPI.deleteMedicine(id);
            if (res.success) {
                setSuccess('Item deleted from inventory.');
                fetchInventory();
            }
        } catch (err) {
            setError('Failed to delete item.');
        }
    };

    const resetInvForm = () => {
        setInvFormData({
            name: '',
            salt: '',
            category: 'General',
            stock: '',
            unit: 'Tablets',
            buyingPrice: '',
            sellingPrice: '',
            vendor: '',
            batchNumber: '',
            expiryDate: '',
            purchaseDate: ''
        });
        setEditingItem(null);
        setShowInvForm(false);
    };

    // --- MARK ORDER COMPLETED ---
    const handleCompleteOrder = async (id) => {
        try {
            const res = await pharmacyOrderAPI.completeOrder(id);
            if (res.success) {
                setSuccess('Order marked as Completed / Dispensed.');
                fetchOrders();
            }
        } catch (err) {
            setError('Error completing dispensing order.');
        }
    };

    // --- FILTER INVENTORY DATA ---
    const getFilteredInventory = () => {
        return inventory.filter(item => {
            const matchesSearch = item.name.toLowerCase().includes(invSearch.toLowerCase()) ||
                                  (item.salt || '').toLowerCase().includes(invSearch.toLowerCase());
            
            if (!matchesSearch) return false;

            if (invFilter === 'low_stock') {
                return (item.stock || 0) < 50;
            }
            if (invFilter === 'out_of_stock') {
                return (item.stock || 0) <= 0;
            }
            return true;
        });
    };

    // --- EXPIRED OR EXPIRING SOON ITEMS ---
    const getExpiringSoonItems = () => {
        const threeMonthsFromNow = new Date();
        threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);

        return inventory.filter(item => {
            if (!item.expiryDate) return false;
            const exp = new Date(item.expiryDate);
            return exp <= threeMonthsFromNow;
        }).sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
    };

    const filteredInv = getFilteredInventory();
    const expiringSoon = getExpiringSoonItems();
    const lowStockAlerts = inventory.filter(i => (i.stock || 0) < 50).length;

    return (
        <div className="pharma-mgmt-page">
            <div className="pharma-mgmt-header">
                <div>
                    <h1>Pharmacy Operations Oversight</h1>
                    <p>Monitor pharmaceutical stocks, track batch expirations, purchase histories, and dispensing records.</p>
                </div>
            </div>

            {/* Tabs Row */}
            <div className="pharma-tabs-row">
                <button className={`pharma-tab-btn ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>
                    <FiPackage /> <span>Inventory Registry ({inventory.length})</span>
                </button>
                <button className={`pharma-tab-btn ${activeTab === 'expiry' ? 'active' : ''}`} onClick={() => setActiveTab('expiry')}>
                    <FiAlertTriangle /> <span>Expiry & Stock Warnings ({expiringSoon.length})</span>
                </button>
                <button className={`pharma-tab-btn ${activeTab === 'dispensing' ? 'active' : ''}`} onClick={() => setActiveTab('dispensing')}>
                    <FiShoppingBag /> <span>Dispensing Records ({orders.length})</span>
                </button>
            </div>

            {error && (
                <div className="pharma-banner error">
                    <FiAlertTriangle /> <span>{error}</span>
                </div>
            )}
            {success && (
                <div className="pharma-banner success">
                    <FiCheckCircle /> <span>{success}</span>
                </div>
            )}

            {/* TAB CONTENT: INVENTORY REGISTRY */}
            {activeTab === 'inventory' && (
                <div className="pharma-content-card animate-fade">
                    <div className="panel-sub-header">
                        <h2>Medicine Stocks Inventory</h2>
                        <button className="btn-primary-pharma" onClick={() => { setShowInvForm(!showInvForm); setEditingItem(null); }}>
                            {showInvForm ? 'Cancel' : '+ Add Medicine'}
                        </button>
                    </div>

                    {showInvForm && (
                        <form onSubmit={handleInvSubmit} className="pharma-form-container">
                            <h3>{editingItem ? 'Edit Medicine Profile' : 'Add New Medicine Batch'}</h3>
                            <div className="form-grid">
                                <div className="form-field">
                                    <label>Medicine Name *</label>
                                    <input
                                        type="text"
                                        value={invFormData.name}
                                        onChange={(e) => setInvFormData({ ...invFormData, name: e.target.value })}
                                        required
                                        placeholder="e.g. Paracetamol 650mg"
                                    />
                                </div>
                                <div className="form-field">
                                    <label>Chemical Composition (Salt)</label>
                                    <input
                                        type="text"
                                        value={invFormData.salt}
                                        onChange={(e) => setInvFormData({ ...invFormData, salt: e.target.value })}
                                        placeholder="e.g. Acetaminophen"
                                    />
                                </div>
                                <div className="form-field">
                                    <label>Category</label>
                                    <input
                                        type="text"
                                        value={invFormData.category}
                                        onChange={(e) => setInvFormData({ ...invFormData, category: e.target.value })}
                                        placeholder="e.g. Analgesic"
                                    />
                                </div>
                                <div className="form-field">
                                    <label>Total Stock Count *</label>
                                    <input
                                        type="number"
                                        value={invFormData.stock}
                                        onChange={(e) => setInvFormData({ ...invFormData, stock: e.target.value })}
                                        required
                                        placeholder="e.g. 500"
                                    />
                                </div>
                                <div className="form-field">
                                    <label>Packaging Unit</label>
                                    <input
                                        type="text"
                                        value={invFormData.unit}
                                        onChange={(e) => setInvFormData({ ...invFormData, unit: e.target.value })}
                                        placeholder="e.g. Tablets / Vials / Syrup bottles"
                                    />
                                </div>
                                <div className="form-field">
                                    <label>Buying Price (₹ per unit) *</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={invFormData.buyingPrice}
                                        onChange={(e) => setInvFormData({ ...invFormData, buyingPrice: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-field">
                                    <label>Selling Price (₹ per unit) *</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={invFormData.sellingPrice}
                                        onChange={(e) => setInvFormData({ ...invFormData, sellingPrice: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-field">
                                    <label>Batch Code *</label>
                                    <input
                                        type="text"
                                        value={invFormData.batchNumber}
                                        onChange={(e) => setInvFormData({ ...invFormData, batchNumber: e.target.value })}
                                        required
                                        placeholder="e.g. B-PR102"
                                    />
                                </div>
                                <div className="form-field">
                                    <label>Supplier / Vendor Name</label>
                                    <input
                                        type="text"
                                        value={invFormData.vendor}
                                        onChange={(e) => setInvFormData({ ...invFormData, vendor: e.target.value })}
                                        placeholder="e.g. Cipla Pharma Dist."
                                    />
                                </div>
                                <div className="form-field">
                                    <label>Batch Expiry Date *</label>
                                    <input
                                        type="date"
                                        value={invFormData.expiryDate ? invFormData.expiryDate.split('T')[0] : ''}
                                        onChange={(e) => setInvFormData({ ...invFormData, expiryDate: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-field">
                                    <label>Purchase Date</label>
                                    <input
                                        type="date"
                                        value={invFormData.purchaseDate ? invFormData.purchaseDate.split('T')[0] : ''}
                                        onChange={(e) => setInvFormData({ ...invFormData, purchaseDate: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="form-actions-pharma">
                                <button type="submit" className="btn-save">Save Medicine</button>
                                <button type="button" onClick={resetInvForm} className="btn-cancel">Cancel</button>
                            </div>
                        </form>
                    )}

                    <div className="requests-filter-bar">
                        <div className="search-box">
                            <input
                                type="text"
                                placeholder="Search Name or Chemical composition..."
                                value={invSearch}
                                onChange={(e) => setInvSearch(e.target.value)}
                            />
                        </div>
                        <div className="filters-radios">
                            <button className={`filter-opt ${invFilter === 'all' ? 'active' : ''}`} onClick={() => setInvFilter('all')}>All</button>
                            <button className={`filter-opt ${invFilter === 'low_stock' ? 'active' : ''}`} onClick={() => setInvFilter('low_stock')}>Low Stock</button>
                            <button className={`filter-opt ${invFilter === 'out_of_stock' ? 'active' : ''}`} onClick={() => setInvFilter('out_of_stock')}>Out of Stock</button>
                        </div>
                    </div>

                    {loading && !inventory.length ? (
                        <div className="pharma-loading">Syncing inventory database...</div>
                    ) : filteredInv.length === 0 ? (
                        <div className="pharma-empty">No medicine items found. Add some to get started.</div>
                    ) : (
                        <div className="pharma-table-container">
                            <table className="pharma-table">
                                <thead>
                                    <tr>
                                        <th>Batch #</th>
                                        <th>Medicine Name</th>
                                        <th>Chemical Composition</th>
                                        <th>Supplier Details</th>
                                        <th>Stock Level</th>
                                        <th>Cost Price</th>
                                        <th>Retail Price</th>
                                        <th>Expiry Date</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredInv.map((item) => {
                                        const isLow = (item.stock || 0) < 50;
                                        const isOut = (item.stock || 0) <= 0;
                                        return (
                                            <tr key={item._id} className={isOut ? 'row-out-of-stock' : ''}>
                                                <td><span className="batch-lbl">{item.batchNumber || 'N/A'}</span></td>
                                                <td><strong>{item.name}</strong></td>
                                                <td>{item.salt || 'Single Salt'}</td>
                                                <td>
                                                    <div className="supplier-lbl">
                                                        <span>{item.vendor || 'Local Distributor'}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`stock-badge ${isOut ? 'out' : isLow ? 'low' : 'ok'}`}>
                                                        {item.stock} {item.unit || 'Tablets'}
                                                    </span>
                                                </td>
                                                <td>{formatCurrency(item.buyingPrice)}</td>
                                                <td>{formatCurrency(item.sellingPrice)}</td>
                                                <td>{item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : '-'}</td>
                                                <td>
                                                    <div className="actions-cell">
                                                        <button onClick={() => {
                                                            setEditingItem(item);
                                                            setInvFormData({
                                                                name: item.name,
                                                                salt: item.salt || '',
                                                                category: item.category || 'General',
                                                                stock: item.stock || '',
                                                                unit: item.unit || 'Tablets',
                                                                buyingPrice: item.buyingPrice || '',
                                                                sellingPrice: item.sellingPrice || '',
                                                                vendor: item.vendor || '',
                                                                batchNumber: item.batchNumber || '',
                                                                expiryDate: item.expiryDate || '',
                                                                purchaseDate: item.purchaseDate || ''
                                                            });
                                                            setShowInvForm(true);
                                                        }} className="btn-table-edit"><FiEdit2 /></button>
                                                        <button onClick={() => handleInvDelete(item._id)} className="btn-table-delete"><FiTrash2 /></button>
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

            {/* TAB CONTENT: EXPIRY & LOW STOCK WARNINGS */}
            {activeTab === 'expiry' && (
                <div className="pharma-content-card animate-fade">
                    <h2>Expiry & Low Stock Warnings</h2>
                    <p className="warnings-desc">Batches expiring within 3 months, or with stock volumes below reorder thresholds (50 units).</p>

                    <div className="double-warnings-row">
                        {/* Expiry Box */}
                        <div className="warning-panel">
                            <h3>🚨 Expiring Batches (Next 90 Days)</h3>
                            {expiringSoon.length === 0 ? (
                                <div className="warning-empty success">All inventory batches have stable expiry timelines.</div>
                            ) : (
                                <div className="warning-list">
                                    {expiringSoon.map((item) => {
                                        const exp = new Date(item.expiryDate);
                                        const diffTime = exp - new Date();
                                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                        const isExpired = diffDays <= 0;

                                        return (
                                            <div key={item._id} className={`warning-item-box ${isExpired ? 'danger' : 'warning'}`}>
                                                <div className="warning-meta">
                                                    <strong>{item.name}</strong>
                                                    <span>Batch: {item.batchNumber} | Qty: {item.stock}</span>
                                                </div>
                                                <div className="warning-badge-days">
                                                    {isExpired ? 'EXPIRED' : `${diffDays} days left`}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Low Stock Box */}
                        <div className="warning-panel">
                            <h3>⚠️ Low/Out of Stock Medicines</h3>
                            {inventory.filter(i => (i.stock || 0) < 50).length === 0 ? (
                                <div className="warning-empty success">All medicine stock levels are currently optimal.</div>
                            ) : (
                                <div className="warning-list">
                                    {inventory.filter(i => (i.stock || 0) < 50).map((item) => (
                                        <div key={item._id} className="warning-item-box danger">
                                            <div className="warning-meta">
                                                <strong>{item.name}</strong>
                                                <span>Composition: {item.salt || 'N/A'}</span>
                                            </div>
                                            <div className="warning-badge-days">
                                                {item.stock <= 0 ? 'OUT OF STOCK' : `${item.stock} left`}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB CONTENT: DISPENSING RECORDS */}
            {activeTab === 'dispensing' && (
                <div className="pharma-content-card animate-fade">
                    <h2>Prescription Dispensing Records</h2>
                    <p className="warnings-desc">Real-time tracker of prescriptions sent by doctors and completed pharmacy billing transactions.</p>

                    {loading && !orders.length ? (
                        <div className="pharma-loading">Syncing dispensing logs...</div>
                    ) : orders.length === 0 ? (
                        <div className="pharma-empty">No dispensing records logged yet.</div>
                    ) : (
                        <div className="pharma-table-container">
                            <table className="pharma-table">
                                <thead>
                                    <tr>
                                        <th>Order ID</th>
                                        <th>Patient Details</th>
                                        <th>Prescribed By</th>
                                        <th>Prescription Summary</th>
                                        <th>Total Invoice</th>
                                        <th>Payment</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {orders.map((ord) => (
                                        <tr key={ord._id}>
                                            <td><span className="order-lbl">{ord.orderId || 'ORD-N/A'}</span></td>
                                            <td>
                                                <div className="patient-col">
                                                    <strong>{ord.patientName}</strong>
                                                    <span>{ord.patientEmail}</span>
                                                </div>
                                            </td>
                                            <td>{ord.doctorId?.name || 'Hospital Doctor'}</td>
                                            <td>
                                                <div className="rx-items-list">
                                                    {(ord.items || []).map((itm, idx) => (
                                                        <span key={idx} className="rx-item-badge">{itm.medicineName} ({itm.quantity || 1})</span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td>{formatCurrency(ord.totalAmount)}</td>
                                            <td>
                                                <span className={`payment-status-badge ${String(ord.paymentStatus).toLowerCase()}`}>
                                                    {ord.paymentStatus}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`order-status-badge ${String(ord.status || ord.orderStatus).toLowerCase().replace(' ', '_')}`}>
                                                    {ord.status || ord.orderStatus}
                                                </span>
                                            </td>
                                            <td>
                                                {(ord.status === 'pending' || ord.orderStatus === 'Upcoming' || ord.orderStatus === 'Pending') && (
                                                    <button onClick={() => handleCompleteOrder(ord._id)} className="btn-dispense-complete">
                                                        Dispense
                                                    </button>
                                                )}
                                                {!(ord.status === 'pending' || ord.orderStatus === 'Upcoming' || ord.orderStatus === 'Pending') && (
                                                    <span className="dispensed-check"><FiCheckCircle /> Dispensed</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default PharmacyManagement;
