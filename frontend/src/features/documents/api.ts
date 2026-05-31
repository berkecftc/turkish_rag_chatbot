/**
 * Documents API + TanStack hooks. Server state only.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { AxiosProgressEvent } from "axios";
import { api } from "@/lib/api";
import { queryKeys, queryKeyRoots, type ListParams } from "@/shared/lib/queryKeys";
import type { DocumentOut, UploadResponse } from "@/shared/types/api";

// ── Raw calls ───────────────────────────────────────────────────────────────
export async function listDocuments(params: ListParams = {}): Promise<DocumentOut[]> {
  const { data } = await api.get<DocumentOut[]>("/documents", { params });
  return data;
}

export async function getDocument(id: string): Promise<DocumentOut> {
  const { data } = await api.get<DocumentOut>(`/documents/${id}`);
  return data;
}

export interface UploadDocumentArgs {
  file: File;
  onUploadProgress?: (event: AxiosProgressEvent) => void;
}

export async function uploadDocument({
  file,
  onUploadProgress,
}: UploadDocumentArgs): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<UploadResponse>("/documents/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress,
  });
  return data;
}

export async function deleteDocument(id: string): Promise<void> {
  await api.delete(`/documents/${id}`);
}

// ── Hooks ───────────────────────────────────────────────────────────────────
export function useDocuments(params: ListParams = {}): UseQueryResult<DocumentOut[]> {
  return useQuery({
    queryKey: queryKeys.documents(params),
    queryFn: () => listDocuments(params),
  });
}

export function useDocument(id: string | undefined): UseQueryResult<DocumentOut> {
  return useQuery({
    queryKey: queryKeys.document(id ?? ""),
    queryFn: () => getDocument(id as string),
    enabled: Boolean(id),
  });
}

export function useUploadDocument(): UseMutationResult<UploadResponse, unknown, UploadDocumentArgs> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: uploadDocument,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeyRoots.documents });
      qc.invalidateQueries({ queryKey: queryKeyRoots.jobs });
    },
  });
}

export function useDeleteDocument(): UseMutationResult<void, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeyRoots.documents });
    },
  });
}
