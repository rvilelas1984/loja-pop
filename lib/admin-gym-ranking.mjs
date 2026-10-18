import {gymStarProgress} from './gym-star-levels.mjs';

// Read-only ranking. Each attendance row is one class, including same-day classes.
export const rankingBase = `WITH identities AS (
 SELECT CAST(em.evo_member_id AS TEXT) evo_member_id,
 COALESCE((SELECT CAST(NULLIF(m.gym_client_id,'') AS TEXT) FROM members m WHERE CAST(m.evo_member_id AS TEXT)=em.evo_member_id LIMIT 1),CAST(em.evo_member_id AS TEXT)) canonical
 FROM evo_member_master em WHERE em.unit='gym'
 UNION
 SELECT CAST(m.evo_member_id AS TEXT),
 COALESCE(NULLIF(m.gym_client_id,''),CAST(m.evo_member_id AS TEXT))
 FROM members m WHERE m.evo_member_id IS NOT NULL
 UNION
 SELECT evo_member_id,evo_member_id FROM evo_member_attendance WHERE unit='gym'
), mapped AS (
 SELECT evo_member_id,
 COALESCE((SELECT canonical FROM identities i2 WHERE i2.evo_member_id=i.canonical LIMIT 1),i.canonical) canonical
 FROM identities i GROUP BY evo_member_id
), member_totals AS (
 SELECT COALESCE(NULLIF(m.gym_client_id,''),CAST(m.evo_member_id AS TEXT)) canonical,
 SUM(COALESCE(m.presencas_legadas_gym,0)) legacy,
 MIN(m.id) id
 FROM members m WHERE m.evo_member_id IS NOT NULL GROUP BY 1
), attendance AS (
 SELECT mp.canonical,COUNT(*) actual
 FROM evo_member_attendance a JOIN mapped mp ON mp.evo_member_id=a.evo_member_id
 WHERE a.unit='gym' GROUP BY mp.canonical
), people AS (
 SELECT mp.canonical evo_member_id,mt.id,
 COALESCE(NULLIF(TRIM(COALESCE(m.first_name,'')||' '||COALESCE(m.last_name,'')),''),
 NULLIF(TRIM(COALESCE(json_extract(em.personal_json,'$.firstName'),'')||' '||COALESCE(json_extract(em.personal_json,'$.lastName'),'')),''),
 'Aluno') name,
 COALESCE(json_extract(em.personal_json,'$.document'),json_extract(em.personal_json,'$.cpf'),'') cpf,
 COALESCE(mt.legacy,0) legacy
 FROM (SELECT DISTINCT canonical FROM mapped) mp
 LEFT JOIN member_totals mt ON mt.canonical=mp.canonical
 LEFT JOIN members m ON CAST(m.evo_member_id AS TEXT)=mp.canonical
 LEFT JOIN evo_member_master em ON em.unit='gym' AND em.evo_member_id=mp.canonical
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
