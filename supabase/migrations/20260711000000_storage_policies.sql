-- Create buckets if they don't exist (handled by script already, but just in case)
INSERT INTO storage.buckets (id, name, public) VALUES ('os-files', 'os-files', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('os-media', 'os-media', true) ON CONFLICT DO NOTHING;

-- RLS for os-media
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'os-media');
CREATE POLICY "Auth Insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'os-media' AND auth.role() = 'authenticated');
CREATE POLICY "Auth Update" ON storage.objects FOR UPDATE USING (bucket_id = 'os-media' AND auth.role() = 'authenticated');
CREATE POLICY "Auth Delete" ON storage.objects FOR DELETE USING (bucket_id = 'os-media' AND auth.role() = 'authenticated');

-- RLS for os-files
CREATE POLICY "Public Access Files" ON storage.objects FOR SELECT USING (bucket_id = 'os-files');
CREATE POLICY "Auth Insert Files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'os-files' AND auth.role() = 'authenticated');
CREATE POLICY "Auth Update Files" ON storage.objects FOR UPDATE USING (bucket_id = 'os-files' AND auth.role() = 'authenticated');
CREATE POLICY "Auth Delete Files" ON storage.objects FOR DELETE USING (bucket_id = 'os-files' AND auth.role() = 'authenticated');
