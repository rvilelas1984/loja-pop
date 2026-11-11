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
 async function compress(file){
  if(!file.type.startsWith("image/")||file.size>8*1024*1024)throw Error("Selecione uma imagem de até 8 MB.");
  const bitmap=await createImageBitmap(file),canvas=document.createElement("canvas");canvas.width=320;canvas.height=320;
  const ctx=canvas.getContext("2d"),side=Math.min(bitmap.width,bitmap.height),sx=(bitmap.width-side)/2,sy=(bitmap.height-side)/2;
  ctx.drawImage(bitmap,sx,sy,side,side,0,0,320,320);bitmap.close?.();
  return canvas.toDataURL("image/webp",0.78);
 }
 function setup(){
  const av=document.getElementById("av");if(!av||document.getElementById("clubPhotoInput"))return;
  av.style.cursor="pointer";av.setAttribute("role","button");av.setAttribute("tabindex","0");av.setAttribute("aria-label","Adicionar ou trocar foto de perfil");
  const input=document.createElement("input");input.id="clubPhotoInput";input.type="file";input.accept="image/*";input.hidden=true;document.body.appendChild(input);
  av.addEventListener("click",()=>input.click());av.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();input.click()}});
  const hint=document.createElement("div");hint.textContent="Toque na imagem para adicionar ou trocar sua foto";hint.style.cssText="font-size:11px;color:#697481;margin:8px auto 0";av.insertAdjacentElement("afterend",hint);
  const remove=document.createElement("button");remove.id="clubPhotoRemove";remove.type="button";remove.textContent="Remover foto";remove.hidden=true;remove.style.cssText="border:0;background:none;color:#b13b48;font-size:11px;margin-top:5px;cursor:pointer";hint.insertAdjacentElement("afterend",remove);
  input.addEventListener("change",async()=>{const file=input.files?.[0];if(!file||busy)return;busy=true;hint.textContent="Salvando foto...";try{const image=await compress(file),d=await call("POST",{image});photo=d.photoUrl;paint();hint.textContent="Foto atualizada com sucesso"}catch(e){hint.textContent=e.message;alert(e.message)}finally{busy=false;input.value=""}});
  remove.addEventListener("click",async()=>{if(busy||!confirm("Remover sua foto e voltar às iniciais?"))return;busy=true;try{await call("DELETE");photo=null;paint();hint.textContent="Foto removida. Suas iniciais continuam visíveis."}catch(e){alert(e.message)}finally{busy=false}});
 }
 function start(){setup();refresh();let n=0;const interval=setInterval(()=>{paint();if(++n>=15)clearInterval(interval)},800)}
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
 window.addEventListener("pageshow",()=>{if(loaded)paint()});
})();
