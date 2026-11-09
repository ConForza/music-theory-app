import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { ItemInput, LearnerResponse } from "@mtp/engine";
import { AnswerInput } from "../components/exercise/AnswerInput";
import { resolveWritten, StaveEditor, toWritten, type Written } from "../components/exercise/StaveEditor";
import { layoutFragment } from "../components/notation/layout";
import { music } from "../lib/music";

afterEach(cleanup);

function Harness({ input, onValue }: { input: ItemInput; onValue: (r: LearnerResponse | null) => void }) {
  const [v, setV] = useState<LearnerResponse | null>(null);
  return <AnswerInput input={input} value={v} onChange={(r) => { setV(r); onValue(r); }} disabled={false} />;
}

describe("answer inputs keep partial choices (regression)", () => {
  it("interval: quality first, then number", async () => {
    const user = userEvent.setup();
    let last: LearnerResponse | null = null;
    render(<Harness input={{ kind: "interval-name", maxNumber: 8, qualities: ["m", "M", "P"], compound: false }} onValue={(r) => (last = r)} />);
    await user.click(screen.getByLabelText("major"));
    expect(last).toBeNull();
    await user.click(screen.getByLabelText("7th"));
    expect(last).toEqual({ kind: "interval-name", number: 7, quality: "M" });
  });
  it("chord: numeral first, then position", async () => {
    const user = userEvent.setup();
    let last: LearnerResponse | null = null;
    render(<Harness input={{ kind: "chord-name", romans: ["I", "IV", "V"], inversions: ["a", "b", "c"] }} onValue={(r) => (last = r)} />);
    await user.click(screen.getByLabelText("IV"));
    await user.click(screen.getByLabelText(/^b —/));
    expect(last).toEqual({ kind: "chord-name", roman: "IV", inversion: "b" });
  });
  it("note name: letter, accidental and octave make one spelt pitch", async () => {
    const user = userEvent.setup();
    let last: LearnerResponse | null = null;
    render(<Harness input={{ kind: "note-name", accidentals: true, doubleAccidentals: false, octave: { min: 2, max: 6 } }} onValue={(r) => (last = r)} />);
    await user.click(screen.getByLabelText("F"));
    await user.click(screen.getByLabelText("sharp"));
    await user.click(screen.getByRole("button", { name: "Octave up" }));
    expect(last).toEqual({ kind: "pitch", pitch: "F#5" });
  });
});

describe("stave writing is read like real notation", () => {
  it("an unsigned note after an accidental in the bar keeps it; a natural cancels it", () => {
    const w: Written[] = [{ pos: 1, sign: "#" }, { pos: 1, sign: "none" }, { pos: 1, sign: "" }];
    expect(resolveWritten("treble", undefined, w).map(music.formatPitch)).toEqual(["F#4", "F#4", "F4"]);
    expect(resolveWritten("treble", "G major", [{ pos: 1, sign: "none" }]).map(music.formatPitch)).toEqual(["F#4"]);
    expect(toWritten("treble", "G major", [music.parsePitch("F#4"), music.parsePitch("F4")])).toEqual([{ pos: 1, sign: "none" }, { pos: 1, sign: "" }]);
  });
  it("typed key signature becomes the written accidentals in order", async () => {
    const user = userEvent.setup();
    let last: LearnerResponse | null = null;
    render(<Harness input={{ kind: "key-signature-writer", clef: "bass", maxAccidentals: 7 }} onValue={(r) => (last = r)} />);
    await user.click(screen.getByText("Type the notes instead"));
    await user.type(screen.getByRole("textbox"), "F#3 C#3");
    await user.click(screen.getByRole("button", { name: "Write these notes" }));
    expect(last).toEqual({ kind: "key-signature", accidentals: [{ pitch: "F#3" }, { pitch: "C#3" }] });
  });
  it("per-note marks land on the note they refer to (given notes included)", () => {
    const { container } = render(
      <StaveEditor clef="bass" mode="sequence" given={["D3"]} value={[{ pos: 3, sign: "none" }, { pos: 5, sign: "#" }]} onChange={() => undefined} maxLedgerLines={1} accidentals doubleAccidentals={false} label="test" marks={[{ index: 0, ok: true }, { index: 1, ok: true }, { index: 2, ok: false }]} disabled />,
    );
    const marks = [...container.querySelectorAll(".n-mark")].map((m) => m.textContent);
    expect(marks).toEqual(["✓", "✓", "✗"]);
    expect(container.querySelectorAll("g.is-wrong").length).toBe(1);
  });
});

describe("notation layout", () => {
  it("prints accidentals from bar state and key signature, beams by the beat, and counts noteheads", () => {
    const l = layoutFragment({
      presentation: "stave", clef: "treble", key: "G major", showKeySignature: true, timeSignature: "2/4", textAlternative: "x",
      measures: [{ events: [
        { kind: "note", pitch: "F4", writtenAccidental: "natural", duration: { value: "quaver", dots: 0 }, beam: "begin" },
        { kind: "note", pitch: "F4", duration: { value: "quaver", dots: 0 }, beam: "end" },
        { kind: "note", pitch: "F#4", duration: { value: "crotchet", dots: 0 } },
      ] }],
    } as never);
    const signs = l.events.map((e) => e.glyphs.filter((g) => ["", "", ""].includes(g.ch)).length);
    expect(signs).toEqual([1, 0, 1]); // natural, carried, sharp restored
    expect(l.events[0]!.paths.some((p) => p.cls === "n-beam")).toBe(true);
    expect(l.events.flatMap((e) => e.noteIndex)).toEqual([0, 1, 2]);
    expect(l.fixed.glyphs.filter((g) => g.ch === "")).toHaveLength(1); // one sharp in the key signature
  });
});

describe("review fixes (R3, R5, R6, R7, R8)", () => {
  it("R3: a chord is read with no hidden key signature: unsigned D–F–A is submitted as written", async () => {
    const user = userEvent.setup();
    let last: LearnerResponse | null = null;
    render(<Harness input={{ kind: "chord-builder", clef: "treble", key: "D major", maxLedgerLines: 2, minNotes: 3, maxNotes: 4 }} onValue={(r) => (last = r)} />);
    await user.click(screen.getByText("Type the notes instead"));
    await user.type(screen.getByRole("textbox"), "D4 F4 A4");
    await user.click(screen.getByRole("button", { name: "Write these notes" }));
    expect(last).toEqual({ kind: "chord-notes", pitches: ["D4", "F4", "A4"] });
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "D4 F#4 A4");
    await user.click(screen.getByRole("button", { name: "Write these notes" }));
    expect(last).toEqual({ kind: "chord-notes", pitches: ["D4", "F#4", "A4"] });
  });
  it("R5: the empty equivalent-value builder does not reveal the length to match", () => {
    render(<Harness input={{ kind: "rhythm-builder", mode: "equivalent-value", timeSignature: null, bars: 1, given: [], values: ["semibreve", "minim", "crotchet"], maxDots: 1, rests: true, ties: true, tuplets: [] }} onValue={() => undefined} />);
    expect(document.querySelector(".bar-meter")!.textContent).not.toMatch(/semibreve|minim|crotchet|needed/i);
  });
  it("R6: in questions, playable notes are labelled by stave position, never by pitch name", async () => {
    const { Notation } = await import("../components/notation/Notation");
    const f = { presentation: "stave", clef: "treble", showKeySignature: false, textAlternative: "x", measures: [{ events: [{ kind: "note", pitch: "D5", duration: { value: "semibreve", dots: 0 } }] }] } as never;
    render(<Notation fragment={f} labels="positions" onActivate={() => undefined} />);
    const btn = screen.getByRole("button", { name: /^Play / });
    expect(btn.getAttribute("aria-label")).toBe("Play semibreve on the 4th line");
    cleanup();
    render(<Notation fragment={f} onActivate={() => undefined} />);
    expect(screen.getByRole("button", { name: /^Play / }).getAttribute("aria-label")).toMatch(/D5/);
  });
  it("R8: a note tied over the bar-line sounds once, for the combined length", async () => {
    const { playbackEvents } = await import("../components/notation/layout");
    const evs = playbackEvents({ clef: "treble", timeSignature: "2/4", textAlternative: "x", measures: [
      { events: [{ kind: "note", pitch: "D4", duration: { value: "crotchet", dots: 0 } }, { kind: "note", pitch: "C4", duration: { value: "crotchet", dots: 0 }, tieToNext: true }] },
      { voices: [
        { id: "a", events: [{ kind: "note", pitch: "C4", duration: { value: "crotchet", dots: 0 } }, { kind: "note", pitch: "E4", duration: { value: "crotchet", dots: 0 } }] },
        { id: "b", events: [{ kind: "rest", duration: { value: "minim", dots: 0 } }] },
      ] },
    ] } as never, 60);
    expect(evs.map((e) => e.pitches.join())).toEqual(["D4", "C4", "E4"]);
    expect(evs[1]!.dur).toBeCloseTo(2);
  });
});

describe("R7: every scheduled note stays cancellable", () => {
  it("stopAll stops all notes of a long phrase, including those past the voice limit", async () => {
    const stops: Array<{ start: number; stop: number }> = [];
    class Param { setValueAtTime() {} exponentialRampToValueAtTime() {} setTargetAtTime() {} cancelScheduledValues() {} value = 0; }
    class Node { connect(n: unknown) { return n; } }
    class Osc extends Node { type = ""; frequency = new Param(); rec = { start: 0, stop: Infinity }; start(t: number) { this.rec.start = t; stops.push(this.rec); } stop(t: number) { this.rec.stop = t; } }
    class Ctx { currentTime = 0; state = "running"; destination = {}; resume() {} createGain() { return Object.assign(new Node(), { gain: new Param() }); } createOscillator() { return new Osc(); } }
    (window as unknown as { AudioContext: unknown }).AudioContext = Ctx;
    const audio = await import("../lib/audio");
    audio.setSoundEnabled(true);
    audio.playTimed(Array.from({ length: 20 }, (_, i) => ({ at: i * 0.1, dur: 2, semis: [48 + i], id: String(i) })));
    audio.stopAll();
    expect(stops.length).toBe(60);
    // Every oscillator, including the 13th–20th notes scheduled in the future, now stops within 0.2s of "now" (0).
    expect(stops.every((s) => s.stop <= 0.2 + 1e-9)).toBe(true);
  });
});

describe("R11: practice generation recovers after a failed attempt", () => {
  it("503 generation_failed → Try again → 200 shows the question and removes the error", async () => {
    const { startApi, renderApp } = await import("./harness");
    startApi();
    await fetch("/api/auth/guest", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    await fetch("/api/me/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ onboarded: true, experience: "new" }) });
    const real = globalThis.fetch;
    let failed = false;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!failed && String(input).includes("/api/practice/generate")) {
        failed = true;
        return new Response(JSON.stringify({ error: { code: "generation_failed", message: "We couldn't make that question just now. Try another one." } }), { status: 503 });
      }
      return real(input, init);
    }) as typeof fetch;
    const user = userEvent.setup();
    renderApp("/practice/more/t.g1.note-read");
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't make that question/);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: /Name this note/ })).toBeInTheDocument();
    expect(screen.queryByText(/couldn't make that question/)).toBeNull();
    globalThis.fetch = real;
  });
});
