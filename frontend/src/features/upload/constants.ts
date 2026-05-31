import type { Accept } from "react-dropzone";

/**
 * Client-side upload guard, kept in sync with the backend validator
 * (`backend/app/modules/documents/validation.py` + `Settings.max_upload_mb`,
 * default 50 MB). This is a UX guard only — the server is the source of truth
 * and re-validates magic bytes, archive bombs, and malware.
 */
export const MAX_UPLOAD_MB = 50;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

/**
 * Accepted MIME → extension map for react-dropzone. Mirrors the backend's
 * `_SPEC` table (PDF, DOCX, XLSX, CSV, PNG, JPG/JPEG).
 */
export const ACCEPTED_TYPES: Accept = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "text/csv": [".csv"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
};

/** Human-readable list of accepted formats for UI copy. */
export const ACCEPTED_EXTENSIONS_LABEL = "PDF, DOCX, XLSX, CSV, PNG, JPG";
