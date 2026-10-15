import { SidebarAnimatedIcon, type SidebarAnimatedIconProps } from "./SidebarAnimatedIcon";

/**
 * Admin Console icon — shows /icons/adminconsole.png and plays
 * /icons/adminconsole.gif on hover. Original colours in both themes.
 */
export const AnimatedAdminConsoleIcon = ({ ariaLabel = "Admin Console", ...props }: SidebarAnimatedIconProps) => (
  <SidebarAnimatedIcon {...props} ariaLabel={ariaLabel} pngSrc="/icons/adminconsole.png" animatedSrc="/icons/adminconsole.gif" />
);

export default AnimatedAdminConsoleIcon;