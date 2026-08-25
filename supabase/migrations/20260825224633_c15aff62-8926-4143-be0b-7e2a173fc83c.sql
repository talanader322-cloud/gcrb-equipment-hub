CREATE POLICY "gcrb read files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('catalogs','diagrams','thumbnails','manufacturer-logos','machine-images'));
CREATE POLICY "gcrb managers upload files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('catalogs','diagrams','thumbnails','manufacturer-logos','machine-images')
    AND public.can_manage_catalog(auth.uid()));
CREATE POLICY "gcrb managers update files" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('catalogs','diagrams','thumbnails','manufacturer-logos','machine-images')
    AND public.can_manage_catalog(auth.uid()));
CREATE POLICY "gcrb managers delete files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('catalogs','diagrams','thumbnails','manufacturer-logos','machine-images')
    AND public.can_manage_catalog(auth.uid()));