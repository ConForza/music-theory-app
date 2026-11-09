import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiFailure, type CourseView, type Me, type Overview, type Settings } from "../api/client";
import { setSoundEnabled } from "../lib/audio";

type Load<T> = { status: "loading" } | { status: "error"; error: ApiFailure } | { status: "ready"; data: T };

interface AppState {
  /** undefined while the first /api/me request is in flight; null when signed out. */
  me: Me | null | undefined;
  meError: ApiFailure | null;
  course: Load<CourseView>;
  progress: Load<Overview> | { status: "signed-out" };
  setMe: (m: Me | null) => void;
  refreshProgress: () => Promise<void>;
  reloadAll: () => void;
  updateProfile: (patch: Parameters<typeof api.patchProfile>[0]) => Promise<Me>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);
export const useApp = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside <AppProvider>");
  return v;
};

/** Apply theme/motion/sound immediately and remember them locally so the next load has no flash. */
export function applySettings(s: Settings) {
  const root = document.documentElement;
  if (s.theme === "system") delete root.dataset.theme;
  else root.dataset.theme = s.theme;
  if (s.motion === "system") delete root.dataset.motion;
  else root.dataset.motion = s.motion;
  setSoundEnabled(s.sound);
  try {
    localStorage.setItem("mtp.theme", s.theme);
    localStorage.setItem("mtp.motion", s.motion);
  } catch {
    /* storage can be unavailable (private mode); the server copy is authoritative */
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [me, setMeState] = useState<Me | null | undefined>(undefined);
  const [meError, setMeError] = useState<ApiFailure | null>(null);
  const [course, setCourse] = useState<Load<CourseView>>({ status: "loading" });
  const [progress, setProgress] = useState<AppState["progress"]>({ status: "signed-out" });
  const [tick, setTick] = useState(0);

  const setMe = useCallback((m: Me | null) => {
    setMeState(m);
    if (m) applySettings(m.profile.settings);
    else setProgress({ status: "signed-out" });
  }, []);

  useEffect(() => {
    let live = true;
    setMeError(null);
    api.me().then(
      (m) => live && setMe(m),
      (e: unknown) => {
        if (!live) return;
        if (e instanceof ApiFailure && e.status === 401) setMe(null);
        else {
          setMeError(e instanceof ApiFailure ? e : new ApiFailure(0, "network", "Could not reach the server."));
          setMeState(null);
        }
      },
    );
    return () => {
      live = false;
    };
  }, [setMe, tick]);

  useEffect(() => {
    let live = true;
    setCourse({ status: "loading" });
    api.course().then(
      (data) => live && setCourse({ status: "ready", data }),
      (error: unknown) => live && setCourse({ status: "error", error: error instanceof ApiFailure ? error : new ApiFailure(0, "network", "Could not load the course.") }),
    );
    return () => {
      live = false;
    };
  }, [tick]);

  const userId = me?.user.id;
  const refreshProgress = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await api.progress();
      setProgress({ status: "ready", data });
    } catch (e) {
      setProgress({ status: "error", error: e instanceof ApiFailure ? e : new ApiFailure(0, "network", "Could not load your progress.") });
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    setProgress({ status: "loading" });
    void refreshProgress();
  }, [userId, refreshProgress, tick]);

  const updateProfile = useCallback(
    async (patch: Parameters<typeof api.patchProfile>[0]) => {
      const next = await api.patchProfile(patch);
      setMe(next);
      return next;
    },
    [setMe],
  );

  // Only report signed-out once the server has invalidated the session (or says there is none). A failure is thrown
  // to the caller, who keeps the learner signed in and shows a retry: the cookie still works until logout succeeds.
  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch (e) {
      if (!(e instanceof ApiFailure && e.status === 401)) throw e;
    }
    setMe(null);
  }, [setMe]);

  const value = useMemo<AppState>(
    () => ({ me, meError, course, progress, setMe, refreshProgress, reloadAll: () => setTick((t) => t + 1), updateProfile, signOut }),
    [me, meError, course, progress, setMe, refreshProgress, updateProfile, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export interface CourseData {
  status: "ready";
  course: CourseView;
  progress: Overview;
  nodes: Map<string, CourseView["worlds"][number]["nodes"][number]>;
  units: Map<string, CourseView["worlds"][number]["units"][number] & { grade: number }>;
  titleOf: (id: string) => string;
}
export type CourseDataState = { status: "loading" } | { status: "error"; error: ApiFailure } | CourseData;

/** Convenience: course + progress once both are ready, with indexes for lookups. */
export function useCourseData(): CourseDataState {
  const { course, progress } = useApp();
  return useMemo<CourseDataState>(() => {
    if (course.status === "error") return { status: "error", error: course.error };
    if (course.status !== "ready") return { status: "loading" };
    if (progress.status === "error") return { status: "error", error: progress.error };
    if (progress.status !== "ready") return { status: "loading" };
    const nodes = new Map(course.data.worlds.flatMap((w) => w.nodes.map((n) => [n.id, n] as const)));
    const units = new Map(course.data.worlds.flatMap((w) => w.units.map((u) => [u.id, { ...u, grade: w.grade }] as const)));
    return { status: "ready", course: course.data, progress: progress.data, nodes, units, titleOf: (id: string) => nodes.get(id)?.title ?? id };
  }, [course, progress]);
}
