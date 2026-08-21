// ---------------------------------------------------------------------------
// main.ts -- bundle entry point. Wires up the theme toggle and the dashboard
// polling loop once the DOM is ready, matching the previous plain-JS
// darkmode.js + main.js boot sequence.
// ---------------------------------------------------------------------------

import { applyStoredOrSystemTheme, getThemeStorage, toggleThemeMode, updateThemeButtonLabel, watchStorageTheme, watchSystemTheme } from './theme'
import { initDashboard } from './dashboard'

document.addEventListener('DOMContentLoaded', () => {
    applyStoredOrSystemTheme()
    watchSystemTheme()
    watchStorageTheme()

    updateThemeButtonLabel(getThemeStorage())
    document.getElementById('themeToggle')?.addEventListener('click', toggleThemeMode)

    initDashboard()
})
