import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  PACKAGED_SMOKE_ENV,
  PACKAGED_SMOKE_PACK_ROOT_ENV,
  PACKAGED_SMOKE_PHASE_ENV,
  PACKAGED_SMOKE_RESULT_ENV,
  collectPackagedResourceChecks,
  resolvePackagedSmokeRequest,
  resolvePackagedSmokeUserDataPath,
} from '../electron/utils/packagedSmoke'
import { E2E_USER_DATA_ENV } from '../electron/utils/testUserData'

const tempRoot = resolve('temporary', 'codehelper-smoke-tests')

describe('packaged smoke request', () => {
  it('is disabled unless the explicit smoke flag is present', () => {
    expect(resolvePackagedSmokeRequest(true, {}, tempRoot)).toBeNull()
  })

  it('accepts an exercise request restricted to the temporary directory', () => {
    expect(
      resolvePackagedSmokeRequest(
        true,
        {
          [PACKAGED_SMOKE_ENV]: '1',
          [PACKAGED_SMOKE_PHASE_ENV]: 'exercise',
          [PACKAGED_SMOKE_RESULT_ENV]: resolve(
            tempRoot,
            'run',
            'codehelper-package-smoke-exercise.json',
          ),
          [PACKAGED_SMOKE_PACK_ROOT_ENV]: resolve(tempRoot, 'run', 'resource-pack'),
          [E2E_USER_DATA_ENV]: resolve(tempRoot, 'run', 'user-data'),
        },
        tempRoot,
      ),
    ).toEqual({
      phase: 'exercise',
      resultPath: resolve(tempRoot, 'run', 'codehelper-package-smoke-exercise.json'),
      userDataPath: resolve(tempRoot, 'run', 'user-data'),
      packRoot: resolve(tempRoot, 'run', 'resource-pack'),
    })
  })

  it('rejects non-packaged use and paths outside the temporary directory', () => {
    const environment = {
      [PACKAGED_SMOKE_ENV]: '1',
      [PACKAGED_SMOKE_PHASE_ENV]: 'verify',
      [PACKAGED_SMOKE_RESULT_ENV]: resolve(tempRoot, 'codehelper-package-smoke-verify.json'),
      [E2E_USER_DATA_ENV]: resolve(tempRoot, 'user-data'),
    }
    expect(() => resolvePackagedSmokeRequest(false, environment, tempRoot)).toThrow(
      'only in a packaged build',
    )
    expect(() =>
      resolvePackagedSmokeRequest(
        true,
        {
          ...environment,
          [PACKAGED_SMOKE_RESULT_ENV]: resolve(
            tempRoot,
            '..',
            'outside',
            'codehelper-package-smoke-verify.json',
          ),
        },
        tempRoot,
      ),
    ).toThrow('system temporary directory')
  })

  it('requires packaged smoke userData to be explicitly isolated under the temporary directory', () => {
    expect(() =>
      resolvePackagedSmokeUserDataPath(true, { [PACKAGED_SMOKE_ENV]: '1' }, tempRoot),
    ).toThrow(E2E_USER_DATA_ENV)
    expect(() =>
      resolvePackagedSmokeUserDataPath(
        true,
        {
          [PACKAGED_SMOKE_ENV]: '1',
          [E2E_USER_DATA_ENV]: resolve(tempRoot, '..', 'real-profile'),
        },
        tempRoot,
      ),
    ).toThrow('system temporary directory')
  })

  it('records packaged runtime resources and the native host hash before portable extraction exits', () => {
    const root = mkdtempSync(join(tmpdir(), 'codehelper-packaged-resource-test-'))
    const resourcesPath = join(root, 'resources')
    const appPath = join(resourcesPath, 'app.asar')
    const jobHostPath = join(resourcesPath, 'bin', 'win32-x64', 'codehelper-job-host.exe')
    try {
      mkdirSync(join(resourcesPath, 'db'), { recursive: true })
      mkdirSync(join(resourcesPath, 'content', 'metadata'), { recursive: true })
      mkdirSync(join(resourcesPath, 'bin', 'win32-x64'), { recursive: true })
      writeFileSync(appPath, 'asar')
      writeFileSync(jobHostPath, 'job-host')
      writeFileSync(join(resourcesPath, 'db', 'schema.sql'), 'CREATE TABLE smoke(id INTEGER);')
      writeFileSync(join(resourcesPath, 'content', 'metadata', 'course_map.json'), '{}')

      expect(collectPackagedResourceChecks(appPath, resourcesPath)).toEqual({
        appPathIsAsar: true,
        appAsarPresent: true,
        jobHostPresent: true,
        jobHostSha256: '0b736e20759e8c1a0566d359649f1792b631d96da2f773203e94549cfae01d9e',
        databaseSchemaPresent: true,
        courseMetadataPresent: true,
        allRequiredPresent: true,
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
