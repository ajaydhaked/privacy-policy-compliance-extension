/**
 * DPDP Compliance Checker — Content Script (Production)
 * Detects privacy policy pages and exposes content extraction.
 */

(() => {
  "use strict";

  const PRIVACY_KEYWORDS = [
    "privacy policy",
    "privacy notice",
    "data protection",
    "data collection",
    "personal data",
    "personal information",
    "cookies policy",
    "cookie notice",
    "information we collect",
    "how we use your data",
    "data processing",
    "data controller",
    "data processor",
    "consent",
    "opt-out",
    "gdpr",
    "dpdp",
    "ccpa",
    "your rights",
    "data retention",
    "third party sharing",
    "third-party sharing",
    "lawful basis",
    "lawful purpose",
    "data fiduciary",
    "data principal",
    "grievance officer",
  ];

  const URL_PATTERNS = [
    "privacy",
    "cookie",
    "data-policy",
    "data-protection",
    "legal/privacy",
    "privacy-policy",
    "privacy-notice",
    "privacypolicy",
  ];

  /**
   * Detects whether the current page is likely a privacy policy.
   */
  function detectPrivacyPolicy() {
    const url = window.location.href.toLowerCase();
    const title = document.title.toLowerCase();

    const urlMatch = URL_PATTERNS.some((kw) => url.includes(kw));
    const titleMatch = PRIVACY_KEYWORDS.some((kw) => title.includes(kw));

    // Scan first 8000 chars of body text for keyword matching
    const bodyText = (document.body?.innerText || "")
      .slice(0, 8000)
      .toLowerCase();
    let keywordHits = 0;
    for (const kw of PRIVACY_KEYWORDS) {
      if (bodyText.includes(kw)) keywordHits++;
    }
    const bodyMatch = keywordHits >= 3;

    const isPrivacyPolicy = urlMatch || titleMatch || bodyMatch;

    let confidence = "low";
    if (urlMatch && (titleMatch || bodyMatch)) confidence = "high";
    else if (urlMatch || titleMatch) confidence = "medium";
    else if (bodyMatch) confidence = keywordHits >= 6 ? "medium" : "low";

    return {
      isPrivacyPolicy,
      confidence,
      keywordHits,
      urlMatch,
      titleMatch,
    };
  }

  /**
   * Extracts full visible text, preferring semantic containers.
   */
  function extractPageContent() {
    const selectors = [
      "main",
      "article",
      '[role="main"]',
      "#content",
      ".content",
      ".privacy-policy",
      ".policy-content",
      "#privacy-policy",
    ];

    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el && el.innerText.trim().length > 500) {
          return el.innerText.trim();
        }
      } catch {
        // Selector may be invalid on some pages
      }
    }

    // Fallback to body, but strip scripts/styles/nav/footer
    const clone = document.body.cloneNode(true);
    const removeSelectors = [
      "script",
      "style",
      "nav",
      "footer",
      "header",
      "noscript",
      "iframe",
      '[role="navigation"]',
      '[role="banner"]',
      '[role="contentinfo"]',
    ];

    removeSelectors.forEach((sel) => {
      clone.querySelectorAll(sel).forEach((el) => el.remove());
    });

    return clone.innerText?.trim() || "";
  }

  // ─── Message Handler ─────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    try {
      if (request.action === "detect") {
        sendResponse(detectPrivacyPolicy());
      } else if (request.action === "extractContent") {
        const content = extractPageContent();
        const detection = detectPrivacyPolicy();
        sendResponse({
          content,
          url: window.location.href,
          title: document.title,
          detection,
        });
      }
    } catch (err) {
      console.error("[DPDP Content] Error handling message:", err);
      sendResponse({ error: err.message });
    }
    return true;
  });

  // ─── Auto-detection on Load ───────────────────────────────────────────────
  function autoDetect() {
    try {
      const result = detectPrivacyPolicy();
      chrome.runtime.sendMessage({
        action: "pageDetected",
        result,
        url: window.location.href,
      });
    } catch {
      // Extension context may be invalidated
    }
  }

  // Run after DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoDetect);
  } else {
    autoDetect();
  }
})();