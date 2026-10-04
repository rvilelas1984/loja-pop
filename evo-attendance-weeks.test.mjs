import assert from 'node:assert/strict';
import {attendanceWeekStarts} from './lib/evo-attendance-weeks.js';
import worker from './club-pop-worker.mjs';
import {DatabaseSync} from 'node:sqlite';
assert.equal(attendanceWeekStarts('2026-08','2026-09').at(-1),'2026-09-27');
assert.equal(attendanceWeekStarts('2026-08','2026-08').at(-1),'2026-08-30');
assert.throws(()=>attendanceWeekStarts('2026-13','2026-13'));
for(let y=2024;y<=2028;y++)for(let m=1;m<=12;m++){
 const month=y+'-'+String(m).padStart(2,'0'),weeks=attendanceWeekStarts(month,month);
 for(let day=1;day<=new Date(Date.UTC(y,m,0)).getUTCDate();day++){
  const t=Date.UTC(y,m-1,day);assert.equal(weeks.filter(s=>t>=Date.parse(s)&&t<Date.parse(s)+7*86400000).length,1);
 }
}
const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE evo_attendance_import_queue(unit TEXT,id_activity_session TEXT,activity_date TEXT,status TEXT,PRIMARY KEY(unit,id_activity_session)); INSERT INTO evo_attendance_import_queue VALUES('bike','1','2026-09-01','done');");
const env={DB:{prepare(sql){return {bind(...args){return {sql,args}}}},async batch(stm){db.exec('BEGIN');try{for(const s of stm)db.prepare(s.sql).run(...s.args);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}}};
let role='admin';globalThis.fetch=async()=>Response.json({role});
async function call(body,cookie='fixture'){return worker.fetch(new Request('https://test/admin/evo-attendance-import-queue',{method:'POST',headers:{'Content-Type':'application/json','x-clubpop-admin-cookie':cookie},body:JSON.stringify(body)}),env)}
const b={unit:'bike',sessions:[{id:'1',date:'2026-09-01'},{id:'19065958',date:'2026-09-28'}]};
assert.equal((await call(b,'')).status,401);role='student';assert.equal((await call(b)).status,401);role='admin';
assert.equal((await call({...b,unit:'gym'})).status,423);
assert.equal((await call({unit:'bike',sessions:[{id:'bad',date:'x'}]})).status,400);
assert.equal((await call(b)).status,200);assert.equal((await call(b)).status,200);
assert.equal(db.prepare('SELECT COUNT(*) n FROM evo_attendance_import_queue').get().n,2);
assert.equal(db.prepare("SELECT status FROM evo_attendance_import_queue WHERE id_activity_session='1'").get().status,'done');
console.log('PASS: 60 months fully covered; leap years; month-end weeks; admin-only; Gym blocked; queue idempotency; completed sessions preserved.');
