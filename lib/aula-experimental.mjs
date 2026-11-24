// Trial-class page (aula-experimental): event intake, funnel numbers and the extra settings
// (help WhatsApp and final-screen note). Used by lib/useful-links-routes.mjs.
export const DEFAULT_WHATSAPP = '551130521378';
export const EXTRA_DEFAULTS = { whatsapp: DEFAULT_WHATSAPP, done_note: '' };

export const EVENTS = new Set([
  'page_view', 'period_choice_view', 'rules_acknowledged', 'period_selected', 'step_view', 'external_click',
  'self_reported_step', 'self_reported_completion',
  // new page
  'help_click', 'help_whatsapp', 'resume_offered', 'resume_continue', 'resume_restart', 'confirm_view',
  'confirm_help', 'tip_browser_view', 'iframe_slow'
]);
export const BROWSERS = new Set(['instagram', 'facebook', 'tiktok', 'inapp_ios', 'inapp_android', 'safari_ios',
  'ios_other', 'chrome_android', 'android_other', 'desktop', 'other']);

const ready = new WeakMap();
// One row per visitor session: browser class and page version. Created on first use, outside the tracked event table.
export function ensureSessionTable(db) {
  if (!ready.has(db)) ready.set(db, db.prepare('CREATE TABLE IF NOT EXISTS useful_link_sessions(link_slug TEXT NOT NULL,session_id TEXT NOT NULL,browser TEXT NOT NULL DEFAULT \'other\',variant TEXT NOT NULL DEFAULT \'v1\',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(link_slug,session_id))').run()
    .catch(e => { ready.delete(db); throw e; }));
  return ready.get(db);
}

// Returns true when stored, false when the payload is not an accepted event.
export async function recordEvent(db, b) {
  const event = String(b?.event || '');
  if (b?.link !== 'aula-experimental' || !b.session || !EVENTS.has(event)) return false;
  const session = String(b.session).slice(0, 100);
  const step = String(b.step || '').slice(0, 80), period = String(b.period || b.selected_period || '').slice(0, 40);
  try {
    await ensureSessionTable(db);
    await db.prepare('INSERT OR IGNORE INTO useful_link_sessions(link_slug,session_id,browser,variant) VALUES(?,?,?,?)')
      .bind(b.link, session, BROWSERS.has(b.browser) ? b.browser : 'other', b.variant === 'v2' ? 'v2' : 'v1').run();
  } catch (e) { console.warn('useful_link_sessions', String(e?.message || e)); } // never lose the event itself
  await db.prepare('INSERT INTO useful_link_tracking_v2(link_slug,session_id,event_type,step,period) VALUES(?,?,?,?,?)')
    .bind(b.link, session, event, step, period).run();
  return true;
}

const STAGE_SQL = `CASE WHEN event_type='page_view' THEN 'open'
  WHEN event_type='period_selected' THEN 'chose'
  WHEN event_type='rules_acknowledged' THEN 'ack'
  WHEN event_type='step_view' AND step='Cadastro' THEN 'cad'
  WHEN event_type='step_view' AND step='Pagamento' THEN 'pay'
  WHEN event_type='step_view' AND step IN ('Agendamento','Agendamento gratuito') THEN 'agenda'
  WHEN event_type='self_reported_completion' THEN 'done'
  WHEN event_type IN ('help_click','confirm_help') THEN 'help'
  WHEN event_type='resume_continue' THEN 'resume' END`;
const STAGES = ['open', 'chose', 'ack', 'cad', 'pay', 'agenda', 'done', 'help', 'resume'];

const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2); };
const ts = v => Date.parse(String(v || '').replace(' ', 'T') + 'Z');
const SAMPLE_LIMIT = 30000;

export async function computeStats(db, slug, days) {
  const f = days === 'all' ? '' : " AND created_at>=datetime('now','-" + Number(days) + " days')";
  const ft = days === 'all' ? '' : " AND t.created_at>=datetime('now','-" + Number(days) + " days')";
  const all = async q => (await q.all()).results || [];
  const [tot, per, views, brs, vrs, rows] = await Promise.all([
    all(db.prepare(`SELECT stage,COUNT(DISTINCT session_id) u FROM (SELECT session_id,${STAGE_SQL} stage FROM useful_link_tracking_v2 WHERE link_slug=?${f}) WHERE stage IS NOT NULL GROUP BY stage`).bind(slug)),
    all(db.prepare(`SELECT stage,period,COUNT(DISTINCT session_id) u FROM (SELECT session_id,period,${STAGE_SQL} stage FROM useful_link_tracking_v2 WHERE link_slug=?${f}) WHERE stage IS NOT NULL AND period IN ('morning','evening') GROUP BY stage,period`).bind(slug)),
    all(db.prepare(`SELECT COUNT(*) n FROM useful_link_tracking_v2 WHERE link_slug=? AND event_type='page_view'${f}`).bind(slug)),
    all(db.prepare(`SELECT COALESCE(i.browser,'unknown') k,COUNT(DISTINCT CASE WHEN t.event_type='page_view' THEN t.session_id END) sessions,COUNT(DISTINCT CASE WHEN t.event_type='self_reported_completion' THEN t.session_id END) completed FROM useful_link_tracking_v2 t LEFT JOIN useful_link_sessions i ON i.link_slug=t.link_slug AND i.session_id=t.session_id WHERE t.link_slug=?${ft} GROUP BY k`).bind(slug)).catch(() => []),
    all(db.prepare(`SELECT COALESCE(i.variant,'v1') k,COUNT(DISTINCT CASE WHEN t.event_type='page_view' THEN t.session_id END) sessions,COUNT(DISTINCT CASE WHEN t.event_type='self_reported_completion' THEN t.session_id END) completed FROM useful_link_tracking_v2 t LEFT JOIN useful_link_sessions i ON i.link_slug=t.link_slug AND i.session_id=t.session_id WHERE t.link_slug=?${ft} GROUP BY k`).bind(slug)).catch(() => []),
    all(db.prepare(`SELECT session_id,event_type,step,created_at FROM useful_link_tracking_v2 WHERE link_slug=? AND event_type IN ('page_view','rules_acknowledged','step_view','self_reported_step')${f} ORDER BY session_id,id LIMIT ${SAMPLE_LIMIT}`).bind(slug))
  ]);
  const funnel = Object.fromEntries(STAGES.map(s => [s, { t: 0, m: 0, e: 0 }]));
  for (const r of tot) if (funnel[r.stage]) funnel[r.stage].t = r.u;
  for (const r of per) if (funnel[r.stage]) funnel[r.stage][r.period === 'morning' ? 'm' : 'e'] = r.u;

  // Median time per step: first view of the step to the first "done" tap of the same step, per session.
  const bySession = new Map();
  for (const r of rows) { if (!bySession.has(r.session_id)) bySession.set(r.session_id, []); bySession.get(r.session_id).push(r); }
  const d = { start: [], cad: [], pay: [], agenda: [] };
  const names = { cad: ['Cadastro'], pay: ['Pagamento'], agenda: ['Agendamento', 'Agendamento gratuito'] };
  for (const list of bySession.values()) {
    const first = (type, step) => { const x = list.find(r => r.event_type === type && (step === undefined || step.includes(r.step))); return x ? ts(x.created_at) : NaN; };
    const push = (k, a, b) => { const v = (b - a) / 1000; if (Number.isFinite(v) && v >= 0 && v < 6 * 3600) d[k].push(v); };
    push('start', first('page_view'), first('rules_acknowledged'));
    for (const k of ['cad', 'pay', 'agenda']) push(k, first('step_view', names[k]), first('self_reported_step', names[k]));
  }
  const pageViews = views[0]?.n || 0;
  return {
    page_views: pageViews, unique_sessions: funnel.open.t,
    cadastro_clicks: funnel.cad.t, pagamento_clicks: funnel.pay.t, agendamento_clicks: funnel.agenda.t,
    self_reported_completions: funnel.done.t, confirmed_conversions: null, flow_completions: funnel.done.t,
    period_choices: funnel.chose.t, help_sessions: funnel.help.t, resume_sessions: funnel.resume.t,
    funnel, browsers: brs.filter(x => x.sessions > 0), versions: vrs.filter(x => x.sessions > 0),
    medians: { start: median(d.start), cad: median(d.cad), pay: median(d.pay), agenda: median(d.agenda) },
    sample_truncated: rows.length >= SAMPLE_LIMIT
  };
}

// Settings that are not URLs. Returns {error} or the cleaned values; fields left out are kept as they were.
export function cleanExtras(b, current = {}) {
  const out = {};
  if (b.whatsapp !== undefined) {
    let n = String(b.whatsapp).replace(/\D/g, '');
    if (n && (n.length === 10 || n.length === 11)) n = '55' + n;
    if (!/^\d{12,15}$/.test(n) && n) return { error: 'invalid whatsapp' };
    out.whatsapp = n || DEFAULT_WHATSAPP;
  }
  if (b.done_note !== undefined) {
    const t = String(b.done_note).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
    if (t.length > 500) return { error: 'done_note too long' };
    out.done_note = t;
  }
  return { ...EXTRA_DEFAULTS, ...current, ...out };
}
export const readExtras = cfg => {
  const c = cfg || {};
  return { whatsapp: /^\d{12,15}$/.test(String(c.whatsapp || '')) ? String(c.whatsapp) : DEFAULT_WHATSAPP, done_note: typeof c.done_note === 'string' ? c.done_note.slice(0, 500) : '' };
};
