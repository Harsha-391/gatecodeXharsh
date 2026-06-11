import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { labAPI, labTestAPI, adminEntitiesAPI } from '../../utils/api';
import {
    FiGrid, FiList, FiTrendingUp, FiActivity,
    FiPlusSquare, FiFileText, FiTrash2, FiEdit2, FiCheckCircle, FiAlertCircle
} from 'react-icons/fi';
import './LaboratoryManagement.css';

const LaboratoryManagement = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('requests');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // State for Requests
    const [requests, setRequests] = useState([]);
    const [requestsFilter, setRequestsFilter] = useState('all');
    const [requestsSearch, setRequestsSearch] = useState('');

    // State for Catalog
    const [tests, setTests] = useState([]);
    const [editingTest, setEditingTest] = useState(null);
    const [showTestForm, setShowTestForm] = useState(false);
    const [testFormData, setTestFormData] = useState({
        name: '',
        code: '',
        description: '',
        price: '',
        category: 'General',
        isActive: true
    });

    // State for Lab Accounts
    const [labs, setLabs] = useState([]);
    const [editingLab, setEditingLab] = useState(null);
    const [showLabForm, setShowLabForm] = useState(false);
    const [labFormData, setLabFormData] = useState({
        name: '',
        email: '',
        phone: '',
        address: '',
        password: '',
        services: [],
        description: ''
    });

    useEffect(() => {
        if (activeTab === 'requests') {
            fetchRequests();
        } else if (activeTab === 'catalog') {
            fetchCatalog();
        } else if (activeTab === 'labs') {
            fetchLabs();
        }
    }, [activeTab, requestsFilter]);

    // --- REQUESTS LOGIC ---
    const fetchRequests = async () => {
        setLoading(true);
        setError('');
        try {
            const statusVal = requestsFilter === 'all' ? '' : requestsFilter;
            const res = await labAPI.getRequests(statusVal, requestsSearch);
            if (res.success) {
                setRequests(res.requests || []);
            }
        } catch (err) {
            console.error('Error fetching requests:', err);
            setError('Failed to fetch laboratory requests.');
        } finally {
            setLoading(false);
        }
    };

    const handleCancelReport = async (id) => {
        if (!window.confirm('Are you sure you want to cancel this lab request?')) return;
        try {
            const res = await labAPI.cancelReport(id);
            if (res.success) {
                setSuccess('Lab request cancelled successfully.');
                fetchRequests();
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error cancelling request.');
        }
    };

    // --- CATALOG LOGIC ---
    const fetchCatalog = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await labTestAPI.getLabTests();
            if (res.success) {
                setTests(res.data || []);
            }
        } catch (err) {
            console.error('Error fetching catalog:', err);
            setError('Failed to fetch test catalog.');
        } finally {
            setLoading(false);
        }
    };

    const handleTestSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');
        try {
            const payload = {
                ...testFormData,
                price: Number(testFormData.price) || 0
            };
            if (editingTest) {
                const res = await labTestAPI.updateLabTest(editingTest._id, payload);
                if (res.success) {
                    setSuccess('Lab test updated successfully.');
                    resetTestForm();
                    fetchCatalog();
                }
            } else {
                const res = await labTestAPI.createLabTest(payload);
                if (res.success) {
                    setSuccess('New lab test added to catalog.');
                    resetTestForm();
                    fetchCatalog();
                }
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error saving lab test.');
        } finally {
            setLoading(false);
        }
    };

    const handleTestDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this lab test?')) return;
        try {
            const res = await labTestAPI.deleteLabTest(id);
            if (res.success) {
                setSuccess('Lab test deleted successfully.');
                fetchCatalog();
            }
        } catch (err) {
            setError('Error deleting lab test.');
        }
    };

    const resetTestForm = () => {
        setTestFormData({
            name: '',
            code: '',
            description: '',
            price: '',
            category: 'General',
            isActive: true
        });
        setEditingTest(null);
        setShowTestForm(false);
    };

    // --- LAB PROFILES LOGIC ---
    const fetchLabs = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await adminEntitiesAPI.getLabs();
            if (res.success) {
                setLabs(res.labs || []);
            }
        } catch (err) {
            setError('Failed to fetch laboratory profiles.');
        } finally {
            setLoading(false);
        }
    };

    const handleLabSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');
        try {
            if (editingLab) {
                const res = await adminEntitiesAPI.updateLab(editingLab._id, labFormData);
                if (res.success) {
                    setSuccess('Laboratory account updated.');
                    resetLabForm();
                    fetchLabs();
                }
            } else {
                if (!labFormData.password) {
                    setError('Password is required for new accounts.');
                    setLoading(false);
                    return;
                }
                const res = await adminEntitiesAPI.createLab(labFormData);
                if (res.success) {
                    setSuccess('Laboratory account created.');
                    resetLabForm();
                    fetchLabs();
                }
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error saving laboratory.');
        } finally {
            setLoading(false);
        }
    };

    const handleLabDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this laboratory?')) return;
        try {
            const res = await adminEntitiesAPI.deleteLab(id);
            if (res.success) {
                setSuccess('Laboratory account deleted.');
                fetchLabs();
            }
        } catch (err) {
            setError('Error deleting laboratory.');
        }
    };

    const resetLabForm = () => {
        setLabFormData({
            name: '',
            email: '',
            phone: '',
            address: '',
            password: '',
            services: [],
            description: ''
        });
        setEditingLab(null);
        setShowLabForm(false);
    };

    // --- ANALYTICS DATA ---
    const getAnalyticsSummary = () => {
        const counts = {
            total: requests.length,
            pending: requests.filter(r => (r.status || r.testStatus) === 'Pending' || (r.status || r.testStatus) === 'PENDING').length,
            testing: requests.filter(r => (r.status || r.testStatus) === 'In Testing' || (r.status || r.testStatus) === 'IN_PROGRESS').length,
            completed: requests.filter(r => (r.status || r.testStatus) === 'Completed').length,
            cancelled: requests.filter(r => (r.status || r.testStatus) === 'Cancelled').length
        };
        return counts;
    };

    const summary = getAnalyticsSummary();

    return (
        <div className="lab-mgmt-page">
            <div className="lab-mgmt-header">
                <div>
                    <h1>Clinical Laboratory Oversight</h1>
                    <p>Track clinical testing queues, configure laboratory accounts, and update tests catalog.</p>
                </div>
            </div>

            {/* Sub Tabs Selection */}
            <div className="lab-tabs-row">
                <button className={`lab-tab-btn ${activeTab === 'requests' ? 'active' : ''}`} onClick={() => setActiveTab('requests')}>
                    <FiList /> <span>Requests & Queues ({requests.length})</span>
                </button>
                <button className={`lab-tab-btn ${activeTab === 'catalog' ? 'active' : ''}`} onClick={() => setActiveTab('catalog')}>
                    <FiGrid /> <span>Tests Catalog</span>
                </button>
                <button className={`lab-tab-btn ${activeTab === 'labs' ? 'active' : ''}`} onClick={() => setActiveTab('labs')}>
                    <FiActivity /> <span>Laboratories</span>
                </button>
                <button className={`lab-tab-btn ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>
                    <FiTrendingUp /> <span>Report Analytics</span>
                </button>
            </div>

            {error && (
                <div className="lab-status-banner error">
                    <FiAlertCircle /> <span>{error}</span>
                </div>
            )}
            {success && (
                <div className="lab-status-banner success">
                    <FiCheckCircle /> <span>{success}</span>
                </div>
            )}

            {/* TAB CONTENT: REQUESTS QUEUE */}
            {activeTab === 'requests' && (
                <div className="lab-content-card animate-fade">
                    <div className="requests-filter-bar">
                        <div className="search-box">
                            <input
                                type="text"
                                placeholder="Search Patient name or ID..."
                                value={requestsSearch}
                                onChange={(e) => setRequestsSearch(e.target.value)}
                            />
                            <button onClick={fetchRequests} className="btn-search-go">Search</button>
                        </div>
                        <div className="filters-radios">
                            <button className={`filter-opt ${requestsFilter === 'all' ? 'active' : ''}`} onClick={() => setRequestsFilter('all')}>All</button>
                            <button className={`filter-opt ${requestsFilter === 'pending' ? 'active' : ''}`} onClick={() => setRequestsFilter('pending')}>Pending</button>
                            <button className={`filter-opt ${requestsFilter === 'in_progress' ? 'active' : ''}`} onClick={() => setRequestsFilter('in_progress')}>In Testing</button>
                            <button className={`filter-opt ${requestsFilter === 'completed' ? 'active' : ''}`} onClick={() => setRequestsFilter('completed')}>Completed</button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="lab-loading">Fetching laboratory requests...</div>
                    ) : requests.length === 0 ? (
                        <div className="lab-empty">No active lab requests found matching criteria.</div>
                    ) : (
                        <div className="lab-table-container">
                            <table className="lab-table">
                                <thead>
                                    <tr>
                                        <th>Patient ID</th>
                                        <th>Patient Name</th>
                                        <th>Prescribed By</th>
                                        <th>Requested Tests</th>
                                        <th>Status</th>
                                        <th>Order Date</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {requests.map((req) => (
                                        <tr key={req._id}>
                                            <td><strong>{req.patientId || req.userId?.patientId || 'N/A'}</strong></td>
                                            <td>{req.userId?.name || 'Walk-in Patient'}</td>
                                            <td>{req.doctorId?.name || 'Self Prescribed'}</td>
                                            <td>
                                                <div className="test-badges-list">
                                                    {(req.tests || [req.testName]).filter(Boolean).map((t, idx) => (
                                                        <span key={idx} className="test-badge">{t}</span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`status-badge-val ${String(req.status || req.testStatus).toLowerCase().replace(' ', '_')}`}>
                                                    {req.status || req.testStatus}
                                                </span>
                                            </td>
                                            <td>{new Date(req.createdAt).toLocaleDateString()}</td>
                                            <td>
                                                {['Pending', 'PENDING'].includes(req.status || req.testStatus) && (
                                                    <button onClick={() => handleCancelReport(req._id)} className="btn-table-cancel" title="Cancel Request">
                                                        <FiTrash2 /> Cancel
                                                    </button>
                                                )}
                                                {!(['Pending', 'PENDING'].includes(req.status || req.testStatus)) && (
                                                    <span className="text-muted-actions">No Actions</span>
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

            {/* TAB CONTENT: CATALOG */}
            {activeTab === 'catalog' && (
                <div className="lab-content-card animate-fade">
                    <div className="panel-sub-header">
                        <h2>Lab Tests Catalog</h2>
                        <button className="btn-primary-lab" onClick={() => { setShowTestForm(!showTestForm); setEditingTest(null); }}>
                            {showTestForm ? 'Cancel' : '+ Create Test'}
                        </button>
                    </div>

                    {showTestForm && (
                        <form onSubmit={handleTestSubmit} className="lab-form-container">
                            <h3>{editingTest ? 'Edit Lab Test details' : 'Add New Lab Test to Catalog'}</h3>
                            <div className="form-grid">
                                <div className="form-field">
                                    <label>Test Name *</label>
                                    <input
                                        type="text"
                                        value={testFormData.name}
                                        onChange={(e) => setTestFormData({ ...testFormData, name: e.target.value })}
                                        required
                                        placeholder="e.g. Lipid Profile Basic"
                                    />
                                </div>
                                <div className="form-field">
                                    <label>Test Code</label>
                                    <input
                                        type="text"
                                        value={testFormData.code}
                                        onChange={(e) => setTestFormData({ ...testFormData, code: e.target.value })}
                                        placeholder="e.g. LIP-01"
                                    />
                                </div>
                                <div className="form-field">
                                    <label>Category</label>
                                    <input
                                        type="text"
                                        value={testFormData.category}
                                        onChange={(e) => setTestFormData({ ...testFormData, category: e.target.value })}
                                        placeholder="e.g. Biochemistry"
                                    />
                                </div>
                                <div className="form-field">
                                    <label>Base Price (₹) *</label>
                                    <input
                                        type="number"
                                        value={testFormData.price}
                                        onChange={(e) => setTestFormData({ ...testFormData, price: e.target.value })}
                                        required
                                        placeholder="e.g. 450"
                                    />
                                </div>
                                <div className="form-field full-row">
                                    <label>Guidelines / Instructions</label>
                                    <textarea
                                        value={testFormData.description}
                                        onChange={(e) => setTestFormData({ ...testFormData, description: e.target.value })}
                                        placeholder="e.g. Fasting 10-12 hours required before blood collection."
                                        rows="2"
                                    />
                                </div>
                                <div className="form-field checkbox-row">
                                    <input
                                        type="checkbox"
                                        id="isActiveTest"
                                        checked={testFormData.isActive}
                                        onChange={(e) => setTestFormData({ ...testFormData, isActive: e.target.checked })}
                                    />
                                    <label htmlFor="isActiveTest">Active (Visible to Doctors & Patients)</label>
                                </div>
                            </div>
                            <div className="form-actions-lab">
                                <button type="submit" className="btn-save-form">Save Test</button>
                                <button type="button" onClick={resetTestForm} className="btn-cancel-form">Cancel</button>
                            </div>
                        </form>
                    )}

                    {loading && !tests.length ? (
                        <div className="lab-loading">Fetching catalog data...</div>
                    ) : (
                        <div className="lab-table-container">
                            <table className="lab-table">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Code</th>
                                        <th>Category</th>
                                        <th>Base Price</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tests.map((test) => (
                                        <tr key={test._id}>
                                            <td><strong>{test.name}</strong></td>
                                            <td>{test.code || '-'}</td>
                                            <td>{test.category || 'General'}</td>
                                            <td>₹{test.price || 0}</td>
                                            <td>
                                                <span className={`status-badge-val ${test.isActive ? 'active' : 'inactive'}`}>
                                                    {test.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="actions-cell">
                                                    <button onClick={() => {
                                                        setEditingTest(test);
                                                        setTestFormData({
                                                            name: test.name,
                                                            code: test.code || '',
                                                            category: test.category || 'General',
                                                            price: test.price || '',
                                                            description: test.description || '',
                                                            isActive: test.isActive
                                                        });
                                                        setShowTestForm(true);
                                                    }} className="btn-table-edit"><FiEdit2 /> Edit</button>
                                                    <button onClick={() => handleTestDelete(test._id)} className="btn-table-delete"><FiTrash2 /> Delete</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* TAB CONTENT: LABORATORIES */}
            {activeTab === 'labs' && (
                <div className="lab-content-card animate-fade">
                    <div className="panel-sub-header">
                        <h2>Laboratories Configuration</h2>
                        <button className="btn-primary-lab" onClick={() => { setShowLabForm(!showLabForm); setEditingLab(null); }}>
                            {showLabForm ? 'Cancel' : '+ Register Lab'}
                        </button>
                    </div>

                    {showLabForm && (
                        <form onSubmit={handleLabSubmit} className="lab-form-container">
                            <h3>{editingLab ? 'Edit Lab Account' : 'Register New Laboratory Account'}</h3>
                            <div className="form-grid">
                                <div className="form-field">
                                    <label>Lab Name *</label>
                                    <input
                                        type="text"
                                        value={labFormData.name}
                                        onChange={(e) => setLabFormData({ ...labFormData, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-field">
                                    <label>Login Email *</label>
                                    <input
                                        type="email"
                                        value={labFormData.email}
                                        onChange={(e) => setLabFormData({ ...labFormData, email: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-field">
                                    <label>Phone Number</label>
                                    <input
                                        type="text"
                                        value={labFormData.phone}
                                        onChange={(e) => setLabFormData({ ...labFormData, phone: e.target.value })}
                                    />
                                </div>
                                <div className="form-field">
                                    <label>{editingLab ? 'New Password (blank to keep same)' : 'Login Password *'}</label>
                                    <input
                                        type="password"
                                        value={labFormData.password}
                                        onChange={(e) => setLabFormData({ ...labFormData, password: e.target.value })}
                                        required={!editingLab}
                                    />
                                </div>
                                <div className="form-field full-row">
                                    <label>Laboratory Physical Address</label>
                                    <input
                                        type="text"
                                        value={labFormData.address}
                                        onChange={(e) => setLabFormData({ ...labFormData, address: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="form-actions-lab">
                                <button type="submit" className="btn-save-form">Save Lab</button>
                                <button type="button" onClick={resetLabForm} className="btn-cancel-form">Cancel</button>
                            </div>
                        </form>
                    )}

                    {loading && !labs.length ? (
                        <div className="lab-loading">Fetching laboratory personnel...</div>
                    ) : (
                        <div className="lab-table-container">
                            <table className="lab-table">
                                <thead>
                                    <tr>
                                        <th>Lab Name</th>
                                        <th>Email</th>
                                        <th>Phone</th>
                                        <th>Address</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {labs.map((lab) => (
                                        <tr key={lab._id}>
                                            <td><strong>{lab.name}</strong></td>
                                            <td>{lab.email}</td>
                                            <td>{lab.phone || '-'}</td>
                                            <td>{lab.address || 'Hospital In-house'}</td>
                                            <td>
                                                <div className="actions-cell">
                                                    <button onClick={() => {
                                                        setEditingLab(lab);
                                                        setLabFormData({
                                                            name: lab.name,
                                                            email: lab.email,
                                                            phone: lab.phone || '',
                                                            address: lab.address || '',
                                                            password: '',
                                                            services: lab.services || [],
                                                            description: lab.description || ''
                                                        });
                                                        setShowLabForm(true);
                                                    }} className="btn-table-edit"><FiEdit2 /> Edit</button>
                                                    <button onClick={() => handleLabDelete(lab._id)} className="btn-table-delete"><FiTrash2 /> Delete</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* TAB CONTENT: ANALYTICS */}
            {activeTab === 'analytics' && (
                <div className="lab-content-card animate-fade">
                    <h2>Operational Lab Analytics</h2>
                    <div className="analytics-stats-grid">
                        <div className="stat-card cyan">
                            <h3>{summary.total}</h3>
                            <span>Total Ordered Tests</span>
                        </div>
                        <div className="stat-card orange">
                            <h3>{summary.pending}</h3>
                            <span>Pending Processing</span>
                        </div>
                        <div className="stat-card blue">
                            <h3>{summary.testing}</h3>
                            <span>Currently in Testing</span>
                        </div>
                        <div className="stat-card green">
                            <h3>{summary.completed}</h3>
                            <span>Reports Finalized</span>
                        </div>
                    </div>

                    <div className="svg-analytics-row" style={{ marginTop: '24px' }}>
                        <div className="analytics-chart-box">
                            <h4>Test Requests Breakdown</h4>
                            <svg viewBox="0 0 400 200" className="analytics-svg">
                                <rect x="40" y="20" width="320" height="150" fill="none" stroke="#f1f5f9" />
                                <line x1="40" y1="170" x2="360" y2="170" stroke="#cbd5e1" strokeWidth="2" />
                                
                                {/* Bars */}
                                <rect x="70" y={170 - (summary.pending * 20)} width="40" height={summary.pending * 20} fill="#f59e0b" rx="2" />
                                <rect x="150" y={170 - (summary.testing * 20)} width="40" height={summary.testing * 20} fill="#3b82f6" rx="2" />
                                <rect x="230" y={170 - (summary.completed * 20)} width="40" height={summary.completed * 20} fill="#10b981" rx="2" />
                                <rect x="310" y={170 - (summary.cancelled * 20)} width="40" height={summary.cancelled * 20} fill="#ef4444" rx="2" />

                                {/* Labels */}
                                <text x="90" y="190" textAnchor="middle" fontSize="11" fill="#64748b">Pending</text>
                                <text x="170" y="190" textAnchor="middle" fontSize="11" fill="#64748b">Testing</text>
                                <text x="250" y="190" textAnchor="middle" fontSize="11" fill="#64748b">Completed</text>
                                <text x="330" y="190" textAnchor="middle" fontSize="11" fill="#64748b">Cancelled</text>

                                {/* Counts */}
                                <text x="90" y={160 - (summary.pending * 20)} textAnchor="middle" fontSize="11" fill="#1e293b" fontWeight="600">{summary.pending}</text>
                                <text x="170" y={160 - (summary.testing * 20)} textAnchor="middle" fontSize="11" fill="#1e293b" fontWeight="600">{summary.testing}</text>
                                <text x="250" y={160 - (summary.completed * 20)} textAnchor="middle" fontSize="11" fill="#1e293b" fontWeight="600">{summary.completed}</text>
                                <text x="330" y={160 - (summary.cancelled * 20)} textAnchor="middle" fontSize="11" fill="#1e293b" fontWeight="600">{summary.cancelled}</text>
                            </svg>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LaboratoryManagement;
