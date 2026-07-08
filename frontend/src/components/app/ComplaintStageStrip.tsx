import { motion } from "framer-motion";
import type { ComplaintItem, ComplaintStatus } from "@/lib/api";

export const COMPLAINT_STAGES: {
  key: ComplaintStatus;
  label: string;
  color: string;
}[] = [
  { key: "submitted", label: "Submitted", color: "oklch(0.7 0.25 310)" },
  { key: "acknowledged", label: "Acknowledged", color: "oklch(0.82 0.18 200)" },
  { key: "in_progress", label: "In Progress", color: "oklch(0.72 0.27 350)" },
  { key: "resolved", label: "Resolved", color: "oklch(0.7 0.22 150)" },
];

export function complaintStageIndex(status: ComplaintStatus) {
  return COMPLAINT_STAGES.findIndex((stage) => stage.key === status);
}

function formatStageMoment(value: string | null) {
  if (!value) return "Pending";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString([], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stageMoment(complaint: ComplaintItem, stage: ComplaintStatus) {
  if (stage === "submitted") return complaint.submittedAt;
  if (stage === "acknowledged") return complaint.acknowledgedAt;
  if (stage === "in_progress") return complaint.inProgressAt;
  return complaint.resolvedAt;
}

export function ComplaintStageStrip({
  complaint,
  compact = false,
}: {
  complaint: ComplaintItem;
  compact?: boolean;
}) {
  const activeIndex = complaintStageIndex(complaint.status);
  const progress = activeIndex <= 0 ? 0 : (activeIndex / (COMPLAINT_STAGES.length - 1)) * 100;

  return (
    <div className="relative">
      <div className={`absolute left-0 right-0 ${compact ? "top-2.5" : "top-3"} h-px bg-white/10`} />
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        className={`absolute left-0 ${compact ? "top-2.5" : "top-3"} h-px`}
        style={{ background: "var(--grad-aurora)" }}
      />

      <div className={`relative grid grid-cols-4 ${compact ? "gap-2" : "gap-3"}`}>
        {COMPLAINT_STAGES.map((stage, index) => {
          const done = index <= activeIndex;
          return (
            <div key={stage.key} className="flex flex-col items-center text-center">
              <motion.div
                initial={{ scale: 0.92, opacity: 0.6 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: index * 0.05 }}
                className={`${compact ? "size-5" : "size-6"} rounded-full border-2 mb-2`}
                style={{
                  background: done ? stage.color : "#050505",
                  borderColor: done ? stage.color : "oklch(1 0 0 / 0.15)",
                  boxShadow: done ? `0 0 20px ${stage.color}` : "none",
                }}
              />
              <div
                className={`${compact ? "text-[9px]" : "text-[10px]"} uppercase tracking-[0.2em] ${
                  done ? "text-white" : "text-white/35"
                }`}
              >
                {stage.label}
              </div>
              <div className={`${compact ? "mt-1 text-[10px]" : "mt-2 text-[11px]"} text-white/45`}>
                {formatStageMoment(stageMoment(complaint, stage.key))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

