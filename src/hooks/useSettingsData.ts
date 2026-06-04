import { useState, useEffect, useCallback, useRef } from 'react'
import {
  AIConfig,
  PlatformInfo,
  getSetting as svcGetSetting,
  setSetting as svcSetSetting,
  getAIConfigs as svcGetAIConfigs,
  saveAIConfig as svcSaveAIConfig,
  deleteAIConfig as svcDeleteAIConfig,
  fetchModels as svcFetchModels,
  getPlatformInfo as svcGetPlatformInfo,
  exportData as svcExportData,
  importData as svcImportData,
} from '../services/settingsService'

// ---- Types ----

export interface UseSettingsDataReturn {
  // State
  aiConfigs: AIConfig[]
  platformInfo: PlatformInfo | null
  loading: boolean
  error: string | null

  // Settings (key-value)
  getSetting: (key: string) => Promise<string | null>
  setSetting: (key: string, value: string) => Promise<void>

  // AI configs
  loadAIConfigs: () => Promise<void>
  saveAIConfig: (config: AIConfig) => Promise<void>
  deleteAIConfig: (id: number) => Promise<void>

  // Models
  fetchModels: (baseUrl: string, apiKey: string) => Promise<string[]>

  // Platform
  loadPlatformInfo: () => Promise<void>

  // Data
  exportData: () => Promise<void>
  importData: () => Promise<void>

  // Refresh
  refresh: () => Promise<void>
}

// ---- Hook ----

export function useSettingsData(): UseSettingsDataReturn {
  const [aiConfigs, setAiConfigs] = useState<AIConfig[]>([])
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  // ---- Settings (key-value) ----

  const getSetting = useCallback(async (key: string): Promise<string | null> => {
    try {
      return await svcGetSetting(key)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (mountedRef.current) setError(message)
      return null
    }
  }, [])

  const setSetting = useCallback(async (key: string, value: string): Promise<void> => {
    try {
      await svcSetSetting(key, value)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (mountedRef.current) setError(message)
      throw e
    }
  }, [])

  // ---- AI configs ----

  const loadAIConfigs = useCallback(async () => {
    try {
      const configs = await svcGetAIConfigs()
      if (mountedRef.current) {
        setAiConfigs(configs)
      }
    } catch (e) {
      if (mountedRef.current) {
        const message = e instanceof Error ? e.message : String(e)
        setError(message || '加载 AI 配置失败')
      }
    }
  }, [])

  const saveAIConfig = useCallback(
    async (config: AIConfig) => {
      try {
        setError(null)
        await svcSaveAIConfig(config)
        await loadAIConfigs()
      } catch (e) {
        if (mountedRef.current) {
          const message = e instanceof Error ? e.message : String(e)
          setError(message || '保存 AI 配置失败')
        }
        throw e
      }
    },
    [loadAIConfigs],
  )

  const handleDeleteAIConfig = useCallback(
    async (id: number) => {
      try {
        setError(null)
        await svcDeleteAIConfig(id)
        await loadAIConfigs()
      } catch (e) {
        if (mountedRef.current) {
          const message = e instanceof Error ? e.message : String(e)
          setError(message || '删除 AI 配置失败')
        }
        throw e
      }
    },
    [loadAIConfigs],
  )

  // ---- Models ----

  const fetchModels = useCallback(async (baseUrl: string, apiKey: string): Promise<string[]> => {
    try {
      return await svcFetchModels(baseUrl, apiKey)
    } catch (e) {
      if (mountedRef.current) {
        const message = e instanceof Error ? e.message : String(e)
        setError(message || '获取模型列表失败')
      }
      throw e
    }
  }, [])

  // ---- Platform info ----

  const loadPlatformInfo = useCallback(async () => {
    try {
      const info = await svcGetPlatformInfo()
      if (mountedRef.current) {
        setPlatformInfo(info)
      }
    } catch (e) {
      if (mountedRef.current) {
        const message = e instanceof Error ? e.message : String(e)
        setError(message || '获取平台信息失败')
      }
    }
  }, [])

  // ---- Data import/export ----

  const exportData = useCallback(async () => {
    try {
      setError(null)
      await svcExportData()
    } catch (e) {
      if (mountedRef.current) {
        const message = e instanceof Error ? e.message : String(e)
        setError(message || '导出数据失败')
      }
      throw e
    }
  }, [])

  const importData = useCallback(async () => {
    try {
      setError(null)
      await svcImportData()
    } catch (e) {
      if (mountedRef.current) {
        const message = e instanceof Error ? e.message : String(e)
        setError(message || '导入数据失败')
      }
      throw e
    }
  }, [])

  // ---- Bulk refresh ----

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      await Promise.all([loadAIConfigs(), loadPlatformInfo()])
    } catch (e) {
      if (mountedRef.current) {
        const message = e instanceof Error ? e.message : String(e)
        setError(message || '刷新设置数据失败')
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [loadAIConfigs, loadPlatformInfo])

  // ---- Initial load ----

  useEffect(() => {
    mountedRef.current = true
    refresh()
    return () => {
      mountedRef.current = false
    }
  }, [refresh])

  return {
    // State
    aiConfigs,
    platformInfo,
    loading,
    error,

    // Settings
    getSetting,
    setSetting,

    // AI configs
    loadAIConfigs,
    saveAIConfig,
    deleteAIConfig: handleDeleteAIConfig,

    // Models
    fetchModels,

    // Platform
    loadPlatformInfo,

    // Data
    exportData,
    importData,

    // Refresh
    refresh,
  }
}
