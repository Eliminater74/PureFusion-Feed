/**
 * PureFusion Feed - Welcome Onboarding Logic
 */

document.addEventListener('DOMContentLoaded', () => {
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
