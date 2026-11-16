/** Registers the Bravura music font (SIL OFL 1.1, bundled from @vexflow-fonts/bravura) once per page. */
import bravura from "@vexflow-fonts/bravura/bravura.woff2?url";

/**
 * The font is registered with the CSS Font Loading API, not by injecting a <style> element: the Content-Security-Policy is
 * `style-src 'self'` with no 'unsafe-inline', which (rightly) blocks injected style elements, and the music font must not depend on
 * weakening that. Where the API does not exist (the unit-test DOM), the old <style> element is still used.
 */
if (typeof document !== "undefined" && !document.getElementById("mtp-bravura")) {
  const link = document.createElement("link");
  link.id = "mtp-bravura";
  link.rel = "preload";
  link.as = "font";
  link.type = "font/woff2";
  link.crossOrigin = "anonymous";
  link.href = bravura;
  document.head.appendChild(link);
  if (typeof FontFace !== "undefined" && document.fonts?.add) {
    const face = new FontFace("Bravura", `url(${bravura}) format("woff2")`, { display: "block" });
    document.fonts.add(face);
    // Start loading at once (as the preload does) so the first notation does not wait for layout to ask for it.
    void face.load().catch(() => undefined);
  } else {
    const style = document.createElement("style");
    style.textContent = `@font-face{font-family:"Bravura";src:url(${bravura}) format("woff2");font-display:block}`;
    document.head.appendChild(style);
  }
}
