import type { Env, JsonRecord, Session } from '../types';
import { HttpError, requireCsrf, requireSession } from './security';

const SLOT_DEFINITIONS = [
  ['home_hero', 'Homepage hero', 'Home', '1200 × 1200 px · 1:1'],
  ['home_about', 'Homepage About', 'Home', '1200 × 900 px · 4:3'],
  ['about_main', 'About page', 'About', '1200 × 900 px · 4:3'],
  ['about_reception', 'Reception', 'About', '1200 × 900 px · 4:3'],
  ['about_treatment', 'Treatment room', 'About', '1200 × 900 px · 4:3'],
  ['about_waiting', 'Waiting area', 'About', '1200 × 900 px · 4:3'],
  ['contact_map', 'Contact/location', 'Contact', '1200 × 800 px · 3:2'],
  ['service_general-dentistry', 'General Dentistry', 'Services', '1200 × 750 px · 16:10'],
  ['service_cosmetic-dentistry', 'Cosmetic Dentistry', 'Services', '1200 × 750 px · 16:10'],
  ['service_teeth-whitening', 'Teeth Whitening', 'Services', '1200 × 750 px · 16:10'],
  ['service_dental-implants', 'Dental Implants', 'Services', '1200 × 750 px · 16:10'],
  ['service_emergency-dentistry', 'Emergency Dentistry', 'Services', '1200 × 750 px · 16:10'],
  ['service_preventive-care', 'Preventive Care', 'Services', '1200 × 750 px · 16:10'],
  ['team_elena-marsh', 'Dr Elena Marsh', 'Team', '900 × 1125 px · 4:5'],
  ['team_marcus-hale', 'Dr Marcus Hale', 'Team', '900 × 1125 px · 4:5'],
  ['team_priya-nair', 'Dr Priya Nair', 'Team', '900 × 1125 px · 4:5'],
  ['team_tomas-berg', 'Dr Tomas Berg', 'Team', '900 × 1125 px · 4:5'],
] as const;

const EDITOR_SECTIONS = [
  {
    id: 'home',
    label: 'Home',
    fields: [
      ['settings.heroTitle', 'Hero heading', 'text', 'The main heading at the top of the homepage.'],
      ['settings.heroText', 'Hero paragraph', 'textarea', 'The supporting paragraph below the hero heading.'],
      ['settings.homeHeroEyebrow', 'Hero eyebrow', 'text', 'Small label above the hero heading.'],
      ['settings.homeHeroPrimaryLabel', 'Primary button label', 'text', 'Shown on the main hero button.'],
      ['settings.homeHeroSecondaryLabel', 'Secondary button label', 'text', 'Shown on the second hero button.'],
      ['settings.homeHeroHighlights', 'Hero highlights', 'list', 'One item per line.'],
      ['settings.homeServicesEyebrow', 'Services eyebrow', 'text', 'Small label above the homepage Services heading.'],
      ['settings.homeServicesTitle', 'Services heading', 'text', 'Homepage Services heading.'],
      ['settings.homeServicesText', 'Services introduction', 'textarea', 'The paragraph above the homepage service cards.'],
      ['settings.homeServicesButton', 'Services button', 'text', 'Label on the link below the service cards.'],
      ['settings.homeWhyEyebrow', 'Why it matters eyebrow', 'text', 'Small label above the reasons cards.'],
      ['settings.homeWhyTitle', 'Why it matters heading', 'text', 'Heading above the reasons cards.'],
      ['settings.homeWhyText', 'Why it matters introduction', 'textarea', 'Optional paragraph below the heading.'],
      ...[1, 2, 3, 4].flatMap((number) => [
        [`settings.homeReason${number}Title`, `Reason ${number} heading`, 'text', 'Shown on the homepage reasons card.'],
        [`settings.homeReason${number}Text`, `Reason ${number} description`, 'textarea', 'Shown on the homepage reasons card.'],
      ]),
      ['settings.homeAboutEyebrow', 'About eyebrow', 'text', 'Small label above the homepage About heading.'],
      ['settings.homeAboutTitle', 'About heading', 'text', 'Homepage About heading.'],
      ['settings.homeAboutText', 'About paragraph', 'textarea', 'The paragraph beside the homepage About image.'],
      ['settings.homeAboutHighlights', 'About highlights', 'list', 'One highlight per line.'],
      ['settings.homeAboutButton', 'About button', 'text', 'Label on the link to the About page.'],
      ['settings.homeTeamEyebrow', 'Team eyebrow', 'text', 'Small label above the homepage team heading.'],
      ['settings.homeTeamTitle', 'Team heading', 'text', 'Homepage team heading.'],
      ['settings.homeTeamText', 'Team introduction', 'textarea', 'The paragraph above the team cards.'],
      ['settings.homeProcessEyebrow', 'Process eyebrow', 'text', 'Small label above the homepage process steps.'],
      ['settings.homeProcessTitle', 'Process heading', 'text', 'Homepage process heading.'],
      ['settings.homeProcessText', 'Process introduction', 'textarea', 'Optional paragraph under the process heading.'],
      ...[1, 2, 3, 4, 5, 6].flatMap((number) => [
        [`settings.homeStep${number}Title`, `Step ${number} heading`, 'text', 'Shown in this homepage process step.'],
        [`settings.homeStep${number}Text`, `Step ${number} description`, 'textarea', 'Shown in this homepage process step.'],
      ]),
      ['settings.homeReviewsEyebrow', 'Patient feedback eyebrow', 'text', 'Small label above the feedback cards.'],
      ['settings.homeReviewsTitle', 'Patient feedback heading', 'text', 'Heading above the sample feedback cards.'],
      ['settings.homeReviewsText', 'Patient feedback introduction', 'textarea', 'Optional paragraph under the heading.'],
      ...[1, 2, 3].flatMap((number) => [
        [`settings.homeReview${number}Text`, `Sample feedback ${number}`, 'textarea', 'These are explicitly labelled illustrative examples, not real patient reviews.'],
        [`settings.homeReview${number}Name`, `Sample feedback ${number} attribution`, 'text', 'Shown under the illustrative feedback.'],
      ]),
      ['settings.homeFaqEyebrow', 'FAQ eyebrow', 'text', 'Small label above the homepage FAQ.'],
      ['settings.homeFaqTitle', 'FAQ heading', 'text', 'Heading above the homepage FAQ.'],
      ['settings.homeFaqText', 'FAQ introduction', 'textarea', 'Optional paragraph under the FAQ heading.'],
      ['settings.ctaTitle', 'Final CTA heading', 'text', 'Heading in the final call-to-action section.'],
      ['settings.ctaText', 'Final CTA paragraph', 'textarea', 'Supporting copy in the final call-to-action section.'],
      ['settings.ctaBookLabel', 'Final CTA primary button', 'text', 'Label on the appointment button.'],
      ['settings.ctaPhoneLabel', 'Final CTA phone button', 'text', 'Label on the phone button.'],
      ...[1, 2, 3, 4].flatMap((number) => [
        [`faqs.${number}.question`, `Question ${number}`, 'text', 'Shown in the homepage FAQ accordion.'],
        [`faqs.${number}.answer`, `Answer ${number}`, 'textarea', 'Shown when this FAQ question is opened.'],
      ]),
    ],
    imageSlots: ['home_hero', 'home_about'],
  },
  {
    id: 'about',
    label: 'About',
    fields: [
      ['settings.aboutTitle', 'Page heading', 'text', 'Shown at the top of the public About page.'],
      ['settings.aboutLead', 'Page introduction', 'textarea', 'Shown below the About page heading.'],
      ['pages.about', 'About page content', 'textarea', 'Write in plain text. Separate paragraphs with a blank line. Leave blank to use the approved content.'],
    ],
    imageSlots: ['about_main', 'about_reception', 'about_treatment', 'about_waiting'],
  },
  {
    id: 'services',
    label: 'Services',
    fields: [
      ...['general-dentistry', 'cosmetic-dentistry', 'teeth-whitening', 'dental-implants', 'emergency-dentistry', 'preventive-care'].flatMap((slug) => [
        [`items.${slug}.title`, 'Service name', 'text', 'Shown on service cards and the service detail page.'],
        [`items.${slug}.excerpt`, 'Short description', 'textarea', 'Shown in service listings and the detail page introduction.'],
        [`items.${slug}.content`, 'Service details', 'textarea', 'Shown in the service detail content. Use blank lines between paragraphs.'],
        [`items.${slug}.benefits`, 'What this includes', 'list', 'One item per line.'],
        [`items.${slug}.expect`, 'What to expect', 'list', 'One item per line.'],
        [`items.${slug}.suitable`, 'Who this is for', 'list', 'One item per line.'],
        [`items.${slug}.duration`, 'Appointment duration', 'text', 'Shown on the service detail page.'],
        [`items.${slug}.feeNote`, 'Fees note', 'text', 'Shown on the service detail page.'],
      ]),
    ],
    imageSlots: SLOT_DEFINITIONS.filter(([slot]) => slot.startsWith('service_')).map(([slot]) => slot),
  },
  {
    id: 'team',
    label: 'Team',
    fields: [
      ...['elena-marsh', 'marcus-hale', 'priya-nair', 'tomas-berg'].flatMap((slug) => [
        [`items.${slug}.title`, 'Team member name', 'text', 'Shown on team cards and profile pages.'],
        [`items.${slug}.role`, 'Role', 'text', 'Shown with the team member name.'],
        [`items.${slug}.qualifications`, 'Qualifications', 'text', 'Shown on the profile page.'],
        [`items.${slug}.content`, 'Biography', 'textarea', 'Shown on the profile page. Use blank lines between paragraphs.'],
        [`items.${slug}.interests`, 'Areas of interest', 'list', 'One item per line.'],
      ]),
    ],
    imageSlots: SLOT_DEFINITIONS.filter(([slot]) => slot.startsWith('team_')).map(([slot]) => slot),
  },
  {
    id: 'patient-info',
    label: 'Patient Information',
    fields: [
      ['settings.patientTitle', 'Page heading', 'text', 'Shown at the top of Patient Information.'],
      ['settings.patientLead', 'Page introduction', 'textarea', 'Shown below the Patient Information heading.'],
      ['pages.patient-info', 'Patient information content', 'textarea', 'Write in plain text. Separate paragraphs with a blank line. Leave blank to use the approved content.'],
    ],
    imageSlots: [],
  },
  {
    id: 'contact',
    label: 'Contact',
    fields: [
      ['settings.phone', 'Phone number', 'text', 'Shown in the contact details and public links.'],
      ['settings.email', 'Email address', 'text', 'Shown in the contact details.'],
      ['settings.address', 'Practice address', 'textarea', 'Shown in contact and location sections.'],
      ['settings.contactTitle', 'Contact page heading', 'text', 'Shown on the Contact page.'],
      ['settings.contactIntro', 'Contact page introduction', 'textarea', 'Shown under the Contact page heading.'],
      ['settings.contactMessageTitle', 'Message form heading', 'text', 'Shown above the appointment request form.'],
      ['settings.contactMessageText', 'Message form introduction', 'textarea', 'Shown above the Contact page form.'],
    ],
    imageSlots: ['contact_map'],
  },
  {
    id: 'appointment',
    label: 'Appointment',
    fields: [
      ['settings.appointmentTitle', 'Page heading', 'text', 'Shown above the appointment request form.'],
      ['settings.appointmentIntro', 'Page introduction', 'textarea', 'Shown below the appointment page heading.'],
      ['settings.requestButton', 'Submit button label', 'text', 'Shown on the appointment request form button.'],
    ],
    imageSlots: [],
  },
  {
    id: 'footer',
    label: 'Footer',
    fields: [
      ['settings.footerAbout', 'Footer introduction', 'textarea', 'Shown below the BrightSmile name in the public footer.'],
      ['settings.hours', 'Opening hours', 'hours', 'One day per line, separated by a vertical bar. Example: Monday | 8:00am - 6:00pm'],
    ],
    imageSlots: [],
  },
] as const;

const allowedContent = new Map<string, { type: string }>();
for (const section of EDITOR_SECTIONS) {
  for (const [key, , type] of section.fields) allowedContent.set(key, { type });
}
const allowedSlots = new Map<string, { label: string; section: string; dimensions: string }>(
  SLOT_DEFINITIONS.map(([slot, label, section, dimensions]) => [slot, { label, section, dimensions }]),
);

const jsonResponse = (data: unknown, status = 200, headers: HeadersInit = {}): Response =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

const parseJson = async (request: Request): Promise<JsonRecord> => {
  const body: unknown = await request.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'A JSON object is required.');
  return body as JsonRecord;
};

const uploadFile = async (request: Request, env: Env, session: Session): Promise<Response> => {
  requireCsrf(request, session);
  const form = await request.formData();
  const file = form.get('file');
  const altText = String(form.get('alt_text') || '').trim();
  if (!(file instanceof File) || !file.size) return jsonResponse({ error: 'Choose an image to upload.' }, 400);
  if (file.size > 8 * 1024 * 1024) return jsonResponse({ error: 'Images must be 8 MB or smaller.' }, 400);
  if (altText.length > 500) return jsonResponse({ error: 'Alt text must be 500 characters or fewer.' }, 400);
  const types = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!types.has(file.type)) return jsonResponse({ error: 'Choose a JPEG, PNG, or WebP image.' }, 400);
  const bytes = await file.arrayBuffer();
  const header = new Uint8Array(bytes.slice(0, 12));
  const validSignature = file.type === 'image/jpeg'
    ? header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff
    : file.type === 'image/png'
      ? header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47
      : String.fromCharCode(...header.slice(0, 4)) === 'RIFF' && String.fromCharCode(...header.slice(8, 12)) === 'WEBP';
  if (!validSignature) return jsonResponse({ error: 'The image file does not match its declared type.' }, 400);
  const filename = file.name.replace(/[^A-Za-z0-9._-]/g, '-').slice(-120) || 'image';
  const objectKey = `central-admin/${crypto.randomUUID()}-${filename}`;
  const object = await env.BRIGHTSMILE_MEDIA.put(objectKey, bytes, {
    httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' },
  });
  const replaceId = Number(form.get('id') || 0);
  let mediaId = 0;
  let previousKey = '';
  try {
    if (replaceId) {
      const previous = await env.BRIGHTSMILE_DB.prepare('SELECT object_key FROM site_media WHERE id = ?').bind(replaceId).first<{ object_key: string }>();
      if (!previous) {
        await env.BRIGHTSMILE_MEDIA.delete(objectKey);
        return jsonResponse({ error: 'The image to replace could not be found.' }, 404);
      }
      previousKey = previous.object_key;
      await env.BRIGHTSMILE_DB.batch([
        env.BRIGHTSMILE_DB.prepare('UPDATE site_media SET object_key = ?, filename = ?, mime_type = ?, byte_size = ?, alt_text = ?, etag = ? WHERE id = ?')
          .bind(objectKey, filename, file.type, file.size, altText, object?.etag || '', replaceId),
        env.BRIGHTSMILE_DB.prepare('UPDATE image_slots SET object_key = ?, content_type = ?, alt_text = ?, updated_at = CURRENT_TIMESTAMP WHERE object_key = ?')
          .bind(objectKey, file.type, altText, previous.object_key),
      ]);
      mediaId = replaceId;
    } else {
      const result = await env.BRIGHTSMILE_DB.prepare('INSERT INTO site_media (object_key, filename, mime_type, byte_size, alt_text, etag) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(objectKey, filename, file.type, file.size, altText, object?.etag || '').run();
      mediaId = Number(result.meta.last_row_id || 0);
    }
  } catch (error) {
    await env.BRIGHTSMILE_MEDIA.delete(objectKey);
    throw error;
  }
  if (previousKey) await env.BRIGHTSMILE_MEDIA.delete(previousKey);
  await env.DB.prepare('INSERT INTO audit_log (admin_id, action, entity, entity_id) VALUES (?, ?, ?, ?)')
    .bind(session.admin_id, replaceId ? 'replace' : 'upload', 'site-media:brightsmile', mediaId).run();
  return jsonResponse({ ok: true, replaced: Boolean(replaceId) });
};

const listMedia = async (request: Request, env: Env): Promise<Response> => {
  const search = new URL(request.url).searchParams.get('q')?.trim().slice(0, 100) || '';
  const result = search
    ? await env.BRIGHTSMILE_DB.prepare('SELECT id, object_key, filename, mime_type, byte_size, alt_text, etag FROM site_media WHERE filename LIKE ? OR alt_text LIKE ? ORDER BY created_at DESC, id DESC').bind(`%${search}%`, `%${search}%`).all<JsonRecord>()
    : await env.BRIGHTSMILE_DB.prepare('SELECT id, object_key, filename, mime_type, byte_size, alt_text, etag FROM site_media ORDER BY created_at DESC, id DESC').all<JsonRecord>();
  const slots = await env.BRIGHTSMILE_DB.prepare('SELECT slot, object_key FROM image_slots').all<{ slot: string; object_key: string }>();
  const assignments = new Map<string, string[]>();
  for (const row of slots.results || []) {
    const values = assignments.get(row.object_key) || [];
    values.push(row.slot);
    assignments.set(row.object_key, values);
  }
  return jsonResponse((result.results || []).map((row) => ({
    id: row.id,
    filename: row.filename,
    mime_type: row.mime_type,
    byte_size: row.byte_size,
    alt_text: row.alt_text,
    preview: `/api/admin/sites/brightsmile/media/${row.id}/preview`,
    used_in: assignments.get(String(row.object_key)) || [],
  })));
};

const imageSlots = async (env: Env): Promise<Response> => {
  const rows = await env.BRIGHTSMILE_DB.prepare('SELECT i.slot, i.alt_text, i.updated_at, m.id AS media_id FROM image_slots i LEFT JOIN site_media m ON m.object_key = i.object_key').all<{ slot: string; alt_text: string; updated_at: string; media_id: number | null }>();
  const current = new Map((rows.results || []).map((row) => [row.slot, row]));
  return jsonResponse(SLOT_DEFINITIONS.map(([slot, label, section, dimensions]) => {
    const row = current.get(slot);
    return {
      slot, label, section, dimensions, alt_text: row?.alt_text || '',
      preview: row ? `https://dental.xilveno.shop/media/${encodeURIComponent(slot)}?v=${encodeURIComponent(row.updated_at)}` : '',
      media_id: row?.media_id || null,
      is_custom: Boolean(row),
    };
  }));
};

const assignSlot = async (request: Request, env: Env, session: Session, slot: string): Promise<Response> => {
  if (!allowedSlots.has(slot)) return jsonResponse({ error: 'That image location is not in the approved BrightSmile manifest.' }, 404);
  if (request.method === 'DELETE') {
    requireCsrf(request, session);
    const old = await env.BRIGHTSMILE_DB.prepare('SELECT object_key FROM image_slots WHERE slot = ?').bind(slot).first<{ object_key: string }>();
    await env.BRIGHTSMILE_DB.prepare('DELETE FROM image_slots WHERE slot = ?').bind(slot).run();
    if (old) {
      const stillUsed = await env.BRIGHTSMILE_DB.prepare('SELECT 1 AS found FROM image_slots WHERE object_key = ? LIMIT 1').bind(old.object_key).first<{ found: number }>();
      if (!stillUsed) await env.BRIGHTSMILE_MEDIA.delete(old.object_key);
      await env.BRIGHTSMILE_DB.prepare('DELETE FROM site_media WHERE object_key = ? AND NOT EXISTS (SELECT 1 FROM image_slots WHERE object_key = ?)').bind(old.object_key, old.object_key).run();
    }
    await env.DB.prepare('INSERT INTO audit_log (admin_id, action, entity, entity_id) VALUES (?, ?, ?, ?)').bind(session.admin_id, 'remove', 'site-image:brightsmile', slot).run();
    return jsonResponse({ ok: true });
  }
  if (request.method !== 'PUT') return jsonResponse({ error: 'Method not allowed.' }, 405);
  requireCsrf(request, session);
  const body = await parseJson(request);
  const id = Number(body.media_id);
  const altText = typeof body.alt_text === 'string' ? body.alt_text.trim() : '';
  if (altText.length > 500) return jsonResponse({ error: 'Alt text must be 500 characters or fewer.' }, 400);
  if (!Number.isSafeInteger(id) || id < 1) {
    const current = await env.BRIGHTSMILE_DB.prepare('SELECT object_key FROM image_slots WHERE slot = ?').bind(slot).first<{ object_key: string }>();
    if (!current) return jsonResponse({ error: 'Choose an image from the BrightSmile media library first.' }, 400);
    await env.BRIGHTSMILE_DB.prepare('UPDATE image_slots SET alt_text = ?, updated_at = CURRENT_TIMESTAMP WHERE slot = ?').bind(altText, slot).run();
    return jsonResponse({ ok: true });
  }
  const media = await env.BRIGHTSMILE_DB.prepare('SELECT object_key, alt_text, mime_type FROM site_media WHERE id = ?').bind(id).first<{ object_key: string; alt_text: string; mime_type: string }>();
  if (!media) return jsonResponse({ error: 'That image is not in the BrightSmile media library.' }, 404);
  await env.BRIGHTSMILE_DB.prepare('INSERT INTO image_slots (slot, object_key, content_type, alt_text, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(slot) DO UPDATE SET object_key = excluded.object_key, content_type = excluded.content_type, alt_text = excluded.alt_text, updated_at = CURRENT_TIMESTAMP')
    .bind(slot, media.object_key, media.mime_type, altText || media.alt_text).run();
  await env.DB.prepare('INSERT INTO audit_log (admin_id, action, entity, entity_id) VALUES (?, ?, ?, ?)').bind(session.admin_id, 'assign', 'site-image:brightsmile', slot).run();
  return jsonResponse({ ok: true });
};

const deleteMedia = async (request: Request, env: Env, session: Session, id: number): Promise<Response> => {
  if (request.method === 'PATCH') {
    requireCsrf(request, session);
    const body = await parseJson(request);
    const altText = typeof body.alt_text === 'string' ? body.alt_text.trim() : '';
    if (altText.length > 500) return jsonResponse({ error: 'Alt text must be 500 characters or fewer.' }, 400);
    await env.BRIGHTSMILE_DB.prepare('UPDATE site_media SET alt_text = ? WHERE id = ?').bind(altText, id).run();
    await env.BRIGHTSMILE_DB.prepare('UPDATE image_slots SET alt_text = ? WHERE object_key = (SELECT object_key FROM site_media WHERE id = ?)').bind(altText, id).run();
    return jsonResponse({ ok: true });
  }
  if (request.method !== 'DELETE') return jsonResponse({ error: 'Method not allowed.' }, 405);
  requireCsrf(request, session);
  const media = await env.BRIGHTSMILE_DB.prepare('SELECT object_key FROM site_media WHERE id = ?').bind(id).first<{ object_key: string }>();
  if (!media) return jsonResponse({ error: 'Image not found.' }, 404);
  await env.BRIGHTSMILE_DB.prepare('DELETE FROM image_slots WHERE object_key = ?').bind(media.object_key).run();
  await env.BRIGHTSMILE_MEDIA.delete(media.object_key);
  await env.BRIGHTSMILE_DB.prepare('DELETE FROM site_media WHERE id = ?').bind(id).run();
  await env.DB.prepare('INSERT INTO audit_log (admin_id, action, entity, entity_id) VALUES (?, ?, ?, ?)').bind(session.admin_id, 'delete', 'site-media:brightsmile', id).run();
  return jsonResponse({ ok: true });
};

const servePreview = async (env: Env, id: number): Promise<Response> => {
  const media = await env.BRIGHTSMILE_DB.prepare('SELECT object_key, mime_type FROM site_media WHERE id = ?').bind(id).first<{ object_key: string; mime_type: string }>();
  if (!media) return jsonResponse({ error: 'Image not found.' }, 404);
  const object = await env.BRIGHTSMILE_MEDIA.get(media.object_key);
  if (!object) return jsonResponse({ error: 'Image file is missing.' }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', media.mime_type);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(object.body, { headers });
};

export const handleDentalAdminApi = async (request: Request, env: Env, pathname: string): Promise<Response> => {
  const session = await requireSession(request, env);
  const base = '/api/admin/sites/brightsmile';
  if (pathname === `${base}/content`) {
    if (request.method === 'GET') {
      const rows = await env.BRIGHTSMILE_DB.prepare('SELECT content_key, content_value FROM site_content').all<{ content_key: string; content_value: string }>();
      return jsonResponse({
        sections: EDITOR_SECTIONS.map((section) => ({
          id: section.id,
          label: section.label,
          fields: section.fields.map(([key, label, type, hint]) => ({ key, label, type, hint })),
          imageSlots: section.imageSlots,
        })),
        values: Object.fromEntries((rows.results || []).map((row) => [row.content_key, row.content_value])),
      });
    }
    if (request.method !== 'PUT') return jsonResponse({ error: 'Method not allowed.' }, 405);
    requireCsrf(request, session);
    const body = await parseJson(request);
    const values = body.values;
    if (!values || typeof values !== 'object' || Array.isArray(values)) return jsonResponse({ error: 'Content values are required.' }, 400);
    const entries = Object.entries(values as Record<string, unknown>);
    if (!entries.length || entries.length > 100 || entries.some(([key, value]) => !allowedContent.has(key) || typeof value !== 'string' || value.length > 20_000)) {
      return jsonResponse({ error: 'One or more content fields are invalid.' }, 400);
    }
    const statements = entries.map(([key, value]) => {
      const normalized = (value as string).trim();
      return normalized
        ? env.BRIGHTSMILE_DB.prepare('INSERT INTO site_content (content_key, content_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(content_key) DO UPDATE SET content_value = excluded.content_value, updated_at = CURRENT_TIMESTAMP').bind(key, normalized)
        : env.BRIGHTSMILE_DB.prepare('DELETE FROM site_content WHERE content_key = ?').bind(key);
    });
    await env.BRIGHTSMILE_DB.batch(statements);
    await env.DB.prepare('INSERT INTO audit_log (admin_id, action, entity) VALUES (?, ?, ?)').bind(session.admin_id, 'update', 'site-content:brightsmile').run();
    return jsonResponse({ ok: true });
  }
  if (pathname === `${base}/slots` && request.method === 'GET') return imageSlots(env);
  if (pathname === `${base}/media`) {
    if (request.method === 'GET') return listMedia(request, env);
    if (request.method === 'POST' || request.method === 'PUT') return uploadFile(request, env, session);
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }
  const previewMatch = pathname.match(/^\/api\/admin\/sites\/brightsmile\/media\/(\d+)\/preview$/);
  if (previewMatch && request.method === 'GET') return servePreview(env, Number(previewMatch[1]));
  const mediaMatch = pathname.match(/^\/api\/admin\/sites\/brightsmile\/media\/(\d+)$/);
  if (mediaMatch) return deleteMedia(request, env, session, Number(mediaMatch[1]));
  const slotMatch = pathname.match(/^\/api\/admin\/sites\/brightsmile\/slots\/([a-z0-9_-]+)$/);
  if (slotMatch) return assignSlot(request, env, session, slotMatch[1]);
  return jsonResponse({ error: 'Not found.' }, 404);
};
