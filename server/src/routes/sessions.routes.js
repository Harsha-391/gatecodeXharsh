const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const RefreshToken = require("../models/refreshToken.model");
const { verifyToken, verifySuperAdmin, verifyAdminOrSuperAdmin } = require("../middleware/auth.middleware");
const { parseUserAgent } = require("../utils/userAgentParser");

function formatSession(record, currentJti = null) {
    const now = Date.now();
    const loginTime = new Date(record.sessionStart || record.createdAt);
    const lastActive = new Date(record.lastUsedAt || record.createdAt);
    const durationMs = now - loginTime.getTime();
    const hours = Math.floor(durationMs / 3600000);
    const minutes = Math.floor((durationMs % 3600000) / 60000);

    // Determine status
    const isRevoked  = !!record.isRevoked;
    const isExpired  = !isRevoked && new Date(record.expiresAt) < new Date();
    const isCurrent  = !isRevoked && !isExpired && currentJti && record.jti === currentJti;
    const status     = isRevoked ? "revoked" : isExpired ? "expired" : "active";
    const sessionType = isCurrent ? "current" : isRevoked ? "revoked" : isExpired ? "expired" : "other";

    return {
        id: record._id,
        sessionId: record.sessionId,
        userId: record.userId,
        hospitalId: record.hospitalId,
        ip: record.ip,
        browser: record.browser,
        os: record.os,
        device: record.device,
        loginTime: loginTime.toISOString(),
        lastActivity: lastActive.toISOString(),
        duration: hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`,
        durationMs,
        status,
        sessionType,     // "current" | "other" | "revoked" | "expired"
        isCurrentSession: isCurrent,
    };
}

// Helper: safely decode jti from Authorization header
function _getCurrentJti(req) {
    try {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.split(' ')[1];
        if (!token) return null;
        const decoded = require('jsonwebtoken').decode(token);
        return decoded?.jti || null;
    } catch (_) {
        return null;
    }
}

// GET /api/sessions/mine
router.get("/mine", verifyToken, async (req, res) => {
    try {
        const currentJti = _getCurrentJti(req);
        const records = await RefreshToken
            .find({ userId: req.user._id, expiresAt: { $gt: new Date() } })
            .sort({ lastUsedAt: -1 })
            .lean();
        const sessions = records.map(r => formatSession(r, currentJti));
        res.json({ success: true, sessions });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// GET /api/sessions/hospital
router.get("/hospital", verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const query = { isRevoked: false, expiresAt: { $gt: new Date() } };
        if (req.user.hospitalId) query.hospitalId = req.user.hospitalId;
        const records = await RefreshToken.find(query).sort({ lastUsedAt: -1 }).lean();
        const User = require("../models/user.model");
        const sessions = await Promise.all(records.map(async r => {
            const u = await User.findById(r.userId).select("name email role").lean().catch(() => null);
            return { ...formatSession(r), user: u ? { name: u.name, email: u.email } : null };
        }));
        res.json({ success: true, sessions });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/sessions/all
router.get("/all", verifySuperAdmin, async (req, res) => {
    try {
        const records = await RefreshToken.find({ isRevoked: false, expiresAt: { $gt: new Date() } }).sort({ lastUsedAt: -1 }).lean();
        const User = require("../models/user.model");
        const sessions = await Promise.all(records.map(async r => {
            const u = await User.findById(r.userId).select("name email role").lean().catch(() => null);
            return { ...formatSession(r), user: u ? { name: u.name, email: u.email } : null };
        }));
        res.json({ success: true, sessions });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/sessions/other
router.delete("/other", verifyToken, async (req, res) => {
    try {
        const decoded = require("jsonwebtoken").decode(req.headers.authorization.split(" ")[1]);
        const currentJti = decoded?.jti;
        const result = await RefreshToken.updateMany(
            { userId: req.user._id, isRevoked: false, jti: { $ne: currentJti } },
            { $set: { isRevoked: true, revokedAt: new Date(), revokedBy: "user_revoke_others" } }
        );
        try {
            const AuditLog = require("../models/auditLog.model");
            AuditLog.create({ clinicId: req.user.hospitalId || new mongoose.Types.ObjectId("6a200269d01a91451fefb80d"), userId: req.user._id, userName: req.user.name, action: "LOGOUT_ALL_DEVICES", reason: "User revoked other sessions", ip: req.ip || "", success: true }).catch(() => {});
        } catch (_) {}
        res.json({ success: true, revokedCount: result.modifiedCount });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/sessions/all
router.delete("/all", verifyToken, async (req, res) => {
    try {
        const result = await RefreshToken.updateMany(
            { userId: req.user._id, isRevoked: false },
            { $set: { isRevoked: true, revokedAt: new Date(), revokedBy: "user_revoke_all" } }
        );
        await require("../models/user.model").findByIdAndUpdate(req.user._id, { $inc: { tokenVersion: 1 } });
        try {
            const AuditLog = require("../models/auditLog.model");
            AuditLog.create({ clinicId: req.user.hospitalId || new mongoose.Types.ObjectId("6a200269d01a91451fefb80d"), userId: req.user._id, userName: req.user.name, action: "LOGOUT_ALL_DEVICES", reason: "User logged out all sessions", ip: req.ip || "", success: true }).catch(() => {});
        } catch (_) {}
        res.json({ success: true, revokedCount: result.modifiedCount });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/sessions/:id  (admin terminates a session)
router.delete("/:id", verifyAdminOrSuperAdmin, async (req, res) => {
    try {
        const record = await RefreshToken.findById(req.params.id);
        if (!record) return res.status(404).json({ success: false, message: "Session not found" });
        const isGlobal = ["superadmin", "centraladmin"].includes(String(req.user.role || "").toLowerCase());
        if (!isGlobal && String(record.hospitalId) !== String(req.user.hospitalId)) {
            return res.status(403).json({ success: false, message: "Access denied" });
        }
        await RefreshToken.updateOne({ _id: record._id }, { $set: { isRevoked: true, revokedAt: new Date(), revokedBy: "admin:" + req.user._id } });
        try {
            const AuditLog = require("../models/auditLog.model");
            AuditLog.create({ clinicId: req.user.hospitalId || new mongoose.Types.ObjectId("6a200269d01a91451fefb80d"), userId: req.user._id, userName: req.user.name, action: "SESSION_TERMINATED_BY_ADMIN", targetId: record.userId, reason: "Admin terminated session " + record.sessionId, ip: req.ip || "", success: true }).catch(() => {});
        } catch (_) {}
        res.json({ success: true, message: "Session terminated" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
