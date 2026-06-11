# HMS Disaster Recovery & Continuity Guide

This document outlines the operational recovery protocols for restoring the HMS to normal operations in the event of database corruption, system crash, or data loss.

## 1. Disaster Recovery Goals

* **Recovery Point Objective (RPO)**: Under 24 hours (backed up daily at 2:00 AM).
* **Recovery Time Objective (RTO)**: Under 1 hour (using programmatic restore commands).

---

## 2. Emergency Backup Recovery Procedure

In case of a database loss:

1. Locate the latest compressed backup archive inside `/server/backups/` (e.g. `backup_1780649933535.json.gz`).
2. Run the restoration command:
   ```bash
   node server/scripts/backup-restore.js --restore server/backups/backup_1780649933535.json.gz
   ```
3. The restore utility will dynamically recreate the master collections and re-establish each individual tenant database connection.

---

## 3. Data Integrity & Validation Auditing

Following a database restore:

* Run the data integrity checklist:
  ```bash
  node server/scripts/backup-restore.js --test-restore
  ```
* Log in as an administrator and verify that Patient Records, Billing Ledger history, Lab Reports, Ward Occupancies, and Inventory counts are correctly restored and match expectations.
* Audit the query indexes to ensure optimal query paths are restored:
  ```bash
  node server/scripts/db-performance.js
  ```
* Check the application error logs (`pm2 logs` or console logs) to ensure no database connection or schema validation crashes occur.
