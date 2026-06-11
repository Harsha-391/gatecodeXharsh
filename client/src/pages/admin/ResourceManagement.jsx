import React, { useState, useEffect } from 'react';
import { administratorAPI } from '../../utils/api';
import {
    FiLayers, FiTool, FiCheckCircle, FiAlertCircle,
    FiDatabase, FiCalendar, FiActivity, FiRefreshCw
} from 'react-icons/fi';
import './ResourceManagement.css';

const ResourceManagement = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [resources, setResources] = useState([]);
    const [alerts, setAlerts] = useState([]);

    const fetchData = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await administratorAPI.getResources();
            if (res.success) {
                setResources(res.resources || []);
                setAlerts(res.maintenanceAlerts || []);
            }
        } catch (err) {
            console.error('Error fetching resource details:', err);
            setError('Failed to fetch hospital resource directories.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="resources-loading">
                <FiRefreshCw className="spinner-icon spinning" />
                <p>Inspecting hospital rooms, beds, and ventilator status...</p>
            </div>
        );
    }

    return (
        <div className="resources-page">
            <div className="res-header">
                <div>
                    <h1>Resource & Asset Management</h1>
                    <p>Oversight of active rooms, ventilator systems, diagnostic devices, and calibration schedules.</p>
                </div>
                <button onClick={fetchData} className="btn-refresh-res">
                    <FiRefreshCw /> <span>Sync Assets</span>
                </button>
            </div>

            {error && (
                <div className="res-banner error">
                    <FiAlertCircle /> <span>{error}</span>
                </div>
            )}

            {/* Asset Utilization Grid */}
            <h2>Active Resource Utilization</h2>
            <div className="res-grid">
                {resources.map((resItem, idx) => {
                    const isHigh = resItem.utilization >= 80;
                    return (
                        <div key={idx} className="res-card-item">
                            <div className="res-card-header">
                                <div className="icon-box"><FiLayers /></div>
                                <span className={`type-tag ${String(resItem.type).toLowerCase()}`}>{resItem.type}</span>
                            </div>
                            <div className="res-card-body">
                                <h3>{resItem.name}</h3>
                                <div className="util-score">
                                    <strong>{resItem.occupied}</strong> <span>/ {resItem.total} Units Active</span>
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

            {/* Calibrations / Maintenance alerts */}
            <div className="calibration-section animate-fade">
                <div className="section-title-row">
                    <h2>🔧 Device Maintenance & Calibration Schedule</h2>
                </div>
                {alerts.length === 0 ? (
                    <div className="calib-empty-msg">No hardware maintenance or calibrations scheduled.</div>
                ) : (
                    <div className="calib-table-wrap">
                        <table className="calib-table">
                            <thead>
                                <tr>
                                    <th>Resource Equipment</th>
                                    <th>Maintenance Action</th>
                                    <th>Target Date</th>
                                    <th>Oversight Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {alerts.map((al, idx) => {
                                    const isPending = al.status === 'Pending';
                                    return (
                                        <tr key={idx}>
                                            <td><strong>{al.resource}</strong></td>
                                            <td>{al.type}</td>
                                            <td>
                                                <div className="date-col">
                                                    <FiCalendar /> {new Date(al.date).toLocaleDateString()}
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`status-badge-val ${isPending ? 'pending' : 'completed'}`}>
                                                    {isPending ? 'Pending' : 'Completed'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ResourceManagement;
