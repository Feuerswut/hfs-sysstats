'use strict'

const { EventEmitter } = require('events')
if (EventEmitter.defaultMaxListeners < 100) EventEmitter.defaultMaxListeners = 100

function awaitHfsShared(api, config, versionRange, onReady, onLost) {
    const warningKey = '_hfs-shared-warning'
    const fields = { ...config }
    let ready = null, started = false, poller = null

    function check(reason) {
        const shared = api.customApiCall('hfsShared')[0]
        let why = !shared && (reason || 'not installed or not running')
        if (shared && versionRange)
            try { shared.requireVersion(versionRange) } catch (e) { why = e.message }
        const ok = !why
        if (ok === ready) return
        ready = ok
        for (const k of Object.keys(config)) delete config[k]
        if (ok) {
            clearInterval(poller); poller = null
            Object.assign(config, fields)
            if (!started) { started = true; onReady(shared) }
        } else {
            poller ??= setInterval(check, 10_000).unref()
            config[warningKey] = {
                type: 'show_html',
                html: `<div style="padding:.6em 1em;margin-bottom:1em;border-left:4px solid #d33;background:color-mix(in srgb, #d33 12%, transparent)">`
                    + `<b>${api.id} is not running.</b> This plugin requires hfs-shared: ${why}.<br>`
                    + `<i>This message clears automatically once the plugin has been installed. If not, restart this plugin manually.</i><br>`
                    + `<a href="https://github.com/feuerswut/hfs-shared/blob/main/WHY-THIS-WARNING.md" target="_blank" rel="noopener">More information</a></div>`,
            }
            onLost?.()
        }
        api.events.emit('pluginUpdated', { id: api.id, config, started: new Date().toISOString(), badApi: null })
    }

    check()
    api.events.on('pluginStarted:hfs-shared', () => check())
    api.events.on('pluginUpdated', p => p?.id === 'hfs-shared' && check())
    api.events.on('pluginStopped', p => p?.id === 'hfs-shared' && check('stopped'))
    api.events.on('pluginUninstalled', id => id === 'hfs-shared' && check('uninstalled'))
}

module.exports = { awaitHfsShared }
