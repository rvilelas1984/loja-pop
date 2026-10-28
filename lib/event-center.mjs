import {eventSources} from './event-sources.mjs';
import {eventPages} from './event-pages.mjs';
export {eventSources};
const ident = s => '"'+String(s).replaceAll('"','""')+'"';
const literal = s => "'"+String(s).replaceAll("'","''")+"'";
const ref = (side,k) => side+'.'+ident(k);
export const CAPTURE_VERSION='20261027';
const presentKeys=['target','stars','previous_stars','label','start_date','end_date','cancel_date','sale_date','external_state','reservation_state','delivery_state','stage','deleted','show_name','enabled','revoked_at','used_at','redeemed_at','completed_at','cancelled_at','approved_at','paid_at','resolved_at','activated_at','member_id','evo_member_id','evo_id','prospect_id','student_id','person_id','session_id','id_activity_session','unit','status','state','category','page','event_key','rule','activity_date','start_time','attendance_date','evo_status','justified_absence','membership_status','progress','goal','amount','old_status','new_status','origin'];
export function definitions(s) {
 if(s.mode==='snapshot')return ['detected','changed','removed'].map(op=>({key:`cp.${s.table}.${op}`,label:`${s.label} • ${{detected:'recebido',changed:'alterado',removed:'ausente na nova lista'}[op]}`,op}));
 if(s.mode!=='trigger')return [];
 const ops=['created',...(s.tracked.length?['updated']:[]),...(!s.table.startsWith('evo_')&&!['auth_sessions','pop_fit_images'].includes(s.table)?['deleted']:[])];
 if(s.table==='evo_daily_registrations')return [{key:'cp.registration.client.detected',label:'Novo aluno identificado',op:'created'},{key:'cp.registration.opportunity.detected',label:'Nova oportunidade identificada',op:'created'},{key:'cp.evo_daily_registrations.updated',label:'Cadastro recebido • atualizado',op:'updated'}];
 return ops.map(op=>({key:`cp.${s.table}.${op}`,label:op==='created'&&s.table==='evo_member_attendance'?'Presença confirmada recebida':op==='created'&&s.table==='auth_sessions'?'Aluno entrou no aplicativo':op==='created'&&s.table==='club_app_page_sessions'?'Página do aplicativo acessada':`${s.label} • ${{created:'registrado',updated:'alterado',deleted:'excluído'}[op]}`,op}));
}
const triggerName=(s,op)=>`cp_evt_${s.table}_${op}_v1`;
export function captureSQL(s,op) {
 const side=op==='deleted'?'OLD':'NEW';
 const key=`cp.${s.table}.${op}`;
 const action=s.table==='evo_daily_registrations'&&op==='created'?"CASE WHEN NEW.category='opportunity' THEN 'cp.registration.opportunity.detected' ELSE 'cp.registration.client.detected' END":literal(key);
 const entity=`json_array(${s.keys.map(k=>ref(side,k)).join(',')})`;
 // Only selected fields go to the journal. No PIN, token, CPF, contact, message, image or raw payload.
 const pairs=['unit',s.columns.includes('unit')?`CASE WHEN ${ref(side,'unit')} IN ('bike','gym') THEN ${ref(side,'unit')} ELSE 'club' END`:s.columns.includes('scope')?ref(side,'scope'):s.columns.includes('studio')?ref(side,'studio'):"'club'",'source_table',literal(s.table),'operation',literal(op),'capture_version',literal(CAPTURE_VERSION),'occurred_at',op==='created'&&s.timestamp?ref(side,s.timestamp):'NULL','time_basis',literal(op==='created'&&s.timestamp?'source':'detection')];
 for(const f of s.fields.filter(f=>f!=='unit'))pairs.push(f==='member_id'&&s.table.startsWith('class_chat_')?'evo_member_id':f,ref(side,f));
 for(const f of ['display_name','member_name'])if(s.columns.includes(f))pairs.push(f,ref(side,f));
 if(s.table==='members')pairs.push('member_id',`${side}.id`);
 if(op==='updated'){
  for(const f of s.fields.filter(f=>/status|state|progress|goal|paid|enabled|is_current|justified/.test(f)))pairs.push('previous_'+f,ref('OLD',f));
 }
 if(op==='updated'){
  const times=['revoked_at','used_at','redeemed_at','completed_at','cancelled_at','approved_at','paid_at','resolved_at','activated_at'].filter(k=>s.columns.includes(k));
  if(times.length){pairs[pairs.indexOf('occurred_at')+1]='CASE '+times.map(k=>`WHEN OLD.${ident(k)} IS NOT NEW.${ident(k)} THEN NEW.${ident(k)}`).join(' ')+' ELSE NULL END';}
 }
 const metadata=`json_object(${pairs.map((v,i)=>i%2?v:literal(v)).join(',')})`;
 let when=op==='updated'?s.tracked.map(k=>`${ref('OLD',k)} IS NOT ${ref('NEW',k)}`).join(' OR '):'1';
 // Snapshot refreshes can delete/reinsert a known row. Created means first detection of this identity.
 if(op==='created')when=`NOT EXISTS(SELECT 1 FROM audit_log WHERE action=${action} AND entity_type=${literal(s.table)} AND entity_id=${entity})`;
 const sql=`CREATE TRIGGER IF NOT EXISTS ${ident(triggerName(s,op))} AFTER ${{created:'INSERT',updated:'UPDATE',deleted:'DELETE'}[op]} ON ${ident(s.table)} WHEN (${when}) BEGIN INSERT INTO audit_log(actor_type,actor_id,action,entity_type,entity_id,metadata_json,created_at) VALUES('SYSTEM',NULL,${action},${literal(s.table)},${entity},${metadata},strftime('%Y-%m-%dT%H:%M:%fZ','now')); END`;
 return sql;
}
export const journalIndexes=[
 'CREATE INDEX IF NOT EXISTS idx_cp_events_identity ON audit_log(action,entity_type,entity_id)',
 'CREATE INDEX IF NOT EXISTS idx_cp_events_created ON audit_log(created_at,id)',
 "CREATE INDEX IF NOT EXISTS idx_cp_events_normal_time ON audit_log(replace(substr(created_at,1,19),'T',' '),id)",
 'CREATE INDEX IF NOT EXISTS idx_cp_events_action_id ON audit_log(action,id)'
];
export function allCaptureStatements(){return [...journalIndexes,...contentCollections.flatMap(([c])=>['created','updated','deleted'].map(op=>contentCaptureSQL(c,op))),...eventSources.filter(s=>s.mode==='trigger'&&!s.lazy).flatMap(s=>[...new Set(definitions(s).map(d=>d.op))].map(op=>captureSQL(s,op)))];}
// Called inside the same D1 batch as snapshot replacement, after its version claim.
// INSERT…SELECT evaluates the prior snapshot atomically, preventing races and duplicate refresh events.
export function reservationEventStatements(db,{table,unit,sessionId,date,time,rows,stamp,condition}) {
 if(!['evo_prospect_reservations','checkin_reservation_snapshots'].includes(table))throw Error('FONTE_RESERVA_INVALIDA');
 const prospect=table==='evo_prospect_reservations',idcol=prospect?'prospect_id':'evo_member_id';
 const base=JSON.stringify({unit,session_id:String(sessionId),activity_date:date,start_time:time,source_table:table,time_basis:'detection',occurred_at:null,capture_version:CAPTURE_VERSION});
 const payload=JSON.stringify(rows.map(r=>({id:String(r.id),slot:r.slot??null,checked:r.checked??null,status:r.status??null})));
 const id="CAST(json_extract(n.value,'$.id') AS TEXT)";
 const match=`s.unit=? AND s.session_id=? AND CAST(s.${idcol} AS TEXT)=${id}`;
 const diff=prospect?"s.status IS NOT json_extract(n.value,'$.status')":"(s.slot_number IS NOT json_extract(n.value,'$.slot') OR s.checked_in IS NOT json_extract(n.value,'$.checked') OR s.status IS NOT json_extract(n.value,'$.status'))";
 const stm=[];
 for(const op of ['detected','changed']){
  const compare=op==='detected'?`NOT EXISTS(SELECT 1 FROM ${table} s WHERE ${match})`:`EXISTS(SELECT 1 FROM ${table} s WHERE ${match} AND ${diff})`;
  stm.push(db.prepare(`INSERT INTO audit_log(actor_type,actor_id,action,entity_type,entity_id,metadata_json,created_at) SELECT 'SYSTEM',NULL,?,?,json_array(?,?,${id}),json_set(?,'$.${idcol}',${id},'$.operation',?,'$.slot_number',json_extract(n.value,'$.slot'),'$.checked_in',json_extract(n.value,'$.checked'),'$.status',json_extract(n.value,'$.status')),strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM json_each(?) n WHERE ${condition} AND ${compare} GROUP BY ${id}`).bind(`cp.${table}.${op}`,table,unit,String(sessionId),base,op,payload,unit,String(sessionId),stamp,unit,String(sessionId)));
 }
 stm.push(db.prepare(`INSERT INTO audit_log(actor_type,actor_id,action,entity_type,entity_id,metadata_json,created_at) SELECT 'SYSTEM',NULL,?,?,json_array(unit,session_id,${idcol}),json_set(?,'$.${idcol}',${idcol},'$.operation','removed'),strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM ${table} WHERE unit=? AND session_id=? AND ${condition} AND CAST(${idcol} AS TEXT) NOT IN (SELECT CAST(json_extract(value,'$.id') AS TEXT) FROM json_each(?)) GROUP BY ${idcol}`).bind(`cp.${table}.removed`,table,base,unit,String(sessionId),unit,String(sessionId),stamp,payload));
 return stm;
}
export function eventParams(p){
 const unit=p.get('unit')||'club',start=p.get('start'),end=p.get('end'),page=Number(p.get('page')||1),search=(p.get('search')||'').trim(),type=p.get('type')||'',category=p.get('category')||'',origin=p.get('origin')||'';
 const valid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 if(!['bike','gym','club'].includes(unit)||!valid(start)||!valid(end)||start>end||Date.parse(end)-Date.parse(start)>365*86400000||!Number.isInteger(page)||page<1||page>100000||search.length>80||type.length>180||category.length>80||origin.length>80)throw Error('PARAMETROS_INVALIDOS');
 return {unit,start,end,page,search,type,category,origin,from:start+'T03:00:00.000Z',until:new Date(Date.parse(end+'T03:00:00Z')+86400000).toISOString()};
}
const normalTime = "replace(substr(created_at,1,19),'T',' ')";
const safeJSON="CASE WHEN json_valid(a.metadata_json) THEN a.metadata_json ELSE '{}' END";
const unitExpr=`CASE WHEN json_extract(${safeJSON},'$.unit') IN ('bike','gym') THEN json_extract(${safeJSON},'$.unit') ELSE 'club' END`;
const memberExpr=`COALESCE(CASE WHEN a.actor_type='MEMBER' THEN a.actor_id ELSE CAST(json_extract(${safeJSON},'$.member_id') AS TEXT) END,(SELECT CAST(mm.id AS TEXT) FROM members mm WHERE (( ${unitExpr}='bike' AND mm.evo_member_id=CAST(json_extract(${safeJSON},'$.evo_member_id') AS TEXT)) OR (${unitExpr}='gym' AND mm.gym_client_id=CAST(json_extract(${safeJSON},'$.evo_member_id') AS TEXT))) LIMIT 1))`;
const fromSQL=` FROM audit_log a LEFT JOIN members m ON m.id=${memberExpr} `;
function eventWhere(p,allowed){
 const clauses=["a.action NOT GLOB '_cp.*'",`${normalTime.replaceAll('created_at','a.created_at')}>=?`,`${normalTime.replaceAll('created_at','a.created_at')}<?`],args=[p.from.slice(0,19).replace('T',' '),p.until.slice(0,19).replace('T',' ')];
 if(p.unit!=='club'){clauses.push(`${unitExpr}=?`);args.push(p.unit);}
 if(p.type){clauses.push('a.action=?');args.push(p.type);}
 if(allowed){clauses.push(allowed.length?'a.action IN (SELECT value FROM json_each(?))':'0');if(allowed.length)args.push(JSON.stringify(allowed));}
 if(p.search){clauses.push(`(instr(lower(COALESCE(m.first_name,'')||' '||COALESCE(m.last_name,'')),lower(?))>0 OR ${memberExpr}=? OR CAST(json_extract(${safeJSON},'$.evo_member_id') AS TEXT)=? OR CAST(json_extract(${safeJSON},'$.evo_id') AS TEXT)=? OR CAST(json_extract(${safeJSON},'$.prospect_id') AS TEXT)=?)`);args.push(...Array(5).fill(p.search));}
 return {where:' WHERE '+clauses.join(' AND '),args};
}
const nativeLabel=key=>({POP_FIT_SHARE_CLICKED:'Clique em compartilhar imagem',POP_FIT_EDITED:'Treino Pop Fit editado',POP_FIT_IMAGE_GENERATED:'Imagem Pop Fit gerada',MANUAL_STARS_UPDATE:'Estrelas ajustadas manualmente',LOGIN_SUCCESS:'Login concluído',FIRST_ACCESS_SUCCESS:'Primeiro acesso concluído'}[key]||key.replaceAll('_',' ').toLowerCase());
export async function readEventCenter(db,p){
 const schema=(await db.prepare("SELECT name,type FROM sqlite_master WHERE type IN ('table','trigger')").all()).results||[];
 const tables=new Set(schema.filter(s=>s.type==='table').map(s=>s.name)),triggers=new Set(schema.filter(s=>s.type==='trigger').map(s=>s.name));
 const unitWhere=" WHERE a.action NOT GLOB '_cp.*'"+(p.unit==='club'?'':` AND ${unitExpr}=?`);
 const last=(await db.prepare(`SELECT a.action,a.id latest_id,a.created_at last_detected_at,json_extract(${safeJSON},'$.occurred_at') last_occurred_at FROM audit_log a WHERE a.id IN (SELECT MAX(a.id) FROM audit_log a${unitWhere} GROUP BY a.action)`).bind(...(p.unit==='club'?[]:[p.unit])).all()).results||[];
 const catalog=eventSources.flatMap(s=>definitions(s).map(d=>({...d,table:s.table,category:s.category,origin:s.origin,note:s.note,fields:[...s.fields,'occurred_at','detected_at','entity_id'],references:s.references,capture:!tables.has(s.table)?'missing':s.mode==='snapshot'?(schema.some(x=>x.name==='cp_evt_members_created_v1')?'active':'pending'):triggers.has(triggerName(s,d.op))?'active':'pending',automation:'Disponível para configurar futuramente; nenhum envio ativado.'})));
 for(const [collection,label,category] of contentCollections)for(const op of ['created','updated','deleted'])catalog.push({key:`cp.content.${collection}.${op}`,label:label+' • '+({created:'registrado',updated:'alterado',deleted:'excluído'}[op]),table:'app_content',category,origin:'Sistema e administração',capture:triggers.has(`cp_evt_content_${collection}_${op}_v1`)?'active':'pending',fields:['unit','evo_member_id','status','occurred_at','detected_at'],references:['api/content.js'],note:'Alteração individual do item no conteúdo D1. Não equivale a visita à página.',automation:'Disponível para configuração futura.'});
 for(const [kind,label] of [['medal','Medalha conquistada'],['trophy','Troféu conquistado']])catalog.push({key:`cp.conquest.${kind}.earned`,label,table:'audit_log',category:'Missões e conquistas',origin:'Sistema e administração',capture:schema.some(x=>x.name==='cp_evt_members_created_v1')?'active':'pending',fields:['unit','evo_member_id','target','stars','previous_stars','detected_at'],references:['lib/conquest-events.mjs','lib/hall-conquests.mjs'],note:'Novo marco identificado pelo mesmo cálculo do Hall. Verificação a cada minuto. A primeira leitura estabelece a base, sem recriar conquistas antigas.',automation:'Disponível para configurar futuramente; nenhum envio ativado.'});
 const known=new Set(catalog.map(x=>x.key));
 for(const row of last)if(!known.has(row.action))catalog.push({key:row.action,label:nativeLabel(row.action),table:'audit_log',category:row.action.startsWith('POP_FIT')?'Aplicativo do aluno':'Auditoria existente',origin:'Auditoria existente',capture:'active',fields:['detected_at','entity_id','member_id'],references:[],note:'Registro já emitido pelo sistema; dados históricos dependem da auditoria existente.',automation:'Validar o significado antes de conectar uma automação.'});
 const selected=catalog.filter(x=>(!p.category||x.category===p.category)&&(!p.origin||x.origin===p.origin));
 const allowed=p.category||p.origin?selected.map(x=>x.key):null;
 const {where,args}=eventWhere(p,allowed);
 const grouped=(await db.prepare('SELECT a.action,COUNT(*) count'+(p.search?fromSQL:' FROM audit_log a ')+where+' GROUP BY a.action').bind(...args).all()).results||[];
 const counts=new Map(grouped.map(x=>[x.action,Number(x.count)]));const latest=new Map(last.map(x=>[x.action,x]));
 for(const row of catalog){row.count=counts.get(row.key)||0;row.lastDetectedAt=latest.get(row.key)?.last_detected_at||null;row.lastOccurredAt=latest.get(row.key)?.last_occurred_at||null;}
 const list=(await db.prepare(`SELECT a.id,a.action,a.entity_type,a.entity_id,a.created_at,${safeJSON} metadata_json,${memberExpr} member_id,trim(COALESCE(m.first_name,'')||' '||COALESCE(m.last_name,'')) name,${unitExpr} unit`+fromSQL+where+' ORDER BY a.id DESC LIMIT 10 OFFSET ?').bind(...args,(p.page-1)*10).all()).results||[];
 const events=list.map(r=>{
  let data={};try{data=JSON.parse(r.metadata_json)}catch{}
  const detail={};for(const [k,v] of Object.entries(data))if(presentKeys.includes(k)||k.startsWith('previous_')&&presentKeys.includes(k.slice(9)))detail[k]=v;
  const def=catalog.find(c=>c.key===r.action);
  return {id:r.id,key:r.action,label:def?.label||r.action,entity:r.entity_type,entityId:r.entity_id,unit:r.unit,memberId:r.member_id,name:r.name||data.display_name||data.member_name||'',detectedAt:r.created_at,occurredAt:data.occurred_at||null,timeBasis:data.time_basis||'audit',data:detail};
 });
 const knownTables=new Set(eventSources.map(x=>x.table));
 const sources=eventSources.map(s=>({table:s.table,label:s.label,category:s.category,mode:s.mode,note:s.note,references:s.references,exists:tables.has(s.table),events:catalog.filter(c=>c.table===s.table).length}));
 for(const table of tables)if(!knownTables.has(table)&&!table.startsWith('sqlite_')&&!table.startsWith('_cf_')&&!table.startsWith('d1_'))sources.push({table,label:table,category:'Fontes novas',mode:'unmapped',note:'Tabela nova encontrada no D1. Mapear antes de usar como gatilho.',exists:true,events:0,references:[]});
 let requests={available:false};
 if(tables.has('evo_request_log')){
  const rows=(await db.prepare("SELECT unit,COUNT(*) total,SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) failed,MAX(created_at) last_at FROM evo_request_log WHERE created_at>=? AND created_at<? AND (?='club' OR unit=?) GROUP BY unit").bind(p.from.slice(0,19).replace('T',' '),p.until.slice(0,19).replace('T',' '),p.unit,p.unit).all()).results||[];requests={available:true,rows};
 }
 return {ok:true,source:'d1',evoRequestsMade:0,updatedAt:new Date().toISOString(),page:p.page,pageSize:10,total:grouped.reduce((n,r)=>n+Number(r.count),0),catalog:selected.map(c=>catalog.find(x=>x.key===c.key)),events,sources,pages:eventPages,requests,coverage:{tables:sources.length,types:catalog.length,active:catalog.filter(x=>x.capture==='active').length,pending:catalog.filter(x=>x.capture!=='active').length},note:'Captura prospectiva. Registros antigos não são recriados como eventos novos. Horário do acontecimento só é informado quando fornecido pela origem.'};
}

export const contentCollections=[
 ['missionList','Missão configurada','Missões e conquistas'],['promotions','Promoção configurada','Sorteios e promoções'],
 ['products','Produto da loja','Loja e moedas'],['services','Serviço da loja','Loja e moedas'],
 ['benefits','Benefício configurado','Benefícios e vouchers'],['banners','Banner publicado','Administração e conteúdo'],
 ['redemptions','Resgate no conteúdo compartilhado','Loja e moedas'],['transactions','Transação de Fitcoins no conteúdo','Loja e moedas']
];
export function contentCaptureSQL(collection,op){
 const name=`cp_evt_content_${collection}_${op}_v1`,key=`cp.content.${collection}.${op}`;
 const n=op==='deleted'?'o':'n';
 const old="json_each(CASE WHEN json_valid(OLD.content_json) THEN OLD.content_json ELSE '{}' END,'$."+collection+"') o";
 const fresh="json_each(CASE WHEN json_valid(NEW.content_json) THEN NEW.content_json ELSE '{}' END,'$."+collection+"') n";
 const id=`CAST(json_extract(CASE WHEN ${n}.type='object' THEN ${n}.value ELSE '{}' END,'$.id') AS TEXT)`;
 const compare=op==='created'?`NOT EXISTS(SELECT 1 FROM ${old} WHERE CAST(json_extract(CASE WHEN o.type='object' THEN o.value ELSE '{}' END,'$.id') AS TEXT)=${id})`:op==='deleted'?`NOT EXISTS(SELECT 1 FROM ${fresh} WHERE CAST(json_extract(CASE WHEN n.type='object' THEN n.value ELSE '{}' END,'$.id') AS TEXT)=${id})`:`EXISTS(SELECT 1 FROM ${old} WHERE CAST(json_extract(CASE WHEN o.type='object' THEN o.value ELSE '{}' END,'$.id') AS TEXT)=${id} AND o.value IS NOT n.value)`;
 return `CREATE TRIGGER IF NOT EXISTS ${name} AFTER UPDATE OF content_json ON app_content WHEN NEW.content_key='club-pop' AND OLD.content_json IS NOT NEW.content_json BEGIN INSERT INTO audit_log(actor_type,actor_id,action,entity_type,entity_id,metadata_json,created_at) SELECT 'SYSTEM',NULL,${literal(key)},'app_content',json_array(${literal(collection)},${id}),json_object('unit',COALESCE(json_extract(CASE WHEN ${n}.type='object' THEN ${n}.value ELSE '{}' END,'$.unit'),'club'),'source_table','app_content','operation',${literal(op)},'evo_member_id',json_extract(CASE WHEN ${n}.type='object' THEN ${n}.value ELSE '{}' END,'$.memberId'),'status',json_extract(CASE WHEN ${n}.type='object' THEN ${n}.value ELSE '{}' END,'$.status'),'occurred_at',${op==='created'?`json_extract(CASE WHEN ${n}.type='object' THEN ${n}.value ELSE '{}' END,'$.createdAt')`:'NULL'},'time_basis',${literal(op==='created'?'source':'detection')},'capture_version',${literal(CAPTURE_VERSION)}),strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM ${op==='deleted'?old:fresh} WHERE json_valid(${n}.value) AND ${id} IS NOT NULL AND ${compare}; END`;
}

export async function ensureEventSourceCapture(db,table){
 const source=eventSources.find(s=>s.table===table&&s.lazy);if(!source)return;
 const active=await db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_cp_events_identity'").first();if(!active)return;
 await db.batch([...new Set(definitions(source).map(x=>x.op))].map(op=>db.prepare(captureSQL(source,op))));
}
