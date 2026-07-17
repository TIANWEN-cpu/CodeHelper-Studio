import { expect, test as base, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Locator, Page, TestInfo } from '@playwright/test'
import { execFile } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'

type ElectronFixtures = {
  electronApp: ElectronApplication
  page: Page
  userDataDir: string
}

type PersistedEditorTab = {
  workspaceId: string
  id: string
  filename: string
  language: string
  content: string
  kind: 'file' | 'problem' | 'exercise'
  problemId: string | null
  cursorPosition: { lineNumber: number; column: number } | null
  scrollTop: number
  position: number
  status: 'open' | 'closed' | 'deleted'
  revision: number
}

type RendererEditorTab = Pick<
  PersistedEditorTab,
  'id' | 'filename' | 'language' | 'content' | 'kind' | 'cursorPosition' | 'scrollTop'
> & {
  syncConflict?: boolean
  recoverySourceKeys?: string[]
}

type PersistedEditorWorkspace = {
  activeTabId: string | null
  generation: number
  legacyStorageVersion: number
  tabs: PersistedEditorTab[]
  recentlyClosedTabs: PersistedEditorTab[]
}

type ApplicationHarness = {
  application: ElectronApplication
  electronProcess: ChildProcess
  userDataDir: string
  label: string
  diagnosticsCaptured: boolean
}

type EditorViewState = {
  lineNumber: number
  column: number
  scrollTop: number
}

type WorkspaceMatrix = {
  fileContent: string
  importedDraft: string
  exerciseDraft: string
  importedTabId: string
  exerciseTabId: string
}

const appRoot = resolve(__dirname, '../..')
const applicationHarnesses = new Map<ElectronApplication, ApplicationHarness>()
let applicationSequence = 0

async function waitForRendererReady(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded', { timeout: 30_000 })
  await expect(page.getByTestId('nav-home')).toBeVisible({ timeout: 30_000 })
}

function safeArtifactLabel(label: string): string {
  return label.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'application'
}

async function captureApplicationDiagnostics(application: ElectronApplication): Promise<void> {
  const harness = applicationHarnesses.get(application)
  if (!harness || harness.diagnosticsCaptured) return
  harness.diagnosticsCaptured = true

  const diagnosticsDir = join(harness.userDataDir, '.e2e-diagnostics')
  await mkdir(diagnosticsDir, { recursive: true })
  const pages = application.windows()
  const rendererStates: unknown[] = []
  for (const [index, page] of pages.entries()) {
    try {
      await page.screenshot({
        path: join(diagnosticsDir, `${harness.label}-window-${index + 1}.png`),
        fullPage: true,
      })
    } catch {
      // The renderer may already be gone after an intentional crash test.
    }
    try {
      rendererStates.push(
        await page.evaluate(async () => {
          const localStorageState = Object.fromEntries(
            Object.keys(localStorage)
              .sort()
              .map((key) => [key, localStorage.getItem(key)]),
          )
          let workspace: unknown = null
          try {
            workspace = await window.api.invoke('editor-workspace-load', {
              workspaceId: 'default',
            })
          } catch (error) {
            workspace = { error: error instanceof Error ? error.message : String(error) }
          }
          return {
            url: location.href,
            title: document.title,
            localStorage: localStorageState,
            workspace,
          }
        }),
      )
    } catch (error) {
      rendererStates.push({ error: error instanceof Error ? error.message : String(error) })
    }
  }
  await writeFile(
    join(diagnosticsDir, `${harness.label}-renderer-state.json`),
    JSON.stringify(rendererStates, null, 2),
    'utf8',
  )
  try {
    await application.context().tracing.stop({
      path: join(diagnosticsDir, `${harness.label}-trace.zip`),
    })
  } catch {
    // A hard process exit can close the browser context before tracing is stopped.
  }
}

async function closeApplication(application: ElectronApplication): Promise<void> {
  const harness = applicationHarnesses.get(application)
  await captureApplicationDiagnostics(application).catch(() => undefined)
  let electronProcess = harness?.electronProcess
  if (!electronProcess) {
    try {
      electronProcess = application.process()
    } catch {
      return
    }
  }
  const processExited =
    electronProcess.exitCode !== null
      ? Promise.resolve()
      : new Promise<void>((resolveExit) => electronProcess.once('exit', () => resolveExit()))
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      application.close(),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error('Electron close timed out')), 8_000)
      }),
    ])
  } catch {
    if (electronProcess.pid && process.platform === 'win32') {
      await new Promise<void>((resolveKill) => {
        execFile(
          'taskkill',
          ['/PID', String(electronProcess.pid), '/T', '/F'],
          { windowsHide: true },
          () => resolveKill(),
        )
      })
    } else {
      try {
        electronProcess.kill('SIGKILL')
      } catch {
        // The process may have exited between the timeout and the fallback kill.
      }
    }
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
  await processExited
  applicationHarnesses.delete(application)
}

async function preserveFailureArtifacts(userDataDir: string, testInfo: TestInfo): Promise<void> {
  const artifactDirectory = testInfo.outputPath('user-data')
  await mkdir(artifactDirectory, { recursive: true })
  const files = await readdir(userDataDir)
  const artifactNames = files.filter(
    (name) =>
      name === 'codehelper.db' ||
      name === 'codehelper.db-wal' ||
      name === 'codehelper.db-shm' ||
      name.startsWith('codehelper.db.corrupt.') ||
      name === '.e2e-diagnostics' ||
      name === 'Local Storage',
  )
  for (const name of artifactNames) {
    await cp(join(userDataDir, name), join(artifactDirectory, name), {
      recursive: true,
      force: true,
    })
  }
  await writeFile(
    testInfo.outputPath('diagnostic-manifest.json'),
    JSON.stringify(
      {
        test: testInfo.titlePath,
        status: testInfo.status,
        expectedStatus: testInfo.expectedStatus,
        userDataSource: userDataDir,
        preservedArtifacts: artifactNames,
        databaseFiles: artifactNames.filter(
          (name) =>
            name === 'codehelper.db' ||
            name === 'codehelper.db-wal' ||
            name === 'codehelper.db-shm' ||
            name.startsWith('codehelper.db.corrupt.'),
        ),
      },
      null,
      2,
    ),
    'utf8',
  )
}

async function launchApplication(
  userDataDir: string,
  label = `application-${++applicationSequence}`,
): Promise<ElectronApplication> {
  const application = await electron.launch({
    args: [appRoot],
    env: {
      ...process.env,
      CODEHELPER_E2E_USER_DATA: userDataDir,
      CODEHELPER_E2E_HEADLESS: '1',
    },
  })
  const harness: ApplicationHarness = {
    application,
    electronProcess: application.process(),
    userDataDir,
    label: safeArtifactLabel(label),
    diagnosticsCaptured: false,
  }
  applicationHarnesses.set(application, harness)
  try {
    await application.context().tracing.start({ screenshots: true, snapshots: true, sources: true })
  } catch (error) {
    applicationHarnesses.delete(application)
    await application.close().catch(() => undefined)
    throw error
  }
  return application
}

const test = base.extend<ElectronFixtures>({
  // Playwright requires fixture arguments to use object destructuring, even when none are needed.
  // eslint-disable-next-line no-empty-pattern
  userDataDir: async ({}, provide, testInfo) => {
    const directory = await mkdtemp(join(tmpdir(), 'codehelper-e2e-'))
    expect(isAbsolute(directory)).toBe(true)
    try {
      await provide(directory)
    } finally {
      const danglingApplications = [...applicationHarnesses.values()].filter(
        (harness) => harness.userDataDir === directory,
      )
      for (const harness of danglingApplications) {
        await closeApplication(harness.application)
      }
      if (testInfo.status !== testInfo.expectedStatus) {
        await preserveFailureArtifacts(directory, testInfo)
      }
      await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  },

  electronApp: async ({ userDataDir }, provide, testInfo) => {
    const application = await launchApplication(userDataDir, 'fixture-application')

    try {
      await provide(application)
    } finally {
      await closeApplication(application)
      if (testInfo.status !== testInfo.expectedStatus) {
        await preserveFailureArtifacts(userDataDir, testInfo)
      }
    }
  },

  page: async ({ electronApp, userDataDir }, provide) => {
    const page = await electronApp.firstWindow()
    const actualUserData = await electronApp.evaluate(({ app }) => app.getPath('userData'))
    expect(resolve(actualUserData)).toBe(resolve(userDataDir))
    await waitForRendererReady(page)
    await provide(page)
  },
})

async function firstReadyWindow(
  application: ElectronApplication,
  userDataDir: string,
): Promise<Page> {
  const page = await application.firstWindow()
  const actualUserData = await application.evaluate(({ app }) => app.getPath('userData'))
  expect(resolve(actualUserData)).toBe(resolve(userDataDir))
  await waitForRendererReady(page)
  return page
}

async function recoveredReadyWindow(
  application: ElectronApplication,
  userDataDir: string,
): Promise<Page> {
  let recoveredPage: Page | null = null
  await expect
    .poll(
      async () => {
        for (const candidate of [...application.windows()].reverse()) {
          if (candidate.isClosed()) continue
          try {
            await candidate.waitForLoadState('domcontentloaded', { timeout: 500 })
            if (await candidate.getByTestId('nav-home').isVisible()) {
              recoveredPage = candidate
              return true
            }
          } catch {
            // The crashed target can coexist briefly with its replacement window.
          }
        }
        return false
      },
      { timeout: 30_000, intervals: [10, 20, 50, 100, 250] },
    )
    .toBe(true)
  if (!recoveredPage) throw new Error('Renderer replacement window did not become ready')
  const actualUserData = await application.evaluate(({ app }) => app.getPath('userData'))
  expect(resolve(actualUserData)).toBe(resolve(userDataDir))
  return recoveredPage
}

async function forceExit(application: ElectronApplication): Promise<void> {
  const process = application.process()
  const exited = new Promise<void>((resolveExit) => process.once('exit', () => resolveExit()))
  await application.evaluate(({ app }) => {
    setImmediate(() => app.exit(9))
  })
  await exited
}

async function forceRendererCrash(application: ElectronApplication, page: Page): Promise<void> {
  const browserWindow = await application.browserWindow(page)
  try {
    const browserWindowId = await browserWindow.evaluate((window: { id: number }) => window.id)
    const rendererGone = await application.evaluate(
      ({ BrowserWindow }, windowId) =>
        new Promise<boolean>((resolveGone, rejectGone) => {
          const window = BrowserWindow.fromId(windowId)
          if (!window) {
            rejectGone(new Error(`BrowserWindow ${windowId} is unavailable`))
            return
          }
          window.webContents.once('render-process-gone', () => resolveGone(true))
          window.webContents.forcefullyCrashRenderer()
        }),
      browserWindowId,
    )
    expect(rendererGone).toBe(true)
  } finally {
    await browserWindow.dispose()
  }
  expect(application.process().exitCode).toBeNull()
}

async function disableIpcHandler(application: ElectronApplication, channel: string): Promise<void> {
  await application.evaluate(({ ipcMain }, targetChannel) => {
    ipcMain.removeHandler(targetChannel)
  }, channel)
}

function codeContent(page: Page): Locator {
  return page.getByTestId('code-editor').locator('.cm-content')
}

async function readEditor(page: Page): Promise<string> {
  return codeContent(page).evaluate((element) => {
    const content = element as HTMLElement & {
      cmTile?: {
        root?: {
          view?: { state?: { doc?: { toString(): string } } }
        }
      }
    }
    return (
      content.cmTile?.root?.view?.state?.doc?.toString() ?? content.innerText.replace(/\r\n/g, '\n')
    )
  })
}

async function replaceEditor(page: Page, value: string): Promise<void> {
  const content = codeContent(page)
  await expect(content).toBeVisible()
  await content.click()
  await content.press('Control+A')
  await page.keyboard.insertText(value)
  await expect
    .poll(() => readEditor(page), {
      timeout: 1_000,
      intervals: [10, 20, 50],
    })
    .toBe(value)
}

async function readEditorViewState(page: Page): Promise<EditorViewState> {
  return page.getByTestId('code-editor').evaluate((root) => {
    const content = root.querySelector<HTMLElement>('.cm-content') as
      | (HTMLElement & {
          cmTile?: {
            root?: {
              view?: {
                state: {
                  doc: { lineAt(position: number): { number: number; from: number } }
                  selection: { main: { head: number } }
                }
                scrollDOM: HTMLElement
              }
            }
          }
        })
      | null
    const view = content?.cmTile?.root?.view
    if (view) {
      const head = view.state.selection.main.head
      const line = view.state.doc.lineAt(head)
      return {
        lineNumber: line.number,
        column: head - line.from + 1,
        scrollTop: view.scrollDOM.scrollTop,
      }
    }
    const lines = [...root.querySelectorAll<HTMLElement>('.cm-line')]
    const activeLine = root.querySelector<HTMLElement>('.cm-activeLine')
    return {
      lineNumber: activeLine ? lines.indexOf(activeLine) + 1 : 0,
      column: 0,
      scrollTop: root.querySelector<HTMLElement>('.cm-scroller')?.scrollTop ?? -1,
    }
  })
}

async function setEditorViewState(page: Page, target: EditorViewState): Promise<EditorViewState> {
  return page.getByTestId('code-editor').evaluate((root, expected) => {
    const content = root.querySelector<HTMLElement>('.cm-content') as
      | (HTMLElement & {
          cmTile?: {
            root?: {
              view?: {
                state: {
                  doc: {
                    lines: number
                    line(lineNumber: number): { from: number; to: number }
                    lineAt(position: number): { number: number; from: number }
                  }
                  selection: { main: { head: number } }
                }
                dispatch(transaction: { selection: { anchor: number } }): void
                scrollDOM: HTMLElement
              }
            }
          }
        })
      | null
    const view = content?.cmTile?.root?.view
    if (!view) throw new Error('CodeMirror view is unavailable')
    if (expected.lineNumber < 1 || expected.lineNumber > view.state.doc.lines) {
      throw new Error(`Target line ${expected.lineNumber} is outside the editor document`)
    }

    const line = view.state.doc.line(expected.lineNumber)
    const anchor = Math.min(line.to, line.from + Math.max(0, expected.column - 1))
    view.dispatch({ selection: { anchor } })
    view.scrollDOM.scrollTop = expected.scrollTop
    view.scrollDOM.dispatchEvent(new Event('scroll'))

    const head = view.state.selection.main.head
    const selectedLine = view.state.doc.lineAt(head)
    return {
      lineNumber: selectedLine.number,
      column: head - selectedLine.from + 1,
      scrollTop: view.scrollDOM.scrollTop,
    }
  }, target)
}

async function readEditorRecoveryViewState(
  page: Page,
  tabId: string,
): Promise<EditorViewState | null> {
  return page.evaluate((expectedTabId) => {
    type RecoveryEntry = {
      cursorPosition?: { lineNumber?: unknown; column?: unknown } | null
      scrollTop?: unknown
    }
    type RecoverySnapshot = { entries?: Record<string, RecoveryEntry> }

    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith('codehelper-editor-workspace-view-recovery-v1.session.')) continue
      const serialized = localStorage.getItem(key)
      if (!serialized) continue
      try {
        const snapshot = JSON.parse(serialized) as RecoverySnapshot
        const entry = snapshot.entries?.[expectedTabId]
        const cursor = entry?.cursorPosition
        const scrollTop = entry?.scrollTop
        if (
          typeof cursor?.lineNumber === 'number' &&
          typeof cursor.column === 'number' &&
          typeof scrollTop === 'number'
        ) {
          return { lineNumber: cursor.lineNumber, column: cursor.column, scrollTop }
        }
      } catch {
        // Ignore unrelated corrupt recovery records; their own tests cover isolation behavior.
      }
    }
    return null
  }, tabId)
}

function stableEditorWorkspaceHash(value: string): string {
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x85ebca6b)
  }
  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`
}

function exerciseTabId(exerciseId: string): string {
  const normalized = exerciseId.trim()
  const readable = normalized.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  const label = readable.slice(0, 120) || 'unknown'
  return `exercise-${label}-${stableEditorWorkspaceHash(normalized)}`.slice(0, 200)
}

function longPythonDraft(prefix: string, lineCount = 120): string {
  return Array.from(
    { length: lineCount },
    (_, index) => `${prefix}_${index + 1} = ${index + 1}`,
  ).join('\n')
}

function querySqlJs(database: SqlJsDatabase, sql: string): Record<string, unknown>[] {
  const statement = database.prepare(sql)
  const rows: Record<string, unknown>[] = []
  try {
    while (statement.step()) rows.push(statement.getAsObject())
    return rows
  } finally {
    statement.free()
  }
}

async function writeCurrentWorkspaceDatabase(
  userDataDir: string,
  matrix: WorkspaceMatrix,
): Promise<void> {
  const SQL = await initSqlJs()
  const database = new SQL.Database()
  try {
    database.run(await readFile(join(appRoot, 'electron', 'db', 'schema.sql'), 'utf8'))
    database.run(
      `INSERT INTO problems (
         id, title, description, difficulty, tags, languages, examples, test_cases,
         starter_code, source, tracks, platform, mode
       ) VALUES (701, ?, ?, 'easy', '[]', '["python"]', '[]', '[]', ?, 'e2e', '["e2e"]', 'internal', 'oj')`,
      [
        'Matrix imported problem',
        'Imported problem used by the Phase 2 Electron restoration test.',
        JSON.stringify({ python: 'print("starter must not replace the draft")' }),
      ],
    )
    database.run(
      `INSERT INTO editor_workspaces (
         workspace_id, last_active_tab_id, generation, legacy_storage_version, updated_at
       ) VALUES ('default', ?, 17, 4, '2026-07-15T00:00:00.000Z')`,
      [matrix.exerciseTabId],
    )
    database.run(
      `INSERT INTO schema_migrations (component, version, updated_at)
       VALUES ('editor-workspace', 3, '2026-07-15T00:00:00.000Z')`,
    )

    const insertTab = database.prepare(`
      INSERT INTO editor_tabs (
        workspace_id, tab_id, filename, language, content, tab_kind, problem_id,
        cursor_line, cursor_column, scroll_top, tab_position, status, revision,
        created_at, updated_at, view_updated_at, closed_at, deleted_at
      ) VALUES (
        'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        '2026-07-15T00:00:00.000Z', '2026-07-15T00:00:00.000Z',
        '2026-07-15T00:00:00.000Z', ?, NULL
      )
    `)
    try {
      insertTab.run([
        'matrix-file',
        'matrix_file.py',
        'python',
        matrix.fileContent,
        'file',
        null,
        37,
        5,
        600,
        0,
        'open',
        5,
        null,
      ])
      insertTab.run([
        matrix.importedTabId,
        'matrix_imported_problem.py',
        'python',
        '',
        'problem',
        'problem:701',
        51,
        7,
        900,
        1,
        'open',
        6,
        null,
      ])
      insertTab.run([
        matrix.exerciseTabId,
        'add.py',
        'python',
        '',
        'exercise',
        'py-add',
        63,
        4,
        1150,
        2,
        'open',
        7,
        null,
      ])
      insertTab.run([
        'matrix-standalone-problem',
        'standalone_problem.js',
        'javascript',
        'const standaloneMarker = "closed-but-restorable";',
        'problem',
        'standalone:701',
        1,
        13,
        0,
        3,
        'closed',
        8,
        '2026-07-15T00:01:00.000Z',
      ])
    } finally {
      insertTab.free()
    }

    const insertDraft = database.prepare(`
      INSERT INTO exercise_drafts (
        exercise_id, title, code, language, revision, updated_at, deleted
      ) VALUES (?, ?, ?, 'python', ?, '2026-07-15T00:02:00.000Z', 0)
    `)
    try {
      insertDraft.run(['problem:701', 'Matrix imported problem', matrix.importedDraft, 11])
      insertDraft.run(['py-add', '实现 add 函数', matrix.exerciseDraft, 12])
    } finally {
      insertDraft.free()
    }
    await writeFile(join(userDataDir, 'codehelper.db'), Buffer.from(database.export()))
  } finally {
    database.close()
  }
}

async function writeLegacyWorkspaceDatabase(userDataDir: string): Promise<void> {
  const SQL = await initSqlJs()
  const database = new SQL.Database()
  try {
    database.run(`
      CREATE TABLE editor_tabs (
        tab_id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        language TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        problem_id TEXT,
        cursor_line INTEGER,
        cursor_column INTEGER,
        scroll_top REAL NOT NULL DEFAULT 0,
        tab_position INTEGER NOT NULL DEFAULT 0,
        revision INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT,
        deleted INTEGER NOT NULL DEFAULT 0,
        closed_at TEXT
      );
      CREATE TABLE editor_workspace_state (
        workspace_id TEXT PRIMARY KEY,
        active_tab_id TEXT,
        updated_at TEXT
      );
      CREATE TABLE schema_migrations (
        component TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE exercise_drafts (
        exercise_id TEXT PRIMARY KEY,
        title TEXT,
        code TEXT,
        updated_at TEXT
      );
      INSERT INTO editor_tabs (
        tab_id, filename, language, content, problem_id, cursor_line, cursor_column,
        scroll_top, tab_position, revision, updated_at, deleted, closed_at
      ) VALUES
        ('legacy-open', 'legacy_open.py', 'python', 'legacy_marker = "preserved"', NULL,
         1, 8, 0, 0, 4, '2025-01-01T00:00:00.000Z', 0, NULL),
        ('legacy-closed-problem', 'legacy_problem.js', 'javascript',
         'const legacyProblem = "closed";', 'problem:legacy',
         1, 7, 0, 1, 5, '2025-01-02T00:00:00.000Z', 1,
         '2025-01-02T00:00:00.000Z');
      INSERT INTO editor_workspace_state (workspace_id, active_tab_id, updated_at)
      VALUES ('default', 'legacy-open', '2025-01-03T00:00:00.000Z');
      INSERT INTO schema_migrations (component, version, updated_at)
      VALUES ('editor-workspace', 1, '2025-01-03T00:00:00.000Z');
      INSERT INTO exercise_drafts (exercise_id, title, code, updated_at)
      VALUES ('legacy-practice-draft', 'Legacy practice draft',
              'print("legacy practice draft")', '2025-01-04T00:00:00.000Z');
    `)
    await writeFile(join(userDataDir, 'codehelper.db'), Buffer.from(database.export()))
  } finally {
    database.close()
  }
}

async function openWorkspace(page: Page): Promise<void> {
  await page.getByTestId('nav-workspace').click()
  await expect(page.getByTestId('code-editor')).toBeVisible()
}

async function loadPersistedWorkspace(page: Page): Promise<PersistedEditorWorkspace> {
  return page.evaluate(() =>
    window.api.invoke('editor-workspace-load', { workspaceId: 'default' }),
  ) as Promise<PersistedEditorWorkspace>
}

async function loadRendererWorkspaceTabs(page: Page): Promise<RendererEditorTab[]> {
  return page.evaluate(() => {
    const serialized = localStorage.getItem('codehelper-editor-workspace')
    if (!serialized) return []
    try {
      const parsed = JSON.parse(serialized) as { tabs?: RendererEditorTab[] }
      return Array.isArray(parsed.tabs) ? parsed.tabs : []
    } catch {
      return []
    }
  })
}

async function waitForLocalStorageSourceKeys(
  page: Page,
  keyPrefix: string,
  markers: string[],
): Promise<string[]> {
  let sourceKeys: Array<string | null> = []
  await expect
    .poll(
      async () => {
        sourceKeys = await localStorageSourceKeysForMarkers(page, keyPrefix, markers)
        return sourceKeys.every((key) => key !== null)
      },
      { timeout: 2_000, intervals: [10, 20, 50, 100] },
    )
    .toBe(true)
  return sourceKeys.filter((key): key is string => key !== null)
}

async function localStorageSourceKeysForMarkers(
  page: Page,
  keyPrefix: string,
  markers: string[],
): Promise<Array<string | null>> {
  return page.evaluate(
    ({ prefix, expectedMarkers }) => {
      const containsMarker = (value: unknown, marker: string): boolean => {
        if (typeof value === 'string') return value.includes(marker)
        if (Array.isArray(value)) return value.some((entry) => containsMarker(entry, marker))
        if (value && typeof value === 'object') {
          return Object.values(value).some((entry) => containsMarker(entry, marker))
        }
        return false
      }
      const entries = Object.keys(localStorage)
        .filter((key) => key.startsWith(prefix))
        .map((key) => {
          const serialized = localStorage.getItem(key) ?? ''
          try {
            return { key, value: JSON.parse(serialized) as unknown }
          } catch {
            return { key, value: serialized }
          }
        })
      return expectedMarkers.map(
        (marker) => entries.find((entry) => containsMarker(entry.value, marker))?.key ?? null,
      )
    },
    { prefix: keyPrefix, expectedMarkers: markers },
  )
}

async function createWindowFromApplicationMenu(application: ElectronApplication): Promise<Page> {
  const windowCreated = application.waitForEvent('window')
  await application.evaluate(({ Menu }) => {
    const fileMenu = Menu.getApplicationMenu()?.items.find((item) => item.label === '文件')
    const newWindowItem = fileMenu?.submenu?.items.find((item) => item.label === '新建窗口')
    if (!newWindowItem?.click) throw new Error('应用菜单缺少“文件 → 新建窗口”回调')
    ;(newWindowItem.click as unknown as () => void)()
  })
  const page = await windowCreated
  await expect(page.getByTestId('nav-home')).toBeVisible()
  return page
}

async function visibleWorkspaceTabNames(page: Page): Promise<string[]> {
  return page.locator('button[aria-label^="关闭 "]').evaluateAll((buttons) =>
    buttons.flatMap((button) => {
      const label = button.getAttribute('aria-label')
      return label?.startsWith('关闭 ') ? [label.slice('关闭 '.length)] : []
    }),
  )
}

async function selectWorkspaceTab(page: Page, filename: string): Promise<void> {
  const closeButton = page.getByRole('button', { name: `关闭 ${filename}` })
  await expect(closeButton).toBeVisible()
  await closeButton.locator('..').locator('button').first().click()
}

async function expectWorkspaceMatrix(page: Page, matrix: WorkspaceMatrix): Promise<void> {
  await expect
    .poll(async () => {
      const workspace = await loadPersistedWorkspace(page)
      return {
        activeTabId: workspace.activeTabId,
        legacyStorageVersion: workspace.legacyStorageVersion,
        tabs: workspace.tabs.map((tab) => ({
          id: tab.id,
          filename: tab.filename,
          language: tab.language,
          content: tab.content,
          kind: tab.kind,
          problemId: tab.problemId,
          cursorPosition: tab.cursorPosition,
          scrollTop: tab.scrollTop,
          position: tab.position,
          status: tab.status,
        })),
        recentlyClosedTabs: workspace.recentlyClosedTabs.map((tab) => ({
          id: tab.id,
          filename: tab.filename,
          language: tab.language,
          content: tab.content,
          kind: tab.kind,
          problemId: tab.problemId,
          cursorPosition: tab.cursorPosition,
          scrollTop: tab.scrollTop,
          position: tab.position,
          status: tab.status,
        })),
      }
    })
    .toEqual({
      activeTabId: matrix.exerciseTabId,
      legacyStorageVersion: 4,
      tabs: [
        {
          id: 'matrix-file',
          filename: 'matrix_file.py',
          language: 'python',
          content: matrix.fileContent,
          kind: 'file',
          problemId: null,
          cursorPosition: { lineNumber: 37, column: 5 },
          scrollTop: 600,
          position: 0,
          status: 'open',
        },
        {
          id: matrix.importedTabId,
          filename: 'matrix_imported_problem.py',
          language: 'python',
          content: '',
          kind: 'problem',
          problemId: 'problem:701',
          cursorPosition: { lineNumber: 51, column: 7 },
          scrollTop: 900,
          position: 1,
          status: 'open',
        },
        {
          id: matrix.exerciseTabId,
          filename: 'add.py',
          language: 'python',
          content: '',
          kind: 'exercise',
          problemId: 'py-add',
          cursorPosition: { lineNumber: 63, column: 4 },
          scrollTop: 1150,
          position: 2,
          status: 'open',
        },
      ],
      recentlyClosedTabs: [
        {
          id: 'matrix-standalone-problem',
          filename: 'standalone_problem.js',
          language: 'javascript',
          content: 'const standaloneMarker = "closed-but-restorable";',
          kind: 'problem',
          problemId: 'standalone:701',
          cursorPosition: { lineNumber: 1, column: 13 },
          scrollTop: 0,
          position: 3,
          status: 'closed',
        },
      ],
    })

  const drafts = await page.evaluate(async () => {
    const [imported, exercise] = await Promise.all([
      window.api.invoke('exercises-draft-get', 'problem:701'),
      window.api.invoke('exercises-draft-get', 'py-add'),
    ])
    return { imported, exercise }
  })
  expect(drafts).toEqual({
    imported: expect.objectContaining({
      exerciseId: 'problem:701',
      code: matrix.importedDraft,
      language: 'python',
      revision: 11,
      deleted: false,
    }),
    exercise: expect.objectContaining({
      exerciseId: 'py-add',
      code: matrix.exerciseDraft,
      language: 'python',
      revision: 12,
      deleted: false,
    }),
  })
}

test('workspace content survives switching the main view', async ({ page }) => {
  const code = 'workspace_marker = "view-switch"\nprint(workspace_marker)'

  await openWorkspace(page)
  await replaceEditor(page, code)

  await page.getByTestId('nav-home').click()
  await expect(page.getByTestId('code-editor')).toHaveCount(0)
  await openWorkspace(page)

  await expect.poll(() => readEditor(page)).toBe(code)
})

test('changing the workspace language does not replace code', async ({ page }) => {
  const code = 'const languageMarker = "keep-this-code";\nconsole.log(languageMarker);'

  await openWorkspace(page)
  await replaceEditor(page, code)

  await page.getByTestId('editor-language-select').selectOption('javascript')
  await expect(page.getByTestId('code-editor')).toHaveAttribute('data-language', 'javascript')
  await expect.poll(() => readEditor(page)).toBe(code)
})

test('all tab kinds restore exact topology, view state, and draft authority after restart', async ({
  userDataDir,
}) => {
  test.setTimeout(60_000)
  const matrix: WorkspaceMatrix = {
    fileContent: longPythonDraft('matrix_file'),
    importedDraft: longPythonDraft('matrix_imported'),
    exerciseDraft: longPythonDraft('matrix_exercise'),
    importedTabId: exerciseTabId('problem:701'),
    exerciseTabId: exerciseTabId('py-add'),
  }
  await writeCurrentWorkspaceDatabase(userDataDir, matrix)

  const firstApplication = await launchApplication(userDataDir, 'matrix-before-restart')
  try {
    const firstPage = await firstReadyWindow(firstApplication, userDataDir)
    await expectWorkspaceMatrix(firstPage, matrix)
  } finally {
    await closeApplication(firstApplication)
  }

  const secondApplication = await launchApplication(userDataDir, 'matrix-after-restart')
  try {
    const secondPage = await firstReadyWindow(secondApplication, userDataDir)
    await expectWorkspaceMatrix(secondPage, matrix)
    await expect
      .poll(() =>
        secondPage.evaluate(() => {
          const raw = localStorage.getItem('codehelper-editor-workspace')
          return raw ? (JSON.parse(raw) as { version?: unknown }).version : null
        }),
      )
      .toBe(4)

    // Visit practice first because entering the standalone workspace intentionally selects its
    // first visible file tab. Exact offsets were already asserted through the durable record.
    await secondPage.getByTestId('nav-practice').click()
    await expect.poll(() => readEditor(secondPage)).toBe(matrix.exerciseDraft)
    await expect
      .poll(async () => {
        const state = await readEditorViewState(secondPage)
        return { lineNumber: state.lineNumber, column: state.column, scrolled: state.scrollTop > 0 }
      })
      .toEqual({
        lineNumber: 63,
        column: 4,
        scrolled: true,
      })
    expect(await visibleWorkspaceTabNames(secondPage)).toEqual([
      'matrix_imported_problem.py',
      'add.py',
    ])

    await selectWorkspaceTab(secondPage, 'matrix_imported_problem.py')
    await expect.poll(() => readEditor(secondPage)).toBe(matrix.importedDraft)
    await expect
      .poll(async () => {
        const state = await readEditorViewState(secondPage)
        return { lineNumber: state.lineNumber, column: state.column, scrolled: state.scrollTop > 0 }
      })
      .toEqual({
        lineNumber: 51,
        column: 7,
        scrolled: true,
      })

    await openWorkspace(secondPage)
    await expect.poll(() => readEditor(secondPage)).toBe(matrix.fileContent)
    await expect
      .poll(async () => {
        const state = await readEditorViewState(secondPage)
        return { lineNumber: state.lineNumber, column: state.column, scrolled: state.scrollTop > 0 }
      })
      .toEqual({
        lineNumber: 37,
        column: 5,
        scrolled: true,
      })
    expect(await visibleWorkspaceTabNames(secondPage)).toEqual(['matrix_file.py'])

    const workspaceAfterPracticeOpen = await loadPersistedWorkspace(secondPage)
    expect(
      workspaceAfterPracticeOpen.tabs
        .filter((tab) => [matrix.importedTabId, matrix.exerciseTabId].includes(tab.id))
        .map((tab) => ({ id: tab.id, content: tab.content })),
    ).toEqual([
      { id: matrix.importedTabId, content: '' },
      { id: matrix.exerciseTabId, content: '' },
    ])
  } finally {
    await closeApplication(secondApplication)
  }
})

test('two windows synchronize content, tab positions, and closed status', async ({
  electronApp,
  page: windowA,
}) => {
  const firstCode = 'shared_marker = "window-a"\nprint(shared_marker)'
  const secondCode = 'shared_marker = "window-b"\nprint(shared_marker)'
  const firstNewTab = 'untitled_1.py'
  const secondNewTab = 'untitled_2.py'

  await openWorkspace(windowA)
  await expect(windowA.getByText('工作区已保存', { exact: true })).toBeVisible()

  const windowB = await createWindowFromApplicationMenu(electronApp)
  expect(
    await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
  ).toBe(2)
  await openWorkspace(windowB)
  await expect(windowB.getByText('工作区已保存', { exact: true })).toBeVisible()

  await replaceEditor(windowA, firstCode)
  await expect(windowA.getByText('工作区已保存', { exact: true })).toBeVisible()
  await expect.poll(() => readEditor(windowB)).toBe(firstCode)

  await replaceEditor(windowB, secondCode)
  await expect(windowB.getByText('工作区已保存', { exact: true })).toBeVisible()
  await expect.poll(() => readEditor(windowA)).toBe(secondCode)
  await expect
    .poll(async () =>
      (await loadPersistedWorkspace(windowA)).tabs.some((tab) => tab.content === secondCode),
    )
    .toBe(true)

  await windowA.getByRole('button', { name: '新建工作区标签' }).click()
  await expect(windowA.getByRole('button', { name: `关闭 ${firstNewTab}` })).toBeVisible()
  await expect(windowB.getByRole('button', { name: `关闭 ${firstNewTab}` })).toBeVisible()
  await windowA.getByRole('button', { name: '新建工作区标签' }).click()
  await expect(windowA.getByRole('button', { name: `关闭 ${secondNewTab}` })).toBeVisible()
  await expect(windowB.getByRole('button', { name: `关闭 ${secondNewTab}` })).toBeVisible()

  await expect
    .poll(async () => {
      const workspace = await loadPersistedWorkspace(windowA)
      const tabs = workspace.tabs.filter((tab) =>
        [firstNewTab, secondNewTab].includes(tab.filename),
      )
      return tabs.length === 2 ? tabs : null
    })
    .not.toBeNull()

  const workspaceBeforeClose = await loadPersistedWorkspace(windowA)
  const positionedTabs = workspaceBeforeClose.tabs.filter((tab) =>
    [firstNewTab, secondNewTab].includes(tab.filename),
  )
  expect(positionedTabs.map((tab) => tab.filename)).toEqual([firstNewTab, secondNewTab])
  expect(positionedTabs[0].position).toBeLessThan(positionedTabs[1].position)
  expect(
    (await visibleWorkspaceTabNames(windowA)).filter((name) =>
      [firstNewTab, secondNewTab].includes(name),
    ),
  ).toEqual([firstNewTab, secondNewTab])
  expect(
    (await visibleWorkspaceTabNames(windowB)).filter((name) =>
      [firstNewTab, secondNewTab].includes(name),
    ),
  ).toEqual([firstNewTab, secondNewTab])

  await windowB.getByRole('button', { name: `关闭 ${firstNewTab}` }).click()
  await expect(windowB.getByRole('button', { name: `关闭 ${firstNewTab}` })).toHaveCount(0)
  await expect(windowA.getByRole('button', { name: `关闭 ${firstNewTab}` })).toHaveCount(0)
  await expect(windowA.getByRole('button', { name: `关闭 ${secondNewTab}` })).toBeVisible()

  await expect
    .poll(async () => {
      const workspace = await loadPersistedWorkspace(windowA)
      return {
        open: workspace.tabs.find((tab) => tab.filename === secondNewTab) ?? null,
        closed: workspace.recentlyClosedTabs.find((tab) => tab.filename === firstNewTab) ?? null,
      }
    })
    .toEqual({
      open: expect.objectContaining({
        filename: secondNewTab,
        position: positionedTabs[1].position,
        status: 'open',
      }),
      closed: expect.objectContaining({
        filename: firstNewTab,
        position: positionedTabs[0].position,
        status: 'closed',
      }),
    })
  expect(
    (await visibleWorkspaceTabNames(windowA)).filter((name) =>
      [firstNewTab, secondNewTab].includes(name),
    ),
  ).toEqual([secondNewTab])
  expect(
    (await visibleWorkspaceTabNames(windowB)).filter((name) =>
      [firstNewTab, secondNewTab].includes(name),
    ),
  ).toEqual([secondNewTab])
})

test('a remote practice-tab close flushes the active draft before returning to the list', async ({
  electronApp,
  page: windowA,
}) => {
  test.setTimeout(45_000)
  const code = 'def add(a, b):\n    return a + b  # remote-close-flush-marker'

  await windowA.getByTestId('nav-practice').click()
  await windowA.getByRole('button', { name: /实现 add 函数/ }).click()
  await expect(windowA.getByRole('heading', { name: '实现 add 函数' })).toBeVisible()

  await expect
    .poll(async () => {
      const workspace = await loadPersistedWorkspace(windowA)
      return workspace.tabs.find((tab) => tab.problemId === 'py-add') ?? null
    })
    .not.toBeNull()
  const persistedPracticeTab = (await loadPersistedWorkspace(windowA)).tabs.find(
    (tab) => tab.problemId === 'py-add',
  )
  expect(persistedPracticeTab).toBeDefined()

  const windowB = await createWindowFromApplicationMenu(electronApp)
  await windowB.getByTestId('nav-practice').click()
  await expect(windowB.getByRole('heading', { name: '实现 add 函数' })).toBeVisible()
  await expect(
    windowB.getByRole('button', { name: `关闭 ${persistedPracticeTab!.filename}` }),
  ).toBeVisible()

  await replaceEditor(windowA, code)
  await windowB.getByRole('button', { name: `关闭 ${persistedPracticeTab!.filename}` }).click()

  const remoteCloseNotice = windowA
    .getByRole('status')
    .filter({ hasText: '另一个窗口已关闭' })
    .first()
  await expect(remoteCloseNotice).toBeVisible()
  await expect(remoteCloseNotice).toContainText('草稿已保存')
  await expect(remoteCloseNotice).toContainText('已返回题库')
  await expect(windowA.getByRole('heading', { name: '练习题库' })).toBeVisible()
  await expect(
    windowA.getByRole('button', { name: `关闭 ${persistedPracticeTab!.filename}` }),
  ).toHaveCount(0)
  await expect
    .poll(() =>
      windowA.evaluate(async () => {
        const draft = (await window.api.invoke('exercises-draft-get', 'py-add')) as {
          code?: string
        } | null
        return draft?.code ?? null
      }),
    )
    .toBe(code)
})

test('closing the last practice tab stays closed across restart until explicitly selected', async ({
  userDataDir,
}) => {
  const firstApplication = await launchApplication(userDataDir, 'practice-close-before-restart')
  let practiceFilename = ''
  try {
    const firstPage = await firstReadyWindow(firstApplication, userDataDir)
    await firstPage.getByTestId('nav-practice').click()
    await firstPage.getByRole('button', { name: /实现 add 函数/ }).click()
    await expect(firstPage.getByRole('heading', { name: '实现 add 函数' })).toBeVisible()

    let practiceTab: PersistedEditorTab | undefined
    await expect
      .poll(async () => {
        practiceTab = (await loadPersistedWorkspace(firstPage)).tabs.find(
          (tab) => tab.problemId === 'py-add',
        )
        return practiceTab ?? null
      })
      .not.toBeNull()
    expect(practiceTab).toBeDefined()
    practiceFilename = practiceTab!.filename
    await firstPage.getByRole('button', { name: `关闭 ${practiceFilename}` }).click()
    await expect(firstPage.getByRole('heading', { name: '练习题库' })).toBeVisible()
    await expect(firstPage.getByRole('button', { name: `关闭 ${practiceFilename}` })).toHaveCount(0)
    expect(
      await firstPage.evaluate(() => localStorage.getItem('codehelper-practice-session-v1')),
    ).toBeNull()
    await expect
      .poll(async () => {
        const workspace = await loadPersistedWorkspace(firstPage)
        return workspace.recentlyClosedTabs.find((tab) => tab.problemId === 'py-add')?.status
      })
      .toBe('closed')
  } finally {
    await closeApplication(firstApplication)
  }

  const secondApplication = await launchApplication(userDataDir, 'practice-close-after-restart')
  try {
    const secondPage = await firstReadyWindow(secondApplication, userDataDir)
    await secondPage.getByTestId('nav-practice').click()
    await expect(secondPage.getByRole('heading', { name: '练习题库' })).toBeVisible()
    await expect(secondPage.getByRole('button', { name: `关闭 ${practiceFilename}` })).toHaveCount(
      0,
    )
    expect(
      await secondPage.evaluate(() => localStorage.getItem('codehelper-practice-session-v1')),
    ).toBeNull()
    const closedWorkspace = await loadPersistedWorkspace(secondPage)
    expect(
      closedWorkspace.recentlyClosedTabs.some(
        (tab) => tab.problemId === 'py-add' && tab.filename === practiceFilename,
      ),
    ).toBe(true)

    await secondPage.getByRole('button', { name: /实现 add 函数/ }).click()
    await expect(secondPage.getByRole('heading', { name: '实现 add 函数' })).toBeVisible()
    await expect(secondPage.getByTestId('code-editor')).toBeVisible()
    await expect
      .poll(async () => {
        const workspace = await loadPersistedWorkspace(secondPage)
        return workspace.tabs.some((tab) => tab.problemId === 'py-add' && tab.status === 'open')
      })
      .toBe(true)
  } finally {
    await closeApplication(secondApplication)
  }
})

test('a recovery-only practice draft requires explicit confirmation before close', async ({
  electronApp,
  page,
}) => {
  const code = 'def add(a, b):\n    return a + b  # recovery-only-close-marker'

  await page.getByTestId('nav-practice').click()
  await page.getByRole('button', { name: /实现 add 函数/ }).click()
  await expect(page.getByRole('heading', { name: '实现 add 函数' })).toBeVisible()

  let practiceTab: PersistedEditorTab | undefined
  await expect
    .poll(async () => {
      practiceTab = (await loadPersistedWorkspace(page)).tabs.find(
        (tab) => tab.problemId === 'py-add',
      )
      return practiceTab ?? null
    })
    .not.toBeNull()
  await expect(page.getByText('草稿与标签已同步', { exact: true })).toBeVisible()
  await disableIpcHandler(electronApp, 'exercises-draft-save')
  await replaceEditor(page, code)
  await waitForLocalStorageSourceKeys(page, 'codehelper-practice-draft-recovery', [code])
  const currentView = await readEditorViewState(page)
  await expect
    .poll(async () => {
      const tab = (await loadPersistedWorkspace(page)).tabs.find(
        (candidate) => candidate.problemId === 'py-add',
      )
      return tab?.cursorPosition ?? null
    })
    .toEqual({ lineNumber: currentView.lineNumber, column: currentView.column })

  const closeButton = page.getByRole('button', { name: `关闭 ${practiceTab!.filename}` })
  const dismissedWarning = page.waitForEvent('dialog').then(async (dialog) => {
    const message = dialog.message()
    await dialog.dismiss()
    return message
  })
  await closeButton.click()
  expect(await dismissedWarning).toContain('最新内容仅保存在本地恢复区')
  await expect(page.getByRole('heading', { name: '实现 add 函数' })).toBeVisible()
  await expect(closeButton).toBeVisible()

  const acceptedWarning = page.waitForEvent('dialog').then(async (dialog) => {
    const message = dialog.message()
    await dialog.accept()
    return message
  })
  await closeButton.click()
  expect(await acceptedWarning).toContain('当前不是完整数据库保存')
  await expect(page.getByRole('heading', { name: '练习题库' })).toBeVisible()
  await expect(closeButton).toHaveCount(0)
  await expect
    .poll(async () => {
      const workspace = await loadPersistedWorkspace(page)
      return workspace.recentlyClosedTabs.find((tab) => tab.problemId === 'py-add')?.status
    })
    .toBe('closed')
  const durableAfterClose = (await page.evaluate(() =>
    window.api.invoke('exercises-draft-get', 'py-add'),
  )) as { code?: string } | null
  expect(durableAfterClose?.code).not.toBe(code)
  await waitForLocalStorageSourceKeys(page, 'codehelper-practice-draft-recovery', [code])
})

test('practice draft is restored after immediately leaving the page', async ({ page }) => {
  const code = 'def add(a, b):\n    return a + b  # e2e-draft-marker'

  await page.getByTestId('nav-practice').click()
  await page.getByRole('button', { name: /实现 add 函数/ }).click()
  await expect(page.getByRole('heading', { name: '实现 add 函数' })).toBeVisible()
  await replaceEditor(page, code)

  await page.getByTestId('nav-home').click()
  await expect(page.getByTestId('code-editor')).toHaveCount(0)
  await page.getByTestId('nav-practice').click()

  await expect(page.getByRole('heading', { name: '实现 add 函数' })).toBeVisible()
  await expect.poll(() => readEditor(page)).toBe(code)
})

test('corrupt legacy practice recovery is backed up and visibly degraded', async ({ page }) => {
  const key = 'codehelper-practice-draft-recovery-v1'
  const raw = '{broken legacy practice recovery'
  await page.evaluate(
    ({ storageKey, storageValue }) => localStorage.setItem(storageKey, storageValue),
    { storageKey: key, storageValue: raw },
  )

  await page.getByTestId('nav-practice').click()
  await page.getByRole('button', { name: /实现 add 函数/ }).click()
  await expect(page.getByRole('heading', { name: '实现 add 函数' })).toBeVisible()
  await expect(page.getByText('草稿保存失败', { exact: true })).toBeVisible()

  const recoveryState = await page.evaluate((storageKey) => {
    const backups = Object.keys(localStorage)
      .filter((candidate) => candidate.startsWith(`${storageKey}.corrupt.`))
      .map((candidate) => ({ key: candidate, value: localStorage.getItem(candidate) }))
    return { original: localStorage.getItem(storageKey), backups }
  }, key)
  expect(recoveryState.original).toBe(raw)
  expect(recoveryState.backups).toEqual([
    expect.objectContaining({ key: expect.stringContaining(`${key}.corrupt.`), value: raw }),
  ])
})

test('window close flushes the latest workspace edit before restart', async ({ userDataDir }) => {
  const code = 'close_marker = "flush-before-exit"\nprint(close_marker)'
  const firstApplication = await launchApplication(userDataDir)
  try {
    const firstPage = await firstReadyWindow(firstApplication, userDataDir)
    await openWorkspace(firstPage)
    await replaceEditor(firstPage, code)
    await closeApplication(firstApplication)
  } finally {
    await closeApplication(firstApplication)
  }

  const secondApplication = await launchApplication(userDataDir)
  try {
    const secondPage = await firstReadyWindow(secondApplication, userDataDir)
    await openWorkspace(secondPage)
    await expect.poll(() => readEditor(secondPage)).toBe(code)
  } finally {
    await closeApplication(secondApplication)
  }
})

test('workspace recovery log survives an abnormal application exit', async ({ userDataDir }) => {
  const code = 'crash_marker = "workspace-recovery-log"\nprint(crash_marker)'
  const firstApplication = await launchApplication(userDataDir)
  try {
    const firstPage = await firstReadyWindow(firstApplication, userDataDir)
    await openWorkspace(firstPage)
    await expect
      .poll(async () => (await loadPersistedWorkspace(firstPage)).tabs.length)
      .toBeGreaterThan(0)
    await disableIpcHandler(firstApplication, 'editor-tab-save')
    await replaceEditor(firstPage, code)
    expect((await loadPersistedWorkspace(firstPage)).tabs.some((tab) => tab.content === code)).toBe(
      false,
    )
    await waitForLocalStorageSourceKeys(firstPage, 'codehelper-editor-workspace-recovery', [code])
    await forceExit(firstApplication)
  } finally {
    await closeApplication(firstApplication)
  }

  const secondApplication = await launchApplication(userDataDir)
  try {
    const secondPage = await firstReadyWindow(secondApplication, userDataDir)
    await openWorkspace(secondPage)
    await expect.poll(() => readEditor(secondPage)).toBe(code)
  } finally {
    await closeApplication(secondApplication)
  }
})

test('workspace recovery survives a renderer-only crash with the main process alive', async ({
  userDataDir,
}) => {
  test.setTimeout(60_000)
  const code = longPythonDraft('renderer_crash_marker', 140)
  const expectedViewState: EditorViewState = {
    lineNumber: 96,
    column: 12,
    scrollTop: 900,
  }
  const firstApplication = await launchApplication(userDataDir, 'renderer-crash')
  const mainProcessId = firstApplication.process().pid
  try {
    const firstPage = await firstReadyWindow(firstApplication, userDataDir)
    await openWorkspace(firstPage)
    const durableBeforeCrash = await loadPersistedWorkspace(firstPage)
    expect(durableBeforeCrash.tabs.length).toBeGreaterThan(0)
    const activeTabId = durableBeforeCrash.activeTabId ?? durableBeforeCrash.tabs[0].id
    await disableIpcHandler(firstApplication, 'editor-tab-save')
    await disableIpcHandler(firstApplication, 'editor-tab-update-view-state')
    await replaceEditor(firstPage, code)
    expect((await loadPersistedWorkspace(firstPage)).tabs.some((tab) => tab.content === code)).toBe(
      false,
    )
    await waitForLocalStorageSourceKeys(firstPage, 'codehelper-editor-workspace-recovery', [code])
    expect(await setEditorViewState(firstPage, expectedViewState)).toEqual(expectedViewState)
    await expect
      .poll(() => readEditorRecoveryViewState(firstPage, activeTabId), {
        timeout: 5_000,
        intervals: [10, 20, 50, 100],
      })
      .toEqual(expectedViewState)
    await forceRendererCrash(firstApplication, firstPage)
    const recoveredPage = await recoveredReadyWindow(firstApplication, userDataDir)
    expect(firstApplication.process().pid).toBe(mainProcessId)
    await expect(recoveredPage.getByTestId('renderer-recovery-banner')).toBeVisible()
    await openWorkspace(recoveredPage)
    await expect.poll(() => readEditor(recoveredPage)).toBe(code)
    await expect
      .poll(async () => {
        const restoredTab = (await loadRendererWorkspaceTabs(recoveredPage)).find(
          (tab) => tab.content === code,
        )
        return restoredTab
          ? {
              lineNumber: restoredTab.cursorPosition?.lineNumber,
              column: restoredTab.cursorPosition?.column,
              scrollTop: restoredTab.scrollTop,
            }
          : null
      })
      .toEqual(expectedViewState)
    await expect.poll(() => readEditorViewState(recoveredPage)).toEqual(expectedViewState)
    await expect(recoveredPage.getByText('工作区仅本地保存', { exact: true })).toBeVisible()
    await forceExit(firstApplication)
  } finally {
    await closeApplication(firstApplication)
  }
})

test('multiple edited tabs preserve order, active tab, and content after abnormal exit', async ({
  userDataDir,
}) => {
  test.setTimeout(60_000)
  const expected = [
    {
      filename: 'welcome.py',
      content: 'first_crash_marker = "welcome"\nprint(first_crash_marker)',
    },
    {
      filename: 'untitled_1.py',
      content: 'second_crash_marker = "tab-one"\nprint(second_crash_marker)',
    },
    {
      filename: 'untitled_2.py',
      content: 'third_crash_marker = "tab-two"\nprint(third_crash_marker)',
    },
  ]

  const firstApplication = await launchApplication(userDataDir, 'multi-tab-abnormal-exit')
  try {
    const firstPage = await firstReadyWindow(firstApplication, userDataDir)
    await openWorkspace(firstPage)
    await expect
      .poll(async () => (await loadPersistedWorkspace(firstPage)).tabs.length)
      .toBeGreaterThan(0)
    await disableIpcHandler(firstApplication, 'editor-tab-save')
    await replaceEditor(firstPage, expected[0].content)
    await firstPage.getByRole('button', { name: '新建工作区标签' }).click()
    await expect(firstPage.getByRole('button', { name: '关闭 untitled_1.py' })).toBeVisible()
    await replaceEditor(firstPage, expected[1].content)
    await firstPage.getByRole('button', { name: '新建工作区标签' }).click()
    await expect(firstPage.getByRole('button', { name: '关闭 untitled_2.py' })).toBeVisible()
    await replaceEditor(firstPage, expected[2].content)
    const beforeExit = await loadPersistedWorkspace(firstPage)
    expect(beforeExit.tabs.some((tab) => tab.filename.startsWith('untitled_'))).toBe(false)
    expect(
      beforeExit.tabs.some((tab) => expected.some((item) => item.content === tab.content)),
    ).toBe(false)
    await waitForLocalStorageSourceKeys(
      firstPage,
      'codehelper-editor-workspace-recovery',
      expected.map((tab) => tab.content),
    )
    await forceExit(firstApplication)
  } finally {
    await closeApplication(firstApplication)
  }

  const secondApplication = await launchApplication(userDataDir, 'multi-tab-after-abnormal-exit')
  try {
    const secondPage = await firstReadyWindow(secondApplication, userDataDir)
    await openWorkspace(secondPage)
    await expect
      .poll(() => visibleWorkspaceTabNames(secondPage))
      .toEqual(expected.map((tab) => tab.filename))

    const restored = await loadPersistedWorkspace(secondPage)
    expect(restored.activeTabId).toBe(
      restored.tabs.find((tab) => tab.filename === 'untitled_2.py')?.id,
    )
    expect(restored.tabs.map((tab) => tab.filename)).toEqual(expected.map((tab) => tab.filename))
    for (const tab of expected) {
      await selectWorkspaceTab(secondPage, tab.filename)
      await expect.poll(() => readEditor(secondPage)).toBe(tab.content)
    }
  } finally {
    await closeApplication(secondApplication)
  }
})

test('divergent editor recoveries from two windows both survive abnormal application exit', async ({
  userDataDir,
}) => {
  test.setTimeout(75_000)
  const windowACode = 'window_a_recovery_marker = "alpha"\nprint(window_a_recovery_marker)'
  const windowBCode = 'window_b_recovery_marker = "beta"\nprint(window_b_recovery_marker)'
  const firstApplication = await launchApplication(userDataDir, 'divergent-editor-recovery')
  try {
    const windowA = await firstReadyWindow(firstApplication, userDataDir)
    await openWorkspace(windowA)
    await expect
      .poll(async () => (await loadPersistedWorkspace(windowA)).tabs.length)
      .toBeGreaterThan(0)

    const windowB = await createWindowFromApplicationMenu(firstApplication)
    await openWorkspace(windowB)
    await expect.poll(() => readEditor(windowB)).toBe(await readEditor(windowA))
    await disableIpcHandler(firstApplication, 'editor-tab-save')

    await replaceEditor(windowA, windowACode)
    await replaceEditor(windowB, windowBCode)
    const durableBeforeExit = await loadPersistedWorkspace(windowA)
    expect(
      durableBeforeExit.tabs.some((tab) => [windowACode, windowBCode].includes(tab.content)),
    ).toBe(false)

    const recoverySourceKeys = await waitForLocalStorageSourceKeys(
      windowA,
      'codehelper-editor-workspace-recovery-v2.session.',
      [windowACode, windowBCode],
    )
    expect(recoverySourceKeys[0]).not.toBeNull()
    expect(recoverySourceKeys[1]).not.toBeNull()
    expect(recoverySourceKeys[0]).not.toBe(recoverySourceKeys[1])
    await forceExit(firstApplication)
  } finally {
    await closeApplication(firstApplication)
  }

  const secondApplication = await launchApplication(userDataDir, 'after-divergent-recovery')
  try {
    const secondPage = await firstReadyWindow(secondApplication, userDataDir)
    await openWorkspace(secondPage)
    let rendererTabs: RendererEditorTab[] = []
    await expect
      .poll(async () => {
        rendererTabs = (await loadRendererWorkspaceTabs(secondPage)).filter((tab) =>
          [windowACode, windowBCode].includes(tab.content),
        )
        return rendererTabs.map((tab) => tab.content).sort()
      })
      .toEqual([windowACode, windowBCode].sort())
    expect(new Set(rendererTabs.map((tab) => tab.id)).size).toBe(2)
    expect(rendererTabs.every((tab) => tab.kind === 'file')).toBe(true)
    expect(rendererTabs.some((tab) => tab.filename.includes('.recovered'))).toBe(true)

    const conflictedTab = rendererTabs.find((tab) => tab.syncConflict)
    expect(conflictedTab).toBeDefined()
    const [conflictedSourceKey] = await localStorageSourceKeysForMarkers(
      secondPage,
      'codehelper-editor-workspace-recovery-v2.session.',
      [conflictedTab!.content],
    )
    expect(conflictedSourceKey).not.toBeNull()
    expect(conflictedTab?.recoverySourceKeys).toContain(conflictedSourceKey)
    for (const tab of rendererTabs) {
      await selectWorkspaceTab(secondPage, tab.filename)
      await expect.poll(() => readEditor(secondPage)).toBe(tab.content)
    }

    const conflictDialog = secondPage.getByRole('alertdialog')
    await expect(conflictDialog).toBeVisible()
    await conflictDialog.getByRole('button', { name: '保留本地' }).click()
    await expect(conflictDialog).toHaveCount(0)
    await expect
      .poll(async () => {
        const resolvedTab = (await loadRendererWorkspaceTabs(secondPage)).find(
          (tab) => tab.id === conflictedTab?.id,
        )
        const [remainingSourceKey] = await localStorageSourceKeysForMarkers(
          secondPage,
          'codehelper-editor-workspace-recovery-v2.session.',
          [conflictedTab!.content],
        )
        return {
          exists: Boolean(resolvedTab),
          syncConflict: resolvedTab?.syncConflict === true,
          recoverySourceKeys: resolvedTab?.recoverySourceKeys ?? [],
          remainingSourceKey,
        }
      })
      .toEqual({
        exists: true,
        syncConflict: false,
        recoverySourceKeys: [],
        remainingSourceKey: null,
      })

    let recoveredTabs: PersistedEditorTab[] = []
    await expect
      .poll(async () => {
        const workspace = await loadPersistedWorkspace(secondPage)
        recoveredTabs = workspace.tabs.filter((tab) =>
          [windowACode, windowBCode].includes(tab.content),
        )
        return recoveredTabs.map((tab) => tab.content).sort()
      })
      .toEqual([windowACode, windowBCode].sort())
    expect(new Set(recoveredTabs.map((tab) => tab.id)).size).toBe(2)
    expect(recoveredTabs.every((tab) => tab.kind === 'file')).toBe(true)
    expect(recoveredTabs.some((tab) => tab.filename.includes('.recovered'))).toBe(true)
  } finally {
    await closeApplication(secondApplication)
  }
})

test('a legacy on-disk editor schema upgrades in place through full startup', async ({
  userDataDir,
}) => {
  test.setTimeout(60_000)
  await writeLegacyWorkspaceDatabase(userDataDir)

  const assertMigratedRuntime = async (page: Page): Promise<void> => {
    await expect
      .poll(async () => {
        const workspace = await loadPersistedWorkspace(page)
        return {
          activeTabId: workspace.activeTabId,
          legacyStorageVersion: workspace.legacyStorageVersion,
          tabs: workspace.tabs.map((tab) => ({
            id: tab.id,
            filename: tab.filename,
            kind: tab.kind,
            problemId: tab.problemId,
            content: tab.content,
            cursorPosition: tab.cursorPosition,
            scrollTop: tab.scrollTop,
            position: tab.position,
            status: tab.status,
            revision: tab.revision,
          })),
          closed: workspace.recentlyClosedTabs.map((tab) => ({
            id: tab.id,
            filename: tab.filename,
            kind: tab.kind,
            problemId: tab.problemId,
            content: tab.content,
            cursorPosition: tab.cursorPosition,
            scrollTop: tab.scrollTop,
            position: tab.position,
            status: tab.status,
            revision: tab.revision,
          })),
        }
      })
      .toEqual({
        activeTabId: 'legacy-open',
        legacyStorageVersion: 4,
        tabs: [
          {
            id: 'legacy-open',
            filename: 'legacy_open.py',
            kind: 'file',
            problemId: null,
            content: 'legacy_marker = "preserved"',
            cursorPosition: { lineNumber: 1, column: 8 },
            scrollTop: 0,
            position: 0,
            status: 'open',
            revision: 4,
          },
        ],
        closed: [
          {
            id: 'legacy-closed-problem',
            filename: 'legacy_problem.js',
            kind: 'problem',
            problemId: 'problem:legacy',
            content: 'const legacyProblem = "closed";',
            cursorPosition: { lineNumber: 1, column: 7 },
            scrollTop: 0,
            position: 1,
            status: 'closed',
            revision: 5,
          },
        ],
      })
    await openWorkspace(page)
    await expect.poll(() => readEditor(page)).toBe('legacy_marker = "preserved"')
    await expect
      .poll(() =>
        page.evaluate(() => window.api.invoke('exercises-draft-get', 'legacy-practice-draft')),
      )
      .toMatchObject({
        exerciseId: 'legacy-practice-draft',
        title: 'Legacy practice draft',
        code: 'print("legacy practice draft")',
        language: null,
        revision: 1,
        updatedAt: '2025-01-04T00:00:00.000Z',
        deleted: false,
      })
  }

  const firstApplication = await launchApplication(userDataDir, 'legacy-schema-upgrade')
  try {
    await assertMigratedRuntime(await firstReadyWindow(firstApplication, userDataDir))
  } finally {
    await closeApplication(firstApplication)
  }

  const secondApplication = await launchApplication(userDataDir, 'legacy-schema-restart')
  try {
    await assertMigratedRuntime(await firstReadyWindow(secondApplication, userDataDir))
  } finally {
    await closeApplication(secondApplication)
  }

  const SQL = await initSqlJs()
  const database = new SQL.Database(await readFile(join(userDataDir, 'codehelper.db')))
  try {
    expect(
      querySqlJs(
        database,
        "SELECT version FROM schema_migrations WHERE component = 'editor-workspace'",
      ),
    ).toEqual([{ version: 3 }])
    expect(
      querySqlJs(
        database,
        "SELECT legacy_storage_version FROM editor_workspaces WHERE workspace_id = 'default'",
      ),
    ).toEqual([{ legacy_storage_version: 4 }])
    expect(
      querySqlJs(
        database,
        `SELECT tab_id, filename, language, content, tab_kind, problem_id,
                cursor_line, cursor_column, scroll_top, tab_position, status, revision
         FROM editor_tabs
         WHERE workspace_id = 'default'
         ORDER BY tab_position`,
      ),
    ).toEqual([
      {
        tab_id: 'legacy-open',
        filename: 'legacy_open.py',
        language: 'python',
        content: 'legacy_marker = "preserved"',
        tab_kind: 'file',
        problem_id: null,
        cursor_line: 1,
        cursor_column: 8,
        scroll_top: 0,
        tab_position: 0,
        status: 'open',
        revision: 4,
      },
      {
        tab_id: 'legacy-closed-problem',
        filename: 'legacy_problem.js',
        language: 'javascript',
        content: 'const legacyProblem = "closed";',
        tab_kind: 'problem',
        problem_id: 'problem:legacy',
        cursor_line: 1,
        cursor_column: 7,
        scroll_top: 0,
        tab_position: 1,
        status: 'closed',
        revision: 5,
      },
    ])
    const columns = querySqlJs(database, 'PRAGMA table_info(editor_tabs)').map((row) => row.name)
    expect(columns).toEqual(
      expect.arrayContaining([
        'workspace_id',
        'tab_kind',
        'last_mutation_fingerprint',
        'last_view_mutation_fingerprint',
        'deleted_at',
      ]),
    )
    expect(
      querySqlJs(
        database,
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'editor_workspace_state'",
      ),
    ).toEqual([])
  } finally {
    database.close()
  }
})

test('corrupted SQLite files are isolated byte-for-byte and the recovery notice is dismissible', async ({
  userDataDir,
}) => {
  const databasePath = join(userDataDir, 'codehelper.db')
  const databaseBytes = Buffer.alloc(4096, 0xa1)
  const walBytes = Buffer.alloc(1536, 0xb2)
  const shmBytes = Buffer.alloc(2048, 0xc3)
  databaseBytes.write('CODEHELPER-CORRUPT-MAIN-V1')
  walBytes.write('CODEHELPER-CORRUPT-WAL-V1')
  shmBytes.write('CODEHELPER-CORRUPT-SHM-V1')
  await Promise.all([
    writeFile(databasePath, databaseBytes),
    writeFile(`${databasePath}-wal`, walBytes),
    writeFile(`${databasePath}-shm`, shmBytes),
  ])

  const firstApplication = await launchApplication(userDataDir)
  try {
    const firstPage = await firstReadyWindow(firstApplication, userDataDir)
    const banner = firstPage.getByTestId('database-recovery-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('数据库损坏已隔离')
    await expect(banner).toContainText('其他原始数据仍保存在')

    const workspace = await loadPersistedWorkspace(firstPage)
    expect(Array.isArray(workspace.tabs)).toBe(true)
    expect(Array.isArray(workspace.recentlyClosedTabs)).toBe(true)

    const files = await readdir(userDataDir)
    const mainBackups = files.filter((name) => /^codehelper\.db\.corrupt\.\d+$/.test(name))
    expect(mainBackups).toHaveLength(1)
    const backupName = mainBackups[0]
    await expect(banner).toContainText(backupName)
    expect(Buffer.compare(await readFile(join(userDataDir, backupName)), databaseBytes)).toBe(0)
    expect(Buffer.compare(await readFile(join(userDataDir, `${backupName}-wal`)), walBytes)).toBe(0)
    expect(Buffer.compare(await readFile(join(userDataDir, `${backupName}-shm`)), shmBytes)).toBe(0)

    const rebuiltDatabase = await readFile(databasePath)
    expect(rebuiltDatabase.subarray(0, 16).toString('utf8')).toBe('SQLite format 3\u0000')

    await firstPage.getByRole('button', { name: '关闭数据库恢复提示' }).click()
    await expect(banner).toHaveCount(0)
    await expect
      .poll(() =>
        firstPage.evaluate(() =>
          window.api.invoke('db-get-setting', 'database_recovery_notice_v1'),
        ),
      )
      .toBe('')
    await closeApplication(firstApplication)
  } finally {
    await closeApplication(firstApplication)
  }

  const secondApplication = await launchApplication(userDataDir)
  try {
    const secondPage = await firstReadyWindow(secondApplication, userDataDir)
    await expect
      .poll(() =>
        secondPage.evaluate(() =>
          window.api.invoke('db-get-setting', 'database_recovery_notice_v1'),
        ),
      )
      .toBe('')
    await expect(secondPage.getByTestId('database-recovery-banner')).toHaveCount(0)
    expect((await loadPersistedWorkspace(secondPage)).tabs).toBeDefined()
  } finally {
    await closeApplication(secondApplication)
  }
})

test('corrupted workspace snapshot stays visibly degraded after SQLite recovery', async ({
  userDataDir,
}) => {
  const code = 'corrupt_snapshot_marker = "sqlite-survives"\nprint(corrupt_snapshot_marker)'
  const corruptedSnapshot = '{broken workspace snapshot'
  const firstApplication = await launchApplication(userDataDir)
  try {
    const firstPage = await firstReadyWindow(firstApplication, userDataDir)
    await openWorkspace(firstPage)
    await replaceEditor(firstPage, code)
    await expect(firstPage.getByText('工作区已保存', { exact: true })).toBeVisible()
    await expect
      .poll(async () => {
        const workspace = await loadPersistedWorkspace(firstPage)
        return workspace.tabs.some((tab) => tab.content === code)
      })
      .toBe(true)

    const markerStillInRecoveryLog = await firstPage.evaluate((marker) => {
      return Object.keys(localStorage)
        .filter((key) => key.startsWith('codehelper-editor-workspace-recovery'))
        .some((key) => localStorage.getItem(key)?.includes(marker))
    }, code)
    expect(markerStillInRecoveryLog).toBe(false)

    await firstPage.evaluate((raw) => {
      localStorage.setItem('codehelper-editor-workspace', raw)
    }, corruptedSnapshot)
    await forceExit(firstApplication)
  } finally {
    await closeApplication(firstApplication)
  }

  const secondApplication = await launchApplication(userDataDir)
  try {
    const secondPage = await firstReadyWindow(secondApplication, userDataDir)
    await openWorkspace(secondPage)
    await expect(secondPage.getByText('工作区恢复降级', { exact: true })).toBeVisible()
    await expect(secondPage.getByRole('status')).toContainText('已从 SQLite 加载可用工作区数据')
    await expect(secondPage.getByRole('status')).toContainText(
      '无法确认损坏记录中是否还有未同步内容',
    )
    await expect(secondPage.getByRole('status')).not.toContainText('恢复完整工作区')
    await expect(secondPage.getByRole('status')).not.toContainText('已打开默认工作区')
    const backups = await secondPage.evaluate(() => {
      return Object.keys(localStorage)
        .filter((key) => key.startsWith('codehelper-editor-workspace.corrupt.'))
        .map((key) => ({ key, value: localStorage.getItem(key) }))
    })
    expect(backups.some((backup) => backup.value === corruptedSnapshot)).toBe(true)
    await expect.poll(() => readEditor(secondPage)).toBe(code)
    const restoredWorkspace = await loadPersistedWorkspace(secondPage)
    expect(restoredWorkspace.tabs.some((tab) => tab.content === code)).toBe(true)
  } finally {
    await closeApplication(secondApplication)
  }
})

test('practice recovery log survives an abnormal application exit', async ({ userDataDir }) => {
  const code = 'def add(a, b):\n    return a + b  # crash-recovery-log'
  const firstApplication = await launchApplication(userDataDir)
  try {
    const firstPage = await firstReadyWindow(firstApplication, userDataDir)
    await firstPage.getByTestId('nav-practice').click()
    await firstPage.getByRole('button', { name: /实现 add 函数/ }).click()
    await expect(firstPage.getByRole('heading', { name: '实现 add 函数' })).toBeVisible()
    await disableIpcHandler(firstApplication, 'exercises-draft-save')
    await replaceEditor(firstPage, code)
    const beforeExit = (await firstPage.evaluate(() =>
      window.api.invoke('exercises-draft-get', 'py-add'),
    )) as { code?: string } | null
    expect(beforeExit?.code).not.toBe(code)
    await waitForLocalStorageSourceKeys(firstPage, 'codehelper-practice-draft-recovery', [code])
    await forceExit(firstApplication)
  } finally {
    await closeApplication(firstApplication)
  }

  const secondApplication = await launchApplication(userDataDir)
  try {
    const secondPage = await firstReadyWindow(secondApplication, userDataDir)
    await secondPage.getByTestId('nav-practice').click()
    await expect(secondPage.getByRole('heading', { name: '实现 add 函数' })).toBeVisible()
    await expect.poll(() => readEditor(secondPage)).toBe(code)
  } finally {
    await closeApplication(secondApplication)
  }
})

test('divergent practice drafts from two windows restore with an explicit conflict', async ({
  userDataDir,
}) => {
  test.setTimeout(75_000)
  const windowACode = 'def add(a, b):\n    return a + b  # practice-window-a'
  const windowBCode = 'def add(a, b):\n    return sum((a, b))  # practice-window-b'
  const firstApplication = await launchApplication(userDataDir, 'divergent-practice-recovery')
  try {
    const windowA = await firstReadyWindow(firstApplication, userDataDir)
    await windowA.getByTestId('nav-practice').click()
    await windowA.getByRole('button', { name: /实现 add 函数/ }).click()
    await expect(windowA.getByRole('heading', { name: '实现 add 函数' })).toBeVisible()

    const windowB = await createWindowFromApplicationMenu(firstApplication)
    await windowB.getByTestId('nav-practice').click()
    await expect(windowB.getByRole('heading', { name: '实现 add 函数' })).toBeVisible()
    await disableIpcHandler(firstApplication, 'exercises-draft-save')

    await replaceEditor(windowA, windowACode)
    await replaceEditor(windowB, windowBCode)
    const durableBeforeExit = (await windowA.evaluate(() =>
      window.api.invoke('exercises-draft-get', 'py-add'),
    )) as { code?: string } | null
    expect([windowACode, windowBCode]).not.toContain(durableBeforeExit?.code)

    const recoverySourceKeys = await waitForLocalStorageSourceKeys(
      windowA,
      'codehelper-practice-draft-recovery-v2.session.',
      [windowACode, windowBCode],
    )
    expect(recoverySourceKeys[0]).not.toBeNull()
    expect(recoverySourceKeys[1]).not.toBeNull()
    expect(recoverySourceKeys[0]).not.toBe(recoverySourceKeys[1])
    await forceExit(firstApplication)
  } finally {
    await closeApplication(firstApplication)
  }

  const secondApplication = await launchApplication(userDataDir, 'after-practice-divergence')
  try {
    const secondPage = await firstReadyWindow(secondApplication, userDataDir)
    await secondPage.getByTestId('nav-practice').click()
    await expect(secondPage.getByRole('heading', { name: '实现 add 函数' })).toBeVisible()
    await expect(secondPage.getByText('草稿版本冲突', { exact: true })).toBeVisible()
    const selectedCode = await readEditor(secondPage)
    expect([windowACode, windowBCode]).toContain(selectedCode)
    const unselectedCode = selectedCode === windowACode ? windowBCode : windowACode

    await openWorkspace(secondPage)
    let recoveryFile: PersistedEditorTab | null = null
    await expect
      .poll(async () => {
        const workspace = await loadPersistedWorkspace(secondPage)
        recoveryFile = workspace.tabs.find((tab) => tab.content === unselectedCode) ?? null
        return recoveryFile
          ? {
              kind: recoveryFile.kind,
              filename: recoveryFile.filename,
              content: recoveryFile.content,
            }
          : null
      })
      .toEqual({
        kind: 'file',
        filename: expect.stringMatching(/\.window-[^.]+\.recovery\./),
        content: unselectedCode,
      })
    await selectWorkspaceTab(secondPage, recoveryFile!.filename)
    await expect.poll(() => readEditor(secondPage)).toBe(unselectedCode)
  } finally {
    await closeApplication(secondApplication)
  }
})
