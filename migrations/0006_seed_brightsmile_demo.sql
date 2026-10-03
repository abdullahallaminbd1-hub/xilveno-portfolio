INSERT INTO demos (
  name, slug, subdomain, description, status, live_url, worker_identifier, category_id, sort_order
)
VALUES (
  'BrightSmile Dental',
  'brightsmile-dental',
  'dental.xilveno.shop',
  'Standalone Cloudflare dental-care portfolio demo.',
  'active',
  'https://dental.xilveno.shop',
  'xilveno-dentalcare',
  (SELECT id FROM categories WHERE slug = 'healthcare-websites'),
  0
)
ON CONFLICT(slug) DO UPDATE SET
  name = excluded.name,
  subdomain = excluded.subdomain,
  description = excluded.description,
  status = excluded.status,
  live_url = excluded.live_url,
  worker_identifier = excluded.worker_identifier,
  category_id = excluded.category_id,
  sort_order = excluded.sort_order;
