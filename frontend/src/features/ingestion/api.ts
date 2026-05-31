/**
 * Ingestion API + TanStack hooks. Server state only.
 *
 * `useJob` polls (refetchInterval) while the job is in a non-terminal state and
 * stops once it reaches a terminal state (succeeded / failed / dead).
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys, queryKeyRoots, type ListParams } from "@/shared/lib/queryKeys";
import { isTerminalJobStatus, type JobStatus } from "@/shared/types/enums";
import type { ChunkOut, JobStatusOut } from "@/shared/types/api";

const JOB_POLL_INTERVAL_MS = 2500;

// ── Raw calls ───────────────────────────────────────────────────────────────
export interface ListJobsParams extends ListParams {
  status?: JobStatus;
}

export async function listJobs(params: ListJobsParams = {}): Promise<JobStatusOut[]> {
  const { status, ...rest } = params;
  // Backend query param is `job_status`.
  const { data } = await api.get<JobStatusOut[]>("/ingestion/jobs", {
    params: { ...rest, ...(status ? { job_status: status } : {}) },
  });
  return data;
}

export async function getJob(id: string): Promise<JobStatusOut> {
  const { data } = await api.get<JobStatusOut>(`/ingestion/jobs/${id}`);
  return data;
}

export async function listChunks(
  documentId: string,
  params: ListParams = {},
): Promise<ChunkOut[]> {
  const { data } = await api.get<ChunkOut[]>(`/ingestion/documents/${documentId}/chunks`, {
    params,
  });
  return data;
}

export async function retryJob(id: string): Promise<JobStatusOut> {
  const { data } = await api.post<JobStatusOut>(`/ingestion/jobs/${id}/retry`);
  return data;
}

// ── Hooks ───────────────────────────────────────────────────────────────────
export function useJobs(params: ListJobsParams = {}): UseQueryResult<JobStatusOut[]> {
  return useQuery({
    queryKey: queryKeys.jobs({ status: params.status }),
    queryFn: () => listJobs(params),
  });
}

export function useJob(id: string | undefined): UseQueryResult<JobStatusOut> {
  return useQuery({
    queryKey: queryKeys.job(id ?? ""),
    queryFn: () => getJob(id as string),
    enabled: Boolean(id),
    // Poll while non-terminal; stop once terminal.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status) return JOB_POLL_INTERVAL_MS;
      return isTerminalJobStatus(status) ? false : JOB_POLL_INTERVAL_MS;
    },
  });
}

export function useDocumentChunks(
  documentId: string | undefined,
  params: ListParams = {},
): UseQueryResult<ChunkOut[]> {
  return useQuery({
    queryKey: queryKeys.documentChunks(documentId ?? "", params),
    queryFn: () => listChunks(documentId as string, params),
    enabled: Boolean(documentId),
  });
}

export function useRetryJob(): UseMutationResult<JobStatusOut, unknown, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: retryJob,
    onSuccess: (job) => {
      qc.invalidateQueries({ queryKey: queryKeyRoots.jobs });
      qc.invalidateQueries({ queryKey: queryKeys.job(job.id) });
    },
  });
}
