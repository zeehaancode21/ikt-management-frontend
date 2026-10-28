import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AnimatedCreateRFIIcon, AnimatedRFISettingIcon, AnimatedRFIsIcon } from "@/components/icons/AnimatedRFIIconsFixed";
import { AnimatedSyncGmailIcon } from "@/components/icons/AnimatedSyncGmailIconFixed";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { RfiForm } from "@/components/rfi/RfiForm";
import { RfiList } from "@/components/rfi/RfiList";
import { RfiEmailSettings } from "@/components/rfi/RfiEmailSettings";
import { RfiGmailSettings } from "@/components/rfi/RfiGmailSettings";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getProjects,
  getRfis,
  getAllRfis,
  getErrorMessage,
  syncAllRfisForProject,
  checkRepliesNow,
  type ProjectOption,
} from "@/lib/rfiApi";
import type { Rfi, RfiDiscipline, RfiTeamType } from "@/types/rfi";
import { Building, FolderGit2, LayoutDashboard, Share2 } from "lucide-react";
import { RfiShareDialog } from "@/components/rfi/RfiShareDialog";
import type { RfiShareTarget } from "@/lib/rfiShareApi";
import { useAuth } from "@/context/AuthContext";
import { RfiDashboard } from "@/components/rfi/RfiDashboard";
import { useNotifications } from "@/context/NotificationsContext";
import { useWebSocket } from "@/context/WebSocketContext";
import type { CSSProperties } from "react";

const RFI = () => {
  // Clear the RFI badge in the left sidebar once the user is on this page, and keep it
  // cleared if a new RFI notification (CC'd / reply received) arrives while they are here.
  const { counts: notificationCounts, markModuleRead } = useNotifications();
  useEffect(() => {
    if (notificationCounts.rfi > 0) markModuleRead("rfi");
  }, [notificationCounts.rfi, markModuleRead]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  // "Share live link" (read-only RFI status page for the client): OWNER only,
  // the same rule the backend enforces (RfiShareLinkController).
  const { role } = useAuth();
  const canShareLinks = role === "OWNER";
  const [shareTarget, setShareTarget] = useState<RfiShareTarget | null>(null); // null = dialog closed
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [rfis, setRfis] = useState<Rfi[]>([]);
  // Dashboard sub-option: "project" = the selected project (as before),
  // "all" = RFIs of every project. Only exists on this RFI portal.
  const [dashScope, setDashScope] = useState<"project" | "all">("project");
  const [allRfis, setAllRfis] = useState<Rfi[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const [view, setView] = useState<"settings" | "create" | "history" | "dashboard">("create");

  const [loadingRfis, setLoadingRfis] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [teamType] = useState<RfiTeamType | "ALL">("ALL");
  const [discipline] = useState<RfiDiscipline | "ALL">("ALL");
  
  const [syncButtonHovered, setSyncButtonHovered] = useState(false);
  const [hoveredTab, setHoveredTab] = useState<"settings" | "create" | "history" | "dashboard" | null>(null);

  useEffect(() => {
    getProjects()
      .then((list) => {
        setProjects(list);
        if (list.length > 0 && !selectedClient) {
          const firstClient = list[0].client;
          setSelectedClient(firstClient);
          const firstProjectForClient = list.find((p) => p.client === firstClient);
          if (firstProjectForClient) setSelectedProject(firstProjectForClient.projectName);
        }
      })
      .catch((err) =>
        toast({ title: "Failed to load projects", description: getErrorMessage(err), variant: "destructive" })
      );
  }, [selectedClient]);

  const clients = useMemo(
    () =>
      [...new Set(projects.map((p) => p.client))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    [projects]
  );

  const projectsForClient = useMemo(
    () =>
      projects
        .filter((p) => p.client === selectedClient)
        .sort((a, b) => a.projectName.localeCompare(b.projectName, undefined, { sensitivity: "base" })),
    [projects, selectedClient]
  );

  const handleClientChange = (client: string) => {
    setSelectedClient(client);
    const firstProjectForClient = projects.find((p) => p.client === client);
    setSelectedProject(firstProjectForClient ? firstProjectForClient.projectName : null);
  };

  // silent = refresh in the background (no loading skeleton), so an open RFI popup stays open.
  // Every call gets a ticket number and only the NEWEST call may write its result. Without
  // this, a slow request started earlier (e.g. the 1.5s-debounced websocket reload) could
  // land AFTER a newer one and put the OLD status back on screen.
  const loadSeq = useRef(0);
  const loadRfis = useCallback(
    (silent: boolean = false): Promise<void> => {
      if (!selectedProject) return Promise.resolve();
      const seq = ++loadSeq.current;
      if (!silent) setLoadingRfis(true);
      return getRfis(selectedProject, teamType, discipline)
        .then((list) => {
          if (seq === loadSeq.current) setRfis(list);
        })
        .catch((err) =>
          toast({ title: "Failed to load RFIs", description: getErrorMessage(err), variant: "destructive" })
        )
        .finally(() => {
          if (!silent && seq === loadSeq.current) setLoadingRfis(false);
        });
    },
    [selectedProject, teamType, discipline]
  );

  // Same "newest call wins" ticket idea, for the all-projects list.
  const allSeq = useRef(0);
  const loadAllRfis = useCallback(
    (silent: boolean = false): Promise<void> => {
      const seq = ++allSeq.current;
      if (!silent) setLoadingAll(true);
      return getAllRfis(teamType, discipline)
        .then((list) => {
          if (seq === allSeq.current) setAllRfis(list);
        })
        .catch((err) =>
          toast({ title: "Failed to load RFIs", description: getErrorMessage(err), variant: "destructive" })
        )
        .finally(() => {
          if (!silent && seq === allSeq.current) setLoadingAll(false);
        });
    },
    [teamType, discipline]
  );

  // True while the dashboard is showing the "All projects" option.
  const allMode = view === "dashboard" && dashScope === "all";

  // The Refresh button (dashboard). It used to call loadRfis(true) — a SILENT reload — and the
  // button's spinner/disabled state follows `loading`, which a silent reload never sets, so it
  // never rotated and gave no feedback. It also only re-read the database, so a reply that had
  // not been imported yet never showed up. Now: ask the server to look for new replies right
  // now (not throttled), then reload, with the spinner visible for the whole time.
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const handleRefresh = useCallback(async () => {
    if (refreshingRef.current || (!allMode && !selectedProject)) return;
    refreshingRef.current = true;
    setRefreshing(true);
    const startedAt = Date.now();
    try {
      await checkRepliesNow(); // best effort — never blocks the reload
      await (allMode ? loadAllRfis(true) : loadRfis(true));
    } finally {
      // keep the spinner up long enough to be seen even when the server answers instantly
      const left = 600 - (Date.now() - startedAt);
      if (left > 0) await new Promise((r) => setTimeout(r, left));
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [selectedProject, allMode, loadRfis, loadAllRfis]);

  // One row was synced from the list's row button: swap just that RFI into the shared list,
  // so the Dashboard, the filters and the next silent reload all agree with the row.
  const handleRfiSynced = useCallback((updated: Rfi) => {
    setRfis((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }, []);

  useEffect(() => {
    loadRfis();
  }, [loadRfis]);

  // Fetch the all-projects list only when that option is actually opened
  // (no extra server/database work for people who never use it).
  useEffect(() => {
    if (allMode) void loadAllRfis();
  }, [allMode, loadAllRfis]);

  // A reply (sent from the app OR arriving by email) makes the backend push an RFI_UPDATE
  // notification over the existing websocket. Refresh the list quietly so the new status
  // shows up without clicking Sync. Debounced: one transition can send several pushes.
  const { connected, subscribe } = useWebSocket();
  useEffect(() => {
    if (!connected) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribe("/user/queue/notifications", (n) => {
      if (n?.type !== "RFI_UPDATE") return;
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        void loadRfis(true);
        if (allMode) void loadAllRfis(true);
        // tell an open RFI popup too, so its status + timeline refresh in place
        window.dispatchEvent(new Event("rfi-ws-update"));
      }, 1500);
    });
    return () => {
      if (t) clearTimeout(t);
      unsubscribe();
    };
  }, [connected, subscribe, loadRfis, loadAllRfis, allMode]);

   useEffect(() => {
    const h = () => {
      void loadRfis(true);
      if (allMode) void loadAllRfis(true);
    };
    window.addEventListener("rfi-replies-imported", h);
    return () => window.removeEventListener("rfi-replies-imported", h);
  }, [loadRfis, loadAllRfis, allMode]);

  const handleSyncAll = async () => {
    if (!selectedProject) return;
    setSyncingAll(true);
    try {
      const results = await syncAllRfisForProject(selectedProject);
      const successCount = results.filter((r) => r.success).length;
      const newMessages = results.reduce((sum, r) => sum + (r.newMessagesCount ?? 0), 0);
      toast({
        title: `Sync complete — ${successCount}/${results.length} RFIs checked`,
        description: newMessages > 0 ? `${newMessages} new message(s) imported.` : "No new replies.",
        className: "bg-emerald-600 text-white border-none shadow-xl",
      });
      await loadRfis(true);
    } catch (err) {
      toast({ title: "Sync failed", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setSyncingAll(false);
    }
  };

  const selectedProjectInfo = projects.find((p) => p.projectName === selectedProject);

  return (
    <div className="flex h-[calc(100dvh-104px)] max-md:h-[calc(100dvh-88px)] min-h-0 w-full flex-col overflow-hidden bg-background p-2 sm:p-3 gap-2">
      <style>{`
        @keyframes rfi-toolbar-fade-in {
          0%   { opacity: 0; transform: translateY(-4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .rfi-toolbar-enter { animation: rfi-toolbar-fade-in 320ms cubic-bezier(0.16, 1, 0.3, 1) both; }

        @keyframes rfi-header-fade-in {
          0%   { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .rfi-header-enter { animation: rfi-header-fade-in 360ms cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: 60ms; }

        .rfi-tabs-list {
          position: relative;
          gap: 2px;
          border: 1px solid hsl(var(--border) / 0.7);
          background: hsl(var(--muted) / 0.55);
          backdrop-filter: blur(6px);
        }

        .rfi-tabs-trigger {
          position: relative;
          overflow: hidden;
          gap: 6px;
          transition: color 220ms ease, transform 180ms ease;
        }
        .rfi-tabs-trigger:hover { transform: translateY(-1px); }
        .rfi-tabs-trigger:active { transform: translateY(0) scale(0.96); }

        .rfi-tabs-trigger::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(135deg, var(--tab-accent), var(--tab-accent-dark));
          transform: scaleX(0);
          transform-origin: center;
          transition: transform 320ms cubic-bezier(0.4, 0, 0.2, 1);
          z-index: -1;
        }
        .rfi-tabs-trigger[data-state="active"]::before {
          transform: scaleX(1);
        }

        @keyframes rfi-tab-pop {
          0%   { transform: scale(0.92); }
          55%  { transform: scale(1.04); }
          100% { transform: scale(1); }
        }
        @keyframes rfi-tab-glow {
          0%, 100% { box-shadow: 0 4px 14px -4px var(--tab-glow-soft); }
          50%      { box-shadow: 0 4px 18px -2px var(--tab-glow-strong), 0 0 0 3px var(--tab-glow-soft); }
        }
        .rfi-tabs-trigger[data-state="active"] {
          color: #fff !important;
          animation: rfi-tab-pop 260ms cubic-bezier(0.34, 1.56, 0.64, 1);
          box-shadow: 0 4px 14px -4px var(--tab-glow-soft);
        }
        .rfi-tabs-trigger[data-state="active"] svg {
          animation: rfi-tab-icon-wiggle 380ms ease;
        }
        @keyframes rfi-tab-icon-wiggle {
          0%   { transform: rotate(0deg) scale(0.8); }
          50%  { transform: rotate(-10deg) scale(1.2); }
          100% { transform: rotate(0deg) scale(1); }
        }

        .rfi-tab-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          flex-shrink: 0;
          background: var(--tab-accent);
          
        }
        @keyframes rfi-tab-dot-beep {
          0%, 100% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 var(--tab-glow-soft); }
          50%      { transform: scale(1.2); opacity: 0.8; box-shadow: 0 0 5px 2px var(--tab-glow-strong); }
        }

        .rfi-settings-icon-btn {
          display: inline-flex; align-items: center; justify-content: center;
          height: 32px; width: 32px; border-radius: 9999px;
          color: hsl(var(--muted-foreground));
          background: transparent; border: none; cursor: pointer;
          transition: color 200ms ease, background 200ms ease, transform 180ms ease;
        }
        .rfi-settings-icon-btn:hover { color: #0d9488; background: rgba(13,148,136,0.10); transform: translateY(-1px); }
        .rfi-settings-icon-btn:active { transform: scale(0.92); }
        .rfi-settings-icon-btn.is-active { color: #0d9488; background: rgba(13,148,136,0.14); }
        .rfi-settings-icon-btn:focus-visible { outline: 2px solid #0d9488; outline-offset: 2px; }

        /* ── RFI's history card: same visible frame as Create RFI + travelling light ── */
        .rfi-history-card {
          position: relative;
          height: 100%;
          border-radius: 1rem;
          border: 1.5px solid hsl(var(--primary) / 0.45);
          background: linear-gradient(to bottom, hsl(var(--primary) / 0.06), hsl(var(--background) / 0.95) 40%);
          backdrop-filter: blur(12px);
          padding: 0.75rem;
          overflow: hidden;
          animation: rfi-history-in 300ms cubic-bezier(0.16, 1, 0.3, 1) both;
          box-shadow: 0 0 0 4px hsl(var(--primary) / 0.05), 0 18px 40px -18px hsl(var(--primary) / 0.30);
        }
        .rfi-history-inner { height: 100%; overflow: auto; border-radius: 0.75rem; scrollbar-width: thin; }
        @keyframes rfi-history-in {
          0%   { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes rfi-history-glow {
          0%, 100% { box-shadow: 0 0 0 4px hsl(var(--primary) / 0.05), 0 18px 40px -18px hsl(var(--primary) / 0.30); }
          50%      { box-shadow: 0 0 0 5px hsl(var(--primary) / 0.10), 0 22px 46px -16px hsl(var(--primary) / 0.50); }
        }
        @media (prefers-reduced-motion: reduce) {
          .rfi-history-card, .rfi-tabs-trigger { animation: none !important; }
        }

        /* Phones: tabs scroll sideways instead of wrapping, pickers share a full-width row */
        @media (max-width: 639px) {
          .rfi-tabs-list { max-width: 100%; overflow-x: auto; scrollbar-width: none; }
          .rfi-tabs-list::-webkit-scrollbar { display: none; }
          .rfi-picker { flex: 1 1 100%; }
          .rfi-picker > button { width: 100%; max-width: 100%; }
        }
        .rfi-sync-btn { transition: transform 160ms ease, box-shadow 200ms ease; }
        .rfi-sync-btn:hover:not(:disabled) { transform: translateY(-1px); }
        .rfi-sync-btn:active:not(:disabled) { transform: translateY(0) scale(0.96); }
      `}</style>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 rfi-toolbar-enter">
       <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Tabs value={view} onValueChange={(v) => setView(v as "settings" | "create" | "history" | "dashboard")} className="w-fit">
          <TabsList className="rfi-tabs-list">
            <TabsTrigger
              value="create"
              className="rfi-tabs-trigger data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              onMouseEnter={() => setHoveredTab("create")}
              onMouseLeave={() => setHoveredTab(null)}
              style={{
                "--tab-accent": "#2563eb",
                "--tab-accent-dark": "#1d4ed8",
                "--tab-glow-soft": "rgba(37,99,235,0.35)",
                "--tab-glow-strong": "rgba(37,99,235,0.6)",
              } as CSSProperties}
            >
              <span className="rfi-tab-dot" aria-hidden="true" />
              <AnimatedCreateRFIIcon
                size="sm"
                className="h-3.5 w-3.5"
                isParentHovered={hoveredTab === "create" || view === "create"}
              />
              Create RFI
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="rfi-tabs-trigger data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              onMouseEnter={() => setHoveredTab("history")}
              onMouseLeave={() => setHoveredTab(null)}
              style={{
                "--tab-accent": "#9333ea",
                "--tab-accent-dark": "#7e22ce",
                "--tab-glow-soft": "rgba(147,51,234,0.35)",
                "--tab-glow-strong": "rgba(147,51,234,0.6)",
              } as CSSProperties}
            >
              <span className="rfi-tab-dot" aria-hidden="true" />
              <AnimatedRFIsIcon
                size="sm"
                className="h-3.5 w-3.5"
                isParentHovered={hoveredTab === "history" || view === "history"}
              />
              RFI's
            </TabsTrigger>
            <TabsTrigger
              value="dashboard"
              className="rfi-tabs-trigger data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              onMouseEnter={() => setHoveredTab("dashboard")}
              onMouseLeave={() => setHoveredTab(null)}
              style={{
                "--tab-accent": "#059669",
                "--tab-accent-dark": "#047857",
                "--tab-glow-soft": "rgba(5,150,105,0.35)",
                "--tab-glow-strong": "rgba(5,150,105,0.6)",
              } as CSSProperties}
            >
              <span className="rfi-tab-dot" aria-hidden="true" />
              <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
              Dashboard
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {view !== "settings" && !allMode && (
          <>
        {/* Client + Project pickers, in line with the tabs (replaces the old "Target Project" bar) */}
        <div className="rfi-picker flex min-w-0 items-center gap-1">
          <Building className="hidden h-3.5 w-3.5 text-muted-foreground sm:inline-block" aria-hidden="true" />
          <Select value={selectedClient ?? ""} onValueChange={handleClientChange}>
            <SelectTrigger
              aria-label="Select client"
              className="rfi-select-trigger h-8 w-auto min-w-[130px] max-w-[min(420px,90vw)] gap-2 border-border/80 bg-background/80 text-[11px] [&>span]:line-clamp-none [&>span]:overflow-visible [&>span]:whitespace-nowrap"
            >
              <SelectValue placeholder="Select Client" />
            </SelectTrigger>
            <SelectContent className="max-w-[min(520px,92vw)]">
              {clients.map((client) => (
                <SelectItem key={client} value={client} className="whitespace-normal break-words text-xs">
                  {client}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rfi-picker flex min-w-0 items-center gap-1">
          <FolderGit2 className="hidden h-3.5 w-3.5 text-muted-foreground sm:inline-block" aria-hidden="true" />
          <Select value={selectedProject ?? ""} onValueChange={setSelectedProject} disabled={!selectedClient}>
            <SelectTrigger
              aria-label="Select project"
              className="rfi-select-trigger h-8 w-auto min-w-[130px] max-w-[min(420px,90vw)] gap-2 border-border/80 bg-background/80 text-[11px] [&>span]:line-clamp-none [&>span]:overflow-visible [&>span]:whitespace-nowrap"
            >
              <SelectValue placeholder="Select Project" />
            </SelectTrigger>
            <SelectContent className="max-w-[min(520px,92vw)]">
              {projectsForClient.map((p) => (
                <SelectItem key={p.id} value={p.projectName} className="whitespace-normal break-words text-xs">
                  {p.projectName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
          </>
        )}
       </div>

        <div className="ml-auto flex items-center gap-2">
        {canShareLinks && selectedProjectInfo && !allMode && (view === "history" || view === "dashboard") && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rfi-sync-btn h-7 gap-1.5 text-[11px]"
            title="Create a read-only live link so the client can follow this project's RFIs"
            onClick={() =>
              setShareTarget({
                scope: "PROJECT",
                projectId: selectedProjectInfo.id,
                projectName: selectedProjectInfo.projectName,
                client: selectedProjectInfo.client,
              })
            }
          >
            <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
            Share live link
          </Button>
        )}
        {(view === "history" || view === "dashboard") && !allMode && (
          <Button
  type="button"
  size="sm"
  variant="outline"
  className="rfi-sync-btn h-7 gap-1.5 text-[11px]"
  disabled={syncingAll || !selectedProject}
  onClick={handleSyncAll}
  onMouseEnter={() => setSyncButtonHovered(true)}
  onMouseLeave={() => setSyncButtonHovered(false)}
  title="Check Gmail for new replies across all RFIs in this project"
>
  <AnimatedSyncGmailIcon
    size="sm"
    isParentHovered={syncButtonHovered && !syncingAll}
    className={syncingAll ? "animate-spin" : ""}
  />
  {syncingAll ? "Syncing..." : "Sync Gmail"}
</Button>
        )}
          <button
            type="button"
            aria-label="RFI settings"
            title="Settings"
            aria-pressed={view === "settings"}
            onClick={() => setView((v) => (v === "settings" ? "create" : "settings"))}
            onMouseEnter={() => setHoveredTab("settings")}
            onMouseLeave={() => setHoveredTab(null)}
            className={`rfi-settings-icon-btn ${view === "settings" ? "is-active" : ""}`}
          >
            <AnimatedRFISettingIcon
              size="sm"
              className="h-4 w-4"
              isParentHovered={hoveredTab === "settings" || view === "settings"}
            />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
        <div className={`flex-1 min-h-0 ${view === "create" ? "overflow-y-auto overflow-x-hidden pb-4 rfi-page-scroll" : "overflow-hidden"}`}>
          {view === "settings" ? (
            <div className="rfi-page-scroll flex h-full min-h-0 flex-col gap-2 overflow-y-auto overflow-x-hidden pb-4">
              <RfiGmailSettings />
              <div className="flex min-h-[320px] flex-1 flex-col">
                <RfiEmailSettings />
              </div>
            </div>
          ) : view === "create" ? (
            <RfiForm
              projectName={selectedProject}
              initialRecipientEmail={selectedProjectInfo?.rfiRecipientEmail ?? ""}
              initialCcEmails={selectedProjectInfo?.rfiCcEmails ?? ""}
              onSent={() => {
                loadRfis();
                getProjects().then(setProjects).catch(() => {});
              }}
            />
          ) : view === "dashboard" ? (
            // Full-bleed: no framed card, no padding — the dashboard uses the whole
            // work area and only scrolls on small screens.
            <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden rfi-page-scroll">
              <RfiDashboard
                client={selectedClient}
                projectName={selectedProject}
                scope={dashScope}
                onScopeChange={setDashScope}
                rfis={dashScope === "all" ? allRfis : rfis}
                loading={(dashScope === "all" ? loadingAll : loadingRfis) || refreshing}
                onRefresh={handleRefresh}
                onViewAll={() => setView("history")}
              />
            </div>
          ) : (
            <div className="rfi-history-card">
              <div className="rfi-history-inner">
              <RfiList projectName={selectedProject} rfis={rfis} loading={loadingRfis} onRefresh={() => loadRfis(true)} onRfiSynced={handleRfiSynced} />
              </div>
            </div>
          )}
        </div>
      </div>

      {canShareLinks && <RfiShareDialog target={shareTarget} onClose={() => setShareTarget(null)} />}
    </div>
  );
};

export default RFI;