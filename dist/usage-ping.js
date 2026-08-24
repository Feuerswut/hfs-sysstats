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

const crypto = require('crypto');
const { getOrCreateHostId } = require('./config-manager');

const PING_URL = 'https://feuerswut.de/~/ingest'; // replace with your endpoint
const POW_URL  = PING_URL + '/pow';
const INITIAL_DELAY_MS = 60 * 60 * 1000;       // 1 hour after init
const MS_PER_DAY       = 24 * 60 * 60 * 1000;  // repeat interval
const POW_MAX_ATTEMPTS = 5_000_000;            // safety cap against a misconfigured difficulty

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

    const powHeaders = await fetchPowHeaders().catch(() => ({}));

    const response = await fetch(PING_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...powHeaders },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000), // 10 s timeout
    });

    if (!response.ok) {
        throw new Error(`Ping returned HTTP ${response.status}`);
    }
}

/**
 * If the ingest endpoint currently requires a proof-of-work solution
 * (see hfs-ingest's README), fetches a challenge and solves it, returning
 * the headers to attach to the ping POST. Returns {} when the feature is
 * off, the probe fails, or the endpoint is some older/unrelated server that
 * doesn't have a /pow route at all -- the ping still gets sent either way,
 * and the server decides whether to accept it.
 */
async function fetchPowHeaders() {
    const res = await fetch(POW_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return {};
    const info = await res.json();
    if (!info || !info.required) return {};

    const solution = solvePow(info.challenge, info.difficulty);
    return {
        'X-Ingest-Pow-Challenge': info.challenge,
        'X-Ingest-Pow-Solution':  solution,
    };
}

/**
 * Brute-forces a solution string such that sha256(`${challenge}:${solution}`),
 * hex-encoded, starts with `difficulty` zero characters -- the same plain
 * SHA-256 hex-prefix scheme a browser can solve via crypto.subtle.digest.
 */
function solvePow(challenge, difficulty) {
    const prefix = '0'.repeat(difficulty);
    for (let i = 0; i < POW_MAX_ATTEMPTS; i++) {
        const solution = i.toString(36);
        const hex = crypto.createHash('sha256').update(`${challenge}:${solution}`).digest('hex');
        if (hex.startsWith(prefix)) return solution;
    }
    throw new Error('Could not solve proof of work within the attempt budget');
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