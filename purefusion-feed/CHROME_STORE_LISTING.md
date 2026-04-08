# Chrome Web Store Release Package: PureFusion Feed

This document contains all the text and configuration details you need to fill out your Developer Dashboard for a professional release.

---

## 📝 Product Details

### Summary (Max 150 characters)
*Copy this into the "Summary" field:*
Premium God-Mode Feed Manager with Ad-Blocking, AI Insights, and Privacy Guard. Reclaim your social experience from the algorithm.

### Description (Full)
*Copy this into the "Description" markdown field:*

**Step into a cleaner, faster, and more private social experience.**

PureFusion Feed isn't just an ad-blocker—it's a complete restructuring engine for modern social media. Designed for power users, PureFusion gives you "God Mode" control over your Facebook feed, eradicating the noise of algorithmic manipulation and replacing it with absolute clarity.

**🚀 CORE FEATURES:**

- **Algorithmic Disarmament:** Say goodbye to "Suggested For You", "People You May Know", and invasive Group injections. If it's not from your friends or pages you follow, it's gone.
- **Aggressive Ad Eradication:** Nests deep into the virtual DOM to identify and remove sponsored posts that traditional blockers miss.
- **Localized AI Intelligence:** Leverage built-in AI (utilizing free Gemini or local Chrome Nano models) to summarize long posts, decode clickbait, and rewrite sensational headlines into factual summaries.
- **Widescreen Mode:** Break the rigid center-column constraints and utilize your entire ultrawide monitor for a more comfortable reading experience.
- **Digital Wellbeing:** Fight doom-scrolling with a built-in session timer, grayscale mode, and infinite-scroll "break walls."
- **Privacy Guard:** Includes a "Screenshot Anonymizer" that blurs names and pictures with one click—perfect for sharing posts safely.

**🔒 PRIVACY-FIRST ARCHITECTURE:**
PureFusion operates with a strict local-first philosophy. Your data, API keys, and interaction history never leave your device. All AI processing happens via your own keys or your local machine's hardware.

**⚙️ HOW IT WORKS:**
Once installed, PureFusion docks a sleek dashboard button (or floating action icon) directly into your Facebook interface. From the quick-access popup or the full glassmorphism options panel, you can toggle dozens of high-performance filters to tailor your feed precisely to your needs.

---

## 📂 Classification & Language

- **Category:** `Productivity` or `Social & Communication`
- **Language:** `English`

---

## 🖼️ Graphic Assets

### Store Icon
- **Requirement:** 128x128 pixels
- **File to use:** [purefusion-feed/icons/icon128.png](file:///i:/GITHUB/Projects/Chrome/Extension/purefusion-feed/icons/icon128.png)

### Promo Tiles (Generated for you)
- **Small Promo Tile (440x280):** [purefusion_promo_small_1775612106850.png](file:///C:/Users/elimi/.gemini/antigravity/brain/7ef4d24f-409a-4226-8c23-686e869e9c20/purefusion_promo_small_1775612106850.png)
- **Large Promo Tile (920x680):** [purefusion_promo_large_1775612123815.png](file:///C:/Users/elimi/.gemini/antigravity/brain/7ef4d24f-409a-4226-8c23-686e869e9c20/purefusion_promo_large_1775612123815.png)

---

## 🧪 Test Instructions (For Reviewers)

*Copy this into the "Test Instructions" section of the dashboard:*

1. Install the extension.
2. Navigate to https://www.facebook.com and log in with any active account.
3. Observe the floating "PF" action icon in the bottom right or the header button.
4. Open the PureFusion Dashboard.
5. Toggle "Widescreen Mode" or "Ads Blocking" to see immediate visual changes to the feed layout.
6. (Optional) Input a Gemini/OpenAI API key in the AI Engine tab to test post summarization.

---

## 🔒 Privacy & Permission Justifications

Google requires these to be filled out in the "Privacy" tab to ensure transparency.

### Single Purpose
PureFusion Feed provides absolute control over the social media feed experience by intelligently filtering distraction trays, removing sponsored content, and providing privacy-preserving local AI enhancements.

### Permissions
*Copy these into the respective justification boxes:*

- **storage:** "Required to store the user's customized blocklists, UI preferences (like Widescreen or Compact Mode), and local AI scoring configurations securely and consistently across the user's synced devices."
- **declarativeNetRequest:** "Used to perform high-performance, zero-latency blocking of invasive tracking pixels and third-party ad-network payloads before they are even loaded into the browser, ensuring maximum privacy."
- **scripting:** "Necessary to inject the core filtering engine and visual themes directly into the social media interface. This allows for real-time DOM restructuring and the removal of complex, dynamically generated sponsored elements."
- **alarms:** "Powers the extension's wellbeing features like 'Digest Mode' and 'Session Timers,' allowing the extension to perform scheduled checks at regular intervals without wasting background resources."
- **Host Permissions (*://*.facebook.com/*):** "Essential for the extension to read and modify the specific social media websites it's designed to enhance. It permits the identification of sponsored content and the application of user-selected interface refinements."

### Remote Code Usage
- **Question:** Are you using remote code?
- **Answer:** Select **"No, I am not using remote code."**
- **Internal Note:** PureFusion is built entirely on localized Vanilla JS and handles all AI logic via local environment APIs or the user's own keys. No external scripts are fetched or executed.

---

## 📊 Data Usage & Disclosures

This section is for the final part of the **Privacy** tab in the Developer Dashboard.

### What user data do you plan to collect?
- **Answer:** Leave **everything unchecked.** 
- **Reason:** PureFusion Feed operates 100% locally. You do not collect, harvest, or transmit any user data to your own servers or any third-party marketing servers. Even AI requests are handled via the user's own keys directly to the provider (OpenAI/Google).

### Certification Disclosures
*You must check all three of these boxes to comply with Google's policies:*
- [x] I do not sell or transfer user data to third parties.
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

### Privacy Policy URL
*You must provide a public URL. Use your official GitHub link:*
`https://raw.githubusercontent.com/Eliminater74/PureFusion-Feed/refs/heads/main/PRIVACY_POLICY.md`


---

## 🔒 Privacy Policy
Use the content from the project's [PRIVACY_POLICY.md](file:///i:/GITHUB/Projects/Chrome/Extension/purefusion-feed/PRIVACY_POLICY.md) file.
