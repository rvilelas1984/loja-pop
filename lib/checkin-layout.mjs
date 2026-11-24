// Check-in room layout per EVO activity (rows and place shape), shared by the check-in screen,
// the TV (mirror) and Configurações. The shape used to live only in the admin's browser; it is now
// stored with the rows so every screen shows the same room.
export const LAYOUT_SHAPES = ['vertical', 'horizontal', 'circle'];
export const layoutShape = v => LAYOUT_SHAPES.includes(String(v || '')) ? String(v) : '';

const schemaReady = new WeakMap();
// Adds the shape column and the session → activity link once per database binding; safe to call on every request.
export function ensureLayoutSchema(db) {
  if (!schemaReady.has(db)) schemaReady.set(db, (async () => {
    const cols = (await db.prepare('PRAGMA table_info(checkin_layouts)').all()).results || [];
    if (cols.length && !cols.some(c => c.name === 'shape')) {
      try { await db.prepare("ALTER TABLE checkin_layouts ADD COLUMN shape TEXT NOT NULL DEFAULT ''").run(); }
      catch (e) { if (!/duplicate column/i.test(String(e.message || e))) throw e; }
    }
    await db.prepare('CREATE TABLE IF NOT EXISTS checkin_session_activity(unit TEXT NOT NULL,session_id TEXT NOT NULL,activity_id TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,session_id))').run();
  })().catch(e => { schemaReady.delete(db); throw e; }));
  return schemaReady.get(db);
}

// Lowercase, no accents, no punctuation, single spaces: "JUMP " and "Jump" match.
export function layoutName(v) {
  return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const toLayout = x => x ? { activityId: x.activityId, activityName: x.activityName, capacity: Number(x.capacity),
  rows: JSON.parse(x.rowsJson || '[]'), shape: layoutShape(x.shape) } : null;

// Activity id first (exact). Then the name: exact, then normalized, then the longest layout name
// contained in the class name ("Jump" for "Jump Pop 19h"). Never guesses between two equal matches.
export async function findLayout(db, unit, { activityId = '', activityName = '' } = {}) {
  await ensureLayoutSchema(db);
  const cols = 'activity_id AS activityId,activity_name AS activityName,capacity,rows_json AS rowsJson,shape';
  if (activityId) {
    const x = await db.prepare('SELECT ' + cols + ' FROM checkin_layouts WHERE unit=? AND activity_id=? LIMIT 1').bind(unit, String(activityId)).first();
    if (x) return toLayout(x);
  }
  const wanted = layoutName(activityName);
  if (!wanted) return null;
  const all = (await db.prepare('SELECT ' + cols + ' FROM checkin_layouts WHERE unit=?').bind(unit).all()).results || [];
  const same = all.filter(x => layoutName(x.activityName) === wanted);
  if (same.length === 1) return toLayout(same[0]);
  if (same.length > 1) return null;
  const inside = all.map(x => ({ x, n: layoutName(x.activityName) }))
    .filter(({ n }) => n && (` ${wanted} `).includes(` ${n} `))
    .sort((a, b) => b.n.length - a.n.length);
  if (inside.length && (inside.length === 1 || inside[0].n.length > inside[1].n.length)) return toLayout(inside[0].x);
  return null;
}

// Remember which EVO activity a class session belongs to, so the TV can find its layout by id.
export async function rememberSessionActivity(db, unit, sessionId, activityId) {
  const sid = String(sessionId || ''), aid = String(activityId ?? '').trim();
  if (!['bike', 'gym'].includes(unit) || !/^\d+$/.test(sid) || !/^\d{1,20}$/.test(aid)) return false;
  await ensureLayoutSchema(db);
  await db.prepare('INSERT INTO checkin_session_activity(unit,session_id,activity_id) VALUES(?,?,?) ON CONFLICT(unit,session_id) DO UPDATE SET activity_id=excluded.activity_id,updated_at=CURRENT_TIMESTAMP').bind(unit, sid, aid).run();
  return true;
}

export async function sessionActivity(db, unit, sessionId) {
  await ensureLayoutSchema(db);
  const r = await db.prepare('SELECT activity_id FROM checkin_session_activity WHERE unit=? AND session_id=?').bind(unit, String(sessionId)).first();
  return r ? String(r.activity_id) : '';
}

export const activityIdOf = d => d?.idActivity ?? d?.idActivitie ?? d?.idAtividade ?? '';
