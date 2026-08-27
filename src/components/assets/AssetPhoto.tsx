import { useQuery } from "@tanstack/react-query";
import { ImageOff } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { assetRepository } from "@/services/repositories/assetRepository";

/**
 * Machine photos live in the PRIVATE machine-images bucket, so they are always
 * rendered through a short-lived signed URL — never a public object URL.
 */
export function AssetPhoto({
  path,
  fallbackPath,
  alt,
  className,
}: {
  path?: string | null;
  fallbackPath?: string | null;
  alt?: string;
  className?: string;
}) {
  const effective = path || fallbackPath || null;
  const signed = useQuery({
    queryKey: ["asset-photo", effective],
    queryFn: () => assetRepository.signedPhotoUrl(effective),
    enabled: Boolean(effective),
    staleTime: 30 * 60 * 1000,
  });

  if (effective && signed.isLoading) {
    return <Skeleton className={cn("w-full", className)} />;
  }

  if (!effective || !signed.data) {
    return (
      <div
        className={cn(
          "flex items-center justify-center border-b bg-muted/40 text-muted-foreground",
          className,
        )}
      >
        <ImageOff className="size-6" aria-hidden />
      </div>
    );
  }

  return (
    <img
      src={signed.data}
      alt={alt ?? ""}
      loading="lazy"
      className={cn("border-b bg-muted/40 object-cover", className)}
    />
  );
}
