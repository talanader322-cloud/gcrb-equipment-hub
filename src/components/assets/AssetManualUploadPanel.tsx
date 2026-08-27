import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ManualDraftList } from "@/components/assets/ManualDraftList";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { type ManualDraft, uploadAssetManuals } from "@/services/assets/manualUploadService";

/**
 * Adds original manuals to an EXISTING machine asset using the shared unified
 * pipeline (validate -> hash -> private upload -> atomic RPC -> cleanup).
 */
export function AssetManualUploadPanel({ assetId }: { assetId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<ManualDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(0);

  async function save() {
    if (drafts.length === 0) return;
    setSaving(true);
    setDone(0);
    try {
      await uploadAssetManuals(assetId, drafts, (completed) => setDone(completed));
      toast.success(t("assets.manualsSaved"));
      setDrafts([]);
      await queryClient.invalidateQueries({ queryKey: ["asset", assetId] });
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("state.error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("assets.addManuals")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ManualDraftList drafts={drafts} onChange={setDrafts} />
        {saving && (
          <p className="text-sm text-muted-foreground">
            {t("assets.uploading")} {done}/{drafts.length}
          </p>
        )}
        <Button disabled={saving || drafts.length === 0} onClick={save}>
          <Plus className="me-2 size-4" />
          {t("assets.saveManuals")}
        </Button>
      </CardContent>
    </Card>
  );
}
