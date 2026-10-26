import { SidebarAnimatedIcon, type SidebarAnimatedIconProps } from "./SidebarAnimatedIcon";

/**
 * RFI sidebar icon — shows /icons/rfi.png and plays /icons/rfi.gif on hover.
 * Light theme keeps the artwork colours; dark theme renders clean white
 * artwork with no white box (see SidebarAnimatedIcon).
 */
export const AnimatedRFIIcon = ({ ariaLabel = "RFI", ...props }: SidebarAnimatedIconProps) => (
  <SidebarAnimatedIcon {...props} ariaLabel={ariaLabel} pngSrc="/icons/rfi.png" animatedSrc="/icons/rfi.gif" />
);