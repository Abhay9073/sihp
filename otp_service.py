"""
==============================================================================
AETHERIS DEFENSE-GRADE OTP & SMS DISPATCH SERVICE
File: otp_service.py
Language: Python 3
SDK: official 'twilio' SDK (pip install twilio python-dotenv)
==============================================================================
"""

import os
import re
import time
import secrets
from typing import Dict, Optional, Any
from dataclasses import dataclass
# Load environment variables from .env (with built-in fallback)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # Built-in lightweight .env parser if python-dotenv is not installed
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    os.environ.setdefault(key.strip(), val.strip())


# ------------------------------------------------------------------------------
# 1. DATA STRUCTURES & IN-MEMORY TTL STORAGE
# ------------------------------------------------------------------------------
@dataclass
class OTPRecord:
    otp: str
    expires_at: float
    attempts: int = 0

# In-memory storage: phone (str) -> OTPRecord
_otp_store: Dict[str, OTPRecord] = {}

DEFAULT_TTL_MINUTES = int(os.getenv("OTP_EXPIRY_MINUTES", "5"))
MAX_ATTEMPTS = int(os.getenv("MAX_VERIFY_ATTEMPTS", "3"))

# ------------------------------------------------------------------------------
# 2. CRYPTOGRAPHICALLY SECURE OTP GENERATION
# ------------------------------------------------------------------------------
def generate_secure_otp() -> str:
    """
    Generates a cryptographically secure 6-digit numeric OTP using Python's secrets module.
    Avoids pseudo-random PRNG predictability (suitable for security tokens).
    Range: 100000 to 999999 inclusive.
    """
    # secrets.randbelow(900000) generates an int in [0, 899999]
    return str(100000 + secrets.randbelow(900000))

# ------------------------------------------------------------------------------
# 3. PHONE NUMBER NORMALIZATION & VALIDATION
# ------------------------------------------------------------------------------
def normalize_phone_number(phone: str) -> str:
    """
    Normalizes phone numbers to standard E.164 international format.
    Defaults 10-digit Indian mobile numbers to +91.
    """
    if not phone:
        return ""
    cleaned = re.sub(r"[\s\-()]", "", phone.strip())
    if re.fullmatch(r"\d{10}", cleaned):
        return f"+91{cleaned}"
    if not cleaned.startswith("+"):
        return f"+{cleaned}"
    return cleaned

def is_valid_e164(phone: str) -> bool:
    """
    Validates E.164 phone number format (+ followed by 7 to 15 digits).
    """
    return bool(re.fullmatch(r"^\+[1-9]\d{6,14}$", phone))

# ------------------------------------------------------------------------------
# 4. STORAGE & VERIFICATION LOGIC
# ------------------------------------------------------------------------------
def store_otp(phone: str, otp: str, ttl_minutes: int = DEFAULT_TTL_MINUTES) -> None:
    """
    Stores an active OTP with an expiration timestamp and attempt counter.
    """
    normalized = normalize_phone_number(phone)
    expires_at = time.time() + (ttl_minutes * 60)
    _otp_store[normalized] = OTPRecord(otp=otp, expires_at=expires_at, attempts=0)

def verify_otp(phone: str, user_entered_otp: str) -> Dict[str, Any]:
    """
    Verifies user-entered OTP with expiration, brute-force rate-limiting,
    and single-use invalidation.
    """
    normalized = normalize_phone_number(phone)
    record = _otp_store.get(normalized)

    if not record:
        return {
            "success": False,
            "status": "NOT_FOUND",
            "message": "No active OTP session found for this number. Please request a new code."
        }

    # 1. Check expiration
    if time.time() > record.expires_at:
        del _otp_store[normalized]
        return {
            "success": False,
            "status": "EXPIRED",
            "message": "Verification OTP has expired. Please request a new code."
        }

    # 2. Check brute-force attempt limits
    record.attempts += 1
    if record.attempts > MAX_ATTEMPTS:
        del _otp_store[normalized]
        return {
            "success": False,
            "status": "TOO_MANY_ATTEMPTS",
            "message": "Maximum verification attempts exceeded. Security lockout triggered."
        }

    # 3. Constant-time secure comparison
    entered_clean = str(user_entered_otp).strip()
    if secrets.compare_digest(entered_clean, record.otp):
        # Invalidate immediately upon successful verification to prevent replay attacks
        del _otp_store[normalized]
        return {
            "success": True,
            "status": "VERIFIED",
            "message": "OTP verified successfully. Defense clearance granted."
        }

    remaining = MAX_ATTEMPTS - record.attempts
    return {
        "success": False,
        "status": "INVALID_CODE",
        "message": f"Invalid verification code. {remaining} attempt(s) remaining."
    }

# ------------------------------------------------------------------------------
# 5. TWILIO SMS DISPATCH ENGINE
# ------------------------------------------------------------------------------
def get_twilio_client():
    """
    Initializes official Twilio Client from environment variables.
    Supports API Key SID/Secret pair or Account SID/Auth Token.
    """
    from twilio.rest import Client

    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    api_key_sid = os.getenv("TWILIO_API_KEY_SID")
    api_secret = os.getenv("TWILIO_API_SECRET")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")

    if api_key_sid and api_secret:
        # Authenticate using Twilio API Key & Secret
        return Client(api_key_sid, api_secret, account_sid=account_sid)
    elif account_sid and auth_token:
        # Authenticate using Account SID & Auth Token
        return Client(account_sid, auth_token)
    else:
        raise ValueError(
            "Missing Twilio credentials in environment: "
            "Set TWILIO_API_KEY_SID & TWILIO_API_SECRET or TWILIO_ACCOUNT_SID & TWILIO_AUTH_TOKEN in .env"
        )

def send_otp_via_sms(recipient_phone: str) -> Dict[str, Any]:
    """
    Generates and dispatches a 6-digit OTP to the recipient phone number via Twilio.
    Includes comprehensive try/catch exception handling.
    """
    try:
        # 1. Phone number format validation
        normalized_phone = normalize_phone_number(recipient_phone)
        if not is_valid_e164(normalized_phone):
            return {
                "success": False,
                "error": f"Invalid phone format: '{recipient_phone}'. Expected E.164 standard (e.g. +919876543210).",
                "status": "INVALID_PHONE"
            }

        # 2. Check Twilio sender phone number
        from_number = os.getenv("TWILIO_PHONE_NUMBER")
        if not from_number:
            return {
                "success": False,
                "error": "TWILIO_PHONE_NUMBER is not configured in .env file.",
                "status": "CONFIG_ERROR"
            }

        # 3. Generate secure OTP & store in TTL cache
        otp = generate_secure_otp()
        store_otp(normalized_phone, otp, DEFAULT_TTL_MINUTES)

        # 4. Initialize client
        client = get_twilio_client()

        # 5. Dispatch SMS
        body = f"[AETHERIS MISSION CONTROL] Your security verification code is: {otp}. Valid for {DEFAULT_TTL_MINUTES} minutes. Do not share this token."
        print(f"[DISPATCH] Sending Twilio SMS to {normalized_phone}...")

        message = client.messages.create(
            body=body,
            from_=from_number,
            to=normalized_phone
        )

        print(f"[DISPATCH SUCCESS] SID: {message.sid} | Status: {message.status}")

        return {
            "success": True,
            "message_id": message.sid,
            "status": message.status,
            "phone": normalized_phone,
            "expires_in_minutes": DEFAULT_TTL_MINUTES,
            # Test helper (disable in production):
            "test_otp": otp if os.getenv("ENV") == "development" else None
        }

    except Exception as exc:
        # Robust Error Handling
        print(f"[DISPATCH ERROR] {exc}")
        err_msg = str(exc)

        # Map common Twilio error codes
        if "21211" in err_msg:
            err_msg = "The recipient phone number is invalid."
        elif "21608" in err_msg:
            err_msg = "Twilio trial account restriction: Unverified phone number cannot receive SMS."
        elif "20003" in err_msg:
            err_msg = "Twilio authentication failure: Please verify your Account SID and API Secret."

        return {
            "success": False,
            "error": err_msg,
            "phone": recipient_phone
        }

# ------------------------------------------------------------------------------
# 6. CLI SELF-TEST RUNNER
# ------------------------------------------------------------------------------
if __name__ == "__main__":
    print("=" * 60)
    print("AETHERIS DEFENSE OTP SERVICE - SELF TEST")
    print("=" * 60)

    # 1. Test OTP Generation
    code = generate_secure_otp()
    print(f"1. Cryptographic OTP: {code}")

    # 2. Test Store
    test_number = "+919876543210"
    store_otp(test_number, code, 5)
    print(f"2. Stored for {test_number} with 5-min TTL")

    # 3. Test Invalid Verification
    res_bad = verify_otp(test_number, "000000")
    print(f"3. Invalid Code Result: {res_bad}")

    # 4. Test Valid Verification
    res_good = verify_otp(test_number, code)
    print(f"4. Valid Code Result:   {res_good}")

    # 5. Test Replay Attack
    res_replay = verify_otp(test_number, code)
    print(f"5. Replay Code Result:  {res_replay}")
    print("=" * 60)
