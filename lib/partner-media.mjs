const types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','video/webm':'webm'};
export const mediaLimit=type=>type.startsWith('video/')?2*1024*1024*1024:10*1024*1024;
const enc=new TextEncoder();
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
async function key(secret){return crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])}
export async function issueUpload(secret,type,size){
 if(!types[type]||!Number.isSafeInteger(size)||size<1||size>mediaLimit(type))throw Error('FORMATO_OU_TAMANHO_INVALIDO');
 const data={key:'partners/'+crypto.randomUUID()+'.'+types[type],type,size,expires:Date.now()+(size>50*1024*1024?3*60*60*1000:15*60*1000)};
 const payload=btoa(JSON.stringify(data));const signature=hex(await crypto.subtle.sign('HMAC',await key(secret),enc.encode(payload)));
 return {token:payload+'.'+signature,...data};
}
export async function verifyUpload(secret,token){try{const [payload,sig]=token.split('.');if(!/^[a-f0-9]{64}$/.test(sig))return null;const bytes=Uint8Array.from(sig.match(/../g),x=>parseInt(x,16));if(!await crypto.subtle.verify('HMAC',await key(secret),bytes,enc.encode(payload)))return null;const data=JSON.parse(atob(payload));return data.expires>Date.now()?data:null}catch{return null}}
export async function partnerMedia(request,env,json,cors){
 const url=new URL(request.url);
 if(url.pathname==='/admin/media-token'){
  if(request.method!=='POST')return json({error:'METODO_INVALIDO'},405);
  const cookie=request.headers.get('x-clubpop-admin-cookie');if(!cookie)return json({error:'NAO_AUTORIZADO'},401);
  const auth=await fetch('https://loja-pop-green.vercel.app/api/admin-auth?route=me',{headers:{Cookie:cookie},signal:AbortSignal.timeout(10000)});
  const user=await auth.json().catch(()=>({}));if(!auth.ok||user.role!=='admin')return json({error:'NAO_AUTORIZADO'},403);
  if(!env.MEDIA_BUCKET||!env.AUTO_SYNC_SECRET)return json({error:'ARMAZENAMENTO_INDISPONIVEL'},503);
  const b=await request.json().catch(()=>({}));try{return json({ok:true,...await issueUpload(env.AUTO_SYNC_SECRET,b.type,b.size),uploadUrl:url.origin+'/tv/upload'})}catch{return json({error:'Use JPG, PNG, WebP (até 10 MB), MP4 ou WebM (até 2 GB, com upload por partes).'},400)}
 }
 if(url.pathname.startsWith('/tv/multipart/')){
  if(!env.MEDIA_BUCKET||!env.AUTO_SYNC_SECRET)return json({error:'ARMAZENAMENTO_INDISPONIVEL'},503);
  const authHeader=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
  const data=await verifyUpload(env.AUTO_SYNC_SECRET,authHeader);
  if(!data||!data.key?.startsWith('partners/')||!['video/mp4','video/webm'].includes(data.type)||data.size<=50*1024*1024||data.size>2*1024*1024*1024)return json({error:'AUTORIZACAO_INVALIDA_OU_EXPIRADA'},401);
  const chunkSize=16*1024*1024;
  const totalParts=Math.ceil(data.size/chunkSize);
  const action=url.pathname.slice('/tv/multipart/'.length);
  if(action==='start'){
    if(request.method!=='POST')return json({error:'METODO_INVALIDO'},405);
    const upload=await env.MEDIA_BUCKET.createMultipartUpload(data.key,{httpMetadata:{contentType:data.type}});
    return json({ok:true,uploadId:upload.uploadId,chunkSize,totalParts});
  }
  const uploadId=url.searchParams.get('uploadId')||'';
  if(!uploadId||uploadId.length>300)return json({error:'UPLOAD_INVALIDO'},400);
  const upload=env.MEDIA_BUCKET.resumeMultipartUpload(data.key,uploadId);
  if(action==='part'){
    if(request.method!=='PUT')return json({error:'METODO_INVALIDO'},405);
    const partNumber=Number(url.searchParams.get('partNumber'));
    if(!Number.isInteger(partNumber)||partNumber<1||partNumber>totalParts)return json({error:'PARTE_INVALIDA'},400);
    const expected=partNumber===totalParts?data.size-chunkSize*(totalParts-1):chunkSize;
    const supplied=request.headers.get('content-length');
    if(supplied!==null&&Number(supplied)!==expected)return json({error:'TAMANHO_DE_PARTE_INVALIDO'},400);
    const bytes=await request.arrayBuffer();
    if(bytes.byteLength!==expected)return json({error:'TAMANHO_DE_PARTE_INVALIDO'},400);
    try{const part=await upload.uploadPart(partNumber,bytes);return json({ok:true,partNumber:part.partNumber,etag:part.etag})}catch{return json({error:'FALHA_AO_ENVIAR_PARTE'},502)}
  }
  if(action==='complete'){
    if(request.method!=='POST')return json({error:'METODO_INVALIDO'},405);
    const body=await request.json().catch(()=>({}));
    const parts=body.parts;
    if(!Array.isArray(parts)||parts.length!==totalParts||parts.some((p,i)=>p.partNumber!==i+1||!/^([a-f0-9]{32})$/i.test(p.etag||'')))return json({error:'PARTES_INVALIDAS'},400);
    try{const stored=await upload.complete(parts);if(stored.size!==data.size){await env.MEDIA_BUCKET.delete(data.key);return json({error:'TAMANHO_FINAL_INVALIDO'},400)}return json({ok:true,url:url.origin+'/tv/files/'+data.key,mediaType:'video'})}catch{return json({error:'FALHA_AO_FINALIZAR_UPLOAD'},502)}
  }
  if(action==='abort'){
    if(request.method!=='POST')return json({error:'METODO_INVALIDO'},405);
    try{await upload.abort();return json({ok:true})}catch{return json({error:'FALHA_AO_CANCELAR_UPLOAD'},502)}
  }
  return json({error:'ROTA_INVALIDA'},404);
 }
 if(url.pathname==='/admin/media-delete'){
  if(request.method!=='POST')return json({error:'METODO_INVALIDO'},405);
  const cookie=request.headers.get('x-clubpop-admin-cookie');
  if(!cookie)return json({error:'NAO_AUTORIZADO'},401);
  const actor=await fetch('https://loja-pop-green.vercel.app/api/admin-auth?route=me',{headers:{Cookie:cookie},signal:AbortSignal.timeout(10000)});
  const user=await actor.json().catch(()=>({}));
  if(!actor.ok||user.role!=='admin')return json({error:'NAO_AUTORIZADO'},403);
  if(!env.MEDIA_BUCKET||!env.DB)return json({error:'ARMAZENAMENTO_INDISPONIVEL'},503);
  const body=await request.json().catch(()=>({}));
  let media;
  try{media=new URL(String(body.url||''))}catch{return json({error:'URL_INVALIDA'},400)}
  if(media.origin!==url.origin||!/^\/tv\/files\/partners\/[a-f0-9-]{36}\.(jpg|png|webp|mp4|webm)$/.test(media.pathname)||media.search||media.hash)return json({error:'ARQUIVO_NAO_GERENCIADO'},400);
  const row=await env.DB.prepare("SELECT content_json FROM app_content WHERE content_key='club-pop' LIMIT 1").first();
  if(!row)return json({error:'CADASTRO_INDISPONIVEL'},503);
  const content=JSON.parse(row.content_json);
  if((content.partnerTvCampaigns||[]).some(c=>c.imageUrl===media.href))return json({error:'ARQUIVO_EM_USO'},409);
  const objectKey=media.pathname.slice('/tv/files/'.length);
  await env.MEDIA_BUCKET.delete(objectKey);
  return json({ok:true,deleted:true});
 }
 if(url.pathname==='/tv/upload'){
  if(request.method!=='PUT')return json({error:'METODO_INVALIDO'},405);
  if(!env.MEDIA_BUCKET||!env.AUTO_SYNC_SECRET)return json({error:'ARMAZENAMENTO_INDISPONIVEL'},503);
  const data=await verifyUpload(env.AUTO_SYNC_SECRET,(request.headers.get('authorization')||'').replace(/^Bearer /,''));
  if(!data)return json({error:'AUTORIZACAO_EXPIRADA'},401);
  if(request.headers.get('content-type')!==data.type)return json({error:'TIPO_DE_ARQUIVO_DIVERGENTE'},400);
  const length=request.headers.get('content-length');
  if(length!==null&&Number(length)!==data.size)return json({error:'TAMANHO_DE_ARQUIVO_DIVERGENTE'},400);
  // Browsers and proxies may omit Content-Length; R2 needs a known-length body.
  const bytes=await request.arrayBuffer();
  if(bytes.byteLength!==data.size)return json({error:'TAMANHO_DE_ARQUIVO_DIVERGENTE'},400);
  const stored=await env.MEDIA_BUCKET.put(data.key,bytes,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:data.type}});
  if(!stored)return json({error:'ENVIO_JA_REALIZADO'},409);
  return json({ok:true,url:url.origin+'/tv/files/'+data.key,mediaType:data.type.startsWith('video/')?'video':'image'});
 }
 if(url.pathname.startsWith('/tv/files/')){
  if(!['GET','HEAD'].includes(request.method))return json({error:'METODO_INVALIDO'},405);
  const objectKey=url.pathname.slice('/tv/files/'.length);if(!/^partners\/[a-f0-9-]{36}\.(jpg|png|webp|mp4|webm)$/.test(objectKey))return json({error:'ARQUIVO_INVALIDO'},404);
  if(!env.MEDIA_BUCKET)return json({error:'ARMAZENAMENTO_INDISPONIVEL'},503);
  const obj=await env.MEDIA_BUCKET.get(objectKey,{range:request.headers});if(!obj)return json({error:'ARQUIVO_NAO_ENCONTRADO'},404);
  const headers=new Headers(cors);obj.writeHttpMetadata(headers);headers.set('etag',obj.httpEtag);headers.set('accept-ranges','bytes');headers.set('cache-control','public,max-age=86400');headers.set('x-content-type-options','nosniff');
  let status=200;if(obj.range){status=206;headers.set('content-range',`bytes ${obj.range.offset}-${obj.range.offset+obj.range.length-1}/${obj.size}`);headers.set('content-length',String(obj.range.length))}else headers.set('content-length',String(obj.size));
  return new Response(request.method==='HEAD'?null:obj.body,{status,headers});
 }
 return null;
}
