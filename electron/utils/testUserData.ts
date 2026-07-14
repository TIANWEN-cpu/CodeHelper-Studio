import { mkdirSync } from 'fs'
import { isAbsolute, parse, resolve } from 'path'

export const E2E_USER_DATA_ENV = 'CODEHELPER_E2E_USER_DATA'

interface UserDataApp {
  setPath(name: 'userData', path: string): void
}

/** Redirects Electron persistence before app readiness so E2E never touches real user data. */
export function configureTestUserData(
  targetApp: UserDataApp,
  environment: NodeJS.ProcessEnv = process.env,
): string | null {
  const configuredPath = environment[E2E_USER_DATA_ENV]?.trim()
  if (!configuredPath) return null
  if (!isAbsolute(configuredPath)) {
    throw new Error(`${E2E_USER_DATA_ENV} must be an absolute path`)
  }

  const userDataPath = resolve(configuredPath)
  if (parse(userDataPath).root === userDataPath) {
    throw new Error(`${E2E_USER_DATA_ENV} must not point to a filesystem root`)
  }

  mkdirSync(userDataPath, { recursive: true })
  targetApp.setPath('userData', userDataPath)
  return userDataPath
}
