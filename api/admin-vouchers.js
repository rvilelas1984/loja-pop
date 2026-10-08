import crypto from "node:crypto";
import {getEvoTransport} from "../lib/evo-transport.js";
const send=(res,status,data)=>{res.setHeader("Cache-Control","no-store");return res.status(status).json(data)};
function isAdmin(req){const k=process.env.ADMIN_KEY;if(!k)return false;const cookie=String(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("clubpop_admin="));if(!cookie)return false;const p=cookie.slice(14).split(".");if(p.length!==3)return false;const [payload,expiry,sig]=p;if(!/^\d+$/.test(expiry)||Number(expiry)<Date.now())return false;const actual=crypto.createHmac("sha256",k).update(payload+"."+expiry).digest("hex");try{if(!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(actual)))return false;const session=JSON.parse(Buffer.from(payload,"base64url").toString());return session.role==="admin"&&(session.permissions?.includes("*")||session.permissions?.includes("/admin-vouchers.html"))}catch{return false}}
export default async function handler(req,res){
 if(req.method!=="POST")return send(res,405,{ok:false,error:"METODO_INVALIDO"});
 if(!isAdmin(req))return send(res,401,{ok:false,error:"ADMIN_NAO_AUTORIZADO"});
 const b=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
 const unit=String(b.unit||"").toLowerCase();
 if(!["bike","gym"].includes(unit))return send(res,400,{ok:false,error:"UNIDADE_INVALIDA"});
 const ids=Array.isArray(b.idsContratos)?b.idsContratos.map(Number):[];
 const value=Number(b.valor),qtde=Number(b.qtde);
 const inicio=String(b.inicio||""),validade=String(b.validade||"");
 if(!ids.length||ids.some(x=>!Number.isSafeInteger(x)||x<=0)||!Number.isSafeInteger(qtde)||qtde<1||qtde>50||![1,2].includes(b.tipoDesconto)||!Number.isFinite(value)||value<=0||(b.tipoDesconto===1&&value>100)||!/^.{3,100}$/.test(String(b.nome||""))||!/^\d{4}-\d{2}-\d{2}$/.test(inicio)||!/^\d{4}-\d{2}-\d{2}$/.test(validade)||validade<inicio)return send(res,400,{ok:false,error:"CAMPOS_OBRIGATORIOS_INVALIDOS"});
 const payload={nome:String(b.nome).trim(),qtde,flIlimitado:false,flUtilizarSite:!!b.flUtilizarSite,validade:validade+"T23:59:59",inicio:inicio+"T00:00:00",flCodigoUnico:!!b.flCodigoUnico,tipoDesconto:b.tipoDesconto,valor:value,flContrato:true,idsContratos:ids,idsServicos:[],flDebitoRecorrente:!!b.flDebitoRecorrente,flNaoPermiteConvenio:!!b.flNaoPermiteConvenio};
 if(b.mesesDescontoRecorrente){const m=Number(b.mesesDescontoRecorrente);if(!Number.isSafeInteger(m)||m<1||m>120)return send(res,400,{ok:false,error:"MESES_INVALIDOS"});payload.mesesDescontoRecorrente=m}
 try{const cfg=getEvoTransport(unit);if(!cfg.configured)return send(res,503,{ok:false,error:"UNIDADE_SEM_EVO"});const r=await cfg.fetch("https://evo-integracao-api.w12app.com.br/api/v2/voucher",{method:"POST",body:JSON.stringify(payload)});const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{data={message:raw.slice(0,300)}};return send(res,r.status,{ok:r.ok,unit,voucherId:data?.voucherId??null,evoResponse:data,evoRequestsMade:1})}catch(e){return send(res,e.status||502,{ok:false,error:e.code||"ERRO_TRANSPORTE_EVO",detail:String(e.message||"").slice(0,160),evoRequestsMade:0})}
}