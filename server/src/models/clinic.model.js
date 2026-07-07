const mongoose = require('mongoose');

// We reuse the exact same schema structure as Hospital so that all fields are perfectly aligned
const brandingSchema = new mongoose.Schema({
    appName:    { type: String, default: '' },
    tagline:    { type: String, default: '' },
    logoUrl:    { type: String, default: '' },
    faviconUrl: { type: String, default: '' },
    primaryColor:    { type: String, default: '#14b8a6' },
    secondaryColor:  { type: String, default: '#0a2647' },
    accentColor:     { type: String, default: '#6366f1' },
    successColor:    { type: String, default: '#10b981' },
    backgroundColor: { type: String, default: '#f8fafc' },
    textColor:       { type: String, default: '#1e293b' },
    supportEmail:  { type: String, default: '' },
    supportPhone:  { type: String, default: '' },
    address:       { type: String, default: '' },
    websiteUrl:    { type: String, default: '' },
    instagramUrl:  { type: String, default: '' },
    facebookUrl:   { type: String, default: '' },
    twitterUrl:    { type: String, default: '' },
    footerText:    { type: String, default: '' },
}, { _id: false });

const clinicSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    customDomain: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    originalSubdomain: { type: String },
    tenantKey: { type: String, unique: true, sparse: true },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    website: { type: String, default: '' },
    logo: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    departments: [{ type: String }],
    departmentFees: { type: Map, of: Number, default: {} },
    appointmentFee: { type: Number, default: 500 },
    facilities: [{
        name: { type: String, required: true },
        pricePerDay: { type: Number, required: true, min: 0 },
        bedCount: { type: Number, default: 0 }
    }],
    branding: { type: brandingSchema, default: () => ({}) },
    appointmentMode: { type: String, enum: ['slot', 'token'], default: 'slot' },
    adminUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    clinicType: { type: String, enum: ['hospital', 'clinic'], default: 'clinic' },
    clinicCode: { type: String, uppercase: true, trim: true, default: '' },
    defaultFee: { type: Number, default: 0, min: 0 },
    defaultServiceName: { type: String, default: 'General Consultation', trim: true },
    tier: {
        maxDoctors:       { type: Number, default: 1 },
        maxReceptionists: { type: Number, default: 1 },
    },
    subscription: {
        ratePerPatient:  { type: Number, default: 0 },
        billingEnabled:  { type: Boolean, default: false },
    },
    clinicApiKey: { type: String, default: null },
    localServer: {
        isOnline:      { type: Boolean, default: false },
        lastSeenAt:    { type: Date, default: null },
        serverVersion: { type: String, default: '' },
    },
    revenueModel: {
        type: String,
        enum: ['per_patient', 'fixed_monthly', 'per_login'],
        default: 'per_patient',
    },
    revenueConfig: {
        monthlyFee:    { type: Number, default: 0 },
        ratePerLogin:  { type: Number, default: 0 },
        billingCycle:  { type: String, enum: ['monthly', 'quarterly', 'annual'], default: 'monthly' },
    },
}, { timestamps: true });

clinicSchema.pre('save', function (next) {
    if (!this.originalSubdomain && this.slug) {
        this.originalSubdomain = this.slug;
    }
    if (!this.tenantKey && this.originalSubdomain) {
        this.tenantKey = `${this.originalSubdomain}-${this._id.toString()}`;
    }
    next();
});

module.exports = mongoose.model('Clinic', clinicSchema, 'clinics');
