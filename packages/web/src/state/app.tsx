import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  /** Resolves with the saved profile, rejects (and shows nothing as saved) if the server did not confirm it. */
  updateProfile: (patch: Parameters<typeof api.patchProfile>[0], opts?: { optimistic?: boolean }) => Promise<Me>;
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

type ProfilePatch = Parameters<typeof api.patchProfile>[0];

/** What the screen would show if `patch` were saved. Used only for edits that are visibly pending. */
function applyPatch(m: Me, patch: ProfilePatch): Me {
  const { settings, displayName, ...rest } = patch;
  return {
    user: displayName ? { ...m.user, displayName } : m.user,
    profile: { ...m.profile, ...rest, settings: { ...m.profile.settings, ...(settings ?? {}) } },
  };
}

const failure = (e: unknown, fallback: string) => (e instanceof ApiFailure ? e : new ApiFailure(0, "network", fallback));

export function AppProvider({ children }: { children: ReactNode }) {
  // `confirmed` is what the server last told us. `pending` are edits shown optimistically while they are in flight; they
  // are layered over `confirmed` and removed the moment their request settles, so a failed save simply disappears.
  const [confirmed, setConfirmed] = useState<Me | null | undefined>(undefined);
  const [pending, setPending] = useState<Array<{ id: number; patch: ProfilePatch }>>([]);
  const [meError, setMeError] = useState<ApiFailure | null>(null);
  const [course, setCourse] = useState<Load<CourseView>>({ status: "loading" });
  const [progress, setProgress] = useState<AppState["progress"]>({ status: "signed-out" });
  const [tick, setTick] = useState(0);

  // Who the screen belongs to. `epoch` changes whenever the signed-in learner changes (including to signed out); any
  // asynchronous result started under an older epoch is discarded instead of being committed.
  const identity = useRef<{ userId: string | null; epoch: number }>({ userId: null, epoch: 0 });
  const sessionGen = useRef(0); // bumped by every explicit sign-in/out so a slow initial /api/me cannot undo it
  const progressCtl = useRef<AbortController | null>(null);
  const progressSeq = useRef(0);
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());
  const patchId = useRef(0);

  /** Make `m` the current learner. Anything that belonged to a different learner is cleared in the same render. */
  const commit = useCallback((m: Me | null) => {
    const userId = m?.user.id ?? null;
    if (userId !== identity.current.userId) {
      identity.current = { userId, epoch: identity.current.epoch + 1 };
      progressCtl.current?.abort();
      progressCtl.current = null;
      setPending([]);
      setProgress(userId ? { status: "loading" } : { status: "signed-out" });
    }
    setConfirmed(m);
  }, []);

  const setMe = useCallback(
    (m: Me | null) => {
      sessionGen.current++;
      commit(m);
    },
    [commit],
  );

  const me = useMemo(() => (confirmed && pending.length ? pending.reduce((m, p) => applyPatch(m, p.patch), confirmed) : confirmed), [confirmed, pending]);

  const settingsKey = me ? JSON.stringify(me.profile.settings) : null;
  useEffect(() => {
    if (me) applySettings(me.profile.settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the settings values, not the Me object
  }, [settingsKey]);

  useEffect(() => {
    let live = true;
    const gen = sessionGen.current;
    const current = () => live && sessionGen.current === gen;
    setMeError(null);
    api.me().then(
      (m) => current() && commit(m),
      (e: unknown) => {
        if (!current()) return;
        if (e instanceof ApiFailure && e.status === 401) commit(null);
        else {
          setMeError(failure(e, "Could not reach the server."));
          commit(null);
        }
      },
    );
    return () => {
      live = false;
    };
  }, [commit, tick]);

  useEffect(() => {
    let live = true;
    setCourse({ status: "loading" });
    api.course().then(
      (data) => live && setCourse({ status: "ready", data }),
      (error: unknown) => live && setCourse({ status: "error", error: failure(error, "Could not load the course.") }),
    );
    return () => {
      live = false;
    };
  }, [tick]);

  /** Reload the signed-in learner's progress. Only the newest request for the current learner may write state. */
  const refreshProgress = useCallback(async () => {
    const { userId, epoch } = identity.current;
    if (!userId) return;
    progressCtl.current?.abort();
    const ctl = new AbortController();
    progressCtl.current = ctl;
    const seq = ++progressSeq.current;
    const stale = () => identity.current.epoch !== epoch || progressSeq.current !== seq;
    try {
      const data = await api.progress(ctl.signal);
      if (!stale()) setProgress({ status: "ready", data });
    } catch (e) {
      if (!stale()) setProgress({ status: "error", error: failure(e, "Could not load your progress.") });
    }
  }, []);

  const userId = me?.user.id;
  useEffect(() => {
    if (!userId) return;
    setProgress({ status: "loading" });
    void refreshProgress();
  }, [userId, refreshProgress, tick]);

  /**
   * Save a profile change. Saves run one at a time, in the order requested, so a slow earlier response can never
   * overwrite a newer choice. With `optimistic` the change is shown at once and withdrawn if the save fails; either way
   * the screen only ever treats the server's reply as saved. A save queued for one learner is dropped, not sent, if the
   * learner has changed by the time its turn comes.
   */
  const updateProfile = useCallback(async (patch: ProfilePatch, opts: { optimistic?: boolean } = {}) => {
    const epoch = identity.current.epoch;
    const id = ++patchId.current;
    if (opts.optimistic) setPending((p) => [...p, { id, patch }]);
    const cancelled = () => new ApiFailure(0, "cancelled", "You were signed out before that could be saved.");
    const run = async () => {
      try {
        if (identity.current.epoch !== epoch) throw cancelled();
        const next = await api.patchProfile(patch);
        if (identity.current.epoch !== epoch) throw cancelled();
        setConfirmed(next);
        return next;
      } finally {
        if (opts.optimistic) setPending((p) => p.filter((x) => x.id !== id));
      }
    };
    const result = writeQueue.current.then(run, run);
    writeQueue.current = result.catch(() => undefined);
    return result;
  }, []);

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
