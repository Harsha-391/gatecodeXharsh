import React, { useState, useEffect } from 'react';
import { administratorAPI } from '../../utils/api';
import {
    FiLayers, FiTool, FiCheckCircle, FiAlertCircle,
    FiDatabase, FiActivity, FiRefreshCw,
    FiPlus, FiTrash2, FiCpu, FiSquare
} from 'react-icons/fi';
import { FaBed, FaDoorOpen } from 'react-icons/fa';
import './ResourceManagement.css';

const RESOURCE_TYPES = ['Room', 'Bed', 'Equipment', 'Vehicle', 'Other'];

const typeIcon = (type) => {
    if (type === 'Bed') return <FaBed />;
    if (type === 'Room') return <FaDoorOpen />;
    if (type === 'Equipment') return <FiTool />;
    if (type === 'Vehicle') return <FiActivity />;
    return <FiCpu />;
};

const ResourceManagement = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [resources, setResources] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');
    const [formSuccess, setFormSuccess] = useState('');
    const [form, setForm] = useState({ name: '', type: 'Equipment', total: '', description: '', pricePerDay: '', ward: '' });

    const fetchData = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await administratorAPI.getResources();
            if (res.success) {
                setResources(res.resources || []);
            }
        } catch (err) {
            console.error('Error fetching resources:', err);
            setError('Failed to fetch hospital resources. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    const handleAddResource = async (e) => {
        e.preventDefault();
        if (submitting) return;
        setFormError('');
        setFormSuccess('');

        if (!form.name.trim() || !form.total) {
            setFormError('Resource name and total count are required.');
            return;
        }
        if (Number(form.total) <= 0) {
            setFormError('Total count must be greater than zero.');
            return;
        }

        setSubmitting(true);
        try {
            const res = await administratorAPI.createResource({
                name: form.name.trim(),
                type: form.type,
                total: Number(form.total),
                description: form.description.trim(),
                pricePerDay: (form.type === 'Bed' || form.type === 'Room') ? (Number(form.pricePerDay) || 0) : 0,
                ward: (form.type === 'Bed' || form.type === 'Room') ? form.ward.trim() : ''
            });
            if (res.success) {
                setFormSuccess('Resource added successfully!');
                setForm({ name: '', type: 'Equipment', total: '', description: '', pricePerDay: '', ward: '' });
                setShowForm(false);
                await fetchData();
            }
        } catch (err) {
            setFormError(err.response?.data?.message || 'Error adding resource.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteResource = async (id) => {
        if (!window.confirm('Are you sure you want to delete this resource?')) return;
        try {
            await administratorAPI.deleteResource(id);
            await fetchData();
        } catch (err) {
            setError('Failed to delete resource.');
        }
    };

    if (loading) {
        return (
            <div className="resources-loading">
                <FiRefreshCw className="spinner-icon spinning" />
                <p>Loading hospital resources...</p>
            </div>
        );
    }

    return (
        <div className="resources-page">
            <div className="res-header">
                <div>
                    <h1>Resource &amp; Asset Management</h1>
                    <p>Manage hospital rooms, beds, equipment, and other assets. All data is stored in your hospital's database.</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => { setShowForm(s => !s); setFormError(''); setFormSuccess(''); }} className="btn-add-resource">
                        <FiPlus /> <span>{showForm ? 'Cancel' : 'Add Resource'}</span>
                    </button>
                    <button onClick={fetchData} className="btn-refresh-res">
                        <FiRefreshCw /> <span>Refresh</span>
                    </button>
                </div>
            </div>

            {error && (
                <div className="res-banner error">
                    <FiAlertCircle /> <span>{error}</span>
                </div>
            )}

            {/* Add Resource Form */}
            {showForm && (
                <div className="res-add-form-card">
                    <h2><FiPlus /> Add New Resource</h2>
                    {formError && <div className="res-banner error"><FiAlertCircle /> <span>{formError}</span></div>}
                    {formSuccess && <div className="res-banner success"><FiCheckCircle /> <span>{formSuccess}</span></div>}
                    <form onSubmit={handleAddResource} className="res-form-grid">
                        <div className="res-form-group">
                            <label htmlFor="res-name">Resource Name *</label>
                            <input
                                id="res-name"
                                type="text"
                                name="name"
                                value={form.name}
                                onChange={handleFormChange}
                                placeholder="e.g., ICU Ventilator, Hospital Bed"
                                required
                            />
                        </div>
                        <div className="res-form-group">
                            <label htmlFor="res-type">Resource Type *</label>
                            <select id="res-type" name="type" value={form.type} onChange={handleFormChange}>
                                {RESOURCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div className="res-form-group">
                            <label htmlFor="res-total">Total Count *</label>
                            <input
                                id="res-total"
                                type="number"
                                name="total"
                                value={form.total}
                                onChange={handleFormChange}
                                placeholder="e.g., 10"
                                min="1"
                                required
                            />
                        </div>
                        {(form.type === 'Bed' || form.type === 'Room') && (
                            <>
                                <div className="res-form-group">
                                    <label htmlFor="res-price">Price per Day (₹) *</label>
                                    <input
                                        id="res-price"
                                        type="number"
                                        name="pricePerDay"
                                        value={form.pricePerDay}
                                        onChange={handleFormChange}
                                        placeholder="e.g., 800"
                                        min="0"
                                        required
                                    />
                                </div>
                                <div className="res-form-group">
                                    <label htmlFor="res-ward">Ward / Department</label>
                                    <input
                                        id="res-ward"
                                        type="text"
                                        name="ward"
                                        value={form.ward}
                                        onChange={handleFormChange}
                                        placeholder="e.g., ICU, General Ward"
                                    />
                                </div>
                            </>
                        )}
                        <div className="res-form-group res-form-group--full">
                            <label htmlFor="res-description">Description (Optional)</label>
                            <input
                                id="res-description"
                                type="text"
                                name="description"
                                value={form.description}
                                onChange={handleFormChange}
                                placeholder="e.g., Used in ICU ward"
                            />
                        </div>
                        <div className="res-form-actions">
                            <button type="submit" className="btn-save-resource" disabled={submitting}>
                                {submitting ? 'Saving...' : '+ Add Resource'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Resource List */}
            <h2>Active Resources</h2>
            {resources.length === 0 ? (
                <div className="res-empty-state">
                    <FiDatabase size={40} />
                    <p>No resources configured yet. Click <strong>Add Resource</strong> above to get started.</p>
                </div>
            ) : (
                <div className="res-grid">
                    {resources.map((resItem) => {
                        const isHigh = resItem.utilization >= 80;
                        return (
                            <div key={resItem._id} className="res-card-item">
                                <div className="res-card-header">
                                    <div className="icon-box">{typeIcon(resItem.type)}</div>
                                    <span className={`type-tag ${String(resItem.type).toLowerCase()}`}>{resItem.type}</span>
                                    <button
                                        className="res-delete-btn"
                                        onClick={() => handleDeleteResource(resItem._id)}
                                        title="Delete resource"
                                    >
                                        <FiTrash2 />
                                    </button>
                                </div>
                                <div className="res-card-body">
                                    <h3>{resItem.name}</h3>
                                    {resItem.description && <p className="res-desc">{resItem.description}</p>}
                                    {(resItem.type === 'Bed' || resItem.type === 'Room') && (
                                        <div style={{ display: 'flex', gap: '8px', fontSize: '0.8rem', margin: '8px 0 12px' }}>
                                            <span style={{ background: '#e0f2fe', padding: '3px 8px', borderRadius: '6px', color: '#0369a1', fontWeight: 600 }}>₹{resItem.pricePerDay}/day</span>
                                            {resItem.ward && <span style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px', color: '#475569', fontWeight: 600 }}>Ward: {resItem.ward}</span>}
                                        </div>
                                    )}
                                    <div className="util-score">
                                        <strong>{resItem.occupied}</strong> <span>/ {resItem.total} Units</span>
                                    </div>
                                    <div className="util-progress-row">
                                        <div className="bar-outer">
                                            <div className={`bar-inner ${isHigh ? 'high' : ''}`} style={{ width: `${resItem.utilization}%` }} />
                                        </div>
                                        <span className="percent-txt">{resItem.utilization}% Utilization</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ResourceManagement;
