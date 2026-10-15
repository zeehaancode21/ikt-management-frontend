import type { CSSProperties } from "react";
import { AnimatedIconBase, type IconSize } from "./AnimatedIconbase";

/**
 * Icons for the Admin Console tab strip and the Employees sub-tabs:
 *   Employees · Vault · All Employees · Add Employee
 *
 * Same behaviour as the Section tab icons: the still PNG is shown normally
 * and the GIF plays while the parent button is hovered (pass
 * `isParentHovered`). White backgrounds baked into the files are removed
 * automatically and the artwork keeps its own colours in light + dark mode.
 *
 * Put these files in  public/icons/  (names are case-sensitive on Linux hosts):
 *   employee.png  employee.gif
 *   vault.png     vault.gif
 *   all.png       all.gif
 *   add.png       add.gif
 *   addemployee.png  addemployee.gif   (the green "Add Employee" buttons)
 * (If you only have the GIFs, copy each one to a same-named .png — the first
 *  frame is used as the still picture — or point `png` below at the .gif.)
 */
const ICON_FILES = {
  employee: { png: "/icons/employee.png", gif: "/icons/employee.gif" },
  vault: { png: "/icons/vault.png", gif: "/icons/vault.gif" },
  all: { png: "/icons/all.png", gif: "/icons/all.gif" },
  add: { png: "/icons/add.png", gif: "/icons/add.gif" },
  addEmployee: { png: "/icons/addemployee.png", gif: "/icons/addemployee.gif" },
} as const;

export interface AdminConsoleTabIconProps {
  size?: IconSize;
  className?: string;
  /** Hover state of the button this icon sits in. */
  isParentHovered?: boolean;
  style?: CSSProperties;
  ariaLabel?: string;
  /** Recolour the artwork solid white (for icons on a coloured button). */
  forceWhite?: boolean;
}

const createIcon = (
  files: { png: string; gif: string },
  defaultLabel: string,
  displayName: string,
  sizeClass = "!w-5 !h-5"
) => {
  const Icon = ({
    size = "xl",
    className = "",
    isParentHovered = false,
    style,
    ariaLabel = defaultLabel,
    forceWhite = false,
  }: AdminConsoleTabIconProps) => (
    <span role="img" aria-label={ariaLabel} className="inline-flex shrink-0" style={style}>
      <AnimatedIconBase
        className={`${sizeClass} ${className}`}
        size={size}
        pngSrc={files.png}
        animatedSrc={files.gif}
        alt=""
        triggerParentHover
        isParentHovered={isParentHovered}
        whiteBackground="auto"
        forceWhite={forceWhite}
      />
    </span>
  );
  Icon.displayName = displayName;
  return Icon;
};

export const AnimatedEmployeeTabIcon = createIcon(ICON_FILES.employee, "Employees", "AnimatedEmployeeTabIcon");
export const AnimatedVaultTabIcon = createIcon(ICON_FILES.vault, "Vault", "AnimatedVaultTabIcon");
export const AnimatedAllEmployeesIcon = createIcon(ICON_FILES.all, "All Employees", "AnimatedAllEmployeesIcon");
export const AnimatedAddEmployeeIcon = createIcon(ICON_FILES.add, "Add Employee", "AnimatedAddEmployeeIcon");
const AnimatedAddEmployeeButtonIconBase = createIcon(
  ICON_FILES.addEmployee, "Add Employee", "AnimatedAddEmployeeButtonIcon", "!w-4 !h-4"
);

// Sits on the solid green "Add Employee" buttons, so it is drawn white.
export const AnimatedAddEmployeeButtonIcon = ({ forceWhite = true, ...props }: AdminConsoleTabIconProps) =>
  <AnimatedAddEmployeeButtonIconBase forceWhite={forceWhite} {...props} />;