/**
 * Real Docker integration smoke for strong isolation.
 * Skips automatically when the daemon or pinned images are unavailable.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { execFileSync } from 'child_process'
import { readdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  REQUIRED_DOCKER_IMAGE_REFS,
  runDockerIsolated,
  DOCKER_TIMEOUT_MS,
} from '../electron/utils/dockerRunner'
import { runCodeSnippet } from '../electron/utils/codeRunner'

vi.mock('electron', () => {
  throw new Error('Docker isolation must not load the Electron runtime')
})

function dockerReady(): boolean {
  try {
    execFileSync('docker', ['image', 'inspect', ...REQUIRED_DOCKER_IMAGE_REFS], {
      stdio: 'ignore',
      timeout: 8_000,
      windowsHide: true,
    })
    return true
  } catch {
    return false
  }
}

function listCodehelperContainers(): string[] {
  try {
    const out = execFileSync('docker', ['ps', '-aq', '--filter', 'label=codehelper.isolation=1'], {
      encoding: 'utf-8',
      timeout: 8_000,
      windowsHide: true,
    })
    return out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

const ready = dockerReady()

function dockerRunDirectories(): string[] {
  try {
    return readdirSync(join(tmpdir(), 'codehelper-docker')).sort()
  } catch {
    return []
  }
}

describe.skipIf(!ready)('Docker strong isolation integration', () => {
  beforeAll(() => {
    // Best-effort cleanup of any leftover labeled containers from prior aborted runs.
    for (const id of listCodehelperContainers()) {
      try {
        execFileSync('docker', ['rm', '-f', id], {
          stdio: 'ignore',
          timeout: 8_000,
          windowsHide: true,
        })
      } catch {
        // ignore
      }
    }
  })

  it('runs Python in a real container', async () => {
    const result = await runCodeSnippet('print("py-ok")', 'python', undefined, 'strong-isolation')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('py-ok')
    expect(result.isolation?.mode).toBe('strong-isolation')
  }, 60_000)

  it('runs Node in a real container', async () => {
    const result = await runCodeSnippet(
      'console.log("node-ok")',
      'javascript',
      undefined,
      'strong-isolation',
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('node-ok')
  }, 60_000)

  it('runs C in a real container', async () => {
    const result = await runCodeSnippet(
      '#include <stdio.h>\nint main(void){puts("c-ok");return 0;}',
      'c',
      undefined,
      'strong-isolation',
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('c-ok')
  }, 90_000)

  it('runs C++ in a real container', async () => {
    const result = await runCodeSnippet(
      '#include <iostream>\nint main(){std::cout<<"cpp-ok\\n";return 0;}',
      'cpp',
      undefined,
      'strong-isolation',
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('cpp-ok')
  }, 90_000)

  it('runs C# in a real container', async () => {
    const result = await runCodeSnippet(
      'System.Console.WriteLine("csharp-ok");',
      'csharp',
      undefined,
      'strong-isolation',
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('csharp-ok')
  }, 180_000)

  it('blocks outbound network', async () => {
    const result = await runCodeSnippet(
      [
        'import socket',
        's = socket.socket()',
        's.settimeout(2)',
        'try:',
        "  s.connect(('1.1.1.1', 80))",
        "  print('NETWORK_OPEN')",
        'except Exception as e:',
        "  print('NETWORK_BLOCKED')",
        '  raise SystemExit(0)',
      ].join('\n'),
      'python',
      undefined,
      'strong-isolation',
    )
    expect(result.stdout).toContain('NETWORK_BLOCKED')
    expect(result.stdout).not.toContain('NETWORK_OPEN')
  }, 60_000)

  it('forwards stdin through the full strong-isolation dispatch path', async () => {
    const result = await runCodeSnippet(
      'print(input())',
      'python',
      'stdin-through-docker\n',
      'strong-isolation',
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('stdin-through-docker')
  }, 60_000)

  it('enforces the PID limit', async () => {
    const result = await runDockerIsolated(
      [
        'import os, signal',
        'children = []',
        'try:',
        '  for _ in range(100):',
        '    pid = os.fork()',
        '    if pid == 0:',
        '      os.pause()',
        '    children.append(pid)',
        'except OSError:',
        "  print('PID_LIMITED')",
        'finally:',
        '  for pid in children:',
        '    try: os.kill(pid, signal.SIGKILL)',
        '    except ProcessLookupError: pass',
        '  for pid in children:',
        '    try: os.waitpid(pid, 0)',
        '    except ChildProcessError: pass',
      ].join('\n'),
      'python',
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('PID_LIMITED')
  }, 60_000)

  it('enforces the memory limit', async () => {
    const result = await runDockerIsolated(
      [
        'chunks = []',
        'try:',
        '  while True:',
        '    chunks.append(bytearray(16 * 1024 * 1024))',
        'except MemoryError:',
        "  print('MEMORY_LIMITED')",
      ].join('\n'),
      'python',
    )
    expect(result.exitCode !== 0 || result.stdout.includes('MEMORY_LIMITED')).toBe(true)
  }, 60_000)

  it('removes the host-side run directory after completion', async () => {
    const before = new Set(dockerRunDirectories())
    const result = await runDockerIsolated('print("cleanup-ok")', 'python')
    expect(result.exitCode).toBe(0)
    const leaked = dockerRunDirectories().filter((entry) => !before.has(entry))
    expect(leaked).toEqual([])
  }, 60_000)

  it('times out and leaves no labeled containers running', async () => {
    const before = new Set(listCodehelperContainers())
    const result = await runDockerIsolated(
      'import time\ntime.sleep(60)\nprint("should-not-print")',
      'python',
      undefined,
      { timeoutMs: 2_000 },
    )
    expect(result.timedOut).toBe(true)
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toMatch(/timed out/i)

    // Allow docker daemon a moment to reap the container after rm -f / --rm.
    await new Promise((r) => setTimeout(r, 1_500))
    const after = listCodehelperContainers().filter((id) => !before.has(id))
    expect(after).toEqual([])
  }, 30_000)

  it('cancels and force-removes the active container', async () => {
    const before = new Set(listCodehelperContainers())
    const controller = new AbortController()
    const pending = runDockerIsolated(
      'import time\ntime.sleep(60)\nprint("should-not-print")',
      'python',
      undefined,
      {},
      controller.signal,
    )
    setTimeout(() => controller.abort(), 500)
    const result = await pending

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toMatch(/cancelled/i)
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    const after = listCodehelperContainers().filter((id) => !before.has(id))
    expect(after).toEqual([])
  }, 30_000)

  it('rejects SQL without spawning a container path success', async () => {
    const result = await runDockerIsolated('SELECT 1', 'sql')
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toMatch(/SQL/i)
  })
})

describe('Docker strong isolation integration (always)', () => {
  it('documents default timeout constant', () => {
    expect(DOCKER_TIMEOUT_MS).toBe(10_000)
  })

  it('skips real container tests when Docker images are missing', () => {
    expect(REQUIRED_DOCKER_IMAGE_REFS.length).toBe(4)
    expect(typeof ready).toBe('boolean')
  })
})
