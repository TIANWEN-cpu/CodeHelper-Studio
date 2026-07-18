import { expect, test, _electron as electron } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { SystemCapabilityStatus } from '../../src/shared/capabilityStatusContract'
import type {
  DatabaseBackupCreateResult,
  DatabaseBackupListResult,
} from '../../src/shared/maintenanceContract'

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

test('data protection and capability status use verified Electron runtime evidence', async () => {
  test.setTimeout(90_000)
  const userDataDir = await mkdtemp(join(tmpdir(), 'codehelper-maintenance-e2e-'))
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

    const capability = await page.evaluate(() =>
      window.api.invoke<SystemCapabilityStatus>('system-capabilities-get', { force: true }),
    )
    expect(capability.database).toMatchObject({
      quickCheck: 'ok',
      applicationSchemaVersion: 2,
    })
    expect(capability.runtime).toMatchObject({
      isPackaged: false,
      inAppUpdaterAvailable: false,
      updateMetadataAvailable: true,
    })
    expect(capability.ai.connectivity).toBe('not-checked')

    const created = await page.evaluate(() =>
      window.api.invoke<DatabaseBackupCreateResult>('database-backup-create'),
    )
    expect(created.success).toBe(true)
    expect(created.backup).toMatchObject({
      kind: 'manual',
      integrity: 'ok',
      quickCheck: ['ok'],
      applicationSchemaVersion: 2,
    })

    const backup = created.backup!
    const backupBytes = await readFile(backup.filePath)
    expect((await stat(backup.filePath)).size).toBe(backup.sizeBytes)
    expect(createHash('sha256').update(backupBytes).digest('hex')).toBe(backup.sha256)
    const manifest = JSON.parse(await readFile(backup.manifestPath, 'utf8'))
    expect(manifest).toMatchObject({
      id: backup.id,
      kind: 'manual',
      sha256: backup.sha256,
      integrity: 'ok',
    })

    const listed = await page.evaluate(() =>
      window.api.invoke<DatabaseBackupListResult>('database-backups-list'),
    )
    expect(listed.warnings).toEqual([])
    expect(listed.backups.map((item) => item.id)).toContain(backup.id)

    await page.getByTestId('nav-settings').click()
    await page.getByRole('button', { name: '数据' }).click()
    await expect(page.getByTestId('data-protection-settings')).toContainText('完整数据库备份')
    await expect(page.getByTestId('database-backup-record').first()).toContainText('手动完整备份')

    await page.getByRole('button', { name: '能力' }).click()
    await expect(page.getByTestId('capability-status-settings')).toBeVisible()
    await expect(page.getByTestId('capability-database')).toContainText('quick_check: ok')
    await expect(page.getByTestId('capability-runtime')).toContainText('仅生成更新元数据')
    await expect(page.getByTestId('capability-ai')).toContainText('未执行连通性检查')
  } finally {
    await closeApplication(application)
    await rm(userDataDir, { recursive: true, force: true })
  }
})
