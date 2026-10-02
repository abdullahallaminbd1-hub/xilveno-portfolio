INSERT OR IGNORE INTO projects (
  title, slug, short_description, full_description, category_id, project_type, platform, role, focus,
  status, featured, live_demo_url, challenge, approach, solution, key_features_json, technologies_json,
  sort_order, published
)
SELECT
  'BrightSmile Dental',
  'brightsmile-dental',
  'A polished dental clinic concept focused on calm first impressions, clear services, and accessible appointment requests.',
  'BrightSmile Dental is a fictional healthcare website concept designed to make a first visit feel simple. The experience combines clear treatment pathways, reassuring content, and a focused appointment request flow for patients browsing on desktop or mobile.',
  id,
  'Portfolio Demo',
  'WordPress',
  'Strategy, design & development',
  'Trust, accessibility, appointment conversion',
  'Completed',
  1,
  '',
  'Dental visitors often arrive with a specific concern, limited time, and some anxiety about what happens next. The concept needed to feel reassuring without becoming vague, while helping people quickly understand services and request an appointment from any device.',
  'The interface uses a calm visual system, plain-language service pages, persistent contact cues, mobile-first content hierarchy, and an appointment form with progressive enhancement and clear feedback. Every major path is available from the primary navigation and remains usable with keyboard input.',
  'A healthcare portfolio demo that demonstrates a calm visual system, accessible form flow, and content hierarchy without inventing client claims or results.',
  '["Responsive WordPress theme","Service detail pages with FAQ content","Accessible appointment request form","Mobile navigation drawer with focus management","Reusable SVG artwork and screenshot gallery","SEO-friendly page structure and metadata"]',
  '["WordPress","PHP","HTML & CSS","JavaScript","Responsive SVG artwork"]',
  0,
  1
FROM categories
WHERE slug = 'healthcare-websites';