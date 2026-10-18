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
 let daily=[];
 if(date&&/^\\d{4}-\\d{2}-\\d{2}$/.test(date)){
   // Evaluate milestones against the complete attendance history; filter only the final events.
   const dailySql=sql.replace("SELECT name,date,idx,target FROM crossed ORDER BY date DESC,idx DESC LIMIT 10","SELECT name,date,idx,target FROM crossed WHERE date=? ORDER BY idx DESC,name LIMIT 150");
   const found=(await db.prepare(dailySql).bind(date).all()).results||[];
   daily=found.map(r=>({name:r.name,date:r.date,type:"milestone",medal:milestones[r.idx][0],target:r.target,source:"evo_member_attendance"}));
 }

 return {ok:true,unit,daily,upcoming,recent:recent.map(r=>({name:r.name,date:r.date,medal:milestones[r.idx][0],target:r.target}))};
}
