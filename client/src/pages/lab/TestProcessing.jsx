import React, { useState, useEffect } from 'react';
import { labAPI } from '../../utils/api';
import './TestProcessing.css';

const TestProcessing = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [activeFilter, setActiveFilter] = useState('all-active');

    // Upload Modal states
    const [uploadingOrder, setUploadingOrder] = useState(null);
    const [reportFile, setReportFile] = useState(null);
    const [uploadNotes, setUploadNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            loadOrders();
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [activeFilter, search]);

    const loadOrders = async () => {
        setLoading(true);
        try {
            let statusQuery = 'all';
            if (activeFilter === 'collected') statusQuery = 'Sample Collected';
            else if (activeFilter === 'testing') statusQuery = 'In Testing';
            else if (activeFilter === 'ready') statusQuery = 'Report Ready';

            const res = await labAPI.getRequests(statusQuery, search);
            if (res.success) {
                // For 'all-active', we filter for Sample Collected, In Testing, and Report Ready
                if (activeFilter === 'all-active') {
                    const activeList = res.requests.filter(order => 
                        ['Sample Collected', 'In Testing', 'Report Ready'].includes(order.status)
                    );
                    setOrders(activeList);
                } else {
                    setOrders(res.requests);
                }
            }
        } catch (err) {
            console.error("Error loading processing orders:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        loadOrders();
    };

    const handleStartTesting = async (orderId) => {
        if (!window.confirm("Start the analysis/testing process for this sample?")) return;
        try {
            const res = await labAPI.updateStatus(orderId, {
                status: 'In Testing',
                notes: 'Sample sent to the analyzer. Testing process initiated.'
            });
            if (res.success) {
                alert("🔬 Status updated to In Testing!");
                loadOrders();
            }
        } catch (err) {
            alert("Failed to start testing: " + (err.response?.data?.message || err.message));
        }
    };

    const handleOpenUpload = (order) => {
        setUploadingOrder(order);
        setReportFile(null);
        setUploadNotes('');
    };

    const handleFileChange = (e) => {
        setReportFile(e.target.files[0]);
    };

    const handleUploadReportSubmit = async (e) => {
        e.preventDefault();
        if (!reportFile) {
            alert("Please select a report file to upload.");
            return;
        }

        setSubmitting(true);
        const formData = new FormData();
        formData.append('reportFile', reportFile);
        formData.append('notes', uploadNotes || 'Diagnostic report uploaded by laboratory staff.');

        try {
            const res = await labAPI.uploadReport(uploadingOrder._id, formData);
            if (res.success) {
                alert("✅ Lab report uploaded successfully! Status updated to Report Ready.");
                setUploadingOrder(null);
                loadOrders();
            }
        } catch (err) {
            alert("Upload failed: " + (err.response?.data?.message || err.message));
        } finally {
            setSubmitting(false);
        }
    };

    const handleCompleteOrder = async (orderId) => {
        if (!window.confirm("Mark this lab order as completed? Doctor has reviewed and reports are released.")) return;
        try {
            const res = await labAPI.updateStatus(orderId, {
                status: 'Completed',
                notes: 'Lab order completed and finalized. Reports released.'
            });
            if (res.success) {
                alert("✅ Lab order marked Completed!");
                loadOrders();
            }
        } catch (err) {
            alert("Failed to complete order: " + (err.response?.data?.message || err.message));
        }
    };

    const getStatusEmoji = (status) => {
        switch (status) {
            case 'Sample Collected': return '🧪';
            case 'In Testing': return '🔬';
            case 'Report Ready': return '📄';
            default: return '📋';
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <div className="test-processing-page">
            <h2>🔬 Test Analysis & Processing</h2>

            {/* Search Controls */}
            <div className="controls-container">
                <form onSubmit={handleSearchSubmit} className="search-bar-wrap">
                    <input 
                        type="text" 
                        placeholder="Search active orders by Patient Name, ID (P-101), or Order ID..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="search-input-field"
                    />
                    <button type="submit" className="search-icon-btn">🔍</button>
                </form>

                <div className="filters-btn-group">
                    {[
                        { id: 'all-active', label: 'All Active' },
                        { id: 'collected', label: '🧪 Sample Collected' },
                        { id: 'testing', label: '🔬 In Testing' },
                        { id: 'ready', label: '📄 Report Ready' }
                    ].map((btn) => (
                        <button
                            key={btn.id}
                            className={`filter-tab-btn ${activeFilter === btn.id ? 'active' : ''}`}
                            onClick={() => setActiveFilter(btn.id)}
                        >
                            {btn.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Processing List Grid */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading active queue...</div>
            ) : (
                <>
                    {orders.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '50px', background: 'rgba(255,255,255,0.7)', borderRadius: '20px', color: '#64748b' }}>
                            No active orders in this processing stage.
                        </div>
                    ) : (
                        <div className="processing-grid-container">
                            {orders.map((order) => (
                                <div key={order._id} className="processing-order-card">
                                    <div style={{ marginBottom: '14px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                                            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                                                {order.userId?.name || 'Walk-in Patient'}
                                            </h3>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 700, background: '#e2e8f0', color: '#475569', padding: '3px 8px', borderRadius: '6px' }}>
                                                {order.patientId}
                                            </span>
                                        </div>

                                        <div style={{ fontSize: '0.85rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <div><strong>Doctor:</strong> Dr. {order.doctorId?.name || 'N/A'}</div>
                                            <div><strong>Order Status:</strong> {getStatusEmoji(order.status)} {order.status}</div>
                                            
                                            <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: '8px', marginTop: '4px' }}>
                                                <strong>Ordered Tests:</strong>
                                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                                                    {order.testNames && order.testNames.map((test, index) => (
                                                        <span key={index} style={{ background: '#cbd5e1', color: '#334155', padding: '1px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                                                            {test}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Sample collection info card */}
                                    {order.sampleCollected && (
                                        <div className="card-sample-info">
                                            <div><strong>Sample Type:</strong> {order.sampleType}</div>
                                            <div><strong>Collected:</strong> {formatDate(order.sampleCollectedAt)}</div>
                                            {order.collectionNotes && (
                                                <div style={{ marginTop: '2px', fontSize: '0.78rem', color: '#64748b' }}>
                                                    * {order.collectionNotes}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Action button based on state */}
                                    <div className="card-actions-wrapper">
                                        {order.status === 'Sample Collected' && (
                                            <button className="btn-process-action start-test" onClick={() => handleStartTesting(order._id)}>
                                                🔬 Start Testing
                                            </button>
                                        )}
                                        {order.status === 'In Testing' && (
                                            <button className="btn-process-action upload-results" onClick={() => handleOpenUpload(order)}>
                                                📤 Upload Report / Results
                                            </button>
                                        )}
                                        {order.status === 'Report Ready' && (
                                            <button className="btn-process-action complete-test" onClick={() => handleCompleteOrder(order._id)}>
                                                ✅ Mark Completed
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Upload Report Modal */}
            {uploadingOrder && (
                <div className="modal-overlay" onClick={() => setUploadingOrder(null)}>
                    <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: '500px' }}>
                        <h2>📤 Upload Diagnostic Results</h2>
                        <form onSubmit={handleUploadReportSubmit}>
                            <div className="form-group">
                                <label>Patient Name</label>
                                <input type="text" value={uploadingOrder.userId?.name || 'Walk-in Patient'} disabled style={{ background: '#f1f5f9', fontWeight: 600 }} />
                            </div>

                            <div className="form-group">
                                <label>Prescribed Tests</label>
                                <input type="text" value={uploadingOrder.testNames?.join(', ')} disabled style={{ background: '#f1f5f9' }} />
                            </div>

                            <div className="form-group">
                                <label>Select Report File (PDF, JPG, PNG) *</label>
                                <input 
                                    type="file" 
                                    accept=".pdf,.jpg,.png" 
                                    onChange={handleFileChange} 
                                    required 
                                />
                            </div>

                            <div className="form-group">
                                <label>Clinical Results / Technician Notes</label>
                                <textarea 
                                    rows="3" 
                                    placeholder="Enter test values, readings, or specific pathology observations..."
                                    value={uploadNotes}
                                    onChange={(e) => setUploadNotes(e.target.value)}
                                />
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="modal-btn cancel" onClick={() => setUploadingOrder(null)}>
                                    Cancel
                                </button>
                                <button type="submit" className="modal-btn submit" disabled={submitting}>
                                    {submitting ? 'Uploading Report...' : 'Publish Report'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TestProcessing;
