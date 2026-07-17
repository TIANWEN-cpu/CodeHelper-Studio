import { execFile, execFileSync } from 'child_process'
import { platform } from 'os'
import { REQUIRED_DOCKER_IMAGE_REFS } from './dockerRunner'

export type ToolchainStatus = 'ready' | 'missing' | 'degraded'
export type ExecutionMode = 'local-controlled' | 'strong-isolation'
export type IsolationMode = ExecutionMode
export type CSharpToolchainVariant = 'dotnet' | 'csc' | 'mcs'

export interface IsolationInfo {
  mode: IsolationMode
  /** Short status-bar label — never claims a full sandbox. */
  label: string
  description: string
  strongIsolationAvailable: boolean
  strongIsolationReason: string
}

export interface DockerCapability {
  available: boolean
  reason: string
  images: readonly string[]
  probedAt: number
}

export interface ToolchainEntry {
  id: string
  languageIds: string[]
  status: ToolchainStatus
  command?: string
  version?: string
  message: string
  installHint?: string
  csharpVariant?: CSharpToolchainVariant
  runtimeCommand?: string
}

interface DotnetProbe {
  command: string
  version?: string
  /** `dotnet --version` is also available in runtime-only installations. */
  sdkAvailable?: boolean
}

export interface ToolchainReport {
  detectedAt: number
  platform: NodeJS.Platform
  isolation: IsolationInfo
  tools: ToolchainEntry[]
}

const IS_WIN = process.platform === 'win32'
let cachedReport: ToolchainReport | null = null
let inFlightReport: Promise<ToolchainReport> | null = null
let cacheGeneration = 0
/** Cached Docker strong-isolation capability. getIsolationInfo never blocks on Docker. */
let dockerCapabilityCache: DockerCapability | null = null

const INSTALL_HINTS: Record<string, string> = {
  python: IS_WIN
    ? '安装 Python 3 并勾选 “Add python.exe to PATH”，或从 https://www.python.org/downloads/ 安装'
    : '安装 Python 3：sudo apt install python3 / brew install python',
  node: '安装 Node.js LTS：https://nodejs.org/ 或使用 nvm / winget install OpenJS.NodeJS.LTS',
  gcc: IS_WIN
    ? '安装 MinGW-w64 或 MSYS2，并将 gcc 加入 PATH'
    : '安装 GCC：sudo apt install build-essential / xcode-select --install',
  'g++': IS_WIN
    ? '安装 MinGW-w64 或 MSYS2，并将 g++ 加入 PATH'
    : '安装 g++：sudo apt install g++ / xcode-select --install',
  csharp: IS_WIN
    ? '优先安装 .NET SDK（dotnet）：https://dotnet.microsoft.com/download ；或安装 Visual Studio 自带的 csc'
    : '优先安装 .NET SDK（dotnet）；或安装 Mono（mcs）',
  sql: 'SQL 使用应用内置 SQLite 辅助进程，无需外部客户端',
}

function lookupCommands(cmd: string): string[] {
  try {
    const lookup = IS_WIN ? 'where' : 'which'
    const resolved = execFileSync(lookup, [cmd], {
      timeout: 4_000,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    })
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean)
    return [...new Set(resolved)]
  } catch {
    return []
  }
}

function lookupCommandsAsync(cmd: string): Promise<string[]> {
  const lookup = IS_WIN ? 'where' : 'which'
  return new Promise((resolve) => {
    try {
      execFile(
        lookup,
        [cmd],
        {
          timeout: 4_000,
          encoding: 'utf-8',
          windowsHide: true,
        },
        (error, stdout) => {
          if (error) {
            resolve([])
            return
          }
          const resolved = String(stdout)
            .split(/\r?\n/)
            .map((value) => value.trim())
            .filter(Boolean)
          resolve([...new Set(resolved)])
        },
      )
    } catch {
      resolve([])
    }
  })
}

function readVersion(command: string, args: string[]): { responsive: boolean; version?: string } {
  try {
    const out = execFileSync(command, args, {
      timeout: 5_000,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const text = String(out).trim().split(/\r?\n/)[0]
    return { responsive: true, ...(text ? { version: text.slice(0, 120) } : {}) }
  } catch (error) {
    const failure = error as { stdout?: unknown; stderr?: unknown }
    const text = [failure.stdout, failure.stderr]
      .map((value) => (value === undefined || value === null ? '' : String(value)))
      .join('\n')
      .trim()
    const clearlyUnavailable =
      /not found|was not found|not recognized|no such file|无法找到|不是内部或外部命令|app store/i.test(
        text,
      )
    if (!text || clearlyUnavailable) return { responsive: false }
    return { responsive: true, version: text.split(/\r?\n/)[0].slice(0, 120) }
  }
}

function versionFromFailureOutput(
  stdout: unknown,
  stderr: unknown,
): {
  responsive: boolean
  version?: string
} {
  const text = [stdout, stderr]
    .map((value) => (value === undefined || value === null ? '' : String(value)))
    .join('\n')
    .trim()
  const clearlyUnavailable =
    /not found|was not found|not recognized|no such file|无法找到|不是内部或外部命令|app store/i.test(
      text,
    )
  if (!text || clearlyUnavailable) return { responsive: false }
  return { responsive: true, version: text.split(/\r?\n/)[0].slice(0, 120) }
}

function readVersionAsync(
  command: string,
  args: string[],
): Promise<{ responsive: boolean; version?: string }> {
  return new Promise((resolve) => {
    try {
      execFile(
        command,
        args,
        {
          timeout: 5_000,
          encoding: 'utf-8',
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          if (error) {
            resolve(versionFromFailureOutput(stdout, stderr))
            return
          }
          const text = String(stdout).trim().split(/\r?\n/)[0]
          resolve({ responsive: true, ...(text ? { version: text.slice(0, 120) } : {}) })
        },
      )
    } catch {
      resolve({ responsive: false })
    }
  })
}

function probeCommand(
  candidates: string[],
  versionArgs: string[],
  accepts: (probe: { command: string; version?: string }) => boolean = () => true,
): { command: string; version?: string } | null {
  for (const candidate of candidates) {
    for (const resolved of lookupCommands(candidate)) {
      const probe = readVersion(resolved, versionArgs)
      if (!probe.responsive) continue
      const result = { command: resolved, version: probe.version }
      if (accepts(result)) return result
    }
  }
  return null
}

async function probeCommandAsync(
  candidates: string[],
  versionArgs: string[],
  accepts: (probe: { command: string; version?: string }) => boolean = () => true,
): Promise<{ command: string; version?: string } | null> {
  for (const candidate of candidates) {
    for (const resolved of await lookupCommandsAsync(candidate)) {
      const probe = await readVersionAsync(resolved, versionArgs)
      if (!probe.responsive) continue
      const result = { command: resolved, version: probe.version }
      if (accepts(result)) return result
    }
  }
  return null
}

function isPython3(probe: { version?: string }): boolean {
  return /^Python\s+3(?:\.|\s|$)/i.test(probe.version?.trim() ?? '')
}

function entry(
  id: string,
  languageIds: string[],
  probed: { command: string; version?: string } | null,
  readyMessage: string,
  missingMessage: string,
  degraded?: { message: string; command?: string; version?: string },
): ToolchainEntry {
  if (degraded) {
    return {
      id,
      languageIds,
      status: 'degraded',
      command: degraded.command,
      version: degraded.version,
      message: degraded.message,
      installHint: INSTALL_HINTS[id],
    }
  }
  if (probed) {
    return {
      id,
      languageIds,
      status: 'ready',
      command: probed.command,
      version: probed.version,
      message: readyMessage,
    }
  }
  return {
    id,
    languageIds,
    status: 'missing',
    message: missingMessage,
    installHint: INSTALL_HINTS[id],
  }
}

const LOCAL_ISOLATION_DESCRIPTION =
  '非 SQL 代码在独立的一次性 utility 进程中运行，并限制超时、输出、并发与临时目录；SQL 在独立 SQLite utility 的内存数据库中运行，并有输入、输出与超时限制。' +
  (IS_WIN
    ? 'Windows 仅对非 SQL 运行使用 Job Object，最多 32 个进程、单进程 384MB、作业总计 768MB；SQL 不在该 Job 内。非 SQL 代码仍可访问同用户文件与网络，并非 AppContainer 或沙箱。'
    : 'POSIX 非 SQL 路径仅做 best effort：Python/C/C++/Mono 尝试通过 ulimit 限制地址空间，Node 只限制 V8 old-space，dotnet 没有进程内存上限，均无严格 RSS 保证；进程组后代仍可能逃逸，且可访问同用户文件与网络，未提供容器边界，并非沙箱。') +
  ' 可选强隔离模式在 Docker 容器中运行受支持语言（无网络、只读根文件系统、丢弃 capabilities、非 root、资源限制）；SQL 不进入 Docker，仅支持本地受控模式。'

const STRONG_ISOLATION_DESCRIPTION =
  '代码在固定 digest 的 Docker 镜像中以非 root 用户运行，并使用无网络、只读根文件系统、丢弃 capabilities、no-new-privileges、CPU/内存/PID、输出和超时限制。源码只读挂载，容器在完成或中止后清理。SQL 不支持此模式。'

function localFallbackStrongIsolationReason(): string {
  return IS_WIN
    ? 'Job Object 仅约束非 SQL 的资源与生命周期；各 utility 均未提供 AppContainer 文件系统或网络隔离。Docker 强隔离需要可用 daemon 与已固定 digest 的镜像。'
    : 'ulimit 与进程组属于 best-effort 约束；Node/dotnet 没有严格总内存限制，也未提供容器边界且仍有逃逸可能。Docker 强隔离需要可用 daemon 与已固定 digest 的镜像。'
}

function buildIsolationInfo(
  capability: DockerCapability | null,
  mode: ExecutionMode = 'local-controlled',
): IsolationInfo {
  const dockerReady = capability?.available === true
  return {
    mode,
    label: mode === 'strong-isolation' ? 'Docker 强隔离' : '本地受控运行（非强隔离）',
    description:
      mode === 'strong-isolation' ? STRONG_ISOLATION_DESCRIPTION : LOCAL_ISOLATION_DESCRIPTION,
    strongIsolationAvailable: dockerReady,
    strongIsolationReason: dockerReady
      ? (capability?.reason ??
        'Docker strong isolation is ready; code runs with no network, read-only root filesystem, dropped capabilities, non-root user, and resource limits. SQL is not supported in this mode.')
      : (capability?.reason ??
        `Docker strong isolation has not been probed yet. ${localFallbackStrongIsolationReason()}`),
  }
}

/**
 * Non-blocking isolation status for UI and run results.
 * Uses the last Docker capability probe from detectToolchains / detectToolchainsAsync.
 * Never calls Docker synchronously — fail closed until a probe has succeeded.
 */
export function getIsolationInfo(mode: ExecutionMode = 'local-controlled'): IsolationInfo {
  return buildIsolationInfo(dockerCapabilityCache, mode)
}

export function getDockerCapabilityCache(): DockerCapability | null {
  return dockerCapabilityCache
}

function probeDockerCapabilitySync(): DockerCapability {
  const probedAt = Date.now()
  try {
    execFileSync('docker', ['image', 'inspect', ...REQUIRED_DOCKER_IMAGE_REFS], {
      timeout: 5_000,
      stdio: 'ignore',
      windowsHide: true,
    })
    return {
      available: true,
      reason:
        'Docker strong isolation is ready; code runs with no network, read-only root filesystem, dropped capabilities, non-root user, and resource limits. SQL is not supported in this mode.',
      images: REQUIRED_DOCKER_IMAGE_REFS,
      probedAt,
    }
  } catch {
    return {
      available: false,
      reason:
        'Docker daemon unavailable or required pinned images missing (python/node/gcc/dotnet SDK digests). Strong isolation fails closed and never falls back to local execution.',
      images: REQUIRED_DOCKER_IMAGE_REFS,
      probedAt,
    }
  }
}

function probeDockerCapabilityAsync(): Promise<DockerCapability> {
  const probedAt = Date.now()
  return new Promise((resolve) => {
    try {
      execFile(
        'docker',
        ['image', 'inspect', ...REQUIRED_DOCKER_IMAGE_REFS],
        {
          timeout: 5_000,
          encoding: 'utf-8',
          windowsHide: true,
        },
        (error) => {
          if (error) {
            resolve({
              available: false,
              reason:
                'Docker daemon unavailable or required pinned images missing (python/node/gcc/dotnet SDK digests). Strong isolation fails closed and never falls back to local execution.',
              images: REQUIRED_DOCKER_IMAGE_REFS,
              probedAt,
            })
            return
          }
          resolve({
            available: true,
            reason:
              'Docker strong isolation is ready; code runs with no network, read-only root filesystem, dropped capabilities, non-root user, and resource limits. SQL is not supported in this mode.',
            images: REQUIRED_DOCKER_IMAGE_REFS,
            probedAt,
          })
        },
      )
    } catch {
      resolve({
        available: false,
        reason:
          'Docker daemon unavailable or required pinned images missing (python/node/gcc/dotnet SDK digests). Strong isolation fails closed and never falls back to local execution.',
        images: REQUIRED_DOCKER_IMAGE_REFS,
        probedAt,
      })
    }
  })
}

interface CSharpProbes {
  dotnet: DotnetProbe | null
  csc: { command: string; version?: string } | null
  mcs: { command: string; version?: string } | null
  mono: { command: string; version?: string } | null
}

interface ToolchainProbes extends CSharpProbes {
  python: { command: string; version?: string } | null
  node: { command: string; version?: string } | null
  gcc: { command: string; version?: string } | null
  gpp: { command: string; version?: string } | null
}

/** Pure selection logic so every platform branch remains deterministic in tests. */
export function selectCSharpToolchain(
  targetPlatform: NodeJS.Platform,
  { dotnet, csc, mcs, mono }: CSharpProbes,
): ToolchainEntry {
  if (dotnet && dotnet.sdkAvailable !== false) {
    return {
      id: 'csharp',
      languageIds: ['csharp'],
      status: 'ready',
      command: dotnet.command,
      version: dotnet.version,
      csharpVariant: 'dotnet',
      message: `C# 就绪（dotnet ${dotnet.version ?? ''}）`.trim(),
    }
  }
  if (targetPlatform === 'win32' && csc) {
    return {
      id: 'csharp',
      languageIds: ['csharp'],
      status: 'degraded',
      command: csc.command,
      version: csc.version,
      csharpVariant: 'csc',
      message: 'C# 使用 csc 兼容路径；建议安装 .NET SDK（dotnet）以获得更好支持',
      installHint: INSTALL_HINTS.csharp,
    }
  }
  if (targetPlatform !== 'win32' && csc && mono) {
    return {
      id: 'csharp',
      languageIds: ['csharp'],
      status: 'degraded',
      command: csc.command,
      version: csc.version,
      csharpVariant: 'csc',
      runtimeCommand: mono.command,
      message:
        'C# uses the csc compatibility path with Mono; install the .NET SDK for full support',
      installHint: INSTALL_HINTS.csharp,
    }
  }
  if (targetPlatform !== 'win32' && csc) {
    return {
      id: 'csharp',
      languageIds: ['csharp'],
      status: 'missing',
      command: csc.command,
      version: csc.version,
      csharpVariant: 'csc',
      message: 'Found csc but not the Mono runtime required to execute its output',
      installHint: INSTALL_HINTS.csharp,
    }
  }
  if (targetPlatform !== 'win32' && mcs && mono) {
    return {
      id: 'csharp',
      languageIds: ['csharp'],
      status: 'degraded',
      command: mcs.command,
      version: mcs.version,
      csharpVariant: 'mcs',
      runtimeCommand: mono.command,
      message: 'C# 使用 Mono mcs 兼容路径；建议安装 .NET SDK（dotnet）',
      installHint: INSTALL_HINTS.csharp,
    }
  }
  if (targetPlatform !== 'win32' && mcs) {
    return {
      id: 'csharp',
      languageIds: ['csharp'],
      status: 'missing',
      command: mcs.command,
      version: mcs.version,
      csharpVariant: 'mcs',
      message: '找到 mcs 但未找到 mono 运行时，无法执行编译产物',
      installHint: INSTALL_HINTS.csharp,
    }
  }
  return {
    id: 'csharp',
    languageIds: ['csharp'],
    status: 'missing',
    message: '未找到 C# 编译器（dotnet / csc / mcs）',
    installHint: INSTALL_HINTS.csharp,
  }
}

function createToolchainReport(
  probes: ToolchainProbes,
  dockerCapability: DockerCapability,
): ToolchainReport {
  const { python, node, gcc, gpp, dotnet, csc, mcs, mono } = probes
  dockerCapabilityCache = dockerCapability
  const csharp = selectCSharpToolchain(process.platform, { dotnet, csc, mcs, mono })

  const tools: ToolchainEntry[] = [
    entry(
      'python',
      ['python'],
      python,
      `Python 就绪${python?.version ? `（${python.version}）` : ''}`,
      '未找到 Python 解释器',
    ),
    entry(
      'node',
      ['javascript', 'node'],
      node,
      `Node.js 就绪${node?.version ? `（${node.version}）` : ''}`,
      '未找到 Node.js',
    ),
    entry(
      'gcc',
      ['c'],
      gcc,
      `C 编译器就绪${gcc?.version ? `（${gcc.version}）` : ''}`,
      '未找到 gcc',
    ),
    entry(
      'g++',
      ['cpp'],
      gpp,
      `C++ 编译器就绪${gpp?.version ? `（${gpp.version}）` : ''}`,
      '未找到 g++',
    ),
    csharp,
    entry('sql', ['sql'], { command: 'builtin-sqlite' }, 'SQL 就绪（内置 SQLite 辅助进程）', ''),
  ]

  return {
    detectedAt: Date.now(),
    platform: platform(),
    isolation: buildIsolationInfo(dockerCapability),
    tools,
  }
}

function probeDotnetSdk(): DotnetProbe | null {
  const dotnet = probeCommand(['dotnet'], ['--version'])
  if (!dotnet) return null
  const sdk = readVersion(dotnet.command, ['--list-sdks'])
  return { ...dotnet, sdkAvailable: sdk.responsive && Boolean(sdk.version?.trim()) }
}

async function probeDotnetSdkAsync(): Promise<DotnetProbe | null> {
  const dotnet = await probeCommandAsync(['dotnet'], ['--version'])
  if (!dotnet) return null
  const sdk = await readVersionAsync(dotnet.command, ['--list-sdks'])
  return { ...dotnet, sdkAvailable: sdk.responsive && Boolean(sdk.version?.trim()) }
}

function probeToolchains(): ToolchainProbes {
  return {
    python: probeCommand(
      IS_WIN ? ['python', 'python3'] : ['python3', 'python'],
      ['--version'],
      isPython3,
    ),
    node: probeCommand(['node'], ['--version']),
    gcc: probeCommand(['gcc'], ['--version']),
    gpp: probeCommand(['g++'], ['--version']),
    dotnet: probeDotnetSdk(),
    csc: probeCommand(['csc'], ['/?']),
    mcs: !IS_WIN ? probeCommand(['mcs'], ['--version']) : null,
    mono: !IS_WIN ? probeCommand(['mono'], ['--version']) : null,
  }
}

async function probeToolchainsAsync(): Promise<ToolchainProbes> {
  const [python, node, gcc, gpp, dotnet, csc, mcs, mono] = await Promise.all([
    probeCommandAsync(
      IS_WIN ? ['python', 'python3'] : ['python3', 'python'],
      ['--version'],
      isPython3,
    ),
    probeCommandAsync(['node'], ['--version']),
    probeCommandAsync(['gcc'], ['--version']),
    probeCommandAsync(['g++'], ['--version']),
    probeDotnetSdkAsync(),
    probeCommandAsync(['csc'], ['/?']),
    !IS_WIN ? probeCommandAsync(['mcs'], ['--version']) : Promise.resolve(null),
    !IS_WIN ? probeCommandAsync(['mono'], ['--version']) : Promise.resolve(null),
  ])
  return { python, node, gcc, gpp, dotnet, csc, mcs, mono }
}

/**
 * Synchronous compatibility API for the disposable runner and direct tests.
 * Electron main-process callers should use detectToolchainsAsync instead.
 * Docker capability is probed here once per refresh and cached for getIsolationInfo.
 */
export function detectToolchains(force = false): ToolchainReport {
  if (!force && cachedReport) return cachedReport

  const generation = ++cacheGeneration
  const report = createToolchainReport(probeToolchains(), probeDockerCapabilitySync())
  if (generation === cacheGeneration) cachedReport = report
  return report
}

/** Non-blocking main-process probe with shared cache and in-flight de-duplication. */
export function detectToolchainsAsync(force = false): Promise<ToolchainReport> {
  if (!force && cachedReport) return Promise.resolve(cachedReport)
  if (inFlightReport) return inFlightReport

  const generation = ++cacheGeneration
  const pending = Promise.all([probeToolchainsAsync(), probeDockerCapabilityAsync()])
    .then(([probes, dockerCapability]) => createToolchainReport(probes, dockerCapability))
    .then((report) => {
      if (generation === cacheGeneration) cachedReport = report
      return report
    })
    .finally(() => {
      if (inFlightReport === pending) inFlightReport = null
    })
  inFlightReport = pending
  return pending
}

export function invalidateToolchainCache(): void {
  cacheGeneration++
  cachedReport = null
  inFlightReport = null
  dockerCapabilityCache = null
}

export function findToolchainForLanguage(
  report: ToolchainReport,
  language: string,
): ToolchainEntry | undefined {
  const normalized = language.trim().toLowerCase()
  return report.tools.find((tool) => tool.languageIds.includes(normalized))
}

export function missingToolchainError(tool: ToolchainEntry): string {
  const parts = [tool.message]
  if (tool.installHint) parts.push(`安装建议：${tool.installHint}`)
  return parts.join('\n')
}
