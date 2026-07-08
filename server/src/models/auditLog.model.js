const mongoose = require('mongoose');

/**
 * AuditLog — every sensitive action on patient data is recorded here.
 * Works on both cloud and local deployments.
 *
 * COMPLIANCE: DPDP Act (India) + CERT-IN + Healthcare Audit Trail Standards.
 * IMMUTABLE: Records may only be appended, never updated or deleted.
 * RETENTION: 365-day TTL enforced via `expireAt` field.
 */
const auditLogSchema = new mongoose.Schema({
    // ── Tenant Isolation ─────────────────────────────────────────────────────
    clinicId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },

    // ── Actor (who performed the action) ─────────────────────────────────────
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    userName:   { type: String, default: 'System' },
    userEmail:  { type: String, default: '' },
    role:       { type: String, default: '' },

    // ── Session Context (CERT-IN) ─────────────────────────────────────────────
    sessionId:      { type: String, default: '' },    // JWT jti — correlates all actions in one session
    correlationId:  { type: String, default: '' },    // Trace one user operation that spans multiple requests
    requestMethod:  { type: String, default: '' },    // GET, POST, PUT, PATCH, DELETE
    requestPath:    { type: String, default: '' },    // Full URI path e.g. /api/patients/123/full-history

    // ── What Happened ─────────────────────────────────────────────────────────
    action: {
        type: String,
        required: true,
        enum: [
            // ── Authentication (CERT-IN required) ─────────────────────────────
            'STAFF_LOGIN', 'STAFF_LOGOUT', 'PATIENT_LOGIN',
            'FAILED_ACCESS', 'PASSWORD_RESET', 'FAILED_LOGIN', 'ACCESS_DENIED',

            // ── Patient Data (DPDP Act + Healthcare) ──────────────────────────
            'VIEW_PATIENT', 'CREATE_PATIENT', 'UPDATE_PATIENT', 'DELETE_PATIENT',
            'PATIENT_ACCESS',

            // ── Clinical / Prescription (Healthcare) ──────────────────────────
            'VIEW_PRESCRIPTION', 'CREATE_PRESCRIPTION', 'UPDATE_PRESCRIPTION',

            // ── Appointments ──────────────────────────────────────────────────
            'VIEW_APPOINTMENT', 'CREATE_APPOINTMENT', 'UPDATE_APPOINTMENT',
            'CANCEL_APPOINTMENT', 'COMPLETE_APPOINTMENT',

            // ── Billing / Financial ───────────────────────────────────────────
            'VIEW_BILL', 'CREATE_BILL', 'UPDATE_BILL', 'CONFIRM_PAYMENT',

            // ── Staff / RBAC Management (DPDP + CERT-IN) ─────────────────────
            'USER_CREATE', 'USER_UPDATE', 'USER_DELETE',
            'ROLE_CHANGE', 'PERMISSION_CHANGE',

            // ── Hospital / Settings ───────────────────────────────────────────
            'HOSPITAL_UPDATE', 'SETTINGS_UPDATE',

            // ── Data Operations (DPDP required) ───────────────────────────────
            'DATA_EXPORT', 'EXPORT_DATA', 'SYNC_PUSH', 'BACKUP_CREATED',
            'DATA_ERASURE_REQUEST', 'DATA_ERASED',

            // ── Generic CRUD (for catch-all use) ─────────────────────────────
            'VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT',

            // ── Legacy aliases (kept for backward compatibility) ──────────────
            'LOGIN', 'LOGOUT',

            // ── Admissions Oversight (Oversight Module) ──────────────────────
            'ADMISSIONS_DASHBOARD_VIEW', 'ADMISSION_ANALYTICS_VIEW',
            'OCCUPANCY_REPORT_VIEW', 'TRANSFER_REPORT_VIEW',

            // ── Enterprise Extended Audit Logs ───────────────────────────────
            'SESSION_TIMEOUT', 'SESSION_EXPIRED', 'PASSWORD_CHANGED', 'PASSWORD_RESET_REQUEST',
            'MFA_SUCCESS', 'MFA_FAILURE', 'ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED',
            'TOKEN_REFRESH', 'TOKEN_REVOKED', 'DIAGNOSIS_ADDED', 'PRESCRIPTION_GENERATED',
            'PRESCRIPTION_PRINTED', 'LAB_REPORT_VIEWED', 'LAB_REPORT_DOWNLOADED',
            'ADMISSION_CREATED', 'DISCHARGE_COMPLETED', 'BED_CHANGED',
            'INVOICE_CREATED', 'INVOICE_UPDATED', 'INVOICE_DELETED',
            'PAYMENT_COLLECTED', 'PAYMENT_CANCELLED', 'REFUND_REQUESTED',
            'REFUND_APPROVED', 'REFUND_REJECTED', 'INSURANCE_CLAIM_CREATED',
            'INSURANCE_APPROVED', 'INSURANCE_REJECTED', 'EXPENSE_ADDED',
            'EXPENSE_UPDATED', 'EXPENSE_DELETED', 'SALARY_PROCESSED', 'PAYROLL_APPROVED',
            'ROLE_CREATED', 'ROLE_UPDATED', 'ROLE_DELETED', 'PERMISSION_GRANTED',
            'PERMISSION_REMOVED', 'USER_ASSIGNED_ROLE', 'USER_REMOVED_ROLE',
            'CONFIG_CHANGE', 'DEPARTMENT_CHANGE', 'DOCTOR_CHANGE', 'SERVICE_CHANGE',
            'MEDICINE_ADDED', 'MEDICINE_UPDATED', 'MEDICINE_DELETED', 'PURCHASE_ORDER',
            'SUPPLIER_UPDATED', 'STOCK_ADJUSTED', 'STOCK_REDUCED', 'EXPIRED_STOCK_REMOVED',
            'REPORT_PRINTED', 'REPORT_DOWNLOADED', 'CSV_EXPORT', 'EXCEL_EXPORT', 'PDF_EXPORT',
            'UNAUTHORIZED_ACCESS', 'CROSS_TENANT_BLOCK', 'RATE_LIMIT_EXCEEDED',
            'JWT_FAILURE', 'SUSPICIOUS_UPLOAD', 'SQLI_ATTEMPT', 'XSS_ATTEMPT', 'BRUTE_FORCE',

            // ── Enterprise Session Management ────────────────────────────────
            'SESSION_EXTENDED', 'SESSION_WARNING', 'AUTO_LOGOUT_IDLE',
            'FORCED_LOGOUT', 'LOGOUT_ALL_DEVICES', 'SESSION_TERMINATED_BY_ADMIN',
            'LOGIN_SUCCESS', 'LOGIN_FAILED'
        ],
    },

    // ── Severity (CERT-IN SIEM integration) ──────────────────────────────────
    severity: {
        type: String,
        enum: ['info', 'warning', 'high', 'critical'],
        default: 'info',
    },

    // ── Data Classification (DPDP Act) ───────────────────────────────────────
    dataCategory: {
        type: String,
        enum: ['PHI', 'PII', 'Financial', 'Administrative', 'System', ''],
        default: '',
    },

    // ── Target (what was acted upon) ─────────────────────────────────────────
    targetModel: { type: String, default: '' },          // 'User', 'Appointment', 'Invoice', etc.
    targetId:    { type: mongoose.Schema.Types.ObjectId, default: null },
    targetLabel: { type: String, default: '' },          // Human-readable e.g. patient name

    // ── Before/After Diff (DPDP compliance) ──────────────────────────────────
    changes: {
        before: { type: mongoose.Schema.Types.Mixed, default: null },
        after:  { type: mongoose.Schema.Types.Mixed, default: null },
    },

    // ── Request Context ───────────────────────────────────────────────────────
    ip:        { type: String, default: '' },
    userAgent: { type: String, default: '' },
    browser:   { type: String, default: 'Unknown' },
    os:        { type: String, default: 'Unknown' },
    device:    { type: String, default: 'Desktop' },

    // ── Outcome ───────────────────────────────────────────────────────────────
    success:   { type: Boolean, default: true },
    reason:    { type: String, default: '' },    // If success=false, explain why

    // Cryptographic integrity chain
    hash: { type: String, default: '' },
    previousHash: { type: String, default: '' },

    expireAt: {
        type: Date,
        default: () => {
            const d = new Date();
            d.setDate(d.getDate() + 365);
            return d;
        }
    },

}, { timestamps: true });

// ── Immutability: block all update/delete operations on AuditLog ──────────────
// Any attempt to call .save() on an existing document, findByIdAndUpdate(),
// updateOne(), findByIdAndDelete(), deleteOne(), etc. will throw.
auditLogSchema.pre('save', async function (next) {
    if (!this.isNew) {
        return next(new Error('AuditLog records are immutable and cannot be modified.'));
    }
    
    // Compute cryptographic block hash
    try {
        const lastLog = await this.constructor.findOne({}).sort({ createdAt: -1 }).lean();
        this.previousHash = lastLog ? (lastLog.hash || '') : 'GENESIS_HASH';
        
        const { calculateBlockHash } = require('../utils/auditVerifier');
        this.hash = calculateBlockHash(this);
    } catch (err) {
        console.error('Failed to link audit log block:', err.message);
    }

    // Auto-set expiration date: 365 days from creation
    if (!this.expireAt) {
        const d = new Date();
        d.setDate(d.getDate() + 365);
        this.expireAt = d;
    }
    next();
});

auditLogSchema.pre(['updateOne', 'findOneAndUpdate', 'updateMany', 'findByIdAndUpdate'], function (next) {
    next(new Error('AuditLog records are immutable — updates are not permitted.'));
});

auditLogSchema.pre(['deleteOne', 'findOneAndDelete', 'deleteMany', 'findByIdAndDelete'], function (next) {
    next(new Error('AuditLog records are immutable — deletion is not permitted.'));
});

// ── Indexes ────────────────────────────────────────────────────────────────────
auditLogSchema.index({ clinicId: 1, createdAt: -1 });      // Primary: hospital log queries
auditLogSchema.index({ userId: 1, createdAt: -1 });        // Per-user audit trail
auditLogSchema.index({ action: 1, createdAt: -1 });        // Action-type filtering
auditLogSchema.index({ clinicId: 1, action: 1, createdAt: -1 }); // Compound: hospital+action+time
auditLogSchema.index({ clinicId: 1, success: 1, createdAt: -1 }); // Compound: failed access queries
auditLogSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 }); // TTL: auto-delete after expireAt

module.exports = mongoose.model('AuditLog', auditLogSchema);
