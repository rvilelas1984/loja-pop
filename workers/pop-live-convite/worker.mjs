import page from './page.mjs';
const headers={'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'};
const json=(data,status=200)=>Response.json(data,{status,headers});
const fail=(message,status)=>{throw Object.assign(new Error(message),{status})};
const hex=buffer=>Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,'0')).join('');
async function signature(env,value){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.INVITE_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)));
}
async function lookupEvo(db,unit,cpf,birth,hash){
 const message='Cadastro não localizado com esses dados nesta unidade. Confira ou fale com o professor.';
 const cfg=await db.prepare("SELECT dns,token FROM evo_unit_config WHERE unit=? AND enabled=1 AND expires_at>=date('now','-3 hours')").bind(unit).first();
 if(!cfg)fail('Consulta EVO indisponível. Fale com o professor.',503);
 const day="datetime(date('now','-3 hours'),'+3 hours')",month="datetime(date('now','-3 hours','start of month'),'+3 hours')";
 const reserved=await db.prepare(`INSERT INTO evo_request_log(unit,purpose,method,endpoint,status,ok)
 SELECT ?,'convite_live','GET','/api/v1/members/basic',0,0
 WHERE (SELECT COUNT(*) FROM evo_request_log WHERE unit=? AND created_at>=${day})<100
 AND (SELECT COUNT(*) FROM evo_request_log WHERE unit=? AND created_at>=${month})<1000
 AND (SELECT COUNT(*) FROM evo_request_log WHERE unit=? AND purpose='convite_live' AND created_at>=${day})<8`).bind(unit,unit,unit,unit).run();
 if(!reserved.meta.changes)fail('Limite de consultas EVO atingido. Peça ajuda ao professor.',429);
 const response=await fetch('https://evo-integracao.w12app.com.br/api/v1/members/basic?document='+cpf,{headers:{Authorization:'Basic '+btoa(cfg.dns+':'+cfg.token),Accept:'application/json'},signal:AbortSignal.timeout(8000)});
 await db.prepare('UPDATE evo_request_log SET status=?,ok=? WHERE id=?').bind(response.status,response.ok?1:0,reserved.meta.last_row_id).run();
 if(response.status===404)fail(message,404);
 if(!response.ok)fail('A EVO está indisponível. Tente novamente.',503);
 const raw=await response.json(),list=Array.isArray(raw)?raw:[raw.member||raw.data||raw];
 const valid=list.filter(p=>p&&String(p.document||p.cpf||'').replace(/\D/g,'')===cpf&&String(p.birthDate||'').slice(0,10)===birth);
 if(valid.length!==1||!/^\d+$/.test(String(valid[0].idMember))||!valid[0].firstName)fail(message,404);
 const p=valid[0],evo=String(p.idMember),field=unit==='gym'?'gym_client_id':'evo_member_id';
 await db.prepare(`INSERT OR IGNORE INTO members(${field},cpf_hash,cpf_last4,first_name,last_name,birth_date)
 SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM members WHERE cpf_hash=? OR ${field}=?)`).bind(evo,hash,cpf.slice(-4),p.firstName,p.lastName||'',birth,hash,evo).run();
 const member=await db.prepare(`SELECT id,birth_date,${field} evo FROM members WHERE cpf_hash=? AND ${field}=? AND substr(birth_date,1,10)=?`).bind(hash,evo,birth).first();
 if(!member)fail('Cadastro requer conferência pelo professor.',409);
 return member;
}
async function handle(req,env){
 const url=new URL(req.url),db=env.DB;
 if(req.method==='GET'&&url.pathname==='/'){
  return new Response(page,{headers:{...headers,'content-type':'text/html;charset=utf-8','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'"}});
 }
 if(req.method!=='POST')fail('Endereço inválido.',404);
 const issue=/^\/pop-live\/sessions\/(\d+)\/invite$/.exec(url.pathname);
 if(issue){
  const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
  if(!/^[\da-f-]{36}$/i.test(token)||!(await db.prepare('SELECT active FROM pop_live_app_tokens WHERE token=?').bind(token).first())?.active)fail('Autorize o APK para gerar o convite.',403);
  const session=await db.prepare("SELECT id FROM pop_live_sessions WHERE id=? AND status='planned'").bind(Number(issue[1])).first();
  if(!session)fail('Abra uma aula em preparação.',409);
  const payload=session.id+'.'+(Math.floor(Date.now()/1000)+5400);
  return json({ok:true,url:url.origin+'/#'+payload+'.'+await signature(env,payload)});
 }
 if(!['/aula','/buscar','/entrar'].includes(url.pathname))fail('Endereço inválido.',404);
 if(req.headers.get('origin')&&req.headers.get('origin')!==url.origin)fail('Origem inválida.',403);
 if(!/application\/json/.test(req.headers.get('content-type')||''))fail('Pedido inválido.',400);
 const raw=await req.text();if(raw.length>1200)fail('Pedido inválido.',400);
 let b;try{b=JSON.parse(raw)}catch{fail('Pedido inválido.',400)}
 const match=/^(\d{1,12})\.(\d{10})\.([0-9a-f]{64})$/.exec(b?.invite||'');
 if(!match||Number(match[2])<=Date.now()/1000||await signature(env,match[1]+'.'+match[2])!==match[3])fail('Convite inválido ou expirado. Peça o QR ao professor.',410);
 const sid=Number(match[1]);
 const s=await db.prepare("SELECT unit,class_name,starts_at FROM pop_live_sessions WHERE id=? AND status='planned'").bind(sid).first();
 if(!s)fail('Esta aula já fechou as inscrições.',409);
 if(url.pathname==='/aula')return json(s);
 if(!(await env.LIMIT.limit({key:req.headers.get('cf-connecting-ip')||'local'})).success)fail('Muitas tentativas. Aguarde um minuto.',429);
 const cpf=String(b.cpf||'').replace(/[.\s-]/g,''),birth=String(b.birth||'');
 if(!/^\d{11}$/.test(cpf)||!/^\d{4}-\d\d-\d\d$/.test(birth))fail('Confira CPF e nascimento.',400);
 const digit=n=>(cpf.slice(0,n).split('').reduce((sum,d,i)=>sum+Number(d)*(n+1-i),0)*10)%11%10;
 if(/^(\d)\1{10}$/.test(cpf)||digit(9)!==Number(cpf[9])||digit(10)!==Number(cpf[10]))fail('Confira o CPF.',400);
 const hash=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(cpf)));
 const matches=(await db.prepare(`SELECT id,birth_date,CASE WHEN ?='gym' THEN gym_client_id ELSE evo_member_id END evo FROM members
 WHERE cpf_hash=? AND (CASE WHEN ?='gym' THEN gym_client_id ELSE evo_member_id END) IS NOT NULL LIMIT 2`).bind(s.unit,hash,s.unit).all()).results;
 if(matches.length>1||(matches.length===1&&String(matches[0].birth_date||'').slice(0,10)!==birth))fail('Cadastro não localizado com esses dados nesta unidade. Confira ou fale com o professor.',404);
 const m=matches[0]||await lookupEvo(db,s.unit,cpf,birth,hash),evo=String(m.evo),type=s.unit==='gym'?'heart_rate':'cadence';
 const existing=()=>db.prepare('SELECT d.reference_number number FROM pop_live_session_devices a JOIN pop_live_devices d ON d.id=a.device_id WHERE a.session_id=? AND a.member_id=?').bind(sid,evo).first();
 const previous=await existing();if(previous)return json({registered:true,number:previous.number});
 const profile=await db.prepare(`SELECT (SELECT sex FROM pop_live_health_overrides WHERE member_id=?) sex,(SELECT personal_json FROM evo_member_master WHERE unit=? AND evo_member_id=?) personal`).bind(m.id,s.unit,evo).first();
 let personal={};try{personal=JSON.parse(profile.personal||'{}')||{}}catch{}
 const hasSex=['m','f','male','female','masculino','feminino'].includes(String(profile.sex||personal.gender||personal.sex||'').toLowerCase());
 const available="d.active=1 AND d.device_type=? AND (CASE WHEN ?='gym' THEN d.unit_gym ELSE d.unit_bike END)=1";
 if(url.pathname==='/buscar'){
  const devices=(await db.prepare(`SELECT d.id,d.reference_number number FROM pop_live_devices d WHERE ${available} AND NOT EXISTS(SELECT 1 FROM pop_live_session_devices a WHERE a.session_id=? AND a.device_id=d.id) ORDER BY CAST(d.reference_number AS INTEGER)`).bind(type,s.unit,sid).all()).results;
  return json({devices,needsSex:!hasSex});
 }
 if(!Number.isSafeInteger(b.device)||(!hasSex&&!['f','m'].includes(b.sex)))fail('Confira o dispositivo e o sexo.',400);
 const bound='EXISTS(SELECT 1 FROM pop_live_session_devices WHERE session_id=? AND device_id=? AND member_id=?)';
 const batch=[db.prepare(`INSERT OR IGNORE INTO pop_live_session_devices(session_id,device_id,member_id,connected_at)
 SELECT ?,d.id,?,CURRENT_TIMESTAMP FROM pop_live_devices d JOIN pop_live_sessions s ON s.id=? WHERE s.status='planned' AND d.id=? AND ${available}`).bind(sid,evo,sid,b.device,type,s.unit),
 db.prepare(`INSERT OR IGNORE INTO pop_live_selected_members(session_id,member_id,unit,evo_member_id) SELECT ?,?,?,? WHERE ${bound}`).bind(sid,m.id,s.unit,evo,sid,b.device,evo)];
 if(!hasSex)batch.push(db.prepare(`INSERT INTO pop_live_health_overrides(member_id,sex,updated_at) SELECT ?,?,CURRENT_TIMESTAMP WHERE ${bound} ON CONFLICT(member_id) DO NOTHING`).bind(m.id,b.sex,sid,b.device,evo));
 await db.batch(batch);
 const saved=await existing();if(!saved)fail('Dispositivo ocupado ou inscrições encerradas. Consulte novamente.',409);
 return json({registered:true,number:saved.number});
}
export default {async fetch(req,env){try{return await handle(req,env)}catch(e){return json({error:e.status?e.message:'Serviço indisponível. Tente novamente.'},e.status||503)}}};
