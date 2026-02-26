const User = require('../models/User');
const OTP = require('../models/OTP');
const jwt = require('jsonwebtoken');

// Mock function for SMS sending
const sendSMS = async (phone, message) => {
    console.log(`[SMS MOCK] To: ${phone} | Message: ${message}`);
    return true;
};

exports.requestOTP = async (req, res) => {
    try {
        const { phoneNumber, ageAccepted, termsAccepted } = req.body;

        if (!phoneNumber) {
            return res.status(400).json({ message: 'Phone number is required' });
        }

        if (!ageAccepted || !termsAccepted) {
            return res.status(400).json({ message: 'You must accept terms and be 18+' });
        }

        // Check for lockout
        const lastOTP = await OTP.findOne({ phoneNumber }).sort({ createdAt: -1 });
        if (lastOTP && lastOTP.lockedUntil && lastOTP.lockedUntil > new Date()) {
            const minutesLeft = Math.ceil((lastOTP.lockedUntil - new Date()) / 60000);
            return res.status(403).json({ message: `Account locked. Try again in ${minutesLeft} minutes.` });
        }

        // Generate 6 digit OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + process.env.OTP_EXPIRY_MINUTES * 60000);

        // Save OTP
        await OTP.create({
            phoneNumber,
            otp: otpCode, // In production, hash this!
            expiresAt
        });

        // Send SMS
        await sendSMS(phoneNumber, `Your GameDey verification code is: ${otpCode}. Valid for 5 minutes.`);

        res.status(200).json({ message: 'OTP sent successfully' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.verifyOTP = async (req, res) => {
    try {
        const { phoneNumber, otp } = req.body;

        if (!phoneNumber || !otp) {
            return res.status(400).json({ message: 'Phone number and OTP are required' });
        }

        const otpRecord = await OTP.findOne({ phoneNumber }).sort({ createdAt: -1 });

        if (!otpRecord) {
            return res.status(404).json({ message: 'No OTP found' });
        }

        // Check expiration
        if (otpRecord.expiresAt < new Date()) {
            return res.status(400).json({ message: 'OTP expired' });
        }

        // Check attempts
        if (otpRecord.attempts >= process.env.MAX_OTP_ATTEMPTS) {
            otpRecord.lockedUntil = new Date(Date.now() + process.env.LOCKOUT_DURATION_MINUTES * 60000);
            await otpRecord.save();
            return res.status(403).json({ message: 'Too many attempts. Account locked for 15 minutes.' });
        }

        // Verify
        if (otpRecord.otp !== otp) {
            otpRecord.attempts += 1;
            await otpRecord.save();
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        // Success - Create or find user
        let user = await User.findOne({ phoneNumber });
        if (!user) {
            user = await User.create({
                phoneNumber,
                isVerified: true,
                ageVerified: true,
                termsAccepted: true
            });
        }

        // Generate JWT
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '24h' });

        res.status(200).json({
            message: 'Verification successful',
            token,
            user: {
                id: user._id,
                phoneNumber: user.phoneNumber,
                walletBalance: user.walletBalance
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};
