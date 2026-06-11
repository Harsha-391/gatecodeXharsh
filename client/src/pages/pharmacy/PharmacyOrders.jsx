import React, { useState, useEffect } from 'react';
import { pharmacyOrderAPI } from '../../utils/api';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import socket from '../../utils/socket';
import './PharmacyInventory.css';

const PharmacyOrders = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [billModal, setBillModal] = useState(null); // order to show in bill preview modal
    const [orderEdits, setOrderEdits] = useState({}); // track item selections and quantity edits per order

    useEffect(() => {
        fetchOrders();

        const handleLiveRefresh = (notif) => {
            if (!notif || notif.referenceType === 'PharmacyOrder' || notif.message?.toLowerCase().includes('pharmacy')) {
                fetchOrders();
            }
        };

        socket.on('newNotification', handleLiveRefresh);
        socket.on('new_notification', handleLiveRefresh);

        return () => {
            socket.off('newNotification', handleLiveRefresh);
            socket.off('new_notification', handleLiveRefresh);
        };
    }, []);

    // Lock background scroll when bill modal is open
    useEffect(() => {
        // erp-page-content is the actual scrollable wrapper in DashboardLayout
        const scrollEls = [
            document.body,
            document.documentElement,
            document.querySelector('.erp-page-content'),
            document.querySelector('.erp-main-area'),
        ].filter(Boolean);

        if (billModal) {
            scrollEls.forEach(el => {
                el._prevOverflow = el.style.overflow;
                el.style.overflow = 'hidden';
            });
        } else {
            scrollEls.forEach(el => {
                el.style.overflow = el._prevOverflow || '';
            });
        }
        return () => {
            scrollEls.forEach(el => { el.style.overflow = el._prevOverflow || ''; });
        };
    }, [billModal]);

    const fetchOrders = async () => {
        try {
            setLoading(true);
            const res = await pharmacyOrderAPI.getOrders();
            if (res.success) {
                setOrders(res.orders || []);
            }
        } catch (err) {
            console.error("Failed to fetch pharmacy orders", err);
        } finally {
            setLoading(false);
        }
    };

    const handleCompleteOrder = async (orderId) => {
        if (!window.confirm("Approve and mark this order as Dispensed / Delivered?")) return;
        try {
            const edits = orderEdits[orderId] || {};
            const res = await pharmacyOrderAPI.completeOrder(orderId, edits.purchasedIndices, edits.itemQuantities);
            if (res.success) {
                alert("Order approved and marked as completed!");
                fetchOrders();
            } else {
                alert(res.message || 'Failed to complete order');
            }
        } catch (err) {
            alert("Failed to update order: " + (err.response?.data?.message || err.message));
        }
    };

    const handleMarkPaid = async (orderId) => {
        if (!window.confirm("Mark money as Paid for this order?")) return;
        try {
            const edits = orderEdits[orderId] || {};
            const res = await pharmacyOrderAPI.markPaid(orderId, edits.purchasedIndices, edits.itemQuantities);
            if (res.success) {
                await fetchOrders();
                // After refresh, open bill modal for this order
                const updatedRes = await pharmacyOrderAPI.getOrders();
                if (updatedRes.success) {
                    const updated = (updatedRes.orders || []).find(o => o._id === orderId);
                    if (updated) setBillModal(updated);
                }
            }
        } catch (err) {
            alert("Failed to update payment: " + (err.response?.data?.message || err.message));
        }
    };

    const handleCancelOrder = async (orderId) => {
        if (!window.confirm("Are you sure you want to cancel this order?")) return;
        try {
            const res = await pharmacyOrderAPI.cancelOrder(orderId);
            if (res.success) {
                alert("Order cancelled successfully.");
                fetchOrders();
            }
        } catch (err) {
            alert("Failed to cancel order: " + (err.response?.data?.message || err.message));
        }
    };

    // ─── Bill Generation ───────────────────────────────────────────────────────

    const hospitalName = JSON.parse(localStorage.getItem('user') || '{}').hospitalName || 'Admit Hospital';

    const getBillNumber = (order) => {
        const id = order._id || order.orderId || '';
        return `RX-${id.slice(-8).toUpperCase()}`;
    };

    const generateBillPDF = (order) => {
        const doc = new jsPDF({ unit: 'mm', format: 'a5' });
        const pageW = doc.internal.pageSize.getWidth();
        let y = 14;

        // ── Header ──
        doc.setFillColor(14, 165, 133);
        doc.rect(0, 0, pageW, 28, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(15);
        doc.setFont('helvetica', 'bold');
        doc.text(hospitalName, pageW / 2, y, { align: 'center' });
        y += 7;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text('PHARMACY MEDICINE BILL / RECEIPT', pageW / 2, y, { align: 'center' });
        y = 36;

        // ── Bill Meta ──
        doc.setTextColor(30, 30, 30);
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.text(`Bill No: ${getBillNumber(order)}`, 10, y);
        doc.text(`Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`, pageW - 10, y, { align: 'right' });
        y += 5;
        doc.setFont('helvetica', 'normal');
        doc.text(`Time: ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`, pageW - 10, y, { align: 'right' });

        // ── Patient Info ──
        y += 8;
        doc.setFillColor(240, 253, 244);
        doc.roundedRect(8, y - 4, pageW - 16, 22, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text('PATIENT DETAILS', 12, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        const patName = order.patientName || order.userId?.name || 'Patient';
        const doctorName = order.doctorId?.name
            ? (order.doctorId.name.startsWith('Dr.') ? order.doctorId.name : `Dr. ${order.doctorId.name}`)
            : 'Self Request';
        doc.text(`Patient : ${patName}`, 12, y);
        y += 5;
        doc.text(`Prescribed by : ${doctorName}`, 12, y);
        y += 5;
        if (order.patientEmail || order.userId?.email) {
            doc.text(`Email : ${order.patientEmail || order.userId?.email}`, 12, y);
            y += 5;
        }

        // ── Items Table ──
        y += 4;
        doc.autoTable({
            startY: y,
            head: [['#', 'Medicine Name', 'Qty', 'Unit Price (₹)', 'Amount (₹)']],
            body: (order.items || []).map((item, i) => [
                i + 1,
                item.medicineName || item.name || '—',
                item.quantity || 1,
                item.unitPrice ? `₹${Number(item.unitPrice).toFixed(2)}` : '—',
                item.totalPrice || item.price ? `₹${Number(item.totalPrice || item.price).toFixed(2)}` : '—',
            ]),
            styles: { fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [14, 165, 133], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [245, 255, 250] },
            columnStyles: {
                0: { cellWidth: 8, halign: 'center' },
                2: { cellWidth: 12, halign: 'center' },
                3: { cellWidth: 28, halign: 'right' },
                4: { cellWidth: 26, halign: 'right' },
            },
            margin: { left: 8, right: 8 },
        });

        y = doc.lastAutoTable.finalY + 6;

        // ── Total ──
        doc.setFillColor(14, 165, 133);
        doc.roundedRect(pageW - 70, y - 3, 62, 13, 2, 2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('TOTAL AMOUNT', pageW - 67, y + 3.5);
        doc.text(`₹${computeOrderTotal(order).toFixed(2)}`, pageW - 10, y + 3.5, { align: 'right' });

        y += 18;
        doc.setTextColor(30, 30, 30);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text('Payment Status:', 10, y);
        doc.setTextColor((order.paymentStatus || '').toLowerCase() === 'paid' ? 22 : 220,
            (order.paymentStatus || '').toLowerCase() === 'paid' ? 163 : 38, 74);
        doc.text(order.paymentStatus || 'Pending', 42, y);

        // ── Footer ──
        y += 14;
        doc.setDrawColor(200, 200, 200);
        doc.line(8, y, pageW - 8, y);
        y += 5;
        doc.setTextColor(120);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.text('Thank you for choosing ' + hospitalName + '. Get well soon! 💊', pageW / 2, y, { align: 'center' });
        y += 4;
        doc.text('This is a computer-generated bill. No signature required.', pageW / 2, y, { align: 'center' });

        return doc;
    };

    const handleDownloadBill = (order) => {
        const doc = generateBillPDF(order);
        doc.save(`pharmacy_bill_${getBillNumber(order)}_${new Date().toISOString().slice(0, 10)}.pdf`);
    };

    const handlePrintBill = (order) => {
        const doc = generateBillPDF(order);
        const blobUrl = doc.output('bloburl');
        const win = window.open(blobUrl, '_blank');
        if (win) {
            win.addEventListener('load', () => win.print());
        }
    };

    // ─── Filters ─────────────────────────────────────────────────────────────

    const q = searchQuery.toLowerCase().trim();
    const filtered = orders.filter(o => {
        if (q && !(o.patientName || o.userId?.name || '').toLowerCase().includes(q) &&
            !(o.orderId || '').toLowerCase().includes(q) &&
            !(o.doctorId?.name || '').toLowerCase().includes(q)) return false;
        if (statusFilter !== 'all' && o.orderStatus?.toLowerCase() !== statusFilter && o.status !== statusFilter) return false;
        return true;
    });

    const pendingCount = orders.filter(o => (o.orderStatus || o.status || '').toLowerCase() === 'pending' || o.orderStatus === 'Upcoming').length;
    const completedCount = orders.filter(o => (o.orderStatus || o.status || '').toLowerCase() === 'completed' || o.orderStatus === 'Completed' || o.status === 'delivered').length;

    const isItemSelected = (orderId, idx, order) => {
        const edits = orderEdits[orderId];
        if (edits && edits.purchasedIndices) {
            return edits.purchasedIndices.includes(idx);
        }
        return true; // Default: all selected
    };

    const getItemQuantity = (orderId, idx, item) => {
        const edits = orderEdits[orderId];
        if (edits && edits.itemQuantities && edits.itemQuantities[idx] !== undefined) {
            return edits.itemQuantities[idx];
        }
        return item.quantity || 1;
    };

    const toggleItemSelection = (orderId, idx, order) => {
        setOrderEdits(prev => {
            const orderEdit = prev[orderId] || {};
            let currentIndices = orderEdit.purchasedIndices;
            if (!currentIndices) {
                currentIndices = order.items.map((_, i) => i);
            }
            if (currentIndices.includes(idx)) {
                currentIndices = currentIndices.filter(i => i !== idx);
            } else {
                currentIndices = [...currentIndices, idx];
            }
            return { ...prev, [orderId]: { ...orderEdit, purchasedIndices: currentIndices } };
        });
    };

    const updateItemQuantity = (orderId, idx, value) => {
        const num = Math.max(1, parseInt(value, 10) || 1);
        setOrderEdits(prev => {
            const orderEdit = prev[orderId] || {};
            const currentQuantities = orderEdit.itemQuantities || {};
            return { ...prev, [orderId]: { ...orderEdit, itemQuantities: { ...currentQuantities, [idx]: num } } };
        });
    };

    // Compute correct order total from individual item prices (unit price × qty)
    const computeOrderTotal = (order) => {
        const orderId = order._id || order.orderId;
        const hasEdits = !!orderEdits[orderId];
        const itemsTotal = (order.items || []).reduce((sum, item, idx) => {
            if (!isItemSelected(orderId, idx, order)) return sum;
            
            const qty = getItemQuantity(orderId, idx, item);
            const unitPrice = Number(item.unitPrice || 0);
            
            if (unitPrice > 0) {
                return sum + (unitPrice * qty);
            }
            const itemTotal = Number(item.totalPrice || item.price) || 0;
            return sum + itemTotal;
        }, 0);
        
        if (hasEdits) {
            return itemsTotal;
        }

        // Fall back to stored totalAmount only if items have no pricing info and no edits were made
        return itemsTotal > 0 ? itemsTotal : Number(order.totalAmount || 0);
    };

    const totalRevenue = orders
        .filter(o => (o.paymentStatus || '').toLowerCase() === 'paid')
        .reduce((sum, o) => sum + computeOrderTotal(o), 0);


    const getStatusBadge = (order) => {
        const status = (order.orderStatus || order.status || '').toLowerCase();
        if (status === 'completed' || status === 'delivered') return 'status-active';
        if (status === 'cancelled') return 'status-inactive';
        return 'status-low';
    };

    const getStatusLabel = (order) => order.orderStatus || order.status || 'pending';

    const isPaid = (order) => (order.paymentStatus || '').toLowerCase() === 'paid';

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="pharmacy-management-container">
            <div className="pharmacy-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1>Prescriptions &amp; Patient Orders</h1>
                    <p>Process prescriptions sent by doctors and medicine requests from patients.</p>
                </div>
                <button onClick={fetchOrders} className="btn-edit" style={{ padding: '8px 16px', cursor: 'pointer', fontWeight: 'bold' }}>
                    ↻ Refresh
                </button>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                <div style={{ background: '#eff6ff', borderRadius: '10px', padding: '14px', textAlign: 'center', border: '1px solid #bfdbfe' }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#2563eb' }}>{orders.length}</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Total Orders</div>
                </div>
                <div style={{ background: '#fffbeb', borderRadius: '10px', padding: '14px', textAlign: 'center', border: '1px solid #fde68a' }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#d97706' }}>{pendingCount}</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Pending</div>
                </div>
                <div style={{ background: '#f0fdf4', borderRadius: '10px', padding: '14px', textAlign: 'center', border: '1px solid #bbf7d0' }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#16a34a' }}>{completedCount}</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Completed</div>
                </div>
                <div style={{ background: '#f5f3ff', borderRadius: '10px', padding: '14px', textAlign: 'center', border: '1px solid #ddd6fe' }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#7c3aed' }}>₹{totalRevenue.toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Collected Revenue</div>
                </div>
            </div>

            {/* Search + Filter */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                    type="text"
                    placeholder="Search by patient, order ID, or doctor..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{ flex: 1, minWidth: '200px', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.9rem', outline: 'none' }}
                />
                <div style={{ display: 'flex', gap: '4px' }}>
                    {['all', 'pending', 'completed', 'cancelled'].map(s => (
                        <button key={s} onClick={() => setStatusFilter(s)}
                            style={{
                                padding: '6px 14px', borderRadius: '8px', border: '1.5px solid', cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem',
                                borderColor: statusFilter === s ? '#3b82f6' : '#e2e8f0',
                                background: statusFilter === s ? '#eff6ff' : '#fff',
                                color: statusFilter === s ? '#2563eb' : '#64748b'
                            }}>
                            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            <div className="inventory-table-wrapper">
                {loading ? <div className="loader">Loading Orders...</div> : filtered.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>{searchQuery ? '🔍' : '📭'}</div>
                        <div style={{ fontWeight: 600, fontSize: '1rem' }}>{searchQuery ? 'No orders match your search' : 'No orders yet'}</div>
                    </div>
                ) : (
                    <table className="inventory-table">
                        <thead>
                            <tr>
                                <th>Patient Details</th>
                                <th>Doctor / Channel</th>
                                <th>Requested Items</th>
                                <th>Total</th>
                                <th>Order Status</th>
                                <th>Payment</th>
                                <th style={{ minWidth: '260px' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((order) => {
                                console.log("Order obj:", order);
                                return (
                                <tr key={order._id || order.orderId}>
                                    <td>
                                        <div style={{ fontWeight: 'bold' }}>{order.patientName || order.userId?.name}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{order.patientEmail || order.userId?.email}</div>
                                        {order.deliveryAddress && (
                                            <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '4px' }}>
                                                📍 {order.deliveryAddress}
                                            </div>
                                        )}
                                    </td>
                                    <td>
                                        {(() => {
                                            let docName = order.doctorName || order.doctorId?.name;
                                            if (!docName && typeof order.doctorId === 'string') docName = order.doctorId;
                                            if (!docName) return '—';
                                            return docName.startsWith('Dr.') || docName === 'Self Requested' ? docName : `Dr. ${docName}`;
                                        })()}
                                    </td>
                                    <td>
                                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.9rem' }}>
                                            {(order.items || []).map((item, idx) => {
                                                const isUnavailable = !item.unitPrice || item.unitPrice === 0;
                                                const isSelected = isItemSelected(order._id || order.orderId, idx, order);
                                                const currentQty = getItemQuantity(order._id || order.orderId, idx, item);
                                                const canEdit = (order.orderStatus === 'Upcoming' || (order.status || '').toLowerCase() === 'pending' || (order.orderStatus || '').toLowerCase() === 'pending');
                                                const isPaidOrder = isPaid(order);

                                                return (
                                                    <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', opacity: isSelected ? 1 : 0.5 }}>
                                                        {canEdit && !isPaidOrder ? (
                                                            <input 
                                                                type="checkbox" 
                                                                checked={isSelected} 
                                                                onChange={() => toggleItemSelection(order._id || order.orderId, idx, order)}
                                                                style={{ transform: 'scale(1.2)' }}
                                                            />
                                                        ) : (
                                                            <span style={{ color: isUnavailable ? '#dc2626' : '#10b981', fontWeight: 'bold' }}>{isUnavailable ? '⚠️' : '✓'}</span>
                                                        )}
                                                        <span>
                                                            <strong style={{ textDecoration: !isSelected ? 'line-through' : 'none' }}>{item.medicineName || item.name}</strong>
                                                            {isUnavailable ? (
                                                                <span style={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: 'bold', marginLeft: '6px', padding: '1px 8px', background: '#fee2e2', borderRadius: '4px', display: 'inline-block' }}>
                                                                    Unavailable in Inventory
                                                                </span>
                                                            ) : (
                                                                <>
                                                                    <span style={{ color: '#64748b', fontSize: '0.8rem', marginLeft: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                        (Qty: 
                                                                        {canEdit && !isPaidOrder ? (
                                                                            <input 
                                                                                type="number" 
                                                                                min="1" 
                                                                                value={currentQty} 
                                                                                onChange={(e) => updateItemQuantity(order._id || order.orderId, idx, e.target.value)}
                                                                                style={{ width: '40px', padding: '2px 4px', fontSize: '0.8rem', border: '1px solid #ccc', borderRadius: '4px' }}
                                                                            />
                                                                        ) : (
                                                                            currentQty
                                                                        )}
                                                                        • ₹{item.unitPrice}/unit)
                                                                    </span>
                                                                    <span style={{ marginLeft: '8px', color: '#0d9488', fontWeight: '700', fontSize: '0.82rem' }}>
                                                                        Total: ₹{isSelected ? (currentQty * item.unitPrice).toFixed(2) : 0}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </span>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </td>
                                    <td style={{ fontWeight: '700', color: '#0f172a' }}>₹{computeOrderTotal(order).toFixed(2)}</td>
                                    <td>
                                        <span className={`status-badge ${getStatusBadge(order)}`}>{getStatusLabel(order)}</span>
                                    </td>
                                    <td>
                                        <span style={{ color: isPaid(order) ? '#16a34a' : '#dc2626', fontWeight: 'bold', fontSize: '13px' }}>
                                            {order.paymentStatus || 'Pending'}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                            {/* Order action buttons — only for pending orders */}
                                            {(order.orderStatus === 'Upcoming' || (order.status || '').toLowerCase() === 'pending' || (order.orderStatus || '').toLowerCase() === 'pending') && (
                                                <>
                                                    <button className="btn-add" style={{ padding: '6px 10px', fontSize: '0.72rem', background: '#10b981', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                                                        onClick={() => handleCompleteOrder(order._id)}>
                                                        ✓ Dispense
                                                    </button>
                                                    {!isPaid(order) && (
                                                        <button style={{ padding: '6px 10px', fontSize: '0.72rem', background: '#3b82f6', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                                                            onClick={() => handleMarkPaid(order._id)}>
                                                            💳 Mark Paid
                                                        </button>
                                                    )}
                                                    <button style={{ padding: '6px 10px', fontSize: '0.72rem', background: '#ef4444', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                                                        onClick={() => handleCancelOrder(order._id)}>
                                                        ✕ Cancel
                                                    </button>
                                                </>
                                            )}

                                            {/* Bill buttons — always visible once order exists */}
                                            {isPaid(order) && (
                                                <>
                                                    <button
                                                        title="Download PDF Bill"
                                                        onClick={() => handleDownloadBill(order)}
                                                        style={{ padding: '6px 10px', fontSize: '0.72rem', background: '#7c3aed', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        ⬇ Download Bill
                                                    </button>
                                                    <button
                                                        title="Print Bill"
                                                        onClick={() => handlePrintBill(order)}
                                                        style={{ padding: '6px 10px', fontSize: '0.72rem', background: '#0369a1', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        🖨 Print Bill
                                                    </button>
                                                    <button
                                                        title="View Bill Preview"
                                                        onClick={() => setBillModal(order)}
                                                        style={{ padding: '6px 10px', fontSize: '0.72rem', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                                                        👁 View
                                                    </button>
                                                </>
                                            )}

                                            {!isPaid(order) && (order.orderStatus || '').toLowerCase() !== 'pending' && order.orderStatus !== 'Upcoming' && (order.status || '').toLowerCase() !== 'pending' && (
                                                <span style={{ color: '#94a3b8', fontSize: '12px' }}>Processed</span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── Bill Preview Modal ── */}
            {billModal && (
                <div
                    onWheel={e => e.stopPropagation()}
                    onTouchMove={e => e.stopPropagation()}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(6px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px',
                        overflow: 'hidden'
                    }}>
                    <div style={{
                        background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '520px',
                        boxShadow: '0 25px 50px rgba(0,0,0,0.25)', overflow: 'hidden'
                    }}>
                        {/* Modal Header */}
                        <div style={{ background: 'linear-gradient(135deg,#0e9f6e,#3b82f6)', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem' }}>🧾 Pharmacy Bill</div>
                                <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '12px', marginTop: '2px' }}>{getBillNumber(billModal)}</div>
                            </div>
                            <button onClick={() => setBillModal(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}>×</button>
                        </div>

                        {/* Bill Body */}
                        <div style={{ padding: '24px' }}>
                            {/* Hospital & Date */}
                            <div style={{ textAlign: 'center', marginBottom: '16px', borderBottom: '2px dashed #e2e8f0', paddingBottom: '14px' }}>
                                <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#0f172a' }}>{hospitalName}</div>
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>PHARMACY RECEIPT</div>
                                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                                    {new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })}
                                </div>
                            </div>

                            {/* Patient Info */}
                            <div style={{ background: '#f0fdf4', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px', fontSize: '13px' }}>
                                <div><strong>Patient:</strong> {billModal.patientName || billModal.userId?.name || '—'}</div>
                                {(billModal.patientEmail || billModal.userId?.email) && (
                                    <div style={{ marginTop: '3px', color: '#64748b' }}><strong>Email:</strong> {billModal.patientEmail || billModal.userId?.email}</div>
                                )}
                                {billModal.doctorId?.name && (
                                    <div style={{ marginTop: '3px', color: '#64748b' }}>
                                        <strong>Prescribed by:</strong> {billModal.doctorId.name.startsWith('Dr.') ? billModal.doctorId.name : `Dr. ${billModal.doctorId.name}`}
                                    </div>
                                )}
                            </div>

                            {/* Items Table */}
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '14px' }}>
                                <thead>
                                    <tr style={{ background: '#0e9f6e' }}>
                                        <th style={{ padding: '8px 10px', textAlign: 'left', color: '#fff', fontWeight: 700, borderRadius: '6px 0 0 0' }}>Medicine</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'center', color: '#fff', fontWeight: 700 }}>Qty</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'right', color: '#fff', fontWeight: 700 }}>Unit (₹)</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'right', color: '#fff', fontWeight: 700, borderRadius: '0 6px 0 0' }}>Total (₹)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(billModal.items || []).map((item, i) => (
                                        <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '8px 10px', fontWeight: 500 }}>{item.medicineName || item.name || '—'}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'center', color: '#64748b' }}>{item.quantity || 1}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#64748b' }}>₹{item.unitPrice || 0}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#0d9488' }}>
                                                ₹{Number(item.totalPrice || item.price || (Number(item.unitPrice || 0) * Number(item.quantity || 1))).toFixed(2)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* Total Row */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0e9f6e', color: '#fff', borderRadius: '10px', padding: '12px 16px', marginBottom: '14px' }}>
                                <span style={{ fontWeight: 800, fontSize: '15px' }}>TOTAL AMOUNT</span>
                                <span style={{ fontWeight: 900, fontSize: '18px' }}>₹{computeOrderTotal(billModal).toFixed(2)}</span>
                            </div>

                            {/* Payment Badge */}
                            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                                <span style={{
                                    display: 'inline-block', padding: '6px 20px', borderRadius: '20px',
                                    background: isPaid(billModal) ? '#dcfce7' : '#fee2e2',
                                    color: isPaid(billModal) ? '#15803d' : '#dc2626',
                                    fontWeight: 800, fontSize: '13px'
                                }}>
                                    {isPaid(billModal) ? '✅ PAYMENT RECEIVED' : '⚠️ PAYMENT PENDING'}
                                </span>
                            </div>

                            {/* Action Buttons */}
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                    onClick={() => handleDownloadBill(billModal)}
                                    style={{ flex: 1, padding: '11px', background: '#7c3aed', border: 'none', color: '#fff', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                    ⬇ Download PDF
                                </button>
                                <button
                                    onClick={() => handlePrintBill(billModal)}
                                    style={{ flex: 1, padding: '11px', background: '#0369a1', border: 'none', color: '#fff', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                    🖨 Print Bill
                                </button>
                                <button
                                    onClick={() => setBillModal(null)}
                                    style={{ padding: '11px 16px', background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PharmacyOrders;
