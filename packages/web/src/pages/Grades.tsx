import { useState } from "react";
import { useNavigate } from "react-router";
import { ErrorState, Loading } from "../components/Shell";
import { saveFailure } from "../lib/errors";
import { useApp, useCourseData } from "../state/app";
import { GradeCards } from "./GradeCards";

export function Grades() {
  const { me, updateProfile, reloadAll } = useApp();
  const data = useCourseData();
  const nav = useNavigate();
  const [saving, setSaving] = useState<number | null>(null);
  const [failed, setFailed] = useState<{ grade: number; message: string } | null>(null);
  if (data.status === "loading") return <Loading />;
  if (data.status === "error") return <ErrorState error={data.error} onRetry={reloadAll} />;

  /** Save first, then go. A failure keeps the learner here with the old grade still shown and a way to retry. */
  async function pick(g: number) {
    if (saving !== null) return;
    setFailed(null);
    if (g === me!.profile.selectedGrade) return nav("/learn");
    setSaving(g);
    try {
      await updateProfile({ selectedGrade: g });
      nav("/learn");
    } catch (e) {
      setFailed({ grade: g, message: saveFailure(e, `Grade ${g}`) });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="page">
      <h1>Choose a grade</h1>
      <p className="lede-small">Each grade is its own world. Switching never loses progress.</p>
      <GradeCards course={data.course} progress={data.progress} selected={me!.profile.selectedGrade} saving={saving} onPick={pick} />
      {saving !== null && <p role="status" className="muted">Saving Grade {saving}…</p>}
      {failed && (
        <div className="form-error" role="alert">
          <p>{failed.message} You're still on Grade {me!.profile.selectedGrade}.</p>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => void pick(failed.grade)}>Try again</button>
        </div>
      )}
    </div>
  );
}
