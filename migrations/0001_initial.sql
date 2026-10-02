PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pages (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  seo_title TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS home_sections (
  section_key TEXT PRIMARY KEY,
  content_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'code',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'sparkle',
  description TEXT NOT NULL DEFAULT '',
  overview TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  includes_json TEXT NOT NULL DEFAULT '[]',
  workflow_json TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS problems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS process_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS faqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  short_description TEXT NOT NULL DEFAULT '',
  full_description TEXT NOT NULL DEFAULT '',
  category_id INTEGER,
  project_type TEXT NOT NULL DEFAULT 'Concept Project',
  platform TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  focus TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Concept',
  featured INTEGER NOT NULL DEFAULT 0,
  featured_image_id INTEGER,
  live_demo_url TEXT NOT NULL DEFAULT '',
  case_study_url TEXT NOT NULL DEFAULT '',
  challenge TEXT NOT NULL DEFAULT '',
  approach TEXT NOT NULL DEFAULT '',
  solution TEXT NOT NULL DEFAULT '',
  key_features_json TEXT NOT NULL DEFAULT '[]',
  technologies_json TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS project_gallery (
  project_id INTEGER NOT NULL,
  media_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, media_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  alt_text TEXT NOT NULL DEFAULT '',
  etag TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS navigation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  location TEXT NOT NULL DEFAULT 'primary'
);

CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  project_type TEXT NOT NULL DEFAULT '',
  budget TEXT NOT NULL DEFAULT '',
  timeline TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  ip_hash TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'unread',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  admin_id INTEGER NOT NULL,
  csrf_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_hash TEXT NOT NULL,
  attempted_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS demos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  subdomain TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  live_url TEXT NOT NULL DEFAULT '',
  screenshot_media_id INTEGER,
  category_id INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (screenshot_media_id) REFERENCES media(id) ON DELETE SET NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_published_order ON projects(published, sort_order);
CREATE INDEX IF NOT EXISTS idx_projects_featured ON projects(featured, published, sort_order);
CREATE INDEX IF NOT EXISTS idx_inquiries_status_created ON inquiries(status, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_key_time ON login_attempts(key_hash, attempted_at);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('site_name', 'Abdullah'),
  ('tagline', 'Web Designer & Developer'),
  ('email', ''),
  ('phone', ''),
  ('whatsapp', ''),
  ('location', ''),
  ('seo_title', 'Abdullah - Web Designer & Developer'),
  ('seo_home_description', 'I design and build modern, responsive websites for small businesses, startups, and eCommerce brands.'),
  ('default_og_image', '/assets/images/og-default.png'),
  ('canonical_base', 'https://xilveno.shop'),
  ('robots_mode', 'index,follow'),
  ('privacy_url', ''),
  ('terms_url', ''),
  ('social_links', '{}');

INSERT OR IGNORE INTO pages (slug, title, excerpt, seo_title, seo_description) VALUES
  ('about', 'About', 'Freelance web designer and developer building modern, responsive websites for small businesses.', 'About - Abdullah', 'Learn about Abdullah, a freelance web designer and developer.'),
  ('services', 'Services', 'Website design, landing pages, Shopify stores, redesigns, and ongoing support - explained in plain language.', 'Services - Abdullah', 'Website design, landing pages, Shopify stores, redesigns, and support.'),
  ('process', 'Process', 'A simple, transparent process from first conversation through design, build, launch, and handover.', 'Process - Abdullah', 'A simple and transparent website design and development process.'),
  ('faq', 'FAQ', 'Straight answers to the questions I am asked most often about timelines, redesigns, mobile, and support.', 'FAQ - Abdullah', 'Answers to common website design and development questions.'),
  ('contact', 'Contact', 'Tell me about your project - what you need, your timeline, and any examples you like. You will get a personal reply.', 'Contact - Abdullah', 'Tell me about your website project and get a personal reply.');

INSERT OR IGNORE INTO home_sections (section_key, content_json) VALUES
  ('hero', '{"eyebrow":"Web Designer & Developer","title":"Modern Websites\\nThat Help\\nBusinesses Grow","subtitle":"I design and build modern, responsive websites for small businesses, startups, and eCommerce brands.","cta_text":"View My Work","cta_url":"/work/","cta2_text":"Start a Project","cta2_url":"/contact/","panel_title":"What you get","panel_points":["A design built around your customers and your goals.","Mobile-first layouts that hold up on every screen size.","A site you can update yourself, with clear handover.","Direct communication - you work with me, not an account manager."],"tech_strip":["WordPress","Shopify","Elementor","Figma","Responsive Design","SEO Basics"]}'),
  ('services_heading', '{"eyebrow":"What I do","title":"Services built for growing businesses","text":"From a first website to a full rebuild, every project is designed, built, and handed over by the same person."}'),
  ('problems_heading', '{"eyebrow":"Why it matters","title":"Your website is often the first impression","text":"A few common problems are easy to fix and make a noticeable difference to how visitors use your site."}'),
  ('work_heading', '{"eyebrow":"Selected work","title":"Recent projects","text":"A selection of website projects. Anything built as a concept is clearly labelled."}'),
  ('process_heading', '{"eyebrow":"How we will work together","title":"A simple, transparent process","text":"You always know what stage the project is at and what happens next."}'),
  ('skills_heading', '{"eyebrow":"Tools I use","title":"The stack behind the work","text":"Chosen for reliability and easy handover - not because a tool is fashionable."}'),
  ('faq_heading', '{"eyebrow":"Questions","title":"Things people usually ask"}'),
  ('cta', '{"eyebrow":"Ready when you are","title":"Tell me about your project","text":"Share what you need, your timeline, and any examples you like. You will get a considered reply with next steps - no hard sell.","cta_text":"Start a Project","cta_url":"/contact/","cta2_text":"See My Work","cta2_url":"/work/"}'),
  ('about', '{"intro_title":"I design and build websites that do a job","intro_text":["I am a freelance web designer and developer working with small businesses, startups, and online stores. I take a website from first conversation through structure, design, build, and launch.","I work directly with the person responsible for the project. That means fewer handovers, faster answers, and a site that stays close to what was originally agreed.","Most projects are built in WordPress or Shopify, depending on what you need to manage after launch. If you are unsure which is right, I will explain the trade-offs before anything starts."],"values_title":"How I work","values":[{"title":"Plain language","text":"No jargon in updates or proposals. You will always know what is being done and why."},{"title":"Scope in writing","text":"What is included, what is not, and what it costs is agreed before work begins."},{"title":"Built to be handed over","text":"You should be able to update your own content. Anything that needs a developer is clearly flagged."},{"title":"Honest about fit","text":"If a project is not a good match for what I do, I will say so rather than take it on."}],"profile":{"focus":"WordPress, Shopify, and small-business websites","working":"Remote, with clients across the USA, UK, Canada, and Australia"}}');

INSERT OR IGNORE INTO skills (title, description, icon, sort_order) VALUES
  ('WordPress', 'Custom themes, block editing, and content management.', 'wordpress', 1),
  ('Shopify', 'Store setup, theme customisation, and product presentation.', 'shopify', 2),
  ('Elementor', 'Page building for fast, reliable layout control.', 'elementor', 3),
  ('HTML & CSS', 'Clean, semantic, well-structured front-end code.', 'markup', 4),
  ('JavaScript', 'Lightweight interaction without heavy libraries.', 'script', 5),
  ('Figma', 'Layout thinking, wireframes, and visual direction.', 'figma', 6),
  ('Responsive Design', 'Mobile-first layouts tested from 320px upward.', 'responsive', 7),
  ('SEO Basics', 'Semantic structure, metadata, and page speed fundamentals.', 'seo', 8);

INSERT OR IGNORE INTO problems (title, description, sort_order) VALUES
  ('Looks outdated?', 'Visitors may lose confidence.', 1),
  ('Hard to navigate?', 'People may leave before finding what they need.', 2),
  ('Poor on mobile?', 'You may lose mobile visitors.', 3),
  ('No clear CTA?', 'Visitors may not know what to do next.', 4);

INSERT OR IGNORE INTO process_steps (title, description, sort_order) VALUES
  ('Discovery & planning', 'We talk through your business, your customers, and what the website needs to achieve. I gather your content and confirm scope, timeline, and cost.', 1),
  ('Structure & design', 'I map the pages, write the content structure, and design the key screens so you can see the direction before anything is built.', 2),
  ('Build & test', 'The site is built responsive from the start and checked across common screen sizes, browsers, and devices.', 3),
  ('Review & revise', 'You review the working site and send comments. Revisions are handled in clear rounds rather than open-ended changes.', 4),
  ('Launch', 'Final checks, then the site goes live. Redirects, forms, and analytics are verified on the live domain.', 5),
  ('Handover & support', 'You get a walkthrough of how to update the site, plus optional maintenance if you want ongoing help.', 6);

INSERT OR IGNORE INTO faqs (question, answer, sort_order) VALUES
  ('How long does a website take?', 'It depends on the scope of the project. A focused landing page is quicker than a full business website with many pages and custom features. Once I understand your requirements, I can give you a realistic timeline before any work begins.', 1),
  ('Do you work with existing websites?', 'Yes. I can work on an existing WordPress site, improve specific pages, fix layout issues, or restructure content. If a rebuild makes more sense than a repair, I will explain why before starting.', 2),
  ('Can you redesign my current website?', 'Yes, redesign is one of my core services. I look at what is not working, keep what is still useful, and rebuild the visual design and user experience so the site reflects the current standard of your business.', 3),
  ('Will the website work on mobile devices?', 'Every site I build is responsive by default. Layouts are designed mobile-first and tested across common screen sizes so the site remains readable and easy to use on phones, tablets, and desktops.', 4),
  ('Can you help after the website is live?', 'Yes. I offer ongoing maintenance and support covering updates, backups, fixes, and content changes. Alternatively, the site is built so you can manage most content yourself without touching code.', 5),
  ('Do you build Shopify stores?', 'Yes. I build Shopify stores for brands selling physical products, from theme customisation and product page setup through to a clean, mobile-friendly checkout experience.', 6);

INSERT OR IGNORE INTO categories (name, slug, description, sort_order) VALUES
  ('Business Websites', 'business-websites', '', 1),
  ('eCommerce', 'ecommerce', '', 2),
  ('Landing Pages', 'landing-pages', '', 3),
  ('Healthcare Websites', 'healthcare-websites', '', 4);

INSERT OR IGNORE INTO projects (title, slug, short_description, full_description, category_id, project_type, platform, role, focus, status, featured, live_demo_url, challenge, approach, solution, key_features_json, technologies_json, sort_order, published)
  SELECT 'Harbour & Pine Kitchen', 'harbour-pine-kitchen', 'Concept site for an independent restaurant: menus, opening hours, and reservations without the clutter.', 'A concept website for an independent restaurant, structured around menus, opening hours, local discovery, and a clear reservation path.', id, 'Concept Project', 'WordPress', 'Design & build', 'Reservations, menus, local search', 'Concept', 1, '', 'Independent restaurants often rely on third-party listings that dilute their brand and take a cut of every booking. The design problem: present a warm, appetite-led identity, keep menus easy to update, and make the reservation path obvious on a phone held in one hand.', 'A mobile-first layout with the reservation call to action pinned near the top, menus structured as editable content types, and clear opening-hours and location blocks.', 'A focused restaurant experience with a warm visual direction and content hierarchy that keeps practical information easy to find.', '["Home, menu, about, and contact pages","Editable menu sections and daily specials","Reservation call to action on every page","Location and opening-hours structured data","Mobile-first layout tested from 320px"]', '["WordPress","HTML & CSS","JavaScript","Responsive design"]', 1, 1 FROM categories WHERE slug = 'business-websites';

INSERT OR IGNORE INTO projects (title, slug, short_description, full_description, category_id, project_type, platform, role, focus, status, featured, live_demo_url, challenge, approach, solution, key_features_json, technologies_json, sort_order, published)
  SELECT 'Northfield Dental', 'northfield-dental', 'Concept site for a family dental practice: treatments, pricing transparency, and online appointment requests.', 'A calm healthcare website concept focused on plain-language treatment information and accessible appointment requests.', id, 'Concept Project', 'WordPress', 'Design & build', 'Trust, accessibility, appointments', 'Concept', 1, '', 'Healthcare visitors arrive anxious and in a hurry. They need to find the right treatment, understand what happens at a first visit, and request an appointment without phoning during business hours.', 'A calm, high-contrast design with treatment information written for patients rather than clinicians, an accessible appointment request form, and a short what-to-expect section.', 'A reassuring practice website structure that makes the next step clear without inventing outcomes or client claims.', '["Treatment pages written in plain language","Accessible appointment request form","Team and practice information pages","WCAG-minded contrast and focus states","Emergency contact details above the fold"]', '["WordPress","PHP","HTML & CSS","JavaScript","Responsive SVG artwork"]', 2, 1 FROM categories WHERE slug = 'business-websites';

INSERT OR IGNORE INTO projects (title, slug, short_description, category_id, project_type, platform, role, focus, status, featured, challenge, approach, solution, key_features_json, technologies_json, sort_order, published)
  SELECT 'Loop Studio Fitness', 'loop-studio-fitness', 'Concept site for a boutique fitness studio: class timetable, membership tiers, and trial session sign-ups.', id, 'Concept Project', 'WordPress + Elementor', 'Design & build', 'Timetable, memberships, trials', 'Concept', 0, 'Boutique studios live and die by their timetable. The design problem is making a weekly class schedule readable on a phone, explaining three membership tiers without confusion, and giving new visitors one obvious first step.', 'A scannable timetable organised by day, membership tiers presented as plain comparison cards, and a single repeated call to action for booking a first trial class.', 'A focused studio site concept that prioritises timetable scanning and a straightforward trial journey.', '["Weekly timetable organised by day","Membership tier comparison cards","Trial class call to action throughout","Instructor profiles","Mobile-first navigation"]', '["WordPress","Elementor","HTML & CSS","JavaScript"]', 3, 1 FROM categories WHERE slug = 'business-websites';

INSERT OR IGNORE INTO projects (title, slug, short_description, category_id, project_type, platform, role, focus, status, featured, challenge, approach, solution, key_features_json, technologies_json, sort_order, published)
  SELECT 'Copper Lane Coffee', 'copper-lane-coffee', 'Concept Shopify store for a small-batch roaster: subscriptions, brew guides, and a clean product story.', id, 'Concept Project', 'Shopify', 'Theme customisation & setup', 'Subscriptions, product pages, mobile checkout', 'Concept', 0, 'Coffee buyers compare roast profiles, grind options, and subscription terms before committing. The store needs to explain differences clearly and keep the path from product page to checkout short on mobile.', 'Structured product pages with roast and origin details up front, a subscription option alongside one-off purchases, and a streamlined mobile checkout.', 'A clean eCommerce concept that explains product differences without adding friction to the buying journey.', '["Product templates with roast details","Subscription and one-off purchase options","Collection pages by roast style","Brew guide content section","Mobile-optimised checkout flow"]', '["Shopify","Liquid","HTML & CSS","JavaScript"]', 4, 1 FROM categories WHERE slug = 'ecommerce';

INSERT OR IGNORE INTO projects (title, slug, short_description, category_id, project_type, platform, role, focus, status, featured, challenge, approach, solution, key_features_json, technologies_json, sort_order, published)
  SELECT 'Brightpath Tutoring', 'brightpath-tutoring', 'Concept landing page for a tutoring service: one offer, one form, and no distractions.', id, 'Concept Project', 'WordPress', 'Design & build', 'Single-goal landing page', 'Concept', 0, 'Paid traffic lands on a page that must do one thing: turn a parent''s curiosity into a free consultation request. Every extra link or section is a chance to lose them.', 'A single focused page built around one offer - a free consultation - with the form directly in the first screen, supporting reassurance below it, and no competing navigation away from the goal.', 'A single-goal landing page concept with clear hierarchy and a focused consultation request path.', '["Single-goal page structure","Consultation request form above the fold","Subject and level overview","Parent FAQ section","Fast, lightweight build"]', '["WordPress","HTML & CSS","JavaScript"]', 5, 1 FROM categories WHERE slug = 'landing-pages';

INSERT OR IGNORE INTO navigation (label, url, sort_order, visible, location) VALUES
  ('Home', '/', 1, 1, 'primary'),
  ('About', '/about/', 2, 1, 'primary'),
  ('Services', '/services/', 3, 1, 'primary'),
  ('Work', '/work/', 4, 1, 'primary'),
  ('Process', '/process/', 5, 1, 'primary'),
  ('FAQ', '/faq/', 6, 1, 'primary');