# خطة: تطبيق ترحيل Phase 5 (كاتلوجات كوماتسو) على قاعدة البيانات

## نتيجة الفحص قبل التنفيذ (مؤكدة باستعلامات حقيقية)
- جدول `catalogs` لا يحتوي بعد على الأعمدة `external_document_ref` و`external_source_label` و`analysis_status` و`indexed_page_count`، وجدول `catalog_pages` غير موجود، ودوال `upsert_schematic_catalog` و`set_catalog_schemes` و`upsert_catalog_pages` غير موجودة.
- ملف Phase 5 (`supabase/migrations/20260828140000_phase5_komatsu_books.sql`) **يعتمد على تلك الكائنات**: دالة `upsert_schematic_catalog` تُدخل وتُحدّث `external_document_ref` و`external_source_label` و`analysis_status`، و`set_catalog_schemes` تُحدّث `indexed_page_count`. تطبيق Phase 5 وحده سيفشل بأخطاء «عمود غير موجود» عند الأسطر 131-144 و148-155 و251-256.
- الملف الذي ينشئ تلك المتطلبات موجود في المستودع وهو **Phase 4** (`20260828120000_phase4_discovery_pdf_intelligence.sql`) ولم يُطبَّق بعد (جدول ترحيلات `supabase_migrations` لا يحتوي أي إصدار بتاريخ 2026-08-28).
- ترتيب أرقام الإصدارات صحيح: 20260828120000 (Phase 4) يسبق 20260828140000 (Phase 5)، فتطبيقهما بالتسلسل يطابق سجل الترحيلات ولن يُسجَّل أي منهما مرتين.

## التنفيذ
1. **تطبيق Phase 4 أولًا حرفيًا كما هو في الملف** (بلا تعديل): ينشئ أعمدة catalogs الخمسة وجداول `machine_query_log` و`catalog_pages` و`part_alternates` و`discovered_documents` ودوال `create_catalog_from_discovery` و`upsert_catalog_pages` و`search_catalog_pages` و`suggest_part_alternates` — كلها مع GRANT وRLS وسياسات.
2. **تطبيق Phase 5 حرفيًا كما هو في الملف** (بلا تعديل ولا إعادة ترتيب).

## التحقق بعد التطبيق (استعلامات حقيقية)
- عمود `catalogs.external_source_url` (نصّي، قابل للفراغ) موجود.
- `catalog_schemes`: FK إلى catalogs، فهرس فريد على `(catalog_id, page_number)`.
- `catalog_scheme_parts`: FK إلى catalog_schemes، فهرس جزئي فريد على `(scheme_id, item_ref)`، وفهارس على `short_number` و`number`.
- RLS مفعّل على الجدولين؛ سياسة القراءة لكل مستخدم مُوثَّق؛ سياسة الكتابة عبر `can_manage_catalog`؛ وservice_role لديه صلاحية كاملة عبر GRANT ALL.
- الدالتان `upsert_schematic_catalog(jsonb)` و`set_catalog_schemes(uuid, jsonb)` موجودتان بـ SECURITY DEFINER و`search_path = public`، مع بوابة `can_manage_catalog`، وGRANT EXECUTE لكل من authenticated وservice_role.
- Sanity: `SELECT * FROM catalog_schemes LIMIT 1` و`SELECT count(*) FROM catalog_scheme_parts` تعملان بلا أخطاء (النتيجة الفارغة مقبولة).

## القيود الملتزم بها
- لا مساس بأي جدول أو سياسة أو دالة أخرى خارج ملفي الترحيل.
- لا تعديل على محتوى ملفّي الترحيل.
- لا إعادة توليد لملف `types.ts` ضمن هذه الخطوة (سنتعامل مع تعريفات TypeScript الجديدة كخطوة منفصلة عند ربط الواجهة).

## التقرير بعد التنفيذ
- لكل عنصر (عمود/جدول/فهرس/سياسة/دالة/منحة): نجاح أو فشل مع رسالة الخطأ ورقم السطر في ملف الترحيل إن وُجد خطأ.
