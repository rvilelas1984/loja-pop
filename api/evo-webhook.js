export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({ok:false});
 const secret=process.env.EVO_WEBHOOK_SECRET;if(secret&&String(req.headers["x-clubpop-webhook"]||"")!==secret)return res.status(401).json({ok:false});
 const type=String(req.body?.eventType||req.body?.EventType||"");const allowed=new Set(["ActivityEnroll","AppointmentEnroll","CancelAppointment","EndedSessionActivity","EndedSessionAppointment","SpotAvailable"]);
 if(type&&!allowed.has(type))return res.status(202).json({ok:true,ignored:true});
 return res.status(200).json({ok:true,received:true,eventType:type||null,idActivitySession:req.body?.idActivitySession||req.body?.idSession||null});
}