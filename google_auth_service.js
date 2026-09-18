/**
 * ==============================================================================
 * AETHERIS GOOGLE IDENTITY SERVICES (GIS) BACKEND VERIFIER
 * File: google_auth_service.js
 * Language: Node.js
 * Package: google-auth-library (npm install google-auth-library dotenv)
 * ==============================================================================
 */

require('dotenv').config();
const { OAuth2Client } = require('google-auth-library');

// Initialize Google OAuth2 Client
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Assigns defense operational clearances based on verified email domain
 * @param {string} email 
 * @returns {{ role: string, clearance: string, organization: string }}
 */
function assignDefenseClearance(email, hostedDomain) {
  const domain = hostedDomain || (email ? email.split('@')[1] : '');

  if (domain === 'isro.gov.in') {
    return {
      role: 'Chief Meteorological Scientist',
      clearance: 'Level-5 National Defense Clearance',
      organization: 'Indian Space Research Organisation (ISRO)'
    };
  } else if (domain === 'imd.gov.in') {
    return {
      role: 'Director General of Meteorology',
      clearance: 'Level-5 National Defense Clearance',
      organization: 'India Meteorological Department (IMD)'
    };
  } else if (domain === 'nic.in' || domain === 'ndma.gov.in') {
    return {
      role: 'Crisis Response Commander',
      clearance: 'Level-4 Tactical Defense Clearance',
      organization: 'National Disaster Response Force (NDRF)'
    };
  } else if (domain === 'moes.gov.in') {
    return {
      role: 'Lead Climate AI Scientist',
      clearance: 'Level-4 Strategic Research Clearance',
      organization: 'Ministry of Earth Sciences (MoES)'
    };
  } else {
    return {
      role: 'Authorized Field Observer',
      clearance: 'Level-3 Field Clearance',
      organization: 'Civil Defense Network'
    };
  }
}

/**
 * Cryptographically verifies a Google ID Token (JWT) sent from the frontend.
 * Validates signature against Google's rotating public certs, expiry, and audience.
 * 
 * @param {string} idToken The JWT token received from Google Identity Services
 * @returns {Promise<{ success: boolean, user?: object, error?: string }>}
 */
async function verifyGoogleIdToken(idToken) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId || clientId.includes('your_google_client_id')) {
      throw new Error('GOOGLE_CLIENT_ID is not configured in .env');
    }

    if (!idToken) {
      throw new Error('ID Token string is required for verification.');
    }

    // 1. Verify signature and claims using official Google auth library
    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: clientId // Confirms token was issued specifically for your app
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error('Google token payload is empty or invalid.');
    }

    // 2. Validate email verification status
    if (!payload.email_verified) {
      return {
        success: false,
        error: 'Google email is not verified by Google.'
      };
    }

    // 3. Extract verified user profile
    const clearanceInfo = assignDefenseClearance(payload.email, payload.hd);

    const authenticatedUser = {
      googleId: payload.sub, // Unique, immutable Google User ID
      email: payload.email,
      name: payload.name || payload.email.split('@')[0],
      givenName: payload.given_name,
      familyName: payload.family_name,
      picture: payload.picture,
      hostedDomain: payload.hd || 'gmail.com',
      role: clearanceInfo.role,
      clearance: clearanceInfo.clearance,
      organization: clearanceInfo.organization,
      loginMethod: 'google_gis',
      authTime: new Date().toISOString()
    };

    console.log(`[GOOGLE AUTH SUCCESS] Verified ${authenticatedUser.email} (${authenticatedUser.clearance})`);

    return {
      success: true,
      user: authenticatedUser
    };
  } catch (err) {
    console.error('[GOOGLE AUTH ERROR]', err.message);
    return {
      success: false,
      error: `Token verification failed: ${err.message}`
    };
  }
}

/**
 * Express Route Handler: POST /api/auth/google
 * Body: { credential: "<Google_JWT_ID_Token>" }
 */
async function handleGoogleLoginRoute(req, res) {
  try {
    const { credential } = req.body || {};
    if (!credential) {
      return res.status(400).json({ success: false, error: 'Missing "credential" in request body.' });
    }

    const result = await verifyGoogleIdToken(credential);
    if (!result.success) {
      return res.status(401).json(result);
    }

    // In production: Set HTTP-Only session cookie or issue custom JWT here
    // e.g., res.cookie('session_token', createSessionJWT(result.user), { httpOnly: true, secure: true, sameSite: 'lax' });

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  verifyGoogleIdToken,
  handleGoogleLoginRoute,
  assignDefenseClearance
};
