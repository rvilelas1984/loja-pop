import {bikeStarProgress} from './bike-star-levels.mjs';

// Read-only ranking. Each attendance row is one class, including same-day classes.
export const rankingBase = `WITH people AS (
 SELECT em.evo_member_id, m.id,
 COALESCE(NULLIF(TRIM(COALESCE(m.first_name,'')||' '||COALESCE(m.last_name,'')),''),
 json_extract(em.personal_json,'$.name'),
 TRIM(COALESCE(json_extract(em.personal_json,'$.firstName'),'')||' '||COALESCE(json_extract(em.personal_json,'$.lastName'),'')),'Aluno') AS name,
 COALESCE(json_extract(em.personal_json,'$.document'),json_extract(em.personal_json,'$.cpf'),'') AS cpf,
 COALESCE(m.presencas_legadas_bike,0) AS legacy
 FROM evo_member_master em LEFT JOIN members m ON m.evo_member_id=CAST(em.evo_member_id AS INTEGER)
 WHERE em.unit='bike'
 UNION ALL
 SELECT CAST(m.evo_member_id AS TEXT),m.id,TRIM(COALESCE(m.first_name,'')||' '||COALESCE(m.last_name,'')),'',m.presencas_legadas_bike
 FROM members m WHERE m.evo_member_id IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM evo_member_master em WHERE em.unit='bike' AND em.evo_member_id=CAST(m.evo_member_id AS TEXT))
 AND (m.presencas_legadas_bike>0 OR EXISTS(SELECT 1 FROM evo_member_attendance a WHERE a.unit='bike' AND a.evo_member_id=CAST(m.evo_member_id AS TEXT)))
), attendance AS (
 SELECT ids.evo_member_id, MAX(CASE WHEN EXISTS(SELECT 1 FROM club_settings review WHERE review.key='attendance_baseline_review:bike:'||b.evo_member_id AND json_extract(review.value,'$.status')='pending') THEN 0 ELSE COALESCE(b.baseline_count,0) END+COALESCE(n.new_count,0),COALESCE(a.n,0)) actual FROM (SELECT evo_member_id FROM evo_member_attendance WHERE unit='bike' UNION SELECT evo_member_id FROM bike_evo_historical_baseline) ids LEFT JOIN (SELECT evo_member_id,COUNT(*) n FROM evo_member_attendance WHERE unit='bike' GROUP BY evo_member_id) a USING(evo_member_id) LEFT JOIN bike_evo_historical_baseline b USING(evo_member_id) LEFT JOIN (SELECT evo_member_id,COUNT(*) new_count FROM evo_member_attendance WHERE unit='bike' AND (attendance_date>'2026-10-19' OR (evo_member_id='1110063' AND attendance_date='2026-10-19')) GROUP BY evo_member_id) n USING(evo_member_id) GROUP BY ids.evo_member_id
), totals AS (
 SELECT p.*,COALESCE(a.actual,0) actual,COALESCE((SELECT CAST(json_extract(cs.value,'$.stars') AS INTEGER) FROM club_settings cs WHERE cs.key='manual_stars:bike:'||p.evo_member_id),p.legacy+COALESCE(a.actual,0)) stars FROM people p LEFT JOIN attendance a USING(evo_member_id)
), ranked AS (
 SELECT *,RANK() OVER(ORDER BY stars DESC) position,
 CASE WHEN stars<12 THEN 12 WHEN stars<24 THEN 24 WHEN stars<50 THEN 50 ELSE (CAST(stars/50 AS INTEGER)+1)*50 END next
 FROM totals
) `;

export function rankingQueryOptions(search){
 const integer=(v,f)=>v!==null&&v!==''&&Number.isFinite(Number(v))?Math.max(0,Math.floor(Number(v))):f;
 const page=Math.max(1,Math.min(100000,integer(search.get('page'),1)));
 const min=integer(search.get('min'),0),max=Math.max(min,integer(search.get('max'),Number.MAX_SAFE_INTEGER));
 const q=(search.get('q')||'').trim().slice(0,100),digits=q.replace(/\D/g,'');
 const order=({asc:'stars ASC,name COLLATE NOCASE ASC',desc:'stars DESC,name COLLATE NOCASE ASC',az:'name COLLATE NOCASE ASC',za:'name COLLATE NOCASE DESC'})[search.get('order')]||'stars DESC,name COLLATE NOCASE ASC';
 const where=` WHERE stars BETWEEN ? AND ? AND (?='' OR name LIKE ? OR evo_member_id LIKE ? OR CAST(id AS TEXT)=? OR (?<>'' AND REPLACE(REPLACE(REPLACE(cpf,'.',''),'-',''),' ','') LIKE ?))`;
 return {page,order,where,params:[min,max,q,'%'+q+'%','%'+q+'%',q,digits,'%'+digits+'%']};
}

export async function adminBikeRanking(db,search){
 const o=rankingQueryOptions(search);
 const select='evo_member_id,id,name,legacy,actual,stars,position,next';
 const results=await db.batch([
 db.prepare(rankingBase+`SELECT COUNT(*) total,COALESCE(SUM(stars),0) stars,COALESCE(SUM(legacy),0) legacy,COALESCE(SUM(actual),0) actual,COALESCE(SUM(stars>0),0) withStars,COALESCE(SUM(stars>0 AND next-stars<=5),0) near FROM ranked`+o.where).bind(...o.params),
 db.prepare(rankingBase+`SELECT ${select} FROM ranked`+o.where+` ORDER BY ${o.order},evo_member_id ASC LIMIT 10 OFFSET ?`).bind(...o.params,(o.page-1)*10),
 db.prepare(rankingBase+`SELECT ${select} FROM ranked`+o.where+` AND stars>0 AND next-stars<=5 ORDER BY next-stars ASC,stars DESC,evo_member_id ASC LIMIT 10`).bind(...o.params)
 ]);
 const summary=results[0].results[0];
 const decorate=x=>({...x,progress:bikeStarProgress(x.stars),remaining:x.next-x.stars});
 return {ok:true,unit:'bike',page:o.page,total:summary.total,summary,rows:results[1].results.map(decorate),upcoming:results[2].results.map(decorate),evoRequestsMade:0};
}
