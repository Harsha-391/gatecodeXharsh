import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminEntitiesAPI } from '../../utils/api';
import '../administration/SuperAdmin.css';

const BILLING_TYPES = ['Fixed', 'Per Visit', 'Per Day', 'Per Procedure', 'Per Test', 'Package'];
const SERVICE_TYPES = ['Consultation', 'Procedure', 'Diagnostic', 'Pharmacy', 'Room', 'OT', 'ICU', 'Ambulance', 'Other'];
const DEPARTMENTS = [
  'General Medicine', 'Surgery', 'Gynaecology', 'Paediatrics', 'Orthopaedics',
  'Cardiology', 'Neurology', 'Dermatology', 'Ophthalmology', 'ENT',
  'Radiology', 'Pathology', 'Physiotherapy', 'Dentistry', 'Psychiatry',
  'Oncology', 'Urology', 'Nephrology', 'Gastroenterology', 'Pulmonology', 'Other'
];
const GST_RATES = ['0', '5', '12', '18', '28'];

const AdminServices = () => {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingService, setEditingService] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const defaultForm = {
    id: '',
    title: '',
    description: '',
    price: 0,
    duration: '',
    category: '',
    active: true,
    // New fields
    includedCharges: '',
    department: '',
    billingType: 'Fixed',
    gst: '0',
    serviceType: 'Consultation',
    visibility: 'Both',
  };

  const [formData, setFormData] = useState(defaultForm);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const role = (user.role || '').toLowerCase();
    if (role !== 'admin' && role !== 'hospitaladmin') {
      navigate('/');
      return;
    }
    fetchServices();
  }, [navigate]);

  const fetchServices = async () => {
    try {
      setLoadingData(true);
      const response = await adminEntitiesAPI.getServices();
      if (response.success) {
        setServices(response.services);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error fetching services');
    } finally {
      setLoadingData(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (editingService) {
        const response = await adminEntitiesAPI.updateService(editingService._id, formData);
        if (response.success) {
          setSuccess('Service updated successfully');
          resetForm();
          fetchServices();
        }
      } else {
        const response = await adminEntitiesAPI.createService(formData);
        if (response.success) {
          setSuccess('Service created successfully');
          resetForm();
          fetchServices();
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error saving service');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (service) => {
    setEditingService(service);
    setFormData({
      id: service.id,
      title: service.title,
      description: service.description,
      price: service.price || 0,
      duration: service.duration || '',
      category: service.category || '',
      active: service.active !== undefined ? service.active : true,
      includedCharges: service.includedCharges || '',
      department: service.department || '',
      billingType: service.billingType || 'Fixed',
      gst: service.gst !== undefined ? String(service.gst) : '0',
      serviceType: service.serviceType || 'Consultation',
      visibility: service.visibility || 'Both',
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this service?')) {
      setError('');
      setSuccess('');
      try {
        const response = await adminEntitiesAPI.deleteService(id);
        if (response.success) {
          setSuccess('Service deleted successfully');
          fetchServices();
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Error deleting service');
      }
    }
  };

  const resetForm = () => {
    setFormData(defaultForm);
    setEditingService(null);
    setShowForm(false);
  };

  return (
    <div className="superadmin-page">
      <div className="superadmin-container">
        <div className="admin-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => navigate('/admin')}
              style={{
                background: 'none',
                border: '1.5px solid #e0e0e0',
                borderRadius: '8px',
                padding: '6px 14px',
                cursor: 'pointer',
                fontSize: '14px',
                color: '#555',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 500,
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f0f0f0'; e.currentTarget.style.borderColor = '#aaa'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = '#e0e0e0'; }}
            >
              ← Back
            </button>
            <div>
              <h1>Manage Services</h1>
              <p>Add and manage services / charges available in the hospital</p>
            </div>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
            {showForm ? 'Cancel' : '+ Add Service'}
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {showForm && (
          <div className="form-card">
            <h2>{editingService ? 'Edit Service' : 'Add New Service'}</h2>
            <form onSubmit={handleSubmit}>

              {/* Row 1: ID + Title */}
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="id">Service ID *</label>
                  <input
                    type="text"
                    id="id"
                    name="id"
                    value={formData.id}
                    onChange={handleChange}
                    required
                    disabled={!!editingService}
                    placeholder="e.g., consultation_general"
                  />
                  <small className="form-hint">Unique identifier (lowercase, no spaces)</small>
                </div>
                <div className="form-group">
                  <label htmlFor="title">Title *</label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    required
                    placeholder="e.g., General Consultation"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="form-group">
                <label htmlFor="description">Description *</label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  required
                  rows="3"
                  placeholder="Brief description of the service..."
                />
              </div>

              {/* Included Services / Included Charges */}
              <div className="form-group">
                <label htmlFor="includedCharges">Included Services / Included Charges</label>
                <textarea
                  id="includedCharges"
                  name="includedCharges"
                  value={formData.includedCharges}
                  onChange={handleChange}
                  rows="3"
                  placeholder="e.g., Doctor Fee, Bed Charges, Nursing, OT Charges..."
                />
                <small className="form-hint">List what is included in this service/package</small>
              </div>

              {/* Row: Department + Service Type */}
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="department">Department</label>
                  <select
                    id="department"
                    name="department"
                    value={formData.department}
                    onChange={handleChange}
                  >
                    <option value="">-- Select Department --</option>
                    {DEPARTMENTS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="serviceType">Service Type</label>
                  <select
                    id="serviceType"
                    name="serviceType"
                    value={formData.serviceType}
                    onChange={handleChange}
                  >
                    {SERVICE_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row: Billing Type + GST */}
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="billingType">Billing Type</label>
                  <select
                    id="billingType"
                    name="billingType"
                    value={formData.billingType}
                    onChange={handleChange}
                  >
                    {BILLING_TYPES.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="gst">GST (%)</label>
                  <select
                    id="gst"
                    name="gst"
                    value={formData.gst}
                    onChange={handleChange}
                  >
                    {GST_RATES.map(r => (
                      <option key={r} value={r}>{r}%</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row: Visibility + Price */}
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="visibility">Visibility (OPD / IPD)</label>
                  <select
                    id="visibility"
                    name="visibility"
                    value={formData.visibility}
                    onChange={handleChange}
                  >
                    <option value="OPD">OPD Only</option>
                    <option value="IPD">IPD Only</option>
                    <option value="Both">Both (OPD &amp; IPD)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="price">Price (₹)</label>
                  <input
                    type="number"
                    id="price"
                    name="price"
                    value={formData.price}
                    onChange={handleChange}
                    min="0"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Row: Duration + Category */}
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="duration">Duration</label>
                  <input
                    type="text"
                    id="duration"
                    name="duration"
                    value={formData.duration}
                    onChange={handleChange}
                    placeholder="e.g., 30 minutes"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="category">Category</label>
                  <input
                    type="text"
                    id="category"
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    placeholder="e.g., Fertility Treatment"
                  />
                </div>
              </div>

              {/* Active toggle */}
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    name="active"
                    checked={formData.active}
                    onChange={handleChange}
                  />
                  {' '}Active (visible to users)
                </label>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Saving...' : editingService ? 'Update Service' : 'Create Service'}
                </button>
                <button type="button" onClick={resetForm} className="btn btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="users-table">
          <h2>All Services</h2>
          {loadingData ? (
            <div className="loading-message">Loading services...</div>
          ) : services.length === 0 ? (
            <div className="empty-message">No services found. Create one to get started.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Department</th>
                  <th>Service Type</th>
                  <th>Billing Type</th>
                  <th>GST</th>
                  <th>Visibility</th>
                  <th>Price (₹)</th>
                  <th>Active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {services.map((service) => (
                  <tr key={service._id}>
                    <td>{service.id}</td>
                    <td>{service.title}</td>
                    <td>{service.department || '—'}</td>
                    <td>{service.serviceType || '—'}</td>
                    <td>{service.billingType || '—'}</td>
                    <td>{service.gst !== undefined ? `${service.gst}%` : '—'}</td>
                    <td>{service.visibility || '—'}</td>
                    <td>₹{service.price || 0}</td>
                    <td>{service.active ? 'Yes' : 'No'}</td>
                    <td>
                      <button onClick={() => handleEdit(service)} className="btn-edit">Edit</button>
                      <button onClick={() => handleDelete(service._id)} className="btn-delete">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminServices;
