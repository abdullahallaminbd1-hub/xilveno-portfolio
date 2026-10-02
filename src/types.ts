export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  ADMIN_BOOTSTRAP_PASSWORD?: string;
  SESSION_SECRET?: string;
  EMAIL_API_KEY?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
}

export interface SettingRow { key: string; value: string; }
export interface PageRow { slug: string; title: string; excerpt: string; body: string; seo_title: string; seo_description: string; }
export interface ProjectRow {
  id: number; title: string; slug: string; short_description: string; full_description: string;
  category_id: number | null; category_name?: string; project_type: string; platform: string;
  role: string; focus: string; status: string; featured: number; featured_image_id: number | null; case_study_media_id?: number | null;
  live_demo_url: string; case_study_url: string; challenge: string; approach: string; solution: string;
  key_features_json: string; technologies_json: string; sort_order: number; published: number;
}
export interface MediaRow { id: number; object_key: string; filename: string; mime_type: string; byte_size: number; width: number | null; height: number | null; alt_text: string; etag: string; }
export interface Session { id: number; admin_id: number; csrf_token: string; expires_at: number; }

export type JsonRecord = Record<string, unknown>;