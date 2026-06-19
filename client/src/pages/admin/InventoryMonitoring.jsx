import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { administratorAPI } from '../../utils/api';
import {
    FiPackage, FiAlertTriangle, FiRefreshCw, FiExternalLink,
    FiTrendingUp, FiShoppingBag, FiActivity, FiClock
} from 'react-icons/fi';
import './InventoryMonitoring.css';

const InventoryMonitoring = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('outOfStock');

    // Stats states
    const [lowStock, setLowStock] = useState([]);
    const [outOfStock, setOutOfStock] = useState([]);
    const [expiring, setExpiring] = useState([]);
    const [pendingRequests, setPendingRequests] = useState([]);
    const [topConsumed, setTopConsumed] = useState([]);

    const fetchData = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await administratorAPI.getInventory();
            if (res.success) {
                setLowStock(res.lowStock || []);
                setOutOfStock(res.outOfStock || []);
                setExpiring(res.expiring || []);
                setPendingRequests(res.pendingPurchaseRequests || []);
                setTopConsumed(res.topConsumed || []);

                // Determine default active tab based on severity
                if (res.outOfStock && res.outOfStock.length > 0) {
                    setActiveTab('outOfStock');
                } else if (res.lowStock && res.lowStock.length > 0) {
                    setActiveTab('lowStock');
                } else {
                    setActiveTab('expiring');
                }
            }
        } catch (err) {
            console.error('Error fetching inventory monitoring data:', err);
            setError('Failed to load inventory monitoring details. Please check connection.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const formatCurrency = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;

    const renderActiveTabContent = () => {
        let items = [];
        let type = '';

        if (activeTab === 'outOfStock') {
            items = outOfStock;
            type = 'out';
        } else if (activeTab === 'lowStock') {
            items = lowStock;
            type = 'low';
        } else {
            items = expiring;
            type = 'expiring';
        }

        if (items.length === 0) {
            return (
                <div className="empty-state">
                    🎉 Excellent! No items are currently in this category.
                </div>
            );
        }

        return (
            <table className="inv-table animate-fade">
                <thead>
                    <tr>
                        <th>Batch Code</th>
                        <th>Medicine Name</th>
                        <th>Salt Composition</th>
                        <th>Stock Level</th>
                        <th>Selling Price</th>
                        <th>Expiry Date</th>
                        <th>Oversight Status</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item) => {
                        const isExpired = new Date(item.expiryDate) < new Date();
                        return (
                            <tr key={item._id}>
                                <td><small><strong>#{item.batchNumber || 'N/A'}</strong></small></td>
                                <td><strong>{item.name}</strong></td>
                                <td>{item.salt || 'N/A'}</td>
                                <td>
                                    <strong>{item.stock}</strong> <span style={{ color: '#94a3b8', fontSize: '11px' }}>{item.unit || 'Tablets'}</span>
                                </td>
                                <td>{formatCurrency(item.sellingPrice)}</td>
                                <td>
                                    <span style={{ fontWeight: 600 }}>
                                        {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('en-IN') : '-'}
                                    </span>
                                </td>
                                <td>
                                    <span className={`badge-status ${type}`}>
                                        {activeTab === 'outOfStock' ? 'Out Of Stock' : activeTab === 'lowStock' ? 'Low Stock' : isExpired ? 'Expired' : 'Expiring Soon'}
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        );
    };

    return (
        <div className="inventory-monitor-page">
            {/* Header section */}
            <div className="inv-header">
                <div>
                    <h1>Inventory & Stock Monitoring</h1>
                    <p>Oversight of hospital medicine stock levels, pending purchase approvals, and expiry timelines.</p>
                </div>
                <div className="header-actions">
                    <button onClick={fetchData} className="btn-sync" disabled={loading}>
                        <FiRefreshCw className={loading ? "spinning" : ""} />
                        <span>Sync Inventory</span>
                    </button>
                    <button onClick={() => navigate('/admin/pharmacy')} className="btn-manage-pharma">
                        <FiExternalLink />
                        <span>Pharmacy registry</span>
                    </button>
                </div>
            </div>

            {error && (
                <div className="res-banner error" style={{ marginBottom: '20px' }}>
                    <FiAlertTriangle /> <span>{error}</span>
                </div>
            )}

            {loading ? (
                <div className="loading-box">
                    <FiRefreshCw className="spinning" style={{ fontSize: '2rem', display: 'block', margin: '0 auto 12px' }} />
                    <p>Inspecting pharmaceutical stock registries...</p>
                </div>
            ) : (
                <>
                    {/* KPI Statistics */}
                    <div className="inv-kpi-grid">
                        <div className="inv-kpi-card out" onClick={() => setActiveTab('outOfStock')} style={{ cursor: 'pointer' }}>
                            <div className="kpi-icon-wrap"><FiAlertTriangle /></div>
                            <div className="kpi-details">
                                <h3>{outOfStock.length}</h3>
                                <p>Out Of Stock</p>
                            </div>
                        </div>

                        <div className="inv-kpi-card low" onClick={() => setActiveTab('lowStock')} style={{ cursor: 'pointer' }}>
                            <div className="kpi-icon-wrap"><FiPackage /></div>
                            <div className="kpi-details">
                                <h3>{lowStock.length}</h3>
                                <p>Low Stock Items</p>
                            </div>
                        </div>

                        <div className="inv-kpi-card expiring" onClick={() => setActiveTab('expiring')} style={{ cursor: 'pointer' }}>
                            <div className="kpi-icon-wrap"><FiClock /></div>
                            <div className="kpi-details">
                                <h3>{expiring.length}</h3>
                                <p>Near Expiration</p>
                            </div>
                        </div>
                    </div>

                    {/* Main Layout Area */}
                    <div className="inv-main-layout">
                        {/* Left Side: Alerts Registry */}
                        <div className="inv-section-card">
                            <div className="section-head">
                                <h2>Alerts & Warnings Registry</h2>
                                <div className="inv-tabs">
                                    <button
                                        className={`inv-tab-btn ${activeTab === 'outOfStock' ? 'active' : ''}`}
                                        onClick={() => setActiveTab('outOfStock')}
                                    >
                                        Out of Stock ({outOfStock.length})
                                    </button>
                                    <button
                                        className={`inv-tab-btn ${activeTab === 'lowStock' ? 'active' : ''}`}
                                        onClick={() => setActiveTab('lowStock')}
                                    >
                                        Low Stock ({lowStock.length})
                                    </button>
                                    <button
                                        className={`inv-tab-btn ${activeTab === 'expiring' ? 'active' : ''}`}
                                        onClick={() => setActiveTab('expiring')}
                                    >
                                        Near Expiry ({expiring.length})
                                    </button>
                                </div>
                            </div>
                            <div className="inv-table-wrapper">
                                {renderActiveTabContent()}
                            </div>
                        </div>

                        {/* Right Side: Operational Oversight */}
                        <div className="right-sidebar-stack">
                            {/* Purchase Requests */}
                            <div className="inv-section-card">
                                <div className="section-head" style={{ marginBottom: '16px' }}>
                                    <h2>Supply Purchase Approvals</h2>
                                </div>
                                <div className="requests-stack">
                                    {pendingRequests.length === 0 ? (
                                        <div className="empty-state" style={{ padding: '20px' }}>
                                            No pending purchase requests.
                                        </div>
                                    ) : (
                                        pendingRequests.map((req, idx) => (
                                            <div key={idx} className="req-item">
                                                <div className="req-info">
                                                    <strong>{req.item}</strong>
                                                    <span>Qty: {req.qty} | Requested by: {req.requestedBy}</span>
                                                </div>
                                                <span className={`req-badge ${req.status.toLowerCase().includes('pending') ? 'pending' : 'ordered'}`}>
                                                    {req.status}
                                                </span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Top Consumed items */}
                            <div className="inv-section-card">
                                <div className="section-head" style={{ marginBottom: '16px' }}>
                                    <h2>Top Consumed Medications</h2>
                                </div>
                                <div className="consumed-list">
                                    {topConsumed.length === 0 ? (
                                        <div className="empty-state" style={{ padding: '20px' }}>
                                            No consumption logs tracked.
                                        </div>
                                    ) : (
                                        topConsumed.map((item, idx) => (
                                            <div key={idx} className="consumed-item">
                                                <h4>{item.name}</h4>
                                                <div className="progress-bar-outer">
                                                    <div className="progress-bar-inner" style={{ width: `${Math.min(100, (item.qty / 150) * 100)}%` }} />
                                                </div>
                                                <div className="progress-info">
                                                    <span>Qty consumed: {item.qty} units</span>
                                                    <span>Est. Rev: {formatCurrency(item.revenue)}</span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default InventoryMonitoring;
