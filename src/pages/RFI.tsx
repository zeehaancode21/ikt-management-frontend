// import { useCallback, useEffect, useMemo, useState } from "react";
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";
// import { AnimatedCreateRFIIcon, AnimatedRFISettingIcon, AnimatedRFIsIcon } from "@/components/icons/AnimatedRFIIconsFixed";
// import { AnimatedSyncGmailIcon } from "@/components/icons/AnimatedSyncGmailIconFixed";
// import { toast } from "@/hooks/use-toast";
// import { Button } from "@/components/ui/button";
// import { Spinner } from "@/components/Spinner";
// import { RfiForm } from "@/components/rfi/RfiForm";
// import { RfiList } from "@/components/rfi/RfiList";
// import { RfiEmailSettings } from "@/components/rfi/RfiEmailSettings";
// import { RfiGmailSettings } from "@/components/rfi/RfiGmailSettings";
// import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
// import {
//   getProjects,
//   getRfis,
//   getErrorMessage,
//   syncAllRfisForProject,
//   type ProjectOption,
// } from "@/lib/rfiApi";
// import type { Rfi, RfiDiscipline, RfiTeamType } from "@/types/rfi";
// import { Building, FolderGit2 } from "lucide-react";
// import type { CSSProperties } from "react";

// const RFI = () => {
//   const [projects, setProjects] = useState<ProjectOption[]>([]);
//   const [selectedClient, setSelectedClient] = useState<string | null>(null);
//   const [selectedProject, setSelectedProject] = useState<string | null>(null);
//   const [rfis, setRfis] = useState<Rfi[]>([]);
//   const [view, setView] = useState<"settings" | "create" | "history">("create");

//   const [loadingRfis, setLoadingRfis] = useState(false);
//   const [syncingAll, setSyncingAll] = useState(false);
//   const [teamType] = useState<RfiTeamType | "ALL">("ALL");
//   const [discipline] = useState<RfiDiscipline | "ALL">("ALL");
  
//   const [syncButtonHovered, setSyncButtonHovered] = useState(false);
//   const [hoveredTab, setHoveredTab] = useState<"settings" | "create" | "history" | null>(null);

//   useEffect(() => {
//     getProjects()
//       .then((list) => {
//         setProjects(list);
//         if (list.length > 0 && !selectedClient) {
//           const firstClient = list[0].client;
//           setSelectedClient(firstClient);
//           const firstProjectForClient = list.find((p) => p.client === firstClient);
//           if (firstProjectForClient) setSelectedProject(firstProjectForClient.projectName);
//         }
//       })
//       .catch((err) =>
//         toast({ title: "Failed to load projects", description: getErrorMessage(err), variant: "destructive" })
//       );
//   }, [selectedClient]);

//   const clients = useMemo(
//     () =>
//       [...new Set(projects.map((p) => p.client))]
//         .filter(Boolean)
//         .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
//     [projects]
//   );

//   const projectsForClient = useMemo(
//     () =>
//       projects
//         .filter((p) => p.client === selectedClient)
//         .sort((a, b) => a.projectName.localeCompare(b.projectName, undefined, { sensitivity: "base" })),
//     [projects, selectedClient]
//   );

//   const handleClientChange = (client: string) => {
//     setSelectedClient(client);
//     const firstProjectForClient = projects.find((p) => p.client === client);
//     setSelectedProject(firstProjectForClient ? firstProjectForClient.projectName : null);
//   };

//   const loadRfis = useCallback(() => {
//     if (!selectedProject) return;
//     setLoadingRfis(true);
//     getRfis(selectedProject, teamType, discipline)
//       .then(setRfis)
//       .catch((err) =>
//         toast({ title: "Failed to load RFIs", description: getErrorMessage(err), variant: "destructive" })
//       )
//       .finally(() => setLoadingRfis(false));
//   }, [selectedProject, teamType, discipline]);

//   useEffect(() => {
//     loadRfis();
//   }, [loadRfis]);

//   const handleSyncAll = async () => {
//     if (!selectedProject) return;
//     setSyncingAll(true);
//     try {
//       const results = await syncAllRfisForProject(selectedProject);
//       const successCount = results.filter((r) => r.success).length;
//       const newMessages = results.reduce((sum, r) => sum + (r.newMessagesCount ?? 0), 0);
//       toast({
//         title: `Sync complete — ${successCount}/${results.length} RFIs checked`,
//         description: newMessages > 0 ? `${newMessages} new message(s) imported.` : "No new replies.",
//         className: "bg-emerald-600 text-white border-none shadow-xl",
//       });
//       loadRfis();
//     } catch (err) {
//       toast({ title: "Sync failed", description: getErrorMessage(err), variant: "destructive" });
//     } finally {
//       setSyncingAll(false);
//     }
//   };

//   const selectedProjectInfo = projects.find((p) => p.projectName === selectedProject);

//   return (
//     <div className="flex h-[calc(100dvh-104px)] max-md:h-[calc(100dvh-88px)] min-h-0 w-full flex-col overflow-hidden bg-background p-2 sm:p-3 gap-2">
//       <style>{`
//         @keyframes rfi-toolbar-fade-in {
//           0%   { opacity: 0; transform: translateY(-4px); }
//           100% { opacity: 1; transform: translateY(0); }
//         }
//         .rfi-toolbar-enter { animation: rfi-toolbar-fade-in 320ms cubic-bezier(0.16, 1, 0.3, 1) both; }

//         @keyframes rfi-header-fade-in {
//           0%   { opacity: 0; transform: translateY(4px); }
//           100% { opacity: 1; transform: translateY(0); }
//         }
//         .rfi-header-enter { animation: rfi-header-fade-in 360ms cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: 60ms; }

//         .rfi-tabs-list {
//           position: relative;
//           gap: 2px;
//           border: 1px solid hsl(var(--border) / 0.7);
//           background: hsl(var(--muted) / 0.55);
//           backdrop-filter: blur(6px);
//         }

//         .rfi-tabs-trigger {
//           position: relative;
//           overflow: hidden;
//           gap: 6px;
//           transition: color 220ms ease, transform 180ms ease;
//         }
//         .rfi-tabs-trigger:hover { transform: translateY(-1px); }
//         .rfi-tabs-trigger:active { transform: translateY(0) scale(0.96); }

//         .rfi-tabs-trigger::before {
//           content: '';
//           position: absolute;
//           inset: 0;
//           border-radius: inherit;
//           background: linear-gradient(135deg, var(--tab-accent), var(--tab-accent-dark));
//           transform: scaleX(0);
//           transform-origin: center;
//           transition: transform 320ms cubic-bezier(0.4, 0, 0.2, 1);
//           z-index: -1;
//         }
//         .rfi-tabs-trigger[data-state="active"]::before {
//           transform: scaleX(1);
//         }

//         @keyframes rfi-tab-pop {
//           0%   { transform: scale(0.92); }
//           55%  { transform: scale(1.04); }
//           100% { transform: scale(1); }
//         }
//         @keyframes rfi-tab-glow {
//           0%, 100% { box-shadow: 0 4px 14px -4px var(--tab-glow-soft); }
//           50%      { box-shadow: 0 4px 18px -2px var(--tab-glow-strong), 0 0 0 3px var(--tab-glow-soft); }
//         }
//         .rfi-tabs-trigger[data-state="active"] {
//           color: #fff !important;
//           animation: rfi-tab-pop 260ms cubic-bezier(0.34, 1.56, 0.64, 1),
//                      rfi-tab-glow 2.6s ease-in-out 260ms infinite;
//         }
//         .rfi-tabs-trigger[data-state="active"] svg {
//           animation: rfi-tab-icon-wiggle 380ms ease;
//         }
//         @keyframes rfi-tab-icon-wiggle {
//           0%   { transform: rotate(0deg) scale(0.8); }
//           50%  { transform: rotate(-10deg) scale(1.2); }
//           100% { transform: rotate(0deg) scale(1); }
//         }

//         .rfi-tab-dot {
//           width: 7px;
//           height: 7px;
//           border-radius: 50%;
//           flex-shrink: 0;
//           background: var(--tab-accent);
//           animation: rfi-tab-dot-beep 1.8s ease-in-out infinite;
//         }
//         @keyframes rfi-tab-dot-beep {
//           0%, 100% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 var(--tab-glow-soft); }
//           50%      { transform: scale(1.2); opacity: 0.8; box-shadow: 0 0 5px 2px var(--tab-glow-strong); }
//         }

//         .rfi-settings-icon-btn {
//           display: inline-flex; align-items: center; justify-content: center;
//           height: 32px; width: 32px; border-radius: 9999px;
//           color: hsl(var(--muted-foreground));
//           background: transparent; border: none; cursor: pointer;
//           transition: color 200ms ease, background 200ms ease, transform 180ms ease;
//         }
//         .rfi-settings-icon-btn:hover { color: #0d9488; background: rgba(13,148,136,0.10); transform: translateY(-1px); }
//         .rfi-settings-icon-btn:active { transform: scale(0.92); }
//         .rfi-settings-icon-btn.is-active { color: #0d9488; background: rgba(13,148,136,0.14); }
//         .rfi-settings-icon-btn:focus-visible { outline: 2px solid #0d9488; outline-offset: 2px; }

//         /* ── RFI's history card: same visible frame as Create RFI + travelling light ── */
//         @property --rfi-angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
//         .rfi-history-card {
//           position: relative;
//           height: 100%;
//           border-radius: 1rem;
//           border: 1.5px solid hsl(var(--primary) / 0.45);
//           background: linear-gradient(to bottom, hsl(var(--primary) / 0.06), hsl(var(--background) / 0.95) 40%);
//           backdrop-filter: blur(12px);
//           padding: 0.75rem;
//           overflow: hidden;
//           animation: rfi-history-in 300ms cubic-bezier(0.16, 1, 0.3, 1) both,
//                      rfi-history-glow 4s ease-in-out 400ms infinite;
//         }
//         .rfi-history-inner { height: 100%; overflow: auto; border-radius: 0.75rem; scrollbar-width: thin; }
//         .rfi-history-card::before {
//           content: '';
//           position: absolute;
//           inset: -1.5px;
//           border-radius: inherit;
//           padding: 2.5px;
//           pointer-events: none;
//           z-index: 2;
//           background: conic-gradient(from var(--rfi-angle),
//             transparent 0deg, transparent 240deg,
//             hsl(var(--primary) / 0.15) 280deg,
//             hsl(var(--primary)) 335deg,
//             #fff 350deg,
//             hsl(var(--primary)) 360deg);
//           -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
//           -webkit-mask-composite: xor;
//                   mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
//           animation: rfi-light-spin 3.2s linear infinite;
//           filter: drop-shadow(0 0 6px hsl(var(--primary) / 0.8));
//         }
//         @keyframes rfi-light-spin { to { --rfi-angle: 360deg; } }
//         @keyframes rfi-history-in {
//           0%   { opacity: 0; transform: translateY(8px); }
//           100% { opacity: 1; transform: translateY(0); }
//         }
//         @keyframes rfi-history-glow {
//           0%, 100% { box-shadow: 0 0 0 4px hsl(var(--primary) / 0.05), 0 18px 40px -18px hsl(var(--primary) / 0.30); }
//           50%      { box-shadow: 0 0 0 5px hsl(var(--primary) / 0.10), 0 22px 46px -16px hsl(var(--primary) / 0.50); }
//         }
//         @media (prefers-reduced-motion: reduce) {
//           .rfi-history-card, .rfi-history-card::before { animation: none !important; }
//         }

//         .rfi-sync-btn { transition: transform 160ms ease, box-shadow 200ms ease; }
//         .rfi-sync-btn:hover:not(:disabled) { transform: translateY(-1px); }
//         .rfi-sync-btn:active:not(:disabled) { transform: translateY(0) scale(0.96); }
//       `}</style>

//       <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 rfi-toolbar-enter">
//        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
//         <Tabs value={view} onValueChange={(v) => setView(v as "settings" | "create" | "history")} className="w-fit">
//           <TabsList className="rfi-tabs-list">
//             <TabsTrigger
//               value="create"
//               className="rfi-tabs-trigger data-[state=active]:bg-transparent data-[state=active]:shadow-none"
//               onMouseEnter={() => setHoveredTab("create")}
//               onMouseLeave={() => setHoveredTab(null)}
//               style={{
//                 "--tab-accent": "#2563eb",
//                 "--tab-accent-dark": "#1d4ed8",
//                 "--tab-glow-soft": "rgba(37,99,235,0.35)",
//                 "--tab-glow-strong": "rgba(37,99,235,0.6)",
//               } as CSSProperties}
//             >
//               <span className="rfi-tab-dot" aria-hidden="true" />
//               <AnimatedCreateRFIIcon
//                 size="sm"
//                 className="h-3.5 w-3.5"
//                 isParentHovered={hoveredTab === "create" || view === "create"}
//               />
//               Create RFI
//             </TabsTrigger>
//             <TabsTrigger
//               value="history"
//               className="rfi-tabs-trigger data-[state=active]:bg-transparent data-[state=active]:shadow-none"
//               onMouseEnter={() => setHoveredTab("history")}
//               onMouseLeave={() => setHoveredTab(null)}
//               style={{
//                 "--tab-accent": "#9333ea",
//                 "--tab-accent-dark": "#7e22ce",
//                 "--tab-glow-soft": "rgba(147,51,234,0.35)",
//                 "--tab-glow-strong": "rgba(147,51,234,0.6)",
//               } as CSSProperties}
//             >
//               <span className="rfi-tab-dot" aria-hidden="true" />
//               <AnimatedRFIsIcon
//                 size="sm"
//                 className="h-3.5 w-3.5"
//                 isParentHovered={hoveredTab === "history" || view === "history"}
//               />
//               RFI's
//             </TabsTrigger>
//           </TabsList>
//         </Tabs>

//         {view !== "settings" && (
//           <>
//         {/* Client + Project pickers, in line with the tabs (replaces the old "Target Project" bar) */}
//         <div className="flex items-center gap-1">
//           <Building className="hidden h-3.5 w-3.5 text-muted-foreground sm:inline-block" aria-hidden="true" />
//           <Select value={selectedClient ?? ""} onValueChange={handleClientChange}>
//             <SelectTrigger
//               aria-label="Select client"
//               className="rfi-select-trigger h-8 w-auto min-w-[130px] max-w-[min(420px,90vw)] gap-2 border-border/80 bg-background/80 text-[11px] [&>span]:line-clamp-none [&>span]:overflow-visible [&>span]:whitespace-nowrap"
//             >
//               <SelectValue placeholder="Select Client" />
//             </SelectTrigger>
//             <SelectContent className="max-w-[min(520px,92vw)]">
//               {clients.map((client) => (
//                 <SelectItem key={client} value={client} className="whitespace-normal break-words text-xs">
//                   {client}
//                 </SelectItem>
//               ))}
//             </SelectContent>
//           </Select>
//         </div>

//         <div className="flex items-center gap-1">
//           <FolderGit2 className="hidden h-3.5 w-3.5 text-muted-foreground sm:inline-block" aria-hidden="true" />
//           <Select value={selectedProject ?? ""} onValueChange={setSelectedProject} disabled={!selectedClient}>
//             <SelectTrigger
//               aria-label="Select project"
//               className="rfi-select-trigger h-8 w-auto min-w-[130px] max-w-[min(420px,90vw)] gap-2 border-border/80 bg-background/80 text-[11px] [&>span]:line-clamp-none [&>span]:overflow-visible [&>span]:whitespace-nowrap"
//             >
//               <SelectValue placeholder="Select Project" />
//             </SelectTrigger>
//             <SelectContent className="max-w-[min(520px,92vw)]">
//               {projectsForClient.map((p) => (
//                 <SelectItem key={p.id} value={p.projectName} className="whitespace-normal break-words text-xs">
//                   {p.projectName}
//                 </SelectItem>
//               ))}
//             </SelectContent>
//           </Select>
//         </div>
//           </>
//         )}
//        </div>

//         <div className="ml-auto flex items-center gap-2">
//         {view === "history" && (
//           <Button
//   type="button"
//   size="sm"
//   variant="outline"
//   className="rfi-sync-btn h-7 gap-1.5 text-[11px]"
//   disabled={syncingAll || !selectedProject}
//   onClick={handleSyncAll}
//   onMouseEnter={() => setSyncButtonHovered(true)}
//   onMouseLeave={() => setSyncButtonHovered(false)}
//   title="Check Gmail for new replies across all RFIs in this project"
// >
//   <AnimatedSyncGmailIcon
//     size="sm"
//     isParentHovered={syncButtonHovered && !syncingAll}
//     className={syncingAll ? "animate-spin" : ""}
//   />
//   {syncingAll ? "Syncing..." : "Sync Gmail"}
// </Button>
//         )}
//           <button
//             type="button"
//             aria-label="RFI settings"
//             title="Settings"
//             aria-pressed={view === "settings"}
//             onClick={() => setView((v) => (v === "settings" ? "create" : "settings"))}
//             onMouseEnter={() => setHoveredTab("settings")}
//             onMouseLeave={() => setHoveredTab(null)}
//             className={`rfi-settings-icon-btn ${view === "settings" ? "is-active" : ""}`}
//           >
//             <AnimatedRFISettingIcon
//               size="sm"
//               className="h-4 w-4"
//               isParentHovered={hoveredTab === "settings" || view === "settings"}
//             />
//           </button>
//         </div>
//       </div>

//       <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
//         <div className="flex-1 min-h-0 overflow-hidden">
//           {view === "settings" ? (
//             <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
//               <RfiGmailSettings />
//               <RfiEmailSettings />
//             </div>
//           ) : view === "create" ? (
//             <RfiForm
//               projectName={selectedProject}
//               initialRecipientEmail={selectedProjectInfo?.rfiRecipientEmail ?? ""}
//               initialCcEmails={selectedProjectInfo?.rfiCcEmails ?? ""}
//               onSent={() => {
//                 loadRfis();
//                 getProjects().then(setProjects).catch(() => {});
//               }}
//             />
//           ) : (
//             <div className="rfi-history-card">
//               <div className="rfi-history-inner">
//               <RfiList projectName={selectedProject} rfis={rfis} loading={loadingRfis} onRefresh={loadRfis} />
//               </div>
//             </div>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// };

// export default RFI;
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Spinner } from "@/components/Spinner";
import { RfiForm } from "@/components/rfi/RfiForm";
import { RfiList } from "@/components/rfi/RfiList";
import { RfiEmailSettings } from "@/components/rfi/RfiEmailSettings";
import { RfiGmailSettings } from "@/components/rfi/RfiGmailSettings";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getProjects,
  getRfis,
  getErrorMessage,
  syncAllRfisForProject,
  type ProjectOption,
} from "@/lib/rfiApi";
import type { Rfi, RfiDiscipline, RfiTeamType } from "@/types/rfi";
import { Building, FolderGit2, LayoutDashboard } from "lucide-react";
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
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [rfis, setRfis] = useState<Rfi[]>([]);
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
  const loadRfis = useCallback((silent: boolean = false) => {
    if (!selectedProject) return;
    if (!silent) setLoadingRfis(true);
    getRfis(selectedProject, teamType, discipline)
      .then(setRfis)
      .catch((err) =>
        toast({ title: "Failed to load RFIs", description: getErrorMessage(err), variant: "destructive" })
      )
      .finally(() => {
        if (!silent) setLoadingRfis(false);
      });
  }, [selectedProject, teamType, discipline]);

  useEffect(() => {
    loadRfis();
  }, [loadRfis]);

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
      t = setTimeout(() => loadRfis(true), 1500);
    });
    return () => {
      if (t) clearTimeout(t);
      unsubscribe();
    };
  }, [connected, subscribe, loadRfis]);

   useEffect(() => {
    const h = () => loadRfis(true);
    window.addEventListener("rfi-replies-imported", h);
    return () => window.removeEventListener("rfi-replies-imported", h);
  }, [loadRfis]);

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
      loadRfis();
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
          animation: rfi-tab-pop 260ms cubic-bezier(0.34, 1.56, 0.64, 1),
                     rfi-tab-glow 2.6s ease-in-out 260ms infinite;
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
          animation: rfi-tab-dot-beep 1.8s ease-in-out infinite;
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
        @property --rfi-angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
        .rfi-history-card {
          position: relative;
          height: 100%;
          border-radius: 1rem;
          border: 1.5px solid hsl(var(--primary) / 0.45);
          background: linear-gradient(to bottom, hsl(var(--primary) / 0.06), hsl(var(--background) / 0.95) 40%);
          backdrop-filter: blur(12px);
          padding: 0.75rem;
          overflow: hidden;
          animation: rfi-history-in 300ms cubic-bezier(0.16, 1, 0.3, 1) both,
                     rfi-history-glow 4s ease-in-out 400ms infinite;
        }
        .rfi-history-inner { height: 100%; overflow: auto; border-radius: 0.75rem; scrollbar-width: thin; }
        .rfi-history-card::before {
          content: '';
          position: absolute;
          inset: -1.5px;
          border-radius: inherit;
          padding: 2.5px;
          pointer-events: none;
          z-index: 2;
          background: conic-gradient(from var(--rfi-angle),
            transparent 0deg, transparent 240deg,
            hsl(var(--primary) / 0.15) 280deg,
            hsl(var(--primary)) 335deg,
            #fff 350deg,
            hsl(var(--primary)) 360deg);
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
                  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
          animation: rfi-light-spin 3.2s linear infinite;
          filter: drop-shadow(0 0 6px hsl(var(--primary) / 0.8));
        }
        @keyframes rfi-light-spin { to { --rfi-angle: 360deg; } }
        @keyframes rfi-history-in {
          0%   { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes rfi-history-glow {
          0%, 100% { box-shadow: 0 0 0 4px hsl(var(--primary) / 0.05), 0 18px 40px -18px hsl(var(--primary) / 0.30); }
          50%      { box-shadow: 0 0 0 5px hsl(var(--primary) / 0.10), 0 22px 46px -16px hsl(var(--primary) / 0.50); }
        }
        @media (prefers-reduced-motion: reduce) {
          .rfi-history-card, .rfi-history-card::before { animation: none !important; }
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

        {view !== "settings" && (
          <>
        {/* Client + Project pickers, in line with the tabs (replaces the old "Target Project" bar) */}
        <div className="flex items-center gap-1">
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

        <div className="flex items-center gap-1">
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
        {(view === "history" || view === "dashboard") && (
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
            <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
              <RfiGmailSettings />
              <RfiEmailSettings />
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
                rfis={rfis}
                loading={loadingRfis}
                onRefresh={() => loadRfis(true)}
                onViewAll={() => setView("history")}
              />
            </div>
          ) : (
            <div className="rfi-history-card">
              <div className="rfi-history-inner">
              <RfiList projectName={selectedProject} rfis={rfis} loading={loadingRfis} onRefresh={() => loadRfis(true)} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RFI;