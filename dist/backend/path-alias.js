'use strict';

// Redirects a legacy URL prefix (configurable via the `pathAlias` plugin
// setting) to the canonical `/~/plugins/<id>` path. Kept as its own small
// module so plugin.js's middleware stays readable.

/**
 * @param {import('koa').Context} ctx
 * @param {object} api            HFS plugin API (for api.getConfig)
 * @param {string} canonicalPath  e.g. `/~/plugins/hfs-sysstats` (no trailing slash)
 * @returns {boolean} true if a redirect was issued (caller must stop)
 */
function redirectAlias(ctx, api, canonicalPath) {
    const alias = (api.getConfig('pathAlias') || '').replace(/\/+$/, '');
    const canonical = canonicalPath.replace(/\/+$/, '');
    if (!alias || alias === canonical) return false;
    if (ctx.path !== alias && !ctx.path.startsWith(alias + '/')) return false;

    const suffix = ctx.path.slice(alias.length);
    ctx.status = 307; // preserve method+body
    ctx.set('Location', canonical + suffix + (ctx.querystring ? '?' + ctx.querystring : ''));
    ctx.body = '';
    ctx.stop();
    return true;
}

module.exports = { redirectAlias };
