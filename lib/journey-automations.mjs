
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const validUnit=u=>u==="bike"||u==="gym";
const daysValid=a=>Array.isArray(a)&&a.length>0&&a.length<=7&&a.every(x=>/^[0-6]$/.test(String(x)));
const timeValid=t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(t));
async function setup(db){
 await db.prepare("CREATE TABLE IF NOT EXISTS club_journey_automations(id INTEGER PRIMARY KEY AUTOINCREMENT,unit TEXT NOT NULL,name TEXT NOT NULL,rule TEXT NOT NULL,flow_id TEXT NOT NULL,days_json TEXT NOT NULL,time_hhmm TEXT NOT NULL,delay_days INTEGER NOT NULL DEFAULT 0,extra_text TEXT NOT NULL DEFAULT '',enabled INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
 await db.prepare("CREATE TABLE IF NOT EXISTS club_journey_automation_runs(id INTEGER PRIMARY KEY AUTOINCREMENT,unit TEXT NOT NULL,automation_id INTEGER NOT NULL,student_id TEXT,slot TEXT NOT NULL,status TEXT NOT NULL,detail TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(unit,automation_id,student_id,slot))").run();
}
export async function journeyAutomationAdmin(request,env,url){
 const ck=request.headers.get("x-clubpop-admin-cookie")||"";
 if(!ck)return respond({ok:false,error:"NAO_AUTORIZADO"},401);
 let actor;try{const r=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}});actor=await r.json();if(!r.ok)throw Error("AUTH")}catch{return respond({ok:false,error:"FALHA_AUTENTICACAO"},503)}
 if(!["admin","reception"].includes(String(actor.role||"")))return respond({ok:false,error:"NAO_AUTORIZADO"},403);
 const unit=String(url.searchParams.get("unit")||"");
 if(!validUnit(unit)||!Array.isArray(actor.units)||!actor.units.includes(unit))return respond({ok:false,error:"UNIDADE_NAO_AUTORIZADA"},403);
 try{
 await setup(env.DB);
 const list=async()=>{const a=await env.DB.prepare("SELECT id,unit,name,rule,flow_id flowId,days_json daysJson,time_hhmm time,delay_days delay,extra_text extra,enabled,created_at createdAt,updated_at updatedAt FROM club_journey_automations WHERE unit=? ORDER BY id DESC").bind(unit).all();const logs=await env.DB.prepare("SELECT id,automation_id automationId,student_id studentId,slot,status,detail,created_at createdAt FROM club_journey_automation_runs WHERE unit=? ORDER BY id DESC LIMIT 100").bind(unit).all();return respond({ok:true,automations:(a.results||[]).map(x=>({...x,days:JSON.parse(x.daysJson),enabled:!!x.enabled})),runs:logs.results||[]})};
 if(request.method==="GET")return list();
 if(request.method!=="POST")return respond({ok:false,error:"METODO_INVALIDO"},405);
 const b=await request.json().catch(()=>({})),action=String(b.action||"");
 if(action==="save"){
  const name=String(b.name||"").trim().slice(0,120),rule=String(b.rule||""),flowId=String(b.flowId||"").trim().slice(0,120),days=(b.days||[]).map(String),time=String(b.time||""),delay=Number(b.delay),extra=String(b.extra||"").trim().slice(0,500);
  if(!name||!["new","unbooked","booked","no_show","attended","converted","inactive"].includes(rule)||!flowId||!daysValid(days)||!timeValid(time)||!Number.isInteger(delay)||delay<0||delay>90)return respond({ok:false,error:"CONFIGURACAO_INVALIDA"},400);
  if(b.id){const id=Number(b.id);const x=await env.DB.prepare("UPDATE club_journey_automations SET name=?,rule=?,flow_id=?,days_json=?,time_hhmm=?,delay_days=?,extra_text=?,enabled=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND unit=?").bind(name,rule,flowId,JSON.stringify(days),time,delay,extra,id,unit).run();if(!x.meta?.changes)return respond({ok:false,error:"NAO_ENCONTRADA"},404)}
  else await env.DB.prepare("INSERT INTO club_journey_automations(unit,name,rule,flow_id,days_json,time_hhmm,delay_days,extra_text,enabled) VALUES(?,?,?,?,?,?,?,?,0)").bind(unit,name,rule,flowId,JSON.stringify(days),time,delay,extra).run();
  return list();
 }
 if(action==="delete"){const x=await env.DB.prepare("DELETE FROM club_journey_automations WHERE id=? AND unit=?").bind(Number(b.id),unit).run();if(!x.meta?.changes)return respond({ok:false,error:"NAO_ENCONTRADA"},404);return list()}
 if(action==="disable"){await env.DB.prepare("UPDATE club_journey_automations SET enabled=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND unit=?").bind(Number(b.id),unit).run();return list()}
 return respond({ok:false,error:"ACAO_INVALIDA"},400);
 }catch(e){return respond({ok:false,error:"FALHA_AUTOMACAO",detail:String(e.message||"").slice(0,150)},500)}
}
