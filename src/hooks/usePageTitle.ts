import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// Browser-tab title per page, so tabs and history are readable. Pure UI: one
// string assignment when the route changes.
const TITLES: Array<[string, string]> = [
  ["/leave", "Leave Portal"],
  ["/permission", "Permission Portal"],
  ["/reports", "Work Report"],
  ["/weekend-attendance/dashboard", "Weekend Attendance Dashboard"],
  ["/weekend-attendance", "Weekend Entry"],
  ["/progress", "Work Progress"],
  ["/dashboard", "Projects"],
  ["/hours-dashboard", "Hours Dashboard"],
  ["/employee-hub", "Employee Hub"],
  ["/admin", "Admin Console"],
  ["/social-hub", "Media Hub"],
  ["/rfi", "RFI"],
  ["/messages", "Messages"],
  ["/documents", "Documents"],
  ["/my-documents", "My Documents"],
  ["/my-profile", "My Profile"],
  ["/owner-mail", "Owner Mail"],
  ["/vault", "Vault"],
];

export function usePageTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const hit = TITLES.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + "/"));
    document.title = hit ? `${hit[1]} · IK Tangience` : "IK Tangience";
  }, [pathname]);
}