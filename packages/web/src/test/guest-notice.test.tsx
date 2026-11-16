import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import type { Me } from "../api/client";
import { GuestExpiryNotice, guestDaysLeft } from "../components/GuestNotice";

afterEach(cleanup);

/** Final release hardening: a guest is told, in plain words, before their access on this device ends; nobody else sees the notice. */
const me = (isGuest: boolean, days: number | null, warn = 14): Me =>
  ({
    user: { id: "u", email: isGuest ? null : "a@example.com", displayName: "Ada", isGuest },
    profile: { experience: "new", selectedGrade: 1, onboarded: true, settings: { theme: "system", motion: "system", sound: true, examExtraTime: 0 }, timezone: "UTC", dailyGoal: 1 },
    session: { expiresAt: days === null ? null : new Date(Date.now() + (days + 0.5) * 86400_000).toISOString(), guestAccessEndsInDays: isGuest ? days : null, guestWarningDays: warn },
  }) as Me;
const show = (m: Me | null) => render(<MemoryRouter><GuestExpiryNotice me={m} /></MemoryRouter>);

describe("guest expiry notice", () => {
  it("says nothing while a guest has plenty of time left", () => {
    show(me(true, 45));
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("warns a guest inside the warning period, offers an account without demanding one, and links to the profile", () => {
    show(me(true, 9));
    const note = screen.getByRole("status", { name: "Guest access ending soon" });
    expect(note.textContent).toMatch(/Your guest access on this device ends in 9 days/);
    expect(note.textContent).toMatch(/If you'd like to keep it, create a free account/);
    expect(note.textContent).not.toMatch(/must|have to|required/i);
    expect(screen.getByRole("link", { name: "Keep my progress" }).getAttribute("href")).toBe("/profile");
  });
  it("uses plain words for the last days", () => {
    show(me(true, 1));
    expect(screen.getByRole("status").textContent).toMatch(/ends tomorrow/);
    cleanup();
    show(me(true, 0));
    expect(screen.getByRole("status").textContent).toMatch(/ends today/);
  });
  it("never shows for a registered learner, a signed-out visitor, or when the server gave no figure", () => {
    for (const m of [me(false, 3), null, me(true, null), { ...me(true, 3), session: undefined } as Me]) {
      show(m);
      expect(screen.queryByRole("status")).toBeNull();
      cleanup();
    }
    expect(guestDaysLeft(me(false, 3))).toBeNull();
    expect(guestDaysLeft(me(true, 3))).toBe(3);
  });
});
