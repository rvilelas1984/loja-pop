// Club Pop profile photos: authenticated owner writes, opaque public image token for TV cards.
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const schema="CREATE TABLE IF NOT EXISTS club_profile_photos (member_id INTEGER PRIMARY KEY, photo_token TEXT NOT NULL UNIQUE, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)";
export async function profilePhotoRoute(request,env,member){
 const url=new URL(request.url),path=url.pathname;
 if(path.startsWith("/member/profile-photo/image/")){
  if(request.method!=="GET")return reply({ok:false,error:"METODO_INVALIDO"},405);
  const token=path.split("/").pop();
  if(!/^[0-9a-f-]{36}$/.test(token))return new Response("Not found",{status:404});
  const object=await env.MEDIA_BUCKET?.get("profile-photos/"+token+".webp");
  if(!object)return new Response("Not found",{status:404});
  return new Response(object.body,{headers:{"content-type":object.httpMetadata?.contentType||"image/webp","cache-control":"public, max-age=300","x-content-type-options":"nosniff"}});
 }
 if(!member)return reply({ok:false,error:"NAO_AUTORIZADO"},401);
 if(!env.MEDIA_BUCKET)return reply({ok:false,error:"ARMAZENAMENTO_INDISPONIVEL"},503);
 const find=async()=>{try{return await env.DB.prepare("SELECT photo_token FROM club_profile_photos WHERE member_id=?").bind(member.id).first()}catch(e){if(/no such table/i.test(String(e)))return null;throw e}};
 if(request.method==="GET"){
  const row=await find();return reply({ok:true,photoUrl:row?"/api/profile-photo/image/"+row.photo_token:null});
 }
 if(!["POST","DELETE"].includes(request.method))return reply({ok:false,error:"METODO_INVALIDO"},405);
 if(request.method==="DELETE"){
  const old=await find();if(old){await env.DB.prepare("DELETE FROM club_profile_photos WHERE member_id=?").bind(member.id).run();await env.MEDIA_BUCKET.delete("profile-photos/"+old.photo_token+".webp")}
  return reply({ok:true,photoUrl:null});
 }
 let body;try{body=await request.json()}catch{return reply({ok:false,error:"JSON_INVALIDO"},400)}
 const data=String(body?.image||"");
 if(!/^data:image\/(?:webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(data)||data.length>1400000)return reply({ok:false,error:"FOTO_INVALIDA_OU_MUITO_GRANDE"},400);
 let bytes;try{const raw=atob(data.split(",")[1]);bytes=Uint8Array.from(raw,c=>c.charCodeAt(0))}catch{return reply({ok:false,error:"FOTO_INVALIDA"},400)}
 const isWebp=bytes[0]===82&&bytes[1]===73&&bytes[2]===70&&bytes[3]===70&&String.fromCharCode(...bytes.slice(8,12))==="WEBP";
 const isJpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const mime=data.startsWith("data:image/jpeg;")?"image/jpeg":"image/webp";
 if(bytes.length>1048576||bytes.length<100||!(mime==="image/webp"?isWebp:isJpeg))return reply({ok:false,error:"FORMATO_INVALIDO"},400);
 const token=crypto.randomUUID(),key="profile-photos/"+token+".webp";
 await env.MEDIA_BUCKET.put(key,bytes,{httpMetadata:{contentType:mime}});
 try{
  await env.DB.prepare(schema).run();
  const old=await find();
  await env.DB.prepare("INSERT INTO club_profile_photos(member_id,photo_token,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(member_id) DO UPDATE SET photo_token=excluded.photo_token,updated_at=CURRENT_TIMESTAMP").bind(member.id,token).run();
  if(old?.photo_token)await env.MEDIA_BUCKET.delete("profile-photos/"+old.photo_token+".webp").catch(()=>{});
  return reply({ok:true,photoUrl:"/api/profile-photo/image/"+token});
 }catch(e){await env.MEDIA_BUCKET.delete(key).catch(()=>{});throw e}
}
