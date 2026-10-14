/** Public build setting only. Server policy is authoritative; no credentials belong here. */
export const pilotMode = import.meta.env.VITE_PILOT_MODE === "true";
export interface PilotStatus {
  consented: boolean;
  allowances: Record<"experience" | "comparison", { limit: number; used: number; remaining: number; reserved: number }>;
}
