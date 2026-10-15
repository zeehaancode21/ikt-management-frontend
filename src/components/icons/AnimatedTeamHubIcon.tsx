import { SidebarAnimatedIcon, type SidebarAnimatedIconProps } from "./SidebarAnimatedIcon";

/**
 * Team Hub sidebar icon — shows /icons/team1.png and plays /icons/team1.gif on hover.
 * Light theme keeps the artwork colours; dark theme renders clean white
 * artwork with no white box (see SidebarAnimatedIcon).
 */
export const AnimatedTeamHubIcon = ({ ariaLabel = "Team Hub", ...props }: SidebarAnimatedIconProps) => (
  <SidebarAnimatedIcon {...props} ariaLabel={ariaLabel} pngSrc="/icons/team1.png" animatedSrc="/icons/team1.gif" />
);

export default AnimatedTeamHubIcon;