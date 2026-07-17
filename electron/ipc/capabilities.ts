import { ipcMain } from 'electron'
import { getRuntimeCapabilities } from '../utils/runtimeCapabilities'
import type {
  SystemCapabilityRequest,
  SystemCapabilityStatus,
} from '../../src/shared/capabilityStatusContract'

type CapabilityGetter = (request?: SystemCapabilityRequest) => Promise<SystemCapabilityStatus>

export interface CapabilityIpcOptions {
  now?: () => number
  forceCooldownMs?: number
}

function validateRequest(value: unknown): SystemCapabilityRequest {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('参数无效')
  }
  const request = value as { force?: unknown }
  if (request.force !== undefined && typeof request.force !== 'boolean') {
    throw new Error('参数无效: force')
  }
  return { force: request.force === true }
}

export function registerCapabilitiesIPC(
  getCapabilities: CapabilityGetter = getRuntimeCapabilities,
  options: CapabilityIpcOptions = {},
): void {
  const now = options.now ?? Date.now
  const forceCooldownMs = options.forceCooldownMs ?? 5_000
  let lastForcedAt: number | null = null
  let inFlight: { force: boolean; promise: Promise<SystemCapabilityStatus> } | null = null

  const run = (request: SystemCapabilityRequest): Promise<SystemCapabilityStatus> => {
    const force = request.force === true
    if (inFlight) {
      if (!force || inFlight.force) return inFlight.promise
      return inFlight.promise.then(() => run(request))
    }
    if (force && lastForcedAt !== null && now() - lastForcedAt < forceCooldownMs) {
      throw new Error('System capability refresh is temporarily rate limited')
    }
    if (force) lastForcedAt = now()
    const promise = Promise.resolve(getCapabilities(request)).finally(() => {
      if (inFlight?.promise === promise) inFlight = null
    })
    inFlight = { force, promise }
    return promise
  }

  ipcMain.handle('system-capabilities-get', async (_event, value?: unknown) =>
    run(validateRequest(value)),
  )
}
