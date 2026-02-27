const User = require('../models/User');
const OTP = require('../models/OTP');
const jwt = require('jsonwebtoken');
const axios = require('axios');

// Termii API Implementation
const sendSMS = async (phone, message) => {
    try {
        // Remove '+', then if it starts with '0', replace with '234'
        let normalizedPhone = phone.replace('+', '');
        if (normalizedPhone.startsWith('0')) {
            normalizedPhone = '234' + normalizedPhone.slice(1);
        }

        const payload = {
            api_key: process.env.TERMII_API_KEY,
            to: normalizedPhone,
            from: process.env.TERMII_SENDER_ID || 'GameDey',
            sms: message,
            type: "plain",
            channel: "generic"
        };

        const response = await axios.post(process.env.TERMII_BASE_URL, payload);
        console.log('Termii API Response:', response.data);
        return response.data;
    } catch (error) {
        console.error('Termii API Error:', error.response?.data || error.message);
        // We still return true to let the flow CONTINUE but we should log the error
        // Or if you want to block, throw an error. In this case, I'll log and return false
        return false;
    }
};

exports.requestOTP = async (req, res) => {
    try {
        const { phoneNumber, ageAccepted, termsAccepted, type, firstName, lastName, password } = req.body;

        if (!phoneNumber) {
            return res.status(400).json({ message: 'Phone number is required' });
        }

        if (!ageAccepted || !termsAccepted) {
            return res.status(400).json({ message: 'You must accept terms and be 18+' });
        }

        // Logic for Login vs Signup separation
        const existingUser = await User.findOne({ phoneNumber });

        if (type === 'login') {
            if (!existingUser) {
                return res.status(404).json({ message: 'Account not found. Please sign up first.' });
            }
            // Optional: Check password here if you want to verify password BEFORE sending OTP
            if (password && existingUser.password !== password) {
                return res.status(401).json({ message: 'Invalid password.' });
            }
        } else if (type === 'signup') {
            if (existingUser) {
                return res.status(400).json({ message: 'This phone number is already registered. Please log in.' });
            }
        } else if (type === 'forgot-password') {
            if (!existingUser) {
                return res.status(404).json({ message: 'No account found with this phone number.' });
            }
        }

        // Check for lockout
        const lastOTP = await OTP.findOne({ phoneNumber }).sort({ createdAt: -1 });
        if (lastOTP && lastOTP.lockedUntil && lastOTP.lockedUntil > new Date()) {
            const minutesLeft = Math.ceil((lastOTP.lockedUntil - new Date()) / 60000);
            return res.status(403).json({ message: `Account locked. Try again in ${minutesLeft} minutes.` });
        }

        // Generate 6 digit OTP (Fixed for testing)
        const otpCode = '000000';
        const expiresAt = new Date(Date.now() + process.env.OTP_EXPIRY_MINUTES * 60000);

        // Save OTP with type and metadata
        await OTP.create({
            phoneNumber,
            otp: otpCode,
            type: type || 'signup',
            metadata: type === 'signup' ? { firstName, lastName, password } : {},
            expiresAt
        });

        // Send SMS
        await sendSMS(phoneNumber, `Your GameDey verification code is: ${otpCode}. Valid for 5 minutes.`);
        console.log(`[TESTING] OTP for ${phoneNumber} is: ${otpCode} (Type: ${type})`);

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

        if (!user && otpRecord.type === 'signup') {
            const { firstName, lastName, password } = otpRecord.metadata || {};
            user = await User.create({
                phoneNumber,
                firstName,
                lastName,
                password, // In production, hash this!
                isVerified: true,
                ageVerified: true,
                termsAccepted: true
            });
        } else if (!user) {
            // This case shouldn't happen if requestOTP checks logic correctly, but for safety:
            return res.status(404).json({ message: 'User not found. Please sign up.' });
        }

        // Generate JWT
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '24h' });

        res.status(200).json({
            message: 'Verification successful',
            token,
            user: {
                id: user._id,
                phoneNumber: user.phoneNumber,
                firstName: user.firstName,
                lastName: user.lastName,
                walletBalance: user.walletBalance
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};
exports.resetPassword = async (req, res) => {
    try {
        const { phoneNumber, otp, newPassword } = req.body;

        if (!phoneNumber || !otp || !newPassword) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        const otpRecord = await OTP.findOne({ phoneNumber }).sort({ createdAt: -1 });

        if (!otpRecord || otpRecord.otp !== otp || otpRecord.expiresAt < new Date()) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        const user = await User.findOne({ phoneNumber });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.password = newPassword;
        await user.save();

        res.status(200).json({ message: 'Password reset successful' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};
