const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

/**
 * @swagger
 * /api/auth/request-otp:
 *   post:
 *     summary: Request an OTP for a phone number
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - ageAccepted
 *               - termsAccepted
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "+2348012345678"
 *               ageAccepted:
 *                 type: boolean
 *                 example: true
 *               termsAccepted:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *       400:
 *         description: Missing fields or terms not accepted
 *       403:
 *         description: Account locked
 */
router.post('/request-otp', authController.requestOTP);

/**
 * @swagger
 * /api/auth/verify-otp:
 *   post:
 *     summary: Verify OTP and login/register user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - otp
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "+2348012345678"
 *               otp:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 *       400:
 *         description: Invalid or expired OTP
 *       403:
 *         description: Account locked
 */
router.post('/verify-otp', authController.verifyOTP);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset user password using OTP
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - otp
 *               - newPassword
 *             properties:
 *               phoneNumber:
 *                 type: string
 *               otp:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password updated successfully
 *       400:
 *         description: Invalid OTP or missing fields
 */
router.post('/reset-password', authController.resetPassword);

module.exports = router;
