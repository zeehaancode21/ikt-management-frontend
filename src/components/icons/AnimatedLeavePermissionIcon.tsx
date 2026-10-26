import { SidebarAnimatedIcon, type SidebarAnimatedIconProps } from "./SidebarAnimatedIcon";

/**
 * Leave & Permission sidebar icon — shows /icons/leave.png and plays /icons/leave.gif on hover.
 * Light theme keeps the artwork colours; dark theme renders clean white
 * artwork with no white box (see SidebarAnimatedIcon).
 */
export const AnimatedLeavePermissionIcon = ({ ariaLabel = "Leave & Permission", ...props }: SidebarAnimatedIconProps) => (
  <SidebarAnimatedIcon {...props} ariaLabel={ariaLabel} pngSrc="/icons/leave.png" animatedSrc="/icons/leave.gif" />
);