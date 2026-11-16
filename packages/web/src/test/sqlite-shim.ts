// jsdom tests run through Vite's "client" pipeline, which refuses to bundle node:sqlite; load it with require instead.
import { createRequire } from "node:module";

export const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
