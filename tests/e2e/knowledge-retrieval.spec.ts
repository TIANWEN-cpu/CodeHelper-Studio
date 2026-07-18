import { expect, test, _electron as electron } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import initSqlJs from 'sql.js'
import type { KnowledgeSearchResponse } from '../../src/shared/knowledgeRetrievalContract'

const appRoot = resolve(__dirname, '../..')

async function closeApplication(application: ElectronApplication): Promise<void> {
  try {
    await application.close()
  } catch {
    try {
      application.process().kill('SIGKILL')
    } catch {
      // The application may already be closed.
    }
  }
}

async function seedPreFtsKnowledgeDatabase(userDataDir: string): Promise<void> {
  const SQL = await initSqlJs()
  const database = new SQL.Database()
  database.run(await readFile(join(appRoot, 'electron', 'db', 'schema.sql'), 'utf8'))
  database.run(
    `INSERT INTO knowledge_docs (id, filename, file_type, content, chunk_count)
     VALUES (1, 'legacy/graph-search.md', 'md', '# Graph search', 1)`,
  )
  database.run(
    `INSERT INTO knowledge_chunks (id, doc_id, content, chunk_index)
     VALUES (1, 1, 'Breadth first search uses a queue. 广度优先遍历按层访问节点。', 0)`,
  )
  await writeFile(join(userDataDir, 'codehelper.db'), Buffer.from(database.export()))
  database.close()
}

test('hybrid knowledge retrieval returns auditable sources in IPC and UI', async () => {
  test.setTimeout(60_000)
  const userDataDir = await mkdtemp(join(tmpdir(), 'codehelper-knowledge-e2e-'))
  const packRoot = await mkdtemp(join(tmpdir(), 'codehelper-knowledge-pack-'))
  const knowledgeDir = join(packRoot, 'knowledge-docs', 'algorithms')
  await mkdir(knowledgeDir, { recursive: true })
  const longBody = Array.from(
    { length: 48 },
    (_, index) => `第 ${index + 1} 段用于验证长文滚动进度与标题定位。`,
  ).join('\n\n')
  const markdown = `---
title: "二分查找与边界"
source_repo: "phase4-e2e"
source_path: "algorithms/binary-search.md"
source_url: "https://example.com/binary-search"
category: "算法"
tags:
  - search
  - binary-search
---

# 二分查找与边界

Binary search locates a target in a sorted array by repeatedly halving the interval.
二分查找要求有序数组，并需要谨慎处理 left、right 和 mid 的边界。

[跳到深层标题](#API%20(v2)%3A%20深层%20标题!)

${longBody}

#### API (v2): 深层 标题!

深层标题正文。

##### 第五级标题

第五级正文。

###### 第六级标题

第六级正文。
`
  await writeFile(join(knowledgeDir, 'binary-search.md'), markdown.replace(/\n/g, '\r\n'), 'utf8')

  const application = await electron.launch({
    args: [appRoot],
    env: {
      ...process.env,
      CODEHELPER_E2E_USER_DATA: userDataDir,
      CODEHELPER_E2E_HEADLESS: '1',
    },
  })

  try {
    const page = await application.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('nav-home')).toBeVisible({ timeout: 30_000 })

    const imported = await page.evaluate(
      async (rootPath) => window.api.invoke('resource-pack-import', { rootPath }),
      packRoot,
    )
    expect(imported).toMatchObject({ knowledge: { imported: 1 } })

    const response = await page.evaluate(
      async (query) => window.api.invoke<KnowledgeSearchResponse>('knowledge-search', query),
      'binary search sorted array',
    )
    expect(response.retrieval).toMatchObject({
      available: true,
      degraded: false,
      mode: 'hybrid',
      lexicalBackend: 'fts5-bm25',
      semanticBackend: 'fts5-trigram-local-ngram',
    })
    expect(response.results[0]).toMatchObject({
      filename: 'algorithms/binary-search.md',
      channels: expect.arrayContaining(['keyword', 'semantic']),
    })

    await page.getByTestId('nav-knowledge').click()
    const search = page.getByPlaceholder('搜索标题、正文片段、来源仓库...')
    await expect(search).toBeVisible()
    await search.fill('二分搜索 有序数组')

    await expect(page.getByTestId('knowledge-retrieval-status')).toContainText('本地混合检索')
    await expect(page.getByTestId('knowledge-retrieval-status')).toContainText('可检索片段')
    const resultCard = page.locator('button').filter({ hasText: '二分查找与边界' }).first()
    await expect(resultCard).toBeVisible()
    await expect(resultCard.getByText('phase4-e2e', { exact: true })).toBeVisible()
    await expect(resultCard.getByText(/algorithms\/binary-search\.md · 片段 #1/)).toBeVisible()
    await expect(resultCard.getByText('语义近似', { exact: true })).toBeVisible()

    await resultCard.click()
    const renderedDocument = page.locator('article .knowledge-markdown')
    await expect(renderedDocument).toBeVisible()
    await expect(renderedDocument.locator('h2')).toHaveText('二分查找与边界')
    await expect(renderedDocument).toContainText('Binary search locates a target')
    await expect(renderedDocument.locator('h5#api-v2-深层-标题')).toHaveText('API (v2): 深层 标题!')
    await expect(renderedDocument.locator('h6')).toHaveCount(2)

    await renderedDocument.getByRole('link', { name: '跳到深层标题' }).click()
    await expect
      .poll(() =>
        page
          .getByTestId('knowledge-reader-scroll')
          .evaluate((element) => (element as HTMLElement).scrollTop),
      )
      .toBeGreaterThan(0)
  } finally {
    await closeApplication(application)
    await rm(userDataDir, { recursive: true, force: true })
    await rm(packRoot, { recursive: true, force: true })
  }
})

test('knowledge retrieval migration rebuilds FTS indexes for existing chunks', async () => {
  test.setTimeout(60_000)
  const userDataDir = await mkdtemp(join(tmpdir(), 'codehelper-knowledge-migration-e2e-'))
  await seedPreFtsKnowledgeDatabase(userDataDir)
  const application = await electron.launch({
    args: [appRoot],
    env: {
      ...process.env,
      CODEHELPER_E2E_USER_DATA: userDataDir,
      CODEHELPER_E2E_HEADLESS: '1',
    },
  })

  try {
    const page = await application.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('nav-home')).toBeVisible({ timeout: 30_000 })
    const response = await page.evaluate(
      async (query) => window.api.invoke<KnowledgeSearchResponse>('knowledge-search', query),
      'BFS queue',
    )
    expect(response.retrieval).toMatchObject({ mode: 'hybrid', degraded: false })
    expect(response.results[0]).toMatchObject({
      filename: 'legacy/graph-search.md',
      channels: expect.arrayContaining(['keyword', 'semantic']),
    })
  } finally {
    await closeApplication(application)
    await rm(userDataDir, { recursive: true, force: true })
  }
})

test('Windows course markdown renders block elements instead of raw syntax', async () => {
  test.setTimeout(60_000)
  const userDataDir = await mkdtemp(join(tmpdir(), 'codehelper-course-render-e2e-'))
  const application = await electron.launch({
    args: [appRoot],
    env: {
      ...process.env,
      CODEHELPER_E2E_USER_DATA: userDataDir,
      CODEHELPER_E2E_HEADLESS: '1',
    },
  })

  try {
    const page = await application.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('nav-learn')).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('nav-learn').click()

    const renderedLesson = page.locator('.learn-markdown')
    await expect(renderedLesson).toBeVisible()
    await expect(renderedLesson.locator('h2').first()).toHaveText('C++ 学习地图与环境准备')
    await expect(renderedLesson.locator('h3').first()).toHaveText('课程概述')
    await expect(renderedLesson.locator('pre code').first()).toContainText('#include <iostream>')
    await expect(renderedLesson.locator('p').filter({ hasText: /^#/ })).toHaveCount(0)
  } finally {
    await closeApplication(application)
    await rm(userDataDir, { recursive: true, force: true })
  }
})
