// Bike Pop daily sync also stores the official classes of this week and the next one (2 EVO requests, once a day),
// so Pop Music themed classes can be linked to future official classes. Done classes are never overwritten.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
const src=fs.readFileSync(new URL('../club-pop-worker.mjs',import.meta.url),'utf8');
const fn=name=>{const i=src.indexOf(name);const j=src.indexOf('\nasync function ',i+10),k=src.indexOf('\nfunction ',i+10);return src.slice(i,Math.min(...[j,k].filter(x=>x>0)))};
const sql=new DatabaseSync(':memory:');
sql.exec(`CREATE TABLE evo_attendance_sessions(unit TEXT,id_activity_session TEXT,activity_date TEXT,start_time TEXT,activity_name TEXT,status TEXT,attendance_count INTEGER,instructor_name TEXT,synced_at TEXT,PRIMARY KEY(unit,id_activity_session));
CREATE TABLE evo_request_log(unit TEXT,purpose TEXT,method TEXT,endpoint TEXT,status INTEGER,ok INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE evo_sync_schedules(unit TEXT,kind TEXT,times_json TEXT);
INSERT INTO evo_attendance_sessions VALUES('bike','900','2026-12-03','07:00','Bike','done',18,'Douglas',NULL);`);
const stmt=(t,a=[])=>({bind:(...v)=>stmt(t,v),first:async()=>sql.prepare(t).get(...a)||null,all:async()=>({results:sql.prepare(t).all(...a)}),run:async()=>{const r=sql.prepare(t).run(...a);return {meta:{changes:r.changes}}}});
const DB={prepare:t=>stmt(t),batch:async l=>{for(const s of l)await s.run()}};
const calls=[];
const week=(ref)=>ref==='2026-12-01'?[{idActivitySession:901,activityDate:'2026-12-02T00:00:00',startTime:'07:00',name:'Bike',instructor:'Douglas',status:1},
 {idActivitySession:900,activityDate:'2026-12-03T00:00:00',startTime:'07:00',name:'Bike',instructor:'Douglas',status:1},{idActivitySession:902,activityDate:'2026-12-01T00:00:00',startTime:'08:00',name:'Bike',instructor:'Will',status:1},
 {idActivitySession:903,activityDate:'2026-12-04T00:00:00',startTime:'7:30 PM',name:'Bike Night',instructor:'Robinho',status:1},{idActivitySession:904,activityDate:'2026-12-05T00:00:00',startTime:'09:00',name:'Sem professor',status:1}]
 :[{idActivitySession:910,activityDate:'2026-12-09T00:00:00',startTime:'18:00',name:'Bike',instructor:'Jane Araujo',status:1}];
const fetch=async url=>{const u=new URL(url);calls.push(u.searchParams.get('showFullWeek')+':'+u.searchParams.get('date'));
 const body=u.pathname.endsWith('/schedule')?(u.searchParams.get('showFullWeek')==='true'?week(u.searchParams.get('date')):[]):[];return new Response(JSON.stringify(body),{status:200})};
const ctx={fetch,Response,URL,Intl,Date,JSON,Math,Number,String,Array,Map,Set,Promise,console:{error(){},log(){}},btoa:s=>Buffer.from(s).toString('base64'),encodeURIComponent,
 getEvoConfig:async()=>({dns:'d',token:'t'}),processReservationSync:async()=>{}};
vm.createContext(ctx);
vm.runInContext([fn('function attendanceInstructorName'),fn('function scheduledWeekday')||'',fn('function scheduledDaysAllowed'),fn('async function loadScheduledWeekdays'),fn('async function runScheduledAttendanceSync')].join('\n')+';this.run=runScheduledAttendanceSync',ctx);
await ctx.run({DB},'bike','k1','2026-12-01');
assert.deepEqual(calls,['false:2026-12-01','true:2026-12-01','true:2026-12-08'],'daily grade + 2 week requests');
const rows=sql.prepare("SELECT id_activity_session id,activity_date d,start_time t,instructor_name p,status s FROM evo_attendance_sessions ORDER BY id").all().map(r=>({...r}));
assert.deepEqual(rows,[{id:'900',d:'2026-12-03',t:'07:00',p:'Douglas',s:'done'},{id:'901',d:'2026-12-02',t:'07:00',p:'Douglas',s:'scheduled'},{id:'903',d:'2026-12-04',t:'19:30',p:'Robinho',s:'scheduled'},{id:'910',d:'2026-12-09',t:'18:00',p:'Jane Araujo',s:'scheduled'}],
 'future days only, done class untouched, no class without teacher');
calls.length=0;await ctx.run({DB},'bike','k2','2026-12-01');assert.deepEqual(calls,['false:2026-12-01'],'once a day');
calls.length=0;await ctx.run({DB},'gym','k3','2026-12-01');assert.deepEqual(calls,['false:2026-12-01'],'Bike Pop only');
assert.equal(sql.prepare("SELECT COUNT(*) n FROM evo_request_log WHERE purpose='future_weeks'").get().n,2);
console.log('PASS EVO future weeks: 2 requests a day for Bike Pop, future classes stored, done classes kept');
