/**
 * Admin panel stylesheet.
 *
 * This is the only stylesheet the admin panel loads. It deliberately reuses the
 * public website's design language (same font stack, blue accent, dark navy,
 * radii and spacing rhythm) so the panel feels like the control centre of the
 * same site instead of a generic dashboard.
 *
 * Nothing in here is loaded by the public pages.
 */
export const ADMIN_CSS = String.raw`
:root{
  --x-font:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --x-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
  --x-bg:#f6f7fb;
  --x-surface:#ffffff;
  --x-ink:#0b1220;
  --x-ink-2:#1b2438;
  --x-body:#414c63;
  --x-muted:#6b7690;
  --x-line:#e4e9f2;
  --x-line-strong:#d3dae8;
  --x-navy:#070c18;
  --x-navy-2:#111a2e;
  --x-navy-line:rgba(255,255,255,.10);
  --x-navy-body:#a9b3c9;
  --x-accent:#2563eb;
  --x-accent-dark:#1d4ed8;
  --x-accent-soft:rgba(37,99,235,.08);
  --x-ok:#0f9d58;
  --x-ok-soft:rgba(15,157,88,.12);
  --x-warn:#b45309;
  --x-warn-soft:rgba(180,83,9,.12);
  --x-danger:#dc2626;
  --x-danger-soft:rgba(220,38,38,.10);
  --x-r-sm:8px;
  --x-r:12px;
  --x-r-lg:16px;
  --x-shadow-sm:0 1px 2px rgba(11,18,32,.05);
  --x-shadow:0 8px 28px -12px rgba(11,18,32,.18);
  --x-shadow-lg:0 24px 60px -30px rgba(11,18,32,.35);
  --x-ring:0 0 0 3px rgba(37,99,235,.22);
  color-scheme:light;
}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body.admin-body{margin:0;font-family:var(--x-font);color:var(--x-body);background:var(--x-bg);font-size:15px;line-height:1.55}
.admin-body h1,.admin-body h2,.admin-body h3,.admin-body h4{color:var(--x-ink);line-height:1.25;margin:0}
.admin-body a{color:var(--x-accent);text-decoration:none}
.admin-body a:hover{text-decoration:underline}
.admin-body :focus-visible{outline:0;box-shadow:var(--x-ring);border-radius:6px}
.admin-icon{display:block;flex:none}
.admin-shell{max-width:1480px;margin:0 auto;padding:22px}
.admin-hint{display:block;color:var(--x-muted);font-size:13px;font-weight:400;line-height:1.5}
.admin-empty{border:1px dashed var(--x-line-strong);border-radius:var(--x-r);padding:28px;text-align:center;color:var(--x-muted);background:#fbfcfe}
.admin-mono{font-family:var(--x-mono);font-size:12.5px}
.admin-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}

/* ---------------------------------------------------------------- login */
.admin-login-wrap{min-height:100vh;display:grid;place-items:center;padding:24px;background:
  radial-gradient(1100px 520px at 12% -10%,rgba(37,99,235,.20),transparent 60%),
  radial-gradient(900px 520px at 100% 0%,rgba(79,70,229,.18),transparent 55%),var(--x-navy)}
.admin-login{width:100%;max-width:440px;background:#fff;border-radius:var(--x-r-lg);padding:32px;box-shadow:var(--x-shadow-lg)}
.admin-login__brand{margin:0 0 6px;font-size:20px;font-weight:800;letter-spacing:-.01em}
.admin-login__sub{margin:0 0 22px;color:var(--x-muted);font-size:14px}
.admin-login__foot{margin:18px 0 0;font-size:13px;color:var(--x-muted)}

/* ---------------------------------------------------------------- layout */
.admin-layout{display:grid;grid-template-columns:264px minmax(0,1fr);gap:22px;align-items:start}
.admin-sidebar{position:sticky;top:22px;background:linear-gradient(180deg,var(--x-navy) 0%,var(--x-navy-2) 100%);border-radius:var(--x-r-lg);padding:18px 14px;color:var(--x-navy-body);box-shadow:var(--x-shadow);max-height:calc(100vh - 44px);overflow:auto}
.admin-sidebar__brand{display:flex;align-items:center;gap:10px;padding:4px 8px 16px;border-bottom:1px solid var(--x-navy-line);margin-bottom:14px}
.admin-sidebar__brand strong{color:#fff;font-size:16px;letter-spacing:-.01em}
.admin-sidebar__brand span{display:block;font-size:11.5px;color:var(--x-navy-body);font-weight:500}
.admin-sidebar__logo{width:32px;height:32px;border-radius:9px;background:linear-gradient(135deg,var(--x-accent),#4f46e5);display:grid;place-items:center;color:#fff;font-weight:800;font-size:14px;flex:none}
.admin-nav__group{margin:0 0 14px}
.admin-nav__label{margin:0 0 6px;padding:0 8px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:rgba(169,179,201,.75);font-weight:700}
.admin-nav a{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:9px;color:var(--x-navy-body);font-size:14px;font-weight:500;text-decoration:none;transition:background .18s ease,color .18s ease}
.admin-nav a:hover{background:rgba(255,255,255,.07);color:#fff;text-decoration:none}
.admin-nav a[aria-current="page"]{background:rgba(37,99,235,.22);color:#fff;box-shadow:inset 0 0 0 1px rgba(96,165,250,.35)}
.admin-nav a .admin-icon{color:currentColor;opacity:.9}
.admin-sidebar__foot{margin-top:6px;padding-top:14px;border-top:1px solid var(--x-navy-line);display:grid;gap:8px}
.admin-sidebar__foot button,.admin-sidebar__foot a{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border:0;border-radius:9px;background:rgba(255,255,255,.06);color:var(--x-navy-body);font:inherit;font-size:14px;cursor:pointer;text-align:left;text-decoration:none}
.admin-sidebar__foot button:hover,.admin-sidebar__foot a:hover{background:rgba(255,255,255,.12);color:#fff;text-decoration:none}
.admin-menu-toggle.admin-button{display:none}
.admin-main{min-width:0;display:grid;gap:18px}
/* Grid and flex children default to min-width:auto, which would let a wide table
   stretch the whole page on small screens. */
.admin-main>*{min-width:0}
.admin-card{min-width:0}

/* --------------------------------------------------------------- topbar */
.admin-top{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:14px}
.admin-top__text h2{font-size:clamp(1.4rem,1.1rem + .8vw,1.85rem);letter-spacing:-.02em}
.admin-top__text p{margin:4px 0 0;color:var(--x-muted);font-size:14px}
.admin-top__actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.admin-breadcrumbs{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--x-muted);margin:0 0 4px}
.admin-breadcrumbs b{color:var(--x-ink-2)}
/* ---------------------------------------------------------------- cards */
.admin-card{background:var(--x-surface);border:1px solid var(--x-line);border-radius:var(--x-r-lg);padding:22px;box-shadow:var(--x-shadow-sm)}
.admin-card--tight{padding:16px}
.admin-card__head{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:16px}
.admin-card__head h3{font-size:16.5px}
.admin-card__head p{margin:3px 0 0;color:var(--x-muted);font-size:13.5px}
.admin-stack{display:grid;gap:18px}
.admin-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}
.admin-grid--2{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
.admin-grid--3{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
.admin-stat{display:grid;gap:4px}
.admin-stat strong{font-size:30px;color:var(--x-ink);letter-spacing:-.02em;line-height:1.1}
.admin-stat span{color:var(--x-muted);font-size:13px}
.admin-stat a{font-size:13px;display:inline-flex;align-items:center;min-height:28px;font-weight:600}
.admin-stat a:hover{text-decoration:underline}
.admin-split{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}

/* --------------------------------------------------------------- forms */
.admin-form{display:grid;gap:16px}
.admin-fieldset{border:0;margin:0;padding:0;display:grid;gap:16px}
.admin-fieldset + .admin-fieldset{margin-top:22px;padding-top:22px;border-top:1px solid var(--x-line)}
.admin-fieldset__legend{padding:0;margin:0 0 4px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--x-muted)}
.admin-field{display:grid;gap:6px;min-width:0}
.admin-label{font-size:13.5px;font-weight:600;color:var(--x-ink-2);display:grid;gap:6px;min-width:0}
.admin-input,.admin-select,.admin-textarea{width:100%;border:1px solid var(--x-line-strong);border-radius:var(--x-r-sm);padding:10px 12px;font:inherit;font-size:14.5px;color:var(--x-ink);background:#fff;transition:border-color .18s ease,box-shadow .18s ease}
.admin-input:hover,.admin-select:hover,.admin-textarea:hover{border-color:#bfc9dc}
.admin-input:focus,.admin-select:focus,.admin-textarea:focus{outline:0;border-color:var(--x-accent);box-shadow:var(--x-ring)}
.admin-input::placeholder,.admin-textarea::placeholder{color:#9aa4b8}
.admin-textarea{min-height:120px;resize:vertical;line-height:1.6}
.admin-textarea--sm{min-height:84px}
.admin-check{display:flex;align-items:center;gap:9px;font-size:14px;font-weight:600;color:var(--x-ink-2);padding:9px 12px;border:1px solid var(--x-line-strong);border-radius:var(--x-r-sm);background:#fff;cursor:pointer}
.admin-check input{width:16px;height:16px;accent-color:var(--x-accent);flex:none}
.admin-invalid{border-color:var(--x-danger) !important;box-shadow:0 0 0 3px var(--x-danger-soft) !important}
.admin-error-text{color:var(--x-danger);font-size:12.5px;font-weight:600}

/* ------------------------------------------------------------- buttons */
.admin-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid transparent;border-radius:999px;padding:10px 18px;background:var(--x-accent);color:#fff;font:inherit;font-size:14px;font-weight:700;cursor:pointer;text-decoration:none;transition:transform .18s ease,background .18s ease,box-shadow .18s ease}
.admin-button:hover{background:var(--x-accent-dark);transform:translateY(-1px);text-decoration:none;color:#fff}
.admin-button.secondary{background:#fff;color:var(--x-ink-2);border-color:var(--x-line-strong)}
.admin-button.secondary:hover{background:#f3f6fd;color:var(--x-ink);border-color:#bfc9dc}
.admin-button.ghost{background:transparent;color:var(--x-ink-2);border-color:transparent;font-weight:600}
.admin-button.ghost:hover{background:var(--x-accent-soft);color:var(--x-accent-dark)}
.admin-button.danger{background:#fff;color:var(--x-danger);border-color:rgba(220,38,38,.35)}
.admin-button.danger:hover{background:var(--x-danger-soft);color:#b91c1c}
.admin-button.danger.solid{background:var(--x-danger);color:#fff;border-color:transparent}
.admin-button[disabled],.admin-button.is-busy{opacity:.6;cursor:not-allowed;transform:none}
.admin-button--sm{padding:7px 13px;font-size:13px}
.admin-button--block{width:100%}
.admin-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0}
.admin-actions--end{justify-content:flex-end}
.admin-iconbutton{display:inline-grid;place-items:center;width:32px;height:32px;border-radius:9px;border:1px solid var(--x-line-strong);background:#fff;color:var(--x-ink-2);cursor:pointer;padding:0}
.admin-iconbutton:hover{background:#f3f6fd;color:var(--x-accent-dark)}
.admin-iconbutton[disabled]{opacity:.4;cursor:not-allowed}
/* --------------------------------------------------------------- chips */
.admin-chip{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;background:#eef2f9;color:var(--x-ink-2);white-space:nowrap}
.admin-chip--ok{background:var(--x-ok-soft);color:#0b7a45}
.admin-chip--info{background:var(--x-accent-soft);color:var(--x-accent-dark)}
.admin-chip--warn{background:var(--x-warn-soft);color:var(--x-warn)}
.admin-chip--muted{background:#f1f3f8;color:var(--x-muted)}
.admin-chip--danger{background:var(--x-danger-soft);color:#b91c1c}

/* --------------------------------------------------------------- tables */
.admin-table{width:100%;border-collapse:collapse;font-size:14px}
.admin-table th{text-align:left;font-size:11.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--x-muted);padding:10px 12px;border-bottom:1px solid var(--x-line);white-space:nowrap}
.admin-table td{padding:12px;border-bottom:1px solid var(--x-line);vertical-align:middle}
.admin-table tr:last-child td{border-bottom:0}
.admin-table tbody tr:hover{background:#fafbff}
.admin-table__wrap{overflow:auto;border-radius:var(--x-r);border:1px solid var(--x-line)}
.admin-table__thumb{width:44px;height:44px;border-radius:9px;object-fit:cover;background:#eef2f9;flex:none}
.admin-cell{display:flex;align-items:center;gap:10px;min-width:0}
.admin-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px}
.admin-tabs button{border:1px solid var(--x-line-strong);background:#fff;border-radius:999px;padding:7px 14px;font:inherit;font-size:13.5px;font-weight:600;color:var(--x-body);cursor:pointer}
.admin-tabs button[aria-pressed="true"]{background:var(--x-accent);border-color:var(--x-accent);color:#fff}
.admin-detail{margin:0;display:grid;gap:12px}
.admin-detail > div{display:grid;gap:3px}
.admin-detail dt{font-size:11.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--x-muted);font-weight:700}
.admin-detail dd{margin:0;color:var(--x-ink-2);font-size:14.5px;overflow-wrap:anywhere}
.admin-message-box{white-space:pre-wrap;background:#fafbff;border:1px solid var(--x-line);border-radius:var(--x-r-sm);padding:12px;margin:0}

/* -------------------------------------------------------------- media */
.admin-dropzone{border:1.5px dashed var(--x-line-strong);border-radius:var(--x-r);padding:20px;text-align:center;background:#fbfcfe;transition:border-color .18s ease,background .18s ease}
.admin-dropzone.is-over{border-color:var(--x-accent);background:var(--x-accent-soft)}
.admin-media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px}
.admin-media-card{display:grid;gap:10px;background:#fff;border:1px solid var(--x-line);border-radius:var(--x-r);padding:12px;text-align:left;font:inherit;color:inherit}
button.admin-media-card{cursor:pointer}
button.admin-media-card:hover{border-color:var(--x-accent);box-shadow:var(--x-shadow-sm)}
.admin-media-card.is-selected{border-color:var(--x-accent);box-shadow:0 0 0 3px var(--x-accent-soft)}
.admin-media-card__thumb{width:100%;aspect-ratio:4/3;border-radius:var(--x-r-sm);object-fit:cover;background:#eef2f9;display:block}
.admin-media-card__body{display:grid;gap:4px;min-width:0}
.admin-media-card__name{font-size:13px;font-weight:600;color:var(--x-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.admin-media-card__actions{display:flex;flex-wrap:wrap;gap:6px}
.admin-media-meta{font-size:11.5px;color:var(--x-muted)}
.admin-media-toolbar{display:grid;gap:12px;grid-template-columns:minmax(0,1fr) auto;align-items:end}
.admin-picker{display:grid;gap:10px;padding:12px;border:1px solid var(--x-line);border-radius:var(--x-r);background:#fbfcfe}
.admin-picker-preview{width:100%;aspect-ratio:16/9;border-radius:var(--x-r-sm);overflow:hidden;background:#eef2f9;display:grid;place-items:center;border:1px solid var(--x-line)}
.admin-picker-preview img{width:100%;height:100%;object-fit:cover;display:block}
.admin-picker-actions{display:flex;flex-wrap:wrap;gap:8px}
.admin-order{display:flex;gap:6px;align-items:center}
/* -------------------------------------------------------------- modals */
.admin-modal{position:fixed;inset:0;background:rgba(7,12,24,.55);display:grid;place-items:center;padding:20px;z-index:60;overflow:auto}
.admin-modal__panel{width:100%;max-width:880px;background:#fff;border-radius:var(--x-r-lg);box-shadow:var(--x-shadow-lg);display:grid;max-height:90vh}
.admin-modal__panel--narrow{max-width:520px}
.admin-modal__head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:18px 20px;border-bottom:1px solid var(--x-line)}
.admin-modal__head h3{font-size:16.5px}
.admin-modal__body{padding:20px;overflow:auto}
.admin-modal__foot{display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;padding:16px 20px;border-top:1px solid var(--x-line);background:#fbfcfe;border-radius:0 0 var(--x-r-lg) var(--x-r-lg)}

/* -------------------------------------------------------------- toasts */
.admin-toasts{position:fixed;right:20px;bottom:20px;display:grid;gap:10px;z-index:80;max-width:min(360px,90vw)}
.admin-toast{background:var(--x-ink);color:#fff;border-radius:var(--x-r);padding:13px 16px;font-size:14px;box-shadow:var(--x-shadow-lg);display:flex;gap:10px;align-items:flex-start}
.admin-toast--error{background:#b91c1c}
.admin-toast--info{background:var(--x-ink-2)}
.admin-toast__close{margin-left:auto;background:none;border:0;color:inherit;cursor:pointer;font-size:16px;line-height:1;opacity:.8;padding:0}
.admin-message{display:flex;gap:10px;border-radius:var(--x-r);padding:12px 14px;font-size:14px}
.admin-message.admin-error{background:var(--x-danger-soft);color:#b91c1c;border:1px solid rgba(220,38,38,.25)}
.admin-message.admin-success{background:var(--x-ok-soft);color:#0b7a45;border:1px solid rgba(15,157,88,.25)}
.admin-inline-note{display:flex;gap:10px;align-items:flex-start;background:var(--x-accent-soft);border:1px solid rgba(37,99,235,.2);color:#1e3a8a;border-radius:var(--x-r);padding:12px 14px;font-size:13.5px}
.admin-inline-note--warn{background:var(--x-warn-soft);border-color:rgba(180,83,9,.25);color:#7c4a03}

/* ------------------------------------------- homepage visual editor */
.admin-editor{display:grid;grid-template-columns:228px minmax(0,1fr) 396px;gap:16px;align-items:start}
.admin-editor__rail,.admin-editor__panel{background:#fff;border:1px solid var(--x-line);border-radius:var(--x-r-lg);box-shadow:var(--x-shadow-sm)}
.admin-editor__rail{padding:14px;position:sticky;top:22px;max-height:calc(100vh - 44px);overflow:auto}
.admin-editor__rail h3{margin:0 0 4px;font-size:13px}
.admin-editor__rail p{margin:0 0 12px}
.admin-section-list{display:grid;gap:4px;margin:0;padding:0;list-style:none}
.admin-section-list button{display:flex;align-items:center;gap:9px;width:100%;border:1px solid transparent;background:transparent;border-radius:9px;padding:8px 10px;font:inherit;font-size:13.5px;font-weight:600;color:var(--x-body);cursor:pointer;text-align:left}
.admin-section-list button:hover{background:var(--x-accent-soft);color:var(--x-accent-dark)}
.admin-section-list button.is-active{background:var(--x-accent);color:#fff}
.admin-editor__stage{display:grid;gap:0;position:sticky;top:22px;align-self:start}
.admin-stage-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;background:#fff;border:1px solid var(--x-line);border-radius:var(--x-r-lg) var(--x-r-lg) 0 0;padding:10px 14px;box-shadow:var(--x-shadow-sm)}
.admin-stage{background:#fff;border:1px solid var(--x-line);border-top:0;border-radius:0 0 var(--x-r-lg) var(--x-r-lg);overflow:hidden;box-shadow:var(--x-shadow-sm)}
.admin-stage iframe{display:block;width:100%;height:min(74vh,880px);border:0;background:#fff;margin:0 auto}
.admin-stage--tablet iframe{width:834px;max-width:100%;height:min(74vh,1000px)}
.admin-stage--mobile iframe{width:390px;max-width:100%;height:min(74vh,780px)}
.admin-editor__panel{padding:18px;position:sticky;top:22px;max-height:calc(100vh - 44px);overflow:auto}
.admin-editor__panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px}
.admin-editor__panel-head h3{font-size:16px}
.admin-editor__panel-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;padding-top:16px;border-top:1px solid var(--x-line);position:sticky;bottom:-18px;background:#fff}
.admin-editor__panel-meta{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px}

/* --------------------------------------------------------- responsive */
@media (max-width:1280px){
  .admin-editor{grid-template-columns:1fr}
  .admin-editor__rail,.admin-editor__panel,.admin-editor__stage{position:static;max-height:none}
  .admin-section-list{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
}
@media (max-width:1024px){
  .admin-layout{grid-template-columns:1fr}
  .admin-sidebar{position:fixed;top:12px;bottom:12px;left:12px;width:min(300px,84vw);z-index:70;transform:translateX(-118%);transition:transform .24s ease;max-height:none}
  .admin-sidebar.is-open{transform:none}
  .admin-menu-toggle.admin-button{display:inline-flex}
  .admin-scrim{position:fixed;inset:0;background:rgba(7,12,24,.45);z-index:65;border:0;padding:0}
}
@media (max-width:720px){
  .admin-shell{padding:14px}
  .admin-card{padding:16px}
  .admin-editor__panel{padding:14px}
  .admin-media-grid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr))}
  .admin-modal{padding:0}
  .admin-modal__panel{max-height:100vh;border-radius:0;min-height:100vh}
  .admin-modal__head,.admin-modal__body,.admin-modal__foot{padding-left:16px;padding-right:16px}
  .admin-toasts{left:14px;right:14px;bottom:14px;max-width:none}
  .admin-top{align-items:flex-start}
  .admin-editor__panel-actions{bottom:-14px}
}
@media (max-width:480px){
  .admin-actions .admin-button{flex:1 1 auto}
  .admin-media-toolbar{grid-template-columns:1fr}
}
@media (prefers-reduced-motion:reduce){
  .admin-body *{transition:none !important;animation:none !important}
}
`;