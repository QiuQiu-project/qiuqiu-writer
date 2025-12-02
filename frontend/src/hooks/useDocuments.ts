import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../utils/api';
import type { Document } from '../utils/api';

const DEFAULT_USER_ID = 'wawawriter_user_1';

export function useDocuments(userId: string = DEFAULT_USER_ID) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const docs = await apiClient.listDocuments(userId);
      setDocuments(docs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
      console.error('Error loading documents:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const createDocument = useCallback(async (title?: string, content?: string) => {
    setLoading(true);
    setError(null);
    try {
      const newDoc = await apiClient.createDocument(userId, title, content);
      setDocuments((prev) => [newDoc, ...prev]);
      return newDoc;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create document');
      console.error('Error creating document:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const updateDocument = useCallback(async (
    docId: string,
    updates: { title?: string; content?: string }
  ) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await apiClient.updateDocument(docId, userId, updates);
      setDocuments((prev) =>
        prev.map((doc) => (doc.id === docId ? updated : doc))
      );
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update document');
      console.error('Error updating document:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const deleteDocument = useCallback(async (docId: string) => {
    setLoading(true);
    setError(null);
    try {
      await apiClient.deleteDocument(docId, userId);
      setDocuments((prev) => prev.filter((doc) => doc.id !== docId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document');
      console.error('Error deleting document:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  return {
    documents,
    loading,
    error,
    loadDocuments,
    createDocument,
    updateDocument,
    deleteDocument,
  };
}

