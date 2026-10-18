import {rankingBase as bike} from './admin-bike-ranking.mjs';
import {rankingBase as gym} from './admin-gym-ranking.mjs';
export const milestones=[['Primeiro Passo',12],['Determinação',24],['Constância',50],['Superação',100],['Dedicação',125],['Energia POP',150],['Foco',175],['Evolução',200],['Disciplina',225],['Resistência',250],['Conquista',275],['Excelência',300],['Inspiração',325],['Persistência',350],['Potência',375],['Elite POP',400],['Ícone POP',450],['Referência',500],['Lenda Viva',600],['Lenda POP',750]];
export async function hallConquests(db,unit,date=null){
 const base=unit==='gym'?gym:bike;
 const rows=(await db.prepare(base+'SELECT evo_member_id,name,stars,legacy FROM totals WHERE stars>=0 AND stars<750').all()).results||[];
 const upcoming=rows.map(r=>{const next=milestones.find(m=>Number(r.stars)<m[1]);return next?{name:r.name,stars:Number(r.stars),medal:next[0],target:next[1],remaining:next[1]-Number(r.stars)}:null}).filter(x=>x&&x.remaining<=10).sort((a,b)=>a.remaining-b.remaining||b.stars-a.stars).slice(0,10);
 const source=unit==='gym'?"SELECT mp.canonical evo_member_id,a.attendance_date date,COALESCE(NULLIF(TRIM(a.id_activity_session),''),a.attendance_key) event_key FROM evo_member_attendance a JOIN mapped mp ON mp.evo_member_id=CAST(a.evo_member_id AS TEXT) WHERE a.unit='gym'":"SELECT CAST(a.evo_member_id AS TEXT) evo_member_id,a.attendance_date date,a.attendance_key event_key FROM evo_member_attendance a WHERE a.unit='bike'";
 const values=milestones.map((m,i)=>'('+i+','+m[1]+')').join(',');
 const sql=base+', milestones(idx,target) AS (VALUES '+values+'), events AS ('+source+'), unique_events AS (SELECT evo_member_id,event_key,MIN(date) date FROM events WHERE date GLOB \'????-??-??\' GROUP BY evo_member_id,event_key), days AS (SELECT evo_member_id,date,COUNT(*) qty FROM unique_events GROUP BY evo_member_id,date), progress AS (SELECT d.evo_member_id,d.date,d.qty,t.name,t.legacy,SUM(d.qty) OVER(PARTITION BY d.evo_member_id ORDER BY d.date) cumulative FROM days d JOIN totals t ON t.evo_member_id=d.evo_member_id), crossed AS (SELECT p.name,p.date,m.idx,m.target FROM progress p JOIN milestones m ON p.legacy+p.cumulative>=m.target AND p.legacy+p.cumulative-p.qty<m.target) SELECT name,date,idx,target FROM crossed ORDER BY date DESC,idx DESC LIMIT 10';
 const recent=(await db.prepare(sql).all()).results||[];
 let daily=[],classes=[];
 if(date&&/^\d{4}-\d{2}-\d{2}$/.test(date)){
   const dailySql=sql.replace("SELECT name,date,idx,target FROM crossed ORDER BY date DESC,idx DESC LIMIT 10","SELECT name,date,idx,target,evo_member_id FROM crossed WHERE date=? ORDER BY idx DESC,name LIMIT 150");
   // Attach the milestone to the exact attendance session where the threshold was crossed.
   const eventSql=base+', milestones(idx,target) AS (VALUES '+values+'), events AS ('+source.replace('a.attendance_date date,','a.attendance_date date,a.id_activity_session session_id,').replace('a.attendance_key event_key','a.attendance_key event_key')+'), unique_events AS (SELECT evo_member_id,event_key,MIN(date) date,MIN(session_id) session_id FROM events WHERE date GLOB \'????-??-??\' GROUP BY evo_member_id,event_key), numbered AS (SELECT e.*,t.name,t.legacy,ROW_NUMBER() OVER(PARTITION BY e.evo_member_id ORDER BY e.date,e.event_key) rn FROM unique_events e JOIN totals t ON t.evo_member_id=e.evo_member_id), crossed AS (SELECT n.evo_member_id,n.name,n.date,n.session_id,m.idx,m.target FROM numbered n JOIN milestones m ON n.legacy+n.rn=m.target) SELECT c.name,c.date,c.session_id,c.idx,c.target,s.start_time,s.activity_name FROM crossed c LEFT JOIN evo_attendance_sessions s ON s.unit=? AND s.id_activity_session=c.session_id WHERE c.date=? ORDER BY c.idx DESC,c.name LIMIT 150';
   const found=(await db.prepare(eventSql).bind(unit,date).all()).results||[];
   daily=found.map(r=>({name:r.name,date:r.date,type:"milestone",medal:milestones[r.idx][0],target:r.target,sessionId:r.session_id,startTime:r.start_time,activity:r.activity_name,source:"evo_member_attendance"}));
   classes=(await db.prepare("SELECT id_activity_session id,start_time time,activity_name activity FROM evo_attendance_sessions WHERE unit=? AND activity_date=? ORDER BY start_time").bind(unit,date).all()).results||[];
 }

 // Pending awards remain eligible until their first confirmed TV display, regardless of elapsed days.
 let pending=[];
 if(date&&/^\d{4}-\d{2}-\d{2}$/.test(date)){
   const pendingSql=sql.replace(
    "SELECT name,date,idx,target FROM crossed ORDER BY date DESC,idx DESC LIMIT 10",
    "SELECT p.evo_member_id,p.name,p.date earned_date,p.idx,p.target,r.session_id,r.start_time FROM crossed p JOIN checkin_reservation_snapshots r ON r.unit=? AND r.activity_date=? AND r.evo_member_id=p.evo_member_id AND r.removed=0 AND r.activity_date>p.date LEFT JOIN conquest_tv_display shown ON shown.unit=? AND shown.evo_member_id=p.evo_member_id AND shown.target=p.target AND shown.earned_date=p.date WHERE shown.evo_member_id IS NULL ORDER BY r.start_time,p.target DESC LIMIT 100"
   );
   const found=(await db.prepare(pendingSql).bind(unit,date,unit).all()).results||[];
   pending=found.map(x=>({evoMemberId:x.evo_member_id,name:x.name,earnedDate:x.earned_date,sessionId:x.session_id,startTime:x.start_time,target:x.target,medal:milestones[x.idx][0],type:"milestone"}));
 }

 return {ok:true,unit,daily,classes,pending,upcoming,recent:recent.map(r=>({name:r.name,date:r.date,medal:milestones[r.idx][0],target:r.target}))};
}
