/* ---------------------------------------------------------------------------
   build.mjs -- src/ to dist/public/.

   Plain Node ESM. Calls the esbuild and sass JS APIs directly: no bundler
   framework, no gulp/grunt, no webpack/vite/rollup.

   What it produces (only dist/public/ is touched -- everything else in
   dist/, the backend .js files and dist/storage/, is hand-maintained and
   never generated):

     dist/public/index.html    copy of src/frontend/index.html
     dist/public/main.js       esbuild IIFE bundle of src/frontend/main.ts
     dist/public/styles.css    src/styles/entry/style.scss via sass + postcss
     dist/public/chart.min.js  copy of src/frontend/vendor/chart.min.js

   Not minified, on purpose: this is a small dashboard served from a local
   HFS box, and main.js is never parsed as text by anything (unlike
   plugin.js, whose exports.* lines HFS reads with a regex before loading
   it) -- so a readable, diffable bundle beats a few saved kilobytes.

   Usage:
     node build/build.mjs            one-shot build
     node build/build.mjs --watch    build, then rebuild on any src/ change
   --------------------------------------------------------------------------- */

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as esbuild from 'esbuild'
import * as sass from 'sass'
import postcss from 'postcss'
import autoprefixer from 'autoprefixer'
import cssnano from 'cssnano'

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const ROOT     = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC      = path.join(ROOT, 'src')
const FRONTEND = path.join(SRC, 'frontend')
const STYLES   = path.join(SRC, 'styles')
const DIST     = path.join(ROOT, 'dist')
const PUBLIC   = path.join(DIST, 'public')

const rel = p => path.relative(ROOT, p).replaceAll('\\', '/')
const log = (...a) => console.log(...a)

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} kB`
}

async function copyFile(from, to) {
  await fsp.mkdir(path.dirname(to), { recursive: true })
  await fsp.copyFile(from, to)
}

// ---------------------------------------------------------------------------
// 1. Clean -- dist/public/ only
// ---------------------------------------------------------------------------

async function cleanPublic() {
  const resolved = path.resolve(PUBLIC)
  if (resolved === path.resolve(DIST) || !resolved.startsWith(path.resolve(DIST) + path.sep))
    throw new Error(`refusing to clean ${resolved}: not a subdirectory of dist/`)

  // maxRetries: on Windows a delete can fail with EPERM/EBUSY while anything
  // still holds a handle on a file in the tree -- a running HFS instance
  // streaming a file, a virus scanner, an editor. Those handles are released
  // in milliseconds, so retrying beats failing the build.
  await fsp.rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  await fsp.mkdir(resolved, { recursive: true })
  log(`  clean          ${rel(resolved)}/`)
}

// ---------------------------------------------------------------------------
// 2. TypeScript bundle (esbuild)
// ---------------------------------------------------------------------------

async function buildApp() {
  const outfile = path.join(PUBLIC, 'main.js')
  const result = await esbuild.build({
    entryPoints: [path.join(FRONTEND, 'main.ts')],
    outfile,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2022'],
    charset: 'utf8',
    minify: false,
    sourcemap: false,
    legalComments: 'inline',
    logLevel: 'warning',
    metafile: true,
  })
  const size = result.metafile.outputs[rel(outfile)]?.bytes ?? (await fsp.stat(outfile)).size
  log(`  esbuild        ${rel(outfile)}  (${kb(size)})`)
}

// ---------------------------------------------------------------------------
// 3. Styles -- sass, then postcss (autoprefixer + cssnano)
// ---------------------------------------------------------------------------

async function buildStyles() {
  const entry   = path.join(STYLES, 'entry', 'style.scss')
  const outfile = path.join(PUBLIC, 'styles.css')

  const compiled = sass.compile(entry, {
    style: 'expanded',
    loadPaths: [STYLES],
    sourceMap: false,
  })

  const processed = await postcss([
    autoprefixer(),
    cssnano({ preset: 'default' }),
  ]).process(compiled.css, { from: entry, to: outfile })

  processed.warnings().forEach(w => console.warn(`  [postcss] ${w.toString()}`))

  await fsp.mkdir(path.dirname(outfile), { recursive: true })
  await fsp.writeFile(outfile, processed.css, 'utf8')
  log(`  sass+postcss   ${rel(outfile)}  (${kb(Buffer.byteLength(processed.css))})`)
}

// ---------------------------------------------------------------------------
// 4. Static assets -- index.html, vendored Chart.js
// ---------------------------------------------------------------------------

async function copyAssets() {
  await copyFile(path.join(FRONTEND, 'index.html'), path.join(PUBLIC, 'index.html'))
  log(`  copy           ${rel(path.join(PUBLIC, 'index.html'))}`)

  await copyFile(path.join(FRONTEND, 'vendor', 'chart.min.js'), path.join(PUBLIC, 'chart.min.js'))
  log(`  copy           ${rel(path.join(PUBLIC, 'chart.min.js'))}`)
}

// ---------------------------------------------------------------------------
// Verification -- the files index.html and plugin.js's routing rely on
// ---------------------------------------------------------------------------

const REQUIRED_OUTPUTS = [
  'dist/public/index.html',
  'dist/public/main.js',
  'dist/public/styles.css',
  'dist/public/chart.min.js',
]

function verifyOutputs() {
  const missing = REQUIRED_OUTPUTS.filter(p => !fs.existsSync(path.join(ROOT, p)))
  if (missing.length) throw new Error(`build produced an incomplete tree, missing:\n  ${missing.join('\n  ')}`)
  log(`  verify         ${REQUIRED_OUTPUTS.length} required paths present`)
}

// ---------------------------------------------------------------------------
// dist/package.json -- REQUIRED, do not drop
// ---------------------------------------------------------------------------
// The repo root package.json is "type":"module". Without an own package.json
// here, Node walks up from dist/plugin.js, finds that, and loads the plugin's
// CommonJS source ("exports.description = ...") as an ES module -- HFS then
// dies with "exports is not defined in ES module scope" the moment it loads
// the plugin. This one file is what keeps dist/ a CommonJS island.

const DIST_PKG = { private: true, type: 'commonjs' }

async function ensureDistPackageJson() {
  const file = path.join(DIST, 'package.json')
  const want = JSON.stringify(DIST_PKG, null, 2) + '\n'
  let have = null
  try { have = await fsp.readFile(file, 'utf8') } catch { /* missing */ }
  // Compare parsed content, not bytes, so a differently-formatted but correct
  // file is left alone; anything else (missing, wrong, corrupt) is rewritten.
  let ok = false
  if (have !== null) {
    try {
      const p = JSON.parse(have)
      ok = p && p.private === true && p.type === 'commonjs'
    } catch { ok = false }
  }
  if (!ok) {
    await fsp.mkdir(DIST, { recursive: true })
    await fsp.writeFile(file, want, 'utf8')
    log(`  package.json   ${rel(file)}  (written -- ${have === null ? 'was missing' : 'was wrong'})`)
  } else {
    log(`  package.json   ${rel(file)}  (ok)`)
  }
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

async function build() {
  const t0 = Date.now()
  log('build: src/ -> dist/public/')

  await ensureDistPackageJson()
  await cleanPublic()
  await buildApp()
  await buildStyles()
  await copyAssets()

  verifyOutputs()
  log(`build: done in ${Date.now() - t0} ms`)
}

// ---------------------------------------------------------------------------
// Watch
// ---------------------------------------------------------------------------

const WATCH_DIRS = [FRONTEND, STYLES]

async function watch() {
  await build().catch(reportBuildError)
  log(`\nwatching ${WATCH_DIRS.map(rel).join(', ')} -- Ctrl+C to stop`)

  let timer = null
  let running = false
  let queued = false

  const rebuild = async () => {
    if (running) { queued = true; return }
    running = true
    try {
      log(`\n[${new Date().toLocaleTimeString()}] change detected`)
      await build()
    } catch (err) {
      reportBuildError(err)
    } finally {
      running = false
      if (queued) { queued = false; setTimeout(rebuild, 0) }
    }
  }

  for (const dir of WATCH_DIRS) {
    fs.watch(dir, { recursive: true }, () => {
      clearTimeout(timer)
      timer = setTimeout(rebuild, 150)
    })
  }
}

function reportBuildError(err) {
  if (err && Array.isArray(err.errors)) console.error(err.message)
  else console.error(err)
}

// ---------------------------------------------------------------------------

const isWatch = process.argv.includes('--watch')

try {
  if (isWatch) await watch()
  else await build()
} catch (err) {
  reportBuildError(err)
  process.exit(1)
}
