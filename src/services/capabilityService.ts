import { invoke } from './ipc'
import type {
  SystemCapabilityRequest,
  SystemCapabilityStatus,
} from '../shared/capabilityStatusContract'

export function getSystemCapabilities(force = false): Promise<SystemCapabilityStatus> {
  const request: SystemCapabilityRequest = { force }
  return invoke<SystemCapabilityStatus>('system-capabilities-get', request)
}
