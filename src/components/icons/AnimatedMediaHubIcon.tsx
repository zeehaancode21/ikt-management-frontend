import { SidebarAnimatedIcon, type SidebarAnimatedIconProps } from "./SidebarAnimatedIcon";

/**
 * Media Hub sidebar icon — shows /icons/media.png and plays /icons/media.gif on hover.
 * Light theme keeps the artwork colours; dark theme renders clean white
 * artwork with no white box (see SidebarAnimatedIcon).
 */
export const AnimatedMediaHubIcon = ({ ariaLabel = "Media Hub", ...props }: SidebarAnimatedIconProps) => (
  <SidebarAnimatedIcon {...props} ariaLabel={ariaLabel} pngSrc="/icons/media.png" animatedSrc="/icons/media.gif" />
);