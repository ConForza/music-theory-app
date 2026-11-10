import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { api, ApiFailure, type Settings as SettingsT } from "../api/client";
import { SignOutButton } from "../components/SignOutButton";
import { saveFailure } from "../lib/errors";
import { useApp } from "../state/app";

function Segmented<T extends string>({ legend, value, options, onChange }: { legend: string; value: T; options: Array<{ v: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <fieldset className="segmented">
      <legend>{legend}</legend>
      <div>
        {options.map((o) => (
          <label key={o.v} className={value === o.v ? "is-selected" : ""}>
            <input type="radio" name={legend} checked={value === o.v} onChange={() => onChange(o.v)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Settings() {
  const { me, updateProfile, setMe } = useApp();
  const nav = useNavigate();
  const s = me!.profile.settings;
  const [name, setName] = useState(me!.user.displayName);
  const nameNow = useRef(name); // what the field shows right now, readable from async callbacks
  nameNow.current = name;
  const confirmedName = useRef(me!.user.displayName); // the last nickname the server confirmed
  confirmedName.current = me!.user.displayName;
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [saving, setSaving] = useState(0);
  const [failures, setFailures] = useState<Record<string, { message: string; retry: () => void }>>({});
  const [saved, setSaved] = useState(false);

  /**
   * Save one change. The control moves at once, but only the server's reply counts as saved: on failure the control goes
   * back to the last confirmed value and the problem is shown with a Retry. "Saved" appears only when nothing is in
   * flight and nothing has failed.
   */
  const track = async (key: string, what: string, send: () => Promise<unknown>) => {
    setSaving((n) => n + 1);
    setSaved(false);
    try {
      await send();
      setFailures(({ [key]: _done, ...rest }) => rest);
      setSaved(true);
    } catch (e) {
      if (e instanceof ApiFailure && e.code === "cancelled") return;
      setFailures((f) => ({ ...f, [key]: { message: `${saveFailure(e, what)} It's back to how it was.`, retry: () => void track(key, what, send) } }));
    } finally {
      setSaving((n) => n - 1);
    }
  };
  const save = (key: keyof SettingsT, what: string, patch: Partial<SettingsT>) =>
    track(key, what, () => updateProfile({ settings: patch }, { optimistic: true }));
  const failureList = Object.entries(failures);

  async function download() {
    try {
      const data = await api.exportData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: "music-theory-path-data.json" });
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMsg(e instanceof ApiFailure ? e.message : "Couldn't prepare your data.");
    }
  }

  async function remove() {
    try {
      await api.deleteAccount();
      setMe(null);
      nav("/welcome", { replace: true });
    } catch (e) {
      setMsg(e instanceof ApiFailure ? e.message : "Couldn't delete your data.");
    }
  }

  return (
    <div className="page">
      <h1>Settings</h1>
      {msg && <p className="form-error" role="alert">{msg}</p>}
      {failureList.map(([key, f]) => (
        <div key={key} className="form-error" role="alert">
          <p>{f.message}</p>
          <button type="button" className="btn btn-ghost btn-small" onClick={f.retry}>Try again</button>
        </div>
      ))}
      <p className="muted small save-status" role="status" aria-live="polite">{saving > 0 ? "Saving…" : saved && failureList.length === 0 ? "Saved." : ""}</p>

      <section className="card" aria-labelledby="look-h">
        <h2 id="look-h">Look and feel</h2>
        <Segmented legend="Appearance" value={s.theme} options={[{ v: "system", label: "Match my device" }, { v: "light", label: "Light" }, { v: "dark", label: "Dark" }]} onChange={(theme) => save("theme", "your appearance setting", { theme })} />
        <Segmented legend="Animations" value={s.motion} options={[{ v: "system", label: "Match my device" }, { v: "reduce", label: "Reduce" }, { v: "full", label: "Full" }]} onChange={(motion) => save("motion", "your animation setting", { motion })} />
        <label className="switch">
          <input type="checkbox" role="switch" checked={s.sound} onChange={(e) => save("sound", "your sound setting", { sound: e.target.checked })} />
          <span>Play sounds</span>
          <small>Notes in lessons and little cues when you answer. Everything works without sound.</small>
        </label>
      </section>

      <section className="card" aria-labelledby="goal-h">
        <h2 id="goal-h">Daily goal</h2>
        <p className="muted small">A meaningful session is a lesson finished or a review completed. Opening the app doesn't count. The goal and streak are optional, and missing a day never takes anything away.</p>
        <Segmented
          legend="Sessions a day"
          value={String(me!.profile.dailyGoal)}
          options={[{ v: "0", label: "Off" }, { v: "1", label: "1 (default)" }, { v: "2", label: "2" }, { v: "3", label: "3" }]}
          onChange={(v) => track("goal", "your daily goal", () => updateProfile({ dailyGoal: Number(v) }, { optimistic: true }))}
        />
        <p className="muted small">Your days follow your device's clock ({me!.profile.timezone}), including summer-time changes.</p>
      </section>

      <section className="card" aria-labelledby="who-h">
        <h2 id="who-h">About you</h2>
        <form className="form" onSubmit={(e) => { e.preventDefault(); const attempted = name;
            // The field shows what is being saved. If the save fails it goes back to the LATEST confirmed nickname (read when
            // the failure happens, since earlier queued saves may have succeeded meanwhile), unless the learner has already
            // typed something newer. Retry shows the attempted value again.
            void track("name", "your nickname", () => {
              setName(attempted);
              return updateProfile({ displayName: attempted }).then(
                (saved) => {
                  confirmedName.current = saved.user.displayName;
                  return saved;
                },
                (err: unknown) => {
                  if (nameNow.current === attempted) setName(confirmedName.current);
                  throw err;
                },
              );
            }); }}>
          <label>Nickname<input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} /></label>
          <button className="btn btn-ghost" disabled={!name.trim() || name === me!.user.displayName}>Save nickname</button>
        </form>
        <p className="muted small">Reminder notifications are off, and there are none to turn on yet.</p>
      </section>

      <section className="card" aria-labelledby="data-h">
        <h2 id="data-h">Your data</h2>
        <p>Download everything we hold about you, or delete it for good.</p>
        <div className="row">
          <button className="btn btn-ghost" onClick={download}>Download my data</button>
          {!confirmDelete ? (
            <button className="btn btn-danger-quiet" onClick={() => setConfirmDelete(true)}>Delete my data…</button>
          ) : (
            <div role="alertdialog" aria-labelledby="del-h" className="confirm">
              <p id="del-h"><strong>Delete your account and all progress?</strong> This can't be undone.</p>
              <button className="btn btn-danger" onClick={remove}>Yes, delete everything</button>
              <button className="btn btn-quiet" onClick={() => setConfirmDelete(false)}>Keep my account</button>
            </div>
          )}
        </div>
      </section>

      <SignOutButton />
      <p className="fine-print">Music Theory Path is independent and not affiliated with or endorsed by ABRSM. Practice material is not an official examination.</p>
    </div>
  );
}
