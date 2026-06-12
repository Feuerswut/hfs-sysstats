// darkmode.js
// by Feuerswut

document.addEventListener('DOMContentLoaded', () => {
    const store = localStorage.getItem('hfs_settings');
    const theme = store ? JSON.parse(store).theme : null;

    function applyTheme(th) {
        // Add or remove the appropriate theme class
        if (th === 'dark') {
            document.body.classList.add('theme-dark');
            document.body.classList.remove('theme-light');
        } else {
            document.body.classList.add('theme-light');
            document.body.classList.remove('theme-dark');
        }

        const frames = document.querySelectorAll('iframe');
        frames.forEach(frame => {
            const doc = frame.contentDocument || frame.contentWindow.document;
            if (th === 'dark') {
                doc.body.classList.add('theme-dark');
                doc.body.classList.remove('theme-light');
            } else {
                doc.body.classList.add('theme-light');
                doc.body.classList.remove('theme-dark');
            }
        });

        document.querySelectorAll('img').forEach(img => {
            if (img.src.includes('-light')) {
                img.src = img.src.replace('-light', '-dark');
            } else if (img.src.includes('-dark')) {
                img.src = img.src.replace('-dark', '-light');
            }
        });
    }

    function detectScheme() {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyTheme(isDark ? 'dark' : 'light');
    }

    // Initial theme application
    if (theme === 'dark' || theme === 'light') {
        applyTheme(theme);
    } else {
        detectScheme();
    }

    // Listen for changes in the color scheme preference
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => applyTheme(e.matches ? 'dark' : 'light'));
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => applyTheme(e.matches ? 'light' : 'dark'));

    // Listen for localStorage changes and reapply theme
    window.addEventListener('storage', () => {
        const updatedTheme = localStorage.getItem('hfs_settings');
        const themeFromStorage = updatedTheme ? JSON.parse(updatedTheme).theme : null;
        if (themeFromStorage) {
            applyTheme(themeFromStorage);
        }
    });
});
