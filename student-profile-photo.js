// Club Pop shared avatar: preserves original initials whenever no photo exists.
(function(){
 const api="/api/auth?route=profile-photo";
 let photo=null,loaded=false,busy=false;
 const targets=()=>[...document.querySelectorAll("#av,#avatar,.cp-student-avatar")];
 function paint(){
  for(const el of targets()){
   if(photo){el.style.backgroundImage='url("'+photo.replace(/"/g,"")+'")';el.style.backgroundPosition="center";el.style.backgroundSize="cover";el.style.color="transparent"}
   else{el.style.backgroundImage="";el.style.color=""}
  }
  const remove=document.getElementById("clubPhotoRemove");if(remove)remove.hidden=!photo;
 }
 function token(){return sessionStorage.getItem("clubpop_token")}
 async function call(method="GET",body){
  const r=await fetch(api,{method,headers:{"Authorization":"Bearer "+token(),"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{}),cache:"no-store"});
  const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw Error(d.error||"Não foi possível salvar a foto");return d;
 }
 async function refresh(){if(!token())return;try{const d=await call();photo=d.photoUrl||null;loaded=true;paint()}catch(e){console.warn("Club Pop foto:",e.message)}}
 async function previewCrop(file){
  if(!file.type.startsWith("image/")&&!/\.(heic|heif|jpg|jpeg|png|webp|gif|bmp|avif)$/i.test(file.name))throw Error("Selecione um arquivo de imagem válido.");
  // Decode locally and upload only the cropped 320px WebP, regardless of original file size.
  let bitmap;
  try{bitmap=await createImageBitmap(file,{imageOrientation:"from-image"});}catch(e){throw Error("Não foi possível abrir esta foto. Tente outra imagem da galeria.");}
  return new Promise(resolve=>{
   const overlay=document.createElement("div");
   overlay.style.cssText="position:fixed;inset:0;z-index:100000;background:#000b;display:flex;align-items:center;justify-content:center;padding:18px";
   overlay.innerHTML='<section role="dialog" aria-modal="true" aria-label="Enquadrar foto" style="background:white;border-radius:22px;padding:20px;width:min(100%,380px);color:#111;font-family:system-ui"><h2 style="font-size:19px;margin:0 0 6px">Enquadrar sua foto</h2><p style="font-size:12px;color:#666;margin:0 0 14px">Arraste para posicionar e use o controle para aproximar.</p><canvas width="320" height="320" style="width:100%;max-width:320px;aspect-ratio:1;touch-action:none;display:block;margin:auto;border-radius:27%;background:#111"></canvas><label style="display:block;font-size:12px;margin:17px 0 6px" for="clubPhotoZoom">Zoom</label><input id="clubPhotoZoom" aria-label="Zoom da foto" type="range" min="1" max="3" step=".01" value="1" style="width:100%;accent-color:#08a9e3"><div style="display:flex;gap:10px;margin-top:17px"><button type="button" data-action="cancel" style="flex:1;border:1px solid #ddd;background:white;border-radius:12px;padding:13px">Cancelar</button><button type="button" data-action="save" style="flex:1;border:0;background:#08a9e3;color:white;border-radius:12px;padding:13px;font-weight:800">Salvar foto</button></div></section>';
   document.body.appendChild(overlay);
   const canvas=overlay.querySelector("canvas"),ctx=canvas.getContext("2d"),zoom=overlay.querySelector("input"),save=overlay.querySelector('[data-action="save"]');
   const minScale=Math.max(320/bitmap.width,320/bitmap.height);
   let factor=1,dx=0,dy=0,drag=null,closed=false;
   function draw(){
    const scale=minScale*factor,w=bitmap.width*scale,h=bitmap.height*scale;
    dx=Math.max((320-w)/2,Math.min((w-320)/2,dx));dy=Math.max((320-h)/2,Math.min((h-320)/2,dy));
    ctx.clearRect(0,0,320,320);ctx.drawImage(bitmap,(320-w)/2+dx,(320-h)/2+dy,w,h);
   }
   function finish(value){if(closed)return;closed=true;bitmap.close?.();overlay.remove();resolve(value)}
   zoom.addEventListener("input",()=>{const old=factor;factor=Number(zoom.value);dx*=factor/old;dy*=factor/old;draw()});
   canvas.addEventListener("pointerdown",e=>{drag={x:e.clientX,y:e.clientY,dx,dy};canvas.setPointerCapture(e.pointerId)});
   canvas.addEventListener("pointermove",e=>{if(!drag)return;const rect=canvas.getBoundingClientRect();dx=drag.dx+(e.clientX-drag.x)*320/rect.width;dy=drag.dy+(e.clientY-drag.y)*320/rect.height;draw()});
   canvas.addEventListener("pointerup",()=>drag=null);canvas.addEventListener("pointercancel",()=>drag=null);
   overlay.querySelector('[data-action="cancel"]').onclick=()=>finish(null);
   save.onclick=()=>{
    draw();
    // The production Worker currently accepts at most 160 KB of WebP bytes.
    // Keep reducing quality and, if needed, dimensions before uploading.
    let encoded="",side=320;
    for(const dimension of [320,280,240,200,160]){
     const output=document.createElement("canvas");output.width=dimension;output.height=dimension;
     output.getContext("2d").drawImage(canvas,0,0,dimension,dimension);
     for(const quality of [.78,.65,.52,.4,.3]){
      const candidate=output.toDataURL("image/webp",quality);
      if(!candidate.startsWith("data:image/webp;base64,"))continue;
      encoded=candidate;side=dimension;
      if(candidate.length<=190000)break;
     }
     if(encoded&&encoded.length<=190000)break;
    }
    if(!encoded||encoded.length>190000){alert("Não foi possível otimizar esta foto. Tente outra imagem.");return;}
    finish(encoded);
   };
   draw();
  });
 }
 function setup(){
  const av=document.getElementById("av");if(!av||document.getElementById("clubPhotoInput"))return;
  av.style.cursor="pointer";av.setAttribute("role","button");av.setAttribute("tabindex","0");av.setAttribute("aria-label","Adicionar ou trocar foto de perfil");
  const input=document.createElement("input");input.id="clubPhotoInput";input.type="file";input.accept="image/*";input.hidden=true;document.body.appendChild(input);
  av.addEventListener("click",()=>input.click());av.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();input.click()}});
  const hint=document.createElement("div");hint.textContent="Toque na imagem para adicionar ou trocar sua foto";hint.style.cssText="font-size:11px;color:#697481;margin:8px auto 0";av.insertAdjacentElement("afterend",hint);
  const remove=document.createElement("button");remove.id="clubPhotoRemove";remove.type="button";remove.textContent="Remover foto";remove.hidden=true;remove.style.cssText="border:0;background:none;color:#b13b48;font-size:11px;margin-top:5px;cursor:pointer";hint.insertAdjacentElement("afterend",remove);
  input.addEventListener("change",async()=>{const file=input.files?.[0];if(!file||busy)return;busy=true;hint.textContent="Ajuste o enquadramento da foto";try{const image=await previewCrop(file);if(!image){hint.textContent="Toque na imagem para adicionar ou trocar sua foto";return}hint.textContent="Salvando foto...";const d=await call("POST",{image});photo=d.photoUrl;paint();hint.textContent="Foto atualizada com sucesso"}catch(e){hint.textContent=e.message;alert(e.message)}finally{busy=false;input.value=""}});
  remove.addEventListener("click",async()=>{if(busy||!confirm("Remover sua foto e voltar às iniciais?"))return;busy=true;try{await call("DELETE");photo=null;paint();hint.textContent="Foto removida. Suas iniciais continuam visíveis."}catch(e){alert(e.message)}finally{busy=false}});
 }
 function start(){setup();refresh();let n=0;const interval=setInterval(()=>{paint();if(++n>=15)clearInterval(interval)},800)}
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
 window.addEventListener("pageshow",()=>{if(loaded)paint()});
})();
