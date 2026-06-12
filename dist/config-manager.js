'use strict';

const path = require('path');
const fs   = require('fs');

const DEFAULT_CONFIG_PATH = path.join(__dirname, 'default-config.json');
const STORAGE_DIR         = path.join(__dirname, 'storage');
const CONFIG_PATH         = path.join(STORAGE_DIR, 'config.json');
const CACHE_TTL           = 30_000; // re-read disk every 30 s so edits take effect live

let _cache          = null;
let _cacheTimestamp = 0;

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function loadDefaultConfig() {
    try {
        return JSON.parse(fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf8'));
    } catch (e) {
        console.error('[sysstats] Cannot read default-config.json:', e.message);
        return { display: {}, network: {}, disk: {}, docker: {}, charts: {} };
    }
}

function ensureStorageDir() {
    if (!fs.existsSync(STORAGE_DIR)) {
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hardware detection  (runs once on first boot when config.json is missing)
// ─────────────────────────────────────────────────────────────────────────────

async function detectHardware(si) {
    const d = {
        hasBattery:         false,
        hasDocker:          false,
        hasGpu:             false,
        hasCpuTemp:         false,
        gpuControllers:     [],
        networkInterfaces:  [],
        diskDevices:        [],
        generatedAt:        new Date().toISOString(),
    };

    const safe = (fn) => Promise.resolve().then(fn).catch(() => null);

    const [battery, dockerInfo, graphics, temp, ifaces, diskLayout] = await Promise.all([
        safe(() => si.battery()),
        safe(() => si.dockerInfo()),
        safe(() => si.graphics()),
        safe(() => si.cpuTemperature()),
        safe(() => si.networkInterfaces()),
        safe(() => si.diskLayout()),
    ]);

    if (battery)     d.hasBattery = !!battery.hasBattery;
    if (dockerInfo)  d.hasDocker  = !!(dockerInfo.serverVersion);
    if (temp)        d.hasCpuTemp = (temp.main !== null && temp.main > 0);

    if (graphics && graphics.controllers && graphics.controllers.length > 0) {
        d.hasGpu          = true;
        d.gpuControllers  = graphics.controllers.map(c => ({
            vendor: c.vendor || '',
            model:  c.model  || c.name || '',
        }));
    }

    if (ifaces) {
        d.networkInterfaces = ifaces
            .filter(i => !i.internal && !i.virtual)
            .map(i => i.iface);
    }

    if (diskLayout) {
        d.diskDevices = diskLayout.map(dsk => ({
            name: dsk.name,
            type: dsk.type,
            size: dsk.size,
        }));
    }

    return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// Config generation
// ─────────────────────────────────────────────────────────────────────────────

async function generateConfig(si) {
    const cfg      = loadDefaultConfig();
    const detected = await detectHardware(si);

    // Auto-enable sections based on hardware presence
    cfg.display.battery  = detected.hasBattery;
    cfg.display.docker   = detected.hasDocker;
    cfg.display.graphics = detected.hasGpu;
    if (!detected.hasCpuTemp) cfg.display.cpuTemperature = false;

    // Populate detected interface list for user reference
    if (detected.networkInterfaces.length > 0) {
        cfg.network.detectedInterfaces = detected.networkInterfaces;
    }

    // Attach detection metadata (informational, not used by code)
    cfg._detected = detected;

    return cfg;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called once during plugin init.
 * Creates storage/config.json from defaults + hardware detection if not present.
 */
async function initConfig(si) {
    ensureStorageDir();

    if (!fs.existsSync(CONFIG_PATH)) {
        console.log('[sysstats] storage/config.json not found — generating with hardware detection …');
        const cfg = await generateConfig(si);
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
        _cache          = cfg;
        _cacheTimestamp = Date.now();
        console.log('[sysstats] storage/config.json written to', CONFIG_PATH);
    } else {
        // Pre-warm cache
        getConfig();
    }

    return _cache;
}

/**
 * Returns the current config.
 * Re-reads from disk at most once every CACHE_TTL ms so live edits are honoured.
 */
function getConfig() {
    const now = Date.now();
    if (_cache && (now - _cacheTimestamp) < CACHE_TTL) {
        return _cache;
    }

    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
        _cache          = JSON.parse(raw);
        _cacheTimestamp = now;
    } catch (e) {
        console.error('[sysstats] Failed to read storage/config.json:', e.message);
        if (!_cache) _cache = loadDefaultConfig();
    }

    return _cache;
}

module.exports = { initConfig, getConfig };
