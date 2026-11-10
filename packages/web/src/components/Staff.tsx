/**
 * Compatibility layer for Brief 02 call sites: the stave is now drawn by the Brief 03 notation renderer
 * (components/notation), which supports all four clefs, key and time signatures, beams, ties, slurs,
 * tuplets, voices, ornaments and multi-stave scores.
 */
import type { NotationFragment } from "@mtp/curriculum";
import { Notation } from "./notation/Notation";
import { layoutFragment } from "./notation/layout";

export function pitchesOf(f: NotationFragment): string[] {
  return layoutFragment(f).events.flatMap((e) => e.pitches);
}

export function StaffView({ fragment, highlight = [], onPlay, size = "normal" }: { fragment: NotationFragment; highlight?: string[]; onPlay?: (pitch: string) => void; size?: "normal" | "compact" }) {
  return <Notation fragment={fragment} highlight={highlight} size={size} onActivate={onPlay ? (ev) => ev.pitches.forEach((p) => onPlay(p)) : undefined} />;
}
