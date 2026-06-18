import React, { useState, useEffect } from 'react';
import { administratorAPI } from '../../utils/api';
import { FiUsers, FiRefreshCw } from 'react-icons/fi';
import './PatientFlow.css';

const PatientFlow = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [patientFlow, setPatientFlow] = useState(null);

    const fetchPatientFlow = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await administratorAPI.getPatientFlow();
            if (res.success) {
                setPatientFlow(res.counts);
            } else {
                setError(res.message || 'Failed to fetch patient flow.');
            }
        } catch (err) {
            console.error('Failed to load patient flow counts:', err);
            setError(err.response?.data?.message || 'Error loading patient flow.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPatientFlow();
    }, []);

    if (loading) {
        return (
            <div className="loading-screen">
                <FiRefreshCw className="spinner-icon spinning" />
                <p>Analyzing patient flow paths...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="patient-flow-container">
                <div className="alert-box error">⚠️ {error}</div>
            </div>
        );
    }

    return (
        <div className="patient-flow-container">
            <div className="patient-flow-view admin-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                        <h2 style={{ margin: 0 }}>Funnel Stage Path Analysis</h2>
                        <p style={{ color: '#888', margin: '4px 0 0' }}>
                            Real-time analysis of the active patient queues at each stage of the hospital care flow.
                        </p>
                    </div>
                    <button 
                        onClick={fetchPatientFlow}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 12px',
                            background: '#f1f5f9',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '13px'
                        }}
                    >
                        <FiRefreshCw /> Refresh
                    </button>
                </div>

                <div className="funnel-stepper">
                    {[
                        { key: 'registration', label: '1. Registration', val: patientFlow?.registration, color: '#0ea5e9' },
                        { key: 'waiting', label: '2. Waiting OPD Queue', val: patientFlow?.waiting, color: '#f59e0b' },
                        { key: 'consultation', label: '3. Consultation Room', val: patientFlow?.consultation, color: '#a855f7' },
                        { key: 'lab', label: '4. Lab Diagnostics', val: patientFlow?.lab, color: '#ec4899' },
                        { key: 'pharmacy', label: '5. Pharmacy Dispenser', val: patientFlow?.pharmacy, color: '#14b8a6' },
                        { key: 'billing', label: '6. Billing Clearance', val: patientFlow?.billing, color: '#3b82f6' },
                        { key: 'admission', label: '7. Admitted IPD', val: patientFlow?.admission, color: '#ef4444' },
                        { key: 'discharge', label: '8. Discharged', val: patientFlow?.discharge, color: '#10b981' },
                    ].map((stage) => (
                        <div key={stage.key} className="funnel-stage-card" style={{ borderColor: stage.color }}>
                            <div className="stage-header" style={{ background: stage.color }}>{stage.label}</div>
                            <div className="stage-body">
                                <h4>{stage.val || 0}</h4>
                                <span>Active Patients</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default PatientFlow;
