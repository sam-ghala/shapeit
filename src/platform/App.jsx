import { lazy, Suspense } from "react";
import { resolveGame, gameHref } from "./routing.js";
const pages = {
  shapeit: lazy(() => import("../games/shapeit/ShapeIt.jsx")),
  pushit: lazy(() =>
    import("../games/pushit/PushIt.jsx").then((m) => ({ default: m.PushIt })),
  ),
  chessit: lazy(() => import("../games/chessit/ChessIt.jsx")),
};
const Admin = lazy(() =>
  import("./admin/AdminPage.jsx").then((m) => ({ default: m.AdminPage })),
);
export default function App() {
  const Page = pages[resolveGame(location)];
  return (
    <Suspense
      fallback={
        <main className="app-loading" role="status">
          Loading…
        </main>
      }
    >
      {location.pathname === "/admin" ? (
        <Admin
          onHome={() => {
            location.href = gameHref("shapeit");
          }}
        />
      ) : (
        <Page />
      )}
    </Suspense>
  );
}
