import { SidebarAnimatedIcon, type SidebarAnimatedIconProps } from "./SidebarAnimatedIcon";

/**
 * Work & Attendance sidebar icon — shows /icons/workattendance.png and plays /icons/workattendance.gif on hover.
 * Light theme keeps the artwork colours; dark theme renders clean white
 * artwork with no white box (see SidebarAnimatedIcon).
 */
export const AnimatedWorkAttendanceIcon = ({ ariaLabel = "Work & Attendance", ...props }: SidebarAnimatedIconProps) => (
  <SidebarAnimatedIcon {...props} ariaLabel={ariaLabel} pngSrc="/icons/workattendance.png" animatedSrc="/icons/workattendance.gif" />
);

export default AnimatedWorkAttendanceIcon;