import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
const mockInvoke = vi.fn()
let storageSetItem: ReturnType<typeof vi.fn>

vi.stubGlobal('window', {
  api: {
    invoke: mockInvoke,
    on(channel: string, callback: (...args: unknown[]) => void) {
      const set = listeners.get(channel) ?? new Set<(...args: unknown[]) => void>()
      set.add(callback)
      listeners.set(channel, set)
      return () => set.delete(callback)
    },
  },
})

const settingsService = await import('../src/services/settingsService')
const aiService = await import('../src/services/aiService')
const { normalizeChatSessions } = await import('../src/stores/chatStore')
const { AI_PANEL_MAX_WIDTH, useAppStore } = await import('../src/store')

function emit(channel: string, payload: unknown) {
  listeners.get(channel)?.forEach((listener) => listener(payload))
}

beforeEach(() => {
  mockInvoke.mockReset()
  listeners.clear()
  storageSetItem = vi.fn()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn(() => null),
      setItem: storageSetItem,
    },
  })
  useAppStore.setState({
    currentView: 'home',
    showAITutor: false,
    aiContext: null,
    aiPanelWidth: 420,
  })
})

describe('production fix coverage', () => {
  it('keeps AI context when a source view unmounts into the independent assistant page', () => {
    const ctx = { kind: 'problem' as const, title: 'Two Sum', language: 'ts', code: 'return 1' }

    useAppStore.getState().setAIContext(ctx)
    useAppStore.getState().setCurrentView('ai-tutor')
    useAppStore.getState().setAIContext(null)

    expect(useAppStore.getState().aiContext).toEqual(ctx)
  })

  it('clears AI context normally when not entering an AI surface', () => {
    const ctx = { kind: 'lesson' as const, title: 'Binary Search' }

    useAppStore.getState().setAIContext(ctx)
    useAppStore.getState().setCurrentView('home')
    useAppStore.getState().setAIContext(null)

    expect(useAppStore.getState().aiContext).toBeNull()
  })

  it('updates AI panel width transiently during drag and persists on commit', () => {
    useAppStore.getState().setAIPanelWidth(610, { persist: false })

    expect(useAppStore.getState().aiPanelWidth).toBe(610)
    expect(storageSetItem).not.toHaveBeenCalled()

    useAppStore.getState().setAIPanelWidth(9999)

    expect(useAppStore.getState().aiPanelWidth).toBe(AI_PANEL_MAX_WIDTH)
    expect(storageSetItem).toHaveBeenCalledWith(
      'codehelper.aiPanelWidth',
      String(AI_PANEL_MAX_WIDTH),
    )
  })

  it('keeps AI assistant context controls available below xl layouts', async () => {
    const source = await readFile(join(process.cwd(), 'src/views/AITutorView.tsx'), 'utf8')

    expect(source).toContain('data-ai-mobile-context')
    expect(source).toContain('aria-pressed={active}')
    expect(source).toContain('label="上下文"')
    expect(source).toContain('label="代码"')
    expect(source).toContain('label="记忆"')
  })

  it('passes all default export categories to the export IPC handler', async () => {
    mockInvoke.mockResolvedValueOnce({ success: true, filePath: 'backup.json' })

    await settingsService.exportData()

    expect(mockInvoke).toHaveBeenCalledWith(
      'export-data',
      settingsService.DEFAULT_EXPORT_CATEGORIES,
    )
  })

  it('throws when export IPC reports a handled failure', async () => {
    mockInvoke.mockResolvedValueOnce({ success: false, error: '请选择一个数据类别' })

    await expect(settingsService.exportData()).rejects.toThrow('请选择一个数据类别')
  })

  it('sends includeMemories through to the AI IPC payload', async () => {
    mockInvoke.mockResolvedValueOnce(undefined)

    await aiService.sendMessage('session-1', 'hello', undefined, 'req-test', false)

    expect(mockInvoke).toHaveBeenCalledWith(
      'ai-chat',
      expect.objectContaining({
        requestId: 'req-test',
        includeMemories: false,
      }),
    )
  })

  it('filters streaming events by requestId', () => {
    const chunks: string[] = []
    let done = ''
    const offChunk = aiService.onChunk((chunk) => chunks.push(chunk), 'req-current')
    const offDone = aiService.onDone((content) => {
      done = content
    }, 'req-current')

    emit('ai-chat-chunk', { requestId: 'req-other', chunk: 'bad' })
    emit('ai-chat-chunk', { requestId: 'req-current', chunk: 'good' })
    emit('ai-chat-done', { requestId: 'req-other', content: 'bad done' })
    emit('ai-chat-done', { requestId: 'req-current', content: 'good done' })
    offChunk()
    offDone()

    expect(chunks).toEqual(['good'])
    expect(done).toBe('good done')
  })

  it('wraps the application root with ErrorBoundary and keeps dev browser mock out of the static entry import graph', async () => {
    const source = await readFile(join(process.cwd(), 'src/main.tsx'), 'utf8')

    expect(source).toContain("import { ErrorBoundary } from './components/ErrorBoundary'")
    expect(source).toContain('<ErrorBoundary>')
    expect(source).toContain("await import('./devBrowserApiMock')")
    expect(source).toContain('await installBrowserPreviewMockIfNeeded()')
    expect(source).toContain('void bootstrap()')
    expect(source).not.toContain("import { installDevBrowserApiMock } from './devBrowserApiMock'")
    expect(source).not.toContain('root.innerHTML =')
    expect(source).not.toContain('document.body.innerHTML =')
  })

  it('runs the hardened Windows package verifier from build and release paths', async () => {
    const packageJson = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    const releaseWorkflow = await readFile(
      join(process.cwd(), '.github/workflows/release.yml'),
      'utf8',
    )

    expect(packageJson.scripts['build:win']).toContain('npm run verify:package:win')
    expect(packageJson.scripts['package:win:dir']).toContain('electron-builder --win --dir')
    expect(packageJson.scripts['package:win:dir']).toContain('npm run verify:package')
    for (const releaseScript of ['release:patch', 'release:minor', 'release:major']) {
      expect(packageJson.scripts[releaseScript]).toContain('npm run build:win')
    }
    expect(releaseWorkflow).toContain(
      'Verify unsigned Authenticode, resources, install, restart, and hashes',
    )
    expect(releaseWorkflow).toContain('npm run verify:package:win')
    expect(releaseWorkflow).toContain("CODEHELPER_WINDOWS_RELEASE_MODE: 'unsigned'")
    expect(releaseWorkflow).toContain("CODEHELPER_REQUIRE_SIGNATURE: '0'")
    expect(releaseWorkflow).toContain("CSC_IDENTITY_AUTO_DISCOVERY: 'false'")
    expect(releaseWorkflow).toContain('signature.get("status") == "NotSigned"')
    expect(releaseWorkflow).toContain('manifest.get("signatureRequired") is False')
    expect(releaseWorkflow).toContain('and manifest["expectedSignerThumbprint"] is None')
    expect(releaseWorkflow).toContain('field in signature and signature[field] is None')
    expect(releaseWorkflow).toContain('installed smoke Authenticode evidence is incomplete')
    expect(releaseWorkflow).toContain('published installed uninstaller')
    expect(releaseWorkflow).toContain('> [!WARNING]')
    expect(releaseWorkflow).toContain('**Unsigned Windows release:**')
    expect(releaseWorkflow).toContain('Unknown Publisher')
    expect(releaseWorkflow).toContain('Microsoft Defender SmartScreen')
    expect(releaseWorkflow).toContain('verify `SHA256SUMS.txt`')
    expect(releaseWorkflow).toContain("body: fs.readFileSync('release_notes.md', 'utf8')")
    expect(releaseWorkflow).not.toContain('${{ secrets.CSC_LINK }}')
    expect(releaseWorkflow).not.toContain('${{ secrets.CSC_KEY_PASSWORD }}')
    expect(releaseWorkflow).not.toContain('${{ secrets.CODEHELPER_SIGNER_THUMBPRINT }}')
  })

  it('keeps package.json and package-lock.json versions aligned during release bumps', async () => {
    const source = await readFile(join(process.cwd(), 'scripts/version-bump.js'), 'utf8')

    expect(source).toContain("const lockPath = path.resolve(__dirname, '..', 'package-lock.json')")
    expect(source).toContain('lock.version = newVersion')
    expect(source).toContain("lock.packages[''].version = newVersion")
  })

  it('fails release preparation on package metadata drift or full-tree audit findings', async () => {
    const source = await readFile(join(process.cwd(), '.github/workflows/release.yml'), 'utf8')
    const productionAudit = 'npm audit --omit=dev --audit-level=high'
    const fullAudit = 'npm audit --audit-level=high'

    expect(source).toContain('LOCK_VERSION=$(node -p "require(\'./package-lock.json\').version")')
    expect(source).toContain(
      "LOCK_ROOT_VERSION=$(node -p \"require('./package-lock.json').packages?.['']?.version ?? ''\")",
    )
    expect(source).toContain(
      'package-lock.json version ($LOCK_VERSION) does not match package.json',
    )
    expect(source).toContain(
      'package-lock.json root package version ($LOCK_ROOT_VERSION) does not match package.json',
    )
    expect(source.indexOf(productionAudit)).toBeGreaterThan(-1)
    expect(
      source.indexOf(fullAudit, source.indexOf(productionAudit) + productionAudit.length),
    ).toBeGreaterThan(source.indexOf(productionAudit))
  })

  it('requires an explicit switch before the knowledge maintenance wrapper can apply', async () => {
    const source = await readFile(
      join(process.cwd(), 'scripts/run-knowledge-maintenance.ps1'),
      'utf8',
    )

    expect(source).toContain("[ValidateSet('plan', 'backup', 'apply', 'verify')]")
    expect(source).toContain('[switch]$ConfirmApply')
    expect(source).toContain("throw 'Apply requires the explicit -ConfirmApply switch'")
    expect(source).toContain("'--backup-manifest', ([string]$backup.manifest_path), '--yes'")
    expect(source).toContain('function Invoke-MaintenanceCommand')
    expect(source).toContain("$ErrorActionPreference = 'Continue'")
    expect(source).toContain('$ErrorActionPreference = $previousErrorActionPreference')
    expect(source).toContain(
      'throw "Knowledge maintenance command failed with exit code $exitCode`n$text"',
    )
  })

  it('uses a non-5173 renderer dev port by default while keeping env overrides', async () => {
    const source = await readFile(join(process.cwd(), 'electron.vite.config.ts'), 'utf8')

    expect(source).toContain('const DEFAULT_RENDERER_PORT = 5191')
    expect(source).toContain('process.env.CODEHELPER_RENDERER_PORT')
    expect(source).toContain('process.env.PORT')
    expect(source).toContain('strictPort: true')
  })

  it('deduplicates AI chat sessions before they are rendered with session id keys', () => {
    const sessions = normalizeChatSessions([
      { id: 'session-a', title: 'First', created_at: '1', updated_at: '1' },
      { id: 'session-a', title: 'Duplicate', created_at: '2', updated_at: '2' },
      { id: 'session-b', title: 'Second', created_at: '3', updated_at: '3' },
    ])

    expect(sessions).toEqual([
      { id: 'session-a', title: 'First', created_at: '1', updated_at: '1' },
      { id: 'session-b', title: 'Second', created_at: '3', updated_at: '3' },
    ])
  })

  it('keeps the independent AI assistant entry separate from the highlighted quick AI panel launcher', async () => {
    const source = await readFile(join(process.cwd(), 'src/components/layout/Sidebar.tsx'), 'utf8')

    expect(source).toContain("id: 'ai-tutor'")
    expect(source).toContain('onClick={() => setCurrentView(item.id)}')
    expect(source).toContain('data-ai-panel-sidebar-entry')
    expect(source).toContain('onClick={toggleAITutor}')
    expect(source).toContain('当前页 AI')
    expect(source).toContain("'codehelper:learning-records-cleared'")
    expect(source).toContain("'codehelper:profile-changed'")
    expect(source).toContain("if (currentView === 'profile') refreshOverview()")
    expect(source.indexOf('title="设置"')).toBeLessThan(
      source.indexOf('data-ai-panel-sidebar-entry'),
    )
  })

  it('keeps the quick AI panel as an in-layout right-docked resizable sidebar', async () => {
    const source = await readFile(
      join(process.cwd(), 'src/components/layout/AITutorPanel.tsx'),
      'utf8',
    )

    expect(source).toContain('flex h-full flex-shrink-0')
    expect(source).not.toContain('fixed right-0 top-0 bottom-0')
    expect(source).toContain('border-l border-[var(--color-border-subtle)]')
    expect(source).toContain('aria-label="调整 AI 面板宽度"')
    expect(source).toContain('cursor-col-resize')
    expect(source).toContain('setAIPanelWidth(next, { persist: false })')
    expect(source).toContain('setAIPanelWidth(dragPanelWidthRef.current)')
  })

  it('exposes Agent workflow trace markers in the independent assistant page', async () => {
    const source = await readFile(join(process.cwd(), 'src/views/AITutorView.tsx'), 'utf8')

    expect(source).toContain('data-agent-workflow-steps')
    expect(source).toContain('data-agent-step-status={step.status}')
    expect(source).toContain('data-agent-workflow-run={latestAgentRun.status}')
    expect(source).toContain('data-agent-tool-registry')
    expect(source).toContain('data-agent-tool-mode={tool.availability}')
    expect(source).toContain('data-agent-workflow-history-count={agentRuns.length}')
    expect(source).toContain('data-agent-refresh-runs')
    expect(source).toContain('data-agent-cancel-run')
    expect(source).toContain('data-agent-approval-panel')
    expect(source).toContain('data-agent-approval-state={latestAgentRun.status}')
    expect(source).toContain('data-agent-approval={approval.toolId}')
    expect(source).toContain('data-agent-approve-tool={approval.toolId}')
    expect(source).toContain('data-agent-reject-tool={approval.toolId}')
    expect(source).toContain('data-agent-tool-call-status={call.status}')
    expect(source).toContain('data-agent-audit-count={agentAudit.length}')
    expect(source).toContain('getAgentTools()')
    expect(source).toContain('getAgentRuns()')
    expect(source).toContain('createAgentRun({')
    expect(source).toContain('approveAgentTool({ runId, toolCallId')
    expect(source).toContain('rejectAgentTool({')
    expect(source).toContain('cancelAgentRun({ runId: activeAgentRun.id')
    expect(source).toContain('markAgentModelStarted({ runId: run.id })')
    expect(source).toContain('completeAgentRun({ runId: run.id })')
    expect(source).toContain('captureMemory: false')
    expect(source).not.toContain('window.localStorage.setItem(AGENT_WORKFLOW_STORAGE_KEY')
  })

  it('keeps the AI desktop pet as a Codex Pet compatible companion with themed settings controls', async () => {
    const appSource = await readFile(join(process.cwd(), 'src/App.tsx'), 'utf8')
    const petSource = await readFile(join(process.cwd(), 'src/components/AIPet.tsx'), 'utf8')
    const spriteSource = await readFile(
      join(process.cwd(), 'src/components/CodexPetSprite.tsx'),
      'utf8',
    )
    const settingsSource = await readFile(join(process.cwd(), 'src/views/SettingsView.tsx'), 'utf8')
    const appearanceSource = await readFile(join(process.cwd(), 'src/lib/appearance.ts'), 'utf8')
    const petLibSource = await readFile(join(process.cwd(), 'src/lib/pets.ts'), 'utf8')
    const stylesSource = await readFile(join(process.cwd(), 'src/index.css'), 'utf8')
    const preloadSource = await readFile(join(process.cwd(), 'electron/preload.ts'), 'utf8')
    const mainSource = await readFile(join(process.cwd(), 'electron/main.ts'), 'utf8')
    const petIpcSource = await readFile(join(process.cwd(), 'electron/ipc/pets.ts'), 'utf8')
    const fireflyManifest = JSON.parse(
      await readFile(join(process.cwd(), 'src/assets/pets/firefly/pet.json'), 'utf8'),
    ) as {
      id?: string
      pet_id?: string
      displayName?: string
      display_name?: string
      atlas?: { cell_width?: number; cell_height?: number; width?: number; height?: number }
    }

    expect(appSource).toContain("import { AIPet } from './components/AIPet'")
    expect(appSource).toContain('<AIPet />')
    expect(appSource).toContain('app-ambient-layer')
    expect(appSource).not.toContain('app-wallpaper-layer')
    expect(petSource).toContain('CodexPetSprite')
    expect(petSource).toContain('BUILT_IN_FIREFLY_PET')
    expect(petSource).toContain('data-codex-pet-root')
    expect(petSource).toContain('requestAnimationFrame')
    expect(petSource).toContain('codehelper.aiPetPosition')
    expect(petSource).toContain('PET_DESKTOP_SAFE_LEFT = 260')
    expect(petSource).toContain('PET_PROFILE_DOCK_MARGIN')
    expect(petSource).toContain('PET_PROFILE_WIDTH = 96')
    expect(petSource).toContain('clampPosition(next, currentView, aiPetSize)')
    expect(petSource).toContain('data-current-view={currentView}')
    expect(petSource).toContain('PET_MOBILE_BREAKPOINT = 720')
    expect(petSource).toContain('getPetMinX()')
    expect(petSource).toContain('lastX: event.clientX')
    expect(petSource).toContain('movementX > 0 ?')
    expect(spriteSource).toContain('data-codex-pet-sprite')
    expect(spriteSource).toContain('--pet-columns')
    expect(spriteSource).toContain('backgroundPositionX')
    expect(spriteSource).toContain('MutationObserver')
    expect(spriteSource).toContain('setInterval')
    expect(spriteSource).toContain('animateIdle = false')
    expect(spriteSource).toContain('playOnce')
    expect(petSource).toContain("animateIdle={animationLevel !== 'calm'}")
    expect(petSource).toContain('playReaction')
    expect(petSource).toContain('onPointerDown={() => playReaction')
    expect(petSource).toContain('state={petState}')
    expect(petLibSource).toContain("export const DEFAULT_PET_ID = 'firefly'")
    expect(petLibSource).toContain(
      "import fireflySpritesheet from '@/assets/pets/firefly/spritesheet.webp'",
    )
    expect(petLibSource).toContain('export const FIREFLY_MANIFEST')
    expect(petLibSource).toContain('withFallbackAnimationMeta')
    expect(petLibSource).toContain('DEFAULT_PET_ROWS')
    expect(petLibSource).toContain('cell_width: 192')
    expect(petLibSource).toContain('height: 1872')
    expect(settingsSource).toContain('默认使用流萤')
    expect(settingsSource).toContain('pet.json + spritesheet.webp')
    expect(settingsSource).toContain('深空专注')
    expect(settingsSource).not.toContain('Codex 深空')
    expect(settingsSource).not.toContain('主题图片')
    expect(settingsSource).not.toContain('data-theme-wallpaper-option')
    expect(settingsSource).toContain('data-pet-option')
    expect(settingsSource).toContain('installPetBySlug')
    expect(settingsSource).toContain('importPetFromFile')
    expect(settingsSource).toContain('selectPetDirectory')
    expect(settingsSource).toContain('视觉体验中心')
    expect(settingsSource).toContain('data-visual-theme-option')
    expect(settingsSource).toContain('data-background-style-option')
    expect(settingsSource).toContain('data-animation-level-option')
    expect(settingsSource).toContain('ai_pet_enabled')
    expect(appearanceSource).toContain("visualTheme: 'codex'")
    expect(appearanceSource).toContain("backgroundStyle: 'soft'")
    expect(appearanceSource).toContain("animationLevel: 'balanced'")
    expect(appearanceSource).toContain('aiPetEnabled: true')
    expect(appearanceSource).toContain(
      "APPEARANCE_ALIGNMENT_KEY = 'appearance_light_theme_alignment_v1'",
    )
    expect(appearanceSource).toContain('isLegacyLightThemeState')
    expect(appearanceSource).toContain("setSetting('visual_theme', aligned.visualTheme)")
    expect(preloadSource).toContain("'pets-list'")
    expect(preloadSource).toContain("'pets-install-slug'")
    expect(mainSource).toContain('registerPetsIPC')
    expect(petIpcSource).toContain('fetchPublicAssetLinks')
    expect(petIpcSource).toContain('pets-import-file')
    expect(fireflyManifest.id || fireflyManifest.pet_id).toBe('firefly')
    expect(fireflyManifest.displayName || fireflyManifest.display_name).toBe('流萤')
    expect(fireflyManifest.atlas?.cell_width).toBe(192)
    expect(fireflyManifest.atlas?.cell_height).toBe(208)
    expect(fireflyManifest.atlas?.width).toBe(1536)
    expect(fireflyManifest.atlas?.height).toBe(1872)
    expect(stylesSource).toContain('.ai-pet')
    expect(stylesSource).toContain('@keyframes codex-pet-frame')
    expect(stylesSource).toContain('--pet-frame-steps')
    expect(stylesSource).toContain(".ai-pet[data-current-view='profile']")
    expect(stylesSource).toContain(".ai-pet[data-animation-level='balanced'] .ai-pet-avatar-wrap")
    expect(stylesSource).toContain('.ai-pet.is-dragging .ai-pet-avatar-wrap')
    expect(stylesSource).not.toContain(".ai-pet[data-animation-level='balanced'] .ai-pet-image")
    expect(stylesSource).not.toContain(
      'codex-pet-frame var(--pet-animation-duration) steps(var(--pet-frames))',
    )
    expect(stylesSource).toContain('.settings-pet-sprite')
    expect(stylesSource).toContain("[data-background-style='aurora']")
  })

  it('supports customizable account profile and one-click learning record clearing', async () => {
    const settingsSource = await readFile(join(process.cwd(), 'src/views/SettingsView.tsx'), 'utf8')
    const profileSource = await readFile(join(process.cwd(), 'src/views/ProfileView.tsx'), 'utf8')
    const settingsServiceSource = await readFile(
      join(process.cwd(), 'src/services/settingsService.ts'),
      'utf8',
    )
    const preloadSource = await readFile(join(process.cwd(), 'electron/preload.ts'), 'utf8')
    const mainSource = await readFile(join(process.cwd(), 'electron/main.ts'), 'utf8')
    const learningIpcSource = await readFile(
      join(process.cwd(), 'electron/ipc/learningRecords.ts'),
      'utf8',
    )

    expect(settingsSource).toContain("{ id: 'account', label: '账户'")
    expect(settingsSource).toContain('PROFILE_NAME_KEY')
    expect(settingsSource).toContain('PROFILE_AVATAR_KEY')
    expect(settingsSource).not.toContain('PROFILE_AVATAR_PRESETS')
    expect(settingsSource).toContain('选择图片')
    expect(settingsSource).toContain('清除头像')
    expect(settingsSource).toContain('data-profile-avatar-preview')
    expect(settingsSource).toContain('data-profile-save-button')
    expect(settingsSource).toContain('data-clear-learning-records-button')
    expect(settingsSource).toContain('一键清空学习记录')
    expect(settingsSource).toContain('不会删除题库、知识库、AI 配置、账户资料和课堂笔记')
    expect(settingsSource).toContain('clearIpcCache()')
    expect(profileSource).toContain('getUserProfile')
    expect(profileSource).toContain('codehelper.pendingSettingsTab')
    expect(profileSource).toContain('data-open-account-settings')
    expect(profileSource).toContain('profile-hero')
    expect(settingsServiceSource).toContain("export const PROFILE_NAME_KEY = 'user_name'")
    expect(settingsServiceSource).toContain("export const PROFILE_AVATAR_KEY = 'user_avatar'")
    expect(settingsServiceSource).toContain(
      "invoke<LearningRecordsClearResult>('learning-records-clear')",
    )
    expect(preloadSource).toContain("'learning-records-clear'")
    expect(mainSource).toContain('registerLearningRecordsIPC')
    expect(learningIpcSource).toContain('UPDATE lesson_progress')
    expect(learningIpcSource).toContain('UPDATE achievement_progress')
    expect(learningIpcSource).toContain("'submissions'")
    expect(learningIpcSource).toContain("'mistakes'")
    expect(learningIpcSource).toContain('DELETE FROM ${table}')
    expect(learningIpcSource).not.toContain('DELETE FROM problems')
    expect(learningIpcSource).not.toContain('DELETE FROM knowledge_docs')
  })

  it('ships the polished learning workbench visuals and expanded AI Tutor curriculum content', async () => {
    const homeSource = await readFile(join(process.cwd(), 'src/views/HomeView.tsx'), 'utf8')
    const profileSource = await readFile(join(process.cwd(), 'src/views/ProfileView.tsx'), 'utf8')
    const stylesSource = await readFile(join(process.cwd(), 'src/index.css'), 'utf8')
    const generatedHero = await readFile(
      join(process.cwd(), 'src/assets/hero/codehelper-ai-workbench-generated.png'),
    )
    const browserMockSource = await readFile(
      join(process.cwd(), 'src/devBrowserApiMock.ts'),
      'utf8',
    )
    const stylesTypesSource = await readFile(join(process.cwd(), 'src/styles.d.ts'), 'utf8')
    const learnServiceSource = await readFile(
      join(process.cwd(), 'src/services/learnService.ts'),
      'utf8',
    )
    const learnViewSource = await readFile(join(process.cwd(), 'src/views/LearnView.tsx'), 'utf8')
    const practiceViewSource = await readFile(
      join(process.cwd(), 'src/views/PracticeView.tsx'),
      'utf8',
    )
    const courseMap = JSON.parse(
      await readFile(join(process.cwd(), 'content/metadata/course_map.json'), 'utf8'),
    ) as {
      tracks: Array<{
        id: string
        modules: Array<{ lessons: Array<{ id: string; path: string }> }>
      }>
    }
    const exercises = JSON.parse(
      await readFile(join(process.cwd(), 'content/metadata/exercises.json'), 'utf8'),
    ) as {
      exercises: Array<{ id: string; track_id: string; lesson_id: string }>
    }
    const curatedProblems = JSON.parse(
      await readFile(join(process.cwd(), 'resources/problems/codehelper-ai-tutor.json'), 'utf8'),
    ) as Array<{ title: string; tracks?: string[] }>

    expect(homeSource).toContain('home-hero-card')
    expect(homeSource).toContain("import appIcon from '@/assets/app-icon.png'")
    expect(homeSource).toContain("import aiPetFemale from '@/assets/mascot/ai-pet-female.png'")
    expect(homeSource).not.toContain(
      "import heroWorkbench from '@/assets/hero/codehelper-ai-workbench-generated.png'",
    )
    expect(homeSource).not.toContain('home-hero-generated')
    expect(homeSource).toContain('home-hero-layout relative z-10')
    expect(homeSource).toContain('home-action-grid')
    expect(generatedHero.length).toBeGreaterThan(1_000_000)
    expect(stylesSource).toContain('.home-hero-visual')
    expect(stylesSource).toContain('box-shadow: none;')
    expect(stylesSource).toContain('inset: 0;')
    expect(stylesSource).toContain('.home-hero-layout')
    expect(stylesSource).toContain('container-type: inline-size;')
    expect(stylesSource).toContain('grid-template-columns: minmax(0, 1fr);')
    expect(stylesSource).toContain('@container (min-width: 900px)')
    expect(homeSource).toContain('home-hero-card lg:col-span-2 xl:col-span-4')
    expect(homeSource).toContain('surface-card xl:col-span-2')
    expect(stylesSource).toContain('animation: hero-float-contained')
    expect(stylesSource).toContain('min-height: 380px;')
    expect(stylesSource).toContain('.home-hero-workbench-lines')
    expect(stylesSource).toContain('overflow: auto;')
    expect(stylesSource).toContain('.home-hero-workbench-shell')
    expect(stylesSource).toContain('flex: 1;')
    expect(stylesSource).not.toContain('.home-hero-generated')
    expect(stylesSource).toContain(":root[data-theme='light'] .home-hero-card .text-white")
    expect(stylesSource).toContain(":root[data-theme='light'] .settings-view")
    expect(stylesSource).toContain(":root[data-theme='light'][data-contrast='high']")
    expect(stylesSource).toContain(":root[data-theme='light'] .text-white\\/70")
    expect(stylesSource).toContain(":root[data-theme='light'] .opacity-70")
    expect(stylesSource).toContain(":root[data-theme='light'] .profile-hero")
    expect(stylesSource).toContain('linear-gradient(135deg, #ffffff 0%, #f7f9ff 54%, #eef4ff 100%)')
    expect(profileSource).not.toContain('from-[#1E243A]')
    expect(profileSource).toContain('profile-hero-avatar')
    expect(profileSource).toContain('profile-hero-status')
    expect(stylesSource).toContain(":root[data-theme='light'] .home-hero-card {")
    expect(stylesSource).toContain('--color-bg-base: #f6f8fc;')
    expect(stylesSource).toContain('--color-bg-panel: #ffffff;')
    expect(stylesSource).toContain('--color-text-primary: #172033;')
    expect(stylesSource).toContain('linear-gradient(135deg, #ffffff 0%, #f8fbff 48%, #eef4ff 100%)')
    expect(stylesSource).toContain(":root[data-theme='light'] .home-action-step")
    expect(stylesSource).toContain(":root[data-theme='light'] .home-hero-workbench-shell")
    expect(stylesSource).toContain(":root[data-theme='light'] .home-hero-workbench-panel")
    expect(stylesSource).toContain(":root[data-theme='light'] .home-hero-workbench-tab")
    expect(stylesSource).toContain(":root[data-theme='light'] .home-hero-workbench-line")
    expect(stylesSource).toContain(":root[data-theme='light'] .home-hero-workbench-action")
    expect(stylesSource).toContain('.home-hero-icon-badge')
    expect(stylesSource).toContain('@keyframes hero-pet-float')
    expect(stylesSource).toContain(':root[data-reduce-motion')
    expect(browserMockSource).toContain(
      "import courseMapData from '../content/metadata/course_map.json'",
    )
    expect(browserMockSource).toContain(
      "import exercisesData from '../content/metadata/exercises.json'",
    )
    expect(browserMockSource).toContain(
      "import promptingBasicsMarkdown from '../content/ai_tutor/prompting_basics.md?raw'",
    )
    expect(browserMockSource).toContain(
      "import agentTaskBriefMarkdown from '../content/ai_tutor/agent_task_brief.md?raw'",
    )
    expect(browserMockSource).toContain(
      "import workflowRetrospectiveMarkdown from '../content/ai_tutor/workflow_retrospective.md?raw'",
    )
    expect(browserMockSource).toContain("case 'lessons-list'")
    expect(browserMockSource).toContain("case 'exercises-list'")
    expect(browserMockSource).toContain('lessonMarkdownByPath')
    expect(stylesTypesSource).toContain("declare module '*.md?raw'")
    expect(learnServiceSource).toContain('lesson.markdown ?? lesson.content ??')
    expect(learnViewSource).toContain('handleSelectTrack')
    expect(learnViewSource).toContain('data-course-track-option={track.id}')
    expect(learnViewSource).toContain('grid grid-cols-2 gap-1.5')
    expect(practiceViewSource).toContain('data-ai-tutor-practice-filter')
    expect(practiceViewSource).toContain('aiTutorExerciseCount')
    expect(practiceViewSource).toContain(
      "setTrackFilter(trackFilter === 'ai-tutor' ? undefined : 'ai-tutor')",
    )

    const aiTrack = courseMap.tracks.find((track) => track.id === 'ai-tutor')
    expect(aiTrack).toBeTruthy()
    const lessonIds =
      aiTrack?.modules.flatMap((mod) => mod.lessons.map((lesson) => lesson.id)) ?? []
    expect(lessonIds).toEqual(
      expect.arrayContaining([
        'ai-tutor-prompting-basics',
        'ai-tutor-debug-dialogue',
        'ai-tutor-study-plan',
        'ai-tutor-socratic-review',
        'ai-agent-task-brief',
        'ai-tool-safety-checklist',
        'ai-workflow-retrospective',
        'ai-learning-log-automation',
      ]),
    )
    await Promise.all(
      aiTrack!.modules
        .flatMap((mod) => mod.lessons)
        .map((lesson) => readFile(join(process.cwd(), 'content', lesson.path), 'utf8')),
    )
    expect(exercises.exercises.filter((exercise) => exercise.track_id === 'ai-tutor')).toHaveLength(
      16,
    )
    expect(exercises.exercises.map((exercise) => exercise.lesson_id)).toEqual(
      expect.arrayContaining(lessonIds),
    )
    expect(curatedProblems).toHaveLength(5)
    expect(curatedProblems.every((problem) => problem.tracks?.includes('ai-tutor'))).toBe(true)
  })

  it('keeps responsive motion, accent, pet, and settings persistence contracts aligned', async () => {
    const [appSource, petSource, sidebarSource, settingsSource, appearanceSource, stylesSource] =
      await Promise.all([
        readFile(join(process.cwd(), 'src/App.tsx'), 'utf8'),
        readFile(join(process.cwd(), 'src/components/AIPet.tsx'), 'utf8'),
        readFile(join(process.cwd(), 'src/components/layout/Sidebar.tsx'), 'utf8'),
        readFile(join(process.cwd(), 'src/views/SettingsView.tsx'), 'utf8'),
        readFile(join(process.cwd(), 'src/lib/appearance.ts'), 'utf8'),
        readFile(join(process.cwd(), 'src/index.css'), 'utf8'),
      ])

    expect(appSource).toContain("<MotionConfig reducedMotion={reducedMotion ? 'always' : 'user'}>")
    expect(appSource).toContain("attributeFilter: ['data-reduce-motion']")
    expect(petSource).toContain('const PET_MOBILE_WIDTH = 64')
    expect(petSource).toContain('if (width <= PET_MOBILE_BREAKPOINT)')
    expect(sidebarSource).toContain("window.matchMedia('(max-width: 720px)')")
    expect(sidebarSource).toContain('const compact = collapsed || viewportCompact')
    expect(appearanceSource).toContain("DEFAULT_ACCENT_COLOR = '#2FB7A5'")
    expect(settingsSource).toContain('persistAppearance(key, value)')
    expect(settingsSource).toContain('flushAppearanceWrites()')
    expect(stylesSource).toContain(
      '--color-accent-solid: color-mix(in srgb, var(--color-accent-primary) 45%, #000);',
    )
    expect(stylesSource).toContain(".ai-pet:not([data-current-view='profile'])")
  })

  it('separates model switching, provider model imports, and global search semantics', async () => {
    const headerSource = await readFile(
      join(process.cwd(), 'src/components/layout/Header.tsx'),
      'utf8',
    )
    const aiModelSettingsSource = await readFile(
      join(process.cwd(), 'src/views/settings/AIModelSettings.tsx'),
      'utf8',
    )

    expect(headerSource).toContain('settingsService.getAIConfigs')
    expect(headerSource).toContain('currentModelConfig?.model')
    expect(headerSource).toContain('chooseModel')
    expect(headerSource).toContain('settingsService.saveAIConfig')
    expect(headerSource).toContain("'当前' : '切换'")
    expect(headerSource).toContain('<Cpu size={14} />')
    expect(headerSource).not.toContain('<Check size={14} />')
    expect(headerSource).toContain('w-[170px]')
    expect(headerSource).toContain('max-w-[460px]')
    expect(headerSource).toContain('className="relative hidden min-[721px]:block"')
    expect(headerSource).toContain('placeholder="快速跳转..."')
    expect(headerSource).toContain('搜索页面、课程、练习或知识库')
    expect(headerSource).toContain('buildCommandResults')
    expect(headerSource).toContain('pt-20')
    expect(headerSource).toContain('aria-label="打开工作区终端"')
    expect(headerSource).not.toContain('<span>终端</span>')
    expect(headerSource).toContain("setCurrentView('workspace')")
    expect(headerSource).not.toContain('打开命令终端...')

    expect(aiModelSettingsSource).toContain('selectedModels')
    expect(aiModelSettingsSource).toContain('modelFilter')
    expect(aiModelSettingsSource).toContain('selectedNewModels')
    expect(aiModelSettingsSource).toContain('existingModelsForProvider')
    expect(aiModelSettingsSource).toContain('选择当前列表')
    expect(aiModelSettingsSource).toContain('可新增 {selectedNewModels.length} 个')
    expect(aiModelSettingsSource).toContain('已添加 ${selectedNewModels.length} 个模型')
  })
})
