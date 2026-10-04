// Public EVO class attendance. No credentials or requests in this parser.
export function attendanceTime(value) {
  const m = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!m) throw new Error('HORARIO_EVO_INVALIDO');
  let h = Number(m[1]);
  if (Number(m[2]) > 59 || (m[3] ? h < 1 || h > 12 : h > 23)) throw new Error('HORARIO_EVO_INVALIDO');
  if (m[3]) h = h % 12 + (m[3].toUpperCase() === 'PM' ? 12 : 0);
  return String(h).padStart(2, '0') + ':' + m[2];
}

export function parseClassAttendance(payload, expectedSession) {
  const s = Array.isArray(payload) && payload.length === 1 ? payload[0] : payload;
  if (!s || Array.isArray(s) || String(s.idActivitySession) !== String(expectedSession)) throw new Error('SESSAO_EVO_DIVERGENTE');
  if (s.status !== 6) throw new Error('AULA_NAO_FINALIZADA');
  if (!Array.isArray(s.enrollments)) throw new Error('PARTICIPANTES_EVO_AUSENTES');
  const date = String(s.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('DATA_EVO_INVALIDA');
  const startTime = attendanceTime(s.startTime), seen = new Set(), rows = [];
  for (const e of s.enrollments) {
    if (![0, 1, 2].includes(e.status)) throw new Error('STATUS_PRESENCA_DESCONHECIDO');
    if (e.removed === true || !Number.isSafeInteger(e.idMember) || e.idMember <= 0) continue;
    const id = String(e.idMember);
    if (seen.has(id)) throw new Error('PARTICIPANTE_DUPLICADO');
    seen.add(id);
    if (e.status === 0) rows.push({id, date, startTime, activity: String(s.name || '').slice(0, 200), idActivitySession: String(expectedSession), presenca: true, isFinalized: true});
  }
  return {sessionId: String(expectedSession), date, participants: seen.size, rows};
}
