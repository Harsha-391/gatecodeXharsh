# HMS Client Production Deployment Checklist

Use this checklist to perform system setup when deploying the HMS to a client's environment.

## 1. Environment Variables Configuration (`.env`)

Verify the following variables are present in the environment configuration:

```ini
PORT=3000
NODE_ENV=production
MONGODB_URL=mongodb+srv://<username>:<password>@cluster0.xyz.mongodb.net/HSM?retryWrites=true&w=majority
JWT_SECRET=a7ad54f3356c02e5256a7a148afecede
JWT_EXPIRES_IN=45m
JWT_REFRESH_SECRET=d27c4196f30a8b767261c09bba36939b
JWT_REFRESH_EXPIRES_IN=7d
IMAGEKIT_PUBLIC_KEY=public_d2vd6Lzsw1A9tB6tP14xNs4Ex2M=
IMAGEKIT_PRIVATE_KEY=private_B89I5QLrOveARdtWnhBfqrMZZvE=
IMAGEKIT_URL_ENDPOINTS=https://ik.imagekit.io/b3pvj0biyx
OTP_PROVIDER=msg91  # Msg91, Twilio or Console
MSG91_AUTH_KEY=your_msg91_auth_key
MSG91_TEMPLATE_ID=your_template_id
```

---

## 2. Server Infrastructure & Setup

- [ ] **Docker Deployment**: Or build directly on Node.js using PM2 process manager:
  `pm2 start server.js --name "hms-backend" -i max`
- [ ] **SSL / Nginx Configuration**: Configure Nginx as reverse proxy with SSL Certificates via Let's Encrypt Certbot:
  ```nginx
  server {
      listen 443 ssl;
      server_name portal.medicalhms.in;
      ssl_certificate /etc/letsencrypt/live/portal.medicalhms.in/fullchain.pem;
      ssl_certificate_key /etc/letsencrypt/live/portal.medicalhms.in/privkey.pem;

      location / {
          proxy_pass http://localhost:3000;
          proxy_http_version 1.1;
          proxy_set_header Upgrade $http_upgrade;
          proxy_set_header Connection 'upgrade';
          proxy_set_header Host $host;
          proxy_cache_bypass $http_upgrade;
      }
  }
  ```

---

## 3. Database Indexes Verification

Ensure index checks have been run and are validated:
- [ ] Run index checker: `node server/scripts/db-performance.js`
- [ ] Confirm no COLLSCAN queries are present in the performance report.

---

## 4. Backup & Disaster Recovery Schedule

- [ ] Register daily cron task for programmatic backups:
  `0 2 * * * node /path/to/server/scripts/backup-restore.js >> /var/log/hms-backup.log 2>&1`
- [ ] Verify that backups are compressed and saved to `server/backups/`.
- [ ] Run restoration dry-run: `node server/scripts/backup-restore.js --test-restore`

---

## 5. Security Policies Checks

- [ ] Rate limits verified (general limit is 200 requests per 15 minutes per IP).
- [ ] NoSQL injection sanitization verified via `express-mongo-sanitize`.
- [ ] Cross-site scripting (XSS) headers verified via `helmet`.
- [ ] Cross-tenant access verification successfully passed via `test-tenant-isolation.js`.
