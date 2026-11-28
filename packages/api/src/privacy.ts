/**
 * The privacy notice (student release): a plain page at /privacy, readable WITHOUT signing in (parents read it before handing over a class
 * code), with a short part for students and a fuller part for parents and carers.
 *
 * The text below describes what this code actually does. The owner fills in who runs the service and how to contact them, and states
 * that they have read and approved the notice (MTP_PRIVACY_NOTICE_APPROVED=YYYY-MM-DD); the student release refuses to start until they
 * have (config.ts#studentReleaseProblem). Until then the page shows a DRAFT banner. Changing how data is handled means changing this text
 * in the same pull request, and the owner re-approving it with a new date.
 *
 * It is a starting point written from the code, not legal advice: the lawful basis, children's-code assessment and retention choices are
 * the owner's (docs/PRIVACY_PLAN.md, docs/release/STUDENT_RELEASE.md).
 */
import { backupSettingsFromEnv } from "./backups.ts";
import { retentionPolicyFromEnv } from "./retention.ts";

export const PRIVACY_PATH = "/privacy";
export const PRIVACY_STYLE_PATH = "/privacy.css";

export interface PrivacySettings {
  /** Who runs the service (the data controller), e.g. "Jane Smith Piano Studio". */
  operator: string | null;
  /** How to reach them about data: an email address. */
  contact: string | null;
  /** The date (YYYY-MM-DD) the owner approved this text; null shows the draft banner. */
  approvedOn: string | null;
  /** Where the data is hosted, as shown to readers. */
  hosting: string;
  /** Days an automatic backup is kept (null: automatic backups are off). */
  backupDays: number | null;
  /** Days after which an inactive guest's data is deleted, when the owner has approved deletion; null otherwise. */
  guestDays: number | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function privacySettingsFromEnv(env: Record<string, string | undefined>): PrivacySettings {
  const clean = (v: string | undefined) => (v && v.trim() ? v.trim().slice(0, 200) : null);
  const approved = clean(env.MTP_PRIVACY_NOTICE_APPROVED);
  let backupDays: number | null;
  try {
    backupDays = backupSettingsFromEnv(env)?.keep ?? null;
  } catch {
    backupDays = null; // a malformed backup setting stops start-up elsewhere
  }
  const retention = retentionPolicyFromEnv(env);
  return {
    operator: clean(env.MTP_PRIVACY_OPERATOR),
    contact: clean(env.MTP_PRIVACY_CONTACT),
    approvedOn: approved && DATE.test(approved) ? approved : null,
    hosting: clean(env.MTP_PRIVACY_HOSTING) ?? "Railway, in its EU West (Amsterdam) region",
    backupDays,
    guestDays: retention.deleteGuests ? retention.guestInactiveDays : null,
  };
}

/** What is missing before the notice can be shown to students (empty when ready). */
export function privacyProblems(s: PrivacySettings, env: Record<string, string | undefined>): string[] {
  const out: string[] = [];
  if (!s.operator) out.push("MTP_PRIVACY_OPERATOR (who runs the service, as parents should see it)");
  if (!s.contact || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.contact)) out.push("MTP_PRIVACY_CONTACT (an email address parents can write to about their child's data)");
  if (!s.approvedOn) out.push(`MTP_PRIVACY_NOTICE_APPROVED (the date, YYYY-MM-DD, you read and approved ${PRIVACY_PATH}${env.MTP_PRIVACY_NOTICE_APPROVED ? `; "${env.MTP_PRIVACY_NOTICE_APPROVED}" is not a date` : ""})`);
  return out;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function privacyPage(s: PrivacySettings): string {
  const who = s.operator ? esc(s.operator) : "[the person or studio running this service]";
  const mail = s.contact ? `<a href="mailto:${esc(s.contact)}">${esc(s.contact)}</a>` : "[contact email]";
  const backups =
    s.backupDays !== null
      ? `We keep automatic backup copies of the database so a mistake can be put right. Each copy is deleted after ${s.backupDays} days, so information you delete is gone from the backups too within ${s.backupDays} days.`
      : "Backup copies of the database may be taken before updates; they are deleted when no longer needed.";
  const guests =
    s.guestDays !== null
      ? `A guest's progress (used without an account) is deleted after ${s.guestDays} days without use.`
      : "A guest's progress (used without an account) stays until you ask us to delete it. Guest access on a device ends after 60 days.";
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<title>Privacy notice · Music Theory Path</title>
<link rel="stylesheet" href="${PRIVACY_STYLE_PATH}">
</head>
<body>
<main>
${s.approvedOn ? "" : `<p class="draft" role="note"><strong>Draft.</strong> This notice has not been approved by the person running this service yet.</p>`}
<h1>Privacy notice</h1>
<p class="lead">Music Theory Path is run by ${who}. ${s.approvedOn ? `This notice was last updated on ${longDate(s.approvedOn)}.` : ""}</p>

<section aria-labelledby="students">
<h2 id="students">For students</h2>
<ul>
<li>We keep the name you choose, your email and password (if you make an account), and your answers and progress, so the app can remember where you are and what to practise next.</li>
<li>Only you can see your progress. There are no leaderboards, no public profiles and no chatting.</li>
<li>There are no adverts, and we don't sell or share your information.</li>
<li>Use a nickname if you like: it doesn't have to be your real name.</li>
<li>You can download everything we keep, or delete your account, at any time in <strong>Settings</strong> → <strong>Your data</strong>.</li>
<li>If something worries you, talk to your parent, carer or teacher.</li>
</ul>
</section>

<section aria-labelledby="parents">
<h2 id="parents">For parents and carers</h2>

<h3>Who is responsible</h3>
<p>${who} is responsible for this information (the "data controller"). Contact: ${mail}.</p>

<h3>What we collect</h3>
<ul>
<li><strong>Account</strong> (only if one is made): a display name, an email address used to sign in, and the password, stored only in a scrambled (hashed) form we cannot read.</li>
<li><strong>Learning records</strong>: answers to questions, lesson progress, practice and examination results, hints used, points (XP), streaks, badges and review schedules.</li>
<li><strong>Settings</strong>: daily goal, time zone (for daily streaks) and the optional extra-time setting for practice examinations.</li>
<li><strong>Sign-in cookies</strong>: small files that keep the device signed in. They are needed for the app to work; we use no advertising or tracking cookies and no analytics.</li>
</ul>
<p>We do not ask for a child's age, date of birth, school, address, photo or real name, and nobody else using the app can see any of this.</p>

<h3>Why we use it</h3>
<p>Only to provide the course: to save progress, mark answers, choose review questions and show the learner their own results. We never use it for advertising, profiling for marketing, or selling, and we do not send marketing email.</p>

<h3>Where it is kept, and who else handles it</h3>
<p>The app and its database are hosted by ${esc(s.hosting)}. Like any website, the hosting provider's systems see a device's internet address in order to deliver pages. No other company receives learners' information.</p>

<h3>How long we keep it</h3>
<ul>
<li>An account and its learning records are kept until the learner deletes the account (Settings → Your data), or you ask us to delete it.</li>
<li>${guests}</li>
<li>${backups}</li>
</ul>

<h3>Your rights</h3>
<p>You can ask to see, download, correct or delete your child's information, or object to how we use it. Learners can download a copy or delete their account themselves in <strong>Settings</strong> → <strong>Your data</strong>; deleting removes every learning record. For anything else, write to ${mail}.</p>
<p>If you are unhappy with how we have handled information, please tell us first. You can also complain to the Information Commissioner's Office (ICO): <a href="https://ico.org.uk/make-a-complaint/">ico.org.uk/make-a-complaint</a> or 0303 123 1113.</p>

<h3>About the course</h3>
<p>Music Theory Path teaches towards the ABRSM Grades 1–5 music theory syllabus. It is not affiliated with or endorsed by ABRSM, and its practice examinations are not official examinations.</p>
</section>
<p class="back"><a href="/">Back to the app</a></p>
</main>
</body>
</html>`;
}

export const PRIVACY_STYLE = `:root{--bg:#f4f6fb;--surface:#fff;--ink:#1c1d2b;--muted:#5b5e76;--line:#d9dbe7;--brand:#0b7f74;--warn-bg:#fff4d6;--warn-ink:#5c4300;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#11121b;--surface:#1c1e2b;--ink:#eef0fa;--muted:#a9adc6;--line:#2b2e45;--brand:#3fd6c6;--warn-bg:#3a3010;--warn-ink:#ffe7a3}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:1.0625rem/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:42rem;margin:0 auto;padding:max(1.5rem,env(safe-area-inset-top)) max(1rem,env(safe-area-inset-right)) max(2rem,env(safe-area-inset-bottom)) max(1rem,env(safe-area-inset-left))}
h1{font-size:1.8rem;margin:.5rem 0}.lead{color:var(--muted)}
section{background:var(--surface);border:2px solid var(--line);border-radius:20px;padding:.25rem 1.25rem 1rem;margin:1.25rem 0}
h2{font-size:1.35rem}h3{font-size:1.05rem;margin:1.25rem 0 .25rem}ul{padding-left:1.25rem}li{margin:.35rem 0}
a{color:var(--brand)}.draft{background:var(--warn-bg);color:var(--warn-ink);border-radius:12px;padding:.75rem 1rem}.back{margin-top:1.5rem}`;

export function privacyResponse(path: string, method: string, s: PrivacySettings): Response | null {
  if (method !== "GET" && method !== "HEAD") return null;
  if (path === PRIVACY_PATH) return new Response(privacyPage(s), { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
  if (path === PRIVACY_STYLE_PATH) return new Response(PRIVACY_STYLE, { status: 200, headers: { "content-type": "text/css; charset=utf-8", "cache-control": "no-cache" } });
  return null;
}
