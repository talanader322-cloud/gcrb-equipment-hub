import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileUp, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

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
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { catalogRepository } from "@/services/repositories/catalogRepository";

const MANUAL_TYPES = [
  "parts_catalog",
  "operation_manual",
  "service_manual",
  "workshop_manual",
  "maintenance_manual",
  "engine_manual",
  "transmission_manual",
  "electrical_diagram",
  "hydraulic_diagram",
  "specification_manual",
  "other",
] as const;

type ManualType = (typeof MANUAL_TYPES)[number];

type PendingManual = {
  id: string;
  file: File;
  type: ManualType;
  title: string;
};

type AssetRow = { id: string };

export const Route = createFileRoute("/_authenticated/equipment/new")({
  head: () => ({
    meta: [
      { title: "إضافة معدة جديدة وكتالوجاتها | GCRB Equipment Catalog" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewEquipmentPage,
});

function inferManualType(name: string): ManualType {
  const value = name.toLowerCase();
  if (value.includes("part")) return "parts_catalog";
  if (value.includes("operation") || value.includes("operator")) return "operation_manual";
  if (value.includes("workshop")) return "workshop_manual";
  if (value.includes("service")) return "service_manual";
  if (value.includes("maint")) return "maintenance_manual";
  if (value.includes("engine")) return "engine_manual";
  if (value.includes("transmission")) return "transmission_manual";
  if (value.includes("electric") || value.includes("wiring")) return "electrical_diagram";
  if (value.includes("hydraulic")) return "hydraulic_diagram";
  if (value.includes("spec")) return "specification_manual";
  return "other";
}

async function sha256(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function NewEquipmentPage() {
  const { locale } = useI18n();
  const { user } = useSession();
  const access = useAccess(user?.id);
  const canManage = Boolean(access.data?.canManageCatalog || access.data?.isAdmin);
  const navigate = Route.useNavigate();

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
  const [manuals, setManuals] = useState<PendingManual[]>([]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);

  const selectedModel = useMemo(
    () => models.data?.rows.find((model) => model.id === form.machineModelId),
    [models.data?.rows, form.machineModelId],
  );

  if (!canManage && !access.isLoading) {
    return <p className="text-sm text-muted-foreground">{locale === "ar" ? "لا تملك صلاحية إضافة معدات." : "You do not have permission to add equipment."}</p>;
  }

  async function save() {
    if (!user?.id || !form.machineModelId || !form.serialNumber.trim()) return;
    if (manuals.some((manual) => manual.file.type && manual.file.type !== "application/pdf")) {
      toast.error(locale === "ar" ? "الإصدار الحالي يقبل ملفات PDF فقط." : "This version accepts PDF files only.");
      return;
    }

    setSaving(true);
    setProgress(0);
    try {
      const { data: assetData, error: assetError } = await supabase
        .from("machine_assets" as never)
        .insert({
          machine_model_id: form.machineModelId,
          serial_number: form.serialNumber.trim(),
          asset_number: form.assetNumber.trim() || null,
          manufacture_year: form.manufactureYear ? Number(form.manufactureYear) : null,
          branch: form.branch.trim() || null,
          project: form.project.trim() || null,
          purchase_reference: form.purchaseReference.trim() || null,
          notes: form.notes.trim() || null,
          created_by: user.id,
        } as never)
        .select("id")
        .single();
      if (assetError) throw new Error(assetError.message);
      const asset = assetData as unknown as AssetRow;

      for (let index = 0; index < manuals.length; index += 1) {
        const manual = manuals[index];
        const checksum = await sha256(manual.file);
        const safeName = manual.file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
        const storagePath = `assets/${asset.id}/${crypto.randomUUID()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("catalogs")
          .upload(storagePath, manual.file, {
            contentType: "application/pdf",
            upsert: false,
          });
        if (uploadError) throw new Error(uploadError.message);

        const { error: manualError } = await supabase.from("asset_manuals" as never).insert({
          machine_asset_id: asset.id,
          manual_type: manual.type,
          title: manual.title.trim() || manual.file.name,
          original_filename: manual.file.name,
          storage_path: storagePath,
          file_size: manual.file.size,
          checksum,
          language: "en",
          source_type: "original_equipment_manual",
          uploaded_by: user.id,
        } as never);
        if (manualError) {
          await supabase.storage.from("catalogs").remove([storagePath]);
          throw new Error(manualError.message);
        }
        setProgress(Math.round(((index + 1) / Math.max(manuals.length, 1)) * 100));
      }

      toast.success(locale === "ar" ? "تمت إضافة المعدة وحفظ كتالوجاتها." : "Equipment and manuals saved.");
      navigate({ to: "/equipment" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {locale === "ar" ? "إضافة معدة جديدة مع كتالوجاتها" : "New Equipment & Manuals"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {locale === "ar"
              ? "سجل المعدة الفعلية المملوكة للمؤسسة وارفع جميع ملفات PDF الأصلية التي جاءت معها."
              : "Register a corporation-owned machine and upload the original PDF manual package supplied with it."}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/equipment">{locale === "ar" ? "رجوع" : "Back"}</Link>
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{locale === "ar" ? "بيانات المعدة" : "Equipment details"}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Field label={locale === "ar" ? "الموديل" : "Model"}>
            <Select value={form.machineModelId} onValueChange={(value) => setForm({ ...form, machineModelId: value })}>
              <SelectTrigger><SelectValue placeholder={locale === "ar" ? "اختر الموديل" : "Select model"} /></SelectTrigger>
              <SelectContent>
                {models.data?.rows.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.manufacturer?.name} — {model.model_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Serial Number"><Input dir="ltr" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} required /></Field>
          <Field label={locale === "ar" ? "رقم الأصل / الرقم المؤسسي" : "Asset number"}><Input dir="ltr" value={form.assetNumber} onChange={(e) => setForm({ ...form, assetNumber: e.target.value })} /></Field>
          <Field label={locale === "ar" ? "سنة الصنع" : "Manufacture year"}><Input dir="ltr" type="number" value={form.manufactureYear} onChange={(e) => setForm({ ...form, manufactureYear: e.target.value })} /></Field>
          <Field label={locale === "ar" ? "الفرع" : "Branch"}><Input value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} /></Field>
          <Field label={locale === "ar" ? "المشروع" : "Project"}><Input value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} /></Field>
          <Field label={locale === "ar" ? "مرجع الشراء" : "Purchase reference"}><Input value={form.purchaseReference} onChange={(e) => setForm({ ...form, purchaseReference: e.target.value })} /></Field>
          <Field label={locale === "ar" ? "ملاحظات" : "Notes"}><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          {selectedModel && <div className="rounded-md border p-3 text-xs text-muted-foreground">{selectedModel.manufacturer?.name} / {selectedModel.model_name}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{locale === "ar" ? "الكتالوجات الأصلية المرفقة بالمعدة" : "Original manuals supplied with equipment"}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-sm hover:bg-muted/40">
            <FileUp className="size-5" />
            {locale === "ar" ? "اختر عدة ملفات PDF دفعة واحدة" : "Select multiple PDF files"}
            <input
              className="hidden"
              type="file"
              accept="application/pdf,.pdf"
              multiple
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                setManuals((current) => [
                  ...current,
                  ...files.map((file) => ({
                    id: crypto.randomUUID(),
                    file,
                    type: inferManualType(file.name),
                    title: file.name.replace(/\.pdf$/i, ""),
                  })),
                ]);
                event.currentTarget.value = "";
              }}
            />
          </label>

          {manuals.map((manual) => (
            <div key={manual.id} className="grid items-center gap-2 rounded-md border p-3 md:grid-cols-[1fr_220px_auto]">
              <div>
                <Input value={manual.title} onChange={(e) => setManuals((items) => items.map((item) => item.id === manual.id ? { ...item, title: e.target.value } : item))} />
                <p className="mt-1 text-xs text-muted-foreground" dir="ltr">{manual.file.name} — {(manual.file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <Select value={manual.type} onValueChange={(value) => setManuals((items) => items.map((item) => item.id === manual.id ? { ...item, type: value as ManualType } : item))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MANUAL_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="ghost" size="icon" onClick={() => setManuals((items) => items.filter((item) => item.id !== manual.id))}><X className="size-4" /></Button>
            </div>
          ))}

          {saving && <div className="text-sm text-muted-foreground">{locale === "ar" ? `جاري الحفظ... ${progress}%` : `Saving... ${progress}%`}</div>}
          <Button disabled={saving || !form.machineModelId || !form.serialNumber.trim()} onClick={save}>
            <Plus className="me-2 size-4" />
            {locale === "ar" ? "حفظ المعدة والكتالوجات" : "Save equipment and manuals"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
