-- ============================================================
-- Resolution Nation — Phase 3 Storage Setup
-- Run this in the Supabase SQL Editor after running 001_initial.sql
-- ============================================================

-- Storage bucket for report cards
INSERT INTO storage.buckets (id, name, public)
VALUES ('report-cards', 'report-cards', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "report_cards_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'report-cards' AND auth.role() = 'authenticated');

-- Allow users to read their own uploads (first folder = uploader's user ID)
CREATE POLICY "report_cards_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'report-cards' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to delete their own uploads
CREATE POLICY "report_cards_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'report-cards' AND auth.uid()::text = (storage.foldername(name))[1]);
