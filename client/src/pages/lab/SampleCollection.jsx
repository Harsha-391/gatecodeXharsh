import React, { useState, useEffect } from 'react';
import { useAuth } from '../../store/hooks';
import { labAPI } from '../../utils/api';
import './SampleCollection.css';

const SampleCollection = () => {
    const { user } = useAuth();
    const [pendingRequests, setPendingRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    
    // Modal state
    const [activeOrder, setActiveOrder] = useState(null);
    const [sampleForm, setSampleForm] = useState({
        sampleType: 'Blood',
        collectionNotes: '',
        collectionTime: ''
    });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            loadPending();
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [search]);

    const loadPending = async () => {
        setLoading(true);
        try {
            // Fetch requests with status='pending'
            const res = await labAPI.getRequests('pending', search);
            if (res.success) {
                setPendingRequests(res.requests);
            }
        } catch (err) {
            console.error("Error loading pending samples:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        loadPending();
    };

    const openCollectionModal = (order) => {
        // Format current local date time for input (YYYY-MM-DDTHH:MM)
        const now = new Date();
        const tzOffset = now.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(now - tzOffset)).toISOString().slice(0, 16);

        setActiveOrder(order);
        setSampleForm({
            sampleType: 'Blood',
            collectionNotes: '',
            collectionTime: localISOTime
        });
    };

    const handleFormChange = (e) => {
        setSampleForm({ ...sampleForm, [e.target.name]: e.target.value });
    };

    const handleSaveSample = async (e) => {
        e.preventDefault();
        if (!activeOrder) return;

        setSubmitting(true);
        try {
            const res = await labAPI.collectSample(activeOrder._id, {
                sampleType: sampleForm.sampleType,
                collectionNotes: sampleForm.collectionNotes,
                collectionTime: sampleForm.collectionTime
            });

            if (res.success) {
                alert(`✅ Sample successfully collected for ${activeOrder.userId?.name || 'Walk-in Patient'}!`);
                setActiveOrder(null);
                loadPending();
            }
        } catch (err) {
            alert("Failed to collect sample: " + (err.response?.data?.message || err.message));
        } finally {
            setSubmitting(false);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric'
        });
    };

    return (
        <div className="sample-collection-page">
            <h2>🧪 Diagnostic Sample Collection</h2>

            {/* Search Controls */}
            <div className="controls-container">
                <form onSubmit={handleSearchSubmit} className="search-bar-wrap">
                    <input 
                        type="text" 
                        placeholder="Search pending orders by Patient Name, ID (P-101), or Order ID..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="search-input-field"
                    />
                    <button type="submit" className="search-icon-btn">🔍</button>
                </form>
            </div>

            {/* Pending List Grid */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading pending requests...</div>
            ) : (
                <>
                    {pendingRequests.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '50px', background: 'rgba(255,255,255,0.7)', borderRadius: '20px', color: '#64748b' }}>
                            🎉 Great! There are no pending samples waiting to be collected.
                        </div>
                    ) : (
                        <div className="pending-grid-container">
                            {pendingRequests.map((req) => (
                                <div key={req._id} className="pending-order-card">
                                    <div>
                                        <div className="card-top-info">
                                            <h3 className="patient-title-name">{req.userId?.name || 'Walk-in Patient'}</h3>
                                            <span className="patient-id-tag">{req.patientId}</span>
                                        </div>

                                        <div className="card-mid-info">
                                            <div><strong>Doctor:</strong> Dr. {req.doctorId?.name || 'N/A'}</div>
                                            <div><strong>Order Date:</strong> {formatDate(req.createdAt)}</div>
                                            
                                            <div className="prescribed-tests-list">
                                                <strong>Ordered Tests:</strong>
                                                <ul>
                                                    {req.testNames && req.testNames.map((test, index) => (
                                                        <li key={index}>{test}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    </div>

                                    <button className="card-btn-action" onClick={() => openCollectionModal(req)}>
                                        🧪 Collect Sample
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Sample Collection Modal */}
            {activeOrder && (
                <div className="modal-overlay" onClick={() => setActiveOrder(null)}>
                    <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: '500px' }}>
                        <h2>🧪 Record Sample Collection</h2>
                        <form onSubmit={handleSaveSample}>
                            <div className="form-group">
                                <label>Patient Name</label>
                                <input type="text" value={activeOrder.userId?.name || 'Walk-in Patient'} disabled style={{ background: '#f1f5f9', fontWeight: 600 }} />
                            </div>

                            <div className="form-group">
                                <label>Sample Type *</label>
                                <select name="sampleType" value={sampleForm.sampleType} onChange={handleFormChange} required>
                                    <option value="Blood">Blood</option>
                                    <option value="Urine">Urine</option>
                                    <option value="Stool">Stool</option>
                                    <option value="Saliva">Saliva</option>
                                    <option value="Sputum">Sputum</option>
                                    <option value="Swab">Swab</option>
                                    <option value="Tissue">Tissue</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Collection Date & Time *</label>
                                <input 
                                    type="datetime-local" 
                                    name="collectionTime"
                                    value={sampleForm.collectionTime}
                                    onChange={handleFormChange}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Collected By (Lab Tech)</label>
                                <input type="text" value={user?.name || 'Lab Technician'} disabled style={{ background: '#f1f5f9' }} />
                            </div>

                            <div className="form-group">
                                <label>Collection Notes</label>
                                <textarea 
                                    name="collectionNotes" 
                                    rows="3" 
                                    placeholder="Enter physical observations, container ID, fast/non-fast status..."
                                    value={sampleForm.collectionNotes}
                                    onChange={handleFormChange}
                                />
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="modal-btn cancel" onClick={() => setActiveOrder(null)}>
                                    Cancel
                                </button>
                                <button type="submit" className="modal-btn submit" disabled={submitting}>
                                    {submitting ? 'Saving Details...' : 'Confirm Collection'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SampleCollection;
