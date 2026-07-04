import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminEntitiesAPI, labTestAPI } from '../../utils/api';
import '../administration/SuperAdmin.css';

const AdminLabs = () => {
  const navigate = useNavigate();
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingLab, setEditingLab] = useState(null);
  const [showForm, setShowForm] = useState(false);
  
  const [labTestsCatalog, setLabTestsCatalog] = useState([]);
  const [searchTestQuery, setSearchTestQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    password: '',
    services: [],
    availability: {
      monday: { available: false, startTime: '09:00', endTime: '17:00' },
      tuesday: { available: false, startTime: '09:00', endTime: '17:00' },
      wednesday: { available: false, startTime: '09:00', endTime: '17:00' },
      thursday: { available: false, startTime: '09:00', endTime: '17:00' },
      friday: { available: false, startTime: '09:00', endTime: '17:00' },
      saturday: { available: false, startTime: '09:00', endTime: '17:00' },
      sunday: { available: false, startTime: '09:00', endTime: '17:00' }
    },
    description: '',
    facilities: []
  });

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const role = (user.role || '').toLowerCase();
    if (role !== 'admin' && role !== 'hospitaladmin') {
      navigate('/');
      return;
    }
    fetchLabs();
    fetchCatalog();
  }, [navigate]);

  const fetchCatalog = async () => {
    try {
      const response = await labTestAPI.getLabTests();
      if (response.success) {
        setLabTestsCatalog(response.labTests || []);
      }
    } catch (err) {
      console.error('Error fetching lab tests catalog:', err);
    }
  };

  const fetchLabs = async () => {
    try {
      setLoadingData(true);
      const response = await adminEntitiesAPI.getLabs();
      if (response.success) {
        setLabs(response.labs);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error fetching labs');
    } finally {
      setLoadingData(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let val = value;
    if (name === 'phone') {
      val = val.replace(/\D/g, '').slice(0, 10);
    }
    setFormData({ ...formData, [name]: val });
    setError('');
    setSuccess('');
  };

  const handleServiceChange = (e) => {
    const services = e.target.value.split('\n').filter(s => s.trim());
    setFormData({ ...formData, services });
  };

  const handleFacilityChange = (e) => {
    const facilities = e.target.value.split('\n').filter(f => f.trim());
    setFormData({ ...formData, facilities });
  };

  const handleAvailabilityChange = (day, field, value) => {
    setFormData({
      ...formData,
      availability: {
        ...formData.availability,
        [day]: {
          ...formData.availability[day],
          [field]: field === 'available' ? value : value
        }
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (editingLab) {
        const response = await adminEntitiesAPI.updateLab(editingLab._id, formData);
        if (response.success) {
          setSuccess('Lab updated successfully');
          resetForm();
          fetchLabs();
        }
      } else {
        // Validate required fields
        if (!formData.name || !formData.email) {
          setError('Name and email are required');
          setLoading(false);
          return;
        }

        // Validate password for new labs
        if (!formData.password || formData.password.length < 6) {
          setError('Password is required and must be at least 6 characters');
          setLoading(false);
          return;
        }

        const response = await adminEntitiesAPI.createLab(formData);
        if (response.success) {
          let successMsg = 'Lab created successfully';
          if (response.generatedPassword) {
            successMsg += `. Generated password: ${response.generatedPassword}`;
          }
          setSuccess(successMsg);
          resetForm();
          fetchLabs();
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error saving lab');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (lab) => {
    setEditingLab(lab);
    setFormData({
      name: lab.name,
      email: lab.email,
      phone: lab.phone || '',
      address: lab.address || '',
      password: '', // Don't show password when editing
      services: lab.services || [],
      availability: lab.availability || formData.availability,
      description: lab.description || '',
      facilities: lab.facilities || []
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this lab?')) {
      try {
        const response = await adminEntitiesAPI.deleteLab(id);
        if (response.success) {
          setSuccess('Lab deleted successfully');
          fetchLabs();
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Error deleting lab');
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      address: '',
      password: '',
      services: [],
      availability: {
        monday: { available: false, startTime: '09:00', endTime: '17:00' },
        tuesday: { available: false, startTime: '09:00', endTime: '17:00' },
        wednesday: { available: false, startTime: '09:00', endTime: '17:00' },
        thursday: { available: false, startTime: '09:00', endTime: '17:00' },
        friday: { available: false, startTime: '09:00', endTime: '17:00' },
        saturday: { available: false, startTime: '09:00', endTime: '17:00' },
        sunday: { available: false, startTime: '09:00', endTime: '17:00' }
      },
      description: '',
      facilities: []
    });
    setEditingLab(null);
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
              <h1>Manage Labs</h1>
              <p>Add and manage laboratory information</p>
            </div>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
            {showForm ? 'Cancel' : '+ Add Lab'}
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {showForm && (
          <div className="form-card">
            <h2>{editingLab ? 'Edit Lab' : 'Add New Lab'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="name">Lab Name *</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="email">Email *</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="phone">Phone</label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="Enter 10-digit number"
                    maxLength={10}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="address">Address</label>
                  <input
                    type="text"
                    id="address"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="password">{editingLab ? 'New Password (leave blank to keep current)' : 'Password *'}</label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder={editingLab ? 'Enter new password or leave blank' : 'Enter password for login'}
                    required={!editingLab}
                    minLength={6}
                  />
                  <small className="form-hint">Minimum 6 characters. User will login with this email and password.</small>
                </div>
              </div>

              <div className="form-group" style={{ position: 'relative' }}>
                <label htmlFor="services" style={{ fontWeight: 600, display: 'block', marginBottom: '8px' }}>Assign Lab Services (from Lab Tests Catalog)</label>
                
                {/* Selected services tags */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px', padding: '10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', minHeight: '45px' }}>
                  {formData.services.length === 0 ? (
                    <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No services selected. Choose from the catalog below.</span>
                  ) : (
                    formData.services.map((service, index) => (
                      <span key={index} style={{ display: 'inline-flex', alignItems: 'center', background: '#e2f9f5', color: '#0d9488', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600, border: '1px solid #99f6e4' }}>
                        {service}
                        <button type="button" onClick={() => {
                          setFormData(prev => ({
                            ...prev,
                            services: prev.services.filter(s => s !== service)
                          }));
                        }} style={{ background: 'none', border: 'none', color: '#0d9488', marginLeft: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem', display: 'flex', alignItems: 'center', padding: 0 }}>
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>

                {/* Dropdown Input search */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="🔍 Search and add tests from Lab Tests Catalog..."
                    value={searchTestQuery}
                    onChange={(e) => {
                      setSearchTestQuery(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  />
                  {searchTestQuery && (
                    <button type="button" onClick={() => setSearchTestQuery('')} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>
                      Clear
                    </button>
                  )}
                </div>

                {/* Dropdown list of filtered catalog tests */}
                {showDropdown && (
                  <div style={{ position: 'absolute', zIndex: 100, top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: '200px', overflowY: 'auto', marginTop: '4px' }}>
                    {labTestsCatalog
                      .filter(t => 
                        t.name.toLowerCase().includes(searchTestQuery.toLowerCase()) && 
                        !formData.services.includes(t.name)
                      )
                      .map((test) => (
                        <div key={test._id} onClick={() => {
                          setFormData(prev => ({
                            ...prev,
                            services: [...prev.services, test.name]
                          }));
                          setSearchTestQuery('');
                          setShowDropdown(false);
                        }} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 500, color: '#334155' }}>{test.name}</span>
                          <span style={{ fontSize: '0.75rem', background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: '4px' }}>{test.category || 'General'}</span>
                        </div>
                      ))}
                    {labTestsCatalog.filter(t => t.name.toLowerCase().includes(searchTestQuery.toLowerCase()) && !formData.services.includes(t.name)).length === 0 && (
                      <div style={{ padding: '12px', color: '#64748b', textAlign: 'center', fontSize: '0.85rem' }}>
                        No matching tests found.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows="4"
                  placeholder="Lab description..."
                />
              </div>

              <div className="form-group">
                <label htmlFor="facilities">Facilities (one per line)</label>
                <textarea
                  id="facilities"
                  name="facilities"
                  value={formData.facilities.join('\n')}
                  onChange={handleFacilityChange}
                  rows="3"
                  placeholder="Modern Equipment&#10;Certified Technicians&#10;Fast Results"
                />
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ margin: 0 }}>Availability</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}>
                    <input
                      type="checkbox"
                      checked={days.every(day => formData.availability[day]?.available)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        const newAvail = { ...formData.availability };
                        days.forEach(day => {
                          newAvail[day] = {
                            ...newAvail[day],
                            available: checked
                          };
                        });
                        setFormData({ ...formData, availability: newAvail });
                      }}
                    />
                    Select All Days
                  </label>
                </div>
                <div className="availability-grid">
                  {days.map(day => (
                    <div key={day} className="availability-day">
                      <label>
                        <input
                          type="checkbox"
                          checked={formData.availability[day].available}
                          onChange={(e) => handleAvailabilityChange(day, 'available', e.target.checked)}
                        />
                        {day.charAt(0).toUpperCase() + day.slice(1)}
                      </label>
                      {formData.availability[day].available && (
                        <div className="time-inputs">
                          <input
                            type="time"
                            value={formData.availability[day].startTime}
                            onChange={(e) => handleAvailabilityChange(day, 'startTime', e.target.value)}
                          />
                          <span>to</span>
                          <input
                            type="time"
                            value={formData.availability[day].endTime}
                            onChange={(e) => handleAvailabilityChange(day, 'endTime', e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Saving...' : editingLab ? 'Update Lab' : 'Create Lab'}
                </button>
                <button type="button" onClick={resetForm} className="btn btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="users-table">
          <h2>All Labs</h2>
          {loadingData ? (
            <div className="loading-message">Loading labs...</div>
          ) : labs.length === 0 ? (
            <div className="empty-message">No labs found. Create one to get started.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Address</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {labs.map((lab) => (
                  <tr key={lab._id}>
                    <td>{lab.name}</td>
                    <td>{lab.email}</td>
                    <td>{lab.phone || '-'}</td>
                    <td>{lab.address || '-'}</td>
                    <td>
                      <button onClick={() => handleEdit(lab)} className="btn-edit">Edit</button>
                      <button onClick={() => handleDelete(lab._id)} className="btn-delete">Delete</button>
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

export default AdminLabs;


