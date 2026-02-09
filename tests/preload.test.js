/**
 * Tests for Preload Bridge (preload.js)
 * Covers: contextBridge namespace structure, delegation to Node/Electron APIs,
 *         serialization of stat objects, npm utility wrappers, color helpers, assets.
 * @jest-environment jsdom
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// ─────────────────────────────────────────────
// Capture what contextBridge.exposeInMainWorld receives
// ─────────────────────────────────────────────

const exposedNamespaces = {};

const mockIpcRenderer = {
    invoke: jest.fn(() => Promise.resolve()),
    send: jest.fn(),
    on: jest.fn((_channel, handler) => handler),
    removeListener: jest.fn(),
};

jest.mock('electron', () => ({
    contextBridge: {
        exposeInMainWorld: jest.fn((name, api) => {
            exposedNamespaces[name] = api;
        }),
    },
    ipcRenderer: mockIpcRenderer,
}));

// Mock npm packages that live in src/node_modules
jest.mock('nanoid', () => ({
    nanoid: jest.fn(() => 'mock-nanoid-abc123'),
}));

jest.mock('pretty-bytes', () => jest.fn((bytes) => `${bytes} B`));

jest.mock('mime-types', () => ({
    lookup: jest.fn((filename) => {
        const map = {
            'file.txt': 'text/plain',
            'image.png': 'image/png',
            'video.mp4': 'video/mp4',
            'unknown.xyz': false,
        };
        return map[filename] !== undefined ? map[filename] : false;
    }),
}));

jest.mock('color', () => {
    // Chainable Color mock
    function MockColor(colorStr) {
        if (!(this instanceof MockColor)) return new MockColor(colorStr);
        this._hex = colorStr || '#000000';
    }
    MockColor.prototype.grayscale = jest.fn(function () { return this; });
    MockColor.prototype.mix = jest.fn(function () { return this; });
    MockColor.prototype.hex = jest.fn(function () { return '#AABBCC'; });
    MockColor.prototype.isLight = jest.fn(function () { return true; });
    MockColor.prototype.rgb = jest.fn(function () {
        return { object: jest.fn(() => ({ r: 170, g: 187, b: 204 })) };
    });
    return MockColor;
});

// Mock the file reads that happen at module level in preload.js
const mockPackageJson = JSON.stringify({ version: '2.3.0', name: 'son-of-anton' });
const mockFileIconsJson = JSON.stringify({ js: 'javascript-icon', py: 'python-icon' });
const mockGridJson = JSON.stringify({ cols: 10, rows: 5 });

const originalReadFileSync = fs.readFileSync;
jest.spyOn(fs, 'readFileSync').mockImplementation((filePath, options) => {
    const normalized = filePath.replace(/\\/g, '/');
    if (normalized.endsWith('/package.json')) return mockPackageJson;
    if (normalized.endsWith('/file-icons.json')) return mockFileIconsJson;
    if (normalized.endsWith('/grid.json')) return mockGridJson;
    return originalReadFileSync(filePath, options);
});

// Mock the file-icons-match.js require.
// preload.js does require(path.join(__dirname, 'assets', 'misc', 'file-icons-match.js'))
// Since that file is large and script-generated, we mock it at its real absolute path.
jest.mock(
    require('path').resolve(__dirname, '..', 'src', 'assets', 'misc', 'file-icons-match.js'),
    () => jest.fn((filename) => ({ icon: 'matched-icon', filename })),
);

// ─────────────────────────────────────────────
// Require preload.js — triggers contextBridge.exposeInMainWorld calls
// ─────────────────────────────────────────────

require('../src/preload');

const electronAPI = exposedNamespaces['electronAPI'];
const nodeAPI = exposedNamespaces['nodeAPI'];

// ─────────────────────────────────────────────
// electronAPI namespace
// ─────────────────────────────────────────────

describe('electronAPI namespace exists', () => {
    test('electronAPI is defined', () => {
        expect(electronAPI).toBeDefined();
    });

    const expectedSubObjects = ['app', 'window', 'screen', 'clipboard', 'globalShortcut', 'process', 'ipc', 'shell'];

    test.each(expectedSubObjects)('has sub-object: %s', (key) => {
        expect(electronAPI[key]).toBeDefined();
    });

    test('app has expected methods', () => {
        expect(typeof electronAPI.app.getPath).toBe('function');
        expect(typeof electronAPI.app.getVersion).toBe('function');
        expect(typeof electronAPI.app.quit).toBe('function');
        expect(typeof electronAPI.app.relaunch).toBe('function');
        expect(typeof electronAPI.app.focus).toBe('function');
    });

    test('window has expected methods', () => {
        expect(typeof electronAPI.window.toggleDevTools).toBe('function');
        expect(typeof electronAPI.window.setSize).toBe('function');
        expect(typeof electronAPI.window.minimize).toBe('function');
    });

    test('screen has expected methods', () => {
        expect(typeof electronAPI.screen.getAllDisplays).toBe('function');
    });

    test('clipboard has expected methods', () => {
        expect(typeof electronAPI.clipboard.readText).toBe('function');
    });

    test('globalShortcut has expected methods', () => {
        expect(typeof electronAPI.globalShortcut.register).toBe('function');
        expect(typeof electronAPI.globalShortcut.unregisterAll).toBe('function');
        expect(typeof electronAPI.globalShortcut.onTriggered).toBe('function');
    });

    test('ipc has expected methods', () => {
        expect(typeof electronAPI.ipc.send).toBe('function');
        expect(typeof electronAPI.ipc.on).toBe('function');
        expect(typeof electronAPI.ipc.removeListener).toBe('function');
        expect(typeof electronAPI.ipc.invoke).toBe('function');
    });

    test('shell has expected methods', () => {
        expect(typeof electronAPI.shell.openExternal).toBe('function');
    });
});

// ─────────────────────────────────────────────
// nodeAPI namespace
// ─────────────────────────────────────────────

describe('nodeAPI namespace exists', () => {
    test('nodeAPI is defined', () => {
        expect(nodeAPI).toBeDefined();
    });

    const expectedKeys = ['fs', 'path', 'os', 'dirname', 'nanoid', 'prettyBytes', 'mimeTypes', 'color', 'assets'];

    test.each(expectedKeys)('has key: %s', (key) => {
        expect(nodeAPI[key]).toBeDefined();
    });
});

// ─────────────────────────────────────────────
// app.getVersion — cached from package.json
// ─────────────────────────────────────────────

describe('app.getVersion', () => {
    test('returns string', () => {
        const version = electronAPI.app.getVersion();
        expect(typeof version).toBe('string');
    });

    test('returns version from package.json', () => {
        expect(electronAPI.app.getVersion()).toBe('2.3.0');
    });
});

// ─────────────────────────────────────────────
// process constants
// ─────────────────────────────────────────────

describe('process constants', () => {
    test('argv is an array', () => {
        expect(Array.isArray(electronAPI.process.argv)).toBe(true);
    });

    test('versions is an object', () => {
        expect(typeof electronAPI.process.versions).toBe('object');
        expect(electronAPI.process.versions).not.toBeNull();
    });

    test('platform is a string', () => {
        expect(typeof electronAPI.process.platform).toBe('string');
    });

    test('env.PROFILE_STARTUP is a string', () => {
        expect(typeof electronAPI.process.env.PROFILE_STARTUP).toBe('string');
    });

    test('argv is a copy (not the original reference)', () => {
        // Preload spreads process.argv into a new array
        expect(electronAPI.process.argv).not.toBe(process.argv);
        expect(electronAPI.process.argv).toEqual(process.argv);
    });

    test('versions is a copy (not the original reference)', () => {
        expect(electronAPI.process.versions).not.toBe(process.versions);
    });
});

// ─────────────────────────────────────────────
// IPC delegation
// ─────────────────────────────────────────────

describe('IPC method delegation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('app.getPath delegates to ipcRenderer.invoke', () => {
        electronAPI.app.getPath('userData');
        expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('app:getPath', 'userData');
    });

    test('app.quit delegates to ipcRenderer.invoke', () => {
        electronAPI.app.quit();
        expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('app:quit');
    });

    test('window.setSize delegates to ipcRenderer.invoke', () => {
        electronAPI.window.setSize(800, 600);
        expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('window:setSize', 800, 600);
    });

    test('ipc.send delegates to ipcRenderer.send', () => {
        electronAPI.ipc.send('test-channel', 'arg1', 'arg2');
        expect(mockIpcRenderer.send).toHaveBeenCalledWith('test-channel', 'arg1', 'arg2');
    });

    test('ipc.invoke delegates to ipcRenderer.invoke', () => {
        electronAPI.ipc.invoke('some-channel', 42);
        expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('some-channel', 42);
    });

    test('shell.openExternal delegates to ipcRenderer.invoke', () => {
        electronAPI.shell.openExternal('https://example.com');
        expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('shell:openExternal', 'https://example.com');
    });
});

// ─────────────────────────────────────────────
// ipc.on returns handler
// ─────────────────────────────────────────────

describe('ipc.on returns handler', () => {
    test('returns a handler function', () => {
        const handler = electronAPI.ipc.on('test-channel', () => {});
        expect(handler).toBeDefined();
        // ipcRenderer.on returns what the mock returns, which is the handler itself
        expect(typeof handler).toBe('function');
    });

    test('handler can be passed to removeListener', () => {
        const callback = jest.fn();
        const handler = electronAPI.ipc.on('my-channel', callback);
        electronAPI.ipc.removeListener('my-channel', handler);
        expect(mockIpcRenderer.removeListener).toHaveBeenCalledWith('my-channel', handler);
    });
});

// ─────────────────────────────────────────────
// fs wrappers
// ─────────────────────────────────────────────

describe('fs wrappers', () => {
    const expectedSyncMethods = [
        'readFileSync', 'writeFileSync', 'existsSync', 'readdirSync',
        'mkdirSync', 'appendFileSync', 'statSync', 'unlinkSync',
        'copyFileSync', 'renameSync',
    ];
    const expectedAsyncMethods = ['readFile', 'readlink', 'lstat', 'readdir'];

    test.each([...expectedSyncMethods, ...expectedAsyncMethods])('exposes fs.%s as a function', (method) => {
        expect(typeof nodeAPI.fs[method]).toBe('function');
    });

    test('existsSync delegates to fs.existsSync', () => {
        const spy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        const result = nodeAPI.fs.existsSync('/some/path');
        expect(spy).toHaveBeenCalledWith('/some/path');
        expect(result).toBe(true);
        spy.mockRestore();
    });

    test('writeFileSync delegates to fs.writeFileSync', () => {
        const spy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
        nodeAPI.fs.writeFileSync('/test/file.txt', 'data', 'utf-8');
        expect(spy).toHaveBeenCalledWith('/test/file.txt', 'data', 'utf-8');
        spy.mockRestore();
    });

    test('readdirSync delegates to fs.readdirSync', () => {
        const spy = jest.spyOn(fs, 'readdirSync').mockReturnValue(['a.txt', 'b.txt']);
        const result = nodeAPI.fs.readdirSync('/test/dir');
        expect(spy).toHaveBeenCalledWith('/test/dir', undefined);
        expect(result).toEqual(['a.txt', 'b.txt']);
        spy.mockRestore();
    });

    test('mkdirSync delegates to fs.mkdirSync', () => {
        const spy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
        nodeAPI.fs.mkdirSync('/test/newdir', { recursive: true });
        expect(spy).toHaveBeenCalledWith('/test/newdir', { recursive: true });
        spy.mockRestore();
    });

    test('appendFileSync delegates to fs.appendFileSync', () => {
        const spy = jest.spyOn(fs, 'appendFileSync').mockImplementation(() => {});
        nodeAPI.fs.appendFileSync('/test/log.txt', 'line\n');
        expect(spy).toHaveBeenCalledWith('/test/log.txt', 'line\n', undefined);
        spy.mockRestore();
    });

    test('unlinkSync delegates to fs.unlinkSync', () => {
        const spy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
        nodeAPI.fs.unlinkSync('/test/file.txt');
        expect(spy).toHaveBeenCalledWith('/test/file.txt');
        spy.mockRestore();
    });

    test('copyFileSync delegates to fs.copyFileSync', () => {
        const spy = jest.spyOn(fs, 'copyFileSync').mockImplementation(() => {});
        nodeAPI.fs.copyFileSync('/src/a.txt', '/dst/b.txt');
        expect(spy).toHaveBeenCalledWith('/src/a.txt', '/dst/b.txt');
        spy.mockRestore();
    });

    test('renameSync delegates to fs.renameSync', () => {
        const spy = jest.spyOn(fs, 'renameSync').mockImplementation(() => {});
        nodeAPI.fs.renameSync('/old/name.txt', '/new/name.txt');
        expect(spy).toHaveBeenCalledWith('/old/name.txt', '/new/name.txt');
        spy.mockRestore();
    });
});

// ─────────────────────────────────────────────
// statSync return format
// ─────────────────────────────────────────────

describe('statSync return format', () => {
    const mockStatResult = {
        isFile: jest.fn(() => true),
        isDirectory: jest.fn(() => false),
        isSymbolicLink: jest.fn(() => false),
        size: 4096,
        mtime: new Date('2025-01-15T10:00:00Z'),
        atime: new Date('2025-01-15T09:00:00Z'),
        ctime: new Date('2025-01-14T08:00:00Z'),
        mode: 0o100644,
    };

    let spy;

    beforeEach(() => {
        spy = jest.spyOn(fs, 'statSync').mockReturnValue(mockStatResult);
    });

    afterEach(() => {
        spy.mockRestore();
    });

    test('returns plain object with boolean isFile', () => {
        const stat = nodeAPI.fs.statSync('/test/file.txt');
        expect(typeof stat.isFile).toBe('boolean');
        expect(stat.isFile).toBe(true);
    });

    test('returns boolean isDirectory', () => {
        const stat = nodeAPI.fs.statSync('/test/file.txt');
        expect(typeof stat.isDirectory).toBe('boolean');
        expect(stat.isDirectory).toBe(false);
    });

    test('returns boolean isSymbolicLink', () => {
        const stat = nodeAPI.fs.statSync('/test/file.txt');
        expect(typeof stat.isSymbolicLink).toBe('boolean');
        expect(stat.isSymbolicLink).toBe(false);
    });

    test('returns numeric mtime (epoch ms)', () => {
        const stat = nodeAPI.fs.statSync('/test/file.txt');
        expect(typeof stat.mtime).toBe('number');
        expect(stat.mtime).toBe(new Date('2025-01-15T10:00:00Z').getTime());
    });

    test('returns numeric atime (epoch ms)', () => {
        const stat = nodeAPI.fs.statSync('/test/file.txt');
        expect(typeof stat.atime).toBe('number');
        expect(stat.atime).toBe(new Date('2025-01-15T09:00:00Z').getTime());
    });

    test('returns numeric ctime (epoch ms)', () => {
        const stat = nodeAPI.fs.statSync('/test/file.txt');
        expect(typeof stat.ctime).toBe('number');
        expect(stat.ctime).toBe(new Date('2025-01-14T08:00:00Z').getTime());
    });

    test('returns numeric size and mode', () => {
        const stat = nodeAPI.fs.statSync('/test/file.txt');
        expect(stat.size).toBe(4096);
        expect(stat.mode).toBe(0o100644);
    });

    test('does not return Stats class methods (isFile is value, not function)', () => {
        const stat = nodeAPI.fs.statSync('/test/file.txt');
        // The result should be a plain object — isFile should NOT be a function
        expect(typeof stat.isFile).not.toBe('function');
    });
});

// ─────────────────────────────────────────────
// lstat return format (async)
// ─────────────────────────────────────────────

describe('lstat return format', () => {
    test('returns plain object with boolean flags and numeric timestamps', async () => {
        const mockStatResult = {
            isFile: jest.fn(() => false),
            isDirectory: jest.fn(() => true),
            isSymbolicLink: jest.fn(() => false),
            size: 0,
            mtime: new Date('2025-01-15T10:00:00Z'),
            atime: new Date('2025-01-15T09:00:00Z'),
            ctime: new Date('2025-01-14T08:00:00Z'),
            mode: 0o40755,
        };
        const spy = jest.spyOn(fs, 'lstat').mockImplementation((_path, cb) => {
            cb(null, mockStatResult);
        });

        const stat = await nodeAPI.fs.lstat('/test/dir');

        expect(typeof stat.isFile).toBe('boolean');
        expect(stat.isFile).toBe(false);
        expect(typeof stat.isDirectory).toBe('boolean');
        expect(stat.isDirectory).toBe(true);
        expect(typeof stat.isSymbolicLink).toBe('boolean');
        expect(stat.isSymbolicLink).toBe(false);
        expect(typeof stat.mtime).toBe('number');
        expect(typeof stat.atime).toBe('number');
        expect(typeof stat.ctime).toBe('number');
        expect(stat.mode).toBe(0o40755);

        spy.mockRestore();
    });

    test('rejects on error', async () => {
        const spy = jest.spyOn(fs, 'lstat').mockImplementation((_path, cb) => {
            cb(new Error('ENOENT'));
        });

        await expect(nodeAPI.fs.lstat('/nonexistent')).rejects.toThrow('ENOENT');

        spy.mockRestore();
    });
});

// ─────────────────────────────────────────────
// path wrappers
// ─────────────────────────────────────────────

describe('path wrappers', () => {
    test('join delegates to path.join', () => {
        const result = nodeAPI.path.join('/foo', 'bar', 'baz.txt');
        expect(result).toBe(path.join('/foo', 'bar', 'baz.txt'));
    });

    test('dirname delegates to path.dirname', () => {
        const result = nodeAPI.path.dirname('/foo/bar/baz.txt');
        expect(result).toBe(path.dirname('/foo/bar/baz.txt'));
    });

    test('basename delegates to path.basename', () => {
        const result = nodeAPI.path.basename('/foo/bar/baz.txt');
        expect(result).toBe('baz.txt');
    });

    test('basename with extension delegates to path.basename', () => {
        const result = nodeAPI.path.basename('/foo/bar/baz.txt', '.txt');
        expect(result).toBe('baz');
    });

    test('extname delegates to path.extname', () => {
        const result = nodeAPI.path.extname('file.js');
        expect(result).toBe('.js');
    });

    test('sep is a string', () => {
        expect(typeof nodeAPI.path.sep).toBe('string');
        expect(nodeAPI.path.sep).toBe(path.sep);
    });

    test('resolve delegates to path.resolve', () => {
        const result = nodeAPI.path.resolve('/foo', 'bar');
        expect(result).toBe(path.resolve('/foo', 'bar'));
    });
});

// ─────────────────────────────────────────────
// os wrappers
// ─────────────────────────────────────────────

describe('os wrappers', () => {
    test('platform delegates to os.platform', () => {
        const result = nodeAPI.os.platform();
        expect(result).toBe(os.platform());
    });

    test('type delegates to os.type', () => {
        const result = nodeAPI.os.type();
        expect(result).toBe(os.type());
    });

    test('uptime delegates to os.uptime', () => {
        const result = nodeAPI.os.uptime();
        expect(typeof result).toBe('number');
    });

    test('cpus delegates to os.cpus', () => {
        const result = nodeAPI.os.cpus();
        expect(Array.isArray(result)).toBe(true);
    });

    test('homedir delegates to os.homedir', () => {
        const result = nodeAPI.os.homedir();
        expect(result).toBe(os.homedir());
    });

    test('hostname delegates to os.hostname', () => {
        const result = nodeAPI.os.hostname();
        expect(result).toBe(os.hostname());
    });
});

// ─────────────────────────────────────────────
// nanoid
// ─────────────────────────────────────────────

describe('nanoid', () => {
    test('returns a string', () => {
        const id = nodeAPI.nanoid();
        expect(typeof id).toBe('string');
    });

    test('returns the mocked value', () => {
        expect(nodeAPI.nanoid()).toBe('mock-nanoid-abc123');
    });
});

// ─────────────────────────────────────────────
// prettyBytes
// ─────────────────────────────────────────────

describe('prettyBytes', () => {
    test('returns formatted string', () => {
        const result = nodeAPI.prettyBytes(1024);
        expect(typeof result).toBe('string');
    });

    test('delegates to pretty-bytes', () => {
        const result = nodeAPI.prettyBytes(5000);
        expect(result).toBe('5000 B');
    });
});

// ─────────────────────────────────────────────
// mimeTypes
// ─────────────────────────────────────────────

describe('mimeTypes.lookup', () => {
    test('returns correct MIME type for .txt', () => {
        expect(nodeAPI.mimeTypes.lookup('file.txt')).toBe('text/plain');
    });

    test('returns correct MIME type for .png', () => {
        expect(nodeAPI.mimeTypes.lookup('image.png')).toBe('image/png');
    });

    test('returns false for unknown extension', () => {
        expect(nodeAPI.mimeTypes.lookup('unknown.zzz123')).toBe(false);
    });
});

// ─────────────────────────────────────────────
// color wrappers
// ─────────────────────────────────────────────

describe('color wrappers', () => {
    test('toHex returns a string', () => {
        const hex = nodeAPI.color.toHex('#ff0000');
        expect(typeof hex).toBe('string');
    });

    test('isLight returns a boolean', () => {
        const result = nodeAPI.color.isLight('#ffffff');
        expect(typeof result).toBe('boolean');
    });

    test('rgbObject returns an object with r, g, b', () => {
        const result = nodeAPI.color.rgbObject('#aabbcc');
        expect(typeof result).toBe('object');
        expect(result).toHaveProperty('r');
        expect(result).toHaveProperty('g');
        expect(result).toHaveProperty('b');
    });

    test('grayscaleMix returns a string', () => {
        const hex = nodeAPI.color.grayscaleMix('#2e3436', 'rgb(0,150,255)', 0.3);
        expect(typeof hex).toBe('string');
    });

    test('applyChain returns a string', () => {
        const hex = nodeAPI.color.applyChain('#2e3436', null, [
            { func: 'grayscale', arg: [] },
        ]);
        expect(typeof hex).toBe('string');
    });
});

// ─────────────────────────────────────────────
// assets
// ─────────────────────────────────────────────

describe('assets', () => {
    test('fileIcons is an object', () => {
        expect(typeof nodeAPI.assets.fileIcons).toBe('object');
        expect(nodeAPI.assets.fileIcons).not.toBeNull();
    });

    test('fileIcons contains parsed JSON data', () => {
        expect(nodeAPI.assets.fileIcons).toEqual({ js: 'javascript-icon', py: 'python-icon' });
    });

    test('gridData is an object', () => {
        expect(typeof nodeAPI.assets.gridData).toBe('object');
        expect(nodeAPI.assets.gridData).not.toBeNull();
    });

    test('gridData contains parsed JSON data', () => {
        expect(nodeAPI.assets.gridData).toEqual({ cols: 10, rows: 5 });
    });

    test('fileIconsMatcher is a function', () => {
        expect(typeof nodeAPI.assets.fileIconsMatcher).toBe('function');
    });

    test('fileIconsMatcher delegates to the loaded module', () => {
        const result = nodeAPI.assets.fileIconsMatcher('test.js');
        expect(result).toBeDefined();
    });
});

// ─────────────────────────────────────────────
// dirname constant
// ─────────────────────────────────────────────

describe('dirname', () => {
    test('dirname is a string', () => {
        expect(typeof nodeAPI.dirname).toBe('string');
    });
});
