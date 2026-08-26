import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import type { EntityType } from "@/lib/types";

export type EntityLinkItem = {
  id: string;
  entityType: EntityType;
  entityId: string;
  timestamp: string;
};

/** Shared list renderer for favorites and recently opened records. */
export function EntityLinkList({ items }: { items: EntityLinkItem[] }) {
  const { t, formatDate } = useI18n();

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("state.empty")}</p>;
  }

  return (
    <>
      {items.map((item) => (
        <div
          key={item.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
        >
          <EntityLink entityType={item.entityType} entityId={item.entityId} />
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline">{item.entityType}</Badge>
            <span className="text-muted-foreground">{formatDate(item.timestamp)}</span>
          </div>
        </div>
      ))}
    </>
  );
}

function EntityLink({ entityType, entityId }: { entityType: EntityType; entityId: string }) {
  const className = "truncate font-mono text-sm text-primary hover:underline";

  if (entityType === "catalog") {
    return (
      <Link to="/catalogs/$catalogId" params={{ catalogId: entityId }} className={className}>
        {entityId.slice(0, 8)}
      </Link>
    );
  }
  if (entityType === "part") {
    return (
      <Link to="/parts/$partId" params={{ partId: entityId }} className={className}>
        {entityId.slice(0, 8)}
      </Link>
    );
  }
  if (entityType === "machine_model") {
    return (
      <Link to="/models/$modelId" params={{ modelId: entityId }} className={className}>
        {entityId.slice(0, 8)}
      </Link>
    );
  }
  if (entityType === "assembly") {
    return (
      <Link to="/assemblies/$assemblyId" params={{ assemblyId: entityId }} className={className}>
        {entityId.slice(0, 8)}
      </Link>
    );
  }
  return <span className="font-mono text-sm">{entityId.slice(0, 8)}</span>;
}
