import { useState, useEffect, useCallback } from 'react'
import {
  KnowledgeDoc,
  ResourcePackImportResult,
  SearchResult,
  getDocuments,
  importResourcePack,
  searchDocuments,
  uploadDocument,
  deleteDocument,
} from '../services/knowledgeService'

export interface UseKnowledgeDataReturn {
  documents: KnowledgeDoc[]
  searchResults: SearchResult[]
  loading: boolean
  uploading: boolean
  importingResourcePack: boolean
  error: string | null
  lastResourcePackImport: ResourcePackImportResult | null
  loadDocuments: () => Promise<void>
  search: (query: string) => Promise<void>
  upload: () => Promise<void>
  importPack: (rootPath?: string) => Promise<ResourcePackImportResult | null>
  deleteDocument: (id: number) => Promise<void>
}

export function useKnowledgeData(): UseKnowledgeDataReturn {
  const [documents, setDocuments] = useState<KnowledgeDoc[]>([])
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [importingResourcePack, setImportingResourcePack] = useState(false)
  const [lastResourcePackImport, setLastResourcePackImport] =
    useState<ResourcePackImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadDocuments = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const docs = await getDocuments()
      setDocuments(docs)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载文档列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const results = await searchDocuments(query)
      setSearchResults(results)
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const upload = useCallback(async () => {
    setUploading(true)
    setError(null)
    try {
      await uploadDocument()
      await loadDocuments()
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploading(false)
    }
  }, [loadDocuments])

  const importPack = useCallback(
    async (rootPath?: string) => {
      setImportingResourcePack(true)
      setError(null)
      try {
        const result = await importResourcePack(rootPath)
        setLastResourcePackImport(result)
        if (result) await loadDocuments()
        return result
      } catch (err) {
        setError(err instanceof Error ? err.message : '资源包导入失败')
        return null
      } finally {
        setImportingResourcePack(false)
      }
    },
    [loadDocuments],
  )

  const handleDelete = useCallback(
    async (id: number) => {
      setLoading(true)
      setError(null)
      try {
        await deleteDocument(id)
        await loadDocuments()
      } catch (err) {
        setError(err instanceof Error ? err.message : '删除失败')
      } finally {
        setLoading(false)
      }
    },
    [loadDocuments],
  )

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  return {
    documents,
    searchResults,
    loading,
    uploading,
    importingResourcePack,
    error,
    lastResourcePackImport,
    loadDocuments,
    search,
    upload,
    importPack,
    deleteDocument: handleDelete,
  }
}
