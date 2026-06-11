const dns = require('dns');

console.log('--- Setting DNS to Google and Cloudflare ---');
dns.setServers(['8.8.8.8', '1.1.1.1']);

dns.resolveSrv('_mongodb._tcp.cluster0.fkmafvw.mongodb.net', (err, addresses) => {
    if (err) {
        console.error('Custom DNS lookup failed:', err);
    } else {
        console.log('Custom DNS lookup succeeded:', addresses);
    }
});
