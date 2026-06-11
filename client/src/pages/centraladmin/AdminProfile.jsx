import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useAppDispatch } from '../../store/hooks';
import { updateUser, logout } from '../../store/slices/authSlice';
import { authAPI } from '../../utils/api';
import { FiUser, FiMail, FiPhone, FiLock, FiLogOut, FiSave, FiUploadCloud } from 'react-icons/fi';
import './AdminProfile.css';

const AdminProfile = () => {
    const navigate = useNavigate();
    const dispatch = useAppDispatch();
    const { user } = useAuth();

    const [formData, setFormData] = useState({
        name: user?.name || '',
        email: user?.email || '',
        phone: user?.phone || '',
        avatar: user?.avatar || '',
    });

    const [passwordData, setPasswordData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });

    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [saving, setSaving] = useState(false);

    const handleInputChange = (e) => {
        let val = e.target.value;
        if (e.target.name === 'phone') {
            val = val.replace(/\D/g, '').slice(0, 10);
        }
        setFormData({ ...formData, [e.target.name]: val });
        setSuccessMsg('');
        setErrorMsg('');
    };

    const handlePasswordChange = (e) => {
        setPasswordData({ ...passwordData, [e.target.name]: e.target.value });
        setSuccessMsg('');
        setErrorMsg('');
    };

    const handleProfileSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setErrorMsg('');
        setSuccessMsg('');

        try {
            // Call the backend to persist the change to the database
            const res = await authAPI.updateProfile(formData);
            if (res.success) {
                // Merge updated fields into Redux store + localStorage so all panels reflect changes
                dispatch(updateUser(res.user));
                setSuccessMsg('Profile updated successfully. Changes are now visible across all panels.');
            } else {
                setErrorMsg(res.message || 'Failed to update profile.');
            }
        } catch (err) {
            setErrorMsg(err.response?.data?.message || 'Failed to update profile. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handlePasswordSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        setSuccessMsg('');

        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setErrorMsg('New passwords do not match.');
            return;
        }

        if (passwordData.newPassword.length < 6) {
            setErrorMsg('Password must be at least 6 characters long.');
            return;
        }

        setSaving(true);
        try {
            const res = await authAPI.changePassword(passwordData.currentPassword, passwordData.newPassword);
            if (res.success) {
                setSuccessMsg('Password changed successfully.');
                setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
            } else {
                setErrorMsg(res.message || 'Failed to change password.');
            }
        } catch (err) {
            setErrorMsg(err.response?.data?.message || 'Failed to change password. Please check your current password.');
        } finally {
            setSaving(false);
        }
    };

    const handleLogout = () => {
        dispatch(logout());
        navigate('/login');
    };

    const getInitials = (name) => {
        return (name || 'A').split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    };

    const handleAvatarUploadMock = () => {
        // Mock avatar upload with a medical-style avatar
        const mockAvatars = [
            'https://images.unsplash.com/photo-1537368910025-700350fe46c7?q=80&w=150&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1622253692010-333f2da6031d?q=80&w=150&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?q=80&w=150&auto=format&fit=crop'
        ];
        const randomAvatar = mockAvatars[Math.floor(Math.random() * mockAvatars.length)];
        setFormData(prev => ({ ...prev, avatar: randomAvatar }));
        setSuccessMsg('Avatar selected. Click Save Changes to apply.');
    };

    return (
        <div className="admin-profile-page">
            <div className="admin-profile-header">
                <div>
                    <span className="profile-badge-tag">{(user?.role || 'SYSTEM').toUpperCase()} PROFILE</span>
                    <h1>👤 Account Profile Settings</h1>
                    <p>Manage your account credentials, avatar, and active control session</p>
                </div>
            </div>

            {successMsg && <div className="profile-success-alert">✅ {successMsg}</div>}
            {errorMsg && <div className="profile-error-alert">⚠️ {errorMsg}</div>}

            <div className="profile-grid">
                {/* Column 1: Info Card */}
                <div className="profile-col-left">
                    <div className="profile-summary-card">
                        <div className="avatar-upload-container">
                            <div className="profile-summary-avatar">
                                {formData.avatar ? (
                                    <img src={formData.avatar} alt={formData.name} />
                                ) : (
                                    <span className="avatar-initials">{getInitials(formData.name)}</span>
                                )}
                            </div>
                            <button type="button" className="avatar-upload-btn" onClick={handleAvatarUploadMock}>
                                <FiUploadCloud /> Change Photo
                            </button>
                        </div>

                        <div className="profile-user-meta">
                            <h2>{formData.name || 'User Profile'}</h2>
                            <p>{formData.email}</p>
                            <span className="system-role-pill">
                                {user?.role ? user.role.toUpperCase() : 'USER'}
                            </span>
                        </div>

                        <div className="profile-session-actions">
                            <button type="button" className="btn-profile-logout" onClick={handleLogout}>
                                <FiLogOut /> Terminate Session
                            </button>
                        </div>
                    </div>

                    <div className="system-status-card">
                        <h3>🔒 Security & Access Level</h3>
                        <div className="status-item">
                            <span className="status-label">Control Scope</span>
                            <span className="status-val text-cyan">
                                {['centraladmin', 'superadmin'].includes(user?.role?.toLowerCase()) 
                                    ? 'GLOBAL OVERLORD' 
                                    : (user?.role || 'Staff').toUpperCase()}
                            </span>
                        </div>
                        <div className="status-item">
                            <span className="status-label">MFA Authentication</span>
                            <span className="status-val text-green">ACTIVE</span>
                        </div>
                        <div className="status-item">
                            <span className="status-label">Session Lifetime</span>
                            <span className="status-val">
                                {['patient', 'billing'].includes(user?.role?.toLowerCase()) 
                                    ? '8 HOURS' 
                                    : '45 MINUTES'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Column 2: Editor Forms */}
                <div className="profile-col-right">
                    {/* Form 1: General Info */}
                    <div className="profile-card">
                        <h3>📋 Personal Details</h3>
                        <form onSubmit={handleProfileSubmit} className="profile-form">
                            <div className="profile-form-row">
                                <div className="profile-form-group">
                                    <label>Display Name</label>
                                    <div className="profile-input-wrap">
                                        <FiUser className="input-icon-left" />
                                        <input
                                            type="text"
                                            name="name"
                                            value={formData.name}
                                            onChange={handleInputChange}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="profile-form-group">
                                    <label>Email Address</label>
                                    <div className="profile-input-wrap">
                                        <FiMail className="input-icon-left" />
                                        <input
                                            type="email"
                                            name="email"
                                            value={formData.email}
                                            onChange={handleInputChange}
                                            required
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="profile-form-row">
                                <div className="profile-form-group">
                                    <label>Phone Number</label>
                                    <div className="profile-input-wrap">
                                        <FiPhone className="input-icon-left" />
                                        <input
                                            type="tel"
                                            name="phone"
                                            value={formData.phone}
                                            onChange={handleInputChange}
                                            maxLength={10}
                                            placeholder="10-digit phone number"
                                        />
                                    </div>
                                </div>

                                <div className="profile-form-group">
                                    <label>Access Domain</label>
                                    <div className="profile-input-wrap">
                                        <input
                                            type="text"
                                            value={window.location.host}
                                            disabled
                                            className="profile-disabled-input"
                                        />
                                    </div>
                                </div>
                            </div>

                            <button type="submit" className="btn-profile-submit" disabled={saving}>
                                <FiSave /> {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </form>
                    </div>

                    {/* Form 2: Change Password */}
                    <div className="profile-card">
                        <h3>🔑 Update Secret Credentials</h3>
                        <form onSubmit={handlePasswordSubmit} className="profile-form">
                            <div className="profile-form-group">
                                <label>Current Password</label>
                                <div className="profile-input-wrap">
                                    <FiLock className="input-icon-left" />
                                    <input
                                        type="password"
                                        name="currentPassword"
                                        value={passwordData.currentPassword}
                                        onChange={handlePasswordChange}
                                        placeholder="••••••••"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="profile-form-row">
                                <div className="profile-form-group">
                                    <label>New Secret Password</label>
                                    <div className="profile-input-wrap">
                                        <FiLock className="input-icon-left" />
                                        <input
                                            type="password"
                                            name="newPassword"
                                            value={passwordData.newPassword}
                                            onChange={handlePasswordChange}
                                            placeholder="••••••••"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="profile-form-group">
                                    <label>Confirm New Password</label>
                                    <div className="profile-input-wrap">
                                        <FiLock className="input-icon-left" />
                                        <input
                                            type="password"
                                            name="confirmPassword"
                                            value={passwordData.confirmPassword}
                                            onChange={handlePasswordChange}
                                            placeholder="••••••••"
                                            required
                                        />
                                    </div>
                                </div>
                            </div>

                            <button type="submit" className="btn-profile-submit" disabled={saving}>
                                <FiLock /> {saving ? 'Updating...' : 'Update Password'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminProfile;
