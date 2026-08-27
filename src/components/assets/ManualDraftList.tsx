import { FileUp, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import {
  createManualDraft,
  MANUAL_TYPES,
  type ManualDraft,
  type ManualType,
} from "@/services/assets/manualUploadService";

/**
 * Shared metadata editor for pending original manuals. Both the new-equipment
 * panel and the asset page render this, so there is only one upload UX and one
 * upload pipeline.
 */
export function ManualDraftList({
  drafts,
  onChange,
}: {
  drafts: ManualDraft[];
  onChange: (next: ManualDraft[]) => void;
}) {
  const { t } = useI18n();

  function patch(id: string, values: Partial<ManualDraft>) {
    onChange(drafts.map((draft) => (draft.id === id ? { ...draft, ...values } : draft)));
  }

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-sm hover:bg-muted/40">
        <FileUp className="size-5" />
        {t("assets.selectPdfs")}
        <input
          className="hidden"
          type="file"
          accept="application/pdf,.pdf"
          multiple
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.currentTarget.value = "";
            const accepted = files.filter((file) => /\.pdf$/i.test(file.name));
            if (accepted.length !== files.length) toast.error(t("assets.pdfOnly"));
            onChange([...drafts, ...accepted.map(createManualDraft)]);
          }}
        />
      </label>

      {drafts.map((draft) => (
        <div key={draft.id} className="space-y-3 rounded-md border p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-muted-foreground" dir="ltr">
              {draft.file.name} — {(draft.file.size / 1024 / 1024).toFixed(2)} MB
            </p>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("action.delete")}
              onClick={() => onChange(drafts.filter((item) => item.id !== draft.id))}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <Field label={t("assets.manualTitle")}>
              <Input
                value={draft.title}
                onChange={(event) => patch(draft.id, { title: event.target.value })}
              />
            </Field>
            <Field label={t("assets.manualType")}>
              <Select
                value={draft.manualType}
                onValueChange={(value) => patch(draft.id, { manualType: value as ManualType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MANUAL_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`catalogType.${type}` as never) || type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("assets.language")}>
              <Select
                value={draft.language}
                onValueChange={(value) => patch(draft.id, { language: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">EN</SelectItem>
                  <SelectItem value="ar">AR</SelectItem>
                  <SelectItem value="ja">JA</SelectItem>
                  <SelectItem value="ru">RU</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("assets.revision")}>
              <Input
                dir="ltr"
                value={draft.revision}
                onChange={(event) => patch(draft.id, { revision: event.target.value })}
              />
            </Field>
            <Field label={t("assets.catalogNumber")}>
              <Input
                dir="ltr"
                value={draft.catalogNumber}
                onChange={(event) => patch(draft.id, { catalogNumber: event.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("assets.serialFrom")}>
                <Input
                  dir="ltr"
                  value={draft.serialFrom}
                  onChange={(event) => patch(draft.id, { serialFrom: event.target.value })}
                />
              </Field>
              <Field label={t("assets.serialTo")}>
                <Input
                  dir="ltr"
                  value={draft.serialTo}
                  onChange={(event) => patch(draft.id, { serialTo: event.target.value })}
                />
              </Field>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
