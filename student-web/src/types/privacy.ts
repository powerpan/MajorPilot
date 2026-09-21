export type ExportScope = "REPORTS_ONLY" | "FULL_PERSONAL_EXPORT";
export interface PersonalExport {
  exportId: string; scope: ExportScope; status: string; format: string;
  requestedAt: string; completedAt: string | null; expiresAt: string | null;
  failureCode: string | null; fileSizeBytes: number | null;
}
export interface DeletionRequest {
  requestId: string; receiptId: string; status: string; requestedAt: string;
  confirmedAt: string | null; scheduledFor: string | null; completedAt: string | null;
  receiptExpiresAt: string;
}
export interface DeletionReceipt {
  status: "REQUESTED" | "PROCESSING" | "COMPLETED" | "ACTION_REQUIRED";
  requestedAt: string; confirmedAt: string | null; scheduledFor: string | null;
  completedAt: string | null; expiresAt: string;
}
