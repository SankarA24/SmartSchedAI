import { useCallback, useEffect, useRef, useState } from "react";

import api from "@/lib/api";
import { useSocket } from "@/hooks/useSocket";

// Live progress for one async generation job.
//
// `POST /api/timetables/generate` answers `202 { jobId, steps }` and the run
// then reports itself two ways:
//   - socket: the job's own room `generation:<jobId>` (joined by emitting
//     `generation:subscribe`, admin-only server-side), carrying
//     `generation:progress` / `generation:completed` / `generation:failed`;
//   - REST: `GET /api/timetables/generate/:jobId/progress`, the same job
//     record.
// The socket is the primary transport; polling is the safety net for a
// blocked/failed websocket, and one final fetch on a terminal status makes
// sure the last update is never the one that got dropped.

const POLL_INTERVAL_MS = 1500;
const SOCKET_GRACE_MS = 2000;
const TERMINAL_STATUSES = ["completed", "failed"];

/** @param {string|undefined|null} status */
export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.includes(status);
}

function progressUrl(jobId) {
  return `/timetables/generate/${encodeURIComponent(jobId)}/progress`;
}

function messageFor(error) {
  return error?.response?.data?.error || error?.message || "Request failed";
}

/**
 * Tracks one generation job, live over the socket where possible and by
 * polling where not.
 *
 * @param {string|null|undefined} jobId Job id from the `202` response. Falsy
 *   parks the hook (no subscription, no polling).
 * @returns {{
 *   jobId: string|null,
 *   status: string|null, step: string|null, stepIndex: number|null,
 *   percentage: number, generation: number|null, maxGenerations: number|null,
 *   bestFitness: number|null, hardViolations: number|null, softPenalty: number|null,
 *   timetableId: string|null, error: string|null,
 *   job: object|null, live: boolean, polling: boolean,
 *   source: "socket"|"polling"|"connecting"|"idle",
 *   terminal: boolean, transportError: string|null,
 *   refresh: () => Promise<object|null>,
 * }}
 */
export function useGenerationProgress(jobId) {
  const { socket, connected } = useSocket();

  const [job, setJob] = useState(null);
  const [polling, setPolling] = useState(false);
  const [transportError, setTransportError] = useState(null);

  // Guards the one-shot final fetch, keyed by job so a second job in the
  // same mount still gets its own.
  const finalFetchedFor = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const mergeJob = useCallback((patch) => {
    if (!patch) return;
    setJob((prev) => ({ ...prev, ...patch }));
  }, []);

  /** One-off read of the job record; also used for the final fetch. */
  const fetchJob = useCallback(async () => {
    if (!jobId) return null;
    try {
      const { data } = await api.get(progressUrl(jobId));
      if (!mountedRef.current) return data ?? null;
      mergeJob(data);
      setTransportError(null);
      return data ?? null;
    } catch (error) {
      if (mountedRef.current) setTransportError(messageFor(error));
      console.warn("useGenerationProgress: failed to read job progress", error);
      return null;
    }
  }, [jobId, mergeJob]);

  // Reset whenever the job changes, then take one reading so a UI that
  // mounts mid-run starts from the real state instead of an empty record.
  useEffect(() => {
    setJob(null);
    setPolling(false);
    setTransportError(null);
    finalFetchedFor.current = null;

    if (!jobId) return undefined;

    let cancelled = false;
    api
      .get(progressUrl(jobId))
      .then(({ data }) => {
        if (cancelled || !mountedRef.current) return;
        // Socket events that already arrived win — merge, don't overwrite.
        setJob((prev) => ({ ...data, ...prev }));
      })
      .catch((error) => {
        if (cancelled || !mountedRef.current) return;
        setTransportError(messageFor(error));
      });

    return () => {
      cancelled = true;
    };
  }, [jobId]);

  // Socket: join `generation:<jobId>` and follow the run's events.
  useEffect(() => {
    if (!socket || !jobId) return undefined;

    const onEvent = (payload) => {
      if (!payload) return;
      // The room is per job, but ignore anything explicitly tagged for
      // another one (e.g. a broadcast the server widens later).
      if (payload.jobId && payload.jobId !== jobId) return;
      mergeJob(payload);
    };
    // Rooms are per connection, so re-join after every reconnect.
    const onConnect = () => socket.emit("generation:subscribe", jobId);

    socket.emit("generation:subscribe", jobId);
    socket.on("connect", onConnect);
    socket.on("generation:progress", onEvent);
    socket.on("generation:completed", onEvent);
    socket.on("generation:failed", onEvent);

    return () => {
      socket.off("connect", onConnect);
      socket.off("generation:progress", onEvent);
      socket.off("generation:completed", onEvent);
      socket.off("generation:failed", onEvent);
      // Buffered while offline it could flush after a later re-subscribe, so
      // only leave the room when there is a live connection to leave it on.
      if (socket.connected) socket.emit("generation:unsubscribe", jobId);
    };
  }, [socket, jobId, mergeJob]);

  // Fall back to polling when the socket has not come up within the grace
  // period, and stop again the moment it does.
  useEffect(() => {
    if (!jobId) return undefined;

    if (connected) {
      setPolling(false);
      return undefined;
    }

    const timer = setTimeout(() => setPolling(true), SOCKET_GRACE_MS);
    return () => clearTimeout(timer);
  }, [jobId, connected]);

  // Polling loop. Chained timeouts (not an interval) so a slow response
  // never stacks requests; stops on its own once the job is terminal.
  useEffect(() => {
    if (!jobId || !polling) return undefined;

    let cancelled = false;
    let timer = null;

    const tick = async () => {
      let data = null;
      try {
        const response = await api.get(progressUrl(jobId));
        data = response.data;
        if (cancelled) return;
        mergeJob(data);
        setTransportError(null);
      } catch (error) {
        if (cancelled) return;
        setTransportError(messageFor(error));
      }

      if (cancelled || isTerminalStatus(data?.status)) return;
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    };

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, polling, mergeJob]);

  // Terminal status seen (over either transport): read the record once more
  // so the UI always ends on the server's final version of it.
  const status = job?.status ?? null;
  useEffect(() => {
    if (!jobId || !isTerminalStatus(status)) return;
    if (finalFetchedFor.current === jobId) return;
    finalFetchedFor.current = jobId;
    fetchJob();
  }, [jobId, status, fetchJob]);

  let source = "idle";
  if (jobId) source = polling ? "polling" : connected ? "socket" : "connecting";

  return {
    jobId: jobId || null,
    status,
    step: job?.step ?? null,
    stepIndex: job?.stepIndex ?? null,
    percentage: job?.percentage ?? 0,
    generation: job?.generation ?? null,
    maxGenerations: job?.maxGenerations ?? null,
    bestFitness: job?.bestFitness ?? null,
    hardViolations: job?.hardViolations ?? null,
    softPenalty: job?.softPenalty ?? null,
    timetableId: job?.timetableId ?? null,
    error: job?.error ?? null,
    job,
    live: source === "socket",
    polling,
    source,
    terminal: isTerminalStatus(status),
    transportError,
    refresh: fetchJob,
  };
}

export default useGenerationProgress;
