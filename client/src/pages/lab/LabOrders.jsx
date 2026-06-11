import React, { useState, useEffect } from 'react';
import { labAPI } from '../../utils/api';
import './LabOrders.css';

const LabOrders = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [selectedOrder, setSelectedOrder] = useState(null);

    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            loadOrders();
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [statusFilter, search]);

    const loadOrders = async () => {
        setLoading(true);
        try {
            const res = await labAPI.getRequests(statusFilter, search);
            if (res.success) {
                setOrders(res.requests);
            }
        } catch (err) {
            console.error("Error loading lab orders:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        loadOrders();
    };

    const getStatusEmoji = (status) => {
        switch (status) {
            case 'Pending': return '🟡';
            case 'Sample Collected': return '🧪';
            case 'In Testing': return '🔬';
            case 'Report Ready': return '📄';
            case 'Completed': return '✅';
            case 'Cancelled': return '🔴';
            default: return '📋';
        }
    };

    const getStatusClass = (status) => {
        return (status || 'Pending').toLowerCase().replace(' ', '-');
    };

    const formatDateTime = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <div className="lab-orders-page">
            <h2>📋 Laboratory Orders Registry</h2>

            {/* Controls */}
            <div className="controls-container">
                <form onSubmit={handleSearchSubmit} className="search-bar-wrap">
                    <input 
                        type="text" 
                        placeholder="Search by Patient Name, ID (P-101), or Order ID..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="search-input-field"
                    />
                    <button type="submit" className="search-icon-btn">🔍</button>
                </form>

                <div className="filters-btn-group">
                    {['all', 'Pending', 'Sample Collected', 'In Testing', 'Report Ready', 'Completed', 'Cancelled'].map((f) => (
                        <button
                            key={f}
                            className={`filter-tab-btn ${statusFilter === f ? 'active' : ''}`}
                            onClick={() => setStatusFilter(f)}
                        >
                            {f === 'all' ? 'All Orders' : `${getStatusEmoji(f)} ${f}`}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content list */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading lab orders...</div>
            ) : (
                <div className="orders-table-wrapper">
                    {orders.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                            No lab orders found matching the filter criteria.
                        </div>
                    ) : (
                        <table className="orders-grid-table">
                            <thead>
                                <tr>
                                    <th>Patient</th>
                                    <th>Patient ID</th>
                                    <th>Doctor</th>
                                    <th>Ordered Tests</th>
                                    <th>Order Date</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map((order) => (
                                    <tr key={order._id} onClick={() => setSelectedOrder(order)}>
                                        <td><strong>{order.userId?.name || 'Walk-in Patient'}</strong></td>
                                        <td><span style={{ color: '#64748b', fontWeight: 600 }}>{order.patientId}</span></td>
                                        <td>Dr. {order.doctorId?.name || 'N/A'}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                {order.testNames?.map((test, idx) => (
                                                    <span key={idx} style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>
                                                        {test}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td>{formatDateTime(order.createdAt)}</td>
                                        <td>
                                            <span className={`badge-status ${getStatusClass(order.status)}`}>
                                                {getStatusEmoji(order.status)} {order.status || 'Pending'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* View Details Modal with Audit Trail Timeline */}
            {selectedOrder && (
                <div className="modal-overlay" onClick={() => setSelectedOrder(null)}>
                    <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: '650px', maxHeight: '90vh' }}>
                        <h2>🔬 Lab Order Details</h2>
                        
                        <div className="form-group" style={{ overflowY: 'auto', flex: 1, paddingRight: '8px' }}>
                            {/* Patient and Doctor Cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px', background: '#f8fafc', padding: '16px', borderRadius: '12px' }}>
                                <div>
                                    <strong style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase' }}>Patient Details</strong>
                                    <h4 style={{ margin: '4px 0 0', fontSize: '1.05rem', color: '#1e293b' }}>{selectedOrder.userId?.name || 'Walk-in Patient'}</h4>
                                    <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#64748b' }}>Patient ID: {selectedOrder.patientId}</p>
                                    <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#64748b' }}>Phone: {selectedOrder.userId?.phone || 'N/A'}</p>
                                </div>
                                <div>
                                    <strong style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase' }}>Request Details</strong>
                                    <h4 style={{ margin: '4px 0 0', fontSize: '1.05rem', color: '#1e293b' }}>Dr. {selectedOrder.doctorId?.name || 'N/A'}</h4>
                                    <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#64748b' }}>Ordered: {formatDateTime(selectedOrder.createdAt)}</p>
                                    <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#64748b' }}>Order ID: {selectedOrder._id}</p>
                                </div>
                            </div>

                            {/* Tests Details */}
                            <div style={{ marginBottom: '16px' }}>
                                <label>Prescribed Tests</label>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                                    {selectedOrder.testNames?.map((test, idx) => (
                                        <span key={idx} style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '4px 12px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
                                            {test}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Sample details if collected */}
                            {selectedOrder.sampleCollected && (
                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '16px', borderRadius: '12px', marginBottom: '16px' }}>
                                    <strong style={{ color: '#15803d', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}>🧪 Sample Collection Information</strong>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '8px', fontSize: '0.85rem', color: '#374151' }}>
                                        <div><strong>Sample Type:</strong> {selectedOrder.sampleType}</div>
                                        <div><strong>Collected At:</strong> {formatDateTime(selectedOrder.sampleCollectedAt)}</div>
                                        <div style={{ gridColumn: '1 / -1' }}><strong>Notes:</strong> {selectedOrder.collectionNotes || 'None'}</div>
                                    </div>
                                </div>
                            )}

                            {/* Audit Trail Timeline */}
                            <div>
                                <label style={{ marginBottom: '10px', display: 'block' }}>📋 Order Lifecycle & Audit Trail</label>
                                <div className="audit-timeline">
                                    {selectedOrder.statusHistory && selectedOrder.statusHistory.length > 0 ? (
                                        selectedOrder.statusHistory.map((step, idx) => (
                                            <div key={idx} className={`timeline-step ${idx === selectedOrder.statusHistory.length - 1 ? 'current' : ''}`}>
                                                <div className="step-header">
                                                    <span className="step-status">{getStatusEmoji(step.status)} {step.status}</span>
                                                    <span className="step-time">{formatDateTime(step.updatedAt)}</span>
                                                </div>
                                                <div className="step-actor">Updated By: <strong>{step.updatedByName || 'Lab Staff'}</strong></div>
                                                {step.notes && <div className="step-notes">{step.notes}</div>}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="timeline-step current">
                                            <div className="step-header">
                                                <span className="step-status">🟡 Pending</span>
                                                <span className="step-time">{formatDateTime(selectedOrder.createdAt)}</span>
                                            </div>
                                            <div className="step-actor">Prescribed by doctor.</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="modal-actions" style={{ marginTop: '20px' }}>
                            <button type="button" className="modal-btn cancel" onClick={() => setSelectedOrder(null)}>
                                Close Window
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LabOrders;
