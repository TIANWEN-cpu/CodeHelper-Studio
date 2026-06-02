# Cross-Platform Notes

This document records the cross-platform considerations, known differences, and platform-specific behaviors in CodeHelper.

## Build Targets

CodeHelper builds for three platforms via electron-builder:

| Platform | Format             | Architecture |
| -------- | ------------------ | ------------ |
| Windows  | NSIS, Portable     | x64          |
| macOS    | DMG, ZIP           | x64, arm64   |
| Linux    | AppImage, DEB, RPM | x64          |

### Build Commands

```
npm run build:win     # Windows only
npm run build:mac     # macOS only
npm run build:linux   # Linux only
npm run package       # All platforms (host-dependent)
```

### macOS Entitlements

The macOS build uses `resources/entitlements.mac.plist` to allow:

- JIT compilation (V8 JavaScript engine)
- Unsigned executable memory (native Node modules like better-sqlite3)
- Dynamic library loading from the app bundle
- Network access (AI API calls)

Code signing requires setting `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables.

## Keyboard Shortcuts

All keyboard shortcuts use `event.ctrlKey || event.metaKey` to ensure cross-platform compatibility:

| Shortcut        | Windows/Linux | macOS       |
| --------------- | ------------- | ----------- |
| New Chat        | Ctrl+N        | Cmd+N       |
| Save            | Ctrl+S        | Cmd+S       |
| Run Code        | Ctrl+Enter    | Cmd+Enter   |
| Command Palette | Ctrl+Shift+P  | Cmd+Shift+P |
| Global Search   | Ctrl+Shift+F  | Cmd+Shift+F |

The application menu automatically adapts for macOS by inserting the app-name menu with standard macOS items (About, Hide, Quit) when `process.platform === 'darwin'`.

## Code Execution (codeRunner)

The code execution engine adapts to each platform:

### Command Resolution

- **Windows**: Uses `where` to resolve command paths
- **macOS/Linux**: Uses `which` to resolve command paths

### Language-Specific Notes

| Language | Windows                     | macOS / Linux |
| -------- | --------------------------- | ------------- |
| Python   | `python`                    | `python3`     |
| C        | `gcc`                       | `gcc`         |
| C++      | `g++`                       | `g++`         |
| C#       | `csc` (.NET Framework)      | `mcs` (Mono)  |
| SQL      | better-sqlite3 (in-process) | same          |

### Compiled Output

- Windows: Executables get `.exe` extension
- macOS/Linux: No extension (executable permission set by compiler)

### Dependencies by Platform

**Windows:**

- Python: Install from python.org or Microsoft Store
- GCC/G++: Install via MinGW or MSYS2
- C#: Ships with .NET Framework

**macOS:**

- Python 3: `brew install python` or Xcode Command Line Tools
- GCC/G++: `brew install gcc` or Xcode Command Line Tools
- C# (Mono): `brew install mono`

**Linux:**

- Python 3: `sudo apt install python3` (Debian/Ubuntu) or equivalent
- GCC/G++: `sudo apt install build-essential`
- C# (Mono): `sudo apt install mono-complete`

## File Path Handling

All file paths in the Electron main process use `path.join()` and `path.resolve()` from Node.js `path` module, which automatically handles platform-specific separators (`\` on Windows, `/` on macOS/Linux).

Key path usage:

- **Database**: `app.getPath('userData')` -- platform-appropriate user data directory
- **Temp files**: `app.getPath('temp')` -- platform-appropriate temp directory
- **Schema SQL**: Multiple candidate paths checked at runtime for dev vs packaged mode
- **Resources**: `process.resourcesPath` for packaged app resources

## Theme and Fonts

### Editor Font Stack

```
'Cascadia Code', 'Fira Code', Menlo, Monaco, 'DejaVu Sans Mono', Consolas, monospace
```

Platform font availability:

- **Cascadia Code**: Primarily Windows (bundled with Windows Terminal)
- **Fira Code**: Cross-platform (installable)
- **Menlo**: macOS system monospace font
- **Monaco**: macOS legacy monospace font
- **DejaVu Sans Mono**: Common on Linux distributions
- **Consolas**: Windows system monospace font

Themes use CSS custom properties (`var(--theme-*)`) which render consistently across platforms since Chromium handles the styling.

## Platform Detection

The renderer can query platform information via the `platform-info` IPC channel:

```typescript
const info = await typedInvoke('platform-info')
// { platform: 'Windows', arch: 'x64', osVersion: '...', ... }
```

This is used in:

- **Status bar**: Displays platform and architecture
- **About dialog**: Shows full platform and version details

## Window Behavior

- **macOS**: The app does not quit when all windows are closed (standard macOS behavior). Clicking the dock icon re-creates the window.
- **Windows/Linux**: The app quits when all windows are closed.
- The macOS app menu includes standard items: About, Hide, Hide Others, Show All, Quit.

## Known Platform Differences

1. **Font rendering**: Text may look slightly different across platforms due to OS-level font rendering (ClearType on Windows, Core Text on macOS, FreeType on Linux).
2. **Title bar**: The native title bar style varies by OS. The app does not use a custom title bar.
3. **Scrollbars**: Overlay scrollbars on macOS vs. always-visible on Windows/Linux.
4. **Keyboard layout**: Shortcut display in menus shows the platform-appropriate modifier key automatically via Electron's `role` property.
