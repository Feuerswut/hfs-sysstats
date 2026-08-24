/**
 * usage-ping.js
 * Daily usage ping for hfs-sysstats.
 * Fires exactly 1 hour after plugin init, then repeats every 24 h.
 *
 * Levels:
 *   "off"      – no data is sent at all
 *   "basic"    – persistent install id, plugin version, platform, arch  (default)
 *   "detailed" – basic + CPU cores, RAM bucket, disk count, OS distro/release
 */

const { getOrCreateHostId } = require('./config-manager');

const PING_URL = 'https://feuerswut.de/~/ingest'; // replace with your endpoint
const INITIAL_DELAY_MS = 60 * 60 * 1000;       // 1 hour after init
const MS_PER_DAY       = 24 * 60 * 60 * 1000;  // repeat interval

/**
 * Schedule a single ping and then reschedule every 24 h.
 *
 * @param {object} api   – HFS plugin API object
 * @param {object} si    – systeminformation module
 */
function schedulePing(api, si, pluginVersion) {
    const runAndReschedule = () => {
        sendPing(api, si, pluginVersion).catch(() => { /* silently ignore network/parse errors */ });
        setTimeout(runAndReschedule, MS_PER_DAY);
    };

    setTimeout(runAndReschedule, INITIAL_DELAY_MS);
}

/**
 * Build the payload and POST it to the ping endpoint.
 */
async function sendPing(api, si, pluginVersion) {
    const level = api.getConfig('usagePing');
    if (level === 'off') return;

    // --- basic: persistent install id, plugin version, platform, arch ---
    const osInfoBasic = await si.osInfo();
    const payload = {
        level,
        hostId: getOrCreateHostId(),
        pluginVersion: pluginVersion ?? null,
        platform: normalizePlatform(osInfoBasic.platform),
        arch: normalizeArch(osInfoBasic.arch),
    };

    // --- detailed: basic + system info ---
    if (level === 'detailed') {
        const osInfo = osInfoBasic;
        const [cpu, mem, disk] = await Promise.all([
            si.cpu(),
            si.mem(),
            si.fsSize(),
        ]);

        payload.platform      = osInfo.platform ?? 'unknown';
        payload.arch          = osInfo.arch     ?? 'unknown';
        payload.distro        = osInfo.distro   ?? 'unknown';
        payload.release       = osInfo.release  ?? 'unknown';
        payload.cpuCores      = cpu.cores       ?? null;
        // RAM bucketed to nearest power-of-two GiB to avoid precise fingerprinting
        payload.ramBucketGb   = ramBucket(mem.total);
        payload.diskCount     = Array.isArray(disk) ? disk.length : null;
    }

    const response = await fetch(PING_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000), // 10 s timeout
    });

    if (!response.ok) {
        throw new Error(`Ping returned HTTP ${response.status}`);
    }
}

/**
 * Round bytes to the nearest power-of-two GiB (1, 2, 4, 8, 16, …).
 * Returns null if the value is falsy.
 */
function ramBucket(bytes) {
    if (!bytes) return null;
    const gb = bytes / (1024 ** 3);
    return Math.pow(2, Math.round(Math.log2(gb)));
}

/**
 * Buckets a raw systeminformation platform string down to the coarse
 * category the basic ping reports.
 */
function normalizePlatform(platform) {
    const p = (platform || '').toLowerCase();
    if (p.includes('win')) return 'windows';
    if (p.includes('mac') || p.includes('darwin') || p.includes('osx')) return 'mac';
    if (p.includes('linux')) return 'linux';
    return 'other';
}

/**
 * Buckets a raw systeminformation arch string down to x86/x64 for the
 * basic ping (32-bit vs. 64-bit only, no per-arch fingerprinting).
 */
function normalizeArch(arch) {
    const a = (arch || '').toLowerCase();
    return a.includes('64') ? 'x64' : 'x86';
}

module.exports = { schedulePing };