// Plugin metadata for HFS v3
exports.version     = 3.1;
exports.description = "System Statistics Dashboard — Full systeminformation integration with dark mode and config-driven sections";
exports.apiRequired = 8.65;

exports.author = "feuerswut";
exports.repo   = "feuerswut/hfs-sysstats";

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
    { version: 3.1, message: "Re-added Tailwind utility classes to the dashboard's body content (stats cards, charts, tables) as an optional runtime-loaded enhancement -- a soft /api/tailwind.js passthrough to a Tailwind browser-runtime provider, not the old vendored CSS file or hard dependency. The header stays pure hand-written Sass, untouched. The page remains fully styled and usable via its own Sass alone whenever the runtime script isn't available." },
    { version: 3.0, message: "Canonical URL is now /~/plugins/<id> (was hardcoded to /~/stats). Added a pathAlias redirect for the old URL, a custom-frontend override, and rebuilt the dashboard as TypeScript + Sass, dropping the vendored unpurged Tailwind build and the hfs-tailwind dependency." },
    { version: 2.0, message: "Full systeminformation integration. Separate serve.js/api.js/config-manager.js. storage/config.json with hardware detection. Dark mode support." },
    { version: 1.8, message: "Added optional daily usage ping (basic / detailed / off)." },
    { version: 1.7, message: "Separate Modern Tailwind distribution into another plugin. Please install before updating." },
];

const fs = require('fs');

const si = require('./systeminformation');
const { schedulePing }        = require('./usage-ping');
const { initConfig }          = require('./config-manager');
const { handleStaticRequest, serveCanonicalRoot } = require('./serve');
const { handleApiRequest }    = require('./api');
const { redirectAlias }       = require('./backend/path-alias');

exports.init = async api => {
    const auth               = api.require('./auth');
    const getCurrentUsername = auth.getCurrentUsername;

    const canonicalPath = `/~/plugins/${api.id}`;

    // Start optional daily telemetry ping
    schedulePing(api, si, exports.version);

    // Bootstrap config — generates storage/config.json from defaults + hardware detection
    // if it doesn't exist yet. Subsequent boots just cache-read the existing file.
    await initConfig(si);

    return { middleware };

    async function middleware(ctx) {
        // ── Legacy-URL redirect ─────────────────────────────────────────────────
        if (redirectAlias(ctx, api, canonicalPath)) return;

        // Only handle our namespace
        const { path } = ctx;
        if (path !== canonicalPath && !path.startsWith(canonicalPath + '/')) return;

        // A bare canonical path (no trailing slash) or an explicit
        // /index.html must both redirect to the one canonical, trailing-slash
        // URL - never serve content at either, so the dashboard's relative
        // asset URLs (main.js, styles.css, ...) resolve against the right
        // base and the page only ever "lives" at one URL.
        if (path === canonicalPath || path === canonicalPath + '/index.html') {
            ctx.status = 307;
            ctx.set('Location', canonicalPath + '/' + (ctx.querystring ? '?' + ctx.querystring : ''));
            ctx.body = '';
            ctx.stop();
            return;
        }

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

        // The canonical trailing-slash root: HFS's own automatic serving
        // 405s on this exact path (no literal file is named ''), so it's
        // served explicitly instead of falling through to core.
        if (path === canonicalPath + '/') {
            serveCanonicalRoot(ctx, api);
            return;
        }

        // Any other static asset: only intervene for the custom-frontend
        // override; the bundled dist/public/ files are otherwise served
        // automatically by HFS core once the request falls through here.
        handleStaticRequest(ctx, api, canonicalPath);
    }
};
