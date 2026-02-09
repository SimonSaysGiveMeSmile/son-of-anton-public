/**
 * Tests for IPC Handler Registry (ipcHandlers.js)
 * Covers: handler registration, input validation, delegation to Electron APIs
 * @jest-environment jsdom
 */

// ─────────────────────────────────────────────
// Mock electron modules before requiring the module under test
// ─────────────────────────────────────────────

const mockHandlers = {};

const mockIpcMain = {
    handle: jest.fn((channel, handler) => {
        mockHandlers[channel] = handler;
    }),
};

const mockApp = {
    getPath: jest.fn((name) => `/mock/path/${name}`),
    getVersion: jest.fn(() => '2.3.0'),
    quit: jest.fn(),
    relaunch: jest.fn(),
    focus: jest.fn(),
};

const mockScreen = {
    getAllDisplays: jest.fn(() => [
        { id: 0, bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
        { id: 1, bounds: { x: 1920, y: 0, width: 2560, height: 1440 } },
    ]),
};

const mockClipboard = {
    readText: jest.fn(() => 'clipboard-content'),
};

const mockGlobalShortcut = {
    register: jest.fn((accelerator, callback) => {
        // Store callback so we can trigger it in tests
        mockGlobalShortcut._lastCallback = callback;
        return true;
    }),
    unregisterAll: jest.fn(),
    _lastCallback: null,
};

const mockShell = {
    openExternal: jest.fn(() => Promise.resolve()),
};

jest.mock('electron', () => ({
    ipcMain: mockIpcMain,
    app: mockApp,
    screen: mockScreen,
    clipboard: mockClipboard,
    globalShortcut: mockGlobalShortcut,
    shell: mockShell,
}));

const registerIpcHandlers = require('../src/ipcHandlers');

// ─────────────────────────────────────────────
// Mock BrowserWindow — single instance shared by all handlers
// ─────────────────────────────────────────────

const mockWin = {
    webContents: {
        toggleDevTools: jest.fn(),
        send: jest.fn(),
        setZoomFactor: jest.fn(),
    },
    setSize: jest.fn(),
    minimize: jest.fn(),
    on: jest.fn(),
    isFullScreen: jest.fn().mockReturnValue(false),
    isMaximized: jest.fn().mockReturnValue(false),
    getSize: jest.fn().mockReturnValue([1920, 1080]),
    setFullScreen: jest.fn(),
    unmaximize: jest.fn(),
};

// Register handlers once — they close over this mockWin reference
registerIpcHandlers(mockWin);

// Reset call counts between tests, but keep the same object references
beforeEach(() => {
    jest.clearAllMocks();
});

// ─────────────────────────────────────────────
// Helper: invoke a registered handler by channel name
// ─────────────────────────────────────────────

function invokeHandler(channel, ...args) {
    const handler = mockHandlers[channel];
    if (!handler) {
        throw new Error(`No handler registered for channel: ${channel}`);
    }
    // First arg to an ipcMain.handle callback is the event object
    return handler({}, ...args);
}

// ─────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────

describe('IPC handler registration', () => {
    const expectedChannels = [
        'app:getPath',
        'app:getVersion',
        'app:quit',
        'app:relaunch',
        'app:focus',
        'window:toggleDevTools',
        'window:setSize',
        'window:minimize',
        'screen:getAllDisplays',
        'clipboard:readText',
        'globalShortcut:register',
        'globalShortcut:unregisterAll',
        'shell:openExternal',
        'window-get-state',
        'window-toggle-fullscreen',
        'window-set-fullscreen',
        'window-unmaximize',
        'toggle-devtools-refit',
        'set-zoom-limits',
    ];

    test('registers handlers for all expected channels', () => {
        expectedChannels.forEach((channel) => {
            expect(mockHandlers[channel]).toBeDefined();
            expect(typeof mockHandlers[channel]).toBe('function');
        });
    });

    test('exactly the expected number of channels were registered', () => {
        const registeredChannels = Object.keys(mockHandlers);
        expect(registeredChannels).toHaveLength(expectedChannels.length);
    });
});

// ─────────────────────────────────────────────
// App handlers
// ─────────────────────────────────────────────

describe('app:getPath', () => {
    test('returns app.getPath(name) with valid string name', () => {
        const result = invokeHandler('app:getPath', 'userData');
        expect(mockApp.getPath).toHaveBeenCalledWith('userData');
        expect(result).toBe('/mock/path/userData');
    });

    test('rejects non-string name (number)', () => {
        expect(() => invokeHandler('app:getPath', 123)).toThrow('name must be a string');
    });

    test('rejects non-string name (null)', () => {
        expect(() => invokeHandler('app:getPath', null)).toThrow('name must be a string');
    });

    test('rejects non-string name (undefined)', () => {
        expect(() => invokeHandler('app:getPath', undefined)).toThrow('name must be a string');
    });

    test('rejects non-string name (object)', () => {
        expect(() => invokeHandler('app:getPath', {})).toThrow('name must be a string');
    });
});

describe('app:getVersion', () => {
    test('returns version string from app.getVersion()', () => {
        const result = invokeHandler('app:getVersion');
        expect(mockApp.getVersion).toHaveBeenCalled();
        expect(result).toBe('2.3.0');
    });
});

describe('app:quit', () => {
    test('calls app.quit()', () => {
        invokeHandler('app:quit');
        expect(mockApp.quit).toHaveBeenCalled();
    });
});

describe('app:relaunch', () => {
    test('calls app.relaunch()', () => {
        invokeHandler('app:relaunch');
        expect(mockApp.relaunch).toHaveBeenCalled();
    });
});

describe('app:focus', () => {
    test('calls app.focus()', () => {
        invokeHandler('app:focus');
        expect(mockApp.focus).toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────
// Window handlers
// ─────────────────────────────────────────────

describe('window:toggleDevTools', () => {
    test('calls win.webContents.toggleDevTools()', () => {
        invokeHandler('window:toggleDevTools');
        expect(mockWin.webContents.toggleDevTools).toHaveBeenCalled();
    });
});

describe('window:setSize', () => {
    test('calls win.setSize(w, h) with valid positive integers', () => {
        invokeHandler('window:setSize', 1024, 768);
        expect(mockWin.setSize).toHaveBeenCalledWith(1024, 768);
    });

    test('rejects w = 0', () => {
        expect(() => invokeHandler('window:setSize', 0, 768)).toThrow('w must be a positive integer');
    });

    test('rejects negative w', () => {
        expect(() => invokeHandler('window:setSize', -100, 768)).toThrow('w must be a positive integer');
    });

    test('rejects float w', () => {
        expect(() => invokeHandler('window:setSize', 10.5, 768)).toThrow('w must be a positive integer');
    });

    test('rejects string w', () => {
        expect(() => invokeHandler('window:setSize', '1024', 768)).toThrow('w must be a positive integer');
    });

    test('rejects h = 0', () => {
        expect(() => invokeHandler('window:setSize', 1024, 0)).toThrow('h must be a positive integer');
    });

    test('rejects negative h', () => {
        expect(() => invokeHandler('window:setSize', 1024, -50)).toThrow('h must be a positive integer');
    });

    test('rejects float h', () => {
        expect(() => invokeHandler('window:setSize', 1024, 7.5)).toThrow('h must be a positive integer');
    });

    test('rejects string h', () => {
        expect(() => invokeHandler('window:setSize', 1024, '768')).toThrow('h must be a positive integer');
    });

    test('rejects null w', () => {
        expect(() => invokeHandler('window:setSize', null, 768)).toThrow('w must be a positive integer');
    });

    test('rejects undefined h', () => {
        expect(() => invokeHandler('window:setSize', 1024, undefined)).toThrow('h must be a positive integer');
    });
});

describe('window:minimize', () => {
    test('calls win.minimize()', () => {
        invokeHandler('window:minimize');
        expect(mockWin.minimize).toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────
// Screen handlers
// ─────────────────────────────────────────────

describe('screen:getAllDisplays', () => {
    test('returns array of displays', () => {
        const displays = invokeHandler('screen:getAllDisplays');
        expect(mockScreen.getAllDisplays).toHaveBeenCalled();
        expect(Array.isArray(displays)).toBe(true);
        expect(displays).toHaveLength(2);
        expect(displays[0]).toHaveProperty('id', 0);
        expect(displays[1]).toHaveProperty('id', 1);
    });
});

// ─────────────────────────────────────────────
// Clipboard handlers
// ─────────────────────────────────────────────

describe('clipboard:readText', () => {
    test('returns clipboard text', () => {
        const text = invokeHandler('clipboard:readText');
        expect(mockClipboard.readText).toHaveBeenCalled();
        expect(text).toBe('clipboard-content');
    });
});

// ─────────────────────────────────────────────
// Global shortcut handlers
// ─────────────────────────────────────────────

describe('globalShortcut:register', () => {
    test('registers accelerator and returns result', () => {
        const result = invokeHandler('globalShortcut:register', 'CommandOrControl+Shift+I', 'devtools-channel');
        expect(mockGlobalShortcut.register).toHaveBeenCalledWith(
            'CommandOrControl+Shift+I',
            expect.any(Function)
        );
        expect(result).toBe(true);
    });

    test('registered callback sends IPC event to renderer', () => {
        invokeHandler('globalShortcut:register', 'F12', 'my-channel');
        // Trigger the stored callback
        mockGlobalShortcut._lastCallback();
        expect(mockWin.webContents.send).toHaveBeenCalledWith('globalShortcut:triggered', 'my-channel');
    });

    test('rejects non-string accelerator', () => {
        expect(() => invokeHandler('globalShortcut:register', 123, 'ch')).toThrow(
            'accelerator must be a string'
        );
    });

    test('rejects null accelerator', () => {
        expect(() => invokeHandler('globalShortcut:register', null, 'ch')).toThrow(
            'accelerator must be a string'
        );
    });
});

describe('globalShortcut:unregisterAll', () => {
    test('calls globalShortcut.unregisterAll()', () => {
        invokeHandler('globalShortcut:unregisterAll');
        expect(mockGlobalShortcut.unregisterAll).toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────
// Shell handlers
// ─────────────────────────────────────────────

describe('shell:openExternal', () => {
    test('opens valid http URL', () => {
        invokeHandler('shell:openExternal', 'http://example.com');
        expect(mockShell.openExternal).toHaveBeenCalledWith('http://example.com');
    });

    test('opens valid https URL', () => {
        invokeHandler('shell:openExternal', 'https://example.com');
        expect(mockShell.openExternal).toHaveBeenCalledWith('https://example.com');
    });

    test('opens valid file:// URL', () => {
        invokeHandler('shell:openExternal', 'file:///path/to/file.txt');
        expect(mockShell.openExternal).toHaveBeenCalledWith('file:///path/to/file.txt');
    });

    test('rejects javascript: URL', () => {
        expect(() => invokeHandler('shell:openExternal', 'javascript:alert(1)')).toThrow(
            'url must be a string starting with "http" or "file:"'
        );
    });

    test('rejects non-string url (number)', () => {
        expect(() => invokeHandler('shell:openExternal', 12345)).toThrow(
            'url must be a string starting with "http" or "file:"'
        );
    });

    test('rejects null url', () => {
        expect(() => invokeHandler('shell:openExternal', null)).toThrow(
            'url must be a string starting with "http" or "file:"'
        );
    });

    test('rejects empty string', () => {
        expect(() => invokeHandler('shell:openExternal', '')).toThrow(
            'url must be a string starting with "http" or "file:"'
        );
    });

    test('rejects ftp:// URL', () => {
        expect(() => invokeHandler('shell:openExternal', 'ftp://example.com')).toThrow(
            'url must be a string starting with "http" or "file:"'
        );
    });
});
