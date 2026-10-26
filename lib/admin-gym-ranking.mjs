import {gymStarProgress} from './gym-star-levels.mjs';

// Read-only Gym ranking. Linked IDs share a lifetime total; distinct sessions
// on the same date count separately, duplicate copies of a session count once.
export const rankingBase = `WITH identity_candidates AS (
 SELECT CAST(m.evo_member_id AS TEXT) evo_member_id,
 COALESCE(NULLIF(m.gym_client_id,''),CAST(m.evo_member_id AS TEXT)) canonical,
 CASE WHEN NULLIF(m.gym_client_id,'') IS NOT NULL THEN 0 ELSE 1 END priority
 FROM members m WHERE m.evo_member_id IS NOT NULL
 UNION ALL
 SELECT CAST(m.gym_client_id AS TEXT),CAST(m.gym_client_id AS TEXT),2
 FROM members m WHERE NULLIF(m.gym_client_id,'') IS NOT NULL
 UNION ALL
 SELECT CAST(em.evo_member_id AS TEXT),CAST(em.evo_member_id AS TEXT),3
 FROM evo_member_master em WHERE em.unit='gym'
 UNION ALL
 SELECT CAST(a.evo_member_id AS TEXT),CAST(a.evo_member_id AS TEXT),4
 FROM evo_member_attendance a WHERE a.unit='gym'
), identities AS (
 SELECT evo_member_id,canonical FROM (
 SELECT evo_member_id,canonical,
 ROW_NUMBER() OVER(PARTITION BY evo_member_id ORDER BY priority,canonical) rn
 FROM identity_candidates
 ) WHERE rn=1
), mapped AS (
 SELECT i.evo_member_id,COALESCE(i2.canonical,i.canonical) canonical
 FROM identities i LEFT JOIN identities i2 ON i2.evo_member_id=i.canonical
), member_totals AS (
 SELECT mp.canonical,MAX(CASE WHEN EXISTS(SELECT 1 FROM club_settings review WHERE review.key='attendance_legacy_review:gym:'||m.id AND json_extract(review.value,'$.status')='pending') THEN 0 ELSE COALESCE(m.presencas_legadas_gym,0) END) legacy,MIN(m.id) id
 FROM members m JOIN mapped mp ON mp.evo_member_id=CAST(m.evo_member_id AS TEXT)
 GROUP BY mp.canonical
), attendance AS (
 SELECT mp.canonical,COUNT(DISTINCT CASE
 WHEN NULLIF(TRIM(a.id_activity_session),'') IS NOT NULL THEN 'session:'||TRIM(a.id_activity_session)
 ELSE 'key:'||a.attendance_key END) actual
 FROM evo_member_attendance a JOIN mapped mp ON mp.evo_member_id=CAST(a.evo_member_id AS TEXT)
 WHERE a.unit='gym' GROUP BY mp.canonical
), member_names AS (
 SELECT mp.canonical,m.id,
 NULLIF(TRIM(COALESCE(m.first_name,'')||' '||COALESCE(m.last_name,'')),'') name,
 ROW_NUMBER() OVER(PARTITION BY mp.canonical ORDER BY
 (CAST(m.evo_member_id AS TEXT)=mp.canonical) DESC,m.id) rn
 FROM members m JOIN mapped mp ON mp.evo_member_id=CAST(m.evo_member_id AS TEXT)
), people AS (
 SELECT mp.canonical evo_member_id,mt.id,
 COALESCE(mn.name,
 NULLIF(TRIM(COALESCE(json_extract(em.personal_json,'$.firstName'),'')||' '||COALESCE(json_extract(em.personal_json,'$.lastName'),'')),''),
 'Aluno') name,
 COALESCE(json_extract(em.personal_json,'$.document'),json_extract(em.personal_json,'$.cpf'),'') cpf,
 COALESCE(mt.legacy,0) legacy
 FROM (SELECT DISTINCT canonical FROM mapped) mp
 LEFT JOIN member_totals mt ON mt.canonical=mp.canonical
 LEFT JOIN member_names mn ON mn.canonical=mp.canonical AND mn.rn=1
 LEFT JOIN evo_member_master em ON em.unit='gym' AND em.evo_member_id=mp.canonical
 WHERE em.evo_member_id IS NOT NULL OR mt.legacy>0
 OR mp.canonical IN (SELECT canonical FROM attendance)
), totals AS (
 SELECT p.*,COALESCE(a.actual,0) actual,p.legacy+COALESCE(a.actual,0) stars
 FROM people p LEFT JOIN attendance a ON a.canonical=p.evo_member_id
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

export async function adminGymRanking(db,search){
 const o=rankingQueryOptions(search);
 const select='evo_member_id,id,name,legacy,actual,stars,position,next';
 const results=await db.batch([
 db.prepare(rankingBase+`SELECT COUNT(*) total,COALESCE(SUM(stars),0) stars,COALESCE(SUM(legacy),0) legacy,COALESCE(SUM(actual),0) actual,COALESCE(SUM(stars>0),0) withStars,COALESCE(SUM(stars>0 AND next-stars<=5),0) near FROM ranked`+o.where).bind(...o.params),
 db.prepare(rankingBase+`SELECT ${select} FROM ranked`+o.where+` ORDER BY ${o.order},evo_member_id ASC LIMIT 10 OFFSET ?`).bind(...o.params,(o.page-1)*10),
 db.prepare(rankingBase+`SELECT ${select} FROM ranked`+o.where+` AND stars>0 AND next-stars<=5 ORDER BY next-stars ASC,stars DESC,evo_member_id ASC LIMIT 10`).bind(...o.params)
 ]);
 const summary=results[0].results[0];
 const decorate=x=>({...x,progress:gymStarProgress(x.stars),remaining:x.next-x.stars});
 return {ok:true,unit:'gym',page:o.page,total:summary.total,summary,rows:results[1].results.map(decorate),upcoming:results[2].results.map(decorate),evoRequestsMade:0};
}
