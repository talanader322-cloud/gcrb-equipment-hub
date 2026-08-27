import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ManualDraftList } from "@/components/assets/ManualDraftList";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccess, useSession } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import { type ManualDraft, uploadAssetManuals } from "@/services/assets/manualUploadService";
import { assetRepository } from "@/services/repositories/assetRepository";
import { catalogRepository } from "@/services/repositories/catalogRepository";

export function NewEquipmentPanel({ onSaved }: { onSaved?: () => void }) {
  const { locale, t } = useI18n();
  const { user } = useSession();
  const access = useAccess(user?.id);
  const canManage = Boolean(access.data?.canManageCatalog);
  const models = useQuery({
    queryKey: ["models-for-new-asset"],
    queryFn: () => catalogRepository.listModels({ pageSize: 200 }),
  });

  const [form, setForm] = useState({
    machineModelId: "",
    serialNumber: "",
    assetNumber: "",
    manufactureYear: "",
    branch: "",
    project: "",
    purchaseReference: "",
    notes: "",
  });
  const [manuals, setManuals] = useState<ManualDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);

  const selectedModel = useMemo(
    () => models.data?.rows.find((model) => model.id === form.machineModelId),
    [models.data?.rows, form.machineModelId],
  );

  if (!canManage && !access.isLoading) return null;

  async function save() {
    if (!user?.id || !form.machineModelId || !form.serialNumber.trim()) return;

    setSaving(true);
    setProgress(0);
    try {
      const assetId = await assetRepository.createAsset({
        machine_model_id: form.machineModelId,
        serial_number: form.serialNumber.trim(),
        asset_number: form.assetNumber.trim() || null,
        manufacture_year: form.manufactureYear ? Number(form.manufactureYear) : null,
        branch: form.branch.trim() || null,
        project: form.project.trim() || null,
        purchase_reference: form.purchaseReference.trim() || null,
        notes: form.notes.trim() || null,
        created_by: user.id,
      });

      // Unified original-manual pipeline: validate -> SHA-256 -> private upload
      // -> atomic catalogs/catalog_files/asset_manuals RPC -> cleanup on failure.
      await uploadAssetManuals(assetId, manuals, (done, total) =>
        setProgress(Math.round((done / Math.max(total, 1)) * 100)),
      );

      toast.success(
        locale === "ar" ? "تمت إضافة المعدة وحفظ كتالوجاتها." : "Equipment and manuals saved.",
      );
      setForm({
        machineModelId: "",
        serialNumber: "",
        assetNumber: "",
        manufactureYear: "",
        branch: "",
        project: "",
        purchaseReference: "",
        notes: "",
      });
      setManuals([]);
      onSaved?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("state.error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {locale === "ar" ? "إضافة معدة جديدة مع كتالوجاتها" : "New Equipment & Manuals"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Field label={locale === "ar" ? "الموديل" : "Model"}>
            <Select
              value={form.machineModelId}
              onValueChange={(value) => setForm({ ...form, machineModelId: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder={locale === "ar" ? "اختر الموديل" : "Select model"} />
              </SelectTrigger>
              <SelectContent>
                {models.data?.rows.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.manufacturer?.name} — {model.model_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Serial Number">
            <Input
              dir="ltr"
              value={form.serialNumber}
              onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
            />
          </Field>
          <Field label={locale === "ar" ? "رقم الأصل / الرقم المؤسسي" : "Asset number"}>
            <Input
              dir="ltr"
              value={form.assetNumber}
              onChange={(e) => setForm({ ...form, assetNumber: e.target.value })}
            />
          </Field>
          <Field label={locale === "ar" ? "سنة الصنع" : "Manufacture year"}>
            <Input
              dir="ltr"
              type="number"
              value={form.manufactureYear}
              onChange={(e) => setForm({ ...form, manufactureYear: e.target.value })}
            />
          </Field>
          <Field label={locale === "ar" ? "الفرع" : "Branch"}>
            <Input
              value={form.branch}
              onChange={(e) => setForm({ ...form, branch: e.target.value })}
            />
          </Field>
          <Field label={locale === "ar" ? "المشروع" : "Project"}>
            <Input
              value={form.project}
              onChange={(e) => setForm({ ...form, project: e.target.value })}
            />
          </Field>
          <Field label={locale === "ar" ? "مرجع الشراء" : "Purchase reference"}>
            <Input
              value={form.purchaseReference}
              onChange={(e) => setForm({ ...form, purchaseReference: e.target.value })}
            />
          </Field>
          <Field label={locale === "ar" ? "ملاحظات" : "Notes"}>
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          {selectedModel && (
            <div className="rounded-md border p-3 text-xs text-muted-foreground">
              {selectedModel.manufacturer?.name} / {selectedModel.model_name}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {locale === "ar"
              ? "الكتالوجات الأصلية المرفقة بالمعدة"
              : "Original manuals supplied with equipment"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ManualDraftList drafts={manuals} onChange={setManuals} />

          {saving && (
            <div className="text-sm text-muted-foreground">
              {locale === "ar" ? `جاري الحفظ... ${progress}%` : `Saving... ${progress}%`}
            </div>
          )}
          <Button
            disabled={saving || !form.machineModelId || !form.serialNumber.trim()}
            onClick={save}
          >
            <Plus className="me-2 size-4" />
            {locale === "ar" ? "حفظ المعدة والكتالوجات" : "Save equipment and manuals"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
