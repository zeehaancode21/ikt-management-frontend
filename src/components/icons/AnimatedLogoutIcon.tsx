import { SidebarAnimatedIcon, type SidebarAnimatedIconProps } from "./SidebarAnimatedIcon";

/**
 * Logout icon — shows /icons/logout.png and plays /icons/logout.gif on hover.
 * Put both files in  public/icons/
 * (you wrote "logoput.gif" — I assumed a typo for logout.gif; if your file
 * really is named logoput.gif, change animatedSrc below.)
 */
export const AnimatedLogoutIcon = ({
  ariaLabel = "Log out",
  ...props
}: SidebarAnimatedIconProps) => (
  <SidebarAnimatedIcon
    {...props}
    ariaLabel={ariaLabel}
    pngSrc="/icons/logout.png"
    animatedSrc="/icons/logout.gif"
  />
);

export default AnimatedLogoutIcon;