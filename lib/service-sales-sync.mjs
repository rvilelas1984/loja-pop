// Service purchases from EVO Sales API. Unlike the service catalog, these rows are linked to a member.
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const dateOK=s=>/^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(s||''))&&!Number.isNaN(Date.parse(s+'T12:00:00Z'));
export async function ensureServiceSalesTables(db){
 await db.prepare("CREATE TABLE IF NOT EXISTS evo_member_service_sales(unit TEXT NOT NULL,id_sale TEXT NOT NULL,id_sale_item TEXT NOT NULL,evo_member_id TEXT,id_prospect TEXT,id_service TEXT,service_name TEXT NOT NULL,sale_date TEXT,quantity INTEGER NOT NULL DEFAULT 1,removed INTEGER NOT NULL DEFAULT 0,raw_json TEXT,synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,id_sale,id_sale_item))").run();
 await db.prepare("CREATE INDEX IF NOT EXISTS idx_member_service_sales ON evo_member_service_sales(unit,evo_member_id,sale_date)").run();
 await db.prepare("CREATE TABLE IF NOT EXISTS evo_service_sales_sync_runs(id TEXT PRIMARY KEY,unit TEXT NOT NULL,date_from TEXT NOT NULL,date_to TEXT NOT NULL,next_skip INTEGER NOT NULL DEFAULT 0,requests INTEGER NOT NULL DEFAULT 0,saved INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'pending',error TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
}
export async function serviceSalesPage(env,getEvoConfig,{unit,from,to,skip=0,runId}){
 if(!['bike','gym'].includes(unit)||!dateOK(from)||!dateOK(to)||from>to||skip<0||!Number.isInteger(skip)||skip>100000)return {ok:false,error:'PARAMETROS_INVALIDOS'};
 await ensureServiceSalesTables(env.DB);
 const cfg=await getEvoConfig(env,unit);
 const qs=new URLSearchParams({dateSaleStart:from,dateSaleEnd:to,take:'100',skip:String(skip),showReceivables:'false',onlyMembership:'false'});
 const url='https://evo-integracao-api.w12app.com.br/api/v2/sales?'+qs;
 const response=await fetch(url,{headers:{Authorization:'Basic '+btoa(cfg.dns+':'+cfg.token),Accept:'application/json'},signal:AbortSignal.timeout(25000),cache:'no-store'});
 try{await env.DB.prepare("INSERT INTO evo_request_log(unit,purpose,method,endpoint,status,ok) VALUES(?,'service_sales_sync','GET','/api/v2/sales',?,?)").bind(unit,response.status,response.ok?1:0).run()}catch{}
 if(!response.ok)throw Error('EVO_HTTP_'+response.status);
 const payload=await response.json();
 const sales=Array.isArray(payload)?payload:Array.isArray(payload?.items)?payload.items:Array.isArray(payload?.data)?payload.data:Array.isArray(payload?.results)?payload.results:null;
 if(!sales||sales.length>100)throw Error('FORMATO_VENDAS_EVO_INESPERADO');
 let saved=0,ignored=0;
 for(const sale of sales){
   const idSale=String(sale.idSale||'');if(!idSale){ignored++;continue}
   const items=Array.isArray(sale.saleItens)?sale.saleItens:Array.isArray(sale.saleItems)?sale.saleItems:[];
   for(let i=0;i<items.length;i++){
     const item=items[i],serviceId=String(item.idService||'');if(!serviceId||serviceId==='0')continue;
     const itemId=String(item.idSaleItem||'index-'+i),member=String(sale.idMember||sale.member?.idMember||'')||null;
     await env.DB.prepare("INSERT INTO evo_member_service_sales(unit,id_sale,id_sale_item,evo_member_id,id_prospect,id_service,service_name,sale_date,quantity,removed,raw_json,synced_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,id_sale,id_sale_item) DO UPDATE SET evo_member_id=excluded.evo_member_id,id_prospect=excluded.id_prospect,id_service=excluded.id_service,service_name=excluded.service_name,sale_date=excluded.sale_date,quantity=excluded.quantity,removed=excluded.removed,raw_json=excluded.raw_json,synced_at=CURRENT_TIMESTAMP").bind(unit,idSale,itemId,member,String(sale.idProspect||'')||null,serviceId,String(item.item||item.description||'Serviço EVO').slice(0,250),String(sale.saleDate||'').slice(0,19),Number(item.quantity||1),sale.removed?1:0,JSON.stringify({saleId:idSale,item}).slice(0,10000)).run();saved++;
   }
 }
 const nextSkip=skip+sales.length,done=sales.length<100;
 if(runId){await env.DB.prepare("INSERT INTO evo_service_sales_sync_runs(id,unit,date_from,date_to,next_skip,requests,saved,status,updated_at) VALUES(?,?,?,?,?,1,?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET next_skip=excluded.next_skip,requests=requests+1,saved=saved+excluded.saved,status=excluded.status,error=NULL,updated_at=CURRENT_TIMESTAMP").bind(runId,unit,from,to,nextSkip,saved,done?'done':'running').run()}
 return {ok:true,unit,from,to,skip,nextSkip,pageSize:100,received:sales.length,saved,ignored,done};
}
export async function serviceSalesAdmin(request,env,url,getEvoConfig){
 const unit=String(url.searchParams.get('unit')||'bike');
 if(!['bike','gym'].includes(unit))return json({ok:false,error:'UNIDADE_INVALIDA'},400);
 await ensureServiceSalesTables(env.DB);
 if(request.method==='GET'){
  const [last,summary,schedule]=await Promise.all([
   env.DB.prepare("SELECT * FROM evo_service_sales_sync_runs WHERE unit=? ORDER BY updated_at DESC LIMIT 1").bind(unit).first(),
   env.DB.prepare("SELECT COUNT(*) items,COUNT(DISTINCT evo_member_id) members,MAX(synced_at) last_sync FROM evo_member_service_sales WHERE unit=?").bind(unit).first(),
   env.DB.prepare("SELECT times_json FROM evo_sync_schedules WHERE unit=? AND kind='service_sales'").bind(unit).first()
  ]);
  return json({ok:true,unit,last,summary,schedule:schedule?JSON.parse(schedule.times_json):[]});
 }
 const b=await request.json().catch(()=>({}));
 if(b.action==='schedule'){
  const times=Array.isArray(b.times)?[...new Set(b.times.filter(x=>/^([01]\d|2[0-3]):[0-5]\d$/.test(x)))].sort():[];
  if(times.length>6)return json({ok:false,error:'HORARIOS_INVALIDOS'},400);
  await env.DB.prepare("INSERT INTO evo_sync_schedules(unit,kind,times_json,updated_at) VALUES(?,'service_sales',?,CURRENT_TIMESTAMP) ON CONFLICT(unit,kind) DO UPDATE SET times_json=excluded.times_json,updated_at=CURRENT_TIMESTAMP").bind(unit,JSON.stringify(times)).run();
  return json({ok:true,times});
 }
 if(b.action!=='page')return json({ok:false,error:'ACAO_INVALIDA'},400);
 const from=String(b.from||''),to=String(b.to||''),skip=Number(b.skip||0);
 if(!dateOK(from)||!dateOK(to)||from>to||Math.round((Date.parse(to)-Date.parse(from))/86400000)>31)return json({ok:false,error:'PERIODO_INVALIDO_MAX_32_DIAS'},400);
 const runId=String(b.runId||('manual-'+unit+'-'+from+'-'+to)).slice(0,120);
 try{return json(await serviceSalesPage(env,getEvoConfig,{unit,from,to,skip,runId}))}
 catch(e){await env.DB.prepare("INSERT INTO evo_service_sales_sync_runs(id,unit,date_from,date_to,status,error) VALUES(?,?,?,?,'failed',?) ON CONFLICT(id) DO UPDATE SET status='failed',error=excluded.error,updated_at=CURRENT_TIMESTAMP").bind(runId,unit,from,to,String(e.message||e).slice(0,400)).run();return json({ok:false,error:String(e.message||e)},502)}
}
export async function scheduledServiceSales(env,getEvoConfig){
 await ensureServiceSalesTables(env.DB);
 const schedules=(await env.DB.prepare("SELECT unit,times_json FROM evo_sync_schedules WHERE kind='service_sales'").all()).results||[];
 const now=new Date(Date.now()-3*3600000),minute=now.toISOString().slice(0,16),day=minute.slice(0,10),yesterday=new Date(Date.parse(day+'T12:00:00Z')-86400000).toISOString().slice(0,10);
 for(const s of schedules){
  let times=[];try{times=JSON.parse(s.times_json||'[]')}catch{}
  if(!times.includes(minute.slice(11,16)))continue;
  const id='auto-'+s.unit+'-'+minute;
  const existing=await env.DB.prepare("SELECT id FROM evo_service_sales_sync_runs WHERE id=?").bind(id).first();if(existing)continue;
  await env.DB.prepare("INSERT INTO evo_service_sales_sync_runs(id,unit,date_from,date_to,status) VALUES(?,?,?,?,'running')").bind(id,s.unit,yesterday,day).run();
  try{let skip=0;for(let page=0;page<3;page++){const result=await serviceSalesPage(env,getEvoConfig,{unit:s.unit,from:yesterday,to:day,skip,runId:id});skip=result.nextSkip;if(result.done)break;}}
  catch(e){await env.DB.prepare("UPDATE evo_service_sales_sync_runs SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(String(e.message||e).slice(0,400),id).run()}
 }
}
