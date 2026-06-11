import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Pharmacy.css';

const AVAILABLE_MEDICINES = [
  { name: 'Paracetamol 500mg', price: 50 },
  { name: 'Amoxicillin 500mg', price: 150 },
  { name: 'Vitamin D3', price: 200 },
  { name: 'Cough Syrup', price: 120 },
  { name: 'Ibuprofen 400mg', price: 60 },
  { name: 'Metformin 500mg', price: 80 },
  { name: 'Atorvastatin 10mg', price: 110 }
];

const Pharmacy = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [filter, setFilter] = useState('all'); // all, delivered, processing, pending, cancelled
  const [searchTerm, setSearchTerm] = useState('');
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestForm, setRequestForm] = useState({
    medicine: 'Paracetamol 500mg',
    quantity: 1,
    deliveryAddress: 'Flat 402, Royal Residency, Delhi'
  });

  // Check authentication and fetch pharmacy orders
  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');

    if (token && userData) {
      try {
        const user = JSON.parse(userData);
        setLoggedInUser(user);
        fetchPharmacyOrders(token);
      } catch (e) {
        console.error('Error parsing user data:', e);
        navigate('/login?redirect=/pharmacy');
        return;
      }
    } else {
      // No token or user data, redirect to login
      navigate('/login?redirect=/pharmacy');
      return;
    }
  }, [navigate]);

  // Fetch pharmacy orders from API
  const fetchPharmacyOrders = async (token) => {
    try {
      setIsLoading(true);
      // Try to fetch from API first
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'https://hms-h939.onrender.com'}/api/pharmacy/my-orders`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const fetchedOrders = data.orders || [];
          setOrders(fetchedOrders);
          setFilteredOrders(fetchedOrders);
          setIsLoading(false);
          return;
        }
      }

      // If API call fails, use mock data (for development)
      console.log('API not available, using mock data');
      const userData = JSON.parse(localStorage.getItem('user'));
      const mockOrders = getMockPharmacyOrders(userData);
      setOrders(mockOrders);
      setFilteredOrders(mockOrders);
    } catch (err) {
      console.error('Error fetching pharmacy orders:', err);
      // Fallback to mock data if API fails
      const userData = JSON.parse(localStorage.getItem('user'));
      const mockOrders = getMockPharmacyOrders(userData);
      setOrders(mockOrders);
      setFilteredOrders(mockOrders);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRaiseRequest = (e) => {
    e.preventDefault();
    const selectedMed = AVAILABLE_MEDICINES.find(m => m.name === requestForm.medicine);
    const amount = selectedMed.price * Number(requestForm.quantity);

    const newOrder = {
      _id: `mock-${Date.now()}`,
      orderId: `PHARM-2026-${Math.floor(100 + Math.random() * 900)}`,
      patientName: loggedInUser?.name || 'Amit Singh',
      userId: loggedInUser?.id || loggedInUser?.userId || loggedInUser?._id || 'user1',
      patientEmail: loggedInUser?.email || 'amit.singh@gmail.com',
      orderDate: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      orderStatus: 'Upcoming', // matches pharmacist's orderStatus: Upcoming vs Completed
      status: 'pending', // matches patient's status: pending vs delivered/processing
      items: [
        { 
          name: requestForm.medicine, 
          medicineName: requestForm.medicine,
          quantity: Number(requestForm.quantity), 
          price: selectedMed.price,
          purchased: true,
          frequency: '1-0-1',
          duration: '5 days'
        }
      ],
      totalAmount: amount,
      deliveryDate: null,
      deliveryAddress: requestForm.deliveryAddress,
      paymentStatus: 'Pending',
      doctorId: { name: 'Self Requested' }
    };

    const stored = localStorage.getItem('patient_pharmacy_orders');
    let allOrders = stored ? JSON.parse(stored) : [];
    allOrders = [newOrder, ...allOrders];
    localStorage.setItem('patient_pharmacy_orders', JSON.stringify(allOrders));

    // Refresh state
    setOrders(allOrders);
    const filtered = allOrders.filter(order => {
      const userId = loggedInUser?.id || loggedInUser?.userId || loggedInUser?._id;
      const userEmail = loggedInUser?.email;
      const userName = loggedInUser?.name;
      if (userId && order.userId === userId) return true;
      if (userEmail && order.patientEmail && order.patientEmail.toLowerCase() === userEmail.toLowerCase()) return true;
      if (userName && order.patientName && order.patientName.toLowerCase() === userName.toLowerCase()) return true;
      return false;
    });
    setFilteredOrders(filtered);
    setShowRequestModal(false);
    alert('Medicine request raised successfully and sent to the Pharmacy.');
  };

  // Mock pharmacy orders data (for development - remove when API is ready)
  const getMockPharmacyOrders = (userData) => {
    const stored = localStorage.getItem('patient_pharmacy_orders');
    let allOrders = [];
    if (stored) {
      allOrders = JSON.parse(stored);
    } else {
      allOrders = [
        {
          id: 1,
          orderId: 'PHARM-2026-001',
          patientName: 'Amit Singh',
          userId: 'user1',
          patientEmail: 'amit.singh@gmail.com',
          orderDate: '2026-05-28',
          status: 'delivered',
          items: [
            { name: 'Paracetamol 500mg', medicineName: 'Paracetamol 500mg', quantity: 2, price: 50, purchased: true },
            { name: 'Vitamin D3', medicineName: 'Vitamin D3', quantity: 1, price: 200, purchased: true }
          ],
          totalAmount: 300,
          deliveryDate: '2026-05-30',
          deliveryAddress: 'Flat 402, Royal Residency, Delhi',
          paymentStatus: 'paid'
        },
        {
          id: 2,
          orderId: 'PHARM-2026-002',
          patientName: 'Jane Smith',
          userId: 'user2',
          patientEmail: 'jane.smith@example.com',
          orderDate: '2026-05-29',
          status: 'processing',
          items: [
            { name: 'Amoxicillin 500mg', medicineName: 'Amoxicillin 500mg', quantity: 1, price: 150, purchased: true },
            { name: 'Cough Syrup', medicineName: 'Cough Syrup', quantity: 1, price: 120, purchased: true }
          ],
          totalAmount: 270,
          deliveryDate: null,
          deliveryAddress: '456 Oak Ave, City, State 12345',
          paymentStatus: 'paid'
        },
        {
          id: 3,
          orderId: 'PHARM-2026-003',
          patientName: 'Robert Johnson',
          userId: 'user3',
          patientEmail: 'robert.johnson@example.com',
          orderDate: '2026-05-30',
          status: 'pending',
          items: [
            { name: 'Blood Pressure Monitor', medicineName: 'Blood Pressure Monitor', quantity: 1, price: 1500, purchased: true }
          ],
          totalAmount: 1500,
          deliveryDate: null,
          deliveryAddress: '789 Pine Rd, City, State 12345',
          paymentStatus: 'pending'
        },
        {
          id: 4,
          orderId: 'PHARM-2026-004',
          patientName: 'Amit Singh',
          userId: 'user1',
          patientEmail: 'amit.singh@gmail.com',
          orderDate: '2026-05-31',
          status: 'pending',
          items: [
            { name: 'Insulin Syringes', medicineName: 'Insulin Syringes', quantity: 10, price: 250, purchased: true },
            { name: 'Glucose Test Strips', medicineName: 'Glucose Test Strips', quantity: 50, price: 300, purchased: true }
          ],
          totalAmount: 550,
          deliveryDate: null,
          deliveryAddress: 'Flat 402, Royal Residency, Delhi',
          paymentStatus: 'pending'
        }
      ];
      localStorage.setItem('patient_pharmacy_orders', JSON.stringify(allOrders));
    }

    if (!userData) return [];

    const userId = userData.id || userData.userId || userData._id;
    const userEmail = userData.email || userData.userEmail;
    const userName = userData.name || userData.userName || userData.fullName;

    return allOrders.filter(order => {
      if (userId && order.userId === userId) return true;
      if (userEmail && order.patientEmail &&
        order.patientEmail.toLowerCase() === userEmail.toLowerCase()) return true;
      if (userName && order.patientName &&
        order.patientName.toLowerCase() === userName.toLowerCase()) return true;
      return false;
    });
  };

  // Scroll animation logic
  useEffect(() => {
    window.scrollTo(0, 0);

    const observerOptions = {
      root: null,
      rootMargin: '0px',
      threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, observerOptions);

    const elements = document.querySelectorAll('.animate-on-scroll');
    elements.forEach((el) => observer.observe(el));

    return () => {
      elements.forEach((el) => observer.unobserve(el));
    };
  }, []);

  // Filter orders by status and search
  useEffect(() => {
    if (isLoading) return;

    let filtered = [...orders];

    // Apply status filter
    if (filter !== 'all') {
      filtered = filtered.filter(order => order.status === filter);
    }

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(order =>
        order.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.items.some(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    setFilteredOrders(filtered);
  }, [filter, searchTerm, orders, isLoading]);

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Show loading state
  if (isLoading || !loggedInUser) {
    return (
      <div className="pharmacy-page">
        <div className="content-wrapper">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading your pharmacy orders...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pharmacy-page">
      <div className="content-wrapper">

        {/* Header Section */}
        <section className="pharmacy-header animate-on-scroll slide-up">
          <Link to="/" className="back-link">
            <span className="back-arrow">←</span> Back to Home
          </Link>

          <div className="header-content">
            <span className="badge">Pharmacy Orders</span>
            <h1>
              Your <span className="text-gradient">Pharmacy Orders</span>
            </h1>
            <p className="header-subtext">
              View and track all your medication orders and purchases.
              Manage your prescriptions and delivery information.
            </p>
            {loggedInUser && (loggedInUser.name || loggedInUser.email) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginTop: '16px' }}>
                <p className="user-greeting" style={{ margin: 0 }}>
                  Welcome, <strong>{loggedInUser.name || loggedInUser.email}</strong>
                </p>
                <button 
                  onClick={() => setShowRequestModal(true)} 
                  className="btn btn-primary"
                  style={{ background: 'linear-gradient(135deg, #0d9488, #06b6d4)', border: 'none', color: 'white', fontWeight: '700', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(6,182,212,0.3)' }}
                >
                  ➕ Raise Medicine Request
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Filters and Search Section */}
        <section className="pharmacy-controls animate-on-scroll slide-up delay-100">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search by order ID, item name, or patient name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>

          <div className="filter-buttons">
            <button
              className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All Orders
            </button>
            <button
              className={`filter-btn ${filter === 'delivered' ? 'active' : ''}`}
              onClick={() => setFilter('delivered')}
            >
              Delivered
            </button>
            <button
              className={`filter-btn ${filter === 'processing' ? 'active' : ''}`}
              onClick={() => setFilter('processing')}
            >
              Processing
            </button>
            <button
              className={`filter-btn ${filter === 'pending' ? 'active' : ''}`}
              onClick={() => setFilter('pending')}
            >
              Pending
            </button>
            <button
              className={`filter-btn ${filter === 'cancelled' ? 'active' : ''}`}
              onClick={() => setFilter('cancelled')}
            >
              Cancelled
            </button>
          </div>
        </section>

        {/* Orders Grid */}
        <section className="orders-grid-section">
          {filteredOrders.length > 0 ? (
            <div className="orders-grid">
              {filteredOrders.map((order, index) => (
                <div
                  key={order.id || order._id}
                  className={`order-card animate-on-scroll slide-up delay-${(index % 3) * 100}`}
                >
                  {/* Order Header */}
                  <div className="order-card-header">
                    <div className="order-id">
                      <span className="id-label">Order ID</span>
                      <span className="id-value">{order.orderId}</span>
                    </div>
                    <div className={`status-badge status-${order.status}`}>
                      {order.status === 'delivered' && '✓ Delivered'}
                      {order.status === 'processing' && '⏳ Processing'}
                      {order.status === 'pending' && '⏸ Pending'}
                      {order.status === 'cancelled' && '✕ Cancelled'}
                    </div>
                  </div>

                  {/* Order Body */}
                  <div className="order-card-body">
                    <div className="order-meta">
                      <div className="meta-item">
                        <span className="meta-icon">📅</span>
                        <div>
                          <span className="meta-label">Order Date</span>
                          <span className="meta-value">{formatDate(order.createdAt || order.orderDate)}</span>
                        </div>
                      </div>

                      <div className="meta-item">
                        <span className="meta-icon">💰</span>
                        <div>
                          <span className="meta-label">Total Amount</span>
                          <span className="meta-value">
                            {order.totalAmount ? `₹${order.totalAmount}` : 'Calculated at Pharmacy'}
                          </span>
                        </div>
                      </div>
                      <div className="meta-item">
                        <span className="meta-icon">💳</span>
                        <div>
                          <span className="meta-label">Payment</span>
                          <span className={`meta-value payment-${(order.paymentStatus || '').toLowerCase()}`}>
                            {order.paymentStatus}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Order Items */}
                    <div className="order-items">
                      <h4>Items ({order.items.length})</h4>
                      <div className="items-list">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="item-row">
                            <div className="item-info">
                              <span className="item-name">{item.medicineName || item.name}</span>
                              <span className="item-quantity">
                                {item.quantity ? `Qty: ${item.quantity}` : `${item.frequency || ''} ${item.duration || ''}`}
                              </span>
                            </div>
                            <span className="item-price">
                              {item.price ? `₹${item.price}` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Delivery Address */}
                    {order.deliveryAddress && (
                      <div className="delivery-address">
                        <span className="address-icon">📍</span>
                        <span className="address-text">{order.deliveryAddress}</span>
                      </div>
                    )}
                  </div>

                  {/* Order Footer */}
                  <div className="order-card-footer">
                    {order.status === 'delivered' && (
                      <button
                        className="btn btn-primary"
                        onClick={() => alert(`Reordering ${order.orderId}...`)}
                      >
                        Reorder
                      </button>
                    )}
                    {order.status === 'processing' && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => alert(`Tracking order ${order.orderId}...`)}
                      >
                        Track Order
                      </button>
                    )}
                    {order.status === 'pending' && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => alert(`Order ${order.orderId} is pending confirmation...`)}
                      >
                        View Details
                      </button>
                    )}
                    {order.status === 'cancelled' && (
                      <button
                        className="btn btn-secondary"
                        disabled
                      >
                        Order Cancelled
                      </button>
                    )}
                  </div>

                  {/* Card Hover Effect */}
                  <div className="card-hover-effect"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-orders-found animate-on-scroll fade-in">
              <div className="empty-state">
                <div className="empty-icon">💊</div>
                <h3>No Orders Found</h3>
                <p>
                  {searchTerm || filter !== 'all'
                    ? 'No orders match your search criteria. Try adjusting your filters.'
                    : 'You don\'t have any pharmacy orders yet. Your orders will appear here once you make a purchase.'}
                </p>
                {(searchTerm || filter !== 'all') && (
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setSearchTerm('');
                      setFilter('all');
                    }}
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* CTA Section */}
        {filteredOrders.length > 0 && (
          <section className="pharmacy-cta animate-on-scroll fade-in">
            <div className="cta-card">
              <h2>Need to Order Medications?</h2>
              <p>Browse our pharmacy catalog and place your order online.</p>
              <button className="btn btn-white">Browse Pharmacy</button>
            </div>
          </section>
        )}

      </div>

      {/* Raise Request Modal */}
      {showRequestModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '32px', maxWidth: '480px', width: '90%', boxShadow: '0 25px 80px rgba(0,0,0,0.25)', boxSizing: 'border-box' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '20px', color: '#0f172a' }}>➕ Raise New Medicine Request</h3>
            <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 24px', lineHeight: '1.5' }}>
              Select a medicine and quantity. Your request will be instantly visible to the pharmacist.
            </p>
            <form onSubmit={handleRaiseRequest} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Select Medication</label>
                <select 
                  value={requestForm.medicine}
                  onChange={e => setRequestForm({ ...requestForm, medicine: e.target.value })}
                  style={{ padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', outline: 'none', fontSize: '14px', color: '#0f172a' }}
                >
                  {AVAILABLE_MEDICINES.map(m => (
                    <option key={m.name} value={m.name}>{m.name} (₹{m.price})</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Quantity</label>
                <input 
                  type="number"
                  min="1"
                  max="10"
                  value={requestForm.quantity}
                  onChange={e => setRequestForm({ ...requestForm, quantity: e.target.value })}
                  style={{ padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', outline: 'none', fontSize: '14px', color: '#0f172a' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Delivery Address</label>
                <textarea 
                  rows="3"
                  value={requestForm.deliveryAddress}
                  onChange={e => setRequestForm({ ...requestForm, deliveryAddress: e.target.value })}
                  style={{ padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', outline: 'none', fontSize: '14px', color: '#0f172a', resize: 'none', fontFamily: 'inherit' }}
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowRequestModal(false)}
                  style={{ flex: 1, padding: '10px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  style={{ flex: 1, padding: '10px 16px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #0d9488, #06b6d4)', color: 'white', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pharmacy;

