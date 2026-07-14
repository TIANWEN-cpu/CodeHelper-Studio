import { expect, test as base, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

type ElectronFixtures = {
  electronApp: ElectronApplication
  page: Page
  userDataDir: string
}

const appRoot = resolve(__dirname, '../..')

const test = base.extend<ElectronFixtures>({
  // Playwright requires fixture arguments to use object destructuring, even when none are needed.
  // eslint-disable-next-line no-empty-pattern
  userDataDir: async ({}, provide) => {
    const directory = await mkdtemp(join(tmpdir(), 'codehelper-e2e-'))
    expect(isAbsolute(directory)).toBe(true)
    try {
      await provide(directory)
    } finally {
      await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  },

  electronApp: async ({ userDataDir }, provide) => {
    const application = await electron.launch({
      args: [appRoot],
      env: {
        ...process.env,
        CODEHELPER_E2E_USER_DATA: userDataDir,
      },
    })

    try {
      await provide(application)
    } finally {
      await application.close()
    }
  },

  page: async ({ electronApp, userDataDir }, provide) => {
    const page = await electronApp.firstWindow()
    const actualUserData = await electronApp.evaluate(({ app }) => app.getPath('userData'))
    expect(resolve(actualUserData)).toBe(resolve(userDataDir))
    await expect(page.getByTestId('nav-home')).toBeVisible()
    await provide(page)
  },
})

async function launchApplication(userDataDir: string): Promise<ElectronApplication> {
  return electron.launch({
    args: [appRoot],
    env: {
      ...process.env,
      CODEHELPER_E2E_USER_DATA: userDataDir,
    },
  })
}

async function firstReadyWindow(
  application: ElectronApplication,
  userDataDir: string,
): Promise<Page> {
  const page = await application.firstWindow()
  const actualUserData = await application.evaluate(({ app }) => app.getPath('userData'))
  expect(resolve(actualUserData)).toBe(resolve(userDataDir))
  await expect(page.getByTestId('nav-home')).toBeVisible()
  return page
}

async function forceExit(application: ElectronApplication): Promise<void> {
  const process = application.process()
  const exited = new Promise<void>((resolveExit) => process.once('exit', () => resolveExit()))
  await application.evaluate(({ app }) => {
    setImmediate(() => app.exit(9))
  })
  await exited
}

function codeContent(page: Page): Locator {
  return page.getByTestId('code-editor').locator('.cm-content')
}

async function readEditor(page: Page): Promise<string> {
  return codeContent(page).evaluate((element) =>
    (element as HTMLElement).innerText.replace(/\r\n/g, '\n'),
  )
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

async function openWorkspace(page: Page): Promise<void> {
  await page.getByTestId('nav-workspace').click()
  await expect(page.getByTestId('code-editor')).toBeVisible()
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

test('window close flushes the latest workspace edit before restart', async ({ userDataDir }) => {
  const code = 'close_marker = "flush-before-exit"\nprint(close_marker)'
  const firstApplication = await launchApplication(userDataDir)
  try {
    const firstPage = await firstReadyWindow(firstApplication, userDataDir)
    await openWorkspace(firstPage)
    await replaceEditor(firstPage, code)
    await firstApplication.close()
  } finally {
    await firstApplication.close().catch(() => undefined)
  }

  const secondApplication = await launchApplication(userDataDir)
  try {
    const secondPage = await firstReadyWindow(secondApplication, userDataDir)
    await openWorkspace(secondPage)
    await expect.poll(() => readEditor(secondPage)).toBe(code)
  } finally {
    await secondApplication.close()
  }
})

test('workspace recovery log survives an abnormal renderer exit', async ({ userDataDir }) => {
  const code = 'crash_marker = "workspace-recovery-log"\nprint(crash_marker)'
  const firstApplication = await launchApplication(userDataDir)
  try {
    const firstPage = await firstReadyWindow(firstApplication, userDataDir)
    await openWorkspace(firstPage)
    await replaceEditor(firstPage, code)
    await forceExit(firstApplication)
  } finally {
    await firstApplication.close().catch(() => undefined)
  }

  const secondApplication = await launchApplication(userDataDir)
  try {
    const secondPage = await firstReadyWindow(secondApplication, userDataDir)
    await openWorkspace(secondPage)
    await expect.poll(() => readEditor(secondPage)).toBe(code)
  } finally {
    await secondApplication.close()
  }
})

test('practice recovery log survives an abnormal renderer exit', async ({ userDataDir }) => {
  const code = 'def add(a, b):\n    return a + b  # crash-recovery-log'
  const firstApplication = await launchApplication(userDataDir)
  try {
    const firstPage = await firstReadyWindow(firstApplication, userDataDir)
    await firstPage.getByTestId('nav-practice').click()
    await firstPage.getByRole('button', { name: /实现 add 函数/ }).click()
    await expect(firstPage.getByRole('heading', { name: '实现 add 函数' })).toBeVisible()
    await replaceEditor(firstPage, code)
    await forceExit(firstApplication)
  } finally {
    await firstApplication.close().catch(() => undefined)
  }

  const secondApplication = await launchApplication(userDataDir)
  try {
    const secondPage = await firstReadyWindow(secondApplication, userDataDir)
    await secondPage.getByTestId('nav-practice').click()
    await expect(secondPage.getByRole('heading', { name: '实现 add 函数' })).toBeVisible()
    await expect.poll(() => readEditor(secondPage)).toBe(code)
  } finally {
    await secondApplication.close()
  }
})
