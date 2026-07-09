const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;

const isDev = process.env.NODE_ENV !== 'production';

// Login — 5 attempts per 1 minute per email/IP
const loginLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: isDev ? 1000 : 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.body && typeof req.body.email === 'string'
            ? req.body.email.toLowerCase().trim()
            : ipKeyGenerator(req);
    },
    message: { success: false, message: 'Too many login attempts. Please try again after 1 minute.' },
    skipSuccessfulRequests: false,
});

// Signup — 5 registrations per hour per IP (prevents account spam)
const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: isDev ? 1000 : 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many accounts created from this IP. Try again after an hour.' },
});

// Forgot Password — 3 requests per hour per IP
const forgotPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: isDev ? 1000 : 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many password reset requests. Please try again after an hour.' },
});

// OTP requests — 3 per hour per IP
const otpLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: isDev ? 1000 : 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many OTP requests. Please try again after an hour.' },
});

// OTP Verification — 10 attempts per 15 minutes per IP
const otpVerifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isDev ? 1000 : 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many OTP verification attempts. Try again after 15 minutes.' },
});

// Hospital Creation — 5 requests per hour per IP (Strict rate limit)
const hospitalCreationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: isDev ? 1000 : 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Hospital registration limit reached. Try again later.' },
});

// Patient Registration — 30 requests per hour per IP (Moderate rate limit)
const patientRegistrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: isDev ? 1000 : 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many patient registrations. Try again after an hour.' },
});

// General API — 200 requests per 15 min per IP (DoS protection)
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isDev ? 50000 : 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Please slow down.' },
});

module.exports = {
    loginLimiter,
    signupLimiter,
    forgotPasswordLimiter,
    otpLimiter,
    otpVerifyLimiter,
    hospitalCreationLimiter,
    patientRegistrationLimiter,
    generalLimiter
};


