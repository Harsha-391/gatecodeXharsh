import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { labAPI, publicAPI } from '../../utils/api';
import socket from '../../utils/socket';
import './LabDashboard.css';

const LabDashboard = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState({ pending: 0, completed: 0, revenue: 0, inProgress: 0, total: 0, labName: 'Lab' });
    const [loading, setLoading] = useState(true);
    const [doctorsList, setDoctorsList] = useState([]);

    // Form Modal states
    const [showAddModal, setShowAddModal] = useState(false);
    const [formData, setFormData] = useState({
        patientId: '',
        testNames: '',
        amount: '',
        paymentStatus: 'PENDING',
        paymentMode: 'NONE',
        notes: '',
        doctorId: ''
    });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        loadStats();
        fetchDoctors();

        const handleLiveRefresh = (notif) => {
            if (!notif || notif.referenceType === 'LabReport' || notif.message?.toLowerCase().includes('lab')) {
                loadStats();
            }
        };

        socket.on('newNotification', handleLiveRefresh);
        socket.on('new_notification', handleLiveRefresh);
        socket.on('sample_collected', loadStats);
        socket.on('sample_status_updated', loadStats);

        return () => {
            socket.off('newNotification', handleLiveRefresh);
            socket.off('new_notification', handleLiveRefresh);
            socket.off('sample_collected', loadStats);
            socket.off('sample_status_updated', loadStats);
        };
    }, []);

    const loadStats = async () => {
        try {
            const res = await labAPI.getStats();
            if (res.success) {
                setStats(res.stats);
            }
        } catch (err) {
            console.error("Error loading stats:", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchDoctors = async () => {
        try {
            const res = await publicAPI.getDoctors();
            if (res.success && Array.isArray(res.doctors)) {
                setDoctorsList(res.doctors);
            }
        } catch (err) {
            console.error("Error fetching doctors:", err);
        }
    };

    const handleFormChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };



    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.patientId || !formData.testNames) {
            alert("Please fill in Patient ID and Test Names.");
            return;
        }

        setSubmitting(true);
        const data = new FormData();
        data.append('patientId', formData.patientId);
        data.append('testNames', JSON.stringify(formData.testNames.split(',').map(t => t.trim())));
        data.append('amount', formData.amount || 0);
        data.append('paymentStatus', formData.paymentStatus);
        data.append('paymentMode', formData.paymentMode);
        data.append('notes', formData.notes);
        if (formData.doctorId) {
            data.append('doctorId', formData.doctorId);
        }


        try {
            const res = await labAPI.createReport(data);
            if (res.success) {
                alert("✅ Lab Test Report Registered Successfully!");
                setShowAddModal(false);
                setFormData({ patientId: '', testNames: '', amount: '', paymentStatus: 'PENDING', paymentMode: 'NONE', notes: '', doctorId: '' });
                loadStats();
            }
        } catch (err) {
            alert("Failed to create report: " + (err.response?.data?.message || err.message));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="lab-dashboard">
            <div className="lab-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1>🔬 {stats.labName} Dashboard</h1>
                    <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '2px 0 0' }}>
                        Manage test requests and upload reports • Auto-refreshes every 30s
                    </p>
                </div>
                <button className="action-btn" onClick={() => setShowAddModal(true)}>
                    ➕ Register Walk-in Test
                </button>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading stats...</div>
            ) : (
                <>
                    {/* Stats Grid */}
                    <div className="lab-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', margin: '20px 0' }}>
                        <div className="lab-stat-card total" onClick={() => navigate('/lab/orders')}
                            style={{ background: '#f8fafc', borderRadius: '12px', padding: '18px', textAlign: 'center', border: '1px solid #e2e8f0', cursor: 'pointer' }}>
                            <h3 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, color: '#475569' }}>{stats.totalOrders || 0}</h3>
                            <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Total Orders</p>
                        </div>
                        <div className="lab-stat-card pending" onClick={() => navigate('/lab/sample-collection')}
                            style={{ background: '#fffbeb', borderRadius: '12px', padding: '18px', textAlign: 'center', border: '1px solid #fde68a', cursor: 'pointer' }}>
                            <h3 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, color: '#d97706' }}>{stats.pendingSamples || 0}</h3>
                            <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>🟡 Pending Samples</p>
                        </div>
                        <div className="lab-stat-card collected" onClick={() => navigate('/lab/processing')}
                            style={{ background: '#eff6ff', borderRadius: '12px', padding: '18px', textAlign: 'center', border: '1px solid #bfdbfe', cursor: 'pointer' }}>
                            <h3 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, color: '#2563eb' }}>{stats.collectedSamples || 0}</h3>
                            <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>🧪 Collected Samples</p>
                        </div>
                        <div className="lab-stat-card testing" onClick={() => navigate('/lab/processing')}
                            style={{ background: '#f5f3ff', borderRadius: '12px', padding: '18px', textAlign: 'center', border: '1px solid #ddd6fe', cursor: 'pointer' }}>
                            <h3 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, color: '#7c3aed' }}>{stats.inTesting || 0}</h3>
                            <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>🔬 In Testing</p>
                        </div>
                        <div className="lab-stat-card ready" onClick={() => navigate('/lab/completed')}
                            style={{ background: '#ecfeff', borderRadius: '12px', padding: '18px', textAlign: 'center', border: '1px solid #a5f3fc', cursor: 'pointer' }}>
                            <h3 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, color: '#0e7490' }}>{stats.reportsReady || 0}</h3>
                            <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>📄 Reports Ready</p>
                        </div>
                        <div className="lab-stat-card revenue"
                            style={{ background: '#f0fdf4', borderRadius: '12px', padding: '18px', textAlign: 'center', border: '1px solid #bbf7d0' }}>
                            <h3 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, color: '#16a34a' }}>₹{stats.revenue || 0}</h3>
                            <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Est. Revenue</p>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="lab-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', margin: '24px 0' }}>
                        <button className="action-btn" onClick={() => navigate('/lab/orders')}
                            style={{ padding: '12px 24px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #3b82f6, #0a2647)', color: '#fff', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            📋 View Lab Orders
                        </button>
                        <button className="action-btn" onClick={() => navigate('/lab/sample-collection')}
                            style={{ padding: '12px 24px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #14b8a6, #0a2647)', color: '#fff', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            🧪 Sample Collection
                        </button>
                        <button className="action-btn" onClick={() => navigate('/lab/processing')}
                            style={{ padding: '12px 24px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #8b5cf6, #0a2647)', color: '#fff', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            🔬 Test Processing
                        </button>
                        <button className="action-btn secondary" onClick={() => navigate('/lab/completed')}
                            style={{ padding: '12px 24px', borderRadius: '10px', border: '1.5px solid #14b8a6', background: 'transparent', color: '#14b8a6', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            🗄️ Past Reports Archive
                        </button>
                    </div>
                </>
            )}

            {/* Walk-in Modal Form */}
            {showAddModal && (
                <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
                    <div className="modal-card" onClick={(e) => e.stopPropagation()} data-lenis-prevent>
                        <h2>🔬 Walk-in Lab Test Registration</h2>
                        <form onSubmit={handleSubmit} data-lenis-prevent>
                            <div className="form-group">
                                <label>Patient Name or ID *</label>
                                <input type="text" name="patientId" placeholder="Enter Patient Name or ID (e.g. John Doe / P-101)"
                                    value={formData.patientId} onChange={handleFormChange} required />
                            </div>

                            <div className="form-group">
                                <label>Test Names (comma separated) *</label>
                                <input type="text" name="testNames" placeholder="e.g. CBC, Lipid Profile, Thyroid"
                                    value={formData.testNames} onChange={handleFormChange} required />
                            </div>

                            <div className="form-group">
                                <label>Assign / Send to Doctor</label>
                                <select name="doctorId" value={formData.doctorId} onChange={handleFormChange}>
                                    <option value="">-- Choose Specific Doctor (Optional) --</option>
                                    {doctorsList.map(doc => (
                                        <option key={doc._id} value={doc.userId?._id || doc.userId}>
                                            Dr. {doc.name} {doc.specialty ? `(${doc.specialty})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Amount (₹)</label>
                                <input type="number" name="amount" placeholder="0" value={formData.amount} onChange={handleFormChange} min="0" />
                            </div>

                            <div className="form-row-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div className="form-group">
                                    <label>Payment Status</label>
                                    <select name="paymentStatus" value={formData.paymentStatus} onChange={handleFormChange}>
                                        <option value="PENDING">Pending</option>
                                        <option value="PAID">Paid</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Payment Mode</label>
                                    <select name="paymentMode" value={formData.paymentMode} onChange={handleFormChange}>
                                        <option value="NONE">None</option>
                                        <option value="CASH">Cash</option>
                                        <option value="UPI">UPI</option>
                                        <option value="CARD">Card</option>
                                        <option value="ONLINE">Online</option>
                                    </select>
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Clinical Notes</label>
                                <textarea name="notes" rows="3" placeholder="Any laboratory notes, test values, or observations..."
                                    value={formData.notes} onChange={handleFormChange} />
                            </div>

                            <div className="modal-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
                                <button type="button" className="modal-btn cancel" onClick={() => setShowAddModal(false)}
                                    style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                                    Cancel
                                </button>
                                <button type="submit" className="modal-btn submit" disabled={submitting}
                                    style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #14b8a6, #0a2647)', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
                                    {submitting ? 'Registering...' : 'Register Lab Test'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LabDashboard;
