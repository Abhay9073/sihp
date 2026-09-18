"""
==============================================================================
AETHERIS GOOGLE IDENTITY SERVICES (GIS) BACKEND VERIFIER
File: google_auth_service.py
Language: Python 3
Package: google-auth (pip install google-auth requests python-dotenv)
==============================================================================
"""

import os
from typing import Dict, Any

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

def assign_defense_clearance(email: str, hosted_domain: str = "") -> Dict[str, str]:
    domain = hosted_domain or (email.split("@")[1] if "@" in email else "")

    if domain == "isro.gov.in":
        return {
            "role": "Chief Meteorological Scientist",
            "clearance": "Level-5 National Defense Clearance",
            "organization": "Indian Space Research Organisation (ISRO)"
        }
    elif domain == "imd.gov.in":
        return {
            "role": "Director General of Meteorology",
            "clearance": "Level-5 National Defense Clearance",
            "organization": "India Meteorological Department (IMD)"
        }
    elif domain in ("nic.in", "ndma.gov.in"):
        return {
            "role": "Crisis Response Commander",
            "clearance": "Level-4 Tactical Defense Clearance",
            "organization": "National Disaster Response Force (NDRF)"
        }
    elif domain == "moes.gov.in":
        return {
            "role": "Lead Climate AI Scientist",
            "clearance": "Level-4 Strategic Research Clearance",
            "organization": "Ministry of Earth Sciences (MoES)"
        }
    else:
        return {
            "role": "Authorized Field Observer",
            "clearance": "Level-3 Field Clearance",
            "organization": "Civil Defense Network"
        }

def verify_google_id_token(id_token_str: str) -> Dict[str, Any]:
    """
    Verifies a Google ID token string using Google's official Python auth library.
    Checks signature against Google certs, checks expiration, and validates audience.
    """
    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests

        client_id = os.getenv("GOOGLE_CLIENT_ID")
        if not client_id or "your_google_client_id" in client_id:
            return {"success": False, "error": "GOOGLE_CLIENT_ID environment variable is not configured in .env"}

        if not id_token_str:
            return {"success": False, "error": "ID token string cannot be empty"}

        # Cryptographically verify the token
        id_info = id_token.verify_oauth2_token(id_token_str, requests.Request(), client_id)

        # Confirm issuer is Google
        if id_info.get("iss") not in ["accounts.google.com", "https://accounts.google.com"]:
            return {"success": False, "error": f"Invalid issuer: {id_info.get('iss')}"}

        # Check email verification
        if not id_info.get("email_verified", False):
            return {"success": False, "error": "User email is not verified by Google"}

        email = id_info.get("email", "")
        hd = id_info.get("hd", "")
        clearance = assign_defense_clearance(email, hd)

        user_profile = {
            "google_id": id_info.get("sub"),
            "email": email,
            "name": id_info.get("name", email.split("@")[0]),
            "picture": id_info.get("picture"),
            "hosted_domain": hd or "gmail.com",
            "role": clearance["role"],
            "clearance": clearance["clearance"],
            "organization": clearance["organization"],
            "login_method": "google_gis"
        }

        return {"success": True, "user": user_profile}

    except Exception as e:
        return {"success": False, "error": f"Verification failed: {str(e)}"}
