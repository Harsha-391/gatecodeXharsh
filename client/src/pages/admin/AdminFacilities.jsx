import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { hospitalAPI, administratorAPI } from '../../utils/api';
import '../administration/SuperAdmin.css';

const RESOURCE_TYPES = ['Room', 'Bed', 'Equipment', 'Vehicle', 'Other'];

const AdminFacilities = () => {
  const navigate = useNavigate();
  const [hospitalInfo, setHospitalInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingIdx, setEditingIdx] = useState(-1);
  const [editForm, setEditForm] = useState({ pricePerDay: 0, bedCount: 0 });

  // Resources state
  const [resources, setResources] = useState([]);
  const [resLoading, setResLoading] = useState(false);
  const [resSubmitting, setResSubmitting] = useState(false);
  const [resError, setResError] = useState('');
  const [resSuccess, setResSuccess] = useState('');
  const [resForm, setResForm] = useState({ name: '', type: 'Equipment', total: '', description: '' });
  const [showResForm, setShowResForm] = useState(false);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const role = (user.role || '').toLowerCase();
    if (role !== 'admin' && role !== 'hospitaladmin') {
      navigate('/');
      return;
    }
    fetchMyHospital();
    fetchResources();
  }, [navigate]);

  const fetchMyHospital = async () => {
    try {
      setLoading(true);
      const res = await hospitalAPI.getMyHospital();
      if (res.success && res.hospital) {
        setHospitalInfo(res.hospital);
      }
    } catch (err) {
      console.error('Error fetching hospital info:', err);
      setError('Error loading hospital information');
    } finally {
      setLoading(false);
    }
  };

  const fetchResources = async () => {
    try {
      setResLoading(true);
      const res = await administratorAPI.getResources();
      if (res.success) {
        setResources(res.resources || []);
      }
    } catch (err) {
      console.error('Error fetching resources:', err);
    } finally {
      setResLoading(false);
    }
  };

  const handleAddFacility = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    const name = e.target.name.value.trim();
    const price = Number(e.target.price.value);
    const bedCount = Number(e.target.bedCount.value) || 0;

    if (!name || isNaN(price)) {
      setError('Facility name and price per day are required');
      setSubmitting(false);
      return;
    }

    try {
      const newFacility = { name, pricePerDay: price, bedCount };
      const newFacilities = [...(hospitalInfo?.facilities || []), newFacility];
      const res = await hospitalAPI.updateFacilities({ facilities: newFacilities });
      if (res.success) {
        setHospitalInfo(res.hospital);
        setSuccess('Facility added successfully!');
        e.target.reset();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error adding facility');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async (idx) => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const newFacilities = [...hospitalInfo.facilities];
      newFacilities[idx] = {
        ...newFacilities[idx],
        pricePerDay: Number(editForm.pricePerDay),
        bedCount: Number(editForm.bedCount)
      };
      const res = await hospitalAPI.updateFacilities({ facilities: newFacilities });
      if (res.success) {
        setHospitalInfo(res.hospital);
        setSuccess('Facility updated successfully!');
        setEditingIdx(-1);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error updating facility');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteFacility = async (idx) => {
    if (submitting) return;
    if (!window.confirm('Are you sure you want to delete this facility/ward?')) return;
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const newFacilities = hospitalInfo.facilities.filter((_, i) => i !== idx);
      const res = await hospitalAPI.updateFacilities({ facilities: newFacilities });
      if (res.success) {
        setHospitalInfo(res.hospital);
        setSuccess('Facility deleted successfully!');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error deleting facility');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResFormChange = (e) => {
    const { name, value } = e.target;
    setResForm(prev => ({ ...prev, [name]: value }));
  };

  const handleAddResource = async (e) => {
    e.preventDefault();
    if (resSubmitting) return;
    setResError('');
    setResSuccess('');

    if (!resForm.name.trim() || !resForm.total) {
      setResError('Resource name and total count are required.');
      return;
    }
    if (Number(resForm.total) <= 0) {
      setResError('Total count must be greater than zero.');
      return;
    }

    setResSubmitting(true);
    try {
      const res = await administratorAPI.createResource({
        name: resForm.name.trim(),
        type: resForm.type,
        total: Number(resForm.total),
        description: resForm.description.trim()
      });
      if (res.success) {
        setResSuccess('Resource added successfully!');
        setResForm({ name: '', type: 'Equipment', total: '', description: '' });
        setShowResForm(false);
        await fetchResources();
      }
    } catch (err) {
      setResError(err.response?.data?.message || 'Error adding resource.');
    } finally {
      setResSubmitting(false);
    }
  };

  const handleDeleteResource = async (id) => {
    if (!window.confirm('Are you sure you want to delete this resource?')) return;
    try {
      await administratorAPI.deleteResource(id);
      await fetchResources();
    } catch (err) {
      setResError('Failed to delete resource.');
    }
  };

  const formatCurrency = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;

  return (
    <div className="superadmin-page">
      <div className="superadmin-container">
        <div className="admin-header">
          <div>
            <h1>Manage Facilities, Wards &amp; Resources</h1>
            <p>Add and manage hospital rooms, wards (ICU, OT, General Ward), daily pricing, and physical resources</p>
          </div>
          <button onClick={() => navigate('/admin')} className="btn btn-secondary">
            ← Back to Dashboard
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {/* ─── Facilities Section ─── */}
        <div className="form-card" style={{ marginBottom: '30px' }}>
          <h2>Add New Facility / Ward</h2>
          <form onSubmit={handleAddFacility}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="name">Facility/Ward Name *</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  placeholder="e.g., ICU, OT, General Ward, Deluxe Room"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="price">Price Per Day (₹) *</label>
                <input
                  type="number"
                  id="price"
                  name="price"
                  placeholder="e.g., 5000"
                  min="0"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="bedCount">Number of Beds (Optional)</label>
                <input
                  type="number"
                  id="bedCount"
                  name="bedCount"
                  placeholder="e.g., 10"
                  min="0"
                />
              </div>
            </div>
            <div className="form-actions" style={{ marginTop: '10px' }}>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Adding...' : '+ Add Facility'}
              </button>
            </div>
          </form>
        </div>

        <div className="users-table">
          <h2>Active Facilities &amp; Wards</h2>
          {loading ? (
            <div className="loading-message">Loading facilities...</div>
          ) : !hospitalInfo?.facilities || hospitalInfo.facilities.length === 0 ? (
            <div className="empty-message">No facilities configured. Add one above to get started.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Facility/Ward Name</th>
                  <th>Price Per Day</th>
                  <th>Total Beds</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {hospitalInfo.facilities.map((fac, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 600 }}>{fac.name}</td>
                    {editingIdx === idx ? (
                      <>
                        <td>
                          <input type="number" value={editForm.pricePerDay} onChange={e => setEditForm(p => ({ ...p, pricePerDay: e.target.value }))} style={{ width: '80px', padding: '4px' }} min="0" /> / day
                        </td>
                        <td>
                          <input type="number" value={editForm.bedCount} onChange={e => setEditForm(p => ({ ...p, bedCount: e.target.value }))} style={{ width: '60px', padding: '4px' }} min="0" /> Beds
                        </td>
                        <td>
                          <button onClick={() => handleSaveEdit(idx)} className="btn-primary" disabled={submitting} style={{ marginRight: '5px', padding: '5px 10px', fontSize: '12px' }}>Save</button>
                          <button onClick={() => setEditingIdx(-1)} className="btn-secondary" disabled={submitting} style={{ padding: '5px 10px', fontSize: '12px' }}>Cancel</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{formatCurrency(fac.pricePerDay)} / day</td>
                        <td>{fac.bedCount || 0} Beds</td>
                        <td>
                          <button
                            onClick={() => { setEditingIdx(idx); setEditForm({ pricePerDay: fac.pricePerDay, bedCount: fac.bedCount || 0 }); }}
                            className="btn-secondary"
                            disabled={submitting}
                            style={{ marginRight: '5px' }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteFacility(idx)}
                            className="btn-delete"
                            disabled={submitting}
                          >
                            Delete
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ─── Resources Section ─── */}
        <div style={{ marginTop: '40px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 style={{ margin: 0 }}>Hospital Resources</h2>
              <p style={{ color: '#6b7280', margin: '4px 0 0 0', fontSize: '0.9rem' }}>
                Manage physical resources (beds, equipment, vehicles, etc.) used in the Resource Management dashboard
              </p>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => { setShowResForm(s => !s); setResError(''); setResSuccess(''); }}
            >
              {showResForm ? 'Cancel' : '+ Add Resource'}
            </button>
          </div>

          {resError && <div className="error-message">{resError}</div>}
          {resSuccess && <div className="success-message">{resSuccess}</div>}

          {showResForm && (
            <div className="form-card" style={{ marginBottom: '20px' }}>
              <h2>Add New Resource</h2>
              <form onSubmit={handleAddResource}>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="res-name">Resource Name *</label>
                    <input
                      type="text"
                      id="res-name"
                      name="name"
                      value={resForm.name}
                      onChange={handleResFormChange}
                      placeholder="e.g., ICU Ventilator, Hospital Bed"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="res-type">Resource Type *</label>
                    <select id="res-type" name="type" value={resForm.type} onChange={handleResFormChange}>
                      {RESOURCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="res-total">Total Count *</label>
                    <input
                      type="number"
                      id="res-total"
                      name="total"
                      value={resForm.total}
                      onChange={handleResFormChange}
                      placeholder="e.g., 10"
                      min="1"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="res-description">Description (Optional)</label>
                    <input
                      type="text"
                      id="res-description"
                      name="description"
                      value={resForm.description}
                      onChange={handleResFormChange}
                      placeholder="e.g., Used in ICU ward"
                    />
                  </div>
                </div>
                <div className="form-actions" style={{ marginTop: '10px' }}>
                  <button type="submit" className="btn btn-primary" disabled={resSubmitting}>
                    {resSubmitting ? 'Saving...' : '+ Add Resource'}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="users-table">
            {resLoading ? (
              <div className="loading-message">Loading resources...</div>
            ) : resources.length === 0 ? (
              <div className="empty-message">No resources added yet. Click "Add Resource" above to get started.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Resource Name</th>
                    <th>Type</th>
                    <th>Total Count</th>
                    <th>Description</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {resources.map((res) => (
                    <tr key={res._id}>
                      <td style={{ fontWeight: 600 }}>{res.name}</td>
                      <td>
                        <span style={{
                          background: res.type === 'Bed' ? '#ecfdf5' : res.type === 'Room' ? '#eff6ff' : '#f5f3ff',
                          color: res.type === 'Bed' ? '#047857' : res.type === 'Room' ? '#1d4ed8' : '#6d28d9',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          fontWeight: 700
                        }}>
                          {res.type}
                        </span>
                      </td>
                      <td>{res.total}</td>
                      <td style={{ color: '#6b7280', fontSize: '0.88rem' }}>{res.description || '—'}</td>
                      <td>
                        <button
                          onClick={() => handleDeleteResource(res._id)}
                          className="btn-delete"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default AdminFacilities;
