import { existsSync } from 'fs'
import { join } from 'path'

export function resolveUtilityEntryPath(
  moduleDirectory: string,
  filename: string,
  pathExists: (path: string) => boolean = existsSync,
): string {
  const candidates = [join(moduleDirectory, filename), join(moduleDirectory, '..', filename)]
  return candidates.find((candidate) => pathExists(candidate)) ?? candidates[0]
}
