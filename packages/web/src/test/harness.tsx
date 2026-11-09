import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { createApp, loadCourse, openDb, type Course } from "@mtp/api";
import { App } from "../App";
import { AppProvider } from "../state/app";

let course: Course | undefined;

/** A real API (in-memory SQLite, real curriculum) behind a cookie-aware fetch, so UI tests exercise the whole stack. */
export function startApi(opts: { waive?: boolean } = {}) {
  course ??= loadCourse();
  const app = createApp({ db: openDb(":memory:"), course, waiveUnwrittenPrerequisites: opts.waive ?? true });
  let cookie = "";
  let offline = false;
  let lose = 0; // responses to drop after the server has handled the request
  let failPath: RegExp | null = null;
  // Targeted faults, matched on "METHOD /path": fail before the server sees it, lose the reply after, hold the reply, or never answer.
  const failNext: Array<{ re: RegExp; left: number; status: number }> = [];
  const loseNext: Array<{ re: RegExp; left: number }> = [];
  const dropNext: Array<{ re: RegExp; left: number }> = [];
  const holds: Array<{ re: RegExp; left: number; gate: Promise<void>; open: () => void; seen: number; fail: boolean }> = [];
  const stalls: RegExp[] = [];
  const calls: string[] = [];
  const aborted = (init: RequestInit) =>
    new Promise<never>((_, reject) => {
      const fail = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      if (init.signal?.aborted) fail();
      else init.signal?.addEventListener("abort", fail, { once: true });
    });
  const fake = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" ? input : input.toString(), "http://test.local");
    const label = `${init.method ?? "GET"} ${url.pathname}`;
    calls.push(label);
    if (offline) throw new TypeError("network down");
    const headers = new Headers(init.headers);
    if (cookie) headers.set("cookie", cookie);
    if (stalls.some((re) => re.test(label))) return aborted(init);
    const dn = dropNext.find((f) => f.left > 0 && f.re.test(label));
    if (dn) {
      dn.left--;
      throw new TypeError("network error before the server saw the request");
    }
    const ff = failNext.find((f) => f.left > 0 && f.re.test(label));
    if (ff) {
      ff.left--;
      return new Response(JSON.stringify({ error: { code: "internal", message: "boom" } }), { status: ff.status });
    }
    if (failPath?.test(url.pathname)) return new Response(JSON.stringify({ error: { code: "internal", message: "boom" } }), { status: 500 });
    const res = await app.fetch(new Request(url, { ...init, headers }));
    const hold = holds.find((h) => h.left > 0 && h.re.test(label));
    if (hold) {
      hold.left--;
      hold.seen++;
      await Promise.race([hold.gate, aborted(init)]); // the server has already answered; only the delivery is late
      if (hold.fail) throw new TypeError("delivery failed");
    }
    const ln = loseNext.find((f) => f.left > 0 && f.re.test(label));
    if (ln) {
      ln.left--;
      throw new TypeError("response lost"); // the browser never saw the reply, so it never stored its cookie
    }
    if (lose > 0) {
      lose--;
      throw new TypeError("response lost");
    }
    for (const c of res.headers.getSetCookie()) {
      const pair = c.split(";")[0]!;
      cookie = pair.endsWith("=") ? "" : pair;
    }
    return res;
  };
  globalThis.fetch = fake as typeof fetch;
  return {
    app,
    course,
    /** Fail the next `n` matching requests with `status` before the server sees them. */
    failNext: (re: RegExp, n = 1, status = 500) => void failNext.push({ re, left: n, status }),
    /** The server handles the next `n` matching requests (and sets any cookie), but the reply never reaches the page. */
    /** The next `n` matching requests fail at the network, before the server sees them. */
    dropNext: (re: RegExp, n = 1) => void dropNext.push({ re, left: n }),
    loseNext: (re: RegExp, n = 1) => void loseNext.push({ re, left: n }),
    /** Delay delivery of the next `n` matching replies until release() is called. */
    hold: (re: RegExp, n = 1) => {
      let open!: () => void;
      const gate = new Promise<void>((r) => (open = r));
      const h = { re, left: n, gate, open, seen: 0, fail: false };
      holds.push(h);
      return {
        release: () => open(),
        /** Release, but the reply never arrives: the page sees a network failure. */
        releaseAsFailure: () => {
          h.fail = true;
          open();
        },
        seen: () => h.seen,
      };
    },
    /** Matching requests never answer; they end only when the page aborts or times them out. */
    stall: (re: RegExp) => void stalls.push(re),
    unstall: () => void (stalls.length = 0),
    /** Every request the page attempted, as "METHOD /path", in order. */
    calls,
    cookie: () => cookie,
    setCookie: (c: string) => void (cookie = c),
    setOffline: (v: boolean) => (offline = v),
    loseResponses: (n: number) => (lose = n),
    failRequests: (re: RegExp | null) => (failPath = re),
  };
}

export function renderApp(route = "/") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppProvider>
        <App />
      </AppProvider>
    </MemoryRouter>,
  );
}

/** Play the sample lesson to completion through the API as whoever the fake browser is signed in as. */
export async function completeSampleLesson(course: Course, nodeId = "G1-U3-L03") {
  const { api } = await import("../api/client");
  await api.start(nodeId);
  for (const item of course.lesson(nodeId)!.items) {
    const a = course.authoredItems(nodeId).find((i) => i.id === item.id)!.answer;
    const response =
      a.kind === "pitch" ? { kind: "pitch-letter" as const, letter: a.accepted[0]!.charAt(0) }
      : a.kind === "staff-position" ? { kind: "staff-position" as const, pitch: a.accepted[0]! }
      : { kind: "choice" as const, optionId: (a as { correctOptionIds: string[] }).correctOptionIds[0]! };
    await api.attempt(nodeId, crypto.randomUUID(), item.id, response);
  }
  return api.complete(nodeId);
}
