/**
 * PureFusion Feed - Service Worker
 * 
 * Handles background tasks, extension installation events, and 
 * declarativeNetRequest logic for blocking hard ad-networks and tracking pixels.
 */

chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "install") {
        console.log("PureFusion Feed Initialized");
        // Open welcome page on first install
        chrome.tabs.create({
            url: chrome.runtime.getURL('src/welcome/welcome.html')
        });
        await setupDNRRules();
    } else if (details.reason === "update") {
        console.log("PureFusion Feed Updated");
    }
});

/**
 * Configure declarativeNetRequest rules to block external tracking/ad payloads.
 * Note: Facebook serves *feed* ads via its own domain graph endpoints, so 
 * DNS/Request blocking is not effective for Sponsored posts (our content script handles that).
 * However, we can block telemetry and third-party trackers injected into the page.
 */
async function setupDNRRules() {
    // Dynamic rule implementation
    const _rules = [
        {
            "id": 1,
            "priority": 1,
            "action": { "type": "block" },
            "condition": {
                "urlFilter": "*://*.facebook.com/tr/*", // Common telemetry/pixel pixel paths
                "resourceTypes": ["xmlhttprequest", "image"]
            }
        },
        {
            "id": 2,
            "priority": 1,
            "action": { "type": "block" },
            "condition": {
                "urlFilter": "*://*.facebook.com/ajax/bz*", // Perf/telemetry tracking
                "resourceTypes": ["xmlhttprequest", "script"]
            }
        }
    ];

    try {
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: _rules.map(r => r.id), // remove existing before adding
            addRules: _rules
        });
        console.log("DNR Ad-Network rules updated.");
    } catch (e) {
        console.error("Failed to update DNR rules:", e);
    }
}

// Keeping the service worker alive if necessary via standard message passing
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PF_PING') {
        sendResponse({ status: 'alive' });
    }
    
    // Allow content scripts and in-page UI to request opening the full settings page
    if (message.action === 'openOptionsPage') {
        chrome.runtime.openOptionsPage();
        sendResponse({ status: 'opening' });
    }
});
