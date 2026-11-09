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
  const fake = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    if (offline) throw new TypeError("network down");
    const url = new URL(typeof input === "string" ? input : input.toString(), "http://test.local");
    const headers = new Headers(init.headers);
    if (cookie) headers.set("cookie", cookie);
    if (failPath?.test(url.pathname)) return new Response(JSON.stringify({ error: { code: "internal", message: "boom" } }), { status: 500 });
    const res = await app.fetch(new Request(url, { ...init, headers }));
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
  return { app, course, setOffline: (v: boolean) => (offline = v), loseResponses: (n: number) => (lose = n), failRequests: (re: RegExp | null) => (failPath = re) };
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
