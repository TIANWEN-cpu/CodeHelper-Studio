import { useState, useEffect, useCallback, useRef } from 'react'
import {
  KnowledgeDoc,
  KnowledgeDocDetail,
  KnowledgeLinkAuditRecord,
  ResourcePackImportResult,
  SearchResult,
  getRetrievalStatus,
  getDocument,
  getDocumentLinkAudit,
  getDocuments,
  importResourcePack,
  searchDocuments,
  uploadDocument,
  deleteDocument,
} from '../services/knowledgeService'
import type { KnowledgeRetrievalStatus } from '../shared/knowledgeRetrievalContract'

export interface UseKnowledgeDataReturn {
  documents: KnowledgeDoc[]
  selectedDocument: KnowledgeDocDetail | null
  loadingDocument: boolean
  documentError: string | null
  documentLinkAudit: KnowledgeLinkAuditRecord[]
  searchResults: SearchResult[]
  retrievalStatus: KnowledgeRetrievalStatus | null
  loadingRetrievalStatus: boolean
  loading: boolean
  uploading: boolean
  importingResourcePack: boolean
  error: string | null
  lastResourcePackImport: ResourcePackImportResult | null
  loadDocuments: () => Promise<void>
  loadRetrievalStatus: () => Promise<void>
  loadDocument: (id: number) => Promise<KnowledgeDocDetail | null>
  search: (query: string) => Promise<void>
  upload: () => Promise<void>
  importPack: (rootPath?: string) => Promise<ResourcePackImportResult | null>
  deleteDocument: (id: number) => Promise<void>
}

export function useKnowledgeData(): UseKnowledgeDataReturn {
  const [documents, setDocuments] = useState<KnowledgeDoc[]>([])
  const [selectedDocument, setSelectedDocument] = useState<KnowledgeDocDetail | null>(null)
  const [loadingDocument, setLoadingDocument] = useState(false)
  const [documentError, setDocumentError] = useState<string | null>(null)
  const [documentLinkAudit, setDocumentLinkAudit] = useState<KnowledgeLinkAuditRecord[]>([])
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [retrievalStatus, setRetrievalStatus] = useState<KnowledgeRetrievalStatus | null>(null)
  const [loadingRetrievalStatus, setLoadingRetrievalStatus] = useState(false)
  const [loadingDocuments, setLoadingDocuments] = useState(false)
  const [searching, setSearching] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [importingResourcePack, setImportingResourcePack] = useState(false)
  const [lastResourcePackImport, setLastResourcePackImport] =
    useState<ResourcePackImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const detailRequestId = useRef(0)
  const searchRequestId = useRef(0)
  const loading = loadingDocuments || searching || deleting

  const loadDocuments = useCallback(async () => {
    setLoadingDocuments(true)
    setError(null)
    try {
      const docs = await getDocuments()
      setDocuments(docs)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载文档列表失败')
    } finally {
      setLoadingDocuments(false)
    }
  }, [])

  const search = useCallback(async (query: string) => {
    const requestId = ++searchRequestId.current
    if (!query.trim()) {
      setSearchResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    setError(null)
    try {
      const response = await searchDocuments(query)
      if (searchRequestId.current === requestId) {
        setSearchResults(response.results)
        setRetrievalStatus(response.retrieval)
      }
    } catch (err) {
      if (searchRequestId.current !== requestId) return
      setError(err instanceof Error ? err.message : '搜索失败')
    } finally {
      if (searchRequestId.current === requestId) setSearching(false)
    }
  }, [])

  const loadRetrievalStatus = useCallback(async () => {
    setLoadingRetrievalStatus(true)
    try {
      setRetrievalStatus(await getRetrievalStatus())
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载检索能力状态失败')
    } finally {
      setLoadingRetrievalStatus(false)
    }
  }, [])

  const loadDocument = useCallback(async (id: number) => {
    const requestId = detailRequestId.current + 1
    detailRequestId.current = requestId
    setLoadingDocument(true)
    setSelectedDocument(null)
    setDocumentLinkAudit([])
    setDocumentError(null)
    setError(null)
    try {
      const [doc, linkAudit] = await Promise.all([
        getDocument(id),
        getDocumentLinkAudit(id).catch(() => []),
      ])
      if (!doc) throw new Error('文档不存在，可能已在知识库清理中移除。')
      if (detailRequestId.current === requestId) {
        setSelectedDocument(doc)
        setDocumentLinkAudit(linkAudit)
      }
      return doc
    } catch (err) {
      if (detailRequestId.current === requestId) {
        setDocumentError(err instanceof Error ? err.message : '加载文档详情失败')
      }
      return null
    } finally {
      if (detailRequestId.current === requestId) setLoadingDocument(false)
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
      setDeleting(true)
      setError(null)
      try {
        await deleteDocument(id)
        setSelectedDocument((current) => (current?.id === id ? null : current))
        await loadDocuments()
      } catch (err) {
        setError(err instanceof Error ? err.message : '删除失败')
      } finally {
        setDeleting(false)
      }
    },
    [loadDocuments],
  )

  useEffect(() => {
    void loadDocuments()
    void loadRetrievalStatus()
  }, [loadDocuments, loadRetrievalStatus])

  return {
    documents,
    selectedDocument,
    loadingDocument,
    documentError,
    documentLinkAudit,
    searchResults,
    retrievalStatus,
    loadingRetrievalStatus,
    loading,
    uploading,
    importingResourcePack,
    error,
    lastResourcePackImport,
    loadDocuments,
    loadRetrievalStatus,
    loadDocument,
    search,
    upload,
    importPack,
    deleteDocument: handleDelete,
  }
}
