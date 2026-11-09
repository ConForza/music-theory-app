import { Navigate, Route, Routes } from "react-router";
import { RequireAuth, PublicOnly } from "./components/Guards";
import { Loading, NotFoundView, Shell } from "./components/Shell";
import { Grades } from "./pages/Grades";
import { Learn } from "./pages/Learn";
import { Lesson } from "./pages/Lesson";
import { Onboarding } from "./pages/Onboarding";
import { Profile } from "./pages/Profile";
import { Progress } from "./pages/Progress";
import { Settings } from "./pages/Settings";
import { SignIn } from "./pages/SignIn";
import { Unit } from "./pages/Unit";
import { Welcome } from "./pages/Welcome";
import { useApp } from "./state/app";

/** The front door: wait to learn who is signed in, then go to their path or the welcome page. */
function Home() {
  const { me } = useApp();
  if (me === undefined) return <Loading />;
  return <Navigate to={me ? "/learn" : "/welcome"} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/welcome" element={<Welcome />} />
      <Route element={<PublicOnly />}>
        <Route path="/signin" element={<SignIn />} />
        <Route path="/onboarding" element={<Onboarding />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="/lesson/:nodeId" element={<Lesson />} />
        <Route element={<Shell />}>
          <Route path="/learn" element={<Learn />} />
          <Route path="/grades" element={<Grades />} />
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
