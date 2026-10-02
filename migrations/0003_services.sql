INSERT OR IGNORE INTO services (
  slug, title, icon, description, overview, audience, includes_json, workflow_json, sort_order, active
) VALUES
  (
    'business-websites',
    'Business Websites',
    'business',
    'Professional websites for local businesses and service providers.',
    'A complete, professional website that explains what your business does and makes it easy for potential customers to get in touch.',
    'Local businesses, service providers, clinics, studios, and small companies that need a credible online presence.',
    '["Site structure and page planning","Custom design based on your brand","Responsive layouts for all devices","Contact form and inquiry flows","Basic on-page SEO setup"]',
    '["Discovery call and content gathering","Sitemap and wireframe","Design and build","Review, revisions, and launch"]',
    1,
    1
  ),
  (
    'landing-pages',
    'Landing Pages',
    'landing',
    'Focused landing pages for products, services, campaigns, and offers.',
    'A single, focused page built around one offer, with clear messaging and one primary call to action.',
    'Products, services, campaigns, event sign-ups, and specific offers that need a dedicated page.',
    '["Focused page structure","Clear headline and benefit messaging","Strong visual hierarchy","Form or booking call to action","Fast, lightweight build"]',
    '["Define the single goal of the page","Draft the content structure","Design and build","Test, publish, and hand over"]',
    2,
    1
  ),
  (
    'shopify-stores',
    'Shopify Stores',
    'ecommerce',
    'Modern eCommerce experiences for online brands and products.',
    'A clean, modern eCommerce experience that presents your products clearly and keeps the buying journey simple.',
    'Online retailers, product brands, and businesses moving from offline sales to a proper online store.',
    '["Store setup and theme customisation","Product and collection page design","Navigation and search improvements","Mobile-first product browsing","Checkout and trust elements"]',
    '["Product and brand review","Theme selection and setup","Customisation and content","Testing and launch"]',
    3,
    1
  ),
  (
    'website-redesign',
    'Website Redesign',
    'redesign',
    'Give your existing website a modern visual and user experience.',
    'A modern rebuild of your current website, keeping the parts that work and fixing the parts that hold the business back.',
    'Businesses with an outdated, slow, hard to navigate, or mobile-unfriendly website.',
    '["Audit of the current site","New visual direction","Improved structure and navigation","Responsive rebuild","Content migration"]',
    '["Review the existing website","Agree on what to keep and change","Design the new direction","Rebuild, test, and launch"]',
    4,
    1
  ),
  (
    'ui-ux-design',
    'UI/UX Design',
    'design',
    'Clean, user-friendly interfaces designed around the visitor experience.',
    'Interface design focused on how visitors actually move through a site: what they see first, what they understand, and what they do next.',
    'Businesses that need a clearer visual system, better page structure, or a more usable interface.',
    '["Wireframes and page structure","Visual direction and design system","Component and layout design","Mobile-first design","Design handover for development"]',
    '["Define goals and user flow","Wireframe key pages","Visual design","Refine and document"]',
    5,
    1
  ),
  (
    'maintenance-support',
    'Maintenance & Support',
    'support',
    'Keep your website updated, secure, and running smoothly.',
    'Ongoing help to keep your website secure, updated, and working properly after it goes live.',
    'Business owners who would rather focus on their work than manage a website.',
    '["WordPress and plugin updates","Backups and basic security checks","Bug fixes and content updates","Uptime and performance monitoring","Priority support contact"]',
    '["Initial site review","Agree on a maintenance plan","Scheduled updates and monitoring","Ongoing reporting and support"]',
    6,
    1
  );