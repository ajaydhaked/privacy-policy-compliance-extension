/**
 * DPDP Compliance Checker — Popup Controller (Production)
 */

// ─── Constants ───────────────────────────────────────────────────────────────
const DEFAULT_BACKEND_URL = "https://ajaydhaker.pythonanywhere.com/";

// ─── DOM Helpers ─────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// ─── DOM References ──────────────────────────────────────────────────────────
const elements = {
  settingsToggle: $("settingsToggle"),
  settingsPanel: $("settingsPanel"),
  backendUrl: $("backendUrl"),
  saveSettings: $("saveSettings"),
  settingsStatus: $("settingsStatus"),

  detectionDot: $("detectionDot"),
  detectionLabel: $("detectionLabel"),
  detectionSub: $("detectionSub"),

  checkBtn: $("checkBtn"),
  clearCacheBtn: $("clearCacheBtn"),

  resultSection: $("resultSection"),
  resultBadge: $("resultBadge"),
  resultBadgeIcon: $("resultBadgeIcon"),
  resultBadgeText: $("resultBadgeText"),
  cacheTag: $("cacheTag"),

  violationsBlock: $("violationsBlock"),
  violationsList: $("violationsList"),
  violationsCount: $("violationsCount"),
  compliantBlock: $("compliantBlock"),
  reasoningBlock: $("reasoningBlock"),
  reasoningToggle: $("reasoningToggle"),
  reasoningContent: $("reasoningContent"),
  reasoningText: $("reasoningText"),

  loadingSection: $("loadingSection"),
  errorSection: $("errorSection"),
  errorTitle: $("errorTitle"),
  errorMsg: $("errorMsg"),
  retryBtn: $("retryBtn"),
};

// ─── State ───────────────────────────────────────────────────────────────────
let currentTab = null;

// ─── Initialization ──────────────────────────────────────────────────────────
async function init() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    currentTab = tab;

    if (!tab) {
      setDetection("error", "No active tab found");
      return;
    }

    // Load saved backend URL
    const { backendUrl } = await chrome.storage.local.get("backendUrl");
    elements.backendUrl.value = backendUrl || DEFAULT_BACKEND_URL;

    // Check for cached result
    const { result: cached } = await chrome.runtime.sendMessage({
      action: "getCachedResult",
      tabId: tab.id,
      url: tab.url,
    });

    if (cached) {
      showResult(cached, true);
    }

    // Get detection state
    const { state } = await chrome.runtime.sendMessage({
      action: "getDetectionState",
      tabId: tab.id,
    });

    if (state) {
      updateDetectionBanner(state);
    } else {
      // Try detecting from the content script
      try {
        const detection = await chrome.tabs.sendMessage(tab.id, {
          action: "detect",
        });
        updateDetectionBanner(detection);
      } catch {
        setDetection("unable", "Cannot inspect this page");
      }
    }
  } catch (err) {
    setDetection("error", "Extension error");
    console.error("[DPDP Checker] Init error:", err);
  }
}

// ─── Detection ───────────────────────────────────────────────────────────────
function updateDetectionBanner(state) {
  if (!state) {
    setDetection("unknown", "Detection unavailable");
    return;
  }

  if (state.isPrivacyPolicy) {
    elements.detectionDot.className = "detection-dot is-pp";
    elements.detectionLabel.textContent = "Privacy Policy Detected";

    const reasons = [];
    if (state.urlMatch) reasons.push("URL pattern");
    if (state.titleMatch) reasons.push("page title");
    if (state.keywordHits) reasons.push(`${state.keywordHits} keywords`);

    elements.detectionSub.textContent = reasons.length
      ? `Confidence: ${state.confidence} · ${reasons.join(", ")}`
      : `Confidence: ${state.confidence}`;
  } else {
    elements.detectionDot.className = "detection-dot not-pp";
    elements.detectionLabel.textContent = "Not a Privacy Policy";
    elements.detectionSub.textContent =
      "You can still run compliance check manually.";
  }
}

function setDetection(type, label, sub = "") {
  elements.detectionDot.className = `detection-dot ${type}`;
  elements.detectionLabel.textContent = label;
  elements.detectionSub.textContent = sub;
}

// ─── UI State Transitions ────────────────────────────────────────────────────
function showLoading() {
  elements.resultSection.classList.add("hidden");
  elements.errorSection.classList.add("hidden");
  elements.loadingSection.classList.remove("hidden");
  elements.checkBtn.disabled = true;
  elements.clearCacheBtn.disabled = true;
}

function hideLoading() {
  elements.loadingSection.classList.add("hidden");
  elements.checkBtn.disabled = false;
  elements.clearCacheBtn.disabled = false;
}

function resetResultUI() {
  elements.violationsBlock.classList.add("hidden");
  elements.compliantBlock.classList.add("hidden");
  elements.reasoningBlock.classList.add("hidden");
  elements.cacheTag.classList.add("hidden");
  elements.violationsList.innerHTML = "";
}

function showResult(result, fromCache = false) {
  hideLoading();
  resetResultUI();
  elements.errorSection.classList.add("hidden");
  elements.resultSection.classList.remove("hidden");

  const isCompliant = result.status === "COMPLIANT";

  // Badge
  elements.resultBadge.className = `result-badge ${isCompliant ? "compliant" : "non-compliant"}`;
  elements.resultBadgeIcon.textContent = isCompliant ? "✓" : "✗";
  elements.resultBadgeText.textContent = isCompliant
    ? "COMPLIANT"
    : "NON-COMPLIANT";

  // Cache tag
  if (fromCache) {
    elements.cacheTag.classList.remove("hidden");
  }

  // Compliant block
  if (isCompliant) {
    elements.compliantBlock.classList.remove("hidden");
  }

  // Violations
  if (
    !isCompliant &&
    Array.isArray(result.violations) &&
    result.violations.length > 0
  ) {
    elements.violationsBlock.classList.remove("hidden");
    elements.violationsCount.textContent = result.violations.length;

    elements.violationsList.innerHTML = result.violations
      .map(
        (v, i) =>
          `<li>
            <span class="violation-number">${i + 1}</span>
            <span class="violation-text">${escapeHtml(v)}</span>
          </li>`
      )
      .join("");
  }

  // Reasoning (uncomment below to enable)
  // if (result.reasoning) {
  //   elements.reasoningBlock.classList.remove("hidden");
  //   elements.reasoningText.textContent = result.reasoning;
  // }
}

function showError(title, msg) {
  hideLoading();
  elements.resultSection.classList.add("hidden");
  elements.errorSection.classList.remove("hidden");
  elements.errorTitle.textContent = title;
  elements.errorMsg.textContent = msg;
}

// ─── Utilities ───────────────────────────────────────────────────────────────
function escapeHtml(str) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ─── Core: Compliance Check ──────────────────────────────────────────────────
async function checkCompliance() {
  if (!currentTab) return;

  showLoading();

  // Extract content from the page
  let extracted;
  try {
    extracted = await chrome.tabs.sendMessage(currentTab.id, {
      action: "extractContent",
    });
  } catch {
    showError(
      "Cannot Access Page",
      "Extension cannot read this page. Try opening a regular website."
    );
    return;
  }

  if (!extracted || !extracted.content || extracted.content.trim().length < 50) {
    showError(
      "Insufficient Content",
      "No meaningful text content found on this page."
    );
    return;
  }

  // Send to background for API call
  try {
    const response = await chrome.runtime.sendMessage({
      action: "checkCompliance",
      content: extracted.content,
      url: extracted.url,
      title: extracted.title,
      tabId: currentTab.id,
    });

    if (response.success) {
      showResult(response.result, response.fromCache || false);
    } else {
      const isNetwork =
        response.error?.includes("fetch") ||
        response.error?.includes("Failed") ||
        response.error?.includes("NetworkError") ||
        response.error?.includes("timeout");

      showError(
        isNetwork ? "Backend Unreachable" : "Evaluation Failed",
        isNetwork
          ? "Ensure the backend server is running. Configure URL in settings ⚙️"
          : response.error || "An unexpected error occurred."
      );
    }
  } catch (err) {
    showError("Communication Error", "Failed to communicate with the extension background service.");
    console.error("[DPDP Checker] Runtime message error:", err);
  }
}

// ─── Event Listeners ─────────────────────────────────────────────────────────
elements.settingsToggle.addEventListener("click", () => {
  elements.settingsPanel.classList.toggle("hidden");
});

elements.saveSettings.addEventListener("click", async () => {
  const url = elements.backendUrl.value.trim();
  if (!url) {
    elements.settingsStatus.textContent = "URL cannot be empty";
    elements.settingsStatus.style.color = "var(--danger)";
    return;
  }

  try {
    new URL(url); // validate URL format
  } catch {
    elements.settingsStatus.textContent = "Invalid URL format";
    elements.settingsStatus.style.color = "var(--danger)";
    setTimeout(() => {
      elements.settingsStatus.textContent = "";
    }, 3000);
    return;
  }

  await chrome.storage.local.set({ backendUrl: url });
  elements.settingsStatus.style.color = "var(--success)";
  elements.settingsStatus.textContent = "Saved ✓";
  setTimeout(() => {
    elements.settingsStatus.textContent = "";
  }, 2000);
});

elements.clearCacheBtn.addEventListener("click", async () => {
  if (!currentTab) return;
  await chrome.runtime.sendMessage({
    action: "clearCache",
    tabId: currentTab.id,
  });
  resetResultUI();
  elements.resultSection.classList.add("hidden");
  elements.errorSection.classList.add("hidden");
});

elements.checkBtn.addEventListener("click", checkCompliance);

elements.retryBtn.addEventListener("click", checkCompliance);

// Reasoning toggle
elements.reasoningToggle?.addEventListener("click", () => {
  elements.reasoningToggle.classList.toggle("expanded");
  elements.reasoningContent.classList.toggle("hidden");
});

// ─── Bootstrap ───────────────────────────────────────────────────────────────
init();