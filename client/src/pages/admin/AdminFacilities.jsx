import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { hospitalAPI } from '../../utils/api';
import '../administration/SuperAdmin.css';

const AdminFacilities = () => {
  const navigate = useNavigate();
  const [hospitalInfo, setHospitalInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingIdx, setEditingIdx] = useState(-1);
  const [editForm, setEditForm] = useState({ pricePerDay: 0, bedCount: 0 });

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const role = (user.role || '').toLowerCase();
    if (role !== 'admin' && role !== 'hospitaladmin') {
      navigate('/');
      return;
    }
    fetchMyHospital();
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

  const formatCurrency = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;

  return (
    <div className="superadmin-page">
      <div className="superadmin-container">
        <div className="admin-header">
          <div>
            <h1>Manage Facilities & Wards</h1>
            <p>Add and manage hospital rooms, wards (ICU, OT, General Ward), and their daily pricing</p>
          </div>
          <button onClick={() => navigate('/admin')} className="btn btn-secondary">
            ← Back to Dashboard
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

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
          <h2>Active Facilities & Wards</h2>
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
      </div>
    </div>
  );
};

export default AdminFacilities;
