import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it } from "vitest";
import { renderApp, startApi } from "./harness";

beforeEach(() => {
  window.scrollTo = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});
afterEach(cleanup);

it("a saved review whose questions were replaced says so and offers a way back, never a silent redirect", async () => {
  const api = startApi();
  const user = userEvent.setup();
  renderApp("/");
  await user.click(await screen.findByRole("link", { name: "Get started" }));
  await user.click(screen.getByRole("button", { name: /New to music theory/ }));
  await user.click(screen.getByRole("button", { name: "Try it as a guest" }));
  await screen.findByRole("region", { name: /Treble clef: notes on the lines/ });
  const uid = (api.app.db.prepare("SELECT id FROM users LIMIT 1").get() as { id: string }).id;
  const stale = [{ itemId: "i.gen.gone.v1.s1.deadbeef", conceptId: "c.clefs.treble-lines", kind: "review", stale: true }];
  api.app.db.prepare("INSERT INTO review_sessions (user_id,id,status,started_at,local_date,timezone,curriculum_version,rules_version,items) VALUES (?,?,'open',?,?,?,?,?,?)").run(uid, "old-review", "2026-03-02T12:00:00Z", "2026-03-02", "UTC", "0", "0", JSON.stringify(stale));
  cleanup();
  renderApp("/review/session/old-review");
  expect(await screen.findByRole("heading", { name: "This review was interrupted" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to Review" })).toBeInTheDocument();
  expect(screen.getByText(/already answered still counted/)).toBeInTheDocument();
});

it("reopening a review that was already closed shows a working way back, not a failed save", async () => {
  const api = startApi();
  const user = userEvent.setup();
  renderApp("/");
  await user.click(await screen.findByRole("link", { name: "Get started" }));
  await user.click(screen.getByRole("button", { name: /New to music theory/ }));
  await user.click(screen.getByRole("button", { name: "Try it as a guest" }));
  await screen.findByRole("region", { name: /Treble clef: notes on the lines/ });
  const uid = (api.app.db.prepare("SELECT id FROM users LIMIT 1").get() as { id: string }).id;
  api.app.db.prepare("INSERT INTO review_sessions (user_id,id,status,started_at,local_date,timezone,curriculum_version,rules_version,items) VALUES (?,?,'abandoned',?,?,?,?,?,?)").run(uid, "closed-review", "2026-03-02T12:00:00Z", "2026-03-02", "UTC", "0", "0", "[]");
  cleanup();
  renderApp("/review/session/closed-review");
  expect(await screen.findByRole("heading", { name: "This review is closed" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to Review" })).toBeInTheDocument();
  expect(screen.queryByText(/couldn't save your review/i)).toBeNull();
});
