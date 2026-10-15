import { SidebarAnimatedIcon, type SidebarAnimatedIconProps } from "./SidebarAnimatedIcon";

/**
 * Admin sidebar icon — shows /icons/admin1.png and plays /icons/admin1.gif on hover.
 * Light theme keeps the artwork colours; dark theme renders clean white
 * artwork with no white box (see SidebarAnimatedIcon).
 */
export const AnimatedAdminIcon = ({ ariaLabel = "Admin Console", ...props }: SidebarAnimatedIconProps) => (
  <SidebarAnimatedIcon {...props} ariaLabel={ariaLabel} pngSrc="/icons/admin1.png" animatedSrc="/icons/admin1.gif" />
);

export default AnimatedAdminIcon;