const mongoose = require('mongoose');

const OTPSchema = new mongoose.Schema({
    phoneNumber: {
        type: String,
        required: true,
        index: true
    },
    otp: {
        type: String,
        required: true
    },
    expiresAt: {
        type: Date,
        required: true
    },
    attempts: {
        type: Number,
        default: 0
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    lockedUntil: {
        type: Date,
        default: null
    }
}, { timestamps: true });

// Auto-delete expired OTPs after 30 minutes to clean up DB
OTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 1800 });

module.exports = mongoose.model('OTP', OTPSchema);
