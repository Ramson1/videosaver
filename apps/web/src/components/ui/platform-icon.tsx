import {
  Youtube,
  Music,
  Instagram,
  Twitter,
  Facebook,
  Pin,
  MessageCircle,
  Play,
  Globe,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlatformId } from "@/types";

// ============================================================
// PlatformIcon - Maps platform IDs to Lucide icons
// ============================================================

interface PlatformIconProps {
  platform: PlatformId | string;
  size?: number;
  className?: string;
  showBg?: boolean;
}

const iconMap: Record<string, LucideIcon> = {
  youtube: Youtube,
  tiktok: Music,
  instagram: Instagram,
  twitter: Twitter,
  facebook: Facebook,
  pinterest: Pin,
  reddit: MessageCircle,
  vimeo: Play,
  dailymotion: Play,
};

const colorMap: Record<string, string> = {
  youtube: "bg-red-500/10 text-red-500",
  tiktok: "bg-cyan-400/10 text-cyan-400",
  instagram: "bg-pink-500/10 text-pink-500",
  twitter: "bg-sky-500/10 text-sky-500",
  facebook: "bg-blue-600/10 text-blue-600",
  pinterest: "bg-red-600/10 text-red-600",
  reddit: "bg-orange-500/10 text-orange-500",
  vimeo: "bg-cyan-500/10 text-cyan-500",
  dailymotion: "bg-blue-700/10 text-blue-700",
};

export function PlatformIcon({
  platform,
  size = 20,
  className,
  showBg = false,
}: PlatformIconProps) {
  const Icon = iconMap[platform] ?? Globe;
  const colors = colorMap[platform] ?? "bg-gray-500/10 text-gray-500";

  if (showBg) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-xl p-2.5",
          colors,
          className
        )}
      >
        <Icon size={size} />
      </span>
    );
  }

  return <Icon size={size} className={cn(colors.split(" ")[1], className)} />;
}
