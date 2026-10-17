import {session as adminSession} from './admin-auth.js';
const WORKER='https://club-pop-api.renato-vilelas-personal.workers.dev';
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'METODO_INVALIDO'});
 const user=adminSession(req);
 if(!user||user.role!=='admin'||!user.units?.includes('bike'))return res.status(403).json({ok:false,error:'NAO_AUTORIZADO'});
 const params=new URLSearchParams();
 for(const key of ['page','q','min','max','order'])if(req.query[key]!=null)params.set(key,String(req.query[key]));
 try{
  const r=await fetch(WORKER+'/admin/bike-stars?'+params,{headers:{'x-clubpop-admin-cookie':String(req.headers.cookie||'')},cache:'no-store'});
  const body=await r.text();res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');return res.status(r.status).send(body);
 }catch{return res.status(502).json({ok:false,error:'CONSULTA_INDISPONIVEL'});}
}
