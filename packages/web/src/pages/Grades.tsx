import { useNavigate } from "react-router";
import { ErrorState, Loading } from "../components/Shell";
import { useApp, useCourseData } from "../state/app";
import { GradeCards } from "./GradeCards";

export function Grades() {
  const { me, updateProfile, reloadAll } = useApp();
  const data = useCourseData();
  const nav = useNavigate();
  if (data.status === "loading") return <Loading />;
  if (data.status === "error") return <ErrorState error={data.error} onRetry={reloadAll} />;
  return (
    <div className="page">
      <h1>Choose a grade</h1>
      <p className="lede-small">Each grade is its own world. Switching never loses progress.</p>
      <GradeCards
        course={data.course}
        progress={data.progress}
        selected={me!.profile.selectedGrade}
        onPick={async (g) => {
          await updateProfile({ selectedGrade: g }).catch(() => undefined);
          nav("/learn");
        }}
      />
    </div>
  );
}
