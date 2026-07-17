# Cross-Platform Notes

This document records the cross-platform considerations, known differences, and platform-specific behaviors in CodeHelper.

## Build Targets

The current official release target is Windows x64. The electron-builder configuration also keeps
macOS and Linux source-build targets, but those artifacts are not uploaded to GitHub Releases until
they have equivalent signing, installation, runtime, restart-persistence, and uninstall gates.

| Platform | Configured format | Architecture | Official release status |
| -------- | ----------------- | ------------ | ----------------------- |
| Windows  | NSIS, Portable    | x64          | Supported               |
| macOS    | DMG, ZIP          | x64, arm64   | Source build only       |
| Linux    | AppImage, DEB     | x64          | Source build only       |

### Build Commands

```text
npm run build:win       # signed/unsigned package plus the Windows package verifier
npm run package:win     # build NSIS and Portable artifacts without publishing
npm run package:win:dir # build and verify win-unpacked resources
npm run build:mac       # source build only; not an official release artifact
npm run build:linux     # source build only; not an official release artifact
```

Windows source builds compile the x64 Job Object host before `dev` and `build`. A clean checkout
therefore requires either MinGW-w64 x64 `g++` or Visual Studio C++ Build Tools. The generated
`resources/bin/win32-x64/codehelper-job-host.exe` is deliberately ignored; release builds recreate
it from `native/windows/codehelper-job-host.cpp` and fail closed when no supported compiler is
available.

Official Windows releases additionally require valid Authenticode signatures and timestamps,
verified Electron Fuses and resources, a silent NSIS install/core-loop/restart/uninstall smoke, the
same runtime smoke for Portable, and published SHA-256 verification. See
[Build and Release](guides/deployment.md) and the
[Release and Rollback Checklist](guides/release-checklist.md).

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

Non-SQL code runs in a disposable Electron utility process. Toolchain discovery uses
asynchronous child-process probes so a slow or broken local tool does not block the Electron
main event loop.

### Command Resolution

- **Windows**: Uses `where` to resolve command paths
- **macOS/Linux**: Uses `which` to resolve command paths

### Language-Specific Notes

| Language   | Windows                            | macOS / Linux                                   |
| ---------- | ---------------------------------- | ----------------------------------------------- |
| Python     | Python 3 from `python` / `python3` | Python 3 from `python3` / `python`              |
| C          | `gcc`                              | `gcc`                                           |
| C++        | `g++`                              | `g++`                                           |
| C#         | .NET SDK `dotnet`, then `csc`      | .NET SDK `dotnet`, then `csc` or `mcs` + `mono` |
| JavaScript | `node`                             | `node`                                          |
| SQL        | bundled SQLite utility process     | same                                            |

### Compiled Output

- Windows: Executables get `.exe` extension
- macOS/Linux: No extension (executable permission set by compiler)

### Dependencies by Platform

**Windows:**

- Python: Install from python.org or Microsoft Store
- GCC/G++: Install via MinGW or MSYS2
- C#: Install the .NET SDK; a runtime-only `dotnet` installation is not sufficient for compilation. `csc` is a degraded compatibility path, and POSIX also requires `mono` to run its output.

**macOS:**

- Python 3: `brew install python` or Xcode Command Line Tools
- GCC/G++: `brew install gcc` or Xcode Command Line Tools
- C# (Mono): `brew install mono`

**Linux:**

- Python 3: `sudo apt install python3` (Debian/Ubuntu) or equivalent
- GCC/G++: `sudo apt install build-essential`
- C# (Mono): `sudo apt install mono-complete`

### Execution Containment

For non-SQL runs:

| Platform      | Enforced controls                                                                                | Remaining boundary                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Windows x64   | Fail-closed native Job Object, 32-process cap, 384 MB per process, 768 MB per Job, kill-on-close | Not AppContainer: code retains same-user filesystem and network access                                                        |
| macOS / Linux | File-size `ulimit`; address-space `ulimit` for Python/C/C++/Mono; detached process group cleanup | Node has only a V8 old-space limit, dotnet has no process-memory limit, and neither has a strict RSS cap; no cgroup/container |

Every non-SQL run also has a 10-second timeout, 1 MB combined output cap, five-request concurrency cap,
and a recursively monitored 50 MB temporary-directory quota. Directory scans do not follow
symlinks or junctions; a scan failure stops the run conservatively.

SQL uses a separate SQLite utility and in-memory database, outside the Windows Job Object and the
non-SQL directory quota. It has a 3-second timeout, 256 KB input and 100-statement caps, at most
1,000 result rows, a 512 KB formatted-output cap, and a 64 KB per-cell cap. The utility also attempts
to set SQLite's 128 MB `hard_heap_limit` when the bundled SQLite version supports it.

These controls reduce accidental and runaway resource use. They are not a security sandbox for
local-controlled mode.

### Docker strong isolation

When Docker is available and the pinned images are present, the UI may set
`strongIsolationAvailable` to `true`. Strong isolation:

- Runs Python, Node/JavaScript, C, C++, and C# in Docker with fixed image digests
- Mounts source read-only at `/work`, uses `--network none`, `--read-only`, `--cap-drop ALL`,
  `no-new-privileges`, non-root `65534`, CPU/memory/PID limits, and a tmpfs `/tmp`
- Keeps stdin attached for runner input, records the container id via `--cidfile`, assigns a unique
  container name, and force-removes it (`docker rm -f`) on timeout, output-limit abort, or abnormal
  Docker client exit (in addition to `docker run --rm`)
- **Fails closed**: missing daemon or images never fall back to local execution
- **Does not support SQL**: SQL stays on the in-memory SQLite utility under local-controlled only

Images are not auto-pulled. Required refs are defined in `electron/utils/dockerRunner.ts`
(`REQUIRED_DOCKER_IMAGE_REFS`).

## File Path Handling

All file paths in the Electron main process use `path.join()` and `path.resolve()` from Node.js `path` module, which automatically handles platform-specific separators (`\` on Windows, `/` on macOS/Linux).

Key path usage:

- **Database**: `app.getPath('userData')` -- platform-appropriate user data directory
- **Temp files**: `app.getPath('temp')` -- platform-appropriate temp directory
- **Schema SQL**: Multiple candidate paths checked at runtime for dev vs packaged mode
- **Resources**: `process.resourcesPath` for packaged app resources

### Backup and credential portability

A complete recovery point is the whole Electron `userData` directory after every CodeHelper process
has exited. Copying only `codehelper.db` can miss WAL commits and Chromium localStorage recovery
records. The Settings JSON export is a logical subset and is not a full backup. See
[Backup and Restore Runbook](guides/backup-restore-runbook.md).

AI API keys are encrypted with Electron `safeStorage` when a secure backend is available. New saves
fail closed when encryption is unavailable or Linux reports the `basic_text` backend. Encrypted
values can be tied to the original OS account, so a cross-device `userData` restore may require the
user to enter API keys again. Legacy unprefixed values remain a compatibility risk documented in the
[Security Audit](security-audit.md).

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
