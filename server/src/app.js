const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const { recordApiMetric, getPrometheusMetrics } = require('./utils/telemetry');

const { generalLimiter } = require('./middleware/rateLimiter');

// Import Routes
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const doctorRoutes = require('./routes/doctor.routes');
const appointmentRoutes = require('./routes/appointment.routes');
const publicRoutes = require('./routes/public.routes');
const adminEntitiesRoutes = require('./routes/admin-entities.routes');
const labRoutes = require('./routes/lab.routes');
const uploadRoutes = require('./routes/upload.routes');
const pharmacyRoutes = require('./routes/pharmacy.routes');
const pharmacyOrdersRoutes = require('./routes/pharmacyOrders.routes');
const receptionRoutes = require('./routes/reception.routes');
const administratorRoutes = require('./routes/administrator.routes');

// --- NEW IMPORTS FOR CLINICAL WORKFLOW ---
const patientRoutes = require('./routes/patient.routes');
const clinicalRoutes = require('./routes/clinical.routes');
const notificationRoutes = require('./routes/notification.routes');
const labTestRoutes = require('./routes/labTest.routes');
const medicineRoutes = require('./routes/medicine.routes');
const questionLibraryRoutes = require('./routes/questionLibrary.routes');
const testPackageRoutes = require('./routes/testPackage.routes');
const hospitalRoutes = require('./routes/hospital.routes');
const financeRoutes = require('./routes/finance.routes');
const billingRoutes = require('./routes/billing.routes');
const admissionRoutes = require('./routes/admission.routes');
const simpleClinicRoutes = require('./routes/simpleClinic.routes');
const clinicRoutes = require('./routes/clinic.routes');
const syncRoutes        = require('./routes/sync.routes');
const patientAppRoutes  = require('./routes/patientApp.routes');
const patientLocalRoutes = require('./routes/patientLocal.routes');
const revenueRoutes     = require('./routes/revenue.routes');
const mfaRoutes         = require('./routes/mfa.routes');
const documentTemplateRoutes = require('./routes/documentTemplate.routes');
const sessionsRoutes    = require('./routes/sessions.routes');

const app = express();

// Disable Express fingerprinting header
app.disable('x-powered-by');

// Observability Middleware: Request IDs & Structured Metrics
app.use((req, res, next) => {
    const reqId = req.headers['x-request-id'] || uuidv4();
    req.id = reqId;
    res.setHeader('x-request-id', reqId);

    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        if (!req.path.startsWith('/uploads') && req.path !== '/metrics' && req.path !== '/health') {
            recordApiMetric(req.method, req.path, duration, res.statusCode);
        }
    });

    next();
});

// Structured JSON Logging Middleware (Production only)
app.use((req, res, next) => {
    if (process.env.NODE_ENV === 'production') {
        const start = Date.now();
        res.on('finish', () => {
            const logObj = {
                timestamp: new Date().toISOString(),
                requestId: req.id,
                method: req.method,
                path: req.originalUrl || req.path,
                status: res.statusCode,
                ip: req.ip || 'unknown',
                userAgent: req.headers['user-agent'] || 'unknown',
                latencyMs: Date.now() - start,
                responseSize: res.getHeader('content-length') || 0
            };
            console.log(JSON.stringify(logObj));
        });
    }
    next();
});

// API v1 Routing Alias Rewrite Middleware
app.use((req, res, next) => {
    if (req.url.startsWith('/api/v1/')) {
        req.url = req.url.replace('/api/v1/', '/api/');
    }
    next();
});

// ── Guard against ERR_HTTP_HEADERS_SENT double-response crashes ──────────────
app.use((req, res, next) => {
    const originalJson = res.json;
    const originalSend = res.send;
    const originalStatus = res.status;

    res.status = function (code) {
        if (res.headersSent) return res;
        return originalStatus.call(this, code);
    };

    res.json = function (body) {
        if (res.headersSent) return res;
        return originalJson.call(this, body);
    };

    res.send = function (body) {
        if (res.headersSent) return res;
        return originalSend.call(this, body);
    };

    next();
});

// ── Slowloris DoS protection — Request and Response Timeout ─────────────────
app.use((req, res, next) => {
    req.setTimeout(30000, () => {
        const err = new Error('Request Timeout');
        err.status = 408;
        next(err);
    });
    res.setTimeout(30000, () => {
        const err = new Error('Service Timeout');
        err.status = 503;
        next(err);
    });
    next();
});

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'", "*"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https://ik.imagekit.io', "*"],
            connectSrc: ["'self'", "*"],
            fontSrc: ["'self'", "*"],
            objectSrc: ["*"],
            frameSrc: ["*"],
            frameAncestors: ["*"],
        },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'no-referrer' },
    frameguard: false, // Allow iframing patient PDF reports
}));

// Apply Permissions-Policy header
app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
    next();
});

// ── Body parsing (with size limits) ──────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// ── CORS ──────────────────────────────────────────────────────────────────────
const LOCALHOST_RE = /^https?:\/\/([a-z0-9-]+\.)?(localhost|127\.0\.0\.1)(:\d+)?$/i;
const isAllowedOrigin = (origin) => {
    if (!origin) return true;
    if (LOCALHOST_RE.test(origin)) return true;
    
    if (process.env.CORS_ORIGIN) {
        const envOrigins = process.env.CORS_ORIGIN.split(',').map(o => o.trim().toLowerCase());
        if (envOrigins.includes(origin.toLowerCase())) return true;
    }
    
    if (origin === 'https://medicalhms.in') return true;
    if (origin === 'https://www.medicalhms.in') return true;
    if (origin.endsWith('.medicalhms.in')) return true;
    if (origin === 'https://boonkies.com') return true;
    if (origin === 'https://www.boonkies.com') return true;
    if (origin.endsWith('.boonkies.com')) return true;
    return false;
};

const HospitalModelForCors = require('./models/hospital.model');

app.use(cors({
    origin: async (origin, callback) => {
        if (isAllowedOrigin(origin)) return callback(null, true);

        try {
            // Support for white-labeled custom domains
            const domainOnly = origin.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
            const domainName = domainOnly.startsWith('www.') ? domainOnly.slice(4) : domainOnly;
            const hospital = await HospitalModelForCors.findOne({
                customDomain: { $in: [domainName, `www.${domainName}`] }
            }).select('_id').lean();
            if (hospital) {
                return callback(null, true);
            }
        } catch (err) {
            console.error('CORS DB Check Error:', err);
        }

        // Return false to block origin cleanly without causing a server 500 error
        callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'X-Requested-With'],
    credentials: true,
}));

// ── Prototype Pollution Protection ───────────────────────────────────────────
app.use((req, res, next) => {
    let detected = false;
    const sanitize = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                    detected = true;
                    delete obj[key];
                } else if (typeof obj[key] === 'object') {
                    sanitize(obj[key]);
                }
            }
        }
    };
    sanitize(req.body);
    sanitize(req.query);
    sanitize(req.params);
    if (detected) {
        const { logSecurityEvent } = require('./utils/securityLogger');
        logSecurityEvent('PROTOTYPE_POLLUTION_ATTEMPT', { details: 'Dangerous prototype key stripped from payload' }, req);
    }
    next();
});

// ── NoSQL injection protection — strip $ and . from req.body/params/query ────
app.use(mongoSanitize());

// ── HTTP parameter pollution protection ──────────────────────────────────────
app.use(hpp());

// ── Cookie parsing (for httpOnly refresh token) ──────────────────────────────
app.use(cookieParser());

// ── Global rate limit (200 req / 15 min per IP) ───────────────────────────────
app.use('/api/', generalLimiter);

// ── Logging (skip in test) ────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
    app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ── Static uploads ────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        console.log('[DEBUG API REQ]', {
            path: req.path,
            method: req.method,
            origin: req.headers.origin,
            referer: req.headers.referer,
            cookies: req.cookies ? Object.keys(req.cookies) : null,
            hasAccessToken: !!req.cookies?.accessToken,
            hasRefreshToken: !!req.cookies?.refreshToken
        });
    }
    next();
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/admin-entities', adminEntitiesRoutes);
app.use('/api/lab', labRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/pharmacy', pharmacyRoutes);
app.use('/api/pharmacy/orders', pharmacyOrdersRoutes);
app.use('/api/reception', receptionRoutes);
app.use('/api/administrator', administratorRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/clinical', clinicalRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/lab-tests', labTestRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/question-library', questionLibraryRoutes);
app.use('/api/test-packages', testPackageRoutes);
app.use('/api/hospitals', hospitalRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/admissions', admissionRoutes);
app.use('/api/simple-clinics', simpleClinicRoutes);
app.use('/api/document-templates', documentTemplateRoutes);
app.use('/api/clinic', clinicRoutes);
app.use('/api/revenue', revenueRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/patient-app', patientAppRoutes);
app.use('/api/patient-local', patientLocalRoutes);
app.use('/api/mfa', mfaRoutes);
app.use('/api/sessions', sessionsRoutes);

// ── Health Check Endpoint ───────────────────────────────────────────────────
app.get('/health', async (req, res) => {
    try {
        const mongoose = require('mongoose');
        const dbState = mongoose.connection.readyState;
        const dbStatus = dbState === 1 ? 'CONNECTED' : dbState === 2 ? 'CONNECTING' : 'DISCONNECTED';
        
        let activeTenants = 0;
        try {
            const { getActiveConnections } = require('./db/tenantDb');
            if (getActiveConnections) {
                const conns = getActiveConnections();
                activeTenants = conns ? conns.length : 0;
            }
        } catch (_) {}

        res.json({
            status: 'UP',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'production',
            uptime: process.uptime(),
            database: {
                status: dbStatus,
                readyState: dbState
            },
            tenantPool: {
                activeConnectionsCount: activeTenants
            },
            system: {
                memoryUsage: process.memoryUsage(),
                cpuUsage: process.cpuUsage(),
                platform: process.platform,
                nodeVersion: process.version
            }
        });
    } catch (err) {
        res.status(500).json({ status: 'DOWN', error: err.message });
    }
});

// Prometheus Metrics Endpoint
app.get('/metrics', (req, res) => {
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(getPrometheusMetrics());
});

app.get('/', (req, res) => {
    res.send('API is running...');
});

// ── Global error handler — never leak internal error details to client ────────
app.use((err, req, res, next) => {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} —`, err.stack || err.message);
    try {
        const fs = require('fs');
        const path = require('path');
        fs.appendFileSync(path.join(__dirname, '../../error.log'), `[${new Date().toISOString()}] ${req.method} ${req.originalUrl}\n${err.stack || err.message}\n\n`);
    } catch (_) {}
    const status = err.status || err.statusCode || 500;
    
    let clientMessage = err.message || 'Request failed';
    if (status === 500) {
        clientMessage = 'An unexpected error occurred. Please try again.';
    } else {
        const dbKeywords = ['mongodb', 'mongoose', 'mongo', 'find', 'connect', 'connection', 'schema', 'collection', 'database', 'replica', 'cluster'];
        const isDbError = dbKeywords.some(kw => clientMessage.toLowerCase().includes(kw));
        if (isDbError) {
            clientMessage = 'A database error occurred. Please contact support.';
        }
    }

    res.status(status).json({
        success: false,
        message: clientMessage,
    });
});

module.exports = app;
