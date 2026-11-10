import { Navigate, Route, Routes } from "react-router";
import { RequireAuth, PublicOnly } from "./components/Guards";
import { Loading, NotFoundView, Shell } from "./components/Shell";
import { Grades } from "./pages/Grades";
import { Learn } from "./pages/Learn";
import { Lesson } from "./pages/Lesson";
import { NodeRun } from "./pages/NodeRun";
import { Onboarding } from "./pages/Onboarding";
import { Practice, PracticeMore, PracticeSetPlayer } from "./pages/Practice";
import { Profile } from "./pages/Profile";
import { ReviewHub, ReviewPlayer } from "./pages/Review";
import { Progress } from "./pages/Progress";
import { Settings } from "./pages/Settings";
import { SignIn } from "./pages/SignIn";
import { Unit } from "./pages/Unit";
import { Welcome } from "./pages/Welcome";
import { useApp, useCourseData } from "./state/app";
import { useParams } from "react-router";

/** The front door: wait to learn who is signed in, then go to their path or the welcome page. */
function Home() {
  const { me } = useApp();
  if (me === undefined) return <Loading />;
  return <Navigate to={me ? "/learn" : "/welcome"} replace />;
}

/** One address for every path node: authored lessons use the lesson player, server-built nodes the node player. */
function NodePlayer() {
  const { nodeId = "" } = useParams();
  const data = useCourseData();
  if (data.status === "loading") return <Loading />;
  const node = data.status === "ready" ? data.nodes.get(nodeId) : undefined;
  if (node?.playKind === "session") return <NodeRun key={nodeId} nodeId={nodeId} />;
  return <Lesson />;
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
        <Route path="/lesson/:nodeId" element={<NodePlayer />} />
        <Route path="/review/session/:sessionId" element={<ReviewPlayer />} />
        <Route path="/practice/more/:templateId" element={<PracticeMore />} />
        <Route path="/practice/:setId" element={<PracticeSetPlayer />} />
        <Route element={<Shell />}>
          <Route path="/learn" element={<Learn />} />
          <Route path="/grades" element={<Grades />} />
          <Route path="/review" element={<ReviewHub />} />
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
