import { useCallback, useEffect, useRef, useState } from 'react'
import { getSystemCapabilities } from '../services/capabilityService'
import type { SystemCapabilityStatus } from '../shared/capabilityStatusContract'

export interface UseCapabilityStatusResult {
  status: SystemCapabilityStatus | null
  loading: boolean
  error: string | null
  refresh: (force?: boolean) => Promise<void>
}

export function useCapabilityStatus(): UseCapabilityStatusResult {
  const [status, setStatus] = useState<SystemCapabilityStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const requestIdRef = useRef(0)

  const refresh = useCallback(async (force = true) => {
    const requestId = ++requestIdRef.current
    if (mountedRef.current) {
      setLoading(true)
      setError(null)
    }
    try {
      const next = await getSystemCapabilities(force)
      if (mountedRef.current && requestId === requestIdRef.current) setStatus(next)
    } catch (error) {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setError(error instanceof Error ? error.message : String(error))
      }
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void refresh(false)
    return () => {
      mountedRef.current = false
      requestIdRef.current += 1
    }
  }, [refresh])

  return { status, loading, error, refresh }
}
