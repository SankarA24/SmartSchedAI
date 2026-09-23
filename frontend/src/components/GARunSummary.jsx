import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";

/**
 * Compact summary of a timetable generation run.
 *
 * Reads either the run statistics returned by POST /timetables/generate
 * (`stats`, preferred) or the subset persisted on the saved document
 * (`metadata`). Renders nothing until a generation method is known, so
 * timetables created before the genetic algorithm landed stay clean.
 *
 * Props:
 *  - metadata:    saved `timetable.metadata`
 *  - stats:       fresh `response.data.stats` for this timetable
 *  - onReproduce: (seed) => void, shows a "Reproduce" button when a seed exists
 *  - live:        the run is still going. `stats.fitnessHistory` is then a
 *                 partial, still-growing series streamed off
 *                 `generation:progress` rather than the final saved one, so
 *                 the card says so and the "Reproduce" affordance is hidden
 *                 — a seed only reproduces a finished run. Everything the
 *                 run has not reported yet stays "—" on its own, because
 *                 every cell already renders an absent value that way.
 *                 Defaults to false, so existing callers are unchanged.
 */

const METHOD_LABELS = {
  "genetic-algorithm": "Genetic algorithm",
  backtracking: "Backtracking",
};

const CHART_WIDTH = 320;
const CHART_HEIGHT = 90;
const PAD_X = 4;
const PAD_TOP = 8;
const PAD_BOTTOM = 8;

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value, fractionDigits) {
  const parsed = toNumber(value);
  if (parsed === null) return "—";
  return fractionDigits === undefined
    ? String(parsed)
    : parsed.toFixed(fractionDigits);
}

/**
 * Build the two polyline point strings. Values are compressed with
 * log10(1 + v) so a run that starts in the thousands and ends near zero
 * still shows its shape, then normalised over the observed range.
 */
function buildChart(history) {
  const points = history
    .map((point, index) => ({
      generation: toNumber(point?.generation) ?? index,
      best: toNumber(point?.best),
      average: toNumber(point?.average),
    }))
    .filter((point) => point.best !== null);

  if (points.length < 2) return null;

  const compress = (value) => Math.log10(1 + Math.max(0, value));
  const hasAverage = points.every((point) => point.average !== null);

  const values = points.map((point) => compress(point.best));
  if (hasAverage) {
    points.forEach((point) => values.push(compress(point.average)));
  }

  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low > 1e-9 ? high - low : 1;

  const firstGen = points[0].generation;
  const lastGen = points[points.length - 1].generation;
  const genSpan = lastGen - firstGen > 0 ? lastGen - firstGen : 1;

  const plotWidth = CHART_WIDTH - PAD_X * 2;
  const plotHeight = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

  const toX = (generation) =>
    PAD_X + ((generation - firstGen) / genSpan) * plotWidth;
  const toY = (value) =>
    PAD_TOP + (1 - (compress(value) - low) / span) * plotHeight;

  const line = (key) =>
    points
      .map((point) => `${toX(point.generation).toFixed(1)},${toY(point[key]).toFixed(1)}`)
      .join(" ");

  return {
    best: line("best"),
    average: hasAverage ? line("average") : null,
    firstGen,
    lastGen,
  };
}

function StatCell({ label, children }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
        {children}
      </div>
    </div>
  );
}

export function GARunSummary({ metadata, stats, onReproduce, live = false }) {
  const run = stats || metadata;
  if (!run?.generationMethod) return null;

  const methodLabel = METHOD_LABELS[run.generationMethod] || run.generationMethod;
  const seed = toNumber(run.seed);
  const hardViolations = toNumber(run.hardViolations);
  const history = Array.isArray(run.fitnessHistory) ? run.fitnessHistory : [];
  const chart = history.length > 1 ? buildChart(history) : null;
  // A seed identifies a completed run's inputs; offering to replay one
  // that is still running would replay something that does not exist yet.
  const showReproduce = !live && Boolean(onReproduce) && seed !== null;

  return (
    <div className="mb-4 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-foreground">Generation run</h3>
          <StatusBadge variant="info">{methodLabel}</StatusBadge>
          {live && <StatusBadge variant="warning">in progress</StatusBadge>}
        </div>
        {showReproduce && (
          <Button variant="outline" size="sm" onClick={() => onReproduce(seed)}>
            Reproduce
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCell label="Seed">{seed === null ? "—" : seed}</StatCell>
        <StatCell label="Generations">{formatNumber(run.generations)}</StatCell>
        <StatCell label="Population">{formatNumber(run.populationSize)}</StatCell>
        <StatCell label="Best fitness">{formatNumber(run.bestFitness, 4)}</StatCell>
        <StatCell label="Hard violations">
          <StatusBadge
            variant={hardViolations === 0 ? "success" : "destructive"}
            className="text-xs tabular-nums"
          >
            {hardViolations === null ? "—" : hardViolations}
          </StatusBadge>
        </StatCell>
        <StatCell label="Soft penalty">{formatNumber(run.softPenalty)}</StatCell>
        <StatCell label="Duration (ms)">{formatNumber(run.durationMs)}</StatCell>
        <StatCell label="Terminated by">{run.terminatedBy || "—"}</StatCell>
      </div>

      {live && !chart && (
        <p className="mt-4 text-xs text-muted-foreground">
          Collecting fitness samples — the chart appears once the run has
          reported two generations.
        </p>
      )}

      {chart && (
        <div className="mt-4">
          <svg
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={
              live
                ? "Penalty per generation so far: best and population average, still updating"
                : "Penalty per generation: best and population average"
            }
            className="h-24 w-full"
          >
            {chart.average && (
              <polyline
                fill="none"
                strokeWidth="1.5"
                stroke="var(--chart-2)"
                points={chart.average}
              />
            )}
            <polyline
              fill="none"
              strokeWidth="1.5"
              stroke="var(--chart-1)"
              points={chart.best}
            />
          </svg>
          <div className="mt-1 flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-0.5 w-3.5"
                style={{ backgroundColor: "var(--chart-1)" }}
              />
              best
            </span>
            {chart.average && (
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-0.5 w-3.5"
                  style={{ backgroundColor: "var(--chart-2)" }}
                />
                average
              </span>
            )}
            <span className="ml-auto tabular-nums">gen {chart.firstGen}</span>
            <span className="tabular-nums">
              gen {chart.lastGen}
              {live ? " (so far)" : ""}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default GARunSummary;
