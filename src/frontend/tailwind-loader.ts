// ---------------------------------------------------------------------------
// tailwind-loader.ts -- optional, progressive-enhancement loader for the
// Tailwind browser/JIT runtime.
//
// The backend exposes `<canonical>/api/tailwind.js` as a soft passthrough: it
// only responds with a real script when a plugin providing Tailwind's
// browser build happens to be installed, and 404s otherwise. This loader
// fetches that endpoint and, on success, appends the script to <head> so it
// can scan the DOM and activate any Tailwind utility classes already present
// in the body-content markup.
//
// This is fire-and-forget and must never block or delay the rest of the
// page: the dashboard's own Sass already gives every element a complete,
// usable look on its own, so a missing/failing fetch here is a silent no-op,
// not an error condition.
// ---------------------------------------------------------------------------

export function loadOptionalTailwind(): void {
    // Relative URL, same convention as the `api` fetch in dashboard.ts: the
    // backend guarantees the canonical path always has a trailing slash, so
    // this resolves to `<canonical>/api/tailwind.js` regardless of the
    // plugin's folder name.
    fetch('api/tailwind.js')
        .then(res => {
            if (!res.ok) {
                console.debug('sysstats: Tailwind runtime not available, continuing without it')
                return
            }
            const script = document.createElement('script')
            script.src = 'api/tailwind.js'
            document.head.appendChild(script)
        })
        .catch(err => {
            console.debug('sysstats: Tailwind runtime fetch failed, continuing without it', err)
        })
}
