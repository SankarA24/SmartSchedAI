import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import api from "@/lib/api";
import { buildGrid } from "@/lib/schedule";

// Context + provider around GET /api/config/grid.
//
// The grid endpoint returns the derived `{ days, slots, breaks, weeks,
// maxPeriodsPerDay, maxConsecutiveHours, maxDailyHoursPerFaculty, flags }`
// shape documented in `backend/utils/schedulingConstants.js#getScheduleGrid`
// (mounted at `/api/config/grid` — see `backend/routes/configRoute.js`).
// There's no separate "settings" payload to fetch alongside it, so this
// provider fetches that one endpoint once and exposes it two ways:
//   - `grid`   — the response normalised through `lib/schedule.js#buildGrid`,
//                so it always has every field (defaults filled in) plus the
//                precomputed `rows` the timetable components render from.
//   - `config` — the raw server response, for callers that want the
//                un-normalised scheduling settings (e.g. `maxPeriodsPerDay`)
//                without the `rows` derivation.
//
// Mount `SystemConfigProvider` once, high enough that every page needing the
// grid is inside it (planned: inside `ProtectedRoute` in `App.jsx`, wired up
// in a later wave — this file does not touch `App.jsx`). Read it anywhere
// below that with `useSystemConfig()`.

const SystemConfigContext = createContext(null);

/**
 * @param {{children: import("react").ReactNode}} props
 */
export function SystemConfigProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [grid, setGrid] = useState(() => buildGrid());
  const [loading, setLoading] = useState(true);
  const abortRef = useRef(null);

  const load = useCallback(async () => {
    // Cancel any request this provider already has in flight before
    // starting another (covers refresh() being called again quickly).
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const { data } = await api.get("/config/grid", { signal: controller.signal });
      setConfig(data ?? null);
      setGrid(buildGrid(data));
    } catch (error) {
      if (error?.code === "ERR_CANCELED" || error?.name === "CanceledError") return;
      // Degrade to the default grid so pages that render off `grid` still
      // work even when the backend/config is unreachable.
      console.warn("useSystemConfig: failed to load /config/grid, using defaults", error);
      setConfig(null);
      setGrid(buildGrid());
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const value = useMemo(
    () => ({ grid, config, loading, refresh: load }),
    [grid, config, loading, load]
  );

  return <SystemConfigContext.Provider value={value}>{children}</SystemConfigContext.Provider>;
}

/**
 * @returns {{grid: object, config: object|null, loading: boolean, refresh: () => Promise<void>}}
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useSystemConfig() {
  const ctx = useContext(SystemConfigContext);
  if (!ctx) {
    throw new Error("useSystemConfig() must be called within a <SystemConfigProvider>");
  }
  return ctx;
}
