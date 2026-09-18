/**
 * ==============================================================================
 * AETHERIS DEFENSE-GRADE OTP & SMS DISPATCH SERVICE
 * File: otp_service.js
 * Language: Node.js (JavaScript)
 * SDK: official 'twilio' SDK
 * ==============================================================================
 */

require('dotenv').config();
const crypto = require('crypto');
const twilio = require('twilio');

// ------------------------------------------------------------------------------
// 1. ENVIRONMENT CONFIGURATION & VALIDATION
// ------------------------------------------------------------------------------
function validateEnv() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiSecret = process.env.TWILIO_API_SECRET;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const senderNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || accountSid.includes('your_twilio_account_sid')) {
    console.warn('[SECURITY WARNING] TWILIO_ACCOUNT_SID is missing or using placeholder in .env');
  }

  const hasApiKeyAuth = apiKeySid && apiSecret;
  const hasTokenAuth = accountSid && authToken;

  if (!hasApiKeyAuth && !hasTokenAuth) {
    throw new Error(
      'Missing Twilio Credentials: Ensure either (TWILIO_API_KEY_SID & TWILIO_API_SECRET) or (TWILIO_ACCOUNT_SID & TWILIO_AUTH_TOKEN) are set in your .env file.'
    );
  }

  if (!senderNumber) {
    console.warn('[CONFIG WARNING] TWILIO_PHONE_NUMBER is not configured in .env');
  }
}

// Initialize Twilio client using API Key/Secret or Account SID/Token
function getTwilioClient() {
  validateEnv();

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiSecret = process.env.TWILIO_API_SECRET;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (apiKeySid && apiSecret) {
    // Authenticate using API Key SID + API Secret (Scoped defense authorization)
    return twilio(apiKeySid, apiSecret, { accountSid: accountSid });
  } else {
    // Fallback to standard Account SID + Auth Token
    return twilio(accountSid, authToken);
  }
}

// ------------------------------------------------------------------------------
// 2. CRYPTOGRAPHICALLY SECURE OTP GENERATION
// ------------------------------------------------------------------------------
/**
 * Generates a random, cryptographically secure 6-digit numeric OTP.
 * Uses crypto.randomInt (CSPRNG) which avoids pseudo-random modulo bias.
 * Range: 100000 to 999999 inclusive.
 * @returns {string} 6-digit OTP string
 */
function generateSecureOTP() {
  const min = 100000;
  const max = 1000000; // exclusive bound, so maximum returned is 999999
  const otpNumber = crypto.randomInt(min, max);
  return otpNumber.toString();
}

// ------------------------------------------------------------------------------
// 3. IN-MEMORY TTL STORAGE & VERIFICATION STRUCTURE
// ------------------------------------------------------------------------------
// Store schema: phone (string) => { otp: string, expiresAt: number, attempts: number }
const otpStore = new Map();

const DEFAULT_TTL_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 5;
const MAX_ATTEMPTS = parseInt(process.env.MAX_VERIFY_ATTEMPTS, 10) || 3;

/**
 * Normalizes phone numbers to standard E.164 format.
 * Defaults 10-digit Indian numbers to +91.
 * @param {string} phone
 * @returns {string}
 */
function normalizePhoneNumber(phone) {
  if (!phone) return '';
  const cleaned = phone.replace(/[\s\-()]/g, '');
  if (/^\d{10}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }
  if (!cleaned.startsWith('+')) {
    return `+${cleaned}`;
  }
  return cleaned;
}

/**
 * Validates E.164 phone number structure (+ followed by 7 to 15 digits).
 * @param {string} phone
 * @returns {boolean}
 */
function isValidE164(phone) {
  const e164Regex = /^\+[1-9]\d{6,14}$/;
  return e164Regex.test(phone);
}

/**
 * Stores generated OTP with expiration timestamp and brute-force protection counter.
 * @param {string} phone Normalized phone number
 * @param {string} otp 6-digit verification code
 * @param {number} ttlMinutes Expiration time in minutes (default: 5)
 */
function storeOTP(phone, otp, ttlMinutes = DEFAULT_TTL_MINUTES) {
  const expiresAt = Date.now() + ttlMinutes * 60 * 1000;
  otpStore.set(phone, {
    otp: otp,
    expiresAt: expiresAt,
    attempts: 0
  });

  // Optional: Auto-cleanup timer to prevent memory leaks
  setTimeout(() => {
    const record = otpStore.get(phone);
    if (record && Date.now() >= record.expiresAt) {
      otpStore.delete(phone);
    }
  }, ttlMinutes * 60 * 1000 + 1000);
}

/**
 * Verifies entered OTP against stored active record.
 * Includes expiration checks, rate-limiting attempts, and single-use invalidation.
 * @param {string} phone
 * @param {string} userEnteredOtp
 * @returns {{ success: boolean, message: string, status: string }}
 */
function verifyOTP(phone, userEnteredOtp) {
  const normalizedPhone = normalizePhoneNumber(phone);
  const record = otpStore.get(normalizedPhone);

  if (!record) {
    return {
      success: false,
      status: 'NOT_FOUND',
      message: 'No active OTP verification session found for this number. Please request a new code.'
    };
  }

  // 1. Check expiration
  if (Date.now() > record.expiresAt) {
    otpStore.delete(normalizedPhone);
    return {
      success: false,
      status: 'EXPIRED',
      message: 'Verification OTP has expired. Please request a new code.'
    };
  }

  // 2. Check brute-force attempts
  record.attempts += 1;
  if (record.attempts > MAX_ATTEMPTS) {
    otpStore.delete(normalizedPhone);
    return {
      success: false,
      status: 'TOO_MANY_ATTEMPTS',
      message: 'Maximum verification attempts exceeded. Security lockout triggered. Please request a new OTP.'
    };
  }

  // 3. Compare OTP
  const cleanedEntered = userEnteredOtp ? userEnteredOtp.toString().trim() : '';
  if (cleanedEntered === record.otp) {
    // Single-use guarantee: Invalidate immediately upon successful verification
    otpStore.delete(normalizedPhone);
    return {
      success: true,
      status: 'VERIFIED',
      message: 'OTP verified successfully. Defense clearance granted.'
    };
  }

  const remaining = MAX_ATTEMPTS - record.attempts;
  return {
    success: false,
    status: 'INVALID_CODE',
    message: `Invalid verification code. ${remaining} attempt(s) remaining.`
  };
}

// ------------------------------------------------------------------------------
// 4. SMS DISPATCH USING OFFICIAL TWILIO SDK
// ------------------------------------------------------------------------------
/**
 * Generates and dispatches a 6-digit OTP to the recipient phone number.
 * @param {string} recipientPhone Target mobile phone number
 * @returns {Promise<{ success: boolean, messageId?: string, phone: string, expiresAt: number, testOtp?: string }>}
 */
async function sendOTPViaSMS(recipientPhone) {
  try {
    // 1. Phone number validation
    const normalizedPhone = normalizePhoneNumber(recipientPhone);
    if (!isValidE164(normalizedPhone)) {
      throw new Error(
        `Invalid phone number format: "${recipientPhone}". Phone numbers must conform to E.164 format (e.g., +919876543210).`
      );
    }

    // 2. Generate secure OTP
    const otp = generateSecureOTP();

    // 3. Store OTP in TTL cache
    storeOTP(normalizedPhone, otp, DEFAULT_TTL_MINUTES);

    // 4. Initialize Twilio client
    const client = getTwilioClient();
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!fromNumber) {
      throw new Error('TWILIO_PHONE_NUMBER environment variable is not defined.');
    }

    // 5. Construct defense-grade message payload
    const messageBody = `[AETHERIS MISSION CONTROL] Your security verification code is: ${otp}. Valid for ${DEFAULT_TTL_MINUTES} minutes. Do not share this defense access token.`;

    console.log(`[DISPATCH] Dispatching OTP via Twilio to ${normalizedPhone}...`);

    // 6. Send SMS using official SDK
    const response = await client.messages.create({
      body: messageBody,
      from: fromNumber,
      to: normalizedPhone
    });

    console.log(`[DISPATCH SUCCESS] Twilio Message SID: ${response.sid} | Status: ${response.status}`);

    return {
      success: true,
      status: response.status,
      messageId: response.sid,
      phone: normalizedPhone,
      expiresAt: Date.now() + DEFAULT_TTL_MINUTES * 60 * 1000,
      // For developer console debugging (suppress in hardened prod):
      testOtp: process.env.NODE_ENV === 'development' ? otp : undefined
    };
  } catch (error) {
    // Robust Error Handling for Twilio error codes and network failures
    console.error('[DISPATCH ERROR]', error.message);

    let userFriendlyMessage = error.message;

    if (error.code) {
      switch (error.code) {
        case 21211:
          userFriendlyMessage = 'The target phone number is invalid.';
          break;
        case 21608:
          userFriendlyMessage = 'Trial account limitation: This unverified number cannot receive SMS until verified in Twilio console.';
          break;
        case 20003:
          userFriendlyMessage = 'Twilio authentication failure. Please check Account SID and API Secret.';
          break;
        case 21614:
          userFriendlyMessage = 'The configured Twilio phone number is not capable of sending SMS.';
          break;
        default:
          userFriendlyMessage = `Twilio Error (${error.code}): ${error.message}`;
      }
    }

    return {
      success: false,
      error: userFriendlyMessage,
      errorCode: error.code || 'INTERNAL_ERROR',
      phone: recipientPhone
    };
  }
}

// ------------------------------------------------------------------------------
// 5. OPTIONAL EXPRESS HTTP REST API HANDLERS
// ------------------------------------------------------------------------------
/**
 * Express Route: POST /api/auth/send-otp
 * Body: { phone: "+919876543210" }
 */
async function handleSendOTPRoute(req, res) {
  try {
    const { phone } = req.body || {};
    if (!phone) {
      return res.status(400).json({ error: 'Missing "phone" in request body.' });
    }

    const result = await sendOTPViaSMS(phone);
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * Express Route: POST /api/auth/verify-otp
 * Body: { phone: "+919876543210", otp: "123456" }
 */
function handleVerifyOTPRoute(req, res) {
  try {
    const { phone, otp } = req.body || {};
    if (!phone || !otp) {
      return res.status(400).json({ error: 'Both "phone" and "otp" are required.' });
    }

    const result = verifyOTP(phone, otp);
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// ------------------------------------------------------------------------------
// 6. MODULE EXPORTS & TEST RUNNER
// ------------------------------------------------------------------------------
module.exports = {
  generateSecureOTP,
  storeOTP,
  verifyOTP,
  sendOTPViaSMS,
  normalizePhoneNumber,
  handleSendOTPRoute,
  handleVerifyOTPRoute
};

// Direct Execution / CLI Self-Test Runner
if (require.main === module) {
  (async () => {
    console.log('=== AETHERIS OTP SERVICE SELF-TEST ===');
    const testOtp = generateSecureOTP();
    console.log('1. Generated Cryptographic OTP:', testOtp);

    const testPhone = '+919876543210';
    storeOTP(testPhone, testOtp, 5);
    console.log('2. Stored OTP for', testPhone, 'TTL: 5 minutes');

    const checkBad = verifyOTP(testPhone, '000000');
    console.log('3. Bad OTP Verification Result:', checkBad);

    const checkGood = verifyOTP(testPhone, testOtp);
    console.log('4. Good OTP Verification Result:', checkGood);

    const checkReplay = verifyOTP(testPhone, testOtp);
    console.log('5. Replay Attack Prevention (Re-verifying same OTP):', checkReplay);
  })();
}
