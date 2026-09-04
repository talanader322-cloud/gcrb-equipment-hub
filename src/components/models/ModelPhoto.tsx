import { useQuery } from "@tanstack/react-query";
import {
  Cog,
  Construction,
  Fan,
  Forklift,
  Route as RouteIcon,
  Shovel,
  Tractor,
  Truck,
  Zap,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { modelImageService } from "@/services/models/modelImageService";

/**
 * Model photos live in the PRIVATE machine-images bucket, so they are always
 * rendered through a short-lived signed URL. A model without a photo shows the
 * icon of its equipment type instead of an empty box.
 */

const TYPE_ICONS: Record<string, typeof Truck> = {
  bulldozer: Tractor,
  "motor-grader": RouteIcon,
  "wheel-loader": Forklift,
  excavator: Shovel,
  "road-roller": Construction,
  "generator-set": Zap,
  "air-compressor": Fan,
  "heavy-equipment-engine": Cog,
  "dozer-attachment": Construction,
};

export function ModelPhoto({
  imagePath,
  imageUrl,
  equipmentTypeSlug,
  alt,
  className,
  iconClassName,
}: {
  imagePath?: string | null;
  imageUrl?: string | null;
  equipmentTypeSlug?: string | null;
  alt?: string;
  className?: string;
  iconClassName?: string;
}) {
  const signed = useQuery({
    queryKey: ["model-photo", imagePath],
    queryFn: () => modelImageService.signedUrl(imagePath),
    enabled: Boolean(imagePath),
    staleTime: 30 * 60 * 1000,
  });

  if (imagePath && signed.isLoading) {
    return <Skeleton className={cn("w-full", className)} />;
  }

  const src = signed.data ?? (imagePath ? null : (imageUrl ?? null));
  if (src) {
    return (
      <img
        src={src}
        alt={alt ?? ""}
        loading="lazy"
        decoding="async"
        className={cn("bg-muted/40 object-cover", className)}
      />
    );
  }

  const Icon = (equipmentTypeSlug && TYPE_ICONS[equipmentTypeSlug]) || Truck;
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-muted/40 text-muted-foreground/70",
        className,
      )}
      aria-hidden
    >
      <Icon className={cn("size-10", iconClassName)} strokeWidth={1.5} />
    </div>
  );
}
