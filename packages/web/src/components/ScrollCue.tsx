import { useCallback, useEffect, useState, type RefObject } from "react";

/**
 * Whether a horizontally scrolling box has more to reveal on either side. Re-measured on scroll, on resize and (where
 * available) when the box's own size changes, so rotating a phone or enlarging text updates it. Reusable by any
 * scrolling music widget.
 */
export function useScrollCue(ref: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  const [cue, setCue] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setCue((c) => (c.left === left && c.right === right ? c : { left, right }));
  }, [ref]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    if (ro && el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `deps` lets callers re-measure when their content changes
  }, [measure, ref, ...deps]);
  return cue;
}

/** Edge fades plus a short instruction, shown only while there is more to scroll to. Decorative: keyboard and screen-reader users move by focusing keys, and the browser scrolls to them. */
export function ScrollCueText({ left, right, what }: { left: boolean; right: boolean; what: string }) {
  if (!left && !right) return null;
  return (
    <p className="scroll-cue" aria-hidden="true">
      {left && <span>←</span>} Swipe to see more {what} {right && <span>→</span>}
    </p>
  );
}
