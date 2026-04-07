# DPDP Compliance Checker — Browser Extension

Chrome/Edge compatible (Manifest V3) extension that detects privacy policy pages and evaluates DPDP Act compliance.

---

## Directory Structure

```
extension/
├── manifest.json        # MV3 manifest
├── content.js           # Privacy policy detection + page extraction
├── background.js        # Service worker: API calls, caching, badge
├── popup.html           # Extension popup layout
├── popup.js             # Popup controller
├── styles.css           # Dark-themed premium UI
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## How to Load in Chrome / Edge

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer Mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder
5. The extension icon appears in your toolbar

---

## Features

| Feature | Detail |
|---|---|
| **Auto-detection** | Scans URL, page title, and body text for privacy policy keywords |
| **Manual check** | "Check Compliance" button works on any page |
| **Detection badge** | Purple `PP` badge on identified privacy policy tabs |
| **Result badge** | Green `✓` (compliant) or Red `✗` (non-compliant) |
| **Result caching** | Results cached per-tab for 5 minutes (Re-check clears it) |
| **Configurable backend** | Set your backend URL via the ⚙️ settings panel |

---

## Backend Integration

The extension sends a `POST` request to your backend:

### Request
```json
POST http://localhost:8000/check-compliance
Content-Type: application/json

{
  "url": "https://example.com/privacy",
  "title": "Privacy Policy | Example",
  "content": "<full page text>"
}
```

### Expected Response
```json
{
  "status": "COMPLIANT" | "NON_COMPLIANT",
  "violations": ["Missing opt-out mechanism", "No lawful purpose specified"],
  "reasoning": "Explanation of compliance assessment..."
}
```

> **No backend yet?** The extension gracefully shows an "Backend Unreachable" error. Configure the URL via ⚙️ settings once your backend is ready.

---

## Backend Setup (When Ready)

Suggested Flask backend entry point at `backend/app.py`:

```python
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route("/check-compliance", methods=["POST"])
def check_compliance():
    data = request.json
    content = data.get("content", "")
    # TODO: call your LLM/rules evaluator here
    return jsonify({
        "status": "NON_COMPLIANT",
        "violations": ["Example violation"],
        "reasoning": "Placeholder response"
    })

if __name__ == "__main__":
    app.run(port=8000)
```

Install deps: `pip install flask flask-cors`
Run: `python backend/app.py`

---

## Keyword Detection Logic

The content script scores pages using:
- **URL pattern match** → High confidence (`/privacy`, `/cookie`, `/data-policy`)
- **Page title match** → Medium confidence
- **Body text** → 3+ keyword hits from a list of 23 DPDP/GDPR-relevant terms

All three signals are combined; any match triggers the "Privacy Policy Detected" banner.
