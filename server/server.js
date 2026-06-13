// server/server.js - restarted
require('dotenv').config();
const dns = require('dns');

// Configure standard DNS resolvers to prevent ECONNREFUSED issues with Node's c-ares on Windows
try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
    console.log('🌐 Configured custom DNS resolvers (8.8.8.8, 1.1.1.1) for SRV records.');
} catch (e) {
    console.warn('⚠️ Failed to configure DNS resolvers:', e.message);
}

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
const isAllowedOrigin = (origin) => {
    if (!origin) return true;
    if (origin.includes('localhost')) return true;
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
        origin: (origin, callback) => {
            if (isAllowedOrigin(origin)) return callback(null, true);
            callback(new Error('CORS blocked: ' + origin), false);
        },
        methods: ["GET", "POST"]
    }
});

app.set('io', io);

io.on('connection', (socket) => {
    console.log('New client connected', socket.id);

    // Clients can join a room based on their user ID or role to receive targeted events
    socket.on('join', (room) => {
        socket.join(room);
        console.log(`Socket ${socket.id} joined room ${room}`);
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
server.listen(PORT, () => {
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
    }, 3000);
});
// Trigger Restart
