import { SidebarAnimatedIcon, type SidebarAnimatedIconProps } from "./SidebarAnimatedIcon";

/**
 * Dashboard sidebar icon — shows /icons/dashboard1.png and plays /icons/dashboard1.gif on hover.
 * Light theme keeps the artwork colours; dark theme renders clean white
 * artwork with no white box (see SidebarAnimatedIcon).
 */
export const AnimatedDashboardIcon = ({ ariaLabel = "Dashboard", ...props }: SidebarAnimatedIconProps) => (
  <SidebarAnimatedIcon {...props} ariaLabel={ariaLabel} pngSrc="/icons/dashboard1.png" animatedSrc="/icons/dashboard1.gif" />
);

export default AnimatedDashboardIcon;