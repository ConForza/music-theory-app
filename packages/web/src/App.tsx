import { Navigate, Route, Routes } from "react-router";
import { RequireAuth, PublicOnly } from "./components/Guards";
import { NotFoundView, Shell } from "./components/Shell";
import { Grades } from "./pages/Grades";
import { Learn } from "./pages/Learn";
import { Lesson } from "./pages/Lesson";
import { Onboarding } from "./pages/Onboarding";
import { Practice, PracticeMore, PracticeSetPlayer } from "./pages/Practice";
import { Profile } from "./pages/Profile";
import { Progress } from "./pages/Progress";
import { Settings } from "./pages/Settings";
import { SignIn } from "./pages/SignIn";
import { Unit } from "./pages/Unit";
import { Welcome } from "./pages/Welcome";
import { useApp } from "./state/app";

export function App() {
  const { me } = useApp();
  return (
    <Routes>
      <Route path="/" element={<Navigate to={me ? "/learn" : "/welcome"} replace />} />
      <Route path="/welcome" element={<Welcome />} />
      <Route element={<PublicOnly />}>
        <Route path="/signin" element={<SignIn />} />
        <Route path="/onboarding" element={<Onboarding />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="/lesson/:nodeId" element={<Lesson />} />
        <Route path="/practice/more/:templateId" element={<PracticeMore />} />
        <Route path="/practice/:setId" element={<PracticeSetPlayer />} />
        <Route element={<Shell />}>
          <Route path="/learn" element={<Learn />} />
          <Route path="/grades" element={<Grades />} />
          <Route path="/practice" element={<Practice />} />
          <Route path="/unit/:unitId" element={<Unit />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundView />} />
    </Routes>
  );
}
