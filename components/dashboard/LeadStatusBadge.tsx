/**
 * Small colored badge for a lead's classified status.
 *
 * The classifier (lib/lead-classifier.ts) assigns exactly one of five
 * Title-case values. Colors:
 *   New=gray, Active=blue, Progress=amber, Lost=red, Successful=green.
 *
 * The classifier now writes a concise reason for EVERY status (lead_reason),
 * so the reason is shown as a title tooltip for any status (and optionally as
 * muted subtext via the `showReason` prop), not just Lost.
 */

const STATUS_STYLES: Record<string, string> = {
  New: 'bg-gray-100 text-gray-600',
  Active: 'bg-blue-100 text-blue-700',
  Progress: 'bg-amber-100 text-amber-700',
  Lost: 'bg-red-100 text-red-700',
  Successful: 'bg-green-100 text-green-700',
};

interface LeadStatusBadgeProps {
  status: string | null | undefined;
  /** Why the classifier picked this status (any status), shown as tooltip. */
  reason?: string | null;
  /** When true, render the reason as muted subtext beside the badge. */
  showReason?: boolean;
  className?: string;
}

export default function LeadStatusBadge({
  status,
  reason,
  showReason = false,
  className = '',
}: LeadStatusBadgeProps) {
  const safe = status && STATUS_STYLES[status] ? status : 'New';
  const styles = STATUS_STYLES[safe];
  const hasReason = Boolean(reason && reason.trim());

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span
        title={hasReason ? `${safe} — ${reason}` : safe}
        className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${styles}`}
      >
        {safe}
      </span>
      {showReason && hasReason && (
        <span className="truncate text-[10px] text-gray-400" title={reason ?? undefined}>
          {reason}
        </span>
      )}
    </span>
  );
}
