/** Map a timetable / task / notification status string to a StatusBadge variant. */
export function statusVariant(status) {
  switch (String(status || "").toLowerCase()) {
    case "published":
    case "active":
    case "success":
    case "completed":
      return "success";
    case "draft":
    case "pending":
    case "warning":
      return "warning";
    case "archived":
      return "neutral";
    case "error":
    case "conflict":
    case "failed":
      return "destructive";
    case "info":
      return "info";
    default:
      return "neutral";
  }
}

/** Map a course type to a chart token index used for the timetable legend. */
export function courseTypeToken(type) {
  switch (String(type || "").toLowerCase()) {
    case "lab":
      return "chart-2";
    case "tutorial":
    case "seminar":
      return "chart-4";
    default:
      return "chart-1";
  }
}
