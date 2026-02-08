/**
 * preload.js — Bridge between main process and isolated renderer.
 *
 * Runs with Node.js access. Exposes safe APIs via contextBridge.exposeInMainWorld().
 * All exposed values must be serializable (no class instances, Buffers, or circular refs).
 * contextBridge freezes all exposed objects; functions are proxied automatically.
 */

const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

// npm packages (installed in src/node_modules/)
const { nanoid } = require('nanoid');
const prettyBytes = require('pretty-bytes');
const mimeTypes = require('mime-types');
const Color = require('color');

// ---------------------------------------------------------------------------
// Cache values that are needed synchronously at renderer startup
// ---------------------------------------------------------------------------

const srcPackageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
const APP_VERSION = srcPackageJson.version;

// ---------------------------------------------------------------------------
// Pre-load JSON / JS assets that renderer classes need
// ---------------------------------------------------------------------------

const fileIconsData = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'assets', 'icons', 'file-icons.json'), 'utf-8')
);
const gridData = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'assets', 'misc', 'grid.json'), 'utf-8')
);
const fileIconsMatcher = require(path.join(__dirname, 'assets', 'misc', 'file-icons-match.js'));

// ---------------------------------------------------------------------------
// Color helper — wraps the `color` npm package so that terminal.class.js
// can perform chainable color operations without receiving non-serializable
// Color instances across the contextBridge.
//
// Usage patterns found in terminal.class.js:
//   color(base).grayscale().mix(color(target), 0.3).hex()
//   color(base)[func](...args)  (dynamic chain from theme colorFilter)
//
// We expose two functions:
//   colorify(base, target, filterSteps)  — runs the full chain, returns hex
//   colorOp(hex, operations)             — generic chain, returns hex
// ---------------------------------------------------------------------------

function applyColorChain(baseHex, targetHex, steps) {
    let c = Color(baseHex);
    const target = targetHex ? Color(targetHex) : null;

    for (let i = 0; i < steps.length; i++) {
        const { func, arg } = steps[i];
        if (func === 'mix' && target) {
            c = c[func](target, ...arg);
        } else {
            c = c[func](...arg);
        }
    }

    return c.hex();
}

// ---------------------------------------------------------------------------
// electronAPI — Electron-specific APIs (app, window, screen, clipboard, etc.)
// ---------------------------------------------------------------------------

contextBridge.exposeInMainWorld('electronAPI', {
    app: {
        getPath: (name) => ipcRenderer.invoke('app:getPath', name),
        getVersion: () => APP_VERSION,
        quit: () => ipcRenderer.invoke('app:quit'),
        relaunch: () => ipcRenderer.invoke('app:relaunch'),
        focus: () => ipcRenderer.invoke('app:focus'),
    },
    window: {
        toggleDevTools: () => ipcRenderer.invoke('window:toggleDevTools'),
        setSize: (w, h) => ipcRenderer.invoke('window:setSize', w, h),
        minimize: () => ipcRenderer.invoke('window:minimize'),
    },
    screen: {
        getAllDisplays: () => ipcRenderer.invoke('screen:getAllDisplays'),
    },
    clipboard: {
        readText: () => ipcRenderer.invoke('clipboard:readText'),
    },
    globalShortcut: {
        register: (accelerator, channel) =>
            ipcRenderer.invoke('globalShortcut:register', accelerator, channel),
        unregisterAll: () => ipcRenderer.invoke('globalShortcut:unregisterAll'),
        onTriggered: (callback) => {
            ipcRenderer.on('globalShortcut:triggered', (_event, channel) => callback(channel));
        },
    },
    process: {
        argv: [...process.argv],
        versions: { ...process.versions },
        env: {
            PROFILE_STARTUP: process.env.PROFILE_STARTUP || '',
            USERNAME: process.env.USERNAME || '',
            USER: process.env.USER || '',
        },
        platform: process.platform,
    },
    ipc: {
        send: (channel, ...args) => ipcRenderer.send(channel, ...args),
        on: (channel, callback) => {
            const handler = (_event, ...args) => callback(...args);
            ipcRenderer.on(channel, handler);
            return handler; // caller keeps reference for removeListener
        },
        removeListener: (channel, handler) => ipcRenderer.removeListener(channel, handler),
        invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    },
    shell: {
        openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
    },
});

// ---------------------------------------------------------------------------
// nodeAPI — Node.js core modules, npm utilities, and pre-loaded assets
// ---------------------------------------------------------------------------

contextBridge.exposeInMainWorld('nodeAPI', {
    // --- fs (sync wrappers + async readFile) ---
    fs: {
        readFileSync: (filePath, options) => fs.readFileSync(filePath, options),
        writeFileSync: (filePath, data, options) => fs.writeFileSync(filePath, data, options),
        existsSync: (filePath) => fs.existsSync(filePath),
        readdirSync: (dirPath, options) => fs.readdirSync(dirPath, options),
        mkdirSync: (dirPath, options) => fs.mkdirSync(dirPath, options),
        appendFileSync: (filePath, data, options) => fs.appendFileSync(filePath, data, options),
        statSync: (filePath) => {
            const stat = fs.statSync(filePath);
            // Return a plain object — Stats instances are not cloneable across contextBridge
            return {
                isFile: stat.isFile(),
                isDirectory: stat.isDirectory(),
                isSymbolicLink: stat.isSymbolicLink(),
                size: stat.size,
                mtime: stat.mtime.getTime(),
                atime: stat.atime.getTime(),
                ctime: stat.ctime.getTime(),
                mode: stat.mode,
            };
        },
        unlinkSync: (filePath) => fs.unlinkSync(filePath),
        readFile: (filePath, options) => fs.promises.readFile(filePath, options),
        readlink: (filePath) => {
            return new Promise((resolve, reject) => {
                fs.readlink(filePath, (err, linkString) => {
                    if (err) reject(err);
                    else resolve(linkString);
                });
            });
        },
        lstat: (filePath) => {
            return new Promise((resolve, reject) => {
                fs.lstat(filePath, (err, stat) => {
                    if (err) return reject(err);
                    resolve({
                        isFile: stat.isFile(),
                        isDirectory: stat.isDirectory(),
                        isSymbolicLink: stat.isSymbolicLink(),
                        size: stat.size,
                        mtime: stat.mtime.getTime(),
                        atime: stat.atime.getTime(),
                        ctime: stat.ctime.getTime(),
                        mode: stat.mode,
                    });
                });
            });
        },
        readdir: (dirPath) => fs.promises.readdir(dirPath),
        copyFileSync: (src, dest) => fs.copyFileSync(src, dest),
        renameSync: (oldPath, newPath) => fs.renameSync(oldPath, newPath),
    },

    // --- path ---
    path: {
        join: (...args) => path.join(...args),
        dirname: (p) => path.dirname(p),
        basename: (p, ext) => path.basename(p, ext),
        extname: (p) => path.extname(p),
        sep: path.sep,
        resolve: (...args) => path.resolve(...args),
    },

    // --- os ---
    os: {
        platform: () => os.platform(),
        type: () => os.type(),
        uptime: () => os.uptime(),
        cpus: () => os.cpus(),
        homedir: () => os.homedir(),
        hostname: () => os.hostname(),
    },

    // --- __dirname equivalent ---
    dirname: __dirname,

    // --- npm utilities ---
    nanoid: () => nanoid(),
    prettyBytes: (bytes) => prettyBytes(bytes),
    mimeTypes: {
        lookup: (filename) => mimeTypes.lookup(filename),
    },

    // --- color manipulation (for terminal.class.js) ---
    color: {
        /**
         * Apply a chain of color operations and return the resulting hex string.
         *
         * @param {string} baseHex   — starting color (hex, rgb string, etc.)
         * @param {string|null} targetHex — target color for mix operations (nullable)
         * @param {Array<{func: string, arg: Array}>} steps — ordered operations
         * @returns {string} hex color string, e.g. "#A1B2C3"
         *
         * Example (default colorify):
         *   color.applyChain("#2e3436", "rgb(0,150,255)", [
         *     { func: "grayscale", arg: [] },
         *     { func: "mix", arg: [0.3] }
         *   ])
         */
        applyChain: (baseHex, targetHex, steps) => applyColorChain(baseHex, targetHex, steps),

        /**
         * Shorthand: grayscale base then mix with target at given ratio.
         * Equivalent to: Color(base).grayscale().mix(Color(target), ratio).hex()
         *
         * @param {string} baseHex
         * @param {string} targetHex
         * @param {number} ratio — mix ratio (0..1)
         * @returns {string} hex
         */
        grayscaleMix: (baseHex, targetHex, ratio) => {
            return Color(baseHex).grayscale().mix(Color(targetHex), ratio).hex();
        },

        /**
         * Get hex from any valid CSS color string.
         * @param {string} colorStr
         * @returns {string} hex
         */
        toHex: (colorStr) => Color(colorStr).hex(),

        /**
         * Check if a color is light.
         * @param {string} colorStr
         * @returns {boolean}
         */
        isLight: (colorStr) => Color(colorStr).isLight(),

        /**
         * Get RGB object { r, g, b } from a color string.
         * @param {string} colorStr
         * @returns {{ r: number, g: number, b: number }}
         */
        rgbObject: (colorStr) => Color(colorStr).rgb().object(),
    },

    // --- Pre-loaded assets ---
    assets: {
        fileIcons: fileIconsData,
        gridData: gridData,
        fileIconsMatcher: (filename) => fileIconsMatcher(filename),
    },
});
