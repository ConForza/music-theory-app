/** Registers the Bravura music font (SIL OFL 1.1, bundled from @vexflow-fonts/bravura) once per page. */
import bravura from "@vexflow-fonts/bravura/bravura.woff2?url";

if (typeof document !== "undefined" && !document.getElementById("mtp-bravura")) {
  const style = document.createElement("style");
  style.id = "mtp-bravura";
  style.textContent = `@font-face{font-family:"Bravura";src:url(${bravura}) format("woff2");font-display:block}`;
  document.head.appendChild(style);
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "font";
  link.type = "font/woff2";
  link.crossOrigin = "anonymous";
  link.href = bravura;
  document.head.appendChild(link);
}
