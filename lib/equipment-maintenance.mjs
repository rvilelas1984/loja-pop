const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const clean=(v,n=180)=>String(v??"").trim().slice(0,n);
export async function equipmentMaintenance(request,env,url){
 const ck=request.headers.get("x-clubpop-admin-cookie")||"";
 if(!ck)return response({ok:false,error:"NAO_AUTORIZADO"},401);
 let session;try{const r=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}});session=await r.json();if(!r.ok)throw Error()}catch{return response({ok:false,error:"SESSAO_INDISPONIVEL"},503)}
 if(!["admin","reception"].includes(session.role))return response({ok:false,error:"NAO_AUTORIZADO"},403);
 const unit=clean(url.searchParams.get("unit")||"bike",10);
 if(!["bike","gym"].includes(unit)||!(session.units||[]).includes(unit))return response({ok:false,error:"UNIDADE_NAO_AUTORIZADA"},403);
 try{
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_equipment (id INTEGER PRIMARY KEY AUTOINCREMENT,unit TEXT NOT NULL,type TEXT NOT NULL,serial TEXT NOT NULL,identifier TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(unit,serial))").run();
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_equipment_issues (id INTEGER PRIMARY KEY AUTOINCREMENT,unit TEXT NOT NULL,label TEXT NOT NULL,UNIQUE(unit,label))").run();
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_equipment_maintenance (id INTEGER PRIMARY KEY AUTOINCREMENT,unit TEXT NOT NULL,equipment_id INTEGER NOT NULL,issue_id INTEGER NOT NULL,side TEXT,room_position TEXT,status TEXT NOT NULL DEFAULT 'pending',opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT,notes TEXT,FOREIGN KEY(equipment_id) REFERENCES club_equipment(id))").run();
 const list=async()=>{const [equipment,issues,maintenance]=await Promise.all([
 env.DB.prepare("SELECT * FROM club_equipment WHERE unit=? ORDER BY type,identifier,id").bind(unit).all(),
 env.DB.prepare("SELECT * FROM club_equipment_issues WHERE unit=? ORDER BY label").bind(unit).all(),
 env.DB.prepare("SELECT m.*,e.type,e.serial,e.identifier,i.label AS issue FROM club_equipment_maintenance m JOIN club_equipment e ON e.id=m.equipment_id JOIN club_equipment_issues i ON i.id=m.issue_id WHERE m.unit=? ORDER BY CASE m.status WHEN 'pending' THEN 0 ELSE 1 END,m.opened_at DESC,m.id DESC LIMIT 500").bind(unit).all()]);
 return response({ok:true,equipment:equipment.results||[],issues:issues.results||[],maintenance:maintenance.results||[]})};
 if(request.method==="GET")return list();
 if(request.method!=="POST")return response({ok:false,error:"METODO_INVALIDO"},405);
 const b=await request.json().catch(()=>({})),action=clean(b.action,30);
 if(action==="equipment"){
  const type=clean(b.type,80),serial=clean(b.serial,120),identifier=clean(b.identifier,120);
  if(!type||!serial)return response({ok:false,error:"TIPO_E_NUMERO_DE_SERIE_OBRIGATORIOS"},400);
  const existing=await env.DB.prepare("SELECT id,type,identifier FROM club_equipment WHERE unit=? AND serial=?").bind(unit,serial).first();
  if(existing)return response({ok:false,error:"SERIE_JA_CADASTRADA",equipment:existing},409);
  await env.DB.prepare("INSERT INTO club_equipment(unit,type,serial,identifier) VALUES(?,?,?,?)").bind(unit,type,serial,identifier).run();return list();
 }
 if(action==="maintenance"){
  const equipmentId=Number(b.equipmentId),issue=clean(b.issue,120),side=clean(b.side,10),position=clean(b.position,120),notes=clean(b.notes,1000);
  if(!Number.isSafeInteger(equipmentId)||equipmentId<1||!issue||!["","right","left"].includes(side))return response({ok:false,error:"DADOS_INVALIDOS"},400);
  const eq=await env.DB.prepare("SELECT id FROM club_equipment WHERE id=? AND unit=?").bind(equipmentId,unit).first();if(!eq)return response({ok:false,error:"EQUIPAMENTO_NAO_ENCONTRADO"},404);
  await env.DB.prepare("INSERT OR IGNORE INTO club_equipment_issues(unit,label) VALUES(?,?)").bind(unit,issue).run();
  const problem=await env.DB.prepare("SELECT id FROM club_equipment_issues WHERE unit=? AND label=?").bind(unit,issue).first();
  await env.DB.prepare("INSERT INTO club_equipment_maintenance(unit,equipment_id,issue_id,side,room_position,notes) VALUES(?,?,?,?,?,?)").bind(unit,equipmentId,problem.id,side||null,position,notes).run();return list();
 }
 if(action==="complete"){
  const id=Number(b.id);if(!Number.isSafeInteger(id)||id<1)return response({ok:false,error:"ID_INVALIDO"},400);
  const x=await env.DB.prepare("UPDATE club_equipment_maintenance SET status='completed',completed_at=CURRENT_TIMESTAMP WHERE id=? AND unit=? AND status='pending'").bind(id,unit).run();
  if(!x.meta?.changes)return response({ok:false,error:"MANUTENCAO_NAO_PENDENTE"},409);return list();
 }
 return response({ok:false,error:"ACAO_INVALIDA"},400);
 }catch(e){return response({ok:false,error:"FALHA_MANUTENCAO",detail:String(e.message||"").slice(0,160)},500)}
}
