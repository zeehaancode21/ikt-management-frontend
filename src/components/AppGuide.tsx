import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Crown, Users, Sparkles, User, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AnimatedIconBase } from "@/components/icons/AnimatedIconbase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useModuleAccess } from "@/hooks/useModuleAccess";

/**
 * "i" button in the header: a categorised guide to the app.
 *
 *   Owner / Lead / Zeeshan / Employee  - what each of them has, and how to use it.
 *   "For everyone" (header tools, keyboard shortcuts, personalising) is added to every category.
 *
 * Everyone sees the guide for THEIR OWN category. The Owner can read all four.
 *
 * The guide is built from what THIS person can actually open: RFI and Projects (and, for
 * "View only" RFI, only the reading part) are left out completely when they have no access.
 * Nothing says "if you have access". Access comes from useModuleAccess, the same shared
 * answer the sidebar uses, so there is no extra request.
 *
 * Icon: /icons/info.png (still) + /icons/info.gif (plays on hover), same as the other header icons.
 * Keep the text in step with AppSidebar / the route guards in App.tsx.
 */

type Item = { title: string; text: string; how?: string };
type Section = { title: string; intro?: string; items: Item[] };
type GuideKey = "owner" | "lead" | "zeeshan" | "employee";
type Guide = { key: GuideKey; label: string; tagline: string; icon: typeof User; sections: Section[] };
type Access = { rfi: boolean; rfiViewOnly: boolean; projects: boolean };

/* ───────────────────────── shared by every category ───────────────────────── */

const everyone = (forOwner: boolean): Section[] => [
  {
    title: "Header tools and keyboard shortcuts",
    intro: "The row at the top of every page. Every shortcut also works as Ctrl + Alt + <key> (use that form for T and N, because browsers keep Ctrl+T and Ctrl+N for themselves).",
    items: [
      { title: "Messages (Ctrl + M)", text: "Chat with colleagues one-to-one or in groups. Send files, reply to a message, react with emojis and create polls.", how: "Click the message icon or press Ctrl+M, pick a person or group and type. A red badge shows unread messages." },
      { title: "Documents (Ctrl + D)", text: "Shared folders of files. A folder holds either sub-folders or files, never both.", how: "Open Documents, enter a folder, then upload, download or (where allowed) create folders and delete files." },
      // The Owner has no bell, so this line is left out of the Owner's guide.
      ...(forOwner
        ? []
        : [{ title: "Announcements (Ctrl + A)", text: "The bell shows company announcements and notices.", how: "Click the bell or press Ctrl+A. Use Mark all read to clear the badge." }]),
      { title: "Notepad and tasks (Ctrl + N)", text: "A private notepad and a to-do list that only you can see. They are saved to your account.", how: "Press Ctrl+N or click the notepad icon. Type a note, or add tasks and tick them off." },
      { title: "Calculator", text: "A floating calculator you can keep open while working.", how: "Click the calculator icon." },
      { title: "Quick jump (Ctrl + K)", text: "Search box that jumps to any page you are allowed to open, so you rarely need the sidebar.", how: "Press Ctrl+K, type part of a page name, use the arrow keys and press Enter." },
      { title: "Dark / light mode (Ctrl + T)", text: "Switches the whole app between light and dark.", how: "Click the sun/moon icon or press Ctrl+T (Ctrl+Alt+T on Windows and Linux)." },
      { title: "Offline and slow connection", text: "A yellow bar appears at the top when your internet is lost, with a Retry button. A softer notice appears when your connection is very slow (shown by Chrome, Edge and Android browsers).", how: "Press Retry once your Wi-Fi or data is back. The RFI list then refreshes by itself. Nothing is lost: changes simply wait until you are online." },
      { title: "Theme colour (palette icon)", text: "Choose the colour of the left panel and the app's highlights. It is saved to your account, so it follows you to any device.", how: "Click the palette icon, pick a colour or choose your own. Reset goes back to blue." },
      { title: "On leave today and holidays", text: "Shows who is on leave today and the list of upcoming holidays, so you can plan.", how: "Click the On leave today badge or the holiday icon in the header." },
    ],
  },
  {
    title: "Getting around and your account",
    items: [
      { title: "Sidebar", text: "Your menu. It shows only the pages you can use. Numbers on an item are things waiting for you.", how: "Click an item to open it. Use the collapse button to shrink the sidebar to icons; on a phone, use the menu button at the top left." },
      { title: "Refresh to the latest version", text: "If something looks out of date after an update, hard reload the app.", how: "Click your name (Welcome, ...) at the top. This clears the cache and loads the newest version." },
      { title: "My Profile", text: "Your name, date of birth, mobile number, address and profile picture, plus your KYC documents.", how: "Open My Profile from the sidebar (or Ctrl+K and type Profile), edit the fields and press Save." },
      { title: "Change your password", text: "Keep your account safe by changing your password regularly.", how: "At the bottom of the sidebar press Access Reset, enter your current and new password, and confirm." },
    ],
  },
];

/* ─────────────────────────────── building blocks ─────────────────────────────── */

const WORK_RECORD: Section = {
  title: "Work Record",
  intro: "Two tabs at the top: Work Report and Weekend Entry.",
  items: [
    { title: "Work Report", text: "Your daily record of what you worked on. Each row has a project, the type of work and the hours. A bar tracks your 8-hour daily goal. Training days do not need a project.", how: "Open Work Record, add a row for each task, enter hours and press Submit. Check the total before sending." },
    { title: "Weekend Entry", text: "Check in and out when you work on a weekend, so the day is counted.", how: "On Saturday or Sunday open the Weekend Entry tab and press Check in when you start and Check out when you finish. Your history and totals are shown below." },
  ],
};

const PERMISSION_HUB: Section = {
  title: "Permission Hub (leave and permission)",
  intro: "Two tabs: Leave Portal and Permission Portal. Requests go to the Owner for approval and you are notified of the decision.",
  items: [
    { title: "Leave Portal", text: "Apply for Casual or Sick leave, for full days or a half day (first or second half). Your yearly limit is 18 days in your first 3 years of service and 24 days after that.", how: "Open Leave Portal, choose the type, pick the dates, add a reason and submit. Track the status in your list." },
    { title: "Change an approved leave", text: "An approved leave can be changed by sending a change request. The original stays valid until the Owner accepts the change.", how: "Open the approved leave and use the change option, enter the new details and send it." },
    { title: "Permission Portal", text: "Ask for a short permission (a few hours off). Each month has a small free allowance of 2 hours. Hours beyond it are turned into a leave automatically, so check the monthly counter before applying.", how: "Open Permission Portal, pick the date and times, add a reason and submit." },
  ],
};

const RFI_DASHBOARD: Item = {
  title: "Dashboard",
  text: "My RFIs and All RFIs, with status, priority and age (up to 7 days is on track, 8 to 14 is getting old, 15+ is overdue). Filter by project, status or priority.",
  how: "Open RFI, choose the project, then pick a tab. Click any RFI to open its full thread and timeline.",
};

const RFI_SEARCH: Item = {
  title: "Search inside emails, across all projects",
  text: "Search RFIs normally looks at the RFI number, subject and date of the open project. Switch Body on and the same search also looks inside the emails of every RFI in every project. RFIs of the open project appear in its list; matches in other projects are listed under the search box, so you can find \"that RFI about the beam connection\" without remembering the project. Type at least 2 characters.",
  how: "In the RFI list, open Search & Sync, turn Body on and type a word or phrase from the email. Click a result under the search box to jump to its project; your search text stays, so the RFI is at the top of that list.",
};

const RFI_ITEMS: Item[] = [
  RFI_DASHBOARD,
  { title: "Create an RFI", text: "Raise a new request for information and email it to the client from the app, with attachments. Internal RFIs go through your team first.", how: "Open the Create tab, fill the subject, message, To/CC and attachments, then send." },
  { title: "Reply, Resubmit and Reopen", text: "Answer inside the same email thread. The status changes automatically depending on who replies. Closed RFIs must be reopened before anyone can reply.", how: "Open the RFI, press Reply, Resubmit or Reopen, write your message and attach files. Leave the Regards box ticked to end the email with your name." },
  { title: "Reply templates", text: "Save wording you use again and again (for example \"Please find the revised drawing attached\") and drop it into any reply box. Templates are private to you and follow you to any computer.", how: "In the Reply, Resubmit or Reopen box press Templates. Click a template to add it to your message. To keep a new one, type the message, give it a name in the Templates strip and press Save this text. The bin icon deletes a template." },
  { title: "Remind client (internal RFIs)", text: "When an internal RFI you sent is still waiting for a reply, one click sends a short, polite reminder in the same email thread. The status does not change and the reminder shows on the timeline. External RFIs do not have this button.", how: "Open the waiting internal RFI and press Remind client under Waiting for a reply. Check the short message shown and press Send reminder." },
  RFI_SEARCH,
  { title: "Inbox", text: "Link emails that clients sent you to the right RFI.", how: "Open the Inbox tab, find the email and press Link to choose the RFI." },
  { title: "RFI keyboard shortcuts", text: "Plain-key shortcuts on the RFI page. They are ignored while you type in a box or while a window is open. Press / to search, n for a new RFI, r to refresh, 1 RFIs, 2 Create, 3 Dashboard, 4 Inbox, 5 Settings and ? to see this list. In the RFI list use the Up and Down arrows to move between RFIs and Enter to open one.", how: "Click an empty part of the RFI page and press ? to see the list. They do not clash with Ctrl+M, Ctrl+D and the other header shortcuts." },
  { title: "Internal review (Drafter, Checker, Owner)", text: "Internal RFIs are drafted, checked, then approved by the Owner before the client sees them. The panel shows who the RFI is waiting on and only the buttons that belong to you.", how: "Drafter: revise and Resubmit after a send-back. Checker: Approve, or Send back for revision with comments." },
];

/** RFI for Lead / Zeeshan / Employee: nothing at all without access, reading only with View only access. */
const rfiSection = (a: Access): Section | null => {
  if (!a.rfi) return null;
  if (a.rfiViewOnly) {
    return {
      title: "RFI",
      intro: "Your RFI access is read-only: you can open any RFI and read its thread, timeline and history.",
      items: [
        {
          ...RFI_DASHBOARD,
          how: "Open RFI, choose the project, then pick a tab. Click any RFI to read its full thread and timeline.",
        },
        RFI_SEARCH,
        {
          title: "RFI keyboard shortcuts",
          text: "Plain-key shortcuts for reading: / to search, r to refresh, 1 for the RFI list, 3 for the Dashboard and ? to see this list. In the RFI list use the Up and Down arrows to move between RFIs and Enter to open one.",
          how: "Click an empty part of the RFI page and press ?. They are ignored while you type in a box or while a window is open.",
        },
      ],
    };
  }
  return {
    title: "RFI",
    intro: "Raise, track and answer requests for information without leaving the app.",
    items: RFI_ITEMS,
  };
};

/** Projects for Lead / Zeeshan / Employee: nothing at all without access. */
const projectsSection = (a: Access): Section | null =>
  a.projects
    ? {
        title: "Projects",
        items: [
          { title: "Project status", text: "The status of each project, its change orders and approvals in one place.", how: "Open Projects, search or filter, and click a project to see its details. Use a share link to give a client a read-only view." },
        ],
      }
    : null;

const joinNames = (names: string[]): string =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/** The sidebar paragraph lists exactly the menus this person has. */
const basicMenu = (a: Access): Section => {
  const menus = ["Work Record", "Permission Hub", ...(a.rfi ? ["RFI"] : []), ...(a.projects ? ["Projects"] : [])];
  return {
    title: "Your sidebar menu",
    items: [
      {
        title: "What you will see",
        text: `Your sidebar has ${joinNames(menus)}.`,
        how: "Click an item to open it, or press Ctrl+K and type its name.",
      },
    ],
  };
};

/** The Owner's RFI section: everything in the common one, plus the Owner's own buttons. */
const rfiSectionOwner = (): Section => ({
  title: "RFI",
  intro: "The Owner always has full RFI access and decides who else gets it (Admin Console, Access Control).",
  items: [
    ...RFI_ITEMS.filter((i) => !i.title.startsWith("Internal review")),
    { title: "Approving and sending internal RFIs", text: "Once the Checker approves, an internal RFI becomes a draft waiting for you. Nothing reaches the client until you send it, and then it becomes an external RFI with its history kept.", how: "Open the draft and use Edit draft, then Approve & Send to add the client's To and CC. Resubmit to Draft Creator sends it back to whoever wrote it. Send back to Checker returns it for another review (hidden when you are also the Checker). Cancel draft stops it." },
    { title: "Client share link", text: "Give a client a live, read-only view of an RFI's status without a login.", how: "Open the RFI and use Share to create the link." },
    { title: "Gmail and email settings", text: "Connect the Gmail account the RFI emails are sent from and manage the address book for To and CC.", how: "Open the RFI Settings tab and follow the prompts." },
  ],
});

const compact = (list: Array<Section | null>): Section[] => list.filter((s): s is Section => s !== null);

/* ─────────────────────────────── the four categories ─────────────────────────────── */

const buildGuides = (a: Access): Guide[] => [
  {
    key: "owner",
    label: "Owner",
    tagline: "You manage people, access, approvals and the company's communication.",
    icon: Crown,
    sections: [
      {
        title: "Admin & Media: Admin Console",
        intro: "Opens with two tabs: Admin Console and Media Hub.",
        items: [
          { title: "Add and manage employees", text: "Create accounts, set each person's role (Owner, IT, Lead or Employee) and an optional designation such as Senior Checker. The list is grouped Owners, IT, Leads, then Employees, with a search box.", how: "Admin Console, then All Employees to search and edit, or Add Employee to create one (username, a password of 6+ characters and a role)." },
          { title: "Access Control", text: "Decides who can use the RFI module (No access, View only or Full access) and who can open Projects. Changes show up for that person without logging in again.", how: "In Access Control, find the person and choose their RFI level and the Projects switch." },
          { title: "Vault", text: "A protected area for sensitive files. It is locked behind a two-factor code from your authenticator app.", how: "Open Vault, set up 2FA the first time by scanning the code, then enter the 6-digit code to unlock." },
        ],
      },
      {
        title: "Admin & Media: Media Hub",
        items: [
          { title: "Write and post to LinkedIn", text: "AI helps write posts and create images, which you can preview and publish to LinkedIn.", how: "Media Hub, type a topic or choose a suggested idea, generate, edit the text, then Publish." },
          { title: "Schedule posts", text: "Plan posts for later, once or repeating weekly or monthly, and see which are pending, done or failed.", how: "Choose Scheduled mode, set the date and time and the repeat, then save. Manage them in the scheduled posts panel." },
        ],
      },
      {
        title: "Employee Portal",
        intro: "Two tabs: Employee Hub and Dashboard.",
        items: [
          { title: "Employee Hub", text: "The Work Report, Leave Portal, Permission Portal and Weekend Entries of everyone, in one place. Approve or reject leave, permission and change requests here.", how: "Open Employee Portal, pick the tab, then use the approve or reject buttons on a request (add a note when rejecting)." },
          { title: "Hours Dashboard", text: "Hours logged by employee, client and project, filtered by year, to see where time is going.", how: "Open the Dashboard tab and choose a year, client or project." },
          { title: "Weekend Attendance Dashboard", text: "See and manage who worked on weekends, and export the list as a CSV file.", how: "Open it from Ctrl+K (Weekend Attendance Dashboard), filter the dates and press Export." },
        ],
      },
      rfiSectionOwner(),
      {
        title: "Projects",
        items: [
          { title: "Project status and change orders", text: "Track every project's status, change orders and approvals, and share a read-only link with a client.", how: "Open Projects, click a project, and use Share to create the client link." },
        ],
      },
      {
        title: "Owner Mail (header)",
        items: [
          { title: "Email your team", text: "Send one email to whole groups (Editors, Checkers, Modelers, Designer & Estimator, Leads) or to chosen people. AI can write the message for you. A standard closing is added automatically.", how: "Click the mail icon in the header, pick the To and CC groups or people, write or generate the message and press Send. Hover the people count to see exactly who gets it." },
        ],
      },
      {
        title: "Your own pages",
        items: [
          { title: "My Documents", text: "Keep your bank details and ID documents (PAN, Aadhaar, marksheets) on file.", how: "Ctrl+K, type My Documents, then fill the form or upload the files." },
          { title: "Work Report and Permission Hub", text: "You can also log your own work, weekend entries, leave and permission.", how: "Use Ctrl+K to jump to them (Work Report, Leave Portal, Permission Portal)." },
        ],
      },
      ...everyone(true),
    ],
  },
  {
    key: "lead",
    label: "Lead",
    tagline: "You work on projects and keep your team's information up to date.",
    icon: Users,
    sections: [
      basicMenu(a),
      ...compact([rfiSection(a)]),
      WORK_RECORD,
      ...compact([projectsSection(a)]),
      PERMISSION_HUB,
      {
        title: "My Documents",
        items: [
          { title: "Bank details and ID documents", text: "Store your bank details (the bank is checked from your IFSC code) and upload PAN, Aadhaar and marksheet files.", how: "Ctrl+K, type My Documents, fill in the form and upload the documents." },
        ],
      },
      ...everyone(false),
    ],
  },
  {
    key: "zeeshan",
    label: "Zeeshan",
    tagline: "Everything in your normal menu, plus the Media Hub that has been given to you.",
    icon: Sparkles,
    sections: [
      {
        title: "Media Hub",
        items: [
          { title: "Write and post to LinkedIn", text: "AI helps write posts and create images, which you can preview and publish to LinkedIn.", how: "Open Media Hub, type a topic or pick a suggestion, generate, edit the text, then Publish." },
          { title: "Schedule posts", text: "Plan posts for later, once or repeating weekly or monthly, and follow their progress.", how: "Choose Scheduled mode, set the date, time and repeat, then save. Manage them in the scheduled posts panel." },
        ],
      },
      basicMenu(a),
      ...compact([rfiSection(a)]),
      WORK_RECORD,
      ...compact([projectsSection(a)]),
      PERMISSION_HUB,
      ...everyone(false),
    ],
  },
  {
    key: "employee",
    label: "Employee",
    tagline: "Log your work, apply for leave and permission, and stay in touch with the team.",
    icon: User,
    sections: [basicMenu(a), WORK_RECORD, PERMISSION_HUB, ...compact([rfiSection(a), projectsSection(a)]), ...everyone(false)],
  },
];

/* ─────────────────────────────── which category is mine? ─────────────────────────────── */

const guideKeyFor = (role: string | null, name: string | null): GuideKey => {
  if (role === "OWNER") return "owner";
  if ((name || "").trim().toLowerCase() === "zeeshan") return "zeeshan";
  if (role === "LEAD") return "lead";
  return "employee"; // USER, ADMIN, MANAGER (IT) share the standard employee menu
};

/* ─────────────────────────────── look and feel ─────────────────────────────── */

// Pure CSS (no requests, no timers, nothing stored). In the dark theme the accent is the sidebar
// highlight (it follows the colour picked with the palette icon), because --primary is near-white there.
const STYLES = `
  .ag-dialog.ag-dialog {
    --ag-accent: var(--primary);
    --ag-card: var(--card);
    border: 1px solid hsl(var(--border));
    border-radius: 20px;
    background: hsl(var(--background));
    box-shadow: 0 30px 80px -24px hsl(var(--foreground) / 0.4);
  }
  .dark .ag-dialog.ag-dialog {
    --ag-accent: var(--sidebar-primary);
    border-color: hsl(0 0% 100% / 0.1);
    background:
      radial-gradient(110% 55% at 0% 0%, hsl(var(--ag-accent) / 0.2), transparent 60%),
      radial-gradient(80% 45% at 100% 100%, hsl(280 80% 60% / 0.12), transparent 65%),
      hsl(224 45% 6%);
    box-shadow:
      0 0 0 1px hsl(var(--ag-accent) / 0.25),
      0 40px 120px -30px hsl(var(--ag-accent) / 0.6),
      0 0 90px -30px hsl(280 80% 60% / 0.45);
  }

  /* header banner */
  .ag-head {
    position: relative;
    flex: none; /* never squeezed by the long list below, which is what cut the header in half */
    overflow: hidden;
    padding: 18px 56px 14px 20px;
    border-bottom: 1px solid hsl(var(--border));
    background: linear-gradient(135deg, hsl(var(--ag-accent) / 0.1), transparent 65%);
  }
  .dark .ag-head {
    border-bottom-color: hsl(0 0% 100% / 0.08);
    background: linear-gradient(135deg, hsl(var(--ag-accent) / 0.3), hsl(265 80% 60% / 0.1) 55%, transparent);
  }
  .ag-aurora {
    position: absolute; top: -90%; right: -12%; width: 55%; height: 260%;
    background: conic-gradient(from 0deg, transparent, hsl(var(--ag-accent) / 0.55), hsl(280 90% 65% / 0.4), transparent);
    filter: blur(44px); opacity: 0; pointer-events: none;
    animation: ag-spin 16s linear infinite;
  }
  .dark .ag-aurora { opacity: 0.6; }
  .ag-head-row { position: relative; display: flex; align-items: center; gap: 14px; }
  .ag-badge {
    position: relative; flex: none; display: grid; place-items: center;
    width: 46px; height: 46px; border-radius: 15px;
    background: linear-gradient(145deg, hsl(var(--ag-accent) / 0.16), hsl(var(--ag-accent) / 0.05));
    border: 1px solid hsl(var(--ag-accent) / 0.35);
  }
  .dark .ag-badge {
    background: linear-gradient(145deg, hsl(var(--ag-accent) / 0.45), hsl(265 80% 60% / 0.18));
    border-color: hsl(0 0% 100% / 0.22);
    box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.3), 0 8px 28px -8px hsl(var(--ag-accent) / 0.9);
  }
  .ag-badge::after {
    content: ""; position: absolute; inset: -1px; border-radius: inherit;
    border: 1px solid hsl(var(--ag-accent) / 0.6);
    animation: ag-ring 2.8s ease-out infinite;
  }
  .ag-title { font-size: 1.15rem; font-weight: 700; line-height: 1.2; letter-spacing: -0.01em; }
  .dark .ag-title {
    background: linear-gradient(90deg, #fff, color-mix(in srgb, hsl(var(--ag-accent)) 55%, white));
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }

  /* category tabs */
  .ag-tab {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 12px; border-radius: 999px;
    border: 1px solid hsl(var(--border));
    font-size: 12px; font-weight: 600;
    color: hsl(var(--muted-foreground));
    transition: transform .2s ease, background .2s ease, border-color .2s ease, box-shadow .25s ease, color .2s ease;
  }
  .ag-tab:hover { transform: translateY(-1px); color: hsl(var(--foreground)); border-color: hsl(var(--ag-accent) / 0.5); }
  .ag-tab[aria-selected="true"] {
    color: hsl(var(--primary-foreground)); background: hsl(var(--primary)); border-color: hsl(var(--primary));
  }
  .dark .ag-tab { border-color: hsl(0 0% 100% / 0.12); background: hsl(0 0% 100% / 0.04); }
  .dark .ag-tab[aria-selected="true"] {
    color: #fff;
    background: linear-gradient(135deg, hsl(var(--ag-accent)), hsl(265 75% 55%));
    border-color: hsl(0 0% 100% / 0.3);
    box-shadow: 0 6px 22px -6px hsl(var(--ag-accent) / 0.9);
  }

  /* body */
  .ag-body { scrollbar-width: thin; scrollbar-color: hsl(var(--ag-accent) / 0.5) transparent; }
  .ag-sec-title {
    display: flex; align-items: center; gap: 10px;
    font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
    color: hsl(var(--ag-accent));
  }
  .dark .ag-sec-title { color: color-mix(in srgb, hsl(var(--ag-accent)) 60%, white); }
  .ag-sec-title::after { content: ""; flex: 1; height: 1px; background: linear-gradient(90deg, hsl(var(--ag-accent) / 0.45), transparent); }
  .ag-num {
    display: grid; place-items: center; flex: none; width: 22px; height: 22px; border-radius: 8px;
    font-size: 11px; font-weight: 800; letter-spacing: 0; color: hsl(var(--background));
    background: hsl(var(--ag-accent));
  }
  .dark .ag-num { color: #fff; background: linear-gradient(135deg, hsl(var(--ag-accent)), hsl(265 75% 55%)); box-shadow: 0 4px 14px -4px hsl(var(--ag-accent) / 0.9); }

  .ag-item {
    position: relative; overflow: hidden; padding: 12px 14px 12px 16px; border-radius: 12px;
    border: 1px solid hsl(var(--border)); background: hsl(var(--ag-card));
    opacity: 0; animation: ag-rise .45s cubic-bezier(.2,.8,.2,1) forwards; animation-delay: calc(var(--i, 0) * 40ms);
    transition: transform .22s ease, border-color .22s ease, box-shadow .25s ease, background .25s ease;
  }
  .ag-item::before {
    content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
    background: linear-gradient(180deg, hsl(var(--ag-accent)), hsl(280 80% 65%));
    transform: scaleY(0.35); transform-origin: top; opacity: 0.55; transition: transform .3s ease, opacity .3s ease;
  }
  .ag-item:hover { transform: translateY(-2px); border-color: hsl(var(--ag-accent) / 0.5); box-shadow: 0 14px 30px -16px hsl(var(--ag-accent) / 0.7); }
  .ag-item:hover::before { transform: scaleY(1); opacity: 1; }
  .dark .ag-item {
    border-color: hsl(0 0% 100% / 0.09);
    background: linear-gradient(180deg, hsl(0 0% 100% / 0.07), hsl(0 0% 100% / 0.02));
  }
  .dark .ag-item:hover {
    border-color: hsl(var(--ag-accent) / 0.75);
    background: linear-gradient(180deg, hsl(var(--ag-accent) / 0.18), hsl(0 0% 100% / 0.03));
    box-shadow: 0 0 0 1px hsl(var(--ag-accent) / 0.3), 0 18px 44px -18px hsl(var(--ag-accent) / 0.9);
  }

  .ag-how {
    display: flex; align-items: flex-start; gap: 6px; margin-top: 8px; padding: 7px 9px; border-radius: 8px;
    font-size: 12px; line-height: 1.5; background: hsl(var(--ag-accent) / 0.07);
  }
  .dark .ag-how { background: hsl(var(--ag-accent) / 0.16); color: hsl(210 40% 94%); }
  .ag-how svg { flex: none; margin-top: 2px; color: hsl(var(--ag-accent)); transition: transform .25s ease; }
  .dark .ag-how svg { color: color-mix(in srgb, hsl(var(--ag-accent)) 55%, white); }
  .ag-item:hover .ag-how svg { transform: translateX(3px); }

  @keyframes ag-rise { from { opacity: 0; transform: translateY(10px) scale(.985); } to { opacity: 1; transform: none; } }
  @keyframes ag-spin { to { transform: rotate(360deg); } }
  @keyframes ag-ring { 0% { opacity: .7; transform: scale(1); } 100% { opacity: 0; transform: scale(1.35); } }

  @media (prefers-reduced-motion: reduce) {
    .ag-aurora, .ag-badge::after { animation: none; }
    .ag-item { animation: none; opacity: 1; }
    .ag-item, .ag-tab, .ag-how svg { transition: none; }
  }
`;

/* ─────────────────────────────── the button + the guide ─────────────────────────────── */

export const AppGuide = () => {
  const { role, name } = useAuth();
  const { theme } = useTheme();
  const { rfi, rfiViewOnly, projects } = useModuleAccess();
  const [open, setOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const mine = guideKeyFor(role, name);
  const [picked, setPicked] = useState<GuideKey | null>(null);

  // Rebuilt whenever the person's access changes (a grant or revoke in Access Control).
  const guides = useMemo(() => buildGuides({ rfi, rfiViewOnly, projects }), [rfi, rfiViewOnly, projects]);

  // The Owner can read every category; everyone else sees their own.
  const visible = useMemo(() => (role === "OWNER" ? guides : guides.filter((g) => g.key === mine)), [guides, role, mine]);
  const active = visible.find((g) => g.key === (picked ?? mine)) ?? visible[0];

  let itemNo = 0; // running number, so the cards appear one after another

  return (
    <>
      <button
        type="button"
        className="header-icon-btn"
        aria-label="How to use this app"
        title="How to use this app"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => {
          setPicked(null);
          setOpen(true);
        }}
      >
        <AnimatedIconBase
          pngSrc="/icons/info.png"
          animatedSrc="/icons/info.gif"
          alt="How to use this app"
          size="xl"
          triggerParentHover
          isParentHovered={isHovered}
          whiteBackground="auto"
          forceWhite={theme === "dark"}
        />
      </button>

      <style>{STYLES}</style>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="ag-dialog flex max-h-[88vh] w-[min(48rem,calc(100vw-1.5rem))] max-w-none flex-col gap-0 overflow-hidden p-0">
          <div className="ag-head">
            <div className="ag-aurora" aria-hidden="true" />
            <div className="ag-head-row">
              <span className="ag-badge">
                <AnimatedIconBase
                  pngSrc="/icons/info.png"
                  animatedSrc="/icons/info.gif"
                  alt=""
                  size="2xl"
                  whiteBackground="auto"
                  forceWhite={theme === "dark"}
                />
              </span>
              <div className="min-w-0">
                <DialogTitle className="ag-title">How to use this app</DialogTitle>
                <DialogDescription className="mt-1 text-xs text-muted-foreground">
                  What you can do, where to find it, and the shortcuts that save time.
                </DialogDescription>
              </div>
            </div>

            {visible.length > 1 && (
              <div className="relative mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Guide category">
                {visible.map((g) => {
                  const Icon = g.icon;
                  return (
                    <button
                      key={g.key}
                      type="button"
                      role="tab"
                      aria-selected={g.key === active.key}
                      onClick={() => setPicked(g.key)}
                      className="ag-tab"
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {g.label}
                      {g.key === mine && <span className="opacity-70">(you)</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* key = category, so the cards animate in again every time the tab changes */}
          <div key={active.key} className="ag-body min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
            {active.sections.map((section, sIdx) => (
              <section key={section.title} className="space-y-2">
                <h3 className="ag-sec-title">
                  <span className="ag-num">{sIdx + 1}</span>
                  {section.title}
                </h3>
                {section.intro && <p className="text-xs text-muted-foreground">{section.intro}</p>}
                <ul className="space-y-2">
                  {section.items.map((item) => (
                    <li key={item.title} className="ag-item" style={{ "--i": Math.min(itemNo++, 14) } as CSSProperties}>
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.text}</p>
                      {item.how && (
                        <p className="ag-how">
                          <ChevronRight className="h-3.5 w-3.5" />
                          <span>
                            <span className="font-semibold">How to use: </span>
                            {item.how}
                          </span>
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};