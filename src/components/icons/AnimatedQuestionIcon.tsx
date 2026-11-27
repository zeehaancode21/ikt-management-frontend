import { SidebarAnimatedIcon, type SidebarAnimatedIconProps } from "./SidebarAnimatedIcon";

/**
 * Leave & Permission sidebar icon — shows /icons/question.png and plays /icons/question.gif on hover.
 * Same behaviour as the other sidebar icons (white-background knockout, dark/light theme handling)
 * because it is built on SidebarAnimatedIcon.
 */
export const AnimatedQuestionIcon = ({ ariaLabel = "Leave & Permission", ...props }: SidebarAnimatedIconProps) => (
  <SidebarAnimatedIcon {...props} ariaLabel={ariaLabel} pngSrc="/icons/question.png" animatedSrc="/icons/question.gif" />
);