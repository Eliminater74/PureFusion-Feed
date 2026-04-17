# PureFusion Feed — Plugin SDK Roadmap

**Status:** Planning  
**Target:** Phases 64–70  
**Last updated:** 2026-04-16

---

## Vision

The Plugin SDK turns PureFusion Feed from a single-team product into an extensible platform. External developers (and power users) can ship their own filters, UI overlays, feed analytics, and post-transformation logic that plugs into PureFusion's existing pipeline — without forking the extension or maintaining a parallel codebase.

Plugins are:
- **First-class citizens** — they run inside the same lifecycle as built-in modules
- **Isolated** — each plugin has its own settings namespace and storage prefix
- **Safe** — no `eval()`, no remote code; all code ships as static files (MV3-compliant)
- **Observable** — the event bus exposes what's happening in the pipeline at all times
- **Reversible** — every action a plugin takes can be undone via the same mechanism as built-in filters

---

## MV3 Constraint Analysis

Chrome Manifest V3 bans `eval()` and `new Function()`. This rules out:
- Runtime script evaluation from user-pasted code
- Dynamic import of remote scripts

**What IS possible:**

| Approach | Feasibility | Used In Roadmap |
|---|---|---|
| Bundled first-party plugin files in `/src/plugins/` | ✅ Full | Phases 64–66 |
| Declarative JSON plugin manifests (no JS) | ✅ Full | Phase 67 |
| File-loaded plugin `.js` via `chrome.scripting.executeScript` | ✅ Partial (extension-internal only) | Phase 68 |
| Companion Chrome Extension messaging via `externally_connectable` | ✅ Full | Phase 70 |
| User-pasted raw JS via `eval()` | ❌ Banned in MV3 | Never |
| Remote script download | ❌ Banned | Never |

**Strategy:** Two-tier plugin model.

- **Tier 1 — Bundled plugins:** first-party `.js` files in `src/plugins/`, registered at boot. Developer contributes via PR. User enables/disables per-plugin from Options → Plugins tab. Zero security risk.
- **Tier 2 — Companion extensions:** advanced third-party devs ship a separate Chrome extension that connects to PureFusion via `chrome.runtime.connect`. PureFusion acts as host, the companion extension is a guest. Fully sandboxed at the OS level.

---

## Architectural Blueprint

### Plugin Host (`src/plugins/plugin-host.js`)

The central coordinator. Loads into `main.js` alongside existing modules.

```
PureFusionApp (main.js)
  └─ PF_PluginHost (plugin-host.js)
       ├─ PluginRegistry (Map<id, PluginRecord>)
       ├─ PluginSettingsManager  ──► PF_Storage (namespaced)
       ├─ PluginEventBus  ──────────► window CustomEvents (PF existing)
       ├─ PluginPipelineRouter  ──► applyToNodes() budget system
       ├─ PluginUIManager  ──────────► options-page injection + popup section
       └─ PluginCompanionBridge  ──► chrome.runtime.connect (Phase 70)
```

### `window.PureFusion` Global API

Exposed once per content script context. Plugins access this from their module scope.

```javascript
window.PureFusion = {
    version: '2.1.0',
    sdkVersion: '1.0.0',

    // Registration (called before boot completes)
    registerPlugin(manifest, module),

    // Runtime API (available after 'pf:sdk_ready' event)
    sdk: {
        events,      // subscribe/emit
        storage,     // namespaced per plugin
        ui,          // toast, styles, badges
        pipeline,    // node operations
        settings,    // read host + plugin settings
        helpers,     // PF_Helpers proxy
        logger       // PF_Logger proxy
    }
};
```

### Plugin Module Interface

Every plugin is a plain object (or class instance) conforming to this interface:

```javascript
const MyPlugin = {
    // REQUIRED
    id: 'my-plugin',                  // Snake/kebab, unique, permanent
    name: 'My Plugin Display Name',
    version: '1.0.0',
    author: 'Your Name',
    description: 'One-sentence description.',

    // OPTIONAL: default settings merged into host settings under plugins.myPlugin
    defaultSettings: {
        enabled: false,
        someOption: 'value'
    },

    // LIFECYCLE (all async-safe)
    async onInit(api) { },            // Called once at boot
    async onDestroy(api) { },         // Called on extension invalidation
    async onEnable(api) { },          // Called when user toggles plugin ON
    async onDisable(api) { },         // Called when user toggles plugin OFF

    // SETTINGS CHANGE
    async onSettingsChange(pluginSettings, hostSettings, api) { },

    // CONTENT PIPELINE (mirrors built-in module pattern)
    async applyToNodes(nodes, api) { },   // Called per MutationObserver batch
    async sweepDocument(api) { },         // Called on full resweep

    // RESTORE HOOK (mirror of _restoreCriticalContainers)
    async onRestore(api) { },             // Called when plugin disabled mid-session

    // OPTIONS UI (optional — return HTML string or null to auto-generate)
    renderOptionsCard(pluginSettings, api) { return null; }
};
```

### The Plugin API Object

Each plugin receives an `api` object scoped to its `id`:

```javascript
api = {
    // ── Pipeline ────────────────────────────────────────────────────────────
    // Hide a post node (uses PF's standard _hidePostNode mechanism)
    hideNode(node, reason),

    // Restore a node hidden by this plugin
    restoreNode(node),

    // Restore ALL nodes this plugin has hidden (called from onRestore)
    restoreByReason(reason),

    // Read PF metadata from a node
    getNodeMeta(node),       // { pfHidden, pfReason, pfScore, pfContentType, ... }

    // Set/get arbitrary plugin-scoped data on a node (WeakMap, no DOM pollution)
    setNodeData(node, key, value),
    getNodeData(node, key),

    // Convenience: query within a batch of nodes
    queryNodes(nodes, cssSelector),

    // ── UI ──────────────────────────────────────────────────────────────────
    showToast(message, type),                               // type: info|success|warn|error
    showActionToast(message, actionLabel, onAction, type),  // with undo button

    // Inject/remove a named <style> block into the page
    injectCSS(id, cssString),
    removeCSS(id),

    // Inject a badge/label onto a post node (positioned relative to heading)
    injectPostBadge(node, { text, color, tooltip }),
    removePostBadges(node),

    // Add a section to the in-page FAB dashboard
    registerFABSection({ id, title, render }),

    // ── Events ──────────────────────────────────────────────────────────────
    events: {
        on(eventName, handler),            // Subscribe to pf:* or plugin:* events
        off(eventName, handler),           // Unsubscribe
        emit(eventName, detail),           // Emit custom 'plugin:my-plugin:*' event
    },

    // ── Storage (namespaced to plugin id) ───────────────────────────────────
    storage: {
        async get(key),                    // reads 'pf_plugin_<id>_<key>'
        async set(key, value),             // writes 'pf_plugin_<id>_<key>'
        async remove(key),
        async getAll(),                    // all keys in this plugin's namespace
        async clear(),                     // nuke all plugin's storage
    },

    // ── Settings ────────────────────────────────────────────────────────────
    getHostSettings(),                     // Full PureFusion settings (read-only)
    getPluginSettings(),                   // This plugin's settings namespace
    async updatePluginSettings(partial),   // Merge partial into plugin's settings

    // ── Utilities ───────────────────────────────────────────────────────────
    helpers: { /* PF_Helpers proxy */ },
    logger: { /* PF_Logger proxy — prefixes [PluginId] */ },
    selectorMap: { /* PF_SelectorMap reference */ },
};
```

---

## Phase Breakdown

---

### Phase 64 — Plugin Host Foundation
**Goal:** Core infrastructure. No user-visible features yet — purely internal wiring.

#### Deliverables

**`src/plugins/plugin-host.js`** (new file)
- `PF_PluginHost` class, added to `manifest.json` content scripts list (after `rule-engine.js`)
- `PluginRegistry` — `Map<id, { manifest, module, api, enabled, error }>` 
- `registerPlugin(manifest, module)` — validates manifest shape, creates per-plugin API object, stores in registry; safe if called before `init()`
- `init(settings)` — calls `onInit(api)` on all registered + enabled plugins; wraps each in try/catch; logs errors to `PF_Logger`; records init timing
- `updateSettings(settings)` — diffs plugin settings namespace, calls `onSettingsChange` only if plugin's own settings changed
- `applyToNodes(nodes)` — iterates enabled plugins that implement `applyToNodes`; respects the 14ms budget by yielding between plugins via `requestIdleCallback`
- `sweepDocument()` — calls `sweepDocument(api)` on plugins that implement it
- `destroy()` — calls `onDestroy(api)` on all enabled plugins

**`src/plugins/index.js`** (new file)
- Single file that imports and registers all bundled plugins
- Loaded in `manifest.json` content scripts, after `plugin-host.js`
- Initially empty except for the scaffolding comment

**`main.js` integration**
- `this.pluginHost = new PF_PluginHost(settings)` in constructor
- Added to `_syncModuleSettings`, `_runNodeProcessorsWithBudget`, `_runLiveResweepPass`, `_destroy`
- `getEffectiveSettings()` disabled-state: `plugins.*: all enabled flags → false`

**`window.PureFusion` global**
- Set once in `plugin-host.js` after `init()`
- Fires `pf:sdk_ready` CustomEvent on `window` when API is fully live

**`default-settings.js`**
- New top-level key: `plugins: {}` — empty object; plugin defaults deep-merged in by each plugin's `defaultSettings`

**Safety Contracts:**
- All plugin hooks wrapped in `try/catch`; a crashing plugin never takes down the host
- Plugin errors logged with `[PLUGIN:id]` prefix and stored in registry as `{ error, ts }`
- Plugins that throw in `onInit` are marked `status: 'error'` and skipped in all subsequent calls
- No plugin can write outside its storage namespace (key prefix enforced by API)

**i18n:** 0 new keys (internal phase)

---

### Phase 65 — First-Party Bundled Plugins (3 Example Plugins)
**Goal:** Prove the SDK with three real, useful plugins. Demonstrate every API surface.

**These ship inside the extension — no security review needed.**

#### Plugin 1: `feed-logger` — Feed Activity Logger

What it does: Records every post author + timestamp + content type to local storage. Shows a summary panel in the in-page FAB.

```javascript
// src/plugins/feed-logger/index.js
{
    id: 'feed-logger',
    name: 'Feed Activity Logger',
    defaultSettings: { enabled: false, maxEntries: 200 },
    
    async onInit(api) {
        this.log = (await api.storage.get('log')) || [];
    },
    
    async applyToNodes(nodes, api) {
        nodes.forEach(node => {
            const meta = api.getNodeMeta(node);
            if (!meta.pfHidden && meta.pfAuthor) {
                this.log.push({ author: meta.pfAuthor, ts: Date.now(), type: meta.pfContentType });
            }
        });
        await api.storage.set('log', this.log.slice(-this.settings.maxEntries));
    },
    
    registerFABSection() {
        return { id: 'feed-logger', title: 'Feed Log', render: () => this._renderPanel() };
    }
}
```

What it proves: `storage`, `getNodeMeta`, `registerFABSection`, `applyToNodes`

---

#### Plugin 2: `post-tagger` — Custom Visual Post Tags

What it does: Let the user define keyword → color/label rules. Matching posts get a colored badge injected next to the PF score chip (e.g., "🎸 Music", "💼 Work").

```javascript
// src/plugins/post-tagger/index.js
{
    id: 'post-tagger',
    name: 'Post Tagger',
    defaultSettings: {
        enabled: false,
        tags: [
            { keyword: 'concert', label: '🎸 Music', color: '#a855f7' },
            { keyword: 'promotion', label: '🏷️ Promo', color: '#f59e0b' }
        ]
    },
    
    async applyToNodes(nodes, api) {
        const tags = api.getPluginSettings().tags || [];
        nodes.forEach(node => {
            const text = node.textContent?.toLowerCase() || '';
            tags.forEach(tag => {
                if (text.includes(tag.keyword)) {
                    api.injectPostBadge(node, { text: tag.label, color: tag.color });
                }
            });
        });
    }
}
```

What it proves: `injectPostBadge`, `getPluginSettings`, options card rendering

---

#### Plugin 3: `session-export` — Feed Session Export

What it does: Tracks visible posts this session (author, snippet, URL, score). Adds a "Export Feed" button to the in-page FAB that downloads a timestamped `.json` file.

```javascript
// src/plugins/session-export/index.js
{
    id: 'session-export',
    name: 'Session Feed Export',
    defaultSettings: { enabled: false, includeHidden: false },
    
    posts: new Map(),
    
    async applyToNodes(nodes, api) {
        nodes.forEach(node => {
            const meta = api.getNodeMeta(node);
            if (meta.pfPostId && !this.posts.has(meta.pfPostId)) {
                this.posts.set(meta.pfPostId, {
                    author: meta.pfAuthor,
                    score: meta.pfScore,
                    hidden: meta.pfHidden,
                    reason: meta.pfReason,
                    url: node.querySelector('a[href*="/posts/"]')?.href
                });
            }
        });
    },
    
    registerFABSection() {
        return {
            id: 'session-export',
            title: 'Export Feed',
            render: () => `<button id="pf-plugin-export-btn">Download Session</button>`
        };
    }
}
```

What it proves: `getNodeMeta` (pfScore, pfPostId, pfAuthor), FAB panel button injection, download trigger

---

#### Options UI — New "Plugins" Tab

- New `tab-plugins` section in `options.html` (after the Data tab)
- Card per plugin: name, version, author, description, enable/disable toggle
- Error state card (red border) if plugin crashed in `onInit`
- Link to plugin source file for transparency

**i18n:** ~8 new keys (tab label, plugin card labels)

---

### Phase 66 — Plugin Settings & Options UI Automation
**Goal:** Plugins declare their settings schema; the host auto-generates the options row UI.

#### Settings Schema Declaration

Plugins can declare a schema alongside `defaultSettings`:

```javascript
settingsSchema: {
    maxEntries: {
        type: 'number',            // 'checkbox' | 'number' | 'select' | 'text'
        label: 'Max log entries',
        description: 'Maximum posts to keep in history.',
        min: 10, max: 1000, step: 10
    },
    exportFormat: {
        type: 'select',
        label: 'Export format',
        options: [
            { value: 'json', label: 'JSON' },
            { value: 'csv',  label: 'CSV'  }
        ]
    }
}
```

#### Auto-Generated UI

`PF_PluginHost.renderPluginSettingsCard(plugin)`:
- Reads `settingsSchema` entries
- Generates the same `auto-height` row HTML the main options page uses
- Wires change handlers that call `api.updatePluginSettings(partial)`
- Injected into the plugin's card in `tab-plugins`
- No `options.js` or `options.html` changes required per-plugin

#### Plugin Settings Storage

- Plugin settings stored under `settings.plugins.<pluginId>` in the main settings object
- `PF_Storage._deepMerge` handles new keys automatically on update
- `getEffectiveSettings()` passes the full settings including `plugins.*` to each module

#### Schema Validation

- `PF_PluginHost._validatePluginSettings(plugin, values)` — type-checks each field on save
- Shows toast on validation failure
- Prevents malformed values from persisting

**i18n:** 0 new keys (plugin labels are plugin-authored, not i18n strings)

---

### Phase 67 — Content Pipeline Hooks (Advanced Node API)
**Goal:** Give plugins full read/write access to the content processing pipeline.

#### Node Metadata Enrichment

`api.getNodeMeta(node)` reads from both PF's existing DOM markers and a plugin's own WeakMap store:

```javascript
// Returned object shape
{
    // PF native (from dataset)
    pfHidden: boolean,
    pfReason: string,           // e.g., 'Ad (Hard Signal)'
    pfPostId: string,           // Resolved post ID
    pfAuthor: string,           // Post author name (set by predictor)
    pfScore: number,            // Predictor score (0–100)
    pfContentType: string,      // 'political', 'news', 'commercial', etc.
    pfContentTone: string,
    pfBlocked: boolean,         // Author is in blocklist
    pfProcessed: boolean,       // Has gone through the pipeline

    // Plugin-set data (from WeakMap, not DOM)
    ...pluginData               // Any data set via api.setNodeData()
}
```

#### Pre-Hide Hook (Cancel Ability)

Plugins can register a pre-hide interceptor:

```javascript
api.events.on('pf:before_hide', (e) => {
    const { node, reason, cancel } = e.detail;
    // Example: prevent hiding if author is on a plugin-managed VIP list
    if (this.vipAuthors.has(api.getNodeMeta(node).pfAuthor)) {
        cancel();    // Prevents _hidePostNode from proceeding
    }
});
```

Implementation: `_hidePostNode` fires `pf:before_hide` before executing; if `e.detail.cancelled`, returns early.

#### Post-Hide Hook (Analytics)

```javascript
api.events.on('pf:element_hidden', (e) => {
    const { reason, tag, role, pagelet } = e.detail;
    // React after any post is hidden (already exists in the event bus)
});
```

#### Node Annotation API

```javascript
// Write plugin-private data to a WeakMap (not visible in DOM)
api.setNodeData(node, 'my-plugin:visitCount', 3);

// Read it back later
const count = api.getNodeData(node, 'my-plugin:visitCount');
```

Implementation: `PF_PluginHost` maintains one `WeakMap<HTMLElement, Map<key, value>>` per plugin — `node → { 'my-plugin:key' → value }`. Keys are scoped to plugin ID automatically.

#### Undo Chip Registration

Plugins can inject their own undo chip actions into the existing undo chip UI:

```javascript
api.registerUndoChipAction(node, {
    label: 'Remove Tag',
    icon: '🏷️',
    async onAction(node) {
        api.removePostBadges(node);
    }
});
```

---

### Phase 68 — Context Menu & Service Worker Plugin Relay
**Goal:** Plugins can add right-click menu items and handle SW↔CS messages.

#### Plugin Context Menu Registration

```javascript
// In plugin onInit():
api.contextMenu.register({
    id: 'save-to-notion',
    label: 'Save to Notion',
    contexts: ['all'],
    async onClicked(info, nodeData) {
        // nodeData = last right-clicked article metadata
        await this.saveToNotion(nodeData);
        api.showToast('Saved to Notion!', 'success');
    }
});
```

Implementation:
- `PF_PluginHost` collects all menu registrations at init time
- Sends `{ type: 'PF_PLUGIN_REGISTER_MENUS', items: [...] }` to service worker during `chrome.runtime.connect`
- Service worker creates sub-items under a new `PureFusion Plugins` parent item in the existing PF context menu tree
- Clicks routed back to content script as `{ type: 'PF_PLUGIN_MENU_CLICK', pluginId, itemId, nodeMetaSnapshot }`

#### Service Worker Plugin Message Relay

```javascript
// Plugin sends a message to a lightweight SW handler:
const response = await api.sendToServiceWorker({ action: 'fetch_notion_db', dbId: '...' });

// Plugin registers a SW-side handler in a companion file (src/plugins/sw-handlers.js):
PF_PluginSWHandlers.register('fetch_notion_db', async ({ dbId }) => {
    const result = await fetch(`https://api.notion.com/v1/databases/${dbId}`, { ... });
    return result.json();
});
```

Implementation:
- `service-worker.js` imports `src/plugins/sw-handlers.js`
- `chrome.runtime.onMessage` routes `PF_PLUGIN_SW_CALL` to the registered handler map
- Responses returned via `sendResponse`

---

### Phase 69 — Plugin Manager UI + Diagnostics
**Goal:** Full plugin lifecycle management from the Options page.

#### Plugin Manager Features

**Options → Plugins Tab:**
- Card per plugin showing: name, version, author, description badge, enable toggle
- Status indicator: ✅ Running / ⚠️ Error / ⏸ Disabled
- "Plugin Details" expand: shows timing stats, error last message, call counts
- "Reset Plugin Data" button (clears plugin's storage namespace with confirmation)

**Plugin Performance Panel (extends existing Diagnostics overlay):**

```
┌─ Plugins ────────────────────────────────────┐
│  feed-logger     3ms avg · 142 node calls    │
│  post-tagger     1ms avg · 142 node calls    │
│  session-export  0ms avg · 142 node calls    │
└──────────────────────────────────────────────┘
```

- Per-plugin `applyToNodes` call duration tracked via `performance.now()`
- Rolling 10-batch average
- Shown in diagnostics overlay when enabled
- Alerts if plugin exceeds 5ms average (adds to PF's budget pressure warning)

**Plugin Error Recovery:**
- If plugin's `onInit` fails, card shows "Plugin failed to load" with red border + error message
- "Retry" button re-runs `onInit` without page reload
- "Disable" button marks as disabled and skips permanently until next load

**Plugin Import (Phase 68.5 — optional stretch goal):**

A "Load Plugin File" button in the Plugins tab:
- Opens file picker for `.js` files
- File content injected via `chrome.scripting.executeScript` with `world: 'MAIN'` and the file as a user script
- File stored in `pf_plugin_user_<hash>` local storage (as text, re-injected on each load)
- MV3 note: `chrome.scripting.executeScript` with `func` (not `files`) can execute a user-loaded function if structured as a factory — no `eval()` needed
- High-risk; requires explicit "I understand this runs code from a file on my computer" confirmation

---

### Phase 70 — Companion Extension API (Third-Party Developer Tier)
**Goal:** Enable fully independent Chrome extensions to connect to PureFusion as a plugin host.

#### How it Works

A third-party developer builds their own Chrome extension. It declares PureFusion's extension ID in its manifest:

```json
// Third-party extension manifest.json
{
  "externally_connectable": {
    "ids": ["<PureFusion extension ID>"]
  }
}
```

On install, the companion extension connects:

```javascript
// companion-extension/background.js
const port = chrome.runtime.connect('<PF_EXTENSION_ID>', { name: 'pf-companion-v1' });

port.postMessage({
    type: 'PF_COMPANION_REGISTER',
    manifest: {
        id: 'my-companion',
        name: 'My Companion Plugin',
        version: '1.0.0',
        capabilities: ['read_node_meta', 'inject_badges', 'read_events']
    }
});

port.onMessage.addListener((msg) => {
    if (msg.type === 'PF_COMPANION_NODE_BATCH') {
        // Receive serialized node metadata for each pipeline batch
        msg.nodes.forEach(meta => { /* process */ });
    }
});
```

#### Security Model

PureFusion acts as a **trusted host**; companions are **untrusted guests**:

| Capability | Available to Companion | Rationale |
|---|---|---|
| Read node metadata (score, reason, author, content type) | ✅ | Read-only, no DOM access |
| Inject a post badge (text + color only) | ✅ | PF controls DOM write |
| Emit events to PF event bus | ✅ (namespaced) | |
| Subscribe to `pf:element_hidden` | ✅ | |
| Directly access or mutate the DOM | ❌ | DOM lives in content script context |
| Call `hideNode` | ❌ | Companions request hide via message; PF validates |
| Access other plugins' storage | ❌ | Storage namespaced, keys enforced |
| Request hide of a node | ⚠️ Via message, PF validates reason string | PF applies with allowlist guard |

#### PF Service Worker Bridge

```javascript
// service-worker.js addition
chrome.runtime.onConnectExternal.addListener((port) => {
    if (port.name !== 'pf-companion-v1') return;
    PF_CompanionBridge.accept(port);
});
```

`PF_CompanionBridge` (new file `src/background/companion-bridge.js`):
- Validates companion manifest on connect
- Stores port + capabilities
- Relays approved node metadata snapshots (no raw DOM references — serialized JSON only)
- Rate-limits message throughput (max 60 messages/sec per companion)
- Disconnects companions that exceed limits or send malformed messages

---

## Bundled Plugin Ideas (Backlog)

These are candidates to build as first-party bundled plugins once the SDK is live:

| Plugin | Description | Key APIs |
|---|---|---|
| **Feed Logger** | Session history of all posts seen | `applyToNodes`, `storage`, `FAB panel` |
| **Post Tagger** | Keyword → color/label badges | `injectPostBadge`, `pluginSettings` |
| **Session Export** | Download feed to JSON/CSV | `getNodeMeta`, `FAB button` |
| **Custom Score Override** | User sets manual scores for keywords | `events.on('pf:before_score')`, `setNodeData` |
| **Saved Search** | Text search across session feed | `applyToNodes`, `storage`, `FAB UI` |
| **Topic Heatmap** | Bar chart: content types seen this session | `events.on('pf:element_hidden')`, `FAB panel` |
| **Read Progress** | Track % of feed consumed today | `storage`, `wellbeing integration` |
| **Language Filter** | Detect and hide posts in specific languages | `applyToNodes`, CSS-class inject |
| **Mood Guard** | Time-of-day filter (e.g., no negativity before 9am) | `applyToNodes`, `events`, clock check |
| **Smart Notifications** | Custom browser notification for friends' posts | `applyToNodes`, `chrome.notifications` |
| **Notion/Obsidian Sync** | One-click save post to Notion database | `contextMenu.register`, `SW message relay` |
| **Accessibility Layer** | Force alt-text, ARIA, contrast ratios | `applyToNodes`, `injectCSS` |

---

## File Plan

```
src/
  plugins/
    plugin-host.js          ← Phase 64: core host + API factory
    index.js                ← Phase 64: plugin registration barrel
    feed-logger/
      index.js              ← Phase 65: Plugin 1
    post-tagger/
      index.js              ← Phase 65: Plugin 2
    session-export/
      index.js              ← Phase 65: Plugin 3
    sw-handlers.js          ← Phase 68: SW-side plugin message handlers

  background/
    companion-bridge.js     ← Phase 70: external extension bridge

manifest.json               ← Add plugin files to content_scripts
default-settings.js         ← Add plugins: {} top-level key
options.html                ← Add tab-plugins section
options.js                  ← Add plugin settings loader
options.css                 ← Add plugin card styles
main.js                     ← Wire PF_PluginHost into lifecycle
```

---

## Phase Dependency Graph

```
Phase 64 (Foundation)
    └─ Phase 65 (Example Plugins)
         └─ Phase 66 (Settings Auto-UI)
              ├─ Phase 67 (Pipeline Hooks)     ← depends on 64+65
              ├─ Phase 68 (Context Menu + SW)  ← depends on 64+65
              └─ Phase 69 (Plugin Manager UI)  ← depends on 64+65+66
                   └─ Phase 70 (Companion API) ← depends on all
```

Phases 67, 68, and 69 can be developed in parallel once 66 is done.

---

## Definition of Done (Per Phase)

All plugin SDK phases must satisfy:

- [ ] All built-in module tests still pass (no regression)
- [ ] All three example plugins initialize without error in a clean Chrome profile
- [ ] Plugin crash in `onInit` does not affect host extension operation
- [ ] Plugin `destroy()` completes cleanly — no lingering listeners or DOM modifications
- [ ] Storage isolation verified: plugin A cannot read plugin B's keys
- [ ] Diagnostics overlay shows plugin timing when diagnostics is enabled
- [ ] Options → Plugins tab shows each plugin with correct status
- [ ] Roadmap updated with implementation details

---

## Developer Guide (Draft)

### Quick Start: Build a Plugin

**1. Create the file**

```
src/plugins/my-plugin/index.js
```

**2. Write the module**

```javascript
// src/plugins/my-plugin/index.js
const MyPlugin = {
    id: 'my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    author: 'Your Name',
    description: 'Highlights posts containing the word "pizza".',

    defaultSettings: {
        enabled: false,
        keyword: 'pizza',
        highlightColor: '#f97316'
    },

    async onInit(api) {
        this.api = api;
        this.settings = api.getPluginSettings();
        api.injectCSS('my-plugin-styles', `
            .pf-plugin-my-highlight { outline: 2px solid var(--pf-plugin-color); }
        `);
    },

    async onSettingsChange(settings) {
        this.settings = settings;
    },

    async applyToNodes(nodes, api) {
        if (!this.settings.enabled) return;
        const keyword = this.settings.keyword.toLowerCase();
        const color = this.settings.highlightColor;

        nodes.forEach(node => {
            if (node.textContent?.toLowerCase().includes(keyword)) {
                node.style.setProperty('--pf-plugin-color', color);
                node.classList.add('pf-plugin-my-highlight');
                api.injectPostBadge(node, { text: `🍕 ${keyword}`, color });
            }
        });
    },

    async onDestroy(api) {
        document.querySelectorAll('.pf-plugin-my-highlight').forEach(el => {
            el.classList.remove('pf-plugin-my-highlight');
        });
        api.removeCSS('my-plugin-styles');
    }
};

// Register with the host
if (window.PureFusion?.registerPlugin) {
    window.PureFusion.registerPlugin(MyPlugin);
}
```

**3. Register in the barrel file**

```javascript
// src/plugins/index.js
// Import is resolved at bundle time — no dynamic imports needed
// (Each plugin file is listed in manifest.json content_scripts)
```

**4. Add to `manifest.json` content_scripts**

```json
{
    "js": [
        "...existing scripts...",
        "src/plugins/plugin-host.js",
        "src/plugins/my-plugin/index.js"
    ]
}
```

**5. Test**
- Load unpacked extension
- Open Options → Plugins — confirm your plugin card appears
- Enable it — confirm `onInit` fires (check console for `[PLUGIN:my-plugin]` log)
- Scroll Facebook — confirm `applyToNodes` runs on new posts

---

## Open Questions (Decisions Needed Before Phase 64)

1. **Plugin ID uniqueness:** Should we maintain a central registry of claimed IDs to prevent collisions? (Probably yes for companion extensions; not needed for bundled.)

2. **Plugin settings location:** Store under `settings.plugins.<id>` in the main sync settings object, or as separate `pf_plugin_<id>_settings` local storage keys? **Recommendation:** main settings object for simplicity + sync across devices.

3. **applyToNodes ordering:** Should plugins run before or after built-in modules? **Recommendation:** After cleaner, after predictor, before diagnostics. Configurable per-plugin via `processorPhase: 'pre-cleaner' | 'post-cleaner' | 'post-predictor'`.

4. **Pre-hide cancel hook:** Is cancelling a hide from a plugin too dangerous (plugin could re-allow ads)? **Recommendation:** Only allow cancel if plugin is allowlist-gated (i.e., plugin checks its own allowlist, not bypasses PF's allowlist entirely). Block `pf:before_hide` cancellation for `Ad (Hard Signal)` and `Sponsored Post` reasons.

5. **Companion extension ID:** PureFusion's Chrome Web Store extension ID must be shared with companion developers. This is a public ID — no security implication, but document it clearly.

---

*Next action: Begin Phase 64 implementation when given go decision.*
