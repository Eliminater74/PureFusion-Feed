/**
 * Node.js unit tests for pure-function logic in PureFusion Feed content scripts.
 *
 * Uses node:vm to run each source file in a sandboxed context with minimal stubs,
 * then extracts class/object references to call pure prototype methods directly.
 * No bundler, no browser — just Node 18+ with the built-in test runner.
 *
 * Run: node --test scripts/tests/test_core_js.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../purefusion-feed/src');

// ─────────────────────────────────────────────────────────────────────────────
// VM sandbox helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a fresh VM sandbox with minimal browser-API stubs.
 * Extensions use bare globals (PF_Logger, PF_Helpers, etc.) that must be in
 * the context sandbox; JavaScript built-ins (WeakSet, Map, etc.) are
 * automatically available from V8's built-in objects.
 */
function makeSandbox(extras = {}) {
    return vm.createContext({
        window: {},
        PF_Logger: { debug() {}, warn() {}, error() {}, log() {}, info() {} },
        PF_Helpers: {
            hideElement() {},
            dimElement() {},
            findContains() { return []; },
            getClosest() { return null; },
            debounce(fn) { return fn; },
        },
        PF_Storage: {
            getSettings() { return Promise.resolve({}); },
            setLocalData() { return Promise.resolve(); },
            updateSettings() { return Promise.resolve(); },
        },
        PF_RuleEngine: class { constructor() {} apply() { return null; } },
        chrome: {
            i18n: { getMessage() { return ''; } },
            runtime: { id: 'test' },
            storage: {
                sync: { get() {}, set() {} },
                local: { get() {}, set() {} },
            },
        },
        CustomEvent: class CustomEvent { constructor() {} },
        MutationObserver: class { observe() {} disconnect() {} },
        document: {
            getElementById() { return null; },
            querySelectorAll() { return []; },
            body: { querySelectorAll() { return []; } },
        },
        console,
        ...extras,
    });
}

/** Load a source file (path relative to purefusion-feed/src) into a sandbox. */
function loadFile(sandbox, relPath) {
    const src = fs.readFileSync(path.join(SRC, relPath), 'utf8');
    vm.runInContext(src, sandbox);
}

// ─────────────────────────────────────────────────────────────────────────────
// Load the source files once — reuse across tests in each describe block
// ─────────────────────────────────────────────────────────────────────────────

const storageSandbox = makeSandbox();
loadFile(storageSandbox, 'utils/storage.js');
const PF_Storage = storageSandbox.window.PF_Storage;

const cleanerSandbox = makeSandbox();
loadFile(cleanerSandbox, 'content/cleaner-core.js');
const cleanerProto = cleanerSandbox.window.PF_Cleaner.prototype;

const predictorSandbox = makeSandbox();
loadFile(predictorSandbox, 'content/predictor-engine.js');
const predictorProto = predictorSandbox.window.PF_Predictor.prototype;
// _classifyContentType calls this._tokenMatch — bind both on one object
const predictorMethods = {
    _tokenMatch: predictorProto._tokenMatch,
    _classifyContentType: predictorProto._classifyContentType,
};


// ─────────────────────────────────────────────────────────────────────────────
// PF_Storage._deepMerge
// ─────────────────────────────────────────────────────────────────────────────

describe('PF_Storage._deepMerge', () => {
    it('merges flat object properties', () => {
        const result = PF_Storage._deepMerge({ a: 1 }, { b: 2 });
        assert.deepEqual(result, { a: 1, b: 2 });
    });

    it('source values overwrite target values', () => {
        const result = PF_Storage._deepMerge({ a: 1 }, { a: 99 });
        assert.equal(result.a, 99);
    });

    it('recursively merges nested objects', () => {
        const result = PF_Storage._deepMerge(
            { a: { x: 1, y: 2 } },
            { a: { y: 99, z: 3 } }
        );
        assert.deepEqual(result, { a: { x: 1, y: 99, z: 3 } });
    });

    it('does not recurse into arrays — arrays are replaced wholesale', () => {
        const result = PF_Storage._deepMerge(
            { arr: [1, 2, 3] },
            { arr: [4, 5] }
        );
        assert.deepEqual(result.arr, [4, 5]);
    });

    it('creates nested target object when source has nested and target has scalar', () => {
        const result = PF_Storage._deepMerge(
            { a: 'scalar' },
            { a: { nested: true } }
        );
        assert.equal(typeof result.a, 'object');
        assert.equal(result.a.nested, true);
    });

    it('returns target object reference', () => {
        const target = {};
        const returned = PF_Storage._deepMerge(target, { x: 1 });
        assert.equal(returned, target);
    });

    it('handles empty source without modifying target', () => {
        const result = PF_Storage._deepMerge({ a: 1 }, {});
        assert.deepEqual(result, { a: 1 });
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// PF_Storage._runSchemaMigrations
// ─────────────────────────────────────────────────────────────────────────────

describe('PF_Storage._runSchemaMigrations', () => {
    it('sets _pfSchemaVersion to 1 on fresh settings', () => {
        const s = {};
        PF_Storage._runSchemaMigrations(s);
        assert.equal(s._pfSchemaVersion, 1);
    });

    it('upgrades commentPreviewAllowGroups=false → true (v0 → v1)', () => {
        const s = { _pfSchemaVersion: 0, social: { commentPreviewAllowGroups: false } };
        PF_Storage._runSchemaMigrations(s);
        assert.equal(s.social.commentPreviewAllowGroups, true);
    });

    it('upgrades commentPreviewAllowOther=false → true (v0 → v1)', () => {
        const s = { _pfSchemaVersion: 0, social: { commentPreviewAllowOther: false } };
        PF_Storage._runSchemaMigrations(s);
        assert.equal(s.social.commentPreviewAllowOther, true);
    });

    it('preserves explicitly-true commentPreviewAllowGroups', () => {
        const s = { _pfSchemaVersion: 0, social: { commentPreviewAllowGroups: true } };
        PF_Storage._runSchemaMigrations(s);
        assert.equal(s.social.commentPreviewAllowGroups, true);
    });

    it('is idempotent when already at schema version 1', () => {
        const s = { _pfSchemaVersion: 1, social: { commentPreviewAllowGroups: false } };
        PF_Storage._runSchemaMigrations(s);
        // v1 migration does not re-run, so false stays false
        assert.equal(s.social.commentPreviewAllowGroups, false);
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// PF_Cleaner._normalizeText
// ─────────────────────────────────────────────────────────────────────────────

describe('PF_Cleaner._normalizeText', () => {
    const norm = (t) => cleanerProto._normalizeText.call(null, t);

    it('lowercases text', () => {
        assert.equal(norm('Hello World'), 'hello world');
    });

    it('collapses multiple spaces', () => {
        assert.equal(norm('foo   bar\tbaz'), 'foo bar baz');
    });

    it('trims leading and trailing whitespace', () => {
        assert.equal(norm('  hello  '), 'hello');
    });

    it('handles null / undefined gracefully', () => {
        assert.equal(norm(null), '');
        assert.equal(norm(undefined), '');
    });

    it('handles numeric values', () => {
        assert.equal(norm(42), '42');
    });

    it('collapses newlines', () => {
        assert.equal(norm('line1\nline2'), 'line1 line2');
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// PF_Cleaner._normalizeComparableText
// ─────────────────────────────────────────────────────────────────────────────

describe('PF_Cleaner._normalizeComparableText', () => {
    const normCmp = (t) => cleanerProto._normalizeComparableText.call(null, t);

    it('strips diacritics', () => {
        assert.equal(normCmp('café'), 'cafe');
        assert.equal(normCmp('naïve'), 'naive');
        assert.equal(normCmp('résumé'), 'resume');
    });

    it('lowercases', () => {
        assert.equal(normCmp('CAFÉ'), 'cafe');
    });

    it('collapses whitespace and trims', () => {
        assert.equal(normCmp('  héllo   wörld  '), 'hello world');
    });

    it('handles null/undefined', () => {
        assert.equal(normCmp(null), '');
        assert.equal(normCmp(undefined), '');
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// PF_Predictor._tokenMatch
// ─────────────────────────────────────────────────────────────────────────────

describe('PF_Predictor._tokenMatch', () => {
    const tm = (text, token) => predictorMethods._tokenMatch.call(null, text, token);

    it('matches a single word at word boundary', () => {
        assert.equal(tm('the vote was close', 'vote'), true);
    });

    it('does not match inside a longer word', () => {
        // "bill" is inside "billboard" — should not match
        assert.equal(tm('a billboard with text', 'bill'), false);
    });

    it('matches multi-word token via substring', () => {
        assert.equal(tm('i think this is wrong', 'i think'), true);
    });

    it('returns false when token absent', () => {
        assert.equal(tm('hello world', 'congress'), false);
    });

    it('matches at start of string', () => {
        assert.equal(tm('election results are in', 'election'), true);
    });

    it('matches at end of string', () => {
        assert.equal(tm('they called it an election', 'election'), true);
    });

    it('handles adjacent punctuation as word boundary', () => {
        // "senate," — comma after "senate" is not [a-z0-9], so it should match
        assert.equal(tm('the senate, voted yes', 'senate'), true);
    });

    it('does not match "ability" when searching for "bill"', () => {
        assert.equal(tm('ability to vote', 'bill'), false);
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// PF_Predictor._classifyContentType
// ─────────────────────────────────────────────────────────────────────────────

describe('PF_Predictor._classifyContentType', () => {
    const classify = (text) =>
        predictorMethods._classifyContentType.call(predictorMethods, text);

    it('returns Personal/Low for very short text', () => {
        const r = classify('hi');
        assert.equal(r.contentType, 'Personal');
        assert.equal(r.confidence, 'Low');
    });

    it('returns Personal for generic personal content', () => {
        const r = classify("just had the best coffee today with my family!");
        assert.equal(r.contentType, 'Personal');
    });

    it('classifies political content', () => {
        const r = classify(
            'The senate voted yes on the immigration bill. Congress is divided.'
        );
        assert.match(r.contentType, /Political/);
    });

    it('classifies commercial/promotional content', () => {
        const r = classify('Buy now! Limited time offer — use code SAVE10 at checkout. Shop now!');
        assert.equal(r.contentType, 'Commercial');
    });

    it('classifies opinion content', () => {
        const r = classify(
            'I think this is totally wrong. In my opinion, nobody talks about the real issue. Change my mind.'
        );
        assert.match(r.contentType, /Opinion/);
    });

    it('classifies news content', () => {
        const r = classify(
            'Breaking news: according to sources, officials say the investigation is underway. Data shows a clear trend.'
        );
        assert.match(r.contentType, /News/);
    });

    it('confidence rises with more signals', () => {
        const lowConf = classify('The vote was counted.');
        const highConf = classify(
            'The senate vote on immigration policy revealed that congress, government, president, ' +
            'federal, supreme court and constitution all matter in this election cycle.'
        );
        const confidenceRank = { Low: 0, Medium: 1, High: 2 };
        assert.ok(confidenceRank[highConf.confidence] >= confidenceRank[lowConf.confidence]);
    });
});
