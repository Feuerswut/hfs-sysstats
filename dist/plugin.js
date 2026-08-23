// Plugin metadata for HFS v3
exports.version     = 3.4;
exports.description = "System Statistics Dashboard — Full systeminformation integration with dark mode and config-driven sections";
exports.apiRequired = 8.65;

exports.author = "feuerswut";
exports.repo   = "feuerswut/hfs-sysstats";
exports.depend = [{ repo: "feuerswut/hfs-shared" }];

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
        helperText:   "'basic' sends a persistent install id, plugin version, platform & arch. 'detailed' adds CPU cores, RAM, disk count, OS distro/release. 'off' sends nothing.",
        xs: 12,
    },
    pathAlias: {
        type:         'string',
        defaultValue: '/~/stats',
        label:        'Path alias (redirect)',
        helperText:   'Old URL that should redirect here. Leave empty for none.',
        xs: 12,
    },
    useCustomFrontend: {
        type:         'boolean',
        defaultValue: false,
        label:        'Use custom frontend',
        helperText:   "Serve dashboard files from storage/custom-frontend/ instead of the bundled ones (falls back to the bundled files when a requested file isn't present there).",
        xs: 12,
    },
};

exports.changelog = [
    { version: 3.4, message: "Ping now declares its record class explicitly." },
];

const fs = require('fs');

const si = require('./systeminformation');
const { schedulePing }        = require('./usage-ping');
const { initConfig }          = require('./config-manager');
const { handleStaticRequest } = require('./serve');
const { handleApiRequest }    = require('./api');

exports.init = async api => {
    const shared = api.customApiCall('hfsShared')[0];
    shared.requireVersion('^1.0.0');

    const canonicalPath = shared.canonicalPath(api).slice(0, -1);

    function authOpts() {
        return {
            publicAccess: api.getConfig('allowPublicAccess'),
            hideFromUnauthorized: api.getConfig('hideFromUnauthorized'),
        };
    }

    // Start optional daily telemetry ping
    schedulePing(api, si, exports.version);

    // Bootstrap config — generates storage/config.json from defaults + hardware detection
    // if it doesn't exist yet. Subsequent boots just cache-read the existing file.
    await initConfig(si);

    return { middleware };

    async function middleware(ctx) {
        // Legacy alias, dashboard-URL normalization, auth, and serving the
        // bundled/custom-frontend index.html at the canonical root are all
        // handled here -- see hfs-shared's servePublic.
        if (shared.servePublic(ctx, api, {
            ...authOpts(),
            pathAlias: api.getConfig('pathAlias'),
            useCustomFrontend: api.getConfig('useCustomFrontend'),
            distDir: __dirname,
        })) return;

        // Only handle our namespace
        const { path } = ctx;
        if (path !== canonicalPath && !path.startsWith(canonicalPath + '/')) return;

        // ── Auth for everything else in this namespace (the API) ──────────
        if (shared.auth.gate(ctx, api, authOpts())) return;

        // ── Route dispatch ───────────────────────────────────────────────────
        const sub = path.slice(canonicalPath.length); // starts with '/'
        if (sub === '/api') {
            await handleApiRequest(ctx, si);
            return;
        }

        // ── GET /api/tailwind.js ─────────────────────────────────────────────
        // Optional runtime enhancement: the dashboard body content carries
        // Tailwind utility classes alongside its own Sass, and loads this
        // script client-side to activate them. Purely a soft lookup -- no
        // exports.depend on the plugin providing it, so the page stays fully
        // usable via its bundled Sass alone when it isn't installed.
        if (sub === '/api/tailwind.js') {
            const tailwind = api.customApiCall('tailwind');
            if (!tailwind || !tailwind[0]) {
                ctx.status = 404;
                ctx.type   = 'application/json';
                ctx.body   = JSON.stringify({ error: 'Tailwind is not available' });
                ctx.stop();
                return;
            }
            ctx.type = 'application/javascript';
            ctx.set('Cache-Control', 'public, max-age=86400');
            ctx.body = fs.createReadStream(tailwind[0].path);
            ctx.stop();
            return;
        }

        // Any other static asset (the dashboard root itself was already
        // handled by servePublic above): only intervene for the
        // custom-frontend override; the bundled dist/public/ files are
        // otherwise served automatically by HFS core.
        handleStaticRequest(ctx, api, canonicalPath);
    }
};
