const { ipcMain, app, screen, clipboard, globalShortcut, shell, webFrame } = require('electron');

/**
 * Registers all IPC handlers for the context-isolation bridge.
 * @param {BrowserWindow} win - The main BrowserWindow instance.
 */
module.exports = function registerIpcHandlers(win) {

    // ── App ──────────────────────────────────────────────────────────────

    ipcMain.handle('app:getPath', (_event, name) => {
        if (typeof name !== 'string') {
            throw new Error('app:getPath — name must be a string');
        }
        return app.getPath(name);
    });

    ipcMain.handle('app:getVersion', () => {
        return app.getVersion();
    });

    ipcMain.handle('app:quit', () => {
        app.quit();
    });

    ipcMain.handle('app:relaunch', () => {
        app.relaunch();
    });

    ipcMain.handle('app:focus', () => {
        app.focus();
    });

    // ── Window ───────────────────────────────────────────────────────────

    ipcMain.handle('window:toggleDevTools', () => {
        win.webContents.toggleDevTools();
    });

    ipcMain.handle('window:setSize', (_event, w, h) => {
        if (!Number.isInteger(w) || w <= 0) {
            throw new Error('window:setSize — w must be a positive integer');
        }
        if (!Number.isInteger(h) || h <= 0) {
            throw new Error('window:setSize — h must be a positive integer');
        }
        win.setSize(w, h);
    });

    ipcMain.handle('window:minimize', () => {
        win.minimize();
    });

    // ── Screen ───────────────────────────────────────────────────────────

    ipcMain.handle('screen:getAllDisplays', () => {
        return screen.getAllDisplays();
    });

    // ── Clipboard ────────────────────────────────────────────────────────

    ipcMain.handle('clipboard:readText', () => {
        return clipboard.readText();
    });

    // ── Global Shortcuts ─────────────────────────────────────────────────

    ipcMain.handle('globalShortcut:register', (_event, accelerator, channel) => {
        if (typeof accelerator !== 'string') {
            throw new Error('globalShortcut:register — accelerator must be a string');
        }
        return globalShortcut.register(accelerator, () => {
            win.webContents.send('globalShortcut:triggered', channel);
        });
    });

    ipcMain.handle('globalShortcut:unregisterAll', () => {
        globalShortcut.unregisterAll();
    });

    // ── Shell ────────────────────────────────────────────────────────────

    ipcMain.handle('shell:openExternal', (_event, url) => {
        if (typeof url !== 'string' || !(url.startsWith('http') || url.startsWith('file:'))) {
            throw new Error('shell:openExternal — url must be a string starting with "http" or "file:"');
        }
        return shell.openExternal(url);
    });

    // ── Window State (required by _renderer.js) ─────────────────────────

    ipcMain.handle('window-get-state', () => {
        return {
            isFullScreen: win.isFullScreen(),
            isMaximized: win.isMaximized(),
            size: win.getSize(),
        };
    });

    ipcMain.handle('window-toggle-fullscreen', () => {
        win.setFullScreen(!win.isFullScreen());
        return win.isFullScreen();
    });

    ipcMain.handle('window-set-fullscreen', (_event, flag) => {
        win.setFullScreen(!!flag);
    });

    ipcMain.handle('window-unmaximize', () => {
        win.unmaximize();
    });

    ipcMain.handle('toggle-devtools-refit', () => {
        win.webContents.toggleDevTools();
    });

    ipcMain.handle('set-zoom-limits', (_event, min, max) => {
        win.webContents.setZoomFactor(1);
    });

    // ── Window Events (forwarded to renderer) ───────────────────────────

    win.on('resize', () => {
        win.webContents.send('window-resize');
    });

    win.on('leave-full-screen', () => {
        win.webContents.send('window-leave-full-screen');
    });
};
