'use strict';

const path = require('path');
const fs   = require('fs');

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
// Custom-frontend override
//
// The bundled dashboard (dist/public/*) is served automatically by HFS core
// once the plugin's URL is the canonical `/~/plugins/<id>` path — no plugin
// code needed for that case. This module only has one job left: when the
// `useCustomFrontend` setting is on, serve files from the plugin's storage
// folder instead, falling back to the bundled files (via returning undefined,
// which lets HFS's own automatic serving take over) whenever the requested
// file isn't present in the custom folder.
// ─────────────────────────────────────────────────────────────────────────────

function serveFile(ctx, fullPath) {
    const ext         = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isHtml      = ext === '.html';
    const isBinary     = contentType.startsWith('image/') || contentType.startsWith('font/');

    ctx.type = contentType;
    ctx.set('Cache-Control', isHtml ? 'no-cache' : 'public, max-age=3600');

    ctx.body = isBinary
        ? fs.createReadStream(fullPath)
        : fs.readFileSync(fullPath, 'utf8');

    ctx.stop();
}

/**
 * @param {import('koa').Context} ctx
 * @param {object} api            HFS plugin API
 * @param {string} canonicalPath  e.g. `/~/plugins/hfs-sysstats` (no trailing slash)
 * @returns {undefined} always — either serves the custom file (calling
 *          ctx.stop()) or does nothing, so the caller lets HFS's automatic
 *          public/ serving handle the request.
 */
function handleStaticRequest(ctx, api, canonicalPath) {
    if (!api.getConfig('useCustomFrontend')) return; // let HFS serve dist/public/ automatically

    const customDir = path.join(api.storageDir, 'custom-frontend');

    let requested = ctx.path.slice(canonicalPath.length).replace(/^\/+/, '');
    if (!requested) requested = 'index.html';

    // Prevent path traversal, and confirm the resolved path stays inside customDir.
    const safe     = path.normalize(requested).replace(/^(\.\.[\\/])+/, '');
    const fullPath = path.join(customDir, safe);
    const resolvedCustomDir = path.resolve(customDir) + path.sep;
    if (!path.resolve(fullPath).startsWith(resolvedCustomDir)) return;

    try {
        if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) return; // fall through to bundled files
        serveFile(ctx, fullPath);
    } catch (err) {
        ctx.status = 500;
        ctx.type   = 'text/plain';
        ctx.body   = 'Error serving custom frontend file: ' + err.message;
        ctx.stop();
    }
}

module.exports = { handleStaticRequest };
