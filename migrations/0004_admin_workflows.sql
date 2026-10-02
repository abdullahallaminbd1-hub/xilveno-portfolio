ALTER TABLE projects ADD COLUMN case_study_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL;

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('logo_media_id', ''),
  ('favicon_media_id', ''),
  ('about_image_media_id', ''),
  ('cta_image_media_id', ''),
  ('hero_image_media_id', ''),
  ('featured_case_study_id', '');