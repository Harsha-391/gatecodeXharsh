// server/server.js - restarted
require('dotenv').config();
const dns = require('dns');

// Force Google's public DNS (8.8.8.8) for SRV record resolution.
// ISP routers commonly block or refuse SRV-type DNS queries required by mongodb+srv:// URIs.
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const app = require('./src/app');
const connectDB = require('./src/db/db'); // <--- Import the DB connection logic

const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const DEPLOYMENT_MODE = process.env.DEPLOYMENT_MODE || 'cloud';

// 1. Connect to Database
connectDB();

// 2. HTTP Server and Socket.io
const server = http.createServer(app);
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

const io = new Server(server, {
    cors: {
        origin: async (origin, callback) => {
            if (isAllowedOrigin(origin)) return callback(null, true);
            try {
                const Hospital = require('./src/models/hospital.model');
                const domainOnly = origin.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
                const domainName = domainOnly.startsWith('www.') ? domainOnly.slice(4) : domainOnly;
                const hospital = await Hospital.findOne({
                    customDomain: { $in: [domainName, `www.${domainName}`] }
                }).select('_id').lean();
                if (hospital) {
                    return callback(null, true);
                }
            } catch (err) {
                console.error('Socket CORS DB Check Error:', err);
            }
            callback(null, false);
        },
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Authorization", "Content-Type", "Accept", "X-Requested-With"],
        credentials: true
    },
    perMessageDeflate: false
});

app.set('io', io);

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Role = require('./src/models/role.model');
const { JWT_SECRET } = require('./src/config/jwt');

// Enforce JWT Handshake Authentication
io.use(async (socket, next) => {
    try {
        let token = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
        if (token && token.startsWith('Bearer ')) {
            token = token.split(' ')[1];
        }
        if (!token) {
            token = socket.handshake.query?.token;
        }

        if (!token) {
            return next(new Error('Authentication error: No token provided'));
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        socket.user = decoded;

        // Resolve role name
        if (decoded.roleId && mongoose.Types.ObjectId.isValid(decoded.roleId)) {
            const role = await Role.findById(decoded.roleId).select('name').lean();
            if (role) {
                socket.user.roleName = role.name;
            }
        } else if (decoded.roleId) {
            socket.user.roleName = decoded.roleId;
        }

        next();
    } catch (err) {
        return next(new Error('Authentication error: Invalid token'));
    }
});

io.on('connection', (socket) => {
    console.log('New authenticated client connected', socket.id, socket.user?.email);

    // Enforce Tenant & Role Scoping on Room Joining
    socket.on('join', (room) => {
        if (!socket.user) {
            console.warn(`Socket ${socket.id} attempted to join without user payload`);
            return socket.emit('error_message', { message: 'Authentication required' });
        }

        const uId = socket.user.userId || socket.user.patientId;
        const hId = socket.user.hospitalId || socket.user.clinicId;
        const userRole = String(socket.user.roleName || socket.user.roleId || socket.user.sub || '').toLowerCase();
        
        let authorized = false;

        // 1. Own personal user room
        if (room === uId) {
            authorized = true;
        }
        // 2. Platform / Central Admin override
        else if (['centraladmin', 'superadmin'].includes(userRole)) {
            authorized = true;
        }
        // 3. Hospital scope room (hospital_hospitalId)
        else if (room === `hospital_${hId}`) {
            authorized = true;
        }
        // 4. Role room (reception, pharmacist, lab, patient)
        else if (['reception', 'receptionist', 'receptiondeskmanager', 'pharmacy', 'pharmacist', 'lab', 'laboratory', 'labtechnician', 'doctor', 'patient'].includes(room)) {
            const matchReception = ['reception', 'receptionist', 'receptiondeskmanager'].includes(room) &&
                ['reception', 'receptionist', 'receptiondeskmanager'].includes(userRole);
            const matchPharmacy = ['pharmacy', 'pharmacist'].includes(room) &&
                ['pharmacy', 'pharmacist'].includes(userRole);
            const matchLab = ['lab', 'laboratory', 'labtechnician'].includes(room) &&
                ['lab', 'laboratory', 'labtechnician'].includes(userRole);
            const matchDocOrPatient = (room === 'doctor' && userRole.includes('doctor')) || (room === 'patient' && userRole === 'patient');

            if (matchReception || matchPharmacy || matchLab || matchDocOrPatient) {
                authorized = true;
            }
        }
        // 5. Tenant-scoped Role room (hospital_hospitalId_role)
        else if (room.startsWith(`hospital_${hId}_`)) {
            const requestedRole = room.replace(`hospital_${hId}_`, '').toLowerCase();
            const matchReception = ['reception', 'receptionist', 'receptiondeskmanager'].includes(requestedRole) &&
                ['reception', 'receptionist', 'receptiondeskmanager'].includes(userRole);
            const matchPharmacy = ['pharmacy', 'pharmacist'].includes(requestedRole) &&
                ['pharmacy', 'pharmacist'].includes(userRole);
            const matchLab = ['lab', 'laboratory', 'labtechnician'].includes(requestedRole) &&
                ['lab', 'laboratory', 'labtechnician'].includes(userRole);
            const matchDocOrPatient = (requestedRole === 'doctor' && userRole.includes('doctor')) || (requestedRole === 'patient' && userRole === 'patient');

            if (matchReception || matchPharmacy || matchLab || matchDocOrPatient) {
                authorized = true;
            }
        }

        if (authorized) {
            socket.join(room);
            console.log(`Socket ${socket.id} authorized and joined room ${room}`);
        } else {
            console.warn(`Unauthorized room join attempt to "${room}" by ${socket.user.email} (${userRole})`);
            socket.emit('error_message', { message: 'Unauthorized room access' });
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected', socket.id);
    });
});

// 3. Attach tunnel relay (cloud only — accepts WebSocket connections from local servers)
if (DEPLOYMENT_MODE !== 'local') {
    const tunnelServer = require('./src/utils/tunnelServer');
    tunnelServer.attach(server);
}

// 4. Start Server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT} [mode: ${DEPLOYMENT_MODE}]`);

    // 5. Post-startup services (after DB is ready — give it 3s)
    setTimeout(() => {
        if (DEPLOYMENT_MODE === 'local') {
            // Start sync service — pushes stats to cloud every 15 min
            const syncService = require('./src/utils/syncService');
            syncService.start();

            // Start tunnel client — maintains WebSocket to cloud for patient app
            const tunnelClient = require('./src/utils/tunnelClient');
            tunnelClient.setApp(app);
            tunnelClient.connect();
        }

        // Start nightly no-show auto-expiry job (runs at 23:30 every day, all modes)
        const { scheduleNoShowJob } = require('./src/jobs/noShowAutoExpiry.job');
        scheduleNoShowJob();
    }, 3000);
});
// Trigger Restart 7
