const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { REFRESH_TOKEN_EXPIRES_MS } = require("../config/jwt");

/**
 * RefreshToken — tracks active refresh tokens per user.
 *
 * Security:
 * - The raw token is NEVER stored — only a bcrypt hash.
 * - TTL index on expiresAt automatically removes expired tokens.
 * - Each token has a unique sessionId (UUID) that correlates all
 *   access tokens issued within that session.
 */
const refreshTokenSchema = new mongoose.Schema({
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital", default: null },
    tokenHash:  { type: String, required: true },
    sessionId:  { type: String, required: true, index: true },
    jti:        { type: String, required: true, index: true },
    createdAt:    { type: Date, default: Date.now },
    expiresAt:    { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    lastUsedAt:   { type: Date, default: Date.now },
    sessionStart: { type: Date, default: Date.now },
    isRevoked:  { type: Boolean, default: false, index: true },
    revokedAt:  { type: Date, default: null },
    revokedBy:  { type: String, default: "" },
    ip:      { type: String, default: "" },
    browser: { type: String, default: "Unknown" },
    os:      { type: String, default: "Unknown" },
    device:  { type: String, default: "Desktop" },
    userAgent: { type: String, default: "" },
});

refreshTokenSchema.index({ userId: 1, isRevoked: 1 });
refreshTokenSchema.index({ sessionId: 1, isRevoked: 1 });

refreshTokenSchema.statics.hashToken = async function (rawToken) {
    return bcrypt.hash(rawToken, 10);
};

refreshTokenSchema.statics.verifyToken = async function (rawToken, storedHash) {
    return bcrypt.compare(rawToken, storedHash);
};

refreshTokenSchema.statics.createForUser = async function ({
    userId, hospitalId, rawToken, sessionId, jti, ip, browser, os, device, userAgent
}) {
    const tokenHash = await bcrypt.hash(rawToken, 10);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_MS);
    return this.create({
        userId, hospitalId, tokenHash, sessionId, jti,
        expiresAt, ip, browser, os, device, userAgent
    });
};

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
