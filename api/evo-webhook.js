export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({ok:false,error:"Método não permitido"});
 const secret=process.env.EVO_WEBHOOK_SECRET;
 if(secret&&String(req.headers["x-clubpop-webhook"]||"")!==secret)return res.status(401).json({ok:false,error:"Webhook não autorizado"});
 const body=req.body||{};
 const eventType=String(body.EventType||body.eventType||"").trim();
 const idRecord=body.IdRecord??body.idRecord??null;
 const apiCallback=body.ApiCallback||body.apiCallback||null;
 const allowed=new Set(["ActivityEnroll","AppointmentEnroll","CancelAppointment","EndedSessionActivity","EndedSessionAppointment","SpotAvailable"]);
 if(eventType&&!allowed.has(eventType))return res.status(202).json({ok:true,ignored:true,eventType});
 return res.status(200).json({ok:true,received:true,eventType:eventType||null,idRecord,hasApiCallback:Boolean(apiCallback)});
}