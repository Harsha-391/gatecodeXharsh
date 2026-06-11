# HMS System Administration Guide

This guide describes how to administer, configure, and monitor the multi-tenant Hospital Management System (HMS).

## 1. Multi-Tenant Database Architecture

The HMS utilizes a **database-per-tenant** design in a single MongoDB cluster.

```
                  +--------------------------------+
                  |  MongoDB Atlas Cluster / Host  |
                  +--------------------------------+
                     /            |             \
  +--------------------+   +--------------------+   +--------------------+
  |      Master DB     |   | Tenant DB (Hosp A) |   | Tenant DB (Hosp B) |
  | (HSM - Global Adm) |   | (hms_hospital_6a1) |   | (hms_hospital_6a2) |
  +--------------------+   +--------------------+   +--------------------+
```

* **Master Database (`HSM`)**: Stores global configurations, hospitals, central roles, and global credentials.
* **Tenant Databases (`hms_hospital_<hospitalId>`)**: Dynamically opened for each hospital. Connection caching limits resources while isolating transactional records.

---

## 2. Dynamic Database Connections Management

The database connection pool is managed in [tenantDb.js](file:///c:/Users/omris/Downloads/HMS-main/HMS-main/server/src/db/tenantDb.js).
Connections are cached in-memory and are automatically recycled or closed when hospitals are disabled:

```javascript
const connectionCache = new Map(); // { hospitalDbName -> Mongoose Connection }
```

Pool configurations are tuned to optimize host resources:
- `maxPoolSize`: 5 connections per tenant.
- `connectTimeoutMS`: 30000ms.
- `socketTimeoutMS`: 45000ms.

---

## 3. Storage & Backup Retention Policy

* Backup Files are saved to `server/backups/`.
* Filename syntax: `backup_<timestamp>.json.gz`.
* File format: Compressed JSON snapshot (Gzipped).
* **Retention Logic**:
  - The programmatic script automatically keeps only the **7 most recent backup archives**.
  - System administrators should configure external cron logs and backup copy exports (e.g. syncing backups folder to AWS S3).

---

## 4. System Health Dashboard Monitoring

Administrators can view host health indicators (CPU Load, Memory Utilization, MongoDB connectivity status, Active Socket connections, and Backups count) from the frontend dashboard.
Health indicators are refreshed dynamically using the `GET /api/administrator/system-health` endpoint.
If CPU load spikes consistently above 85% or Memory exceeds 90%, it is recommended to spin up additional Node instances and configure load balancing.
