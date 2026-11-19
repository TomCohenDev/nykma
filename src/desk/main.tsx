// The desk (spec.md §10): a dashboard of projects and brand kits, and a project view with the board and the chat.
// It imports no ad code: scenes on the board are board.html in iframes, so a broken ad can't take the desk down.
import "@fontsource-variable/inter";
import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrandPage } from "./BrandPage";
import { BrandsPage, ProjectsPage } from "./Dashboard";
import { ProjectView } from "./Project";
import { SettingsPage } from "./Settings";
import { projectsOf, usePoll, type Registry, type State } from "./api";
import "./desk.css";

type Route = { page: "projects" } | { page: "brands" } | { page: "settings"; brand?: string } | { page: "brand"; name: string } | { page: "project"; key: string } | { page: "run"; id: string };

function parse(hash: string): Route {
  const [, page, rest] = hash.match(/^#\/([^/]*)\/?(.*)$/) ?? [];
  const value = decodeURIComponent(rest ?? "");
  if (page === "brands") return { page: "brands" };
  // #/settings/<brand> opens the agent instructions for that brand.
  if (page === "settings") return { page: "settings", brand: value || undefined };
  if (page === "brand" && value) return { page: "brand", name: value };
  if (page === "p" && value) return { page: "project", key: value };
  if (page === "run" && value) return { page: "run", id: value };
  // The old desk linked ads as #<folder>.
  if (/^#\d{4}-\d{2}-\d{2}-/.test(hash)) return { page: "project", key: decodeURIComponent(hash.slice(1)) };
  return { page: "projects" };
}

function Desk() {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parse(location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = useCallback((hash: string) => {
    if (location.hash !== hash) location.hash = hash;
    else setRoute(parse(hash));
  }, []);

  const { data: state, failed, reload } = usePoll<State>("/api/state", 1500);
  const inProject = route.page === "project" || route.page === "run";
  const { data: registry, reload: reloadRegistry } = usePoll<Registry>("/api/registry", inProject ? 2500 : 6000);
  const refresh = useCallback(() => {
    reload();
    reloadRegistry();
  }, [reload, reloadRegistry]);

  // A new project starts as a run, and becomes a project when the agent names its folder.
  const run = route.page === "run" ? state?.runs.find((item) => item.id === route.id || item.thread === route.id) : undefined;
  const named = route.page === "run" ? state?.runs.find((item) => (item.id === route.id || item.thread === route.id) && item.folder)?.folder : undefined;
  useEffect(() => {
    if (named && state?.ads.some((ad) => ad.folder === named)) history.replaceState(null, "", `#/p/${encodeURIComponent(named)}`), setRoute({ page: "project", key: named });
  }, [named, state]);

  useEffect(() => {
    document.title = route.page === "project" ? `${route.key.replace(/^code:|^\d{4}-\d{2}-\d{2}-/, "")} · nykma` : route.page === "brand" ? `${route.name} · nykma` : route.page === "settings" ? "Settings · nykma" : "nykma";
  }, [route]);

  if (!state) return <div className="loading">{failed ? "The desk can't reach its server. Run bun run dev." : <span className="spinner big" />}</div>;

  const projects = projectsOf(state, registry);
  const lost = failed && <div className="lost">The desk lost its server. Run bun run dev to get it back.</div>;

  if (route.page === "brands") return <>{lost}<BrandsPage state={state} go={go} /></>;
  if (route.page === "settings") return <>{lost}<SettingsPage key={route.brand ?? ""} state={state} go={go} brand={route.brand} /></>;
  if (route.page === "brand") return <>{lost}<BrandPage key={route.name} name={route.name} state={state} go={go} refresh={refresh} /></>;
  if (route.page === "project" || route.page === "run") {
    const project = route.page === "project" ? projects.find((item) => item.key === route.key) : undefined;
    if (route.page === "project" && !project)
      return (
        <div className="loading">
          {registry ? <p>No project "{route.key}". <a href="#/">All projects</a></p> : <span className="spinner big" />}
        </div>
      );
    return (
      <>
        {lost}
        <ProjectView key={project?.key ?? route.page} project={project} run={run ?? (route.page === "run" ? { id: route.id, kind: "agent", title: "", running: true, started: Date.now(), log: [] } : undefined)} go={go} refresh={refresh} registryError={registry?.error} />
      </>
    );
  }
  return <>{lost}<ProjectsPage state={state} projects={projects} go={go} /></>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Desk />
  </StrictMode>,
);
