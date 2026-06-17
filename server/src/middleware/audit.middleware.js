const AuditLog = require('../models/auditLog.model');

/**
 * auditLog(action, getTargetFn?, options?)
 *
 * Middleware factory. Writes one AuditLog entry after the route handler
 * responds. Never blocks the response — fires asynchronously via setImmediate.
 *
 * Usage:
 *   router.post('/create', verifyToken, auditLog('CREATE_APPOINTMENT'), handler);
 *
 *   // With target resolution:
 *   router.get('/:id', verifyToken, auditLog('VIEW_PATIENT', (req) => ({
 *       model: 'User',
 *       id: req.params.id,
 *       label: 'Patient record',
 *   })), handler);
 *
 *   // With options:
 *   router.delete('/:id', verifyToken, auditLog('USER_DELETE', null, {
 *       severity: 'critical',
 *       dataCategory: 'Administrative',
 *   }), handler);
 *
 * @param {string} action        - Must be a valid AuditLog action enum value
 * @param {Function} [getTargetFn] - Optional (req, res) => { model, id, label, changes }
 * @param {Object} [options]     - Optional { severity, dataCategory }
 */
const auditLog = (action, getTargetFn, options = {}) => {
    return (req, res, next) => {
        const originalJson = res.json.bind(res);

        res.json = function (body) {
            const result = originalJson(body);

            // Fire-and-forget — never delay the response
            setImmediate(async () => {
                try {
                    const user = req.user;
                    const hospitalId = user?.hospitalId || req.hospitalId;
                    if (!hospitalId) return;  // Skip: patients/public routes without hospital context

                    const target = getTargetFn ? getTargetFn(req, body) : {};

                    // Extract JWT jti from Authorization header for session tracking
                    let sessionId = '';
                    try {
                        const authHeader = req.headers.authorization || '';
                        if (authHeader.startsWith('Bearer ')) {
                            const token = authHeader.split(' ')[1];
                            const decoded = require('jsonwebtoken').decode(token);
                            sessionId = decoded?.jti || '';
                        }
                    } catch (_) {}

                    // Determine severity
                    const statusCode = res.statusCode;
                    let severity = options.severity || 'info';
                    if (statusCode >= 400 && !options.severity) {
                        severity = statusCode >= 500 ? 'critical' : 'warning';
                    }

                    await AuditLog.create({
                        clinicId:      hospitalId,
                        userId:        user?._id || null,
                        userName:      user?.name || user?.email || 'Unknown',
                        userEmail:     user?.email || '',
                        role:          user?._roleData?.name || String(user?.role || ''),
                        sessionId,
                        requestMethod: req.method || '',
                        requestPath:   req.originalUrl || req.path || '',
                        action,
                        severity,
                        dataCategory:  options.dataCategory || '',
                        targetModel:   target.model || '',
                        targetId:      target.id   || null,
                        targetLabel:   target.label || '',
                        changes: {
                            before: target.before || null,
                            after:  target.after  || null,
                        },
                        ip:            req.ip || req.connection?.remoteAddress || '',
                        userAgent:     req.headers['user-agent'] || '',
                        success:       statusCode < 400,
                        reason:        statusCode >= 400 ? (body?.message || `HTTP ${statusCode}`) : '',
                    });
                } catch {
                    // Audit failure must never crash the app
                }
            });

            return result;
        };

        next();
    };
};

module.exports = auditLog;
