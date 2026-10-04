export default {
 async fetch(){return new Response('Not found',{status:404})},
 async scheduled(event,env){
  const job=await env.DB.prepare("UPDATE evo_sync_probe SET state='running' WHERE id=(SELECT id FROM evo_sync_probe WHERE id>=14 AND id<=18 AND state='pending' ORDER BY id LIMIT 1) AND state='pending' RETURNING id,endpoint").first();if(!job)return;
  try{
   const allowed=new Set(['/api/v2/activities/member/sessions?dateStart=2026-10-01T00%3A00%3A00&dateEnd=2026-10-04T23%3A59%3A59&skip=0&take=25','/api/v1/activities/schedule/detail?idActivitySession=19065967','/api/v1/activities/schedule/detail?idActivitySession=19225314','/api/v1/activities/schedule/detail?idActivitySession=19225246','/api/v1/activities/schedule?date=2026-10-03&showFullWeek=false&onlyAvailables=false&take=100']);
   if(!allowed.has(job.endpoint))throw Error('ENDPOINT_NOT_ALLOWED');
   const cfg=await env.DB.prepare("SELECT dns,token,enabled,expires_at FROM evo_unit_config WHERE unit='bike'").first();const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());if(!cfg||cfg.enabled!==1||cfg.expires_at<today)throw Error('CONFIG_INVALIDA');
   const path=new URL(job.endpoint,'https://evo-integracao-api.w12app.com.br');
   const log=await env.DB.prepare("INSERT INTO evo_request_log(unit,purpose,method,endpoint,status,ok) VALUES('bike','attendance','GET',?,NULL,0) RETURNING id").bind(path.pathname).first();
   const r=await fetch(path.href,{headers:{Authorization:'Basic '+btoa(cfg.dns+':'+cfg.token),Accept:'application/json'},redirect:'manual'});
   await env.DB.prepare('UPDATE evo_request_log SET status=?,ok=? WHERE id=?').bind(r.status,r.ok?1:0,log.id).run();
   const data=await r.json().catch(()=>null);const safeKeys=new Set(['idMember','idCliente','idActivitySession','idActivitieSession','idConfiguration','date','dateStart','startTime','endTime','presenca','isFinalized','flCheckin','status','removed','flRemovido','participantes','participants','enrollments','items','data','list','activities','sessions']);
   const keys=new Set();const sanitize=v=>{if(Array.isArray(v))return v.map(sanitize);if(v&&typeof v==='object'){const o={};for(const[k,x]of Object.entries(v)){keys.add(k);if(safeKeys.has(k))o[k]=sanitize(x)}return o}return v};
   const sanitized=r.ok?sanitize(data):null;
   await env.DB.prepare("UPDATE evo_sync_probe SET state='done',result_json=? WHERE id=?").bind(JSON.stringify({status:r.status,requests:1,keys:[...keys],data:sanitized}),job.id).run();
  }catch(e){await env.DB.prepare("UPDATE evo_sync_probe SET state='failed',result_json=? WHERE id=?").bind(JSON.stringify({error:String(e.message).slice(0,100)}),job.id).run();}
 }
};
