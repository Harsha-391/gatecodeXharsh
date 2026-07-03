import React, { useState, useEffect, useRef } from 'react';
import { adminAPI, uploadAPI } from '../../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FiUploadCloud, FiTrash2, FiSave, FiRefreshCw, FiSliders, FiEye, FiCheck, FiX, FiFileText } from 'react-icons/fi';
import './ClinicDashboard.css';

const TEMPLATE_TYPES = [
    { value: 'doctor_prescription', label: 'Doctor Prescription' },
    { value: 'billing_payment', label: 'Billing & Payments' }
];

const DocumentTemplates = () => {
    const navigate = useNavigate();
    const [templates, setTemplates] = useState([]);
    const [selectedType, setSelectedType] = useState('doctor_prescription');
    const [activeTemplate, setActiveTemplate] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);
    const [logs, setLogs] = useState([]);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const fileInputRef = useRef(null);

    // Margins State
    const [margins, setMargins] = useState({
        headerHeight: 50,
        footerHeight: 30,
        leftMargin: 15,
        rightMargin: 15
    });

    useEffect(() => {
        fetchTemplates();
        fetchLogs();
    }, []);

    useEffect(() => {
        const found = templates.find(t => t.templateType === selectedType);
        if (found) {
            setActiveTemplate(found);
            setMargins({
                headerHeight: found.headerHeight || 50,
                footerHeight: found.footerHeight || 30,
                leftMargin: found.leftMargin || 15,
                rightMargin: found.rightMargin || 15
            });
        } else {
            setActiveTemplate(null);
            setMargins({
                headerHeight: 50,
                footerHeight: 30,
                leftMargin: 15,
                rightMargin: 15
            });
        }
    }, [selectedType, templates]);

    const fetchTemplates = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get('/api/document-templates', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) {
                setTemplates(res.data.templates);
            }
        } catch (err) {
            setError('Failed to fetch templates');
        }
    };

    const fetchLogs = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get('/api/document-templates/logs', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) {
                setLogs(res.data.logs);
            }
        } catch (err) {
            console.error('Failed to fetch template logs');
        }
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Size limit: 5MB
        if (file.size > 5 * 1024 * 1024) {
            setError('File size exceeds the 5MB limit');
            return;
        }

        // Allowed formats
        const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
        if (!allowed.includes(file.type)) {
            setError('Only PDF, PNG, and JPEG templates are allowed');
            return;
        }

        setError('');
        setSuccess('');
        setUploading(true);

        try {
            const token = localStorage.getItem('token');
            const formData = new FormData();
            formData.append('template', file);
            formData.append('templateType', selectedType);
            formData.append('headerHeight', margins.headerHeight);
            formData.append('footerHeight', margins.footerHeight);
            formData.append('leftMargin', margins.leftMargin);
            formData.append('rightMargin', margins.rightMargin);

            const res = await axios.post('/api/document-templates/upload', formData, {
                headers: { 
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                }
            });

            if (res.data.success) {
                setSuccess('Template uploaded and activated successfully!');
                await fetchTemplates();
                await fetchLogs();
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error uploading template file.');
        } finally {
            setUploading(false);
        }
    };

    const handleSaveSettings = async () => {
        if (!activeTemplate) return;
        setError('');
        setSuccess('');
        setSavingSettings(true);

        try {
            const token = localStorage.getItem('token');
            const res = await axios.put(`/api/document-templates/${activeTemplate._id}`, margins, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.data.success) {
                setSuccess('Layout configurations saved!');
                await fetchTemplates();
                await fetchLogs();
                setTimeout(() => setSuccess(''), 4000);
            }
        } catch (err) {
            setError('Error saving layout configurations.');
            setTimeout(() => setError(''), 4000);
        } finally {
            setSavingSettings(false);
        }
    };

    const handleToggleStatus = async (status) => {
        if (!activeTemplate) return;
        setError('');
        setSuccess('');

        try {
            const token = localStorage.getItem('token');
            const res = await axios.put(`/api/document-templates/${activeTemplate._id}`, { isActive: status }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.data.success) {
                setSuccess(status ? 'Template activated!' : 'Template disabled!');
                await fetchTemplates();
                await fetchLogs();
            }
        } catch (err) {
            setError('Error updating template status.');
        }
    };

    const handleRollback = async (version) => {
        if (!activeTemplate) return;
        if (!window.confirm(`Are you sure you want to rollback to version ${version}?`)) return;

        setError('');
        setSuccess('');

        try {
            const token = localStorage.getItem('token');
            const res = await axios.post(`/api/document-templates/${activeTemplate._id}/rollback`, { version }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.data.success) {
                setSuccess(`Rolled back successfully to version ${version}!`);
                await fetchTemplates();
                await fetchLogs();
            }
        } catch (err) {
            setError('Error during template rollback.');
        }
    };

    const handleDeleteTemplate = async () => {
        if (!activeTemplate) return;
        if (!window.confirm('Are you sure you want to permanently delete this template?')) return;

        setError('');
        setSuccess('');

        try {
            const token = localStorage.getItem('token');
            const res = await axios.delete(`/api/document-templates/${activeTemplate._id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.data.success) {
                setSuccess('Template deleted successfully!');
                await fetchTemplates();
                await fetchLogs();
            }
        } catch (err) {
            setError('Error deleting template.');
        }
    };

    // Calculate dynamic styles for the visual preview canvas
    const previewHeaderStyle = {
        height: `${(margins.headerHeight / 297) * 100}%`,
        borderBottom: '2px dashed #e74c3c'
    };

    const previewFooterStyle = {
        height: `${(margins.footerHeight / 297) * 100}%`,
        borderTop: '2px dashed #e74c3c'
    };

    const previewLeftMarginStyle = {
        width: `${(margins.leftMargin / 210) * 100}%`,
        borderRight: '1px dashed #3498db',
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0
    };

    const previewRightMarginStyle = {
        width: `${(margins.rightMargin / 210) * 100}%`,
        borderLeft: '1px dashed #3498db',
        height: '100%',
        position: 'absolute',
        top: 0,
        right: 0
    };

    return (
        <div className="clinic-dashboard">
            <div className="dashboard-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => navigate(-1)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '8px 16px', borderRadius: '8px',
                            background: '#f1f5f9', border: '1px solid #e2e8f0',
                            cursor: 'pointer', fontSize: '14px', color: '#475569',
                            fontWeight: 500
                        }}
                    >
                        ← Back to Dashboard
                    </button>
                    <div>
                        <h2 style={{ margin: 0 }}>Document Templates</h2>
                        <p style={{ margin: 0 }}>Upload clinic branded letterheads for bills and prescriptions.</p>
                    </div>
                </div>
            </div>

            {error && <div className="alert-box error"><FiX /> {error}</div>}
            {success && <div className="alert-box success"><FiCheck /> {success}</div>}

            <div className="dashboard-grid">
                {/* 1. Controller Sidebar Card */}
                <div className="dashboard-card shadow-sm" style={{ flex: 1, minWidth: '320px' }}>
                    <div className="card-header">
                        <h3><FiSliders /> Configuration</h3>
                    </div>
                    <div className="card-body">
                        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                            <label>Template Document Category</label>
                            <select 
                                value={selectedType} 
                                onChange={(e) => setSelectedType(e.target.value)}
                                className="form-control"
                            >
                                {TEMPLATE_TYPES.map(type => (
                                    <option key={type.value} value={type.value}>{type.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Uploader Card */}
                        <div 
                            className="file-uploader-box"
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                border: '2px dashed #bdc3c7',
                                borderRadius: '8px',
                                padding: '2rem',
                                textAlign: 'center',
                                cursor: 'pointer',
                                backgroundColor: '#f9f9f9',
                                marginBottom: '1.5rem'
                            }}
                        >
                            <FiUploadCloud size={40} color="#7f8c8d" style={{ marginBottom: '1rem' }} />
                            <p style={{ fontWeight: '600', margin: '0 0 5px 0' }}>Click to Upload Template</p>
                            <span style={{ fontSize: '0.8rem', color: '#7f8c8d' }}>Supported: PDF, PNG, JPEG (Max 5MB)</span>
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                onChange={handleFileChange} 
                                style={{ display: 'none' }}
                                accept=".pdf,image/png,image/jpeg,image/jpg"
                            />
                        </div>

                        {activeTemplate && (
                            <div className="template-info-box" style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#eef2f3', borderRadius: '6px' }}>
                                <h4 style={{ margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <FiFileText /> Active Layout Metadata
                                </h4>
                                <div style={{ fontSize: '0.85rem', lineHeight: '1.6' }}>
                                    <div><strong>File:</strong> {activeTemplate.fileName}</div>
                                    <div><strong>Version:</strong> v{activeTemplate.version}</div>
                                    <div><strong>Status:</strong> {activeTemplate.isActive ? <span className="badge badge-success">Active</span> : <span className="badge badge-warning">Disabled</span>}</div>
                                </div>
                                <div style={{ marginTop: '1rem', display: 'flex', gap: '10px' }}>
                                    <button 
                                        onClick={() => handleToggleStatus(!activeTemplate.isActive)}
                                        className={`btn btn-sm ${activeTemplate.isActive ? 'btn-warning' : 'btn-success'}`}
                                        style={{ flex: 1 }}
                                    >
                                        {activeTemplate.isActive ? 'Disable' : 'Enable'}
                                    </button>
                                    <button 
                                        onClick={handleDeleteTemplate}
                                        className="btn btn-sm btn-danger"
                                        style={{ padding: '0.5rem 1rem' }}
                                    >
                                        <FiTrash2 />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Margins configuration */}
                        <div className="layout-sliders-box">
                            <h4 style={{ margin: '0 0 1rem 0' }}>Print Boundary Margins (mm)</h4>
                            
                            <div className="slider-group" style={{ marginBottom: '1.2rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '0.9rem' }}>
                                    <label>Header Clearance (Top Margin)</label>
                                    <span>{margins.headerHeight} mm</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="120" 
                                    value={margins.headerHeight} 
                                    onChange={(e) => setMargins(prev => ({ ...prev, headerHeight: Number(e.target.value) }))}
                                    style={{ width: '100%' }}
                                />
                            </div>

                            <div className="slider-group" style={{ marginBottom: '1.2rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '0.9rem' }}>
                                    <label>Footer Clearance (Bottom Margin)</label>
                                    <span>{margins.footerHeight} mm</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="120" 
                                    value={margins.footerHeight} 
                                    onChange={(e) => setMargins(prev => ({ ...prev, footerHeight: Number(e.target.value) }))}
                                    style={{ width: '100%' }}
                                />
                            </div>

                            <div className="slider-group" style={{ marginBottom: '1.2rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '0.9rem' }}>
                                    <label>Left Margin</label>
                                    <span>{margins.leftMargin} mm</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="5" 
                                    max="40" 
                                    value={margins.leftMargin} 
                                    onChange={(e) => setMargins(prev => ({ ...prev, leftMargin: Number(e.target.value) }))}
                                    style={{ width: '100%' }}
                                />
                            </div>

                            <div className="slider-group" style={{ marginBottom: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '0.9rem' }}>
                                    <label>Right Margin</label>
                                    <span>{margins.rightMargin} mm</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="5" 
                                    max="40" 
                                    value={margins.rightMargin} 
                                    onChange={(e) => setMargins(prev => ({ ...prev, rightMargin: Number(e.target.value) }))}
                                    style={{ width: '100%' }}
                                />
                            </div>

                            <button 
                                onClick={handleSaveSettings}
                                disabled={!activeTemplate || savingSettings}
                                className="btn btn-primary"
                                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                            >
                                <FiSave /> {savingSettings ? 'Saving...' : 'Save Boundary Layout'}
                            </button>

                            {success && success.includes('saved') && (
                                <div style={{ 
                                    marginTop: '12px', 
                                    padding: '10px 14px', 
                                    background: '#dcfce7', 
                                    color: '#15803d', 
                                    borderRadius: '8px', 
                                    fontSize: '0.85rem', 
                                    fontWeight: '600',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    border: '1px solid #bbf7d0',
                                    animation: 'fadeIn 0.2s ease-out'
                                }}>
                                    <FiCheck /> {success}
                                </div>
                            )}

                            {error && error.includes('saving') && (
                                <div style={{ 
                                    marginTop: '12px', 
                                    padding: '10px 14px', 
                                    background: '#fee2e2', 
                                    color: '#b91c1c', 
                                    borderRadius: '8px', 
                                    fontSize: '0.85rem', 
                                    fontWeight: '600',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    border: '1px solid #fecaca',
                                    animation: 'fadeIn 0.2s ease-out'
                                }}>
                                    <FiX /> {error}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* 2. Visual Alignment Preview Container */}
                <div className="dashboard-card shadow-sm" style={{ flex: 1.5, minWidth: '360px', display: 'flex', flexDirection: 'column' }}>
                    <div className="card-header">
                        <h3><FiEye /> Layout Preview Guide (A4)</h3>
                    </div>
                    <div className="card-body" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#57606f', padding: '2rem' }}>
                        
                        {/* Mock A4 Page Container */}
                        <div 
                            className="mock-a4-page" 
                            style={{ 
                                width: '380px', 
                                height: '537px', // A4 aspect ratio 1:1.414
                                backgroundColor: '#ffffff',
                                boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                                position: 'relative',
                                overflow: 'hidden',
                                display: 'flex',
                                flexDirection: 'column',
                                backgroundImage: activeTemplate?.url && activeTemplate.isActive && !activeTemplate.url.endsWith('.pdf') ? `url(${activeTemplate.url})` : 'none',
                                backgroundSize: '100% 100%',
                                backgroundRepeat: 'no-repeat'
                            }}
                        >
                            {/* PDF Placeholder fallback banner */}
                            {activeTemplate?.url && activeTemplate.url.endsWith('.pdf') && (
                                <div style={{ position: 'absolute', top: '15px', right: '15px', padding: '4px 8px', backgroundColor: '#e74c3c', color: '#fff', fontSize: '0.7rem', borderRadius: '4px', zIndex: 10 }}>
                                    PDF Background Layout Active
                                </div>
                            )}

                            {/* Header Clearance overlay */}
                            <div className="preview-clearance-header" style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                backgroundColor: 'rgba(231, 76, 60, 0.1)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.8rem',
                                color: '#e74c3c',
                                pointerEvents: 'none',
                                ...previewHeaderStyle
                            }}>
                                Header Section / Letterhead Area
                            </div>

                            {/* Margin Clearance overlay (Left/Right) */}
                            <div style={previewLeftMarginStyle}></div>
                            <div style={previewRightMarginStyle}></div>

                            {/* Content boundary wrapper */}
                            <div 
                                className="preview-content-area"
                                style={{
                                    marginTop: `${(margins.headerHeight / 297) * 537}px`,
                                    marginBottom: `${(margins.footerHeight / 297) * 537}px`,
                                    marginLeft: `${(margins.leftMargin / 210) * 380}px`,
                                    marginRight: `${(margins.rightMargin / 210) * 380}px`,
                                    flex: 1,
                                    border: '2px dashed #2ecc71',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    zIndex: 5,
                                    backgroundColor: 'transparent',
                                    pointerEvents: 'none'
                                }}
                            >
                                <span style={{ color: '#2ecc71', fontSize: '0.75rem', fontWeight: 'bold', backgroundColor: 'rgba(255,255,255,0.85)', padding: '4px 8px', borderRadius: '4px', border: '1px solid #2ecc71' }}>
                                    Print Content Area
                                </span>
                            </div>

                            {/* Footer Clearance overlay */}
                            <div className="preview-clearance-footer" style={{
                                position: 'absolute',
                                bottom: 0,
                                left: 0,
                                width: '100%',
                                backgroundColor: 'rgba(231, 76, 60, 0.1)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.8rem',
                                color: '#e74c3c',
                                pointerEvents: 'none',
                                ...previewFooterStyle
                            }}>
                                Footer Clearance / Address Area
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            {/* 3. Version History & Audits Grid */}
            <div className="dashboard-grid" style={{ marginTop: '2rem' }}>
                {/* Version history card */}
                <div className="dashboard-card shadow-sm" style={{ flex: 1, minWidth: '320px' }}>
                    <div className="card-header">
                        <h3><FiRefreshCw /> Version History</h3>
                    </div>
                    <div className="card-body" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        {activeTemplate && activeTemplate.history && activeTemplate.history.length > 0 ? (
                            <table className="table" style={{ fontSize: '0.85rem' }}>
                                <thead>
                                    <tr>
                                        <th>Ver.</th>
                                        <th>File Name</th>
                                        <th>Uploaded On</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeTemplate.history.map((h, i) => (
                                        <tr key={i}>
                                            <td><strong>v{h.version}</strong></td>
                                            <td style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h.fileName}>{h.fileName}</td>
                                            <td>{new Date(h.updatedAt).toLocaleDateString()}</td>
                                            <td>
                                                <button 
                                                    onClick={() => handleRollback(h.version)}
                                                    className="btn btn-sm btn-outline-primary"
                                                    style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                                                >
                                                    Rollback
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <p style={{ textAlign: 'center', color: '#7f8c8d', padding: '1rem' }}>No previous versions in history.</p>
                        )}
                    </div>
                </div>

                {/* Audit Logs card */}
                <div className="dashboard-card shadow-sm" style={{ flex: 1.5, minWidth: '360px' }}>
                    <div className="card-header">
                        <h3><FiFileText /> Template Operations Audit Trail</h3>
                    </div>
                    <div className="card-body" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        {logs && logs.length > 0 ? (
                            <table className="table" style={{ fontSize: '0.8rem' }}>
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>User (Role)</th>
                                        <th>Action</th>
                                        <th>Event details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map((log, index) => (
                                        <tr key={index}>
                                            <td>{new Date(log.createdAt).toLocaleString()}</td>
                                            <td><strong>{log.userName}</strong> ({log.role})</td>
                                            <td>
                                                <span className={`badge badge-${log.severity === 'critical' ? 'danger' : log.severity === 'warning' ? 'warning' : 'info'}`}>
                                                    {log.action}
                                                </span>
                                            </td>
                                            <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.reason}>{log.reason}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <p style={{ textAlign: 'center', color: '#7f8c8d', padding: '1rem' }}>No template activities recorded in audit logs.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DocumentTemplates;
