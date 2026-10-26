// Keep external identifiers as strings: D1 can persist a numeric bind as "123.0" in TEXT.
export function canonicalEvoId(value) {
 const text=String(value??'').trim();
 return /^\d+(?:\.0+)?$/.test(text)?text.replace(/\.0+$/,'').replace(/^0+(?=\d)/,''):text;
}
export function normalizeMemberIds(member) {
 if(!member)return member;
 return {...member,evo_member_id:member.evo_member_id==null?null:canonicalEvoId(member.evo_member_id),gym_client_id:member.gym_client_id==null?null:canonicalEvoId(member.gym_client_id)};
}
// Resolution never merges records or falls back across units by a bare numeric ID.
export async function resolveEvoClubMember(db,unit,input) {
 if(!['bike','gym'].includes(unit))throw Error('UNIDADE_INVALIDA');
 const id=canonicalEvoId(input);if(!/^[1-9]\d*$/.test(id))throw Error('EVO_ID_INVALIDO');
 const all=async(sql,...args)=>(await db.prepare(sql).bind(...args).all()).results||[];
 const direct=await all(unit==='bike'?'SELECT * FROM members WHERE CAST(evo_member_id AS TEXT)=?':"SELECT DISTINCT m.* FROM members m LEFT JOIN gym_member_links g ON g.member_id=m.id AND g.status='ACTIVE' WHERE m.gym_client_id=? OR g.gym_client_id=?",... (unit==='bike'?[id]:[id,id]));
 const master=await db.prepare('SELECT personal_json,contacts_json FROM evo_member_master WHERE unit=? AND evo_member_id=?').bind(unit,id).first();
 const parse=v=>{try{return JSON.parse(v||'{}')}catch{return {}}};
 const p=parse(master?.personal_json),contacts=parse(master?.contacts_json);
 const cpf=String(p.document||p.cpf||'').replace(/\D/g,'');
 const email=String(p.email||(Array.isArray(contacts)?contacts.find(c=>/mail/i.test(c.contactType||''))?.description:'')||'').trim().toLowerCase();
 let matches=[];
 if(/^\d{11}$/.test(cpf)){
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(cpf))),v=>v.toString(16).padStart(2,'0')).join('');
  matches=await all('SELECT * FROM members WHERE cpf_hash=?',hash);
  if(direct.some(m=>/^[a-f0-9]{64}$/.test(m.cpf_hash||'')&&m.cpf_hash!==hash))throw Error('CPF_CONFLITANTE');
 }else if(email){
  matches=await all("SELECT * FROM members WHERE lower(trim(email))=?",email);
  // Email alone is not proof when more than one account exists.
  if(matches.length>1)throw Error('IDENTIDADE_AMBIGUA');
 }
 const candidates=[...new Map([...direct,...matches].map(m=>[m.id,m])).values()];
 if(candidates.length>1)throw Error('IDENTIDADE_AMBIGUA');
 const member=normalizeMemberIds(candidates[0]);
 if(member){const linked=unit==='gym'?member.gym_client_id:member.evo_member_id;if(linked&&linked!==id)throw Error('VINCULO_CONFLITANTE');}
 return member||null;
}

export async function memberAttendanceHistory(db,member,unit,offset=0) {
 if(!['bike','gym'].includes(unit))throw Error('UNIDADE_INVALIDA');
 const id=canonicalEvoId(unit==='gym'?member.gym_client_id:member.evo_member_id);
 if(!id)return {ok:false,error:'UNIDADE_NAO_VINCULADA'};
 const start=Math.max(0,Math.floor(Number(offset)||0));
 const base=`WITH unique_attendance AS (SELECT attendance_date,start_time,activity_name,
 COALESCE(NULLIF(id_activity_session,''),attendance_key) session_id
 FROM evo_member_attendance WHERE unit=? AND evo_member_id=?
 GROUP BY COALESCE(NULLIF(id_activity_session,''),attendance_key)) `;
 const count=await db.prepare(base+'SELECT COUNT(*) total FROM unique_attendance').bind(unit,id).first();
 const rows=await db.prepare(base+'SELECT * FROM unique_attendance ORDER BY attendance_date DESC,start_time DESC,session_id DESC LIMIT 10 OFFSET ?').bind(unit,id,start).all();
 return {ok:true,unit,evoMemberId:id,total:Number(count?.total||0),offset:start,hasMore:start+rows.results.length<Number(count?.total||0),items:rows.results,source:'d1',evoRequestsMade:0};
}
