import { mkdtemp, mkdir, rm, symlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  measureRunDirectoryBytes,
  startRunDirectoryQuotaMonitor,
  type RunDirectoryQuotaViolation,
} from '../electron/utils/runDirectoryQuota'

const temporaryDirectories: string[] = []

async function createTemporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('run directory quota', () => {
  it('counts regular files recursively and stops once the byte limit is exceeded', async () => {
    const directory = await createTemporaryDirectory('codehelper-quota-')
    const nested = join(directory, 'nested')
    await mkdir(nested)
    await writeFile(join(directory, 'one.bin'), Buffer.alloc(7))
    await writeFile(join(nested, 'two.bin'), Buffer.alloc(11))

    await expect(measureRunDirectoryBytes(directory)).resolves.toBe(18)
    await expect(measureRunDirectoryBytes(directory, 6)).resolves.toBeGreaterThan(6)
  })

  it('does not follow a directory symlink or Windows junction outside the run root', async () => {
    const directory = await createTemporaryDirectory('codehelper-quota-root-')
    const outside = await createTemporaryDirectory('codehelper-quota-outside-')
    await writeFile(join(directory, 'local.bin'), Buffer.alloc(3))
    await writeFile(join(outside, 'outside.bin'), Buffer.alloc(2_048))
    await symlink(
      outside,
      join(directory, 'outside-link'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )

    await expect(measureRunDirectoryBytes(directory)).resolves.toBe(3)
  })

  it('reports a size violation exactly once and stops future scans', async () => {
    const directory = await createTemporaryDirectory('codehelper-quota-monitor-')
    await writeFile(join(directory, 'large.bin'), Buffer.alloc(12))
    const violations: RunDirectoryQuotaViolation[] = []
    const monitor = startRunDirectoryQuotaMonitor({
      directory,
      maxBytes: 10,
      intervalMs: 60_000,
      onViolation: (violation) => violations.push(violation),
    })

    await monitor.checkNow()
    await monitor.checkNow()

    expect(violations).toEqual([{ kind: 'size', actualBytes: 12 }])
  })

  it('fails closed when the run directory cannot be scanned', async () => {
    const directory = await createTemporaryDirectory('codehelper-quota-error-')
    const notDirectory = join(directory, 'plain-file')
    await writeFile(notDirectory, 'content')
    const violations: RunDirectoryQuotaViolation[] = []
    const monitor = startRunDirectoryQuotaMonitor({
      directory: notDirectory,
      maxBytes: 10,
      intervalMs: 60_000,
      onViolation: (violation) => violations.push(violation),
    })

    await monitor.checkNow()

    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({ kind: 'scan-error' })
  })
})
