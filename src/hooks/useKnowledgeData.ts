import { useState, useEffect, useCallback } from 'react'
import {
  KnowledgeDoc,
  SearchResult,
  getDocuments,
  searchDocuments,
  uploadDocument,
  deleteDocument,
} from '../services/knowledgeService'

export interface UseKnowledgeDataReturn {
  documents: KnowledgeDoc[]
  searchResults: SearchResult[]
  loading: boolean
  uploading: boolean
  error: string | null
  loadDocuments: () => Promise<void>
  search: (query: string) => Promise<void>
  upload: () => Promise<void>
  deleteDocument: (id: number) => Promise<void>
}

export function useKnowledgeData(): UseKnowledgeDataReturn {
  const [documents, setDocuments] = useState<KnowledgeDoc[]>([])
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
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
    error,
    loadDocuments,
    search,
    upload,
    deleteDocument: handleDelete,
  }
}
