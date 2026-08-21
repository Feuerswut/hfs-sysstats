# sysstats by feuerswut

A plugin to view your system stats (CPU, RAM, etc. on a handy dashboard, comes with a json API.)

## Install
Easy install via HFS UI:
<img width="1228" height="509" alt="Image" src="https://github.com/user-attachments/assets/923adda4-d8ce-4e92-aa93-ae98c07c3102" />

## Access Dashboard
To access, visit
`/~/plugins/hfs-sysstats/` (the folder name the plugin is installed under; login is required by default -> otherwise 403, or nothing at all if "hide from unauthorized" is on).

Change the public dashboard visibility under plugin options.

If you're upgrading from a version that hardcoded the dashboard at `/~/stats`,
that old URL still works: set "Path alias (redirect)" in the plugin options
(defaults to `/~/stats`) and it 307-redirects to the new canonical URL. Leave
it empty to disable the redirect.

### Custom frontend

Turn on "Use custom frontend" in the plugin options to serve your own files
from `storage/custom-frontend/` (an `index.html` there replaces the bundled
dashboard) instead of the bundled ones. Any file not found in that folder
falls back to the bundled version.

## Usage Ping
This plugin contains a daily usage ping, so I know what kind of architectures are used and how I can improve the dashboard. By default, only limited data is sent ("basic" usage ping), you can opt-out completely by setting the usage ping to "off", or give me more information by setting it to "detailed".

## Development
The dashboard frontend is TypeScript + Sass, built with esbuild/sass/postcss
(no framework). `npm install`, then `npm run build` (or `npm run build:watch`)
compiles `src/frontend/` + `src/styles/` into `dist/public/`. `npm run
typecheck` runs a `tsc --noEmit` pass. The backend (`dist/plugin.js`,
`dist/serve.js`, `dist/api.js`, `dist/config-manager.js`, `dist/usage-ping.js`,
`dist/backend/path-alias.js`) is hand-written CommonJS and isn't part of the
build.

# LICENSE
[Chart.js](https://github.com/chartjs/Chart.js) is licensed under the MIT License.

[systeminformation](https://github.com/sebhildebrandt/systeminformation) is verbatim-copied and also licensed under MIT.

This plugin is licensed under the GNU Affero Public License (AGPLv3).
