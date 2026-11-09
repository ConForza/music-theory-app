#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { bundleCurriculum } from "./bundle.ts";
import { checkDocs, writeDocs } from "./docs.ts";
import { loadCurriculum } from "./load.ts";
import { validateContentRoot } from "./validate.ts";

function printIssues(title: string, list: Array<{ code: string; where: string; message: string }>, limit = 200) {
  if (!list.length) return;
  console.log(`\n${title} (${list.length})`);
  for (const i of list.slice(0, limit)) console.log(`  [${i.code}] ${i.where}: ${i.message}`);
  if (list.length > limit) console.log(`  … ${list.length - limit} more`);
}

function main(argv: string[]): number {
  const [command = "validate", ...rest] = argv;
  const flags = new Set(rest.filter((a) => a.startsWith("--")));
  const rootArg = rest.find((a) => !a.startsWith("--"));

  if (command === "validate") {
    const release = flags.has("--release");
    const report = validateContentRoot(rootArg, { release });
    console.log(`Music Theory Path curriculum validation${release ? " (RELEASE GATE)" : ""}`);
    console.log(Object.entries(report.stats).map(([k, v]) => `${k}=${v}`).join("  "));
    printIssues("Errors", report.errors);
    printIssues("Warnings", report.warnings, flags.has("--all-warnings") ? Infinity : 40);
    if (report.errors.length) {
      console.log(`\nFAILED: ${report.errors.length} error(s).`);
      return 1;
    }
    console.log(
      release
        ? "\nRelease gate passed."
        : "\nPASSED (structural). Coverage is PLANNED, not verified: teacher review is still required before any coverage claim.",
    );
    return 0;
  }
  if (command === "docs") {
    const { curriculum, issues } = loadCurriculum(rootArg);
    if (!curriculum) {
      printIssues("Errors", issues);
      return 1;
    }
    if (flags.has("--write")) {
      for (const f of writeDocs(curriculum)) console.log(`wrote ${f}`);
      return 0;
    }
    const stale = checkDocs(curriculum);
    if (stale.length) {
      console.log(`Generated docs are out of date: ${stale.join(", ")}\nRun: npm run docs:generate`);
      return 1;
    }
    console.log("Generated docs are up to date.");
    return 0;
  }
  if (command === "bundle") {
    const out = rest[rest.indexOf("--out") + 1];
    const { curriculum, issues } = loadCurriculum(rest.find((a, i) => !a.startsWith("--") && rest[i - 1] !== "--out"));
    if (!curriculum || !out || rest.indexOf("--out") < 0) {
      printIssues("Errors", issues);
      if (!out) console.error("Usage: bundle --out <file.json>");
      return 1;
    }
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(bundleCurriculum(curriculum), null, 2));
    console.log(`wrote ${out}`);
    return 0;
  }
  console.error(`Unknown command "${command}". Use: validate [--release] | docs --write | docs --check | bundle --out <file>`);
  return 2;
}

process.exitCode = main(process.argv.slice(2));
