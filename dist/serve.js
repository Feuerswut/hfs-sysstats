'use strict';

const path = require('path');
const fs   = require('fs');

const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css',
    '.js':   'application/javascript',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
    '.map':  'application/json',
};

// ─────────────────────────────────────────────────────────────────────────────
// Core file server
// ─────────────────────────────────────────────────────────────────────────────

function serveFile(ctx, fullPath) {
    try {
        if (!fs.existsSync(fullPath)) {
            ctx.status = 404;
            ctx.type   = 'text/plain';
            ctx.body   = `Not found: ${path.basename(fullPath)}`;
            ctx.stop();
            return;
        }

        const ext         = path.extname(fullPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const isHtml      = ext === '.html';
        const isBinary    = contentType.startsWith('image/') || contentType.startsWith('font/');

        ctx.type = contentType;
        ctx.set('Cache-Control', isHtml ? 'no-cache' : 'public, max-age=3600');

        ctx.body = isBinary
            ? fs.createReadStream(fullPath)
            : fs.readFileSync(fullPath, 'utf8');

        ctx.stop();
    } catch (err) {
        ctx.status = 500;
        ctx.type   = 'text/plain';
        ctx.body   = 'Error serving file: ' + err.message;
        ctx.stop();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler  (called from plugin.js middleware)
// ─────────────────────────────────────────────────────────────────────────────

function handleStaticRequest(ctx, api) {
    const url = ctx.req.url;

    // Root → index.html
    if (url === '/~/stats' || url === '/~/stats/') {
        serveFile(ctx, path.join(PUBLIC_DIR, 'index.html'));
        return;
    }

    // Tailwind JS supplied by the hfs-tailwind dependency plugin
    if (url === '/~/stats/tailwind.js') {
        try {
            const tailwindPath = api.customApiCall('tailwind')[0].path;
            ctx.type = 'application/javascript';
            ctx.set('Cache-Control', 'public, max-age=86400');
            ctx.body = fs.createReadStream(tailwindPath);
        } catch (e) {
            ctx.status = 404;
            ctx.type   = 'application/javascript';
            ctx.body   = '/* tailwind plugin not found */';
        }
        ctx.stop();
        return;
    }

    // Any other file under /~/stats/ → serve from public/
    if (url.startsWith('/~/stats/')) {
        const requested = url.substring('/~/stats/'.length).split('?')[0]; // strip query
        if (requested) {
            // Prevent path traversal
            const safe = path.normalize(requested).replace(/^(\.\.[\\/])+/, '');
            serveFile(ctx, path.join(PUBLIC_DIR, safe));
        } else {
            serveFile(ctx, path.join(PUBLIC_DIR, 'index.html'));
        }
    }
}

module.exports = { handleStaticRequest };
