import {journeyConversion} from './journey-conversion.mjs';
// Journey eligibility uses synchronized D1 data only. No EVO requests here.
export const parseJSON = (s, fallback = {}) => { try { return JSON.parse(s) ?? fallback; } catch { return fallback; } };
export const iso = value => {
  if (!value) return null;
  const s = String(value).trim();
  // EVO timestamps without an offset represent local unit time; D1 timestamps
  // are explicitly converted to UTC at their call sites.
  const d = new Date(/^\d{4}-\d\d-\d\d$/.test(s) ? s + 'T00:00:00-03:00' : /(?:Z|[+-]\d\d:\d\d)$/.test(s) ? s : s.replace(' ', 'T') + '-03:00');
  return Number.isFinite(+d) ? d.toISOString() : null;
};
export function localParts(value = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'}).formatToParts(new Date(value)).map(p => [p.type,p.value]));
  const day = `${p.year}-${p.month}-${p.day}`;
  return {day, time:`${p.hour}:${p.minute}`, weekday:String(new Date(day+'T12:00:00Z').getUTCDay()), slot:day+'T'+p.hour+':'+p.minute};
}
export function normalizePhone(value) {
  let p = String(value || '').replace(/\D/g,'');
  if (p.startsWith('0055')) p = p.slice(4);
  else if (p.startsWith('55') && [12,13].includes(p.length)) p = p.slice(2);
  return /^[1-9][1-9](?:9\d{8}|[2-9]\d{7})$/.test(p) ? '55'+p : '';
}
function phoneFrom(...sources) {
  for (const source of sources) {
    const x = typeof source === 'string' ? parseJSON(source) : source;
    if (!x) continue;
    const contacts = Array.isArray(x) ? x : Array.isArray(x.contacts) ? x.contacts : [];
    for (const c of contacts) {
      const kind = String(c.contactType || c.type || '').toLowerCase();
      if (/mail/.test(kind)) continue;
      const p = normalizePhone(c.description || c.number || c.value || c.phone);
      if (p && (/cell|mobile|celular|whats|phone|telefone|fone/.test(kind) || Number(c.idContactType)===2)) return p;
    }
    for (const key of ['cellPhone','cellphone','mobile','mobilePhone','phone','phoneNumber','telephone','whatsapp','whatsApp','celular','telefone','phone1','phone2','contactPhone']) {
      const p = normalizePhone(x[key]); if (p) return p;
    }
  }
  return '';
}
function documentOf(x) { const s=String(x.document || x.cpf || '').replace(/\D/g,''); return /^\d{11}$/.test(s)&&! /^(\d)\1{10}$/.test(s) ? s : ''; }
const emailOf = x => { const s=String(x.email || '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : ''; };
const rName = p => [p.firstName,p.lastName].filter(Boolean).join(' ');
const normalizedName = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const all = async (db, sql, ...params) => (await db.prepare(sql).bind(...params).all()).results || [];

export async function loadJourneyPeople(db, unit, now = new Date()) {
  // Including older registrations preserves the original event after an EVO ID
  // change. Older students may still produce new stage events after activation.
  const [regs, masters, aliases] = await Promise.all([
    all(db, "SELECT * FROM evo_daily_registrations WHERE unit=? AND category IN ('client','opportunity')", unit),
    all(db, 'SELECT * FROM evo_member_master WHERE unit=?', unit),
    all(db, 'SELECT legacy_evo_member_id,principal_evo_member_id FROM evo_member_identity_aliases WHERE unit=?', unit)
  ]);
  const nodes = new Map(), parents = new Map();
  const add = (key, x) => { if (!nodes.has(key)) { nodes.set(key,{key,regs:[],docs:new Set(),emails:new Set(),names:new Set(),...x}); parents.set(key,key); } return nodes.get(key); };
  const root = k => { let p=k; while(parents.get(p)!==p) p=parents.get(p); while(parents.get(k)!==k) {const n=parents.get(k);parents.set(k,p);k=n;} return p; };
  const join = (a,b) => { if (nodes.has(a)&&nodes.has(b)) parents.set(root(b),root(a)); };
  for (const m of masters) {
    const p=parseJSON(m.personal_json), n=add('client:'+m.evo_member_id,{id:String(m.evo_member_id)});
    n.master=m; n.integrations=parseJSON(m.integrations_json); n.phone=phoneFrom(m.contacts_json,p); n.name=p.name||[p.firstName,p.lastName].filter(Boolean).join(' ');
    if(normalizedName(n.name))n.names.add(normalizedName(n.name)); if(normalizedName(p.name||rName(p)))n.names.add(normalizedName(p.name||rName(p)));
    if(documentOf(p))n.docs.add(documentOf(p)); if(emailOf(p))n.emails.add(emailOf(p));
  }
  for(const r of regs) {
    const p=parseJSON(r.payload_json),n=add(r.category+':'+r.evo_id,{id:String(r.evo_id)});
    if(normalizedName(r.display_name))n.names.add(normalizedName(r.display_name));
    n.regs.push(r); n.integrations={...p,...n.integrations}; n.name=n.name||r.display_name; n.phone=n.phone||phoneFrom(p);
    if(normalizedName(n.name))n.names.add(normalizedName(n.name)); if(normalizedName(p.name||rName(p)))n.names.add(normalizedName(p.name||rName(p)));
    if(documentOf(p))n.docs.add(documentOf(p)); if(emailOf(p))n.emails.add(emailOf(p));
  }
  // Inspect complete connected components before union, including transitive
  // matches. A shared CPF/email is evidence, never permission to merge conflicts.
  const component = key => [...nodes.values()].filter(n=>root(n.key)===root(key));
  const conflict = (members, explicit=false) => {
    const values=field=>new Set(members.flatMap(n=>[...n[field]]));
    if(values('docs').size>1)return 'CPF_DIVERGENTE';
    if(values('names').size>1)return 'NOMES_DIVERGENTES';
    if(!explicit&&values('emails').size>1)return 'EMAILS_DIVERGENTES';
    return null;
  };
  const merge = (members, explicit=false) => {
    const expanded=[...new Set(members.flatMap(n=>component(n.key)))];
    const reason=conflict(expanded,explicit);
    if(reason){for(const n of expanded){n.ambiguous=true;n.identityReason='CONFLITO_IDENTIDADE_'+reason;}return;}
    for(const n of members.slice(1))join(members[0].key,n.key);
  };
  for(const a of aliases){const ns=[nodes.get('client:'+a.principal_evo_member_id),nodes.get('client:'+a.legacy_evo_member_id)].filter(Boolean);if(ns.length===2)merge(ns,true);}
  for(const field of ['docs','emails']) {
    const index=new Map();
    for(const n of nodes.values())for(const token of n[field]) {if(!index.has(token))index.set(token,[]);index.get(token).push(n);}
    for(const members of index.values())if(members.length>1)merge(members);
  }
  const groups=new Map();for(const n of nodes.values()){const k=root(n.key);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(n);}
  const today=localParts(now).day,people=[];
  for(const members of groups.values()) {
    const issue=conflict(members);if(issue)for(const n of members){n.ambiguous=true;n.identityReason='CONFLITO_IDENTIDADE_'+issue;}
    const rs=members.flatMap(n=>n.regs).sort((a,b)=>String(a.register_day).localeCompare(String(b.register_day))||String(a.register_at).localeCompare(String(b.register_at)));
    if(!rs.length||rs[0].register_day>today)continue;
    const ordered=[...members].sort((a,b)=>(b.master?.is_current||0)-(a.master?.is_current||0));
    const docs=[...new Set(members.flatMap(n=>[...n.docs]))],emails=[...new Set(members.flatMap(n=>[...n.emails]))];
    people.push({id:String(rs[0].evo_id),name:rs[0].display_name||ordered[0].name||'Aluno',registeredAt:iso(rs[0].register_at||rs[0].register_day),day:rs[0].register_day,registrationSyncedAt:utcStamp(rs[0].first_seen_at),identityReason:members.find(n=>n.identityReason)?.identityReason||null,
      wellhubId:ordered.find(n=>n.integrations?.gympassId)?.integrations.gympassId||null,totalpassId:ordered.find(n=>n.integrations?.codeTotalpass)?.integrations.codeTotalpass||null,ids:[...new Set(members.map(n=>n.id))],memberIds:members.filter(n=>n.key.startsWith('client:')).map(n=>n.id),prospectIds:members.filter(n=>n.key.startsWith('opportunity:')).map(n=>n.id),
      phone:ordered.find(n=>n.phone)?.phone||'',tokens:[...members.map(n=>'id:'+n.key),...docs.map(d=>'cpf:'+d),...emails.map(e=>'email:'+e)],ambiguous:members.some(n=>n.ambiguous)||docs.length>1});
  }
  return people.sort((a,b)=>a.id.localeCompare(b.id));
}

export async function resolvePerson(db,unit,person) {
  if(person.ambiguous||person.identityReason)throw Error(person.identityReason||'IDENTIDADE_AMBIGUA');
  // Persist hashed identity aliases so an EVO ID migration cannot reset dedup.
  const tokens=await Promise.all(person.tokens.map(async t=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t))),b=>b.toString(16).padStart(2,'0')).join('')));
  const lookup=()=>all(db,`SELECT person_id FROM club_journey_identities WHERE unit=? AND token IN (${tokens.map(()=>'?').join(',')})`,unit,...tokens);
  if(!tokens.length||tokens.length>90)throw Error('VINCULOS_DE_IDENTIDADE_EM_CONFLITO');
  const found=new Set((await lookup()).map(r=>r.person_id));
  if(found.size>1)throw Error('VINCULOS_DE_IDENTIDADE_EM_CONFLITO');
  if(found.size){
    const linked=await all(db,'SELECT token FROM club_journey_identities WHERE unit=? AND person_id=?',unit,[...found][0]);
    const linkedTokens=new Set(linked.map(x=>x.token));
    for(const other of await loadJourneyPeople(db,unit)){
      if(other.tokens.some(t=>t.startsWith('id:')&&person.tokens.includes(t)))continue;
      for(const t of other.tokens.filter(t=>t.startsWith('id:'))){const h=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t))),b=>b.toString(16).padStart(2,'0')).join('');if(linkedTokens.has(h))throw Error('VINCULO_HISTORICO_EM_CONFLITO');}
    }
  }
  const personId=[...found][0]||crypto.randomUUID();
  await db.batch(tokens.map(t=>db.prepare('INSERT OR IGNORE INTO club_journey_identities(unit,token,person_id) VALUES(?,?,?)').bind(unit,t,personId)));
  const actual=new Set((await lookup()).map(r=>r.person_id));
  if(actual.size!==1)throw Error('VINCULOS_DE_IDENTIDADE_EM_CONFLITO');
  return [...actual][0];
}

export async function loadJourneyFacts(db,unit,p,now=new Date()) {
  const attendance=[],bookings=[],contracts=[],contacts=[];
  for(const id of p.memberIds){
    attendance.push(...await all(db,'SELECT attendance_date day,start_time time,attendance_key key,synced_at FROM evo_member_attendance WHERE unit=? AND evo_member_id=? AND attendance_date>=? ORDER BY attendance_date,start_time',unit,id,p.day));
    bookings.push(...await all(db,'SELECT activity_date day,start_time time,session_id key,status,checked_in FROM checkin_reservation_snapshots WHERE unit=? AND evo_member_id=? AND removed=0 AND activity_date>=?',unit,id,p.day));
    contracts.push(...await all(db,'SELECT * FROM evo_member_contracts WHERE unit=? AND evo_member_id=?',unit,id));
  }
  for(const id of p.prospectIds)bookings.push(...await all(db,'SELECT activity_date day,start_time time,session_id key,status,0 checked_in FROM evo_prospect_reservations WHERE unit=? AND prospect_id=? AND activity_date>=?',unit,id,p.day));
  for(const id of p.ids)contacts.push(...await all(db,"SELECT kind,note,created_at FROM club_new_student_interventions WHERE unit=? AND evo_member_id=? AND kind IN ('contact','response','followup') ORDER BY created_at DESC",unit,id));
  return deriveJourneyFacts(p,{attendance,bookings,contracts,contacts},now);
}
export function deriveJourneyFacts(p,{attendance,bookings,contracts,contacts},now=new Date()) {
  const at=x=>iso(String(x.day).slice(0,10)+'T'+String(x.time||'00:00').slice(0,8));
  const present=attendance.map(a=>({...a,at:at(a)})).filter(a=>a.at&&a.at<=new Date(now).toISOString()).sort((a,b)=>a.at.localeCompare(b.at));
  const bs=bookings.map(b=>({...b,at:at(b)})).filter(b=>b.at&&!/cancel|remov/i.test(b.status||'')).sort((a,b)=>a.at.localeCompare(b.at));
  const conversion=journeyConversion(p,contracts,localParts(now).day);
  return {present,bookings:bs,converted:conversion.conversionContract,conversion,contacts};
}

export function journeyEvent(rule,p,f,now=new Date()) {
  const n=+new Date(now),last=f.present.at(-1),future=f.bookings.find(b=>+new Date(b.at)>n&&!/no.?show|faltou|ausente/i.test(b.status||''));
  let at,key;
  if(rule==='new') {if(f.present.length||f.bookings.length||f.converted)return null;at=p.registeredAt;key='registration:'+p.day;}
  if(rule==='unbooked') {if(f.present.length||f.bookings.length||f.converted)return null;at=p.registeredAt;key='registration:'+p.day;}
  if(rule==='booked') {if(!future||f.present.length||f.converted)return null;at=future.bookedAt||null;key='booking:'+future.key;if(!at)return {at:null,key,sourceReason:'DATA_REAL_AGENDAMENTO_AUSENTE'};}
  if(rule==='awaiting_attendance') {if(!future||f.present.length||f.converted)return null;at=future.at;key='awaiting_attendance:'+future.key;}
  if(rule==='no_show') {
    const missed=f.bookings.filter(b=>/^(no[_ -]?show|faltou|ausente)$/i.test(b.status||'')&&!b.checked_in&&+new Date(b.at)<n).at(-1);
    if(!missed||future||f.present.length||f.converted)return null;at=missed.at;key='no_show:'+missed.key;
  }
  if(rule==='attended') {if(f.present.length!==1||f.converted)return null;at=f.present[0].at;key='attendance:'+f.present[0].day;}
  if(rule==='converted') {if(!f.converted||f.conversion?.conversionFollowupDay>=90)return null;at=iso(f.converted.start_date);key='conversion:'+String(f.converted.start_date).slice(0,10);}
  if(rule==='inactive') {if(!last||future||n-+new Date(last.at)<7*86400000)return null;at=new Date(+new Date(last.at)+7*86400000).toISOString();key='inactive:'+last.day;}
  return at&&key?{at,key}:null;
}

export function contactBlock(f,flow,event,now=new Date()) {
  for(const c of f.contacts) {
    if(c.kind==='followup')continue;
    const at=Date.parse(String(c.created_at).replace(' ','T')+'Z');
    if(!Number.isFinite(at))continue;
    
    
  }
  return null;
}

// Six set-based reads for the unit, not several round trips for every student.
export async function loadJourneyFactsMany(db,unit,people,now=new Date()) {
 const cutoff=people.reduce((d,p)=>p.day<d?p.day:d,localParts(now).day);
 const [attendance,reservations,prospects,contracts,contacts]=await Promise.all([
  all(db,'SELECT evo_member_id,attendance_date day,start_time time,attendance_key key,synced_at FROM evo_member_attendance WHERE unit=? AND attendance_date>=?',unit,cutoff),
  all(db,'SELECT evo_member_id,activity_date day,start_time time,session_id key,status,checked_in FROM checkin_reservation_snapshots WHERE unit=? AND removed=0 AND activity_date>=?',unit,cutoff),
  all(db,'SELECT prospect_id,activity_date day,start_time time,session_id key,status,0 checked_in FROM evo_prospect_reservations WHERE unit=? AND activity_date>=?',unit,cutoff),
  all(db,'SELECT * FROM evo_member_contracts WHERE unit=?',unit),
  all(db,"SELECT evo_member_id,kind,note,created_at FROM club_new_student_interventions WHERE unit=? AND kind IN ('contact','response','followup')",unit)
 ]);
 const index=(rs,key)=>{const m=new Map();for(const r of rs){const k=String(r[key]);if(!m.has(k))m.set(k,[]);m.get(k).push(r)}return m};
 const ai=index(attendance,'evo_member_id'),ri=index(reservations,'evo_member_id'),pi=index(prospects,'prospect_id'),ci=index(contracts,'evo_member_id'),ni=index(contacts,'evo_member_id');
 const collect=(m,ids)=>ids.flatMap(id=>m.get(String(id))||[]);
 return new Map(people.map(p=>[p.id,deriveJourneyFacts(p,{attendance:collect(ai,p.memberIds).filter(x=>x.day>=p.day),bookings:[...collect(ri,p.memberIds),...collect(pi,p.prospectIds)].filter(x=>x.day>=p.day),contracts:collect(ci,p.memberIds),contacts:collect(ni,p.ids)},now)]));
}
export const utcStamp=value=>!value?null:/(?:Z|[+-]\d\d:\d\d)$/.test(value)?new Date(value).toISOString():new Date(value.replace(' ','T')+'Z').toISOString();
