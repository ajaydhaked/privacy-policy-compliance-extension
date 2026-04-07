/**
 * DPDP Compliance Checker — Background Service Worker (Production)
 */

const DEFAULT_BACKEND_URL = "https://ajaydhaker.pythonanywhere.com/";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const API_TIMEOUT_MS = 60000;

// ─── In-memory stores ────────────────────────────────────────────────────────
const resultCache = new Map();
const detectionState = new Map();

// ─── Badge Helpers ───────────────────────────────────────────────────────────
function setBadge(tabId, text, color) {
  try {
    chrome.action.setBadgeText({ tabId, text });
    chrome.action.setBadgeBackgroundColor({ tabId, color });
  } catch {
    // Tab may no longer exist
  }
}

function clearBadge(tabId) {
  try {
    chrome.action.setBadgeText({ tabId, text: "" });
  } catch {
    // Silently ignore
  }
}

// ─── Icon Helper ─────────────────────────────────────────────────────────────
function setActionIcon(tabId, isPrivacyPolicy) {
  // Optional: swap icon based on detection
  // chrome.action.setIcon({ tabId, path: isPrivacyPolicy ? "icons/active.png" : "icons/default.png" });
}

// ─── Cache Helpers ───────────────────────────────────────────────────────────
function getCached(tabId, url) {
  const entry = resultCache.get(tabId);
  if (!entry) return null;
  if (entry.url !== url) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    resultCache.delete(tabId);
    return null;
  }
  return entry.result;
}

function setCache(tabId, url, result) {
  resultCache.set(tabId, { url, result, timestamp: Date.now() });
}

// ─── API Call ────────────────────────────────────────────────────────────────
async function callComplianceAPI(content, url, title) {
  const storageData = await chrome.storage.local.get(["backendUrl"]);
  const backendUrl = storageData.backendUrl || DEFAULT_BACKEND_URL;

  const payload = { url, title, content };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Backend returned ${response.status}: ${response.statusText}${errorText ? ` — ${errorText.slice(0, 200)}` : ""}`
      );
    }

    const data = await response.json();

    // Normalize response
    if (!data.status) {
      throw new Error("Invalid response: missing 'status' field");
    }

    return data;
  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === "AbortError") {
      throw new Error("Request timeout — backend took too long to respond");
    }
    throw err;
  }
}

// ─── Message Handler ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Page detection from content script
  if (request.action === "pageDetected") {
    const tabId = sender.tab?.id;
    if (!tabId) return;

    detectionState.set(tabId, request.result);
    setActionIcon(tabId, request.result.isPrivacyPolicy);

    if (!request.result.isPrivacyPolicy) {
      clearBadge(tabId);
    }
    return;
  }

  // Compliance check
  if (request.action === "checkCompliance") {
    const { content, url, title, tabId } = request;

    // Return cached if available
    const cached = getCached(tabId, url);
    if (cached) {
      sendResponse({ success: true, result: cached, fromCache: true });
      return true;
    }

    setBadge(tabId, "…", "#6B7280");

    callComplianceAPI(content, url, title)
      .then((result) => {
        setCache(tabId, url, result);

        const isCompliant = result.status === "COMPLIANT";
        setBadge(
          tabId,
          isCompliant ? "✓" : "✗",
          isCompliant ? "#16a34a" : "#dc2626"
        );

        sendResponse({ success: true, result });
      })
      .catch((err) => {
        clearBadge(tabId);
        sendResponse({
          success: false,
          error: err.message || "Failed to reach backend",
        });
      });

    return true; // Keep message channel open
  }

  // Get detection state
  if (request.action === "getDetectionState") {
    sendResponse({ state: detectionState.get(request.tabId) || null });
    return true;
  }

  // Get cached result
  if (request.action === "getCachedResult") {
    sendResponse({ result: getCached(request.tabId, request.url) });
    return true;
  }

  // Clear cache
  if (request.action === "clearCache") {
    resultCache.delete(request.tabId);
    clearBadge(request.tabId);
    sendResponse({ success: true });
    return true;
  }
});

// ─── Tab Lifecycle Cleanup ───────────────────────────────────────────────────
chrome.tabs.onRemoved.addListener((tabId) => {
  resultCache.delete(tabId);
  detectionState.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    resultCache.delete(tabId);
    detectionState.delete(tabId);
    clearBadge(tabId);
  }
});