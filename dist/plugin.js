// Plugin metadata for HFS v3
exports.version     = 2.0;
exports.description = "System Statistics Dashboard — Full systeminformation integration with dark mode and config-driven sections";
exports.apiRequired = 8.65;

exports.author = "feuerswut";
exports.repo   = "feuerswut/hfs-sysstats";
exports.depend = [{ repo: "feuerswut/hfs-tailwind" }];

exports.config = {
    allowPublicAccess: {
        type:       'boolean',
        defaultValue: false,
        helperText: "Allow users to access the Stats panel without login.",
        xs: 6,
    },
    hideFromUnauthorized: {
        type:       'boolean',
        defaultValue: false,
        helperText: "Make the plugin invisible to non-logged users (returns nothing instead of 403).",
        xs: 6,
    },
    usagePing: {
        type:         'select',
        defaultValue: 'basic',
        label:        'Usage Ping',
        options:      ['off', 'basic', 'detailed'],
        helperText:   "'basic' sends platform & arch. 'detailed' adds CPU cores, RAM, disk count, OS distro. 'off' sends nothing.",
        xs: 12,
    },
};

exports.changelog = [
    { version: 2.0, message: "Full systeminformation integration. Separate serve.js/api.js/config-manager.js. storage/config.json with hardware detection. Dark mode support." },
    { version: 1.8, message: "Added optional daily usage ping (basic / detailed / off)." },
    { version: 1.7, message: "Separate Modern Tailwind distribution into another plugin. Please install before updating." },
];

const si = require('./systeminformation');
const { schedulePing }        = require('./usage-ping');
const { initConfig }          = require('./config-manager');
const { handleStaticRequest } = require('./serve');
const { handleApiRequest }    = require('./api');

exports.init = async api => {
    const auth               = api.require('./auth');
    const getCurrentUsername = auth.getCurrentUsername;

    // Start optional daily telemetry ping
    schedulePing(api, si, exports.version);

    // Bootstrap config — generates storage/config.json from defaults + hardware detection
    // if it doesn't exist yet. Subsequent boots just cache-read the existing file.
    await initConfig(si);

    return { middleware };

    async function middleware(ctx) {
        const url = ctx.req.url;

        // Only handle our namespace
        if (!url.startsWith('/~/stats')) return;

        // ── Auth gate ────────────────────────────────────────────────────────
        const username = getCurrentUsername(ctx);
        if (!username) {
            if (!api.getConfig('allowPublicAccess')) {
                if (api.getConfig('hideFromUnauthorized')) return; // pretend we don't exist
                ctx.status = 403;
                ctx.body   = '';
                ctx.stop();
                return;
            }
        }

        // ── Route dispatch ───────────────────────────────────────────────────
        if (url === '/~/stats/api' || url.startsWith('/~/stats/api?')) {
            await handleApiRequest(ctx, si);
            return;
        }

        handleStaticRequest(ctx, api);
    }
};
