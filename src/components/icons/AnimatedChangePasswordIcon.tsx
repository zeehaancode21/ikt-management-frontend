import { SidebarAnimatedIcon, type SidebarAnimatedIconProps } from "./SidebarAnimatedIcon";

/**
 * Change-password icon — shows /icons/changepassword.png and plays
 * /icons/changepassword.gif on hover.
 * Put both files in  public/icons/
 */
export const AnimatedChangePasswordIcon = ({
  ariaLabel = "Change password",
  ...props
}: SidebarAnimatedIconProps) => (
  <SidebarAnimatedIcon
    {...props}
    ariaLabel={ariaLabel}
    pngSrc="/icons/changepassword.png"
    animatedSrc="/icons/changepassword.gif"
  />
);

export default AnimatedChangePasswordIcon;