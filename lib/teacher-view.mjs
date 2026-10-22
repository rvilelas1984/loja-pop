// Teacher data access is resolved from the staff row on every request. No EVO calls.
export const TEACHER_PAGE='/visao-professores.html';
const parse=(v,fallback)=>{try{return JSON.parse(v)}catch{return fallback}};
export async function ensureTeacherLinks(db){
 const cols=await db.prepare('PRAGMA table_info(staff_users)').all();
 if(!(cols.results||[]).some(c=>c.name==='teacher_links_json')){
  try{await db.prepare("ALTER TABLE staff_users ADD COLUMN teacher_links_json TEXT NOT NULL DEFAULT '{}'").run()}
  catch(e){if(!/duplicate column/i.test(String(e.message)))throw e}
 }
}
export async function validateTeacherLinks(db,units,links){
 const out={};
 for(const unit of units){
  const name=typeof links?.[unit]==='string'?links[unit].trim():'';
  if(!['bike','gym'].includes(unit)||!name)return null;
  const found=await db.prepare('SELECT 1 AS found FROM evo_attendance_sessions WHERE unit=? AND TRIM(instructor_name)=? LIMIT 1').bind(unit,name).first();
  if(!found)return null;out[unit]=name;
 }
 return out;
}
export function chatWindow(row,config,now=Date.now()){
 const time=String(row.start_time||'').match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
 if(!time||!config?.enabled||['cancelled','canceled'].includes(row.status))return false;
 let h=Number(time[1]);if(time[3])h=h%12+(time[3].toUpperCase()==='PM'?12:0);
 const start=Date.parse(String(row.activity_date).slice(0,10)+'T'+String(h).padStart(2,'0')+':'+time[2]+':00-03:00');
 return Number.isFinite(start)&&now>=start-Number(config.open_before??30)*60000&&now<=start+(Number(config.duration_minutes??50)+Number(config.close_after??120))*60000;
}
export async function teacherView(request,env,identity){
 const reply=(o,status=200)=>new Response(JSON.stringify(o),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(!identity||!['admin','teacher'].includes(identity.role))return reply({ok:false,error:'NAO_AUTORIZADO'},401);
 if(!['GET','POST'].includes(request.method))return reply({ok:false,error:'METODO_INVALIDO'},405);
 const db=env.DB,url=new URL(request.url),admin=identity.role==='admin';
 let profiles=[];
 if(admin){
  const r=await db.prepare("SELECT DISTINCT unit,TRIM(instructor_name) AS name FROM evo_attendance_sessions WHERE unit IN ('bike','gym') AND TRIM(COALESCE(instructor_name,''))<>'' ORDER BY name,unit").all();
  profiles=r.results||[];
 }else{
  const u=await db.prepare('SELECT name,role,enabled,units_json,teacher_links_json FROM staff_users WHERE id=?').bind(Number(identity.id)||0).first();
  if(!u?.enabled||u.role!=='teacher')return reply({ok:false,error:'ACESSO_REVOGADO'},403);
  const links=parse(u.teacher_links_json,{});profiles=parse(u.units_json,[]).filter(x=>['bike','gym'].includes(x)&&typeof links[x]==='string'&&links[x]).map(unit=>({unit,name:links[unit]}));
  identity={...identity,name:u.name};
 }
 if(url.searchParams.get('action')==='catalog')return admin?reply({ok:true,profiles}):reply({ok:false,error:'NAO_AUTORIZADO'},403);
 const unit=url.searchParams.get('unit')||'all',teacher=url.searchParams.get('teacher')||'';
 if(!['all','bike','gym'].includes(unit))return reply({ok:false,error:'UNIDADE_INVALIDA'},400);
 if(!admin&&teacher)return reply({ok:false,error:'PROFESSOR_FIXO'},403);
 const selected=profiles.filter(p=>(unit==='all'||p.unit===unit)&&(!admin||p.name===teacher));
 if(!admin&&unit!=='all'&&!selected.length)return reply({ok:false,error:'UNIDADE_SEM_ACESSO'},403);
 if(!selected.length)return reply({ok:true,admin,name:identity.name,profiles,sessions:[],upcoming:[],source:'d1',evoRequestsMade:0});
 const where=selected.map(()=>'(s.unit=? AND TRIM(s.instructor_name)=?)').join(' OR '),args=selected.flatMap(p=>[p.unit,p.name]);
 if(url.searchParams.get('action')==='chat'){
  const sid=url.searchParams.get('session_id');
  if(!sid||unit==='all')return reply({ok:false,error:'AULA_INVALIDA'},400);
  const row=await db.prepare(`SELECT s.* FROM evo_attendance_sessions s WHERE (${where}) AND s.unit=? AND CAST(s.id_activity_session AS TEXT)=? LIMIT 1`).bind(...args,unit,sid).first();
  if(!row)return reply({ok:false,error:'AULA_SEM_ACESSO'},403);
  const config=await db.prepare('SELECT * FROM class_chat_settings WHERE unit=?').bind(unit).first();
  if(!chatWindow(row,config))return reply({ok:false,error:'CHAT_INDISPONIVEL'},403);
  const memberId='staff:'+String(identity.id||'admin');
  if(request.method==='POST'){
   const b=await request.json().catch(()=>({})),content=String(b.content||'').trim();
   if(!content||content.length>500)return reply({ok:false,error:'MENSAGEM_INVALIDA'},400);
   const last=await db.prepare('SELECT created_at FROM class_chat_messages WHERE unit=? AND session_id=? AND member_id=? ORDER BY id DESC LIMIT 1').bind(unit,sid,memberId).first();
   if(last&&Date.now()-Date.parse(last.created_at.replace(' ','T')+'Z')<3000)return reply({ok:false,error:'AGUARDE_PARA_ENVIAR'},429);
   await db.prepare('INSERT INTO class_chat_messages(unit,session_id,member_id,slot_number,content) VALUES(?,?,?,?,?)').bind(unit,sid,memberId,0,content).run();
  }
  const msgs=await db.prepare('SELECT id,member_id,slot_number,content,created_at FROM class_chat_messages WHERE unit=? AND session_id=? AND deleted=0 ORDER BY id DESC LIMIT 60').bind(unit,sid).all();
  return reply({ok:true,messages:(msgs.results||[]).reverse().map(m=>({id:m.id,content:m.content,created_at:m.created_at,mine:m.member_id===memberId,label:m.member_id==='staff:admin'?'Administrador':String(m.member_id).startsWith('staff:')?'Professor':'Aluno · '+m.slot_number}))});
 }
 if(request.method!=='GET')return reply({ok:false,error:'METODO_INVALIDO'},405);
 const month=url.searchParams.get('month')||new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date());
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return reply({ok:false,error:'MES_INVALIDO'},400);
 const history=await db.prepare(`SELECT s.unit,s.id_activity_session,s.activity_date,s.start_time,s.activity_name,s.instructor_name,s.attendance_count,s.status FROM evo_attendance_sessions s WHERE (${where}) AND substr(s.activity_date,1,7)=? AND s.status='done' ORDER BY s.activity_date DESC,s.start_time DESC`).bind(...args,month).all();
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const agenda=await db.prepare(`SELECT s.unit,s.id_activity_session,s.activity_date,s.start_time,s.activity_name,s.instructor_name,s.status,s.attendance_count,(SELECT COUNT(*) FROM checkin_reservation_snapshots r WHERE r.unit=s.unit AND r.session_id=CAST(s.id_activity_session AS TEXT) AND r.removed=0 AND COALESCE(r.status,'') NOT IN ('cancelled','canceled')) AS reservations FROM evo_attendance_sessions s WHERE (${where}) AND s.activity_date>=? AND s.status NOT IN ('cancelled','canceled') ORDER BY s.activity_date,s.start_time LIMIT 100`).bind(...args,today).all();
 const configs=await db.prepare('SELECT * FROM class_chat_settings').all();
 const upcoming=(agenda.results||[]).map(x=>({...x,reservations:x.status==='done'?Number(x.attendance_count||0):Number(x.reservations||0),countLabel:x.status==='done'?'presenças':'reservas',chatAvailable:chatWindow(x,(configs.results||[]).find(c=>c.unit===x.unit))})).filter(x=>{if(x.chatAvailable||x.activity_date>today)return true;if(x.activity_date!==today)return false;const m=String(x.start_time||'').match(/^(\d{1,2}):(\d{2})/);if(!m)return false;const end=Date.parse(x.activity_date+'T'+String(m[1]).padStart(2,'0')+':'+m[2]+':00-03:00')+60*60000;return Date.now()<end;}); 
 return reply({ok:true,admin,name:identity.name,profiles,sessions:history.results||[],upcoming,source:'d1',evoRequestsMade:0});
}
