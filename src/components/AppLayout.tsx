import { Outlet, useLocation } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import HolidayHover from "@/pages/HolidayHover";
import { useAuth } from "@/context/AuthContext";
import NotificationBell from "./NotificationBell";

export const AppLayout = () => {
  const location = useLocation();
  const { name } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* SIDEBAR */}
      <div className="hidden w-[220px] shrink-0 border-r md:flex">
        <AppSidebar />
      </div>

      {/* MAIN CONTENT */}
      <div className="flex flex-1 flex-col overflow-hidden">

        {/* HEADER */}
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background px-6">
          <h1 className="text-sm font-semibold">Welcome, {name || "User"} 👋</h1>

          <div className="flex items-center gap-4">
            {location.pathname.includes("leave") && (
              <HolidayHover showOnlyBell={false} />
            )}
            {location.pathname.includes("progress") && (
              <HolidayHover showOnlyBell={true} />
            )}
            <NotificationBell />
          </div>
        </header>

        {/* PAGE */}
        <main className={`min-w-0 flex-1 overflow-x-hidden ${location.pathname.includes("messages") ? "overflow-hidden p-0" : "overflow-y-auto"}`}>
          <div className={location.pathname.includes("messages") ? "h-full p-4" : "px-6 py-8"}>
            <Outlet />
          </div>
        </main>

      </div>
    </div>
  );
};
