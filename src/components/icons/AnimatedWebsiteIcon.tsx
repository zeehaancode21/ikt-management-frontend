import type { ImgHTMLAttributes } from "react";

interface AnimatedWebsiteIconProps extends ImgHTMLAttributes<HTMLImageElement> {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeMap = {
  sm: "w-2.5 h-2.5",  // 10px
  md: "w-3.5 h-3.5",  // 14px (matches current Globe size)
  lg: "w-4 h-4",      // 16px
  xl: "w-5 h-5",      // 20px
};

/**
 * Animated website/globe icon from Icons8
 * Displays the animated GIF in place of lucide-react Globe icon
 *
 * Replaces: <Globe className="sb-site-globe" />
 * 
 * Usage:
 * <AnimatedWebsiteIcon size="md" className="sb-site-globe" />
 */
export const AnimatedWebsiteIcon = ({
  className = "",
  size = "md",
  ...props
}: AnimatedWebsiteIconProps) => (
  <img
    src="/icons/icons8-website.gif"
    alt="Website"
    className={`${sizeMap[size]} ${className} inline-block`}
    {...props}
  />
);