# Son of Anton - Quick Reference Card

## 🚪 How to Exit

### Method 1: Keyboard Shortcut (Fastest)
Press **`Cmd+Q`** (Command + Q)

### Method 2: Settings Menu
1. Click the **Settings** icon (gear icon in the UI)
2. Click the **"Quit"** button at the bottom

### Method 3: Force Quit (if frozen)
Press **`Cmd+Option+Esc`** and select "Son of Anton"

## ⌨️ Essential Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Q` | **Quit application** |
| `F11` | Toggle fullscreen |
| `Ctrl+Shift+T` | New terminal tab |
| `Ctrl+Shift+W` | Close current tab |
| `Ctrl+Shift+C` | Copy |
| `Ctrl+Shift+V` | Paste |
| `Ctrl+Tab` | Next tab |

## 🎯 Quick Actions

### Open Settings
Look for the **gear icon** in the interface and click it

### Change Theme
1. Open Settings (gear icon)
2. Find "theme" setting
3. Choose from: tron, blade, matrix, nord, navy, red, apollo, cyborg, interstellar, chalkboard

### Run Claude Code
Just type `claude` in the terminal

### Clear Terminal
Type `clear` or press `Ctrl+L`

## 🐛 Emergency Commands

```bash
# Kill the app from terminal
pkill -f "Electron src"

# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Reset all settings
rm -rf ~/Library/Application\ Support/Son\ of\ Anton
```

## 📍 Important Locations

- **Settings:** `~/Library/Application Support/Son of Anton/settings.json`
- **Project:** `/Users/test/Desktop/Hireal/son-of-anton-public`
- **Launcher:** Desktop > "Son of Anton.app"

---

**Pro Tip:** Keep this file handy for quick reference! 📌
