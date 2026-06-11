import React, { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchNotifications, markAsRead, markAllAsRead, addNotification } from '../../store/slices/notificationSlice';
import socket from '../../utils/socket';
import {
    FiAlertCircle, FiCheckCircle, FiClock,
    FiMail, FiTrendingUp, FiShoppingBag, FiInfo
} from 'react-icons/fi';
import './NotificationCenter.css';

const NotificationCenter = () => {
    const dispatch = useAppDispatch();
    const { items: notifications, unreadCount, loading, error } = useAppSelector(state => state.notifications);

    useEffect(() => {
        dispatch(fetchNotifications());

        // Connect to Socket to listen to live alerts directed to the administrator
        if (socket) {
            const handleSocketNotification = (data) => {
                // Construct a mock notification structure to insert into Redux state
                const notifPayload = {
                    _id: data.id || `socket-${Date.now()}`,
                    senderId: { name: data.sender || 'System Alert' },
                    message: data.message || 'New operational activity flagged.',
                    status: 'Unread',
                    referenceType: data.referenceType || 'System',
                    referenceId: data.referenceId || `ref-${Date.now()}`,
                    patientId: data.patientId || 'N/A',
                    createdAt: new Date().toISOString()
                };
                dispatch(addNotification(notifPayload));
            };

            // Listen for admin events
            socket.on('admin_notification', handleSocketNotification);
            socket.on('admission_created', (data) => {
                handleSocketNotification({
                    message: `New Admission: Patient ${data.patientName || 'N/A'} admitted to ${data.ward || 'Ward'}`,
                    sender: 'Reception Desk',
                    referenceType: 'ClinicalVisit'
                });
            });
            socket.on('billing_completed', (data) => {
                handleSocketNotification({
                    message: `Invoice Cleared: Payment of ₹${data.amount || 0} received for Invoice #${data.invoiceNumber || 'N/A'}`,
                    sender: 'Billing Office',
                    referenceType: 'PharmacyOrder'
                });
            });

            return () => {
                socket.off('admin_notification', handleSocketNotification);
                socket.off('admission_created');
                socket.off('billing_completed');
            };
        }
    }, [dispatch]);

    const handleMarkRead = (id) => {
        dispatch(markAsRead(id));
    };

    const handleMarkAllRead = () => {
        if (window.confirm('Do you want to mark all notifications as read?')) {
            dispatch(markAllAsRead());
        }
    };

    const getRefIcon = (refType) => {
        switch (String(refType).toLowerCase()) {
            case 'pharmacyorder':
                return <FiShoppingBag className="ref-icon pharma" />;
            case 'labreport':
                return <FiTrendingUp className="ref-icon lab" />;
            case 'clinicalvisit':
                return <FiAlertCircle className="ref-icon clinical" />;
            default:
                return <FiInfo className="ref-icon system" />;
        }
    };

    return (
        <div className="notif-center-page">
            <div className="notif-header">
                <div>
                    <h1>Operational Alerts & Notifications</h1>
                    <p>Track real-time system warnings, admissions, and financial events in the hospital.</p>
                </div>
                {unreadCount > 0 && (
                    <button onClick={handleMarkAllRead} className="btn-mark-all">
                        Mark all as read ({unreadCount} unread)
                    </button>
                )}
            </div>

            {error && (
                <div className="notif-error">
                    <FiAlertCircle /> <span>{error}</span>
                </div>
            )}

            <div className="notif-content-card">
                {loading && !notifications.length ? (
                    <div className="notif-loading">Syncing notification channel...</div>
                ) : notifications.length === 0 ? (
                    <div className="notif-empty-state">
                        <FiMail className="empty-icon" />
                        <h3>Inbox is Empty</h3>
                        <p>No system alerts or operational notifications logged at this time.</p>
                    </div>
                ) : (
                    <div className="notif-list">
                        {notifications.map((notif) => {
                            const isUnread = notif.status === 'Unread';
                            return (
                                <div key={notif._id} className={`notif-item-row ${isUnread ? 'unread' : 'read'}`}>
                                    <div className="icon-column">
                                        {getRefIcon(notif.referenceType)}
                                    </div>
                                    <div className="details-column">
                                        <div className="sender-line">
                                            <strong>{notif.senderId?.name || 'System Command'}</strong>
                                            <span className="notif-time">
                                                <FiClock /> {new Date(notif.createdAt).toLocaleString()}
                                            </span>
                                        </div>
                                        <p className="message-txt">{notif.message}</p>
                                        <div className="footer-meta">
                                            <span className="lbl-patient">Patient ID: <strong>{notif.patientId || 'N/A'}</strong></span>
                                            {isUnread && (
                                                <button onClick={() => handleMarkRead(notif._id)} className="btn-read-check">
                                                    <FiCheckCircle /> Mark Read
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotificationCenter;
