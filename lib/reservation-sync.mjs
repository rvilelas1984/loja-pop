// Reservations are independent of attendance: never award stars or mark attendance here.
export const reservationKind = 'reservation';
const flag = v => v === true || v === 1 || v === 'true';
export function reservationTime(value) {
  const m = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!m) throw Error('HORARIO_RESERVA_INVALIDO');
  let h = Number(m[1]);
  if (m[3]) { if (h < 1 || h > 12) throw Error('HORARIO_RESERVA_INVALIDO'); h = h % 12 + (m[3].toUpperCase() === 'PM' ? 12 : 0); }
  if (h > 23 || Number(m[2]) > 59) throw Error('HORARIO_RESERVA_INVALIDO');
  return String(h).padStart(2, '0') + ':' + m[2];
}
export function reservationParticipants(detail) {
  for (const key of ['participantes', 'participants', 'enrollments', 'reservas']) {
    if (Array.isArray(detail?.[key])) return detail[key];
  }
  // A missing/malformed list is not evidence of an empty class.
  throw Error('LISTA_RESERVAS_AUSENTE');
}
export function normalizeReservations(rows, unit) {
  if (!Array.isArray(rows) || rows.length > 200) throw Error('LISTA_RESERVAS_INVALIDA');
  const result = new Map();
  for (const row of rows) {
    const id = String(row.idMember ?? row.idCliente ?? '');
    const removed = flag(row.removed) || flag(row.flRemovido);
    const status = String(row.status ?? '').toLowerCase().trim();
    if (removed || ['cancelled', 'canceled', 'cancelado', 'cancelada'].includes(status)) continue;
    const slot = Number(row.slotNumber ?? row.numeroVaga ?? 0);
    if (!id && !row.name && !row.nome) continue; // An empty place, not a reservation.
    if (!/^\d+$/.test(id)) throw Error('ALUNO_RESERVA_SEM_ID');
    if (unit === 'bike' && (!Number.isInteger(slot) || slot < 1 || slot > 200)) throw Error('BIKE_RESERVA_INVALIDA');
    // Unnumbered Gym places use an internal negative key, never a fabricated visible position.
    const key = Number.isInteger(slot) && slot > 0 && slot <= 200 ? slot : -Number(id);
    if (!Number.isSafeInteger(key) || !key) throw Error('POSICAO_RESERVA_INVALIDA');
    if (result.has(key) && result.get(key).id !== id) throw Error('POSICAO_RESERVA_DUPLICADA');
    result.set(key, { slot: key, id, name: String(row.name ?? row.nome ?? '').slice(0, 160), status,
      checked: flag(row.checkedIn) || flag(row.flCheckin) ? 1 : 0 });
  }
  return [...result.values()];
}
export async function ensureReservationSchema(db) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS checkin_reservation_snapshots(unit TEXT NOT NULL,session_id TEXT NOT NULL,activity_date TEXT NOT NULL,start_time TEXT NOT NULL,activity_name TEXT,slot_number INTEGER NOT NULL,evo_member_id TEXT,member_name TEXT,removed INTEGER NOT NULL DEFAULT 0,status TEXT,checked_in INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,session_id,slot_number))"),
    db.prepare("CREATE TABLE IF NOT EXISTS checkin_snapshot_versions(unit TEXT NOT NULL,session_id TEXT NOT NULL,observed_at INTEGER NOT NULL,PRIMARY KEY(unit,session_id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS evo_reservation_jobs(unit TEXT PRIMARY KEY,run_key TEXT NOT NULL,state TEXT NOT NULL,payload TEXT NOT NULL,lease_until INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS evo_sync_schedule_runs(unit TEXT NOT NULL,kind TEXT NOT NULL,scheduled_minute TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',detail TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,kind,scheduled_minute))")
  ]);
}
export async function saveReservationSnapshot(db, { unit, sessionId, date, time, name, rows, observedAt = Date.now() }) {
  if (!['bike', 'gym'].includes(unit) || !/^\d+$/.test(String(sessionId)) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error('SESSAO_RESERVA_INVALIDA');
  const start = reservationTime(time), valid = normalizeReservations(rows, unit), stamp = Number(observedAt);
  if (!Number.isSafeInteger(stamp) || stamp <= 0 || stamp > Date.now() + 60000) throw Error('DATA_SNAPSHOT_INVALIDA');
  const condition = 'EXISTS(SELECT 1 FROM checkin_snapshot_versions WHERE unit=? AND session_id=? AND observed_at=?)';
  // Atomic replacement, including a confirmed empty list. An older response cannot overwrite a newer one.
  const statements = [
    db.prepare('INSERT INTO checkin_snapshot_versions(unit,session_id,observed_at) VALUES(?,?,?) ON CONFLICT(unit,session_id) DO UPDATE SET observed_at=excluded.observed_at WHERE excluded.observed_at>=checkin_snapshot_versions.observed_at').bind(unit, String(sessionId), stamp),
    db.prepare('DELETE FROM checkin_reservation_snapshots WHERE unit=? AND session_id=? AND ' + condition).bind(unit, String(sessionId), unit, String(sessionId), stamp)
  ];
  for (const row of valid) statements.push(db.prepare('INSERT INTO checkin_reservation_snapshots(unit,session_id,activity_date,start_time,activity_name,slot_number,evo_member_id,member_name,removed,status,checked_in) SELECT ?,?,?,?,?,?,?,?,0,?,? WHERE ' + condition).bind(unit, String(sessionId), date, start, String(name || '').slice(0,160), row.slot, row.id, row.name, row.status, row.checked, unit, String(sessionId), stamp));
  const result = await db.batch(statements);
  return { saved: result[0].meta?.changes ? valid.length : 0, superseded: !result[0].meta?.changes };
}
const localDate = now => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year:'numeric',month:'2-digit',day:'2-digit' }).format(now);
export function reservationDates(now = new Date()) {
  const today = localDate(now);
  return [today, new Date(Date.parse(today+'T12:00:00-03:00')+86400000).toISOString().slice(0,10)];
}
export async function startReservationSync(db, unit, runKey, manual = false, now = new Date()) {
  await ensureReservationSchema(db);
  const existing = await db.prepare("SELECT run_key FROM evo_reservation_jobs WHERE unit=? AND state='pending'").bind(unit).first();
  if (existing) return { ok:true, started:false, runKey:existing.run_key, status:'pending' };
  const seen = await db.prepare("SELECT status FROM evo_sync_schedule_runs WHERE unit=? AND kind='reservation' AND scheduled_minute=?").bind(unit,runKey).first();
  if (seen) return {ok:true,started:false,runKey,status:seen.status};
  const dates = reservationDates(now);
  const payload = { manual, startedAt:now.toISOString(), dates, queue:dates.map(date=>({type:'grade',date})), cursor:0, requests:0, classesFound:0, classesSaved:0, reservationsSaved:0, failures:[] };
  const claim = await db.prepare("INSERT INTO evo_reservation_jobs(unit,run_key,state,payload,lease_until) VALUES(?,?,'pending',?,0) ON CONFLICT(unit) DO UPDATE SET run_key=excluded.run_key,state='pending',payload=excluded.payload,lease_until=0,updated_at=CURRENT_TIMESTAMP WHERE evo_reservation_jobs.state<>'pending'").bind(unit,runKey,JSON.stringify(payload)).run();
  if (!claim.meta?.changes) return {ok:true,started:false,status:'pending'};
  await db.prepare("INSERT OR IGNORE INTO evo_sync_schedule_runs(unit,kind,scheduled_minute,status,detail) VALUES(?,'reservation',?,'pending',?)").bind(unit,runKey,JSON.stringify(payload)).run();
  return {ok:true,started:true,runKey,status:'pending'};
}
export async function processReservationSync(env, unit, getConfig, steps = 3) {
  const db = env.DB, now = Date.now();
  const lock = await db.prepare("UPDATE evo_reservation_jobs SET lease_until=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND state='pending' AND lease_until<? RETURNING run_key,payload").bind(now+90000,unit,now).first();
  if (!lock) return;
  const p = JSON.parse(lock.payload), runKey=lock.run_key;
  let state='pending';
  const persist = async () => {
    const summary = {...p}; delete summary.queue;
    await db.batch([
      db.prepare('UPDATE evo_reservation_jobs SET state=?,payload=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND run_key=?').bind(state,JSON.stringify(p),unit,runKey),
      db.prepare("UPDATE evo_sync_schedule_runs SET status=?,detail=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND kind='reservation' AND scheduled_minute=?").bind(state,JSON.stringify(summary),unit,runKey)
    ]);
  };
  try {
    const cfg = await getConfig(env,unit);
    for (let n=0; n<steps && p.cursor<p.queue.length; n++) {
      const task=p.queue[p.cursor], observedAt=Date.now();
      try {
        if (p.requests >= 42) throw Error('LIMITE_42_REQUISICOES_EXECUCAO');
        const path=task.type==='grade'?'/api/v1/activities/schedule?'+new URLSearchParams({date:task.date,showFullWeek:'false',onlyAvailables:'false',take:'100'}):'/api/v1/activities/schedule/detail?idActivitySession='+encodeURIComponent(task.id);
        p.requests++; await persist(); // Count attempted calls, including network failures.
        let response;
        try {
          response=await fetch('https://evo-integracao-api.w12app.com.br'+path,{headers:{Authorization:'Basic '+btoa(cfg.dns+':'+cfg.token),Accept:'application/json'},signal:AbortSignal.timeout(12000)});
        } finally {
          await db.prepare("INSERT INTO evo_request_log(unit,purpose,method,endpoint,status,ok) VALUES(?,?,'GET',?,?,?)").bind(unit,task.type==='grade'?'reservation_schedule':'reservation_detail',path.split('?')[0],response?.status||0,response?.ok?1:0).run();
        }
        if (!response.ok) throw Error('EVO_HTTP_'+response.status);
        const raw=await response.json();
        if (task.type==='grade') {
          const list=Array.isArray(raw)?raw:(raw?.items??raw?.data??raw?.lista??raw?.list);
          if (!Array.isArray(list) || list.length>=100) throw Error('GRADE_INVALIDA_OU_INCOMPLETA');
          const found=[];
          for (const s of list) {
            const date=String(s.activityDate||s.date||task.date).slice(0,10);
            if (date!==task.date) continue;
            const name=String(s.name||s.activityName||s.title||'');
            if (unit==='bike'&&!/bike/i.test(name)) continue;
            const time=reservationTime(s.startTime||s.startHour||s.hour);
            if (Date.parse(date+'T'+time+':00-03:00')<Date.now()) continue;
            const id=String(s.idActivitySession??s.idAtividadeSessao??s.idActivitieSession??'');
            if (!/^\d+$/.test(id)) throw Error('GRADE_SEM_ID_SESSAO');
            if (!p.queue.some(t=>t.id===id)&&!found.some(t=>t.id===id)) found.push({type:'detail',date,time,id,name});
          }
          p.queue.push(...found); p.classesFound+=found.length;
        } else {
          const detail=Array.isArray(raw)?raw[0]:raw;
          const id=detail?.idActivitySession??detail?.idAtividadeSessao??detail?.idActivitieSession;
          if (id!=null&&String(id)!==task.id) throw Error('SESSAO_DIVERGENTE');
          const result=await saveReservationSnapshot(db,{unit,sessionId:task.id,date:task.date,time:detail?.startTime||task.time,name:detail?.name||task.name,rows:reservationParticipants(detail),observedAt});
          p.classesSaved++; p.reservationsSaved+=result.saved;
        }
      } catch(error) {
        p.failures.push({date:task.date,sessionId:task.id||null,time:task.time||null,error:String(error.message||error).slice(0,160)});
        if (/EVO_HTTP_(401|403|429)|LIMITE_42/.test(String(error.message))) { p.cursor=p.queue.length; break; }
      }
      p.cursor++; await persist();
    }
    if (p.cursor>=p.queue.length) { state=p.failures.length?'failed':'done'; p.finishedAt=new Date().toISOString(); }
  } catch(error) {
    state='failed'; p.failures.push({error:String(error.message||error).slice(0,160)}); p.finishedAt=new Date().toISOString();
  } finally {
    await persist();
    await db.prepare('UPDATE evo_reservation_jobs SET lease_until=0 WHERE unit=? AND run_key=?').bind(unit,runKey).run();
  }
}
