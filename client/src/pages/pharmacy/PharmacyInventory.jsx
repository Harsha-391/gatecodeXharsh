import React, { useState, useEffect } from 'react';
import { pharmacyAPI } from '../../utils/api';
import './PharmacyInventory.css';

const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString();
};

const PharmacyInventory = () => {
    const today = new Date().toLocaleDateString('en-CA');
    const [medicines, setMedicines] = useState([]);
    const [purchaseRequests, setPurchaseRequests] = useState([]);
    const [activeTab, setActiveTab] = useState('inventory'); // 'inventory' or 'requests'
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [showRequestModal, setShowRequestModal] = useState(false);
    const [existingMatch, setExistingMatch] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const [newMedicine, setNewMedicine] = useState({
        name: '', category: '', stock: '', unit: 'Tablets',
        buyingPrice: '', sellingPrice: '', vendor: '',
        batchNumber: '', expiryDate: '',
        purchaseDate: new Date().toISOString().split('T')[0]
    });

    const [requestFormData, setRequestFormData] = useState({
        item: '',
        qty: ''
    });

    useEffect(() => {
        fetchInventory();
        fetchPurchaseRequests();
    }, []);

    const fetchInventory = async () => {
        try {
            setLoading(true);
            const response = await pharmacyAPI.getInventory();
            if (response.success) setMedicines(response.data);
        } catch (error) {
            console.error("Fetch Error:", error);
        } finally { setLoading(false); }
    };

    const fetchPurchaseRequests = async () => {
        try {
            const response = await pharmacyAPI.getPurchaseRequests();
            if (response.success) setPurchaseRequests(response.data);
        } catch (error) {
            console.error("Fetch Requests Error:", error);
        }
    };

    const handleNameChange = (e) => {
        const val = e.target.value;
        setNewMedicine(prev => ({ ...prev, name: val }));
        
        if (val.trim() === '') {
            setSuggestions([]);
            setShowSuggestions(false);
        } else {
            const filtered = medicines.filter(med => 
                (med.name || '').toLowerCase().includes(val.toLowerCase())
            );
            setSuggestions(filtered);
            setShowSuggestions(true);
        }
        
        const match = medicines.find(med => (med.name || '').toLowerCase() === val.toLowerCase());
        if (match) {
            setExistingMatch(match);
            setNewMedicine(prev => ({
                ...prev,
                category: match.category || prev.category,
                vendor: match.vendor || prev.vendor,
                unit: match.unit || prev.unit,
                buyingPrice: match.buyingPrice !== undefined ? match.buyingPrice.toString() : prev.buyingPrice,
                sellingPrice: match.sellingPrice !== undefined ? match.sellingPrice.toString() : prev.sellingPrice,
                batchNumber: match.batchNumber || prev.batchNumber,
                expiryDate: match.expiryDate ? match.expiryDate.split('T')[0] : prev.expiryDate
            }));
        } else {
            setExistingMatch(null);
        }
    };

    const handleSelectSuggestion = (match) => {
        setNewMedicine(prev => ({
            ...prev,
            name: match.name,
            category: match.category || prev.category,
            vendor: match.vendor || prev.vendor,
            unit: match.unit || prev.unit,
            buyingPrice: match.buyingPrice !== undefined ? match.buyingPrice.toString() : prev.buyingPrice,
            sellingPrice: match.sellingPrice !== undefined ? match.sellingPrice.toString() : prev.sellingPrice,
            batchNumber: match.batchNumber || prev.batchNumber,
            expiryDate: match.expiryDate ? match.expiryDate.split('T')[0] : prev.expiryDate
        }));
        setExistingMatch(match);
        setSuggestions([]);
        setShowSuggestions(false);
    };

    const handleAddMedicine = async (e) => {
        e.preventDefault();

        // Convert strings to proper types for Mongoose validation
        const cleanedData = {
            ...newMedicine,
            stock: Number(newMedicine.stock),
            buyingPrice: Number(newMedicine.buyingPrice),
            sellingPrice: Number(newMedicine.sellingPrice),
            expiryDate: newMedicine.expiryDate ? new Date(newMedicine.expiryDate) : (existingMatch ? existingMatch.expiryDate : null),
            purchaseDate: newMedicine.purchaseDate ? new Date(newMedicine.purchaseDate) : new Date()
        };

        try {
            let response;
            if (existingMatch) {
                const updatedData = {
                    ...cleanedData,
                    stock: Number(existingMatch.stock) + Number(newMedicine.stock)
                };
                response = await pharmacyAPI.updateMedicine(existingMatch._id, updatedData);
            } else {
                response = await pharmacyAPI.addMedicine(cleanedData);
            }

            if (response.success) {
                setShowAddModal(false);
                fetchInventory();
                // Reset form
                setNewMedicine({
                    name: '', category: '', stock: '', unit: 'Tablets',
                    buyingPrice: '', sellingPrice: '', vendor: '',
                    batchNumber: '', expiryDate: '',
                    purchaseDate: new Date().toISOString().split('T')[0]
                });
                setExistingMatch(null);
                setSuggestions([]);
                setShowSuggestions(false);
            }
        } catch (error) {
            const msg = error.response?.data?.message || "Check fields";
            console.error("Validation Error:", msg);
            alert("Error: " + msg);
        }
    };

    const handleRequestSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await pharmacyAPI.raisePurchaseRequest({
                item: requestFormData.item,
                qty: Number(requestFormData.qty)
            });
            if (response.success) {
                alert("Purchase request raised successfully!");
                setShowRequestModal(false);
                setRequestFormData({ item: '', qty: '' });
                fetchPurchaseRequests();
            }
        } catch (error) {
            const msg = error.response?.data?.message || "Error raising request";
            console.error("Request Error:", msg);
            alert("Error: " + msg);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm("Delete this item?")) {
            try {
                await pharmacyAPI.deleteMedicine(id);
                fetchInventory();
            } catch (error) { alert("Delete failed."); }
        }
    };

    const filteredMedicines = medicines.filter(med =>
        (med.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (med.category || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredRequests = purchaseRequests.filter(req =>
        (req.item || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (req.status || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="pharmacy-management-container">
            <div className="pharmacy-header">
                <h1>Medicine Inventory</h1>
                <p>Track stock, vendors, and profit margins.</p>
            </div>

            <div className="pharma-tabs-container">
                <button 
                    className={`pharma-tab ${activeTab === 'inventory' ? 'active' : ''}`}
                    onClick={() => setActiveTab('inventory')}
                >
                    Stock Inventory
                </button>
                <button 
                    className={`pharma-tab ${activeTab === 'requests' ? 'active' : ''}`}
                    onClick={() => setActiveTab('requests')}
                >
                    Purchase Requests ({purchaseRequests.length})
                </button>
            </div>

            <div className="inventory-controls">
                <div className="search-bar">
                    <span className="search-icon">🔍</span>
                    <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn-request" onClick={() => setShowRequestModal(true)}>+ Raise Request</button>
                    <button className="btn-add" onClick={() => setShowAddModal(true)}>+ Add Stock</button>
                </div>
            </div>

            {activeTab === 'inventory' ? (
                <div className="inventory-table-wrapper">
                    {loading ? <div className="loader">Loading...</div> : (
                        <table className="inventory-table">
                            <thead>
                                <tr>
                                    <th>Batch #</th>
                                    <th>Medicine Name</th>
                                    <th>Category</th>
                                    <th>Stock</th>
                                    <th>Buying (₹)</th>
                                    <th>Selling (₹)</th>
                                    <th>Vendor</th>
                                    <th>Expiry</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredMedicines.map((med) => (
                                    <tr key={med._id}>
                                        <td><small>#{med.batchNumber}</small></td>
                                        <td className="med-name">{med.name}</td>
                                        <td><span className="category-tag">{med.category}</span></td>
                                        <td><div className={med.stock < 50 ? 'low-stock' : 'good-stock'}>{med.stock} {med.unit}</div></td>
                                        <td>₹{med.buyingPrice}</td>
                                        <td><strong>₹{med.sellingPrice}</strong></td>
                                        <td>{med.vendor}</td>
                                        <td>{formatDate(med.expiryDate)}</td>
                                        <td>
                                            <button className="action-btn delete" onClick={() => handleDelete(med._id)}>🗑</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            ) : (
                <div className="inventory-table-wrapper">
                    {loading ? <div className="loader">Loading...</div> : filteredRequests.length === 0 ? (
                        <div className="loader">No purchase requests found.</div>
                    ) : (
                        <table className="inventory-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Item Requested</th>
                                    <th>Quantity</th>
                                    <th>Requested By</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRequests.map((req) => (
                                    <tr key={req._id}>
                                        <td>{formatDate(req.createdAt)}</td>
                                        <td className="med-name">{req.item}</td>
                                        <td><strong>{req.qty}</strong></td>
                                        <td>{req.requestedBy}</td>
                                        <td>
                                            <span className={`req-status-badge ${
                                                req.status.toLowerCase().includes('pending') ? 'req-status-pending' :
                                                req.status.toLowerCase().includes('ordered') ? 'req-status-ordered' :
                                                req.status.toLowerCase().includes('approved') ? 'req-status-approved' : 'req-status-rejected'
                                            }`}>
                                                {req.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

{/*lient/src/pages/pharmacy/PharmacyInventory.jsx//*/}
{/*// c*/}
           

            {showAddModal && (
                <div className="modal-overlay">
                    <div className="modal-content inventory-modal">
                        <div className="modal-header">
                            <div>
                                <h2>Add New Medication</h2>
                                <p className="modal-subtitle">Enter details to update your stock levels</p>
                            </div>
                            <button className="close-btn" onClick={() => { setShowAddModal(false); setExistingMatch(null); setSuggestions([]); setShowSuggestions(false); }}>×</button>
                        </div>

                        <form onSubmit={handleAddMedicine} className="pharma-form">
                            {/* Section 1: Basic Information */}
                            <div className="form-section">
                                <h3 className="section-title">General Information</h3>
                                {existingMatch && (
                                    <div style={{ padding: '12px 16px', background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', borderRadius: '12px', fontSize: '0.9rem', marginBottom: '16px', gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', boxSizing: 'border-box' }}>
                                        <strong>💡 Matches Existing Medicine: {existingMatch.name}</strong>
                                        <span>Current Stock: {existingMatch.stock} {existingMatch.unit}. Adding stock will increment this balance instead of creating a duplicate record. Other fields have been autofilled.</span>
                                    </div>
                                )}
                                <div className="form-row">
                                    <div className="form-group" style={{ position: 'relative' }}>
                                        <label>Medicine Name <span className="required">*</span></label>
                                        <input 
                                            required 
                                            type="text" 
                                            value={newMedicine.name} 
                                            onChange={handleNameChange} 
                                            onFocus={() => {
                                                if (newMedicine.name.trim() !== '') {
                                                    const filtered = medicines.filter(med => 
                                                        (med.name || '').toLowerCase().includes(newMedicine.name.toLowerCase())
                                                    );
                                                    setSuggestions(filtered);
                                                    setShowSuggestions(true);
                                                }
                                            }}
                                            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                            placeholder="e.g. Paracetamol 500mg" 
                                            autoComplete="off"
                                        />
                                        {showSuggestions && suggestions.length > 0 && (
                                            <div className="autocomplete-suggestions-card">
                                                {suggestions.map((med) => (
                                                    <div 
                                                        key={med._id} 
                                                        className="suggestion-item"
                                                        onClick={() => handleSelectSuggestion(med)}
                                                    >
                                                        <div className="suggestion-info">
                                                            <span className="suggestion-name">{med.name}</span>
                                                            <span className="suggestion-category">{med.category}</span>
                                                        </div>
                                                        <div className="suggestion-meta">
                                                            <span className="suggestion-stock">Stock: {med.stock} {med.unit}</span>
                                                            <span className="suggestion-price">₹{med.sellingPrice}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="form-group">
                                        <label>Category <span className="required">*</span></label>
                                        <input required type="text" value={newMedicine.category} onChange={(e) => setNewMedicine({ ...newMedicine, category: e.target.value })} placeholder="e.g. Analgesic" />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Vendor / Supplier</label>
                                        <input required type="text" value={newMedicine.vendor} onChange={(e) => setNewMedicine({ ...newMedicine, vendor: e.target.value })} placeholder="e.g. Acme Pharma Ltd." />
                                    </div>
                                    <div className="form-group">
                                        <label>Batch Number</label>
                                        <input required type="text" value={newMedicine.batchNumber} onChange={(e) => setNewMedicine({ ...newMedicine, batchNumber: e.target.value })} placeholder="e.g. BT-9921" />
                                    </div>
                                </div>
                            </div>

                            {/* Section 2: Stock & Pricing */}
                            <div className="form-section">
                                <h3 className="section-title">Inventory & Pricing</h3>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Quantity</label>
                                        <input required type="number" value={newMedicine.stock} onChange={(e) => setNewMedicine({ ...newMedicine, stock: e.target.value })} placeholder="0" />
                                    </div>
                                    <div className="form-group">
                                        <label>Unit</label>
                                        <select value={newMedicine.unit} onChange={(e) => setNewMedicine({ ...newMedicine, unit: e.target.value })}>
                                            <option value="Tablets">Tablets</option>
                                            <option value="Capsules">Capsules</option>
                                            <option value="Bottles">Bottles</option>
                                            <option value="Strips">Strips</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Buying Price (₹)</label>
                                        <div className="input-with-icon">
                                            <input required type="number" value={newMedicine.buyingPrice} onChange={(e) => setNewMedicine({ ...newMedicine, buyingPrice: e.target.value })} placeholder="0.00" />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>Selling Price (₹)</label>
                                        <div className="input-with-icon">
                                            <input required type="number" value={newMedicine.sellingPrice} onChange={(e) => setNewMedicine({ ...newMedicine, sellingPrice: e.target.value })} placeholder="0.00" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section 3: Dates */}
                            <div className="form-section">
                                <h3 className="section-title">Tracking Dates</h3>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Purchase Date</label>
                                        <input required type="date" max={today} value={newMedicine.purchaseDate} onChange={(e) => { const val = e.target.value; setNewMedicine({ ...newMedicine, purchaseDate: val > today ? today : val }); }} />
                                    </div>
                                    <div className="form-group">
                                        <label>Expiry Date</label>
                                        <input required type="date" value={newMedicine.expiryDate} onChange={(e) => setNewMedicine({ ...newMedicine, expiryDate: e.target.value })} />
                                    </div>
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => { setShowAddModal(false); setSuggestions([]); setShowSuggestions(false); }}>Discard</button>
                                <button type="submit" className="btn-save">Save to Inventory</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showRequestModal && (
                <div className="modal-overlay">
                    <div className="modal-content inventory-modal">
                        <div className="modal-header">
                            <div>
                                <h2>Raise Purchase Request</h2>
                                <p className="modal-subtitle">Submit a request for low-stock or out-of-stock items</p>
                            </div>
                            <button className="close-btn" onClick={() => setShowRequestModal(false)}>×</button>
                        </div>

                        <form onSubmit={handleRequestSubmit} className="pharma-form">
                            <div className="form-section">
                                <h3 className="section-title">Request Information</h3>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Medicine Name <span className="required">*</span></label>
                                        <input
                                            required
                                            type="text"
                                            value={requestFormData.item}
                                            onChange={(e) => setRequestFormData({ ...requestFormData, item: e.target.value })}
                                            placeholder="e.g. Paracetamol 650mg"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Quantity <span className="required">*</span></label>
                                        <input
                                            required
                                            type="number"
                                            value={requestFormData.qty}
                                            onChange={(e) => setRequestFormData({ ...requestFormData, qty: e.target.value })}
                                            placeholder="e.g. 1000"
                                            min="1"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setShowRequestModal(false)}>Discard</button>
                                <button type="submit" className="btn-save">Submit Request</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PharmacyInventory;