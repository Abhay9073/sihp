# 🌪️ AETHERIS: AI-Driven Spatio-Temporal Weather Forecasting & Defense Platform

> Real-Time Geospatial Telemetry, Official IMD Observations API, Severe Weather Anomaly Detection & Cryptographic Defense Command Authentication.

---

## ⚡ Key Features

1. **IMD Surface Observations API**: Real-time integration with `https://api.imd.gov.in/api/v1/current_wx?id=StationId` mapping WMO stations across India (Bhuj, Mandi, Puri, Delhi, Mumbai, etc.).
2. **Centroid Trajectory & Kinematics Engine**: Tracks anomaly centroids (Lat/Lon), speed vectors (km/h), and fluid volume deformation over a 14-day timeline.
3. **Western Disturbances & Monsoon Break Fingerprinter**: Jetstream dip analysis (250 hPa) with automated cloudburst risk indices.
4. **Grad-CAM Explainable AI (XAI)**: Visualizes neural network attention heatmaps for cyclone genesis.
5. **Dual Showdown Split-Screen**: Side-by-side comparative simulation canvas.
6. **Critical Infrastructure & Asset Exposure**: Thermal power grids (765kV), standing crop damage zones, and dam advisories.
7. **50-Year ERA5 Analogy Twin Matcher**: Atmospheric parameter similarity search.
8. **Multi-Channel Mission Authentication**:
   - **Mobile Phone + SMS OTP**: Twilio SDK dispatch with in-memory TTL caching and brute-force protection.
   - **Google Identity Services (GIS)**: Multi-identity account chooser and server-side cryptographic ID token verification.
   - **National Command Authority (NCA)**: Root Super Admin portal.

---

## 🚀 Quick Start (Local)

1. Clone or download this repository.
2. Serve the static dashboard:
   ```bash
   # Using Python
   python -m http.server 3000
   ```
3. Open your browser at:
   `http://localhost:3000/`

---

## 🔐 Environment Variables (`.env`)

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

```env
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_API_KEY_SID=your_twilio_api_key_sid
TWILIO_API_SECRET=your_twilio_api_secret
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
```

---

## 🌐 Free Live Deployment via GitHub Pages

1. In your GitHub repository, go to **Settings** > **Pages**.
2. Under **Build and deployment** > **Branch**, select `main` and root `/`.
3. Click **Save**. Your site will be published at `https://<your-username>.github.io/<repo-name>/`.
