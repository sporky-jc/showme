import { QUEUE_GROUPS, type GroupId } from "./queueGroups";

export type QueueFilter = "all" | GroupId;

// Each group's look, written out in full: the production build keeps only
// CSS class names that appear literally in the code (vite.config.ts)
const LOOK: Record<GroupId, string> = {
  "needs-you": "paper-review__filter paper-review__filter--needs-you",
  "your-call": "paper-review__filter paper-review__filter--your-call",
  fyi: "paper-review__filter paper-review__filter--fyi",
  routine: "paper-review__filter",
  reading: "paper-review__filter paper-review__filter--reading",
};

// At the top of the Teacher page (spec/SPEC-teacher-suggestions.md, "At a
// glance"): how many waiting sentences are in each group, each count a
// button that shows only that group. "All" first, chosen to start with.
// Groups with nothing in them aren't shown.
function AtAGlance({
  counts,
  total,
  filter,
  onFilter,
  disabled = false,
}: {
  counts: Partial<Record<GroupId, number>>;
  total: number;
  filter: QueueFilter;
  onFilter: (filter: QueueFilter) => void;
  // Off while a decision is being saved, like every button on the page
  disabled?: boolean;
}) {
  const shown = QUEUE_GROUPS.filter((group) => (counts[group.id] ?? 0) > 0);
  return (
    <div className="paper-review__summary">
      <p>Scribbles read them first. You decide.</p>
      <div className="paper-review__filters" role="group" aria-label="Scribbles' notes">
        <button type="button" className="paper-review__filter" aria-pressed={filter === "all"} disabled={disabled} onClick={() => onFilter("all")}>
          All {total}
        </button>
        {shown.map((group) => (
          <button
            key={group.id}
            type="button"
            className={LOOK[group.id]}
            aria-pressed={filter === group.id}
            disabled={disabled}
            onClick={() => onFilter(group.id)}
          >
            {group.label} {counts[group.id]}
          </button>
        ))}
      </div>
    </div>
  );
}

export default AtAGlance;
