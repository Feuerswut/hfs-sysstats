// ---------------------------------------------------------------------------
// theme.ts -- dark/light/auto theme toggle and persistence.
// Reimplements the previous plain-JS darkmode.js + the theme-toggle button
// logic from main.js, unchanged in behaviour: settings are stored under the
// 'hfs_settings' localStorage key so a manual theme choice survives reloads,
// and 'auto' falls back to prefers-color-scheme.
// ---------------------------------------------------------------------------

import type { HfsSettings } from './types'

const STORAGE_KEY = 'hfs_settings'

function readSettings(): HfsSettings {
    const store = localStorage.getItem(STORAGE_KEY)
    if (!store) return {}
    try {
        return JSON.parse(store) as HfsSettings
    } catch {
        return {}
    }
}

export function getThemeStorage(): 'auto' | 'light' | 'dark' {
    return readSettings().theme || 'auto'
}

export function setThemeStorage(value: 'auto' | 'light' | 'dark'): void {
    const parsed = readSettings()
    parsed.theme = value
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
}

export function updateThemeButtonLabel(mode: string): void {
    const btn = document.getElementById('themeToggle')
    if (btn) btn.textContent = `Theme: ${mode.charAt(0).toUpperCase()}${mode.slice(1)}`
}

export function toggleThemeMode(): void {
    const current = getThemeStorage()
    let next: 'auto' | 'light' | 'dark' = 'auto'
    if (current === 'auto') next = 'light'
    else if (current === 'light') next = 'dark'

    setThemeStorage(next)
    updateThemeButtonLabel(next)

    // localStorage's 'storage' event only fires in *other* tabs natively, so
    // dispatch one manually to update this tab's own theme immediately.
    window.dispatchEvent(new StorageEvent('storage', {
        key: STORAGE_KEY,
        newValue: localStorage.getItem(STORAGE_KEY),
        storageArea: localStorage,
    }))
}

function applyTheme(theme: 'dark' | 'light'): void {
    document.body.classList.toggle('theme-dark', theme === 'dark')
    document.body.classList.toggle('theme-light', theme !== 'dark')

    document.querySelectorAll('iframe').forEach(frame => {
        const doc = frame.contentDocument || frame.contentWindow?.document
        doc?.body?.classList.toggle('theme-dark', theme === 'dark')
        doc?.body?.classList.toggle('theme-light', theme !== 'dark')
    })

    document.querySelectorAll('img').forEach(img => {
        if (img.src.includes('-light')) img.src = img.src.replace('-light', '-dark')
        else if (img.src.includes('-dark')) img.src = img.src.replace('-dark', '-light')
    })
}

function detectScheme(): void {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    applyTheme(isDark ? 'dark' : 'light')
}

export function applyStoredOrSystemTheme(): void {
    const theme = getThemeStorage()
    if (theme === 'dark' || theme === 'light') applyTheme(theme)
    else detectScheme()
}

export function watchSystemTheme(): void {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => applyTheme(e.matches ? 'dark' : 'light'))
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => applyTheme(e.matches ? 'light' : 'dark'))
}

export function watchStorageTheme(): void {
    window.addEventListener('storage', () => {
        const theme = getThemeStorage()
        if (theme === 'dark' || theme === 'light') applyTheme(theme)
    })
}
