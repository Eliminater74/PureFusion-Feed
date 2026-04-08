/**
 * PureFusion Feed - Welcome Onboarding Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    // 0. Set Dynamic Version
    const versionEl = document.getElementById('pf-welcome-version');
    if (versionEl && typeof chrome !== 'undefined' && chrome.runtime.getManifest) {
        versionEl.textContent = 'v' + chrome.runtime.getManifest().version;
    }
    
    const btnOpenOptions = document.getElementById('btnOpenOptions');

    if (btnOpenOptions) {
        btnOpenOptions.addEventListener('click', () => {
            // Chrome standard way to open the extension's options page
            if (chrome.runtime.openOptionsPage) {
                chrome.runtime.openOptionsPage();
            } else {
                // Fallback for older versions or other environments
                window.open(chrome.runtime.getURL('src/options/options.html'));
            }
        });
    }

    // Add a simple "Star" background effect if needed in the future
    // console.log("PureFusion Onboarding Ready.");
});
