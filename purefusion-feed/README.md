# PureFusion Feed

> "Your Facebook. Filtered. Predicted. Perfected."

A next-generation Facebook cleaner, ad-blocker, content filter, and AI-powered feed manager extension for Chrome.

## Architecture & Tech Stack
- Vanilla JavaScript (ES2022) with Manifest V3
- DeclarativeNetRequest for network-level blocklist filtering
- MutationObserver based real-time layout cleanup
- Local privacy-first intelligence tracking (No telemetry)

## Installation for Development

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer Mode** toggle in the top right
3. Click **Load unpacked**
4. Select the `purefusion-feed` folder from this directory

## Structure
- `src/content/` - Content scripts executing exclusively on facebook domains
- `src/background/` - Service workers keeping the state and DNR networks active
- `src/options/` - Frontend for advanced configuration
- `src/popup/` - Instant action popup interface 
- `src/data/` - Static configurations and resilient DOM selector mappings
- `src/utils/` - Global abstractions layer

*(Internal build references are isolated)*
