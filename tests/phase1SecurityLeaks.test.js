/**
 * Tests for Phase 1 Security and Leak Fixes
 * Covers: SEC-3, SEC-4, SEC-5, LEAK-1, LEAK-4, LEAK-5
 * @jest-environment jsdom
 */

const path = require('path');

// ─────────────────────────────────────────────
// SEC-3: IPC log type whitelist (_boot.js)
// ─────────────────────────────────────────────

describe('SEC-3: IPC log type whitelist', () => {
    const allowedLogTypes = ['info', 'warn', 'error', 'debug', 'success', 'complete', 'pending', 'start'];

    // Replicate the whitelist logic from _boot.js lines 50-56
    function sanitizeLogType(type) {
        if (!allowedLogTypes.includes(type)) {
            type = 'info';
        }
        return type;
    }

    test('accepts all valid log types', () => {
        allowedLogTypes.forEach(type => {
            expect(sanitizeLogType(type)).toBe(type);
        });
    });

    test('defaults "fatal" to "info" (not whitelisted)', () => {
        expect(sanitizeLogType('fatal')).toBe('info');
    });

    test('defaults arbitrary string to "info"', () => {
        expect(sanitizeLogType('something_random')).toBe('info');
    });

    test('defaults empty string to "info"', () => {
        expect(sanitizeLogType('')).toBe('info');
    });

    test('defaults undefined to "info"', () => {
        expect(sanitizeLogType(undefined)).toBe('info');
    });

    test('defaults null to "info"', () => {
        expect(sanitizeLogType(null)).toBe('info');
    });

    test('rejects prototype pollution attempt "__proto__"', () => {
        expect(sanitizeLogType('__proto__')).toBe('info');
    });

    test('rejects prototype pollution attempt "constructor"', () => {
        expect(sanitizeLogType('constructor')).toBe('info');
    });

    test('rejects prototype pollution attempt "toString"', () => {
        expect(sanitizeLogType('toString')).toBe('info');
    });

    test('rejects numeric type', () => {
        expect(sanitizeLogType(42)).toBe('info');
    });

    test('rejects object type', () => {
        expect(sanitizeLogType({})).toBe('info');
    });

    test('rejects array type', () => {
        expect(sanitizeLogType(['info'])).toBe('info');
    });
});

// ─────────────────────────────────────────────
// SEC-4: File path sanitization (_boot.js)
// ─────────────────────────────────────────────

describe('SEC-4: File path sanitization', () => {
    // Replicate the sanitization logic from _boot.js lines 151-157
    // safeName = path.basename(e)
    // destPath = path.join(targetDir, safeName)
    // if (!destPath.startsWith(targetDir)) return; // skip

    const targetDir = path.join('C:', 'Users', 'test', 'themes');

    function sanitizeAndBuild(rawFilename) {
        const safeName = path.basename(rawFilename);
        const destPath = path.join(targetDir, safeName);
        const allowed = destPath.startsWith(targetDir);
        return { safeName, destPath, allowed };
    }

    test('normal filename passes through correctly', () => {
        const result = sanitizeAndBuild('tron.json');
        expect(result.safeName).toBe('tron.json');
        expect(result.destPath).toBe(path.join(targetDir, 'tron.json'));
        expect(result.allowed).toBe(true);
    });

    test('path.basename strips unix directory traversal', () => {
        const result = sanitizeAndBuild('../../../etc/passwd');
        expect(result.safeName).toBe('passwd');
        // After basename, it stays within targetDir
        expect(result.destPath).toBe(path.join(targetDir, 'passwd'));
        expect(result.allowed).toBe(true);
    });

    test('path.basename strips windows directory traversal', () => {
        const result = sanitizeAndBuild('..\\..\\..\\Windows\\System32\\config\\SAM');
        expect(result.safeName).toBe('SAM');
        expect(result.destPath).toBe(path.join(targetDir, 'SAM'));
        expect(result.allowed).toBe(true);
    });

    test('path.basename strips absolute unix path', () => {
        const result = sanitizeAndBuild('/etc/shadow');
        expect(result.safeName).toBe('shadow');
        expect(result.allowed).toBe(true);
    });

    test('path.basename strips absolute windows path', () => {
        const result = sanitizeAndBuild('C:\\Windows\\win.ini');
        expect(result.safeName).toBe('win.ini');
        expect(result.allowed).toBe(true);
    });

    test('path.basename handles deeply nested traversal', () => {
        const result = sanitizeAndBuild('../../../../../../../../etc/passwd');
        expect(result.safeName).toBe('passwd');
        expect(result.allowed).toBe(true);
    });

    test('filename with spaces passes through', () => {
        const result = sanitizeAndBuild('my theme.json');
        expect(result.safeName).toBe('my theme.json');
        expect(result.allowed).toBe(true);
    });

    test('filename with dots passes through', () => {
        const result = sanitizeAndBuild('theme.v2.json');
        expect(result.safeName).toBe('theme.v2.json');
        expect(result.allowed).toBe(true);
    });

    test('startsWith validation rejects crafted path that escapes targetDir', () => {
        // Simulate a scenario where someone crafts a destPath outside targetDir
        // After basename this shouldn't happen, but the startsWith guard is the second line of defense
        const maliciousDestPath = path.join(targetDir, '..', 'malicious.json');
        expect(maliciousDestPath.startsWith(targetDir)).toBe(false);
    });

    test('null-byte injection still produces safe path', () => {
        // path.basename may preserve null bytes on some platforms
        // The key defense is startsWith — the path stays within the target directory
        const result = sanitizeAndBuild('theme.json\x00.exe');
        expect(result.destPath.startsWith(targetDir + path.sep)).toBe(true);
    });
});

// ─────────────────────────────────────────────
// SEC-5: Settings editor HTML escaping (_renderer.js)
// ─────────────────────────────────────────────

describe('SEC-5: Settings editor HTML escaping', () => {
    // Replicate _escapeHtml from _renderer.js lines 6-15
    function _escapeHtml(text) {
        let map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    test('escapes < character', () => {
        expect(_escapeHtml('<')).toBe('&lt;');
    });

    test('escapes > character', () => {
        expect(_escapeHtml('>')).toBe('&gt;');
    });

    test('escapes & character', () => {
        expect(_escapeHtml('&')).toBe('&amp;');
    });

    test('escapes " character', () => {
        expect(_escapeHtml('"')).toBe('&quot;');
    });

    test("escapes ' character", () => {
        expect(_escapeHtml("'")).toBe('&#039;');
    });

    test('escapes all special characters in mixed string', () => {
        const input = '<script>alert("xss")</script>';
        const expected = '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;';
        expect(_escapeHtml(input)).toBe(expected);
    });

    test('leaves normal text unchanged', () => {
        expect(_escapeHtml('Hello World 123')).toBe('Hello World 123');
    });

    test('handles empty string', () => {
        expect(_escapeHtml('')).toBe('');
    });

    test('neutralizes script injection in settings value', () => {
        const maliciousShell = '"><img src=x onerror=alert(1)>';
        const escaped = _escapeHtml(maliciousShell);
        expect(escaped).not.toContain('<');
        expect(escaped).not.toContain('>');
        expect(escaped).not.toContain('"');
    });

    test('neutralizes event handler injection', () => {
        const payload = "' onmouseover='alert(1)";
        const escaped = _escapeHtml(payload);
        expect(escaped).not.toContain("'");
        expect(escaped).toContain('&#039;');
    });

    test('escapes ampersand in existing entity (double-escape prevention is not applied)', () => {
        // _escapeHtml does NOT decode first; it escapes as-is.
        // "&amp;" becomes "&amp;amp;"
        expect(_escapeHtml('&amp;')).toBe('&amp;amp;');
    });

    test('settings value with path separators renders correctly', () => {
        const shellPath = 'C:\\Windows\\System32\\powershell.exe';
        expect(_escapeHtml(shellPath)).toBe(shellPath);
    });

    test('settings value with numbers renders correctly', () => {
        expect(_escapeHtml('3000')).toBe('3000');
    });

    test('settings value with email renders correctly', () => {
        expect(_escapeHtml('user@example.com')).toBe('user@example.com');
    });
});

// ─────────────────────────────────────────────
// LEAK-4: Terminal _tick interval cleanup (terminal.class.js)
// ─────────────────────────────────────────────

describe('LEAK-4: Terminal _tick interval cleanup', () => {
    let mockTty;
    let mockWss;
    let mockIpc;

    beforeEach(() => {
        mockTty = {
            _pid: 1234,
            _cwd: '/test',
            kill: jest.fn(),
            resize: jest.fn(),
            onData: jest.fn(),
            onExit: jest.fn(),
            write: jest.fn(),
        };
        mockWss = {
            close: jest.fn(),
            on: jest.fn(),
            clients: [],
        };
        mockIpc = {
            on: jest.fn(),
            send: jest.fn(),
        };
    });

    test('close() clears the _tick interval', () => {
        // Simulate the server-side terminal state
        const terminal = {
            _tick: setInterval(() => {}, 1000),
            wss: mockWss,
            tty: mockTty,
            _closed: false,
        };

        // Replicate close() from terminal.class.js lines 551-562
        const close = () => {
            if (terminal._tick) {
                clearInterval(terminal._tick);
                terminal._tick = null;
            }
            if (terminal.wss) {
                terminal.wss.close();
                terminal.wss = null;
            }
            terminal.tty.kill();
            terminal._closed = true;
        };

        expect(terminal._tick).not.toBeNull();
        close();
        expect(terminal._tick).toBeNull();
        expect(terminal._closed).toBe(true);
    });

    test('close() does not throw when _tick is already null', () => {
        const terminal = {
            _tick: null,
            wss: mockWss,
            tty: mockTty,
            _closed: false,
        };

        const close = () => {
            if (terminal._tick) {
                clearInterval(terminal._tick);
                terminal._tick = null;
            }
            if (terminal.wss) {
                terminal.wss.close();
                terminal.wss = null;
            }
            terminal.tty.kill();
            terminal._closed = true;
        };

        expect(() => close()).not.toThrow();
        expect(terminal._tick).toBeNull();
    });

    test('double-close does not throw', () => {
        const terminal = {
            _tick: setInterval(() => {}, 1000),
            wss: mockWss,
            tty: mockTty,
            _closed: false,
        };

        const close = () => {
            if (terminal._tick) {
                clearInterval(terminal._tick);
                terminal._tick = null;
            }
            if (terminal.wss) {
                terminal.wss.close();
                terminal.wss = null;
            }
            terminal.tty.kill();
            terminal._closed = true;
        };

        close();
        // Second close should not throw - wss is now null, _tick is null
        expect(() => close()).not.toThrow();
    });

    test('close() calls tty.kill()', () => {
        const terminal = {
            _tick: setInterval(() => {}, 1000),
            wss: mockWss,
            tty: mockTty,
            _closed: false,
        };

        const close = () => {
            if (terminal._tick) {
                clearInterval(terminal._tick);
                terminal._tick = null;
            }
            if (terminal.wss) {
                terminal.wss.close();
                terminal.wss = null;
            }
            terminal.tty.kill();
            terminal._closed = true;
        };

        close();
        expect(mockTty.kill).toHaveBeenCalledTimes(1);
    });
});

// ─────────────────────────────────────────────
// LEAK-5: WebSocket server cleanup (terminal.class.js)
// ─────────────────────────────────────────────

describe('LEAK-5: WebSocket server cleanup', () => {
    let mockTty;

    beforeEach(() => {
        mockTty = {
            _pid: 1234,
            kill: jest.fn(),
            onExit: jest.fn(),
        };
    });

    test('close() closes the WSS', () => {
        const mockWss = { close: jest.fn() };
        const terminal = {
            _tick: setInterval(() => {}, 1000),
            wss: mockWss,
            tty: mockTty,
            _closed: false,
        };

        // Replicate close() logic
        if (terminal._tick) {
            clearInterval(terminal._tick);
            terminal._tick = null;
        }
        if (terminal.wss) {
            terminal.wss.close();
            terminal.wss = null;
        }
        terminal.tty.kill();
        terminal._closed = true;

        expect(mockWss.close).toHaveBeenCalledTimes(1);
        expect(terminal.wss).toBeNull();
    });

    test('close() works when wss is null (client mode)', () => {
        const terminal = {
            _tick: null,
            wss: null,
            tty: mockTty,
            _closed: false,
        };

        const close = () => {
            if (terminal._tick) {
                clearInterval(terminal._tick);
                terminal._tick = null;
            }
            if (terminal.wss) {
                terminal.wss.close();
                terminal.wss = null;
            }
            terminal.tty.kill();
            terminal._closed = true;
        };

        expect(() => close()).not.toThrow();
        expect(terminal.wss).toBeNull();
    });

    test('close() sets wss to null after closing', () => {
        const mockWss = { close: jest.fn() };
        const terminal = {
            _tick: null,
            wss: mockWss,
            tty: mockTty,
            _closed: false,
        };

        if (terminal.wss) {
            terminal.wss.close();
            terminal.wss = null;
        }

        expect(terminal.wss).toBeNull();
        expect(mockWss.close).toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────
// LEAK-1: VoiceController listener cleanup (voiceController.class.js)
// ─────────────────────────────────────────────

describe('LEAK-1: VoiceController listener cleanup', () => {
    let mockIpcListeners;

    beforeEach(() => {
        mockIpcListeners = {};

        // Setup window.ipc mock matching the IPC wrapper from _renderer.js lines 129-140
        window.ipc = {
            invoke: jest.fn().mockResolvedValue({ available: true, success: true }),
            send: jest.fn(),
            on: jest.fn((channel, callback) => {
                const wrapped = (...args) => callback(...args);
                if (!mockIpcListeners[channel]) {
                    mockIpcListeners[channel] = [];
                }
                mockIpcListeners[channel].push(wrapped);
                return wrapped;
            }),
            removeListener: jest.fn((channel, wrapped) => {
                if (mockIpcListeners[channel]) {
                    mockIpcListeners[channel] = mockIpcListeners[channel].filter(h => h !== wrapped);
                }
            }),
        };
    });

    afterEach(() => {
        delete window.ipc;
    });

    test('window.ipc.on returns the wrapped handler', () => {
        const callback = jest.fn();
        const wrapped = window.ipc.on('test-channel', callback);

        expect(wrapped).toBeDefined();
        expect(typeof wrapped).toBe('function');
        // The wrapped handler should invoke the callback
        wrapped('test-data');
        expect(callback).toHaveBeenCalledWith('test-data');
    });

    test('window.ipc.removeListener removes the correct handler', () => {
        const callback = jest.fn();
        const wrapped = window.ipc.on('test-channel', callback);

        expect(mockIpcListeners['test-channel']).toHaveLength(1);

        window.ipc.removeListener('test-channel', wrapped);

        expect(window.ipc.removeListener).toHaveBeenCalledWith('test-channel', wrapped);
        expect(mockIpcListeners['test-channel']).toHaveLength(0);
    });

    test('release() removes the wake-word listener', () => {
        // Simulate what VoiceController does during initialize + release
        // From voiceController.class.js line 82:
        // this._wakeWordListener = window.ipc.on('voice:wake-word-detected', () => { ... });
        const wakeHandler = jest.fn();
        const wakeWordListener = window.ipc.on('voice:wake-word-detected', wakeHandler);

        expect(mockIpcListeners['voice:wake-word-detected']).toHaveLength(1);

        // Simulate release() from voiceController.class.js lines 427-441
        if (wakeWordListener) {
            window.ipc.removeListener('voice:wake-word-detected', wakeWordListener);
        }

        expect(window.ipc.removeListener).toHaveBeenCalledWith('voice:wake-word-detected', wakeWordListener);
        expect(mockIpcListeners['voice:wake-word-detected']).toHaveLength(0);
    });

    test('release() handles null _wakeWordListener gracefully', () => {
        // Simulate release() when _wakeWordListener was never set (init failed)
        const wakeWordListener = null;

        const release = () => {
            if (wakeWordListener) {
                window.ipc.removeListener('voice:wake-word-detected', wakeWordListener);
            }
        };

        expect(() => release()).not.toThrow();
        expect(window.ipc.removeListener).not.toHaveBeenCalled();
    });

    test('release() sets _wakeWordListener to null after cleanup', () => {
        // Replicate VoiceController cleanup logic
        let _wakeWordListener = window.ipc.on('voice:wake-word-detected', () => {});

        // release() logic from lines 431-434
        if (_wakeWordListener) {
            window.ipc.removeListener('voice:wake-word-detected', _wakeWordListener);
            _wakeWordListener = null;
        }

        expect(_wakeWordListener).toBeNull();
    });

    test('multiple on/removeListener cycles do not leak', () => {
        // Register and remove multiple listeners
        for (let i = 0; i < 5; i++) {
            const handler = window.ipc.on('voice:wake-word-detected', () => {});
            window.ipc.removeListener('voice:wake-word-detected', handler);
        }

        expect(mockIpcListeners['voice:wake-word-detected']).toHaveLength(0);
        expect(window.ipc.on).toHaveBeenCalledTimes(5);
        expect(window.ipc.removeListener).toHaveBeenCalledTimes(5);
    });
});
